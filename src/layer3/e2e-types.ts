/**
 * layer3 지속 E2E 검증 타입 정의 / Layer 3 continuous E2E verification type definitions
 *
 * @description
 * KR: 지속 E2E 실행 설정, 결과, 테스트 보고서 관련 타입.
 * EN: Types for continuous E2E execution config, results, and test reports.
 */

// ── 지속 E2E 검증 / Continuous E2E Verification ─────────────────

/**
 * 지속 E2E 실행 설정 / Continuous E2E execution config
 *
 * @description
 * KR: 3계층에서 문서 생성과 병행하여 실행하는 지속 E2E 설정.
 * EN: Config for continuous E2E execution running in parallel with document generation in Layer 3.
 */
export interface ContinuousE2EConfig {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** E2E 테스트 경로 / E2E test path */
  readonly testPath: string;
  /** 실행 간격 (ms) / Execution interval in milliseconds */
  readonly intervalMs: number;
  /** Fail-Fast 활성화 / Enable fail-fast */
  readonly failFast: boolean;
  /** 최대 동시 실행 수 / Max concurrent executions */
  readonly maxConcurrency: number;
}

/**
 * 지속 E2E 실행 결과 / Continuous E2E execution result
 */
export interface ContinuousE2EResult {
  /** 실행 ID / Execution ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 실행 시각 / Executed at */
  readonly executedAt: Date;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 실패한 테스트 (있는 경우) / Failed test (if any) */
  readonly failedTest?: string;
  /** 에러 메시지 (실패 시) / Error message (if failed) */
  readonly errorMessage?: string;
}

/**
 * 테스트 실행 보고서 / Test execution report
 *
 * @description
 * KR: E2E 테스트 실행의 상세 보고서.
 * EN: Detailed report of E2E test execution.
 */
export interface TestExecutionReport {
  /** 보고서 ID / Report ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 총 테스트 수 / Total test count */
  readonly totalTests: number;
  /** 통과한 테스트 수 / Passed test count */
  readonly passedTests: number;
  /** 실패한 테스트 수 / Failed test count */
  readonly failedTests: number;
  /** 실행 시간 (ms) / Execution duration in ms */
  readonly duration: number;
  /** 실행 시각 / Executed at */
  readonly executedAt: Date;
  /** 실패 목록 / Failure list */
  readonly failures: readonly TestFailure[];
}

/**
 * E2E 테스트 실행 결과 / E2E test run result
 *
 * @description
 * KR: 지속 E2E 테스트 한 번의 실행 결과 (TestExecutionReport와 동일).
 * EN: Result of a single continuous E2E test run (same as TestExecutionReport).
 */
export type E2ETestRun = TestExecutionReport;

/**
 * 테스트 실패 정보 / Test failure information
 */
export interface TestFailure {
  /** 테스트 이름 / Test name */
  readonly testName: string;
  /** 에러 메시지 / Error message */
  readonly error: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 스택 트레이스 / Stack trace */
  readonly stackTrace?: string;
}

/**
 * 지속 E2E 기본 설정 / Default continuous E2E config
 */
export const DEFAULT_CONTINUOUS_E2E_CONFIG: Omit<ContinuousE2EConfig, 'projectId' | 'testPath'> = {
  intervalMs: 300_000, // 5분
  failFast: true,
  maxConcurrency: 1,
} as const;
