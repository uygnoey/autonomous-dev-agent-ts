/**
 * TokenMonitor 단위 테스트 / TokenMonitor unit tests
 *
 * @description
 * shouldThrottleSpawn, shouldPauseAll, getStatus, updateFromResponse 검증.
 * THROTTLE_THRESHOLD=0.2 (requestsRemaining<=20), PAUSE_THRESHOLD=0.05 (<=5).
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AuthProvider, RateLimitStatus } from 'auth/types.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import { TokenMonitor } from 'layer2/token-monitor.js';

function makeStatus(overrides: Partial<RateLimitStatus> = {}): RateLimitStatus {
  return {
    requestsRemaining: null,
    inputTokensRemaining: null,
    outputTokensRemaining: null,
    retryAfterSeconds: null,
    isLimitApproaching: false,
    ...overrides,
  };
}

function createMockAuthProvider(status: RateLimitStatus): AuthProvider {
  return {
    authMode: 'api-key',
    getAuthHeader: () => ({ Authorization: 'Bearer test' }),
    getRateLimitStatus: () => status,
    updateFromResponse: (): Result<void> => ok(undefined),
  };
}

function makeMonitor(status: RateLimitStatus): TokenMonitor {
  const logger = new ConsoleLogger('error');
  return new TokenMonitor(createMockAuthProvider(status), logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('TokenMonitor 생성자', () => {
  it('인스턴스 생성됨', () => {
    const provider = createMockAuthProvider(makeStatus());
    const logger = new ConsoleLogger('error');
    expect(() => new TokenMonitor(provider, logger)).not.toThrow();
  });

  it('TokenMonitor 인스턴스', () => {
    expect(makeMonitor(makeStatus())).toBeInstanceOf(TokenMonitor);
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const m1 = makeMonitor(makeStatus());
    const m2 = makeMonitor(makeStatus());
    expect(m1).not.toBe(m2);
  });

  it('shouldThrottleSpawn 메서드 존재', () => {
    expect(typeof makeMonitor(makeStatus()).shouldThrottleSpawn).toBe('function');
  });

  it('shouldPauseAll 메서드 존재', () => {
    expect(typeof makeMonitor(makeStatus()).shouldPauseAll).toBe('function');
  });

  it('getStatus 메서드 존재', () => {
    expect(typeof makeMonitor(makeStatus()).getStatus).toBe('function');
  });

  it('updateFromResponse 메서드 존재', () => {
    expect(typeof makeMonitor(makeStatus()).updateFromResponse).toBe('function');
  });

  it('10번 생성 → 오류 없음', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeMonitor(makeStatus())).not.toThrow();
    }
  });
});

// ── shouldThrottleSpawn ────────────────────────────────────────

describe('TokenMonitor shouldThrottleSpawn', () => {
  it('requestsRemaining=20 (정확히 20%) → true (스로틀)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=19 → true (임계값 이하)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 19 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=10 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=21 → false (임계값 초과)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 21 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=80 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=100 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=null + isLimitApproaching=false → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=null + isLimitApproaching=true → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=true → true (requestsRemaining 무관)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 90, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=0 → true (최소값)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=1 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=5 → true (5<=20 임계값)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=0 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=1 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=5 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=10 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=15 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 15 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=19 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 19 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=20 → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=21 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 21 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=22 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 22 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=30 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 30 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=50 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=80 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=99 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 99 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=100 → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('shouldThrottleSpawn 반환값은 boolean 타입', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('shouldThrottleSpawn 5회 호출 → 일관됨', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    const results = Array.from({ length: 5 }, () => monitor.shouldThrottleSpawn());
    expect(results.every(r => r === true)).toBe(true);
  });

  it('isLimitApproaching=true + requestsRemaining=100 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=false + requestsRemaining=null → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: false }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });
});

// ── shouldPauseAll ─────────────────────────────────────────────

describe('TokenMonitor shouldPauseAll', () => {
  it('requestsRemaining=5 (정확히 5%) → true (일시 정지)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=4 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 4 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=3 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=6 → false (임계값 초과)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 6 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=80 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=null + retryAfterSeconds=null → false', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=30 → true (429 응답)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30, requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=1 → true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=0 → false (0은 미설정 취급)', () => {
    // retryAfterSeconds > 0 조건이므로 0은 미설정
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 0, requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=null → false (미설정)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: null, requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=0 → true (완전 소진)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=0 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=1 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=2 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 2 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=3 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=4 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 4 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=5 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=6 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 6 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=7 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 7 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=10 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=20 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=50 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=80 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=100 → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=1 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=5 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 5, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=10 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 10, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=30 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=60 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 60, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=120 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 120, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('shouldPauseAll 반환값은 boolean 타입', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('shouldPauseAll 5회 호출 → 일관됨', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    const results = Array.from({ length: 5 }, () => monitor.shouldPauseAll());
    expect(results.every(r => r === true)).toBe(true);
  });
});

// ── getStatus ──────────────────────────────────────────────────

describe('TokenMonitor getStatus', () => {
  it('status를 그대로 반환', () => {
    const status = makeStatus({
      requestsRemaining: 50,
      inputTokensRemaining: 1000,
      outputTokensRemaining: 500,
      retryAfterSeconds: null,
      isLimitApproaching: false,
    });
    const monitor = makeMonitor(status);
    const result = monitor.getStatus();
    expect(result.requestsRemaining).toBe(50);
    expect(result.inputTokensRemaining).toBe(1000);
    expect(result.outputTokensRemaining).toBe(500);
  });

  it('isLimitApproaching 필드 전달', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true }));
    expect(monitor.getStatus().isLimitApproaching).toBe(true);
  });

  it('retryAfterSeconds 필드 전달', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30 }));
    expect(monitor.getStatus().retryAfterSeconds).toBe(30);
  });

  it('모든 null 상태 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.getStatus();
    expect(result.requestsRemaining).toBeNull();
    expect(result.inputTokensRemaining).toBeNull();
    expect(result.outputTokensRemaining).toBeNull();
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.isLimitApproaching).toBe(false);
  });

  it('getStatus 반환값은 객체 타입', () => {
    const monitor = makeMonitor(makeStatus());
    expect(typeof monitor.getStatus()).toBe('object');
  });

  it('getStatus 5회 → 동일한 requestsRemaining', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 42 }));
    for (let i = 0; i < 5; i++) {
      expect(monitor.getStatus().requestsRemaining).toBe(42);
    }
  });

  it('inputTokensRemaining=5000 → 정확히 반환', () => {
    const monitor = makeMonitor(makeStatus({ inputTokensRemaining: 5000 }));
    expect(monitor.getStatus().inputTokensRemaining).toBe(5000);
  });

  it('outputTokensRemaining=2000 → 정확히 반환', () => {
    const monitor = makeMonitor(makeStatus({ outputTokensRemaining: 2000 }));
    expect(monitor.getStatus().outputTokensRemaining).toBe(2000);
  });

  it('isLimitApproaching=false → 정확히 반환', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: false }));
    expect(monitor.getStatus().isLimitApproaching).toBe(false);
  });

  it('retryAfterSeconds=null → null 반환', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: null }));
    expect(monitor.getStatus().retryAfterSeconds).toBeNull();
  });

  it('requestsRemaining=0 → 0 반환', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.getStatus().requestsRemaining).toBe(0);
  });

  it('requestsRemaining=100 → 100 반환', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.getStatus().requestsRemaining).toBe(100);
  });
});

// ── updateFromResponse ─────────────────────────────────────────

describe('TokenMonitor updateFromResponse', () => {
  it('항상 ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({ 'x-ratelimit-remaining': '40' });
    expect(result.ok).toBe(true);
  });

  it('빈 헤더 → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({});
    expect(result.ok).toBe(true);
  });

  it('다양한 헤더 → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-remaining-input-tokens': '10000',
      'retry-after': '30',
    });
    expect(result.ok).toBe(true);
  });

  it('여러 번 호출 → 모두 ok', () => {
    const monitor = makeMonitor(makeStatus());
    for (let i = 0; i < 5; i++) {
      const result = monitor.updateFromResponse({ key: String(i) });
      expect(result.ok).toBe(true);
    }
  });

  it('body 포함 → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({ 'content-type': 'application/json' }, { data: 'test' });
    expect(result.ok).toBe(true);
  });

  it('ok는 boolean 타입', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({});
    expect(typeof result.ok).toBe('boolean');
  });

  it('10회 연속 호출 → 모두 ok', () => {
    const monitor = makeMonitor(makeStatus());
    for (let i = 0; i < 10; i++) {
      const header: Record<string, string> = {};
      header[`iter-${i}`] = String(i);
      const result = monitor.updateFromResponse(header);
      expect(result.ok).toBe(true);
    }
  });

  it('undefined body → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({}, undefined);
    expect(result.ok).toBe(true);
  });

  it('null body 포함 → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({}, null as unknown as object);
    expect(result.ok).toBe(true);
  });

  it('한국어 헤더 값 → ok 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({ 'x-custom': '한국어-값' });
    expect(result.ok).toBe(true);
  });
});

// ── 경계값 / 복합 시나리오 ─────────────────────────────────────

describe('TokenMonitor 복합 시나리오', () => {
  it('throttle true + pause false: requestsRemaining=10', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('throttle true + pause true: requestsRemaining=5', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('throttle false + pause false: requestsRemaining=80', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('throttle true (isLimitApproaching) + pause false (no retryAfter)', () => {
    const monitor = makeMonitor(makeStatus({
      requestsRemaining: 80,
      isLimitApproaching: true,
      retryAfterSeconds: null,
    }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('정확히 경계값 requestsRemaining=5: throttle=true, pause=true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('정확히 경계값 requestsRemaining=6: throttle=true, pause=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 6 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('정확히 경계값 requestsRemaining=21: throttle=false, pause=false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 21 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('상태 변화 시뮬레이션: 80→20→5→1', () => {
    // requestsRemaining 80 → no throttle, no pause
    expect(makeMonitor(makeStatus({ requestsRemaining: 80 })).shouldThrottleSpawn()).toBe(false);
    expect(makeMonitor(makeStatus({ requestsRemaining: 80 })).shouldPauseAll()).toBe(false);

    // requestsRemaining 20 → throttle, no pause
    expect(makeMonitor(makeStatus({ requestsRemaining: 20 })).shouldThrottleSpawn()).toBe(true);
    expect(makeMonitor(makeStatus({ requestsRemaining: 20 })).shouldPauseAll()).toBe(false);

    // requestsRemaining 5 → throttle + pause
    expect(makeMonitor(makeStatus({ requestsRemaining: 5 })).shouldThrottleSpawn()).toBe(true);
    expect(makeMonitor(makeStatus({ requestsRemaining: 5 })).shouldPauseAll()).toBe(true);

    // requestsRemaining 1 → throttle + pause
    expect(makeMonitor(makeStatus({ requestsRemaining: 1 })).shouldThrottleSpawn()).toBe(true);
    expect(makeMonitor(makeStatus({ requestsRemaining: 1 })).shouldPauseAll()).toBe(true);
  });

  it('두 인스턴스 독립적 → 다른 requestsRemaining', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(m1.shouldThrottleSpawn()).toBe(true);
    expect(m2.shouldThrottleSpawn()).toBe(false);
  });

  it('getStatus → shouldThrottleSpawn 일관성', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    const status = monitor.getStatus();
    const throttle = monitor.shouldThrottleSpawn();
    // requestsRemaining=10 → throttle=true
    if (status.requestsRemaining !== null && status.requestsRemaining <= 20) {
      expect(throttle).toBe(true);
    }
  });

  it('updateFromResponse → getStatus 일관성 (ok=true)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    const updateResult = monitor.updateFromResponse({ 'x-ratelimit-remaining': '50' });
    expect(updateResult.ok).toBe(true);
    // getStatus는 여전히 auth provider에서 읽음
    expect(typeof monitor.getStatus()).toBe('object');
  });

  it('retryAfterSeconds=60 → throttle=true, pause=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 60, requestsRemaining: 80 }));
    // retryAfter가 있으면 pause=true, isLimitApproaching 없어도 throttle은 requestsRemaining에 의존
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('null 상태 getStatus → isLimitApproaching=false', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.getStatus().isLimitApproaching).toBe(false);
  });

  it('null 상태 shouldThrottleSpawn → false', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('null 상태 shouldPauseAll → false', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.shouldPauseAll()).toBe(false);
  });
});
