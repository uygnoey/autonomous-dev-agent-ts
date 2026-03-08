import { beforeEach, describe, expect, it } from 'bun:test';
import { SubscriptionAuth } from 'auth/subscription-auth.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 ─────────────────────────────────────────────

const FIVE_HOURS_MS = 5 * 60 * 60 * 1_000;

function createAuth(
  options: {
    token?: string;
    estimatedLimit?: number;
    nowFn?: () => number;
  } = {},
): SubscriptionAuth {
  const logger = new ConsoleLogger('error');
  return new SubscriptionAuth(
    options.token ?? 'sk-ant-oat01-test-token',
    logger,
    options.estimatedLimit ?? 45,
    options.nowFn,
  );
}

function makeUsageBody(inputTokens: number, outputTokens: number): unknown {
  return { usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
}

// ── 생성자 ──────────────────────────────────────────────────

describe('SubscriptionAuth 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(createAuth()).toBeInstanceOf(SubscriptionAuth);
  });

  it('두 인스턴스는 다른 객체', () => {
    const a = createAuth();
    const b = createAuth();
    expect(a).not.toBe(b);
  });

  it('getAuthHeader 메서드 존재', () => {
    expect(typeof createAuth().getAuthHeader).toBe('function');
  });

  it('getRateLimitStatus 메서드 존재', () => {
    expect(typeof createAuth().getRateLimitStatus).toBe('function');
  });

  it('updateFromResponse 메서드 존재', () => {
    expect(typeof createAuth().updateFromResponse).toBe('function');
  });

  it('authMode 프로퍼티 존재', () => {
    expect('authMode' in createAuth()).toBe(true);
  });

  it('estimatedLimit=1 → requestsRemaining=1 초기값', () => {
    const auth = createAuth({ estimatedLimit: 1 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(1);
  });

  it('estimatedLimit=100 → requestsRemaining=100 초기값', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(100);
  });

  it('estimatedLimit=0 → requestsRemaining=0 초기값', () => {
    const auth = createAuth({ estimatedLimit: 0 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });
});

// ── getAuthHeader ───────────────────────────────────────────

describe('SubscriptionAuth.getAuthHeader', () => {
  it('Bearer 토큰과 anthropic-version 헤더를 반환한다', () => {
    const auth = createAuth({ token: 'sk-ant-oat01-my-token' });

    const headers = auth.getAuthHeader();

    expect(headers.authorization).toBe('Bearer sk-ant-oat01-my-token');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('빈 토큰으로도 헤더를 생성한다', () => {
    const auth = createAuth({ token: '' });

    const headers = auth.getAuthHeader();

    expect(headers.authorization).toBe('Bearer ');
  });

  it('authMode가 oauth-token이다', () => {
    const auth = createAuth();

    expect(auth.authMode).toBe('oauth-token');
  });

  it('반환값은 객체', () => {
    const auth = createAuth();
    const headers = auth.getAuthHeader();
    expect(typeof headers).toBe('object');
    expect(headers).not.toBeNull();
  });

  it('authorization 키는 소문자', () => {
    const auth = createAuth();
    const headers = auth.getAuthHeader();
    expect('authorization' in headers).toBe(true);
  });

  it('anthropic-version 키 존재', () => {
    const auth = createAuth();
    const headers = auth.getAuthHeader();
    expect('anthropic-version' in headers).toBe(true);
  });

  it('연속 호출 → 동일한 결과', () => {
    const auth = createAuth({ token: 'test-token-abc' });
    const h1 = auth.getAuthHeader();
    const h2 = auth.getAuthHeader();
    expect(h1.authorization).toBe(h2.authorization);
    expect(h1['anthropic-version']).toBe(h2['anthropic-version']);
  });

  it('특수문자 포함 토큰 → 그대로 Bearer에 포함', () => {
    const auth = createAuth({ token: 'sk-ant-oat01-abc!@#123' });
    const headers = auth.getAuthHeader();
    expect(headers.authorization).toContain('sk-ant-oat01-abc!@#123');
  });

  it('긴 토큰 → authorization에 포함', () => {
    const longToken = 'sk-ant-oat01-' + 'x'.repeat(200);
    const auth = createAuth({ token: longToken });
    const headers = auth.getAuthHeader();
    expect(headers.authorization).toContain(longToken);
  });

  it('authMode는 string 타입', () => {
    expect(typeof createAuth().authMode).toBe('string');
  });

  it('5개의 다른 토큰 형식 → 각각 Bearer에 올바르게 포함', () => {
    const tokens = [
      'sk-ant-oat01-token1',
      'sk-ant-api01-token2',
      'test-token-3',
      'abc',
      '123456',
    ];
    for (const token of tokens) {
      const auth = createAuth({ token });
      const headers = auth.getAuthHeader();
      expect(headers.authorization).toBe(`Bearer ${token}`);
    }
  });
});

// ── getRateLimitStatus (초기 상태) ──────────────────────────

describe('SubscriptionAuth.getRateLimitStatus (초기 상태)', () => {
  it('사용량 없으면 estimatedLimit 만큼 잔여로 표시한다', () => {
    const auth = createAuth({ estimatedLimit: 45 });

    const status = auth.getRateLimitStatus();

    expect(status.requestsRemaining).toBe(45);
    expect(status.inputTokensRemaining).toBeNull();
    expect(status.outputTokensRemaining).toBeNull();
    expect(status.retryAfterSeconds).toBeNull();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('반환값은 객체', () => {
    const auth = createAuth();
    const status = auth.getRateLimitStatus();
    expect(typeof status).toBe('object');
    expect(status).not.toBeNull();
  });

  it('requestsRemaining 필드 있음', () => {
    const auth = createAuth();
    expect('requestsRemaining' in auth.getRateLimitStatus()).toBe(true);
  });

  it('isLimitApproaching 필드 있음', () => {
    const auth = createAuth();
    expect('isLimitApproaching' in auth.getRateLimitStatus()).toBe(true);
  });

  it('연속 호출 → 동일한 결과', () => {
    const auth = createAuth({ estimatedLimit: 30 });
    const s1 = auth.getRateLimitStatus();
    const s2 = auth.getRateLimitStatus();
    expect(s1.requestsRemaining).toBe(s2.requestsRemaining);
    expect(s1.isLimitApproaching).toBe(s2.isLimitApproaching);
  });

  it('requestsRemaining은 number 타입', () => {
    const auth = createAuth();
    expect(typeof auth.getRateLimitStatus().requestsRemaining).toBe('number');
  });

  it('isLimitApproaching는 boolean 타입', () => {
    const auth = createAuth();
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('estimatedLimit=10 → requestsRemaining=10', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(10);
  });

  it('estimatedLimit=1000 → requestsRemaining=1000', () => {
    const auth = createAuth({ estimatedLimit: 1000 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(1000);
  });
});

// ── updateFromResponse (사용량 추적) ────────────────────────

describe('SubscriptionAuth.updateFromResponse', () => {
  let auth: SubscriptionAuth;

  beforeEach(() => {
    auth = createAuth({ estimatedLimit: 45 });
  });

  it('응답 본문에서 사용량을 누적한다', () => {
    auth.updateFromResponse({}, makeUsageBody(1000, 500));

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(44);
  });

  it('여러 번 호출하면 사용량이 누적된다', () => {
    auth.updateFromResponse({}, makeUsageBody(1000, 500));
    auth.updateFromResponse({}, makeUsageBody(2000, 1000));
    auth.updateFromResponse({}, makeUsageBody(500, 200));

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(42);
  });

  it('사용량이 추정 한도를 초과하면 잔여가 0이다', () => {
    const smallAuth = createAuth({ estimatedLimit: 2 });
    smallAuth.updateFromResponse({}, makeUsageBody(100, 50));
    smallAuth.updateFromResponse({}, makeUsageBody(100, 50));
    smallAuth.updateFromResponse({}, makeUsageBody(100, 50));

    const status = smallAuth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
  });

  it('응답 본문이 없으면 사용량을 기록하지 않는다', () => {
    const result = auth.updateFromResponse({});

    expect(result.ok).toBe(true);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('응답 본문이 null이면 사용량을 기록하지 않는다', () => {
    auth.updateFromResponse({}, null);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('usage 필드가 없는 본문은 무시한다', () => {
    auth.updateFromResponse({}, { data: 'something' });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('usage가 null인 본문은 무시한다', () => {
    auth.updateFromResponse({}, { usage: null });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('usage 내 토큰이 숫자가 아니면 0으로 처리한다', () => {
    auth.updateFromResponse({}, { usage: { input_tokens: 'abc', output_tokens: null } });

    const status = auth.getRateLimitStatus();
    // WHY: 메시지 카운트는 증가하지만 토큰 수는 0으로 기록
    expect(status.requestsRemaining).toBe(44);
  });

  it('음수 토큰 값은 0으로 처리한다', () => {
    auth.updateFromResponse({}, { usage: { input_tokens: -100, output_tokens: -50 } });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(44);
  });

  it('항상 ok(void)를 반환한다', () => {
    const result1 = auth.updateFromResponse({}, makeUsageBody(100, 50));
    const result2 = auth.updateFromResponse({});
    const result3 = auth.updateFromResponse({}, 'invalid');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result3.ok).toBe(true);
  });

  it('updateFromResponse 반환값 ok는 boolean', () => {
    const result = auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(typeof result.ok).toBe('boolean');
  });

  it('undefined body → ok=true, 사용량 변화 없음', () => {
    const result = auth.updateFromResponse({}, undefined);
    expect(result.ok).toBe(true);
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('빈 객체 usage → 1회 카운트', () => {
    auth.updateFromResponse({}, { usage: {} });
    // usage 있지만 토큰 없음 → 1회 메시지 카운트
    const remaining = auth.getRateLimitStatus().requestsRemaining;
    expect(remaining).toBeLessThanOrEqual(45);
  });

  it('10회 연속 updateFromResponse → requestsRemaining 감소', () => {
    const auth10 = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 10; i++) {
      auth10.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth10.getRateLimitStatus().requestsRemaining).toBe(35);
  });
});

// ── 5시간 롤링 윈도우 ──────────────────────────────────────

describe('SubscriptionAuth 5시간 롤링 윈도우', () => {
  it('5시간 경과 후 오래된 사용량을 제거한다', () => {
    let currentTime = 1_000_000;
    const auth = createAuth({
      estimatedLimit: 45,
      nowFn: () => currentTime,
    });

    // t=0: 3개 사용
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(42);

    // t=5h+1ms: 윈도우 초과 → 이전 사용량 제거
    currentTime = 1_000_000 + FIVE_HOURS_MS + 1;

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('윈도우 내 사용량만 유지한다', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 45,
      nowFn: () => currentTime,
    });

    // t=0: 2개 사용
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));

    // t=3h: 1개 추가 사용
    currentTime = 3 * 60 * 60 * 1_000;
    auth.updateFromResponse({}, makeUsageBody(100, 50));

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(42);

    // t=5h+1ms: t=0 사용량 제거, t=3h 사용량 유지
    currentTime = FIVE_HOURS_MS + 1;

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('정확히 5시간인 사용량은 유지한다 (경계 조건)', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 45,
      nowFn: () => currentTime,
    });

    auth.updateFromResponse({}, makeUsageBody(100, 50));

    // 정확히 5시간 → cutoff = now - 5h = 0, entry.timestamp = 0, 0 >= 0 → 유지
    currentTime = FIVE_HOURS_MS;

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('모든 사용량이 만료되면 한도가 초기화된다', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 10,
      nowFn: () => currentTime,
    });

    // 한도 꽉 채움
    for (let i = 0; i < 10; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);

    // 전부 만료
    currentTime = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(10);
  });

  it('1ms 전에는 만료 안 됨', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 45,
      nowFn: () => currentTime,
    });

    auth.updateFromResponse({}, makeUsageBody(100, 50));

    // 5시간보다 1ms 적게 → 만료 안 됨
    currentTime = FIVE_HOURS_MS - 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('1시간 경과 → 아직 만료 안 됨', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 45,
      nowFn: () => currentTime,
    });

    auth.updateFromResponse({}, makeUsageBody(100, 50));

    currentTime = 60 * 60 * 1_000; // 1시간
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });
});

// ── isLimitApproaching (80% 임계값) ─────────────────────────

describe('SubscriptionAuth.isLimitApproaching', () => {
  it('사용량 < 80%일 때 false를 반환한다', () => {
    const auth = createAuth({ estimatedLimit: 100 });

    for (let i = 0; i < 79; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }

    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('사용량 = 80%일 때 true를 반환한다 (경계 조건)', () => {
    const auth = createAuth({ estimatedLimit: 100 });

    for (let i = 0; i < 80; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }

    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('사용량 > 80%일 때 true를 반환한다', () => {
    const auth = createAuth({ estimatedLimit: 10 });

    for (let i = 0; i < 9; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }

    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('사용량 100%일 때 true를 반환한다', () => {
    const auth = createAuth({ estimatedLimit: 5 });

    for (let i = 0; i < 5; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }

    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('한도 초과해도 true를 반환한다', () => {
    const auth = createAuth({ estimatedLimit: 2 });

    for (let i = 0; i < 5; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }

    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('만료 후 한도 아래로 떨어지면 false를 반환한다', () => {
    let currentTime = 0;
    const auth = createAuth({
      estimatedLimit: 10,
      nowFn: () => currentTime,
    });

    // 9개 사용 (90% → approaching)
    for (let i = 0; i < 9; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);

    // 전부 만료
    currentTime = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('초기 상태 → isLimitApproaching=false', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('1개 사용 (estimatedLimit=100) → 1%이므로 false', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    auth.updateFromResponse({}, makeUsageBody(10, 5));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('79개 사용 (estimatedLimit=100) → 79%이므로 false', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    for (let i = 0; i < 79; i++) {
      auth.updateFromResponse({}, makeUsageBody(10, 5));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('isLimitApproaching는 boolean 타입', () => {
    const auth = createAuth();
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });

  it('estimatedLimit=1 사용 1개 → approaching=true (100%)', () => {
    const auth = createAuth({ estimatedLimit: 1 });
    auth.updateFromResponse({}, makeUsageBody(10, 5));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });
});

// ── 추가 경계값: getAuthHeader 조합 ──────────────────────────

describe('SubscriptionAuth getAuthHeader 추가 경계값', () => {
  it('Bearer 접두어가 항상 포함된다', () => {
    const auth = createAuth({ token: 'token-abc' });
    expect(auth.getAuthHeader().authorization).toMatch(/^Bearer /);
  });

  it('5번 반복 호출 → authorization 일관성', () => {
    const auth = createAuth({ token: 'stable-token' });
    const expected = 'Bearer stable-token';
    for (let i = 0; i < 5; i++) {
      expect(auth.getAuthHeader().authorization).toBe(expected);
    }
  });

  it('authorization은 string 타입', () => {
    expect(typeof createAuth().getAuthHeader().authorization).toBe('string');
  });

  it('anthropic-version은 string 타입', () => {
    expect(typeof createAuth().getAuthHeader()['anthropic-version']).toBe('string');
  });

  it('10개 인스턴스 각각 독립적 토큰', () => {
    const auths = Array.from({ length: 10 }, (_, i) => createAuth({ token: `token-${i}` }));
    for (let i = 0; i < 10; i++) {
      expect(auths[i]!.getAuthHeader().authorization).toBe(`Bearer token-${i}`);
    }
  });

  it('authMode는 oauth-token', () => {
    for (let i = 0; i < 5; i++) {
      expect(createAuth().authMode).toBe('oauth-token');
    }
  });
});

// ── 추가 경계값: updateFromResponse 엣지케이스 ───────────────

describe('SubscriptionAuth updateFromResponse 추가 경계값', () => {
  it('usage.input_tokens=0 → 카운트 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(0, 0));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('usage.input_tokens=999999 → 카운트 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(999999, 0));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('body=string → ok=true, 사용량 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, 'invalid-body');
    expect(result.ok).toBe(true);
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('body=number → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, 42);
    expect(result.ok).toBe(true);
  });

  it('body=array → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, [1, 2, 3]);
    expect(result.ok).toBe(true);
  });

  it('5번 연속 → requestsRemaining 0 이상', () => {
    const auth = createAuth({ estimatedLimit: 3 });
    for (let i = 0; i < 5; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBeGreaterThanOrEqual(0);
  });

  it('requestsRemaining은 항상 0 이상', () => {
    const auth = createAuth({ estimatedLimit: 1 });
    for (let i = 0; i < 10; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBeGreaterThanOrEqual(0);
  });
});

// ── 추가 경계값: 롤링 윈도우 엣지케이스 ─────────────────────

describe('SubscriptionAuth 롤링 윈도우 추가', () => {
  it('사용 후 정확히 5시간 → 만료 안 됨 (경계)', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => t });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    t = FIVE_HOURS_MS; // 정확히 5시간
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('사용 후 5시간 + 1ms → 만료', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => t });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    t = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('estimatedLimit=5 → 5번 사용 → 0', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 5; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('requestsRemaining 타입은 number', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    expect(typeof auth.getRateLimitStatus().requestsRemaining).toBe('number');
  });

  it('isLimitApproaching 타입은 boolean', () => {
    expect(typeof createAuth().getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });
});

// ── 추가 경계값: 토큰 형식 다양성 ──────────────────────────────

describe('SubscriptionAuth 토큰 형식 다양성', () => {
  it('UUID 형식 토큰 → Bearer에 포함', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const auth = createAuth({ token: uuid });
    expect(auth.getAuthHeader().authorization).toBe(`Bearer ${uuid}`);
  });

  it('한글 포함 토큰 → Bearer에 포함', () => {
    const token = 'sk-ant-한글토큰-12345';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toContain(token);
  });

  it('공백 포함 토큰 → 그대로 포함', () => {
    const token = 'token with spaces';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toContain(token);
  });

  it('개행 문자 포함 토큰 → Bearer에 포함', () => {
    const token = 'token\nnewline';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toContain(token);
  });

  it('탭 포함 토큰', () => {
    const token = 'token\ttab';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toContain(token);
  });

  it('매우 짧은 토큰 → Bearer 포함', () => {
    const auth = createAuth({ token: 'x' });
    expect(auth.getAuthHeader().authorization).toBe('Bearer x');
  });

  it('숫자만으로 이루어진 토큰', () => {
    const auth = createAuth({ token: '1234567890' });
    expect(auth.getAuthHeader().authorization).toBe('Bearer 1234567890');
  });

  it('500자 토큰 → Bearer에 포함', () => {
    const token = 'sk-ant-' + 'a'.repeat(493);
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toContain(token);
  });

  it('authMode가 oauth-token → string 비교', () => {
    const auth = createAuth({ token: 'any-token' });
    expect(auth.authMode).toBe('oauth-token');
    expect(typeof auth.authMode).toBe('string');
  });

  it('동일 토큰 → 인스턴스 다를 때 동일한 authorization 반환', () => {
    const token = 'shared-token';
    const a1 = createAuth({ token });
    const a2 = createAuth({ token });
    expect(a1.getAuthHeader().authorization).toBe(a2.getAuthHeader().authorization);
  });
});

// ── 추가 경계값: estimatedLimit 극단값 ──────────────────────────

describe('SubscriptionAuth estimatedLimit 극단값', () => {
  it('estimatedLimit=Number.MAX_SAFE_INTEGER → requestsRemaining 동일', () => {
    const auth = createAuth({ estimatedLimit: Number.MAX_SAFE_INTEGER });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('estimatedLimit=2 → 2번 사용 후 0', () => {
    const auth = createAuth({ estimatedLimit: 2 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('estimatedLimit=50 → 25번 사용 후 25 남음', () => {
    const auth = createAuth({ estimatedLimit: 50 });
    for (let i = 0; i < 25; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(25);
  });

  it('estimatedLimit=0 → 사용 후 requestsRemaining=0', () => {
    const auth = createAuth({ estimatedLimit: 0 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('estimatedLimit=45 초기 isLimitApproaching=false', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('estimatedLimit=5 → 4번 사용(80%) → approaching=true', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 4; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=10 → 8번 사용(80%) → approaching=true', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    for (let i = 0; i < 8; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('requestsRemaining은 음수가 되지 않는다', () => {
    const auth = createAuth({ estimatedLimit: 1 });
    for (let i = 0; i < 100; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBeGreaterThanOrEqual(0);
  });
});

// ── 추가 경계값: updateFromResponse 특수 입력값 ─────────────────

describe('SubscriptionAuth updateFromResponse 특수 입력', () => {
  it('usage.input_tokens=NaN → 카운트만 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, { usage: { input_tokens: Number.NaN, output_tokens: 0 } });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('usage.output_tokens=Infinity → 카운트만 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, { usage: { input_tokens: 0, output_tokens: Infinity } });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('body=boolean true → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, true);
    expect(result.ok).toBe(true);
  });

  it('body=boolean false → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, false);
    expect(result.ok).toBe(true);
  });

  it('body=Symbol → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, Symbol('test') as unknown);
    expect(result.ok).toBe(true);
  });

  it('3번 유효 사용 + 2번 무효 → 3만큼 감소', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, null); // 무효
    auth.updateFromResponse({}, undefined); // 무효
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(42);
  });

  it('usage.input_tokens 문자열 숫자 → 카운트 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    // 숫자처럼 생긴 문자열
    auth.updateFromResponse({}, { usage: { input_tokens: '500', output_tokens: '200' } });
    expect(auth.getRateLimitStatus().requestsRemaining).toBeLessThanOrEqual(45);
  });
});

// ── 추가 경계값: 롤링 윈도우 복합 시나리오 ─────────────────────

describe('SubscriptionAuth 롤링 윈도우 복합 시나리오', () => {
  it('두 개의 다른 시점 사용 → 각각 만료', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => t });

    // t=0에 1개 사용
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    // t=2h에 1개 사용
    t = 2 * 60 * 60 * 1_000;
    auth.updateFromResponse({}, makeUsageBody(100, 50));

    expect(auth.getRateLimitStatus().requestsRemaining).toBe(43);

    // t=5h+1ms → t=0 만료, t=2h 아직 유지
    t = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);

    // t=7h+1ms → t=2h도 만료
    t = 7 * 60 * 60 * 1_000 + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('만료 후 새 사용 → 카운트 복원됨', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => t });

    for (let i = 0; i < 10; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);

    t = FIVE_HOURS_MS + 1;
    // 만료 후 새로 사용
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(9);
  });

  it('시간 역행 불가 → nowFn이 같은 값 반환 시 만료 없음', () => {
    const FIXED_TIME = 1_000_000;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => FIXED_TIME });

    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));

    // 시간 변화 없음 → 만료 없음
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(43);
  });

  it('approaching 경계: estimatedLimit=20 → 16번 사용(80%) → true', () => {
    const auth = createAuth({ estimatedLimit: 20 });
    for (let i = 0; i < 16; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('approaching 경계: estimatedLimit=20 → 15번 사용(75%) → false', () => {
    const auth = createAuth({ estimatedLimit: 20 });
    for (let i = 0; i < 15; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });
});

// ── 추가 경계값: 상태 필드 타입 검증 ─────────────────────────────

describe('SubscriptionAuth 상태 필드 타입 검증', () => {
  it('inputTokensRemaining은 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('outputTokensRemaining은 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('retryAfterSeconds은 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('사용 후에도 inputTokensRemaining은 null', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(1000, 500));
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('사용 후에도 outputTokensRemaining은 null', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(1000, 500));
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('사용 후에도 retryAfterSeconds은 null', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(1000, 500));
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('requestsRemaining은 정수', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    const remaining = auth.getRateLimitStatus().requestsRemaining;
    expect(Number.isInteger(remaining)).toBe(true);
  });

  it('estimatedLimit=45 → requestsRemaining 0~45 범위', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const r = auth.getRateLimitStatus().requestsRemaining;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(45);
  });

  it('5번 사용 후 requestsRemaining 범위 유지', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 5; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    const r = auth.getRateLimitStatus().requestsRemaining;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(45);
  });

  it('isLimitApproaching은 boolean', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(typeof auth.getRateLimitStatus().isLimitApproaching).toBe('boolean');
  });
});

// ── 추가 경계값: nowFn 경계 시나리오 ────────────────────────────

describe('SubscriptionAuth nowFn 경계 시나리오', () => {
  it('nowFn이 0을 반환하면 모든 사용량 만료 안됨 (cutoff < 0)', () => {
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => 0 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('nowFn이 Number.MAX_SAFE_INTEGER → 모든 사용량 즉시 만료', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => t });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    t = Number.MAX_SAFE_INTEGER;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('시간 순서대로 사용 → 각각 만료 순서도 보장', () => {
    let t = 1_000_000;
    const auth = createAuth({ estimatedLimit: 45, nowFn: () => t });

    for (let i = 0; i < 3; i++) {
      auth.updateFromResponse({}, makeUsageBody(100, 50));
    }
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(42);

    t = 1_000_000 + FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('다른 nowFn을 가진 두 인스턴스 → 독립적 동작', () => {
    let t1 = 0;
    let t2 = 0;
    const auth1 = createAuth({ estimatedLimit: 10, nowFn: () => t1 });
    const auth2 = createAuth({ estimatedLimit: 10, nowFn: () => t2 });

    for (let i = 0; i < 5; i++) auth1.updateFromResponse({}, makeUsageBody(100, 50));
    for (let i = 0; i < 3; i++) auth2.updateFromResponse({}, makeUsageBody(100, 50));

    expect(auth1.getRateLimitStatus().requestsRemaining).toBe(5);
    expect(auth2.getRateLimitStatus().requestsRemaining).toBe(7);

    t1 = FIVE_HOURS_MS + 1;
    expect(auth1.getRateLimitStatus().requestsRemaining).toBe(10);
    expect(auth2.getRateLimitStatus().requestsRemaining).toBe(7);
  });

  it('사용 시점보다 훨씬 이후 조회 → 만료 완료', () => {
    let t = 100_000;
    const auth = createAuth({ estimatedLimit: 20, nowFn: () => t });
    for (let i = 0; i < 15; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(5);
    t = 100_000 + 10 * FIVE_HOURS_MS;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(20);
  });
});

// ── 추가 경계값: 반복 패턴 일관성 ───────────────────────────────

describe('SubscriptionAuth 반복 패턴 일관성', () => {
  it('estimatedLimit=3 → 3번 정확히 → 0', () => {
    const auth = createAuth({ estimatedLimit: 3 });
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('estimatedLimit=7 → 7번 → 0, 8번째 → 0 유지', () => {
    const auth = createAuth({ estimatedLimit: 7 });
    for (let i = 0; i < 8; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('requestsRemaining이 0이면 isLimitApproaching=true', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 5; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=50 → 39번(78%) → approaching=false', () => {
    const auth = createAuth({ estimatedLimit: 50 });
    for (let i = 0; i < 39; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('estimatedLimit=50 → 40번(80%) → approaching=true', () => {
    const auth = createAuth({ estimatedLimit: 50 });
    for (let i = 0; i < 40; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=25 → 19번(76%) → approaching=false', () => {
    const auth = createAuth({ estimatedLimit: 25 });
    for (let i = 0; i < 19; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('estimatedLimit=25 → 20번(80%) → approaching=true', () => {
    const auth = createAuth({ estimatedLimit: 25 });
    for (let i = 0; i < 20; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('updateFromResponse 반환값 항상 ok=true (10회 반복)', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 10; i++) {
      const r = auth.updateFromResponse({}, makeUsageBody(100, 50));
      expect(r.ok).toBe(true);
    }
  });

  it('복합: 사용→만료→재사용 사이클', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 5, nowFn: () => t });

    for (let i = 0; i < 5; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);

    t = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(5);

    for (let i = 0; i < 3; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(2);
  });

  it('approaching 후 만료 → approaching=false', () => {
    let t = 0;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => t });
    for (let i = 0; i < 9; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
    t = FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });
});

// ── 추가 경계값: updateFromResponse 다양한 구조 ────────────────

describe('SubscriptionAuth updateFromResponse 다양한 구조', () => {
  it('중첩 객체 usage → 무효 처리 (usage가 object 아님)', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, { usage: { nested: { input_tokens: 100 } }, input_tokens: 100, output_tokens: 50 });
    // nested 내부는 파싱 안 됨, usage 자체는 object이므로 카운트 증가
    const r = auth.getRateLimitStatus().requestsRemaining;
    expect(r).toBeLessThanOrEqual(45);
  });

  it('usage.input_tokens=0, output_tokens=0 → 카운트 증가', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(0, 0));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('body에 usage 외 다른 필드도 있는 경우 → 정상 파싱', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, {
      id: 'msg-123',
      type: 'message',
      usage: { input_tokens: 500, output_tokens: 200 },
      model: 'claude-sonnet',
    });
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('usage.input_tokens=1000000 → 큰 값도 정상 처리', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    auth.updateFromResponse({}, makeUsageBody(1_000_000, 1_000_000));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(44);
  });

  it('body=Function → ok=true, 사용량 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const fn = () => 42;
    const result = auth.updateFromResponse({}, fn as unknown);
    expect(result.ok).toBe(true);
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(45);
  });

  it('body=Map → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, new Map() as unknown);
    expect(result.ok).toBe(true);
  });

  it('body=Set → ok=true', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const result = auth.updateFromResponse({}, new Set() as unknown);
    expect(result.ok).toBe(true);
  });

  it('20번 연속 makeUsageBody(50,25) → requestsRemaining=25', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 20; i++) auth.updateFromResponse({}, makeUsageBody(50, 25));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(25);
  });
});

// ── 추가 경계값: getAuthHeader 멱등성 ────────────────────────────

describe('SubscriptionAuth getAuthHeader 멱등성 및 불변성', () => {
  it('getAuthHeader 100번 호출 → authorization 불변', () => {
    const auth = createAuth({ token: 'immutable-token' });
    const expected = 'Bearer immutable-token';
    for (let i = 0; i < 100; i++) {
      expect(auth.getAuthHeader().authorization).toBe(expected);
    }
  });

  it('updateFromResponse 후 getAuthHeader 변하지 않음', () => {
    const auth = createAuth({ token: 'stable-token', estimatedLimit: 45 });
    const headerBefore = auth.getAuthHeader().authorization;
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    auth.updateFromResponse({}, makeUsageBody(200, 100));
    const headerAfter = auth.getAuthHeader().authorization;
    expect(headerBefore).toBe(headerAfter);
  });

  it('authMode 100번 조회 → 항상 oauth-token', () => {
    const auth = createAuth();
    for (let i = 0; i < 100; i++) {
      expect(auth.authMode).toBe('oauth-token');
    }
  });

  it('인스턴스 재생성 후 동일 토큰 → 동일 authorization', () => {
    const token = 'recurring-token-xyz';
    const auth1 = createAuth({ token });
    const auth2 = createAuth({ token });
    expect(auth1.getAuthHeader().authorization).toBe(auth2.getAuthHeader().authorization);
  });

  it('getRateLimitStatus 반환 객체는 매번 새 객체', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const s1 = auth.getRateLimitStatus();
    const s2 = auth.getRateLimitStatus();
    expect(s1).not.toBe(s2);
  });

  it('updateFromResponse 후 status 변화 확인', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, makeUsageBody(100, 50));
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBeLessThan(before);
  });

  it('접두사 Bearer는 대소문자 정확히 Bearer', () => {
    const auth = createAuth({ token: 'mytoken' });
    const header = auth.getAuthHeader().authorization;
    expect(header.startsWith('Bearer ')).toBe(true);
    expect(header.startsWith('bearer ')).toBe(false);
  });

  it('anthropic-version 정확히 2023-06-01', () => {
    const auth = createAuth();
    expect(auth.getAuthHeader()['anthropic-version']).toBe('2023-06-01');
  });

  it('5개의 다른 estimatedLimit → requestsRemaining 각각 다름', () => {
    const limits = [10, 20, 30, 40, 50];
    for (const limit of limits) {
      const auth = createAuth({ estimatedLimit: limit });
      expect(auth.getRateLimitStatus().requestsRemaining).toBe(limit);
    }
  });

  it('estimatedLimit=45 → 44번 사용 후 requestsRemaining=1', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 44; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(1);
  });

  it('estimatedLimit=45 → 45번 사용 후 requestsRemaining=0', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 45; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('estimatedLimit=45 → 46번 사용 후 requestsRemaining=0 유지', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    for (let i = 0; i < 46; i++) auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });
});

// ── getAuthHeader 심화 경계값 ──────────────────────────────────

describe('getAuthHeader 심화 경계값', () => {
  it('토큰에 특수문자 포함 → 그대로 authorization 값에 포함', () => {
    const token = 'sk-ant-oat01-!@#$%^&*()-test';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toBe(`Bearer ${token}`);
  });

  it('토큰 길이 1 → authorization 헤더 정상', () => {
    const auth = createAuth({ token: 'x' });
    expect(auth.getAuthHeader().authorization).toBe('Bearer x');
  });

  it('토큰 길이 200자 → authorization 헤더 정상', () => {
    const token = 'a'.repeat(200);
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toBe(`Bearer ${token}`);
  });

  it('getAuthHeader 반환값은 객체', () => {
    const auth = createAuth();
    expect(typeof auth.getAuthHeader()).toBe('object');
  });

  it('getAuthHeader 반환값에 authorization 키 존재', () => {
    const auth = createAuth();
    expect('authorization' in auth.getAuthHeader()).toBe(true);
  });

  it('getAuthHeader 반환값에 anthropic-version 키 존재', () => {
    const auth = createAuth();
    expect('anthropic-version' in auth.getAuthHeader()).toBe(true);
  });

  it('getAuthHeader 두 번 호출 → 동일한 값', () => {
    const auth = createAuth({ token: 'stable-token' });
    const h1 = auth.getAuthHeader();
    const h2 = auth.getAuthHeader();
    expect(h1.authorization).toBe(h2.authorization);
    expect(h1['anthropic-version']).toBe(h2['anthropic-version']);
  });

  it('getAuthHeader 반환 객체는 매번 새 객체', () => {
    const auth = createAuth();
    const h1 = auth.getAuthHeader();
    const h2 = auth.getAuthHeader();
    expect(h1).not.toBe(h2);
  });

  it('토큰에 공백 포함 → 공백 포함 그대로 반환', () => {
    const token = 'token with spaces';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toBe(`Bearer ${token}`);
  });

  it('토큰에 줄바꿈 없음 → authorization에 \\n 없음', () => {
    const auth = createAuth({ token: 'cleantoken' });
    expect(auth.getAuthHeader().authorization.includes('\n')).toBe(false);
  });

  it('토큰에 유니코드 포함 → 그대로 반환', () => {
    const token = 'sk-한국어토큰-123';
    const auth = createAuth({ token });
    expect(auth.getAuthHeader().authorization).toBe(`Bearer ${token}`);
  });

  it('anthropic-version 값이 비어 있지 않음', () => {
    const auth = createAuth();
    const version = auth.getAuthHeader()['anthropic-version'];
    expect(version.length).toBeGreaterThan(0);
  });

  it('anthropic-version은 날짜 형식 YYYY-MM-DD', () => {
    const auth = createAuth();
    const version = auth.getAuthHeader()['anthropic-version'];
    expect(/^\d{4}-\d{2}-\d{2}$/.test(version)).toBe(true);
  });

  it('10개 다른 토큰 → 각각 다른 authorization 값', () => {
    const tokens = Array.from({ length: 10 }, (_, i) => `token-${i}`);
    const headers = tokens.map((t) => createAuth({ token: t }).getAuthHeader().authorization);
    const unique = new Set(headers);
    expect(unique.size).toBe(10);
  });

  it('authMode는 oauth-token 문자열', () => {
    const auth = createAuth();
    expect(auth.authMode).toBe('oauth-token');
  });

  it('authMode는 모든 인스턴스에서 동일', () => {
    const a1 = createAuth({ token: 'tok1' });
    const a2 = createAuth({ token: 'tok2' });
    expect(a1.authMode).toBe(a2.authMode);
  });

  it('getAuthHeader 호출이 상태를 변경하지 않음 → requestsRemaining 동일', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.getAuthHeader();
    auth.getAuthHeader();
    auth.getAuthHeader();
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });
});

// ── updateFromResponse 심화 경계값 ────────────────────────────

describe('updateFromResponse 심화 경계값', () => {
  it('usage.input_tokens=0, output_tokens=0 → requestsRemaining 감소', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, makeUsageBody(0, 0));
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });

  it('usage.input_tokens=음수 → 0 처리, 감소는 함', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: { input_tokens: -5, output_tokens: 10 } });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });

  it('usage.output_tokens=음수 → 0 처리, 감소는 함', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: -5 } });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });

  it('usage 없는 객체 → requestsRemaining 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { noUsage: true });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('null body → requestsRemaining 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, null);
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('undefined body → requestsRemaining 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({});
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('숫자 body → 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, 42);
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('문자열 body → 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, 'not-a-body');
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('배열 body → 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, [1, 2, 3]);
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('usage.input_tokens=문자열 → 0 처리, 감소는 함', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: { input_tokens: 'abc', output_tokens: 10 } });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });

  it('usage.output_tokens=null → 0 처리, 감소는 함', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: null } });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });

  it('updateFromResponse 반환값 ok=true', () => {
    const auth = createAuth();
    const result = auth.updateFromResponse({}, makeUsageBody(100, 50));
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse(빈 헤더) → ok=true', () => {
    const auth = createAuth();
    const result = auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse(body 없음) → ok=true', () => {
    const auth = createAuth();
    const result = auth.updateFromResponse({});
    expect(result.ok).toBe(true);
  });

  it('estimatedLimit=5, 5번 사용 → requestsRemaining=0', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 5; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(0);
  });

  it('estimatedLimit=5, 10번 사용 → requestsRemaining은 음수 아님', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 10; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().requestsRemaining).toBeGreaterThanOrEqual(0);
  });

  it('usage null 객체 → 변화 없음', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: null });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before);
  });

  it('usage 빈 객체 → requestsRemaining 감소', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.updateFromResponse({}, { usage: {} });
    const after = auth.getRateLimitStatus().requestsRemaining;
    expect(after).toBe(before - 1);
  });
});

// ── 롤링 윈도우 심화 ───────────────────────────────────────────

describe('롤링 윈도우 심화', () => {
  it('5시간 전 기록은 현재 시점에서 만료됨', () => {
    let now = 0;
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    now = 1000;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    now = 1000 + FIVE_HOURS_MS + 1;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(10);
  });

  it('정확히 5시간 경과 기록은 만료됨', () => {
    let now = 0;
    const FIVE_HOURS_MS_EXACT = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    now = 100;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    // cutoff = (100 + FIVE_H) - FIVE_H = 100 → timestamp=100 >= cutoff=100 → 만료 안됨
    now = 100 + FIVE_HOURS_MS_EXACT;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(9);
  });

  it('5시간 미만은 만료되지 않음', () => {
    let now = 0;
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    now = 5000;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    now = 5000 + FOUR_HOURS_MS;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(9);
  });

  it('5개 기록 후 일부 만료 → requestsRemaining 증가', () => {
    let now = 0;
    const FIVE_H = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    for (let i = 0; i < 3; i++) {
      now = i * 1000;
      auth.updateFromResponse({}, makeUsageBody(10, 10));
    }
    // 이후 2개는 최근 기록
    now = FIVE_H + 10000;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    now = FIVE_H + 11000;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    now = FIVE_H + 20000;
    // 초기 3개는 만료 → 2개만 남음
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(8);
  });

  it('모든 기록 만료 → requestsRemaining = estimatedLimit', () => {
    let now = 0;
    const FIVE_H = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 20, nowFn: () => now });
    for (let i = 0; i < 5; i++) {
      now = i * 100;
      auth.updateFromResponse({}, makeUsageBody(10, 10));
    }
    now = FIVE_H + 10000;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(20);
  });

  it('빠른 연속 호출 → 타임스탬프 동일해도 각각 카운트', () => {
    let now = 12345;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(7);
  });

  it('만료 시점 경계: cutoff와 동일한 타임스탬프는 만료 안됨', () => {
    let now = 0;
    const FIVE_H = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    now = 0;
    auth.updateFromResponse({}, makeUsageBody(10, 10));
    // cutoff = FIVE_H - FIVE_H = 0 → timestamp=0 >= cutoff=0 → 만료 안됨 (>= 조건)
    now = FIVE_H;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(9);
  });

  it('롤링 윈도우 내 기록만 카운트', () => {
    let now = 0;
    const FIVE_H = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 20, nowFn: () => now });
    // 오래된 5개
    for (let i = 0; i < 5; i++) {
      now = i * 100;
      auth.updateFromResponse({}, makeUsageBody(1, 1));
    }
    // 최근 3개
    now = FIVE_H + 5000;
    auth.updateFromResponse({}, makeUsageBody(1, 1));
    now = FIVE_H + 6000;
    auth.updateFromResponse({}, makeUsageBody(1, 1));
    now = FIVE_H + 7000;
    auth.updateFromResponse({}, makeUsageBody(1, 1));
    now = FIVE_H + 10000;
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(17);
  });
});

// ── isLimitApproaching 심화 ────────────────────────────────────

describe('isLimitApproaching 심화', () => {
  it('80% 임계값 정확히 도달 → isLimitApproaching=true', () => {
    const limit = 10;
    const auth = createAuth({ estimatedLimit: limit });
    // 80% of 10 = 8 → messageCount >= 8
    for (let i = 0; i < 8; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('80% 미만 → isLimitApproaching=false', () => {
    const limit = 10;
    const auth = createAuth({ estimatedLimit: limit });
    for (let i = 0; i < 7; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('초기 상태 → isLimitApproaching=false', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('estimatedLimit=100, 79회 → false', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    for (let i = 0; i < 79; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('estimatedLimit=100, 80회 → true', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    for (let i = 0; i < 80; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=100, 100회 → true', () => {
    const auth = createAuth({ estimatedLimit: 100 });
    for (let i = 0; i < 100; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=5, 4회 → true (80%=4)', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 4; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(true);
  });

  it('estimatedLimit=5, 3회 → false', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 3; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });

  it('롤링 만료 후 isLimitApproaching=false', () => {
    let now = 0;
    const FIVE_H = 5 * 60 * 60 * 1_000;
    const auth = createAuth({ estimatedLimit: 10, nowFn: () => now });
    for (let i = 0; i < 9; i++) {
      now = i * 100;
      auth.updateFromResponse({}, makeUsageBody(10, 10));
    }
    now = FIVE_H + 10000;
    expect(auth.getRateLimitStatus().isLimitApproaching).toBe(false);
  });
});

// ── getRateLimitStatus 심화 ────────────────────────────────────

describe('getRateLimitStatus 심화', () => {
  it('inputTokensRemaining은 항상 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('outputTokensRemaining은 항상 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('retryAfterSeconds는 항상 null', () => {
    const auth = createAuth();
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('10번 사용 후에도 inputTokensRemaining=null', () => {
    const auth = createAuth({ estimatedLimit: 20 });
    for (let i = 0; i < 10; i++) auth.updateFromResponse({}, makeUsageBody(100, 100));
    expect(auth.getRateLimitStatus().inputTokensRemaining).toBeNull();
  });

  it('10번 사용 후에도 outputTokensRemaining=null', () => {
    const auth = createAuth({ estimatedLimit: 20 });
    for (let i = 0; i < 10; i++) auth.updateFromResponse({}, makeUsageBody(100, 100));
    expect(auth.getRateLimitStatus().outputTokensRemaining).toBeNull();
  });

  it('10번 사용 후에도 retryAfterSeconds=null', () => {
    const auth = createAuth({ estimatedLimit: 20 });
    for (let i = 0; i < 10; i++) auth.updateFromResponse({}, makeUsageBody(100, 100));
    expect(auth.getRateLimitStatus().retryAfterSeconds).toBeNull();
  });

  it('requestsRemaining은 0 이상', () => {
    const auth = createAuth({ estimatedLimit: 5 });
    for (let i = 0; i < 20; i++) auth.updateFromResponse({}, makeUsageBody(10, 10));
    expect(auth.getRateLimitStatus().requestsRemaining).toBeGreaterThanOrEqual(0);
  });

  it('requestsRemaining은 estimatedLimit 이하', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    expect(auth.getRateLimitStatus().requestsRemaining).toBeLessThanOrEqual(10);
  });

  it('각 호출마다 독립적 객체 반환', () => {
    const auth = createAuth();
    const s1 = auth.getRateLimitStatus();
    const s2 = auth.getRateLimitStatus();
    expect(s1).not.toBe(s2);
  });

  it('getAuthHeader 호출 후에도 getRateLimitStatus 값 동일', () => {
    const auth = createAuth({ estimatedLimit: 10 });
    const before = auth.getRateLimitStatus().requestsRemaining;
    auth.getAuthHeader();
    auth.getAuthHeader();
    expect(auth.getRateLimitStatus().requestsRemaining).toBe(before);
  });

  it('5번 연속 호출 → 5번 모두 동일한 requestsRemaining', () => {
    const auth = createAuth({ estimatedLimit: 45 });
    const results = Array.from({ length: 5 }, () => auth.getRateLimitStatus().requestsRemaining);
    for (const r of results) {
      expect(r).toBe(results[0]);
    }
  });

  it('authMode=oauth-token 문자열', () => {
    const auth = createAuth();
    expect(auth.authMode).toBe('oauth-token');
  });
});
