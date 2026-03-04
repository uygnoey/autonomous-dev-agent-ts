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

import type { Logger } from '../core/logger.js';
import type { Phase } from '../core/types.js';
import type { HandoffPackage } from '../layer1/types.js';
import type { AgentGenerator } from './agent-generator.js';
import type { AgentSpawner } from './agent-spawner.js';
import type { BiasDetector } from './bias-detector.js';
import type { CoderAllocator } from './coder-allocator.js';
import type { FailureHandler } from './failure-handler.js';
import type { IntegrationTester } from './integration-tester.js';
import type { PhaseEngine } from './phase-engine.js';
import type { ProgressTracker } from './progress-tracker.js';
import type { SessionManager } from './session-manager.js';
import type { StreamMonitor } from './stream-monitor.js';
import type { TokenMonitor } from './token-monitor.js';
import type { AgentEvent } from './types.js';
import type { VerificationGate } from './verification-gate.js';

/**
 * 최대 Phase 루프 반복 횟수 / Maximum phase loop iterations
 *
 * @description
 * KR: 무한 루프 방지를 위한 최대 반복 횟수.
 * EN: Maximum iterations to prevent infinite loops.
 */
const MAX_ITERATIONS = 10;

/**
 * 팀 리더 의존성 / Team Leader dependencies
 *
 * @description
 * KR: 생성자 주입을 위한 의존성 인터페이스.
 * EN: Dependency interface for constructor injection.
 */
export interface TeamLeaderDeps {
  readonly phaseEngine: PhaseEngine;
  readonly agentSpawner: AgentSpawner;
  readonly sessionManager: SessionManager;
  readonly tokenMonitor: TokenMonitor;
  readonly progressTracker: ProgressTracker;
  readonly agentGenerator: AgentGenerator;
  readonly coderAllocator: CoderAllocator;
  readonly streamMonitor: StreamMonitor;
  readonly biasDetector: BiasDetector;
  readonly failureHandler: FailureHandler;
  readonly verificationGate: VerificationGate;
  readonly integrationTester: IntegrationTester;
  readonly logger: Logger;
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
export class TeamLeader {
  private readonly phaseEngine: PhaseEngine;
  private readonly agentSpawner: AgentSpawner;
  private readonly sessionManager: SessionManager;
  private readonly tokenMonitor: TokenMonitor;
  private readonly progressTracker: ProgressTracker;
  private readonly agentGenerator: AgentGenerator;
  private readonly coderAllocator: CoderAllocator;
  private readonly streamMonitor: StreamMonitor;
  private readonly biasDetector: BiasDetector;
  private readonly failureHandler: FailureHandler;
  private readonly verificationGate: VerificationGate;
  private readonly integrationTester: IntegrationTester;
  private readonly logger: Logger;
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

      this.logger.info('Phase 실행', {
        featureId,
        phase: currentPhase,
        iteration,
      });

      // WHY: 토큰 모니터를 확인하여 리소스 부족 시 중단
      if (this.tokenMonitor.shouldPauseAll()) {
        this.logger.error('토큰 부족으로 실행 일시 정지', { featureId });
        yield this.createEvent('error', '토큰 리밋 도달로 실행 일시 정지');
        return;
      }

      yield* this.executePhase(currentPhase, featureId, handoffPackage);

      // WHY: VERIFY 완료 후 검증 통과 여부 확인
      if (currentPhase === 'VERIFY') {
        if (this.verificationGate.isAllPassed(featureId)) {
          this.progressTracker.updateStatus(featureId, 'complete');
          this.logger.info('기능 구현 완료', { featureId, iterations: iteration });
          yield this.createEvent('done', `기능 '${featureId}' 구현 완료`);
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
            yield this.createEvent('message', `검증 실패. ${recoveryPhase} Phase로 롤백합니다.`);
          }
        }
      } else {
        // WHY: 순방향 Phase 전환
        const nextPhase = this.getNextPhase(currentPhase);
        if (nextPhase) {
          const transition = this.phaseEngine.transition(
            nextPhase,
            `${currentPhase} Phase 완료`,
            'adev',
          );

          if (transition.ok) {
            this.progressTracker.updatePhase(featureId, nextPhase);
            this.updateStatusForPhase(featureId, nextPhase);
          }
        }
      }
    }

    this.logger.error('최대 반복 횟수 초과', { featureId, maxIterations: MAX_ITERATIONS });
    this.progressTracker.updateStatus(featureId, 'failed');
    yield this.createEvent('error', `최대 반복 횟수(${MAX_ITERATIONS}) 초과로 중단`);
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
   * Phase를 실행한다 / Executes a phase
   *
   * @param phase - 실행할 Phase / Phase to execute
   * @param featureId - 기능 ID / Feature ID
   * @param handoffPackage - 인수 패키지 / Handoff package
   */
  private async *executePhase(
    phase: Phase,
    featureId: string,
    handoffPackage: HandoffPackage,
  ): AsyncIterable<AgentEvent> {
    const participants = this.phaseEngine.getParticipants(phase);
    const allAgents = [...participants.lead, ...participants.active];

    for (const agentName of allAgents) {
      // WHY: 스로틀링 확인
      if (this.tokenMonitor.shouldThrottleSpawn()) {
        this.logger.warn('스폰 스로틀링 적용', { agent: agentName });
        yield this.createEvent('message', `토큰 부족으로 ${agentName} 스폰 지연`);
        continue;
      }

      const configResult = this.agentGenerator.generateAgentConfig(
        agentName,
        handoffPackage.specDocument,
        featureId,
      );

      if (!configResult.ok) {
        this.logger.error('에이전트 설정 생성 실패', {
          agent: agentName,
          error: configResult.error.message,
        });
        continue;
      }

      const config = {
        ...configResult.value,
        projectId: handoffPackage.projectId,
        phase,
      };

      // WHY: 세션 생성
      this.sessionManager.createSession(agentName, config.projectId, featureId, phase);

      // WHY: 에이전트 스폰 및 이벤트 전달
      for await (const event of this.agentSpawner.spawn(config)) {
        // WHY: 스트림 모니터에 이벤트 전달
        this.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        yield event;
      }
    }
  }

  /**
   * 다음 Phase를 반환한다 / Returns next phase
   *
   * @param current - 현재 Phase / Current phase
   * @returns 다음 Phase 또는 null / Next phase or null
   */
  private getNextPhase(current: Phase): Phase | null {
    const order: readonly Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    const currentIndex = order.indexOf(current);
    if (currentIndex < 0 || currentIndex >= order.length - 1) return null;
    return order[currentIndex + 1] ?? null;
  }

  /**
   * Phase에 맞는 상태를 설정한다 / Sets status matching the phase
   *
   * @param featureId - 기능 ID / Feature ID
   * @param phase - Phase / Phase
   */
  private updateStatusForPhase(featureId: string, phase: Phase): void {
    const statusMap: Readonly<Record<Phase, 'designing' | 'coding' | 'testing' | 'verifying'>> = {
      DESIGN: 'designing',
      CODE: 'coding',
      TEST: 'testing',
      VERIFY: 'verifying',
    };
    this.progressTracker.updateStatus(featureId, statusMap[phase]);
  }

  /**
   * 이벤트를 생성한다 / Creates an event
   *
   * @param type - 이벤트 유형 / Event type
   * @param content - 이벤트 내용 / Event content
   * @returns AgentEvent
   */
  private createEvent(type: AgentEvent['type'], content: string): AgentEvent {
    return {
      type,
      agentName: 'architect',
      content,
      timestamp: new Date(),
    };
  }
}
