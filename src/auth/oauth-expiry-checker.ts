/**
 * OAuth 만료 감지기 / OAuth expiry checker
 *
 * @description
 * KR: JWT 토큰의 exp 클레임을 파싱하여 만료 상태를 판단한다.
 *     파싱 불가한 토큰(opaque 토큰 등)은 낙관적으로 valid 처리한다.
 * EN: Parses JWT token exp claim to determine expiry status.
 *     Unparseable tokens (opaque tokens etc.) are optimistically treated as valid.
 */

import type { OAuthExpiryInfo, OAuthExpiryStatus } from 'auth/oauth-expiry-types.js';

// ── 상수 / Constants ──────────────────────────────────────────────

/** OAuth 만료 임박 경계 (일) / Days threshold for expiring_soon */
const EXPIRING_SOON_DAYS = 30;

/** 갱신 명령 / Renewal command */
const RENEWAL_COMMAND = 'claude setup-token';

/** 하루 밀리초 / Milliseconds per day */
const MS_PER_DAY = 1_000 * 60 * 60 * 24;

// ── OAuthExpiryChecker 구현 ───────────────────────────────────────

/**
 * OAuth 토큰 만료 감지기 / OAuth token expiry checker
 *
 * @description
 * KR: JWT 파싱 시도 후 만료 상태를 반환한다.
 *     JWT가 아닌 토큰은 에러 없이 valid 상태로 반환한다.
 * EN: Attempts JWT parsing and returns expiry status.
 *     Non-JWT tokens are returned as valid without errors.
 *
 * @example
 * const checker = new OAuthExpiryChecker();
 * const info = checker.check('eyJ...');
 * if (info.status === 'expired') {
 *   console.log('Token expired. Renew with:', info.renewalCommand);
 * }
 */
export class OAuthExpiryChecker {
  /**
   * nowFn 주입 (테스트용) / Injected now function (for testing)
   *
   * @param nowFn - 현재 시간 반환 함수 (기본: Date.now) / Function returning current time (default: Date.now)
   */
  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  /**
   * OAuth 토큰의 만료 정보를 파싱한다 / Parses OAuth token expiry information
   *
   * @param token - JWT 또는 opaque 토큰 문자열 / JWT or opaque token string
   * @returns 만료 정보. 파싱 불가 시 status='valid', expiresAt=null 반환 (에러 아님) /
   *          Expiry info. Returns status='valid', expiresAt=null if unparseable (not an error)
   *
   * @example
   * const info = checker.check('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OX0.xxx');
   * // { status: 'valid', expiresAt: Date, daysRemaining: 3000, renewalCommand: 'claude setup-token' }
   */
  check(token: string): OAuthExpiryInfo {
    const fallback: OAuthExpiryInfo = {
      status: 'valid',
      expiresAt: null,
      daysRemaining: null,
      renewalCommand: RENEWAL_COMMAND,
    };

    if (!token) {
      return fallback;
    }

    // JWT 파싱 시도: {header}.{payload}.{signature}
    const parts = token.split('.');
    if (parts.length !== 3) {
      return fallback;
    }

    try {
      const payloadB64 = parts[1] ?? '';
      // base64url → base64 변환
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const padding = (4 - (padded.length % 4)) % 4;
      const base64 = padded + '='.repeat(padding);

      const decoded = atob(base64);
      const payload: unknown = JSON.parse(decoded);

      if (typeof payload !== 'object' || payload === null) {
        return fallback;
      }

      const payloadObj = payload as Record<string, unknown>;

      if (typeof payloadObj.exp !== 'number') {
        // exp 클레임 없음 → 낙관적 valid 처리
        return fallback;
      }

      const expiresAt = new Date(payloadObj.exp * 1_000);
      const daysRemaining = Math.ceil((expiresAt.getTime() - this.nowFn()) / MS_PER_DAY);
      const status = this.resolveStatus(daysRemaining);

      return {
        status,
        expiresAt,
        daysRemaining,
        renewalCommand: RENEWAL_COMMAND,
      };
    } catch {
      // base64 파싱 실패, JSON 파싱 실패 등 → 낙관적 valid 처리
      return fallback;
    }
  }

  /**
   * 잔여 일수로 만료 상태를 결정한다 / Resolves expiry status from days remaining
   *
   * @param daysRemaining - 잔여 일수 (음수 = 이미 만료) / Days remaining (negative = already expired)
   * @returns 만료 상태 / Expiry status
   */
  private resolveStatus(daysRemaining: number): OAuthExpiryStatus {
    if (daysRemaining < 0) {
      return 'expired';
    }
    if (daysRemaining <= EXPIRING_SOON_DAYS) {
      return 'expiring_soon';
    }
    return 'valid';
  }
}
