/**
 * 사용자 체크포인트 / User Checkpoint
 *
 * @description
 * KR: 검증 완료 후 사용자에게 승인/수정을 요청하는 체크포인트를 관리한다.
 *     사용자 결정(approve/revise)과 피드백을 기록한다.
 * EN: Manages checkpoints that request user approval/revision after verification.
 *     Records user decisions (approve/revise) and feedback.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';

/**
 * 사용자 결정 / User decision
 */
export type UserDecision = 'approve' | 'revise';

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
}
