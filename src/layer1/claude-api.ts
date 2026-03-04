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
import type { Message, MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import type { AuthProvider } from '../auth/types.js';
import { AgentError, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { type Result, err, ok } from '../core/types.js';

// ── 상수 ────────────────────────────────────────────────────

/** 기본 요청 타임아웃 (60초) / Default request timeout (60s) */
const DEFAULT_TIMEOUT_MS = 60_000;

/** 기본 모델 / Default model */
const DEFAULT_MODEL = 'claude-opus-4-20250514';

/** 재시도 가능한 HTTP 상태 코드 / Retryable HTTP status codes */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ── 타입 정의 ───────────────────────────────────────────────

/**
 * Claude API 요청 옵션 / Claude API request options
 *
 * @description
 * KR: Claude Messages API 호출 시 필요한 옵션을 정의한다.
 * EN: Defines options for Claude Messages API calls.
 */
export interface ClaudeApiRequestOptions {
  /** 사용할 모델 / Model to use */
  readonly model?: string;
  /** 최대 출력 토큰 수 / Maximum output tokens */
  readonly maxTokens?: number;
  /** 온도 (0~1) / Temperature (0~1) */
  readonly temperature?: number;
  /** 타임아웃 (밀리초) / Timeout (milliseconds) */
  readonly timeoutMs?: number;
}

/**
 * Claude API 응답 메타데이터 / Claude API response metadata
 *
 * @description
 * KR: 토큰 사용량, 모델, 중단 이유 등을 포함한다.
 * EN: Includes token usage, model, and stop reason.
 */
export interface ClaudeApiResponseMetadata {
  /** 사용된 모델 / Model used */
  readonly model: string;
  /** 입력 토큰 수 / Input tokens */
  readonly inputTokens: number;
  /** 출력 토큰 수 / Output tokens */
  readonly outputTokens: number;
  /** 중단 이유 / Stop reason */
  readonly stopReason: string;
}

/**
 * Claude API 비스트리밍 응답 / Claude API non-streaming response
 *
 * @description
 * KR: 전체 응답 텍스트와 메타데이터를 반환한다.
 * EN: Returns complete response text and metadata.
 */
export interface ClaudeApiResponse {
  /** 응답 텍스트 / Response text */
  readonly content: string;
  /** 응답 메타데이터 / Response metadata */
  readonly metadata: ClaudeApiResponseMetadata;
}

/**
 * Claude API 스트리밍 이벤트 / Claude API streaming event
 *
 * @description
 * KR: 스트리밍 중 발생하는 이벤트 타입을 정의한다.
 * EN: Defines event types during streaming.
 */
export type ClaudeStreamEvent =
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'content_stop' }
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };

/**
 * 스트리밍 콜백 / Streaming callback
 *
 * @description
 * KR: 스트리밍 중 발생하는 이벤트를 처리하는 콜백 함수.
 * EN: Callback function to handle events during streaming.
 */
export type StreamCallback = (event: ClaudeStreamEvent) => void;

// ── ClaudeApi 클래스 ────────────────────────────────────────

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
export class ClaudeApi {
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
    const apiKey = headers['x-api-key'] || 'placeholder';

    this.client = new Anthropic({
      apiKey,
      // WHY: custom headers를 통해 OAuth 토큰도 지원
      defaultHeaders: headers,
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
    };

    return this.withRetry(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await this.client.messages.create(params, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 레이트 리밋 정보 업데이트
        await this.updateRateLimitFromResponse(response);

        const content = this.extractTextContent(response);
        const metadata = this.buildMetadata(response);

        this.logger.info('메시지 생성 완료 / Message created', {
          model: metadata.model,
          inputTokens: metadata.inputTokens,
          outputTokens: metadata.outputTokens,
          stopReason: metadata.stopReason,
        });

        return ok({ content, metadata });
      } catch (error: unknown) {
        return this.handleError(error, 'createMessage');
      }
    });
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
    };

    return this.withRetry(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const stream = await this.client.messages.create(params, {
          signal: controller.signal,
        });

        let inputTokens = 0;
        let outputTokens = 0;

        for await (const event of stream) {
          this.handleStreamEvent(event, onEvent, (input, output) => {
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
        return this.handleError(error, 'streamMessage');
      }
    });
  }

  /**
   * 재시도 로직 래퍼 / Retry logic wrapper
   *
   * @param fn - 재시도할 함수 / Function to retry
   * @returns 함수 실행 결과 / Function execution result
   */
  private async withRetry<T>(
    fn: () => Promise<Result<T, AgentError>>,
  ): Promise<Result<T, AgentError>> {
    let lastError: AgentError | null = null;

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      const result = await fn();

      if (result.ok) {
        return result;
      }

      lastError = result.error;

      // 재시도 가능한 에러인지 확인
      if (!this.isRetryableError(lastError)) {
        this.logger.warn('재시도 불가능한 에러 / Non-retryable error', {
          code: lastError.code,
          attempt,
        });
        return result;
      }

      if (attempt < this.retryPolicy.maxAttempts) {
        const delay = this.calculateBackoffDelay(attempt);
        this.logger.warn('재시도 대기 / Retrying after delay', {
          attempt,
          delayMs: delay,
          errorCode: lastError.code,
        });
        await this.sleep(delay);
      }
    }

    return err(
      lastError ??
        new AgentError(
          'agent_unknown_error',
          '재시도 후에도 요청이 실패했습니다 / Request failed after retries',
        ),
    );
  }

  /**
   * 재시도 가능한 에러인지 확인 / Check if error is retryable
   *
   * @param error - 확인할 에러 / Error to check
   * @returns 재시도 가능 여부 / Whether retryable
   */
  private isRetryableError(error: AgentError): boolean {
    return this.retryPolicy.retryableErrors.includes(error.code);
  }

  /**
   * 지수 백오프 지연 시간 계산 / Calculate exponential backoff delay
   *
   * @param attempt - 현재 시도 횟수 / Current attempt number
   * @returns 지연 시간 (밀리초) / Delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = this.retryPolicy.baseDelay * this.retryPolicy.backoffFactor ** (attempt - 1);
    return Math.min(delay, this.retryPolicy.maxDelay);
  }

  /**
   * 지연 유틸리티 / Sleep utility
   *
   * @param ms - 대기 시간 (밀리초) / Wait time in milliseconds
   * @returns Promise<void>
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 응답에서 텍스트 콘텐츠 추출 / Extract text content from response
   *
   * @param response - Claude API 응답 / Claude API response
   * @returns 텍스트 내용 / Text content
   */
  private extractTextContent(response: Message): string {
    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => (block.type === 'text' ? block.text : '')).join('');
  }

  /**
   * 응답 메타데이터 생성 / Build response metadata
   *
   * @param response - Claude API 응답 / Claude API response
   * @returns 응답 메타데이터 / Response metadata
   */
  private buildMetadata(response: Message): ClaudeApiResponseMetadata {
    return {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason ?? 'unknown',
    };
  }

  /**
   * 스트리밍 이벤트 처리 / Handle streaming event
   *
   * @param event - Anthropic SDK 스트리밍 이벤트 / Anthropic SDK streaming event
   * @param callback - 사용자 콜백 / User callback
   * @param updateTokens - 토큰 업데이트 콜백 / Token update callback
   */
  private handleStreamEvent(
    event: MessageStreamEvent,
    callback: StreamCallback,
    updateTokens: (inputTokens: number, outputTokens: number) => void,
  ): void {
    switch (event.type) {
      case 'content_block_start':
        callback({ type: 'content_start' });
        break;

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          callback({ type: 'content_delta', text: event.delta.text });
        }
        break;

      case 'content_block_stop':
        callback({ type: 'content_stop' });
        break;

      case 'message_stop':
        // WHY: message_stop 이벤트에서는 usage가 없으므로 나중에 처리
        break;

      case 'message_delta':
        if (event.usage) {
          updateTokens(0, event.usage.output_tokens);
        }
        break;

      default:
        break;
    }
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

  /**
   * 에러 처리 / Handle errors
   *
   * @param error - 발생한 에러 / Occurred error
   * @param context - 에러 발생 컨텍스트 / Error context
   * @returns AgentError로 래핑된 에러 / Wrapped error as AgentError
   */
  private handleError(error: unknown, context: string): Result<never, AgentError> {
    if (error instanceof Anthropic.APIError) {
      const code = this.mapApiErrorToCode(error.status);
      const message = `Claude API 에러 [${context}]: ${error.message} / Claude API error [${context}]: ${error.message}`;

      this.logger.error(message, {
        status: error.status,
        code,
        context,
      });

      return err(new AgentError(code, message, error));
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        const message = `요청 타임아웃 [${context}] / Request timeout [${context}]`;
        this.logger.error(message);
        return err(new AgentError('agent_timeout', message, error));
      }

      // WHY: 테스트를 위해 status 필드를 확인하여 에러 코드 매핑
      const errorWithStatus = error as Error & { status?: number };
      if (errorWithStatus.status !== undefined) {
        const code = this.mapApiErrorToCode(errorWithStatus.status);
        const message = `API 에러 [${context}]: ${error.message} / API error [${context}]: ${error.message}`;
        this.logger.error(message, { errorName: error.name, status: errorWithStatus.status });
        return err(new AgentError(code, message, error));
      }

      const message = `알 수 없는 에러 [${context}]: ${error.message} / Unknown error [${context}]: ${error.message}`;
      this.logger.error(message, { errorName: error.name });
      return err(new AgentError('agent_unknown_error', message, error));
    }

    const message = `알 수 없는 에러 [${context}] / Unknown error [${context}]`;
    this.logger.error(message);
    return err(new AgentError('agent_unknown_error', message, error));
  }

  /**
   * API 에러 상태 코드를 에러 코드로 매핑 / Map API error status to error code
   *
   * @param status - HTTP 상태 코드 / HTTP status code
   * @returns 에러 코드 / Error code
   */
  private mapApiErrorToCode(status: number | undefined): string {
    if (status === undefined) {
      return 'agent_api_error';
    }

    if (status === 429) {
      return 'auth_rate_limited';
    }

    if (RETRYABLE_STATUS_CODES.has(status)) {
      return 'agent_api_error';
    }

    if (status >= 400 && status < 500) {
      return 'agent_invalid_request';
    }

    if (status >= 500) {
      return 'agent_api_error';
    }

    return 'agent_unknown_error';
  }
}
