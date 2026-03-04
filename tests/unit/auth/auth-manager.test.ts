import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAuthProvider } from '../../../src/auth/auth-manager.js';
import { ApiKeyAuth } from '../../../src/auth/api-key-auth.js';
import { SubscriptionAuth } from '../../../src/auth/subscription-auth.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

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

// ── createAuthProvider ──────────────────────────────────────

describe('createAuthProvider', () => {
  beforeEach(() => {
    backupEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('ANTHROPIC_API_KEY 설정 시 ApiKeyAuth를 생성한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-test-key';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(ApiKeyAuth);
      expect(result.value.authMode).toBe('api-key');
    }
  });

  it('CLAUDE_CODE_OAUTH_TOKEN 설정 시 SubscriptionAuth를 생성한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-test-token';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(SubscriptionAuth);
      expect(result.value.authMode).toBe('oauth-token');
    }
  });

  it('ApiKeyAuth가 올바른 헤더를 생성한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-my-key';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(true);
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers['x-api-key']).toBe('sk-ant-api01-my-key');
    }
  });

  it('SubscriptionAuth가 올바른 헤더를 생성한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-my-token';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(true);
    if (result.ok) {
      const headers = result.value.getAuthHeader();
      expect(headers.authorization).toBe('Bearer sk-ant-oat01-my-token');
    }
  });

  it('둘 다 설정 시 AuthError를 반환한다', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api01-key';
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth_env_load_failed');
      expect(result.error.name).toBe('AuthError');
    }
  });

  it('둘 다 미설정 시 AuthError를 반환한다', () => {
    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth_env_load_failed');
      expect(result.error.name).toBe('AuthError');
    }
  });

  it('빈 API 키만 설정 시 AuthError를 반환한다 (loadEnvironment가 빈 문자열을 미설정으로 취급)', () => {
    process.env['ANTHROPIC_API_KEY'] = '';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth_env_load_failed');
    }
  });

  it('빈 OAuth 토큰만 설정 시 AuthError를 반환한다', () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = '';

    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('auth_env_load_failed');
    }
  });

  it('에러에 원인 에러가 포함된다', () => {
    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBeDefined();
    }
  });

  it('에러 메시지가 ConfigError의 메시지를 전달한다', () => {
    const result = createAuthProvider(createLogger());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('ANTHROPIC_API_KEY');
    }
  });
});
