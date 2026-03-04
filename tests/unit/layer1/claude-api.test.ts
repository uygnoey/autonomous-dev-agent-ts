/**
 * claude-api.ts 단위 테스트 / Unit tests for claude-api.ts
 *
 * @description
 * KR: ClaudeApi 클래스의 비스트리밍/스트리밍 호출, 재시도, 타임아웃, 에러 처리를 검증한다.
 * EN: Verifies ClaudeApi's non-streaming/streaming calls, retry, timeout, and error handling.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClaudeApi } from '../../../src/layer1/claude-api.js';
import type { AuthProvider } from '../../../src/auth/types.js';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { AgentError } from '../../../src/core/errors.js';

// ── Mock AuthProvider ────────────────────────────────────────

class MockAuthProvider implements AuthProvider {
  readonly authMode = 'api-key' as const;

  getAuthHeader(): Record<string, string> {
    return {
      'x-api-key': 'test-api-key',
      'anthropic-version': '2023-06-01',
    };
  }

  getRateLimitStatus() {
    return {
      requestsRemaining: 100,
      inputTokensRemaining: null,
      outputTokensRemaining: null,
      retryAfterSeconds: null,
      isLimitApproaching: false,
    };
  }

  updateFromResponse(_headers: Record<string, string>, _body?: unknown) {
    return { ok: true as const, value: undefined };
  }
}

// ── Mock Anthropic SDK ───────────────────────────────────────

// WHY: Anthropic SDK를 실제로 호출하지 않고 모의 응답을 반환하도록 한다.
const mockCreate = mock(async (_params: unknown, _options?: unknown) => {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Mock response' }],
    model: 'claude-opus-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 10,
      output_tokens: 20,
    },
  };
});

const mockStreamCreate = mock(async function* (_params: unknown, _options?: unknown) {
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' World' } };
  yield { type: 'content_block_stop', index: 0 };
  yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 15 } };
  yield { type: 'message_stop' };
});

// ── Setup & Teardown ─────────────────────────────────────────

describe('ClaudeApi', () => {
  let authProvider: AuthProvider;
  let logger: ConsoleLogger;
  let api: ClaudeApi;

  beforeEach(() => {
    authProvider = new MockAuthProvider();
    logger = new ConsoleLogger('error'); // WHY: 테스트 중 로그 출력 최소화
  });

  afterEach(() => {
    mockCreate.mockClear();
    mockStreamCreate.mockClear();
  });

  // ── 비스트리밍 테스트 ────────────────────────────────────────

  describe('createMessage (non-streaming)', () => {
    it('[normal] 정상 메시지 생성 시 응답 반환 / Returns response on successful message creation', async () => {
      // Arrange: Anthropic SDK mock 주입
      const mockClient = {
        messages: {
          create: mockCreate,
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test message' }]);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Mock response');
        expect(result.value.metadata.model).toBe('claude-opus-4-20250514');
        expect(result.value.metadata.inputTokens).toBe(10);
        expect(result.value.metadata.outputTokens).toBe(20);
      }
    });

    it('[edge] 빈 메시지 배열 전달 시 SDK가 처리 / SDK handles empty message array', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async () => {
            throw new Error('messages must contain at least one user message');
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([]);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AgentError);
      }
    });

    it('[edge] maxTokens 0 전달 시 SDK가 에러 반환 / SDK returns error on maxTokens 0', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async () => {
            const error = new Error('max_tokens must be at least 1');
            // @ts-expect-error WHY: status 주입
            error.status = 400;
            throw error;
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }], { maxTokens: 0 });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_invalid_request');
      }
    });

    it('[random] 타임아웃 시 agent_timeout 에러 반환 / Returns agent_timeout on timeout', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async (_params: unknown, options?: { signal?: AbortSignal }) => {
            // WHY: 타임아웃 시뮬레이션 — 50ms 대기 후 signal 확인
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (options?.signal?.aborted) {
              const abortError = new Error('Request aborted');
              abortError.name = 'AbortError';
              throw abortError;
            }
            return {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Response' }],
              model: 'claude-opus-4-20250514',
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 20 },
            };
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }], { timeoutMs: 10 });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_timeout');
      }
    });

    it('[random] 429 에러 시 재시도 후 성공 / Retries and succeeds on 429 error', async () => {
      // Arrange
      let attemptCount = 0;
      const mockClient = {
        messages: {
          create: mock(async () => {
            attemptCount++;
            if (attemptCount === 1) {
              const error = new Error('Rate limited');
              // @ts-expect-error WHY: status 주입
              error.status = 429;
              throw error;
            }
            return {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Success after retry' }],
              model: 'claude-opus-4-20250514',
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 20 },
            };
          }),
        },
      };

      const retryPolicy = {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffFactor: 2,
        retryableErrors: ['auth_rate_limited'],
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger, retryPolicy);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }]);

      // Assert
      expect(result.ok).toBe(true);
      expect(attemptCount).toBe(2);
    });
  });

  // ── 스트리밍 테스트 ──────────────────────────────────────────

  describe('streamMessage (streaming)', () => {
    it('[normal] 스트리밍 메시지 생성 시 이벤트 콜백 호출 / Invokes callback on streaming events', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mockStreamCreate,
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      const events: string[] = [];
      const onEvent = (event: { type: string; text?: string }) => {
        events.push(event.type);
        if (event.text) {
          events.push(event.text);
        }
      };

      // Act
      const result = await api.streamMessage([{ role: 'user', content: 'Stream test' }], onEvent);

      // Assert
      expect(result.ok).toBe(true);
      expect(events).toContain('content_start');
      expect(events).toContain('content_delta');
      expect(events).toContain('content_stop');
    });

    it('[edge] 스트리밍 중 에러 발생 시 AgentError 반환 / Returns AgentError on streaming error', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async function* () {
            yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
            throw new Error('Stream interrupted');
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      const onEvent = () => {};

      // Act
      const result = await api.streamMessage([{ role: 'user', content: 'Test' }], onEvent);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AgentError);
      }
    });

    it('[random] 스트리밍 타임아웃 시 agent_timeout 에러 반환 / Returns agent_timeout on streaming timeout', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async function* (_params: unknown, options?: { signal?: AbortSignal }) {
            yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
            // WHY: 타임아웃 시뮬레이션 — 50ms 대기
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (options?.signal?.aborted) {
              const abortError = new Error('Request aborted');
              abortError.name = 'AbortError';
              throw abortError;
            }
            yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Test' } };
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      const onEvent = () => {};

      // Act
      const result = await api.streamMessage([{ role: 'user', content: 'Test' }], onEvent, {
        timeoutMs: 10,
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_timeout');
      }
    });
  });

  // ── 에러 처리 테스트 ─────────────────────────────────────────

  describe('error handling', () => {
    it('[edge] 400 에러 시 agent_invalid_request 반환 / Returns agent_invalid_request on 400 error', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async () => {
            const error = new Error('Invalid request');
            // @ts-expect-error WHY: status 주입
            error.status = 400;
            throw error;
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }]);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_invalid_request');
      }
    });

    it('[random] 500 에러 시 agent_api_error 반환 / Returns agent_api_error on 500 error', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async () => {
            const error = new Error('Internal server error');
            // @ts-expect-error WHY: status 주입
            error.status = 500;
            throw error;
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }]);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_api_error');
      }
    });

    it('[edge] 알 수 없는 에러 시 agent_unknown_error 반환 / Returns agent_unknown_error on unknown error', async () => {
      // Arrange
      const mockClient = {
        messages: {
          create: mock(async () => {
            throw 'Unknown error string';
          }),
        },
      };

      // @ts-expect-error WHY: private field 테스트용 주입
      api = new ClaudeApi(authProvider, logger);
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test' }]);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_unknown_error');
      }
    });
  });
});
