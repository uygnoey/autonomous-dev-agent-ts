/**
 * OpenAI 임베딩 프로바이더 / OpenAI Embedding Provider
 *
 * @description
 * KR: OpenAI Embeddings API를 사용하는 유료 임베딩 프로바이더.
 *     text-embedding-3-small (1536차원), text-embedding-3-large (3072차원) 지원.
 * EN: Paid embedding provider using OpenAI Embeddings API.
 *     Supports text-embedding-3-small (1536 dims), text-embedding-3-large (3072 dims).
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { normalizeVector } from 'rag/embeddings.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** OpenAI Embeddings API 엔드포인트 / OpenAI Embeddings API endpoint */
export const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

/** text-embedding-3-small 차원 수 / text-embedding-3-small dimensions */
export const OPENAI_SMALL_DIMENSIONS = 1536;

/** text-embedding-3-large 차원 수 / text-embedding-3-large dimensions */
export const OPENAI_LARGE_DIMENSIONS = 3072;

/** 기본 모델 / Default model */
export const OPENAI_SMALL_MODEL = 'text-embedding-3-small';

/** 대형 모델 / Large model */
export const OPENAI_LARGE_MODEL = 'text-embedding-3-large';

/** 배치 당 최대 텍스트 수 / Max texts per batch */
export const OPENAI_BATCH_LIMIT = 2048;

/** API 요청 타임아웃 (ms) / API request timeout */
export const OPENAI_TIMEOUT_MS = 30_000;

// ── API 응답 타입 / API response types ─────────────────────────

/** OpenAI API 단일 임베딩 응답 / OpenAI API single embedding response */
export interface OpenAIEmbeddingObject {
  readonly object: 'embedding';
  readonly embedding: number[];
  readonly index: number;
}

/** OpenAI API 임베딩 응답 / OpenAI API embeddings response */
export interface OpenAIEmbeddingsResponse {
  readonly object: 'list';
  readonly data: OpenAIEmbeddingObject[];
  readonly model: string;
  readonly usage: {
    readonly prompt_tokens: number;
    readonly total_tokens: number;
  };
}

// ── 응답 파싱 / Response parsing ────────────────────────────────

/**
 * OpenAI API 응답을 파싱한다 / Parse OpenAI API response
 *
 * @param raw - 원시 API 응답 / Raw API response
 * @returns 파싱된 응답 또는 RagError / Parsed response or RagError
 */
export function parseOpenAIResponse(raw: unknown): Result<OpenAIEmbeddingsResponse> {
  if (typeof raw !== 'object' || raw === null) {
    return err(new RagError('rag_embedding_error', 'OpenAI 응답이 객체가 아님'));
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.data)) {
    return err(new RagError('rag_embedding_error', 'OpenAI 응답에 data 배열 없음'));
  }

  for (const item of obj.data) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !Array.isArray((item as Record<string, unknown>).embedding) ||
      typeof (item as Record<string, unknown>).index !== 'number'
    ) {
      return err(new RagError('rag_embedding_error', 'OpenAI 응답 data 항목 형식 오류'));
    }
  }

  return ok(raw as OpenAIEmbeddingsResponse);
}

// ── API 호출 / API call ─────────────────────────────────────────

/**
 * OpenAI API를 호출하여 임베딩 벡터를 반환한다 / Call OpenAI API and return embedding vectors
 *
 * @param texts - 텍스트 배열 / Array of texts
 * @param apiKey - OpenAI API 키 / OpenAI API key
 * @param model - 사용할 모델 / Model to use
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns Float32Array 벡터 배열 / Array of Float32Array vectors
 */
export async function callOpenAIApi(
  texts: string[],
  apiKey: string,
  model: string,
  logger: Logger,
): Promise<Result<Float32Array[]>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenAI API 오류 / OpenAI API error', {
        status: response.status,
        error: errorText.slice(0, 200),
      });
      return err(
        new RagError(
          'rag_embedding_error',
          `OpenAI API 오류 (${response.status}): ${errorText.slice(0, 200)}`,
        ),
      );
    }

    const json: unknown = await response.json();
    const parsed = parseOpenAIResponse(json);
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
      logger.error('OpenAI API 타임아웃 / OpenAI API timeout', {
        timeoutMs: OPENAI_TIMEOUT_MS,
      });
      return err(
        new RagError('rag_embedding_error', `OpenAI API 타임아웃 (${OPENAI_TIMEOUT_MS}ms)`),
      );
    }

    logger.error('OpenAI API 호출 실패 / OpenAI API call failed', {
      error: String(error),
    });
    return err(
      new RagError('rag_embedding_error', `OpenAI API 호출 실패: ${String(error)}`, error),
    );
  }
}

// ── OpenAIEmbeddingProvider ─────────────────────────────────────

/**
 * OpenAI Embeddings API 임베딩 프로바이더 / OpenAI Embeddings API embedding provider
 *
 * @description
 * KR: OpenAI API를 호출하여 텍스트 임베딩을 생성한다.
 *     배치 당 최대 2048개 제한을 준수하며 자동 분할 처리한다.
 *     API 키는 생성자를 통해 주입받는다.
 * EN: Calls OpenAI API to generate text embeddings.
 *     Automatically splits batches to respect the 2048-text limit.
 *     API key is injected via constructor.
 *
 * @example
 * const provider = new OpenAIEmbeddingProvider(logger, apiKey);
 * const result = await provider.embed(['function foo() {}']);
 * if (result.ok) console.log(result.value[0].length); // 1536
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly tier: EmbeddingTier = 'paid';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    apiKey: string,
    name = 'openai-small',
    model = OPENAI_SMALL_MODEL,
    dimensions = OPENAI_SMALL_DIMENSIONS,
  ) {
    this.logger = logger.child({ module: 'openai-embeddings' });
    this.name = name;
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @description
   * KR: 2048개 초과 시 자동으로 서브배치로 분할하여 순차 처리한다.
   * EN: Automatically splits into sub-batches if texts exceed 2048, processes sequentially.
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 정규화된 Float32Array 배열 / Normalized Float32Array per text
   */
  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    // WHY: 빈 배열은 즉시 반환 — API 호출 불필요
    if (texts.length === 0) {
      return ok([]);
    }

    this.logger.debug('OpenAI 임베딩 배치 시작 / Starting OpenAI embed batch', {
      count: texts.length,
      batchLimit: OPENAI_BATCH_LIMIT,
    });

    const allVectors: Float32Array[] = [];

    // WHY: 배치 2048개 제한 — OpenAI API 제약 준수
    for (let offset = 0; offset < texts.length; offset += OPENAI_BATCH_LIMIT) {
      const subBatch = texts.slice(offset, offset + OPENAI_BATCH_LIMIT);
      const subResult = await callOpenAIApi(subBatch, this.apiKey, this.model, this.logger);
      if (!subResult.ok) {
        return err(subResult.error);
      }
      allVectors.push(...subResult.value);
    }

    this.logger.debug('OpenAI 임베딩 배치 완료 / OpenAI embed batch done', {
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
      this.logger.error('OpenAI 쿼리 임베딩 결과 없음 / OpenAI query embed returned empty', {
        query,
      });
      return err(new RagError('rag_embedding_error', 'OpenAI 쿼리 임베딩 결과가 비어있음'));
    }

    return ok(vector);
  }
}

// ── 팩토리 함수 / Factory functions ─────────────────────────────

/**
 * text-embedding-3-small OpenAIEmbeddingProvider를 생성 / Create a small OpenAIEmbeddingProvider
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - OpenAI API 키 / OpenAI API key
 * @param name - 프로바이더 이름 (기본: 'openai-small') / Provider name
 * @returns OpenAIEmbeddingProvider 인스턴스 / OpenAIEmbeddingProvider instance
 */
export function createOpenAISmallEmbeddingProvider(
  logger: Logger,
  apiKey: string,
  name = 'openai-small',
): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(
    logger,
    apiKey,
    name,
    OPENAI_SMALL_MODEL,
    OPENAI_SMALL_DIMENSIONS,
  );
}

/**
 * text-embedding-3-large OpenAIEmbeddingProvider를 생성 / Create a large OpenAIEmbeddingProvider
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param apiKey - OpenAI API 키 / OpenAI API key
 * @param name - 프로바이더 이름 (기본: 'openai-large') / Provider name
 * @returns OpenAIEmbeddingProvider 인스턴스 / OpenAIEmbeddingProvider instance
 */
export function createOpenAILargeEmbeddingProvider(
  logger: Logger,
  apiKey: string,
  name = 'openai-large',
): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(
    logger,
    apiKey,
    name,
    OPENAI_LARGE_MODEL,
    OPENAI_LARGE_DIMENSIONS,
  );
}
