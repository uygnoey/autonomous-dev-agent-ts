/**
 * 팀 리더 Phase 처리 로직 / Team Leader Phase Handling Logic
 *
 * @description
 * KR: VERIFY 결과 처리, Phase 전환 등 Phase 관련 로직을 담당한다.
 * EN: Handles VERIFY result processing, phase transitions, and related logic.
 */

import type { Logger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import {
  createEvent,
  getNextPhase,
  spawnDocumenter,
  updateStatusForPhase,
} from 'layer2/team-leader-helpers.js';
import type { DocumenterTriggerContext } from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';
import type {
  TestReport,
  UserCheckpoint,
  UserDecision,
  UserInputProvider,
} from 'layer2/user-checkpoint.js';

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
    summarize(
      featureId: string,
    ): { ok: true; value: { passed: boolean; summary: string } } | { ok: false };
    /** PI-005 — 통합 검증 실패 판단을 위해 결과 조회 / Get results for integration failure check */
    getResults(
      featureId: string,
    ): ReadonlyArray<{
      readonly phase: string;
      readonly passed: boolean;
      readonly feedback: string;
    }>;
  };
  readonly agentGenerator: Parameters<typeof spawnDocumenter>[0];
  readonly agentSpawner: Parameters<typeof spawnDocumenter>[1];
  readonly logger: Logger;
  /** 사용자 체크포인트 (선택) — PI-010 유저 확인에 사용 / User checkpoint (optional) for PI-010 user confirmation */
  readonly userCheckpoint?: UserCheckpoint;
  /** 사용자 입력 제공자 (선택) — PI-010 CLI 인터랙션에 사용 / User input provider (optional) for PI-010 CLI interaction */
  readonly userInputProvider?: UserInputProvider;
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
    // WHY: PI-010 — 검증 통과 후 유저 확인 단계 (userCheckpoint + userInputProvider 둘 다 있어야 실행)
    if (deps.userCheckpoint && deps.userInputProvider) {
      const userResult: { decision: UserDecision; feedback?: string } =
        await requestUserConfirmation(deps, featureId);

      if (userResult.decision === 'revise') {
        // WHY: revise → 2계층-A(CODE) 재실행
        deps.logger.info('유저 수정 요청 — CODE Phase로 롤백', {
          featureId,
          feedback: userResult.feedback,
        });
        const transition = deps.phaseEngine.transition('CODE', '유저 수정 요청', 'user');
        if (transition.ok) {
          deps.progressTracker.updateStatus(featureId, 'coding');
          yield createEvent(
            'message',
            `유저 수정 요청. CODE Phase로 롤백합니다.${userResult.feedback ? ` 사유: ${userResult.feedback}` : ''}`,
          );
        }
        return;
      }

      if (userResult.decision === 'revise_integration') {
        // WHY: revise_integration → TEST Phase로 롤백 (통합 테스트만 재실행)
        deps.logger.info('유저 통합 재검증 요청 — TEST Phase로 롤백', { featureId });
        const transition = deps.phaseEngine.transition('TEST', '유저 통합 재검증 요청', 'user');
        if (transition.ok) {
          deps.progressTracker.updateStatus(featureId, 'testing');
          yield createEvent('message', '유저 통합 재검증 요청. TEST Phase로 롤백합니다.');
        }
        return;
      }

      // approve → 계속 진행
      deps.logger.info('유저 승인 완료', { featureId });
    }

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
    let recoveryPhase = deps.failureHandler.getRecoveryPhase(report.value);

    // WHY: PI-005 — 통합 검증 실패 시 반드시 DESIGN부터 재실행
    //      §8.5: "통합 검증 실패 → 2계층-A 전체 루프 재실행 (architect부터)"
    const adevResults = deps.verificationGate.getResults(featureId);
    const integrationFailed = adevResults.some(
      (r) => r.phase === 'adev' && !r.passed && r.feedback.includes('통합 테스트 실패'),
    );
    if (integrationFailed && recoveryPhase !== 'DESIGN') {
      deps.logger.info('통합 검증 실패 → DESIGN Phase 강제 재시작 (§8.5)', {
        featureId,
        originalRecoveryPhase: recoveryPhase,
      });
      recoveryPhase = 'DESIGN';
    }

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

      // WHY: NI-007 — 버그 발생(검증 실패) 시 documenter spawn (버그 리포트 생성)
      yield* spawnDocumenter(
        deps.agentGenerator,
        deps.agentSpawner,
        deps.logger,
        featureId,
        handoffPackage,
        {
          trigger: 'bug_detected',
          context: {
            phase: 'VERIFY',
            failureType: report.value.type,
            recoveryPhase,
          },
        },
      );
    }
  }
}

/**
 * 유저 확인을 요청한다 / Requests user confirmation
 *
 * @description
 * KR: PI-010 — 검증 통과 후 유저에게 결과를 보여주고 approve/revise/revise_integration 결정을 받는다.
 * EN: PI-010 — Shows results to user and collects approval decision after verification passes.
 *
 * @param deps - Phase 처리 의존성 / Phase handling dependencies
 * @param featureId - 기능 ID / Feature ID
 * @returns 유저 결정 / User decision
 */
async function requestUserConfirmation(
  deps: PhaseHandlerDeps,
  featureId: string,
): Promise<{ decision: UserDecision; feedback?: string }> {
  const summaryResult = deps.verificationGate.summarize(featureId);
  const verificationSummary = summaryResult.ok
    ? summaryResult.value.summary
    : '검증 요약 생성 실패';

  const testReport: TestReport = {
    verificationSummary,
    integrationResults: {
      allPassed: true,
      stepResults: [],
    },
    generatedFiles: [],
  };

  // WHY: userCheckpoint와 userInputProvider는 호출 전에 존재 확인 완료
  return deps.userCheckpoint!.requestConfirmation(testReport, deps.userInputProvider!);
}

// ── Phase 전환 / Phase Transition ───────────────────────────────

/**
 * 순방향 Phase 전환을 수행한다 / Advances to the next phase
 *
 * @param deps - Phase 처리 의존성 / Phase handling dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param currentPhase - 현재 Phase / Current phase
 */
/**
 * Phase 전환 결과 / Phase advance result
 *
 * @description
 * KR: Phase 전환 성공 시 이전/다음 Phase 정보를 반환한다.
 *     documenter 트리거에 필요한 컨텍스트를 포함한다.
 * EN: Returns previous/next phase info on successful transition.
 *     Includes context needed for documenter trigger.
 */
export interface PhaseAdvanceResult {
  readonly advanced: boolean;
  readonly fromPhase: Phase;
  readonly toPhase: Phase | null;
}

export function advancePhase(
  deps: {
    readonly phaseEngine: PhaseHandlerDeps['phaseEngine'];
    readonly progressTracker: ProgressTracker;
  },
  featureId: string,
  currentPhase: Phase,
): PhaseAdvanceResult {
  const nextPhase = getNextPhase(currentPhase);
  if (nextPhase) {
    const transition = deps.phaseEngine.transition(nextPhase, `${currentPhase} Phase 완료`, 'adev');

    if (transition.ok) {
      deps.progressTracker.updatePhase(featureId, nextPhase);
      updateStatusForPhase(deps.progressTracker, featureId, nextPhase);
      return { advanced: true, fromPhase: currentPhase, toPhase: nextPhase };
    }
  }
  return { advanced: false, fromPhase: currentPhase, toPhase: null };
}

/**
 * Phase 전환 후 documenter spawn 헬퍼 / Spawn documenter after phase transition
 *
 * @description
 * KR: NI-007 — Phase 경계 전환 시 documenter를 spawn하여
 *     CHANGELOG, 의사결정 기록, 설계 변경 사유서를 생성한다.
 * EN: NI-007 — Spawns documenter at phase boundary to generate
 *     CHANGELOG, decision records, design change docs.
 *
 * @param deps - Phase 처리 의존성 / Phase handling deps
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param fromPhase - 이전 Phase / Previous phase
 * @param toPhase - 다음 Phase / Next phase
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* spawnDocumenterOnPhaseBoundary(
  deps: PhaseHandlerDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  fromPhase: Phase,
  toPhase: Phase,
): AsyncIterable<AgentEvent> {
  yield* spawnDocumenter(
    deps.agentGenerator,
    deps.agentSpawner,
    deps.logger,
    featureId,
    handoffPackage,
    {
      trigger: 'phase_boundary',
      context: { fromPhase, toPhase },
    },
  );
}
