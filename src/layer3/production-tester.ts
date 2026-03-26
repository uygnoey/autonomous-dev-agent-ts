/** ProductionTester - 지속적 E2E 실행 관리 / Continuous E2E session management */
import { randomUUID } from 'node:crypto';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { IBugEscalator } from 'layer3/bug-escalator-types.js';
import type { ContinuousE2EResult } from 'layer3/bug-escalator-types.js';
import { executeE2E, getFailureRate, isHealthy, runE2E } from 'layer3/e2e-runner.js';
import { executeOnce } from 'layer3/production-tester-session.js';
import type { OnE2EFailureCallback } from 'layer3/production-tester-session.js';
import type {
  ContinuousE2EConfig,
  ContinuousE2ESession,
  ContinuousE2EStatus,
  IProductionTester,
  StartContinuousE2EOptions,
} from 'layer3/production-tester-types.js';
import type { E2ETestRun, TestExecutionReport } from 'layer3/types.js';

export type {
  ContinuousE2EConfig,
  ContinuousE2ESession,
  ContinuousE2EStatus,
  IProductionTester,
  StartContinuousE2EOptions,
} from 'layer3/production-tester-types.js';

const DEFAULT_INTERVAL_MS = 300_000;
const DEFAULT_FAIL_FAST = true;

/**
 * ProductionTester - 지속적 E2E 실행 세션 관리 구현 / Manages continuous E2E sessions.
 *
 * @description
 * KR: 지속 E2E 실행 중 실패 감지 시 BugEscalator를 통해 2계층 전체 루프 재실행을 트리거한다.
 *     스펙 §9.3: "1개 실패 → 즉시 중단 → 2계층 전체 루프 재실행 (architect부터)"
 * EN: On failure detection during continuous E2E, triggers Layer 2 full loop re-execution via BugEscalator.
 *     Spec §9.3: "1 failure → immediate stop → Layer 2 full loop re-execution (from architect)"
 *
 * @example
 * const tester = new ProductionTester(integrationTester, logger, bugEscalator);
 * const result = await tester.start({ projectId: 'proj-1', testPath: './tests/e2e' });
 */
export class ProductionTester implements IProductionTester {
  private readonly logger: Logger;
  private readonly integrationTester: IntegrationTester | null;
  private readonly bugEscalator: IBugEscalator | null;
  private readonly sessions: Map<string, ContinuousE2ESession>;
  private readonly timers: Map<string, Timer>;

  /**
   * @param integrationTester - Layer2 통합 테스터 또는 Logger (간단 API) / Layer2 integration tester or Logger (simple API)
   * @param logger - 로거 (전체 API) / Logger (full API)
   * @param bugEscalator - 버그 에스컬레이터 (선택) / Bug escalator (optional)
   */
  constructor(
    integrationTester: IntegrationTester | Logger,
    logger?: Logger,
    bugEscalator?: IBugEscalator,
  ) {
    // WHY: 간단한 API 지원 - logger만 전달하는 경우
    if (!logger) {
      this.logger = (integrationTester as Logger).child({ module: 'production-tester' });
      this.integrationTester = null;
      this.bugEscalator = null;
    } else {
      this.integrationTester = integrationTester as IntegrationTester;
      this.logger = logger.child({ module: 'production-tester' });
      this.bugEscalator = bugEscalator ?? null;
    }
    this.sessions = new Map();
    this.timers = new Map();
  }

  /** @returns 찾지 못했을 때의 err Result */
  private sessionNotFound(sessionId: string): Result<never> {
    return err(
      new AgentError(
        'layer3_continuous_e2e_session_not_found',
        `세션을 찾을 수 없습니다: ${sessionId}`,
      ),
    );
  }

  /**
   * 지속 E2E 실행을 시작한다 / Start continuous E2E execution.
   *
   * @param options - 실행 옵션
   * @returns 생성된 세션
   */
  async start(options: StartContinuousE2EOptions): Promise<Result<ContinuousE2ESession>> {
    if (!options.projectId.trim()) {
      return err(
        new AgentError('layer3_continuous_e2e_start_failed', '프로젝트 ID가 비어있습니다'),
      );
    }
    if (!options.testPath.trim()) {
      return err(
        new AgentError('layer3_continuous_e2e_start_failed', '테스트 경로가 비어있습니다'),
      );
    }

    const sessionId = randomUUID();
    const session: ContinuousE2ESession = {
      id: sessionId,
      projectId: options.projectId,
      projectPath: options.projectPath,
      config: {
        testPath: options.testPath,
        intervalMs: Math.max(1, options.intervalMs ?? DEFAULT_INTERVAL_MS),
        failFast: options.failFast ?? DEFAULT_FAIL_FAST,
      },
      status: 'running',
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      startedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.info('지속 E2E 실행 시작', {
      sessionId,
      projectId: options.projectId,
      projectPath: options.projectPath,
      testPath: options.testPath,
      intervalMs: session.config.intervalMs,
      failFast: session.config.failFast,
    });

    // WHY: 백그라운드 타이머 시작 (Bun의 setInterval 사용)
    const timer = setInterval(() => {
      void this._runOnce(sessionId);
    }, session.config.intervalMs);
    this.timers.set(sessionId, timer);
    return ok(session);
  }

  /**
   * 지속 E2E 실행을 중지한다 / Stop continuous E2E execution.
   *
   * @param sessionId - 세션 ID
   */
  async stop(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.sessionNotFound(sessionId);

    const timer = this.timers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sessionId);
    }

    session.status = 'stopped';
    this.logger.info('지속 E2E 실행 중지', {
      sessionId,
      totalExecutions: session.totalExecutions,
      successCount: session.successCount,
      failureCount: session.failureCount,
    });
    return ok(undefined);
  }

  /**
   * 지속 E2E 실행을 일시 정지한다 / Pause continuous E2E execution.
   *
   * @param sessionId - 세션 ID
   */
  async pause(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.sessionNotFound(sessionId);

    const timer = this.timers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sessionId);
    }

    session.status = 'paused';
    this.logger.info('지속 E2E 실행 일시 정지', { sessionId });
    return ok(undefined);
  }

  /**
   * 지속 E2E 실행을 재개한다 / Resume continuous E2E execution.
   *
   * @param sessionId - 세션 ID
   */
  async resume(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.sessionNotFound(sessionId);
    if (session.status !== 'paused') {
      return err(
        new AgentError(
          'layer3_continuous_e2e_invalid_state',
          `세션이 paused 상태가 아닙니다: ${session.status}`,
        ),
      );
    }

    const timer = setInterval(
      () => {
        void this._runOnce(sessionId);
      },
      Math.max(1, session.config.intervalMs),
    );
    this.timers.set(sessionId, timer);
    session.status = 'running';
    this.logger.info('지속 E2E 실행 재개', { sessionId });
    return ok(undefined);
  }

  /**
   * 세션 상태를 조회한다 / Get session status.
   *
   * @param sessionId - 세션 ID
   */
  async getSession(sessionId: string): Promise<Result<ContinuousE2ESession>> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.sessionNotFound(sessionId);
    return ok(session);
  }

  /** 모든 활성 세션을 조회한다 / List all active sessions. */
  async listSessions(): Promise<Result<readonly ContinuousE2ESession[]>> {
    return ok(Array.from(this.sessions.values()));
  }

  /**
   * 간단한 E2E 테스트를 실행한다 (동기 시뮬레이션) / Run simple E2E tests synchronously (simulation).
   *
   * @param projectId - 프로젝트 ID
   * @param testCommands - 테스트 명령어 목록
   */
  runE2E(projectId: string, testCommands: readonly string[]): Result<TestExecutionReport> {
    return runE2E(projectId, testCommands, this.logger);
  }

  /**
   * E2E 테스트를 실제로 실행한다 (비동기) / Actually execute E2E tests (async).
   *
   * @description
   * KR: Bun.spawn으로 각 명령어를 실제 실행한다. Fail-Fast 원칙 적용.
   * EN: Executes each command via Bun.spawn. Applies Fail-Fast principle.
   *
   * @param projectId - 프로젝트 ID
   * @param testCommands - 실행할 명령어 목록
   * @param cwd - 작업 디렉토리 (기본: 현재 디렉토리)
   */
  async executeE2E(
    projectId: string,
    testCommands: readonly string[],
    cwd = process.cwd(),
  ): Promise<Result<TestExecutionReport>> {
    return executeE2E(projectId, testCommands, cwd, this.logger);
  }

  /**
   * 테스트 결과 목록의 건강도를 확인한다 / Check health (pass rate >= 80%).
   *
   * @param runs - 테스트 실행 결과 목록
   */
  isHealthy(runs: readonly E2ETestRun[]): boolean {
    return isHealthy(runs);
  }

  /**
   * 테스트 결과 목록의 실패율을 계산한다 / Calculate failure rate (0.0–1.0).
   *
   * @param runs - 테스트 실행 결과 목록
   */
  getFailureRate(runs: readonly E2ETestRun[]): number {
    return getFailureRate(runs);
  }

  /**
   * E2E 실패 시 BugEscalator를 통한 에스컬레이션 콜백을 생성한다.
   * Creates escalation callback via BugEscalator for E2E failure.
   *
   * @description
   * KR: §9.4 — "버그 발견 → qc 근본 원인 분석 → 2계층 전체 루프 재실행"
   * EN: §9.4 — "Bug found → qc root cause analysis → Layer 2 full loop re-execution"
   */
  private createOnFailureCallback(sessionId: string): OnE2EFailureCallback | undefined {
    if (!this.bugEscalator) return undefined;

    const escalator = this.bugEscalator;
    const logger = this.logger;
    const session = this.sessions.get(sessionId);

    return async (failedResult: ContinuousE2EResult) => {
      logger.info('BugEscalator 에스컬레이션 시작', {
        sessionId,
        projectId: failedResult.projectId,
        errorMessage: failedResult.errorMessage,
      });

      const escalationResult = await escalator.escalateAsync({
        projectId: failedResult.projectId,
        projectPath: session?.projectPath ?? '',
        featureId: failedResult.featureId,
        failedTest: failedResult,
        context: `지속 E2E 세션 ${sessionId}에서 감지된 실패`,
      });

      if (escalationResult.ok) {
        logger.info('BugEscalator 에스컬레이션 완료', {
          sessionId,
          bugId: escalationResult.value.id,
          status: escalationResult.value.status,
          userApproved: escalationResult.value.userApproved,
        });
      } else {
        logger.error('BugEscalator 에스컬레이션 실패', {
          sessionId,
          errorCode: escalationResult.error.code,
          errorMessage: escalationResult.error.message,
        });
      }
    };
  }

  /** @internal 세션 단일 실행 위임 / Delegate single-run to extracted helper */
  private async _runOnce(sessionId: string): Promise<void> {
    await executeOnce(
      sessionId,
      this.sessions,
      this.timers,
      this.integrationTester,
      this.logger,
      async (sid) => {
        await this.stop(sid);
      },
      this.createOnFailureCallback(sessionId),
    );
  }
}
