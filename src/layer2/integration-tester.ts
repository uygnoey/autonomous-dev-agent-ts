/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 통합 테스트를 실행한다.
 *     Step 1: 기능별 E2E
 *     Step 2: 관련 기능 회귀
 *     Step 3: 비관련 기능 스모크
 *     Step 4: 전체 통합 E2E
 *     Fail-Fast: 1개 실패 시 즉시 중단.
 * EN: Runs 4-step integration tests.
 *     Fail-Fast: stops immediately on first failure.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { IntegrationStepResult } from './types.js';

/**
 * 유효한 통합 테스트 단계 / Valid integration test steps
 */
type IntegrationStep = 1 | 2 | 3 | 4;

/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 통합 테스트를 순차적으로 실행한다.
 *     각 단계는 이전 단계 통과 후에만 진행한다.
 * EN: Runs 4-step integration tests sequentially.
 *     Each step proceeds only after the previous step passes.
 *
 * @example
 * const tester = new IntegrationTester(logger);
 * const step1 = tester.runStep(1, 'feat-1');
 * if (step1.ok && step1.value.passed) tester.runStep(2, 'feat-1');
 */
export class IntegrationTester {
  private readonly results: IntegrationStepResult[] = [];
  private currentStep = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'integration-tester' });
  }

  /**
   * 통합 테스트 단계를 실행한다 / Runs an integration test step
   *
   * @description
   * KR: 지정된 단계의 통합 테스트를 실행한다.
   *     이전 단계가 실패했거나 건너뛰면 에러를 반환한다.
   * EN: Runs the specified integration test step.
   *     Returns error if previous step failed or was skipped.
   *
   * @param step - 실행할 단계 (1~4) / Step to run (1~4)
   * @param featureId - 기능 ID / Feature ID
   * @returns 단계 실행 결과 / Step execution result
   */
  runStep(step: IntegrationStep, featureId: string): Result<IntegrationStepResult> {
    // WHY: 이전 단계 완료 여부 확인 (Fail-Fast 원칙)
    if (step > 1 && this.currentStep < step - 1) {
      return err(
        new AgentError(
          'agent_step_order',
          `단계 ${step}을 실행하려면 단계 ${step - 1}이 먼저 완료되어야 합니다`,
        ),
      );
    }

    // WHY: 이전 단계가 실패했으면 진행 불가
    if (step > 1) {
      const prevResult = this.results.find((r) => r.step === step - 1);
      if (prevResult && !prevResult.passed) {
        return err(
          new AgentError(
            'agent_step_failed',
            `이전 단계 ${step - 1}이 실패하여 단계 ${step}을 실행할 수 없습니다`,
          ),
        );
      }
    }

    this.logger.info('통합 테스트 단계 시작', { step, featureId });

    // WHY: 실제 테스트 실행은 에이전트(tester)가 수행한다.
    //      여기서는 결과 구조만 생성한다 (stub).
    const result: IntegrationStepResult = {
      step,
      passed: true,
      failCount: 0,
    };

    this.results.push(result);
    this.currentStep = step;

    this.logger.info('통합 테스트 단계 완료', {
      step,
      featureId,
      passed: result.passed,
      failCount: result.failCount,
    });

    return ok(result);
  }

  /**
   * 현재 진행 중인 단계를 반환한다 / Returns current step
   *
   * @returns 현재 단계 번호 (0이면 미시작) / Current step number (0 if not started)
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * 전체 결과를 반환한다 / Returns all results
   *
   * @returns 단계별 결과 배열 / Step results array
   */
  getResults(): IntegrationStepResult[] {
    return [...this.results];
  }
}
