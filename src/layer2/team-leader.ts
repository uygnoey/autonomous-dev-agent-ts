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
  executeTestPhase,
  executeVerifyPhase,
} from 'layer2/team-leader-helpers.js';
import {
  advancePhase,
  handleVerifyResult,
  spawnDocumenterOnPhaseBoundary,
} from 'layer2/team-leader-phase.js';
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
 * 각 Phase당 최대 재시도 횟수 / Maximum retries per phase
 *
 * @description
 * KR: PI-002 — §8.3 이상 패턴 감지로 인한 Phase 재실행이 이 값을 초과하면 자율 개발을 중단한다.
 * EN: PI-002 — Autonomous development stops when anomaly-driven phase retries exceed this threshold.
 */
const MAX_PHASE_RETRIES = 3;

/**
 * TeamLeader 인터페이스 / TeamLeader interface
 *
 * @description
 * KR: 기능 구현 오케스트레이션을 위한 인터페이스.
 * EN: Interface for orchestrating feature implementation.
 */
export interface ITeamLeader {
  /**
   * 기능 구현을 오케스트레이션한다 / Orchestrates feature implementation
   *
   * @param featureId - 기능 ID / Feature ID
   * @param handoffPackage - layer1 인수 패키지 / Handoff package from layer1
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  executeFeature(featureId: string, handoffPackage: HandoffPackage): AsyncIterable<AgentEvent>;

  /**
   * 현재 상태를 반환한다 / Returns current status
   */
  getStatus(): { featureId: string | null; phase: Phase; progress: number };
}

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
export class TeamLeader implements ITeamLeader {
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
  private readonly userCheckpoint: TeamLeaderDeps['userCheckpoint'];
  private readonly userInputProvider: TeamLeaderDeps['userInputProvider'];
  private readonly projectPath: TeamLeaderDeps['projectPath'];
  private readonly modifiedFiles: TeamLeaderDeps['modifiedFiles'];
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
    this.userCheckpoint = deps.userCheckpoint;
    this.userInputProvider = deps.userInputProvider;
    this.projectPath = deps.projectPath;
    this.modifiedFiles = deps.modifiedFiles;
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
    // WHY: 이전 feature의 Phase 상태가 잔류하지 않도록 초기화
    //      동일 PhaseEngine 인스턴스를 재사용하므로 feature 간 reset 필수
    this.phaseEngine.reset();
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
      let phaseRetryCount = 0;
      let lastPhase: Phase | null = null;

      while (iteration < MAX_ITERATIONS) {
        iteration += 1;
        const currentPhase = this.phaseEngine.currentPhase;

        // WHY: PI-002 — Phase가 변경되면 재시도 카운터 초기화
        if (lastPhase !== null && lastPhase !== currentPhase) {
          phaseRetryCount = 0;
        }
        lastPhase = currentPhase;

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
              projectPath: this.projectPath,
              modifiedFiles: this.modifiedFiles,
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
        } else if (currentPhase === 'TEST') {
          // WHY: PI-002 — TEST Phase는 Unit→Module→E2E 3단계 순차 실행으로 직접 제어한다
          yield* executeTestPhase(
            {
              phaseEngine: this.phaseEngine,
              tokenMonitor: this.tokenMonitor,
              agentGenerator: this.agentGenerator,
              sessionManager: this.sessionManager,
              agentSpawner: this.agentSpawner,
              streamMonitor: this.streamMonitor,
              logger: this.logger,
              ragSearcher: this.ragSearcher,
              failureHandler: this.failureHandler,
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

        // WHY: PI-001 — CODE/TEST/VERIFY Phase 실행 후 이상 패턴 감지 시 재spawn
        //      DESIGN Phase는 executePhase()에서 자체 처리하므로 제외
        if (currentPhase !== 'DESIGN') {
          const anomalyAlerts = this.streamMonitor.detectAnomalies();
          const highAlerts = anomalyAlerts.filter((a) => a.severity === 'high');
          if (highAlerts.length > 0) {
            this.logger.warn('이상 패턴 감지 — 현재 Phase 재실행', {
              phase: currentPhase,
              featureId,
              alertCount: highAlerts.length,
            });
            // WHY: PI-002 — Phase 재실행 임계값 초과 시 명시적 중단
            phaseRetryCount += 1;
            if (phaseRetryCount > MAX_PHASE_RETRIES) {
              this.logger.error('Phase 재시도 임계값 초과 — 자율 개발 중단', {
                featureId,
                phase: currentPhase,
                maxRetries: MAX_PHASE_RETRIES,
              });
              this.progressTracker.updateStatus(featureId, 'failed');
              yield createEvent(
                'error',
                `[크리티컬] ${currentPhase} Phase ${MAX_PHASE_RETRIES}회 재시도 실패. 수동 개입 필요.`,
              );
              return;
            }

            const warningMessage = `[경고] 이상 패턴 감지 (${highAlerts.map((a) => a.type).join(', ')}) — ${currentPhase} Phase 재실행 (${phaseRetryCount}/${MAX_PHASE_RETRIES})`;
            yield createEvent('message', warningMessage);

            // WHY: PI-005 — §12 비크리티컬 이슈 배치 수집. 경고를 큐에 적재
            if (this.userCheckpoint) {
              this.userCheckpoint.queueNormalIssue(warningMessage);
            }

            // WHY: Phase를 재실행하기 위해 advancePhase 건너뜀
            continue;
          }

          // WHY: L-001 — biasDetector가 주입됐으나 미사용 상태였음. streamMonitor 이상 미감지 시에도
          //      편향(확인 편향, 무한 루프, 교착, 범위 이탈) 분석을 별도로 수행
          const biasEvents = this.streamMonitor.getEventHistory();
          const agentNames = [...new Set(biasEvents.map((e) => e.agentName))];
          for (const agent of agentNames) {
            const biasResult = this.biasDetector.analyze(biasEvents, agent);
            if (biasResult.ok) {
              const highBiasAlerts = biasResult.value.filter((a) => a.severity === 'high');
              if (highBiasAlerts.length > 0) {
                this.logger.warn('BiasDetector HIGH 이상 감지', {
                  agentName: agent,
                  featureId,
                  alerts: highBiasAlerts.map((a) => ({ type: a.type, description: a.description })),
                });
              }
            }
          }
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
              userCheckpoint: this.userCheckpoint,
              userInputProvider: this.userInputProvider,
            },
            featureId,
            handoffPackage,
            iteration,
          );
          // WHY: handleVerifyResult에서 유저 revise/revise_integration 시 Phase 전환 후 return
          //      approve 시 isAllPassed는 여전히 true이고 done 이벤트가 yield된다
          if (
            this.verificationGate.isAllPassed(featureId) &&
            this.phaseEngine.currentPhase === 'VERIFY'
          ) {
            // WHY: PI-005 — VERIFY 완료 후 배치 수집된 비크리티컬 이슈를 일괄 출력
            if (this.userCheckpoint && this.userInputProvider) {
              this.userCheckpoint.flushQueuedIssues(this.userInputProvider);
            }
            return;
          }
        } else {
          const advanceResult = advancePhase(
            { phaseEngine: this.phaseEngine, progressTracker: this.progressTracker },
            featureId,
            currentPhase,
          );

          // WHY: M-001 — Phase 경계 전환 시 documenter spawn (§7.3 스펙 요구사항)
          if (advanceResult.advanced && advanceResult.toPhase !== null) {
            yield* spawnDocumenterOnPhaseBoundary(
              {
                phaseEngine: this.phaseEngine,
                progressTracker: this.progressTracker,
                failureHandler: this.failureHandler,
                verificationGate: this.verificationGate,
                agentGenerator: this.agentGenerator,
                agentSpawner: this.agentSpawner,
                logger: this.logger,
                userCheckpoint: this.userCheckpoint,
                userInputProvider: this.userInputProvider,
              },
              featureId,
              handoffPackage,
              advanceResult.fromPhase,
              advanceResult.toPhase,
            );
          }
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
