/**
 * 팀 리더 (메인 오케스트레이터) / Team Leader (Main Orchestrator)
 *
 * @description
 * KR: 4-Phase 루프를 구동하여 기능 구현을 오케스트레이션한다.
 *     Phase 처리 로직은 team-leader-phase.ts에 분리.
 * EN: Drives the 4-phase loop to orchestrate feature implementation.
 *     Phase handling logic is separated into team-leader-phase.ts.
 */

import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { IpcPoller } from 'layer2/ipc-poller.js';
import type { SessionRestoreOrchestrator } from 'layer2/session-restore-orchestrator.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import {
  createEvent,
  executeCodePhase,
  executePhase,
  executeVerifyPhase,
} from 'layer2/team-leader-helpers.js';
import { advancePhase, handleVerifyResult } from 'layer2/team-leader-phase.js';
import type { TeamLeaderDeps } from 'layer2/team-leader-types.js';
import { runTokenWaitLoop } from 'layer2/token-wait-loop.js';
import type { AgentEvent } from 'layer2/types.js';

// Re-export for external consumers
export type { TeamLeaderDeps } from 'layer2/team-leader-types.js';

/**
 * 최대 Phase 루프 반복 횟수 / Maximum phase loop iterations
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
  private readonly sessionSnapshotStore: SessionSnapshotStore | undefined;
  private readonly sessionRestoreOrchestrator: SessionRestoreOrchestrator | undefined;
  private readonly ipcPoller: IpcPoller | undefined;
  private readonly parallelCoderRunner: TeamLeaderDeps['parallelCoderRunner'];
  private readonly gitBranchManager: TeamLeaderDeps['gitBranchManager'];
  private readonly layer1Verifier: TeamLeaderDeps['layer1Verifier'];
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
    this.sessionSnapshotStore = deps.sessionSnapshotStore;
    this.sessionRestoreOrchestrator = deps.sessionRestoreOrchestrator;
    this.ipcPoller = deps.ipcPoller;
    this.parallelCoderRunner = deps.parallelCoderRunner;
    this.gitBranchManager = deps.gitBranchManager;
    this.layer1Verifier = deps.layer1Verifier;
  }

  /**
   * 기능 구현을 오케스트레이션한다 / Orchestrates feature implementation
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

    // WHY: IpcPoller가 주입됐을 때만 시작 — 팀 메시지 및 태스크 이벤트 감지
    this.ipcPoller?.start((event) => {
      this.logger.debug('IPC 이벤트 수신', { type: event.type });
    });

    try {
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration += 1;
        const currentPhase = this.phaseEngine.currentPhase;

        this.logger.info('Phase 실행', { featureId, phase: currentPhase, iteration });

        // WHY: 토큰 부족 시 단순 중단 대신 세션 저장 후 대기 → 복원 루프 실행
        if (this.tokenMonitor.shouldPauseAll()) {
          if (
            this.sessionSnapshotStore !== undefined &&
            this.sessionRestoreOrchestrator !== undefined
          ) {
            this.logger.warn('토큰 한도 도달 — 세션 대기 루프 시작', { featureId });
            yield* runTokenWaitLoop(
              {
                tokenMonitor: this.tokenMonitor,
                sessionManager: this.sessionManager,
                sessionSnapshotStore: this.sessionSnapshotStore,
                sessionRestoreOrchestrator: this.sessionRestoreOrchestrator,
                logger: this.logger,
              },
              featureId,
              handoffPackage.projectId,
            );
          } else {
            this.logger.error('토큰 부족으로 실행 일시 정지', { featureId });
            yield createEvent('error', '토큰 리밋 도달로 실행 일시 정지');
            return;
          }
        }

        if (currentPhase === 'VERIFY') {
          yield* executeVerifyPhase(
            {
              phaseEngine: this.phaseEngine,
              tokenMonitor: this.tokenMonitor,
              agentGenerator: this.agentGenerator,
              sessionManager: this.sessionManager,
              agentSpawner: this.agentSpawner,
              streamMonitor: this.streamMonitor,
              logger: this.logger,
              ragSearcher: this.ragSearcher,
              verificationGate: this.verificationGate,
              integrationTester: this.integrationTester,
              layer1Verifier: this.layer1Verifier,
            },
            featureId,
            handoffPackage,
          );
        } else if (currentPhase === 'CODE') {
          yield* executeCodePhase(
            {
              phaseEngine: this.phaseEngine,
              tokenMonitor: this.tokenMonitor,
              agentGenerator: this.agentGenerator,
              sessionManager: this.sessionManager,
              agentSpawner: this.agentSpawner,
              streamMonitor: this.streamMonitor,
              logger: this.logger,
              ragSearcher: this.ragSearcher,
              coderAllocator: this.coderAllocator,
              parallelCoderRunner: this.parallelCoderRunner,
              gitBranchManager: this.gitBranchManager,
            },
            featureId,
            handoffPackage,
          );
        } else {
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
        }

        if (currentPhase === 'VERIFY') {
          yield* handleVerifyResult(
            {
              phaseEngine: this.phaseEngine,
              progressTracker: this.progressTracker,
              failureHandler: this.failureHandler,
              verificationGate: this.verificationGate,
              agentGenerator: this.agentGenerator,
              agentSpawner: this.agentSpawner,
              logger: this.logger,
            },
            featureId,
            handoffPackage,
            iteration,
          );
          if (this.verificationGate.isAllPassed(featureId)) return;
        } else {
          advancePhase(
            { phaseEngine: this.phaseEngine, progressTracker: this.progressTracker },
            featureId,
            currentPhase,
          );
        }
      }

      this.logger.error('최대 반복 횟수 초과', { featureId, maxIterations: MAX_ITERATIONS });
      this.progressTracker.updateStatus(featureId, 'failed');
      yield createEvent('error', `최대 반복 횟수(${MAX_ITERATIONS}) 초과로 중단`);
    } finally {
      // WHY: 정상 종료, 에러, return 모두 IpcPoller를 중단
      this.ipcPoller?.stop();
    }
  }

  /**
   * 현재 상태를 반환한다 / Returns current status
   */
  getStatus(): { featureId: string | null; phase: Phase; progress: number } {
    return {
      featureId: this.currentFeatureId,
      phase: this.phaseEngine.currentPhase,
      progress: this.progressTracker.getOverallCompletion(),
    };
  }
}
