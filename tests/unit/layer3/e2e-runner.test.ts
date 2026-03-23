/**
 * E2E Runner 단위 테스트 / E2E Runner unit tests
 *
 * @description
 * KR: runE2E, isHealthy, getFailureRate 순수 함수 경계값 테스트. 80%+ edge case 비율.
 * EN: Tests for runE2E, isHealthy, getFailureRate pure functions. 80%+ edge/error ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { getFailureRate, isHealthy, runE2E } from 'layer3/e2e-runner.js';
import type { E2ETestRun } from 'layer3/types.js';

const logger = new ConsoleLogger('error');

// ── runE2E ────────────────────────────────────────────────────

describe('runE2E', () => {
  // -- 정상 케이스 (20%) --

  it('유효한 명령어 목록 시 모든 테스트가 통과한다', () => {
    const result = runE2E('proj-1', ['echo hello', 'echo world'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passedTests).toBe(2);
    expect(result.value.failedTests).toBe(0);
    expect(result.value.failures).toHaveLength(0);
  });

  it('단일 명령어 시 passedTests가 1이다', () => {
    const result = runE2E('proj-1', ['echo ok'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passedTests).toBe(1);
  });

  // -- 에러/경계 케이스 (80%) --

  it('빈 projectId 시 err를 반환한다', () => {
    const result = runE2E('', ['echo hi'], logger);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 projectId 시 err를 반환한다', () => {
    const result = runE2E('   ', ['echo hi'], logger);
    expect(result.ok).toBe(false);
  });

  it('빈 명령어 배열 시 err를 반환한다', () => {
    const result = runE2E('proj-1', [], logger);
    expect(result.ok).toBe(false);
  });

  it('빈 문자열 명령어가 포함되면 Fail-Fast로 즉시 중단한다', () => {
    const result = runE2E('proj-1', ['echo ok', '', 'echo never'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WHY: 첫 번째는 통과, 두 번째에서 실패 후 즉시 중단
    expect(result.value.passedTests).toBe(1);
    expect(result.value.failedTests).toBe(1);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.failures[0]?.error).toBe('Empty test command');
  });

  it('공백만 있는 명령어도 Fail-Fast로 처리된다', () => {
    const result = runE2E('proj-1', ['   '], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failedTests).toBe(1);
    expect(result.value.passedTests).toBe(0);
  });

  it('첫 번째 명령어가 빈 문자열이면 즉시 실패한다', () => {
    const result = runE2E('proj-1', ['', 'echo ok'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.failedTests).toBe(1);
    expect(result.value.passedTests).toBe(0);
  });

  it('report의 projectId가 입력과 일치한다', () => {
    const result = runE2E('my-project', ['echo hi'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectId).toBe('my-project');
  });

  it('report의 id가 UUID 형식이다', () => {
    const result = runE2E('proj-1', ['echo hi'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('report의 executedAt가 Date 인스턴스다', () => {
    const result = runE2E('proj-1', ['echo hi'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executedAt).toBeInstanceOf(Date);
  });

  it('report의 totalTests가 입력 명령어 수와 일치한다', () => {
    const result = runE2E('proj-1', ['a', 'b', 'c'], logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalTests).toBe(3);
  });
});

// ── isHealthy ─────────────────────────────────────────────────

describe('isHealthy', () => {
  function makeRun(total: number, passed: number, failed: number): E2ETestRun {
    return {
      id: 'run-1',
      projectId: 'proj-1',
      totalTests: total,
      passedTests: passed,
      failedTests: failed,
      duration: 100,
      executedAt: new Date(),
      failures: [],
    };
  }

  // -- 정상 케이스 --

  it('통과율 100%이면 healthy다', () => {
    expect(isHealthy([makeRun(10, 10, 0)])).toBe(true);
  });

  it('통과율 정확히 80%이면 healthy다', () => {
    expect(isHealthy([makeRun(10, 8, 2)])).toBe(true);
  });

  // -- 경계 케이스 --

  it('빈 배열은 healthy가 아니다', () => {
    expect(isHealthy([])).toBe(false);
  });

  it('totalTests가 0이면 healthy가 아니다', () => {
    expect(isHealthy([makeRun(0, 0, 0)])).toBe(false);
  });

  it('통과율 79%이면 healthy가 아니다', () => {
    expect(isHealthy([makeRun(100, 79, 21)])).toBe(false);
  });

  it('모두 실패하면 healthy가 아니다', () => {
    expect(isHealthy([makeRun(5, 0, 5)])).toBe(false);
  });

  it('여러 run의 합산으로 판단한다', () => {
    // WHY: 10+10 = 20 total, 8+8 = 16 passed → 80%
    expect(isHealthy([makeRun(10, 8, 2), makeRun(10, 8, 2)])).toBe(true);
  });

  it('여러 run에서 합산 통과율이 80% 미만이면 unhealthy다', () => {
    expect(isHealthy([makeRun(10, 9, 1), makeRun(10, 6, 4)])).toBe(false);
  });
});

// ── getFailureRate ────────────────────────────────────────────

describe('getFailureRate', () => {
  function makeRun(total: number, passed: number, failed: number): E2ETestRun {
    return {
      id: 'run-1',
      projectId: 'proj-1',
      totalTests: total,
      passedTests: passed,
      failedTests: failed,
      duration: 100,
      executedAt: new Date(),
      failures: [],
    };
  }

  it('빈 배열은 실패율 0을 반환한다', () => {
    expect(getFailureRate([])).toBe(0);
  });

  it('totalTests가 0이면 실패율 0을 반환한다', () => {
    expect(getFailureRate([makeRun(0, 0, 0)])).toBe(0);
  });

  it('실패 없으면 0을 반환한다', () => {
    expect(getFailureRate([makeRun(10, 10, 0)])).toBe(0);
  });

  it('모두 실패하면 1을 반환한다', () => {
    expect(getFailureRate([makeRun(10, 0, 10)])).toBe(1);
  });

  it('50% 실패 시 0.5를 반환한다', () => {
    expect(getFailureRate([makeRun(10, 5, 5)])).toBe(0.5);
  });

  it('여러 run의 합산으로 실패율을 계산한다', () => {
    // WHY: 10+10 = 20 total, 2+3 = 5 failed → 0.25
    expect(getFailureRate([makeRun(10, 8, 2), makeRun(10, 7, 3)])).toBe(0.25);
  });
});
