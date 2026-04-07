import { beforeEach, describe, expect, it } from 'bun:test';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from 'core/circuit-breaker.js';
import type { Logger } from 'core/logger.js';

// ── 테스트 헬퍼 ────────────────────────────────────────────────

/** 무동작 로거 / No-op logger for tests */
function createNoopLogger(): Logger {
  const noop = () => {};
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

// ── DEFAULT_CIRCUIT_BREAKER_CONFIG ──────────────────────────────

describe('DEFAULT_CIRCUIT_BREAKER_CONFIG', () => {
  it('기본 설정값이 올바르다', () => {
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(5);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBe(30_000);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts).toBe(1);
  });
});

// ── CircuitBreakerOpenError ────────────────────────────────────

describe('CircuitBreakerOpenError', () => {
  it('circuitName과 메시지를 올바르게 저장한다', () => {
    const error = new CircuitBreakerOpenError('test-circuit');
    expect(error.circuitName).toBe('test-circuit');
    expect(error.message).toContain('test-circuit');
    expect(error.message).toContain('open');
    expect(error.name).toBe('CircuitBreakerOpenError');
  });

  it('Error를 상속한다', () => {
    const error = new CircuitBreakerOpenError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

// ── CircuitBreaker ─────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;
  let logger: Logger;

  beforeEach(() => {
    logger = createNoopLogger();
    cb = new CircuitBreaker('test', logger, {
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenMaxAttempts: 1,
    });
  });

  // ── 초기 상태 ────────────────────────────────────────────────

  it('초기 상태는 closed이다', () => {
    expect(cb.getState()).toBe('closed');
    const snap = cb.getSnapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failureCount).toBe(0);
    expect(snap.lastFailureAt).toBeNull();
    expect(snap.openedAt).toBeNull();
  });

  // ── closed 상태에서 성공 ──────────────────────────────────────

  it('closed 상태에서 성공하면 closed를 유지한다', async () => {
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(cb.getState()).toBe('closed');
    expect(cb.getSnapshot().failureCount).toBe(0);
  });

  // ── closed → open 전이 ────────────────────────────────────────

  it('failureThreshold만큼 실패하면 open으로 전이한다', async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error(`fail-${i}`); });
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe('open');
    expect(cb.getSnapshot().failureCount).toBe(3);
    expect(cb.getSnapshot().openedAt).not.toBeNull();
  });

  it('failureThreshold 미만 실패 시 closed를 유지한다', async () => {
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe('closed');
    expect(cb.getSnapshot().failureCount).toBe(2);
  });

  // ── 성공이 실패 카운트를 리셋 ──────────────────────────────────

  it('closed 상태에서 성공하면 실패 카운트를 리셋한다', async () => {
    // 2번 실패
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    expect(cb.getSnapshot().failureCount).toBe(2);

    // 1번 성공 → 리셋
    await cb.execute(async () => 'ok');
    expect(cb.getSnapshot().failureCount).toBe(0);

    // 2번 더 실패해도 open이 되지 않음
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    expect(cb.getState()).toBe('closed');
  });

  // ── open 상태에서 즉시 에러 ────────────────────────────────────

  it('open 상태에서 실행하면 CircuitBreakerOpenError를 던진다', async () => {
    // open으로 전이
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    expect(cb.getState()).toBe('open');

    // 즉시 에러
    try {
      await cb.execute(async () => 'should not run');
      expect(true).toBe(false); // should not reach
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      if (error instanceof CircuitBreakerOpenError) {
        expect(error.circuitName).toBe('test');
      }
    }
  });

  // ── open → half-open 전이 (resetTimeout 경과) ─────────────────

  it('resetTimeout 경과 후 half-open으로 전이한다', async () => {
    // open으로 전이
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    expect(cb.getState()).toBe('open');

    // resetTimeout 대기
    await new Promise((r) => setTimeout(r, 150));

    // half-open 전이 + 성공 → closed
    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('closed');
    expect(cb.getSnapshot().failureCount).toBe(0);
  });

  // ── half-open에서 실패 → 다시 open ────────────────────────────

  it('half-open에서 실패하면 다시 open으로 전이한다', async () => {
    // open으로 전이
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }

    // resetTimeout 대기
    await new Promise((r) => setTimeout(r, 150));

    // half-open에서 실패
    try {
      await cb.execute(async () => { throw new Error('still failing'); });
    } catch { /* expected */ }

    expect(cb.getState()).toBe('open');
  });

  // ── reset() ───────────────────────────────────────────────────

  it('reset()으로 closed 상태로 되돌린다', async () => {
    // open으로 전이
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getSnapshot().failureCount).toBe(0);
    expect(cb.getSnapshot().openedAt).toBeNull();
    expect(cb.getSnapshot().lastFailureAt).toBeNull();
  });

  // ── 기본 설정 사용 ────────────────────────────────────────────

  it('설정 없이 생성하면 기본값을 사용한다', () => {
    const defaultCb = new CircuitBreaker('default-test', logger);
    expect(defaultCb.getState()).toBe('closed');
    // 기본 failureThreshold=5 — 4번 실패해도 closed
    (async () => {
      for (let i = 0; i < 4; i++) {
        try {
          await defaultCb.execute(async () => { throw new Error('fail'); });
        } catch { /* expected */ }
      }
      expect(defaultCb.getState()).toBe('closed');
    })();
  });

  // ── 부분 설정 오버라이드 ──────────────────────────────────────

  it('부분 설정을 오버라이드할 수 있다', () => {
    const customCb = new CircuitBreaker('custom', logger, { failureThreshold: 10 });
    // failureThreshold만 변경, 나머지는 기본값
    expect(customCb.getState()).toBe('closed');
  });

  // ── fn이 throw하는 에러가 그대로 전파됨 ────────────────────────

  it('execute fn의 에러가 그대로 전파된다', async () => {
    const customError = new TypeError('custom type error');
    try {
      await cb.execute(async () => { throw customError; });
    } catch (error: unknown) {
      expect(error).toBe(customError);
    }
  });

  // ── 동기적 반환값 래핑 ────────────────────────────────────────

  it('async fn의 반환값을 올바르게 반환한다', async () => {
    const obj = { foo: 'bar', num: 123 };
    const result = await cb.execute(async () => obj);
    expect(result).toBe(obj);
  });

  // ── 빈 문자열 이름 허용 ───────────────────────────────────────

  it('빈 문자열 이름으로 생성할 수 있다', () => {
    const emptyCb = new CircuitBreaker('', logger);
    expect(emptyCb.getState()).toBe('closed');
  });

  // ── open 상태에서 fn이 호출되지 않음 ──────────────────────────

  it('open 상태에서는 fn이 호출되지 않는다', async () => {
    let callCount = 0;

    // open으로 전이
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch { /* expected */ }
    }

    try {
      await cb.execute(async () => { callCount++; return 'x'; });
    } catch { /* expected */ }

    expect(callCount).toBe(0);
  });

  // ── getSnapshot 불변성 ────────────────────────────────────────

  it('getSnapshot은 스냅샷 시점의 상태를 반환한다', async () => {
    const snapBefore = cb.getSnapshot();

    try {
      await cb.execute(async () => { throw new Error('fail'); });
    } catch { /* expected */ }

    const snapAfter = cb.getSnapshot();
    expect(snapBefore.failureCount).toBe(0);
    expect(snapAfter.failureCount).toBe(1);
  });
});
