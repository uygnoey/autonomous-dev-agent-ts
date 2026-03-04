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
} from './types.js';

// ── 임베딩 ──────────────────────────────────────────────────────

export {
  createLocalEmbeddingProvider,
  LocalEmbeddingProvider,
  normalizeVector,
} from './embeddings.js';

// ── 벡터 저장소 ────────────────────────────────────────────────

export { CodeVectorStore } from './vector-store.js';

// ── 청크 분할 ───────────────────────────────────────────────────

export { ChunkSplitter, detectLanguage, extractModule } from './chunk-splitter.js';

// ── 인덱서 ──────────────────────────────────────────────────────

export { CodeIndexer } from './code-indexer.js';

// ── 검색 ────────────────────────────────────────────────────────

export { RagSearcher } from './search.js';

// ── 벡터라이저 (최상위 API) ─────────────────────────────────────

export { Vectorizer } from './vectorizer.js';
