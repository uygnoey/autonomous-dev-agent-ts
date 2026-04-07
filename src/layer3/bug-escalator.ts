/** BugEscalator - Layer3 → Layer2 버그 에스컬레이션 / Bug escalation orchestration */
import { type AdevError, AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Phase, Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { FailureHandler } from 'layer2/failure-handler.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { TeamLeader } from 'layer2/team-leader.js';
import { ArtifactSnapshotStore } from 'layer3/bug-escalator-snapshot.js';
import { triggerLayer2 as triggerLayer2Impl } from 'layer3/bug-escalator-trigger.js';
import type { OnLayer2RerunRequired } from 'layer3/bug-escalator-trigger.js';
import type {
  BugEscalationResult,
  ContinuousE2EResult,
  EscalateBugOptions,
  IBugEscalator,
  StepwiseVerificationResult,
  TriggerLayer2Options,
} from 'layer3/bug-escalator-types.js';
import {
  buildBugReport,
  buildBugReportFromE2E,
  classifySeverity,
  determineTargetPhase,
  mapFailureTypeToBugSeverity,
  summarizeChanges,
} from 'layer3/bug-report.js';
import type { BugReport, BugSeverity, TestFailure } from 'layer3/types.js';
import { requestUserConfirmation } from 'layer3/user-confirmation.js';
import { runStepwiseVerification } from 'layer3/verification-runner.js';

export type {
  BugEscalationResult,
  ContinuousE2EResult,
  EscalateBugOptions,
  IBugEscalator,
  StepwiseVerificationResult,
  TriggerLayer2Options,
} from 'layer3/bug-escalator-types.js';

export type { OnLayer2RerunRequired } from 'layer3/bug-escalator-trigger.js';

/** BugEscalator 구현 클래스 / BugEscalator implementation */
export class BugEscalator implements IBugEscalator {
  private reportCounter = 0;
  private readonly activeReports: Map<string, BugReport> = new Map();
  private readonly snapshotStore: ArtifactSnapshotStore;
  private readonly logger: Logger;
  private readonly teamLeader: TeamLeader | null;
  private readonly failureHandler: FailureHandler | null;
  private readonly integrationTester: IntegrationTester | null;
  private readonly onLayer2RerunRequired: OnLayer2RerunRequired | null;

  constructor(
    teamLeader: TeamLeader | Logger,
    failureHandler?: FailureHandler,
    integrationTester?: IntegrationTester,
    logger?: Logger,
    onLayer2RerunRequired?: OnLayer2RerunRequired,
  ) {
    // WHY: duck-typing으로 Logger vs TeamLeader를 안전하게 판별
    const isLogger =
      'child' in teamLeader && typeof (teamLeader as { child: unknown }).child === 'function';
    if (isLogger && !(failureHandler || integrationTester || logger)) {
      this.logger = (teamLeader as Logger).child({ module: 'bug-escalator' });
      this.teamLeader = null;
      this.failureHandler = null;
      this.integrationTester = null;
      this.onLayer2RerunRequired = null;
    } else {
      this.teamLeader = teamLeader as TeamLeader;
      this.failureHandler = failureHandler ?? null;
      this.integrationTester = integrationTester ?? null;
      this.logger = (logger ?? (teamLeader as unknown as Logger)).child({
        module: 'bug-escalator',
      });
      this.onLayer2RerunRequired = onLayer2RerunRequired ?? null;
    }
    this.snapshotStore = new ArtifactSnapshotStore(this.logger);
  }

  /** 심각도에 따라 대상 Phase를 결정하고 반환한다 / Determine target phase by severity. */
  escalate(bugReport: BugReport): Result<{ targetPhase: Phase; bugReport: BugReport }> {
    this.logger.info('버그 에스컬레이션 (간단 버전)', {
      bugId: bugReport.id,
      severity: bugReport.severity,
    });
    const targetPhase = determineTargetPhase(bugReport.severity);
    this.logger.info('에스컬레이션 대상 Phase 결정', { bugId: bugReport.id, targetPhase });
    return ok({ targetPhase, bugReport });
  }

  /** 전체 에스컬레이션 워크플로우를 실행한다 / Run the full escalation workflow. */
  async escalateAsync(options: EscalateBugOptions): Promise<Result<BugEscalationResult>> {
    const { projectId, projectPath, featureId, failedTest, context } = options;
    this.logger.info('버그 에스컬레이션 시작', {
      projectId,
      projectPath,
      featureId,
      testId: failedTest.id,
    });

    const bugReportResult = await this.analyzeRootCause(failedTest);
    if (!bugReportResult.ok) return err(bugReportResult.error as AdevError);
    const bugReport = bugReportResult.value;
    this.logger.info('근본 원인 분석 완료', { bugId: bugReport.id, severity: bugReport.severity });

    // WHY: 2계층 재실행 전 현재 산출물 경로를 스냅샷으로 보관 — 실패 시 복원 참조용
    const featureIdForSnapshot = featureId || bugReport.featureId || 'unknown';
    await this.saveArtifactSnapshot(projectId, featureIdForSnapshot, options.artifactPaths ?? []);

    const triggerResult = await this.triggerLayer2({
      projectId,
      bugReport,
      startPhase: 'DESIGN',
      handoffPackage: options.handoffPackage,
    });
    if (!triggerResult.ok) return err(triggerResult.error as AdevError);
    this.logger.info('2계층 재실행 완료', { bugId: bugReport.id });

    const verificationResult = await this.runStepwiseVerification(
      projectId,
      projectPath,
      featureId || bugReport.featureId || 'unknown',
    );
    if (!verificationResult.ok) return err(verificationResult.error as AdevError);
    const stepwiseResults = verificationResult.value;
    this.logger.info('계단식 검증 완료', { totalSteps: stepwiseResults.length });

    const changes = summarizeChanges(bugReport);
    const confirmationResult = await this.requestUserConfirmation(bugReport, changes);
    if (!confirmationResult.ok) return err(confirmationResult.error as AdevError);
    const userApproved = confirmationResult.value;
    this.logger.info('유저 재확인 완료', { approved: userApproved });
    if (userApproved) {
      this.clearArtifactSnapshot(projectId);
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
    void context; // WHY: context는 로깅에만 사용
    return ok(escalationResult);
  }

  /** qc 에이전트에 근본 원인 분석을 요청한다 / Request root cause analysis from qc agent. */
  async analyzeRootCause(failedTest: ContinuousE2EResult): Promise<Result<BugReport>> {
    this.logger.info('qc 근본 원인 분석 시작', { testId: failedTest.id });

    let severity: BugSeverity;
    let rootCause: string;
    if (this.failureHandler) {
      const classifyResult = this.failureHandler.classify(
        failedTest.featureId,
        'VERIFY',
        failedTest.errorMessage,
      );
      if (classifyResult.ok) {
        severity = mapFailureTypeToBugSeverity(classifyResult.value.type);
        rootCause = classifyResult.value.rootCause ?? `근본 원인 분석: ${failedTest.errorMessage}`;
      } else {
        severity = classifySeverity(failedTest.errorMessage);
        rootCause = `근본 원인 분석: ${failedTest.errorMessage}`;
      }
    } else {
      severity = classifySeverity(failedTest.errorMessage);
      rootCause = `근본 원인 분석: ${failedTest.errorMessage}`;
    }

    this.reportCounter += 1;
    const bugReport = buildBugReportFromE2E(failedTest, severity, rootCause, this.reportCounter);
    this.activeReports.set(bugReport.id, bugReport);
    this.logger.info('qc 근본 원인 분석 완료', { bugId: bugReport.id, severity });
    return ok(bugReport);
  }

  /** TeamLeader를 통해 2계층 재실행을 트리거한다 / Trigger Layer2 re-execution via TeamLeader. */
  async triggerLayer2(options: TriggerLayer2Options): Promise<Result<void>> {
    return triggerLayer2Impl(options, this.teamLeader, this.onLayer2RerunRequired, this.logger);
  }

  /** 4단계 계단식 통합 검증을 실행한다 / Run 4-step stepwise integration verification. */
  async runStepwiseVerification(
    projectId: string,
    projectPath: string,
    featureId: string,
  ): Promise<Result<readonly StepwiseVerificationResult[]>> {
    return runStepwiseVerification(
      projectId,
      projectPath,
      featureId,
      this.integrationTester,
      this.logger,
    );
  }

  /** @param bugReport - 버그 리포트 @param changes - 변경 사항 요약 */
  async requestUserConfirmation(bugReport: BugReport, changes: string): Promise<Result<boolean>> {
    return requestUserConfirmation(bugReport, changes, this.logger);
  }

  /** TestFailure를 BugReport로 변환하고 활성 리포트에 추가한다 / Create BugReport from TestFailure. */
  createReport(projectId: string, testFailure: TestFailure): Result<BugReport> {
    this.reportCounter += 1;
    const result = buildBugReport(projectId, testFailure, this.reportCounter);
    if (!result.ok) {
      this.reportCounter -= 1;
      return result;
    }
    const bugReport = result.value;
    this.logger.info('버그 리포트 생성 완료', {
      projectId,
      testName: testFailure.testName,
      bugId: bugReport.id,
      severity: bugReport.severity,
    });
    this.activeReports.set(bugReport.id, bugReport);
    return ok(bugReport);
  }

  /** @param projectId - 프로젝트 ID */
  getActiveReports(projectId: string): BugReport[] {
    return Array.from(this.activeReports.values()).filter((r) => r.projectId === projectId);
  }

  /** @param reportId - 버그 리포트 ID */
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

  // WHY: 기존 public API 유지 — ArtifactSnapshotStore로 위임
  async saveArtifactSnapshot(
    projectId: string,
    featureId: string,
    artifactPaths: readonly string[],
  ): Promise<void> {
    return this.snapshotStore.save(projectId, featureId, artifactPaths);
  }

  getArtifactSnapshot(projectId: string) {
    return this.snapshotStore.get(projectId);
  }

  clearArtifactSnapshot(projectId: string): void {
    this.snapshotStore.clear(projectId);
  }

  async restoreArtifactSnapshot(projectId: string): Promise<Result<void>> {
    return this.snapshotStore.restore(projectId);
  }
}
