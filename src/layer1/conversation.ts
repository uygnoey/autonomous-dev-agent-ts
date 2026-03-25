/**
 * 대화 관리자 / Conversation manager
 *
 * @description
 * KR: MemoryRepository를 통해 대화 이력을 저장/조회하고,
 *     EmbeddingProvider가 주입되면 실제 벡터 임베딩으로 LanceDB에 영구 저장하여
 *     미래 세션에서 RAG 시맨틱 검색을 가능하게 한다.
 * EN: Stores/retrieves conversation history via MemoryRepository.
 *     When EmbeddingProvider is injected, stores real vector embeddings in LanceDB
 *     enabling RAG semantic search across future sessions.
 */

import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { MemoryRepository } from 'core/memory.js';
import { ok } from 'core/types.js';
import type { MemoryRecord, Result } from 'core/types.js';
import type { ConversationMessage } from 'layer1/types.js';
import type { EmbeddingProvider } from 'rag/types.js';

// ── PI-009: 모호성 감지 상수 / Ambiguity detection constants ────

/** 최소 구체성 길이 (짧으면 모호) / Min specificity length */
const MIN_SPECIFIC_LENGTH = 20;

/** 모호성 마커 / Ambiguity markers */
const VAGUE_MARKERS = ['그냥', '뭔가', '좀', 'something', 'kind of', 'sort of', 'maybe'];

/**
 * 유저 메시지의 모호성 점수를 계산한다 (0~1, 높을수록 모호)
 * Calculate ambiguity score for user message (0~1, higher = more ambiguous)
 *
 * @description
 * KR: PI-009 — 짧은 메시지와 모호한 표현이 포함된 메시지에 높은 점수 부여.
 * EN: PI-009 — Assigns higher score to short messages and those with vague markers.
 *
 * @param text - 유저 입력 텍스트 / User input text
 * @returns 0~1 사이의 모호성 점수 / Ambiguity score between 0 and 1
 */
function calculateAmbiguityScore(text: string): number {
  let score = 0;

  if (text.length < MIN_SPECIFIC_LENGTH) {
    score += 0.4;
  }

  const vagueCount = VAGUE_MARKERS.filter((m) => text.toLowerCase().includes(m)).length;
  score += Math.min(vagueCount * 0.2, 0.6);

  return Math.min(score, 1.0);
}

/**
 * 모호성이 높은 경우 구체화 질문을 생성한다
 * Generate a probing question when ambiguity is high
 *
 * @description
 * KR: PI-009 — 스펙 §6.3 능동적 탐색 질문 코드 레벨 구현.
 *     모호성 점수 0.5 이상일 때만 질문을 생성한다.
 * EN: PI-009 — Implements spec §6.3 active probing question at code level.
 *     Only generates question when ambiguity score >= 0.5.
 *
 * @param text - 유저 입력 텍스트 / User input text
 * @param phase - 현재 대화 Phase / Current conversation phase
 * @returns 구체화 질문 또는 null / Probing question or null
 */
export function generateProbingQuestion(text: string, phase: string): string | null {
  if (calculateAmbiguityScore(text) < 0.5) {
    return null;
  }

  // WHY: PI-009 — 스펙 §6.3 능동적 탐색 질문 코드 레벨 구현
  return (
    '좀 더 구체적으로 설명해주실 수 있을까요? ' +
    `"${text}"에서 어떤 부분을 ${phase} 단계에서 더 다루어야 할까요?`
  );
}

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 대화 조회 수 / Default conversation retrieval limit */
const DEFAULT_HISTORY_LIMIT = 50;

/** 기본 컨텍스트 검색 수 / Default context search limit */
const DEFAULT_CONTEXT_LIMIT = 10;

/**
 * 대화 저장용 더미 임베딩 차원 수 / Dummy embedding dimensions for conversation storage
 *
 * WHY: LanceDB vectorSearch는 0길이 벡터를 허용하지 않는다.
 *      EmbeddingProvider가 없을 때 최소 크기 더미 벡터로 fallback한다.
 */
const DUMMY_EMBEDDING_DIMS = 4;

// ── ConversationManager ─────────────────────────────────────────

/**
 * 대화 관리자 / Conversation manager
 *
 * @description
 * KR: 사용자-어시스턴트 대화를 MemoryRepository에 저장하고,
 *     이력 조회 및 RAG 기반 컨텍스트 검색을 제공한다.
 *     EmbeddingProvider가 주입되면 실제 벡터 임베딩을 생성하여 저장하므로
 *     미래 세션에서 시맨틱 검색이 가능해진다.
 * EN: Stores user-assistant conversations in MemoryRepository,
 *     providing history retrieval and RAG-based context search.
 *     When EmbeddingProvider is injected, generates real vector embeddings
 *     enabling semantic search across future sessions.
 *
 * @param memoryRepository - 메모리 저장소 / Memory repository
 * @param logger - 로거 인스턴스 / Logger instance
 * @param embeddingProvider - 임베딩 프로바이더 (선택) / Embedding provider (optional)
 *
 * @example
 * const manager = new ConversationManager(memoryRepo, logger, embeddingProvider);
 * await manager.addMessage(message);
 * const history = await manager.getHistory('proj-1');
 */
export class ConversationManager {
  private readonly logger: Logger;
  private readonly embeddingProvider: EmbeddingProvider | null;

  constructor(
    private readonly memoryRepository: MemoryRepository,
    logger: Logger,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.logger = logger.child({ module: 'conversation-manager' });
    this.embeddingProvider = embeddingProvider ?? null;
  }

  /**
   * 대화 메시지 저장 / Store a conversation message
   *
   * @description
   * KR: EmbeddingProvider가 있으면 실제 벡터 임베딩을 생성하여 저장한다.
   *     없으면 더미 벡터로 fallback하여 기본 저장만 수행한다.
   * EN: When EmbeddingProvider is available, generates real vector embeddings.
   *     Falls back to dummy vectors when provider is not available.
   *
   * @param message - 저장할 메시지 / Message to store
   * @param sessionId - 세션 ID (선택) / Session ID (optional)
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async addMessage(message: ConversationMessage, sessionId?: string): Promise<Result<void>> {
    this.logger.debug('대화 메시지 저장', {
      messageId: message.id,
      projectId: message.projectId,
      role: message.role,
      hasEmbeddingProvider: this.embeddingProvider !== null,
    });

    const embedding = await this.generateEmbedding(message.content);

    const record: MemoryRecord = {
      id: message.id,
      projectId: message.projectId,
      type: 'conversation',
      content: `[${message.role}] ${message.content}`,
      embedding,
      metadata: {
        phase: 'DESIGN',
        featureId: sessionId ?? '',
        agentName: 'layer1',
        timestamp: message.timestamp,
      },
    };

    return this.memoryRepository.insert(record);
  }

  /**
   * 프로젝트별 대화 이력 조회 / Retrieve conversation history by project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param limit - 최대 조회 수 (기본: 50) / Max retrieval count (default: 50)
   * @returns ConversationMessage 배열 / Array of ConversationMessage
   */
  async getHistory(
    projectId: string,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<Result<ConversationMessage[]>> {
    this.logger.debug('대화 이력 조회', { projectId, limit });

    // WHY: vectorSearch().where()는 WHERE절 호환성 문제가 있으므로
    //      listByFilter()의 query().where()로 순수 SQL 필터링 사용
    const searchResult = await this.memoryRepository.listByFilter(
      { projectId, type: 'conversation' },
      limit,
    );

    if (!searchResult.ok) {
      return searchResult;
    }

    const messages = searchResult.value.map(toConversationMessage);
    return ok(messages);
  }

  /**
   * RAG 기반 대화 컨텍스트 검색 / Search conversation context via RAG
   *
   * @description
   * KR: EmbeddingProvider가 있으면 쿼리를 벡터화하여 시맨틱 검색을 수행한다.
   *     없으면 기존 문자열 매칭으로 fallback한다.
   * EN: When EmbeddingProvider is available, performs semantic search with vectorized query.
   *     Falls back to string matching when provider is not available.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param query - 검색 쿼리 / Search query
   * @param limit - 최대 결과 수 (기본: 10) / Max result count (default: 10)
   * @returns ConversationMessage 배열 / Array of ConversationMessage
   */
  async searchContext(
    projectId: string,
    query: string,
    limit = DEFAULT_CONTEXT_LIMIT,
  ): Promise<Result<ConversationMessage[]>> {
    this.logger.debug('대화 컨텍스트 검색', {
      projectId,
      query,
      semantic: this.embeddingProvider !== null,
    });

    // WHY: EmbeddingProvider가 있으면 시맨틱 벡터 검색, 없으면 더미 벡터 기반 검색
    const queryVector = await this.generateEmbedding(query);

    // WHY: vectorSearch는 필터 없이 실행 후 TypeScript 레벨에서 projectId/type 필터링
    //      vectorSearch().where() 호환성 문제 우회
    // WHY: 다른 프로젝트/타입의 레코드가 limit개를 차지하면 결과가 0개가 될 수 있으므로
    //      충분한 후보를 확보하여 TypeScript 레벨 필터링 후에도 원하는 수의 결과를 보장
    const searchResult = await this.memoryRepository.search(queryVector, limit * 5);

    if (!searchResult.ok) {
      return searchResult as Result<ConversationMessage[], AdevError>;
    }

    const candidates = searchResult.value.filter(
      (r) => r.projectId === projectId && r.type === 'conversation',
    );

    // WHY: EmbeddingProvider가 없으면 더미 벡터로 모든 레코드가 동일 거리를 가지므로
    //      content 기반 substring 매칭으로 fallback한다 (빈 쿼리면 모두 반환)
    const filtered =
      this.embeddingProvider === null && query.length > 0
        ? candidates.filter((r) => r.content.toLowerCase().includes(query.toLowerCase()))
        : candidates;

    const messages = filtered.slice(0, limit).map(toConversationMessage);
    return ok(messages);
  }

  /**
   * 텍스트를 벡터 임베딩으로 변환 / Convert text to vector embedding
   *
   * @description
   * KR: EmbeddingProvider가 있으면 실제 임베딩 생성, 없거나 실패하면 더미 벡터 반환.
   *     임베딩 실패는 저장 전체를 중단하지 않고 더미 벡터로 graceful degradation한다.
   * EN: Generates real embedding when provider is available. Falls back to dummy vector
   *     on failure or when provider is absent. Embedding failure does not block storage.
   *
   * @param text - 임베딩할 텍스트 / Text to embed
   * @returns Float32Array 벡터 / Float32Array vector
   */
  private async generateEmbedding(text: string): Promise<Float32Array> {
    if (this.embeddingProvider === null) {
      return new Float32Array(DUMMY_EMBEDDING_DIMS);
    }

    const result = await this.embeddingProvider.embedQuery(text);

    if (!result.ok) {
      // WHY: 임베딩 실패 시 저장 자체는 계속 진행 — 더미 벡터로 graceful degradation
      this.logger.warn('대화 임베딩 생성 실패, 더미 벡터 사용', {
        error: String(result.error),
      });
      return new Float32Array(this.embeddingProvider.dimensions);
    }

    return result.value;
  }
}

// ── 유틸리티 / Utility ──────────────────────────────────────────

/**
 * MemoryRecord → ConversationMessage 변환 / Convert MemoryRecord to ConversationMessage
 */
function toConversationMessage(record: MemoryRecord): ConversationMessage {
  const roleMatch = record.content.match(/^\[(user|assistant)\]\s/);
  const role = (roleMatch?.[1] ?? 'user') as 'user' | 'assistant';
  const content = record.content.replace(/^\[(user|assistant)\]\s/, '');

  return {
    id: record.id,
    role,
    content,
    timestamp: record.metadata.timestamp,
    projectId: record.projectId,
  };
}
