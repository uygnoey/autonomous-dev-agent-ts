/**
 * Jina 임베딩 프로바이더 / Jina Embedding Provider
 *
 * @description
 * KR: jinaai/jina-embeddings-v3 모델을 사용하는 로컬 임베딩 프로바이더.
 *     @huggingface/transformers pipeline 기반 1024차원 벡터 생성.
 *     API 키 불필요 — 무료 로컬 실행.
 * EN: Local embedding provider using jinaai/jina-embeddings-v3 model.
 *     Generates 1024-dimensional vectors via @huggingface/transformers pipeline.
 *     No API key required — free local execution.
 */

import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { normalizeVector } from 'rag/embeddings.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Jina v3 벡터 차원 수 / Jina v3 vector dimensions */
const JINA_DIMENSIONS = 1024;

/** Jina v3 모델 이름 / Jina v3 model name */
const JINA_MODEL = 'jinaai/jina-embeddings-v3';

// ── JinaEmbeddingProvider ────────────────────────────────────────

/**
 * Jina 임베딩 프로바이더 / Jina Embedding Provider
 *
 * @description
 * KR: jinaai/jina-embeddings-v3 모델 기반 1024차원 벡터 임베딩 프로바이더.
 *     API 키 없이 로컬에서 무료로 실행 가능.
 *     첫 호출 시 모델을 초기화하고 이후 재사용한다.
 * EN: 1024-dimensional embedding provider based on jinaai/jina-embeddings-v3.
 *     Runs locally for free with no API key.
 *     Initializes model on first call and reuses it.
 *
 * @example
 * const provider = new JinaEmbeddingProvider(logger);
 * await provider.initialize();
 * const result = await provider.embed(['hello world']);
 * if (result.ok) console.log(result.value[0].length); // 1024
 */
export class JinaEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number = JINA_DIMENSIONS;
  readonly tier: EmbeddingTier = 'free';

  private readonly modelName: string;
  private readonly logger: Logger;
  private pipelineInstance: FeatureExtractionPipeline | null = null;
  private initialized = false;

  constructor(logger: Logger, name = 'jina-v3', modelName = JINA_MODEL) {
    this.logger = logger.child({ module: 'jina-embeddings' });
    this.name = name;
    this.modelName = modelName;
  }

  /**
   * 모델 초기화 / Initialize the Jina model
   *
   * @description
   * KR: @huggingface/transformers pipeline을 로드한다. 첫 호출 시 모델 다운로드가 발생할 수 있다.
   * EN: Loads the @huggingface/transformers pipeline. Model download may occur on first call.
   *
   * @returns 초기화 성공 시 ok(void), 실패 시 err(RagError) / ok(void) on success, err(RagError) on failure
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized && this.pipelineInstance !== null) {
      return ok(undefined);
    }

    try {
      this.logger.info('Jina 모델 로딩 시작 / Loading Jina model', {
        model: this.modelName,
        dimensions: this.dimensions,
      });

      // WHY: pipeline('feature-extraction')은 텍스트를 고정 차원 벡터로 변환
      this.pipelineInstance = await pipeline('feature-extraction', this.modelName);
      this.initialized = true;

      this.logger.info('Jina 모델 로딩 완료 / Jina model loaded', {
        model: this.modelName,
        dimensions: this.dimensions,
      });

      return ok(undefined);
    } catch (error: unknown) {
      this.logger.error('Jina 모델 로딩 실패 / Jina model load failed', {
        model: this.modelName,
        error: String(error),
      });
      return err(
        new RagError('rag_embedding_error', `Jina 모델 로딩 실패: ${String(error)}`, error),
      );
    }
  }

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 정규화된 Float32Array 배열 / Normalized Float32Array per text
   */
  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    // WHY: 빈 배열은 즉시 반환 — pipeline은 빈 배열 처리 불가
    if (texts.length === 0) {
      return ok([]);
    }

    // WHY: 미초기화 시 자동 초기화하여 사용성 향상
    if (!this.initialized || this.pipelineInstance === null) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return err(initResult.error);
      }
    }

    try {
      this.logger.debug('Jina 임베딩 배치 시작 / Starting Jina embed batch', {
        count: texts.length,
      });

      // WHY: pipelineInstance null 체크 — initialize()에서 보장하나 TypeScript 타입 안전성 확보
      if (this.pipelineInstance === null) {
        return err(new RagError('rag_embedding_error', 'Jina pipeline이 초기화되지 않았습니다.'));
      }

      const output = await this.pipelineInstance(texts, { pooling: 'mean', normalize: true });
      const rawVectors = await output.tolist();

      // WHY: Float32Array + L2 정규화 — 메모리 효율 + LanceDB 호환성
      const vectors = rawVectors.map((vec: number[]) => {
        return normalizeVector(new Float32Array(vec));
      });

      this.logger.debug('Jina 임베딩 배치 완료 / Jina embed batch done', {
        count: vectors.length,
        dimensions: this.dimensions,
      });

      return ok(vectors);
    } catch (error: unknown) {
      this.logger.error('Jina 임베딩 배치 실패 / Jina embed batch failed', {
        error: String(error),
      });
      return err(new RagError('rag_embedding_error', `Jina 임베딩 실패: ${String(error)}`, error));
    }
  }

  /**
   * 단일 쿼리를 벡터로 변환 / Embed a single query to a vector
   *
   * @param query - 임베딩할 쿼리 텍스트 / Query text to embed
   * @returns 정규화된 쿼리 벡터 / Normalized query vector
   */
  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // WHY: embed()를 재사용 — 로직 중복 방지
    const result = await this.embed([query]);
    if (!result.ok) {
      return err(result.error);
    }

    const vector = result.value[0];
    if (vector === undefined) {
      this.logger.error('Jina 쿼리 임베딩 결과 없음 / Jina query embed returned empty', {
        query,
      });
      return err(new RagError('rag_embedding_error', 'Jina 쿼리 임베딩 결과가 비어있음'));
    }

    return ok(vector);
  }
}

// ── 팩토리 함수 / Factory function ─────────────────────────────

/**
 * 기본 설정으로 JinaEmbeddingProvider를 생성 / Create a JinaEmbeddingProvider with defaults
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param name - 프로바이더 이름 (기본: 'jina-v3') / Provider name
 * @returns JinaEmbeddingProvider 인스턴스 / JinaEmbeddingProvider instance
 *
 * @example
 * const provider = createJinaEmbeddingProvider(logger);
 * await provider.initialize();
 * const result = await provider.embedQuery('hello');
 */
export function createJinaEmbeddingProvider(
  logger: Logger,
  name = 'jina-v3',
): JinaEmbeddingProvider {
  return new JinaEmbeddingProvider(logger, name);
}
