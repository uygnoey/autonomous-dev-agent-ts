/**
 * 팀 리더 Phase 처리 로직 / Team Leader Phase Handling Logic
 *
 * @description
 * KR: VERIFY 결과 처리, Phase 전환 등 Phase 관련 로직을 담당한다.
 * EN: Handles VERIFY result processing, phase transitions, and related logic.
 */

import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import {
  createEvent,
  getNextPhase,
  spawnDocumenter,
  updateStatusForPhase,
} from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';

// ── Phase 처리에 필요한 의존성 / Dependencies for phase handling ──

/**
 * Phase 처리에 필요한 의존성 / Dependencies required for phase handling
 */
/**
 * Phase 처리에 필요한 의존성 / Dependencies required for phase handling
 */
export interface PhaseHandlerDeps {
  readonly phaseEngine: {
    readonly currentPhase: Phase;
    transition(phase: Phase, reason: string, actor: string): { ok: boolean };
  };
  readonly progressTracker: ProgressTracker;
  readonly failureHandler: {
    classify(
      featureId: string,
      phase: string,
      reason: string,
    ): { ok: true; value: { type: string } } | { ok: false };
    getRecoveryPhase(report: { type: string }): Phase;
  };
  readonly verificationGate: {
    isAllPassed(featureId: string): boolean;
  };
  readonly agentGenerator: Parameters<typeof spawnDocumenter>[0];
  readonly agentSpawner: Parameters<typeof spawnDocumenter>[1];
  readonly logger: Parameters<typeof spawnDocumenter>[2];
}

// ── VERIFY 결과 처리 / Handle VERIFY result ─────────────────────

/**
 * VERIFY Phase 결과를 처리한다 / Handles VERIFY phase result
 *
 * @param deps - Phase 처리 의존성 / Phase handling dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param iteration - 현재 반복 횟수 / Current iteration count
 */
export async function* handleVerifyResult(
  deps: PhaseHandlerDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  iteration: number,
): AsyncIterable<AgentEvent> {
  if (deps.verificationGate.isAllPassed(featureId)) {
    deps.progressTracker.updateStatus(featureId, 'complete');
    deps.logger.info('기능 구현 완료 — documenter 트리거', { featureId, iterations: iteration });
    yield* spawnDocumenter(
      deps.agentGenerator,
      deps.agentSpawner,
      deps.logger,
      featureId,
      handoffPackage,
    );
    yield createEvent('done', `기능 '${featureId}' 구현 완료`);
    return;
  }

  // WHY: VERIFY 실패 시 실패 분석 후 롤백
  const report = deps.failureHandler.classify(featureId, 'VERIFY', '4중 검증 실패');

  if (report.ok) {
    const recoveryPhase = deps.failureHandler.getRecoveryPhase(report.value);
    const transition = deps.phaseEngine.transition(
      recoveryPhase,
      `검증 실패 롤백: ${report.value.type}`,
      'adev',
    );

    if (transition.ok) {
      deps.logger.warn('검증 실패 — Phase 롤백', {
        featureId,
        from: 'VERIFY',
        to: recoveryPhase,
        failureType: report.value.type,
      });
      yield createEvent('message', `검증 실패. ${recoveryPhase} Phase로 롤백합니다.`);
    }
  }
}

// ── Phase 전환 / Phase Transition ───────────────────────────────

/**
 * 순방향 Phase 전환을 수행한다 / Advances to the next phase
 *
 * @param deps - Phase 처리 의존성 / Phase handling dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param currentPhase - 현재 Phase / Current phase
 */
export function advancePhase(
  deps: {
    readonly phaseEngine: PhaseHandlerDeps['phaseEngine'];
    readonly progressTracker: ProgressTracker;
  },
  featureId: string,
  currentPhase: Phase,
): void {
  const nextPhase = getNextPhase(currentPhase);
  if (nextPhase) {
    const transition = deps.phaseEngine.transition(nextPhase, `${currentPhase} Phase 완료`, 'adev');

    if (transition.ok) {
      deps.progressTracker.updatePhase(featureId, nextPhase);
      updateStatusForPhase(deps.progressTracker, featureId, nextPhase);
    }
  }
}
