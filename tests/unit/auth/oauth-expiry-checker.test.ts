/**
 * OAuthExpiryChecker 단위 테스트 / OAuthExpiryChecker unit tests
 *
 * @description
 * edge case 80%+ 비중 (정상 케이스 20% 이하)
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { OAuthExpiryChecker } from 'auth/oauth-expiry-checker.js';
import type { OAuthExpiryInfo } from 'auth/oauth-expiry-types.js';

// ── 테스트 헬퍼 ─────────────────────────────────────────────

const MS_PER_DAY = 1_000 * 60 * 60 * 24;
const RENEWAL_COMMAND = 'claude setup-token';

/**
 * 지정한 초 타임스탬프를 exp로 갖는 JWT를 생성한다
 * Generates a JWT with given exp (seconds timestamp)
 */
function makeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'test', exp: expSeconds }));
  const sig = 'fakesig';
  return `${header}.${payload}.${sig}`;
}

/**
 * exp가 없는 JWT 생성 / Generates a JWT without exp claim
 */
function makeJwtNoExp(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'test', iat: 1_000_000 }));
  const sig = 'fakesig';
  return `${header}.${payload}.${sig}`;
}

/**
 * 지금 기준 N일 후 만료되는 JWT를 생성한다
 * Generates a JWT expiring N days from now
 */
function makeJwtExpiresInDays(days: number, nowMs: number): string {
  const expSeconds = Math.floor((nowMs + days * MS_PER_DAY) / 1_000);
  return makeJwt(expSeconds);
}

// ── 테스트 스위트 ────────────────────────────────────────────

describe('OAuthExpiryChecker', () => {
  let nowMs: number;
  let checker: OAuthExpiryChecker;

  beforeEach(() => {
    nowMs = Date.now();
    checker = new OAuthExpiryChecker(() => nowMs);
  });

  // ── 정상 케이스 (20%) ────────────────────────────────────

  describe('정상 케이스 / Normal cases', () => {
    it('유효한 JWT, 만료 90일 후 → status=valid', () => {
      const token = makeJwtExpiresInDays(90, nowMs);
      const info: OAuthExpiryInfo = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeInstanceOf(Date);
      expect(info.daysRemaining).not.toBeNull();
      expect(info.daysRemaining).toBeGreaterThan(30);
      expect(info.renewalCommand).toBe(RENEWAL_COMMAND);
    });

    it('renewalCommand 항상 포함', () => {
      const token = makeJwtExpiresInDays(90, nowMs);
      const info = checker.check(token);
      expect(info.renewalCommand).toBe(RENEWAL_COMMAND);
    });
  });

  // ── edge case (80%+) ─────────────────────────────────────

  describe('edge case / Edge cases', () => {
    it('JWT, 만료 15일 후 → status=expiring_soon', () => {
      const token = makeJwtExpiresInDays(15, nowMs);
      const info = checker.check(token);

      expect(info.status).toBe('expiring_soon');
      expect(info.daysRemaining).toBe(15);
      expect(info.expiresAt).toBeInstanceOf(Date);
    });

    it('JWT, 만료 30일 후 → status=expiring_soon (경계 포함)', () => {
      // Math.ceil(30 * MS_PER_DAY / MS_PER_DAY) = 30 → expiring_soon (≤ 30)
      const expSeconds = Math.floor((nowMs + 30 * MS_PER_DAY) / 1_000);
      const token = makeJwt(expSeconds);
      const info = checker.check(token);

      expect(info.status).toBe('expiring_soon');
      expect(info.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('JWT, 이미 만료 → status=expired', () => {
      // 10일 전 만료
      const token = makeJwtExpiresInDays(-10, nowMs);
      const info = checker.check(token);

      expect(info.status).toBe('expired');
      expect(info.daysRemaining).not.toBeNull();
      // daysRemaining이 음수여야 함
      expect((info.daysRemaining ?? 0)).toBeLessThan(0);
      expect(info.expiresAt).toBeInstanceOf(Date);
    });

    it('JWT, 정확히 오늘 만료 (daysRemaining ≤ 0) → expired or expiring_soon', () => {
      // exp = 지금과 동일 (0초 후 만료)
      const expSeconds = Math.floor(nowMs / 1_000);
      const token = makeJwt(expSeconds);
      const info = checker.check(token);

      // daysRemaining = Math.ceil(0) = 0 → expiring_soon (≤ 30)
      // daysRemaining = Math.ceil(음수) → expired
      expect(['expiring_soon', 'expired']).toContain(info.status);
    });

    it('opaque 토큰 (JWT 아님) → status=valid, expiresAt=null', () => {
      const token = 'sk-ant-oat01-some-opaque-token-without-dots';
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
      expect(info.daysRemaining).toBeNull();
      expect(info.renewalCommand).toBe(RENEWAL_COMMAND);
    });

    it('빈 문자열 토큰 → status=valid, expiresAt=null', () => {
      const info = checker.check('');

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('malformed JWT (base64 디코딩 실패) → status=valid, expiresAt=null', () => {
      // 3개 파트이나 payload가 valid base64가 아님
      const token = 'invalid.!!!notbase64!!!.sig';
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('malformed JWT (JSON 파싱 실패) → status=valid, expiresAt=null', () => {
      // base64는 유효하지만 JSON이 아닌 문자열
      const header = btoa('header');
      const payload = btoa('not-json-content');
      const token = `${header}.${payload}.sig`;
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('JWT에 exp 없음 → status=valid, expiresAt=null', () => {
      const token = makeJwtNoExp();
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('JWT payload가 null → status=valid, expiresAt=null', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa('null');
      const token = `${header}.${payload}.sig`;
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
    });

    it('JWT payload의 exp가 문자열 → status=valid, expiresAt=null', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ exp: '9999999999' }));
      const token = `${header}.${payload}.sig`;
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
    });

    it('daysRemaining 정확한 계산 검증 (정확히 7일)', () => {
      // 7일 후 만료: exp = now/1000 + 7*86400 + 약간
      // Math.ceil(7 * MS_PER_DAY / MS_PER_DAY) = 7
      const expSeconds = Math.floor(nowMs / 1_000) + 7 * 86_400;
      const token = makeJwt(expSeconds);
      const info = checker.check(token);

      expect(info.status).toBe('expiring_soon');
      // 초 단위 반올림으로 인해 7 또는 8 가능
      expect(info.daysRemaining).toBeGreaterThanOrEqual(7);
      expect(info.daysRemaining).toBeLessThanOrEqual(8);
    });

    it('expiresAt이 Date 인스턴스 (유효한 JWT 경우)', () => {
      const token = makeJwtExpiresInDays(60, nowMs);
      const info = checker.check(token);

      expect(info.expiresAt).toBeInstanceOf(Date);
      // Date가 유효한지 (NaN이 아닌지)
      expect(Number.isNaN(info.expiresAt?.getTime())).toBe(false);
    });

    it('JWT 파트가 2개뿐 → status=valid, expiresAt=null', () => {
      const token = 'header.payload';
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
    });

    it('JWT 파트가 4개 → status=valid, expiresAt=null', () => {
      const token = 'a.b.c.d';
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeNull();
    });

    it('base64url 인코딩 토큰 (- 와 _ 포함) 정상 파싱', () => {
      // base64url 변환 테스트: + → -, / → _ 치환된 실제 JWT 시뮬레이션
      const expSeconds = Math.floor((nowMs + 90 * MS_PER_DAY) / 1_000);
      const headerJson = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
      const payloadJson = JSON.stringify({ exp: expSeconds });
      // base64url 인코딩 (padding 제거, +→-, /→_)
      const headerB64url = btoa(headerJson).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const payloadB64url = btoa(payloadJson).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const token = `${headerB64url}.${payloadB64url}.fakesig`;
      const info = checker.check(token);

      expect(info.status).toBe('valid');
      expect(info.expiresAt).toBeInstanceOf(Date);
    });

    it('renewalCommand는 모든 케이스에서 항상 claude setup-token', () => {
      const tokens = [
        '',
        'opaque-token',
        makeJwt(1),              // 이미 만료
        makeJwtExpiresInDays(5, nowMs),   // expiring_soon
        makeJwtExpiresInDays(90, nowMs),  // valid
        makeJwtNoExp(),          // exp 없음
      ];

      for (const token of tokens) {
        const info = checker.check(token);
        expect(info.renewalCommand).toBe(RENEWAL_COMMAND);
      }
    });
  });
});
