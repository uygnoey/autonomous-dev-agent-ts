/**
 * ProductionTester 단위 테스트 / ProductionTester unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ProductionTester } from '../../../src/layer3/production-tester.js';
import type { E2ETestRun } from '../../../src/layer3/types.js';

describe('ProductionTester', () => {
  let tester: ProductionTester;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    tester = new ProductionTester(logger);
  });

  describe('runE2E / E2E 테스트 실행', () => {
    it('유효한 명령어로 테스트를 실행한다', () => {
      const result = tester.runE2E('proj-1', ['bun test', 'bun lint']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.totalTests).toBe(2);
        expect(result.value.passedTests).toBe(2);
        expect(result.value.failedTests).toBe(0);
        expect(result.value.failures).toHaveLength(0);
      }
    });

    it('빈 명령어를 만나면 Fail-Fast로 중단한다', () => {
      const result = tester.runE2E('proj-1', ['bun test', '', 'bun lint']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.failedTests).toBeGreaterThan(0);
        // WHY: Fail-Fast — 빈 명령어에서 중단되므로 passed는 첫 명령어만 포함
        expect(result.value.passedTests).toBe(1);
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', () => {
      const result = tester.runE2E('', ['bun test']);
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 프로젝트 ID는 에러를 반환한다', () => {
      const result = tester.runE2E('   ', ['bun test']);
      expect(result.ok).toBe(false);
    });

    it('빈 명령어 목록은 에러를 반환한다', () => {
      const result = tester.runE2E('proj-1', []);
      expect(result.ok).toBe(false);
    });

    it('고유한 실행 ID를 생성한다', () => {
      const r1 = tester.runE2E('proj-1', ['bun test']);
      const r2 = tester.runE2E('proj-1', ['bun test']);
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });

    it('duration을 측정한다', () => {
      const result = tester.runE2E('proj-1', ['bun test']);
      if (result.ok) {
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('단일 명령어 실행도 지원한다', () => {
      const result = tester.runE2E('proj-1', ['bun test']);
      if (result.ok) {
        expect(result.value.totalTests).toBe(1);
        expect(result.value.passedTests).toBe(1);
      }
    });
  });

  describe('isHealthy / 건강도 판정', () => {
    it('통과율 80% 이상이면 건강하다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 9,
          failedTests: 1,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('통과율 80% 미만이면 건강하지 않다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 7,
          failedTests: 3,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('정확히 80%이면 건강하다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(true);
    });

    it('빈 실행 목록이면 건강하지 않다', () => {
      expect(tester.isHealthy([])).toBe(false);
    });

    it('전체 테스트가 0이면 건강하지 않다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          duration: 0,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.isHealthy(runs)).toBe(false);
    });

    it('여러 실행의 합산으로 판정한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
        {
          id: 'e2e-2',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 3,
          failedTests: 2,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      // WHY: 합산 8/10 = 80% → 건강
      expect(tester.isHealthy(runs)).toBe(true);
    });
  });

  describe('getFailureRate / 실패율 계산', () => {
    it('실패율을 올바르게 계산한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 10,
          passedTests: 7,
          failedTests: 3,
          duration: 100,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBeCloseTo(0.3);
    });

    it('빈 실행 목록은 0을 반환한다', () => {
      expect(tester.getFailureRate([])).toBe(0);
    });

    it('전체 테스트가 0이면 0을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          duration: 0,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(0);
    });

    it('전부 통과하면 0을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(0);
    });

    it('전부 실패하면 1을 반환한다', () => {
      const runs: E2ETestRun[] = [
        {
          id: 'e2e-1',
          projectId: 'proj-1',
          totalTests: 5,
          passedTests: 0,
          failedTests: 5,
          duration: 50,
          failures: [],
          timestamp: new Date(),
        },
      ];
      expect(tester.getFailureRate(runs)).toBe(1);
    });
  });
});
