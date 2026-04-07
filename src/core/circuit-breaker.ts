/**
 * Circuit Breaker 패턴 구현 / Circuit breaker pattern implementation
 *
 * @description
 * KR: closed → open → half-open 3상태 FSM으로 연쇄 장애를 방지한다.
 *     failureThreshold 초과 시 open, resetTimeout 후 half-open,
 *     half-open에서 성공 시 closed, 실패 시 다시 open.
 * EN: 3-state FSM (closed → open → half-open) to prevent cascading failures.
 *     Opens after failureThreshold, transitions to half-open after resetTimeout,
 *     closes on half-open success, re-opens on half-open failure.
 */

import type { Logger } from 'core/logger.js';

// ── 타입 정의 ────────────────────────────────────────────────

/** Circuit breaker 상태 / Circuit breaker states */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker 설정 / Circuit breaker configuration
 *
 * @param failureThreshold - open으로 전환하기 위한 연속 실패 횟수
 * @param resetTimeoutMs - open → half-open 전환까지 대기 시간 (ms)
 * @param halfOpenMaxAttempts - half-open 상태에서 허용하는 최대 시도 횟수
 */
export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenMaxAttempts: number;
}

/** 기본 circuit breaker 설정 / Default circuit breaker config */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
};

/**
 * Circuit breaker 상태 스냅샷 / Circuit breaker state snapshot
 *
 * @description 외부에서 현재 상태를 조회할 때 사용하는 읽기 전용 스냅샷
 */
export interface CircuitBreakerSnapshot {
  readonly state: CircuitBreakerState;
  readonly failureCount: number;
  readonly lastFailureAt: Date | null;
  readonly openedAt: Date | null;
}

// ── CircuitBreaker 클래스 ────────────────────────────────────

/**
 * Circuit Breaker 구현 / Circuit breaker implementation
 *
 * @description
 * KR: 외부 서비스 호출을 감싸서 연쇄 장애를 방지한다.
 *     상태 전이마다 로그를 남기며, execute()로 보호된 함수를 실행한다.
 * EN: Wraps external service calls to prevent cascading failures.
 *     Logs state transitions, executes protected functions via execute().
 *
 * @example
 * const cb = new CircuitBreaker('claude-api', logger, { failureThreshold: 3, resetTimeoutMs: 10000, halfOpenMaxAttempts: 1 });
 * const result = await cb.execute(() => callExternalService());
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private lastFailureAt: Date | null = null;
  private openedAt: Date | null = null;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: Logger;
  private readonly name: string;

  constructor(name: string, logger: Logger, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.logger = logger.child({ module: 'circuit-breaker', circuitName: name });
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * 보호된 함수를 실행한다 / Execute a protected function
   *
   * @param fn - 실행할 함수 / Function to execute
   * @returns 함수 실행 결과 / Function execution result
   * @throws CircuitBreakerOpenError — open 상태에서 호출 시
   *
   * @description
   * KR: closed/half-open 상태에서만 fn을 실행한다.
   *     open 상태에서는 resetTimeout 경과 여부를 확인하고,
   *     경과했으면 half-open으로 전환 후 실행, 아니면 즉시 에러.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldTransitionToHalfOpen()) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 현재 상태 스냅샷을 반환한다 / Get current state snapshot
   */
  getSnapshot(): CircuitBreakerSnapshot {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }

  /**
   * 현재 상태를 반환한다 / Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * circuit breaker를 강제로 리셋한다 / Force reset to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
    this.halfOpenAttempts = 0;
  }

  // ── 내부 메서드 / Private methods ────────────────────────────

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.transitionTo('closed');
      this.failureCount = 0;
      this.lastFailureAt = null;
      this.openedAt = null;
      this.halfOpenAttempts = 0;
    } else if (this.state === 'closed') {
      // WHY: 성공 시 연속 실패 카운트를 리셋하여 간헐적 실패가 누적되지 않도록 함
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = new Date();

    if (this.state === 'half-open') {
      // WHY: half-open에서 실패하면 즉시 open으로 전환
      this.transitionTo('open');
      this.openedAt = new Date();
      this.halfOpenAttempts = 0;
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
      this.openedAt = new Date();
    }
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (this.openedAt === null) return false;
    const elapsed = Date.now() - this.openedAt.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.logger.info('Circuit breaker 상태 전이', {
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
    });
  }
}

// ── CircuitBreakerOpenError ────────────────────────────────────

/**
 * Circuit breaker가 open 상태일 때 발생하는 에러
 * Thrown when circuit breaker is in open state
 */
export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;

  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is open — 요청이 차단되었습니다`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
  }
}
