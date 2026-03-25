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
import type { AgentName, Phase } from 'core/types.js';
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
      yield* deps.gitBranchManager.commitChanges(`feat(${featureId}): CODE phase 완료`);
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
      // WHY: PI-003 — 병합 충돌 시 충돌 해결 프롬프트를 전달하고 architect spawn으로 해결 조율
      for await (const mergeEvent of deps.gitBranchManager.mergeBranch(allocation.branchName)) {
        if (mergeEvent.type === 'error' && mergeEvent.metadata?.conflictResolutionPrompt) {
          yield createEvent(
            'message',
            `[충돌 감지] ${allocation.coderId}: ${String(mergeEvent.metadata.conflictResolutionPrompt)}`,
          );
          // WHY: PI-003 — architect 에이전트를 spawn하여 충돌 해결 조율
          yield* spawnConflictResolver(
            deps,
            featureId,
            handoffPackage,
            String(mergeEvent.metadata.conflictResolutionPrompt),
          );
        }
        yield mergeEvent;
      }
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

/** executeTestPhase에 필요한 의존성 / Deps needed by executeTestPhase */
export interface ExecuteTestPhaseDeps extends ExecutePhaseDeps {
  readonly failureHandler?: {
    classify(
      featureId: string,
      phase: string,
      reason: string,
    ): { ok: true; value: { type: string } } | { ok: false };
    getRecoveryPhase(report: { type: string }): Phase;
  };
}

/**
 * TEST Phase 3단계 실행 (Unit → Module → E2E) / Executes TEST phase in 3 stages
 *
 * @description
 * KR: PI-002 — adev가 Unit → Module → E2E 3단계를 순차 실행한다.
 *     각 단계의 tester 에이전트 프롬프트에 테스트 범위를 명시적으로 주입한다.
 *     1개 단계라도 실패하면 즉시 중단하고 qc 분석 + error 이벤트를 yield한다.
 * EN: PI-002 — adev runs Unit → Module → E2E in sequence.
 *     Each stage injects explicit test scope into tester agent prompt.
 *     On any stage failure, immediately stops and yields qc analysis + error event.
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeTestPhase(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  // WHY: PI-002 — 3단계 순차 실행. 각 단계가 독립 tester spawn이므로 실패 감지가 즉각적이다.
  const TEST_STAGES: readonly { readonly scope: string; readonly dir: string }[] = [
    { scope: 'unit', dir: 'tests/unit/' },
    { scope: 'module', dir: 'tests/module/' },
    { scope: 'e2e', dir: 'tests/e2e/' },
  ];

  // WHY: PI-002 — 전체 통과할 때까지 재시도. 무한 루프 방지 안전장치로 전체 최대 10회.
  const MAX_TEST_GLOBAL_RETRIES = 10;
  let globalRetryCount = 0;

  for (const stage of TEST_STAGES) {
    let stageResolved = false;

    while (!stageResolved && globalRetryCount < MAX_TEST_GLOBAL_RETRIES) {
      const isRetry = globalRetryCount > 0 && !stageResolved;
      deps.logger.info('TEST Phase 단계 시작', { featureId, scope: stage.scope, globalRetryCount });
      yield createEvent(
        'message',
        `[TEST] ${stage.scope} 테스트 실행 시작${isRetry ? ` (재시도 ${globalRetryCount}/${MAX_TEST_GLOBAL_RETRIES})` : ''}`,
      );

      let stageFailed = false;

      // WHY: tester 에이전트에게 테스트 범위를 명시적으로 지정하여 spawn
      const ragContext = await queryRagContext(deps.ragSearcher, featureId, 'tester');
      const scopePrompt = [
        `[TEST 범위 지정] scope=${stage.scope}, dir=${stage.dir}`,
        `featureId=${featureId}`,
        `이 단계에서는 ${stage.dir} 경로의 ${stage.scope} 테스트만 실행하라.`,
        '1개라도 실패 시 즉시 중단하고 실패 내역을 보고하라.',
      ].join('\n');

      const configResult = deps.agentGenerator.generateAgentConfig(
        'tester',
        `${handoffPackage.specDocument}\n\n${scopePrompt}`,
        featureId,
        ragContext,
      );

      if (!configResult.ok) {
        deps.logger.error('tester 에이전트 설정 생성 실패', {
          scope: stage.scope,
          error: configResult.error.message,
        });
        yield createEvent(
          'error',
          `tester(${stage.scope}) 설정 생성 실패: ${configResult.error.message}`,
        );
        return;
      }

      const config = {
        ...configResult.value,
        projectId: handoffPackage.projectId,
        phase: 'TEST' as const,
      };

      deps.sessionManager.createSession('tester', config.projectId, featureId, 'TEST');

      for await (const event of deps.agentSpawner.spawn(config)) {
        deps.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        yield event;

        // WHY: PI-002 — tester에서 error 이벤트 발생 시 해당 단계 실패로 판정
        if (event.type === 'error') {
          stageFailed = true;
        }
      }

      if (!stageFailed) {
        // WHY: 단계 통과 — 재시도 루프 탈출
        stageResolved = true;
        break;
      }

      globalRetryCount++;

      deps.logger.warn('TEST Phase 단계 실패', {
        featureId,
        scope: stage.scope,
        globalRetryCount,
        maxRetries: MAX_TEST_GLOBAL_RETRIES,
      });

      // WHY: PI-004 — 실패 시 qc 에이전트 spawn하여 원인 분석
      yield* spawnQcForTestFailure(deps, featureId, handoffPackage, stage.scope);

      if (globalRetryCount < MAX_TEST_GLOBAL_RETRIES) {
        // WHY: PI-002 — qc 분석 후 coder 에이전트에게 수정 요청, 전체 통과할 때까지 반복
        yield createEvent(
          'message',
          `[TEST] ${stage.scope} 실패 — qc 분석 후 coder 수정 재시도 (${globalRetryCount}/${MAX_TEST_GLOBAL_RETRIES})`,
        );
        yield* spawnCoderForTestFix(deps, featureId, handoffPackage, stage.scope);
      }
    }

    if (!stageResolved) {
      yield createEvent(
        'error',
        `[TEST] ${stage.scope} 테스트 실패 — 전체 재시도 ${MAX_TEST_GLOBAL_RETRIES}회 초과. CODE Phase로 롤백 필요`,
      );
      return;
    }

    deps.logger.info('TEST Phase 단계 완료', { featureId, scope: stage.scope });
    yield createEvent('message', `[TEST] ${stage.scope} 테스트 통과`);
  }

  // WHY: 3단계 모두 통과 시 documenter에게 테스트 결과 문서화 요청
  yield* spawnDocumenter(
    deps.agentGenerator,
    deps.agentSpawner,
    deps.logger,
    featureId,
    handoffPackage,
    { trigger: 'test_executed', context: { stages: 'unit,module,e2e', result: 'all_passed' } },
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
 * @param ragSearcher - RAG 검색기 (선택) / RAG searcher (optional)
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* spawnDocumenter(
  agentGenerator: AgentGenerator,
  agentSpawner: AgentSpawner,
  logger: Logger,
  featureId: string,
  handoffPackage: HandoffPackage,
  triggerContext?: DocumenterTriggerContext,
  ragSearcher?: RagSearcher,
): AsyncIterable<AgentEvent> {
  const trigger = triggerContext?.trigger ?? 'feature_complete';

  // WHY: 트리거 유형에 따라 documenter에게 주입할 프롬프트를 구성한다
  const triggerPrompt = buildTriggerPrompt(trigger, featureId, triggerContext?.context);
  const specWithTrigger = `${handoffPackage.specDocument}\n\n${triggerPrompt}`;

  // WHY: PI-013 — documenter가 관련 feature 설계 결정과 이전 문서 컨텍스트를 활용하도록 RAG 검색 수행
  const ragContext = await queryRagContext(ragSearcher, featureId, 'documenter');

  const configResult = agentGenerator.generateAgentConfig(
    'documenter',
    specWithTrigger,
    featureId,
    ragContext,
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
    ? Object.entries(context)
        .map(([k, v]) => `- ${k}: ${String(v)}`)
        .join('\n')
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
      // WHY: PI-008 — §16 TeamDelete race condition 완화 — 3회 대기로 멤버 상태 안정화
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        deps.logger.debug('TeamDelete race condition 대기', { attempt: i + 1, maxAttempts: 3 });
      }
    }
  }

  // WHY: Agent Teams 비활성화 fallback — 재spawn 반복 실패 시 독립 세션으로 전환
  deps.logger.warn(
    'DESIGN Phase 재시도 횟수 초과 — Agent Teams 비활성화 후 독립 세션으로 fallback',
    {
      featureId,
      maxRetries,
    },
  );

  // WHY: Agent Teams 환경변수를 제거하여 독립 실행 전환
  const fallbackConfig = {
    ...config,
    phase: 'DESIGN' as const,
    environment: {},
  };

  try {
    for await (const event of deps.sessionExecutor.executeDesignPhase(fallbackConfig, {
      featureId,
      handoff: handoffPackage,
    })) {
      yield event;
    }
    // WHY: fallback 성공 시 에러 없이 종료
    return;
  } catch {
    // WHY: fallback도 실패하면 최종 에러 yield
    deps.logger.error('DESIGN Phase 독립 세션 fallback도 실패', { featureId, maxRetries });
  }

  // WHY: 모든 재시도 + fallback 실패 시 에러 이벤트
  deps.logger.error('DESIGN Phase 재시도 횟수 초과', { featureId, maxRetries });
  yield createEvent('error', `DESIGN Phase ${maxRetries}회 재시도 후에도 실패`);
}

// ── PI-003: Git 충돌 해결 헬퍼 / Git conflict resolution helper ──

/**
 * Git 충돌 시 architect 에이전트를 spawn하여 해결을 조율한다 / Spawns architect to coordinate conflict resolution
 *
 * @param deps - CODE Phase 의존성 / CODE phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param conflictPrompt - 충돌 해결 프롬프트 / Conflict resolution prompt
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnConflictResolver(
  deps: ExecuteCodePhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  conflictPrompt: string,
): AsyncIterable<AgentEvent> {
  const specWithConflict = `${handoffPackage.specDocument}\n\n[Git 충돌 해결 요청]\n${conflictPrompt}`;

  // WHY: PI-001 — 스펙 §8.4: 충돌 시 5개 에이전트 전원 참여하여 다각적 해결
  const resolvers: AgentName[] = ['architect', 'qa', 'qc', 'reviewer', 'coder'];

  for (const agentName of resolvers) {
    const configResult = deps.agentGenerator.generateAgentConfig(
      agentName,
      specWithConflict,
      featureId,
    );

    if (!configResult.ok) {
      deps.logger.warn(`${agentName} 충돌 해결 설정 생성 실패`, {
        featureId,
        error: configResult.error.message,
      });
      continue;
    }

    const config = {
      ...configResult.value,
      projectId: handoffPackage.projectId,
      phase: 'CODE' as const,
    };

    deps.sessionManager.createSession(agentName, config.projectId, featureId, 'CODE');

    for await (const event of deps.agentSpawner.spawn(config)) {
      yield event;
    }
  }
}

// ── PI-004: TEST 실패 시 qc/coder 재시도 헬퍼 / TEST failure retry helpers ──

/**
 * 테스트 실패 시 qc 에이전트를 spawn하여 원인을 분석한다 / Spawns qc agent to analyze test failure
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param scope - 실패한 테스트 범위 / Failed test scope
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnQcForTestFailure(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  scope: string,
): AsyncIterable<AgentEvent> {
  const qcRagContext = await queryRagContext(deps.ragSearcher, featureId, 'qc');
  const qcConfigResult = deps.agentGenerator.generateAgentConfig(
    'qc',
    `${handoffPackage.specDocument}\n\n[QC 분석 요청] ${scope} 테스트 실패. 근본 원인을 분석하라.`,
    featureId,
    qcRagContext,
  );

  if (!qcConfigResult.ok) {
    deps.logger.warn('qc 에이전트 설정 생성 실패', { scope, error: qcConfigResult.error.message });
    return;
  }

  const qcConfig = {
    ...qcConfigResult.value,
    projectId: handoffPackage.projectId,
    phase: 'TEST' as const,
  };
  deps.sessionManager.createSession('qc', qcConfig.projectId, featureId, 'TEST');
  for await (const qcEvent of deps.agentSpawner.spawn(qcConfig)) {
    yield qcEvent;
  }
}

/**
 * 테스트 실패 후 coder 에이전트를 spawn하여 수정을 요청한다 / Spawns coder agent to fix test failure
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param scope - 실패한 테스트 범위 / Failed test scope
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnCoderForTestFix(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  scope: string,
): AsyncIterable<AgentEvent> {
  const coderRagContext = await queryRagContext(deps.ragSearcher, featureId, 'coder');
  const fixPrompt = [
    `[CODER 수정 요청] ${scope} 테스트 실패에 대한 코드 수정`,
    `featureId=${featureId}`,
    'qc 분석 결과를 참고하여 테스트가 통과하도록 코드를 수정하라.',
    '수정 범위를 최소화하고, 테스트 실패의 근본 원인만 해결하라.',
  ].join('\n');

  const configResult = deps.agentGenerator.generateAgentConfig(
    'coder',
    `${handoffPackage.specDocument}\n\n${fixPrompt}`,
    featureId,
    coderRagContext,
  );

  if (!configResult.ok) {
    deps.logger.warn('coder 에이전트 설정 생성 실패 (테스트 수정)', {
      scope,
      error: configResult.error.message,
    });
    return;
  }

  const coderConfig = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'TEST' as const,
  };
  deps.sessionManager.createSession('coder', coderConfig.projectId, featureId, 'TEST');
  for await (const coderEvent of deps.agentSpawner.spawn(coderConfig)) {
    yield coderEvent;
  }
}
