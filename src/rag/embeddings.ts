/**
 * 임베딩 프로바이더 구현 / Embedding provider implementations
 *
 * @description
 * KR: 4-Tier 임베딩 전략의 기본 로컬 프로바이더를 구현한다.
 *     실제 모델(Xenova/Jina/Voyage) 로딩은 추후 교체 가능하도록 인터페이스 분리.
 * EN: Implements the base local provider for the 4-tier embedding strategy.
 *     Real model loading (Xenova/Jina/Voyage) can be swapped via the interface.
 */

import { RagError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { EmbeddingProvider, EmbeddingTier } from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 벡터 차원 수 / Default vector dimensions (MiniLM-L6-v2 호환) */
const DEFAULT_DIMENSIONS = 384;

// ── LocalEmbeddingProvider ──────────────────────────────────────

/**
 * 로컬 임베딩 프로바이더 (플레이스홀더) / Local embedding provider (placeholder)
 *
 * @description
 * KR: 정규화된 결정론적 벡터를 생성하는 플레이스홀더 프로바이더.
 *     실제 Xenova/Jina 모델 로딩으로 교체될 예정.
 *     동일 텍스트에 대해 동일 벡터를 반환하여 테스트 재현성을 보장한다.
 * EN: Placeholder provider generating deterministic normalized vectors.
 *     Will be replaced with actual Xenova/Jina model loading.
 *     Returns consistent vectors for the same text input to ensure test reproducibility.
 *
 * @param name - 프로바이더 이름 / Provider name
 * @param dimensions - 벡터 차원 수 / Vector dimensions
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const provider = new LocalEmbeddingProvider('local', 384, logger);
 * const result = await provider.embed(['hello world']);
 * if (result.ok) console.log(result.value[0].length); // 384
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly tier: EmbeddingTier = 'free';

  constructor(
    readonly name: string,
    readonly dimensions: number,
    private readonly logger: Logger,
  ) {}

  /**
   * 텍스트 배치를 벡터로 변환 / Batch embed texts to vectors
   *
   * @param texts - 임베딩할 텍스트 배열 / Array of texts to embed
   * @returns 각 텍스트에 대응하는 정규화된 Float32Array 배열 / Normalized Float32Array per text
   */
  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    try {
      this.logger.debug('임베딩 배치 처리 시작', {
        count: texts.length,
        provider: this.name,
      });

      const vectors = texts.map((text) => this.generateDeterministicVector(text));

      this.logger.debug('임베딩 배치 처리 완료', { count: vectors.length });
      return ok(vectors);
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
    try {
      this.logger.debug('쿼리 임베딩 처리', { provider: this.name });

      const vector = this.generateDeterministicVector(query);

      return ok(vector);
    } catch (error: unknown) {
      this.logger.error('쿼리 임베딩 실패', { error: String(error) });
      return err(new RagError('rag_embedding_error', `쿼리 임베딩 실패: ${String(error)}`, error));
    }
  }

  /**
   * 텍스트에서 결정론적 정규화 벡터를 생성 / Generate a deterministic normalized vector from text
   *
   * @description
   * KR: 텍스트의 각 문자 코드를 기반으로 시드를 생성하여 결정론적 벡터를 만든다.
   *     동일 텍스트 → 동일 벡터 보장. L2 정규화 적용.
   * EN: Creates a seeded deterministic vector from character codes.
   *     Same text always produces the same vector. L2 normalized.
   */
  private generateDeterministicVector(text: string): Float32Array {
    const vector = new Float32Array(this.dimensions);

    // WHY: 간단한 해시 기반 시드 — 결정론적 벡터 생성이 목적이므로 암호학적 강도 불필요
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      seed = ((seed << 5) - seed + charCode) | 0;
    }

    // WHY: 선형 합동 생성기 — 빠르고 결정론적. 임베딩 품질은 실제 모델 교체 시 보장.
    let state = seed;
    for (let i = 0; i < this.dimensions; i++) {
      state = (state * 1664525 + 1013904223) | 0;
      vector[i] = (state >>> 0) / 4294967296 - 0.5;
    }

    // L2 정규화 / L2 normalization
    return normalizeVector(vector);
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
 * 기본 설정으로 LocalEmbeddingProvider를 생성 / Create a LocalEmbeddingProvider with defaults
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param name - 프로바이더 이름 (기본: 'local-placeholder') / Provider name
 * @param dimensions - 벡터 차원 수 (기본: 384) / Vector dimensions
 * @returns LocalEmbeddingProvider 인스턴스 / LocalEmbeddingProvider instance
 */
export function createLocalEmbeddingProvider(
  logger: Logger,
  name = 'local-placeholder',
  dimensions = DEFAULT_DIMENSIONS,
): LocalEmbeddingProvider {
  return new LocalEmbeddingProvider(name, dimensions, logger);
}
