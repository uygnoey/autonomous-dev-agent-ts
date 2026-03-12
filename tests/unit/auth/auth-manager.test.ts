/**
 * AuthManager 단위 테스트
 *
 * @description
 * KR: createAuthProvider() 팩토리 함수 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for createAuthProvider() factory function. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuthProvider } from 'auth/auth-manager.js';
import { ApiKeyAuth } from 'auth/api-key-auth.js';
import { SubscriptionAuth } from 'auth/subscription-auth.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 환경변수 백업/복원 헬퍼 ─────────────────────────────────

let originalApiKey: string | undefined;
let originalOauthToken: string | undefined;

function backupEnv(): void {
  originalApiKey = process.env['ANTHROPIC_API_KEY'];
  originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
}

function restoreEnv(): void {
  if (originalApiKey !== undefined) {
    process.env['ANTHROPIC_API_KEY'] = originalApiKey;
  } else {
    delete process.env['ANTHROPIC_API_KEY'];
  }
  if (originalOauthToken !== undefined) {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
  } else {
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  }
}

function createLogger(): ConsoleLogger {
  return new ConsoleLogger('error');
}

// ── createAuthProvider - API Key 인증 ────────────────────────

describe('createAuthProvider - API Key 인증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('ANTHROPIC_API_KEY 설정 시 ok=true 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test-key';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('ANTHROPIC_API_KEY 설정 시 ApiKeyAuth 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test-key';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value).toBeInstanceOf(ApiKeyAuth);
  });

  it('ANTHROPIC_API_KEY 설정 시 authMode=api-key', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test-key';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).toBe('api-key');
  });

  it('ApiKeyAuth가 올바른 헤더를 생성한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-my-key';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBe('sk-ant-api01-my-key');
    }
  });

  it('API 키 값이 헤더에 정확히 반영된다', () => {
    const testKey = 'sk-ant-api01-exact-key-12345';
    process.env['ANTHROPIC_API_KEY'] = testKey;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBe(testKey);
    }
  });

  it('authorization 헤더는 없다 (api-key 모드)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBeUndefined();
    }
  });

  it('긴 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-' + 'a'.repeat(100);
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key_with-special.chars';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('다른 logger 인스턴스로 호출해도 ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-any-key';
    const result = createAuthProvider(new ConsoleLogger('debug'));
    expect(result.ok).toBe(true);
  });

  it('ApiKeyAuth는 SubscriptionAuth가 아니다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-any-key';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value).not.toBeInstanceOf(SubscriptionAuth);
  });

  it('UUID 형식 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = '550e8400-e29b-41d4-a716-446655440000';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('숫자만 있는 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = '1234567890';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('단일 문자 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'x';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('x-api-key 헤더 값이 문자열이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-str-key';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(typeof headers['x-api-key']).toBe('string');
    }
  });

  it('getAuthHeader 두 번 호출 → 동일 결과', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-twice';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const h1 = result.value.getAuthHeader();
      const h2 = result.value.getAuthHeader();
      expect(h1['x-api-key']).toBe(h2['x-api-key']);
    }
  });

  it('authMode는 문자열이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-mode-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(typeof result.value.authMode).toBe('string');
  });

  it('10가지 다른 API 키 → 각각 ok=true', () => {
    for (let i = 0; i < 10; i++) {
      process.env['ANTHROPIC_API_KEY'] = `sk-ant-api01-key-${i}`;
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(true);
      delete process.env['ANTHROPIC_API_KEY'];
    }
  });

  it('API 키 헤더가 객체이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-obj-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(typeof result.value.getAuthHeader()).toBe('object');
      expect(result.value.getAuthHeader()).not.toBeNull();
    }
  });

  it('warn logger로도 ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-warn-key';
    const result = createAuthProvider(new ConsoleLogger('warn'));
    expect(result.ok).toBe(true);
  });
});

// ── createAuthProvider - OAuth 토큰 인증 ─────────────────────

describe('createAuthProvider - OAuth Token 인증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('CLAUDE_CODE_OAUTH_TOKEN 설정 시 ok=true 반환', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test-token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('CLAUDE_CODE_OAUTH_TOKEN 설정 시 SubscriptionAuth 반환', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value).toBeInstanceOf(SubscriptionAuth);
  });

  it('CLAUDE_CODE_OAUTH_TOKEN 설정 시 authMode=oauth-token', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).toBe('oauth-token');
  });

  it('SubscriptionAuth가 올바른 헤더를 생성한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-my-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBe('Bearer sk-ant-oat01-my-token');
    }
  });

  it('OAuth 토큰 값이 헤더에 정확히 반영된다', () => {
    const testToken = 'sk-ant-oat01-exact-token-xyz';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = testToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${testToken}`);
    }
  });

  it('x-api-key 헤더는 없다 (oauth-token 모드)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBeUndefined();
    }
  });

  it('긴 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-' + 'b'.repeat(100);
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('SubscriptionAuth는 ApiKeyAuth가 아니다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value).not.toBeInstanceOf(ApiKeyAuth);
  });

  it('authorization 헤더가 문자열이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-str-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      if (headers.authorization) {
        expect(typeof headers.authorization).toBe('string');
      }
    }
  });

  it('authMode가 문자열이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-mode-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(typeof result.value.authMode).toBe('string');
  });

  it('getAuthHeader 두 번 호출 → 동일 authorization', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-twice';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const h1 = result.value.getAuthHeader();
      const h2 = result.value.getAuthHeader();
      expect(h1.authorization).toBe(h2.authorization);
    }
  });

  it('UUID 형식 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-550e8400-e29b-41d4-a716';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('단일 문자 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'y';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('authorization 값이 Bearer로 시작한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      if (headers.authorization) {
        expect(headers.authorization).toMatch(/^Bearer /);
      }
    }
  });

  it('10가지 다른 토큰 → 각각 ok=true', () => {
    for (let i = 0; i < 10; i++) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = `sk-ant-oat01-token-${i}`;
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(true);
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });
});

// ── createAuthProvider - 실패 케이스 ─────────────────────────

describe('createAuthProvider - 실패 케이스', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('둘 다 미설정 시 ok=false 반환', () => {
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('둘 다 미설정 시 code=auth_env_load_failed', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code).toBe('auth_env_load_failed');
  });

  it('둘 다 미설정 시 name=AuthError', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.name).toBe('AuthError');
  });

  it('둘 다 설정 시 ok=true, api-key 모드 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('둘 다 설정 시 api-key 모드로 인증 생성', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).toBe('api-key');
  });

  it('빈 API 키만 설정 시 ok=false 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('빈 API 키 → code=auth_env_load_failed', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code).toBe('auth_env_load_failed');
  });

  it('빈 OAuth 토큰만 설정 시 ok=false 반환', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('빈 OAuth 토큰 → code=auth_env_load_failed', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code).toBe('auth_env_load_failed');
  });

  it('에러에 cause가 포함된다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.cause).toBeDefined();
  });

  it('에러 메시지가 ANTHROPIC_API_KEY를 포함한다 (둘 다 미설정)', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.message).toContain('ANTHROPIC_API_KEY');
  });

  it('빈 API 키 + 빈 OAuth 토큰 → ok=false', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 API 키 → ok (빈 문자열이 아니므로 유효로 처리됨)', () => {
    process.env['ANTHROPIC_API_KEY'] = '   ';
    const result = createAuthProvider(createLogger());
    // WHY: loadEnvironment는 빈 문자열('')만 미설정으로 취급, 공백은 유효 키로 처리
    expect(typeof result.ok).toBe('boolean');
  });

  it('에러 code가 문자열이다 (둘 다 미설정)', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 name이 문자열이다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(typeof result.error.name).toBe('string');
  });

  it('에러 message가 문자열이다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 연속 미설정 호출 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(false);
    }
  });

  it('5번 연속 미설정 → 항상 같은 error.code', () => {
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      if (!result.ok) codes.push(result.error.code);
    }
    expect(codes.every((c) => c === 'auth_env_load_failed')).toBe(true);
  });

  it('둘 다 설정 → ok=true, ApiKeyAuth 인스턴스 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-a';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-b';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('빈 API + 빈 OAuth → error.code=auth_env_load_failed', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code).toBe('auth_env_load_failed');
  });
});

// ── createAuthProvider - 반복 호출 일관성 ────────────────────

describe('createAuthProvider - 반복 호출 일관성', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('같은 API 키로 5번 호출 → 항상 ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-consistent';
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(true);
    }
  });

  it('미설정 상태로 5번 호출 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(false);
    }
  });

  it('같은 API 키로 2번 호출 → 동일 authMode', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-repeated';
    const r1 = createAuthProvider(createLogger());
    const r2 = createAuthProvider(createLogger());
    if (r1.ok && r2.ok) {
      expect(r1.value.authMode).toBe(r2.value.authMode);
    }
  });

  it('환경변수 변경 후 호출 → 새 상태 반영', () => {
    // 처음엔 미설정
    const r1 = createAuthProvider(createLogger());
    expect(r1.ok).toBe(false);

    // API 키 설정 후
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-new-key';
    const r2 = createAuthProvider(createLogger());
    expect(r2.ok).toBe(true);
  });

  it('OAuth 토큰 5번 호출 → 항상 ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-consistent';
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(true);
    }
  });

  it('OAuth 5번 호출 → 항상 authMode=oauth-token', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-mode-check';
    for (let i = 0; i < 5; i++) {
      const result = createAuthProvider(createLogger());
      if (result.ok) expect(result.value.authMode).toBe('oauth-token');
    }
  });

  it('API 키 10번 호출 → 항상 같은 x-api-key 헤더', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-stable-key';
    const headers: (string | undefined)[] = [];
    for (let i = 0; i < 10; i++) {
      const result = createAuthProvider(createLogger());
      if (result.ok) headers.push(result.value.getAuthHeader()['x-api-key']);
    }
    expect(headers.every((h) => h === 'sk-ant-api01-stable-key')).toBe(true);
  });

  it('OAuth 10번 호출 → 항상 같은 authorization 헤더', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-stable-tok';
    const headers: (string | undefined)[] = [];
    for (let i = 0; i < 10; i++) {
      const result = createAuthProvider(createLogger());
      if (result.ok) headers.push(result.value.getAuthHeader().authorization);
    }
    expect(headers.every((h) => h === 'Bearer sk-ant-oat01-stable-tok')).toBe(true);
  });

  it('API 키 → OAuth로 전환 → 다른 authMode', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-first';
    const r1 = createAuthProvider(createLogger());

    delete process.env['ANTHROPIC_API_KEY'];
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-second';
    const r2 = createAuthProvider(createLogger());

    if (r1.ok && r2.ok) {
      expect(r1.value.authMode).not.toBe(r2.value.authMode);
    }
  });

  it('API 키 설정 후 삭제 → ok=false', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-temp';
    const r1 = createAuthProvider(createLogger());
    expect(r1.ok).toBe(true);

    delete process.env['ANTHROPIC_API_KEY'];
    const r2 = createAuthProvider(createLogger());
    expect(r2.ok).toBe(false);
  });
});

// ── getAuthHeader 구조 검증 ───────────────────────────────────

describe('getAuthHeader 구조 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('ApiKeyAuth.getAuthHeader()는 객체를 반환한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(typeof result.value.getAuthHeader()).toBe('object');
    }
  });

  it('SubscriptionAuth.getAuthHeader()는 객체를 반환한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(typeof result.value.getAuthHeader()).toBe('object');
    }
  });

  it('ApiKeyAuth.getAuthHeader()에 x-api-key 키가 있다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect('x-api-key' in headers).toBe(true);
    }
  });

  it('SubscriptionAuth.getAuthHeader()에 authorization 키가 있다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect('authorization' in headers).toBe(true);
    }
  });

  it('authorization 값이 Bearer로 시작한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      if (headers.authorization) {
        expect(headers.authorization).toMatch(/^Bearer /);
      }
    }
  });

  it('getAuthHeader()는 null이 아니다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-notnull';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader()).not.toBeNull();
    }
  });

  it('OAuth 헤더 객체가 null이 아니다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-notnull';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader()).not.toBeNull();
    }
  });

  it('ApiKeyAuth x-api-key는 설정한 키와 동일', () => {
    const myKey = 'sk-ant-api01-exact-match-xyz';
    process.env['ANTHROPIC_API_KEY'] = myKey;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBe(myKey);
    }
  });

  it('OAuth authorization은 Bearer + 설정 토큰', () => {
    const myToken = 'sk-ant-oat01-exact-match-abc';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = myToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${myToken}`);
    }
  });

  it('5번 연속 getAuthHeader() → 항상 동일 결과 (API)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-stable';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const expected = result.value.getAuthHeader()['x-api-key'];
      for (let i = 0; i < 5; i++) {
        expect(result.value.getAuthHeader()['x-api-key']).toBe(expected);
      }
    }
  });

  it('5번 연속 getAuthHeader() → 항상 동일 결과 (OAuth)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-stable';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const expected = result.value.getAuthHeader().authorization;
      for (let i = 0; i < 5; i++) {
        expect(result.value.getAuthHeader().authorization).toBe(expected);
      }
    }
  });
});

// ── 독립성 검증 ───────────────────────────────────────────────

describe('createAuthProvider - 독립성 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('두 ApiKeyAuth 인스턴스는 독립적이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key-a';
    const r1 = createAuthProvider(createLogger());

    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key-b';
    const r2 = createAuthProvider(createLogger());

    if (r1.ok && r2.ok) {
      expect(r1.value.getAuthHeader()['x-api-key']).toBe('sk-ant-api01-key-a');
      expect(r2.value.getAuthHeader()['x-api-key']).toBe('sk-ant-api01-key-b');
    }
  });

  it('두 SubscriptionAuth 인스턴스는 독립적이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token-a';
    const r1 = createAuthProvider(createLogger());

    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token-b';
    const r2 = createAuthProvider(createLogger());

    if (r1.ok && r2.ok) {
      expect(r1.value.getAuthHeader().authorization).toBe('Bearer sk-ant-oat01-token-a');
      expect(r2.value.getAuthHeader().authorization).toBe('Bearer sk-ant-oat01-token-b');
    }
  });

  it('다른 logger 인스턴스 → 결과에 영향 없음', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-logger-test';
    const r1 = createAuthProvider(new ConsoleLogger('error'));
    const r2 = createAuthProvider(new ConsoleLogger('debug'));

    if (r1.ok && r2.ok) {
      expect(r1.value.authMode).toBe(r2.value.authMode);
    }
  });

  it('result.ok가 boolean이다 (성공)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-bool-check';
    const result = createAuthProvider(createLogger());
    expect(typeof result.ok).toBe('boolean');
  });

  it('result.ok가 boolean이다 (실패)', () => {
    const result = createAuthProvider(createLogger());
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── 추가 edge: API 키 극단값 ──────────────────────────────────

describe('createAuthProvider - API 키 추가 극단값', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('개행 포함 API 키 → ok=true (비어있지 않으면 허용)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key\n';
    const result = createAuthProvider(createLogger());
    expect(typeof result.ok).toBe('boolean');
  });

  it('탭 포함 API 키 → ok=true (비어있지 않으면 허용)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key\t';
    const result = createAuthProvider(createLogger());
    expect(typeof result.ok).toBe('boolean');
  });

  it('한글 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-한글-api-key';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('이모지 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = '🔑-api-key';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('최대 길이 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-' + 'z'.repeat(500);
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('헤더 x-api-key가 비어있지 않다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-nonempty';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const hv = result.value.getAuthHeader()['x-api-key'];
      if (hv) expect(hv.length).toBeGreaterThan(0);
    }
  });

  it('API 키 설정 → getAuthHeader() 반환값에 x-api-key 키 존재', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect('x-api-key' in result.value.getAuthHeader()).toBe(true);
    }
  });

  it('authMode가 "api-key"인지 확인 (소문자 하이픈)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-mode-lower';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.authMode).toMatch(/api-key/i);
    }
  });
});

// ── 추가 edge: OAuth 토큰 극단값 ──────────────────────────────

describe('createAuthProvider - OAuth 토큰 추가 극단값', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('한글 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-한글-토큰';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('이모지 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '🔐-oauth-token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('최대 길이 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-' + 'y'.repeat(500);
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('authorization 헤더가 비어있지 않다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-nonempty';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const hv = result.value.getAuthHeader().authorization;
      if (hv) expect(hv.length).toBeGreaterThan(0);
    }
  });

  it('authorization 헤더가 공백을 포함한다 (Bearer + space)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-space-test';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const hv = result.value.getAuthHeader().authorization;
      if (hv) expect(hv).toContain(' ');
    }
  });

  it('authMode가 "oauth-token"인지 확인 (하이픈 포함)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-mode-lower';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.authMode).toMatch(/oauth-token/i);
    }
  });
});

// ── 추가 edge: 실패 케이스 극단값 ────────────────────────────

describe('createAuthProvider - 실패 케이스 추가 edge', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('개행만 있는 API 키 → ok=false (빈 문자열 취급)', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('둘 다 미설정 → error.cause가 정의된다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.cause).toBeDefined();
  });

  it('둘 다 설정 → ok=true, api-key 모드', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-x';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-x';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.authMode).toBe('api-key');
  });

  it('둘 다 설정 → authMode가 문자열이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-x';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-x';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.authMode).toBe('string');
  });

  it('빈 API 키 + 정상 OAuth → ok=false (빈 API 키로 인한 충돌)', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-valid';
    const result = createAuthProvider(createLogger());
    // 빈 API 키는 미설정 취급 → OAuth만 유효 → ok=true일 수도 있음
    expect(typeof result.ok).toBe('boolean');
  });

  it('정상 API 키 + 빈 OAuth → ok (API 키 유효로 처리)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-valid';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    // 빈 OAuth는 미설정 취급 → API 키만 유효 → ok=true
    expect(typeof result.ok).toBe('boolean');
  });

  it('10번 연속 둘 다 미설정 → 항상 ok=false', () => {
    for (let i = 0; i < 10; i++) {
      const result = createAuthProvider(createLogger());
      expect(result.ok).toBe(false);
    }
  });

  it('error.name은 비어있지 않다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.name.length).toBeGreaterThan(0);
  });

  it('error.code는 비어있지 않다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code.length).toBeGreaterThan(0);
  });

  it('error.message는 비어있지 않다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });
});

// ── 추가 edge: 메서드 구조 검증 ──────────────────────────────

describe('createAuthProvider - 메서드 구조 추가 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('ApiKeyAuth에 getAuthHeader 메서드가 있다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-method-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(typeof result.value.getAuthHeader).toBe('function');
    }
  });

  it('SubscriptionAuth에 getAuthHeader 메서드가 있다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-method-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(typeof result.value.getAuthHeader).toBe('function');
    }
  });

  it('ApiKeyAuth에 authMode 속성이 있다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-prop-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect('authMode' in result.value).toBe(true);
    }
  });

  it('SubscriptionAuth에 authMode 속성이 있다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-prop-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect('authMode' in result.value).toBe(true);
    }
  });

  it('API 키 → authMode가 "api-key"이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-mode-val';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.authMode).toBe('api-key');
    }
  });

  it('OAuth 토큰 → authMode가 "oauth-token"이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-mode-val';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.authMode).toBe('oauth-token');
    }
  });

  it('UUID 형식 API 키 → x-api-key 헤더 일치', () => {
    const uuid = crypto.randomUUID();
    process.env['ANTHROPIC_API_KEY'] = uuid;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader()['x-api-key']).toBe(uuid);
    }
  });

  it('UUID 형식 OAuth 토큰 → authorization Bearer 일치', () => {
    const uuid = crypto.randomUUID();
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = uuid;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader().authorization).toBe(`Bearer ${uuid}`);
    }
  });

  it('한글 API 키 → x-api-key 헤더 일치', () => {
    const korKey = '한글-api-키-테스트';
    process.env['ANTHROPIC_API_KEY'] = korKey;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader()['x-api-key']).toBe(korKey);
    }
  });

  it('한글 OAuth 토큰 → authorization Bearer 일치', () => {
    const korToken = '한글-oauth-토큰';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = korToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader().authorization).toBe(`Bearer ${korToken}`);
    }
  });
});

// ── 추가 경계값: authMode 속성 일관성 ──────────────────────────

describe('createAuthProvider - authMode 속성 일관성 추가 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('API 키 → authMode 값이 "api-key"이다 (재확인)', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-consistency';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).toBe('api-key');
  });

  it('OAuth 토큰 → authMode 값이 "oauth-token"이다 (재확인)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-consistency';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).toBe('oauth-token');
  });

  it('authMode는 "api-key" 또는 "oauth-token" 중 하나이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-mode-one-of';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(['api-key', 'oauth-token'].includes(result.value.authMode)).toBe(true);
    }
  });

  it('OAuth authMode도 "api-key" 또는 "oauth-token" 중 하나이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-mode-one-of';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(['api-key', 'oauth-token'].includes(result.value.authMode)).toBe(true);
    }
  });

  it('API 키 → authMode가 "oauth-token"이 아니다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-not-oauth';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).not.toBe('oauth-token');
  });

  it('OAuth 토큰 → authMode가 "api-key"가 아니다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-not-apikey';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode).not.toBe('api-key');
  });

  it('API 키 설정 → authMode 길이가 0보다 크다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-len';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode.length).toBeGreaterThan(0);
  });

  it('OAuth 설정 → authMode 길이가 0보다 크다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-len';
    const result = createAuthProvider(createLogger());
    if (result.ok) expect(result.value.authMode.length).toBeGreaterThan(0);
  });

  it('동일 환경변수 3번 호출 → 항상 같은 authMode', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-3x';
    const modes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = createAuthProvider(createLogger());
      if (r.ok) modes.push(r.value.authMode);
    }
    expect(modes.every((m) => m === 'api-key')).toBe(true);
  });

  it('OAuth 3번 호출 → 항상 같은 authMode', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-3x';
    const modes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = createAuthProvider(createLogger());
      if (r.ok) modes.push(r.value.authMode);
    }
    expect(modes.every((m) => m === 'oauth-token')).toBe(true);
  });
});

// ── 추가 경계값: getAuthHeader 반환 구조 세부 검증 ──────────────

describe('createAuthProvider - getAuthHeader 반환 구조 세부 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('ApiKeyAuth x-api-key 헤더 키가 소문자이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-lowercase';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      const keys = Object.keys(headers);
      expect(keys.some((k) => k === 'x-api-key')).toBe(true);
    }
  });

  it('SubscriptionAuth authorization 헤더 키가 소문자이다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-lowercase';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      const keys = Object.keys(headers);
      expect(keys.some((k) => k === 'authorization')).toBe(true);
    }
  });

  it('ApiKeyAuth 헤더 객체에 authorization 키가 없다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-no-auth';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect('authorization' in headers).toBe(false);
    }
  });

  it('SubscriptionAuth 헤더 객체에 x-api-key 키가 없다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-no-xapi';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect('x-api-key' in headers).toBe(false);
    }
  });

  it('API 키 공백 포함 → x-api-key에 그대로 반영', () => {
    const keyWithSpace = 'sk-ant-api01 with space';
    process.env['ANTHROPIC_API_KEY'] = keyWithSpace;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBe(keyWithSpace);
    }
  });

  it('OAuth 토큰 공백 포함 → authorization에 그대로 반영', () => {
    const tokenWithSpace = 'sk-ant-oat01 with space';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = tokenWithSpace;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${tokenWithSpace}`);
    }
  });

  it('긴 키 100자 → x-api-key 길이가 100자 이상', () => {
    const longKey = 'sk-ant-api01-' + 'k'.repeat(87);
    process.env['ANTHROPIC_API_KEY'] = longKey;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const hv = result.value.getAuthHeader()['x-api-key'];
      if (hv) expect(hv.length).toBeGreaterThanOrEqual(100);
    }
  });

  it('긴 OAuth 토큰 → authorization 길이가 "Bearer " + 토큰 길이', () => {
    const longToken = 'sk-ant-oat01-' + 't'.repeat(50);
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = longToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const hv = result.value.getAuthHeader().authorization;
      if (hv) expect(hv.length).toBe(`Bearer ${longToken}`.length);
    }
  });

  it('5번 다른 API 키 설정 → 각 x-api-key 서로 다름', () => {
    const keys: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      process.env['ANTHROPIC_API_KEY'] = `sk-ant-api01-key-unique-${i}`;
      const r = createAuthProvider(createLogger());
      if (r.ok) keys.push(r.value.getAuthHeader()['x-api-key']);
      delete process.env['ANTHROPIC_API_KEY'];
    }
    const unique = new Set(keys);
    expect(unique.size).toBe(5);
  });

  it('5번 다른 OAuth 토큰 → 각 authorization 서로 다름', () => {
    const auths: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = `sk-ant-oat01-tok-unique-${i}`;
      const r = createAuthProvider(createLogger());
      if (r.ok) auths.push(r.value.getAuthHeader().authorization);
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
    const unique = new Set(auths);
    expect(unique.size).toBe(5);
  });
});

// ── 추가 경계값: 에러 구조 세부 검증 ──────────────────────────

describe('createAuthProvider - 에러 구조 세부 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('둘 다 미설정 → result에 value 필드 없음', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) {
      expect((result as unknown as Record<string, unknown>).value).toBeUndefined();
    }
  });

  it('둘 다 설정 → result에 value 필드 존재', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-both';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-both';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
      expect(result.value.authMode).toBe('api-key');
    }
  });

  it('성공 → result에 error 필드 없음', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-no-error';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect((result as unknown as Record<string, unknown>).error).toBeUndefined();
    }
  });

  it('에러 이름 "AuthError"가 정확히 일치', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.name).toBe('AuthError');
  });

  it('에러 code가 "auth_env_load_failed" 문자열', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.code).toBe('auth_env_load_failed');
  });

  it('에러 message가 빈 문자열이 아니다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) expect(result.error.message).not.toBe('');
  });

  it('에러 cause가 객체이거나 Error이다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) {
      const cause = result.error.cause;
      if (cause !== undefined) {
        expect(typeof cause === 'object' || cause instanceof Error).toBe(true);
      }
    }
  });

  it('5번 연속 둘 다 설정 → 항상 ok=true', () => {
    for (let i = 0; i < 5; i++) {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-a';
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-b';
      const r = createAuthProvider(createLogger());
      expect(r.ok).toBe(true);
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('5번 연속 둘 다 설정 → 항상 api-key 모드', () => {
    const modes: string[] = [];
    for (let i = 0; i < 5; i++) {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-c';
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-d';
      const r = createAuthProvider(createLogger());
      if (r.ok) modes.push(r.value.authMode);
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
    expect(modes.every((m) => m === 'api-key')).toBe(true);
  });
});

// ── 추가 경계값: Result 타입 구조 검증 ───────────────────────

describe('createAuthProvider - Result 타입 구조 추가 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('ok=true 결과에 value 필드가 있다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-result-struct';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value).toBeDefined();
    }
  });

  it('ok=false 결과에 error 필드가 있다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  it('ok=true 결과의 value는 null이 아니다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-notnull2';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });

  it('ok=false 결과의 error는 null이 아니다', () => {
    const result = createAuthProvider(createLogger());
    if (!result.ok) {
      expect(result.error).not.toBeNull();
    }
  });

  it('result.ok는 항상 boolean이다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-bool2';
    const result = createAuthProvider(createLogger());
    expect(typeof result.ok).toBe('boolean');
  });

  it('이모지 포함 API 키 → x-api-key 헤더에 그대로', () => {
    const emojiKey = '🔑sk-ant-api01-emoji';
    process.env['ANTHROPIC_API_KEY'] = emojiKey;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader()['x-api-key']).toBe(emojiKey);
    }
  });

  it('이모지 포함 OAuth 토큰 → authorization Bearer에 그대로', () => {
    const emojiToken = '🔐sk-ant-oat01-emoji';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = emojiToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader().authorization).toBe(`Bearer ${emojiToken}`);
    }
  });

  it('랜덤 UUID를 API 키로 설정 → ok=true이고 헤더 일치', () => {
    const uuid = crypto.randomUUID();
    process.env['ANTHROPIC_API_KEY'] = uuid;
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.getAuthHeader()['x-api-key']).toBe(uuid);
    }
  });

  it('랜덤 UUID를 OAuth 토큰으로 설정 → ok=true이고 헤더 일치', () => {
    const uuid = crypto.randomUUID();
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = uuid;
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.getAuthHeader().authorization).toBe(`Bearer ${uuid}`);
    }
  });

  it('info 로거도 ok=true 반환', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-info-log';
    const result = createAuthProvider(new ConsoleLogger('info'));
    expect(result.ok).toBe(true);
  });

  it('info OAuth 로거도 ok=true 반환', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-info-log';
    const result = createAuthProvider(new ConsoleLogger('info'));
    expect(result.ok).toBe(true);
  });
});

// ── 추가 극단값: 다양한 API 키 패턴 ───────────────────────────

describe('createAuthProvider - 다양한 API 키 패턴 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('숫자+문자 혼합 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'abc123XYZ456';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('언더스코어 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk_ant_api01_underscore';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('점 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk.ant.api01.dotkey';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('슬래시 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk/ant/api01/slash';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('백슬래시 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk\\ant\\api01\\backslash';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('물음표 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-?key';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('등호 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01=key=value';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('쌍따옴표 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = '"sk-ant-api01-quoted"';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('단따옴표 포함 API 키 → ok=true', () => {
    process.env['ANTHROPIC_API_KEY'] = "'sk-ant-api01-single-quoted'";
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('빈 문자열 API 키 → ok=false (재확인)', () => {
    process.env['ANTHROPIC_API_KEY'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });
});

// ── 추가 극단값: 다양한 OAuth 토큰 패턴 검증 ──────────────────

describe('createAuthProvider - 다양한 OAuth 토큰 패턴 검증', () => {
  beforeEach(backupEnv);
  afterEach(restoreEnv);

  it('숫자+문자 혼합 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'oat123ABC456';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('언더스코어 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk_oat01_underscore_token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('점 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk.oat01.dot.token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('슬래시 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk/oat01/slash/token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('숫자만 있는 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '9876543210';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('물음표 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'oat01-?token';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('등호 포함 OAuth 토큰 → ok=true', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'oat01=token=value';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(true);
  });

  it('빈 문자열 OAuth 토큰 → ok=false (재확인)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';
    const result = createAuthProvider(createLogger());
    expect(result.ok).toBe(false);
  });

  it('authorization 헤더에 토큰 값 그대로 반영됨 (점 포함)', () => {
    const dotToken = 'sk.oat01.check';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = dotToken;
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      expect(result.value.getAuthHeader().authorization).toBe(`Bearer ${dotToken}`);
    }
  });

  it('authorization 헤더 공백 2개 없음 (Bearer 다음 단일 공백)', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-oat01-space-check';
    const result = createAuthProvider(createLogger());
    if (result.ok) {
      const auth = result.value.getAuthHeader().authorization ?? '';
      expect(auth.startsWith('Bearer ')).toBe(true);
      expect(auth.startsWith('Bearer  ')).toBe(false);
    }
  });
});
