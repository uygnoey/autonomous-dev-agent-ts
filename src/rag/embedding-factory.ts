/**
 * 임베딩 프로바이더 팩토리 / Embedding provider factory
 *
 * @description
 * KR: 스펙 Section 13의 4개 임베딩 프로바이더 중 설정 기반으로 선택하여 생성한다.
 *     - Tier 1 무료: xenova-minilm (기본값), jina-v3
 *     - Tier 2 유료: voyage-3-lite, voyage-code-3 (API 키 필요)
 * EN: Creates one of 4 embedding providers based on configuration (Spec Section 13).
 *     - Tier 1 free: xenova-minilm (default), jina-v3
 *     - Tier 2 paid: voyage-3-lite, voyage-code-3 (requires API key)
 */

import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { createTransformersEmbeddingProvider } from 'rag/embeddings.js';
import { createJinaEmbeddingProvider } from 'rag/jina-embeddings.js';
import type { EmbeddingProvider } from 'rag/types.js';
import {
  createVoyageEmbeddingProvider,
  createVoyageLiteEmbeddingProvider,
} from 'rag/voyage-embeddings.js';

// ── 유효한 프로바이더 타입 목록 / Valid provider type list ──────

/** 지원하는 임베딩 프로바이더 식별자 집합 / Set of supported provider identifiers */
const VALID_PROVIDER_TYPES = new Set([
  'xenova-minilm',
  'jina-v3',
  'voyage-3-lite',
  'voyage-code-3',
] as const);

// ── 타입 정의 / Type definitions ─────────────────────────────────

/**
 * 스펙 Section 13의 4개 임베딩 프로바이더 타입 / 4 embedding provider types from Spec Section 13
 *
 * @description
 * KR: xenova-minilm, jina-v3 는 로컬 무료, voyage-3-lite, voyage-code-3 는 유료 API.
 * EN: xenova-minilm, jina-v3 are local/free; voyage-3-lite, voyage-code-3 are paid API.
 */
export type EmbeddingProviderType = 'xenova-minilm' | 'jina-v3' | 'voyage-3-lite' | 'voyage-code-3';

/**
 * 임베딩 팩토리 설정 / Configuration for the embedding factory
 *
 * @description
 * KR: 프로바이더 타입과 선택적 Voyage API 키, 로거를 포함한다.
 *     voyage-* 타입 사용 시 voyageApiKey가 반드시 필요하다.
 * EN: Contains provider type, optional Voyage API key, and logger.
 *     voyageApiKey is required when using voyage-* types.
 */
export interface EmbeddingFactoryConfig {
  /** 사용할 프로바이더 타입 / Provider type to use */
  readonly type: EmbeddingProviderType;

  /** Voyage API 키 (voyage-* 타입 사용 시 필수) / Voyage API key (required for voyage-* types) */
  readonly voyageApiKey?: string;

  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
}

// ── 팩토리 함수 / Factory function ─────────────────────────────

/**
 * 설정 기반으로 EmbeddingProvider를 생성한다 / Create an EmbeddingProvider based on configuration
 *
 * @description
 * KR: type 필드에 따라 적절한 프로바이더를 반환한다.
 *     voyage-* 타입은 voyageApiKey가 없으면 err를 반환한다.
 * EN: Returns the appropriate provider based on the type field.
 *     voyage-* types return err if voyageApiKey is missing.
 *
 * @param config - 팩토리 설정 / Factory configuration
 * @returns EmbeddingProvider 인스턴스 또는 RagError / EmbeddingProvider instance or RagError
 *
 * @example
 * // 무료 기본값 (Xenova)
 * const result = createEmbeddingProvider({ type: 'xenova-minilm', logger });
 * if (result.ok) await result.value.embed(['hello']);
 *
 * @example
 * // 유료 Voyage (API 키 필요)
 * const result = createEmbeddingProvider({ type: 'voyage-code-3', voyageApiKey: 'va-...', logger });
 */
export function createEmbeddingProvider(config: EmbeddingFactoryConfig): Result<EmbeddingProvider> {
  const { type, voyageApiKey, logger } = config;

  switch (type) {
    case 'xenova-minilm': {
      // WHY: Transformers 기본값 — API 키 불필요, 로컬 무료 실행
      return ok(createTransformersEmbeddingProvider(logger));
    }

    case 'jina-v3': {
      // WHY: Jina v3 로컬 모델 — API 키 불필요, 1024차원 고품질
      return ok(createJinaEmbeddingProvider(logger));
    }

    case 'voyage-3-lite': {
      if (!voyageApiKey) {
        return err(
          new RagError(
            'rag_embedding_error',
            "voyage-3-lite 프로바이더는 voyageApiKey가 필요합니다. / 'voyageApiKey' is required for voyage-3-lite provider.",
          ),
        );
      }
      // WHY: 범용 Voyage 모델 — 자연어 문서에 적합, 512차원
      return ok(createVoyageLiteEmbeddingProvider(logger, voyageApiKey));
    }

    case 'voyage-code-3': {
      if (!voyageApiKey) {
        return err(
          new RagError(
            'rag_embedding_error',
            "voyage-code-3 프로바이더는 voyageApiKey가 필요합니다. / 'voyageApiKey' is required for voyage-code-3 provider.",
          ),
        );
      }
      // WHY: 코드 특화 Voyage 모델 — 코드 임베딩 최적화, 1024차원
      return ok(createVoyageEmbeddingProvider(logger, voyageApiKey));
    }
  }
}

// ── 파싱 함수 / Parsing function ─────────────────────────────────

/**
 * config.json에서 읽은 문자열을 EmbeddingProviderType으로 변환 / Parse raw string to EmbeddingProviderType
 *
 * @description
 * KR: 유효하지 않은 값이면 err(RagError)를 반환한다.
 *     대소문자 구분 없이 처리하지 않으며 정확한 값이 필요하다.
 * EN: Returns err(RagError) for invalid values.
 *     Case-sensitive: exact string match is required.
 *
 * @param raw - config에서 읽은 원시 문자열 / Raw string read from config
 * @returns EmbeddingProviderType 또는 RagError / EmbeddingProviderType or RagError
 *
 * @example
 * const result = parseEmbeddingProviderType('voyage-code-3');
 * if (result.ok) console.log(result.value); // 'voyage-code-3'
 *
 * @example
 * const result = parseEmbeddingProviderType('unknown-model');
 * if (!result.ok) console.error(result.error.message); // 에러 메시지
 */
export function parseEmbeddingProviderType(raw: string): Result<EmbeddingProviderType> {
  // WHY: Set 조회로 O(1) 검사 — 배열 includes()보다 효율적
  if (VALID_PROVIDER_TYPES.has(raw as EmbeddingProviderType)) {
    return ok(raw as EmbeddingProviderType);
  }

  const validList = [...VALID_PROVIDER_TYPES].join(', ');
  return err(
    new RagError(
      'rag_embedding_error',
      `유효하지 않은 임베딩 프로바이더 타입: "${raw}". 허용값: ${validList} / Invalid embedding provider type: "${raw}". Allowed: ${validList}`,
    ),
  );
}
