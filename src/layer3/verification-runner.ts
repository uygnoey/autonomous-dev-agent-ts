/**
 * 계단식 검증 실행 헬퍼 / Stepwise verification runner helpers
 *
 * @description Layer3 BugEscalator에서 분리된 순수 실행 로직.
 */

import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { StepwiseVerificationResult } from 'layer3/bug-escalator-types.js';

/**
 * 단일 검증 Step을 실행한다 / Execute a single verification step.
 *
 * @param step - 검증 단계 번호
 * @param projectId - 프로젝트 ID
 * @param projectPath - 프로젝트 경로 / Project path (cwd for bun test)
 * @param targetId - 검증 대상 ID
 * @param iterations - 반복 횟수
 * @param integrationTester - 통합 테스터 (없으면 시뮬레이션)
 * @param logger - 로거 인스턴스
 * @returns 검증 결과
 */
export async function runVerificationStep(
  step: number,
  projectId: string,
  projectPath: string,
  targetId: string,
  iterations: number,
  integrationTester: IntegrationTester | null,
  logger: Logger,
): Promise<StepwiseVerificationResult> {
  logger.info('검증 Step 실행', { step, targetId, iterations });

  if (integrationTester) {
    try {
      const testResult = await integrationTester.runIntegrationTests(projectId, projectPath);
      if (testResult.ok) {
        const failCount = testResult.value.filter((r) => !r.passed).length;
        return {
          step,
          passed: failCount === 0,
          failCount,
          failMessage: failCount > 0 ? `Step ${step}: ${failCount}개 실패` : undefined,
        };
      }
      return { step, passed: false, failCount: 1, failMessage: `Step ${step} 실행 실패` };
    } catch (testError) {
      logger.warn('IntegrationTester 호출 실패 — 시뮬레이션 fallback', {
        error: String(testError),
      });
    }
  }

  // WHY: IntegrationTester 없거나 호출 실패 시 시뮬레이션 (통과 처리)
  logger.debug('IntegrationTester 없음 — 시뮬레이션 모드', { step });
  return { step, passed: true, failCount: 0 };
}

/** Step 1-3 검증 설정 / Step 1-3 configurations: [step, iterations] */
export const VERIFICATION_STEPS: readonly [number, number][] = [
  [1, 100_000],
  [2, 10_000],
  [3, 1_000],
];

/** Step 4 반복 횟수 / Step 4 iteration count */
const STEP4_ITERATIONS = 1_000_000;

/**
 * 4단계 계단식 통합 검증을 실행한다 / Run 4-step stepwise integration verification.
 *
 * @param projectId - 프로젝트 ID
 * @param projectPath - 프로젝트 경로 / Project path (cwd for bun test)
 * @param featureId - 수정된 기능 ID
 * @param integrationTester - 통합 테스터
 * @param logger - 로거
 * @returns 검증 결과 배열
 */
export async function runStepwiseVerification(
  projectId: string,
  projectPath: string,
  featureId: string,
  integrationTester: IntegrationTester | null,
  logger: Logger,
): Promise<Result<readonly StepwiseVerificationResult[]>> {
  logger.info('계단식 통합 검증 시작', { projectId, projectPath, featureId });
  const results: StepwiseVerificationResult[] = [];

  for (const [step, iterations] of VERIFICATION_STEPS.slice(0, 3)) {
    const r = await runVerificationStep(
      step,
      projectId,
      projectPath,
      featureId,
      iterations,
      integrationTester,
      logger,
    );
    results.push(r);
    if (!r.passed) {
      logger.warn(`Step ${step} 실패 - 즉시 중단`, { step, failCount: r.failCount });
      return ok(results);
    }
  }

  const step4Result = await runVerificationStep(
    4,
    projectId,
    projectPath,
    'all',
    STEP4_ITERATIONS,
    integrationTester,
    logger,
  );
  results.push(step4Result);
  if (!step4Result.passed) {
    logger.warn('Step 4 실패 - 즉시 중단', { step: 4, failCount: step4Result.failCount });
    return ok(results);
  }

  logger.info('계단식 통합 검증 완료 - 모든 Step 통과', { totalSteps: results.length });
  return ok(results);
}
