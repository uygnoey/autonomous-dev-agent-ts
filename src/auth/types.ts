/**
 * auth 모듈 타입 정의 / Auth module type definitions
 *
 * @description
 * KR: 인증 공급자, 레이트 리밋 상태, 자격 증명 인터페이스를 정의한다.
 * EN: Defines AuthProvider, RateLimitStatus, and Credential interfaces.
 */

import type { AuthMode } from '../core/config.js';
import type { Result } from '../core/types.js';

// ── 레이트 리밋 상태 ────────────────────────────────────────

/**
 * API 레이트 리밋 현황 / Rate limit status snapshot
 *
 * @description
 * KR: 현재 잔여 요청 수, 토큰 수, 재시도 대기 시간 등을 담는다.
 * EN: Holds remaining requests, tokens, retry-after delay, and limit warning flag.
 */
export interface RateLimitStatus {
  /** 잔여 요청 수 (unknown 시 null) / Remaining requests (null if unknown) */
  readonly requestsRemaining: number | null;
  /** 잔여 입력 토큰 수 (unknown 시 null) / Remaining input tokens (null if unknown) */
  readonly inputTokensRemaining: number | null;
  /** 잔여 출력 토큰 수 (unknown 시 null) / Remaining output tokens (null if unknown) */
  readonly outputTokensRemaining: number | null;
  /** 429 응답 시 재시도 대기 초 (null 시 해당 없음) / Retry-after seconds on 429 (null if N/A) */
  readonly retryAfterSeconds: number | null;
  /** 한도 접근 경고 플래그 / Warning flag when approaching rate limit */
  readonly isLimitApproaching: boolean;
}

// ── 자격 증명 ───────────────────────────────────────────────

/**
 * 인증 자격 증명 / Authentication credential
 *
 * @description
 * KR: 인증 방식과 토큰/키 값을 담는 불변 객체.
 * EN: Immutable object holding auth mode and credential value.
 */
export interface Credential {
  /** 인증 방식 / Authentication mode */
  readonly authMode: AuthMode;
  /** 토큰 또는 API 키 값 / Token or API key value */
  readonly value: string;
}

// ── 인증 공급자 인터페이스 ──────────────────────────────────

/**
 * 인증 공급자 추상화 / Authentication provider abstraction
 *
 * @description
 * KR: API Key 또는 OAuth Token 방식의 인증을 추상화한다.
 *     HTTP 헤더 생성, 레이트 리밋 추적, 응답 헤더 파싱을 제공한다.
 * EN: Abstracts API Key or OAuth Token authentication.
 *     Provides HTTP header generation, rate limit tracking, and response header parsing.
 */
export interface AuthProvider {
  /** 현재 인증 방식 / Current authentication mode */
  readonly authMode: AuthMode;

  /**
   * 인증 HTTP 헤더를 반환한다 / Returns authentication HTTP headers
   *
   * @returns API 요청에 포함할 헤더 객체 / Header object for API requests
   */
  getAuthHeader(): Record<string, string>;

  /**
   * 현재 레이트 리밋 상태를 반환한다 / Returns current rate limit status
   *
   * @returns 레이트 리밋 스냅샷 / Rate limit snapshot
   */
  getRateLimitStatus(): RateLimitStatus;

  /**
   * API 응답에서 레이트 리밋 정보를 갱신한다 / Updates rate limit info from API response
   *
   * @param responseHeaders - HTTP 응답 헤더 / HTTP response headers
   * @param responseBody - HTTP 응답 본문 (선택) / HTTP response body (optional)
   * @returns 성공 시 ok(void), 파싱 실패 시 err / ok(void) on success, err on parse failure
   */
  updateFromResponse(responseHeaders: Record<string, string>, responseBody?: unknown): Result<void>;
}
