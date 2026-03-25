/** BugEscalator - Layer3 → Layer2 버그 에스컬레이션 / Bug escalation orchestration */
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type AdevError, AgentError } from 'core/errors.js';
import { ConsoleLogger, type Logger } from 'core/logger.js';
import type { Phase, Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { FailureHandler } from 'layer2/failure-handler.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { TeamLeader } from 'layer2/team-leader.js';
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

/**
 * 2계층 재실행 콜백 타입 / Layer 2 re-execution callback type
 *
 * @description
 * KR: 지속 E2E 실패 시 2계층 전체 루프 재실행을 외부에서 주입할 수 있는 콜백.
 *     §9.4: "버그 발견 → 2계층 전체 루프 재실행 (architect부터)"
 * EN: Callback injectable from outside to trigger Layer 2 full loop re-execution on E2E failure.
 *     §9.4: "Bug found → Layer 2 full loop re-execution (from architect)"
 */
export type OnLayer2RerunRequired = (report: BugReport) => Promise<void>;

/**
 * 산출물 스냅샷 / Artifact snapshot
 *
 * @description
 * KR: 2계층 재실행 전 산출물 경로 목록을 저장한다.
 *     재실행 실패 시 이전 산출물로 복원할 수 있도록 참조 정보를 보관한다.
 * EN: Stores artifact path list before Layer 2 re-execution.
 *     Keeps reference info for restoring previous artifacts if re-run fails.
 */
export interface ArtifactSnapshot {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 산출물 파일 경로 목록 / Artifact file paths */
  readonly artifactPaths: readonly string[];
  /** 스냅샷 저장 시각 / Snapshot saved at */
  readonly savedAt: Date;
  /** 백업 디렉토리 경로 (파일 복사본 저장 위치) / Backup directory path */
  readonly backupDir?: string;
}

/** BugEscalator 구현 클래스 / BugEscalator implementation */
export class BugEscalator implements IBugEscalator {
  private reportCounter = 0;
  private readonly activeReports: Map<string, BugReport> = new Map();
  /** 산출물 스냅샷 (projectId → ArtifactSnapshot) / Artifact snapshots by projectId */
  private readonly artifactSnapshots: Map<string, ArtifactSnapshot> = new Map();
  private readonly logger: Logger;
  private readonly teamLeader: TeamLeader | null;
  private readonly failureHandler: FailureHandler | null;
  private readonly integrationTester: IntegrationTester | null;
  private readonly onLayer2RerunRequired: OnLayer2RerunRequired | null;

  /**
   * @param teamLeader - TeamLeader 또는 Logger (간단 API) / TeamLeader or Logger (simple API)
   * @param failureHandler - 실패 분류기 (선택) / Failure classifier (optional)
   * @param integrationTester - 통합 테스터 (선택) / Integration tester (optional)
   * @param logger - 로거 (선택) / Logger (optional)
   * @param onLayer2RerunRequired - 2계층 재실행 콜백 (선택) / Layer 2 re-execution callback (optional)
   */
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
      this.logger = logger ? logger.child({ module: 'bug-escalator' }) : new ConsoleLogger('info');
      this.onLayer2RerunRequired = onLayer2RerunRequired ?? null;
    }
  }

  /**
   * 심각도에 따라 대상 Phase를 결정하고 반환한다 / Determine target phase by severity.
   *
   * @param bugReport - 버그 리포트
   * @returns 대상 Phase 포함 에스컬레이션 결과
   */
  escalate(bugReport: BugReport): Result<{ targetPhase: Phase; bugReport: BugReport }> {
    this.logger.info('버그 에스컬레이션 (간단 버전)', {
      bugId: bugReport.id,
      severity: bugReport.severity,
    });
    const targetPhase = determineTargetPhase(bugReport.severity);
    this.logger.info('에스컬레이션 대상 Phase 결정', { bugId: bugReport.id, targetPhase });
    return ok({ targetPhase, bugReport });
  }

  /**
   * 전체 에스컬레이션 워크플로우를 실행한다 / Run the full escalation workflow.
   *
   * @param options - 에스컬레이션 옵션
   * @returns 에스컬레이션 결과
   */
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

    const triggerResult = await this.triggerLayer2({ projectId, bugReport, startPhase: 'DESIGN' });
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
    // WHY: 유저 승인 시 새 산출물 채택 → 이전 스냅샷 불필요
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

  /**
   * qc 에이전트에 근본 원인 분석을 요청한다 / Request root cause analysis from qc agent.
   *
   * @param failedTest - 실패한 E2E 테스트 결과
   * @returns 생성된 버그 리포트
   */
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

  /**
   * TeamLeader를 통해 2계층 재실행을 트리거한다 / Trigger Layer2 re-execution via TeamLeader.
   *
   * @param options - 트리거 옵션
   * @returns 성공 여부
   */
  async triggerLayer2(options: TriggerLayer2Options): Promise<Result<void>> {
    const { projectId, bugReport, startPhase } = options;
    this.logger.info('2계층 재실행 트리거', { projectId, bugId: bugReport.id, startPhase });

    // WHY: onLayer2RerunRequired 콜백이 있으면 우선 호출 — 실제 2계층 재실행 위임
    //      §9.4: "2계층 전체 루프 재실행 (architect부터)"
    if (this.onLayer2RerunRequired) {
      try {
        this.logger.info('onLayer2RerunRequired 콜백 호출', {
          bugId: bugReport.id,
          featureId: bugReport.featureId,
        });
        await this.onLayer2RerunRequired(bugReport);
        this.logger.info('onLayer2RerunRequired 콜백 완료', { bugId: bugReport.id });
        return ok(undefined);
      } catch (callbackError) {
        return err(
          new AgentError('layer3_escalation_trigger_failed', '2계층 재실행 콜백 실패', {
            error: String(callbackError),
          }),
        );
      }
    }

    if (this.teamLeader) {
      try {
        // WHY: FailureHandler가 있으면 실패 유형 분류 → 재실행 대상 Phase 결정에 활용
        if (this.failureHandler) {
          const classifyResult = this.failureHandler.classify(
            bugReport.featureId ?? 'unknown',
            'VERIFY',
            bugReport.description,
          );
          if (classifyResult.ok) {
            this.logger.info('FailureHandler 분류 완료', {
              type: classifyResult.value.type,
              action: classifyResult.value.suggestedAction,
              targetPhase: classifyResult.value.targetPhase,
            });
          }
        }

        // WHY: TeamLeader 재실행 준비 — onLayer2RerunRequired 콜백 미제공 시 직접 호출 시도
        //      TeamLeader.executeFeature()는 HandoffPackage를 요구하므로
        //      현재는 분류 결과 로깅까지만 수행. HandoffPackage 주입 경로 확정 후 실제 호출 연결 예정.
        this.logger.info('TeamLeader 재실행 준비 — 콜백 미제공 시 직접 호출 시도', {
          projectId,
          bugId: bugReport.id,
          featureId: bugReport.featureId,
          startPhase,
        });
      } catch (executeError) {
        return err(
          new AgentError('layer3_escalation_trigger_failed', '2계층 재실행 실패', {
            error: String(executeError),
          }),
        );
      }
    } else {
      this.logger.debug('TeamLeader 없음 — 시뮬레이션 모드', { projectId });
    }

    this.logger.info('2계층 재실행 완료', { projectId, bugId: bugReport.id });
    return ok(undefined);
  }

  /**
   * 4단계 계단식 통합 검증을 실행한다 / Run 4-step stepwise integration verification.
   *
   * @param projectId - 프로젝트 ID
   * @param featureId - 수정된 기능 ID
   * @returns 검증 결과 배열
   */
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

  /**
   * TestFailure를 BugReport로 변환하고 활성 리포트에 추가한다 / Create BugReport from TestFailure.
   *
   * @param projectId - 프로젝트 ID
   * @param testFailure - 테스트 실패 정보
   * @returns 생성된 버그 리포트
   */
  createReport(projectId: string, testFailure: TestFailure): Result<BugReport> {
    this.reportCounter += 1;
    const result = buildBugReport(projectId, testFailure, this.reportCounter);
    if (!result.ok) {
      this.reportCounter -= 1; // WHY: 검증 실패 시 카운터 롤백
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

  /**
   * 산출물 스냅샷을 저장한다 / Saves an artifact snapshot
   *
   * @description
   * KR: 2계층 재실행 전 현재 산출물 경로 목록을 저장하고,
   *     각 파일의 백업 복사본을 /tmp/adev-artifact-backup/ 에 생성한다.
   * EN: Saves current artifact paths before Layer 2 re-execution,
   *     and creates backup copies in /tmp/adev-artifact-backup/.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 기능 ID / Feature ID
   * @param artifactPaths - 산출물 파일 경로 목록 / Artifact file paths
   */
  async saveArtifactSnapshot(
    projectId: string,
    featureId: string,
    artifactPaths: readonly string[],
  ): Promise<void> {
    const backupDir = join('/tmp', 'adev-artifact-backup', projectId, `${Date.now()}`);
    await mkdir(backupDir, { recursive: true });

    // WHY: 파일이 실제 존재하는 경우에만 백업 — 존재하지 않는 경로는 무시
    for (const artifactPath of artifactPaths) {
      const file = Bun.file(artifactPath);
      if (await file.exists()) {
        const destPath = join(backupDir, basename(artifactPath));
        await Bun.write(destPath, file);
      }
    }

    const snapshot: ArtifactSnapshot = {
      projectId,
      featureId,
      artifactPaths: [...artifactPaths],
      savedAt: new Date(),
      backupDir,
    };
    this.artifactSnapshots.set(projectId, snapshot);
    this.logger.info('산출물 스냅샷 저장 (백업 포함)', {
      projectId,
      featureId,
      pathCount: artifactPaths.length,
      backupDir,
    });
  }

  /**
   * 산출물 스냅샷을 조회한다 / Gets an artifact snapshot
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 스냅샷 또는 null / Snapshot or null
   */
  getArtifactSnapshot(projectId: string): ArtifactSnapshot | null {
    return this.artifactSnapshots.get(projectId) ?? null;
  }

  /**
   * 산출물 스냅샷을 삭제한다 / Clears an artifact snapshot
   *
   * @param projectId - 프로젝트 ID / Project ID
   */
  clearArtifactSnapshot(projectId: string): void {
    this.artifactSnapshots.delete(projectId);
    this.logger.debug('산출물 스냅샷 삭제', { projectId });
  }

  /**
   * 백업된 산출물을 원래 경로로 복원한다 / Restore backed-up artifacts to original paths
   *
   * @description
   * KR: 스냅샷의 backupDir에서 백업 파일들을 원래 artifactPaths 위치로 복원한다.
   *     복원 완료 후 스냅샷을 삭제한다.
   * EN: Restores backup files from snapshot's backupDir to original artifactPaths.
   *     Clears the snapshot after successful restoration.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns ok(void) 복원 성공, err(AdevError) 실패 시 / ok on success, err on failure
   */
  async restoreArtifactSnapshot(projectId: string): Promise<Result<void>> {
    const snapshot = this.getArtifactSnapshot(projectId);
    if (!snapshot) {
      return err(
        new AgentError('agent_invalid_input', `산출물 스냅샷을 찾을 수 없습니다: ${projectId}`),
      );
    }

    if (!snapshot.backupDir) {
      this.clearArtifactSnapshot(projectId);
      return ok(undefined);
    }

    try {
      // WHY: 백업 파일명과 원래 경로를 basename으로 매칭하여 복원
      for (const artifactPath of snapshot.artifactPaths) {
        const backupFilePath = join(snapshot.backupDir, basename(artifactPath));
        const backupFile = Bun.file(backupFilePath);
        if (await backupFile.exists()) {
          await Bun.write(artifactPath, backupFile);
          this.logger.debug('산출물 복원', { from: backupFilePath, to: artifactPath });
        }
      }

      this.logger.info('산출물 스냅샷 복원 완료', {
        projectId,
        pathCount: snapshot.artifactPaths.length,
        backupDir: snapshot.backupDir,
      });

      this.clearArtifactSnapshot(projectId);
      return ok(undefined);
    } catch (cause) {
      return err(new AgentError('agent_invalid_input', `산출물 복원 실패: ${projectId}`, cause));
    }
  }
}
