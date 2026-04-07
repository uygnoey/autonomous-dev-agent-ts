/**
 * Model Router 엔진 / Model Routing Engine
 *
 * @description
 * KR: Phase, 복잡도 기반으로 최적의 LLM 모델을 선택하고,
 *     primary 실패 시 fallback 체인으로 자동 전환하는 라우터.
 * EN: Routes LLM requests to optimal models based on phase and complexity,
 *     with automatic fallback chain on primary failure.
 */

import { AdevError } from 'core/errors.js';
import type {
  LlmCallOptions,
  LlmChatResponse,
  LlmMessage,
  LlmProvider,
  LlmStreamEvent,
} from 'core/llm-provider.js';
import type { ILlmRegistry } from 'core/llm-registry.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { Phase } from 'core/types.js';

// ── 복잡도 수준 / Complexity Level ──────────────────────────────

/** 태스크 복잡도 수준 / Task complexity level */
export type ComplexityLevel = 'low' | 'medium' | 'high';

// ── 모델 라우팅 설정 타입 / Model Routing Config Types ───────────

/**
 * 단일 모델 참조 / Single model reference
 *
 * @description
 * KR: provider 이름과 model ID를 결합한 참조.
 * EN: Combined reference of provider name and model ID.
 */
export interface ModelReference {
  /** LLM 제공자 이름 (e.g., 'claude', 'openai') / LLM provider name */
  readonly provider: string;
  /** 모델 ID (e.g., 'claude-opus-4-6', 'gpt-4o') / Model ID */
  readonly model: string;
}

/**
 * Phase별 모델 매핑 / Per-phase model mapping
 *
 * @description
 * KR: 각 Phase에서 복잡도별로 사용할 모델과 fallback 체인을 정의한다.
 * EN: Defines which model to use per complexity level within a phase, plus fallbacks.
 */
export interface PhaseModelMapping {
  /** 기본 모델 (복잡도 미지정 시 사용) / Default model when complexity is unspecified */
  readonly default: ModelReference;
  /** 복잡도별 모델 오버라이드 (선택) / Per-complexity overrides (optional) */
  readonly byComplexity?: Readonly<Partial<Record<ComplexityLevel, ModelReference>>>;
  /** Fallback 체인: primary 실패 시 순서대로 시도 / Fallback chain on primary failure */
  readonly fallbacks?: readonly ModelReference[];
}

/**
 * 전체 모델 라우팅 설정 / Full model routing configuration
 *
 * @description
 * KR: Phase별 모델 매핑 + 글로벌 기본값을 정의한다.
 *     .adev/config.json의 models 섹션에 대응한다.
 * EN: Defines per-phase model mappings + global defaults.
 *     Corresponds to the models section in .adev/config.json.
 */
export interface ModelRoutingConfig {
  /** 글로벌 기본 모델 (Phase 매핑이 없을 때 사용) / Global default model */
  readonly defaultModel: ModelReference;
  /** 글로벌 fallback 체인 / Global fallback chain */
  readonly defaultFallbacks?: readonly ModelReference[];
  /** Phase별 모델 매핑 (선택) / Per-phase model mappings (optional) */
  readonly phases?: Readonly<Partial<Record<Phase, PhaseModelMapping>>>;
  /** 최대 fallback 시도 횟수 (기본 2) / Max fallback attempts (default 2) */
  readonly maxFallbackAttempts?: number;
}

// ── 라우팅 결과 / Routing Result ─────────────────────────────────

/**
 * 모델 라우팅 결정 결과 / Model routing decision result
 */
export interface RoutingDecision {
  /** 선택된 provider 이름 / Selected provider name */
  readonly provider: string;
  /** 선택된 model ID / Selected model ID */
  readonly model: string;
  /** 선택 사유 / Selection reason */
  readonly reason: string;
}

// ── 기본 설정 / Default Configuration ────────────────────────────

/** 기본 모델 라우팅 설정 / Default model routing configuration */
export const DEFAULT_MODEL_ROUTING_CONFIG: ModelRoutingConfig = {
  defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
  defaultFallbacks: [{ provider: 'claude', model: 'claude-sonnet-4-6' }],
  phases: {
    DESIGN: {
      default: { provider: 'claude', model: 'claude-opus-4-6' },
      byComplexity: {
        low: { provider: 'claude', model: 'claude-sonnet-4-6' },
      },
    },
    CODE: {
      default: { provider: 'claude', model: 'claude-opus-4-6' },
      byComplexity: {
        low: { provider: 'claude', model: 'claude-sonnet-4-6' },
        medium: { provider: 'claude', model: 'claude-opus-4-6' },
        high: { provider: 'claude', model: 'claude-opus-4-6' },
      },
    },
    TEST: {
      default: { provider: 'claude', model: 'claude-sonnet-4-6' },
      byComplexity: {
        low: { provider: 'claude', model: 'claude-haiku-4-5-20251001' },
      },
    },
    VERIFY: {
      default: { provider: 'claude', model: 'claude-sonnet-4-6' },
      byComplexity: {
        high: { provider: 'claude', model: 'claude-opus-4-6' },
      },
    },
  },
  maxFallbackAttempts: 2,
};

// ── ModelRouter 클래스 / ModelRouter Class ────────────────────────

/**
 * Model Router 엔진 / Model Routing Engine
 *
 * @description
 * KR: Phase와 복잡도를 기반으로 최적의 LLM 모델을 선택하고,
 *     primary 실패 시 fallback 체인으로 자동 전환한다.
 *     ILlmRegistry를 통해 provider 인스턴스를 해석한다.
 * EN: Selects optimal LLM model based on phase and complexity,
 *     with automatic fallback chain on primary failure.
 *     Resolves provider instances through ILlmRegistry.
 */
export class ModelRouter {
  private readonly config: ModelRoutingConfig;
  private readonly registry: ILlmRegistry;
  private readonly logger: Logger;
  private readonly maxFallbackAttempts: number;

  constructor(options: {
    readonly config: ModelRoutingConfig;
    readonly registry: ILlmRegistry;
    readonly logger: Logger;
  }) {
    this.config = options.config;
    this.registry = options.registry;
    this.logger = options.logger.child({ module: 'ModelRouter' });
    this.maxFallbackAttempts = options.config.maxFallbackAttempts ?? 2;
  }

  /**
   * Phase와 복잡도를 기반으로 최적 모델을 결정한다 / Decide optimal model based on phase and complexity
   *
   * @param phase - 현재 Phase / Current phase
   * @param complexity - 태스크 복잡도 (선택) / Task complexity (optional)
   * @returns 라우팅 결정 / Routing decision
   */
  resolve(phase?: Phase, complexity?: ComplexityLevel): RoutingDecision {
    // WHY: Phase 매핑이 있으면 Phase 기반으로, 없으면 글로벌 기본
    if (phase && this.config.phases) {
      const phaseMapping = this.config.phases[phase];
      if (phaseMapping) {
        // WHY: 복잡도 오버라이드가 있으면 우선 적용
        if (complexity && phaseMapping.byComplexity) {
          const complexityModel = phaseMapping.byComplexity[complexity];
          if (complexityModel) {
            return {
              provider: complexityModel.provider,
              model: complexityModel.model,
              reason: `phase=${phase}, complexity=${complexity}`,
            };
          }
        }

        return {
          provider: phaseMapping.default.provider,
          model: phaseMapping.default.model,
          reason: `phase=${phase}, default`,
        };
      }
    }

    return {
      provider: this.config.defaultModel.provider,
      model: this.config.defaultModel.model,
      reason: 'global default',
    };
  }

  /**
   * Fallback 체인을 포함한 모델 목록을 반환한다 / Returns model list including fallback chain
   *
   * @param phase - 현재 Phase / Current phase
   * @param complexity - 태스크 복잡도 (선택) / Task complexity (optional)
   * @returns primary + fallback 모델 참조 배열 / Array of primary + fallback model references
   */
  resolveWithFallbacks(phase?: Phase, complexity?: ComplexityLevel): readonly ModelReference[] {
    const primary = this.resolve(phase, complexity);
    const primaryRef: ModelReference = { provider: primary.provider, model: primary.model };
    const chain: ModelReference[] = [primaryRef];

    // WHY: Phase-level fallback → global fallback 순서로 체인 구성
    if (phase && this.config.phases) {
      const phaseMapping = this.config.phases[phase];
      if (phaseMapping?.fallbacks) {
        for (const fb of phaseMapping.fallbacks) {
          if (!chain.some((c) => c.provider === fb.provider && c.model === fb.model)) {
            chain.push(fb);
          }
        }
      }
    }

    if (this.config.defaultFallbacks) {
      for (const fb of this.config.defaultFallbacks) {
        if (!chain.some((c) => c.provider === fb.provider && c.model === fb.model)) {
          chain.push(fb);
        }
      }
    }

    // WHY: maxFallbackAttempts + 1 (primary 포함)
    return chain.slice(0, this.maxFallbackAttempts + 1);
  }

  /**
   * Fallback 포함 채팅 요청 / Chat request with automatic fallback
   *
   * @description
   * KR: primary 모델로 시도하고, 실패 시 fallback 체인을 순서대로 시도한다.
   * EN: Tries primary model first, then iterates fallback chain on failure.
   *
   * @param messages - 대화 메시지 / Conversation messages
   * @param options - 호출 옵션 / Call options
   * @param phase - 현재 Phase (선택) / Current phase (optional)
   * @param complexity - 태스크 복잡도 (선택) / Task complexity (optional)
   * @returns 채팅 응답 Result / Chat response Result
   */
  async chatWithFallback(
    messages: readonly LlmMessage[],
    options?: LlmCallOptions,
    phase?: Phase,
    complexity?: ComplexityLevel,
  ): Promise<Result<LlmChatResponse>> {
    const chain = this.resolveWithFallbacks(phase, complexity);
    const errors: Array<{ ref: ModelReference; error: string }> = [];

    for (const ref of chain) {
      const providerResult = this.registry.resolve(ref.provider);
      if (!providerResult.ok) {
        this.logger.warn('Provider not available, skipping', {
          provider: ref.provider,
          model: ref.model,
          error: providerResult.error.message,
        });
        errors.push({ ref, error: providerResult.error.message });
        continue;
      }

      const provider: LlmProvider = providerResult.value;
      const callOptions: LlmCallOptions = { ...options, model: ref.model };

      this.logger.info('Attempting chat', { provider: ref.provider, model: ref.model });

      const chatResult = await provider.chat(messages, callOptions);
      if (chatResult.ok) {
        if (errors.length > 0) {
          this.logger.info('Chat succeeded via fallback', {
            provider: ref.provider,
            model: ref.model,
            failedAttempts: errors.length,
          });
        }
        return chatResult;
      }

      this.logger.warn('Chat failed, trying fallback', {
        provider: ref.provider,
        model: ref.model,
        error: chatResult.error.message,
      });
      errors.push({ ref, error: chatResult.error.message });
    }

    return err(
      new AdevError(
        'model_routing_all_failed',
        `All models in fallback chain failed. Attempts: ${errors.map((e) => `${e.ref.provider}/${e.ref.model}: ${e.error}`).join('; ')}`,
      ),
    );
  }

  /**
   * 비용 추정: 현재 라우팅 설정으로 선택된 모델의 비용을 추정한다 / Estimate cost for the routed model
   *
   * @param inputTokens - 예상 입력 토큰 / Estimated input tokens
   * @param outputTokens - 예상 출력 토큰 / Estimated output tokens
   * @param phase - 현재 Phase (선택) / Current phase (optional)
   * @param complexity - 태스크 복잡도 (선택) / Task complexity (optional)
   * @returns 비용 추정 Result / Cost estimate Result
   */
  estimateRoutedCost(
    inputTokens: number,
    outputTokens: number,
    phase?: Phase,
    complexity?: ComplexityLevel,
  ): Result<{ readonly costUsd: number; readonly model: string; readonly provider: string }> {
    const decision = this.resolve(phase, complexity);
    const providerResult = this.registry.resolve(decision.provider);
    if (!providerResult.ok) {
      return err(providerResult.error);
    }

    const estimate = providerResult.value.estimateCost(inputTokens, outputTokens, decision.model);
    return ok({
      costUsd: estimate.totalCostUsd,
      model: decision.model,
      provider: decision.provider,
    });
  }

  /**
   * 현재 라우팅 설정을 반환한다 / Returns current routing configuration
   */
  getConfig(): ModelRoutingConfig {
    return this.config;
  }
}
