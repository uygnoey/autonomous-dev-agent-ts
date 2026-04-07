import { beforeEach, describe, expect, it } from 'bun:test';
import type { Logger } from 'core/logger.js';
import { PerfTracker } from 'core/perf.js';
import type { PerfEntry } from 'core/perf.js';

// ── 테스트 헬퍼 / Test helpers ──────────────────────────────────

function createMockLogger(): Logger & { logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> } {
  const logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];
  const logger = {
    logs,
    debug(message: string, context?: Record<string, unknown>) {
      logs.push({ level: 'debug', message, context });
    },
    info(message: string, context?: Record<string, unknown>) {
      logs.push({ level: 'info', message, context });
    },
    warn(message: string, context?: Record<string, unknown>) {
      logs.push({ level: 'warn', message, context });
    },
    error(message: string, context?: Record<string, unknown>) {
      logs.push({ level: 'error', message, context });
    },
    child(_context: Record<string, unknown>) {
      return logger;
    },
  };
  return logger;
}

// ── PerfTracker 테스트 ──────────────────────────────────────────

describe('PerfTracker', () => {
  let perf: PerfTracker;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    perf = new PerfTracker(logger);
  });

  describe('measureAsync', () => {
    it('비동기 함수 실행 결과를 그대로 반환한다', async () => {
      const result = await perf.measureAsync('test-op', async () => 42);
      expect(result).toBe(42);
    });

    it('실행 시간을 기록한다', async () => {
      await perf.measureAsync('slow-op', async () => {
        const start = performance.now();
        while (performance.now() - start < 5) {
          // spin for ~5ms
        }
        return 'done';
      });

      const entries = perf.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.label).toBe('slow-op');
      expect(entries[0]?.durationMs).toBeGreaterThan(0);
      expect(entries[0]?.startedAt).toBeTruthy();
    });

    it('에러 발생 시에도 시간을 기록하고 에러를 다시 throw한다', async () => {
      const error = new Error('test-fail');

      await expect(
        perf.measureAsync('fail-op', async () => {
          throw error;
        }),
      ).rejects.toThrow('test-fail');

      const entries = perf.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.label).toBe('fail-op');
      expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('warnThresholdMs 초과 시 warn 로그를 출력한다', async () => {
      await perf.measureAsync(
        'warned-op',
        async () => {
          const start = performance.now();
          while (performance.now() - start < 10) {
            // spin for ~10ms
          }
          return 'ok';
        },
        { warnThresholdMs: 1 },
      );

      const warnLogs = logger.logs.filter((l) => l.level === 'warn');
      expect(warnLogs.length).toBeGreaterThanOrEqual(1);
      expect(warnLogs[0]?.message).toContain('임계값 초과');
    });

    it('warnThresholdMs 이내면 debug 로그만 출력한다', async () => {
      await perf.measureAsync('fast-op', async () => 'quick', { warnThresholdMs: 10000 });

      const warnLogs = logger.logs.filter((l) => l.level === 'warn');
      expect(warnLogs).toHaveLength(0);

      const debugLogs = logger.logs.filter((l) => l.level === 'debug');
      expect(debugLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('context 옵션이 로그에 포함된다', async () => {
      await perf.measureAsync('ctx-op', async () => 'ok', {
        context: { module: 'test', batchSize: 5 },
      });

      const debugLogs = logger.logs.filter((l) => l.level === 'debug');
      expect(debugLogs[0]?.context).toMatchObject({
        module: 'test',
        batchSize: 5,
      });
    });
  });

  describe('measureSync', () => {
    it('동기 함수 실행 결과를 그대로 반환한다', () => {
      const result = perf.measureSync('sync-op', () => 'hello');
      expect(result).toBe('hello');
    });

    it('실행 시간을 기록한다', () => {
      perf.measureSync('sync-measured', () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) sum += i;
        return sum;
      });

      const entries = perf.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('에러 발생 시에도 시간을 기록한다', () => {
      expect(() =>
        perf.measureSync('sync-fail', () => {
          throw new Error('sync-error');
        }),
      ).toThrow('sync-error');

      const entries = perf.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.label).toBe('sync-fail');
    });
  });

  describe('getEntries', () => {
    it('빈 상태에서 빈 배열을 반환한다', () => {
      expect(perf.getEntries()).toHaveLength(0);
    });

    it('기록 순서대로 반환한다', async () => {
      await perf.measureAsync('first', async () => 1);
      await perf.measureAsync('second', async () => 2);
      perf.measureSync('third', () => 3);

      const entries = perf.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0]?.label).toBe('first');
      expect(entries[1]?.label).toBe('second');
      expect(entries[2]?.label).toBe('third');
    });

    it('반환된 배열 수정이 내부 상태에 영향을 주지 않는다', async () => {
      await perf.measureAsync('immutable-test', async () => 'ok');

      const entries1 = perf.getEntries();
      expect(entries1).toHaveLength(1);

      // WHY: 반환된 배열을 변경해도 내부 배열이 보호되는지 확인
      (entries1 as PerfEntry[]).length = 0;

      const entries2 = perf.getEntries();
      expect(entries2).toHaveLength(1);
    });
  });

  describe('summary', () => {
    it('엔트리가 없으면 정보 로그만 출력한다', () => {
      perf.summary();

      const infoLogs = logger.logs.filter((l) => l.level === 'info');
      expect(infoLogs.length).toBeGreaterThanOrEqual(1);
      expect(infoLogs[0]?.message).toContain('결과 없음');
    });

    it('엔트리가 있으면 요약을 출력한다', async () => {
      await perf.measureAsync('op-a', async () => 'a');
      await perf.measureAsync('op-b', async () => 'b');

      perf.summary();

      const infoLogs = logger.logs.filter(
        (l) => l.level === 'info' && l.message.includes('perf 요약'),
      );
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0]?.context).toHaveProperty('totalMs');
      expect(infoLogs[0]?.context).toHaveProperty('count', 2);
    });
  });

  describe('clear', () => {
    it('모든 엔트리를 제거한다', async () => {
      await perf.measureAsync('to-clear', async () => 'ok');
      expect(perf.getEntries()).toHaveLength(1);

      perf.clear();
      expect(perf.getEntries()).toHaveLength(0);
    });
  });

  describe('durationMs 정밀도', () => {
    it('소수점 2자리로 반올림된다', async () => {
      await perf.measureAsync('precision-test', async () => 'ok');

      const entry = perf.getEntries()[0];
      expect(entry).toBeDefined();
      // WHY: durationMs는 소수점 2자리로 반올림되어야 함 (Math.round * 100 / 100)
      const decimals = String(entry?.durationMs).split('.')[1];
      if (decimals !== undefined) {
        expect(decimals.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('startedAt', () => {
    it('ISO 8601 형식의 타임스탬프를 기록한다', async () => {
      await perf.measureAsync('timestamp-test', async () => 'ok');

      const entry = perf.getEntries()[0];
      expect(entry?.startedAt).toBeTruthy();
      // WHY: ISO 8601 형식 검증 — new Date()로 파싱 가능해야 함
      const parsed = new Date(entry?.startedAt ?? '');
      expect(parsed.getTime()).not.toBeNaN();
    });
  });
});
