/**
 * RAG 코드 검색기 / RAG code searcher
 *
 * @description
 * KR: 벡터 유사도 기반 코드 검색을 제공한다.
 *     쿼리 텍스트를 임베딩하고 벡터 저장소에서 유사한 코드를 찾는다.
 * EN: Provides vector similarity-based code search.
 *     Embeds query text and finds similar code in the vector store.
 */

import { RagError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { CodeRecord, Result } from '../core/types.js';
import type { EmbeddingProvider, SearchResult } from './types.js';
import type { CodeVectorStore } from './vector-store.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 검색 결과 수 / Default search result limit */
const DEFAULT_SEARCH_LIMIT = 10;

// ── RagSearcher ─────────────────────────────────────────────────

/**
 * RAG 코드 검색기 / RAG code searcher
 *
 * @description
 * KR: 자연어 쿼리를 벡터로 변환하여 코드 벡터 저장소에서 유사 코드를 검색한다.
 * EN: Converts natural language queries to vectors and searches for similar code in the vector store.
 *
 * @param vectorStore - 코드 벡터 저장소 / Code vector store
 * @param embeddingProvider - 임베딩 프로바이더 / Embedding provider
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const searcher = new RagSearcher(store, provider, logger);
 * const results = await searcher.searchCode('error handling');
 */
export class RagSearcher {
  constructor(
    private readonly vectorStore: CodeVectorStore,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly logger: Logger,
  ) {}

  /**
   * 자연어 쿼리로 코드 검색 / Search code by natural language query
   *
   * @param query - 검색 쿼리 텍스트 / Search query text
   * @param limit - 최대 결과 수 (기본: 10) / Max results (default: 10)
   * @param filter - 필터 조건 (language, module 등) / Filter conditions
   * @returns SearchResult<CodeRecord> 배열 / Array of search results
   */
  async searchCode(
    query: string,
    limit = DEFAULT_SEARCH_LIMIT,
    filter?: Record<string, unknown>,
  ): Promise<Result<SearchResult<CodeRecord>[], RagError>> {
    try {
      this.logger.debug('코드 검색 시작', { query, limit });

      // 1. 쿼리 임베딩 / Embed query
      const embedResult = await this.embeddingProvider.embedQuery(query);
      if (!embedResult.ok) {
        return err(
          new RagError('rag_embedding_error', `쿼리 임베딩 실패: ${query}`, embedResult.error),
        );
      }

      // 2. 벡터 검색 / Vector search
      const searchResult = await this.vectorStore.searchWithScore(embedResult.value, limit, filter);
      if (!searchResult.ok) {
        return err(
          new RagError('rag_search_error', `벡터 검색 실패: ${query}`, searchResult.error),
        );
      }

      this.logger.debug('코드 검색 완료', {
        query,
        resultCount: searchResult.value.length,
      });

      return ok(searchResult.value);
    } catch (error: unknown) {
      this.logger.error('코드 검색 실패', { query, error: String(error) });
      return err(new RagError('rag_search_error', `코드 검색 실패: ${query}`, error));
    }
  }

  /**
   * 파일 경로로 코드 검색 / Search code by file path filter
   *
   * @param filePath - 필터링할 파일 경로 / File path to filter by
   * @param limit - 최대 결과 수 (기본: 10) / Max results (default: 10)
   * @returns CodeRecord 배열 / Array of code records
   */
  async searchByFile(
    filePath: string,
    limit = DEFAULT_SEARCH_LIMIT,
  ): Promise<Result<CodeRecord[], RagError>> {
    try {
      this.logger.debug('파일 경로 검색 시작', { filePath });

      // WHY: 파일 경로 검색은 벡터 불필요 — 더미 벡터로 검색 후 필터 적용
      //      LanceDB의 vectorSearch가 필수이므로 zero 벡터 사용
      const dims = this.embeddingProvider.dimensions;
      const dummyVector = new Float32Array(dims);

      const searchResult = await this.vectorStore.search(dummyVector, limit, { filePath });

      if (!searchResult.ok) {
        return err(
          new RagError('rag_search_error', `파일 경로 검색 실패: ${filePath}`, searchResult.error),
        );
      }

      this.logger.debug('파일 경로 검색 완료', {
        filePath,
        resultCount: searchResult.value.length,
      });

      return ok(searchResult.value);
    } catch (error: unknown) {
      this.logger.error('파일 경로 검색 실패', { filePath, error: String(error) });
      return err(new RagError('rag_search_error', `파일 경로 검색 실패: ${filePath}`, error));
    }
  }
}
