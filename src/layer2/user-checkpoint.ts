/**
 * 사용자 체크포인트 / User Checkpoint
 *
 * @description
 * KR: 검증 완료 후 사용자에게 승인/수정을 요청하는 체크포인트를 관리한다.
 * EN: Manages checkpoints that request user approval/revision after verification.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import { formatTestReport } from 'layer2/user-checkpoint-formatter.js';

// WHY: 기존 import 경로 유지를 위해 타입을 re-export
export type {
  UserDecision,
  UserInputProvider,
  TestReport,
  CheckpointData,
  CriticalIssueResponse,
} from 'layer2/user-checkpoint-types.js';

import type {
  CheckpointData,
  CriticalIssueResponse,
  TestReport,
  UserDecision,
  UserInputProvider,
} from 'layer2/user-checkpoint-types.js';
import { CRITICAL_KEYWORDS } from 'layer2/user-checkpoint-types.js';

/**
 * 사용자 체크포인트 / User Checkpoint
 *
 * @example
 * const checkpoint = new UserCheckpoint(logger);
 * const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '4중 검증 전체 통과');
 */
export class UserCheckpoint {
  private readonly checkpoints: Map<string, CheckpointData> = new Map();
  private counter = 0;
  private readonly logger: Logger;
  // WHY: PI-007 — 비크리티컬 이슈를 배치로 수집하여 체크포인트 시 일괄 출력
  private readonly pendingNormalIssues: string[] = [];

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'user-checkpoint' });
  }

  /** 체크포인트를 생성한다 / Creates a checkpoint */
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

  /** 체크포인트를 조회한다 / Gets a checkpoint */
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

  /** 사용자 결정을 기록한다 / Records user decision */
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

  /** 이슈 심각도를 분류한다 / Classifies issue severity */
  classifyIssueSeverity(feedback: string): 'critical' | 'normal' {
    const lower = feedback.toLowerCase();
    return CRITICAL_KEYWORDS.some((kw) => lower.includes(kw)) ? 'critical' : 'normal';
  }

  /** 크리티컬 이슈 발생 시 즉시 유저에게 확인한다 / Immediately confirms critical issue with user */
  async notifyCriticalIssue(
    issue: string,
    inputProvider: UserInputProvider,
  ): Promise<CriticalIssueResponse> {
    this.logger.warn('크리티컬 이슈 감지 — 유저 확인 요청', { issue });

    inputProvider.system(`\n🚨 크리티컬 이슈 발생: ${issue}`);
    inputProvider.system('계속 진행하려면 "continue", 중단하려면 "abort"를 입력하세요.');

    while (true) {
      const event = await inputProvider.waitForInput();

      if (event.type === 'interrupt' || event.type === 'eof') {
        this.logger.info('유저 인터럽트 — acknowledge 처리');
        return 'acknowledge';
      }

      if (event.type === 'message') {
        const input = event.text?.trim().toLowerCase() ?? '';
        if (input === 'continue' || input === '계속') return 'acknowledge';
        if (input === 'abort' || input === '중단') return 'abort';
      }

      inputProvider.system('잘못된 입력입니다. "continue" 또는 "abort"를 입력하세요.');
    }
  }

  /** 비크리티컬 이슈를 배치 큐에 추가한다 / Queues a non-critical issue for batch output */
  queueNormalIssue(issue: string): void {
    this.pendingNormalIssues.push(issue);
    this.logger.debug('비크리티컬 이슈 큐 추가', {
      issue,
      queueSize: this.pendingNormalIssues.length,
    });
  }

  /** 큐에 쌓인 비크리티컬 이슈를 일괄 출력한다 / Flushes all queued non-critical issues */
  flushQueuedIssues(inputProvider: UserInputProvider): void {
    if (this.pendingNormalIssues.length === 0) return;

    inputProvider.system(`\n⚠️ 비크리티컬 이슈 ${this.pendingNormalIssues.length}건:`);
    for (const issue of this.pendingNormalIssues) {
      inputProvider.system(`  - ${issue}`);
    }

    this.logger.info('비크리티컬 이슈 일괄 출력', { count: this.pendingNormalIssues.length });
    this.pendingNormalIssues.length = 0;
  }

  /** 큐에 쌓인 비크리티컬 이슈 수를 반환한다 / Returns the number of queued non-critical issues */
  get pendingIssueCount(): number {
    return this.pendingNormalIssues.length;
  }

  /** 유저에게 검증 결과를 보여주고 승인/수정을 요청한다 / Shows verification results and requests user approval */
  async requestConfirmation(
    testReport: TestReport,
    inputProvider: UserInputProvider,
  ): Promise<{ decision: UserDecision; feedback?: string }> {
    const formattedReport = formatTestReport(testReport);
    for (const line of formattedReport.split('\n')) {
      inputProvider.system(line);
    }

    inputProvider.system('\n다음 중 하나를 입력하세요:');
    inputProvider.system('  approve           — 승인 후 3계층 진입');
    inputProvider.system('  revise            — 코드 수정 (2계층-A/B 재실행)');
    inputProvider.system('  revise_integration — 통합 테스트만 재실행');

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
