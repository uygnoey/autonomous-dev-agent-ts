/**
 * ClaudeProvider 단위 테스트 / ClaudeProvider unit tests
 *
 * @description
 * getCapabilities, estimateCost, chat, stream 동작을 검증한다.
 * 실제 SDK 호출 없이 sessionFactory와 executeOneShot를 mock한다.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ClaudeProvider } from 'layer2/claude-provider.js';
import type { AuthProvider } from 'auth/types.js';
import type { RateLimitStatus } from 'auth/types.js';

// ── Mock AuthProvider ─────────────────────────────────────────────

function createMockAuthProvider(): AuthProvider {
  return {
    authMode: 'api_key',
    getAuthHeader: () => ({ 'x-api-key': 'test-key-123' }),
    getRateLimitStatus: (): RateLimitStatus => ({
      requestsRemaining: 100,
      inputTokensRemaining: 1_000_000,
      outputTokensRemaining: 500_000,
      retryAfterSeconds: null,
      requestsLimit: 100,
      isLimitApproaching: false,
    }),
    updateFromResponse: () => ({ ok: true as const, value: undefined }),
  };
}

// ── 테스트 ───────────────────────────────────────────────────────

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    provider = new ClaudeProvider({
      authProvider: createMockAuthProvider(),
      logger,
    });
  });

  describe('name', () => {
    it('should be "claude"', () => {
      expect(provider.name).toBe('claude');
    });
  });

  describe('getCapabilities', () => {
    it('should return claude capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.providerName).toBe('claude');
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsAgentTeams).toBe(true);
      expect(caps.defaultModel).toBe('claude-opus-4-6');
      expect(caps.supportedModels.length).toBeGreaterThan(0);
      expect(caps.maxContextTokens).toBe(200_000);
      expect(caps.maxOutputTokens).toBe(32_000);
    });

    it('should use custom default model when specified', () => {
      const customProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        defaultModel: 'claude-sonnet-4-6',
      });
      const caps = customProvider.getCapabilities();
      expect(caps.defaultModel).toBe('claude-sonnet-4-6');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for opus model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000);
      expect(cost.inputCostUsd).toBe(15.0);
      expect(cost.outputCostUsd).toBe(75.0);
      expect(cost.totalCostUsd).toBe(90.0);
      expect(cost.model).toBe('claude-opus-4-6');
    });

    it('should estimate cost for sonnet model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'claude-sonnet-4-6');
      expect(cost.inputCostUsd).toBe(3.0);
      expect(cost.outputCostUsd).toBe(15.0);
      expect(cost.totalCostUsd).toBe(18.0);
    });

    it('should estimate cost for haiku model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'claude-haiku-4-5-20251001');
      expect(cost.inputCostUsd).toBe(0.8);
      expect(cost.outputCostUsd).toBe(4.0);
      expect(cost.totalCostUsd).toBe(4.8);
    });

    it('should fall back to opus pricing for unknown model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'claude-unknown');
      expect(cost.inputCostUsd).toBe(15.0);
      expect(cost.model).toBe('claude-unknown');
    });

    it('should handle zero tokens', () => {
      const cost = provider.estimateCost(0, 0);
      expect(cost.totalCostUsd).toBe(0);
    });

    it('should handle small token counts', () => {
      const cost = provider.estimateCost(100, 50);
      expect(cost.inputCostUsd).toBeCloseTo(0.0015, 6);
      expect(cost.outputCostUsd).toBeCloseTo(0.00375, 6);
    });
  });

  describe('stream with mock sessionFactory', () => {
    it('should yield events from mock session', async () => {
      const mockSession = {
        sessionId: 'test-session',
        send: async () => {},
        stream: async function* () {
          yield {
            type: 'assistant' as const,
            message: {
              content: [{ type: 'text' as const, text: 'Hello from Claude' }],
            },
          };
          yield {
            type: 'result' as const,
            subtype: 'success' as const,
            result: 'done',
            stop_reason: 'end_turn',
            total_cost_usd: 0.01,
          };
        },
        close: () => {},
      };

      const streamProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        sessionFactory: () => mockSession as never,
      });

      const events = [];
      for await (const event of streamProvider.stream([{ role: 'user', content: 'hi' }])) {
        events.push(event);
      }

      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe('text_delta');
      expect(events[0]!.data).toBe('Hello from Claude');
      expect(events[1]!.type).toBe('done');
    });

    it('should yield error event when session creation throws', async () => {
      const failProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        sessionFactory: () => {
          throw new Error('session creation failed');
        },
      });

      const events = [];
      for await (const event of failProvider.stream([{ role: 'user', content: 'hi' }])) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('error');
      expect(events[0]!.data).toContain('session creation failed');
    });

    it('should yield error event when stream throws', async () => {
      const mockSession = {
        sessionId: 'test-session',
        send: async () => {},
        stream: async function* () {
          throw new Error('stream broke');
        },
        close: () => {},
      };

      const errProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        sessionFactory: () => mockSession as never,
      });

      const events = [];
      for await (const event of errProvider.stream([{ role: 'user', content: 'hi' }])) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('error');
      expect(events[0]!.data).toContain('stream broke');
    });

    it('should map tool_use events correctly', async () => {
      const mockSession = {
        sessionId: 'test-session',
        send: async () => {},
        stream: async function* () {
          yield {
            type: 'assistant' as const,
            message: {
              content: [
                { type: 'tool_use' as const, name: 'Read', input: { path: '/foo' } },
              ],
            },
          };
          yield {
            type: 'result' as const,
            subtype: 'success' as const,
            result: 'done',
            stop_reason: 'end_turn',
            total_cost_usd: 0.005,
          };
        },
        close: () => {},
      };

      const toolProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        sessionFactory: () => mockSession as never,
      });

      const events = [];
      for await (const event of toolProvider.stream([{ role: 'user', content: 'hi' }])) {
        events.push(event);
      }

      expect(events[0]!.type).toBe('tool_use');
      expect(events[0]!.data).toBe('Tool: Read');
      expect(events[0]!.metadata?.toolName).toBe('Read');
    });

    it('should handle error result subtype', async () => {
      const mockSession = {
        sessionId: 'test-session',
        send: async () => {},
        stream: async function* () {
          yield {
            type: 'result' as const,
            subtype: 'error_during_execution' as const,
            errors: ['something went wrong'],
          };
        },
        close: () => {},
      };

      const errProvider = new ClaudeProvider({
        authProvider: createMockAuthProvider(),
        logger,
        sessionFactory: () => mockSession as never,
      });

      const events = [];
      for await (const event of errProvider.stream([{ role: 'user', content: 'hi' }])) {
        events.push(event);
      }

      expect(events[0]!.type).toBe('error');
      expect(events[0]!.data).toBe('something went wrong');
    });
  });
});
