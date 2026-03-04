/**
 * 대화 관리자 / Conversation manager
 *
 * @description
 * KR: MemoryRepository를 통해 대화 이력을 저장/조회하고,
 *     RAG 검색으로 관련 대화 컨텍스트를 제공한다.
 * EN: Stores/retrieves conversation history via MemoryRepository,
 *     and provides relevant conversation context through RAG search.
 */

import type { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { MemoryRepository } from '../core/memory.js';
import { ok } from '../core/types.js';
import type { MemoryRecord, Result } from '../core/types.js';
import type { ConversationMessage } from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 대화 조회 수 / Default conversation retrieval limit */
const DEFAULT_HISTORY_LIMIT = 50;

/** 기본 컨텍스트 검색 수 / Default context search limit */
const DEFAULT_CONTEXT_LIMIT = 10;

/**
 * 대화 저장용 더미 임베딩 차원 수 / Dummy embedding dimensions for conversation storage
 *
 * WHY: LanceDB vectorSearch는 0길이 벡터를 허용하지 않는다.
 *      대화 레코드에 임베딩이 필요하지 않으므로 최소 크기 더미 벡터를 사용한다.
 */
const DUMMY_EMBEDDING_DIMS = 4;

// ── ConversationManager ─────────────────────────────────────────

/**
 * 대화 관리자 / Conversation manager
 *
 * @description
 * KR: 사용자-어시스턴트 대화를 MemoryRepository에 저장하고,
 *     이력 조회 및 RAG 기반 컨텍스트 검색을 제공한다.
 * EN: Stores user-assistant conversations in MemoryRepository,
 *     providing history retrieval and RAG-based context search.
 *
 * @param memoryRepository - 메모리 저장소 / Memory repository
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const manager = new ConversationManager(memoryRepo, logger);
 * await manager.addMessage(message);
 * const history = await manager.getHistory('proj-1');
 */
export class ConversationManager {
  private readonly logger: Logger;

  constructor(
    private readonly memoryRepository: MemoryRepository,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'conversation-manager' });
  }

  /**
   * 대화 메시지 저장 / Store a conversation message
   *
   * @param message - 저장할 메시지 / Message to store
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async addMessage(message: ConversationMessage): Promise<Result<void>> {
    this.logger.debug('대화 메시지 저장', {
      messageId: message.id,
      projectId: message.projectId,
      role: message.role,
    });

    const record: MemoryRecord = {
      id: message.id,
      projectId: message.projectId,
      type: 'conversation',
      content: `[${message.role}] ${message.content}`,
      // WHY: 실제 임베딩은 RAG 파이프라인에서 생성 — 여기선 더미 벡터로 저장
      //       LanceDB가 0길이 벡터를 허용하지 않으므로 최소 크기 사용
      embedding: new Float32Array(DUMMY_EMBEDDING_DIMS),
      metadata: {
        phase: 'DESIGN',
        featureId: '',
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

    // WHY: LanceDB의 where절은 camelCase 컬럼에 큰따옴표가 필요하나
    //      MemoryRepository.buildWhereClause는 이를 처리하지 않는다.
    //      따라서 필터 없이 검색 후 코드에서 projectId/type을 필터링한다.
    const searchResult = await this.memoryRepository.search(
      new Float32Array(DUMMY_EMBEDDING_DIMS),
      limit * 2, // WHY: 필터링 후 충분한 결과를 얻기 위해 여유 확보
    );

    if (!searchResult.ok) {
      return searchResult;
    }

    const messages = searchResult.value
      .filter((r) => r.projectId === projectId && r.type === 'conversation')
      .slice(0, limit)
      .map(toConversationMessage);
    return ok(messages);
  }

  /**
   * RAG 기반 대화 컨텍스트 검색 / Search conversation context via RAG
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
    this.logger.debug('대화 컨텍스트 검색', { projectId, query });

    // WHY: LanceDB camelCase 컬럼 필터 문제를 회피하기 위해 코드에서 필터링
    const searchResult = await this.memoryRepository.search(
      new Float32Array(DUMMY_EMBEDDING_DIMS),
      limit * 3, // WHY: 필터링 + 쿼리 매칭 후 충분한 결과를 위해 여유 확보
    );

    if (!searchResult.ok) {
      return searchResult as Result<ConversationMessage[], AdevError>;
    }

    // WHY: projectId + type 필터 후 content 문자열 매칭으로 컨텍스트 검색
    const lowerQuery = query.toLowerCase();
    const filtered = searchResult.value
      .filter(
        (record) =>
          record.projectId === projectId &&
          record.type === 'conversation' &&
          record.content.toLowerCase().includes(lowerQuery),
      )
      .slice(0, limit)
      .map(toConversationMessage);

    return ok(filtered);
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
