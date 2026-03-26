/**
 * Phase별 실행 분기 로직 / Phase dispatch logic
 *
 * @description
 * KR: M-R1 — team-leader.ts에서 추출된 Phase별 실행 분기 함수.
 *     각 Phase에 맞는 실행 함수로 라우팅한다.
 * EN: M-R1 — Phase dispatch function extracted from team-leader.ts.
 *     Routes to the correct executor for each phase.
 */

import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import { executeDesignPhaseWithMonitoring } from 'layer2/team-leader-design-phase.js';
import {
  executeCodePhase,
  executePhase,
  executeTestPhase,
  executeVerifyPhase,
} from 'layer2/team-leader-helpers.js';
import type { TeamLeaderDeps } from 'layer2/team-leader-types.js';
import type { AgentEvent } from 'layer2/types.js';

/** executeCurrentPhase에 필요한 deps 부분 집합 / Subset of deps needed by executeCurrentPhase */
export interface PhaseDispatchDeps {
  readonly phaseEngine: TeamLeaderDeps['phaseEngine'];
  readonly tokenMonitor: TeamLeaderDeps['tokenMonitor'];
  readonly agentGenerator: TeamLeaderDeps['agentGenerator'];
  readonly sessionManager: TeamLeaderDeps['sessionManager'];
  readonly agentSpawner: TeamLeaderDeps['agentSpawner'];
  readonly streamMonitor: TeamLeaderDeps['streamMonitor'];
  readonly logger: TeamLeaderDeps['logger'];
  readonly ragSearcher: TeamLeaderDeps['ragSearcher'];
  readonly verificationGate: TeamLeaderDeps['verificationGate'];
  readonly integrationTester: TeamLeaderDeps['integrationTester'];
  readonly layer1Verifier: TeamLeaderDeps['layer1Verifier'];
  readonly projectPath: TeamLeaderDeps['projectPath'];
  readonly modifiedFiles: TeamLeaderDeps['modifiedFiles'];
  readonly coderAllocator: TeamLeaderDeps['coderAllocator'];
  readonly parallelCoderRunner: TeamLeaderDeps['parallelCoderRunner'];
  readonly gitBranchManager: TeamLeaderDeps['gitBranchManager'];
  readonly failureHandler: TeamLeaderDeps['failureHandler'];
  readonly sessionExecutor: TeamLeaderDeps['sessionExecutor'];
  readonly ipcPoller: TeamLeaderDeps['ipcPoller'];
}

/**
 * 현재 Phase에 맞는 실행 로직을 분기한다 / Dispatches to the correct phase executor
 *
 * @param deps - Phase 실행 의존성 / Phase execution dependencies
 * @param currentPhase - 현재 Phase / Current phase
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeCurrentPhase(
  deps: PhaseDispatchDeps,
  currentPhase: Phase,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  if (currentPhase === 'VERIFY') {
    yield* executeVerifyPhase(
      {
        phaseEngine: deps.phaseEngine,
        tokenMonitor: deps.tokenMonitor,
        agentGenerator: deps.agentGenerator,
        sessionManager: deps.sessionManager,
        agentSpawner: deps.agentSpawner,
        streamMonitor: deps.streamMonitor,
        logger: deps.logger,
        ragSearcher: deps.ragSearcher,
        verificationGate: deps.verificationGate,
        integrationTester: deps.integrationTester,
        layer1Verifier: deps.layer1Verifier,
        projectPath: deps.projectPath,
        modifiedFiles: deps.modifiedFiles,
      },
      featureId,
      handoffPackage,
    );
  } else if (currentPhase === 'CODE') {
    yield* executeCodePhase(
      {
        phaseEngine: deps.phaseEngine,
        tokenMonitor: deps.tokenMonitor,
        agentGenerator: deps.agentGenerator,
        sessionManager: deps.sessionManager,
        agentSpawner: deps.agentSpawner,
        streamMonitor: deps.streamMonitor,
        logger: deps.logger,
        ragSearcher: deps.ragSearcher,
        coderAllocator: deps.coderAllocator,
        parallelCoderRunner: deps.parallelCoderRunner,
        gitBranchManager: deps.gitBranchManager,
        // WHY: M-A2 — CODE Phase 완료 후 수정 파일 목록 갱신 (계단식 차등 테스트용)
        modifiedFiles: deps.modifiedFiles as { paths: string[] } | undefined,
      },
      featureId,
      handoffPackage,
    );
  } else if (currentPhase === 'TEST') {
    // WHY: PI-002 — TEST Phase는 Unit→Module→E2E 3단계 순차 실행으로 직접 제어한다
    yield* executeTestPhase(
      {
        phaseEngine: deps.phaseEngine,
        tokenMonitor: deps.tokenMonitor,
        agentGenerator: deps.agentGenerator,
        sessionManager: deps.sessionManager,
        agentSpawner: deps.agentSpawner,
        streamMonitor: deps.streamMonitor,
        logger: deps.logger,
        ragSearcher: deps.ragSearcher,
        failureHandler: deps.failureHandler,
      },
      featureId,
      handoffPackage,
    );
  } else if (currentPhase === 'DESIGN') {
    // WHY: H-A1 — DESIGN Phase는 executeDesignPhaseWithMonitoring() 사용
    if (deps.sessionExecutor && deps.ipcPoller) {
      yield* executeDesignPhaseWithMonitoring(
        {
          sessionExecutor: deps.sessionExecutor,
          streamMonitor: deps.streamMonitor,
          ipcPoller: deps.ipcPoller,
          agentGenerator: deps.agentGenerator,
          logger: deps.logger,
          ragSearcher: deps.ragSearcher,
        },
        featureId,
        handoffPackage,
      );
    } else {
      // WHY: sessionExecutor 미주입 시 일반 실행 fallback
      yield* executePhase(
        {
          phaseEngine: deps.phaseEngine,
          tokenMonitor: deps.tokenMonitor,
          agentGenerator: deps.agentGenerator,
          sessionManager: deps.sessionManager,
          agentSpawner: deps.agentSpawner,
          streamMonitor: deps.streamMonitor,
          logger: deps.logger,
          ragSearcher: deps.ragSearcher,
        },
        'DESIGN',
        featureId,
        handoffPackage,
      );
    }
  } else {
    yield* executePhase(
      {
        phaseEngine: deps.phaseEngine,
        tokenMonitor: deps.tokenMonitor,
        agentGenerator: deps.agentGenerator,
        sessionManager: deps.sessionManager,
        agentSpawner: deps.agentSpawner,
        streamMonitor: deps.streamMonitor,
        logger: deps.logger,
        ragSearcher: deps.ragSearcher,
      },
      currentPhase,
      featureId,
      handoffPackage,
    );
  }
}
