/**
 * Voyage 임베딩 프로바이더 / Voyage Embedding Provider
 *
 * @description
 * KR: Voyage AI HTTP API를 사용하는 유료 임베딩 프로바이더.
 *     코드 특화: voyage-code-3 (1024차원), 범용: voyage-3-lite (512차원).
 *     배치 당 최대 128개 텍스트 제한 준수.
 *     VOYAGE_API_KEY 필요.
 * EN: Paid embedding provider using Voyage AI HTTP API.
 *     Code-specific: voyage-code-3 (1024d), General-purpose: voyage-3-lite (512d).
 *     Respects max 128 texts per batch limit.
 *     Requires VOYAGE_API_KEY.
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { normalizeVector } from 'rag/embeddings.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Voyage API 엔드포인트 / Voyage API endpoint */
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/** voyage-code-3 차원 수 / voyage-code-3 dimensions */
const VOYAGE_CODE_DIMENSIONS = 1024;

/** voyage-3-lite 차원 수 / voyage-3-lite dimensions */
const VOYAGE_LITE_DIMENSIONS = 512;

/** 코드 특화 기본 모델 / Default code-specific model */
const VOYAGE_CODE_MODEL = 'voyage-code-3';

/** 범용 기본 모델 / Default general-purpose model */
const VOYAGE_LITE_MODEL = 'voyage-3-lite';

/** 배치 당 최대 텍스트 수 / Max texts per batch */
const VOYAGE_BATCH_LIMIT = 128;

/** API 요청 타임아웃 (ms) / API request timeout */
const VOYAGE_TIMEOUT_MS = 30_000;

// ── API 응답 타입 / API response types ─────────────────────────

/** Voyage API 단일 임베딩 응답 / Voyage API single embedding response */
interface VoyageEmbeddingObject {
  readonly object: 'embedding';
  readonly embedding: number[];
  readonly index: number;
}

/** Voyage API 임베딩 응답 / Voyage API embeddings response */
interface VoyageEmbeddingsResponse {
  readonly object: 'list';
  readonly data: VoyageEmbeddingObject[];
  readonly model: string;
  readonly usage: {
    readonly total_tokens: number;
  };
}

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
      const subResult = await this.callApi(subBatch);
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

  // ── 내부 메서드 / Private methods ──────────────────────────────

  /**
   * Voyage API 호출 (서브배치 단위) / Call Voyage API for a sub-batch
   *
   * @param texts - 최대 128개 텍스트 배열 / Array of at most 128 texts
   * @returns Float32Array 벡터 배열 / Array of Float32Array vectors
   */
  private async callApi(texts: string[]): Promise<Result<Float32Array[]>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VOYAGE_TIMEOUT_MS);

    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: this.model,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Voyage API 오류 / Voyage API error', {
          status: response.status,
          error: errorText.slice(0, 200),
        });
        return err(
          new RagError(
            'rag_embedding_error',
            `Voyage API 오류 (${response.status}): ${errorText.slice(0, 200)}`,
          ),
        );
      }

      const json: unknown = await response.json();
      const parsed = parseVoyageResponse(json);
      if (!parsed.ok) {
        return err(parsed.error);
      }

      // WHY: index 순서대로 정렬 — API 응답이 순서를 보장하지 않을 수 있음
      const sorted = [...parsed.value.data].sort((a, b) => a.index - b.index);

      const vectors = sorted.map((item) => normalizeVector(new Float32Array(item.embedding)));
      return ok(vectors);
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error('Voyage API 타임아웃 / Voyage API timeout', {
          timeoutMs: VOYAGE_TIMEOUT_MS,
        });
        return err(
          new RagError('rag_embedding_error', `Voyage API 타임아웃 (${VOYAGE_TIMEOUT_MS}ms)`),
        );
      }

      this.logger.error('Voyage API 호출 실패 / Voyage API call failed', {
        error: String(error),
      });
      return err(
        new RagError('rag_embedding_error', `Voyage API 호출 실패: ${String(error)}`, error),
      );
    }
  }
}

// ── 내부 파싱 함수 / Internal parsing ──────────────────────────

/**
 * Voyage API 응답을 파싱한다 / Parse Voyage API response
 *
 * @param raw - 원시 API 응답 / Raw API response
 * @returns 파싱된 응답 또는 RagError / Parsed response or RagError
 */
function parseVoyageResponse(raw: unknown): Result<VoyageEmbeddingsResponse> {
  if (typeof raw !== 'object' || raw === null) {
    return err(new RagError('rag_embedding_error', 'Voyage 응답이 객체가 아님'));
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.data)) {
    return err(new RagError('rag_embedding_error', 'Voyage 응답에 data 배열 없음'));
  }

  for (const item of obj.data) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !Array.isArray((item as Record<string, unknown>).embedding) ||
      typeof (item as Record<string, unknown>).index !== 'number'
    ) {
      return err(new RagError('rag_embedding_error', 'Voyage 응답 data 항목 형식 오류'));
    }
  }

  return ok(raw as VoyageEmbeddingsResponse);
}

// ── 팩토리 함수 / Factory function ─────────────────────────────

/**
 * 코드 특화 VoyageEmbeddingProvider를 생성 / Create a code-specific VoyageEmbeddingProvider
 *
 * @description
 * KR: voyage-code-3 모델 (1024차원, 코드 특화).
 * EN: Uses voyage-code-3 model (1024 dims, code-specific).
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - Voyage API 키 / Voyage API key
 * @param name - 프로바이더 이름 (기본: 'voyage-code-3') / Provider name
 * @returns VoyageEmbeddingProvider 인스턴스 / VoyageEmbeddingProvider instance
 *
 * @example
 * const provider = createVoyageEmbeddingProvider(logger, apiKey);
 * const result = await provider.embedQuery('const x = 1;');
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
 * @description
 * KR: voyage-3-lite 모델 (512차원, 범용). 코드 외 자연어 문서에 적합.
 * EN: Uses voyage-3-lite model (512 dims, general-purpose). Suited for natural language docs.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - Voyage API 키 / Voyage API key
 * @param name - 프로바이더 이름 (기본: 'voyage-3-lite') / Provider name
 * @returns VoyageEmbeddingProvider 인스턴스 / VoyageEmbeddingProvider instance
 *
 * @example
 * const provider = createVoyageLiteEmbeddingProvider(logger, apiKey);
 * const result = await provider.embedQuery('프로젝트 요구사항 문서');
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
