/**
 * LlmRegistry 단위 테스트 / LlmRegistry unit tests
 *
 * @description
 * Provider 등록, resolve, 캐싱, 에러 케이스, listProviders, has를 검증한다.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { LlmRegistry } from 'core/llm-registry.js';
import type { LlmProvider } from 'core/llm-provider.js';
import type { LlmProviderFactory } from 'core/llm-registry.js';

// ── Mock Provider ────────────────────────────────────────────────

function createMockProvider(name: string): LlmProvider {
  return {
    name,
    chat: async () => ({
      ok: true as const,
      value: {
        content: 'mock response',
        model: 'mock-model',
        usage: { inputTokens: 10, outputTokens: 20 },
        stopReason: 'end_turn',
      },
    }),
    stream: async function* () {
      yield { type: 'text_delta' as const, data: 'hello' };
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
    estimateCost: (inputTokens: number, outputTokens: number) => ({
      inputCostUsd: inputTokens * 0.001,
      outputCostUsd: outputTokens * 0.002,
      totalCostUsd: inputTokens * 0.001 + outputTokens * 0.002,
      model: 'mock-model',
    }),
  };
}

// ── 테스트 ───────────────────────────────────────────────────────

describe('LlmRegistry', () => {
  let registry: LlmRegistry;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    registry = new LlmRegistry(logger);
  });

  describe('register + resolve', () => {
    it('should register and resolve a provider', () => {
      const factory: LlmProviderFactory = () => createMockProvider('test-provider');
      registry.register('test', factory);

      const result = registry.resolve('test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test-provider');
      }
    });

    it('should return error for unregistered provider', () => {
      const result = registry.resolve('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('llm_provider_not_found');
      }
    });

    it('should include available providers in error message', () => {
      registry.register('claude', () => createMockProvider('claude'));
      registry.register('openai', () => createMockProvider('openai'));

      const result = registry.resolve('gemini');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('claude');
        expect(result.error.message).toContain('openai');
      }
    });
  });

  describe('caching', () => {
    it('should return cached instance when no config is provided', () => {
      let callCount = 0;
      const factory: LlmProviderFactory = () => {
        callCount++;
        return createMockProvider('cached');
      };
      registry.register('cached', factory);

      const result1 = registry.resolve('cached');
      const result2 = registry.resolve('cached');

      expect(callCount).toBe(1);
      expect(result1.ok && result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value).toBe(result2.value);
      }
    });

    it('should create new instance when config is provided', () => {
      let callCount = 0;
      const factory: LlmProviderFactory = () => {
        callCount++;
        return createMockProvider('fresh');
      };
      registry.register('fresh', factory);

      registry.resolve('fresh', { key: 'val1' });
      registry.resolve('fresh', { key: 'val2' });

      expect(callCount).toBe(2);
    });

    it('should invalidate cache when factory is re-registered', () => {
      const factory1: LlmProviderFactory = () => createMockProvider('v1');
      const factory2: LlmProviderFactory = () => createMockProvider('v2');

      registry.register('provider', factory1);
      const r1 = registry.resolve('provider');

      registry.register('provider', factory2);
      const r2 = registry.resolve('provider');

      expect(r1.ok && r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.value.name).toBe('v1');
        expect(r2.value.name).toBe('v2');
      }
    });
  });

  describe('factory error handling', () => {
    it('should return error when factory throws', () => {
      const factory: LlmProviderFactory = () => {
        throw new Error('factory boom');
      };
      registry.register('broken', factory);

      const result = registry.resolve('broken');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('llm_provider_creation_failed');
        expect(result.error.message).toContain('factory boom');
      }
    });

    it('should handle non-Error throws from factory', () => {
      const factory: LlmProviderFactory = () => {
        throw 'string error';
      };
      registry.register('string-throw', factory);

      const result = registry.resolve('string-throw');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('string error');
      }
    });
  });

  describe('listProviders', () => {
    it('should return empty array when no providers registered', () => {
      expect(registry.listProviders()).toEqual([]);
    });

    it('should return all registered provider names', () => {
      registry.register('claude', () => createMockProvider('claude'));
      registry.register('openai', () => createMockProvider('openai'));

      const providers = registry.listProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('openai');
      expect(providers.length).toBe(2);
    });
  });

  describe('has', () => {
    it('should return false for unregistered provider', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });

    it('should return true for registered provider', () => {
      registry.register('exists', () => createMockProvider('exists'));
      expect(registry.has('exists')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string provider name', () => {
      registry.register('', () => createMockProvider('empty'));
      const result = registry.resolve('');
      expect(result.ok).toBe(true);
    });

    it('should handle overwriting existing registration', () => {
      registry.register('dup', () => createMockProvider('first'));
      registry.register('dup', () => createMockProvider('second'));

      const result = registry.resolve('dup');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('second');
      }
    });
  });
});
