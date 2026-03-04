/**
 * 프로덕션 테스터 / Production Tester
 *
 * @description
 * KR: 지속적 E2E 실행 (유지보수 차원). 5분 간격으로 E2E 테스트를 실행하며,
 *     Fail-Fast 원칙에 따라 첫 실패 시 즉시 중단한다.
 *     Layer2 IntegrationTester를 재사용하여 E2E 테스트를 실행한다.
 * EN: Continuous E2E execution (maintenance level). Runs E2E tests at 5-minute intervals.
 *     Follows Fail-Fast principle: stops immediately on first failure.
 *     Reuses Layer2 IntegrationTester for E2E test execution.
 *
 * @example
 * const tester = new ProductionTester(integrationTester, logger);
 * const session = await tester.start({
 *   projectId: 'proj-1',
 *   testPath: './tests/e2e/**\/*.test.ts',
 *   intervalMs: 300_000,
 *   failFast: true,
 * });
 */

import { randomUUID } from 'node:crypto';
import type { AdevError } from '../core/errors.js';
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { IntegrationTester } from '../layer2/integration-tester.js';
import type { E2ETestRun, TestExecutionReport, TestFailure } from './types.js';

// ── 타입 정의 / Type Definitions ────────────────────────────────

/**
 * 지속 E2E 실행 상태 / Continuous E2E execution status
 *
 * @description
 * KR: 세션의 현재 상태를 나타낸다.
 * EN: Represents the current state of a session.
 */
export type ContinuousE2EStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * 지속 E2E 설정 / Continuous E2E configuration
 *
 * @description
 * KR: 지속 E2E 실행에 필요한 설정 정보.
 * EN: Configuration for continuous E2E execution.
 */
export interface ContinuousE2EConfig {
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms) / Execution interval in milliseconds */
  readonly intervalMs: number;
  /** Fail-Fast 활성화 / Enable fail-fast */
  readonly failFast: boolean;
}

/**
 * 지속 E2E 세션 / Continuous E2E session
 *
 * @description
 * KR: 실행 중인 지속 E2E 세션의 상태와 통계를 담는다.
 * EN: Holds state and statistics of a running continuous E2E session.
 */
export interface ContinuousE2ESession {
  /** 세션 ID / Session ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 설정 / Configuration */
  readonly config: ContinuousE2EConfig;
  /** 상태 / Status */
  status: ContinuousE2EStatus;
  /** 총 실행 횟수 / Total execution count */
  totalExecutions: number;
  /** 성공 횟수 / Success count */
  successCount: number;
  /** 실패 횟수 / Failure count */
  failureCount: number;
  /** 시작 시각 / Started at */
  readonly startedAt: Date;
  /** 최종 실행 시각 / Last executed at */
  lastExecutedAt?: Date;
}

/**
 * 지속 E2E 실행 옵션 / Continuous E2E execution options
 *
 * @description
 * KR: 지속 E2E 실행을 시작할 때 필요한 옵션.
 * EN: Options required to start continuous E2E execution.
 */
export interface StartContinuousE2EOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms, 기본: 5분) / Execution interval in milliseconds (default: 5min) */
  readonly intervalMs?: number;
  /** Fail-Fast 활성화 (기본: true) / Enable fail-fast (default: true) */
  readonly failFast?: boolean;
}

// ── 상수 / Constants ────────────────────────────────────────────

/**
 * 기본 실행 간격 (5분) / Default execution interval (5 minutes)
 */
const DEFAULT_INTERVAL_MS = 300_000;

/**
 * 기본 Fail-Fast 설정 / Default fail-fast setting
 */
const DEFAULT_FAIL_FAST = true;

// ── ProductionTester 인터페이스 / IProductionTester Interface ───

/**
 * 지속 E2E 테스터 인터페이스 / Continuous E2E tester interface
 *
 * @description
 * KR: 지속적 E2E 실행을 관리하는 인터페이스.
 * EN: Interface for managing continuous E2E execution.
 */
export interface IProductionTester {
  /**
   * 지속 E2E 실행을 시작한다 / Start continuous E2E execution
   *
   * @param options - 실행 옵션 / Execution options
   * @returns 세션 / Session
   */
  start(options: StartContinuousE2EOptions): Promise<Result<ContinuousE2ESession>>;

  /**
   * 지속 E2E 실행을 중지한다 / Stop continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  stop(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 일시 정지한다 / Pause continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  pause(sessionId: string): Promise<Result<void>>;

  /**
   * 지속 E2E 실행을 재개한다 / Resume continuous E2E execution
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   */
  resume(sessionId: string): Promise<Result<void>>;

  /**
   * 세션 상태를 조회한다 / Get session status
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 세션 / Session
   */
  getSession(sessionId: string): Promise<Result<ContinuousE2ESession>>;

  /**
   * 모든 활성 세션을 조회한다 / List all active sessions
   *
   * @returns 세션 배열 / Session array
   */
  listSessions(): Promise<Result<readonly ContinuousE2ESession[]>>;
}

// ── ProductionTester 구현 / ProductionTester Implementation ────

/**
 * ProductionTester 구현 클래스 / ProductionTester implementation
 *
 * @description
 * KR: 지속적 E2E 실행을 관리한다. Layer2 IntegrationTester를 재사용하여
 *     E2E 테스트를 실행하고, 결과를 추적한다.
 * EN: Manages continuous E2E execution. Reuses Layer2 IntegrationTester
 *     to run E2E tests and tracks results.
 *
 * @example
 * const tester = new ProductionTester(integrationTester, logger);
 * const result = await tester.start({
 *   projectId: 'proj-1',
 *   testPath: './tests/e2e',
 * });
 */
export class ProductionTester implements IProductionTester {
  private readonly logger: Logger;
  private readonly integrationTester: IntegrationTester;
  private readonly sessions: Map<string, ContinuousE2ESession>;
  private readonly timers: Map<string, Timer>;

  /**
   * @param integrationTester - Layer2 통합 테스터 / Layer2 integration tester
   * @param logger - 로거 인스턴스 / Logger instance
   */
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

  /**
   * 지속 E2E 실행을 시작한다 / Start continuous E2E execution
   *
   * @description
   * KR: 새 세션을 생성하고 백그라운드에서 주기적으로 E2E 테스트를 실행한다.
   *     각 실행 후 Fail-Fast 설정에 따라 실패 시 중단할 수 있다.
   * EN: Creates a new session and runs E2E tests periodically in the background.
   *     After each run, may stop on failure based on fail-fast setting.
   *
   * @param options - 실행 옵션 / Execution options
   * @returns 세션 / Session
   * @throws {AgentError} 초기화 실패 시 / On initialization failure
   */
  async start(options: StartContinuousE2EOptions): Promise<Result<ContinuousE2ESession>> {
    // WHY: 입력 검증
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

    // WHY: 세션 초기화
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

    // WHY: 세션 저장
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
      // WHY: 비동기 실행을 처리하기 위해 즉시 실행 함수 사용
      void this.executeOnce(sessionId);
    }, session.config.intervalMs);

    this.timers.set(sessionId, timer);

    return ok(session);
  }

  /**
   * 지속 E2E 실행을 중지한다 / Stop continuous E2E execution
   *
   * @description
   * KR: 타이머를 정리하고 세션을 stopped 상태로 전환한다.
   * EN: Clears the timer and transitions the session to stopped state.
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   * @throws {AgentError} 세션을 찾을 수 없을 때 / When session is not found
   */
  async stop(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(
        new AgentError(
          'layer3_continuous_e2e_session_not_found',
          `세션을 찾을 수 없습니다: ${sessionId}`,
        ),
      );
    }

    const timer = this.timers.get(sessionId);
    if (timer) {
      // WHY: Bun의 clearInterval 사용
      clearInterval(timer);
      this.timers.delete(sessionId);
    }

    // WHY: 세션 상태 업데이트
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
   * 지속 E2E 실행을 일시 정지한다 / Pause continuous E2E execution
   *
   * @description
   * KR: 타이머를 정리하고 세션을 paused 상태로 전환한다. 재개 가능.
   * EN: Clears the timer and transitions the session to paused state. Can be resumed.
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   * @throws {AgentError} 세션을 찾을 수 없을 때 / When session is not found
   */
  async pause(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(
        new AgentError(
          'layer3_continuous_e2e_session_not_found',
          `세션을 찾을 수 없습니다: ${sessionId}`,
        ),
      );
    }

    const timer = this.timers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sessionId);
    }

    // WHY: 세션 상태 업데이트
    session.status = 'paused';

    this.logger.info('지속 E2E 실행 일시 정지', { sessionId });

    return ok(undefined);
  }

  /**
   * 지속 E2E 실행을 재개한다 / Resume continuous E2E execution
   *
   * @description
   * KR: paused 상태의 세션을 다시 running 상태로 전환하고 타이머를 재시작한다.
   * EN: Transitions a paused session back to running state and restarts the timer.
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 여부 / Success status
   * @throws {AgentError} 세션을 찾을 수 없거나 상태가 paused가 아닐 때 / When session is not found or not paused
   */
  async resume(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(
        new AgentError(
          'layer3_continuous_e2e_session_not_found',
          `세션을 찾을 수 없습니다: ${sessionId}`,
        ),
      );
    }

    if (session.status !== 'paused') {
      return err(
        new AgentError(
          'layer3_continuous_e2e_invalid_state',
          `세션이 paused 상태가 아닙니다: ${session.status}`,
        ),
      );
    }

    // WHY: 타이머 재시작
    const timer = setInterval(() => {
      void this.executeOnce(sessionId);
    }, session.config.intervalMs);

    this.timers.set(sessionId, timer);

    // WHY: 세션 상태 업데이트
    session.status = 'running';

    this.logger.info('지속 E2E 실행 재개', { sessionId });

    return ok(undefined);
  }

  /**
   * 세션 상태를 조회한다 / Get session status
   *
   * @description
   * KR: 세션 ID로 세션 정보를 조회한다.
   * EN: Retrieves session information by session ID.
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 세션 / Session
   * @throws {AgentError} 세션을 찾을 수 없을 때 / When session is not found
   */
  async getSession(sessionId: string): Promise<Result<ContinuousE2ESession>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(
        new AgentError(
          'layer3_continuous_e2e_session_not_found',
          `세션을 찾을 수 없습니다: ${sessionId}`,
        ),
      );
    }

    return ok(session);
  }

  /**
   * 모든 활성 세션을 조회한다 / List all active sessions
   *
   * @description
   * KR: 현재 관리 중인 모든 세션 목록을 반환한다.
   * EN: Returns a list of all currently managed sessions.
   *
   * @returns 세션 배열 / Session array
   */
  async listSessions(): Promise<Result<readonly ContinuousE2ESession[]>> {
    return ok(Array.from(this.sessions.values()));
  }

  /**
   * E2E 테스트를 1회 실행한다 (내부 메서드) / Execute E2E test once (internal method)
   *
   * @description
   * KR: IntegrationTester를 사용하여 E2E 테스트를 실행하고 결과를 추적한다.
   *     Fail-Fast 활성화 시 실패하면 세션을 중지한다.
   * EN: Uses IntegrationTester to run E2E tests and tracks results.
   *     Stops the session on failure if fail-fast is enabled.
   *
   * @param sessionId - 세션 ID / Session ID
   */
  private async executeOnce(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn('세션을 찾을 수 없습니다', { sessionId });
      return;
    }

    if (session.status !== 'running') {
      return;
    }

    this.logger.debug('E2E 테스트 실행 시작', {
      sessionId,
      execution: session.totalExecutions + 1,
    });

    // WHY: 실행 횟수 증가
    session.totalExecutions += 1;
    session.lastExecutedAt = new Date();

    try {
      // WHY: IntegrationTester를 사용하여 E2E 테스트 실행
      // Note: IntegrationTester는 전체 4단계 통합 테스트를 실행하므로,
      // 여기서는 프로젝트 경로를 testPath로 사용
      const result = await this.integrationTester.runIntegrationTests(
        session.projectId,
        session.config.testPath,
      );

      // WHY: Result 패턴 처리 - 타입 가드를 통해 분기
      if (!result.ok) {
        // WHY: 실행 에러
        // TypeScript의 타입 좁히기가 항상 작동하지 않으므로 명시적으로 처리
        const errorResult = result as { readonly ok: false; readonly error: AdevError };
        const error = errorResult.error;
        session.failureCount += 1;
        this.logger.error('E2E 테스트 실행 실패', {
          sessionId,
          errorCode: error.code,
          errorMessage: error.message,
        });

        // WHY: Fail-Fast 처리
        if (session.config.failFast) {
          this.logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
          await this.stop(sessionId);
        }
        return;
      }

      // WHY: 결과 처리 (타입 가드 후에는 result.value 접근 가능)
      const testResults = result.value;
      const allPassed = testResults.every((stepResult) => stepResult.passed);

      if (allPassed) {
        session.successCount += 1;
        this.logger.info('E2E 테스트 성공', {
          sessionId,
          execution: session.totalExecutions,
        });
      } else {
        // WHY: 실패 처리
        session.failureCount += 1;
        this.logger.warn('E2E 테스트 실패', {
          sessionId,
          execution: session.totalExecutions,
          failedSteps: testResults.filter((r) => !r.passed).map((r) => r.step),
        });

        // WHY: Fail-Fast 처리
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

      // WHY: Fail-Fast 처리
      if (session.config.failFast) {
        this.logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
        await this.stop(sessionId);
      }
    }
  }

  /**
   * 간단한 E2E 테스트 실행 (동기 버전) / Simple E2E test run (sync version)
   *
   * @description
   * KR: 테스트 명령어 목록을 받아서 동기적으로 간단한 E2E 테스트를 실행한다.
   *     실제 IntegrationTester 없이 간단한 시뮬레이션만 수행한다.
   * EN: Takes test command list and runs simple E2E tests synchronously.
   *     Performs simple simulation without actual IntegrationTester.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param testCommands - 테스트 명령어 목록 / Test command list
   * @returns 테스트 실행 보고서 / Test execution report
   */
  runE2E(projectId: string, testCommands: readonly string[]): Result<TestExecutionReport> {
    // 입력 검증
    if (!projectId || projectId.trim() === '') {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
    }

    if (!testCommands || testCommands.length === 0) {
      return err(new AgentError('agent_invalid_input', '테스트 명령어 목록이 비어 있습니다'));
    }

    this.logger.info('간단한 E2E 테스트 실행', {
      projectId,
      commandCount: testCommands.length,
    });

    const failures: TestFailure[] = [];
    let passedTests = 0;
    let failedTests = 0;

    for (const [index, command] of testCommands.entries()) {
      // WHY: 빈 명령어는 실패로 처리 + Fail-Fast
      if (!command || command.trim() === '') {
        failures.push({
          testName: `Test ${index + 1}`,
          error: 'Empty test command',
          featureId: 'unknown',
        });
        failedTests += 1;
        // WHY: Fail-Fast - 첫 실패 시 즉시 중단
        break;
      }
      passedTests += 1;
    }

    const report: TestExecutionReport = {
      id: randomUUID(),
      projectId,
      totalTests: testCommands.length,
      passedTests,
      failedTests,
      duration: 100,
      executedAt: new Date(),
      failures,
    };

    this.logger.info('간단한 E2E 테스트 완료', {
      projectId,
      passed: passedTests,
      failed: failedTests,
    });

    return ok(report);
  }

  /**
   * 테스트 결과 목록의 건강도를 확인한다 / Check health of test results
   *
   * @param runs - 테스트 실행 결과 목록 / Test run results
   * @returns 건강도 (통과율 80% 이상) / Health status (pass rate >= 80%)
   */
  isHealthy(runs: readonly E2ETestRun[]): boolean {
    // WHY: 빈 실행 목록은 건강하지 않음 (테스트가 없음)
    if (runs.length === 0) {
      return false;
    }

    const totalTests = runs.reduce((sum, run) => sum + run.totalTests, 0);
    const passedTests = runs.reduce((sum, run) => sum + run.passedTests, 0);

    // WHY: 전체 테스트가 0이면 건강하지 않음
    if (totalTests === 0) {
      return false;
    }

    const passRate = passedTests / totalTests;
    return passRate >= 0.8;
  }

  /**
   * 테스트 결과 목록의 실패율을 계산한다 / Calculate failure rate of test results
   *
   * @param runs - 테스트 실행 결과 목록 / Test run results
   * @returns 실패율 (0.0 ~ 1.0) / Failure rate (0.0 ~ 1.0)
   */
  getFailureRate(runs: readonly E2ETestRun[]): number {
    if (runs.length === 0) {
      return 0;
    }

    const totalTests = runs.reduce((sum, run) => sum + run.totalTests, 0);
    const failedTests = runs.reduce((sum, run) => sum + run.failedTests, 0);

    if (totalTests === 0) {
      return 0;
    }

    return failedTests / totalTests;
  }
}
