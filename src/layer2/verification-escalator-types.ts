/**
 * 검증 에스컬레이터 타입 / Verification escalator types
 *
 * @description
 * KR: haiku → sonnet → opus 에스컬레이션 검증에 사용하는 타입 정의.
 *     layer1 모듈과 독립적으로 설계되어 있다.
 * EN: Type definitions for haiku → sonnet → opus escalation verification.
 *     Designed independently from layer1 module.
 */

/** 에스컬레이션 모델 티어 / Escalation model tier */
export type EscalationModel = 'haiku' | 'sonnet' | 'opus';

/**
 * 에스컬레이션 단계 시도 결과 / Single escalation attempt result
 *
 * @param model - 사용한 모델 티어 / Model tier used
 * @param modelId - 실제 모델 ID 문자열 / Actual model ID string
 * @param passed - 검증 통과 여부 / Whether verification passed
 * @param failureReason - 실패 이유 (통과 시 빈 문자열) / Failure reason (empty string if passed)
 */
export interface EscalationAttempt {
  readonly model: EscalationModel;
  readonly modelId: string;
  readonly passed: boolean;
  readonly failureReason: string;
}

/**
 * 에스컬레이션 검증 결과 / Escalation verification result
 *
 * @param passed - 최종 통과 여부 / Final pass/fail
 * @param modelUsed - 최종적으로 통과한 모델 ID / Model ID that ultimately passed
 * @param attempts - 모든 시도 기록 (성공 포함) / All attempt records (including success)
 * @param feedback - 최종 단계 피드백 / Feedback from the final stage
 */
export interface EscalationVerificationResult {
  readonly passed: boolean;
  readonly modelUsed: string;
  readonly attempts: readonly EscalationAttempt[];
  readonly feedback: string;
}

/**
 * 에스컬레이션 단계 함수 / Single escalation step function
 *
 * @param modelId - 실행할 모델 ID / Model ID to run
 * @returns 검증 결과 / Verification result
 */
export type EscalationStepFn = (modelId: string) => Promise<{ passed: boolean; feedback: string }>;
