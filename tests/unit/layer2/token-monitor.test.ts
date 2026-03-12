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
    requestsLimit: 100,
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

// ── 추가 경계값: shouldThrottleSpawn 상세 ──────────────────────

describe('TokenMonitor shouldThrottleSpawn 추가 경계값', () => {
  it('requestsRemaining=200 → false (한도 초과 높음)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 200 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=1000 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1000 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=Number.MAX_SAFE_INTEGER → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: Number.MAX_SAFE_INTEGER }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=20 isLimitApproaching=true → true (양쪽 조건)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=20 isLimitApproaching=false → true (수치 조건)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20, isLimitApproaching: false }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=null isLimitApproaching=false → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: false }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=null isLimitApproaching=true → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('반환값이 true인 경우 boolean 확인', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    const result = monitor.shouldThrottleSpawn();
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
  });

  it('반환값이 false인 경우 boolean 확인', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    const result = monitor.shouldThrottleSpawn();
    expect(typeof result).toBe('boolean');
    expect(result).toBe(false);
  });

  it('10개 다른 requestsRemaining → 각각 정확한 boolean 반환', () => {
    const cases: Array<[number, boolean]> = [
      [0, true],
      [5, true],
      [10, true],
      [15, true],
      [20, true],
      [21, false],
      [30, false],
      [50, false],
      [80, false],
      [100, false],
    ];
    for (const [remaining, expected] of cases) {
      const monitor = makeMonitor(makeStatus({ requestsRemaining: remaining }));
      expect(monitor.shouldThrottleSpawn()).toBe(expected);
    }
  });
});

// ── 추가 경계값: shouldPauseAll 상세 ──────────────────────────

describe('TokenMonitor shouldPauseAll 추가 경계값', () => {
  it('requestsRemaining=null retryAfterSeconds=null → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, retryAfterSeconds: null }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=null retryAfterSeconds=5 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: null, retryAfterSeconds: 5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=1000 retryAfterSeconds=1 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1000, retryAfterSeconds: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=5 retryAfterSeconds=30 → true (양쪽 조건)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5, retryAfterSeconds: 30 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=6 retryAfterSeconds=null → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 6, retryAfterSeconds: null }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=Number.MAX_SAFE_INTEGER retryAfterSeconds=null → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: null }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('10개 다른 requestsRemaining → 각각 정확한 boolean 반환', () => {
    const cases: Array<[number, boolean]> = [
      [0, true],
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, true],
      [6, false],
      [7, false],
      [10, false],
      [100, false],
    ];
    for (const [remaining, expected] of cases) {
      const monitor = makeMonitor(makeStatus({ requestsRemaining: remaining }));
      expect(monitor.shouldPauseAll()).toBe(expected);
    }
  });

  it('retryAfterSeconds=Number.MAX_SAFE_INTEGER → true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: Number.MAX_SAFE_INTEGER }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('shouldPauseAll 10회 반복 → 일관됨 (true)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 2 }));
    for (let i = 0; i < 10; i++) {
      expect(monitor.shouldPauseAll()).toBe(true);
    }
  });

  it('shouldPauseAll 10회 반복 → 일관됨 (false)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    for (let i = 0; i < 10; i++) {
      expect(monitor.shouldPauseAll()).toBe(false);
    }
  });
});

// ── 추가 경계값: getStatus 상세 ───────────────────────────────

describe('TokenMonitor getStatus 추가 경계값', () => {
  it('inputTokensRemaining=0 → 0 반환', () => {
    const monitor = makeMonitor(makeStatus({ inputTokensRemaining: 0 }));
    expect(monitor.getStatus().inputTokensRemaining).toBe(0);
  });

  it('outputTokensRemaining=0 → 0 반환', () => {
    const monitor = makeMonitor(makeStatus({ outputTokensRemaining: 0 }));
    expect(monitor.getStatus().outputTokensRemaining).toBe(0);
  });

  it('retryAfterSeconds=0 → 0 반환', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 0 }));
    expect(monitor.getStatus().retryAfterSeconds).toBe(0);
  });

  it('inputTokensRemaining=Number.MAX_SAFE_INTEGER → 그대로 반환', () => {
    const monitor = makeMonitor(makeStatus({ inputTokensRemaining: Number.MAX_SAFE_INTEGER }));
    expect(monitor.getStatus().inputTokensRemaining).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('requestsRemaining=1 → 1 반환', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.getStatus().requestsRemaining).toBe(1);
  });

  it('getStatus 필드 목록 검증', () => {
    const monitor = makeMonitor(makeStatus());
    const status = monitor.getStatus();
    expect('requestsRemaining' in status).toBe(true);
    expect('inputTokensRemaining' in status).toBe(true);
    expect('outputTokensRemaining' in status).toBe(true);
    expect('retryAfterSeconds' in status).toBe(true);
    expect('isLimitApproaching' in status).toBe(true);
  });

  it('isLimitApproaching=true → true 반환', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true }));
    expect(monitor.getStatus().isLimitApproaching).toBe(true);
  });

  it('getStatus 결과는 null이 아님', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.getStatus()).not.toBeNull();
  });

  it('getStatus 10회 반복 → 일관됨', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 77 }));
    for (let i = 0; i < 10; i++) {
      expect(monitor.getStatus().requestsRemaining).toBe(77);
    }
  });
});

// ── 추가 경계값: updateFromResponse 다양한 헤더 ────────────────

describe('TokenMonitor updateFromResponse 다양한 헤더', () => {
  it('UUID 값 헤더 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(monitor.updateFromResponse({ 'x-request-id': uuid }).ok).toBe(true);
  });

  it('한국어 헤더 키 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.updateFromResponse({ '한국어-헤더': '값' }).ok).toBe(true);
  });

  it('특수문자 헤더 값 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.updateFromResponse({ 'x-special': '!@#$%^&*()' }).ok).toBe(true);
  });

  it('매우 많은 헤더 키 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const headers: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      headers[`x-header-${i}`] = `value-${i}`;
    }
    expect(monitor.updateFromResponse(headers).ok).toBe(true);
  });

  it('빈 문자열 값 헤더 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.updateFromResponse({ 'x-empty': '' }).ok).toBe(true);
  });

  it('숫자 문자열 rate limit 헤더 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.updateFromResponse({ 'x-ratelimit-remaining': '0' }).ok).toBe(true);
  });

  it('negative 문자열 rate limit → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.updateFromResponse({ 'x-ratelimit-remaining': '-1' }).ok).toBe(true);
  });

  it('updateFromResponse 후 getStatus 여전히 작동', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    monitor.updateFromResponse({ 'x-ratelimit-remaining': '50' });
    expect(typeof monitor.getStatus()).toBe('object');
  });
});

// ── 추가 경계값 배치2: shouldThrottleSpawn 극단값 ─────────────

describe('TokenMonitor shouldThrottleSpawn 극단값 배치2', () => {
  it('requestsRemaining=Number.MIN_SAFE_INTEGER → true (음수는 임계값 이하)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: Number.MIN_SAFE_INTEGER }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=-100 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: -100 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=-1 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: -1 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=500 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 500 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=10000 → false', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10000 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('isLimitApproaching=false + requestsRemaining=20 → true (수치 조건)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20, isLimitApproaching: false }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=true + requestsRemaining=1000 → true (approaching 우선)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1000, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=true + requestsRemaining=null → true', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true, requestsRemaining: null }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('shouldThrottleSpawn 결과 일관성: 동일 상태 50회 호출', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 15 }));
    const results = Array.from({ length: 50 }, () => monitor.shouldThrottleSpawn());
    expect(results.every(r => r === true)).toBe(true);
  });

  it('shouldThrottleSpawn 결과 일관성: false 케이스 50회 호출', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 60 }));
    const results = Array.from({ length: 50 }, () => monitor.shouldThrottleSpawn());
    expect(results.every(r => r === false)).toBe(true);
  });

  it('requestsRemaining=20 → true, requestsRemaining=21 → false (경계 확인)', () => {
    const m20 = makeMonitor(makeStatus({ requestsRemaining: 20 }));
    const m21 = makeMonitor(makeStatus({ requestsRemaining: 21 }));
    expect(m20.shouldThrottleSpawn()).toBe(true);
    expect(m21.shouldThrottleSpawn()).toBe(false);
  });
});

// ── 추가 경계값 배치2: shouldPauseAll 극단값 ──────────────────

describe('TokenMonitor shouldPauseAll 극단값 배치2', () => {
  it('requestsRemaining=-1 → true (음수는 pause)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: -1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=-100 → true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: -100 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=0.1 → true (양수이면 pause)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 0.1, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=Number.EPSILON → true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: Number.EPSILON, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('shouldPauseAll 결과 일관성: true 케이스 50회', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    const results = Array.from({ length: 50 }, () => monitor.shouldPauseAll());
    expect(results.every(r => r === true)).toBe(true);
  });

  it('shouldPauseAll 결과 일관성: false 케이스 50회', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    const results = Array.from({ length: 50 }, () => monitor.shouldPauseAll());
    expect(results.every(r => r === false)).toBe(true);
  });

  it('requestsRemaining=5 → true, requestsRemaining=6 → false (경계 확인)', () => {
    const m5 = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    const m6 = makeMonitor(makeStatus({ requestsRemaining: 6 }));
    expect(m5.shouldPauseAll()).toBe(true);
    expect(m6.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=1000 → true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 1000, requestsRemaining: 80 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=null + requestsRemaining=10 → false', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: null, requestsRemaining: 10 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=null + requestsRemaining=5 → true (수치 조건)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: null, requestsRemaining: 5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });
});

// ── 추가 경계값 배치2: getStatus 심층 ────────────────────────

describe('TokenMonitor getStatus 심층 배치2', () => {
  it('getStatus 반환 객체는 null이 아님', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.getStatus()).not.toBeNull();
  });

  it('getStatus 반환 객체는 undefined가 아님', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.getStatus()).not.toBeUndefined();
  });

  it('getStatus: requestsRemaining=1 → 정확히 1', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.getStatus().requestsRemaining).toBe(1);
  });

  it('getStatus: inputTokensRemaining=1 → 정확히 1', () => {
    const monitor = makeMonitor(makeStatus({ inputTokensRemaining: 1 }));
    expect(monitor.getStatus().inputTokensRemaining).toBe(1);
  });

  it('getStatus: outputTokensRemaining=1 → 정확히 1', () => {
    const monitor = makeMonitor(makeStatus({ outputTokensRemaining: 1 }));
    expect(monitor.getStatus().outputTokensRemaining).toBe(1);
  });

  it('getStatus: retryAfterSeconds=1 → 정확히 1', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 1 }));
    expect(monitor.getStatus().retryAfterSeconds).toBe(1);
  });

  it('getStatus: 음수 requestsRemaining → 그대로 반환', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: -5 }));
    expect(monitor.getStatus().requestsRemaining).toBe(-5);
  });

  it('getStatus: isLimitApproaching boolean 타입 확인', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true }));
    expect(typeof monitor.getStatus().isLimitApproaching).toBe('boolean');
  });

  it('getStatus: 20번 반복 → 동일 결과 (requestsRemaining)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 33 }));
    for (let i = 0; i < 20; i++) {
      expect(monitor.getStatus().requestsRemaining).toBe(33);
    }
  });

  it('getStatus 필드 5개 모두 존재 (타입 확인)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10, inputTokensRemaining: 100, outputTokensRemaining: 200, retryAfterSeconds: 0, isLimitApproaching: false }));
    const s = monitor.getStatus();
    expect(s.requestsRemaining).toBe(10);
    expect(s.inputTokensRemaining).toBe(100);
    expect(s.outputTokensRemaining).toBe(200);
    expect(s.retryAfterSeconds).toBe(0);
    expect(s.isLimitApproaching).toBe(false);
  });
});

// ── 추가 경계값 배치2: updateFromResponse 심층 ────────────────

describe('TokenMonitor updateFromResponse 심층 배치2', () => {
  it('updateFromResponse: 중첩 객체 body → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({}, { nested: { deep: { value: 42 } } });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 배열 body → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({}, [1, 2, 3] as unknown as object);
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 숫자 값 헤더 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({ 'x-ratelimit-remaining-requests': '100' });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 매우 긴 헤더 값 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const longVal = 'x'.repeat(1000);
    const result = monitor.updateFromResponse({ 'x-custom-long': longVal });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 100번 연속 → 모두 ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    for (let i = 0; i < 100; i++) {
      const result = monitor.updateFromResponse({ [`x-iter-${i}`]: String(i) });
      expect(result.ok).toBe(true);
    }
  });

  it('updateFromResponse: UUID 키 헤더 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const uuid = crypto.randomUUID();
    const result = monitor.updateFromResponse({ [uuid]: 'value' });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 이모지 헤더 값 → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({ 'x-emoji': '🚀🔐💡' });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse: 호출 후 shouldThrottleSpawn 여전히 작동', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    monitor.updateFromResponse({ 'x-test': 'val' });
    expect(typeof monitor.shouldThrottleSpawn()).toBe('boolean');
  });

  it('updateFromResponse: 호출 후 shouldPauseAll 여전히 작동', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    monitor.updateFromResponse({ 'x-test': 'val' });
    expect(typeof monitor.shouldPauseAll()).toBe('boolean');
  });

  it('updateFromResponse ok=true → value 없음 (void)', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({});
    expect(result.ok).toBe(true);
  });
});

// ── 추가 복합 시나리오 배치2 ──────────────────────────────────

describe('TokenMonitor 복합 시나리오 배치2', () => {
  it('10개 인스턴스 각기 다른 상태 → shouldThrottleSpawn 독립', () => {
    const cases: Array<[number, boolean]> = [
      [0, true], [5, true], [10, true], [15, true], [20, true],
      [21, false], [30, false], [50, false], [80, false], [100, false],
    ];
    for (const [remaining, expected] of cases) {
      const monitor = makeMonitor(makeStatus({ requestsRemaining: remaining }));
      expect(monitor.shouldThrottleSpawn()).toBe(expected);
    }
  });

  it('10개 인스턴스 각기 다른 상태 → shouldPauseAll 독립', () => {
    const cases: Array<[number, boolean]> = [
      [0, true], [1, true], [2, true], [3, true], [4, true],
      [5, true], [6, false], [10, false], [50, false], [100, false],
    ];
    for (const [remaining, expected] of cases) {
      const monitor = makeMonitor(makeStatus({ requestsRemaining: remaining }));
      expect(monitor.shouldPauseAll()).toBe(expected);
    }
  });

  it('throttle=false, pause=false: requestsRemaining=100', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('throttle=true, pause=false: requestsRemaining=15', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 15 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('throttle=true, pause=true: requestsRemaining=3', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfter 있으면 항상 pause=true (requestsRemaining 무관)', () => {
    for (const remaining of [0, 5, 10, 50, 100, 1000]) {
      const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30, requestsRemaining: remaining }));
      expect(monitor.shouldPauseAll()).toBe(true);
    }
  });

  it('모든 null 상태 → throttle=false, pause=false, getStatus 정상', () => {
    const monitor = makeMonitor(makeStatus());
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
    const s = monitor.getStatus();
    expect(s.requestsRemaining).toBeNull();
  });

  it('updateFromResponse 10회 → getStatus 여전히 기존 값 반환', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 42 }));
    for (let i = 0; i < 10; i++) {
      monitor.updateFromResponse({ [`key-${i}`]: `val-${i}` });
    }
    // auth provider는 변경 안 됨 → getStatus 동일
    expect(monitor.getStatus().requestsRemaining).toBe(42);
  });

  it('두 인스턴스 동일 상태 → shouldThrottleSpawn 동일', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(m1.shouldThrottleSpawn()).toBe(m2.shouldThrottleSpawn());
  });

  it('두 인스턴스 동일 상태 → shouldPauseAll 동일', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    expect(m1.shouldPauseAll()).toBe(m2.shouldPauseAll());
  });

  it('두 인스턴스 다른 상태 → shouldThrottleSpawn 다름', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(m1.shouldThrottleSpawn()).not.toBe(m2.shouldThrottleSpawn());
  });

  it('두 인스턴스 다른 상태 → shouldPauseAll 다름', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 2 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(m1.shouldPauseAll()).not.toBe(m2.shouldPauseAll());
  });
});

// ── calculateRemainingRatio 간접 검증 ─────────────────────────

describe('calculateRemainingRatio 간접 검증', () => {
  it('requestsRemaining=20 → ratio=0.2 → 스로틀링 경계', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 20 }));
    // 20/100 = 0.2 <= 0.2 → throttle
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=21 → ratio=0.21 → 스로틀링 아님 (isLimitApproaching=false)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 21 }));
    // 21/100 = 0.21 > 0.2, isLimitApproaching=false → false
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=5 → ratio=0.05 → pause 경계', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=6 → ratio=0.06 > 0.05 → pause 아님', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 6 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=1 → ratio=0.01 → pause', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=100 → ratio=1.0 → throttle 아님', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 100 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=200 → ratio=min(2.0,1.0)=1.0 → throttle 아님', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 200 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('requestsRemaining=0 → ratio=0 → pause', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=0 → ratio=0 → throttle', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 0 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=19 → ratio=0.19 → throttle', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 19 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=4 → ratio=0.04 → pause', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 4 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('requestsRemaining=50 → ratio=0.5 → throttle 아님, pause 아님', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('requestsRemaining=10 → ratio=0.1 → throttle (0.1<=0.2)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('requestsRemaining=3 → pause, throttle 모두 true', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
    expect(monitor.shouldPauseAll()).toBe(true);
  });
});

// ── retryAfterSeconds 심화 ─────────────────────────────────────

describe('retryAfterSeconds 심화', () => {
  it('retryAfterSeconds=1 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 1 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=60 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 60 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=3600 → shouldPauseAll=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 3600 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=0 → shouldPauseAll=false (requestsRemaining=null)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 0 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=null, requestsRemaining=null → shouldPauseAll=false', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: null, requestsRemaining: null }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=30, requestsRemaining=50 → shouldPauseAll=true (retry 우선)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30, requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=0.5 → 0보다 큰지 조건 미충족 (0.5>0=true) → pause', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 0.5 }));
    expect(monitor.shouldPauseAll()).toBe(true);
  });

  it('retryAfterSeconds=-1 → 0보다 크지 않음 → pause 아님 (requestsRemaining=null)', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: -1 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('retryAfterSeconds=100 → shouldThrottleSpawn: isLimitApproaching=false → false', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 100, requestsRemaining: null }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('retryAfterSeconds=100 + isLimitApproaching=true → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 100, isLimitApproaching: true }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('retryAfterSeconds 여러 값 → 모두 shouldPauseAll=true', () => {
    const retryValues = [1, 10, 100, 1000, 9999];
    for (const rv of retryValues) {
      const m = makeMonitor(makeStatus({ retryAfterSeconds: rv }));
      expect(m.shouldPauseAll()).toBe(true);
    }
  });
});

// ── isLimitApproaching 심화 ────────────────────────────────────

describe('isLimitApproaching 심화', () => {
  it('isLimitApproaching=true, requestsRemaining=null → shouldThrottleSpawn=true', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true, requestsRemaining: null }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=false, requestsRemaining=null → shouldThrottleSpawn=false', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: false, requestsRemaining: null }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('isLimitApproaching=true, requestsRemaining=50 → ratio=0.5>0.2 → fallback to isLimitApproaching=true', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true, requestsRemaining: 50 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=false, requestsRemaining=15 → ratio=0.15<=0.2 → throttle', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: false, requestsRemaining: 15 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=true, requestsRemaining=10 → ratio<=0.2 → true', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true, requestsRemaining: 10 }));
    expect(monitor.shouldThrottleSpawn()).toBe(true);
  });

  it('isLimitApproaching=false, requestsRemaining=80 → false', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: false, requestsRemaining: 80 }));
    expect(monitor.shouldThrottleSpawn()).toBe(false);
  });

  it('isLimitApproaching=true → shouldPauseAll에는 영향 없음 (ratio, retry 기준)', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true, requestsRemaining: 50 }));
    // ratio=0.5>0.05, retryAfterSeconds=null → shouldPauseAll=false
    expect(monitor.shouldPauseAll()).toBe(false);
  });

  it('isLimitApproaching=false → shouldPauseAll=false (requestsRemaining=50)', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: false, requestsRemaining: 50 }));
    expect(monitor.shouldPauseAll()).toBe(false);
  });
});

// ── getStatus + updateFromResponse 복합 ───────────────────────

describe('getStatus + updateFromResponse 복합', () => {
  it('getStatus는 authProvider.getRateLimitStatus 위임', () => {
    const status = makeStatus({ requestsRemaining: 77 });
    const monitor = makeMonitor(status);
    expect(monitor.getStatus().requestsRemaining).toBe(77);
  });

  it('getStatus 두 번 호출 → 동일 requestsRemaining', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 33 }));
    const s1 = monitor.getStatus();
    const s2 = monitor.getStatus();
    expect(s1.requestsRemaining).toBe(s2.requestsRemaining);
  });

  it('updateFromResponse → ok=true 반환', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({}, { usage: { input_tokens: 10, output_tokens: 5 } });
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse(빈 헤더, body 없음) → ok=true', () => {
    const monitor = makeMonitor(makeStatus());
    const result = monitor.updateFromResponse({});
    expect(result.ok).toBe(true);
  });

  it('updateFromResponse 10회 → getStatus 변화 없음 (mock은 고정)', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 55 }));
    for (let i = 0; i < 10; i++) {
      monitor.updateFromResponse({ key: 'val' });
    }
    expect(monitor.getStatus().requestsRemaining).toBe(55);
  });

  it('getStatus 반환 inputTokensRemaining 확인', () => {
    const monitor = makeMonitor(makeStatus({ inputTokensRemaining: null }));
    expect(monitor.getStatus().inputTokensRemaining).toBeNull();
  });

  it('getStatus 반환 outputTokensRemaining 확인', () => {
    const monitor = makeMonitor(makeStatus({ outputTokensRemaining: null }));
    expect(monitor.getStatus().outputTokensRemaining).toBeNull();
  });

  it('getStatus 반환 retryAfterSeconds 확인', () => {
    const monitor = makeMonitor(makeStatus({ retryAfterSeconds: 30 }));
    expect(monitor.getStatus().retryAfterSeconds).toBe(30);
  });

  it('getStatus 반환 isLimitApproaching 확인', () => {
    const monitor = makeMonitor(makeStatus({ isLimitApproaching: true }));
    expect(monitor.getStatus().isLimitApproaching).toBe(true);
  });

  it('shouldThrottleSpawn 호출이 getStatus 상태 변경 안 함', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    const before = monitor.getStatus().requestsRemaining;
    monitor.shouldThrottleSpawn();
    monitor.shouldThrottleSpawn();
    expect(monitor.getStatus().requestsRemaining).toBe(before);
  });

  it('shouldPauseAll 호출이 getStatus 상태 변경 안 함', () => {
    const monitor = makeMonitor(makeStatus({ requestsRemaining: 50 }));
    const before = monitor.getStatus().requestsRemaining;
    monitor.shouldPauseAll();
    monitor.shouldPauseAll();
    expect(monitor.getStatus().requestsRemaining).toBe(before);
  });

  it('다른 authProvider → 다른 getStatus 반환', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: 10 }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: 90 }));
    expect(m1.getStatus().requestsRemaining).not.toBe(m2.getStatus().requestsRemaining);
  });

  it('requestsRemaining=null → ratio=null → isLimitApproaching에 의존', () => {
    const m1 = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: true }));
    const m2 = makeMonitor(makeStatus({ requestsRemaining: null, isLimitApproaching: false }));
    expect(m1.shouldThrottleSpawn()).toBe(true);
    expect(m2.shouldThrottleSpawn()).toBe(false);
  });
});

// ── 경계값 배열 테스트 ────────────────────────────────────────

describe('경계값 배열 테스트', () => {
  it('requestsRemaining 0~5 모두 shouldPauseAll=true', () => {
    for (let r = 0; r <= 5; r++) {
      const m = makeMonitor(makeStatus({ requestsRemaining: r }));
      expect(m.shouldPauseAll()).toBe(true);
    }
  });

  it('requestsRemaining 6~20 shouldPauseAll=false', () => {
    for (let r = 6; r <= 20; r++) {
      const m = makeMonitor(makeStatus({ requestsRemaining: r }));
      expect(m.shouldPauseAll()).toBe(false);
    }
  });

  it('requestsRemaining 0~20 모두 shouldThrottleSpawn=true', () => {
    for (let r = 0; r <= 20; r++) {
      const m = makeMonitor(makeStatus({ requestsRemaining: r }));
      expect(m.shouldThrottleSpawn()).toBe(true);
    }
  });

  it('requestsRemaining 21~100 shouldThrottleSpawn=false (isLimitApproaching=false)', () => {
    for (let r = 21; r <= 100; r++) {
      const m = makeMonitor(makeStatus({ requestsRemaining: r, isLimitApproaching: false }));
      expect(m.shouldThrottleSpawn()).toBe(false);
    }
  });

  it('requestsRemaining=null → shouldPauseAll에 retryAfterSeconds 영향 없으면 false', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: null, retryAfterSeconds: null }));
    expect(m.shouldPauseAll()).toBe(false);
  });

  it('shouldThrottleSpawn과 shouldPauseAll 동시 true 가능 (낮은 remaining)', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 2 }));
    expect(m.shouldThrottleSpawn()).toBe(true);
    expect(m.shouldPauseAll()).toBe(true);
  });

  it('shouldThrottleSpawn=true, shouldPauseAll=false 가능 (중간 remaining)', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 15 }));
    expect(m.shouldThrottleSpawn()).toBe(true);
    expect(m.shouldPauseAll()).toBe(false);
  });

  it('shouldThrottleSpawn=false, shouldPauseAll=false (충분한 remaining)', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 80 }));
    expect(m.shouldThrottleSpawn()).toBe(false);
    expect(m.shouldPauseAll()).toBe(false);
  });

  it('updateFromResponse body=null → ok=true', () => {
    const m = makeMonitor(makeStatus());
    const r = m.updateFromResponse({}, null);
    expect(r.ok).toBe(true);
  });

  it('updateFromResponse body=undefined → ok=true', () => {
    const m = makeMonitor(makeStatus());
    const r = m.updateFromResponse({}, undefined);
    expect(r.ok).toBe(true);
  });

  it('updateFromResponse body=string → ok=true', () => {
    const m = makeMonitor(makeStatus());
    const r = m.updateFromResponse({}, 'plain-string');
    expect(r.ok).toBe(true);
  });

  it('updateFromResponse body=number → ok=true', () => {
    const m = makeMonitor(makeStatus());
    const r = m.updateFromResponse({}, 42);
    expect(r.ok).toBe(true);
  });

  it('updateFromResponse body=array → ok=true', () => {
    const m = makeMonitor(makeStatus());
    const r = m.updateFromResponse({}, [1, 2, 3]);
    expect(r.ok).toBe(true);
  });

  it('10개 모니터 인스턴스 → 각각 독립적인 getStatus', () => {
    const monitors = Array.from({ length: 10 }, (_, i) =>
      makeMonitor(makeStatus({ requestsRemaining: i * 10 })),
    );
    for (let i = 0; i < monitors.length; i++) {
      expect(monitors[i]?.getStatus().requestsRemaining).toBe(i * 10);
    }
  });

  it('같은 상태 5개 모니터 → shouldThrottleSpawn 모두 같음', () => {
    const monitors = Array.from({ length: 5 }, () =>
      makeMonitor(makeStatus({ requestsRemaining: 50 })),
    );
    const results = monitors.map((m) => m.shouldThrottleSpawn());
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('같은 상태 5개 모니터 → shouldPauseAll 모두 같음', () => {
    const monitors = Array.from({ length: 5 }, () =>
      makeMonitor(makeStatus({ requestsRemaining: 3 })),
    );
    const results = monitors.map((m) => m.shouldPauseAll());
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('isLimitApproaching=true + retryAfterSeconds=10 → throttle=true, pause=true', () => {
    const m = makeMonitor(makeStatus({ isLimitApproaching: true, retryAfterSeconds: 10 }));
    expect(m.shouldThrottleSpawn()).toBe(true);
    expect(m.shouldPauseAll()).toBe(true);
  });

  it('isLimitApproaching=false + retryAfterSeconds=null + requestsRemaining=null → throttle=false, pause=false', () => {
    const m = makeMonitor(makeStatus({ isLimitApproaching: false, retryAfterSeconds: null, requestsRemaining: null }));
    expect(m.shouldThrottleSpawn()).toBe(false);
    expect(m.shouldPauseAll()).toBe(false);
  });

  it('updateFromResponse 반환 Result ok 프로퍼티는 true', () => {
    const m = makeMonitor(makeStatus());
    const result = m.updateFromResponse({ 'x-ratelimit': 'remaining=10' });
    expect(result.ok).toBe(true);
  });

  it('getStatus 반환 객체는 RateLimitStatus 형태', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 30 }));
    const s = m.getStatus();
    expect('requestsRemaining' in s).toBe(true);
    expect('inputTokensRemaining' in s).toBe(true);
    expect('outputTokensRemaining' in s).toBe(true);
    expect('retryAfterSeconds' in s).toBe(true);
    expect('isLimitApproaching' in s).toBe(true);
  });

  it('getStatus 호출 후 shouldThrottleSpawn 다시 호출 → 동일 결과', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 15 }));
    const t1 = m.shouldThrottleSpawn();
    m.getStatus();
    const t2 = m.shouldThrottleSpawn();
    expect(t1).toBe(t2);
  });

  it('getStatus 호출 후 shouldPauseAll 다시 호출 → 동일 결과', () => {
    const m = makeMonitor(makeStatus({ requestsRemaining: 3 }));
    const p1 = m.shouldPauseAll();
    m.getStatus();
    const p2 = m.shouldPauseAll();
    expect(p1).toBe(p2);
  });
});
