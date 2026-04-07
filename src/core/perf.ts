/**
 * 성능 프로파일링 유틸리티 / Performance profiling utility
 *
 * @description
 * KR: 비동기/동기 함수의 실행 시간을 측정하고 로깅한다.
 *     핵심 hot path에 계측을 추가하여 cold-start 병목을 식별한다.
 * EN: Measures and logs execution time of async/sync functions.
 *     Adds instrumentation to critical hot paths for cold-start bottleneck identification.
 */

import type { Logger } from 'core/logger.js';

// ── 타입 정의 / Types ──────────────────────────────────────────

/** 성능 측정 결과 / Performance measurement result */
export interface PerfEntry {
  readonly label: string;
  readonly durationMs: number;
  readonly startedAt: string;
}

/** 성능 측정 옵션 / Performance measurement options */
export interface PerfOptions {
  /** 경고 임계값(ms) — 초과 시 warn 레벨로 로깅 / Warn threshold in ms */
  readonly warnThresholdMs?: number;
  /** 추가 컨텍스트 / Additional context metadata */
  readonly context?: Record<string, unknown>;
}

// ── PerfTracker ────────────────────────────────────────────────

/**
 * 성능 프로파일러 / Performance profiler
 *
 * @description
 * KR: measureAsync / measureSync로 함수 실행 시간을 측정하고,
 *     결과를 내부 버퍼에 저장하며 로거로 출력한다.
 * EN: Measures function execution time with measureAsync / measureSync,
 *     stores results in an internal buffer and logs them.
 *
 * @example
 * const perf = new PerfTracker(logger);
 * const result = await perf.measureAsync('db.init', () => db.initialize());
 * perf.summary(); // 전체 요약 출력
 */
export class PerfTracker {
  private readonly entries: PerfEntry[] = [];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'perf' });
  }

  /**
   * 비동기 함수 실행 시간 측정 / Measure async function execution time
   *
   * @param label - 측정 라벨 / Measurement label
   * @param fn - 측정할 비동기 함수 / Async function to measure
   * @param options - 측정 옵션 / Measurement options
   * @returns fn의 반환값 / Return value of fn
   *
   * @example
   * const data = await perf.measureAsync('embedQuery', () => provider.embedQuery(text));
   */
  async measureAsync<T>(label: string, fn: () => Promise<T>, options?: PerfOptions): Promise<T> {
    const startedAt = new Date().toISOString();
    const start = performance.now();

    try {
      const result = await fn();
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.record(label, durationMs, startedAt, options);
      return result;
    } catch (error: unknown) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.record(label, durationMs, startedAt, options);
      throw error;
    }
  }

  /**
   * 동기 함수 실행 시간 측정 / Measure sync function execution time
   *
   * @param label - 측정 라벨 / Measurement label
   * @param fn - 측정할 동기 함수 / Sync function to measure
   * @param options - 측정 옵션 / Measurement options
   * @returns fn의 반환값 / Return value of fn
   */
  measureSync<T>(label: string, fn: () => T, options?: PerfOptions): T {
    const startedAt = new Date().toISOString();
    const start = performance.now();

    try {
      const result = fn();
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.record(label, durationMs, startedAt, options);
      return result;
    } catch (error: unknown) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.record(label, durationMs, startedAt, options);
      throw error;
    }
  }

  /**
   * 수집된 모든 측정 결과 반환 / Return all collected entries
   *
   * @returns 측정 결과 배열 (불변 복사) / Array of perf entries (immutable copy)
   */
  getEntries(): readonly PerfEntry[] {
    return [...this.entries];
  }

  /**
   * 수집된 측정 결과의 요약을 로깅 / Log a summary of all collected entries
   */
  summary(): void {
    if (this.entries.length === 0) {
      this.logger.info('perf 측정 결과 없음');
      return;
    }

    const totalMs = this.entries.reduce((sum, e) => sum + e.durationMs, 0);
    const sorted = [...this.entries].sort((a, b) => b.durationMs - a.durationMs);

    this.logger.info('perf 요약', {
      totalMs: Math.round(totalMs * 100) / 100,
      count: this.entries.length,
      top3: sorted.slice(0, 3).map((e) => ({
        label: e.label,
        ms: e.durationMs,
      })),
    });
  }

  /**
   * 버퍼 초기화 / Clear the entry buffer
   */
  clear(): void {
    this.entries.length = 0;
  }

  private record(
    label: string,
    durationMs: number,
    startedAt: string,
    options?: PerfOptions,
  ): void {
    const entry: PerfEntry = { label, durationMs, startedAt };
    this.entries.push(entry);

    const logContext: Record<string, unknown> = {
      label,
      durationMs,
      ...options?.context,
    };

    // WHY: warnThresholdMs 초과 시 warn 레벨로 로깅하여 느린 경로를 즉시 식별
    if (options?.warnThresholdMs !== undefined && durationMs > options.warnThresholdMs) {
      this.logger.warn('perf 경고: 임계값 초과', {
        ...logContext,
        thresholdMs: options.warnThresholdMs,
      });
    } else {
      this.logger.debug('perf 측정', logContext);
    }
  }
}
