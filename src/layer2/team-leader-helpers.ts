/**
 * 팀 리더 헬퍼 함수 (공통 유틸) / Team Leader helper functions (shared utilities)
 *
 * @description
 * KR: TeamLeader의 공통 유틸리티 함수를 제공한다. Phase별 실행 로직은 분리 파일에 위치한다.
 *     - team-leader-design-phase.ts: DESIGN Phase
 *     - team-leader-code-phase.ts: CODE Phase
 *     - team-leader-test-phase.ts: TEST Phase
 *     - team-leader-verify.ts: VERIFY Phase
 * EN: Provides shared utility functions for TeamLeader. Phase-specific logic is in separate files.
 */

import type { Logger } from 'core/logger.js';
import type { AgentName, Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { DocumenterEventType } from 'layer2/documenter-event-types.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { AgentEvent } from 'layer2/types.js';
import type { RagSearcher } from 'rag/search.js';

// WHY: Phase별 실행 로직은 300줄 제한 준수를 위해 별도 파일로 분리
export { executeVerifyPhase } from 'layer2/team-leader-verify.js';
export { executeCodePhase } from 'layer2/team-leader-code-phase.js';
export { executeTestPhase } from 'layer2/team-leader-test-phase.js';

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
 *     설정 생성 실패 시 경고만 남기고 문서화는 생략한다.
 * EN: Automatically triggers documentation from 5 event types.
 *     On config failure, warns and skips documentation.
 *
 * @param agentGenerator - 에이전트 설정 생성기 / Agent config generator
 * @param agentSpawner - 에이전트 스포너 / Agent spawner
 * @param logger - 로거 / Logger
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param triggerContext - 트리거 컨텍스트 (선택) / Trigger context (optional)
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
 * EN: Agent execution continues even if RAG search fails.
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
 * @param agentName - 에이전트 이름 (기본값: architect) / Agent name (default: architect)
 * @returns AgentEvent
 */
export function createEvent(
  type: AgentEvent['type'],
  content: string,
  agentName: AgentName = 'architect',
): AgentEvent {
  return {
    type,
    agentName,
    content,
    timestamp: new Date(),
  };
}
