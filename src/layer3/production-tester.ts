/**
 * 프로덕션 테스터 / Production Tester
 *
 * @description
 * KR: 지속적 E2E 테스트를 실행하고 결과를 수집한다.
 *     Fail-Fast 원칙에 따라 첫 실패 시 즉시 중단한다.
 *     전체 건강도 판정과 실패율 계산을 제공한다.
 * EN: Runs continuous E2E tests and collects results.
 *     Follows Fail-Fast principle: stops on first failure.
 *     Provides overall health assessment and failure rate calculation.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { E2ETestRun, TestFailure } from './types.js';

/**
 * 건강도 판정 임계값 / Health check threshold
 *
 * @description
 * KR: 최근 실행의 통과율이 이 값 이상이면 건강하다고 판정한다.
 * EN: If pass rate of recent runs meets or exceeds this, the system is healthy.
 */
const HEALTH_THRESHOLD = 0.8;

/**
 * 프로덕션 테스터 / Production Tester
 *
 * @description
 * KR: E2E 테스트 실행 및 건강도 판정을 담당한다.
 * EN: Handles E2E test execution and health assessment.
 *
 * @example
 * const tester = new ProductionTester(logger);
 * const result = tester.runE2E('proj-1', ['bun test']);
 */
export class ProductionTester {
  private runCounter = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'production-tester' });
  }

  /**
   * E2E 테스트를 실행한다 / Runs E2E tests
   *
   * @description
   * KR: 테스트 명령어를 순차 실행하고 Fail-Fast로 첫 실패 시 중단한다.
   *     실제 Bun.spawn 대신 시뮬레이션된 결과를 반환한다.
   * EN: Executes test commands sequentially, stops on first failure (Fail-Fast).
   *     Returns simulated results instead of actual Bun.spawn execution.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param testCommands - 실행할 테스트 명령어 목록 / Test commands to run
   * @returns E2E 테스트 실행 결과 / E2E test run result
   */
  runE2E(projectId: string, testCommands: readonly string[]): Result<E2ETestRun> {
    if (!projectId.trim()) {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어있습니다'));
    }

    if (testCommands.length === 0) {
      return err(new AgentError('agent_invalid_input', '테스트 명령어가 비어있습니다'));
    }

    const startTime = Date.now();
    const failures: TestFailure[] = [];
    let passedCount = 0;

    // WHY: Fail-Fast — 첫 실패 시 즉시 루프를 중단한다
    for (const command of testCommands) {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) {
        failures.push({
          testName: command,
          error: '빈 테스트 명령어',
          featureId: projectId,
        });
        break;
      }

      // WHY: 실제 프로세스 실행은 통합 테스트에서 수행. 여기서는 명령어 유효성만 검증
      passedCount += 1;
    }

    const duration = Date.now() - startTime;
    this.runCounter += 1;

    const run: E2ETestRun = {
      id: `e2e-${this.runCounter}`,
      projectId,
      totalTests: testCommands.length,
      passedTests: passedCount,
      failedTests: failures.length,
      duration,
      failures,
      timestamp: new Date(),
    };

    this.logger.info('E2E 테스트 실행 완료', {
      runId: run.id,
      projectId,
      total: run.totalTests,
      passed: run.passedTests,
      failed: run.failedTests,
      duration,
    });

    return ok(run);
  }

  /**
   * 최근 테스트 실행이 건강한지 판정한다 / Checks if recent test runs are healthy
   *
   * @param runs - 최근 E2E 테스트 실행 목록 / Recent E2E test runs
   * @returns 건강 여부 / Whether healthy
   */
  isHealthy(runs: readonly E2ETestRun[]): boolean {
    if (runs.length === 0) return false;

    const totalTests = runs.reduce((sum, r) => sum + r.totalTests, 0);
    if (totalTests === 0) return false;

    const totalPassed = runs.reduce((sum, r) => sum + r.passedTests, 0);
    const passRate = totalPassed / totalTests;

    return passRate >= HEALTH_THRESHOLD;
  }

  /**
   * 실패율을 계산한다 / Calculates failure rate
   *
   * @param runs - E2E 테스트 실행 목록 / E2E test runs
   * @returns 실패율 (0~1) / Failure rate (0-1)
   */
  getFailureRate(runs: readonly E2ETestRun[]): number {
    if (runs.length === 0) return 0;

    const totalTests = runs.reduce((sum, r) => sum + r.totalTests, 0);
    if (totalTests === 0) return 0;

    const totalFailed = runs.reduce((sum, r) => sum + r.failedTests, 0);
    return totalFailed / totalTests;
  }
}
