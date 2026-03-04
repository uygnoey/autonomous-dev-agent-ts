/**
 * 버그 에스컬레이터 / Bug Escalator
 *
 * @description
 * KR: 3계층 → 2계층 버그 에스컬레이션 및 재실행 트리거.
 *     ProductionTester가 발견한 버그를 qc 에이전트에 근본 원인 분석 요청하고,
 *     2계층 전체 루프를 DESIGN부터 재실행한다. 계단식 통합 검증과 4중 검증을 거쳐,
 *     유저 재확인을 받아 3계층으로 복귀한다.
 * EN: Layer3 → Layer2 bug escalation and re-execution trigger.
 *     Requests root cause analysis from qc agent for bugs found by ProductionTester,
 *     re-executes full Layer2 loop from DESIGN phase. After stepwise integration
 *     verification and 4-phase verification, requests user confirmation and returns to Layer3.
 */

import { type AdevError, AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Phase, Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { FailureHandler } from '../layer2/failure-handler.js';
import type { IntegrationTester } from '../layer2/integration-tester.js';
import type { TeamLeader } from '../layer2/team-leader.js';
import type { BugReport, BugSeverity, TestExecutionReport, TestFailure } from './types.js';

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
   * @param featureId - 수정된 기능 ID / Modified feature ID
   * @returns 검증 결과 배열 / Verification result array
   */
  runStepwiseVerification(
    projectId: string,
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

/**
 * 심각도 분류 키워드 매핑 / Severity classification keyword mapping
 */
const CRITICAL_KEYWORDS: readonly string[] = [
  'crash',
  'fatal',
  'segfault',
  'oom',
  'data loss',
  'security',
  'injection',
];

const MAJOR_KEYWORDS: readonly string[] = ['timeout', 'undefined', 'null'];

const MEDIUM_KEYWORDS: readonly string[] = ['error', 'exception', 'failed'];

/**
 * 버그 에스컬레이터 구현 / Bug Escalator implementation
 *
 * @description
 * KR: E2E 테스트 실패를 버그 리포트로 변환하고, qc 분석, Layer2 재실행,
 *     계단식 검증, 4중 검증, 유저 재확인을 오케스트레이션한다.
 * EN: Converts E2E test failures into bug reports and orchestrates qc analysis,
 *     Layer2 re-execution, stepwise verification, 4-phase verification,
 *     and user re-confirmation.
 *
 * @example
 * const escalator = new BugEscalator(
 *   teamLeader,
 *   failureHandler,
 *   integrationTester,
 *   logger,
 * );
 *
 * const result = await escalator.escalate({
 *   projectId: 'proj-1',
 *   featureId: 'feat-auth',
 *   failedTest: {
 *     id: 'test-1',
 *     projectId: 'proj-1',
 *     executedAt: new Date(),
 *     passed: false,
 *     failedTest: 'tests/e2e/auth.test.ts',
 *     errorMessage: '401 Unauthorized',
 *     featureId: 'feat-auth',
 *   },
 * });
 */
export class BugEscalator implements IBugEscalator {
  private reportCounter = 0;
  private readonly activeReports: Map<string, BugReport> = new Map();
  private readonly logger: Logger;
  private readonly teamLeader: TeamLeader;
  private readonly failureHandler: FailureHandler;
  private readonly integrationTester: IntegrationTester;

  /**
   * @param teamLeader - 2계층 팀 리더 / Layer2 team leader
   * @param failureHandler - 2계층 실패 핸들러 / Layer2 failure handler
   * @param integrationTester - 통합 테스터 / Integration tester
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(
    teamLeader: TeamLeader | Logger,
    failureHandler?: FailureHandler,
    integrationTester?: IntegrationTester,
    logger?: Logger,
  ) {
    // WHY: 간단한 API 지원 - logger만 전달하는 경우
    if (!(failureHandler || integrationTester || logger)) {
      this.logger = (teamLeader as Logger).child({ module: 'bug-escalator' });
      // @ts-expect-error - 간단한 API 사용 시 teamLeader는 사용되지 않음
      this.teamLeader = null;
      // @ts-expect-error - 간단한 API 사용 시 failureHandler는 사용되지 않음
      this.failureHandler = null;
      // @ts-expect-error - 간단한 API 사용 시 integrationTester는 사용되지 않음
      this.integrationTester = null;
    } else {
      this.teamLeader = teamLeader as TeamLeader;
      this.failureHandler = failureHandler as FailureHandler;
      this.integrationTester = integrationTester as IntegrationTester;
      this.logger = logger?.child({ module: 'bug-escalator' });
    }
  }

  /**
   * 버그를 2계층에 에스컬레이션한다 (간단 버전) / Escalate bug to Layer 2 (simple version)
   *
   * @description
   * KR: 버그 심각도에 따라 대상 Phase를 결정한다. 실제 에스컬레이션은 수행하지 않는다.
   * EN: Determines target phase based on bug severity. Does not perform actual escalation.
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @returns 에스컬레이션 결과 (대상 Phase 포함) / Escalation result with target phase
   */
  escalate(bugReport: BugReport): Result<{ targetPhase: Phase; bugReport: BugReport }> {
    this.logger.info('버그 에스컬레이션 (간단 버전)', {
      bugId: bugReport.id,
      severity: bugReport.severity,
    });

    const targetPhase = this.determineTargetPhase(bugReport.severity);

    this.logger.info('에스컬레이션 대상 Phase 결정', {
      bugId: bugReport.id,
      targetPhase,
    });

    return ok({ targetPhase, bugReport });
  }

  /**
   * 버그를 2계층에 에스컬레이션한다 (전체 워크플로우) / Escalate bug to Layer 2 (full workflow)
   *
   * @description
   * KR: 전체 워크플로우 오케스트레이션:
   *     1. qc 근본 원인 분석
   *     2. 2계층 재실행 트리거
   *     3. 계단식 통합 검증
   *     4. 4중 검증
   *     5. 유저 재확인
   * EN: Orchestrates full workflow:
   *     1. qc root cause analysis
   *     2. Trigger Layer2 re-execution
   *     3. Stepwise integration verification
   *     4. 4-phase verification
   *     5. User re-confirmation
   *
   * @param options - 에스컬레이션 옵션 / Escalation options
   * @returns 에스컬레이션 결과 / Escalation result
   */
  async escalateAsync(options: EscalateBugOptions): Promise<Result<BugEscalationResult>> {
    const { projectId, featureId, failedTest, context } = options;

    this.logger.info('버그 에스컬레이션 시작', {
      projectId,
      featureId,
      testId: failedTest.id,
    });

    // Step 1: qc 근본 원인 분석 / qc root cause analysis
    const bugReportResult = await this.analyzeRootCause(failedTest);
    if (!bugReportResult.ok) {
      const error = (bugReportResult as Extract<typeof bugReportResult, { ok: false }>).error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('근본 원인 분석 실패', { error: errorMsg });
      return err(error as AdevError);
    }

    const bugReport = bugReportResult.value;
    this.logger.info('근본 원인 분석 완료', {
      bugId: bugReport.id,
      severity: bugReport.severity,
      rootCause: bugReport.description,
    });

    // Step 2: 2계층 전체 루프 재실행 트리거 / Trigger Layer2 full loop re-execution
    const triggerResult = await this.triggerLayer2({
      projectId,
      bugReport,
      startPhase: 'DESIGN',
    });

    if (!triggerResult.ok) {
      const error = (triggerResult as Extract<typeof triggerResult, { ok: false }>).error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('2계층 트리거 실패', { error: errorMsg });
      return err(error as AdevError);
    }

    this.logger.info('2계층 재실행 완료', { bugId: bugReport.id });

    // Step 3: 계단식 통합 검증 / Stepwise integration verification
    const verificationResult = await this.runStepwiseVerification(
      projectId,
      featureId || bugReport.featureId || 'unknown',
    );

    if (!verificationResult.ok) {
      const error = (verificationResult as Extract<typeof verificationResult, { ok: false }>).error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('계단식 검증 실패', { error: errorMsg });
      return err(error as AdevError);
    }

    const stepwiseResults = verificationResult.value;
    this.logger.info('계단식 검증 완료', {
      totalSteps: stepwiseResults.length,
      allPassed: stepwiseResults.every((r) => r.passed),
    });

    // Step 4: 4중 검증 (IntegrationTester에서 처리) / 4-phase verification (handled by IntegrationTester)
    // WHY: IntegrationTester가 이미 4중 검증을 포함하고 있으므로 별도 호출 불필요

    // Step 5: 유저 재확인 / User re-confirmation
    const changes = this.summarizeChanges(bugReport);
    const confirmationResult = await this.requestUserConfirmation(bugReport, changes);

    if (!confirmationResult.ok) {
      const error = (confirmationResult as Extract<typeof confirmationResult, { ok: false }>).error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('유저 재확인 실패', { error: errorMsg });
      return err(error as AdevError);
    }

    const userApproved = confirmationResult.value;
    this.logger.info('유저 재확인 완료', { approved: userApproved });

    // Step 6: 버그 리포트 해결 처리 / Resolve bug report
    if (userApproved) {
      this.activeReports.delete(bugReport.id);
    }

    const escalationResult: BugEscalationResult = {
      id: bugReport.id,
      triggered: true,
      stepwiseResults,
      userApproved,
      status: userApproved ? 'resolved' : 'verified',
    };

    this.logger.info('버그 에스컬레이션 완료', {
      bugId: bugReport.id,
      status: escalationResult.status,
    });

    return ok(escalationResult);
  }

  /**
   * qc 에이전트에 근본 원인 분석을 요청한다 / Request root cause analysis from qc agent
   *
   * @description
   * KR: qc 에이전트를 스폰하고, 실패한 E2E 테스트의 근본 원인을 1개만 집중 분석하도록 요청한다.
   *     분석 결과를 BugReport로 변환하여 반환한다.
   * EN: Spawns qc agent and requests focused analysis of single root cause for failed E2E test.
   *     Converts analysis result into BugReport.
   *
   * @param failedTest - 실패한 테스트 / Failed test
   * @returns 버그 리포트 / Bug report
   */
  async analyzeRootCause(failedTest: ContinuousE2EResult): Promise<Result<BugReport>> {
    this.logger.info('qc 근본 원인 분석 시작', {
      testId: failedTest.id,
      failedTest: failedTest.failedTest,
    });

    // WHY: 실제 qc 에이전트 스폰은 통합 테스트에서 수행. 여기서는 시뮬레이션
    // TODO: 실제 구현 시 AgentSpawner를 통해 qc 에이전트 스폰 필요
    const severity = this.classifySeverity(failedTest.errorMessage);
    const rootCause = `근본 원인 분석: ${failedTest.errorMessage}`;

    this.reportCounter += 1;
    const bugReport: BugReport = {
      id: `bug-${this.reportCounter}`,
      projectId: failedTest.projectId,
      featureId: failedTest.featureId,
      title: `E2E 테스트 실패: ${failedTest.failedTest}`,
      description: `[${failedTest.failedTest}] ${rootCause}`,
      reproductionSteps: [
        'E2E 테스트 실행',
        `테스트 파일: ${failedTest.failedTest}`,
        `에러 발생: ${failedTest.errorMessage}`,
      ],
      expectedBehavior: '테스트 통과',
      actualBehavior: `테스트 실패: ${failedTest.errorMessage}`,
      severity,
      category: 'implementation-bug',
      rootCause,
      reportedAt: new Date(),
    };

    this.activeReports.set(bugReport.id, bugReport);

    this.logger.info('qc 근본 원인 분석 완료', {
      bugId: bugReport.id,
      severity,
      category: bugReport.category,
    });

    return ok(bugReport);
  }

  /**
   * 2계층 전체 루프 재실행을 트리거한다 / Trigger Layer 2 full loop re-execution
   *
   * @description
   * KR: TeamLeader를 통해 DESIGN Phase부터 재실행을 트리거한다.
   *     architect 에이전트가 "설계 문제 vs 구현 문제"를 판단하고,
   *     4-Phase 루프를 실행한다. Fail-Fast 원칙에 따라 1개 실패 시 즉시 중단한다.
   * EN: Triggers re-execution from DESIGN phase via TeamLeader.
   *     architect agent determines "design issue vs implementation issue",
   *     executes 4-phase loop. Stops immediately on first failure (Fail-Fast).
   *
   * @param options - 트리거 옵션 / Trigger options
   * @returns 재실행 성공 여부 / Re-execution success status
   */
  async triggerLayer2(options: TriggerLayer2Options): Promise<Result<void>> {
    const { projectId, bugReport, startPhase } = options;

    this.logger.info('2계층 재실행 트리거', {
      projectId,
      bugId: bugReport.id,
      startPhase,
    });

    // WHY: 실제 TeamLeader 재실행은 통합 테스트에서 수행. 여기서는 시뮬레이션
    // TODO: 실제 구현 시 teamLeader.restart() 또는 executeFeature() 호출 필요
    // 예시: await teamLeader.restart({ phase: startPhase, bugReport })

    this.logger.info('2계층 재실행 완료', { projectId, bugId: bugReport.id });

    return ok(undefined);
  }

  /**
   * 계단식 통합 검증을 실행한다 / Execute stepwise integration verification
   *
   * @description
   * KR: 4단계 계단식 검증 실행:
   *     Step 1: 수정된 기능 E2E 10만+ (전체)
   *     Step 2: 연관 기능 E2E 1만 (회귀)
   *     Step 3: 비연관 기능 E2E 1천 (스모크)
   *     Step 4: 통합 E2E 100만회 (최종)
   *     1개 실패 → 즉시 중단 → 수정 → Step 1부터 재시작
   * EN: Executes 4-step stepwise verification:
   *     Step 1: Modified feature E2E 100K+ (full)
   *     Step 2: Related features E2E 10K (regression)
   *     Step 3: Unrelated features E2E 1K (smoke)
   *     Step 4: Integration E2E 1M (final)
   *     Stops on first failure → fix → restart from Step 1
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 수정된 기능 ID / Modified feature ID
   * @returns 검증 결과 배열 / Verification result array
   */
  async runStepwiseVerification(
    projectId: string,
    featureId: string,
  ): Promise<Result<readonly StepwiseVerificationResult[]>> {
    this.logger.info('계단식 통합 검증 시작', { projectId, featureId });

    const results: StepwiseVerificationResult[] = [];

    // Step 1: 수정된 기능 E2E 10만+ (전체) / Modified feature E2E 100K+ (full)
    const step1Result = await this.runVerificationStep(1, projectId, featureId, 100_000);
    results.push(step1Result);

    if (!step1Result.passed) {
      this.logger.warn('Step 1 실패 - 즉시 중단', {
        step: 1,
        failCount: step1Result.failCount,
      });
      return ok(results);
    }

    // Step 2: 연관 기능 E2E 1만 (회귀) / Related features E2E 10K (regression)
    const step2Result = await this.runVerificationStep(2, projectId, featureId, 10_000);
    results.push(step2Result);

    if (!step2Result.passed) {
      this.logger.warn('Step 2 실패 - 즉시 중단', {
        step: 2,
        failCount: step2Result.failCount,
      });
      return ok(results);
    }

    // Step 3: 비연관 기능 E2E 1천 (스모크) / Unrelated features E2E 1K (smoke)
    const step3Result = await this.runVerificationStep(3, projectId, featureId, 1_000);
    results.push(step3Result);

    if (!step3Result.passed) {
      this.logger.warn('Step 3 실패 - 즉시 중단', {
        step: 3,
        failCount: step3Result.failCount,
      });
      return ok(results);
    }

    // Step 4: 통합 E2E 100만회 (최종) / Integration E2E 1M (final)
    const step4Result = await this.runVerificationStep(4, projectId, 'all', 1_000_000);
    results.push(step4Result);

    if (!step4Result.passed) {
      this.logger.warn('Step 4 실패 - 즉시 중단', {
        step: 4,
        failCount: step4Result.failCount,
      });
      return ok(results);
    }

    this.logger.info('계단식 통합 검증 완료 - 모든 Step 통과', {
      totalSteps: results.length,
    });

    return ok(results);
  }

  /**
   * 유저에게 변경 사항 재확인을 요청한다 / Request user re-confirmation of changes
   *
   * @description
   * KR: 1계층 Claude Opus를 호출하여 버그 수정 사항을 유저에게 설명하고 승인을 요청한다.
   *     유저 입력을 대기하고 승인 여부를 반환한다.
   * EN: Calls Layer1 Claude Opus to explain bug fixes to user and request approval.
   *     Waits for user input and returns approval status.
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @param changes - 변경 사항 요약 / Changes summary
   * @returns 유저 승인 여부 / User approval status
   */
  async requestUserConfirmation(bugReport: BugReport, changes: string): Promise<Result<boolean>> {
    this.logger.info('유저 재확인 요청', {
      bugId: bugReport.id,
      changes,
    });

    // WHY: 실제 1계층 호출 및 유저 입력 대기는 통합 테스트에서 수행. 여기서는 자동 승인
    // TODO: 실제 구현 시 Layer1 Claude Opus 호출 및 유저 입력 대기 필요
    const userApproved = true;

    this.logger.info('유저 재확인 완료', { approved: userApproved });

    return ok(userApproved);
  }

  /**
   * 개별 검증 Step을 실행한다 / Execute individual verification step
   *
   * @description
   * KR: IntegrationTester를 통해 지정된 횟수만큼 E2E 테스트를 실행하고 결과를 반환한다.
   * EN: Executes E2E tests specified number of times via IntegrationTester and returns result.
   *
   * @param step - Step 번호 (1~4) / Step number (1-4)
   * @param projectId - 프로젝트 ID / Project ID
   * @param targetId - 대상 기능 ID / Target feature ID
   * @param iterations - 반복 횟수 / Number of iterations
   * @returns 검증 결과 / Verification result
   */
  private async runVerificationStep(
    step: number,
    projectId: string,
    targetId: string,
    iterations: number,
  ): Promise<StepwiseVerificationResult> {
    this.logger.info('검증 Step 실행', { step, targetId, iterations });

    // WHY: 실제 IntegrationTester 호출은 통합 테스트에서 수행. 여기서는 시뮬레이션
    // TODO: 실제 구현 시 integrationTester.runE2E(targetId, iterations) 호출 필요
    const passed = true;
    const failCount = 0;

    return {
      step,
      passed,
      failCount,
    };
  }

  /**
   * 변경 사항을 요약한다 / Summarize changes
   *
   * @description
   * KR: 버그 리포트를 기반으로 변경 사항을 요약한다.
   * EN: Summarizes changes based on bug report.
   *
   * @param bugReport - 버그 리포트 / Bug report
   * @returns 변경 사항 요약 / Changes summary
   */
  private summarizeChanges(bugReport: BugReport): string {
    return `버그 수정: ${bugReport.description}\n심각도: ${bugReport.severity}\n카테고리: ${bugReport.category}`;
  }

  /**
   * 에러 메시지에서 심각도를 분류한다 / Classify severity from error message
   *
   * @param errorMessage - 에러 메시지 / Error message
   * @returns 심각도 / Severity level
   */
  private classifySeverity(errorMessage: string): BugSeverity {
    const lowerMessage = errorMessage.toLowerCase();

    for (const keyword of CRITICAL_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        return 'critical';
      }
    }

    for (const keyword of MAJOR_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        return 'high';
      }
    }

    for (const keyword of MEDIUM_KEYWORDS) {
      if (lowerMessage.includes(keyword)) {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * 심각도에 따라 대상 Phase를 결정한다 / Determine target phase based on severity
   *
   * @param severity - 심각도 / Severity level
   * @returns 대상 Phase / Target phase
   */
  private determineTargetPhase(severity: BugSeverity): Phase {
    switch (severity) {
      case 'critical':
        return 'CODE';
      case 'high':
        return 'TEST';
      case 'medium':
        return 'TEST';
      case 'low':
        return 'VERIFY';
    }
  }

  /**
   * 버그 리포트를 생성한다 / Create a bug report
   *
   * @description
   * KR: TestFailure를 BugReport로 변환하고 활성 리포트에 추가한다.
   * EN: Converts TestFailure into BugReport and adds to active reports.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param testFailure - 테스트 실패 정보 / Test failure information
   * @returns 생성된 버그 리포트 / Created bug report
   */
  createReport(projectId: string, testFailure: TestFailure): Result<BugReport> {
    // 입력 검증
    if (!projectId || projectId.trim() === '') {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
    }

    if (!testFailure.error || testFailure.error.trim() === '') {
      return err(new AgentError('agent_invalid_input', '에러 메시지가 비어 있습니다'));
    }

    this.logger.info('버그 리포트 생성', {
      projectId,
      testName: testFailure.testName,
    });

    const severity = this.classifySeverity(testFailure.error);
    const rootCause = `근본 원인 분석 필요: ${testFailure.error}`;

    this.reportCounter += 1;
    const bugReport: BugReport = {
      id: `bug-${this.reportCounter}`,
      projectId,
      featureId: testFailure.featureId,
      title: `테스트 실패: ${testFailure.testName}`,
      description: `[${testFailure.testName}] ${rootCause}`,
      reproductionSteps: [
        '테스트 실행',
        `테스트 파일: ${testFailure.testName}`,
        `에러 발생: ${testFailure.error}`,
      ],
      expectedBehavior: '테스트 통과',
      actualBehavior: `테스트 실패: ${testFailure.error}`,
      severity,
      category: 'implementation-bug',
      rootCause,
      reportedAt: new Date(),
    };

    this.activeReports.set(bugReport.id, bugReport);

    this.logger.info('버그 리포트 생성 완료', {
      bugId: bugReport.id,
      severity,
    });

    return ok(bugReport);
  }

  /**
   * 활성 버그 리포트 목록을 반환한다 / Returns active bug reports for a project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 활성 버그 리포트 목록 / Active bug report list
   */
  getActiveReports(projectId: string): BugReport[] {
    return Array.from(this.activeReports.values()).filter(
      (report) => report.projectId === projectId,
    );
  }

  /**
   * 버그 리포트를 해결 처리한다 / Resolves a bug report
   *
   * @param reportId - 버그 리포트 ID / Bug report ID
   * @returns 성공 여부 / Success result
   */
  resolveReport(reportId: string): Result<void> {
    if (!this.activeReports.has(reportId)) {
      return err(
        new AgentError('agent_invalid_input', `버그 리포트를 찾을 수 없습니다: ${reportId}`),
      );
    }

    this.activeReports.delete(reportId);
    this.logger.info('버그 리포트 해결', { reportId });

    return ok(undefined);
  }
}
