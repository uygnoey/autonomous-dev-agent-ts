/**
 * 세션 복원 실패 시 RAG fallback 로직 / Session restore failure RAG fallback logic
 *
 * @description
 * KR: M-R2 — session-restore-orchestrator.ts에서 분리된 fallback 관련 함수.
 *     세션 복원 실패 시 RAG 컨텍스트 검색 및 fallback 세션 설정 생성을 담당한다.
 * EN: M-R2 — Fallback functions extracted from session-restore-orchestrator.ts.
 *     Handles RAG context search and fallback session config building on restore failure.
 */

import type { AgentName, Phase } from 'core/types.js';
import type { Logger } from 'core/logger.js';
import type { AgentConfig, AgentEvent } from 'layer2/agent-types.js';
import type { RagSearcher } from 'rag/search.js';

/**
 * 세션 복원 실패 시 RAG 컨텍스트를 검색하여 fallback 이벤트를 yield한다
 * Searches RAG context on session restore failure and yields fallback events
 *
 * @param ragSearcher - RAG 검색 서비스 / RAG search service
 * @param logger - 로거 / Logger
 * @param sessionId - 실패한 세션 ID / Failed session ID
 * @param agentName - 에이전트 이름 / Agent name
 * @yields RAG 컨텍스트가 포함된 fallback 메시지 이벤트 / Fallback message events with RAG context
 */
export async function* fallbackWithRagContext(
  ragSearcher: RagSearcher,
  logger: Logger,
  sessionId: string,
  agentName: AgentName,
): AsyncIterable<AgentEvent> {
  try {
    // WHY: 세션 ID에서 featureId를 추출하여 관련 코드를 RAG 검색한다
    //      세션 ID 형식: projectId:featureId:agentName:phase
    const parts = sessionId.split(':');
    const featureId = parts.length >= 2 ? parts[1] : sessionId;

    const searchResult = await ragSearcher.searchCode(`${featureId} ${agentName}`, 5);

    let ragContext = '';
    if (searchResult.ok && searchResult.value.length > 0) {
      ragContext = searchResult.value
        .map((r, i) => `[${i + 1}] ${r.record.filePath}\n${r.record.chunk}`)
        .join('\n\n');
    }

    logger.info('세션 복원 실패 — RAG 컨텍스트 fallback 생성', {
      sessionId,
      agentName,
      featureId,
      ragResultCount: searchResult.ok ? searchResult.value.length : 0,
    });

    yield {
      type: 'message',
      agentName,
      content: ragContext
        ? `[Fallback] 세션 재개 실패 — RAG 컨텍스트로 새 세션 시작 가능\n\n관련 코드:\n${ragContext}`
        : '[Fallback] 세션 재개 실패 — RAG 검색 결과 없음. 새 세션으로 재시작 필요',
      timestamp: new Date(),
      metadata: {
        restoreFallback: true,
        sessionId,
        featureId,
        ragContextAvailable: ragContext.length > 0,
        // WHY: M-005 — 상위 계층에 재시작 필요 신호를 metadata로 전달
        needsNewSession: true,
        ragContext: ragContext || '',
      },
    };
  } catch (ragError: unknown) {
    logger.warn('RAG fallback 검색 실패', {
      sessionId,
      error: String(ragError),
    });
    // WHY: RAG 검색 실패는 치명적이지 않으므로 경고만 yield
    yield {
      type: 'message',
      agentName,
      content: '[Fallback] 세션 재개 실패 + RAG 검색도 실패 — 새 세션으로 재시작 필요',
      timestamp: new Date(),
      // WHY: M-005 — RAG 검색 실패 시에도 needsNewSession 신호 전달
      metadata: {
        restoreFallback: true,
        sessionId,
        ragSearchFailed: true,
        needsNewSession: true,
      },
    };
  }
}

/**
 * RAG fallback용 새 세션 설정을 생성한다 / Builds agent config for RAG fallback new session
 *
 * @param logger - 로거 / Logger
 * @param snapshot - 실패한 세션 스냅샷 정보 / Failed session snapshot info
 * @param ragContext - RAG 검색 결과 컨텍스트 / RAG search result context
 * @returns AgentConfig 또는 null (spawn 불가 시) / AgentConfig or null if unable to build
 */
export function buildFallbackSessionConfig(
  logger: Logger,
  snapshot: { sessionId: string; agentName: AgentName },
  ragContext: string,
): AgentConfig | null {
  // WHY: 세션 ID 형식 projectId:featureId:agentName:phase 에서 정보 추출
  const parts = snapshot.sessionId.split(':');
  if (parts.length < 4) {
    logger.warn('세션 ID 형식 불일치 — fallback 세션 생성 불가', {
      sessionId: snapshot.sessionId,
    });
    return null;
  }

  const projectId = parts[0] ?? '';
  const featureId = parts[1] ?? '';
  const phase = (parts[3] ?? 'CODE') as Phase;

  const ragPromptSection = ragContext ? `\n\n## 이전 세션 RAG 컨텍스트\n${ragContext}` : '';

  return {
    name: snapshot.agentName,
    projectId,
    featureId,
    phase,
    systemPrompt: `이전 세션 복원 실패로 새 세션을 시작합니다. 이전 작업 컨텍스트를 참고하여 작업을 계속하세요.${ragPromptSection}`,
    prompt: `이전 세션(${snapshot.sessionId})이 복원 실패하여 새로 시작합니다. 이전 작업을 이어서 진행해주세요.`,
    tools: [],
  };
}
