/**
 * 벡터라이저 (최상위 RAG API) / Vectorizer (top-level RAG API)
 *
 * @description
 * KR: 인덱서 + 검색기를 결합한 최상위 API.
 *     초기화 → 인덱싱 → 검색 워크플로우를 단일 진입점으로 제공한다.
 * EN: Top-level API combining indexer + searcher.
 *     Provides initialize → index → search workflow through a single entry point.
 */

import type { EmbeddingConfig } from '../core/config.js';
import { RagError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { CodeRecord, Result } from '../core/types.js';
import { ChunkSplitter } from './chunk-splitter.js';
import { CodeIndexer } from './code-indexer.js';
import { createTransformersEmbeddingProvider } from './embeddings.js';
import { RagSearcher } from './search.js';
import type { EmbeddingProvider, IndexDirectoryOptions, SearchResult } from './types.js';
import { CodeVectorStore } from './vector-store.js';

// ── Vectorizer ──────────────────────────────────────────────────

/**
 * 벡터라이저 — RAG 모듈 최상위 API / Vectorizer — top-level RAG module API
 *
 * @description
 * KR: 벡터 저장소, 임베딩 프로바이더, 인덱서, 검색기를 조합하여
 *     코드 인덱싱과 검색을 위한 단일 진입점을 제공한다.
 * EN: Combines vector store, embedding provider, indexer, and searcher
 *     to provide a single entry point for code indexing and search.
 *
 * @param dbPath - LanceDB 데이터 디렉토리 경로 / LanceDB data directory path
 * @param embeddingConfig - 임베딩 설정 / Embedding configuration
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const vectorizer = new Vectorizer('/path/to/db', embeddingConfig, logger);
 * await vectorizer.initialize();
 * await vectorizer.index('src/');
 * const results = await vectorizer.search('error handling');
 */
export class Vectorizer {
  private vectorStore: CodeVectorStore | null = null;
  private embeddingProvider: EmbeddingProvider | null = null;
  private indexer: CodeIndexer | null = null;
  private searcher: RagSearcher | null = null;
  private initialized = false;

  constructor(
    private readonly dbPath: string,
    private readonly embeddingConfig: EmbeddingConfig,
    private readonly logger: Logger,
  ) {}

  /**
   * RAG 시스템 초기화 / Initialize the RAG system
   *
   * @description
   * KR: 벡터 저장소, 임베딩 프로바이더, 인덱서, 검색기를 생성하고 초기화한다.
   * EN: Creates and initializes the vector store, embedding provider, indexer, and searcher.
   *
   * @returns 성공 시 ok(void), 실패 시 err(RagError)
   */
  async initialize(): Promise<Result<void, RagError>> {
    try {
      this.logger.info('RAG 시스템 초기화 시작', {
        dbPath: this.dbPath,
        provider: this.embeddingConfig.default,
      });

      // 1. 벡터 저장소 초기화 / Initialize vector store
      this.vectorStore = new CodeVectorStore(this.dbPath, this.logger);
      const storeResult = await this.vectorStore.initialize();
      if (!storeResult.ok) {
        return storeResult;
      }

      // 2. 임베딩 프로바이더 생성 / Create embedding provider
      this.embeddingProvider = createEmbeddingProvider(this.embeddingConfig, this.logger);

      // 3. 인덱서 + 검색기 생성 / Create indexer + searcher
      const splitter = new ChunkSplitter();
      this.indexer = new CodeIndexer(
        this.vectorStore,
        this.embeddingProvider,
        splitter,
        this.logger,
      );
      this.searcher = new RagSearcher(this.vectorStore, this.embeddingProvider, this.logger);

      this.initialized = true;
      this.logger.info('RAG 시스템 초기화 완료');

      return ok(undefined);
    } catch (error: unknown) {
      return err(new RagError('rag_init_error', `RAG 시스템 초기화 실패: ${String(error)}`, error));
    }
  }

  /**
   * 디렉토리를 인덱싱 / Index a directory
   *
   * @param dirPath - 인덱싱할 디렉토리 경로 / Directory path to index
   * @param options - 인덱싱 옵션 / Indexing options
   * @returns 인덱싱된 총 청크 수 / Total number of indexed chunks
   */
  async index(dirPath: string, options?: IndexDirectoryOptions): Promise<Result<number, RagError>> {
    const guard = this.ensureInitialized();
    if (!guard.ok) return guard;

    // WHY: null 체크는 ensureInitialized()에서 보장하나 TypeScript 추론을 위해 필요
    if (!this.indexer) {
      return err(new RagError('rag_init_error', '인덱서가 초기화되지 않았습니다.'));
    }

    return this.indexer.indexDirectory(dirPath, options);
  }

  /**
   * 코드 검색 / Search code
   *
   * @param query - 검색 쿼리 텍스트 / Search query text
   * @param limit - 최대 결과 수 (기본: 10) / Max results (default: 10)
   * @param filter - 필터 조건 / Filter conditions
   * @returns SearchResult<CodeRecord> 배열 / Array of search results
   */
  async search(
    query: string,
    limit?: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<SearchResult<CodeRecord>[], RagError>> {
    const guard = this.ensureInitialized();
    if (!guard.ok) return guard;

    if (!this.searcher) {
      return err(new RagError('rag_init_error', '검색기가 초기화되지 않았습니다.'));
    }

    return this.searcher.searchCode(query, limit, filter);
  }

  /**
   * 초기화 상태를 확인 / Ensure the system is initialized
   */
  private ensureInitialized(): Result<void, RagError> {
    if (!this.initialized) {
      return err(
        new RagError(
          'rag_init_error',
          'RAG 시스템이 초기화되지 않았습니다. initialize()를 먼저 호출하세요.',
        ),
      );
    }
    return ok(undefined);
  }
}

// ── 팩토리 함수 / Factory Functions ─────────────────────────────

/**
 * 설정에 따라 임베딩 프로바이더를 생성 / Create an embedding provider based on config
 *
 * @description
 * KR: 현재는 Transformers 프로바이더만 지원. 추후 Voyage/OpenAI 등 API 프로바이더 추가 예정.
 * EN: Currently only supports Transformers provider. Voyage/OpenAI API providers to be added later.
 *
 * @param config - 임베딩 설정 / Embedding configuration
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns EmbeddingProvider 인스턴스 / EmbeddingProvider instance
 */
function createEmbeddingProvider(config: EmbeddingConfig, logger: Logger): EmbeddingProvider {
  // WHY: 현재는 Transformers만 구현. provider 이름으로 분기 구조 준비.
  const providerName = config.default;

  switch (providerName) {
    // WHY: 향후 실제 API 프로바이더 추가 시 case 'voyage': return new VoyageProvider(...);
    default:
      return createTransformersEmbeddingProvider(logger, providerName);
  }
}
