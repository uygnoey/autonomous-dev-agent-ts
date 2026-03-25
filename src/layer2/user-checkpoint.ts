/**
 * 사용자 체크포인트 / User Checkpoint
 *
 * @description
 * KR: 검증 완료 후 사용자에게 승인/수정을 요청하는 체크포인트를 관리한다.
 *     사용자 결정(approve/revise)과 피드백을 기록한다.
 * EN: Manages checkpoints that request user approval/revision after verification.
 *     Records user decisions (approve/revise) and feedback.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { IntegrationStepResult } from 'layer2/phase-types.js';

/**
 * 사용자 결정 / User decision
 *
 * @description
 * KR: approve = 3계층 진입, revise = 2계층-A/B 재실행, revise_integration = 통합 재검증
 * EN: approve = enter layer3, revise = re-run layer2-A/B, revise_integration = re-run integration
 */
export type UserDecision = 'approve' | 'revise' | 'revise_integration';

/**
 * 사용자 입력 제공자 인터페이스 / User input provider interface
 *
 * @description
 * KR: CLI 또는 테스트에서 사용자 입력을 추상화한다.
 * EN: Abstracts user input from CLI or test environments.
 */
export interface UserInputProvider {
  /**
   * 시스템 메시지를 출력한다 / Outputs a system message
   *
   * @param message - 출력할 메시지 / Message to output
   */
  system(message: string): void;

  /**
   * 성공 메시지를 출력한다 / Outputs a success message
   *
   * @param message - 출력할 메시지 / Message to output
   */
  success(message: string): void;

  /**
   * 사용자 입력을 대기한다 / Waits for user input
   *
   * @returns 사용자 입력 이벤트 / User input event
   */
  waitForInput(): Promise<{ type: string; text?: string }>;
}

/**
 * 통합 테스트 결과 요약 / Integration test results summary
 *
 * @description
 * KR: 유저에게 보여줄 통합 테스트 결과 요약.
 * EN: Summary of integration test results for user display.
 */
export interface IntegrationResultsSummary {
  /** 전체 통과 여부 / Whether all passed */
  readonly allPassed: boolean;
  /** 단계별 결과 / Step results */
  readonly stepResults: readonly IntegrationStepResult[];
  /** 실패한 단계 (선택) / Failed step (optional) */
  readonly failedAtStep?: number;
}

/**
 * 테스트 보고서 / Test report
 *
 * @description
 * KR: 4중 검증 + 통합 테스트 결과를 합친 보고서.
 * EN: Combined report of 4-layer verification + integration test results.
 */
export interface TestReport {
  /** 4중 검증 요약 / Verification summary */
  readonly verificationSummary: string;
  /** 통합 테스트 결과 / Integration results */
  readonly integrationResults: IntegrationResultsSummary;
  /** 생성된 파일 목록 / Generated files */
  readonly generatedFiles: readonly string[];
}

/**
 * 체크포인트 데이터 / Checkpoint data
 *
 * @description
 * KR: 체크포인트의 결과, 결정, 피드백을 담는다.
 * EN: Holds checkpoint results, decision, and feedback.
 */
export interface CheckpointData {
  /** 체크포인트 ID / Checkpoint ID */
  readonly checkpointId: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 검증 결과 요약 / Verification result summary */
  readonly results: string;
  /** 사용자 결정 (선택) / User decision (optional) */
  readonly decision?: UserDecision;
  /** 사용자 피드백 (선택) / User feedback (optional) */
  readonly feedback?: string;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
}

/**
 * 사용자 체크포인트 / User Checkpoint
 *
 * @description
 * KR: 사용자 승인/수정 체크포인트 라이프사이클을 관리한다.
 * EN: Manages user approval/revision checkpoint lifecycle.
 *
 * @example
 * const checkpoint = new UserCheckpoint(logger);
 * const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '4중 검증 전체 통과');
 */
export class UserCheckpoint {
  private readonly checkpoints: Map<string, CheckpointData> = new Map();
  private counter = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'user-checkpoint' });
  }

  /**
   * 체크포인트를 생성한다 / Creates a checkpoint
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 기능 ID / Feature ID
   * @param results - 검증 결과 요약 / Verification result summary
   * @returns 체크포인트 ID / Checkpoint ID
   */
  createCheckpoint(
    projectId: string,
    featureId: string,
    results: string,
  ): Result<{ checkpointId: string }> {
    this.counter += 1;
    const checkpointId = `checkpoint-${featureId}-${this.counter}`;

    const data: CheckpointData = {
      checkpointId,
      projectId,
      featureId,
      results,
      createdAt: new Date(),
    };

    this.checkpoints.set(checkpointId, data);

    this.logger.info('체크포인트 생성', { checkpointId, featureId });
    return ok({ checkpointId });
  }

  /**
   * 체크포인트를 조회한다 / Gets a checkpoint
   *
   * @param checkpointId - 체크포인트 ID / Checkpoint ID
   * @returns 체크포인트 데이터 또는 null / Checkpoint data or null
   */
  getCheckpoint(
    checkpointId: string,
  ): { results: string; decision?: UserDecision; feedback?: string } | null {
    const data = this.checkpoints.get(checkpointId);
    if (!data) return null;

    return {
      results: data.results,
      decision: data.decision,
      feedback: data.feedback,
    };
  }

  /**
   * 사용자 결정을 기록한다 / Records user decision
   *
   * @param checkpointId - 체크포인트 ID / Checkpoint ID
   * @param decision - 사용자 결정 / User decision
   * @param feedback - 사용자 피드백 (선택) / User feedback (optional)
   * @returns 성공 시 ok / ok on success
   */
  setDecision(checkpointId: string, decision: UserDecision, feedback?: string): Result<void> {
    const data = this.checkpoints.get(checkpointId);
    if (!data) {
      return err(
        new AgentError(
          'agent_checkpoint_not_found',
          `체크포인트를 찾을 수 없습니다: ${checkpointId}`,
        ),
      );
    }

    const updated: CheckpointData = {
      ...data,
      decision,
      feedback,
    };

    this.checkpoints.set(checkpointId, updated);

    this.logger.info('사용자 결정 기록', {
      checkpointId,
      decision,
      hasFeedback: feedback !== undefined,
    });

    return ok(undefined);
  }

  /**
   * 유저에게 검증 결과를 보여주고 승인/수정을 요청한다 / Shows verification results and requests user approval
   *
   * @description
   * KR: 통합 검증 통과 후 유저에게 결과+테스트 결과서를 전달하고
   *     approve/revise/revise_integration 입력을 받는다.
   *     스펙 §8.6 — 2계층-C CLI 인터랙션.
   * EN: After integration passes, shows results to user and waits for
   *     approve/revise/revise_integration input.
   *
   * @param testReport - 테스트 보고서 / Test report
   * @param inputProvider - 사용자 입력 제공자 / User input provider
   * @returns 사용자 결정 / User decision
   */
  async requestConfirmation(
    testReport: TestReport,
    inputProvider: UserInputProvider,
  ): Promise<{ decision: UserDecision; feedback?: string }> {
    // WHY: 검증 결과 요약 출력
    inputProvider.system('=== 통합 검증 결과 ===');
    inputProvider.system(`4중 검증: ${testReport.verificationSummary}`);

    // WHY: 통합 테스트 단계별 결과 출력
    const { integrationResults } = testReport;
    const totalTests = integrationResults.stepResults.reduce((sum, s) => sum + s.executedCount, 0);
    const totalFails = integrationResults.stepResults.reduce((sum, s) => sum + s.failCount, 0);
    inputProvider.system(`통합 테스트: ${totalTests} 실행 / ${totalFails} 실패`);

    for (const step of integrationResults.stepResults) {
      const status = step.passed ? '통과' : '실패';
      inputProvider.system(
        `  Step ${step.step} (${step.scope}): ${status} — ${step.executedCount}/${step.targetCount} 실행, ${step.failCount} 실패`,
      );
    }

    // WHY: 생성된 파일 목록 출력
    if (testReport.generatedFiles.length > 0) {
      inputProvider.system(`\n생성된 파일 (${testReport.generatedFiles.length}개):`);
      for (const file of testReport.generatedFiles) {
        inputProvider.system(`  - ${file}`);
      }
    }

    // WHY: 유저 입력 안내
    inputProvider.system('\n다음 중 하나를 입력하세요:');
    inputProvider.system('  approve           — 승인 후 3계층 진입');
    inputProvider.system('  revise            — 코드 수정 (2계층-A/B 재실행)');
    inputProvider.system('  revise_integration — 통합 테스트만 재실행');

    // WHY: 유저 입력 대기 루프 — 유효한 입력이 들어올 때까지 반복
    while (true) {
      const event = await inputProvider.waitForInput();

      if (event.type === 'interrupt' || event.type === 'eof') {
        this.logger.info('유저 인터럽트 — approve로 처리');
        return { decision: 'approve' };
      }

      if (event.type !== 'message' || !event.text) {
        continue;
      }

      const input = event.text.trim().toLowerCase();

      if (input === 'approve' || input === '승인') {
        this.logger.info('유저 승인', { input });
        return { decision: 'approve' };
      }

      if (input === 'revise' || input === '수정') {
        // WHY: revise 시 추가 피드백을 받을 수 있다
        inputProvider.system('수정 사유를 입력하세요 (없으면 엔터):');
        const feedbackEvent = await inputProvider.waitForInput();
        const feedback =
          feedbackEvent.type === 'message' && feedbackEvent.text?.trim()
            ? feedbackEvent.text.trim()
            : undefined;

        this.logger.info('유저 수정 요청', { feedback });
        return { decision: 'revise', feedback };
      }

      if (input === 'revise_integration' || input === '재검증') {
        this.logger.info('유저 통합 재검증 요청');
        return { decision: 'revise_integration' };
      }

      inputProvider.system(
        '잘못된 입력입니다. approve / revise / revise_integration 중 하나를 입력하세요.',
      );
    }
  }
}
