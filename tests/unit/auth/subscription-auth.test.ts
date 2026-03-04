import { beforeEach, describe, expect, it } from 'bun:test';
import { SubscriptionAuth } from '../../../src/auth/subscription-auth.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

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
});
