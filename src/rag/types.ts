/**
 * RAG 모듈 타입 정의 / RAG module type definitions
 *
 * @description
 * KR: 임베딩 프로바이더, 검색 결과, 청크 메타데이터 등 RAG 모듈 전용 타입을 정의한다.
 * EN: Defines types specific to the RAG module including embedding providers,
 *     search results, and chunk metadata.
 */

import type { Result } from '../core/types.js';

// ── 임베딩 프로바이더 / Embedding Provider ─────────────────────

/** 임베딩 프로바이더 티어 (무료/유료) / Embedding provider tier */
export type EmbeddingTier = 'free' | 'paid';

/**
 * 임베딩 프로바이더 인터페이스 / Embedding provider abstraction
 *
 * @description
 * KR: 텍스트를 벡터로 변환하는 추상화. 로컬(Xenova/Jina) 또는 API(Voyage) 구현체를 교체 가능.
 * EN: Abstraction for converting text to vectors. Swappable between local (Xenova/Jina) or API (Voyage) implementations.
 */
export interface EmbeddingProvider {
  /** 프로바이더 이름 (예: 'xenova-minilm') / Provider name */
  readonly name: string;

  /** 벡터 차원 수 / Vector dimension count */
  readonly dimensions: number;

  /** 프로바이더 티어 / Provider tier */
  readonly tier: EmbeddingTier;

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 Float32Array 배열 / Array of Float32Array for each text
   */
  embed(texts: string[]): Promise<Result<Float32Array[]>>;

  /**
   * 단일 쿼리를 벡터로 변환 / Embed a single query to a vector
   *
   * @param query - 임베딩할 쿼리 텍스트 / Query text to embed
   * @returns 쿼리 벡터 / Query vector
   */
  embedQuery(query: string): Promise<Result<Float32Array>>;
}

// ── 검색 결과 / Search Result ───────────────────────────────────

/**
 * 벡터 검색 결과 / Vector search result with relevance score
 *
 * @description
 * KR: 벡터 유사도 검색 결과. record는 원본 레코드, score는 유사도 점수.
 * EN: Vector similarity search result. record is the original record, score is the similarity score.
 *
 * @template T - 레코드 타입 (CodeRecord, DesignDecision 등)
 */
export interface SearchResult<T> {
  /** 원본 레코드 / Original record */
  readonly record: T;

  /** 유사도 점수 (0~1, 높을수록 유사) / Similarity score (0~1, higher = more similar) */
  readonly score: number;
}

// ── 청크 메타데이터 / Chunk Metadata ────────────────────────────

/**
 * 코드 청크 메타데이터 / Metadata for a code chunk
 *
 * @description
 * KR: 코드 청크의 위치, 언어, 모듈, 함수명 등 부가 정보.
 * EN: Additional info about a code chunk: location, language, module, function name.
 */
export interface ChunkMetadata {
  /** 파일 경로 / File path */
  readonly filePath: string;

  /** 시작 라인 번호 / Start line number */
  readonly startLine: number;

  /** 끝 라인 번호 / End line number */
  readonly endLine: number;

  /** 프로그래밍 언어 / Programming language */
  readonly language: string;

  /** 소속 모듈 (예: 'src/core') / Module path */
  readonly module: string;

  /** 함수/클래스명 (미식별 시 'unknown') / Function or class name */
  readonly functionName: string;
}

// ── 청크 입력 / Chunk Input ─────────────────────────────────────

/**
 * 코드 인덱싱 전 청크 입력 / Input for code indexing before embedding
 *
 * @description
 * KR: chunk-splitter가 생성하여 code-indexer에 전달하는 중간 데이터.
 * EN: Intermediate data produced by chunk-splitter and consumed by code-indexer.
 */
export interface ChunkInput {
  /** 코드 청크 내용 / Code chunk content */
  readonly content: string;

  /** 청크 메타데이터 / Chunk metadata */
  readonly metadata: ChunkMetadata;
}

// ── 청크 옵션 / Chunk Options ───────────────────────────────────

/**
 * 코드 청크 분할 옵션 / Options for code chunking
 *
 * @description
 * KR: 청크 크기, 오버랩 비율 등 분할 동작을 제어하는 옵션.
 * EN: Options controlling chunk size, overlap ratio, and splitting behavior.
 */
export interface ChunkOptions {
  /** 최대 청크 크기 (문자 수, 기본 2000) / Max chunk size in characters (default: 2000) */
  readonly maxChunkSize?: number;

  /** 오버랩 비율 (0~1, 기본 0.1) / Overlap ratio (0~1, default: 0.1) */
  readonly overlapRatio?: number;
}

// ── 인덱서 옵션 / Indexer Options ───────────────────────────────

/**
 * 디렉토리 인덱싱 옵션 / Options for directory indexing
 *
 * @description
 * KR: 인덱싱 대상 확장자, 제외 패턴 등을 제어.
 * EN: Controls file extensions to index and exclusion patterns.
 */
export interface IndexDirectoryOptions {
  /** 인덱싱 대상 파일 확장자 (기본: ts, js, tsx, jsx) / File extensions to index */
  readonly extensions?: readonly string[];

  /** 제외할 디렉토리 패턴 (기본: node_modules, dist, .git) / Directory patterns to exclude */
  readonly excludeDirs?: readonly string[];

  /** 프로젝트 ID (기본: 'default') / Project ID */
  readonly projectId?: string;
}
