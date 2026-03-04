/**
 * ClaudeApi 통합 테스트 / ClaudeApi integration tests
 *
 * @description
 * KR: ClaudeApi와 AuthProvider의 실제 통합을 검증한다.
 *     Mock 없이 실제 인스턴스를 사용하여 연동 테스트를 수행한다.
 * EN: Verifies actual integration between ClaudeApi and AuthProvider.
 *     Uses real instances without mocks for integration testing.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClaudeApi } from '../../src/layer1/claude-api.js';
import { ApiKeyAuth } from '../../src/auth/api-key-auth.js';
import { SubscriptionAuth } from '../../src/auth/subscription-auth.js';
import { ConsoleLogger } from '../../src/core/logger.js';
import type { AuthProvider } from '../../src/auth/types.js';

// ── Mock Anthropic SDK (통합 테스트용) ───────────────────────

// WHY: 실제 Anthropic API 호출은 비용 발생 및 불안정하므로, SDK만 Mock
const mockCreate = mock(async (_params: unknown, _options?: unknown) => {
  return {
    id: 'msg_integration',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Integration test response' }],
    model: 'claude-opus-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 50,
      output_tokens: 30,
    },
  };
});

const mockStreamCreate = mock(async function* (_params: unknown, _options?: unknown) {
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Integration' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' test' } };
  yield { type: 'content_block_stop', index: 0 };
  yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 25 } };
  yield { type: 'message_stop' };
});

// ── 통합 테스트 ──────────────────────────────────────────────

describe('ClaudeApi Integration Tests', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('error'); // WHY: 통합 테스트 로그 최소화
  });

  afterEach(() => {
    mockCreate.mockClear();
    mockStreamCreate.mockClear();
  });

  // ── ApiKeyAuth 통합 ─────────────────────────────────────────

  describe('ClaudeApi + ApiKeyAuth Integration', () => {
    it('[integration] ApiKeyAuth와 함께 비스트리밍 메시지 생성', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const api = new ClaudeApi(authProvider, logger);

      // Mock SDK 주입
      const mockClient = {
        messages: {
          create: mockCreate,
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test with API Key' }]);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Integration test response');
        expect(result.value.metadata.inputTokens).toBe(50);
        expect(result.value.metadata.outputTokens).toBe(30);
      }

      // AuthProvider 헤더 확인
      const headers = authProvider.getAuthHeader();
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('[integration] ApiKeyAuth 레이트 리밋 정보 업데이트', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mockCreate,
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      await api.createMessage([{ role: 'user', content: 'Test' }]);

      // Assert: authProvider에 usage 정보 전달됨
      const rateLimitStatus = authProvider.getRateLimitStatus();
      // WHY: ApiKeyAuth는 헤더에서 파싱하므로 기본값 null
      expect(rateLimitStatus.requestsRemaining).toBeNull();
    });

    it('[integration] ApiKeyAuth 스트리밍 메시지 생성', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mockStreamCreate,
        },
      };
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
      expect(events).toContain('Integration');
      expect(events).toContain(' test');
      expect(events).toContain('content_stop');
    });
  });

  // ── SubscriptionAuth 통합 ───────────────────────────────────

  describe('ClaudeApi + SubscriptionAuth Integration', () => {
    it('[integration] SubscriptionAuth와 함께 비스트리밍 메시지 생성', async () => {
      // Arrange
      const authProvider: AuthProvider = new SubscriptionAuth('test-oauth-token', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mockCreate,
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test with OAuth' }]);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Integration test response');
      }

      // AuthProvider 헤더 확인
      const headers = authProvider.getAuthHeader();
      expect(headers.authorization).toBe('Bearer test-oauth-token');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('[integration] SubscriptionAuth 사용량 추적', async () => {
      // Arrange
      const authProvider: AuthProvider = new SubscriptionAuth('test-oauth-token', logger, 45);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mockCreate,
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act: 여러 번 호출하여 사용량 누적
      await api.createMessage([{ role: 'user', content: 'Message 1' }]);
      await api.createMessage([{ role: 'user', content: 'Message 2' }]);
      await api.createMessage([{ role: 'user', content: 'Message 3' }]);

      // Assert: SubscriptionAuth가 메시지 카운트 추적
      const rateLimitStatus = authProvider.getRateLimitStatus();
      // WHY: SubscriptionAuth는 응답 본문에서 usage 파싱
      expect(rateLimitStatus.requestsRemaining).toBeLessThanOrEqual(42); // 45 - 3 = 42
    });

    it('[integration] SubscriptionAuth 스트리밍 메시지', async () => {
      // Arrange
      const authProvider: AuthProvider = new SubscriptionAuth('test-oauth-token', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mockStreamCreate,
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      const events: string[] = [];
      const onEvent = (event: { type: string }) => {
        events.push(event.type);
      };

      // Act
      const result = await api.streamMessage([{ role: 'user', content: 'Stream' }], onEvent);

      // Assert
      expect(result.ok).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ── 재시도 로직 통합 ────────────────────────────────────────

  describe('ClaudeApi Retry Logic Integration', () => {
    it('[integration] 429 에러 시 재시도 후 성공', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const retryPolicy = {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffFactor: 2,
        retryableErrors: ['auth_rate_limited'],
      };
      const api = new ClaudeApi(authProvider, logger, retryPolicy);

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
              id: 'msg_retry',
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
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test retry' }]);

      // Assert
      expect(result.ok).toBe(true);
      expect(attemptCount).toBe(2); // 1회 실패 + 1회 성공
    });

    it('[integration] 최대 재시도 횟수 초과 시 실패', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const retryPolicy = {
        maxAttempts: 2,
        baseDelay: 10,
        maxDelay: 100,
        backoffFactor: 2,
        retryableErrors: ['auth_rate_limited'],
      };
      const api = new ClaudeApi(authProvider, logger, retryPolicy);

      let attemptCount = 0;
      const mockClient = {
        messages: {
          create: mock(async () => {
            attemptCount++;
            const error = new Error('Rate limited');
            // @ts-expect-error WHY: status 주입
            error.status = 429;
            throw error;
          }),
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test max retries' }]);

      // Assert
      expect(result.ok).toBe(false);
      expect(attemptCount).toBe(2); // maxAttempts = 2
      if (!result.ok) {
        expect(result.error.code).toBe('auth_rate_limited');
      }
    });
  });

  // ── 타임아웃 통합 ───────────────────────────────────────────

  describe('ClaudeApi Timeout Integration', () => {
    it('[integration] 타임아웃 설정 시 AbortController 작동', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mock(async (_params: unknown, options?: { signal?: AbortSignal }) => {
            // WHY: 타임아웃 시뮬레이션 - 50ms 대기
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (options?.signal?.aborted) {
              const abortError = new Error('Request aborted');
              abortError.name = 'AbortError';
              throw abortError;
            }
            return {
              id: 'msg_timeout',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'Should timeout' }],
              model: 'claude-opus-4-20250514',
              stop_reason: 'end_turn',
              usage: { input_tokens: 10, output_tokens: 20 },
            };
          }),
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test timeout' }], {
        timeoutMs: 10,
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_timeout');
      }
    });
  });

  // ── 메타데이터 추출 통합 ────────────────────────────────────

  describe('ClaudeApi Metadata Integration', () => {
    it('[integration] 응답 메타데이터가 정확히 추출됨', async () => {
      // Arrange
      const authProvider: AuthProvider = new ApiKeyAuth('test-api-key', logger);
      const api = new ClaudeApi(authProvider, logger);

      const mockClient = {
        messages: {
          create: mock(async () => ({
            id: 'msg_metadata',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Metadata test' }],
            model: 'claude-opus-4-20250514',
            stop_reason: 'end_turn',
            usage: {
              input_tokens: 100,
              output_tokens: 200,
            },
          })),
        },
      };
      // @ts-expect-error WHY: private field 테스트용 주입
      api.client = mockClient;

      // Act
      const result = await api.createMessage([{ role: 'user', content: 'Test metadata' }]);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.model).toBe('claude-opus-4-20250514');
        expect(result.value.metadata.inputTokens).toBe(100);
        expect(result.value.metadata.outputTokens).toBe(200);
        expect(result.value.metadata.stopReason).toBe('end_turn');
      }
    });
  });
});
