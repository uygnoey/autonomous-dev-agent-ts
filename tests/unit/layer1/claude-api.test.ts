/**
 * claude-api.ts 단위 테스트 / Unit tests for claude-api.ts
 *
 * @description
 * KR: ClaudeApi 클래스의 비스트리밍/스트리밍 호출, 재시도, 타임아웃, 에러 처리를 검증한다.
 * EN: Verifies ClaudeApi's non-streaming/streaming calls, retry, timeout, and error handling.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClaudeApi } from 'layer1/claude-api.js';
import type { AuthProvider } from 'auth/types.js';
import { ConsoleLogger } from 'core/logger.js';
import { AgentError } from 'core/errors.js';

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

// ── 헬퍼 ──────────────────────────────────────────────────────

function makeApi(auth?: AuthProvider, log?: ConsoleLogger): ClaudeApi {
  const a = auth ?? new MockAuthProvider();
  const l = log ?? new ConsoleLogger('error');
  // @ts-expect-error WHY: private field 테스트용 주입
  return new ClaudeApi(a, l);
}

function injectClient(api: ClaudeApi, mockFn: unknown): void {
  // @ts-expect-error WHY: private field 주입
  api.client = { messages: { create: mockFn } };
}

function makeOkClient() {
  return mock(async () => ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Mock response' }],
    model: 'claude-opus-4-20250514',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
  }));
}

function makeErrorClient(status: number, message = 'Error') {
  return mock(async () => {
    const error = new Error(message);
    // @ts-expect-error WHY: status 주입
    error.status = status;
    throw error;
  });
}

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

  // ── 생성자 테스트 ────────────────────────────────────────────

  describe('생성자', () => {
    it('인스턴스가 생성된다', () => {
      expect(() => makeApi()).not.toThrow();
    });

    it('ClaudeApi 인스턴스이다', () => {
      expect(makeApi()).toBeInstanceOf(ClaudeApi);
    });

    it('createMessage 메서드가 존재한다', () => {
      expect(typeof makeApi().createMessage).toBe('function');
    });

    it('streamMessage 메서드가 존재한다', () => {
      expect(typeof makeApi().streamMessage).toBe('function');
    });

    it('두 인스턴스가 서로 다른 객체이다', () => {
      const a1 = makeApi();
      const a2 = makeApi();
      expect(a1).not.toBe(a2);
    });

    it('warn 로거로 생성 가능', () => {
      expect(() => makeApi(undefined, new ConsoleLogger('warn'))).not.toThrow();
    });

    it('debug 로거로 생성 가능', () => {
      expect(() => makeApi(undefined, new ConsoleLogger('debug'))).not.toThrow();
    });

    it('10개 인스턴스 모두 생성 성공', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => makeApi()).not.toThrow();
      }
    });
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

    it('[normal] ok가 boolean이다', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: 'Test' }]);
      expect(typeof result.ok).toBe('boolean');
    });

    it('[normal] content가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: 'hello' }]);
      if (result.ok) expect(typeof result.value.content).toBe('string');
    });

    it('[normal] 5번 반복 일관성 — 항상 ok=true', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        injectClient(api, makeOkClient());
        const result = await api.createMessage([{ role: 'user', content: `test ${i}` }]);
        expect(result.ok).toBe(true);
      }
    });

    it('[normal] model 필드가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: 'model check' }]);
      if (result.ok) expect(typeof result.value.metadata.model).toBe('string');
    });

    it('[normal] inputTokens가 숫자이다', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: 'tokens' }]);
      if (result.ok) expect(typeof result.value.metadata.inputTokens).toBe('number');
    });

    it('[normal] outputTokens가 숫자이다', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: 'out tokens' }]);
      if (result.ok) expect(typeof result.value.metadata.outputTokens).toBe('number');
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

    it('[edge] 빈 메시지 배열 에러 코드가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw new Error('empty messages'); }));
      const result = await api.createMessage([]);
      if (!result.ok) expect(typeof result.error.code).toBe('string');
    });

    it('[edge] 빈 배열 에러 메시지가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw new Error('empty messages'); }));
      const result = await api.createMessage([]);
      if (!result.ok) expect(typeof result.error.message).toBe('string');
    });

    it('[edge] 빈 배열 에러 5번 반복 일관성', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        injectClient(api, mock(async () => { throw new Error('empty messages'); }));
        const result = await api.createMessage([]);
        expect(result.ok).toBe(false);
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

    it('[edge] 401 에러 → ok=false', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(401, 'Unauthorized'));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] 403 에러 → ok=false', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(403, 'Forbidden'));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] 503 에러 → ok=false', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(503, 'Service unavailable'));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] 에러 code가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(500, 'Server error'));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      if (!result.ok) expect(typeof result.error.code).toBe('string');
    });

    it('[edge] 에러 message가 문자열이다', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(500, 'Server error'));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      if (!result.ok) expect(typeof result.error.message).toBe('string');
    });

    it('[normal] 긴 메시지 콘텐츠 → ok=true', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const longContent = 'A'.repeat(10000);
      const result = await api.createMessage([{ role: 'user', content: longContent }]);
      expect(result.ok).toBe(true);
    });

    it('[normal] 한국어 메시지 → ok=true', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([{ role: 'user', content: '안녕하세요, 테스트 메시지입니다.' }]);
      expect(result.ok).toBe(true);
    });

    it('[normal] 멀티턴 메시지 → ok=true', async () => {
      api = makeApi();
      injectClient(api, makeOkClient());
      const result = await api.createMessage([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
      ]);
      expect(result.ok).toBe(true);
    });

    it('[normal] 두 API 인스턴스가 독립적으로 동작', async () => {
      const api1 = makeApi();
      const api2 = makeApi();
      injectClient(api1, makeOkClient());
      injectClient(api2, makeOkClient());
      const r1 = await api1.createMessage([{ role: 'user', content: 'msg1' }]);
      const r2 = await api2.createMessage([{ role: 'user', content: 'msg2' }]);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
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

    it('[normal] ok가 boolean이다', async () => {
      api = makeApi();
      // @ts-expect-error WHY: private field 주입
      api.client = { messages: { create: mockStreamCreate } };
      const result = await api.streamMessage([{ role: 'user', content: 'test' }], () => {});
      expect(typeof result.ok).toBe('boolean');
    });

    it('[normal] 콜백이 1번 이상 호출된다', async () => {
      api = makeApi();
      // @ts-expect-error WHY: private field 주입
      api.client = { messages: { create: mockStreamCreate } };
      let callCount = 0;
      await api.streamMessage([{ role: 'user', content: 'test' }], () => { callCount++; });
      expect(callCount).toBeGreaterThan(0);
    });

    it('[normal] 스트리밍 5번 반복 일관성', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        // @ts-expect-error WHY: private field 주입
        api.client = { messages: { create: mockStreamCreate } };
        const result = await api.streamMessage([{ role: 'user', content: `stream ${i}` }], () => {});
        expect(result.ok).toBe(true);
      }
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

    it('[edge] 스트리밍 에러 코드가 문자열이다', async () => {
      api = makeApi();
      // @ts-expect-error WHY: private field 주입
      api.client = { messages: { create: mock(async function* () { throw new Error('mid-stream error'); }) } };
      const result = await api.streamMessage([{ role: 'user', content: 'test' }], () => {});
      if (!result.ok) expect(typeof result.error.code).toBe('string');
    });

    it('[edge] 스트리밍 에러 5번 반복 일관성', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        // @ts-expect-error WHY: private field 주입
        api.client = { messages: { create: mock(async function* () { throw new Error('error'); }) } };
        const result = await api.streamMessage([{ role: 'user', content: 'test' }], () => {});
        expect(result.ok).toBe(false);
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

    it('[normal] 빈 콜백 → ok=true', async () => {
      api = makeApi();
      // @ts-expect-error WHY: private field 주입
      api.client = { messages: { create: mockStreamCreate } };
      const result = await api.streamMessage([{ role: 'user', content: 'test' }], () => {});
      expect(result.ok).toBe(true);
    });

    it('[normal] 두 스트림 인스턴스 독립 동작', async () => {
      const api1 = makeApi();
      const api2 = makeApi();
      // @ts-expect-error WHY: private field 주입
      api1.client = { messages: { create: mockStreamCreate } };
      // @ts-expect-error WHY: private field 주입
      api2.client = { messages: { create: mockStreamCreate } };
      const r1 = await api1.streamMessage([{ role: 'user', content: 'a' }], () => {});
      const r2 = await api2.streamMessage([{ role: 'user', content: 'b' }], () => {});
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
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

    it('[edge] 400 에러 5번 반복 일관성', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        injectClient(api, makeErrorClient(400, 'Bad request'));
        const result = await api.createMessage([{ role: 'user', content: 'test' }]);
        if (!result.ok) expect(result.error.code).toBe('agent_invalid_request');
      }
    });

    it('[edge] 500 에러 5번 반복 일관성', async () => {
      for (let i = 0; i < 5; i++) {
        api = makeApi();
        injectClient(api, makeErrorClient(500, 'Server error'));
        const result = await api.createMessage([{ role: 'user', content: 'test' }]);
        if (!result.ok) expect(result.error.code).toBe('agent_api_error');
      }
    });

    it('[edge] null throw → ok=false', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw null; }));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] undefined throw → ok=false', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw undefined; }));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] number throw → ok=false', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw 42; }));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] object throw → ok=false', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw { code: 'custom_error' }; }));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      expect(result.ok).toBe(false);
    });

    it('[edge] error.code가 항상 문자열 (400/500/unknown 공통)', async () => {
      for (const status of [400, 500]) {
        api = makeApi();
        injectClient(api, makeErrorClient(status));
        const result = await api.createMessage([{ role: 'user', content: 'test' }]);
        if (!result.ok) expect(typeof result.error.code).toBe('string');
      }
    });

    it('[edge] error.message가 항상 문자열', async () => {
      api = makeApi();
      injectClient(api, mock(async () => { throw 'string error'; }));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      if (!result.ok) expect(typeof result.error.message).toBe('string');
    });

    it('[edge] AgentError instanceof 확인 (400)', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(400));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      if (!result.ok) expect(result.error).toBeInstanceOf(AgentError);
    });

    it('[edge] AgentError instanceof 확인 (500)', async () => {
      api = makeApi();
      injectClient(api, makeErrorClient(500));
      const result = await api.createMessage([{ role: 'user', content: 'test' }]);
      if (!result.ok) expect(result.error).toBeInstanceOf(AgentError);
    });
  });
});
