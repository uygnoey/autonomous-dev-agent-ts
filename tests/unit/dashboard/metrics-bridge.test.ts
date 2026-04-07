import { describe, it, expect, beforeEach } from 'bun:test';
import { MetricsBridge } from 'dashboard/metrics-bridge.js';
import type { MetricsCollector, MetricsEvent } from 'core/metrics.js';
import { createMetricsEvent, NoOpMetricsCollector } from 'core/metrics.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ─────────────────────────────────

class SpyMetricsCollector implements MetricsCollector {
  readonly emitted: MetricsEvent[] = [];
  flushCount = 0;

  emit(event: MetricsEvent): void {
    this.emitted.push(event);
  }

  flush(): void {
    this.flushCount++;
  }
}

const logger = new ConsoleLogger('error');

describe('MetricsBridge', () => {
  let delegate: SpyMetricsCollector;
  let bridge: MetricsBridge;

  beforeEach(() => {
    delegate = new SpyMetricsCollector();
    bridge = new MetricsBridge(delegate, logger, 5);
  });

  it('should delegate emit to original collector', () => {
    const event = createMetricsEvent('test_metric', 42);
    bridge.emit(event);

    expect(delegate.emitted).toHaveLength(1);
    expect(delegate.emitted[0]?.name).toBe('test_metric');
  });

  it('should delegate flush to original collector', () => {
    bridge.flush();
    expect(delegate.flushCount).toBe(1);
  });

  it('should notify listeners on emit', () => {
    const received: MetricsEvent[] = [];
    bridge.subscribe((msg) => received.push(msg.data));

    bridge.emit(createMetricsEvent('phase_transition', 1));

    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe('phase_transition');
  });

  it('should unsubscribe listener', () => {
    const received: MetricsEvent[] = [];
    const unsub = bridge.subscribe((msg) => received.push(msg.data));

    bridge.emit(createMetricsEvent('before', 1));
    unsub();
    bridge.emit(createMetricsEvent('after', 2));

    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe('before');
  });

  it('should buffer recent metrics up to maxBufferSize', () => {
    for (let i = 0; i < 8; i++) {
      bridge.emit(createMetricsEvent(`m_${i}`, i));
    }

    const buffer = bridge.getRecentMetrics();
    expect(buffer).toHaveLength(5);
    expect(buffer[0]?.name).toBe('m_3');
    expect(buffer[4]?.name).toBe('m_7');
  });

  it('should return empty buffer initially', () => {
    expect(bridge.getRecentMetrics()).toHaveLength(0);
  });

  it('should wrap messages with correct type and timestamp', () => {
    let messageType = '';
    bridge.subscribe((msg) => {
      messageType = msg.type;
    });

    bridge.emit(createMetricsEvent('test', 1));
    expect(messageType).toBe('metric');
  });

  it('should handle listener errors gracefully', () => {
    const good: MetricsEvent[] = [];
    bridge.subscribe(() => {
      throw new Error('listener crash');
    });
    bridge.subscribe((msg) => good.push(msg.data));

    bridge.emit(createMetricsEvent('safe', 1));

    expect(good).toHaveLength(1);
  });

  it('should return a copy of buffer, not the internal array', () => {
    bridge.emit(createMetricsEvent('test', 1));

    const buffer1 = bridge.getRecentMetrics();
    const buffer2 = bridge.getRecentMetrics();

    expect(buffer1).not.toBe(buffer2);
    expect(buffer1).toEqual(buffer2);
  });
});
