/**
 * Voyage 임베딩 프로바이더 / Voyage Embedding Provider
 *
 * @description
 * KR: Voyage AI HTTP API를 사용하는 유료 임베딩 프로바이더.
 *     HTTP 클라이언트 로직은 voyage-client.ts에 분리.
 * EN: Paid embedding provider using Voyage AI HTTP API.
 *     HTTP client logic is separated into voyage-client.ts.
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';
import {
  VOYAGE_BATCH_LIMIT,
  VOYAGE_CODE_DIMENSIONS,
  VOYAGE_CODE_MODEL,
  VOYAGE_LITE_DIMENSIONS,
  VOYAGE_LITE_MODEL,
  callVoyageApi,
} from 'rag/voyage-client.js';

// ── VoyageEmbeddingProvider ─────────────────────────────────────

/**
 * Voyage AI HTTP API 임베딩 프로바이더 / Voyage AI HTTP API embedding provider
 *
 * @description
 * KR: Voyage AI API를 호출하여 고품질 코드 임베딩을 생성한다.
 *     배치 당 최대 128개 제한을 준수하며 자동 분할 처리한다.
 *     API 키는 생성자를 통해 주입받는다.
 * EN: Calls Voyage AI API to generate high-quality code embeddings.
 *     Automatically splits batches to respect the 128-text limit.
 *     API key is injected via constructor.
 *
 * @example
 * const provider = new VoyageEmbeddingProvider('voyage-code-2', apiKey, logger);
 * const result = await provider.embed(['function foo() {}']);
 * if (result.ok) console.log(result.value[0].length); // 1536
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly tier: EmbeddingTier = 'paid';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    apiKey: string,
    name = 'voyage-code-3',
    model = VOYAGE_CODE_MODEL,
    dimensions = VOYAGE_CODE_DIMENSIONS,
  ) {
    this.logger = logger.child({ module: 'voyage-embeddings' });
    this.name = name;
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @description
   * KR: 128개 초과 시 자동으로 서브배치로 분할하여 순차 처리한다.
   * EN: Automatically splits into sub-batches if texts exceed 128, processes sequentially.
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 정규화된 Float32Array 배열 / Normalized Float32Array per text
   */
  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    // WHY: 빈 배열은 즉시 반환 — API 호출 불필요
    if (texts.length === 0) {
      return ok([]);
    }

    this.logger.debug('Voyage 임베딩 배치 시작 / Starting Voyage embed batch', {
      count: texts.length,
      batchLimit: VOYAGE_BATCH_LIMIT,
    });

    const allVectors: Float32Array[] = [];

    // WHY: 배치 128개 제한 — Voyage API 제약 준수
    for (let offset = 0; offset < texts.length; offset += VOYAGE_BATCH_LIMIT) {
      const subBatch = texts.slice(offset, offset + VOYAGE_BATCH_LIMIT);
      const subResult = await callVoyageApi(subBatch, this.apiKey, this.model, this.logger);
      if (!subResult.ok) {
        return err(subResult.error);
      }
      allVectors.push(...subResult.value);
    }

    this.logger.debug('Voyage 임베딩 배치 완료 / Voyage embed batch done', {
      count: allVectors.length,
    });

    return ok(allVectors);
  }

  /**
   * 단일 쿼리를 벡터로 변환 / Embed a single query to a vector
   *
   * @param query - 임베딩할 쿼리 텍스트 / Query text to embed
   * @returns 정규화된 쿼리 벡터 / Normalized query vector
   */
  async embedQuery(query: string): Promise<Result<Float32Array>> {
    // WHY: embed()를 재사용 — 단일 쿼리도 배치 처리로 통일
    const result = await this.embed([query]);
    if (!result.ok) {
      return err(result.error);
    }

    const vector = result.value[0];
    if (vector === undefined) {
      this.logger.error('Voyage 쿼리 임베딩 결과 없음 / Voyage query embed returned empty', {
        query,
      });
      return err(new RagError('rag_embedding_error', 'Voyage 쿼리 임베딩 결과가 비어있음'));
    }

    return ok(vector);
  }
}

// ── 팩토리 함수 / Factory functions ─────────────────────────────

/**
 * 코드 특화 VoyageEmbeddingProvider를 생성 / Create a code-specific VoyageEmbeddingProvider
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - Voyage API 키 / Voyage API key
 * @param name - 프로바이더 이름 (기본: 'voyage-code-3') / Provider name
 * @returns VoyageEmbeddingProvider 인스턴스 / VoyageEmbeddingProvider instance
 */
export function createVoyageEmbeddingProvider(
  logger: Logger,
  apiKey: string,
  name = 'voyage-code-3',
): VoyageEmbeddingProvider {
  return new VoyageEmbeddingProvider(
    logger,
    apiKey,
    name,
    VOYAGE_CODE_MODEL,
    VOYAGE_CODE_DIMENSIONS,
  );
}

/**
 * 범용 VoyageEmbeddingProvider를 생성 / Create a general-purpose VoyageEmbeddingProvider
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - Voyage API 키 / Voyage API key
 * @param name - 프로바이더 이름 (기본: 'voyage-3-lite') / Provider name
 * @returns VoyageEmbeddingProvider 인스턴스 / VoyageEmbeddingProvider instance
 */
export function createVoyageLiteEmbeddingProvider(
  logger: Logger,
  apiKey: string,
  name = 'voyage-3-lite',
): VoyageEmbeddingProvider {
  return new VoyageEmbeddingProvider(
    logger,
    apiKey,
    name,
    VOYAGE_LITE_MODEL,
    VOYAGE_LITE_DIMENSIONS,
  );
}
