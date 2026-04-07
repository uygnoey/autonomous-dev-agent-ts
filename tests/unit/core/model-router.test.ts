/**
 * ModelRouter 단위 테스트 / ModelRouter unit tests
 *
 * @description
 * Phase/복잡도 기반 모델 선택, fallback 체인, chatWithFallback, 비용 추정을 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { AdevError } from 'core/errors.js';
import type { LlmProvider } from 'core/llm-provider.js';
import { LlmRegistry } from 'core/llm-registry.js';
import { ConsoleLogger } from 'core/logger.js';
import {
  DEFAULT_MODEL_ROUTING_CONFIG,
  ModelRouter,
} from 'core/model-router.js';
import type { ModelRoutingConfig } from 'core/model-router.js';

// ── Mock Provider ────────────────────────────────────────────────

function createMockProvider(
  name: string,
  opts?: { failChat?: boolean; costPerInputToken?: number },
): LlmProvider {
  return {
    name,
    chat: async (_messages, callOpts) => {
      if (opts?.failChat) {
        return {
          ok: false as const,
          error: new AdevError('llm_chat_failed', `${name} chat failed`),
        };
      }
      return {
        ok: true as const,
        value: {
          content: `response from ${name}`,
          model: callOpts?.model ?? 'mock-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          stopReason: 'end_turn',
        },
      };
    },
    stream: async function* () {
      yield { type: 'done' as const, data: '' };
    },
    getCapabilities: () => ({
      providerName: name,
      defaultModel: 'mock-model',
      supportedModels: ['mock-model'],
      supportsStreaming: true,
      supportsAgentTeams: false,
      maxContextTokens: 100_000,
      maxOutputTokens: 10_000,
    }),
    estimateCost: (inputTokens: number, outputTokens: number, model?: string) => {
      const rate = opts?.costPerInputToken ?? 0.001;
      return {
        inputCostUsd: inputTokens * rate,
        outputCostUsd: outputTokens * rate * 2,
        totalCostUsd: inputTokens * rate + outputTokens * rate * 2,
        model: model ?? 'mock-model',
      };
    },
  };
}

// ── 테스트 ───────────────────────────────────────────────────────

describe('ModelRouter', () => {
  const logger = new ConsoleLogger('error');
  let registry: LlmRegistry;

  beforeEach(() => {
    registry = new LlmRegistry(logger);
    registry.register('claude', () => createMockProvider('claude'));
    registry.register('openai', () => createMockProvider('openai'));
  });

  describe('resolve', () => {
    it('should return global default when no phase specified', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const decision = router.resolve();
      expect(decision.provider).toBe('claude');
      expect(decision.model).toBe('claude-opus-4-6');
      expect(decision.reason).toBe('global default');
    });

    it('should return phase default when phase specified', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const decision = router.resolve('TEST');
      expect(decision.provider).toBe('claude');
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(decision.reason).toContain('phase=TEST');
    });

    it('should return complexity-specific model when both phase and complexity specified', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const decision = router.resolve('TEST', 'low');
      expect(decision.model).toBe('claude-haiku-4-5-20251001');
      expect(decision.reason).toContain('complexity=low');
    });

    it('should fall back to phase default when complexity has no override', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      // TEST phase has no 'high' complexity override
      const decision = router.resolve('TEST', 'high');
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(decision.reason).toContain('default');
    });

    it('should fall back to global default when phase has no mapping', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'openai', model: 'gpt-4o' },
        phases: {},
      };
      const router = new ModelRouter({ config, registry, logger });

      const decision = router.resolve('DESIGN');
      expect(decision.provider).toBe('openai');
      expect(decision.model).toBe('gpt-4o');
      expect(decision.reason).toBe('global default');
    });

    it('should handle undefined phases config', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-sonnet-4-6' },
      };
      const router = new ModelRouter({ config, registry, logger });

      const decision = router.resolve('CODE', 'high');
      expect(decision.provider).toBe('claude');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('resolveWithFallbacks', () => {
    it('should include phase-level fallbacks then global fallbacks', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
        phases: {
          CODE: {
            default: { provider: 'claude', model: 'claude-opus-4-6' },
            fallbacks: [{ provider: 'claude', model: 'claude-sonnet-4-6' }],
          },
        },
        maxFallbackAttempts: 3,
      };
      const router = new ModelRouter({ config, registry, logger });

      const chain = router.resolveWithFallbacks('CODE');
      expect(chain.length).toBe(3);
      expect(chain[0]).toEqual({ provider: 'claude', model: 'claude-opus-4-6' });
      expect(chain[1]).toEqual({ provider: 'claude', model: 'claude-sonnet-4-6' });
      expect(chain[2]).toEqual({ provider: 'openai', model: 'gpt-4o' });
    });

    it('should deduplicate models in chain', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [{ provider: 'claude', model: 'claude-opus-4-6' }],
        maxFallbackAttempts: 3,
      };
      const router = new ModelRouter({ config, registry, logger });

      const chain = router.resolveWithFallbacks();
      // WHY: primary 와 fallback 이 동일하면 중복 제거
      expect(chain.length).toBe(1);
    });

    it('should respect maxFallbackAttempts', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [
          { provider: 'claude', model: 'claude-sonnet-4-6' },
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'openai', model: 'gpt-4o-mini' },
        ],
        maxFallbackAttempts: 1,
      };
      const router = new ModelRouter({ config, registry, logger });

      const chain = router.resolveWithFallbacks();
      // WHY: maxFallbackAttempts=1 → primary + 1 fallback = 2 total
      expect(chain.length).toBe(2);
    });

    it('should default to maxFallbackAttempts=2 when not specified', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [
          { provider: 'claude', model: 'claude-sonnet-4-6' },
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'openai', model: 'gpt-4o-mini' },
        ],
      };
      const router = new ModelRouter({ config, registry, logger });

      const chain = router.resolveWithFallbacks();
      // WHY: default maxFallbackAttempts=2 → primary + 2 fallbacks = 3 total
      expect(chain.length).toBe(3);
    });
  });

  describe('chatWithFallback', () => {
    it('should succeed with primary model', async () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
        undefined,
        'CODE',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('response from claude');
      }
    });

    it('should fall back to secondary when primary fails', async () => {
      const failingRegistry = new LlmRegistry(logger);
      failingRegistry.register('claude', () => createMockProvider('claude', { failChat: true }));
      failingRegistry.register('openai', () => createMockProvider('openai'));

      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
      };
      const router = new ModelRouter({ config, registry: failingRegistry, logger });

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('response from openai');
      }
    });

    it('should return error when all models fail', async () => {
      const allFailRegistry = new LlmRegistry(logger);
      allFailRegistry.register('claude', () => createMockProvider('claude', { failChat: true }));
      allFailRegistry.register('openai', () => createMockProvider('openai', { failChat: true }));

      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
      };
      const router = new ModelRouter({ config, registry: allFailRegistry, logger });

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('model_routing_all_failed');
        expect(result.error.message).toContain('claude');
        expect(result.error.message).toContain('openai');
      }
    });

    it('should skip unregistered providers in fallback chain', async () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'nonexistent', model: 'fake' },
        defaultFallbacks: [{ provider: 'claude', model: 'claude-opus-4-6' }],
      };
      const router = new ModelRouter({ config, registry, logger });

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('response from claude');
      }
    });

    it('should pass call options through to provider', async () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
        { temperature: 0.5, maxTokens: 1000 },
        'CODE',
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('estimateRoutedCost', () => {
    it('should estimate cost for the routed model', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const result = router.estimateRoutedCost(1000, 500, 'TEST');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.provider).toBe('claude');
        expect(result.value.costUsd).toBeGreaterThan(0);
      }
    });

    it('should return error when provider not available', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'nonexistent', model: 'fake' },
      };
      const router = new ModelRouter({ config, registry, logger });

      const result = router.estimateRoutedCost(1000, 500);
      expect(result.ok).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return the current routing configuration', () => {
      const router = new ModelRouter({
        config: DEFAULT_MODEL_ROUTING_CONFIG,
        registry,
        logger,
      });

      const config = router.getConfig();
      expect(config.defaultModel.provider).toBe('claude');
      expect(config.phases).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty fallback arrays', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [],
        phases: {
          CODE: {
            default: { provider: 'claude', model: 'claude-opus-4-6' },
            fallbacks: [],
          },
        },
      };
      const router = new ModelRouter({ config, registry, logger });

      const chain = router.resolveWithFallbacks('CODE');
      expect(chain.length).toBe(1);
      expect(chain[0]).toEqual({ provider: 'claude', model: 'claude-opus-4-6' });
    });

    it('should handle phase mapping with no byComplexity', () => {
      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        phases: {
          DESIGN: {
            default: { provider: 'openai', model: 'gpt-4o' },
          },
        },
      };
      const router = new ModelRouter({ config, registry, logger });

      const decision = router.resolve('DESIGN', 'high');
      expect(decision.provider).toBe('openai');
      expect(decision.model).toBe('gpt-4o');
    });

    it('should handle maxFallbackAttempts=0 (primary only)', async () => {
      const failingRegistry = new LlmRegistry(logger);
      failingRegistry.register('claude', () => createMockProvider('claude', { failChat: true }));
      failingRegistry.register('openai', () => createMockProvider('openai'));

      const config: ModelRoutingConfig = {
        defaultModel: { provider: 'claude', model: 'claude-opus-4-6' },
        defaultFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
        maxFallbackAttempts: 0,
      };
      const router = new ModelRouter({ config, registry: failingRegistry, logger });

      const chain = router.resolveWithFallbacks();
      expect(chain.length).toBe(1);

      const result = await router.chatWithFallback(
        [{ role: 'user', content: 'hello' }],
      );
      expect(result.ok).toBe(false);
    });
  });
});
