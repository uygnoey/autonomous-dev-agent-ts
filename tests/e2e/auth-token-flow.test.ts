/**
 * E2E: 인증 + 토큰 모니터 플로우 / Auth + Token Monitor Flow
 *
 * @description
 * KR: ApiKeyAuth 헤더 생성 → Rate limit 응답 시뮬레이션 →
 *     SubscriptionAuth 롤링 윈도우 → TokenMonitor 스로틀/일시정지 판단.
 * EN: Full auth flow from API key headers through rate limiting to token monitor decisions.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../src/core/logger.js';
import { ApiKeyAuth } from '../../src/auth/api-key-auth.js';
import { SubscriptionAuth } from '../../src/auth/subscription-auth.js';
import { TokenMonitor } from '../../src/layer2/token-monitor.js';

const logger = new ConsoleLogger('error');

describe('인증 + 토큰 모니터 플로우 E2E / Auth + Token Monitor Flow E2E', () => {
  it('ApiKeyAuth: 인증 헤더 생성', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test-key', logger);

    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe('sk-ant-api01-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(auth.authMode).toBe('api-key');
  });

  it('ApiKeyAuth: Rate limit 헤더 파싱', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);

    // WHY: 충분한 잔여량 → isLimitApproaching = false
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '50000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
      'anthropic-ratelimit-output-tokens-remaining': '30000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(80);
    expect(status.inputTokensRemaining).toBe(50000);
    expect(status.outputTokensRemaining).toBe(30000);
    expect(status.retryAfterSeconds).toBeNull();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: Rate limit 접근 경고 (20% 이하)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);

    // WHY: 잔여 요청 15/100 = 15% < 20% → isLimitApproaching = true
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '15',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '80000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
      'anthropic-ratelimit-output-tokens-remaining': '40000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });

    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 429 retry-after 헤더 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);

    auth.updateFromResponse({
      'retry-after': '30',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(30);
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 잘못된 헤더 값 무시', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);

    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'invalid',
      'anthropic-ratelimit-requests-limit': '-5',
    });

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    // WHY: 음수는 파싱 실패로 처리
    expect(status.isLimitApproaching).toBe(false);
  });

  it('SubscriptionAuth: Bearer 토큰 헤더 생성', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-test-token', logger);

    const headers = auth.getAuthHeader();
    expect(headers['authorization']).toBe('Bearer sk-ant-oat01-test-token');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(auth.authMode).toBe('oauth-token');
  });

  it('SubscriptionAuth: 사용량 추적 (응답 본문)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-test', logger, 45);

    // WHY: usage 정보가 있는 응답 본문 시뮬레이션
    auth.updateFromResponse({}, {
      usage: { input_tokens: 1000, output_tokens: 500 },
    });

    auth.updateFromResponse({}, {
      usage: { input_tokens: 2000, output_tokens: 1000 },
    });

    const status = auth.getRateLimitStatus();
    // WHY: 2개 메시지 사용, 45개 한도 → 잔여 43
    expect(status.requestsRemaining).toBe(43);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('SubscriptionAuth: 한도 접근 경고 (80% 이상 사용)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-test', logger, 10);

    // WHY: 8개 메시지 → 80% 사용 → isLimitApproaching = true
    for (let i = 0; i < 8; i++) {
      auth.updateFromResponse({}, {
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    }

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(2);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('SubscriptionAuth: 5시간 롤링 윈도우 리셋', () => {
    // WHY: nowFn을 주입하여 시간 조작 테스트
    let fakeNow = 1000000;
    const auth = new SubscriptionAuth(
      'sk-ant-oat01-test',
      logger,
      45,
      () => fakeNow,
    );

    // 5개 메시지 기록
    for (let i = 0; i < 5; i++) {
      auth.updateFromResponse({}, {
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      fakeNow += 1000;
    }

    let status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(40);

    // WHY: 5시간 + 1초 후 → 모든 기록이 만료되어야 한다
    fakeNow += 5 * 60 * 60 * 1000 + 1000;

    status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('SubscriptionAuth: 유효하지 않은 응답 본문 무시', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-test', logger, 45);

    // WHY: usage 필드 없는 응답은 무시
    auth.updateFromResponse({}, { data: 'no usage' });
    auth.updateFromResponse({}, null);
    auth.updateFromResponse({}, undefined);

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('TokenMonitor + ApiKeyAuth: 스로틀 판단', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 초기 상태 — 잔여 정보 없음 → 스로틀 필요 없음
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);

    // WHY: 충분한 잔여량 → 스로틀 불필요
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-output-tokens-remaining': '40000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });

    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('TokenMonitor + ApiKeyAuth: 잔여량 부족 → 스로틀 권장', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: 잔여 요청 10/100 = 10% → 스로틀 필요 (20% 이하)
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-output-tokens-remaining': '5000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });

    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('TokenMonitor + ApiKeyAuth: 429 응답 → 전체 일시 정지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: retry-after > 0 → 전체 일시 정지
    monitor.updateFromResponse({
      'retry-after': '60',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });

    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('TokenMonitor + SubscriptionAuth: 구독 사용량 기반 스로틀', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-test', logger, 10);
    const monitor = new TokenMonitor(auth, logger);

    // WHY: SubscriptionAuth는 headers가 아닌 body에서 사용량 추적
    for (let i = 0; i < 8; i++) {
      monitor.updateFromResponse({}, {
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    }

    // WHY: 80% 사용 → isLimitApproaching = true → shouldThrottleSpawn = true
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('TokenMonitor: getStatus 상태 조회', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-test', logger);
    const monitor = new TokenMonitor(auth, logger);

    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });

    const status = monitor.getStatus();
    expect(status.requestsRemaining).toBe(50);
    expect(status.isLimitApproaching).toBe(false);
  });
});
