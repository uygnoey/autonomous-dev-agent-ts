/**
 * 버그 에스컬레이터 타입 정의 / Bug Escalator type definitions
 *
 * @description
 * KR: BugEscalator에서 사용하는 인터페이스/타입 정의 모음.
 * EN: Interface and type definitions used by BugEscalator.
 */

import type { Phase, Result } from 'core/types.js';
import type { BugReport } from 'layer3/types.js';

/**
 * 지속 E2E 테스트 결과 (단일 실패) / Continuous E2E test result (single failure)
 *
 * @description
 * KR: ProductionTester가 감지한 단일 E2E 테스트 실패 정보.
 * EN: Single E2E test failure information detected by ProductionTester.
 */
export interface ContinuousE2EResult {
  readonly id: string;
  readonly projectId: string;
  readonly executedAt: Date;
  readonly passed: boolean;
  readonly failedTest: string;
  readonly errorMessage: string;
  readonly featureId: string;
}

/**
 * 버그 에스컬레이션 옵션 / Bug escalation options
 */
export interface EscalateBugOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 프로젝트 경로 / Project path (cwd for bun test) */
  readonly projectPath: string;
  /** 기능 ID (연관된 경우) / Feature ID (if related) */
  readonly featureId?: string;
  /** 실패한 E2E 테스트 결과 / Failed E2E test result */
  readonly failedTest: ContinuousE2EResult;
  /** 추가 컨텍스트 / Additional context */
  readonly context?: string;
}

/**
 * 2계층 재실행 트리거 옵션 / Layer 2 re-execution trigger options
 */
export interface TriggerLayer2Options {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 버그 리포트 / Bug report */
  readonly bugReport: BugReport;
  /** 시작 Phase (architect 고정) / Start phase (fixed to architect) */
  readonly startPhase: 'DESIGN';
}

/**
 * 계단식 통합 검증 결과 / Stepwise integration verification result
 */
export interface StepwiseVerificationResult {
  /** Step 번호 (1~4) / Step number (1~4) */
  readonly step: number;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 실패 수 / Fail count */
  readonly failCount: number;
  /** 실패 메시지 (실패 시) / Fail message (if failed) */
  readonly failMessage?: string;
}

/**
 * 버그 에스컬레이션 결과 / Bug escalation result
 */
export interface BugEscalationResult {
  /** 버그 리포트 ID / Bug report ID */
  readonly id: string;
  /** 2계층 재실행 트리거 여부 / Whether Layer2 was triggered */
  readonly triggered: boolean;
  /** 계단식 검증 결과 / Stepwise verification results */
  readonly stepwiseResults: readonly StepwiseVerificationResult[];
  /** 유저 승인 여부 / Whether user approved */
  readonly userApproved: boolean;
  /** 버그 상태 / Bug status */
  readonly status: 'reported' | 'analyzed' | 'fixing' | 'verified' | 'resolved';
}

/**
 * 버그 에스컬레이터 인터페이스 / Bug escalator interface
 */
export interface IBugEscalator {
  /**
   * 버그를 2계층에 에스컬레이션한다 (간단 버전) / Escalate bug to Layer 2 (simple version)
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @returns 대상 Phase 포함 에스컬레이션 결과 / Escalation result with target phase
   */
  escalate(bugReport: BugReport): Result<{ targetPhase: Phase; bugReport: BugReport }>;

  /**
   * 버그를 2계층에 에스컬레이션한다 (전체 워크플로우) / Escalate bug to Layer 2 (full workflow)
   *
   * @param options - 에스컬레이션 옵션 / Escalation options
   * @returns 에스컬레이션 결과 / Escalation result
   */
  escalateAsync(options: EscalateBugOptions): Promise<Result<BugEscalationResult>>;

  /**
   * qc 에이전트에 근본 원인 분석을 요청한다 / Request root cause analysis from qc agent
   *
   * @param failedTest - 실패한 테스트 / Failed test
   * @returns 버그 리포트 / Bug report
   */
  analyzeRootCause(failedTest: ContinuousE2EResult): Promise<Result<BugReport>>;

  /**
   * 2계층 전체 루프 재실행을 트리거한다 / Trigger Layer 2 full loop re-execution
   *
   * @param options - 트리거 옵션 / Trigger options
   * @returns 재실행 성공 여부 / Re-execution success status
   */
  triggerLayer2(options: TriggerLayer2Options): Promise<Result<void>>;

  /**
   * 계단식 통합 검증을 실행한다 / Execute stepwise integration verification
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param projectPath - 프로젝트 경로 / Project path (cwd for bun test)
   * @param featureId - 수정된 기능 ID / Modified feature ID
   * @returns 검증 결과 배열 / Verification result array
   */
  runStepwiseVerification(
    projectId: string,
    projectPath: string,
    featureId: string,
  ): Promise<Result<readonly StepwiseVerificationResult[]>>;

  /**
   * 유저에게 변경 사항 재확인을 요청한다 / Request user re-confirmation of changes
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @param changes - 변경 사항 요약 / Changes summary
   * @returns 유저 승인 여부 / User approval status
   */
  requestUserConfirmation(bugReport: BugReport, changes: string): Promise<Result<boolean>>;
}
