/**
 * Claude API 헬퍼 함수 / Claude API helper functions
 *
 * @description
 * KR: ClaudeApi 클래스에서 분리된 순수 함수 헬퍼들 — 재시도, 에러 처리, 스트림 이벤트 처리.
 * EN: Pure function helpers extracted from ClaudeApi — retry, error handling, stream event processing.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import { AgentError, type RetryPolicy } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { ClaudeApiResponseMetadata, ClaudeStreamEvent, StreamCallback } from 'layer1/claude-api-types.js';

/** 재시도 가능한 HTTP 상태 코드 / Retryable HTTP status codes */
export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * 재시도 로직 래퍼 / Retry logic wrapper
 *
 * @param fn - 재시도할 함수 / Function to retry
 * @param retryPolicy - 재시도 정책 / Retry policy
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 함수 실행 결과 / Function execution result
 */
export async function withRetry<T>(
  fn: () => Promise<Result<T, AgentError>>,
  retryPolicy: RetryPolicy,
  logger: Logger,
): Promise<Result<T, AgentError>> {
  let lastError: AgentError | null = null;

  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
    const result = await fn();

    if (result.ok) {
      return result;
    }

    lastError = result.error;

    if (!retryPolicy.retryableErrors.includes(lastError.code)) {
      logger.warn('재시도 불가능한 에러 / Non-retryable error', {
        code: lastError.code,
        attempt,
      });
      return result;
    }

    if (attempt < retryPolicy.maxAttempts) {
      const delay = calculateBackoffDelay(attempt, retryPolicy);
      logger.warn('재시도 대기 / Retrying after delay', {
        attempt,
        delayMs: delay,
        errorCode: lastError.code,
      });
      await sleep(delay);
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
 * 지수 백오프 지연 시간 계산 / Calculate exponential backoff delay
 *
 * @param attempt - 현재 시도 횟수 / Current attempt number
 * @param retryPolicy - 재시도 정책 / Retry policy
 * @returns 지연 시간 (밀리초) / Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, retryPolicy: RetryPolicy): number {
  const delay = retryPolicy.baseDelay * retryPolicy.backoffFactor ** (attempt - 1);
  return Math.min(delay, retryPolicy.maxDelay);
}

/**
 * 지연 유틸리티 / Sleep utility
 *
 * @param ms - 대기 시간 (밀리초) / Wait time in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 응답에서 텍스트 콘텐츠 추출 / Extract text content from response
 *
 * @param response - Claude API 응답 / Claude API response
 * @returns 텍스트 내용 / Text content
 */
export function extractTextContent(response: Message): string {
  const textBlocks = response.content.filter((block) => block.type === 'text');
  return textBlocks.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

/**
 * 응답 메타데이터 생성 / Build response metadata
 *
 * @param response - Claude API 응답 / Claude API response
 * @returns 응답 메타데이터 / Response metadata
 */
export function buildMetadata(response: Message): ClaudeApiResponseMetadata {
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
export function handleStreamEvent(
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
 * API 에러 상태 코드를 에러 코드로 매핑 / Map API error status to error code
 *
 * @param status - HTTP 상태 코드 / HTTP status code
 * @returns 에러 코드 / Error code
 */
export function mapApiErrorToCode(status: number | undefined): string {
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

/**
 * 에러 처리 / Handle errors
 *
 * @param error - 발생한 에러 / Occurred error
 * @param context - 에러 발생 컨텍스트 / Error context
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns AgentError로 래핑된 에러 / Wrapped error as AgentError
 */
export function handleApiError(error: unknown, context: string, logger: Logger): Result<never, AgentError> {
  if (error instanceof Anthropic.APIError) {
    const code = mapApiErrorToCode(error.status);
    const message = `Claude API 에러 [${context}]: ${error.message} / Claude API error [${context}]: ${error.message}`;

    logger.error(message, {
      status: error.status,
      code,
      context,
    });

    return err(new AgentError(code, message, error));
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      const message = `요청 타임아웃 [${context}] / Request timeout [${context}]`;
      logger.error(message);
      return err(new AgentError('agent_timeout', message, error));
    }

    // WHY: 테스트를 위해 status 필드를 확인하여 에러 코드 매핑
    const errorWithStatus = error as Error & { status?: number };
    if (errorWithStatus.status !== undefined) {
      const code = mapApiErrorToCode(errorWithStatus.status);
      const message = `API 에러 [${context}]: ${error.message} / API error [${context}]: ${error.message}`;
      logger.error(message, { errorName: error.name, status: errorWithStatus.status });
      return err(new AgentError(code, message, error));
    }

    const message = `알 수 없는 에러 [${context}]: ${error.message} / Unknown error [${context}]: ${error.message}`;
    logger.error(message, { errorName: error.name });
    return err(new AgentError('agent_unknown_error', message, error));
  }

  const message = `알 수 없는 에러 [${context}] / Unknown error [${context}]`;
  logger.error(message);
  return err(new AgentError('agent_unknown_error', message, error));
}
