/**
 * 검증 모델 에스컬레이터 / Verification Model Escalator
 *
 * @description
 * KR: haiku → sonnet → opus 순서로 에스컬레이션하며 검증을 시도한다.
 *     각 단계에서 통과 시 즉시 결과를 반환하고, 실패 시 다음 단계로 에스컬레이션한다.
 *     모든 단계가 실패하면 err(AdevError)를 반환한다.
 * EN: Attempts verification by escalating haiku → sonnet → opus.
 *     Returns immediately on pass, escalates on fail.
 *     Returns err(AdevError) if all stages fail.
 */

import type { VerificationConfig } from 'core/config.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type {
  EscalationAttempt,
  EscalationModel,
  EscalationStepFn,
  EscalationVerificationResult,
} from 'layer2/verification-escalator-types.js';

// ── 모델 ID 매핑 ─────────────────────────────────────────────

/** 모델 티어별 실제 API 모델 ID / Actual API model IDs per tier */
const MODEL_IDS: Readonly<Record<EscalationModel, string>> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

// ── 에스컬레이션 체인 빌더 ───────────────────────────────────

/**
 * VerificationConfig에서 에스컬레이션 체인을 결정한다 / Determines escalation chain from VerificationConfig
 *
 * @param config - 검증 설정 / Verification config
 * @returns 순서대로 시도할 모델 티어 배열 / Ordered array of model tiers to try
 *
 * @example
 * buildEscalationChain({ layer1Model: 'opus', ... })   // ['opus']
 * buildEscalationChain({ layer1Model: 'sonnet', opusEscalationOnFailure: true, ... })  // ['haiku', 'sonnet', 'opus']
 * buildEscalationChain({ layer1Model: 'sonnet', opusEscalationOnFailure: false, ... }) // ['haiku', 'sonnet']
 */
function buildEscalationChain(config: VerificationConfig): EscalationModel[] {
  if (config.layer1Model === 'opus') {
    // WHY: opus는 이미 최상위 모델이므로 단일 시도만 수행
    return ['opus'];
  }

  // sonnet 경로: haiku → sonnet → (opus if enabled)
  const chain: EscalationModel[] = ['haiku', 'sonnet'];
  if (config.opusEscalationOnFailure === true) {
    chain.push('opus');
  }
  return chain;
}

// ── VerificationEscalator ────────────────────────────────────

/**
 * 검증 모델 에스컬레이터 / Verification Model Escalator
 *
 * @description
 * KR: VerificationConfig에 따라 에스컬레이션 체인을 구성하고 순차적으로 검증을 시도한다.
 *     각 시도 결과는 attempts 배열에 기록된다.
 * EN: Builds escalation chain from config and attempts verification sequentially.
 *     Each attempt is recorded in the attempts array.
 *
 * @example
 * const escalator = new VerificationEscalator(logger);
 * const result = await escalator.escalate(stepFn, config);
 * if (result.ok && result.value.passed) {
 *   logger.info('검증 통과', { model: result.value.modelUsed });
 * }
 */
export class VerificationEscalator {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'verification-escalator' });
  }

  /**
   * 에스컬레이션 체인을 실행한다 / Executes escalation chain
   *
   * @param stepFn - 각 모델로 실행할 검증 함수 / Verification function to run per model
   * @param config - 검증 설정 / Verification config
   * @returns 최종 검증 결과. 모든 단계 실패 시 err(AdevError) / Final verification result. err(AdevError) if all fail.
   *
   * @example
   * const result = await escalator.escalate(
   *   async (modelId) => { return { passed: true, feedback: '검증 통과' }; },
   *   { layer1Model: 'sonnet', opusEscalationOnFailure: true, adevModel: 'sonnet' }
   * );
   */
  async escalate(
    stepFn: EscalationStepFn,
    config: VerificationConfig,
  ): Promise<Result<EscalationVerificationResult, AdevError>> {
    const chain = buildEscalationChain(config);
    const attempts: EscalationAttempt[] = [];

    this.logger.info('에스컬레이션 체인 시작', {
      chain,
      layer1Model: config.layer1Model,
      opusEscalationOnFailure: config.opusEscalationOnFailure,
    });

    for (const model of chain) {
      const modelId = MODEL_IDS[model];

      this.logger.debug('에스컬레이션 단계 시작', { model, modelId });

      let stepResult: { passed: boolean; feedback: string };
      try {
        stepResult = await stepFn(modelId);
      } catch (caught: unknown) {
        // WHY: stepFn에서 throw된 에러는 에스컬레이션 실패로 처리 — throw 전파 금지
        const errorMessage = caught instanceof Error ? caught.message : String(caught);

        this.logger.error('에스컬레이션 단계 예외 발생', { model, modelId, error: errorMessage });

        attempts.push({
          model,
          modelId,
          passed: false,
          failureReason: `stepFn threw: ${errorMessage}`,
        });

        return err(
          new AdevError(
            'verification_escalation_failed',
            `에스컬레이션 단계 ${model}(${modelId})에서 예외 발생: ${errorMessage}`,
            caught,
          ),
        );
      }

      const attempt: EscalationAttempt = {
        model,
        modelId,
        passed: stepResult.passed,
        failureReason: stepResult.passed ? '' : stepResult.feedback,
      };
      attempts.push(attempt);

      if (stepResult.passed) {
        this.logger.info('에스컬레이션 단계 통과', { model, modelId });
        return ok({
          passed: true,
          modelUsed: modelId,
          attempts,
          feedback: stepResult.feedback,
        });
      }

      this.logger.warn('에스컬레이션 단계 실패 — 다음 단계로', {
        model,
        modelId,
        feedback: stepResult.feedback,
      });
    }

    // WHY: 모든 단계 실패 — 더 이상 에스컬레이션할 모델 없음
    const failureReasons = attempts.map((a) => `${a.model}: ${a.failureReason}`).join('; ');
    this.logger.error('에스컬레이션 전체 실패', { chain, failureReasons });

    return err(
      new AdevError(
        'verification_escalation_failed',
        `모든 에스컬레이션 단계 실패 (${chain.join(' → ')}): ${failureReasons}`,
      ),
    );
  }
}
