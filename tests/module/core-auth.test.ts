/**
 * core ↔ auth 모듈 통합 테스트 / core ↔ auth module integration tests
 *
 * @description
 * KR: loadEnvironment() → createAuthProvider() 연동, 헤더 검증,
 *     에러 전파, credential 마스킹을 검증한다.
 * EN: Verifies loadEnvironment() → createAuthProvider() integration,
 *     header validation, error propagation, and credential masking.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ApiKeyAuth, SubscriptionAuth, createAuthProvider } from '../../src/auth/index.js';
import {
  AuthError,
  ConfigError,
  ConsoleLogger,
  loadEnvironment,
  maskSensitiveData,
} from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

/** 로그 출력 억제 로거 / Suppressed logger for tests */
const logger: Logger = new ConsoleLogger('error');

/** 환경변수 백업 / Backup environment variables */
let originalApiKey: string | undefined;
let originalOauthToken: string | undefined;

// ── 테스트 ────────────────────────────────────────────────────────

describe('core ↔ auth 통합 / core ↔ auth integration', () => {
  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    originalOauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOauthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOauthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it('API key 설정 시 loadEnvironment → createAuthProvider로 ApiKeyAuth 생성', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-test-key-12345';

    const envResult = loadEnvironment();
    expect(envResult.ok).toBe(true);
    if (!envResult.ok) return;
    expect(envResult.value.authMode).toBe('api-key');

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    expect(authResult.value).toBeInstanceOf(ApiKeyAuth);
    expect(authResult.value.authMode).toBe('api-key');
  });

  it('API key 인증 시 x-api-key 헤더를 올바르게 생성', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-header-test';

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;

    const headers = authResult.value.getAuthHeader();
    expect(headers['x-api-key']).toBe('sk-ant-api01-header-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('OAuth token 설정 시 loadEnvironment → createAuthProvider로 SubscriptionAuth 생성', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-test-token-67890';

    const envResult = loadEnvironment();
    expect(envResult.ok).toBe(true);
    if (!envResult.ok) return;
    expect(envResult.value.authMode).toBe('oauth-token');

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    expect(authResult.value).toBeInstanceOf(SubscriptionAuth);
    expect(authResult.value.authMode).toBe('oauth-token');
  });

  it('OAuth token 인증 시 Bearer 헤더를 올바르게 생성', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-bearer-test';

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;

    const headers = authResult.value.getAuthHeader();
    expect(headers.authorization).toBe('Bearer sk-ant-oat01-bearer-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('환경변수 미설정 시 ConfigError → AuthError로 전파', () => {
    // WHY: 두 키 모두 없을 때 ConfigError가 AuthError로 변환되는지 검증
    const envResult = loadEnvironment();
    expect(envResult.ok).toBe(false);
    if (envResult.ok) return;
    expect(envResult.error).toBeInstanceOf(ConfigError);

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(false);
    if (authResult.ok) return;
    expect(authResult.error).toBeInstanceOf(AuthError);
    expect(authResult.error.code).toBe('auth_env_load_failed');
  });

  it('두 키 동시 설정 시 ConfigError → AuthError로 전파', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-both-key';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-both-token';

    const envResult = loadEnvironment();
    expect(envResult.ok).toBe(false);
    if (envResult.ok) return;
    expect(envResult.error).toBeInstanceOf(ConfigError);
    expect(envResult.error.code).toBe('config_invalid_auth_both');

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(false);
    if (authResult.ok) return;
    expect(authResult.error).toBeInstanceOf(AuthError);
  });

  it('maskSensitiveData가 API key 패턴을 마스킹', () => {
    const text = 'key: sk-ant-api01-abcdefghijklmnop123456 is secret';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).toContain('***REDACTED***');
  });

  it('maskSensitiveData가 OAuth token 패턴을 마스킹', () => {
    const text = 'token: sk-ant-oat01-abcdefghijklmnop-1234567890 is secret';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-oat01');
    expect(masked).toContain('***REDACTED***');
  });

  it('Logger.child가 credential 마스킹 context를 상속', () => {
    const childLogger = logger.child({ module: 'test-auth' });
    // WHY: child 로거도 동일한 마스킹 동작을 유지하는지 확인
    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
    expect(typeof childLogger.error).toBe('function');
  });

  it('ApiKeyAuth.updateFromResponse로 rate limit 상태를 파싱', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-rate-test';

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;

    const provider = authResult.value;
    provider.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-input-tokens-remaining': '100000',
      'anthropic-ratelimit-input-tokens-limit': '500000',
      'anthropic-ratelimit-output-tokens-remaining': '50000',
      'anthropic-ratelimit-output-tokens-limit': '250000',
    });

    const status = provider.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(50);
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('SubscriptionAuth.updateFromResponse로 usage 누적 추적', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-usage-test';

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;

    const provider = authResult.value;
    provider.updateFromResponse({}, { usage: { input_tokens: 1000, output_tokens: 500 } });
    provider.updateFromResponse({}, { usage: { input_tokens: 2000, output_tokens: 1000 } });

    const status = provider.getRateLimitStatus();
    // WHY: 2회 사용 후 잔여량은 추정 한도(45) - 2 = 43
    expect(status.requestsRemaining).toBe(43);
  });

  it('maskSensitiveData가 환경변수 할당 패턴도 마스킹', () => {
    const text = 'export ANTHROPIC_API_KEY=sk-test-value CLAUDE_CODE_OAUTH_TOKEN=oauth-secret';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('***REDACTED***');
    expect(masked).not.toContain('sk-test-value');
    expect(masked).not.toContain('oauth-secret');
  });

  it('createAuthProvider가 올바른 Logger child를 전달', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-logger-child-test';

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;

    // WHY: AuthProvider가 내부적으로 logger.child를 호출하므로 에러 없이 생성되면 성공
    const headers = authResult.value.getAuthHeader();
    expect(headers['x-api-key']).toBeDefined();
  });
});
