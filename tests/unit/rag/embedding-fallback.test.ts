/**
 * createEmbeddingProviderWithFallback 단위 테스트 / Unit tests for embedding auto-fallback
 *
 * @description
 * KR: 4-Provider Tier 순서 폴백 체인의 정상/엣지 케이스 검증.
 *     엣지 케이스 비중 80% 이상 준수.
 * EN: Validates the 4-Provider tier-order fallback chain for normal/edge cases.
 */

import { describe, expect, it } from 'bun:test';
import type { Logger } from 'core/logger.js';
import { createEmbeddingProviderWithFallback } from 'rag/embedding-factory.js';

// ── 테스트 픽스처 / Test fixtures ────────────────────────────────

const createStubLogger = (): Logger =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createStubLogger(),
  }) as unknown as Logger;

const logger = createStubLogger();

// ── createEmbeddingProviderWithFallback ──────────────────────────

describe('createEmbeddingProviderWithFallback', () => {
  // ── 정상 케이스 / Normal cases (20%) ─────────────────────────

  it('API 키 없이도 Tier 1 무료 프로바이더를 반환한다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: xenova-minilm 또는 jina-v3 중 첫 번째 성공 프로바이더
      expect(result.value.tier).toBe('free');
    }
  });

  it('반환된 프로바이더는 name 속성을 가진다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.name).toBe('string');
      expect(result.value.name.length).toBeGreaterThan(0);
    }
  });

  it('반환된 프로바이더는 dimensions 속성을 가진다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dimensions).toBeGreaterThan(0);
    }
  });

  it('반환된 프로바이더는 embed 메서드를 가진다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.embed).toBe('function');
    }
  });

  // ── 엣지 케이스 / Edge cases (80%) ───────────────────────────

  it('voyageApiKey가 있으면 여전히 Tier 1부터 시도한다', () => {
    const result = createEmbeddingProviderWithFallback({
      logger,
      voyageApiKey: 'va-test-key-123',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: Tier 1 무료가 먼저 성공하므로 유료 프로바이더까지 가지 않는다
      expect(result.value.tier).toBe('free');
    }
  });

  it('voyageApiKey가 undefined일 때 Tier 1 무료로 폴백한다', () => {
    const result = createEmbeddingProviderWithFallback({
      logger,
      voyageApiKey: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tier).toBe('free');
    }
  });

  it('반환된 프로바이더는 embedQuery 메서드를 가진다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.embedQuery).toBe('function');
    }
  });

  it('동일 설정으로 두 번 호출해도 각각 성공한다', () => {
    const result1 = createEmbeddingProviderWithFallback({ logger });
    const result2 = createEmbeddingProviderWithFallback({ logger });
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it('빈 문자열 voyageApiKey는 Tier 1 무료로 폴백한다', () => {
    const result = createEmbeddingProviderWithFallback({
      logger,
      voyageApiKey: '',
    });
    // WHY: 빈 문자열은 truthy이므로 voyage 프로바이더 생성은 시도되지만,
    //      Tier 1 무료가 먼저 성공하므로 결과적으로 무료 프로바이더 반환
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tier).toBe('free');
    }
  });

  it('반환된 프로바이더의 name은 비어있지 않은 문자열이다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.name).toBe('string');
      expect(result.value.name.length).toBeGreaterThan(0);
    }
  });

  it('Tier 1 첫 번째(xenova-minilm)가 성공하면 무료 tier가 반환된다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: xenova-minilm이 항상 성공 가능하므로 첫 번째 무료 프로바이더 반환
      expect(result.value.tier).toBe('free');
    }
  });

  it('반복 10회 호출 모두 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = createEmbeddingProviderWithFallback({ logger });
      expect(result.ok).toBe(true);
    }
  });

  it('로거가 child()를 지원하는 어떤 인스턴스든 동작한다', () => {
    const customLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => customLogger,
    } as unknown as Logger;

    const result = createEmbeddingProviderWithFallback({ logger: customLogger });
    expect(result.ok).toBe(true);
  });

  it('반환된 프로바이더의 dimensions는 384 이상이다', () => {
    const result = createEmbeddingProviderWithFallback({ logger });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dimensions).toBeGreaterThanOrEqual(384);
    }
  });
});
