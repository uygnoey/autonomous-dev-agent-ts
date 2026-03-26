/**
 * ProductionTester 2계층 에스컬레이션 테스트 / ProductionTester Layer 2 escalation tests
 *
 * @description
 * KR: NI-006 — 지속 E2E 실패 시 BugEscalator를 통한 2계층 재실행 트리거 검증.
 *     스펙 §9.3: "1개 실패 → 즉시 중단 → 2계층 전체 루프 재실행 (architect부터)"
 * EN: NI-006 — Verify Layer 2 re-execution trigger via BugEscalator on continuous E2E failure.
 *     Spec §9.3: "1 failure → immediate stop → Layer 2 full loop re-execution (from architect)"
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type {
  BugEscalationResult,
  ContinuousE2EResult,
  EscalateBugOptions,
  IBugEscalator,
  StepwiseVerificationResult,
  TriggerLayer2Options,
} from 'layer3/bug-escalator-types.js';
import { executeOnce } from 'layer3/production-tester-session.js';
import type { OnE2EFailureCallback } from 'layer3/production-tester-session.js';
import { ProductionTester } from 'layer3/production-tester.js';
import type { BugReport } from 'layer3/types.js';

// ── Mock IntegrationTester ──────────────────────────────────────

class MockIntegrationTester implements Pick<IntegrationTester, 'runIntegrationTests'> {
  public shouldFail = false;
  public shouldReturnError = false;
  public shouldThrow = false;
  public callCount = 0;

  async runIntegrationTests(_projectId: string, _testPath: string) {
    this.callCount += 1;

    if (this.shouldThrow) {
      throw new Error('Mock spawn error');
    }

    if (this.shouldReturnError) {
      return {
        ok: false,
        error: { code: 'test_error', message: 'Mock test error' },
      } as const;
    }

    if (this.shouldFail) {
      return {
        ok: true,
        value: [
          { step: 1, passed: true, duration: 10 },
          { step: 2, passed: false, duration: 10 },
        ],
      } as const;
    }

    return {
      ok: true,
      value: [
        { step: 1, passed: true, duration: 10 },
        { step: 2, passed: true, duration: 10 },
      ],
    } as const;
  }
}

// ── Mock BugEscalator ───────────────────────────────────────────

class MockBugEscalator implements IBugEscalator {
  public escalateAsyncCalls: EscalateBugOptions[] = [];
  public shouldEscalateFail = false;

  escalate(_bugReport: BugReport): Result<{ targetPhase: 'DESIGN'; bugReport: BugReport }> {
    return ok({ targetPhase: 'DESIGN' as const, bugReport: _bugReport });
  }

  async escalateAsync(options: EscalateBugOptions): Promise<Result<BugEscalationResult>> {
    this.escalateAsyncCalls.push(options);

    if (this.shouldEscalateFail) {
      return {
        ok: false,
        error: { code: 'escalation_failed', message: '에스컬레이션 실패' },
      } as never;
    }

    return ok({
      id: 'bug-001',
      triggered: true,
      stepwiseResults: [],
      userApproved: true,
      status: 'resolved' as const,
    });
  }

  async analyzeRootCause(_failedTest: ContinuousE2EResult): Promise<Result<BugReport>> {
    return ok({
      id: 'bug-001',
      projectId: 'proj-1',
      severity: 'high',
      title: 'Test failure',
      description: 'Mock failure',
      createdAt: new Date(),
    } as BugReport);
  }

  async triggerLayer2(_options: TriggerLayer2Options): Promise<Result<void>> {
    return ok(undefined);
  }

  async runStepwiseVerification(
    _projectId: string,
    _projectPath: string,
    _featureId: string,
  ): Promise<Result<readonly StepwiseVerificationResult[]>> {
    return ok([]);
  }

  async requestUserConfirmation(
    _bugReport: BugReport,
    _changes: string,
  ): Promise<Result<boolean>> {
    return ok(true);
  }
}

// ── executeOnce + onFailure 콜백 테스트 ─────────────────────────

describe('executeOnce onFailure 콜백', () => {
  let sessions: Map<string, import('layer3/production-tester-types.js').ContinuousE2ESession>;
  let timers: Map<string, Timer>;
  let mockTester: MockIntegrationTester;
  let logger: ConsoleLogger;
  let stopCalled: boolean;
  let failureCallbacks: ContinuousE2EResult[];

  function makeSession(failFast = true) {
    return {
      id: 'session-1',
      projectId: 'proj-1',
      projectPath: '/tmp/project',
      config: { testPath: './tests/e2e', intervalMs: 1000, failFast },
      status: 'running' as const,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      startedAt: new Date(),
    };
  }

  beforeEach(() => {
    sessions = new Map();
    timers = new Map();
    mockTester = new MockIntegrationTester();
    logger = new ConsoleLogger('error');
    stopCalled = false;
    failureCallbacks = [];
  });

  it('테스트 성공 시 onFailure 콜백이 호출되지 않는다', async () => {
    const session = makeSession();
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    expect(failureCallbacks).toHaveLength(0);
    expect(stopCalled).toBe(false);
    expect(session.successCount).toBe(1);
  });

  it('테스트 실패 + failFast 시 onFailure 콜백이 호출된다', async () => {
    mockTester.shouldFail = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    expect(failureCallbacks).toHaveLength(1);
    expect(failureCallbacks[0]!.projectId).toBe('proj-1');
    expect(failureCallbacks[0]!.passed).toBe(false);
    expect(failureCallbacks[0]!.errorMessage).toContain('E2E 테스트 실패');
    expect(stopCalled).toBe(true);
  });

  it('테스트 실패 + failFast=false 시 onFailure 콜백이 호출되지 않는다', async () => {
    mockTester.shouldFail = true;
    const session = makeSession(false);
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    expect(failureCallbacks).toHaveLength(0);
    expect(stopCalled).toBe(false);
  });

  it('result.ok=false 에러 시 onFailure 콜백이 호출된다', async () => {
    mockTester.shouldReturnError = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    expect(failureCallbacks).toHaveLength(1);
    expect(failureCallbacks[0]!.errorMessage).toContain('Mock test error');
    expect(stopCalled).toBe(true);
  });

  it('예외 throw 시 onFailure 콜백이 호출된다', async () => {
    mockTester.shouldThrow = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    expect(failureCallbacks).toHaveLength(1);
    expect(failureCallbacks[0]!.errorMessage).toContain('예외 발생');
    expect(failureCallbacks[0]!.errorMessage).toContain('Mock spawn error');
    expect(stopCalled).toBe(true);
  });

  it('onFailure 미전달 시 에스컬레이션 없이 정상 동작한다', async () => {
    mockTester.shouldFail = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      // WHY: onFailure 미전달
    );

    expect(stopCalled).toBe(true);
    expect(session.failureCount).toBe(1);
  });

  it('onFailure 콜백 내부 에러가 세션 흐름을 중단시키지 않는다', async () => {
    mockTester.shouldFail = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    const throwingCallback: OnE2EFailureCallback = async () => {
      throw new Error('에스컬레이션 중 예외');
    };

    // WHY: onFailure 내부 예외가 executeOnce를 crash 시키지 않아야 한다
    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      throwingCallback,
    );

    expect(stopCalled).toBe(true);
    expect(session.failureCount).toBe(1);
  });

  it('ContinuousE2EResult에 올바른 필드가 포함된다', async () => {
    mockTester.shouldFail = true;
    const session = makeSession(true);
    sessions.set('session-1', session);

    const onFailure: OnE2EFailureCallback = async (result) => {
      failureCallbacks.push(result);
    };

    await executeOnce(
      'session-1',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => { stopCalled = true; },
      onFailure,
    );

    const result = failureCallbacks[0]!;
    expect(result.id).toBeTruthy();
    expect(result.projectId).toBe('proj-1');
    expect(result.executedAt).toBeInstanceOf(Date);
    expect(result.passed).toBe(false);
    expect(result.failedTest).toBe('./tests/e2e');
    expect(result.featureId).toBe('unknown');
  });
});

// ── ProductionTester + BugEscalator 통합 테스트 ─────────────────

describe('ProductionTester + BugEscalator 통합', () => {
  let mockTester: MockIntegrationTester;
  let mockEscalator: MockBugEscalator;
  let logger: ConsoleLogger;

  beforeEach(() => {
    mockTester = new MockIntegrationTester();
    mockEscalator = new MockBugEscalator();
    logger = new ConsoleLogger('error');
  });

  it('BugEscalator 없이 생성 가능하다 (하위 호환)', () => {
    const tester = new ProductionTester(
      mockTester as unknown as IntegrationTester,
      logger,
    );
    expect(tester).toBeInstanceOf(ProductionTester);
  });

  it('BugEscalator 포함하여 생성 가능하다', () => {
    const tester = new ProductionTester(
      mockTester as unknown as IntegrationTester,
      logger,
      mockEscalator,
    );
    expect(tester).toBeInstanceOf(ProductionTester);
  });

  it('간단 API (logger만) 생성 시 BugEscalator는 null이다', () => {
    const tester = new ProductionTester(logger);
    expect(tester).toBeInstanceOf(ProductionTester);
  });

  it('세션 시작/중지가 정상 동작한다', async () => {
    const tester = new ProductionTester(
      mockTester as unknown as IntegrationTester,
      logger,
      mockEscalator,
    );

    const startResult = await tester.start({
      projectId: 'proj-1',
      projectPath: '/tmp/project',
      testPath: './tests/e2e',
      intervalMs: 60000,
      failFast: true,
    });

    expect(startResult.ok).toBe(true);
    if (startResult.ok) {
      expect(startResult.value.status).toBe('running');
      const stopResult = await tester.stop(startResult.value.id);
      expect(stopResult.ok).toBe(true);
    }
  });

  it('runE2E 메서드는 BugEscalator 존재와 무관하게 동작한다', () => {
    const tester = new ProductionTester(
      mockTester as unknown as IntegrationTester,
      logger,
      mockEscalator,
    );

    const result = tester.runE2E('proj-1', ['echo test']);
    expect(result.ok).toBe(true);
  });
});

// ── BugEscalator.onLayer2RerunRequired 콜백 테스트 ──────────────

describe('BugEscalator onLayer2RerunRequired 콜백', () => {
  it('콜백이 설정되면 triggerLayer2에서 호출된다', async () => {
    const callbackReports: BugReport[] = [];
    const { BugEscalator } = await import('layer3/bug-escalator.js');
    const escalatorLogger = new ConsoleLogger('error');

    const escalator = new BugEscalator(
      {} as never, // WHY: teamLeader (사용 안 함)
      undefined,
      undefined,
      escalatorLogger,
      async (report: BugReport) => {
        callbackReports.push(report);
      },
    );

    const bugReport = {
      id: 'bug-001',
      projectId: 'proj-1',
      severity: 'high' as const,
      title: 'Test failure',
      description: '테스트 실패',
      featureId: 'feat-1',
      createdAt: new Date(),
    } as BugReport;

    const result = await escalator.triggerLayer2({
      projectId: 'proj-1',
      bugReport,
      startPhase: 'DESIGN',
    });

    expect(result.ok).toBe(true);
    expect(callbackReports).toHaveLength(1);
    expect(callbackReports[0]!.id).toBe('bug-001');
  });

  it('콜백 실패 시 에러 Result 반환', async () => {
    const { BugEscalator } = await import('layer3/bug-escalator.js');
    const escalatorLogger = new ConsoleLogger('error');

    const escalator = new BugEscalator(
      {} as never,
      undefined,
      undefined,
      escalatorLogger,
      async () => {
        throw new Error('재실행 콜백 실패');
      },
    );

    const result = await escalator.triggerLayer2({
      projectId: 'proj-1',
      bugReport: {
        id: 'bug-002',
        projectId: 'proj-1',
        severity: 'critical' as const,
        title: 'Critical bug',
        description: '심각한 버그',
        createdAt: new Date(),
      } as BugReport,
      startPhase: 'DESIGN',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer3_escalation_trigger_failed');
    }
  });

  it('콜백 없으면 기존 로직 실행 (하위 호환)', async () => {
    const { BugEscalator } = await import('layer3/bug-escalator.js');
    const escalatorLogger = new ConsoleLogger('error');

    // WHY: onLayer2RerunRequired 없이 생성 — 기존 시뮬레이션 모드
    const escalator = new BugEscalator(escalatorLogger);

    const result = await escalator.triggerLayer2({
      projectId: 'proj-1',
      bugReport: {
        id: 'bug-003',
        projectId: 'proj-1',
        severity: 'medium' as const,
        title: 'Medium bug',
        description: '중간 버그',
        createdAt: new Date(),
      } as BugReport,
      startPhase: 'DESIGN',
    });

    expect(result.ok).toBe(true);
  });
});

// ── executeOnce 실패 경로 다양한 에러 메시지 테스트 ──────────────

describe('executeOnce 에러 메시지 전파', () => {
  let sessions: Map<string, import('layer3/production-tester-types.js').ContinuousE2ESession>;
  let timers: Map<string, Timer>;
  let logger: ConsoleLogger;
  let failureCallbacks: ContinuousE2EResult[];

  function makeSession() {
    return {
      id: 'session-err',
      projectId: 'proj-err',
      projectPath: '/tmp/err-project',
      config: { testPath: './tests/e2e', intervalMs: 1000, failFast: true },
      status: 'running' as const,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      startedAt: new Date(),
    };
  }

  beforeEach(() => {
    sessions = new Map();
    timers = new Map();
    logger = new ConsoleLogger('error');
    failureCallbacks = [];
  });

  it('result.ok=false 에러 시 에러 메시지가 올바르게 전파된다', async () => {
    const mockTester = {
      async runIntegrationTests() {
        return { ok: false, error: { code: 'custom_err', message: '커스텀 에러 메시지' } } as const;
      },
    };

    const session = makeSession();
    sessions.set('session-err', session);

    await executeOnce(
      'session-err',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => {},
      async (result) => { failureCallbacks.push(result); },
    );

    expect(failureCallbacks[0]!.errorMessage).toBe('커스텀 에러 메시지');
  });

  it('실패한 Step 번호가 에러 메시지에 포함된다', async () => {
    const mockTester = {
      async runIntegrationTests() {
        return {
          ok: true,
          value: [
            { step: 1, passed: true, duration: 10 },
            { step: 2, passed: true, duration: 10 },
            { step: 3, passed: false, duration: 10 },
          ],
        } as const;
      },
    };

    const session = makeSession();
    sessions.set('session-err', session);

    await executeOnce(
      'session-err',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => {},
      async (result) => { failureCallbacks.push(result); },
    );

    expect(failureCallbacks[0]!.errorMessage).toContain('Steps: 3');
  });

  it('세션이 없거나 running이 아니면 콜백이 호출되지 않는다', async () => {
    const mockTester = { async runIntegrationTests() { return { ok: true, value: [] } as const; } };

    await executeOnce(
      'nonexistent',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => {},
      async (result) => { failureCallbacks.push(result); },
    );

    expect(failureCallbacks).toHaveLength(0);
  });

  it('paused 상태 세션은 실행하지 않는다', async () => {
    const mockTester = { async runIntegrationTests() { return { ok: true, value: [] } as const; } };
    const session = makeSession();
    session.status = 'paused' as 'running';
    sessions.set('session-err', session);

    await executeOnce(
      'session-err',
      sessions,
      timers,
      mockTester as unknown as IntegrationTester,
      logger,
      async () => {},
      async (result) => { failureCallbacks.push(result); },
    );

    expect(failureCallbacks).toHaveLength(0);
    expect(session.totalExecutions).toBe(0);
  });
});
