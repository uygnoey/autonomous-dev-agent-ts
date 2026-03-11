/**
 * 팀 리더 헬퍼 함수 / Team Leader helper functions
 *
 * @description
 * KR: TeamLeader의 private 메서드를 독립 함수로 추출한 헬퍼 모듈.
 *     각 함수는 필요한 의존성만 파라미터로 받아 단일 책임 원칙을 따른다.
 * EN: Helper module extracted from TeamLeader private methods as standalone functions.
 *     Each function receives only the deps it needs, following single responsibility.
 */

import type { Logger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { GitBranchManager } from 'layer2/git-branch-manager.js';
import type { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { AgentEvent } from 'layer2/types.js';
import type { RagSearcher } from 'rag/search.js';

/** executePhase에 필요한 의존성 / Deps needed by executePhase */
export interface ExecutePhaseDeps {
  readonly phaseEngine: PhaseEngine;
  readonly tokenMonitor: TokenMonitor;
  readonly agentGenerator: AgentGenerator;
  readonly sessionManager: SessionManager;
  readonly agentSpawner: AgentSpawner;
  readonly streamMonitor: StreamMonitor;
  readonly logger: Logger;
  readonly ragSearcher?: RagSearcher;
}

/**
 * Phase를 실행한다 / Executes a phase
 *
 * @param deps - 의존성 / Dependencies
 * @param phase - 실행할 Phase / Phase to execute
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executePhase(
  deps: ExecutePhaseDeps,
  phase: Phase,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  const participants = deps.phaseEngine.getParticipants(phase);
  const allAgents = [...participants.lead, ...participants.active];

  for (const agentName of allAgents) {
    // WHY: 스로틀링 확인
    if (deps.tokenMonitor.shouldThrottleSpawn()) {
      deps.logger.warn('스폰 스로틀링 적용', { agent: agentName });
      yield createEvent('message', `토큰 부족으로 ${agentName} 스폰 지연`);
      continue;
    }

    // WHY: RAG 검색으로 과거 설계 결정 / 실패 이력을 컨텍스트로 주입
    const ragContext = await queryRagContext(deps.ragSearcher, featureId, agentName);

    const configResult = deps.agentGenerator.generateAgentConfig(
      agentName,
      handoffPackage.specDocument,
      featureId,
      ragContext,
    );

    if (!configResult.ok) {
      deps.logger.error('에이전트 설정 생성 실패', {
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
    deps.sessionManager.createSession(agentName, config.projectId, featureId, phase);

    // WHY: 에이전트 스폰 및 이벤트 전달
    for await (const event of deps.agentSpawner.spawn(config)) {
      // WHY: 스트림 모니터에 이벤트 전달
      deps.streamMonitor.onEvent({
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

/** executeCodePhase에 필요한 의존성 / Deps needed by executeCodePhase */
export interface ExecuteCodePhaseDeps extends ExecutePhaseDeps {
  readonly coderAllocator: CoderAllocator;
  readonly parallelCoderRunner?: ParallelCoderRunner;
  readonly gitBranchManager?: GitBranchManager;
}

/**
 * CODE Phase를 실행한다 / Executes the CODE phase
 *
 * @description
 * KR: parallelCoderRunner가 주입된 경우 병렬 Coder를 실행하고 각 브랜치를 병합한다.
 *     parallelCoderRunner가 없으면 단일 순차 실행으로 폴백한다.
 * EN: Runs parallel coders when parallelCoderRunner is injected and merges each branch.
 *     Falls back to single sequential execution when parallelCoderRunner is absent.
 *
 * @param deps - CODE Phase 의존성 / CODE phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeCodePhase(
  deps: ExecuteCodePhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  if (!deps.parallelCoderRunner) {
    // WHY: parallelCoderRunner 미주입 시 단일 순차 실행으로 폴백
    yield* executePhase(deps, 'CODE', featureId, handoffPackage);
    return;
  }

  // 병렬 Coder 실행
  yield* deps.parallelCoderRunner.runParallel(featureId, handoffPackage);

  // WHY: 병렬 실행 완료 후 각 coder 브랜치를 main에 병합
  if (deps.gitBranchManager) {
    const activeAllocations = deps.coderAllocator.getActiveAllocations();
    for (const allocation of activeAllocations) {
      yield* deps.gitBranchManager.mergeBranch(allocation.branchName);
      deps.coderAllocator.mergeAllocation(allocation.coderId);
    }
  }
}

/**
 * documenter 에이전트를 스폰한다 / Spawns the documenter agent
 *
 * @description
 * KR: VERIFY 통과 후 자동으로 문서화를 트리거한다.
 *     설정 생성 실패 시 경고만 남기고 문서화는 생략한다.
 * EN: Automatically triggers documentation after VERIFY passes.
 *     On config failure, warns and skips documentation.
 *
 * @param agentGenerator - 에이전트 설정 생성기 / Agent config generator
 * @param agentSpawner - 에이전트 스포너 / Agent spawner
 * @param logger - 로거 / Logger
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* spawnDocumenter(
  agentGenerator: AgentGenerator,
  agentSpawner: AgentSpawner,
  logger: Logger,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  const configResult = agentGenerator.generateAgentConfig(
    'documenter',
    handoffPackage.specDocument,
    featureId,
  );

  if (!configResult.ok) {
    logger.warn('documenter 설정 생성 실패 — 문서화 생략', {
      featureId,
      error: configResult.error.message,
    });
    return;
  }

  const config = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'VERIFY' as const,
  };

  logger.info('documenter 트리거 — 문서화 시작', { featureId });
  for await (const event of agentSpawner.spawn(config)) {
    yield event;
  }
  logger.info('documenter 완료', { featureId });
}

/**
 * RAG 검색으로 컨텍스트를 조회한다 / Queries RAG context
 *
 * @description
 * KR: RAG 검색 실패해도 에이전트 실행은 계속된다.
 *     ragSearcher가 없으면 undefined를 반환한다.
 * EN: Agent execution continues even if RAG search fails.
 *     Returns undefined if ragSearcher is not provided.
 *
 * @param ragSearcher - RAG 검색기 (선택) / RAG searcher (optional)
 * @param featureId - 기능 ID / Feature ID
 * @param agentName - 에이전트 이름 / Agent name
 * @returns RAG 컨텍스트 문자열 또는 undefined / RAG context string or undefined
 */
export async function queryRagContext(
  ragSearcher: RagSearcher | undefined,
  featureId: string,
  agentName: string,
): Promise<string | undefined> {
  if (!ragSearcher) return undefined;
  try {
    const query = `${featureId} ${agentName}`;
    const result = await ragSearcher.searchCode(query, 5);
    if (!result.ok || result.value.length === 0) return undefined;
    // WHY: SearchResult 배열을 읽기 쉬운 컨텍스트 문자열로 변환
    return result.value
      .map((r, i) => `[${i + 1}] ${r.record.filePath}\n${r.record.chunk}`)
      .join('\n\n');
  } catch {
    // WHY: RAG 검색 실패해도 에이전트 실행은 계속
    return undefined;
  }
}

/**
 * 다음 Phase를 반환한다 / Returns next phase
 *
 * @param current - 현재 Phase / Current phase
 * @returns 다음 Phase 또는 null / Next phase or null
 */
export function getNextPhase(current: Phase): Phase | null {
  const order: readonly Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
  const currentIndex = order.indexOf(current);
  if (currentIndex < 0 || currentIndex >= order.length - 1) return null;
  return order[currentIndex + 1] ?? null;
}

/**
 * Phase에 맞는 상태를 설정한다 / Sets status matching the phase
 *
 * @param progressTracker - 진행률 추적기 / Progress tracker
 * @param featureId - 기능 ID / Feature ID
 * @param phase - Phase / Phase
 */
export function updateStatusForPhase(
  progressTracker: ProgressTracker,
  featureId: string,
  phase: Phase,
): void {
  const statusMap: Readonly<Record<Phase, 'designing' | 'coding' | 'testing' | 'verifying'>> = {
    DESIGN: 'designing',
    CODE: 'coding',
    TEST: 'testing',
    VERIFY: 'verifying',
  };
  progressTracker.updateStatus(featureId, statusMap[phase]);
}

/**
 * 이벤트를 생성한다 / Creates an agent event
 *
 * @param type - 이벤트 유형 / Event type
 * @param content - 이벤트 내용 / Event content
 * @returns AgentEvent
 */
export function createEvent(type: AgentEvent['type'], content: string): AgentEvent {
  return {
    type,
    agentName: 'architect',
    content,
    timestamp: new Date(),
  };
}
