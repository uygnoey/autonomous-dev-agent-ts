/**
 * E2E 테스트 실행 헬퍼 / E2E test execution helpers
 *
 * @description
 * KR: 단순 E2E 테스트 실행 및 결과 분석을 위한 순수 함수들.
 *     ProductionTester에서 분리된 상태 없는 유틸리티.
 * EN: Pure stateless helpers for simple E2E test execution and result analysis.
 *     Extracted from ProductionTester.
 */

import { randomUUID } from 'node:crypto';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { E2ETestRun, TestExecutionReport, TestFailure } from 'layer3/types.js';

/**
 * 간단한 E2E 테스트를 실행한다 (동기 버전) / Run simple E2E tests synchronously
 *
 * @description
 * KR: 테스트 명령어 목록을 받아서 동기적으로 간단한 E2E 테스트를 실행한다.
 *     실제 IntegrationTester 없이 간단한 시뮬레이션만 수행한다.
 *     Fail-Fast 원칙에 따라 첫 번째 빈 명령어에서 즉시 중단한다.
 * EN: Takes test command list and runs simple E2E tests synchronously.
 *     Performs simple simulation without actual IntegrationTester.
 *     Stops immediately on first empty command per Fail-Fast principle.
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param testCommands - 테스트 명령어 목록 / Test command list
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 테스트 실행 보고서 / Test execution report
 */
export function runE2E(
  projectId: string,
  testCommands: readonly string[],
  logger: Logger,
): Result<TestExecutionReport> {
  if (!projectId || projectId.trim() === '') {
    return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
  }

  if (!testCommands || testCommands.length === 0) {
    return err(new AgentError('agent_invalid_input', '테스트 명령어 목록이 비어 있습니다'));
  }

  logger.info('간단한 E2E 테스트 실행', { projectId, commandCount: testCommands.length });

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
      break; // WHY: Fail-Fast - 첫 실패 시 즉시 중단
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

  logger.info('간단한 E2E 테스트 완료', { projectId, passed: passedTests, failed: failedTests });
  return ok(report);
}

/**
 * 테스트 결과 목록의 건강도를 확인한다 / Check health of test run results
 *
 * @description
 * KR: 통과율이 80% 이상이면 healthy로 간주한다.
 * EN: Considers healthy if pass rate is >= 80%.
 *
 * @param runs - 테스트 실행 결과 목록 / Test run results
 * @returns 건강도 (통과율 80% 이상) / Health status (pass rate >= 80%)
 */
export function isHealthy(runs: readonly E2ETestRun[]): boolean {
  // WHY: 빈 실행 목록은 건강하지 않음 (테스트가 없음)
  if (runs.length === 0) return false;

  const totalTests = runs.reduce((sum, run) => sum + run.totalTests, 0);
  if (totalTests === 0) return false; // WHY: 전체 테스트가 0이면 건강하지 않음

  const passedTests = runs.reduce((sum, run) => sum + run.passedTests, 0);
  return passedTests / totalTests >= 0.8;
}

/**
 * 테스트 결과 목록의 실패율을 계산한다 / Calculate failure rate of test run results
 *
 * @param runs - 테스트 실행 결과 목록 / Test run results
 * @returns 실패율 (0.0 ~ 1.0) / Failure rate (0.0 ~ 1.0)
 */
export function getFailureRate(runs: readonly E2ETestRun[]): number {
  if (runs.length === 0) return 0;

  const totalTests = runs.reduce((sum, run) => sum + run.totalTests, 0);
  if (totalTests === 0) return 0;

  const failedTests = runs.reduce((sum, run) => sum + run.failedTests, 0);
  return failedTests / totalTests;
}
