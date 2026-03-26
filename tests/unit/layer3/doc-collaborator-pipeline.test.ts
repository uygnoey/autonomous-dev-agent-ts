/**
 * DocCollaborator 파이프라인 테스트 / DocCollaborator pipeline tests
 *
 * @description
 * KR: NI-005 — 1계층+2계층 3단계 협업 문서 생성 파이프라인 검증.
 *     §9.2: "1계층 뼈대 → 2계층 상세 → 1계층 최종 검토 + 다듬기"
 * EN: NI-005 — Verify 3-step collaboration document generation pipeline between Layer 1 and Layer 2.
 *     §9.2: "L1 structure → L2 details → L1 review and refine"
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { AgentConfig } from 'layer2/types.js';
import { runCollaborationPipeline } from 'layer3/doc-collaborator-bridge.js';
import type { CollabDocState } from 'layer3/doc-collaborator-types.js';
import { DocCollaborator } from 'layer3/doc-collaborator.js';
import type { CollaborativeDocOptions, DocumentFragment } from 'layer3/doc-types.js';

// ── Mock ClaudeApi ──────────────────────────────────────────────

function makeMockClaudeApi(responses: { structure: string; refined: string }) {
  return {
    createMessage: async (messages: unknown[], _options: unknown) => {
      const msg = JSON.stringify(messages);
      if (msg.includes('뼈대를 작성')) {
        return ok({ content: responses.structure });
      }
      if (msg.includes('최종 검토')) {
        return ok({ content: responses.refined });
      }
      return ok({ content: '기본 응답' });
    },
  } as unknown as ClaudeApi;
}

function makeMockClaudeApiThatFails() {
  return {
    createMessage: async () => ({
      ok: false,
      error: { code: 'api_error', message: 'Claude API 실패' },
    }),
  } as unknown as ClaudeApi;
}

// ── Mock AgentSpawner ───────────────────────────────────────────

function makeMockSpawner(detailedContent: string) {
  return {
    spawn: async function* (_config: AgentConfig) {
      yield { type: 'message', content: detailedContent };
    },
  } as unknown as import('layer2/agent-spawner.js').AgentSpawner;
}

function makeMockSpawnerEmpty() {
  return {
    spawn: async function* (_config: AgentConfig) {
      // WHY: 빈 내용 반환
    },
  } as unknown as import('layer2/agent-spawner.js').AgentSpawner;
}

// ── 테스트 헬퍼 ────────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeOptions(overrides?: Partial<CollaborativeDocOptions>): CollaborativeDocOptions {
  return {
    projectId: 'proj-1',
    type: 'readme',
    layer1Structure: '# 프로젝트 뼈대\n\n## 소개\n\n## 기능',
    layer2Fragments: [
      {
        id: 'frag-1',
        featureId: 'feat-1',
        type: 'feature-doc',
        content: '## 로그인 기능\n\n사용자 인증을 처리합니다.',
        createdAt: new Date(),
        metadata: {},
      },
    ] as readonly DocumentFragment[],
    outputPath: '/output/readme.md',
    ...overrides,
  };
}

// ── runCollaborationPipeline 단위 테스트 ────────────────────────

describe('runCollaborationPipeline', () => {
  let stateStore: Map<string, CollabDocState>;

  beforeEach(() => {
    stateStore = new Map();
    stateStore.set('doc-1', {
      id: 'doc-1',
      projectId: 'proj-1',
      type: 'readme',
      phase: 'structure',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('전체 파이프라인 (L1→L2→L1 review) 성공', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# L1 생성 뼈대\n\n## 소개\n\n## 기능',
      refined: '# 최종 다듬기 완료 문서\n\n## 소개\n\n상세 내용 포함',
    });
    const spawner = makeMockSpawner('## 소개\n\n구현 상세 내용\n\n## 기능\n\n기능 상세');

    const result = await runCollaborationPipeline(
      makeOptions(),
      claudeApi,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('최종 다듬기 완료');
      expect(result.value.outputPath).toBe('/output/readme.md');
      expect(result.value.id).toBe('doc-1');
    }

    // WHY: 상태가 review로 전환되었는지 확인
    const state = stateStore.get('doc-1');
    expect(state?.phase).toBe('review');
    expect(state?.finalContent).toContain('최종 다듬기 완료');
  });

  it('상태에 details 필드가 올바르게 설정된다', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# 뼈대',
      refined: '# 최종',
    });
    const detailContent = '## 구현 상세\n\n상세 내용 from L2';
    const spawner = makeMockSpawner(detailContent);

    await runCollaborationPipeline(
      makeOptions(),
      claudeApi,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    const state = stateStore.get('doc-1');
    expect(state?.details).toBe(detailContent);
  });

  it('claudeApi 없이 fallback으로 동작한다', async () => {
    const spawner = makeMockSpawner('## 상세 내용');

    const result = await runCollaborationPipeline(
      makeOptions(),
      null,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: claudeApi 없으므로 L2 결과가 최종 내용
      expect(result.value.content).toBe('## 상세 내용');
    }
  });

  it('spawner 없이 fallback으로 동작한다 (조각 직접 병합)', async () => {
    const result = await runCollaborationPipeline(
      makeOptions(),
      null,
      null,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: spawner 없으므로 구조 + 조각 직접 병합
      expect(result.value.content).toContain('# 프로젝트 뼈대');
      expect(result.value.content).toContain('로그인 기능');
      expect(result.value.content).toContain('---');
    }

    const state = stateStore.get('doc-1');
    expect(state?.phase).toBe('review');
  });

  it('spawner 없고 조각도 없으면 뼈대만 반환한다', async () => {
    const options = makeOptions({ layer2Fragments: [] });

    const result = await runCollaborationPipeline(
      options,
      null,
      null,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('# 프로젝트 뼈대\n\n## 소개\n\n## 기능');
    }
  });

  it('spawner가 빈 내용 반환 시 구조로 fallback한다', async () => {
    const spawner = makeMockSpawnerEmpty();

    const result = await runCollaborationPipeline(
      makeOptions(),
      null,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: L2가 빈 내용 → fallback으로 구조만 반환
      expect(result.value.content).toBe('# 프로젝트 뼈대\n\n## 소개\n\n## 기능');
    }
  });

  it('claudeApi L1 구조 생성 실패 시 options.layer1Structure로 fallback', async () => {
    const claudeApi = makeMockClaudeApiThatFails();
    const spawner = makeMockSpawner('## 상세');

    const result = await runCollaborationPipeline(
      makeOptions(),
      claudeApi,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    // WHY: L1 실패 → options.layer1Structure fallback, L2는 정상
    const state = stateStore.get('doc-1');
    expect(state?.structure).toBe('# 프로젝트 뼈대\n\n## 소개\n\n## 기능');
  });

  it('claudeApi L1 review 실패 시 L2 내용으로 fallback', async () => {
    let callCount = 0;
    const claudeApi = {
      createMessage: async () => {
        callCount += 1;
        if (callCount === 1) {
          // WHY: 첫 호출(구조)은 성공
          return ok({ content: '# L1 뼈대' });
        }
        // WHY: 두 번째 호출(review)은 실패
        return { ok: false, error: { code: 'api_error', message: 'review 실패' } };
      },
    } as unknown as ClaudeApi;

    const spawner = makeMockSpawner('## L2 상세 내용');

    const result = await runCollaborationPipeline(
      makeOptions(),
      claudeApi,
      spawner,
      stateStore,
      'doc-1',
      logger,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: L1 review 실패 → L2 내용으로 fallback
      expect(result.value.content).toBe('## L2 상세 내용');
    }
  });

  it('상태 전환 순서: structure → detail → review', async () => {
    const phases: string[] = [];

    // WHY: 상태 변경을 추적하기 위한 Proxy 사용
    const trackingStore = new Map<string, CollabDocState>();
    const originalSet = trackingStore.set.bind(trackingStore);
    trackingStore.set = function (key: string, value: CollabDocState) {
      phases.push(value.phase);
      return originalSet(key, value);
    };

    trackingStore.set('doc-track', {
      id: 'doc-track',
      projectId: 'proj-1',
      type: 'readme',
      phase: 'structure',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    phases.length = 0; // WHY: 초기 설정 추적 제외

    const claudeApi = makeMockClaudeApi({ structure: '# 뼈대', refined: '# 최종' });
    const spawner = makeMockSpawner('## 상세');

    await runCollaborationPipeline(
      makeOptions(),
      claudeApi,
      spawner,
      trackingStore,
      'doc-track',
      logger,
    );

    // WHY: detail → review 순서로 전환 (structure는 이미 초기 상태)
    expect(phases).toEqual(['detail', 'review']);
  });
});

// ── DocCollaborator.runCollaboration 통합 테스트 ─────────────────

describe('DocCollaborator.runCollaboration', () => {
  it('전체 API로 runCollaboration 성공', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# 뼈대 from L1',
      refined: '# 최종 from L1 review',
    });
    const spawner = makeMockSpawner('## 상세 from L2\n\n구현 내용');
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.runCollaboration(makeOptions());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('최종 from L1 review');
      expect(result.value.outputPath).toBe('/output/readme.md');
    }
  });

  it('간단 API로 runCollaboration (조각 직접 병합)', async () => {
    const collaborator = new DocCollaborator(logger);

    const result = await collaborator.runCollaboration(makeOptions());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('# 프로젝트 뼈대');
      expect(result.value.content).toContain('로그인 기능');
    }
  });

  it('claudeApi만 있고 spawner 없을 때 동작', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# L1 뼈대',
      refined: '# L1 최종',
    });
    // WHY: spawner를 undefined로 전달하면 내부에서 null 처리
    const collaborator = new DocCollaborator(claudeApi, undefined, logger);

    const result = await collaborator.runCollaboration(makeOptions());

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: spawner 없으므로 조각 직접 병합
      expect(result.value.content).toContain('L1 뼈대');
      expect(result.value.content).toContain('로그인 기능');
    }
  });

  it('여러 조각이 올바르게 병합된다', async () => {
    const collaborator = new DocCollaborator(logger);
    const options = makeOptions({
      layer2Fragments: [
        {
          id: 'frag-1',
          featureId: 'feat-1',
          type: 'feature-doc',
          content: '## 기능 A',
          createdAt: new Date(),
          metadata: {},
        },
        {
          id: 'frag-2',
          featureId: 'feat-2',
          type: 'test-result',
          content: '## 테스트 결과 B',
          createdAt: new Date(),
          metadata: {},
        },
        {
          id: 'frag-3',
          featureId: 'feat-3',
          type: 'api-spec',
          content: '## API 스펙 C',
          createdAt: new Date(),
          metadata: {},
        },
      ] as readonly DocumentFragment[],
    });

    const result = await collaborator.runCollaboration(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('기능 A');
      expect(result.value.content).toContain('테스트 결과 B');
      expect(result.value.content).toContain('API 스펙 C');
    }
  });
});

// ── DocCollaborator.generateCollaborativeDoc 테스트 ──────────────

describe('DocCollaborator.generateCollaborativeDoc', () => {
  it('claudeApi 없으면 에러 반환', async () => {
    const collaborator = new DocCollaborator(logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '프로젝트 컨텍스트',
      [],
      '/output/readme.md',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_not_configured');
    }
  });

  it('전체 3단계 (L1→L2→L1) 성공', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# L1 뼈대\n\n## 소개\n\n## 기능',
      refined: '# 최종 검토 완료\n\n## 소개\n\n상세 포함\n\n## 기능\n\n기능 상세',
    });
    const spawner = makeMockSpawner('## 소개\n\n기술 상세\n\n## 기능\n\n구현 상세');
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '프로젝트 컨텍스트',
      [
        {
          id: 'frag-1',
          featureId: 'feat-1',
          type: 'feature-doc' as const,
          content: '로그인 기능',
          createdAt: new Date(),
          metadata: {},
        },
      ],
      '/output/readme.md',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('최종 검토 완료');
      expect(result.value.outputPath).toBe('/output/readme.md');
      expect(result.value.id).toBeTruthy();
      expect(result.value.generatedAt).toBeInstanceOf(Date);
    }
  });

  it('L1 구조 생성 실패 시 에러 반환', async () => {
    const claudeApi = makeMockClaudeApiThatFails();
    const spawner = makeMockSpawner('## 상세');
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '컨텍스트',
      [],
      '/output/readme.md',
    );

    expect(result.ok).toBe(false);
  });

  it('L2 실패 시 L1 뼈대만으로 진행', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# L1 뼈대',
      refined: '# 최종 (뼈대만 기반)',
    });
    const spawner = makeMockSpawnerEmpty();
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '컨텍스트',
      [],
      '/output/readme.md',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: L2가 빈 내용 반환 → L1 뼈대로 review
      expect(result.value.content).toContain('최종');
    }
  });

  it('spawner 없으면 조각 직접 병합 후 L1 review', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# L1 뼈대',
      refined: '# 최종 검토 (조각 병합 기반)',
    });
    const collaborator = new DocCollaborator(claudeApi, undefined, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '컨텍스트',
      [
        {
          id: 'frag-1',
          featureId: 'feat-1',
          type: 'feature-doc' as const,
          content: '기능 A 상세',
          createdAt: new Date(),
          metadata: {},
        },
      ],
      '/output/readme.md',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('최종 검토');
    }
  });

  it('L1 review 실패 시 L2 내용으로 fallback', async () => {
    let callCount = 0;
    const claudeApi = {
      createMessage: async () => {
        callCount += 1;
        if (callCount === 1) return ok({ content: '# L1 뼈대' });
        return { ok: false, error: { code: 'err', message: 'review 실패' } };
      },
    } as unknown as ClaudeApi;
    const spawner = makeMockSpawner('## L2 기술 상세 내용');
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'readme',
      '컨텍스트',
      [],
      '/output/readme.md',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('## L2 기술 상세 내용');
    }
  });

  it('비즈니스 문서 타입으로도 동작한다', async () => {
    const claudeApi = makeMockClaudeApi({
      structure: '# 투자제안서 뼈대',
      refined: '# 투자제안서 최종',
    });
    const spawner = makeMockSpawner('## 시장 분석\n\n상세 내용');
    const collaborator = new DocCollaborator(claudeApi, spawner, logger);

    const result = await collaborator.generateCollaborativeDoc(
      'proj-1',
      'investment-proposal',
      '스타트업 컨텍스트',
      [],
      '/output/proposal.pdf',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain('투자제안서 최종');
      expect(result.value.outputPath).toBe('/output/proposal.pdf');
    }
  });
});
