import { beforeEach, describe, expect, it } from 'bun:test';
import { ApiKeyAuth } from '../../../src/auth/api-key-auth.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

// ── 테스트 헬퍼 ─────────────────────────────────────────────

function createAuth(apiKey = 'sk-ant-api01-test-key'): ApiKeyAuth {
  const logger = new ConsoleLogger('error');
  return new ApiKeyAuth(apiKey, logger);
}

// ── getAuthHeader ───────────────────────────────────────────

describe('ApiKeyAuth.getAuthHeader', () => {
  it('x-api-key와 anthropic-version 헤더를 반환한다', () => {
    const auth = createAuth('sk-ant-api01-my-key');

    const headers = auth.getAuthHeader();

    expect(headers['x-api-key']).toBe('sk-ant-api01-my-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('빈 API 키로도 헤더를 생성한다', () => {
    const auth = createAuth('');

    const headers = auth.getAuthHeader();

    expect(headers['x-api-key']).toBe('');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('authMode가 api-key이다', () => {
    const auth = createAuth();

    expect(auth.authMode).toBe('api-key');
  });
});

// ── getRateLimitStatus (초기 상태) ──────────────────────────

describe('ApiKeyAuth.getRateLimitStatus (초기 상태)', () => {
  it('모든 필드가 null이고 isLimitApproaching이 false이다', () => {
    const auth = createAuth();

    const status = auth.getRateLimitStatus();

    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
    expect(status.retryAfterSeconds).toBeNull();
    expect(status.isLimitApproaching).toBe(false);
  });
});

// ── updateFromResponse (레이트 리밋 헤더 파싱) ──────────────

describe('ApiKeyAuth.updateFromResponse', () => {
  let auth: ApiKeyAuth;

  beforeEach(() => {
    auth = createAuth();
  });

  it('유효한 레이트 리밋 헤더를 파싱한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-input-tokens-remaining': '10000',
      'anthropic-ratelimit-output-tokens-remaining': '5000',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    };

    const result = auth.updateFromResponse(headers);

    expect(result.ok).toBe(true);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(50);
    expect(status.inputTokensRemaining).toBe(10000);
    expect(status.outputTokensRemaining).toBe(5000);
  });

  it('잔여 0을 정상적으로 파싱한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '0',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-remaining': '0',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.inputTokensRemaining).toBe(0);
    expect(status.outputTokensRemaining).toBe(0);
  });

  it('헤더가 없으면 null을 유지한다', () => {
    auth.updateFromResponse({});

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
  });

  it('숫자가 아닌 값은 null로 처리한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': 'not-a-number',
      'anthropic-ratelimit-input-tokens-remaining': 'abc',
      'anthropic-ratelimit-output-tokens-remaining': 'NaN',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
  });

  it('빈 문자열 값은 null로 처리한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': '',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('음수 값은 null로 처리한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': '-5',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('Infinity 값은 null로 처리한다', () => {
    const headers = {
      'anthropic-ratelimit-requests-remaining': 'Infinity',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('retry-after 헤더를 파싱한다', () => {
    const headers = {
      'retry-after': '30',
    };

    auth.updateFromResponse(headers);

    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(30);
  });

  it('retry-after가 없으면 null이다', () => {
    auth.updateFromResponse({});

    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('여러 번 호출하면 마지막 값으로 갱신된다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '100',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(5);
  });
});

// ── isLimitApproaching (20% 임계값) ─────────────────────────

describe('ApiKeyAuth.isLimitApproaching', () => {
  let auth: ApiKeyAuth;

  beforeEach(() => {
    auth = createAuth();
  });

  it('잔여 > 20%일 때 false를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('잔여 = 20%일 때 true를 반환한다 (경계 조건)', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '20',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('잔여 < 20%일 때 true를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('잔여 0일 때 true를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('limit이 없으면 false를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('remaining이 없으면 false를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('입력 토큰 한도 접근 시 true를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '5000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('출력 토큰 한도 접근 시 true를 반환한다', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '500',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('limit이 0이면 false를 반환한다 (0으로 나누기 방지)', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '0',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });
});
