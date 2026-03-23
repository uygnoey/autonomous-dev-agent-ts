/**
 * DocumenterEventDispatcher 단위 테스트
 *
 * @description
 * KR: 5가지 이벤트 유형에 대한 프롬프트 생성, 디스패치, 에러 처리 테스트.
 *     80%+ 경계값/에지 케이스 비율.
 * EN: Tests for prompt generation, dispatch, error handling for 5 event types.
 *     80%+ edge/boundary case ratio.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import {
  buildDocumenterPrompt,
  DocumenterEventDispatcher,
} from 'layer2/documenter-event-dispatcher.js';
import type { DocumenterEvent, DocumenterEventType } from 'layer2/documenter-event-types.js';
import { DOCUMENTER_OUTPUT_MAP } from 'layer2/documenter-event-types.js';

const logger = new ConsoleLogger('error');

// ── 테스트용 이벤트 팩토리 / Test event factories ────────────────

function createFeatureCompleteEvent(overrides: Partial<DocumenterEvent & { type: 'feature_complete' }> = {}): DocumenterEvent {
  return {
    type: 'feature_complete',
    projectId: overrides.projectId ?? 'proj-test',
    context: {
      featureId: 'feat-1',
      featureName: 'Login Feature',
      changedFiles: ['src/auth/login.ts', 'tests/unit/auth/login.test.ts'],
      description: '사용자 로그인 기능',
    },
    timestamp: overrides.timestamp ?? new Date('2026-03-23T00:00:00Z'),
  };
}

function createTestExecutedEvent(overrides: Partial<{ passed: boolean; coverage: number }> = {}): DocumenterEvent {
  return {
    type: 'test_executed',
    projectId: 'proj-test',
    context: {
      featureId: 'feat-1',
      passed: overrides.passed ?? true,
      totalTests: 50,
      passedTests: overrides.passed !== false ? 50 : 45,
      failedTests: overrides.passed !== false ? 0 : 5,
      coverage: overrides.coverage ?? 0.85,
      failureMessages: overrides.passed !== false ? [] : ['assertion failed: expected true'],
    },
    timestamp: new Date('2026-03-23T00:00:00Z'),
  };
}

function createBugDetectedEvent(): DocumenterEvent {
  return {
    type: 'bug_detected',
    projectId: 'proj-test',
    context: {
      featureId: 'feat-1',
      phase: 'TEST',
      reproductionPath: 'login → invalid password → crash',
      rootCause: 'null reference on empty password',
      impactScope: '로그인 전체 기능',
    },
    timestamp: new Date('2026-03-23T00:00:00Z'),
  };
}

function createPhaseBoundaryEvent(): DocumenterEvent {
  return {
    type: 'phase_boundary',
    projectId: 'proj-test',
    context: {
      featureId: 'feat-1',
      fromPhase: 'CODE',
      toPhase: 'TEST',
      reason: 'CODE Phase 완료',
      decisionSummary: 'architect가 코드 품질 승인',
    },
    timestamp: new Date('2026-03-23T00:00:00Z'),
  };
}

function createTranslationEvent(): DocumenterEvent {
  return {
    type: 'translation',
    projectId: 'proj-test',
    context: {
      sourceDocPath: 'docs/api.md',
      targetLanguages: ['ja', 'es'],
      preserveTechnicalTerms: true,
    },
    timestamp: new Date('2026-03-23T00:00:00Z'),
  };
}

// ── DOCUMENTER_OUTPUT_MAP ──────────────────────────────────────

describe('DOCUMENTER_OUTPUT_MAP', () => {
  it('5가지 이벤트 유형이 모두 정의되어 있다', () => {
    const expectedTypes: DocumenterEventType[] = [
      'feature_complete', 'test_executed', 'bug_detected', 'phase_boundary', 'translation',
    ];
    for (const type of expectedTypes) {
      expect(DOCUMENTER_OUTPUT_MAP[type]).toBeDefined();
      expect(DOCUMENTER_OUTPUT_MAP[type].length).toBeGreaterThan(0);
    }
  });

  it('feature_complete에 기능 설명서, API 정의서, 아키텍처 변경 이력이 포함된다', () => {
    const outputs = DOCUMENTER_OUTPUT_MAP.feature_complete;
    expect(outputs.length).toBe(3);
    expect(outputs.some((o) => o.includes('기능 설명서'))).toBe(true);
    expect(outputs.some((o) => o.includes('API'))).toBe(true);
    expect(outputs.some((o) => o.includes('아키텍처'))).toBe(true);
  });

  it('test_executed에 테스트 결과서, 커버리지, 벤치마크가 포함된다', () => {
    const outputs = DOCUMENTER_OUTPUT_MAP.test_executed;
    expect(outputs.length).toBe(3);
    expect(outputs.some((o) => o.includes('테스트 결과서'))).toBe(true);
    expect(outputs.some((o) => o.includes('커버리지'))).toBe(true);
    expect(outputs.some((o) => o.includes('벤치마크'))).toBe(true);
  });

  it('bug_detected에 버그 리포트, 수정 내역서, 회귀 테스트가 포함된다', () => {
    const outputs = DOCUMENTER_OUTPUT_MAP.bug_detected;
    expect(outputs.length).toBe(3);
    expect(outputs.some((o) => o.includes('버그 리포트'))).toBe(true);
    expect(outputs.some((o) => o.includes('수정 내역서'))).toBe(true);
    expect(outputs.some((o) => o.includes('회귀 테스트'))).toBe(true);
  });

  it('phase_boundary에 CHANGELOG, 의사결정, 코드 리뷰 요약이 포함된다', () => {
    const outputs = DOCUMENTER_OUTPUT_MAP.phase_boundary;
    expect(outputs.length).toBe(4);
    expect(outputs.some((o) => o.includes('CHANGELOG'))).toBe(true);
    expect(outputs.some((o) => o.includes('의사결정'))).toBe(true);
    expect(outputs.some((o) => o.includes('코드 리뷰'))).toBe(true);
  });

  it('translation에 번역 문서가 포함된다', () => {
    const outputs = DOCUMENTER_OUTPUT_MAP.translation;
    expect(outputs.length).toBe(1);
    expect(outputs[0]).toContain('번역');
  });
});

// ── buildDocumenterPrompt ──────────────────────────────────────

describe('buildDocumenterPrompt', () => {
  it('feature_complete 프롬프트에 기능 정보가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createFeatureCompleteEvent());
    expect(prompt).toContain('feature_complete');
    expect(prompt).toContain('feat-1');
    expect(prompt).toContain('Login Feature');
    expect(prompt).toContain('src/auth/login.ts');
    expect(prompt).toContain('초등학생');
  });

  it('test_executed 통과 프롬프트에 결과 정보가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createTestExecutedEvent({ passed: true }));
    expect(prompt).toContain('test_executed');
    expect(prompt).toContain('통과');
    expect(prompt).toContain('85.0%');
  });

  it('test_executed 실패 프롬프트에 실패 메시지가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createTestExecutedEvent({ passed: false }));
    expect(prompt).toContain('실패');
    expect(prompt).toContain('assertion failed');
  });

  it('bug_detected 프롬프트에 버그 정보가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createBugDetectedEvent());
    expect(prompt).toContain('bug_detected');
    expect(prompt).toContain('null reference');
    expect(prompt).toContain('TEST');
    expect(prompt).toContain('로그인 전체 기능');
  });

  it('phase_boundary 프롬프트에 전환 정보가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createPhaseBoundaryEvent());
    expect(prompt).toContain('phase_boundary');
    expect(prompt).toContain('CODE');
    expect(prompt).toContain('TEST');
    expect(prompt).toContain('architect');
  });

  it('translation 프롬프트에 번역 정보가 포함된다', () => {
    const prompt = buildDocumenterPrompt(createTranslationEvent());
    expect(prompt).toContain('translation');
    expect(prompt).toContain('docs/api.md');
    expect(prompt).toContain('ja');
    expect(prompt).toContain('es');
    expect(prompt).toContain('예');
  });

  it('모든 프롬프트에 프로젝트 ID가 포함된다', () => {
    const events: DocumenterEvent[] = [
      createFeatureCompleteEvent(),
      createTestExecutedEvent(),
      createBugDetectedEvent(),
      createPhaseBoundaryEvent(),
      createTranslationEvent(),
    ];
    for (const event of events) {
      const prompt = buildDocumenterPrompt(event);
      expect(prompt).toContain('proj-test');
    }
  });

  it('모든 프롬프트에 생성할 문서 목록이 포함된다', () => {
    const events: DocumenterEvent[] = [
      createFeatureCompleteEvent(),
      createTestExecutedEvent(),
      createBugDetectedEvent(),
      createPhaseBoundaryEvent(),
      createTranslationEvent(),
    ];
    for (const event of events) {
      const prompt = buildDocumenterPrompt(event);
      expect(prompt).toContain('생성할 문서');
    }
  });

  it('feature_complete에서 빈 파일 목록도 처리한다', () => {
    const event: DocumenterEvent = {
      type: 'feature_complete',
      projectId: 'proj-test',
      context: {
        featureId: 'feat-empty',
        featureName: 'Empty Feature',
        changedFiles: [],
        description: 'No files changed',
      },
      timestamp: new Date('2026-03-23T00:00:00Z'),
    };
    const prompt = buildDocumenterPrompt(event);
    expect(prompt).toContain('0개');
  });

  it('test_executed에서 커버리지 0%도 처리한다', () => {
    const prompt = buildDocumenterPrompt(createTestExecutedEvent({ coverage: 0 }));
    expect(prompt).toContain('0.0%');
  });

  it('translation에서 기술 용어 비보존도 처리한다', () => {
    const event: DocumenterEvent = {
      type: 'translation',
      projectId: 'proj-test',
      context: {
        sourceDocPath: 'docs/readme.md',
        targetLanguages: ['ko'],
        preserveTechnicalTerms: false,
      },
      timestamp: new Date('2026-03-23T00:00:00Z'),
    };
    const prompt = buildDocumenterPrompt(event);
    expect(prompt).toContain('아니오');
  });
});

// ── DocumenterEventDispatcher ──────────────────────────────────

describe('DocumenterEventDispatcher', () => {
  it('인스턴스가 생성된다', () => {
    const mockGenerator = { generateAgentConfig: () => ({ ok: false, error: { message: 'mock' } }) } as never;
    const mockSpawner = { spawn: async function* () { /* empty */ } } as never;
    expect(() => new DocumenterEventDispatcher(mockGenerator, mockSpawner, logger)).not.toThrow();
  });

  it('getSupportedEventTypes가 5가지 이벤트를 반환한다', () => {
    const mockGenerator = { generateAgentConfig: () => ({ ok: false, error: { message: 'mock' } }) } as never;
    const mockSpawner = { spawn: async function* () { /* empty */ } } as never;
    const dispatcher = new DocumenterEventDispatcher(mockGenerator, mockSpawner, logger);
    const types = dispatcher.getSupportedEventTypes();
    expect(types.length).toBe(5);
    expect(types).toContain('feature_complete');
    expect(types).toContain('test_executed');
    expect(types).toContain('bug_detected');
    expect(types).toContain('phase_boundary');
    expect(types).toContain('translation');
  });

  it('설정 생성 실패 시 이벤트를 생성하지 않는다', async () => {
    const mockGenerator = {
      generateAgentConfig: () => ({ ok: false, error: { message: 'config generation failed' } }),
    } as never;
    const mockSpawner = { spawn: async function* () { yield { type: 'message', content: 'should not appear' }; } } as never;
    const dispatcher = new DocumenterEventDispatcher(mockGenerator, mockSpawner, logger);

    const events: unknown[] = [];
    for await (const event of dispatcher.dispatch(createFeatureCompleteEvent())) {
      events.push(event);
    }
    expect(events.length).toBe(0);
  });

  it('설정 생성 성공 시 에이전트 이벤트를 전달한다', async () => {
    const mockConfig = { agentName: 'documenter', prompt: 'test' };
    const mockGenerator = {
      generateAgentConfig: () => ({ ok: true, value: mockConfig }),
    } as never;
    const mockSpawner = {
      spawn: async function* () {
        yield { type: 'message', agentName: 'documenter', content: 'doc generated', timestamp: new Date() };
      },
    } as never;
    const dispatcher = new DocumenterEventDispatcher(mockGenerator, mockSpawner, logger);

    const events: unknown[] = [];
    for await (const event of dispatcher.dispatch(createFeatureCompleteEvent())) {
      events.push(event);
    }
    expect(events.length).toBe(1);
  });

  it('5가지 이벤트 모두 디스패치할 수 있다', async () => {
    const mockConfig = { agentName: 'documenter', prompt: 'test' };
    const mockGenerator = {
      generateAgentConfig: () => ({ ok: true, value: mockConfig }),
    } as never;
    const mockSpawner = {
      spawn: async function* () {
        yield { type: 'message', agentName: 'documenter', content: 'done', timestamp: new Date() };
      },
    } as never;
    const dispatcher = new DocumenterEventDispatcher(mockGenerator, mockSpawner, logger);

    const allEvents: DocumenterEvent[] = [
      createFeatureCompleteEvent(),
      createTestExecutedEvent(),
      createBugDetectedEvent(),
      createPhaseBoundaryEvent(),
      createTranslationEvent(),
    ];

    for (const event of allEvents) {
      const results: unknown[] = [];
      for await (const result of dispatcher.dispatch(event)) {
        results.push(result);
      }
      expect(results.length).toBe(1);
    }
  });
});
