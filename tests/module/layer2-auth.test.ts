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
import { ApiKeyAuth, SubscriptionAuth } from '../../src/auth/index.js';
import { ConsoleLogger } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import { TokenMonitor } from '../../src/layer2/index.js';

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
});
