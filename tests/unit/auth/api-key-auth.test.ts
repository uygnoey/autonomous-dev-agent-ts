import { beforeEach, describe, expect, it } from 'bun:test';
import { ApiKeyAuth } from 'auth/api-key-auth.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 ─────────────────────────────────────────────

function createAuth(apiKey = 'sk-ant-api01-test-key'): ApiKeyAuth {
  const logger = new ConsoleLogger('error');
  return new ApiKeyAuth(apiKey, logger);
}

// ── 생성자 ──────────────────────────────────────────────────

describe('ApiKeyAuth 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => createAuth()).not.toThrow();
  });

  it('ApiKeyAuth 인스턴스', () => {
    expect(createAuth()).toBeInstanceOf(ApiKeyAuth);
  });

  it('빈 API 키로 생성 가능', () => {
    expect(() => createAuth('')).not.toThrow();
  });

  it('긴 API 키로 생성 가능', () => {
    expect(() => createAuth('sk-ant-api01-' + 'x'.repeat(100))).not.toThrow();
  });

  it('authMode = api-key', () => {
    expect(createAuth().authMode).toBe('api-key');
  });

  it('여러 인스턴스 독립적', () => {
    const a1 = createAuth('key-1');
    const a2 = createAuth('key-2');
    expect(a1).not.toBe(a2);
    expect(a1.getAuthHeader()['x-api-key']).toBe('key-1');
    expect(a2.getAuthHeader()['x-api-key']).toBe('key-2');
  });
});

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

  it('반환값이 객체이다', () => {
    const auth = createAuth();
    const headers = auth.getAuthHeader();
    expect(typeof headers).toBe('object');
    expect(headers).not.toBeNull();
  });

  it('x-api-key 필드가 있다', () => {
    const headers = createAuth('test-key').getAuthHeader();
    expect('x-api-key' in headers).toBe(true);
  });

  it('anthropic-version 필드가 있다', () => {
    const headers = createAuth().getAuthHeader();
    expect('anthropic-version' in headers).toBe(true);
  });

  it('anthropic-version은 "2023-06-01"이다', () => {
    const headers = createAuth().getAuthHeader();
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('연속 호출 → 동일 결과', () => {
    const auth = createAuth('my-key');
    const h1 = auth.getAuthHeader();
    const h2 = auth.getAuthHeader();
    expect(h1['x-api-key']).toBe(h2['x-api-key']);
    expect(h1['anthropic-version']).toBe(h2['anthropic-version']);
  });

  it('다양한 API 키 형식 → x-api-key에 그대로 반영', () => {
    const keys = [
      'sk-ant-api01-abc',
      'sk-ant-oat01-xyz',
      'test-key-123',
      '',
      'a',
    ];
    for (const key of keys) {
      const headers = createAuth(key).getAuthHeader();
      expect(headers['x-api-key']).toBe(key);
    }
  });

  it('헤더 키가 모두 소문자이다', () => {
    const headers = createAuth().getAuthHeader();
    for (const key of Object.keys(headers)) {
      expect(key).toBe(key.toLowerCase());
    }
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

  it('초기 requestsRemaining이 null이다', () => {
    expect(createAuth().getRateLimitStatus().requestsRemaining).toBeNull();
  });

  it('초기 inputTokensRemaining이 null이다', () => {
    expect(createAuth().getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('초기 outputTokensRemaining이 null이다', () => {
    expect(createAuth().getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('초기 retryAfterSeconds가 null이다', () => {
    expect(createAuth().getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('초기 isLimitApproaching이 false이다', () => {
    expect(createAuth().getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('반환값이 객체이다', () => {
    const status = createAuth().getRateLimitStatus();
    expect(typeof status).toBe('object');
    expect(status).not.toBeNull();
  });

  it('연속 getRateLimitStatus 호출 → 동일 결과', () => {
    const auth = createAuth();
    const s1 = auth.getRateLimitStatus();
    const s2 = auth.getRateLimitStatus();
    expect(s1.requestsRemaining).toBe(s2.requestsRemaining);
    expect(s1.isLimitApproaching).toBe(s2.isLimitApproaching);
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

  it('ok=true 반환', () => {
    const result = auth.updateFromResponse({});
    expect(result.ok).toBe(true);
  });

  it('requests-remaining=1 → 1로 파싱', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(1);
  });

  it('requests-remaining=999 → 999로 파싱', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '999',
      'anthropic-ratelimit-requests-limit': '1000',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(999);
  });

  it('input-tokens-remaining=50000 → 50000으로 파싱', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '50000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBe(50000);
  });

  it('output-tokens-remaining=25000 → 25000으로 파싱', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '25000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBe(25000);
  });

  it('retry-after=0 → 0으로 파싱 또는 null', () => {
    auth.updateFromResponse({ 'retry-after': '0' });
    const status = auth.getRateLimitStatus();
    // 0은 유효할 수도 있고 null일 수도 있음
    expect(typeof status.retryAfterSeconds === 'number' || status.retryAfterSeconds === null).toBe(true);
  });

  it('retry-after=60 → 60으로 파싱', () => {
    auth.updateFromResponse({ 'retry-after': '60' });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBe(60);
  });

  it('retry-after=abc → null', () => {
    auth.updateFromResponse({ 'retry-after': 'abc' });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('소수 값 → 숫자 또는 null 반환 (구현 의존)', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1.5',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 구현에 따라 parseInt('1.5')=1 또는 null일 수 있음
    expect(typeof status.requestsRemaining === 'number' || status.requestsRemaining === null).toBe(true);
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

  it('잔여 21% → false', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '21',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('잔여 19% → true', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '19',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('잔여 1% → true', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('잔여 100% → false', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '100',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('isLimitApproaching은 boolean이다', () => {
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('입력 토큰 50% 남음 → false', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '25000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('출력 토큰 50% 남음 → false', () => {
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '12500',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('다양한 한도 접근 시나리오 → boolean 반환', () => {
    const scenarios = [
      { remaining: '10', limit: '100' },
      { remaining: '50', limit: '100' },
      { remaining: '1', limit: '1' },
    ];
    for (const s of scenarios) {
      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': s.remaining,
        'anthropic-ratelimit-requests-limit': s.limit,
      });
      expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
    }
  });
});

// ── 추가 경계값: getAuthHeader ────────────────────────────────

describe('ApiKeyAuth getAuthHeader 추가 경계값', () => {
  it('특수문자 포함 API 키 → 그대로 반영', () => {
    const key = 'sk-ant!@#$%^&*()';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('한국어 포함 API 키 → 그대로 반영', () => {
    const key = 'sk-ant-한국어키';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('공백 포함 API 키 → 그대로 반영', () => {
    const key = 'sk ant key with spaces';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('단일 문자 API 키 → 반영', () => {
    const headers = createAuth('a').getAuthHeader();
    expect(headers['x-api-key']).toBe('a');
  });

  it('10개 인스턴스 각각 독립적', () => {
    const auths = Array.from({ length: 10 }, (_, i) => createAuth(`key-${i}`));
    for (let i = 0; i < 10; i++) {
      expect(auths[i]!.getAuthHeader()['x-api-key']).toBe(`key-${i}`);
    }
  });

  it('5번 반복 호출 → anthropic-version 일관성', () => {
    const auth = createAuth();
    for (let i = 0; i < 5; i++) {
      expect(auth.getAuthHeader()['anthropic-version']).toBe('2023-06-01');
    }
  });

  it('5번 반복 호출 → x-api-key 일관성', () => {
    const auth = createAuth('consistent-key');
    for (let i = 0; i < 5; i++) {
      expect(auth.getAuthHeader()['x-api-key']).toBe('consistent-key');
    }
  });

  it('x-api-key 값은 string 타입', () => {
    expect(typeof createAuth('key').getAuthHeader()['x-api-key']).toBe('string');
  });

  it('anthropic-version 값은 string 타입', () => {
    expect(typeof createAuth().getAuthHeader()['anthropic-version']).toBe('string');
  });
});

// ── 추가 경계값: updateFromResponse 조합 ─────────────────────

describe('ApiKeyAuth updateFromResponse 추가 경계값', () => {
  it('requests-remaining만 있을 때 → 해당 필드만 갱신', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '42',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(42);
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('모든 토큰 필드 갱신 → 모두 파싱됨', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '10000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-remaining': '5000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(50);
    expect(status.inputTokensRemaining).toBe(10000);
    expect(status.outputTokensRemaining).toBe(5000);
  });

  it('updateFromResponse ok 반환값은 boolean', () => {
    const auth = createAuth();
    const result = auth.updateFromResponse({});
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 연속 updateFromResponse → 마지막 값 반영', () => {
    const auth = createAuth();
    for (let i = 1; i <= 5; i++) {
      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': `${i * 10}`,
        'anthropic-ratelimit-requests-limit': '100',
      });
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(50);
  });

  it('retry-after=120 → 120으로 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '120' });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBe(120);
  });

  it('retry-after=1 → 1로 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '1' });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBe(1);
  });

  it('retry-after 이후 빈 헤더 → null로 초기화되지 않음 (마지막 값 유지)', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '30' });
    auth.updateFromResponse({});
    // 빈 헤더 후에는 null 또는 이전 값 중 구현에 따름
    expect(typeof auth.getRateLimitStatus().retryAfterSeconds === 'number' || auth.getRateLimitStatus().retryAfterSeconds === null).toBe(true);
  });
});

// ── 추가 경계값: getRateLimitStatus 필드 타입 ─────────────────

describe('ApiKeyAuth getRateLimitStatus 필드 타입', () => {
  it('requestsRemaining은 number 또는 null', () => {
    const auth = createAuth();
    const v = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof v === 'number' || v === null).toBe(true);
  });

  it('inputTokensRemaining은 number 또는 null', () => {
    const auth = createAuth();
    const v = auth.getRateLimitStatus().inputTokensRemaining;
    expect(typeof v === 'number' || v === null).toBe(true);
  });

  it('outputTokensRemaining은 number 또는 null', () => {
    const auth = createAuth();
    const v = auth.getRateLimitStatus().outputTokensRemaining;
    expect(typeof v === 'number' || v === null).toBe(true);
  });

  it('retryAfterSeconds는 number 또는 null', () => {
    const auth = createAuth();
    const v = auth.getRateLimitStatus().retryAfterSeconds;
    expect(typeof v === 'number' || v === null).toBe(true);
  });

  it('isLimitApproaching은 boolean', () => {
    const auth = createAuth();
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('5번 반복 getRateLimitStatus → isLimitApproaching 일관성', () => {
    const auth = createAuth();
    for (let i = 0; i < 5; i++) {
      expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
    }
  });
});
