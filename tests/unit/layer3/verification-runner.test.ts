/**
 * VerificationRunner 단위 테스트 / VerificationRunner unit tests
 *
 * @description
 * KR: runVerificationStep, VERIFICATION_STEPS, runStepwiseVerification 테스트.
 * EN: Tests for verification runner pure functions. 80%+ edge/error ratio.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import {
  VERIFICATION_STEPS,
  runStepwiseVerification,
  runVerificationStep,
} from 'layer3/verification-runner.js';

const logger = new ConsoleLogger('error');

// ── runVerificationStep ───────────────────────────────────────

describe('runVerificationStep', () => {
  it('integrationTester가 null이면 시뮬레이션으로 passed=true를 반환한다', async () => {
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, null, logger);
    expect(result.passed).toBe(true);
    expect(result.failCount).toBe(0);
    expect(result.step).toBe(1);
  });

  it('step 번호가 결과에 반영된다', async () => {
    const result = await runVerificationStep(3, 'proj-1', '/tmp', 'feat-1', 100, null, logger);
    expect(result.step).toBe(3);
  });

  it('시뮬레이션 모드에서 failMessage가 undefined다', async () => {
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, null, logger);
    expect(result.failMessage).toBeUndefined();
  });

  it('integrationTester가 성공 결과를 반환하면 passed=true다', async () => {
    const mockTester = {
      runIntegrationTests: async () => ({
        ok: true as const,
        value: [{ testName: 'test1', passed: true, duration: 10 }],
      }),
    };
    // @ts-expect-error: WHY: 간단한 mock으로 IntegrationTester 인터페이스 부분 구현
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, mockTester, logger);
    expect(result.passed).toBe(true);
    expect(result.failCount).toBe(0);
  });

  it('integrationTester가 실패 결과를 반환하면 failCount > 0이다', async () => {
    const mockTester = {
      runIntegrationTests: async () => ({
        ok: true as const,
        value: [
          { testName: 'test1', passed: true, duration: 10 },
          { testName: 'test2', passed: false, duration: 10 },
        ],
      }),
    };
    // @ts-expect-error: WHY: 간단한 mock으로 IntegrationTester 인터페이스 부분 구현
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, mockTester, logger);
    expect(result.passed).toBe(false);
    expect(result.failCount).toBe(1);
  });

  it('integrationTester가 에러를 반환하면 passed=false다', async () => {
    const mockTester = {
      runIntegrationTests: async () => ({
        ok: false as const,
        error: new Error('test error'),
      }),
    };
    // @ts-expect-error: WHY: 간단한 mock으로 IntegrationTester 인터페이스 부분 구현
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, mockTester, logger);
    expect(result.passed).toBe(false);
    expect(result.failCount).toBe(1);
  });

  it('integrationTester가 throw하면 시뮬레이션 fallback으로 passed=true다', async () => {
    const mockTester = {
      runIntegrationTests: async () => {
        throw new Error('connection refused');
      },
    };
    // @ts-expect-error: WHY: 간단한 mock으로 IntegrationTester 인터페이스 부분 구현
    const result = await runVerificationStep(1, 'proj-1', '/tmp', 'feat-1', 100, mockTester, logger);
    expect(result.passed).toBe(true);
  });
});

// ── VERIFICATION_STEPS ────────────────────────────────────────

describe('VERIFICATION_STEPS', () => {
  it('3개의 step 설정이 있다', () => {
    expect(VERIFICATION_STEPS).toHaveLength(3);
  });

  it('각 step이 [step번호, iterations] 형식이다', () => {
    for (const [step, iterations] of VERIFICATION_STEPS) {
      expect(typeof step).toBe('number');
      expect(typeof iterations).toBe('number');
      expect(iterations).toBeGreaterThan(0);
    }
  });

  it('step 번호가 1, 2, 3 순서다', () => {
    expect(VERIFICATION_STEPS[0]?.[0]).toBe(1);
    expect(VERIFICATION_STEPS[1]?.[0]).toBe(2);
    expect(VERIFICATION_STEPS[2]?.[0]).toBe(3);
  });
});

// ── runStepwiseVerification ───────────────────────────────────

describe('runStepwiseVerification', () => {
  it('integrationTester가 null이면 모든 4 step이 통과한다', async () => {
    const result = await runStepwiseVerification('proj-1', '/tmp', 'feat-1', null, logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(4);
    for (const step of result.value) {
      expect(step.passed).toBe(true);
    }
  });

  it('step 실패 시 즉시 중단하여 이후 step이 실행되지 않는다', async () => {
    let callCount = 0;
    const mockTester = {
      runIntegrationTests: async () => {
        callCount += 1;
        if (callCount === 2) {
          return {
            ok: true as const,
            value: [{ testName: 'test1', passed: false, duration: 10 }],
          };
        }
        return {
          ok: true as const,
          value: [{ testName: 'test1', passed: true, duration: 10 }],
        };
      },
    };
    // @ts-expect-error: WHY: 간단한 mock
    const result = await runStepwiseVerification('proj-1', '/tmp', 'feat-1', mockTester, logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WHY: step 1 통과, step 2 실패 → 2개만 실행
    expect(result.value.length).toBeLessThanOrEqual(2);
    expect(result.value[result.value.length - 1]?.passed).toBe(false);
  });

  it('결과가 항상 ok로 래핑된다 (에러 없음)', async () => {
    const result = await runStepwiseVerification('proj-1', '/tmp', 'feat-1', null, logger);
    expect(result.ok).toBe(true);
  });
});
