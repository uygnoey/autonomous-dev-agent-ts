/**
 * 팀 리더 (메인 오케스트레이터) / Team Leader (Main Orchestrator)
 *
 * @description
 * KR: 4-Phase 루프를 구동하여 기능 구현을 오케스트레이션한다.
 *     1. DESIGN → architect, qa, reviewer 스폰
 *     2. CODE → coder 할당 및 스폰
 *     3. TEST → tester, qc 스폰
 *     4. VERIFY → 4중 검증 수행
 *     VERIFY 실패 시 → 실패 분석 → 적절한 Phase로 롤백 → 재시도
 * EN: Drives the 4-phase loop to orchestrate feature implementation.
 *     On VERIFY failure → analyze → rollback to appropriate phase → retry.
 */

import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import {
  createEvent,
  executePhase,
  getNextPhase,
  spawnDocumenter,
  updateStatusForPhase,
} from 'layer2/team-leader-helpers.js';
import type { TeamLeaderDeps } from 'layer2/team-leader-types.js';
import type { AgentEvent } from 'layer2/types.js';

// Re-export for external consumers
export type { TeamLeaderDeps } from 'layer2/team-leader-types.js';

/**
 * 최대 Phase 루프 반복 횟수 / Maximum phase loop iterations
 *
 * @description
 * KR: 무한 루프 방지를 위한 최대 반복 횟수.
 * EN: Maximum iterations to prevent infinite loops.
 */
const MAX_ITERATIONS = 10;

/**
 * 팀 리더 (메인 오케스트레이터) / Team Leader (Main Orchestrator)
 *
 * @description
 * KR: 모든 layer2 컴포넌트를 조합하여 기능 구현을 오케스트레이션한다.
 * EN: Composes all layer2 components to orchestrate feature implementation.
 *
 * @example
 * const leader = new TeamLeader(deps);
 * for await (const event of leader.executeFeature('feat-1', handoff)) {
 *   // 이벤트 처리 / handle event
 * }
 */
export class TeamLeader {
  private readonly phaseEngine: TeamLeaderDeps['phaseEngine'];
  private readonly agentSpawner: TeamLeaderDeps['agentSpawner'];
  private readonly sessionManager: TeamLeaderDeps['sessionManager'];
  private readonly tokenMonitor: TeamLeaderDeps['tokenMonitor'];
  private readonly progressTracker: TeamLeaderDeps['progressTracker'];
  private readonly agentGenerator: TeamLeaderDeps['agentGenerator'];
  private readonly coderAllocator: TeamLeaderDeps['coderAllocator'];
  private readonly streamMonitor: TeamLeaderDeps['streamMonitor'];
  private readonly biasDetector: TeamLeaderDeps['biasDetector'];
  private readonly failureHandler: TeamLeaderDeps['failureHandler'];
  private readonly verificationGate: TeamLeaderDeps['verificationGate'];
  private readonly integrationTester: TeamLeaderDeps['integrationTester'];
  private readonly logger: TeamLeaderDeps['logger'];
  private readonly ragSearcher: TeamLeaderDeps['ragSearcher'];
  private currentFeatureId: string | null = null;

  /**
   * @param deps - 의존성 주입 / Dependency injection
   */
  constructor(deps: TeamLeaderDeps) {
    this.phaseEngine = deps.phaseEngine;
    this.agentSpawner = deps.agentSpawner;
    this.sessionManager = deps.sessionManager;
    this.tokenMonitor = deps.tokenMonitor;
    this.progressTracker = deps.progressTracker;
    this.agentGenerator = deps.agentGenerator;
    this.coderAllocator = deps.coderAllocator;
    this.streamMonitor = deps.streamMonitor;
    this.biasDetector = deps.biasDetector;
    this.failureHandler = deps.failureHandler;
    this.verificationGate = deps.verificationGate;
    this.integrationTester = deps.integrationTester;
    this.logger = deps.logger.child({ module: 'team-leader' });
    this.ragSearcher = deps.ragSearcher;
  }

  /**
   * 기능 구현을 오케스트레이션한다 / Orchestrates feature implementation
   *
   * @description
   * KR: 4-Phase 루프를 구동한다.
   *     VERIFY 실패 시 실패 분석 후 적절한 Phase로 롤백하여 재시도한다.
   *     최대 반복 횟수를 초과하면 중단한다.
   * EN: Drives the 4-phase loop.
   *     On VERIFY failure, analyzes and rolls back to appropriate phase.
   *     Stops after maximum iterations.
   *
   * @param featureId - 기능 ID / Feature ID
   * @param handoffPackage - layer1 인수 패키지 / Handoff package from layer1
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  async *executeFeature(
    featureId: string,
    handoffPackage: HandoffPackage,
  ): AsyncIterable<AgentEvent> {
    this.currentFeatureId = featureId;
    this.progressTracker.initFeature(featureId);
    this.progressTracker.updateStatus(featureId, 'designing');

    this.logger.info('기능 구현 시작', { featureId, projectId: handoffPackage.projectId });

    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      const currentPhase = this.phaseEngine.currentPhase;

      this.logger.info('Phase 실행', { featureId, phase: currentPhase, iteration });

      // WHY: 토큰 모니터를 확인하여 리소스 부족 시 중단
      if (this.tokenMonitor.shouldPauseAll()) {
        this.logger.error('토큰 부족으로 실행 일시 정지', { featureId });
        yield createEvent('error', '토큰 리밋 도달로 실행 일시 정지');
        return;
      }

      yield* executePhase(
        {
          phaseEngine: this.phaseEngine,
          tokenMonitor: this.tokenMonitor,
          agentGenerator: this.agentGenerator,
          sessionManager: this.sessionManager,
          agentSpawner: this.agentSpawner,
          streamMonitor: this.streamMonitor,
          logger: this.logger,
          ragSearcher: this.ragSearcher,
        },
        currentPhase,
        featureId,
        handoffPackage,
      );

      if (currentPhase === 'VERIFY') {
        yield* this.handleVerifyResult(featureId, handoffPackage, iteration);
        // WHY: handleVerifyResult가 done을 yield하면 종료
        if (this.verificationGate.isAllPassed(featureId)) return;
      } else {
        this.advancePhase(featureId, currentPhase);
      }
    }

    this.logger.error('최대 반복 횟수 초과', { featureId, maxIterations: MAX_ITERATIONS });
    this.progressTracker.updateStatus(featureId, 'failed');
    yield createEvent('error', `최대 반복 횟수(${MAX_ITERATIONS}) 초과로 중단`);
  }

  /**
   * 현재 상태를 반환한다 / Returns current status
   *
   * @returns 현재 기능 ID, Phase, 진행률 / Current feature ID, phase, progress
   */
  getStatus(): { featureId: string | null; phase: Phase; progress: number } {
    return {
      featureId: this.currentFeatureId,
      phase: this.phaseEngine.currentPhase,
      progress: this.progressTracker.getOverallCompletion(),
    };
  }

  /**
   * VERIFY Phase 결과를 처리한다 / Handles VERIFY phase result
   *
   * @param featureId - 기능 ID / Feature ID
   * @param handoffPackage - 인수 패키지 / Handoff package
   * @param iteration - 현재 반복 횟수 / Current iteration count
   */
  private async *handleVerifyResult(
    featureId: string,
    handoffPackage: HandoffPackage,
    iteration: number,
  ): AsyncIterable<AgentEvent> {
    if (this.verificationGate.isAllPassed(featureId)) {
      this.progressTracker.updateStatus(featureId, 'complete');
      this.logger.info('기능 구현 완료 — documenter 트리거', { featureId, iterations: iteration });
      yield* spawnDocumenter(
        this.agentGenerator,
        this.agentSpawner,
        this.logger,
        featureId,
        handoffPackage,
      );
      yield createEvent('done', `기능 '${featureId}' 구현 완료`);
      return;
    }

    // WHY: VERIFY 실패 시 실패 분석 후 롤백
    const report = this.failureHandler.classify(featureId, 'VERIFY', '4중 검증 실패');

    if (report.ok) {
      const recoveryPhase = this.failureHandler.getRecoveryPhase(report.value);
      const transition = this.phaseEngine.transition(
        recoveryPhase,
        `검증 실패 롤백: ${report.value.type}`,
        'adev',
      );

      if (transition.ok) {
        this.logger.warn('검증 실패 — Phase 롤백', {
          featureId,
          from: 'VERIFY',
          to: recoveryPhase,
          failureType: report.value.type,
        });
        yield createEvent('message', `검증 실패. ${recoveryPhase} Phase로 롤백합니다.`);
      }
    }
  }

  /**
   * 순방향 Phase 전환을 수행한다 / Advances to the next phase
   *
   * @param featureId - 기능 ID / Feature ID
   * @param currentPhase - 현재 Phase / Current phase
   */
  private advancePhase(featureId: string, currentPhase: Phase): void {
    const nextPhase = getNextPhase(currentPhase);
    if (nextPhase) {
      const transition = this.phaseEngine.transition(
        nextPhase,
        `${currentPhase} Phase 완료`,
        'adev',
      );

      if (transition.ok) {
        this.progressTracker.updatePhase(featureId, nextPhase);
        updateStatusForPhase(this.progressTracker, featureId, nextPhase);
      }
    }
  }
}
