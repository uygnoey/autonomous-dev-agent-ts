/**
 * 메트릭스 브리지 / Metrics Bridge
 *
 * @description
 * KR: 기존 MetricsCollector를 래핑하여 메트릭스 이벤트를 WebSocket 클라이언트에 브로드캐스트한다.
 *     원본 수집기에도 그대로 전달하여 기존 동작을 보존한다.
 * EN: Wraps an existing MetricsCollector to broadcast metrics events to WebSocket clients.
 *     Delegates to the original collector so existing behavior is preserved.
 */

import type { Logger } from 'core/logger.js';
import type { MetricsCollector, MetricsEvent } from 'core/metrics.js';
import type { WsMessage } from './types.js';

/** 메트릭스 이벤트를 받는 리스너 / Listener for metrics events */
export type MetricsListener = (message: WsMessage<MetricsEvent>) => void;

/**
 * 메트릭스 브리지 수집기 / Bridge metrics collector
 *
 * @description
 * KR: MetricsCollector 인터페이스를 구현하며, emit된 이벤트를 등록된 리스너에게 전달한다.
 *     최근 메트릭스를 버퍼에 보관하여 신규 클라이언트에 히스토리를 제공한다.
 * EN: Implements MetricsCollector, forwarding emitted events to registered listeners.
 *     Keeps a ring buffer of recent metrics for new client history.
 */
export class MetricsBridge implements MetricsCollector {
  private readonly listeners: Set<MetricsListener> = new Set();
  private readonly buffer: MetricsEvent[] = [];
  private readonly logger: Logger;

  /**
   * @param delegate - 원본 MetricsCollector (기존 동작 보존) / Original collector for passthrough
   * @param logger - 로거 인스턴스 / Logger instance
   * @param maxBufferSize - 메트릭스 버퍼 최대 크기 / Max buffer size for recent metrics
   */
  constructor(
    private readonly delegate: MetricsCollector,
    logger: Logger,
    private readonly maxBufferSize: number = 200,
  ) {
    this.logger = logger.child({ module: 'dashboard-metrics-bridge' });
  }

  /**
   * 메트릭스 이벤트를 발행하고 리스너에게 브로드캐스트한다 / Emit and broadcast metrics event
   *
   * @param event - 메트릭스 이벤트 / Metrics event
   */
  emit(event: MetricsEvent): void {
    this.delegate.emit(event);

    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    const message: WsMessage<MetricsEvent> = {
      type: 'metric',
      timestamp: event.timestamp,
      data: event,
    };

    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        this.logger.warn('메트릭스 리스너 에러', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** 원본 수집기 flush 위임 / Delegate flush to original collector */
  flush(): void {
    this.delegate.flush();
  }

  /**
   * 리스너 등록 / Register a listener
   *
   * @param listener - 메트릭스 리스너 / Metrics listener
   * @returns 리스너 해제 함수 / Unsubscribe function
   */
  subscribe(listener: MetricsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 최근 메트릭스 버퍼 조회 / Get recent metrics buffer
   *
   * @returns 최근 메트릭스 이벤트 배열 / Array of recent metrics events
   */
  getRecentMetrics(): readonly MetricsEvent[] {
    return [...this.buffer];
  }
}
