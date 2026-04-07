/**
 * 오케스트레이션 메트릭스 / Orchestration Metrics
 *
 * @description
 * KR: 에이전트 오케스트레이션 이벤트에 대한 메트릭스 수집/보고 인터페이스.
 *     JSON stdout 출력으로 외부 수집기(Prometheus, Datadog 등) 연동을 대비한다.
 * EN: Metrics collection and reporting interface for agent orchestration events.
 *     Uses JSON stdout output, ready for external collector integration.
 */

import type { Logger } from 'core/logger.js';

// ── 메트릭스 이벤트 타입 / Metrics Event Types ──────────────────

/**
 * 메트릭스 이벤트 라벨 / Metrics event labels
 *
 * @description
 * KR: 메트릭스 이벤트에 부착되는 키-값 라벨. 필터링/그룹핑에 사용.
 * EN: Key-value labels attached to metrics events for filtering/grouping.
 */
export type MetricsLabels = Readonly<Record<string, string | number | boolean>>;

/**
 * 메트릭스 이벤트 / Metrics event
 *
 * @description
 * KR: 단일 메트릭스 데이터 포인트.
 * EN: A single metrics data point.
 *
 * @example
 * const event: MetricsEvent = {
 *   name: 'phase_transition',
 *   timestamp: new Date().toISOString(),
 *   labels: { from: 'DESIGN', to: 'CODE', feature_id: 'feat-1' },
 *   value: 1250,
 * };
 */
export interface MetricsEvent {
  /** 메트릭스 이름 / Metric name */
  readonly name: string;
  /** ISO 8601 타임스탬프 / ISO 8601 timestamp */
  readonly timestamp: string;
  /** 라벨 (차원) / Labels (dimensions) */
  readonly labels: MetricsLabels;
  /** 수치 값 (카운트, 밀리초 등) / Numeric value (count, ms, etc.) */
  readonly value: number;
}

// ── 메트릭스 수집기 인터페이스 / Metrics Collector Interface ────

/**
 * 메트릭스 수집기 인터페이스 / Metrics collector interface
 *
 * @description
 * KR: 메트릭스 이벤트를 수집하고 출력하는 추상화.
 *     구현체를 교체하여 다양한 백엔드(stdout, Prometheus, etc.)에 연동 가능.
 * EN: Abstraction for collecting and emitting metrics events.
 *     Swap implementations for different backends (stdout, Prometheus, etc.).
 */
export interface MetricsCollector {
  /**
   * 메트릭스 이벤트를 발행한다 / Emit a metrics event
   *
   * @param event - 발행할 메트릭스 이벤트 / Metrics event to emit
   */
  emit(event: MetricsEvent): void;

  /**
   * 버퍼링된 메트릭스를 플러시한다 / Flush buffered metrics
   *
   * @description
   * KR: 버퍼링 구현에서 미전송 메트릭스를 즉시 출력한다.
   * EN: In buffered implementations, immediately outputs pending metrics.
   */
  flush(): void;
}

// ── JSON stdout 구현 / JSON Stdout Implementation ───────────────

/**
 * JSON stdout 메트릭스 수집기 / JSON stdout metrics collector
 *
 * @description
 * KR: 메트릭스 이벤트를 JSON 형식으로 stderr에 출력한다.
 *     외부 수집기가 로그 스트림에서 메트릭스를 파싱할 수 있도록 한다.
 * EN: Outputs metrics events as JSON to stderr.
 *     Allows external collectors to parse metrics from the log stream.
 *
 * @example
 * const collector = new JsonStdoutMetricsCollector(logger);
 * collector.emit({ name: 'phase_transition', timestamp: '...', labels: {}, value: 1 });
 */
export class JsonStdoutMetricsCollector implements MetricsCollector {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'metrics' });
  }

  /**
   * 메트릭스 이벤트를 JSON으로 stderr에 출력한다 / Emit metrics event as JSON to stderr
   *
   * @param event - 메트릭스 이벤트 / Metrics event
   */
  emit(event: MetricsEvent): void {
    const output = JSON.stringify({ type: 'metric', ...event });
    process.stderr.write(`${output}\n`);
  }

  /**
   * No-op: stdout 구현은 버퍼링하지 않음 / No-op for unbuffered stdout implementation
   */
  flush(): void {
    // WHY: JSON stdout은 emit마다 즉시 출력하므로 flush 불필요
  }
}

// ── NoOp 구현 / NoOp Implementation ─────────────────────────────

/**
 * 무동작 메트릭스 수집기 / No-op metrics collector
 *
 * @description
 * KR: 메트릭스 수집이 비활성화된 환경에서 사용하는 무동작 구현.
 * EN: No-op implementation for environments where metrics collection is disabled.
 */
export class NoOpMetricsCollector implements MetricsCollector {
  emit(_event: MetricsEvent): void {
    // WHY: 의도적 무동작 — 메트릭스 비활성화 시 사용
  }

  flush(): void {
    // WHY: 의도적 무동작
  }
}

// ── 헬퍼 함수 / Helper Functions ────────────────────────────────

/**
 * 메트릭스 이벤트를 생성한다 / Creates a metrics event
 *
 * @param name - 메트릭스 이름 / Metric name
 * @param value - 수치 값 / Numeric value
 * @param labels - 라벨 (선택) / Labels (optional)
 * @returns 메트릭스 이벤트 / Metrics event
 *
 * @example
 * const event = createMetricsEvent('agent_spawn', 1, { agent_name: 'coder', phase: 'CODE' });
 */
export function createMetricsEvent(
  name: string,
  value: number,
  labels: MetricsLabels = {},
): MetricsEvent {
  return {
    name,
    timestamp: new Date().toISOString(),
    labels,
    value,
  };
}
