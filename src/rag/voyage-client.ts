/**
 * Voyage AI HTTP 클라이언트 / Voyage AI HTTP Client
 *
 * @description
 * KR: Voyage AI API 호출, 응답 파싱, 타임아웃 처리를 담당한다.
 * EN: Handles Voyage AI API calls, response parsing, and timeout handling.
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { normalizeVector } from 'rag/embeddings.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Voyage API 엔드포인트 / Voyage API endpoint */
export const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/** voyage-code-3 차원 수 / voyage-code-3 dimensions */
export const VOYAGE_CODE_DIMENSIONS = 1024;

/** voyage-3-lite 차원 수 / voyage-3-lite dimensions */
export const VOYAGE_LITE_DIMENSIONS = 512;

/** 코드 특화 기본 모델 / Default code-specific model */
export const VOYAGE_CODE_MODEL = 'voyage-code-3';

/** 범용 기본 모델 / Default general-purpose model */
export const VOYAGE_LITE_MODEL = 'voyage-3-lite';

/** 배치 당 최대 텍스트 수 / Max texts per batch */
export const VOYAGE_BATCH_LIMIT = 128;

/** API 요청 타임아웃 (ms) / API request timeout */
export const VOYAGE_TIMEOUT_MS = 30_000;

// ── API 응답 타입 / API response types ─────────────────────────

/** Voyage API 단일 임베딩 응답 / Voyage API single embedding response */
export interface VoyageEmbeddingObject {
  readonly object: 'embedding';
  readonly embedding: number[];
  readonly index: number;
}

/** Voyage API 임베딩 응답 / Voyage API embeddings response */
export interface VoyageEmbeddingsResponse {
  readonly object: 'list';
  readonly data: VoyageEmbeddingObject[];
  readonly model: string;
  readonly usage: {
    readonly total_tokens: number;
  };
}

// ── API 호출 / API call ─────────────────────────────────────────

/**
 * Voyage API 응답을 파싱한다 / Parse Voyage API response
 *
 * @param raw - 원시 API 응답 / Raw API response
 * @returns 파싱된 응답 또는 RagError / Parsed response or RagError
 */
export function parseVoyageResponse(raw: unknown): Result<VoyageEmbeddingsResponse> {
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

/**
 * Voyage API를 호출하여 임베딩 벡터를 반환한다 / Call Voyage API and return embedding vectors
 *
 * @param texts - 최대 128개 텍스트 배열 / Array of at most 128 texts
 * @param apiKey - Voyage API 키 / Voyage API key
 * @param model - 사용할 모델 / Model to use
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns Float32Array 벡터 배열 / Array of Float32Array vectors
 */
export async function callVoyageApi(
  texts: string[],
  apiKey: string,
  model: string,
  logger: Logger,
): Promise<Result<Float32Array[]>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOYAGE_TIMEOUT_MS);

  try {
    const response = await fetch(VOYAGE_API_URL, {
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
      logger.error('Voyage API 오류 / Voyage API error', {
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
      logger.error('Voyage API 타임아웃 / Voyage API timeout', {
        timeoutMs: VOYAGE_TIMEOUT_MS,
      });
      return err(
        new RagError('rag_embedding_error', `Voyage API 타임아웃 (${VOYAGE_TIMEOUT_MS}ms)`),
      );
    }

    logger.error('Voyage API 호출 실패 / Voyage API call failed', {
      error: String(error),
    });
    return err(
      new RagError('rag_embedding_error', `Voyage API 호출 실패: ${String(error)}`, error),
    );
  }
}
