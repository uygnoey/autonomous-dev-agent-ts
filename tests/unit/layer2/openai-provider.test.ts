/**
 * OpenAiProvider 단위 테스트 / OpenAiProvider unit tests
 *
 * @description
 * getCapabilities, estimateCost, chat, stream 동작을 검증한다.
 * fetch를 mock하여 실제 API 호출 없이 테스트한다.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { OpenAiProvider } from 'layer2/openai-provider.js';

// ── 테스트 ───────────────────────────────────────────────────────

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    provider = new OpenAiProvider({
      apiKey: 'test-openai-key',
      logger,
    });
  });

  describe('name', () => {
    it('should be "openai"', () => {
      expect(provider.name).toBe('openai');
    });
  });

  describe('getCapabilities', () => {
    it('should return openai capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.providerName).toBe('openai');
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsAgentTeams).toBe(false);
      expect(caps.defaultModel).toBe('gpt-4o');
      expect(caps.supportedModels).toContain('gpt-4o');
      expect(caps.supportedModels).toContain('gpt-4o-mini');
      expect(caps.maxContextTokens).toBe(128_000);
      expect(caps.maxOutputTokens).toBe(16_384);
    });

    it('should use custom default model when specified', () => {
      const customProvider = new OpenAiProvider({
        apiKey: 'key',
        logger,
        defaultModel: 'gpt-4o-mini',
      });
      const caps = customProvider.getCapabilities();
      expect(caps.defaultModel).toBe('gpt-4o-mini');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for gpt-4o model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000);
      expect(cost.inputCostUsd).toBe(2.5);
      expect(cost.outputCostUsd).toBe(10.0);
      expect(cost.totalCostUsd).toBe(12.5);
      expect(cost.model).toBe('gpt-4o');
    });

    it('should estimate cost for gpt-4o-mini model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'gpt-4o-mini');
      expect(cost.inputCostUsd).toBe(0.15);
      expect(cost.outputCostUsd).toBe(0.6);
      expect(cost.totalCostUsd).toBe(0.75);
    });

    it('should estimate cost for gpt-4-turbo', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'gpt-4-turbo');
      expect(cost.inputCostUsd).toBe(10.0);
      expect(cost.outputCostUsd).toBe(30.0);
      expect(cost.totalCostUsd).toBe(40.0);
    });

    it('should fall back to gpt-4o pricing for unknown model', () => {
      const cost = provider.estimateCost(1_000_000, 1_000_000, 'gpt-unknown');
      expect(cost.inputCostUsd).toBe(2.5);
      expect(cost.model).toBe('gpt-unknown');
    });

    it('should handle zero tokens', () => {
      const cost = provider.estimateCost(0, 0);
      expect(cost.totalCostUsd).toBe(0);
    });

    it('should handle small token counts accurately', () => {
      const cost = provider.estimateCost(1000, 500);
      expect(cost.inputCostUsd).toBeCloseTo(0.0025, 6);
      expect(cost.outputCostUsd).toBeCloseTo(0.005, 6);
    });
  });

  describe('chat with mock fetch', () => {
    it('should handle successful API response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-123',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello from OpenAI' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      try {
        const result = await provider.chat([{ role: 'user', content: 'hi' }]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.content).toBe('Hello from OpenAI');
          expect(result.value.model).toBe('gpt-4o');
          expect(result.value.usage.inputTokens).toBe(10);
          expect(result.value.usage.outputTokens).toBe(20);
          expect(result.value.stopReason).toBe('stop');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should return error on HTTP failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 });

      try {
        const result = await provider.chat([{ role: 'user', content: 'hi' }]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('llm_chat_failed');
          expect(result.error.message).toContain('401');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should return error when fetch throws', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('network down');
      };

      try {
        const result = await provider.chat([{ role: 'user', content: 'hi' }]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('network down');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should return error when API returns no choices', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-empty',
            model: 'gpt-4o',
            choices: [],
            usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      try {
        const result = await provider.chat([{ role: 'user', content: 'hi' }]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('no choices');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle null content in response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-null',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: null },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      try {
        const result = await provider.chat([{ role: 'user', content: 'hi' }]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.content).toBe('');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('stream with mock fetch', () => {
    it('should yield error on failed connection', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('connection refused');
      };

      try {
        const events = [];
        for await (const event of provider.stream([{ role: 'user', content: 'hi' }])) {
          events.push(event);
        }
        expect(events.length).toBe(1);
        expect(events[0]!.type).toBe('error');
        expect(events[0]!.data).toContain('connection refused');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should yield error on HTTP error status', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('rate limited', { status: 429 });

      try {
        const events = [];
        for await (const event of provider.stream([{ role: 'user', content: 'hi' }])) {
          events.push(event);
        }
        expect(events.length).toBe(1);
        expect(events[0]!.type).toBe('error');
        expect(events[0]!.data).toContain('429');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should yield error when response body is null', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        const resp = new Response(null, { status: 200 });
        Object.defineProperty(resp, 'body', { value: null });
        return resp;
      };

      try {
        const events = [];
        for await (const event of provider.stream([{ role: 'user', content: 'hi' }])) {
          events.push(event);
        }
        expect(events.length).toBe(1);
        expect(events[0]!.type).toBe('error');
        expect(events[0]!.data).toContain('null');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should parse SSE stream correctly', async () => {
      const originalFetch = globalThis.fetch;

      const sseBody =
        'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n' +
        'data: {"id":"c2","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":null}]}\n\n' +
        'data: {"id":"c3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

      globalThis.fetch = async () =>
        new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });

      try {
        const events = [];
        for await (const event of provider.stream([{ role: 'user', content: 'hi' }])) {
          events.push(event);
        }
        expect(events.length).toBe(3);
        expect(events[0]!.type).toBe('text_delta');
        expect(events[0]!.data).toBe('Hello');
        expect(events[1]!.type).toBe('text_delta');
        expect(events[1]!.data).toBe(' World');
        expect(events[2]!.type).toBe('done');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('custom API URL', () => {
    it('should use custom apiUrl when provided', async () => {
      let capturedUrl = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL) => {
        capturedUrl = String(input);
        return new Response(
          JSON.stringify({
            id: 'c1',
            model: 'custom',
            choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200 },
        );
      };

      try {
        const customProvider = new OpenAiProvider({
          apiKey: 'key',
          logger,
          apiUrl: 'https://custom.api/v1/chat/completions',
        });
        await customProvider.chat([{ role: 'user', content: 'hi' }]);
        expect(capturedUrl).toBe('https://custom.api/v1/chat/completions');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
