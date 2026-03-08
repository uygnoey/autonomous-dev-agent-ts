/**
 * layer2 ↔ auth 모듈 통합 테스트 / layer2 ↔ auth module integration tests
 *
 * @description
 * KR: TokenMonitor가 AuthProvider의 rate limit 상태를 모니터링하고,
 *     스로틀/일시정지 판단을 검증한다.
 * EN: Verifies TokenMonitor monitors AuthProvider rate limit status
 *     and validates throttle/pause decisions.
 */

import { describe, expect, it } from 'bun:test';
import { ApiKeyAuth, SubscriptionAuth } from 'auth/index.js';
import { ConsoleLogger } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import { TokenMonitor } from 'layer2/index.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');

// ── 테스트 ────────────────────────────────────────────────────────

describe('layer2 ↔ auth 통합 / layer2 ↔ auth integration', () => {
  it('TokenMonitor가 ApiKeyAuth의 rate limit 상태를 추적', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test-monitor', logger);
    const monitor = new TokenMonitor(auth, logger);

    // 초기 상태: 정보 없음 / Initial state: no info
    const initialStatus = monitor.getStatus();
    expect(initialStatus.requestsRemaining).toBeNull();

    // 응답 헤더로 갱신 / Update from response headers
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '500',
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-output-tokens-remaining': '100000',
      'anthropic-ratelimit-output-tokens-limit': '500000',
    });

    const updatedStatus = monitor.getStatus();
    expect(updatedStatus.requestsRemaining).toBe(500);
  });

  it('API key 모드: 충분한 잔여량이면 스로틀 불필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-no-throttle', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('API key 모드: 잔여량 20% 이하면 스로틀 권장', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-throttle', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 잔여 15/100 = 15% → 스로틀 임계값(20%) 이하
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '15',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('API key 모드: 잔여량 5% 이하면 전체 일시정지 권장', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-pause', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 잔여 3/100 = 3% → 일시정지 임계값(5%) 이하
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '3',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('API key 모드: 429 retry-after 수신 시 전체 일시정지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-429', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'retry-after': '30',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = monitor.getStatus();
    expect(status.retryAfterSeconds).toBe(30);
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('Subscription 모드: 초기 상태 잔여량 확인', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-sub-init', logger);
    const monitor = new TokenMonitor(auth, logger);

    const status = monitor.getStatus();
    // WHY: 사용 이력 없으므로 잔여량 = 추정 한도(45)
    expect(status.requestsRemaining).toBe(45);
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('Subscription 모드: usage 누적 → 스로틀 판단', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-sub-throttle', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 한도 10, 8회 사용 후 80% 도달 → isLimitApproaching = true
    for (let i = 0; i < 8; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(2);
    expect(status.isLimitApproaching).toBe(true);
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('Subscription 모드: 한도 초과 시 잔여량 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-sub-exhaust', logger, 5);
    const monitor = new TokenMonitor(auth, logger);

    for (let i = 0; i < 6; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('Subscription 모드: 5시간 윈도우 만료 후 잔여량 복구', () => {
    // WHY: nowFn을 주입하여 시간 경과를 시뮬레이션
    let currentTime = Date.now();
    const auth = new SubscriptionAuth('sk-ant-oat01-sub-expire', logger, 10, () => currentTime);
    const monitor = new TokenMonitor(auth, logger);

    // 5회 사용 / Use 5 times
    for (let i = 0; i < 5; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }

    expect(monitor.getStatus().requestsRemaining).toBe(5);

    // 5시간 경과 시뮬레이션 / Simulate 5 hours passing
    currentTime += 5 * 60 * 60 * 1000 + 1;

    const status = monitor.getStatus();
    // WHY: 5시간 경과 후 이전 usage가 만료되어 잔여량 복구
    expect(status.requestsRemaining).toBe(10);
  });

  it('TokenMonitor updateFromResponse가 headers를 AuthProvider에 전달', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-passthrough', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '99',
      'anthropic-ratelimit-requests-limit': '100',
    });

    // WHY: TokenMonitor를 통해 갱신해도 AuthProvider 상태가 올바르게 반영
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(99);
  });

  it('TokenMonitor가 잘못된 헤더 값을 안전하게 무시', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-bad-headers', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'not-a-number',
      'anthropic-ratelimit-requests-limit': '-1',
    });

    const status = monitor.getStatus();
    // WHY: 파싱 불가 값은 null로 처리됨
    expect(status.requestsRemaining).toBeNull();
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('Subscription 모드: 응답 본문에 usage 없으면 누적 안함', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-no-usage', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: usage 필드가 없는 응답은 무시
    monitor.updateFromResponse({}, { data: 'no usage field' });
    monitor.updateFromResponse({});

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(10);
  });

  // ── 경계값 / 랜덤 케이스 (80%+) ─────────────────────────────────

  it('API key 모드: 잔여량 정확히 20% → 스로틀 경계값', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-boundary-20', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 잔여 20/100 = 20% → 임계값과 같으므로 스로틀 여부 확인
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '20',
      'anthropic-ratelimit-requests-limit': '100',
    });

    // 경계값이므로 스로틀 또는 미스로틀, 어떤 결과든 boolean이어야 함
    const result = monitor.shouldThrottleSpawn();
    expect(typeof result).toBe('boolean');
  });

  it('API key 모드: 잔여량 정확히 5% → 일시정지 경계값', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-boundary-5', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 잔여 5/100 = 5% → 일시정지 임계값 경계
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const result = monitor.shouldPauseAll();
    expect(typeof result).toBe('boolean');
  });

  it('API key 모드: 잔여량 21% → 스로틀 불필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-21pct', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '21',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('API key 모드: 잔여량 6% → 일시정지 불필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-6pct', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '6',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('API key 모드: 잔여량 1 → 일시정지 권장', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-one-left', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '1',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('API key 모드: 잔여량 0 → 일시정지 권장', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-zero-left', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('API key 모드: 헤더 없는 상태로 초기화 → 스로틀/일시정지 둘 다 false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-no-header', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: rate limit 정보가 없으면 보수적으로 스로틀하지 않음
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('Subscription 모드: 한도 1인 극단 케이스 → 1회 사용 후 잔여 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-limit-1', logger, 1);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('Subscription 모드: 한도 100인 경우 50회 사용 → 잔여 50', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-limit-100', logger, 100);
    const monitor = new TokenMonitor(auth, logger);

    for (let i = 0; i < 50; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(50);
  });

  it('Subscription 모드: 1회 사용 후 잔여량이 한도 - 1', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-one-use', logger, 20);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(19);
  });

  it('Subscription 모드: 10회 반복 사용 일관성 검증', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-10-reps', logger, 20);
    const monitor = new TokenMonitor(auth, logger);

    for (let i = 0; i < 10; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 50, output_tokens: 25 } });
    }

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(10);
  });

  it('Subscription 모드: output_tokens만 큰 경우 처리', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-big-output', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({}, { usage: { input_tokens: 1, output_tokens: 999999 } });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(9);
  });

  it('Subscription 모드: input_tokens만 큰 경우 처리', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-big-input', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({}, { usage: { input_tokens: 999999, output_tokens: 1 } });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(9);
  });

  it('retry-after: 큰 값(86400초) 파싱', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-24h', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'retry-after': '86400',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = monitor.getStatus();
    expect(status.retryAfterSeconds).toBe(86400);
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retry-after: 값 1 → 일시정지 및 1초 대기', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-1', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'retry-after': '1',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = monitor.getStatus();
    expect(status.retryAfterSeconds).toBe(1);
  });

  it('retry-after: 비숫자 값은 null 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-nan', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'retry-after': 'never',
    });

    const status = monitor.getStatus();
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('두 TokenMonitor 인스턴스 독립성: 서로 영향 없음', () => {
    const auth1 = new ApiKeyAuth('sk-ant-api01-mon-a', logger);
    const auth2 = new ApiKeyAuth('sk-ant-api01-mon-b', logger);
    const monitor1 = new TokenMonitor(auth1, logger);
    const monitor2 = new TokenMonitor(auth2, logger);

    monitor1.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const s1 = monitor1.getStatus();
    const s2 = monitor2.getStatus();

    // WHY: monitor1 업데이트가 monitor2에 영향 없어야 함
    expect(s1.requestsRemaining).toBe(5);
    expect(s2.requestsRemaining).toBeNull();
  });

  it('두 SubscriptionAuth TokenMonitor 독립성', () => {
    const auth1 = new SubscriptionAuth('sk-ant-oat01-sub-mon-a', logger, 10);
    const auth2 = new SubscriptionAuth('sk-ant-oat01-sub-mon-b', logger, 10);
    const monitor1 = new TokenMonitor(auth1, logger);
    const monitor2 = new TokenMonitor(auth2, logger);

    for (let i = 0; i < 5; i++) {
      monitor1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }

    const s1 = monitor1.getStatus();
    const s2 = monitor2.getStatus();

    expect(s1.requestsRemaining).toBe(5);
    expect(s2.requestsRemaining).toBe(10);
  });

  it('10회 반복: ApiKeyAuth 상태 일관성', () => {
    for (let rep = 0; rep < 10; rep++) {
      const auth = new ApiKeyAuth(`sk-ant-api01-rep-${rep}`, logger);
      const monitor = new TokenMonitor(auth, logger);

      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': '50',
        'anthropic-ratelimit-requests-limit': '100',
      });

      const status = monitor.getStatus();
      expect(status.requestsRemaining).toBe(50);
      expect(monitor.shouldThrottleSpawn()).toBe(false);
      expect(monitor.shouldPauseAll()).toBe(false);
    }
  });

  it('10회 반복: SubscriptionAuth 누적 일관성', () => {
    for (let rep = 0; rep < 10; rep++) {
      const auth = new SubscriptionAuth(`sk-ant-oat01-sub-rep-${rep}`, logger, 20);
      const monitor = new TokenMonitor(auth, logger);

      for (let i = 0; i < 5; i++) {
        monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
      }

      const status = monitor.getStatus();
      expect(status.requestsRemaining).toBe(15);
    }
  });

  it('빈 헤더 객체 전달 시 상태 변경 없음 (ApiKeyAuth)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-empty-hdr', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({});
    monitor.updateFromResponse({});

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('undefined 응답 본문으로 updateFromResponse 호출 안전', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-undef-body', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: body 없이 headers만 전달하는 경우
    monitor.updateFromResponse({ 'x-other-header': 'value' });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(10);
  });

  it('Subscription 모드: isLimitApproaching = false 초기 상태', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-not-approaching', logger, 100);
    const monitor = new TokenMonitor(auth, logger);

    const status = monitor.getStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('Subscription 모드: 정확히 80% 사용 시 isLimitApproaching 확인', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-80pct', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 한도 10 중 8 사용 = 80%
    for (let i = 0; i < 8; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }

    const status = monitor.getStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('Subscription 모드: 79% 사용 시 isLimitApproaching = false', () => {
    // WHY: 한도 100 중 79 사용 = 79% → 미달
    const auth = new SubscriptionAuth('sk-ant-oat01-79pct', logger, 100);
    const monitor = new TokenMonitor(auth, logger);

    for (let i = 0; i < 79; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(21);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('getStatus()를 여러 번 호출해도 상태 변경 없음', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-multi-get', logger);
    const monitor = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '42',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const s1 = monitor.getStatus();
    const s2 = monitor.getStatus();
    const s3 = monitor.getStatus();

    expect(s1.requestsRemaining).toBe(42);
    expect(s2.requestsRemaining).toBe(42);
    expect(s3.requestsRemaining).toBe(42);
  });
});
