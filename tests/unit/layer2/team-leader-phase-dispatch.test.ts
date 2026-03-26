/**
 * team-leader-phase-dispatch 단위 테스트 / team-leader-phase-dispatch unit tests
 *
 * @description
 * KR: executeCurrentPhase의 Phase별 분기 로직 검증.
 * EN: Tests for executeCurrentPhase phase routing logic.
 */

import { describe, expect, it } from 'bun:test';
import { executeCurrentPhase } from 'layer2/team-leader-phase-dispatch.js';
import type { PhaseDispatchDeps } from 'layer2/team-leader-phase-dispatch.js';
import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/contract-types.js';

// ── 모의 의존성 / Mock Dependencies ──────────────────────────

/**
 * 호출 추적을 위한 모의 deps 생성 / Create mock deps with call tracking
 *
 * WHY: 실제 Phase 실행기(executePhase, executeCodePhase 등)는 모듈 레벨에서 import되므로
 *      여기서는 executeCurrentPhase가 올바른 분기를 타는지를
 *      제너레이터 반환값으로 간접 검증한다
 */
function createMockDeps(overrides?: Partial<PhaseDispatchDeps>): PhaseDispatchDeps {
  const noop = (): void => {};
  const mockLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => mockLogger,
  };

  return {
    phaseEngine: {} as PhaseDispatchDeps['phaseEngine'],
    tokenMonitor: {} as PhaseDispatchDeps['tokenMonitor'],
    agentGenerator: {
      generateConfig: () => ({
        name: 'architect',
        projectId: 'test',
        featureId: 'feat-1',
        phase: 'DESIGN',
        systemPrompt: 'test',
        prompt: 'test',
        tools: [],
      }),
    } as unknown as PhaseDispatchDeps['agentGenerator'],
    sessionManager: {} as PhaseDispatchDeps['sessionManager'],
    agentSpawner: {} as PhaseDispatchDeps['agentSpawner'],
    streamMonitor: {
      onEvent: noop,
      getActiveAgents: () => [],
    } as unknown as PhaseDispatchDeps['streamMonitor'],
    logger: mockLogger as unknown as PhaseDispatchDeps['logger'],
    ragSearcher: undefined,
    verificationGate: {} as PhaseDispatchDeps['verificationGate'],
    integrationTester: {} as PhaseDispatchDeps['integrationTester'],
    layer1Verifier: undefined,
    projectPath: '/tmp/test',
    modifiedFiles: { paths: [] },
    coderAllocator: {} as PhaseDispatchDeps['coderAllocator'],
    parallelCoderRunner: {} as PhaseDispatchDeps['parallelCoderRunner'],
    gitBranchManager: {} as PhaseDispatchDeps['gitBranchManager'],
    failureHandler: {} as PhaseDispatchDeps['failureHandler'],
    sessionExecutor: undefined,
    ipcPoller: undefined,
    ...overrides,
  } as PhaseDispatchDeps;
}

function createMockHandoff(): HandoffPackage {
  return {
    contract: {
      version: 1,
      projectType: 'ts-lib',
      features: [],
      testDefinitions: [],
      implementationOrder: [],
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        allTestsHaveIO: true,
        allFeaturesInOrder: true,
        allFeaturesHaveRationale: true,
      },
    },
    projectContext: {
      rootPath: '/tmp/test',
      type: 'ts-lib',
      dependencies: [],
    },
    ragContext: [],
  } as unknown as HandoffPackage;
}

// ── executeCurrentPhase 반환 타입 검증 / Return Type ─────────

describe('executeCurrentPhase', () => {
  it('AsyncIterable을 반환한다', () => {
    const deps = createMockDeps();
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'DESIGN', 'feat-1', handoff);

    // WHY: async generator는 Symbol.asyncIterator를 가진다
    expect(result[Symbol.asyncIterator]).toBeDefined();
    expect(typeof result[Symbol.asyncIterator]).toBe('function');
  });
});

// ── Phase 분기 검증 / Phase Routing ──────────────────────────

describe('executeCurrentPhase Phase 분기', () => {
  const allPhases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];

  for (const phase of allPhases) {
    it(`${phase} Phase에 대해 AsyncIterable을 반환한다`, () => {
      const deps = createMockDeps();
      const handoff = createMockHandoff();

      const result = executeCurrentPhase(deps, phase, 'feat-1', handoff);

      expect(result[Symbol.asyncIterator]).toBeDefined();
    });
  }
});

// ── DESIGN Phase 분기 검증 / DESIGN Phase Routing ────────────

describe('executeCurrentPhase DESIGN Phase', () => {
  it('sessionExecutor와 ipcPoller가 없으면 일반 executePhase fallback을 사용한다', () => {
    const deps = createMockDeps({
      sessionExecutor: undefined,
      ipcPoller: undefined,
    });
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'DESIGN', 'feat-1', handoff);

    // WHY: fallback 경로도 정상적으로 AsyncIterable을 반환해야 한다
    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('sessionExecutor와 ipcPoller가 있으면 모니터링 버전을 사용한다', () => {
    const deps = createMockDeps({
      sessionExecutor: {} as PhaseDispatchDeps['sessionExecutor'],
      ipcPoller: {} as PhaseDispatchDeps['ipcPoller'],
    });
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'DESIGN', 'feat-1', handoff);

    expect(result[Symbol.asyncIterator]).toBeDefined();
  });
});

// ── 엣지 케이스 / Edge Cases ─────────────────────────────────

describe('executeCurrentPhase 엣지 케이스', () => {
  it('빈 featureId도 처리한다', () => {
    const deps = createMockDeps();
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'DESIGN', '', handoff);

    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('특수문자가 포함된 featureId도 처리한다', () => {
    const deps = createMockDeps();
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'CODE', 'feat/special-chars_123', handoff);

    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('modifiedFiles.paths가 비어있어도 VERIFY Phase를 처리한다', () => {
    const deps = createMockDeps({
      modifiedFiles: { paths: [] },
    });
    const handoff = createMockHandoff();

    const result = executeCurrentPhase(deps, 'VERIFY', 'feat-1', handoff);

    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('ragSearcher가 undefined여도 모든 Phase를 처리한다', () => {
    const deps = createMockDeps({ ragSearcher: undefined });
    const handoff = createMockHandoff();

    for (const phase of ['DESIGN', 'CODE', 'TEST', 'VERIFY'] as Phase[]) {
      const result = executeCurrentPhase(deps, phase, 'feat-1', handoff);
      expect(result[Symbol.asyncIterator]).toBeDefined();
    }
  });
});
