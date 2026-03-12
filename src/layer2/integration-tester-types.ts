/**
 * 통합 테스터 타입 / Integration Tester Types
 *
 * @description
 * KR: IntegrationTester에서 사용하는 타입 정의.
 * EN: Type definitions used by IntegrationTester.
 */

import type { StepNumber } from 'layer2/integration-tester-steps.js';
import type { IntegrationStepResult } from 'layer2/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 테스트 타임아웃 (밀리초) / Test timeout in milliseconds */
export const TEST_TIMEOUT_MS = 600_000; // WHY: 10분 (대규모 테스트 실행)

// ── 타입 / Types ────────────────────────────────────────────────

/**
 * 계단식 테스트 실행 결과 / Staircase test execution result
 *
 * @description
 * KR: 전체 계단식 테스트 실행의 최종 결과.
 * EN: Final result of the staircase test execution.
 */
export interface StaircaseTestResult {
  /** 단계별 결과 / Step-by-step results */
  readonly stepResults: readonly IntegrationStepResult[];
  /** 전체 통과 여부 / Whether all steps passed */
  readonly allPassed: boolean;
  /** 실패한 단계 번호 (없으면 undefined) / Failed step number */
  readonly failedAtStep?: StepNumber;
}
