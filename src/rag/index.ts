/**
 * rag 모듈 public API / RAG module public exports
 *
 * @description
 * KR: 임베딩, 벡터 저장소, 청크 분할, 인덱싱, 검색, 벡터라이저를 re-export한다.
 * EN: Re-exports embedding, vector store, chunk splitting, indexing, search, and vectorizer.
 */

// ── 타입 ────────────────────────────────────────────────────────

export type {
  ChunkInput,
  ChunkMetadata,
  ChunkOptions,
  EmbeddingProvider,
  EmbeddingTier,
  IndexDirectoryOptions,
  SearchResult,
} from 'rag/types.js';

// ── 임베딩 ──────────────────────────────────────────────────────

export {
  createTransformersEmbeddingProvider,
  normalizeVector,
  TransformersEmbeddingProvider,
} from 'rag/embeddings.js';

// ── 벡터 저장소 ────────────────────────────────────────────────

export { CodeVectorStore } from 'rag/vector-store.js';
export { DesignDecisionRepository } from 'rag/design-decision-store.js';
export { FailureRepository } from 'rag/failure-store.js';

// ── 청크 분할 ───────────────────────────────────────────────────

export { ChunkSplitter, detectLanguage, extractModule } from 'rag/chunk-splitter.js';

// ── 인덱서 ──────────────────────────────────────────────────────

export { CodeIndexer } from 'rag/code-indexer.js';

// ── 검색 ────────────────────────────────────────────────────────

export { RagSearcher } from 'rag/search.js';

// ── 벡터라이저 (최상위 API) ─────────────────────────────────────

export { Vectorizer } from 'rag/vectorizer.js';
