/**
 * 2계층 재실행 트리거 로직 / Layer 2 re-execution trigger logic
 *
 * @description
 * KR: TeamLeader 또는 콜백을 통해 2계층 전체 루프 재실행을 트리거한다.
 * EN: Triggers Layer 2 full loop re-execution via TeamLeader or callback.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { TeamLeader } from 'layer2/team-leader.js';
import type { TriggerLayer2Options } from 'layer3/bug-escalator-types.js';
import type { BugReport } from 'layer3/types.js';

/** 2계층 재실행 콜백 타입 / Layer 2 re-execution callback type */
export type OnLayer2RerunRequired = (report: BugReport) => Promise<void>;

/**
 * TeamLeader를 통해 2계층 재실행을 트리거한다 / Trigger Layer2 re-execution via TeamLeader.
 *
 * @param options - 트리거 옵션
 * @param teamLeader - TeamLeader 인스턴스 (선택)
 * @param onLayer2RerunRequired - 2계층 재실행 콜백 (선택)
 * @param logger - 로거
 * @returns 성공 여부
 */
export async function triggerLayer2(
  options: TriggerLayer2Options,
  teamLeader: TeamLeader | null,
  onLayer2RerunRequired: OnLayer2RerunRequired | null,
  logger: Logger,
): Promise<Result<void>> {
  const { projectId, bugReport, startPhase } = options;
  logger.info('2계층 재실행 트리거', { projectId, bugId: bugReport.id, startPhase });

  if (onLayer2RerunRequired) {
    try {
      logger.info('onLayer2RerunRequired 콜백 호출', {
        bugId: bugReport.id,
        featureId: bugReport.featureId,
      });
      await onLayer2RerunRequired(bugReport);
      logger.info('onLayer2RerunRequired 콜백 완료', { bugId: bugReport.id });
      return ok(undefined);
    } catch (callbackError) {
      return err(
        new AgentError('layer3_escalation_trigger_failed', '2계층 재실행 콜백 실패', {
          error: String(callbackError),
        }),
      );
    }
  }

  if (teamLeader) {
    if (options.handoffPackage) {
      const featureId = bugReport.featureId ?? projectId;
      logger.info('TeamLeader.executeFeature() 직접 호출 — 2계층 전체 재실행', {
        projectId,
        bugId: bugReport.id,
        featureId,
        startPhase,
      });
      try {
        for await (const _event of teamLeader.executeFeature(featureId, options.handoffPackage)) {
          // WHY: 이벤트 소비만 — 결과 처리는 BugEscalator 상위에서 수행
        }
        logger.info('TeamLeader 2계층 재실행 완료', { bugId: bugReport.id, featureId });
      } catch (executeError) {
        return err(
          new AgentError('layer3_escalation_trigger_failed', '2계층 재실행 실패', {
            error: String(executeError),
          }),
        );
      }
    } else {
      logger.info('HandoffPackage 미제공 — TeamLeader 직접 호출 생략 (콜백 경로 사용)', {
        projectId,
        bugId: bugReport.id,
      });
    }
  } else {
    logger.debug('TeamLeader 없음 — 시뮬레이션 모드', { projectId });
  }

  logger.info('2계층 재실행 완료', { projectId, bugId: bugReport.id });
  return ok(undefined);
}
