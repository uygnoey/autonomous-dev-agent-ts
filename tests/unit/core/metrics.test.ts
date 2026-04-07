import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { MetricsCollector, MetricsEvent } from 'core/metrics.js';
import {
  JsonStdoutMetricsCollector,
  NoOpMetricsCollector,
  createMetricsEvent,
} from 'core/metrics.js';

// ── createMetricsEvent ──────────────────────────────────────────

describe('createMetricsEvent', () => {
  it('타임스탬프와 기본 라벨로 이벤트를 생성한다', () => {
    const event = createMetricsEvent('test_metric', 42);

    expect(event.name).toBe('test_metric');
    expect(event.value).toBe(42);
    expect(event.labels).toEqual({});
    expect(event.timestamp).toBeTruthy();
    expect(() => new Date(event.timestamp)).not.toThrow();
  });

  it('커스텀 라벨을 포함한 이벤트를 생성한다', () => {
    const labels = { from: 'DESIGN', to: 'CODE', feature_id: 'feat-1' };
    const event = createMetricsEvent('phase_transition', 1250, labels);

    expect(event.name).toBe('phase_transition');
    expect(event.value).toBe(1250);
    expect(event.labels).toEqual(labels);
  });

  it('value가 0인 이벤트를 생성할 수 있다', () => {
    const event = createMetricsEvent('zero_metric', 0);
    expect(event.value).toBe(0);
  });

  it('음수 value도 허용한다', () => {
    const event = createMetricsEvent('negative_metric', -1);
    expect(event.value).toBe(-1);
  });

  it('소수점 value를 허용한다', () => {
    const event = createMetricsEvent('float_metric', 3.14159);
    expect(event.value).toBe(3.14159);
  });

  it('boolean 라벨을 포함할 수 있다', () => {
    const event = createMetricsEvent('bool_label', 1, { passed: true });
    expect(event.labels.passed).toBe(true);
  });

  it('number 라벨을 포함할 수 있다', () => {
    const event = createMetricsEvent('num_label', 1, { count: 42 });
    expect(event.labels.count).toBe(42);
  });

  it('빈 이름으로 이벤트를 생성할 수 있다', () => {
    const event = createMetricsEvent('', 1);
    expect(event.name).toBe('');
  });

  it('연속 호출 시 타임스탬프가 같거나 증가한다', () => {
    const e1 = createMetricsEvent('a', 1);
    const e2 = createMetricsEvent('b', 2);
    expect(new Date(e2.timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(e1.timestamp).getTime(),
    );
  });
});

// ── JsonStdoutMetricsCollector ──────────────────────────────────

describe('JsonStdoutMetricsCollector', () => {
  let collector: JsonStdoutMetricsCollector;
  let stderrOutput: string[];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    collector = new JsonStdoutMetricsCollector(logger);
    stderrOutput = [];
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrOutput.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  // WHY: afterEach 대신 각 테스트 후 복원하여 stderr가 원래 상태로 돌아가도록 함
  const restoreStderr = () => {
    process.stderr.write = originalWrite;
  };

  it('JSON 형식으로 stderr에 출력한다', () => {
    const event = createMetricsEvent('test', 1, { key: 'val' });
    collector.emit(event);
    restoreStderr();

    expect(stderrOutput).toHaveLength(1);
    const parsed = JSON.parse(stderrOutput[0]!.trim());
    expect(parsed.type).toBe('metric');
    expect(parsed.name).toBe('test');
    expect(parsed.value).toBe(1);
    expect(parsed.labels).toEqual({ key: 'val' });
  });

  it('여러 이벤트를 개별 JSON 줄로 출력한다', () => {
    collector.emit(createMetricsEvent('a', 1));
    collector.emit(createMetricsEvent('b', 2));
    restoreStderr();

    expect(stderrOutput).toHaveLength(2);
    expect(JSON.parse(stderrOutput[0]!.trim()).name).toBe('a');
    expect(JSON.parse(stderrOutput[1]!.trim()).name).toBe('b');
  });

  it('flush는 에러 없이 실행된다 (no-op)', () => {
    expect(() => collector.flush()).not.toThrow();
    restoreStderr();
  });

  it('빈 라벨의 이벤트를 출력한다', () => {
    collector.emit(createMetricsEvent('empty_labels', 0));
    restoreStderr();

    const parsed = JSON.parse(stderrOutput[0]!.trim());
    expect(parsed.labels).toEqual({});
  });

  it('출력이 줄바꿈으로 끝난다', () => {
    collector.emit(createMetricsEvent('newline_check', 1));
    restoreStderr();

    expect(stderrOutput[0]!.endsWith('\n')).toBe(true);
  });
});

// ── NoOpMetricsCollector ────────────────────────────────────────

describe('NoOpMetricsCollector', () => {
  let collector: NoOpMetricsCollector;

  beforeEach(() => {
    collector = new NoOpMetricsCollector();
  });

  it('emit은 에러 없이 실행된다', () => {
    expect(() => collector.emit(createMetricsEvent('test', 1))).not.toThrow();
  });

  it('flush는 에러 없이 실행된다', () => {
    expect(() => collector.flush()).not.toThrow();
  });

  it('stderr에 아무것도 출력하지 않는다', () => {
    const writes: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    collector.emit(createMetricsEvent('should_not_appear', 1));

    process.stderr.write = originalWrite;

    // WHY: NoOp은 메트릭스 JSON을 출력하지 않아야 함 (로거의 출력은 별도)
    const metricWrites = writes.filter((w) => w.includes('"should_not_appear"'));
    expect(metricWrites).toHaveLength(0);
  });
});

// ── MockMetricsCollector (테스트 지원) ──────────────────────────

describe('MetricsCollector 인터페이스 호환성', () => {
  it('커스텀 구현체가 인터페이스를 충족한다', () => {
    const events: MetricsEvent[] = [];
    const mock: MetricsCollector = {
      emit(event: MetricsEvent) {
        events.push(event);
      },
      flush() {
        // no-op
      },
    };

    mock.emit(createMetricsEvent('custom', 99, { env: 'test' }));
    mock.flush();

    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe('custom');
    expect(events[0]!.value).toBe(99);
  });
});
