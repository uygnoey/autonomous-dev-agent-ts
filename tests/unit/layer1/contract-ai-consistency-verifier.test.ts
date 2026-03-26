/**
 * NI-004: Contract AI 정합성 검증기 테스트
 *
 * @description
 * KR: architect + qa AI 검증의 정상/에러/파싱 케이스를 검증한다.
 * EN: Validates architect + qa AI verification normal/error/parse cases.
 */

import { describe, expect, it, mock } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ok, err } from 'core/types.js';
import { AgentError } from 'core/errors.js';
import { ContractAiConsistencyVerifier } from 'layer1/contract-ai-consistency-verifier.js';
import type { HandoffPackage } from 'layer1/types.js';

// ── Mock ────────────────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeHandoff(): HandoffPackage {
  return {
    id: 'hp-test-1',
    projectId: 'proj-1',
    contract: {
      version: 1,
      projectType: 'test',
      features: [
        {
          id: 'feat-1',
          name: 'Auth',
          description: 'Authentication',
          dependencies: [],
          inputs: [{ name: 'email', type: 'string', description: 'email' }],
          outputs: [{ name: 'token', type: 'string', description: 'JWT token' }],
          acceptanceCriteria: [
            { id: 'ac-1', description: '로그인 성공', testable: true },
          ],
          priority: 'high',
          estimatedComplexity: 'medium',
        },
      ],
      testDefinitions: [
        {
          featureId: 'feat-1',
          categories: [{ name: 'unit', description: 'unit tests', targetCount: 5 }],
          rules: ['Arrange-Act-Assert'],
          sampleTests: [],
          ratios: { normal: 0.2, edge: 0.4, error: 0.4 },
        },
      ],
      implementationOrder: ['feat-1'],
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      },
    },
    planDocument: 'plan',
    designDocument: 'design',
    specDocument: 'spec',
    createdAt: new Date(),
    confirmedByUser: true,
  } as HandoffPackage;
}

function makeMockClaudeApi(responses: { content: string; model?: string }[]) {
  let callIdx = 0;
  return {
    createMessage: mock(async () => {
      const resp = responses[callIdx] ?? responses[0];
      callIdx++;
      return ok({
        content: resp?.content ?? '[]',
        metadata: { model: resp?.model ?? 'test-model', inputTokens: 10, outputTokens: 10 },
      });
    }),
    createMessageStream: mock(async function* () {}),
  };
}

function makeErrorClaudeApi() {
  return {
    createMessage: mock(async () => {
      return err(new AgentError('api_error', 'API call failed'));
    }),
    createMessageStream: mock(async function* () {}),
  };
}

// ── 정상 케이스 ────────────────────────────────────────────────

describe('ContractAiConsistencyVerifier — 정상', () => {
  it('이슈 없음 → passed: true', async () => {
    const api = makeMockClaudeApi([{ content: '[]' }, { content: '[]' }]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.issues.length).toBe(0);
      expect(result.value.feedback).toContain('정합성 검증 통과');
    }
  });

  it('architect에서 warning 발견 → passed: true (error 아님)', async () => {
    const api = makeMockClaudeApi([
      { content: '[{"severity":"warning","field":"deps","message":"loose coupling"}]' },
      { content: '[]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.issues.length).toBe(1);
      expect(result.value.issues[0]?.field).toContain('architect:');
    }
  });

  it('qa에서 error 발견 → passed: false', async () => {
    const api = makeMockClaudeApi([
      { content: '[]' },
      { content: '[{"severity":"error","field":"test_coverage","message":"missing test"}]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues.length).toBe(1);
      expect(result.value.issues[0]?.field).toContain('qa:');
    }
  });

  it('양쪽 모두 이슈 발견 → issues 합산', async () => {
    const api = makeMockClaudeApi([
      { content: '[{"severity":"error","field":"io","message":"type mismatch"}]' },
      { content: '[{"severity":"warning","field":"coverage","message":"gap"}]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues.length).toBe(2);
    }
  });

  it('createMessage가 2번 호출됨 (architect + qa 병렬)', async () => {
    const api = makeMockClaudeApi([{ content: '[]' }]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    await verifier.verify(makeHandoff());

    expect(api.createMessage).toHaveBeenCalledTimes(2);
  });
});

// ── 에러 케이스 ────────────────────────────────────────────────

describe('ContractAiConsistencyVerifier — 에러', () => {
  it('API 에러 → Result err 반환', async () => {
    const api = makeErrorClaudeApi();
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('API call failed');
    }
  });

  it('createMessage 예외 → Result err 반환', async () => {
    const api = {
      createMessage: mock(async () => {
        throw new Error('Network error');
      }),
      createMessageStream: mock(async function* () {}),
    };
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Network error');
    }
  });
});

// ── 파싱 edge case ──────────────────────────────────────────────

describe('ContractAiConsistencyVerifier — 파싱', () => {
  it('JSON 배열이 텍스트에 묻혀있어도 추출', async () => {
    const api = makeMockClaudeApi([
      {
        content:
          'Here are the issues:\n[{"severity":"error","field":"io","message":"mismatch"}]\nDone.',
      },
      { content: '[]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.issues.length).toBe(1);
      expect(result.value.issues[0]?.field).toContain('architect:io');
    }
  });

  it('JSON 파싱 실패 + FAIL 키워드 → warning 이슈', async () => {
    const api = makeMockClaudeApi([
      { content: 'FAIL: something is wrong, cannot parse' },
      { content: '[]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.issues.length).toBe(1);
      expect(result.value.issues[0]?.field).toContain('parse_fallback');
    }
  });

  it('JSON 파싱 실패 + 문제 키워드 없음 → 이슈 없음', async () => {
    const api = makeMockClaudeApi([
      { content: 'Everything looks good, no problems found.' },
      { content: 'All clear.' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.issues.length).toBe(0);
    }
  });

  it('빈 응답 → 이슈 없음', async () => {
    const api = makeMockClaudeApi([{ content: '' }, { content: '' }]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.issues.length).toBe(0);
    }
  });

  it('잘못된 JSON 배열 항목은 필터링', async () => {
    const api = makeMockClaudeApi([
      { content: '[{"severity":"error","field":"io","message":"ok"}, {"bad": true}]' },
      { content: '[]' },
    ]);
    const verifier = new ContractAiConsistencyVerifier({
      claudeApi: api as never,
      logger,
    });

    const result = await verifier.verify(makeHandoff());

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: 유효한 항목 1개만 통과, bad 항목은 필터링됨
      expect(result.value.issues.length).toBe(1);
    }
  });
});
