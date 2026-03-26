/**
 * executeVerifyPhase 통합 테스트 실행 + adev 종합 판단 테스트
 *
 * @description
 * KR: PI-003(4중 검증 adev 종합 판단) + PI-004(계단식 통합 테스트 Fail-Fast) 검증.
 * EN: Tests PI-003 (adev judgment) + PI-004 (staircase Fail-Fast integration tests).
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import { ok } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentEvent } from 'layer2/types.js';
import { executeVerifyPhase } from 'layer2/team-leader-verify.js';
import type { ExecuteVerifyPhaseDeps } from 'layer2/team-leader-verify.js';
import { VerificationGate } from 'layer2/verification-gate.js';

// ── Mock 팩토리 / Mock factories ──────────────────────────────────

const logger = new ConsoleLogger('error');

function makeHandoffPackage(): HandoffPackage {
  return {
    projectId: 'proj-1',
    specDocument: 'spec content',
    contract: {
      features: [],
      testDefinitions: [],
      metadata: { version: '1.0', createdAt: '' },
      verificationMatrix: {
        completenessScore: 1.0,
        allIODefined: true,
        allFeaturesHaveCriteria: true,
        issues: [],
      },
    },
    designDocument: '',
    planDocument: '',
  } as unknown as HandoffPackage;
}

function makeMockPhaseEngine() {
  return {
    currentPhase: 'VERIFY' as Phase,
    getParticipants: () => ({ lead: ['qa'], active: ['qc', 'reviewer'] }),
    transition: () => ({ ok: true }),
    reset: () => {},
  };
}

function makeMockAgentSpawner(eventsByAgent?: Map<string, AgentEvent[]>) {
  return {
    spawn: async function* (config: { agentName?: string }) {
      const agentName = config.agentName ?? 'unknown';
      const events = eventsByAgent?.get(agentName) ?? [
        {
          type: 'message' as const,
          agentName,
          content: `${agentName} 검증 완료`,
          timestamp: new Date(),
        },
      ];
      for (const event of events) {
        yield event;
      }
    },
  };
}

function makeMockTokenMonitor() {
  return {
    shouldThrottleSpawn: () => false,
    shouldPauseAll: () => false,
  };
}

function makeMockAgentGenerator() {
  return {
    generateAgentConfig: (agentName: string) =>
      ok({ agentName, prompt: '', model: 'test' }),
  };
}

function makeMockSessionManager() {
  return {
    createSession: () => {},
  };
}

function makeMockStreamMonitor() {
  return {
    onEvent: () => {},
  };
}

function makeMockIntegrationTester(allPassed = true, failedAtStep?: number) {
  return {
    runStaircaseTests: async () =>
      ok({
        stepResults: [
          { step: 1, scope: 'modified' as const, targetCount: 100_000, executedCount: 50, passed: allPassed, failCount: allPassed ? 0 : 3 },
        ],
        allPassed,
        failedAtStep: allPassed ? undefined : (failedAtStep ?? 1),
      }),
    runIntegrationTests: async () => ok([]),
    getCurrentStep: () => 0,
    getResults: () => [],
  };
}

function makeDeps(overrides?: Partial<ExecuteVerifyPhaseDeps>): ExecuteVerifyPhaseDeps {
  return {
    phaseEngine: makeMockPhaseEngine() as unknown as ExecuteVerifyPhaseDeps['phaseEngine'],
    tokenMonitor: makeMockTokenMonitor() as unknown as ExecuteVerifyPhaseDeps['tokenMonitor'],
    agentGenerator: makeMockAgentGenerator() as unknown as ExecuteVerifyPhaseDeps['agentGenerator'],
    sessionManager: makeMockSessionManager() as unknown as ExecuteVerifyPhaseDeps['sessionManager'],
    agentSpawner: makeMockAgentSpawner() as unknown as ExecuteVerifyPhaseDeps['agentSpawner'],
    streamMonitor: makeMockStreamMonitor() as unknown as ExecuteVerifyPhaseDeps['streamMonitor'],
    logger,
    verificationGate: new VerificationGate(logger),
    integrationTester: makeMockIntegrationTester() as unknown as ExecuteVerifyPhaseDeps['integrationTester'],
    projectPath: '/tmp/test-project',
    modifiedFiles: { paths: ['src/feature.ts'] },
    ...overrides,
  };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

// ── PI-003: adev 종합 판단 / adev comprehensive judgment ─────────

describe('PI-003: adev 종합 판단', () => {
  it('모든 검증 통과 + 통합 통과 → adev passed', async () => {
    const deps = makeDeps();
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult).toBeDefined();
    expect(adevResult!.passed).toBe(true);
    expect(adevResult!.feedback).toContain('전체 통과');
  });

  it('통합 테스트 실패 → adev failed', async () => {
    const deps = makeDeps({
      integrationTester: makeMockIntegrationTester(false, 2) as unknown as ExecuteVerifyPhaseDeps['integrationTester'],
    });
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult).toBeDefined();
    expect(adevResult!.passed).toBe(false);
    expect(adevResult!.feedback).toContain('통합 테스트 실패');
  });

  it('에이전트 에러 발생 시 해당 검증 실패 → adev failed', async () => {
    const eventsByAgent = new Map<string, AgentEvent[]>([
      [
        'qa',
        [
          { type: 'error', agentName: 'qa', content: 'qa 에러', timestamp: new Date() },
        ],
      ],
    ]);
    const deps = makeDeps({
      agentSpawner: makeMockAgentSpawner(eventsByAgent) as unknown as ExecuteVerifyPhaseDeps['agentSpawner'],
    });
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const qaQcResult = results.find((r) => r.phase === 'qa_qc');
    expect(qaQcResult!.passed).toBe(false);

    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult!.passed).toBe(false);
    expect(adevResult!.feedback).toContain('qa_qc 검증 실패');
  });

  it('4중 검증 모두 기록된다 (qa_qc, reviewer, layer1, adev)', async () => {
    const deps = makeDeps();
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const phases = results.map((r) => r.phase);
    expect(phases).toContain('qa_qc');
    expect(phases).toContain('reviewer');
    expect(phases).toContain('layer1');
    expect(phases).toContain('adev');
  });
});

// ── PI-004: 계단식 통합 Fail-Fast / Staircase Fail-Fast ──────────

describe('PI-004: 계단식 통합 Fail-Fast', () => {
  it('projectPath 없으면 통합 테스트 스킵 (allPassed)', async () => {
    const deps = makeDeps({ projectPath: undefined });
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult!.passed).toBe(true);
  });

  it('modifiedFiles 미제공 시 빈 paths로 실행', async () => {
    const deps = makeDeps({ modifiedFiles: undefined });
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult!.passed).toBe(true);
  });

  it('통합 테스트 Step 2 실패 → adev 피드백에 Step 2 포함', async () => {
    const deps = makeDeps({
      integrationTester: makeMockIntegrationTester(false, 2) as unknown as ExecuteVerifyPhaseDeps['integrationTester'],
    });
    await collectEvents(executeVerifyPhase(deps, 'feat-1', makeHandoffPackage()));

    const results = deps.verificationGate.getResults('feat-1');
    const adevResult = results.find((r) => r.phase === 'adev');
    expect(adevResult!.feedback).toContain('Step 2');
  });
});
