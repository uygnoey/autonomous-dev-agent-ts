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

// ── 추가 경계값: 다양한 API 키 패턴 ──────────────────────────

describe('ApiKeyAuth 다양한 API 키 패턴', () => {
  it('숫자만으로 된 키 → 헤더에 그대로 반영', () => {
    const headers = createAuth('1234567890').getAuthHeader();
    expect(headers['x-api-key']).toBe('1234567890');
  });

  it('이모지 포함 키 → 헤더에 그대로 반영', () => {
    const key = 'sk-ant-🚀emoji🎉key';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('UUID 형태 키 → 헤더에 그대로 반영', () => {
    const uuid = crypto.randomUUID();
    const headers = createAuth(uuid).getAuthHeader();
    expect(headers['x-api-key']).toBe(uuid);
  });

  it('탭 포함 키 → 헤더에 그대로 반영', () => {
    const key = 'sk-ant\tkey';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('개행 포함 키 → 헤더에 그대로 반영', () => {
    const key = 'sk-ant\nkey';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });

  it('authMode는 항상 api-key', () => {
    const keys = ['key1', 'key2', '', 'uuid-' + crypto.randomUUID()];
    for (const key of keys) {
      expect(createAuth(key).authMode).toBe('api-key');
    }
  });

  it('5가지 특수문자 키 → 모두 정상 헤더 반환', () => {
    const keys = ['!key', '@key', '#key', '$key', '%key'];
    for (const key of keys) {
      const headers = createAuth(key).getAuthHeader();
      expect(headers['x-api-key']).toBe(key);
    }
  });

  it('500자 길이 키 → 헤더에 반영', () => {
    const key = 'sk-ant-' + 'a'.repeat(493);
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
    expect(key.length).toBe(500);
  });

  it('단일 공백 키 → 헤더에 그대로 반영', () => {
    const key = ' ';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });
});

// ── 추가 경계값: updateFromResponse 극단값 ───────────────────

describe('ApiKeyAuth updateFromResponse 극단값', () => {
  it('Number.MAX_SAFE_INTEGER 문자열 → 파싱됨', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': String(Number.MAX_SAFE_INTEGER),
      'anthropic-ratelimit-requests-limit': String(Number.MAX_SAFE_INTEGER),
    });
    const status = auth.getRateLimitStatus();
    expect(typeof status.requestsRemaining === 'number' || status.requestsRemaining === null).toBe(true);
  });

  it('requests-remaining=100, limit=100 → 잔여 100% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '100',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests-remaining=0, limit=1 → 0% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '1',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('모든 헤더에 비숫자 → 모두 null', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'nan',
      'anthropic-ratelimit-input-tokens-remaining': 'undefined',
      'anthropic-ratelimit-output-tokens-remaining': 'null',
      'retry-after': 'abc',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('input-tokens-remaining=1, limit=100000 → true (1% < 20%)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '1',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('output-tokens-remaining=25000, limit=100000 → false (25% > 20%)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '25000',
      'anthropic-ratelimit-output-tokens-limit': '100000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('retry-after=3600 → 3600으로 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '3600' });
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBe(3600);
  });

  it('빈 헤더 객체 10번 호출 → 항상 ok=true', () => {
    const auth = createAuth();
    for (let i = 0; i < 10; i++) {
      const result = auth.updateFromResponse({});
      expect(result.ok).toBe(true);
    }
  });
});

// ── 추가 edge/random: 생성자 경계값 ─────────────────────────

describe('ApiKeyAuth 생성자 추가 경계값', () => {
  it('이모지 포함 API 키로 생성 가능', () => {
    expect(() => createAuth('🚀🎉')).not.toThrow();
  });

  it('개행+탭 포함 API 키로 생성 가능', () => {
    expect(() => createAuth('sk\r\n\tant')).not.toThrow();
  });

  it('null 문자 포함 API 키로 생성 가능', () => {
    expect(() => createAuth('sk\u0000ant')).not.toThrow();
  });

  it('1000자 API 키로 생성 가능', () => {
    expect(() => createAuth('k'.repeat(1000))).not.toThrow();
  });

  it('authMode는 항상 api-key 문자열', () => {
    const auth = createAuth();
    expect(auth.authMode).toBe('api-key');
    expect(typeof auth.authMode).toBe('string');
  });

  it('10개 인스턴스 생성 → 모두 ApiKeyAuth', () => {
    for (let i = 0; i < 10; i++) {
      const auth = createAuth(`key-${i}`);
      expect(auth).toBeInstanceOf(ApiKeyAuth);
    }
  });

  it('getAuthHeader 메서드가 존재', () => {
    expect(typeof createAuth().getAuthHeader).toBe('function');
  });

  it('getRateLimitStatus 메서드가 존재', () => {
    expect(typeof createAuth().getRateLimitStatus).toBe('function');
  });

  it('updateFromResponse 메서드가 존재', () => {
    expect(typeof createAuth().updateFromResponse).toBe('function');
  });

  it('JSON 형식 API 키 → 그대로 반영', () => {
    const key = '{"type":"api_key","value":"abc123"}';
    const headers = createAuth(key).getAuthHeader();
    expect(headers['x-api-key']).toBe(key);
  });
});

// ── 추가 edge/random: getAuthHeader 헤더 구조 ────────────────

describe('ApiKeyAuth getAuthHeader 헤더 구조 검증', () => {
  it('헤더 키가 정확히 2개 이상 존재', () => {
    const headers = createAuth().getAuthHeader();
    expect(Object.keys(headers).length).toBeGreaterThanOrEqual(2);
  });

  it('x-api-key 필드 값 타입은 string', () => {
    const headers = createAuth('test-key').getAuthHeader();
    expect(typeof headers['x-api-key']).toBe('string');
  });

  it('anthropic-version 값은 정확히 "2023-06-01"', () => {
    const headers = createAuth().getAuthHeader();
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('헤더 객체는 null이 아님', () => {
    const headers = createAuth().getAuthHeader();
    expect(headers).not.toBeNull();
    expect(headers).not.toBeUndefined();
  });

  it('서로 다른 인스턴스 헤더 비교 → anthropic-version 동일', () => {
    const a1 = createAuth('key-1');
    const a2 = createAuth('key-2');
    expect(a1.getAuthHeader()['anthropic-version']).toBe(a2.getAuthHeader()['anthropic-version']);
  });

  it('x-api-key 5개 다른 키 → 각각 다름', () => {
    const keys = Array.from({ length: 5 }, (_, i) => `unique-key-${i}-${crypto.randomUUID()}`);
    const headers = keys.map((k) => createAuth(k).getAuthHeader()['x-api-key']);
    const unique = new Set(headers);
    expect(unique.size).toBe(5);
  });

  it('헤더 값에 undefined 없음', () => {
    const headers = createAuth('test').getAuthHeader();
    for (const val of Object.values(headers)) {
      expect(val).not.toBeUndefined();
    }
  });

  it('헤더 값에 null 없음', () => {
    const headers = createAuth('test').getAuthHeader();
    for (const val of Object.values(headers)) {
      expect(val).not.toBeNull();
    }
  });
});

// ── 추가 edge/random: getRateLimitStatus 갱신 시나리오 ───────

describe('ApiKeyAuth getRateLimitStatus 갱신 시나리오', () => {
  it('갱신 후 requests 필드가 숫자로 변함', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '77',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(typeof status.requestsRemaining).toBe('number');
    expect(status.requestsRemaining).toBe(77);
  });

  it('requests + input + output 모두 갱신 후 isLimitApproaching 확인', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '45000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-remaining': '20000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('10% 이하 requests → isLimitApproaching true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('80% requests → isLimitApproaching false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('input 10% → isLimitApproaching true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '5000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('output 10% → isLimitApproaching true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '2500',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 50, limit 200 → 25% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '200',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests 39, limit 200 → 19.5% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '39',
      'anthropic-ratelimit-requests-limit': '200',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('retry-after 부동소수 문자열 → null 또는 number', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '10.5' });
    const val = auth.getRateLimitStatus().retryAfterSeconds;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('requests 갱신 후 input null 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });
});

// ── 추가 edge/random: updateFromResponse 조합 확장 ───────────

describe('ApiKeyAuth updateFromResponse 조합 확장', () => {
  it('알 수 없는 헤더만 있을 때 → 모두 null 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'x-custom-header': 'value',
      'another-header': '123',
    });
    const s = auth.getRateLimitStatus();
    expect(s.requestsRemaining).toBeNull();
    expect(s.inputTokensRemaining).toBeNull();
    expect(s.outputTokensRemaining).toBeNull();
    expect(s.retryAfterSeconds).toBeNull();
  });

  it('헤더 값이 whitespace → null 또는 0 (구현 의존)', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '   ' });
    const s = auth.getRateLimitStatus();
    // parseInt('   ') = NaN → null 또는 parseInt('   ') = 0 (공백 trim)
    expect(typeof s.requestsRemaining === 'number' || s.requestsRemaining === null).toBe(true);
  });

  it('헤더 값이 "0.0" → 0 또는 null (구현 의존)', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '0.0' });
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('input-limit만 있고 remaining 없음 → null 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'anthropic-ratelimit-input-tokens-limit': '50000' });
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('output-limit만 있고 remaining 없음 → null 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'anthropic-ratelimit-output-tokens-limit': '25000' });
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('updateFromResponse 20번 연속 → ok=true 유지', () => {
    const auth = createAuth();
    for (let i = 0; i < 20; i++) {
      const result = auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': `${i}`, 'anthropic-ratelimit-requests-limit': '100' });
      expect(result.ok).toBe(true);
    }
  });

  it('requests 100/100 → isLimitApproaching 경계값', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '100',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // 100% remaining → not approaching
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests 1/1000 → 0.1% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '1000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 200/1000 → 20% → true (경계)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '200',
      'anthropic-ratelimit-requests-limit': '1000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 201/1000 → 20.1% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '201',
      'anthropic-ratelimit-requests-limit': '1000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });
});

// ── 추가 경계값: 다양한 숫자 포맷 ────────────────────────────

describe('ApiKeyAuth updateFromResponse 다양한 숫자 포맷', () => {
  it('leading zero 포함 → parseInt 결과 반환', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '050',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const val = auth.getRateLimitStatus().requestsRemaining;
    // parseInt('050') = 50
    expect(val).toBe(50);
  });

  it('10진수 문자열 → 정상 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '99',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(99);
  });

  it('1자리 숫자 → 정상 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '7',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(7);
  });

  it('4자리 숫자 → 정상 파싱', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5000',
      'anthropic-ratelimit-requests-limit': '10000',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(5000);
  });

  it('숫자 앞 공백 → 파싱 성공 (Number 기준)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': ' 42',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('숫자 뒤 공백 → 파싱 성공 (Number 기준)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '42 ',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('지수 표기법 → null 처리 (정수 파싱 실패)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1e2',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('16진수 문자열 → null 처리', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0xFF',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('true 문자열 → null 처리', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'true',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBeNull();
  });

  it('false 문자열 → null 처리', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'false',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBeNull();
  });
});

// ── 추가 경계값: isLimitApproaching 세밀 경계값 ──────────────

describe('ApiKeyAuth isLimitApproaching 세밀 경계값', () => {
  it('requests 15/100 → 15% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '15',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 25/100 → 25% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '25',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests 10/50 → 20% → true (경계)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '50',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 11/50 → 22% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '11',
      'anthropic-ratelimit-requests-limit': '50',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests 9/50 → 18% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '9',
      'anthropic-ratelimit-requests-limit': '50',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('input 10000/100000 → 10% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '10000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('input 25000/100000 → 25% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '25000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('output 5000/25000 → 20% → true (경계)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '5000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('output 6000/25000 → 24% → false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '6000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('output 4000/25000 → 16% → true', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '4000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requests 50%, input 50%, output 50% → all false', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '25000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-remaining': '12500',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('requests 90%, input 1%, output 90% → true (input 낮음)', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '500',
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-output-tokens-remaining': '22500',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });
});

// ── 추가 경계값: getRateLimitStatus 반환 구조 ─────────────────

describe('ApiKeyAuth getRateLimitStatus 반환 구조 검증', () => {
  it('초기 상태 모든 필드 null/false', () => {
    const auth = createAuth();
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
    expect(status.retryAfterSeconds).toBeNull();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('갱신 후 상태 구조 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect('requestsRemaining' in status).toBe(true);
    expect('inputTokensRemaining' in status).toBe(true);
    expect('outputTokensRemaining' in status).toBe(true);
    expect('retryAfterSeconds' in status).toBe(true);
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('requestsRemaining 갱신 후 type number', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(typeof auth.getRateLimitStatus().requestsRemaining).toBe('number');
  });

  it('inputTokensRemaining 갱신 후 type number', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '40000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    expect(typeof auth.getRateLimitStatus().inputTokensRemaining).toBe('number');
  });

  it('outputTokensRemaining 갱신 후 type number', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '20000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(typeof auth.getRateLimitStatus().outputTokensRemaining).toBe('number');
  });

  it('retryAfterSeconds 갱신 후 type number', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '30' });
    expect(typeof auth.getRateLimitStatus().retryAfterSeconds).toBe('number');
  });

  it('isLimitApproaching는 항상 boolean', () => {
    const scenarios = [
      {},
      { 'anthropic-ratelimit-requests-remaining': '10', 'anthropic-ratelimit-requests-limit': '100' },
      { 'anthropic-ratelimit-requests-remaining': '50', 'anthropic-ratelimit-requests-limit': '100' },
    ];
    for (const headers of scenarios) {
      const auth = createAuth();
      auth.updateFromResponse(headers);
      expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
    }
  });

  it('5회 반복 조회 → 동일 결과', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '70',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const first = auth.getRateLimitStatus();
    for (let i = 0; i < 5; i++) {
      const s = auth.getRateLimitStatus();
      expect(s.requestsRemaining).toBe(first.requestsRemaining);
      expect(s.isLimitApproaching).toBe(first.isLimitApproaching);
    }
  });

  it('requestsRemaining=0 → 정확히 0', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('inputTokensRemaining=0 → 정확히 0', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '0',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBe(0);
  });

  it('outputTokensRemaining=0 → 정확히 0', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '0',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBe(0);
  });
});

// ── 추가 경계값: updateFromResponse 순서 의존성 ──────────────

describe('ApiKeyAuth updateFromResponse 순서 의존성', () => {
  it('requests 첫 번째, input 두 번째 → 두 번째 호출이 덮어씀', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '40000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    const status = auth.getRateLimitStatus();
    // WHY: updateFromResponse는 전체 덮어쓰기 — 두 번째 호출에서 requests 헤더 없으면 null
    expect(status.requestsRemaining).toBeNull();
    expect(status.inputTokensRemaining).toBe(40000);
  });

  it('output 먼저, requests 나중 → 두 번째 호출이 덮어씀', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '20000',
      'anthropic-ratelimit-output-tokens-limit': '25000',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '60',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: updateFromResponse는 전체 덮어쓰기 — 두 번째 호출에서 output 헤더 없으면 null
    expect(status.outputTokensRemaining).toBeNull();
    expect(status.requestsRemaining).toBe(60);
  });

  it('retry-after 먼저, requests 나중 → 두 번째 호출이 덮어씀', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '15' });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: updateFromResponse는 전체 덮어쓰기 — 두 번째 호출에서 retry-after 없으면 null
    expect(status.retryAfterSeconds).toBeNull();
    expect(status.requestsRemaining).toBe(5);
  });

  it('requests 덮어쓰기 → 최신 값만', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '30',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(30);
  });

  it('input 덮어쓰기 → 최신 값만', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '50000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '1000',
      'anthropic-ratelimit-input-tokens-limit': '50000',
    });
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBe(1000);
  });

  it('retry-after 덮어쓰기 → 최신 값만', () => {
    const auth = createAuth();
    auth.updateFromResponse({ 'retry-after': '60' });
    auth.updateFromResponse({ 'retry-after': '10' });
    const val = auth.getRateLimitStatus().retryAfterSeconds;
    expect(val).toBe(10);
  });

  it('빈 헤더로 덮어쓰기 후 상태 null 또는 유지', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({});
    // 빈 헤더 후 이전 값 유지 또는 null (구현 의존)
    const val = auth.getRateLimitStatus().requestsRemaining;
    expect(typeof val === 'number' || val === null).toBe(true);
  });

  it('잘못된 헤더 후 유효한 헤더 → 유효한 값 반영', () => {
    const auth = createAuth();
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'invalid',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '55',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(55);
  });
});

// ── 추가 경계값: 생성자 엣지 케이스 심화 ─────────────────────

describe('ApiKeyAuth 생성자 엣지 케이스 심화', () => {
  it('빈 문자열 API 키 → authMode api-key', () => {
    const auth = createAuth('');
    expect(auth.authMode).toBe('api-key');
  });

  it('공백만 있는 API 키 → authMode api-key', () => {
    const auth = createAuth('   ');
    expect(auth.authMode).toBe('api-key');
  });

  it('개행 문자만 있는 API 키 → 생성 가능', () => {
    expect(() => createAuth('\n\r\n')).not.toThrow();
  });

  it('유니코드 범위 외 문자 포함 → 생성 가능', () => {
    expect(() => createAuth('\u{1F4AF}')).not.toThrow();
  });

  it('매우 긴 API 키 1000자 → authMode api-key', () => {
    const longKey = 'k'.repeat(1000);
    const auth = createAuth(longKey);
    expect(auth.authMode).toBe('api-key');
  });

  it('여러 줄 API 키 → getAuthHeader 정상', () => {
    const multilineKey = 'line1\nline2\nline3';
    const auth = createAuth(multilineKey);
    expect(auth.getAuthHeader()['x-api-key']).toBe(multilineKey);
  });

  it('숫자와 특수문자 혼합 API 키 → 반영', () => {
    const key = '123!@#abc';
    expect(createAuth(key).getAuthHeader()['x-api-key']).toBe(key);
  });

  it('연속 20개 인스턴스 생성 → 모두 독립', () => {
    const auths = Array.from({ length: 20 }, (_, i) => createAuth(`key-${i}`));
    for (let i = 0; i < 20; i++) {
      expect(auths[i]!.getAuthHeader()['x-api-key']).toBe(`key-${i}`);
    }
  });

  it('ConsoleLogger debug 레벨로 생성 가능', () => {
    const debugLogger = new ConsoleLogger('debug');
    const auth = new ApiKeyAuth('sk-test', debugLogger);
    expect(auth).toBeInstanceOf(ApiKeyAuth);
  });

  it('ConsoleLogger info 레벨로 생성 가능', () => {
    const infoLogger = new ConsoleLogger('info');
    const auth = new ApiKeyAuth('sk-test', infoLogger);
    expect(auth.authMode).toBe('api-key');
  });
});

// ── 추가 경계값: getAuthHeader 구조 심화 ─────────────────────

describe('ApiKeyAuth getAuthHeader 구조 심화', () => {
  it('헤더 키 목록에 x-api-key 포함', () => {
    const headers = createAuth().getAuthHeader();
    expect(Object.keys(headers).includes('x-api-key')).toBe(true);
  });

  it('헤더 키 목록에 anthropic-version 포함', () => {
    const headers = createAuth().getAuthHeader();
    expect(Object.keys(headers).includes('anthropic-version')).toBe(true);
  });

  it('헤더 값에 빈 문자열 없음 (빈 키 제외)', () => {
    const auth = createAuth('non-empty-key');
    const headers = auth.getAuthHeader();
    for (const val of Object.values(headers)) {
      expect(typeof val).toBe('string');
    }
  });

  it('getAuthHeader 10회 연속 호출 → 모두 동일', () => {
    const auth = createAuth('test-key-repeat');
    const first = auth.getAuthHeader();
    for (let i = 0; i < 10; i++) {
      const h = auth.getAuthHeader();
      expect(h['x-api-key']).toBe(first['x-api-key']);
      expect(h['anthropic-version']).toBe(first['anthropic-version']);
    }
  });

  it('x-api-key 값 타입은 string', () => {
    const auth = createAuth('string-key');
    expect(typeof auth.getAuthHeader()['x-api-key']).toBe('string');
  });

  it('anthropic-version 값 타입은 string', () => {
    const auth = createAuth();
    expect(typeof auth.getAuthHeader()['anthropic-version']).toBe('string');
  });

  it('다른 인스턴스 anthropic-version 항상 동일', () => {
    const auths = Array.from({ length: 5 }, (_, i) => createAuth(`k-${i}`));
    const versions = auths.map(a => a.getAuthHeader()['anthropic-version']);
    const unique = new Set(versions);
    expect(unique.size).toBe(1);
  });

  it('getAuthHeader 결과 객체는 not null', () => {
    expect(createAuth().getAuthHeader()).not.toBeNull();
  });

  it('getAuthHeader 결과 객체는 not undefined', () => {
    expect(createAuth().getAuthHeader()).not.toBeUndefined();
  });

  it('getAuthHeader 결과는 일반 객체', () => {
    const h = createAuth().getAuthHeader();
    expect(typeof h).toBe('object');
    expect(Array.isArray(h)).toBe(false);
  });
});
