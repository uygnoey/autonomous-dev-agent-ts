/**
 * 임베딩 프로바이더 구현 / Embedding provider implementations
 *
 * @description
 * KR: Huggingface Transformers를 사용한 실제 ML 임베딩 구현.
 *     all-MiniLM-L6-v2 모델 기반 384차원 벡터 생성.
 * EN: Real ML embedding implementation using Huggingface Transformers.
 *     Generates 384-dimensional vectors using all-MiniLM-L6-v2 model.
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { PerfTracker } from 'core/perf.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';

// WHY: @huggingface/transformers를 어떤 형태로도 import 금지.
//      static/dynamic import 모두 Bun 1.3.10에서 모듈 로드 시 OOM 크래시를 유발한다.
//      실제로 필요한 메서드 시그니처만 로컬 타입으로 정의해 런타임 의존성을 완전히 제거한다.
// WHY: tolist()은 Tensor 메서드로 동기 반환. await로 호출해도 JS에서 그대로 동작.
type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] }>;

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 벡터 차원 수 / Default vector dimensions (MiniLM-L6-v2) */
const DEFAULT_DIMENSIONS = 384;

/** 기본 모델 이름 / Default model name */
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

/** 임베딩 캐시 최대 크기 / Max embedding cache entries */
const EMBEDDING_CACHE_MAX_SIZE = 1024;

// ── TransformersEmbeddingProvider ───────────────────────────────

/**
 * Huggingface Transformers 임베딩 프로바이더 / Huggingface Transformers embedding provider
 *
 * @description
 * KR: @huggingface/transformers 라이브러리를 사용하여 실제 ML 임베딩을 생성한다.
 *     all-MiniLM-L6-v2 모델 기반 384차원 벡터를 생성한다.
 *     첫 호출 시 모델을 로드하며, 이후 재사용한다.
 * EN: Generates real ML embeddings using @huggingface/transformers library.
 *     Produces 384-dimensional vectors using all-MiniLM-L6-v2 model.
 *     Loads model on first call, then reuses it.
 *
 * @param name - 프로바이더 이름 / Provider name
 * @param modelName - Huggingface 모델 이름 / Huggingface model name
 * @param dimensions - 벡터 차원 수 / Vector dimensions
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const provider = new TransformersEmbeddingProvider('transformers', 'Xenova/all-MiniLM-L6-v2', 384, logger);
 * await provider.initialize();
 * const result = await provider.embed(['hello world']);
 * if (result.ok) console.log(result.value[0].length); // 384
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly tier: EmbeddingTier = 'free';
  private pipeline: FeatureExtractionPipeline | null = null;
  private initialized = false;
  private readonly perf: PerfTracker;
  private readonly embeddingCache = new Map<string, Float32Array>();

  constructor(
    readonly name: string,
    private readonly modelName: string,
    readonly dimensions: number,
    private readonly logger: Logger,
  ) {
    this.perf = new PerfTracker(logger);
  }

  /**
   * 모델 초기화 / Initialize the ML model
   *
   * @description
   * KR: Huggingface Transformers pipeline을 로드한다. 첫 호출 시 모델 다운로드가 발생할 수 있다.
   * EN: Loads the Huggingface Transformers pipeline. Model download may occur on first call.
   *
   * @returns 초기화 성공 시 ok(void), 실패 시 err(RagError) / ok(void) on success, err(RagError) on failure
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized && this.pipeline !== null) {
      return ok(undefined);
    }

    try {
      this.logger.info('Transformers 모델 로딩 시작', {
        model: this.modelName,
        provider: this.name,
      });

      // WHY: dynamic import — initialize() 호출 시점에만 로드.
      //      모듈 로드 시점에 OOM이 발생하지 않도록 lazy 로드한다.
      const { pipeline } = await this.perf.measureAsync(
        'embedding.dynamicImport',
        () => import('@huggingface/transformers'),
        { warnThresholdMs: 1000, context: { model: this.modelName } },
      );
      // WHY: pipeline('feature-extraction')은 텍스트를 고정 차원 벡터로 변환
      this.pipeline = await this.perf.measureAsync(
        'embedding.pipelineLoad',
        () => pipeline('feature-extraction', this.modelName),
        { warnThresholdMs: 2000, context: { model: this.modelName } },
      );
      this.initialized = true;

      this.logger.info('Transformers 모델 로딩 완료', {
        model: this.modelName,
        dimensions: this.dimensions,
      });

      return ok(undefined);
    } catch (error: unknown) {
      this.logger.error('Transformers 모델 로딩 실패', {
        model: this.modelName,
        error: String(error),
      });
      return err(new RagError('rag_embedding_error', `모델 로딩 실패: ${String(error)}`, error));
    }
  }

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 정규화된 Float32Array 배열 / Normalized Float32Array per text
   */
  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    // WHY: 빈 배열은 즉시 반환 — Transformers pipeline은 빈 배열 처리 불가
    if (texts.length === 0) {
      return ok([]);
    }

    // WHY: 초기화 여부 확인 — 미초기화 시 자동 초기화
    if (!this.initialized || this.pipeline === null) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return err(initResult.error);
      }
    }

    try {
      // WHY: 캐시에서 이미 임베딩된 텍스트를 분리하여 중복 연산 방지
      const uncachedTexts: string[] = [];
      const uncachedIndices: number[] = [];
      const results = new Array<Float32Array>(texts.length);

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i] as string;
        const cached = this.embeddingCache.get(text);
        if (cached !== undefined) {
          results[i] = cached;
        } else {
          uncachedTexts.push(text);
          uncachedIndices.push(i);
        }
      }

      const cacheHits = texts.length - uncachedTexts.length;
      this.logger.debug('임베딩 배치 처리 시작', {
        count: texts.length,
        cacheHits,
        uncached: uncachedTexts.length,
        provider: this.name,
      });

      // WHY: 모든 텍스트가 캐시 히트면 pipeline 호출 불필요
      if (uncachedTexts.length === 0) {
        return ok(results as Float32Array[]);
      }

      // WHY: pipeline null 체크 — initialize()에서 보장하나 타입 안전성 확보
      if (this.pipeline === null) {
        return err(new RagError('rag_embedding_error', 'Pipeline이 초기화되지 않았습니다.'));
      }

      // WHY: pipeline 호출 시 배치 처리 지원 — 한 번에 여러 텍스트 임베딩
      const output = await this.perf.measureAsync(
        'embedding.inference',
        () =>
          (this.pipeline as FeatureExtractionPipeline)(uncachedTexts, {
            pooling: 'mean',
            normalize: true,
          }),
        { warnThresholdMs: 500, context: { batchSize: uncachedTexts.length } },
      );

      // WHY: output.tolist()는 동기 반환 — 중첩 배열, 각 텍스트마다 벡터 1개
      const rawVectors = output.tolist();

      // WHY: Float32Array로 변환 — 메모리 효율 + LanceDB 호환성
      for (let j = 0; j < rawVectors.length; j++) {
        const vec = rawVectors[j] as number[];
        const normalized = normalizeVector(new Float32Array(vec));
        const idx = uncachedIndices[j] as number;
        results[idx] = normalized;

        // WHY: 캐시에 저장하여 동일 텍스트 재임베딩 방지
        const text = uncachedTexts[j] as string;
        this.embeddingCache.set(text, normalized);
      }

      // WHY: 캐시 크기 제한 — FIFO 방식으로 오래된 엔트리 삭제
      if (this.embeddingCache.size > EMBEDDING_CACHE_MAX_SIZE) {
        const excess = this.embeddingCache.size - EMBEDDING_CACHE_MAX_SIZE;
        const keys = this.embeddingCache.keys();
        for (let k = 0; k < excess; k++) {
          const next = keys.next();
          if (!next.done) {
            this.embeddingCache.delete(next.value);
          }
        }
      }

      this.logger.debug('임베딩 배치 처리 완료', { count: results.length });
      return ok(results as Float32Array[]);
    } catch (error: unknown) {
      this.logger.error('임베딩 배치 처리 실패', { error: String(error) });
      return err(new RagError('rag_embedding_error', `임베딩 실패: ${String(error)}`, error));
    }
  }

  /**
   * 단일 쿼리를 벡터로 변환 / Embed a single query to a vector
   *
   * @param query - 임베딩할 쿼리 텍스트 / Query text to embed
   * @returns 정규화된 쿼리 벡터 / Normalized query vector
   */
  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // WHY: embed()를 재사용하여 중복 방지 — 단일 쿼리도 배치 처리로 통일
    const result = await this.embed([query]);
    if (!result.ok) {
      return err(result.error);
    }

    // WHY: 배치 결과의 첫 번째 벡터 반환 — 입력이 1개이므로 결과도 1개
    const vector = result.value[0];
    if (vector === undefined) {
      this.logger.error('쿼리 임베딩 결과 없음', { query });
      return err(new RagError('rag_embedding_error', '임베딩 결과가 비어있음'));
    }

    return ok(vector);
  }

  /**
   * 성능 측정 결과 반환 / Get performance profiling entries
   */
  getPerfEntries() {
    return this.perf.getEntries();
  }

  /**
   * 성능 측정 요약 로깅 / Log performance profiling summary
   */
  logPerfSummary(): void {
    this.perf.summary();
  }
}

// ── 유틸리티 / Utilities ────────────────────────────────────────

/**
 * 벡터를 L2 정규화 / L2 normalize a vector
 *
 * @param vector - 정규화할 벡터 / Vector to normalize
 * @returns L2 정규화된 벡터 (길이 ≈ 1.0) / L2 normalized vector (length ≈ 1.0)
 */
export function normalizeVector(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    const val = vector[i] ?? 0;
    sumSquares += val * val;
  }

  const magnitude = Math.sqrt(sumSquares);

  // WHY: 영벡터 방지 — magnitude가 0이면 그대로 반환
  if (magnitude === 0) return vector;

  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = (vector[i] ?? 0) / magnitude;
  }

  return normalized;
}

/**
 * 기본 설정으로 TransformersEmbeddingProvider를 생성 / Create a TransformersEmbeddingProvider with defaults
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param name - 프로바이더 이름 (기본: 'transformers') / Provider name
 * @param modelName - Huggingface 모델 이름 (기본: 'Xenova/all-MiniLM-L6-v2') / Huggingface model name
 * @param dimensions - 벡터 차원 수 (기본: 384) / Vector dimensions
 * @returns TransformersEmbeddingProvider 인스턴스 / TransformersEmbeddingProvider instance
 *
 * @example
 * const provider = createTransformersEmbeddingProvider(logger);
 * await provider.initialize();
 * const result = await provider.embedQuery('hello');
 */
export function createTransformersEmbeddingProvider(
  logger: Logger,
  name = 'transformers',
  modelName = DEFAULT_MODEL,
  dimensions = DEFAULT_DIMENSIONS,
): TransformersEmbeddingProvider {
  return new TransformersEmbeddingProvider(name, modelName, dimensions, logger);
}
