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
import type { IpcPoller } from 'layer2/ipc-poller.js';
import type { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { DocumenterEventType } from 'layer2/documenter-event-types.js';
import type { AgentEvent } from 'layer2/types.js';
import type { V2SessionExecutor } from 'layer2/v2-session-executor.js';
import type { RagSearcher } from 'rag/search.js';

// WHY: VERIFY Phase 로직은 300줄 제한 준수를 위해 별도 파일로 분리
export { executeVerifyPhase } from 'layer2/team-leader-verify.js';
export type { ExecuteVerifyPhaseDeps } from 'layer2/team-leader-verify.js';

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
 *     코딩 완료 후 architect(스펙 준수 확인)와 reviewer(코드 품질 확인) 감독 세션을 실행한다.
 * EN: Runs parallel coders when parallelCoderRunner is injected and merges each branch.
 *     Falls back to single sequential execution when parallelCoderRunner is absent.
 *     After coding, runs architect (spec compliance) and reviewer (code quality) supervision.
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

    // WHY: 단일 순차 실행에서도 coder 작업 완료 후 커밋이 필요하다.
    //       이 커밋이 없으면 merge 시 변경사항이 누락되거나 git 이력이 init 1개뿐이 된다.
    if (deps.gitBranchManager) {
      yield* deps.gitBranchManager.commitChanges(
        `feat(${featureId}): CODE phase 완료`,
      );
    }

    // WHY: NI-007 — coder 수정 완료 시 documenter spawn (CHANGELOG 갱신)
    yield* spawnDocumenter(
      deps.agentGenerator,
      deps.agentSpawner,
      deps.logger,
      featureId,
      handoffPackage,
      { trigger: 'phase_boundary', context: { fromPhase: 'CODE', event: 'code_modified' } },
    );
    return;
  }

  // WHY: runParallel 내부에서 coder 병렬 실행 + architect/reviewer 감독 세션까지 수행
  yield* deps.parallelCoderRunner.runParallel(featureId, handoffPackage);

  // WHY: 병렬 실행 완료 후 각 coder 브랜치를 main에 병합
  if (deps.gitBranchManager) {
    const activeAllocations = deps.coderAllocator.getActiveAllocations();
    for (const allocation of activeAllocations) {
      // WHY: 병합 전 브랜치에 작업 내용을 커밋해야 merge가 가능하다
      yield* deps.gitBranchManager.commitChanges(
        `feat(${featureId}): ${allocation.coderId} CODE phase 완료`,
      );
      yield* deps.gitBranchManager.mergeBranch(allocation.branchName);
      deps.coderAllocator.mergeAllocation(allocation.coderId);
    }
  }

  // WHY: NI-007 — 병렬 coder 수정 완료 시 documenter spawn (CHANGELOG 갱신)
  yield* spawnDocumenter(
    deps.agentGenerator,
    deps.agentSpawner,
    deps.logger,
    featureId,
    handoffPackage,
    { trigger: 'phase_boundary', context: { fromPhase: 'CODE', event: 'code_modified' } },
  );
}

/**
 * documenter 트리거 컨텍스트 / Documenter trigger context
 *
 * @description
 * KR: documenter를 spawn할 때 어떤 이벤트로 트리거되었는지, 추가 컨텍스트를 전달한다.
 * EN: Provides trigger event type and additional context when spawning the documenter.
 */
export interface DocumenterTriggerContext {
  /** 트리거 이벤트 유형 / Trigger event type */
  readonly trigger: DocumenterEventType;
  /** 추가 컨텍스트 (트리거별 다름) / Additional context (varies by trigger) */
  readonly context?: Record<string, unknown>;
}

/**
 * documenter 에이전트를 스폰한다 / Spawns the documenter agent
 *
 * @description
 * KR: 5가지 이벤트에서 자동으로 문서화를 트리거한다.
 *     - feature_complete: 기능 완료 시 (VERIFY 통과 후)
 *     - test_executed: 테스트 실행 완료 시
 *     - bug_detected: 버그 발생 시 (qc 실패)
 *     - phase_boundary: Phase 전환 시
 *     - translation: 다국어 번역 요청 시
 *     설정 생성 실패 시 경고만 남기고 문서화는 생략한다.
 * EN: Automatically triggers documentation from 5 event types.
 *     On config failure, warns and skips documentation.
 *
 * @param agentGenerator - 에이전트 설정 생성기 / Agent config generator
 * @param agentSpawner - 에이전트 스포너 / Agent spawner
 * @param logger - 로거 / Logger
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param triggerContext - 트리거 컨텍스트 (선택) / Trigger context (optional, defaults to feature_complete)
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* spawnDocumenter(
  agentGenerator: AgentGenerator,
  agentSpawner: AgentSpawner,
  logger: Logger,
  featureId: string,
  handoffPackage: HandoffPackage,
  triggerContext?: DocumenterTriggerContext,
): AsyncIterable<AgentEvent> {
  const trigger = triggerContext?.trigger ?? 'feature_complete';

  // WHY: 트리거 유형에 따라 documenter에게 주입할 프롬프트를 구성한다
  const triggerPrompt = buildTriggerPrompt(trigger, featureId, triggerContext?.context);
  const specWithTrigger = `${handoffPackage.specDocument}\n\n${triggerPrompt}`;

  const configResult = agentGenerator.generateAgentConfig(
    'documenter',
    specWithTrigger,
    featureId,
  );

  if (!configResult.ok) {
    logger.warn('documenter 설정 생성 실패 — 문서화 생략', {
      featureId,
      trigger,
      error: configResult.error.message,
    });
    return;
  }

  const config = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'VERIFY' as const,
  };

  logger.info('documenter 트리거 — 문서화 시작', { featureId, trigger });
  for await (const event of agentSpawner.spawn(config)) {
    yield event;
  }
  logger.info('documenter 완료', { featureId, trigger });
}

/**
 * 트리거 유형에 따른 프롬프트 생성 / Build prompt based on trigger type
 *
 * @param trigger - 트리거 유형 / Trigger type
 * @param featureId - 기능 ID / Feature ID
 * @param context - 추가 컨텍스트 / Additional context
 * @returns 트리거 프롬프트 / Trigger prompt
 */
function buildTriggerPrompt(
  trigger: DocumenterEventType,
  featureId: string,
  context?: Record<string, unknown>,
): string {
  const contextStr = context
    ? Object.entries(context).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n')
    : '';

  switch (trigger) {
    case 'feature_complete':
      return [
        `[documenter 트리거: 기능 완료] featureId=${featureId}`,
        '생성할 문서: 기능 설명서, API 연동 정의서, 아키텍처 변경 이력',
        contextStr,
      ].join('\n');

    case 'test_executed':
      return [
        `[documenter 트리거: 테스트 실행 완료] featureId=${featureId}`,
        '생성할 문서: 테스트 결과서, 커버리지 리포트, 성능 벤치마크 리포트',
        contextStr,
      ].join('\n');

    case 'bug_detected':
      return [
        `[documenter 트리거: 버그 발생] featureId=${featureId}`,
        '생성할 문서: 버그 리포트 (재현 경로, 원인, 영향 범위), 수정 내역서, 회귀 테스트 결과',
        contextStr,
      ].join('\n');

    case 'phase_boundary':
      return [
        `[documenter 트리거: Phase 전환] featureId=${featureId}`,
        '생성할 문서: CHANGELOG, 의사결정 기록, 설계 변경 사유서, 코드 리뷰 결과 요약',
        contextStr,
      ].join('\n');

    case 'translation':
      return [
        `[documenter 트리거: 다국어 번역] featureId=${featureId}`,
        '생성할 문서: 기존 문서 다국어 번역 (기술 용어, 코드 예시, 구조 보존)',
        contextStr,
      ].join('\n');
  }
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

// ── DESIGN Phase 전용 실행 / DESIGN Phase Execution ────────────

/** executeDesignPhaseWithMonitoring에 필요한 의존성 */
export interface ExecuteDesignPhaseDeps {
  readonly sessionExecutor: V2SessionExecutor;
  readonly streamMonitor: StreamMonitor;
  readonly ipcPoller: IpcPoller;
  readonly agentGenerator: AgentGenerator;
  readonly logger: Logger;
  readonly ragSearcher?: RagSearcher;
  /** 모니터링 감지 주기 (ms, 기본 5000) / Monitoring detection interval */
  readonly monitorIntervalMs?: number;
}

/**
 * DESIGN Phase를 Agent Teams + Hook/IPC 모니터링과 함께 실행한다
 *
 * @description
 * KR: session.stream() 1개 + Agent Teams env로 architect/qa/coder/reviewer가 teammate로 실시간 토론한다.
 *     StreamMonitor + IpcPoller로 이상 감지 시 AbortController로 세션 중단 후 재spawn한다.
 * EN: Runs a single session.stream() with Agent Teams env for real-time discussion among
 *     architect/qa/coder/reviewer. StreamMonitor + IpcPoller detect anomalies and abort+respawn.
 *
 * @param deps - DESIGN Phase 의존성 / DESIGN phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param maxRetries - 이상 감지 시 재시도 횟수 (기본 2) / Max retries on anomaly (default 2)
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeDesignPhaseWithMonitoring(
  deps: ExecuteDesignPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  maxRetries = 2,
): AsyncGenerator<AgentEvent> {
  const ragContext = await queryRagContext(deps.ragSearcher, featureId, 'architect');

  const configResult = deps.agentGenerator.generateAgentConfig(
    'architect',
    handoffPackage.specDocument,
    featureId,
    ragContext,
  );

  if (!configResult.ok) {
    deps.logger.error('DESIGN Phase 에이전트 설정 생성 실패', {
      error: configResult.error.message,
    });
    yield createEvent('error', `DESIGN Phase 설정 생성 실패: ${configResult.error.message}`);
    return;
  }

  const config = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'DESIGN' as const,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const abortController = new AbortController();

    // WHY: StreamMonitor가 주기적으로 이상 감지 → abort 신호 전송
    deps.streamMonitor.startMonitoring(abortController, deps.monitorIntervalMs);

    // WHY: IpcPoller로 디스크 IPC 폴링 — 팀 메시지/태스크 상태 변경 감시
    deps.ipcPoller.start((event) => {
      deps.logger.debug('DESIGN Phase IPC 이벤트 수신', {
        type: event.type,
        featureId,
      });
    });

    try {
      let aborted = false;

      for await (const event of deps.sessionExecutor.executeDesignPhase(config, {
        featureId,
        handoff: handoffPackage,
        signal: abortController.signal,
      })) {
        // WHY: 스트림 모니터에 이벤트 전달
        deps.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        yield event;

        // WHY: abort로 인한 에러 이벤트는 재spawn 시도
        if (event.type === 'error' && abortController.signal.aborted) {
          aborted = true;
          break;
        }
      }

      if (!aborted) {
        // WHY: 정상 완료 시 루프 탈출
        return;
      }

      // WHY: 이상 감지로 abort된 경우 재시도 전 경고
      if (attempt < maxRetries) {
        deps.logger.warn('DESIGN Phase 이상 감지 — 재spawn', {
          featureId,
          attempt: attempt + 1,
          maxRetries,
        });
        yield createEvent('message', `DESIGN Phase 이상 감지. 재시도 ${attempt + 1}/${maxRetries}`);
      }
    } finally {
      deps.streamMonitor.stopMonitoring();
      deps.ipcPoller.stop();
    }
  }

  // WHY: 재시도 횟수 초과 시 에러 이벤트
  deps.logger.error('DESIGN Phase 재시도 횟수 초과', { featureId, maxRetries });
  yield createEvent('error', `DESIGN Phase ${maxRetries}회 재시도 후에도 실패`);
}
