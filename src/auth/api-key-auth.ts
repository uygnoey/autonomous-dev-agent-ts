/**
 * API Key 인증 공급자 / API Key authentication provider
 *
 * @description
 * KR: ANTHROPIC_API_KEY 기반 인증을 구현한다.
 *     x-api-key 헤더 생성, anthropic-ratelimit-* 응답 헤더 파싱,
 *     429 retry-after 처리를 담당한다.
 * EN: Implements ANTHROPIC_API_KEY based authentication.
 *     Generates x-api-key headers, parses anthropic-ratelimit-* response headers,
 *     and handles 429 retry-after responses.
 */

import type { AuthMode } from '../core/config.js';
import type { Logger } from '../core/logger.js';
import { ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { AuthProvider, RateLimitStatus } from './types.js';

// ── 상수 ────────────────────────────────────────────────────

/** Anthropic API 버전 헤더 값 / Anthropic API version header value */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * 한도 접근 경고 임계값 (20%) / Limit approaching threshold (20%)
 *
 * WHY: 잔여량이 추정 총량의 20% 이하일 때 경고하여 사전 대응 가능하게 한다.
 */
const LIMIT_APPROACHING_THRESHOLD = 0.2;

/** 레이트 리밋 헤더 키 / Rate limit header keys */
const HEADER_REQUESTS_REMAINING = 'anthropic-ratelimit-requests-remaining';
const HEADER_INPUT_TOKENS_REMAINING = 'anthropic-ratelimit-input-tokens-remaining';
const HEADER_OUTPUT_TOKENS_REMAINING = 'anthropic-ratelimit-output-tokens-remaining';
const HEADER_REQUESTS_LIMIT = 'anthropic-ratelimit-requests-limit';
const HEADER_INPUT_TOKENS_LIMIT = 'anthropic-ratelimit-input-tokens-limit';
const HEADER_OUTPUT_TOKENS_LIMIT = 'anthropic-ratelimit-output-tokens-limit';
const HEADER_RETRY_AFTER = 'retry-after';

// ── ApiKeyAuth 구현 ─────────────────────────────────────────

/**
 * API Key 기반 인증 공급자 / API Key based authentication provider
 *
 * @param apiKey - Anthropic API 키 / Anthropic API key
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const auth = new ApiKeyAuth('sk-ant-api01-...', logger);
 * const headers = auth.getAuthHeader();
 * // { 'x-api-key': 'sk-ant-api01-...', 'anthropic-version': '2023-06-01' }
 */
export class ApiKeyAuth implements AuthProvider {
  readonly authMode: AuthMode = 'api-key';

  private requestsRemaining: number | null = null;
  private inputTokensRemaining: number | null = null;
  private outputTokensRemaining: number | null = null;
  private retryAfterSeconds: number | null = null;
  private requestsLimit: number | null = null;
  private inputTokensLimit: number | null = null;
  private outputTokensLimit: number | null = null;

  private readonly logger: Logger;

  constructor(
    private readonly apiKey: string,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'api-key-auth' });
  }

  /**
   * API Key 인증 헤더를 반환한다 / Returns API key authentication headers
   *
   * @returns x-api-key와 anthropic-version 헤더 / x-api-key and anthropic-version headers
   */
  getAuthHeader(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  /**
   * 현재 레이트 리밋 상태를 반환한다 / Returns current rate limit status
   *
   * @returns 레이트 리밋 스냅샷 / Rate limit snapshot
   */
  getRateLimitStatus(): RateLimitStatus {
    return {
      requestsRemaining: this.requestsRemaining,
      inputTokensRemaining: this.inputTokensRemaining,
      outputTokensRemaining: this.outputTokensRemaining,
      retryAfterSeconds: this.retryAfterSeconds,
      isLimitApproaching: this.computeIsLimitApproaching(),
    };
  }

  /**
   * API 응답 헤더에서 레이트 리밋 정보를 갱신한다 / Updates rate limit info from response headers
   *
   * @param responseHeaders - HTTP 응답 헤더 / HTTP response headers
   * @returns 항상 ok(void) — 파싱 불가 값은 무시한다 / Always ok(void) — unparseable values are ignored
   */
  updateFromResponse(responseHeaders: Record<string, string>): Result<void> {
    this.requestsRemaining = this.parseNumericHeader(responseHeaders, HEADER_REQUESTS_REMAINING);
    this.inputTokensRemaining = this.parseNumericHeader(
      responseHeaders,
      HEADER_INPUT_TOKENS_REMAINING,
    );
    this.outputTokensRemaining = this.parseNumericHeader(
      responseHeaders,
      HEADER_OUTPUT_TOKENS_REMAINING,
    );
    this.requestsLimit = this.parseNumericHeader(responseHeaders, HEADER_REQUESTS_LIMIT);
    this.inputTokensLimit = this.parseNumericHeader(responseHeaders, HEADER_INPUT_TOKENS_LIMIT);
    this.outputTokensLimit = this.parseNumericHeader(responseHeaders, HEADER_OUTPUT_TOKENS_LIMIT);
    this.retryAfterSeconds = this.parseNumericHeader(responseHeaders, HEADER_RETRY_AFTER);

    if (this.retryAfterSeconds !== null) {
      this.logger.warn('레이트 리밋 429 응답 수신 / Rate limited (429)', {
        retryAfterSeconds: this.retryAfterSeconds,
      });
    }

    if (this.computeIsLimitApproaching()) {
      this.logger.warn('레이트 리밋 접근 중 / Rate limit approaching', {
        requestsRemaining: this.requestsRemaining,
        inputTokensRemaining: this.inputTokensRemaining,
        outputTokensRemaining: this.outputTokensRemaining,
      });
    }

    return ok(undefined);
  }

  /**
   * 한도 접근 여부를 계산한다 / Computes whether rate limit is approaching
   *
   * WHY: 잔여량이 총 한도의 20% 이하이면 true 반환.
   *      한도 정보가 없으면 false (보수적 판단).
   */
  private computeIsLimitApproaching(): boolean {
    return (
      this.isFieldApproachingLimit(this.requestsRemaining, this.requestsLimit) ||
      this.isFieldApproachingLimit(this.inputTokensRemaining, this.inputTokensLimit) ||
      this.isFieldApproachingLimit(this.outputTokensRemaining, this.outputTokensLimit)
    );
  }

  /**
   * 특정 필드의 한도 접근 여부를 판단한다 / Checks if a specific field is approaching its limit
   *
   * @param remaining - 잔여량 / Remaining amount
   * @param limit - 총 한도 / Total limit
   * @returns 한도 접근 시 true / true if approaching limit
   */
  private isFieldApproachingLimit(remaining: number | null, limit: number | null): boolean {
    if (remaining === null || limit === null || limit <= 0) {
      return false;
    }
    return remaining <= limit * LIMIT_APPROACHING_THRESHOLD;
  }

  /**
   * 헤더에서 숫자 값을 파싱한다 / Parses a numeric value from headers
   *
   * @param headers - HTTP 헤더 객체 / HTTP headers object
   * @param key - 파싱할 헤더 키 / Header key to parse
   * @returns 파싱된 숫자 또는 null / Parsed number or null
   */
  private parseNumericHeader(headers: Record<string, string>, key: string): number | null {
    const value = headers[key];
    if (value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }
}
