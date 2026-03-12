/**
 * Subscription(OAuth) 인증 공급자 / Subscription(OAuth) authentication provider
 *
 * @description
 * KR: CLAUDE_CODE_OAUTH_TOKEN 기반 인증을 구현한다.
 *     Bearer 토큰 헤더 생성, 응답 본문에서 사용량 추적,
 *     5시간 롤링 윈도우 기반 구독 한도 추정을 담당한다.
 * EN: Implements CLAUDE_CODE_OAUTH_TOKEN based authentication.
 *     Generates Bearer token headers, tracks usage from response body,
 *     and estimates subscription limits using a 5-hour rolling window.
 */

import { OAuthExpiryChecker } from 'auth/oauth-expiry-checker.js';
import type { OAuthExpiryInfo } from 'auth/oauth-expiry-types.js';
import type { AuthProvider, RateLimitStatus } from 'auth/types.js';
import type { AuthMode } from 'core/config.js';
import type { Logger } from 'core/logger.js';
import { ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 상수 ────────────────────────────────────────────────────

/** Anthropic API 버전 헤더 값 / Anthropic API version header value */
const ANTHROPIC_VERSION = '2023-06-01';

/** 5시간 롤링 윈도우 (밀리초) / 5-hour rolling window in milliseconds */
const ROLLING_WINDOW_MS = 5 * 60 * 60 * 1_000;

/**
 * 구독 플랜별 추정 메시지 한도 (5시간당) / Estimated message limits per subscription plan (per 5h)
 *
 * WHY: Anthropic은 구독 플랜별 정확한 한도를 API로 제공하지 않으므로
 *      공개된 추정치를 사용한다.
 */
const ESTIMATED_LIMITS = {
  pro: 45,
  max5x: 225,
  max20x: 900,
} as const;

/** 기본 추정 한도 (Pro 플랜 기준) / Default estimated limit (Pro plan) */
const DEFAULT_ESTIMATED_LIMIT = ESTIMATED_LIMITS.pro;

/** 한도 접근 경고 임계값 (80%) / Limit approaching threshold (80%) */
const LIMIT_APPROACHING_THRESHOLD = 0.8;

// ── 사용량 기록 ─────────────────────────────────────────────

/**
 * 개별 사용량 기록 / Individual usage record
 *
 * @description
 * KR: 한 번의 API 호출에서 소비된 토큰 수와 타임스탬프를 기록한다.
 * EN: Records token consumption and timestamp from a single API call.
 */
interface UsageEntry {
  readonly timestamp: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// ── SubscriptionAuth 구현 ──────────────────────────────────

/**
 * OAuth 토큰 기반 구독 인증 공급자 / OAuth token based subscription authentication provider
 *
 * @param oauthToken - Claude Code OAuth 토큰 / Claude Code OAuth token
 * @param logger - 로거 인스턴스 / Logger instance
 * @param estimatedLimit - 5시간당 추정 메시지 한도 (기본: Pro 45) / Estimated messages per 5h (default: Pro 45)
 * @param nowFn - 현재 시간 함수 (테스트용) / Current time function (for testing)
 *
 * @example
 * const auth = new SubscriptionAuth('sk-ant-oat01-...', logger);
 * const headers = auth.getAuthHeader();
 * // { 'authorization': 'Bearer sk-ant-oat01-...', 'anthropic-version': '2023-06-01' }
 */
export class SubscriptionAuth implements AuthProvider {
  readonly authMode: AuthMode = 'oauth-token';

  private readonly usageHistory: UsageEntry[] = [];
  private readonly logger: Logger;
  private readonly estimatedLimit: number;
  private readonly nowFn: () => number;
  private readonly expiryChecker: OAuthExpiryChecker;

  constructor(
    private readonly oauthToken: string,
    logger: Logger,
    estimatedLimit: number = DEFAULT_ESTIMATED_LIMIT,
    nowFn: () => number = () => Date.now(),
    expiryChecker?: OAuthExpiryChecker,
  ) {
    this.logger = logger.child({ module: 'subscription-auth' });
    this.estimatedLimit = estimatedLimit;
    this.nowFn = nowFn;
    // WHY: 선택 주입 — 테스트 시 커스텀 checker 주입 가능, 미주입 시 내부 생성
    this.expiryChecker = expiryChecker ?? new OAuthExpiryChecker(nowFn);
  }

  /**
   * Bearer 토큰 인증 헤더를 반환한다 / Returns Bearer token authentication headers
   *
   * @returns authorization과 anthropic-version 헤더 / authorization and anthropic-version headers
   */
  getAuthHeader(): Record<string, string> {
    return {
      authorization: `Bearer ${this.oauthToken}`,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  /**
   * 현재 레이트 리밋 상태를 반환한다 / Returns current rate limit status
   *
   * @returns 레이트 리밋 스냅샷 (구독 기반 추정) / Rate limit snapshot (subscription-based estimate)
   */
  getRateLimitStatus(): RateLimitStatus {
    this.pruneExpiredEntries();

    const messageCount = this.usageHistory.length;
    const remaining = Math.max(0, this.estimatedLimit - messageCount);

    return {
      requestsRemaining: remaining,
      inputTokensRemaining: null,
      outputTokensRemaining: null,
      retryAfterSeconds: null,
      requestsLimit: this.estimatedLimit,
      isLimitApproaching: messageCount >= this.estimatedLimit * LIMIT_APPROACHING_THRESHOLD,
    };
  }

  /**
   * API 응답 본문에서 사용량 정보를 추출하여 기록한다 / Extracts usage info from response body and records it
   *
   * @param _responseHeaders - HTTP 응답 헤더 (구독 인증에서는 미사용) / HTTP response headers (unused for subscription auth)
   * @param responseBody - HTTP 응답 본문 / HTTP response body
   * @returns 항상 ok(void) — 파싱 불가 값은 무시한다 / Always ok(void) — unparseable values are ignored
   */
  updateFromResponse(
    _responseHeaders: Record<string, string>,
    responseBody?: unknown,
  ): Result<void> {
    if (!isUsageResponseBody(responseBody)) {
      return ok(undefined);
    }

    const usage = responseBody.usage;
    const inputTokens =
      typeof usage.input_tokens === 'number' && usage.input_tokens >= 0 ? usage.input_tokens : 0;
    const outputTokens =
      typeof usage.output_tokens === 'number' && usage.output_tokens >= 0 ? usage.output_tokens : 0;

    this.usageHistory.push({
      timestamp: this.nowFn(),
      inputTokens,
      outputTokens,
    });

    this.pruneExpiredEntries();

    const messageCount = this.usageHistory.length;
    if (messageCount >= this.estimatedLimit * LIMIT_APPROACHING_THRESHOLD) {
      this.logger.warn('구독 사용량 한도 접근 중 / Subscription usage limit approaching', {
        messageCount,
        estimatedLimit: this.estimatedLimit,
        usagePercent: Math.round((messageCount / this.estimatedLimit) * 100),
      });
    }

    return ok(undefined);
  }

  /**
   * OAuth 토큰이 만료되었는지 확인한다 / Checks whether the OAuth token is expired
   *
   * @param token - 확인할 토큰 / Token to check
   * @returns 만료 시 true, 유효하거나 판단 불가 시 false / true if expired, false if valid or undeterminable
   *
   * @example
   * if (auth.isTokenExpired(token)) {
   *   console.log('토큰 만료됨 / Token expired');
   * }
   */
  isTokenExpired(token: string): boolean {
    return this.expiryChecker.check(token).status === 'expired';
  }

  /**
   * OAuth 토큰의 만료 정보를 반환한다 / Returns expiry information for the OAuth token
   *
   * @param token - 확인할 토큰 / Token to check
   * @returns 만료 정보 스냅샷 / Expiry info snapshot
   *
   * @example
   * const info = auth.getExpiryInfo(token);
   * if (info.status === 'expiring_soon') {
   *   console.log(`${info.daysRemaining}일 후 만료 / Expires in ${info.daysRemaining} days`);
   * }
   */
  getExpiryInfo(token: string): OAuthExpiryInfo {
    return this.expiryChecker.check(token);
  }

  /**
   * 5시간 윈도우를 초과한 사용량 기록을 제거한다 / Prunes usage entries older than 5-hour window
   *
   * WHY: 롤링 윈도우 방식이므로 오래된 기록을 제거해야 정확한 잔여량 산출 가능.
   */
  private pruneExpiredEntries(): void {
    const cutoff = this.nowFn() - ROLLING_WINDOW_MS;
    // WHY: splice(0, index)로 앞에서부터 제거 — 시간 순서 보장
    let pruneCount = 0;
    for (const entry of this.usageHistory) {
      if (entry.timestamp >= cutoff) {
        break;
      }
      pruneCount++;
    }
    if (pruneCount > 0) {
      this.usageHistory.splice(0, pruneCount);
    }
  }
}

// ── 타입 가드 ───────────────────────────────────────────────

/**
 * 응답 본문에 usage 필드가 있는지 확인하는 타입 가드 / Type guard for response body with usage field
 *
 * @param body - 검사할 응답 본문 / Response body to check
 * @returns usage 필드가 있으면 true / true if body has usage field
 */
function isUsageResponseBody(
  body: unknown,
): body is { usage: { input_tokens: unknown; output_tokens: unknown } } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.usage !== 'object' || obj.usage === null) {
    return false;
  }
  return true;
}
