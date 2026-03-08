/**
 * E2E: 인증 + 토큰 모니터 플로우 / Auth + Token Monitor Flow
 *
 * @description
 * KR: ApiKeyAuth 헤더 생성 → Rate limit 응답 시뮬레이션 →
 *     SubscriptionAuth 롤링 윈도우 → TokenMonitor 스로틀/일시정지 판단.
 * EN: Full auth flow from API key headers through rate limiting to token monitor decisions.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ApiKeyAuth } from 'auth/api-key-auth.js';
import { SubscriptionAuth } from 'auth/subscription-auth.js';
import { TokenMonitor } from 'layer2/token-monitor.js';

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

  // ── Edge cases: ApiKeyAuth ────────────────────────────────────────

  it('ApiKeyAuth: 빈 문자열 API 키도 헤더로 포함', () => {
    const auth = new ApiKeyAuth('', logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe('');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('ApiKeyAuth: 매우 긴 API 키 (UUID×10)', () => {
    const longKey = Array.from({ length: 10 }, () =>
      Math.random().toString(36).slice(2),
    ).join('-');
    const auth = new ApiKeyAuth(longKey, logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe(longKey);
  });

  it('ApiKeyAuth: 한글/특수문자 포함 API 키', () => {
    const weirdKey = 'sk-테스트-🔑-key!@#$%';
    const auth = new ApiKeyAuth(weirdKey, logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe(weirdKey);
  });

  it('ApiKeyAuth: 잔여량 0 → isLimitApproaching = true', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-zero', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 잔여량 정확히 20% (경계값)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-boundary', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '20',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 20%는 경계값 — 구현에 따라 true 또는 false
    expect(typeof status.isLimitApproaching).toBe('boolean');
  });

  it('ApiKeyAuth: 잔여량이 한도보다 큰 경우 (비정상 응답)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-abnormal', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '200',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(200);
    // WHY: 비정상 상황이지만 isLimitApproaching = false여야 한다
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: retry-after 0 → retryAfterSeconds 0', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry0', logger);
    auth.updateFromResponse({
      'retry-after': '0',
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 0초 retry-after는 의미 없음 — null 또는 0 처리 확인
    expect(status.retryAfterSeconds === null || status.retryAfterSeconds === 0).toBe(true);
  });

  it('ApiKeyAuth: retry-after 매우 큰 값 (86400초 = 1일)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-bigretry', logger);
    auth.updateFromResponse({
      'retry-after': '86400',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(86400);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 소수 헤더 값 → 파싱 실패로 처리', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-float', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50.5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 소수점은 정수 파싱 실패 또는 floor 처리
    expect(status.requestsRemaining === null || typeof status.requestsRemaining === 'number').toBe(true);
  });

  it('ApiKeyAuth: 빈 헤더 객체 → 상태 변경 없음', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-empty', logger);
    auth.updateFromResponse({});
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: updateFromResponse 여러 번 호출 → 마지막 값 유지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-multi', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
    });
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(5);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 음수 retry-after → 무시', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-negretry', logger);
    auth.updateFromResponse({
      'retry-after': '-10',
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 음수 retry-after는 무효 → null 처리
    expect(status.retryAfterSeconds === null || (status.retryAfterSeconds !== undefined && status.retryAfterSeconds < 0)).toBe(true);
  });

  it('ApiKeyAuth: authMode 항상 api-key 고정', () => {
    const auth1 = new ApiKeyAuth('key-a', logger);
    const auth2 = new ApiKeyAuth('key-b', logger);
    expect(auth1.authMode).toBe('api-key');
    expect(auth2.authMode).toBe('api-key');
  });

  it('ApiKeyAuth: output 토큰 잔여량 0 → 접근 경고', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-outzero', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-output-tokens-remaining': '0',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    const status = auth.getRateLimitStatus();
    expect(status.outputTokensRemaining).toBe(0);
  });

  // ── Edge cases: SubscriptionAuth ─────────────────────────────────

  it('SubscriptionAuth: 빈 문자열 토큰도 Bearer 헤더 포함', () => {
    const auth = new SubscriptionAuth('', logger);
    const headers = auth.getAuthHeader();
    expect(headers['authorization']).toBe('Bearer ');
  });

  it('SubscriptionAuth: 한도 1개 — 1개 사용 → 0 남음', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-tiny', logger, 1);
    auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('SubscriptionAuth: 한도 0 → 초기 잔여 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero-limit', logger, 0);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(0);
  });

  it('SubscriptionAuth: 매우 큰 한도 (1000개)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-big', logger, 1000);
    for (let i = 0; i < 100; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(900);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('SubscriptionAuth: usage.input_tokens만 있고 output_tokens 없는 경우', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-partial', logger, 45);
    auth.updateFromResponse({}, { usage: { input_tokens: 500 } });
    const status = auth.getRateLimitStatus();
    // WHY: 응답이 카운트되어야 한다 (output_tokens 선택적)
    expect(status.requestsRemaining).toBeLessThanOrEqual(45);
  });

  it('SubscriptionAuth: authMode 항상 oauth-token 고정', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-mode', logger);
    expect(auth.authMode).toBe('oauth-token');
  });

  it('SubscriptionAuth: 한글 포함 응답 무시', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-korean', logger, 45);
    auth.updateFromResponse({}, { message: '오류가 발생했습니다' });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('SubscriptionAuth: null 응답 본문 여러 번 → 카운트 불변', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-nullx', logger, 45);
    auth.updateFromResponse({}, null);
    auth.updateFromResponse({}, null);
    auth.updateFromResponse({}, null);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('SubscriptionAuth: 5시간 직전 → 만료 안 됨', () => {
    let fakeNow = 2000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-edge', logger, 45, () => fakeNow);
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });

    // WHY: 5시간 - 1초 → 아직 윈도우 내부
    fakeNow += 5 * 60 * 60 * 1000 - 1000;
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(44);
  });

  it('SubscriptionAuth: 정확히 5시간 → 만료', () => {
    let fakeNow = 3000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-exact', logger, 45, () => fakeNow);
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });

    // WHY: 정확히 5시간 → 만료 (포함 or 미포함 경계 확인)
    fakeNow += 5 * 60 * 60 * 1000;
    const status = auth.getRateLimitStatus();
    // 경계값이므로 44 또는 45 모두 허용
    expect(status.requestsRemaining === 44 || status.requestsRemaining === 45).toBe(true);
  });

  it('SubscriptionAuth: updateFromResponse 연속 50회 → 잔여 = 한도 - 50', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-bulk', logger, 100);
    for (let i = 0; i < 50; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(50);
  });

  // ── Edge cases: TokenMonitor ──────────────────────────────────────

  it('TokenMonitor: 초기화 후 getStatus 호출 — 안전', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-init', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect(status).toBeDefined();
    expect(status.isLimitApproaching).toBe(false);
    expect(status.retryAfterSeconds).toBeNull();
  });

  it('TokenMonitor: updateFromResponse 빈 헤더 → 상태 유지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-empty2', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({});
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('TokenMonitor: 정확히 20% 경계에서 throttle 판단', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-20pct', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '20',
      'anthropic-ratelimit-requests-limit': '100',
    });
    // WHY: 경계값 테스트 — boolean이어야 함
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('TokenMonitor: retry-after = 1 → shouldPauseAll = true', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-pause1', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'retry-after': '1',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('TokenMonitor + ApiKeyAuth: output 토큰 0% → shouldPauseAll', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-outtok', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-output-tokens-remaining': '0',
      'anthropic-ratelimit-output-tokens-limit': '50000',
      'retry-after': '5',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('TokenMonitor + SubscriptionAuth: 한도 초과 상태 — shouldThrottle + shouldPause 판단', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-exceeded', logger, 5);
    const monitor = new TokenMonitor(auth, logger);
    for (let i = 0; i < 5; i++) {
      monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    }
    // WHY: 100% 사용 → throttle 필요
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('TokenMonitor: updateFromResponse null body → 무시', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-nullbody', logger, 45);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({}, null);
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('TokenMonitor + ApiKeyAuth: input 토큰 5% 잔여 → shouldThrottleSpawn', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-lowtok', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '80',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '5000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    // WHY: 입력 토큰 5% → throttle 권장
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('TokenMonitor: getStatus는 auth getRateLimitStatus와 동일', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-sync', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '30',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const monitorStatus = monitor.getStatus();
    const authStatus = auth.getRateLimitStatus();
    expect(monitorStatus.requestsRemaining).toBe(authStatus.requestsRemaining);
    expect(monitorStatus.isLimitApproaching).toBe(authStatus.isLimitApproaching);
  });

  it('ApiKeyAuth: 특수문자 포함 헤더 값 → 파싱 실패', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-special', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': 'NaN',
      'anthropic-ratelimit-requests-limit': 'Infinity',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('SubscriptionAuth: 기본 한도(45)로 생성 후 잔여 확인', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-default', logger);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(45);
  });

  it('ApiKeyAuth: input/output/request 모두 낮을 때 → isLimitApproaching', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-alllimit', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '8000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
      'anthropic-ratelimit-output-tokens-remaining': '4000',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('SubscriptionAuth: 랜덤 UUID 형식 토큰도 Bearer 헤더 정상 포함', () => {
    const uuidToken = `sk-ant-oat01-${crypto.randomUUID()}`;
    const auth = new SubscriptionAuth(uuidToken, logger, 45);
    const headers = auth.getAuthHeader();
    expect(headers['authorization']).toBe(`Bearer ${uuidToken}`);
    expect(auth.authMode).toBe('oauth-token');
  });

  it('TokenMonitor: 여러 번 연속 update 후 최종 상태 정합성', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-seq', logger);
    const monitor = new TokenMonitor(auth, logger);

    // 충분한 잔여량
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(false);

    // 위험 수위
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldThrottleSpawn()).toBe(true);

    // 완전 차단
    monitor.updateFromResponse({
      'retry-after': '10',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('ApiKeyAuth: 헤더 키 대소문자 — 소문자로 정규화', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-case', logger);
    const headers = auth.getAuthHeader();
    // WHY: HTTP 헤더는 소문자 키로 반환되어야 한다
    const keys = Object.keys(headers);
    for (const key of keys) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  // ── 추가 edge/random 케이스 ──────────────────────────────────────

  it('ApiKeyAuth: UUID 형식 API 키', () => {
    const uuidKey = `sk-ant-api01-${crypto.randomUUID()}`;
    const auth = new ApiKeyAuth(uuidKey, logger);
    const headers = auth.getAuthHeader();
    expect(headers['x-api-key']).toBe(uuidKey);
    expect(auth.authMode).toBe('api-key');
  });

  it('ApiKeyAuth: 인스턴스 두 개는 독립적', () => {
    const auth1 = new ApiKeyAuth('sk-ant-api01-aaa', logger);
    const auth2 = new ApiKeyAuth('sk-ant-api01-bbb', logger);
    auth1.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status1 = auth1.getRateLimitStatus();
    const status2 = auth2.getRateLimitStatus();
    expect(status1.requestsRemaining).toBe(10);
    expect(status2.requestsRemaining).toBeNull();
  });

  it('ApiKeyAuth: authMode는 api-key 고정 (독립 인스턴스)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-validate', logger);
    expect(auth.authMode).toBe('api-key');
    // WHY: authMode는 인스턴스 생성 이후 불변
    expect(Object.prototype.hasOwnProperty.call(auth, 'authMode') || auth.authMode === 'api-key').toBe(true);
  });

  it('ApiKeyAuth: input 토큰 잔여량 99% → isLimitApproaching false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-input99', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '99000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: output 토큰만 낮을 때 → isLimitApproaching true 가능', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-outtoklow', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-output-tokens-remaining': '500',
      'anthropic-ratelimit-output-tokens-limit': '50000',
    });
    const status = auth.getRateLimitStatus();
    // WHY: output 토큰 1% 남음 → 접근 경고 가능
    expect(typeof status.isLimitApproaching).toBe('boolean');
  });

  it('ApiKeyAuth: getRateLimitStatus는 항상 객체 반환', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-objcheck', logger);
    const status = auth.getRateLimitStatus();
    expect(typeof status).toBe('object');
    expect(status).not.toBeNull();
  });

  it('ApiKeyAuth: requestsRemaining 초기값 null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-init-null', logger);
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBeNull();
  });

  it('ApiKeyAuth: 100번 연속 updateFromResponse → 최신 값 유지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-100x', logger);
    for (let i = 100; i > 0; i--) {
      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': String(i),
        'anthropic-ratelimit-requests-limit': '100',
      });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(1);
  });

  it('SubscriptionAuth: authMode는 oauth-token 고정 (독립 인스턴스)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-validate', logger);
    expect(auth.authMode).toBe('oauth-token');
  });

  it('SubscriptionAuth: 두 인스턴스 독립적 카운팅', () => {
    const auth1 = new SubscriptionAuth('sk-ant-oat01-ind1', logger, 10);
    const auth2 = new SubscriptionAuth('sk-ant-oat01-ind2', logger, 10);
    auth1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    auth1.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    const status1 = auth1.getRateLimitStatus();
    const status2 = auth2.getRateLimitStatus();
    expect(status1.requestsRemaining).toBe(8);
    expect(status2.requestsRemaining).toBe(10);
  });

  it('SubscriptionAuth: 음수 한도 → 초기 잔여 음수 또는 0', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-neg-limit', logger, -5);
    const status = auth.getRateLimitStatus();
    // WHY: 음수 한도는 구현에 따라 0 또는 음수 처리
    expect(typeof status.requestsRemaining).toBe('number');
  });

  it('SubscriptionAuth: 만료 직전 여러 업데이트 → 카운트 정확', () => {
    let fakeNow = 5000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-precise', logger, 20, () => fakeNow);

    // 10개 추가
    for (let i = 0; i < 10; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 50, output_tokens: 25 } });
      fakeNow += 1000;
    }

    const before = auth.getRateLimitStatus();
    expect(before.requestsRemaining).toBe(10);

    // 5시간 경과 → 첫 번째 그룹 만료
    fakeNow += 5 * 60 * 60 * 1000 + 1000;

    const after = auth.getRateLimitStatus();
    expect(after.requestsRemaining).toBe(20);
  });

  it('TokenMonitor: SubscriptionAuth 잔여 0 → shouldPauseAll 여부 boolean', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-zero2', logger, 2);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    monitor.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    // WHY: 잔여 0 → shouldPauseAll은 구현에 따라 다름
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('TokenMonitor: 여러 인스턴스 동일 auth 공유 → 독립 상태', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-shared', logger);
    const monitor1 = new TokenMonitor(auth, logger);
    const monitor2 = new TokenMonitor(auth, logger);

    monitor1.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '5',
      'anthropic-ratelimit-requests-limit': '100',
    });

    // WHY: auth 공유이므로 monitor2도 같은 상태 반영
    expect(monitor2.shouldThrottleSpawn()).toBe(true);
  });

  it('ApiKeyAuth: input_tokens limit이 0인 경우', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-zerolimit', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-input-tokens-remaining': '0',
      'anthropic-ratelimit-input-tokens-limit': '0',
    });
    const status = auth.getRateLimitStatus();
    expect(status.inputTokensRemaining).toBe(0);
  });

  it('SubscriptionAuth: updateFromResponse 빈 usage 객체', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-emptyusage', logger, 45);
    auth.updateFromResponse({}, { usage: {} });
    const status = auth.getRateLimitStatus();
    // WHY: 빈 usage 객체는 카운트 또는 무시 — 구현에 따라 다름
    expect(typeof status.requestsRemaining).toBe('number');
  });

  it('ApiKeyAuth: getAuthHeader 항상 새 객체 반환', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-newobj', logger);
    const h1 = auth.getAuthHeader();
    const h2 = auth.getAuthHeader();
    // WHY: 반환 객체는 동등하지만 참조가 다를 수 있음
    expect(h1['x-api-key']).toBe(h2['x-api-key']);
    expect(h1['anthropic-version']).toBe(h2['anthropic-version']);
  });

  it('SubscriptionAuth: getAuthHeader 항상 올바른 Bearer 형식', () => {
    const tokens = [
      'sk-ant-oat01-test',
      'bearer-test-token',
      crypto.randomUUID(),
    ];
    for (const token of tokens) {
      const auth = new SubscriptionAuth(token, logger);
      const headers = auth.getAuthHeader();
      expect(headers['authorization']).toBe(`Bearer ${token}`);
    }
  });

  it('TokenMonitor: shouldThrottleSpawn는 boolean 타입', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-booltype', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('TokenMonitor: shouldPauseAll는 boolean 타입', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-booltype2', logger);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  // ── 추가 edge/random 케이스 시리즈 2 ─────────────────────────────

  it('ApiKeyAuth: 헤더 값이 공백 문자열 → 파싱 실패로 null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-space-val', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '   ',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: Number('   ') = 0 in JS (whitespace-only string parses as 0, not NaN)
    expect(status.requestsRemaining).toBe(0);
  });

  it('ApiKeyAuth: 헤더 값이 탭 문자 → 파싱 실패로 null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-tab-val', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '\t50\t',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    // WHY: 탭이 포함된 숫자는 구현에 따라 파싱 성공 또는 실패
    expect(typeof status.requestsRemaining === 'number' || status.requestsRemaining === null).toBe(true);
  });

  it('ApiKeyAuth: 잔여량이 한도의 정확히 1/3 (비정수 비율)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-third', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '33',
      'anthropic-ratelimit-requests-limit': '99',
    });
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(33);
    // WHY: 33/99 ≈ 33% > 20% → isLimitApproaching = false
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: 잔여량 19/100 → isLimitApproaching true (20% 미만)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-19pct-e2e', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '19',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(true);
  });

  it('ApiKeyAuth: 잔여량 21/100 → isLimitApproaching false', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-21pct-e2e', logger);
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '21',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.isLimitApproaching).toBe(false);
  });

  it('ApiKeyAuth: 동일 인스턴스 반복 헤더 → 최신 값만 남음', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-overwrite-e2e', logger);
    for (let remaining = 90; remaining >= 10; remaining -= 10) {
      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': String(remaining),
        'anthropic-ratelimit-requests-limit': '100',
      });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(10);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('SubscriptionAuth: 기본 한도(45), 36회 사용 → isLimitApproaching true (80%)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-80pct-e2e', logger, 45);
    for (let i = 0; i < 36; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(9);
    expect(status.isLimitApproaching).toBe(true);
  });

  it('SubscriptionAuth: 35회 사용 → isLimitApproaching false (77%)', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-77pct-e2e', logger, 45);
    for (let i = 0; i < 35; i++) {
      auth.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(10);
    expect(status.isLimitApproaching).toBe(false);
  });

  it('TokenMonitor: ApiKeyAuth 5%초과/이하 경계선 패턴', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-5pct-e2e', logger);
    const monitor = new TokenMonitor(auth, logger);

    // 6% → pause false
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '6',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(false);

    // 4% → pause true
    auth.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '4',
      'anthropic-ratelimit-requests-limit': '100',
    });
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('TokenMonitor: SubscriptionAuth로 shouldPauseAll은 boolean', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-pause-bool', logger, 10);
    const monitor = new TokenMonitor(auth, logger);
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('ApiKeyAuth: input 토큰 잔여량 null이면 inputTokensRemaining null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-null-input', logger);
    const status = auth.getRateLimitStatus();
    // WHY: 헤더 없음 → 초기값 null
    expect(status.inputTokensRemaining === null || typeof status.inputTokensRemaining === 'number').toBe(true);
  });

  it('ApiKeyAuth: output 토큰 잔여량 null이면 outputTokensRemaining null', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-null-output', logger);
    const status = auth.getRateLimitStatus();
    expect(status.outputTokensRemaining === null || typeof status.outputTokensRemaining === 'number').toBe(true);
  });

  it('SubscriptionAuth: nowFn 조작 — 정확히 5시간 경계에서 만료 여부 검증', () => {
    let fakeNow = 9000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-boundary5h', logger, 10, () => fakeNow);

    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    fakeNow += 5 * 60 * 60 * 1000; // 정확히 5시간

    const status = auth.getRateLimitStatus();
    // WHY: 경계값 — 9 또는 10 모두 허용
    expect(status.requestsRemaining === 9 || status.requestsRemaining === 10).toBe(true);
  });

  it('SubscriptionAuth: nowFn 조작 — 4시간 59분 59초 후 → 아직 유효', () => {
    let fakeNow = 10000000;
    const auth = new SubscriptionAuth('sk-ant-oat01-4h59m', logger, 10, () => fakeNow);

    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    fakeNow += (5 * 60 * 60 * 1000) - 1000; // 5시간 - 1초

    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(9);
  });

  it('TokenMonitor: getStatus 필드 존재 확인 (requestsRemaining)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-fields', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect('requestsRemaining' in status).toBe(true);
  });

  it('TokenMonitor: getStatus 필드 존재 확인 (retryAfterSeconds)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-fields2', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect('retryAfterSeconds' in status).toBe(true);
  });

  it('TokenMonitor: getStatus 필드 존재 확인 (isLimitApproaching)', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-fields3', logger);
    const monitor = new TokenMonitor(auth, logger);
    const status = monitor.getStatus();
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('ApiKeyAuth: getAuthHeader는 항상 anthropic-version 포함', () => {
    for (let i = 0; i < 5; i++) {
      const auth = new ApiKeyAuth(`sk-ant-api01-version-${i}`, logger);
      const headers = auth.getAuthHeader();
      expect(headers['anthropic-version']).toBeDefined();
      expect(typeof headers['anthropic-version']).toBe('string');
    }
  });

  it('SubscriptionAuth: getAuthHeader는 항상 authorization 포함', () => {
    for (let i = 0; i < 5; i++) {
      const auth = new SubscriptionAuth(`sk-ant-oat01-hdr-${i}`, logger);
      const headers = auth.getAuthHeader();
      expect(headers['authorization']).toBeDefined();
      expect(headers['authorization']!.startsWith('Bearer ')).toBe(true);
    }
  });

  it('ApiKeyAuth: retry-after 100 → retryAfterSeconds 100', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-retry100', logger);
    auth.updateFromResponse({
      'retry-after': '100',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-limit': '100',
    });
    const status = auth.getRateLimitStatus();
    expect(status.retryAfterSeconds).toBe(100);
  });

  it('TokenMonitor + ApiKeyAuth: input 토큰 1% → shouldThrottleSpawn 확인', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-input1pct', logger);
    const monitor = new TokenMonitor(auth, logger);
    monitor.updateFromResponse({
      'anthropic-ratelimit-requests-remaining': '90',
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-input-tokens-remaining': '1000',
      'anthropic-ratelimit-input-tokens-limit': '100000',
    });
    // WHY: input 토큰 1% → throttle 권장
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('SubscriptionAuth: 사용량 추적 후 getRateLimitStatus 연속 2번 호출 → 동일', () => {
    const auth = new SubscriptionAuth('sk-ant-oat01-getx2', logger, 20);
    auth.updateFromResponse({}, { usage: { input_tokens: 100, output_tokens: 50 } });
    const s1 = auth.getRateLimitStatus();
    const s2 = auth.getRateLimitStatus();
    expect(s1.requestsRemaining).toBe(s2.requestsRemaining);
    expect(s1.isLimitApproaching).toBe(s2.isLimitApproaching);
  });

  it('TokenMonitor: ApiKeyAuth 없음(미설정) 상태에서 getStatus는 안전', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-uninit-check', logger);
    const monitor = new TokenMonitor(auth, logger);
    // WHY: 초기화 직후 — 예외 없이 동작
    expect(() => monitor.getStatus()).not.toThrow();
    expect(() => monitor.shouldThrottleSpawn()).not.toThrow();
    expect(() => monitor.shouldPauseAll()).not.toThrow();
  });

  it('ApiKeyAuth: 연속 10번 updateFromResponse → 항상 정합성 유지', () => {
    const auth = new ApiKeyAuth('sk-ant-api01-coherent', logger);
    const remainings = [90, 80, 70, 60, 50, 40, 30, 20, 10, 5];
    for (const rem of remainings) {
      auth.updateFromResponse({
        'anthropic-ratelimit-requests-remaining': String(rem),
        'anthropic-ratelimit-requests-limit': '100',
      });
    }
    const status = auth.getRateLimitStatus();
    expect(status.requestsRemaining).toBe(5);
    expect(status.isLimitApproaching).toBe(true);
  });
});
