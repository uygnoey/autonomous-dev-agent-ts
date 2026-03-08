/** ProductionTester - 지속적 E2E 실행 관리 / Continuous E2E session management */
import { randomUUID } from 'node:crypto';
import type { AdevError } from 'core/errors.js';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import { getFailureRate, isHealthy, runE2E } from 'layer3/e2e-runner.js';
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
 * @example
 * const tester = new ProductionTester(integrationTester, logger);
 * const result = await tester.start({ projectId: 'proj-1', testPath: './tests/e2e' });
 */
export class ProductionTester implements IProductionTester {
  private readonly logger: Logger;
  private readonly integrationTester: IntegrationTester;
  private readonly sessions: Map<string, ContinuousE2ESession>;
  private readonly timers: Map<string, Timer>;

  /** @param integrationTester - Layer2 통합 테스터 또는 Logger (간단 API) */
  constructor(integrationTester: IntegrationTester | Logger, logger?: Logger) {
    // WHY: 간단한 API 지원 - logger만 전달하는 경우
    if (!logger) {
      this.logger = (integrationTester as Logger).child({ module: 'production-tester' });
      // @ts-expect-error - 간단한 API 사용 시 integrationTester는 사용되지 않음
      this.integrationTester = null;
    } else {
      this.integrationTester = integrationTester as IntegrationTester;
      this.logger = logger.child({ module: 'production-tester' });
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
      config: {
        testPath: options.testPath,
        intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
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
      testPath: options.testPath,
      intervalMs: session.config.intervalMs,
      failFast: session.config.failFast,
    });

    // WHY: 백그라운드 타이머 시작 (Bun의 setInterval 사용)
    const timer = setInterval(() => {
      void this.executeOnce(sessionId);
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

    const timer = setInterval(() => {
      void this.executeOnce(sessionId);
    }, session.config.intervalMs);
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
   * 간단한 E2E 테스트를 실행한다 (동기) / Run simple E2E tests synchronously.
   *
   * @param projectId - 프로젝트 ID
   * @param testCommands - 테스트 명령어 목록
   */
  runE2E(projectId: string, testCommands: readonly string[]): Result<TestExecutionReport> {
    return runE2E(projectId, testCommands, this.logger);
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

  private async executeOnce(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;

    this.logger.debug('E2E 테스트 실행 시작', {
      sessionId,
      execution: session.totalExecutions + 1,
    });
    session.totalExecutions += 1;
    session.lastExecutedAt = new Date();

    try {
      const result = await this.integrationTester.runIntegrationTests(
        session.projectId,
        session.config.testPath,
      );

      if (!result.ok) {
        const errorResult = result as { readonly ok: false; readonly error: AdevError };
        session.failureCount += 1;
        this.logger.error('E2E 테스트 실행 실패', {
          sessionId,
          errorCode: errorResult.error.code,
          errorMessage: errorResult.error.message,
        });
        if (session.config.failFast) {
          this.logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
          await this.stop(sessionId);
        }
        return;
      }

      const allPassed = result.value.every((r) => r.passed);
      if (allPassed) {
        session.successCount += 1;
        this.logger.info('E2E 테스트 성공', { sessionId, execution: session.totalExecutions });
      } else {
        session.failureCount += 1;
        this.logger.warn('E2E 테스트 실패', {
          sessionId,
          execution: session.totalExecutions,
          failedSteps: result.value.filter((r) => !r.passed).map((r) => r.step),
        });
        if (session.config.failFast) {
          this.logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
          await this.stop(sessionId);
        }
      }
    } catch (error) {
      session.failureCount += 1;
      this.logger.error('E2E 테스트 실행 중 예외 발생', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (session.config.failFast) {
        this.logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
        await this.stop(sessionId);
      }
    }
  }
}
