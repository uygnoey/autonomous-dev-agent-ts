/**
 * OAuth 만료 상태 타입 정의 / OAuth expiry status type definitions
 *
 * @description
 * KR: OAuth 토큰의 만료 상태와 만료 정보를 정의한다.
 * EN: Defines OAuth token expiry status and expiry information types.
 */

// ── 만료 상태 / Expiry status ─────────────────────────────────────

/**
 * OAuth 토큰 만료 상태 / OAuth token expiry status
 *
 * @description
 * KR: valid = 정상, expiring_soon = 30일 이내 만료, expired = 이미 만료
 * EN: valid = normal, expiring_soon = expires within 30 days, expired = already expired
 */
export type OAuthExpiryStatus = 'valid' | 'expiring_soon' | 'expired';

// ── 만료 정보 인터페이스 / Expiry info interface ───────────────────

/**
 * OAuth 토큰 만료 정보 / OAuth token expiry information
 *
 * @description
 * KR: JWT 파싱 결과 기반 만료 상태 스냅샷.
 *     파싱 불가한 토큰은 status='valid', expiresAt=null 로 낙관적 처리.
 * EN: Expiry status snapshot based on JWT parsing result.
 *     Unparseable tokens are optimistically treated as valid with null expiresAt.
 */
export interface OAuthExpiryInfo {
  /** 만료 상태 / Expiry status */
  readonly status: OAuthExpiryStatus;
  /** 만료 일시 (JWT exp 파싱 성공 시), 파싱 불가 시 null / Expiry datetime (if JWT exp parsed), null otherwise */
  readonly expiresAt: Date | null;
  /** 잔여 일수 (만료 시 음수, 파싱 불가 시 null) / Days remaining (negative if expired, null if unparseable) */
  readonly daysRemaining: number | null;
  /** 갱신 명령어 / Renewal command */
  readonly renewalCommand: string;
}
