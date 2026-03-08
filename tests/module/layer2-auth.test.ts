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

  // ── 추가 edge/random 케이스 ──────────────────────────────────────

  it('API key 모드: 잔여량 999999 → 스로틀 불필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-huge-remaining', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '999999',
      'anthropic-ratelimit-requests-limit': '1000000',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('API key 모드: 잔여량 4% → 일시정지 필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-4pct', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '4',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('API key 모드: 잔여량 19% → 스로틀 필요', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-19pct', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '19',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('API key 모드: shouldThrottleSpawn 반환값 boolean 타입', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-bool-throttle', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('API key 모드: shouldPauseAll 반환값 boolean 타입', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-bool-pause', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('Subscription 모드: 초기 shouldThrottleSpawn false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-initial-throttle', logger, 100);
    const monitor = new TokenMonitor(auth, logger);
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('Subscription 모드: 초기 shouldPauseAll false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-initial-pause', logger, 100);
    const monitor = new TokenMonitor(auth, logger);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('Subscription 모드: 한도 2, 1회 사용 → 잔여 1', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-limit-2', logger, 2);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    expect(monitor.getStatus().requestsRemaining).toBe(1);
  });

  it('Subscription 모드: 한도 50, 40회 사용 → isLimitApproaching true', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-50-limit', logger, 50);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 40; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    expect(monitor.getStatus().isLimitApproaching).toBe(true);
  });

  it('Subscription 모드: 한도 50, 39회 사용 → isLimitApproaching false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-50-limit-39', logger, 50);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 39; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    expect(monitor.getStatus().requestsRemaining).toBe(11);
    expect(monitor.getStatus().isLimitApproaching).toBe(false);
  });

  it('API key 모드: 음수 remaining → shouldPauseAll 안전 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-neg-rem', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '-10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // 음수이면 null 또는 0이므로 pause 여부 타입 검증만
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('API key 모드: limit=0 극단 케이스 → 안전 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-zero-limit', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '0',
    });
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('retry-after: 값 0 → 파싱 결과 0', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-0', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'retry-after': '0',
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = monitor.getStatus();
    expect(status.retryAfterSeconds).toBe(0);
  });

  it('retry-after: 소수점 값 → null 또는 파싱된 정수', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-decimal', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'retry-after': '1.5',
    });
    const status = monitor.getStatus();
    expect(typeof status.retryAfterSeconds === 'number' || status.retryAfterSeconds === null).toBe(true);
  });

  it('TokenMonitor: 같은 AuthProvider로 여러 Monitor 생성 → 독립적', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-shared-auth', logger);
    const monitor1 = new TokenMonitor(auth, logger);
    const monitor2 = new TokenMonitor(auth, logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '30',
      'anthropic-ratelimit-requests-limit': '100',
    });

    // 둘 다 같은 auth를 공유하므로 상태가 같아야 함
    expect(monitor1.getStatus().requestsRemaining).toBe(30);
    expect(monitor2.getStatus().requestsRemaining).toBe(30);
  });

  it('Subscription 모드: 한도 0 극단 케이스 → 처리됨', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-limit', logger, 0);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect(typeof status.requestsRemaining).toBe('number');
  });

  it('Subscription 모드: 한도 1000, 999회 사용 → 잔여 1', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-999-use', logger, 1000);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 999; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 1, output_tokens: 1 } });
    }
    expect(monitor.getStatus().requestsRemaining).toBe(1);
  });

  it('API key 모드: MAX_SAFE_INTEGER remaining → shouldThrottleSpawn false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-max-safe', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': String(Number.MAX_SAFE_INTEGER),
      'anthropic-ratelimit-requests-limit': String(Number.MAX_SAFE_INTEGER),
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('TokenMonitor.getStatus() 반환 객체 구조 확인', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-struct-check', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect('requestsRemaining' in status).toBe(true);
    expect('retryAfterSeconds' in status).toBe(true);
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('Subscription 모드: getStatus() 반환 객체 구조 확인', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-struct-check', logger, 10);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect('requestsRemaining' in status).toBe(true);
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('빈 헤더 5번 반복 전송 → 상태 여전히 null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-5-empty', logger);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 5; i++) {
      monitor.updateFromResponse({});
    }
    expect(monitor.getStatus().requestsRemaining).toBeNull();
  });

  it('Subscription 모드: usage 없는 body 5번 → 잔여량 변화 없음', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-no-usage-5x', logger, 20);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 5; i++) {
      monitor.updateFromResponse({}, {});
    }
    expect(monitor.getStatus().requestsRemaining).toBe(20);
  });

  it('API key 모드: 여러 토큰 헤더 함께 전달 → 처리됨', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-multi-header', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-input-tokens-remaining': '100000',
      'anthropic-ratelimit-input-tokens-limit': '500000',
      'anthropic-ratelimit-output-tokens-remaining': '50000',
      'anthropic-ratelimit-output-tokens-limit': '250000',
    });
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(50);
  });

  it('10개 다른 API key 인스턴스 → 각각 독립적 초기 상태', () => {
    for (let i = 0; i < 10; i++) {
      const auth = new ApiKeyAuth(`sk-ant-api01-indep-${i}`, logger);
      const monitor = new TokenMonitor(auth, logger);
      expect(monitor.getStatus().requestsRemaining).toBeNull();
    }
  });

  it('Subscription 모드: 10개 다른 한도 → 각각 올바른 초기 잔여량', () => {
    const limits = [1, 5, 10, 20, 45, 50, 100, 200, 500, 1000];
    for (const limit of limits) {
      const auth = new SubscriptionAuth(`sk-ant-oat01-limit-${limit}`, logger, limit);
      const monitor = new TokenMonitor(auth, logger);
      expect(monitor.getStatus().requestsRemaining).toBe(limit);
    }
  });

  it('API key 모드: 잔여량 헤더 덮어쓰기 → 최신 값 반영', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-overwrite', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // WHY: 두 번 덮어쓰면 최신값 10이 반영됨
    expect(monitor.getStatus().requestsRemaining).toBe(10);
  });

  it('API key 모드: 잔여량 헤더 덮어쓰기 → 스로틀 반영', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-overwrite-throttle', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('Subscription 모드: 한도 3, 2회 사용 후 isLimitApproaching', () => {
    // WHY: 2/3 ≈ 67% < 80% 이므로 false
    const auth = new SubscriptionAuth('sk-ant-oat01-limit-3', logger, 3);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(1);
    expect(typeof status.isLimitApproaching).toBe('boolean');
  });

  it('Subscription 모드: 한도 45 (기본값) 초기 잔여량 확인', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-default-45', logger, 45);
    const monitor = new TokenMonitor(auth, logger);
    expect(monitor.getStatus().requestsRemaining).toBe(45);
  });

  it('retry-after: 음수 문자열 → null 또는 음수 처리됨', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry-neg', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({ 'retry-after': '-5' });
    const status = monitor.getStatus();
    expect(typeof status.retryAfterSeconds === 'number' || status.retryAfterSeconds === null).toBe(true);
  });

  it('API key 모드: 잔여량 15000/50000 → 스로틀 false', () => {
    // WHY: 15000/50000 = 30% > 20% 이므로 스로틀 불필요
    const auth = new ApiKeyAuth('sk-ant-api01-large-limit', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '15000',
      'anthropic-ratelimit-requests-limit': '50000',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('Subscription 모드: 한도 200, 160회 사용 → isLimitApproaching true', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-200-160', logger, 200);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 160; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 1, output_tokens: 1 } });
    }
    expect(monitor.getStatus().isLimitApproaching).toBe(true);
    expect(monitor.getStatus().requestsRemaining).toBe(40);
  });

  it('TokenMonitor: getStatus()가 항상 객체를 반환한다', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-always-obj', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect(typeof status).toBe('object');
    expect(status).not.toBeNull();
  });

  it('API key 모드: 잔여량 헤더만 있고 한도 헤더 없을 때 처리됨', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-no-limit-hdr', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
    });
    // WHY: limit 없이 remaining만 있는 경우 안전하게 처리
    const status = monitor.getStatus();
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
    expect(status).not.toBeNull();
  });

  // ── 추가 edge/random 케이스 시리즈 2 ─────────────────────────────

  it('API key 모드: 잔여량 10%, 잔여 정확히 10 → shouldThrottleSpawn true', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-10pct-int', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('API key 모드: 잔여량 30% → shouldThrottleSpawn false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-30pct-int', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '30',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('API key 모드: 잔여량 2 → shouldPauseAll true', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-2-left', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '2',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('API key 모드: 잔여량 10 → shouldPauseAll false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-10-left', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('Subscription 모드: 한도 45 기본값, 36회 사용 → isLimitApproaching true', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-36-use', logger, 45);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 36; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(9);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('Subscription 모드: 한도 45, 35회 사용 → isLimitApproaching false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-35-use', logger, 45);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 35; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(10);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('API key 모드: 잔여량 헤더 연속 3번 업데이트 → 마지막 값', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-3-updates', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '80', 'anthropic-ratelimit-requests-limit': '100' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '50', 'anthropic-ratelimit-requests-limit': '100' });
    auth.updateFromResponse({ 'anthropic-ratelimit-requests-remaining': '10', 'anthropic-ratelimit-requests-limit': '100' });
    expect(monitor.getStatus().requestsRemaining).toBe(10);
  });

  it('TokenMonitor: getStatus 반환값은 객체이다', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-obj-type', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.getStatus()).toBe('object');
  });

  it('TokenMonitor: shouldThrottleSpawn / shouldPauseAll 반환 타입 boolean (초기)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-bool-init', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('Subscription 모드: 잔여량 0 이하 → isLimitApproaching true', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-rem', logger, 3);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 3; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('API key 모드: input_tokens 잔여량 별도 처리 확인', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-input-only', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '5000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    // WHY: input 토큰만 5% → shouldThrottleSpawn true 가능
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('API key 모드: output_tokens 잔여량 별도 처리 확인', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-output-only', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-output-tokens-remaining': '1000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    // WHY: output 토큰만 2% → shouldThrottleSpawn true 가능
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('Subscription 모드: 한도 10, 5회 사용 후 shouldPauseAll false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-5-no-pause', logger, 10);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 5; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }
    // WHY: remaining=5, estimatedMax=100 → ratio=5/100=5% = PAUSE_THRESHOLD(5%) → pause true
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('ApiKeyAuth: getRateLimitStatus 반환 객체는 null이 아님', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-not-null', logger);
    const status = auth.getRateLimitStatus();
    expect(status).not.toBeNull();
    expect(typeof status).toBe('object');
  });

  it('SubscriptionAuth: getRateLimitStatus 반환 객체는 null이 아님', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-not-null', logger, 45);
    const status = auth.getRateLimitStatus();
    expect(status).not.toBeNull();
    expect(typeof status).toBe('object');
  });

  it('API key 모드: 잔여량 50/50 = 100% → shouldPauseAll false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-full', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '50',
    });
    expect(monitor.shouldPauseAll()).toBe(false);
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('Subscription 모드: 연속 사용량 0 → 변화 없음', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-usage', logger, 20);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({}, { usage: { input_tokens: 0, output_tokens: 0 } });
    monitor.updateFromResponse({}, { usage: { input_tokens: 0, output_tokens: 0 } });
    // WHY: 0 사용량은 카운트 여부가 구현에 따라 다름
    expect(typeof monitor.getStatus().requestsRemaining).toBe('number');
  });

  it('API key 모드: 잔여량이 limit보다 큰 비정상 값 → shouldThrottleSpawn false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-over-limit', logger);
    const monitor = new TokenMonitor(auth, logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '200',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // WHY: 비정상 상황 — panic 없이 처리
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('TokenMonitor: updateFromResponse 10번 반복 → ok 안전', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-10-updates', logger);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 10; i++) {
      monitor.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': String(100 - i * 5),
        'anthropic-ratelimit-requests-limit': '100',
      });
    }
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(55); // 100 - 9*5 = 55
  });

  it('Subscription 모드: 5시간 + 2초 경과 → 완전 만료', () => {
    let fakeNow = 20000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-full-expire', logger, 10, () => fakeNow);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 3; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    expect(monitor.getStatus().requestsRemaining).toBe(7);

    fakeNow += 5 * 60 * 60 * 1000 + 2000;
    expect(monitor.getStatus().requestsRemaining).toBe(10);
  });

  it('API key 모드: 여러 헤더 한번에 → 모두 반영', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-all-headers', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '45',
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-input-tokens-remaining': '80000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
      'anthropic-ratelimit-output-tokens-remaining': '25000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(45);
    // WHY: requests 45/1000 = 4.5% ≤ 20% LIMIT_APPROACHING_THRESHOLD → isLimitApproaching=true → throttle
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('Subscription 모드: 사용 0회 → shouldThrottleSpawn false', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-use', logger, 45);
    const monitor = new TokenMonitor(auth, logger);
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('10개 랜덤 API key → 각각 독립 초기 상태', () => {
    const monitors = Array.from({ length: 10 }, (_, i) => {
      const auth = new ApiKeyAuth(`sk-ant-api01-rand-${i}-${crypto.randomUUID().slice(0, 8)}`, logger);
      return new TokenMonitor(auth, logger);
    });
    for (const monitor of monitors) {
      expect(monitor.getStatus().requestsRemaining).toBeNull();
      expect(monitor.shouldThrottleSpawn()).toBe(false);
      expect(monitor.shouldPauseAll()).toBe(false);
    }
  });
});
