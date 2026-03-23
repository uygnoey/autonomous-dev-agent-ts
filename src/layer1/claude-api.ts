/**
 * Claude Messages API 호출 래퍼 / Claude Messages API wrapper
 *
 * @description
 * KR: Anthropic Claude Messages API를 래핑하여 스트리밍/비스트리밍 호출,
 *     AuthProvider 통합, 토큰 사용량 추적, 타임아웃 및 재시도 처리를 담당한다.
 * EN: Wraps Anthropic Claude Messages API for streaming/non-streaming calls,
 *     AuthProvider integration, token usage tracking, timeout and retry handling.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import type { AuthProvider } from 'auth/types.js';
import { type AgentError, DEFAULT_RETRY_POLICY, type RetryPolicy } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, ok } from 'core/types.js';
import {
  buildMetadata,
  extractTextContent,
  handleApiError,
  handleStreamEvent,
  withRetry,
} from 'layer1/claude-api-helpers.js';

export type {
  ClaudeApiRequestOptions,
  ClaudeApiResponseMetadata,
  ClaudeApiResponse,
  ClaudeStreamEvent,
  StreamCallback,
} from 'layer1/claude-api-types.js';
import type {
  ClaudeApiRequestOptions,
  ClaudeApiResponse,
  StreamCallback,
} from 'layer1/claude-api-types.js';

// ── 상수 ────────────────────────────────────────────────────

/** 기본 요청 타임아웃 (60초) / Default request timeout (60s) */
const DEFAULT_TIMEOUT_MS = 60_000;

/** 기본 모델 / Default model */
const DEFAULT_MODEL = 'claude-opus-4-20250514';

// ── ClaudeApi 클래스 ────────────────────────────────────────

/**
 * ClaudeApi 인터페이스 / ClaudeApi interface
 *
 * @description
 * KR: Claude Messages API 호출을 위한 인터페이스.
 * EN: Interface for Claude Messages API calls.
 */
export interface IClaudeApi {
  /**
   * 비스트리밍 메시지 생성 / Create a non-streaming message
   *
   * @param messages - 메시지 배열 / Message array
   * @param options - 요청 옵션 / Request options
   * @returns 성공 시 ClaudeApiResponse, 실패 시 AgentError
   */
  createMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: ClaudeApiRequestOptions,
  ): Promise<Result<ClaudeApiResponse, AgentError>>;

  /**
   * 스트리밍 메시지 생성 / Create a streaming message
   *
   * @param messages - 메시지 배열 / Message array
   * @param onEvent - 스트리밍 이벤트 콜백 / Streaming event callback
   * @param options - 요청 옵션 / Request options
   * @returns 성공 시 ok(void), 실패 시 AgentError
   */
  streamMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onEvent: StreamCallback,
    options?: ClaudeApiRequestOptions,
  ): Promise<Result<void, AgentError>>;
}

/**
 * Claude Messages API 래퍼 클래스 / Claude Messages API wrapper class
 *
 * @description
 * KR: Anthropic SDK를 래핑하여 스트리밍/비스트리밍 호출, 인증, 재시도, 토큰 추적을 제공한다.
 * EN: Wraps Anthropic SDK to provide streaming/non-streaming calls, auth, retry, and token tracking.
 *
 * @param authProvider - 인증 공급자 / Authentication provider
 * @param logger - 로거 인스턴스 / Logger instance
 * @param retryPolicy - 재시도 정책 (선택) / Retry policy (optional)
 *
 * @example
 * const api = new ClaudeApi(authProvider, logger);
 * const result = await api.createMessage([
 *   { role: 'user', content: 'Hello!' }
 * ], { maxTokens: 1024 });
 */
export class ClaudeApi implements IClaudeApi {
  private readonly logger: Logger;
  private readonly retryPolicy: RetryPolicy;
  private readonly client: Anthropic;

  constructor(
    private readonly authProvider: AuthProvider,
    logger: Logger,
    retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
  ) {
    this.logger = logger.child({ module: 'claude-api' });
    this.retryPolicy = retryPolicy;

    // WHY: baseURL과 apiKey는 Anthropic SDK 초기화 시 필요하지만,
    //      실제 인증은 요청마다 authProvider.getAuthHeader()로 처리한다.
    const headers = this.authProvider.getAuthHeader();
    const rawApiKey = headers['x-api-key'] as string | undefined;
    // WHY: OAuth 모드에서는 x-api-key가 없으므로 'sk-placeholder'를 사용하고
    //      defaultHeaders에서 x-api-key를 빈 값으로 덮어써 API 충돌을 방지한다.
    const apiKey = rawApiKey ?? 'sk-placeholder';
    const sdkHeaders = rawApiKey
      ? headers // API key mode: use headers as-is
      : { ...headers, 'x-api-key': '' }; // OAuth mode: clear x-api-key header

    this.client = new Anthropic({
      apiKey,
      // WHY: custom headers를 통해 OAuth 토큰도 지원
      defaultHeaders: sdkHeaders,
    });
  }

  /**
   * 비스트리밍 메시지 생성 / Create a non-streaming message
   *
   * @param messages - 메시지 배열 / Message array
   * @param options - 요청 옵션 / Request options
   * @returns 성공 시 ClaudeApiResponse, 실패 시 AgentError
   *
   * @example
   * const result = await api.createMessage(
   *   [{ role: 'user', content: 'What is 2+2?' }],
   *   { maxTokens: 100 }
   * );
   * if (result.ok) {
   *   console.log(result.value.content);
   * }
   */
  async createMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: ClaudeApiRequestOptions = {},
  ): Promise<Result<ClaudeApiResponse, AgentError>> {
    const model = options.model ?? DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? 4096;
    const temperature = options.temperature ?? 1.0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const params: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
      ...(options.system ? { system: options.system } : {}),
    };

    return withRetry(
      async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const response = await this.client.messages.create(params, {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          await this.updateRateLimitFromResponse(response);

          const content = extractTextContent(response);
          const metadata = buildMetadata(response);

          this.logger.info('메시지 생성 완료 / Message created', {
            model: metadata.model,
            inputTokens: metadata.inputTokens,
            outputTokens: metadata.outputTokens,
            stopReason: metadata.stopReason,
          });

          return ok({ content, metadata });
        } catch (error: unknown) {
          return handleApiError(error, 'createMessage', this.logger);
        }
      },
      this.retryPolicy,
      this.logger,
    );
  }

  /**
   * 스트리밍 메시지 생성 / Create a streaming message
   *
   * @param messages - 메시지 배열 / Message array
   * @param onEvent - 스트리밍 이벤트 콜백 / Streaming event callback
   * @param options - 요청 옵션 / Request options
   * @returns 성공 시 ok(void), 실패 시 AgentError
   *
   * @example
   * await api.streamMessage(
   *   [{ role: 'user', content: 'Tell me a story' }],
   *   (event) => {
   *     if (event.type === 'content_delta') {
   *       process.stdout.write(event.text);
   *     }
   *   }
   * );
   */
  async streamMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onEvent: StreamCallback,
    options: ClaudeApiRequestOptions = {},
  ): Promise<Result<void, AgentError>> {
    const model = options.model ?? DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? 4096;
    const temperature = options.temperature ?? 1.0;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const params: MessageCreateParamsStreaming = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
      stream: true,
      ...(options.system ? { system: options.system } : {}),
    };

    return withRetry(
      async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const stream = await this.client.messages.create(params, {
            signal: controller.signal,
          });

          let inputTokens = 0;
          let outputTokens = 0;

          for await (const event of stream) {
            handleStreamEvent(event, onEvent, (input, output) => {
              inputTokens = input;
              outputTokens = output;
            });
          }

          clearTimeout(timeoutId);

          this.logger.info('스트리밍 완료 / Streaming completed', {
            model,
            inputTokens,
            outputTokens,
          });

          return ok(undefined);
        } catch (error: unknown) {
          return handleApiError(error, 'streamMessage', this.logger);
        }
      },
      this.retryPolicy,
      this.logger,
    );
  }

  /**
   * 레이트 리밋 정보 업데이트 / Update rate limit info
   *
   * @param response - Claude API 응답 / Claude API response
   */
  private async updateRateLimitFromResponse(response: Message): Promise<void> {
    // WHY: Anthropic SDK는 응답 헤더를 직접 노출하지 않으므로,
    //      usage 정보를 authProvider에 전달하여 구독 추적을 지원한다.
    const responseBody = {
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };

    this.authProvider.updateFromResponse({}, responseBody);
  }
}
