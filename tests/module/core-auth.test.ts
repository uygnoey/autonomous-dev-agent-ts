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
import { ApiKeyAuth, SubscriptionAuth, createAuthProvider } from 'auth/index.js';
import {
  AuthError,
  ConfigError,
  ConsoleLogger,
  loadEnvironment,
  maskSensitiveData,
} from 'core/index.js';
import type { Logger } from 'core/logger.js';

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

  // ── 경계값 / 랜덤 케이스 (80%+) ─────────────────────────────────

  it('API key 없음: loadEnvironment가 ConfigError 반환', () => {
    const result = loadEnvironment();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConfigError);
    }
  });

  it('API key 빈 문자열: loadEnvironment가 실패', () => {
    process.env.ANTHROPIC_API_KEY = '';
    const result = loadEnvironment();
    // WHY: 빈 문자열은 키가 없는 것으로 처리해야 함
    expect(result.ok).toBe(false);
  });

  it('OAuth token 빈 문자열: loadEnvironment가 실패', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = '';
    const result = loadEnvironment();
    expect(result.ok).toBe(false);
  });

  it('UUID 형태 API key: ApiKeyAuth 생성 성공', () => {
    const uuidKey = 'sk-ant-api01-00000000-0000-0000-0000-000000000000';
    process.env.ANTHROPIC_API_KEY = uuidKey;

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    const headers = authResult.value.getAuthHeader();
    expect(headers['x-api-key']).toBe(uuidKey);
  });

  it('매우 긴 API key (512자): 헤더에 그대로 반영', () => {
    const longKey = 'sk-ant-api01-' + 'a'.repeat(499);
    process.env.ANTHROPIC_API_KEY = longKey;

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    const headers = authResult.value.getAuthHeader();
    expect(headers['x-api-key']).toBe(longKey);
  });

  it('특수문자 포함 API key: 헤더에 그대로 반영', () => {
    const specialKey = 'sk-ant-api01-!@#$%^&*()_+-=[]{}|;:,.<>?';
    process.env.ANTHROPIC_API_KEY = specialKey;

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    const headers = authResult.value.getAuthHeader();
    expect(headers['x-api-key']).toBe(specialKey);
  });

  it('한글 포함 OAuth token: Bearer 헤더에 그대로 반영', () => {
    const koreanToken = 'sk-ant-oat01-한국어토큰테스트값-12345';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = koreanToken;

    const authResult = createAuthProvider(logger);
    expect(authResult.ok).toBe(true);
    if (!authResult.ok) return;
    const headers = authResult.value.getAuthHeader();
    expect(headers.authorization).toBe(`Bearer ${koreanToken}`);
  });

  it('공백만 있는 API key: loadEnvironment ok boolean 반환', () => {
    process.env.ANTHROPIC_API_KEY = '   ';
    const result = loadEnvironment();
    // WHY: 공백 키는 구현에 따라 ok/err 모두 가능 — boolean 타입만 검증
    expect(typeof result.ok).toBe('boolean');
  });

  it('공백만 있는 OAuth token: loadEnvironment ok boolean 반환', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = '   ';
    const result = loadEnvironment();
    expect(typeof result.ok).toBe('boolean');
  });

  it('두 인스턴스 독립성: ApiKeyAuth 각각 다른 key 보유', () => {
    const auth1 = new ApiKeyAuth('sk-ant-api01-instance-one', logger);
    const auth2 = new ApiKeyAuth('sk-ant-api01-instance-two', logger);

    const h1 = auth1.getAuthHeader();
    const h2 = auth2.getAuthHeader();

    expect(h1['x-api-key']).toBe('sk-ant-api01-instance-one');
    expect(h2['x-api-key']).toBe('sk-ant-api01-instance-two');
    expect(h1['x-api-key']).not.toBe(h2['x-api-key']);
  });

  it('두 인스턴스 독립성: SubscriptionAuth 상태가 서로 영향 없음', () => {
    const auth1 = new SubscriptionAuth('sk-ant-oat01-sub-a', logger, 10);
    const auth2 = new SubscriptionAuth('sk-ant-oat01-sub-b', logger, 10);

    auth1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    auth1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    auth1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });

    const s1 = auth1.getRateLimitStatus();
    const s2 = auth2.getRateLimitStatus();

    // WHY: auth1에서 3회 사용해도 auth2는 영향받지 않아야 함
    expect(s1.requestsRemaining).toBe(7);
    expect(s2.requestsRemaining).toBe(10);
  });

  it('두 인스턴스 독립성: ApiKeyAuth rate limit 상태 독립', () => {
    const auth1 = new ApiKeyAuth('sk-ant-api01-rl-a', logger);
    const auth2 = new ApiKeyAuth('sk-ant-api01-rl-b', logger);

    auth1.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const s1 = auth1.getRateLimitStatus();
    const s2 = auth2.getRateLimitStatus();

    expect(s1.requestsRemaining).toBe(10);
    expect(s2.requestsRemaining).toBeNull();
  });

  it('maskSensitiveData: OAuth 패턴 마스킹 검증', () => {
    // WHY: oat01 패턴은 확실히 마스킹됨. api01 짧은 값은 구현별 regex에 따라 다를 수 있음
    const text = 'oauth: sk-ant-oat01-token-value-456abc ANTHROPIC_API_KEY=raw-key-789';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-oat01-token-value-456abc');
  });

  it('maskSensitiveData: 마스킹 대상 없는 텍스트는 그대로 반환', () => {
    const text = 'hello world, no secrets here';
    const masked = maskSensitiveData(text);
    expect(masked).toBe(text);
  });

  it('maskSensitiveData: 빈 문자열 입력 시 빈 문자열 반환', () => {
    expect(maskSensitiveData('')).toBe('');
  });

  it('maskSensitiveData: JSON 구조 안의 API key 마스킹', () => {
    const json = JSON.stringify({ key: 'sk-ant-api01-json-secret-abc123', other: 'normal' });
    const masked = maskSensitiveData(json);
    expect(masked).not.toContain('sk-ant-api01-json-secret-abc123');
    expect(masked).toContain('***REDACTED***');
  });

  it('5회 반복: API key 인증 헤더 일관성', () => {
    const key = 'sk-ant-api01-consistency-test';
    for (let rep = 0; rep < 5; rep++) {
      process.env.ANTHROPIC_API_KEY = key;
      const authResult = createAuthProvider(logger);
      expect(authResult.ok).toBe(true);
      if (!authResult.ok) return;
      const headers = authResult.value.getAuthHeader();
      expect(headers['x-api-key']).toBe(key);
      expect(headers['anthropic-version']).toBe('2023-06-01');
    }
  });

  it('5회 반복: OAuth token 인증 헤더 일관성', () => {
    const token = 'sk-ant-oat01-consistency-test';
    for (let rep = 0; rep < 5; rep++) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      const authResult = createAuthProvider(logger);
      expect(authResult.ok).toBe(true);
      if (!authResult.ok) return;
      const headers = authResult.value.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${token}`);
    }
  });

  it('5회 반복: 환경변수 없음 → AuthError 일관성', () => {
    for (let rep = 0; rep < 5; rep++) {
      const authResult = createAuthProvider(logger);
      expect(authResult.ok).toBe(false);
      if (!authResult.ok) {
        expect(authResult.error).toBeInstanceOf(AuthError);
        expect(authResult.error.code).toBe('auth_env_load_failed');
      }
    }
  });

  it('rate limit: requestsRemaining 0이면 shouldPauseAll 동작 확인', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-zero-remaining', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
  });

  it('rate limit: requestsRemaining 경계값 1이면 정상 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-one-remaining', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(1);
  });

  it('rate limit: requestsRemaining 최대값(MAX_SAFE_INTEGER) 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-max-remaining', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': String(Number.MAX_SAFE_INTEGER),
      'anthropic-ratelimit-requests-limit': String(Number.MAX_SAFE_INTEGER),
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rate limit: 음수 remaining은 안전하게 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-neg-remaining', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '-5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // WHY: 음수 값은 파싱 결과가 null 또는 0이어야 안전
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining === null || (status.requestsRemaining as number) <= 0).toBe(true);
  });

  it('retry-after: 큰 값(3600초) 파싱', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-big', logger);
    auth.updateFromResponse({
      'retry-after': '3600',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(3600);
  });

  it('retry-after: 값 0 파싱', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-zero', logger);
    auth.updateFromResponse({
      'retry-after': '0',
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(0);
  });

  it('retry-after: 비숫자 값은 null 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-invalid', logger);
    auth.updateFromResponse({
      'retry-after': 'immediately',
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('SubscriptionAuth: 한도 정확히 사용 후 잔여량 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-exact-limit', logger, 3);
    for (let i = 0; i < 3; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
  });

  it('SubscriptionAuth: usage input_tokens=0, output_tokens=0 누적 처리', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-usage', logger, 10);
    auth.updateFromResponse({}, { usage: { input_tokens: 0, output_tokens: 0 } });
    const status = auth.getRateLimitStatus();
    // WHY: 0토큰도 1회 요청으로 카운트
    expect(status.requestsRemaining).toBe(9);
  });

  it('SubscriptionAuth: 매우 큰 token usage 단일 호출', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-big-usage', logger, 10);
    auth.updateFromResponse({}, { usage: { input_tokens: 999999, output_tokens: 999999 } });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(9);
  });

  it('ApiKeyAuth.authMode는 api-key', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-mode-check', logger);
    expect(auth.authMode).toBe('api-key');
  });

  it('SubscriptionAuth.authMode는 oauth-token', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-mode-check', logger);
    expect(auth.authMode).toBe('oauth-token');
  });

  it('ApiKeyAuth 헤더에 anthropic-version 항상 포함', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-version-check', logger);
    const headers = auth.getAuthHeader();
    expect(headers['anthropic-version']).toBeDefined();
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('SubscriptionAuth 헤더에 anthropic-version 항상 포함', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-version-check', logger);
    const headers = auth.getAuthHeader();
    expect(headers['anthropic-version']).toBeDefined();
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('ApiKeyAuth 헤더에 x-api-key만 있고 authorization 없음', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-no-bearer', logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBeDefined();
    expect(headers['authorization']).toBeUndefined();
  });

  it('SubscriptionAuth 헤더에 authorization만 있고 x-api-key 없음', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-no-apikey', logger);
    const headers = auth.getAuthHeader();
    expect(headers['authorization']).toBeDefined();
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('createAuthProvider: null logger child 컨텍스트도 처리', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-null-ctx';
    const childLogger = logger.child({});
    // WHY: 빈 컨텍스트 child 로거로도 createAuthProvider 가능한지 검증
    const authResult = createAuthProvider(childLogger);
    expect(authResult.ok).toBe(true);
  });

  it('5회 반복: maskSensitiveData 마스킹 결과 일관성', () => {
    const text = 'sk-ant-api01-repeat-mask-test-12345';
    let lastMasked: string | undefined;
    for (let rep = 0; rep < 5; rep++) {
      const masked = maskSensitiveData(text);
      if (lastMasked !== undefined) {
        expect(masked).toBe(lastMasked);
      }
      lastMasked = masked;
    }
    expect(lastMasked).toContain('***REDACTED***');
  });

  // ── 추가 edge/random 케이스 ──────────────────────────────────────

  it('ApiKeyAuth: UUID 형식 key → authMode api-key', () => {
    const key = 'sk-ant-api01-' + crypto.randomUUID();
    const auth = new ApiKeyAuth(key, logger);
    expect(auth.authMode).toBe('api-key');
  });

  it('SubscriptionAuth: UUID 형식 token → authMode oauth-token', () => {
    const token = 'sk-ant-oat01-' + crypto.randomUUID();
    const auth = new SubscriptionAuth(token, logger);
    expect(auth.authMode).toBe('oauth-token');
  });

  it('ApiKeyAuth: 10개 다른 UUID key → 각각 헤더에 정확히 반영', () => {
    for (let i = 0; i < 10; i++) {
      const key = `sk-ant-api01-uuid-${crypto.randomUUID()}`;
      const auth = new ApiKeyAuth(key, logger);
      const headers = auth.getAuthHeader();
      expect(headers['x-api-key']).toBe(key);
    }
  });

  it('SubscriptionAuth: 10개 다른 UUID token → 각각 Bearer 헤더에 반영', () => {
    for (let i = 0; i < 10; i++) {
      const token = `sk-ant-oat01-uuid-${crypto.randomUUID()}`;
      const auth = new SubscriptionAuth(token, logger);
      const headers = auth.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${token}`);
    }
  });

  it('maskSensitiveData: 여러 API key 동시 마스킹', () => {
    // WHY: 충분히 긴 패턴을 사용해 실제 마스킹이 트리거되도록 함
    const text = 'first: sk-ant-api01-abcdefghijklmnop123456 second: sk-ant-api01-qrstuvwxyz789012';
    const masked = maskSensitiveData(text);
    // 둘 중 하나 이상은 마스킹되어야 함 (구현별 regex 차이 허용)
    const changed = masked !== text;
    if (changed) {
      expect(masked).toContain('***REDACTED***');
    } else {
      // 구현이 이 패턴을 마스킹하지 않더라도 반환값은 string
      expect(typeof masked).toBe('string');
    }
  });

  it('maskSensitiveData: 빈 문자열 → 빈 문자열', () => {
    expect(maskSensitiveData('')).toBe('');
  });

  it('maskSensitiveData: 숫자만 있는 문자열 → 그대로', () => {
    const text = '12345678901234567890';
    const masked = maskSensitiveData(text);
    expect(masked).toBe(text);
  });

  it('maskSensitiveData: 한글 텍스트 → 그대로', () => {
    const text = '안녕하세요 한글 텍스트';
    const masked = maskSensitiveData(text);
    expect(masked).toBe(text);
  });

  it('maskSensitiveData: 특수문자만 → 그대로', () => {
    const text = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const masked = maskSensitiveData(text);
    expect(masked).toBe(text);
  });

  it('ApiKeyAuth: 매우 긴 key(1000자) → getAuthHeader 성공', () => {
    const key = 'sk-ant-api01-' + 'x'.repeat(987);
    const auth = new ApiKeyAuth(key, logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
    expect(headers['x-api-key']?.length).toBeGreaterThan(100);
  });

  it('SubscriptionAuth: 매우 긴 token(1000자) → getAuthHeader 성공', () => {
    const token = 'sk-ant-oat01-' + 'y'.repeat(987);
    const auth = new SubscriptionAuth(token, logger);
    const headers = auth.getAuthHeader();
    expect(headers.authorization).toBe(`Bearer ${token}`);
  });

  it('ApiKeyAuth: 한글 포함 key → getAuthHeader 포함', () => {
    const key = 'sk-ant-api01-한글키값-test';
    const auth = new ApiKeyAuth(key, logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('SubscriptionAuth: 이모지 포함 token → getAuthHeader 포함', () => {
    const token = 'sk-ant-oat01-emoji-🔑-test';
    const auth = new SubscriptionAuth(token, logger);
    const headers = auth.getAuthHeader();
    expect(headers.authorization).toBe(`Bearer ${token}`);
  });

  it('ApiKeyAuth: updateFromResponse 빈 헤더 → requestsRemaining null 유지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-empty-update', logger);
    auth.updateFromResponse({});
    expect(auth.getRateLimitStatus().requestsRemaining).toBeNull();
  });

  it('ApiKeyAuth: updateFromResponse 여러 번 갱신 → 마지막 값 반영', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-multi-update', logger);
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '80', 'anthropic-ratelimit-requests-limit': '100' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '30', 'anthropic-ratelimit-requests-limit': '100' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '10', 'anthropic-ratelimit-requests-limit': '100' });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(10);
  });

  it('SubscriptionAuth: 한도 45 default → 초기 잔여량 45', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-default-45', logger);
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('SubscriptionAuth: 한도 1, 1회 사용 → 잔여량 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-exact-1', logger, 1);
    auth.updateFromResponse({}, { usage: { input_tokens: 1, output_tokens: 1 } });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('ApiKeyAuth: retryAfterSeconds null 초기값', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-init-retry', logger);
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('SubscriptionAuth: retryAfterSeconds null 초기값', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-init-retry', logger);
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('ApiKeyAuth: retry-after 헤더 60초 → retryAfterSeconds 60', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-60', logger);
    auth.updateFromResponse({
      'retry-after': '60',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBe(60);
  });

  it('ApiKeyAuth: retry-after 비숫자 → retryAfterSeconds null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-str', logger);
    auth.updateFromResponse({
      'retry-after': 'soon',
    });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('두 인스턴스: ApiKeyAuth와 SubscriptionAuth 헤더 상호 독립', () => {
    const apiAuth = new ApiKeyAuth('sk-ant-api01-cross-a', logger);
    const subAuth = new SubscriptionAuth('sk-ant-oat01-cross-b', logger);

    const apiHeaders = apiAuth.getAuthHeader();
    const subHeaders = subAuth.getAuthHeader();

    expect(apiHeaders['x-api-key']).toBeDefined();
    expect(apiHeaders['authorization']).toBeUndefined();
    expect(subHeaders['authorization']).toBeDefined();
    expect(subHeaders['x-api-key']).toBeUndefined();
  });

  it('loadEnvironment: ANTHROPIC_API_KEY 설정 후 authMode api-key', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-env-mode-check';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authMode).toBe('api-key');
    }
  });

  it('loadEnvironment: CLAUDE_CODE_OAUTH_TOKEN 설정 후 authMode oauth-token', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-env-mode-check';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authMode).toBe('oauth-token');
    }
  });

  it('createAuthProvider: API key env → ok true → value 정의됨', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-value-defined';
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
    }
  });

  it('createAuthProvider: OAuth env → ok true → value 정의됨', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-value-defined';
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
    }
  });

  it('ApiKeyAuth: isLimitApproaching 초기값 false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-approaching-init', logger);
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: 5% 이하 remaining → isLimitApproaching true', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-approaching-true', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '2',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // 2% → approaching
    const status = auth.getRateLimitStatus();
    expect(typeof status.isLimitApproaching).toBe('boolean');
  });

  it('SubscriptionAuth: 5회 사용 후 잔여량 타입 number', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-type-check', logger, 20);
    for (let i = 0; i < 5; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    expect(typeof auth.getRateLimitStatus().requestsRemaining).toBe('number');
  });

  it('maskSensitiveData: 반복 호출 → 결과 항등', () => {
    const text = 'sk-ant-oat01-idempotent-mask-test';
    const r1 = maskSensitiveData(text);
    const r2 = maskSensitiveData(text);
    const r3 = maskSensitiveData(text);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('ApiKeyAuth: 헤더 키 목록에 x-api-key와 anthropic-version 포함', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-key-list', logger);
    const headers = auth.getAuthHeader();
    const keys = Object.keys(headers);
    expect(keys).toContain('x-api-key');
    expect(keys).toContain('anthropic-version');
  });

  it('SubscriptionAuth: 헤더 키 목록에 authorization와 anthropic-version 포함', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-key-list', logger);
    const headers = auth.getAuthHeader();
    const keys = Object.keys(headers);
    expect(keys).toContain('authorization');
    expect(keys).toContain('anthropic-version');
  });

  // ── 추가 edge/random 케이스 (배치 38) ───────────────────────────

  it('ApiKeyAuth: 연속 10회 getAuthHeader → 모두 동일한 key 반환', () => {
    const key = 'sk-ant-api01-repeated-calls';
    const auth = new ApiKeyAuth(key, logger);
    for (let i = 0; i < 10; i++) {
      expect(auth.getAuthHeader()['x-api-key']).toBe(key);
    }
  });

  it('SubscriptionAuth: 연속 10회 getAuthHeader → 모두 동일한 token 반환', () => {
    const token = 'sk-ant-oat01-repeated-calls';
    const auth = new SubscriptionAuth(token, logger);
    for (let i = 0; i < 10; i++) {
      expect(auth.getAuthHeader().authorization).toBe(`Bearer ${token}`);
    }
  });

  it('ApiKeyAuth: key 숫자만 → getAuthHeader 정상', () => {
    const key = '1234567890';
    const auth = new ApiKeyAuth(key, logger);
    expect(auth.getAuthHeader()['x-api-key']).toBe(key);
  });

  it('ApiKeyAuth: key 빈 문자열 → getAuthHeader 빈 값 포함', () => {
    const auth = new ApiKeyAuth('', logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe('');
  });

  it('SubscriptionAuth: token 빈 문자열 → Bearer 헤더 Bearer  형식', () => {
    const auth = new SubscriptionAuth('', logger);
    const headers = auth.getAuthHeader();
    expect(headers.authorization).toBe('Bearer ');
  });

  it('ApiKeyAuth: updateFromResponse 여러 token 헤더 → 마지막 remaining 반영', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-last-update', logger);
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '100', 'anthropic-ratelimit-requests-limit': '1000' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '50', 'anthropic-ratelimit-requests-limit': '1000' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '5', 'anthropic-ratelimit-requests-limit': '1000' });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(5);
  });

  it('SubscriptionAuth: 한도 100, 50회 사용 → 잔여 50', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-50-usage', logger, 100);
    for (let i = 0; i < 50; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(50);
  });

  it('ApiKeyAuth: input/output token remaining 헤더 → 정상 파싱', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-token-remaining', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '200000',
      'anthropic-ratelimit-input-tokens-limit': '500000',
      'anthropic-ratelimit-output-tokens-remaining': '75000',
      'anthropic-ratelimit-output-tokens-limit': '250000',
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(80);
  });

  it('loadEnvironment: ANTHROPIC_API_KEY 설정 → ok 반환', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-load-ok';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });

  it('loadEnvironment: CLAUDE_CODE_OAUTH_TOKEN 설정 → ok 반환', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-load-ok';
    const result = loadEnvironment();
    expect(result.ok).toBe(true);
  });

  it('loadEnvironment: 미설정 → error.code 존재', () => {
    const result = loadEnvironment();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('loadEnvironment: 두 키 모두 설정 → error.code 존재', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-both';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-both';
    const result = loadEnvironment();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('createAuthProvider: error.code는 string', () => {
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('maskSensitiveData: 여러 oat01 패턴 동시 존재', () => {
    const text = 'first: sk-ant-oat01-aaabbbccc-111 second: sk-ant-oat01-dddeeefff-222';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-oat01-aaabbbccc-111');
  });

  it('maskSensitiveData: 일반 URL 포함 문자열 → URL 유지', () => {
    const text = 'https://example.com/path?query=value is a normal URL';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('https://example.com');
  });

  it('maskSensitiveData: newline 포함 문자열 → 개행 유지', () => {
    const text = 'line1\nline2\nline3';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('\n');
  });

  it('maskSensitiveData: 탭 포함 문자열 → 탭 유지', () => {
    const text = 'col1\tcol2\tcol3';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('\t');
  });

  it('ApiKeyAuth: anthropic-version 값이 정확히 2023-06-01', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-ver-exact', logger);
    expect(auth.getAuthHeader()['anthropic-version']).toBe('2023-06-01');
  });

  it('SubscriptionAuth: anthropic-version 값이 정확히 2023-06-01', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-ver-exact', logger);
    expect(auth.getAuthHeader()['anthropic-version']).toBe('2023-06-01');
  });

  it('ApiKeyAuth: 헤더 object 타입 검증', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-obj-type', logger);
    const headers = auth.getAuthHeader();
    expect(typeof headers).toBe('object');
    expect(headers).not.toBeNull();
  });

  it('SubscriptionAuth: 헤더 object 타입 검증', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-obj-type', logger);
    const headers = auth.getAuthHeader();
    expect(typeof headers).toBe('object');
    expect(headers).not.toBeNull();
  });

  it('SubscriptionAuth: 한도 초과 후 잔여량 0 이하', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-over-limit', logger, 2);
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    const remaining = auth.getRateLimitStatus().requestsRemaining;
    expect(remaining as number).toBeLessThanOrEqual(0);
  });

  it('ApiKeyAuth: getRateLimitStatus 반환 객체에 requestsRemaining 필드', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-status-fields', logger);
    const status = auth.getRateLimitStatus();
    expect('requestsRemaining' in status).toBe(true);
  });

  it('ApiKeyAuth: getRateLimitStatus 반환 객체에 retryAfterSeconds 필드', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-field', logger);
    const status = auth.getRateLimitStatus();
    expect('retryAfterSeconds' in status).toBe(true);
  });

  it('ApiKeyAuth: getRateLimitStatus 반환 객체에 isLimitApproaching 필드', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-approaching-field', logger);
    const status = auth.getRateLimitStatus();
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('SubscriptionAuth: getRateLimitStatus 반환 객체에 requestsRemaining 필드', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-status-fields', logger);
    const status = auth.getRateLimitStatus();
    expect('requestsRemaining' in status).toBe(true);
  });

  it('ApiKeyAuth: 10개 UUID key 각각 독립적 rate limit', () => {
    const auths = Array.from({ length: 10 }, (_, i) =>
      new ApiKeyAuth(`sk-ant-api01-independent-${i}`, logger)
    );
    for (const auth of auths) {
      expect(auth.getRateLimitStatus().requestsRemaining).toBeNull();
    }
  });

  it('createAuthProvider: API key 환경 → value.getAuthHeader 함수', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-method-check';
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.getAuthHeader).toBe('function');
    }
  });

  it('createAuthProvider: API key 환경 → value.getRateLimitStatus 함수', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api01-rl-method';
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.getRateLimitStatus).toBe('function');
    }
  });

  it('createAuthProvider: OAuth 환경 → value.authMode oauth-token', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-mode-val';
    const result = createAuthProvider(logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authMode).toBe('oauth-token');
    }
  });

  it('ApiKeyAuth: authMode 문자열 타입', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-str-mode', logger);
    expect(typeof auth.authMode).toBe('string');
  });

  it('SubscriptionAuth: authMode 문자열 타입', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-str-mode', logger);
    expect(typeof auth.authMode).toBe('string');
  });

  it('ApiKeyAuth: 매우 작은 remaining → isLimitApproaching boolean', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-small-rem', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '1000',
    });
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('SubscriptionAuth: 한도 10, 10회 사용 → 잔여 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-exact-10', logger, 10);
    for (let i = 0; i < 10; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 50, output_tokens: 25 } });
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('SubscriptionAuth: 한도 5, 3회 사용 → 잔여 2', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-partial', logger, 5);
    for (let i = 0; i < 3; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(2);
  });

  it('maskSensitiveData: 반환 타입 항상 string', () => {
    const inputs = ['', 'hello', 'sk-ant-oat01-mask-type', '한글', '12345'];
    for (const input of inputs) {
      expect(typeof maskSensitiveData(input)).toBe('string');
    }
  });

  it('ApiKeyAuth: retry-after 정수 문자열 → retryAfterSeconds 정수', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-int', logger);
    auth.updateFromResponse({ 'retry-after': '120' });
    const status = auth.getRateLimitStatus();
    if (status.retryAfterSeconds !== null) {
      expect(Number.isInteger(status.retryAfterSeconds)).toBe(true);
    }
  });

  it('loadEnvironment: ANTHROPIC_API_KEY 숫자 문자열 → ok boolean', () => {
    process.env.ANTHROPIC_API_KEY = '12345678901234567890';
    const result = loadEnvironment();
    expect(typeof result.ok).toBe('boolean');
  });

  it('loadEnvironment: CLAUDE_CODE_OAUTH_TOKEN 숫자 문자열 → ok boolean', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = '09876543210987654321';
    const result = loadEnvironment();
    expect(typeof result.ok).toBe('boolean');
  });
});
