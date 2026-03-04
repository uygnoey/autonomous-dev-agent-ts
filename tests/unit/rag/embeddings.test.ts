import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import {
  LocalEmbeddingProvider,
  createLocalEmbeddingProvider,
  normalizeVector,
} from '../../../src/rag/embeddings.js';

const logger = new ConsoleLogger('error');

describe('LocalEmbeddingProvider', () => {
  // ── 생성 / Construction ──────────────────────────────────────

  describe('construction', () => {
    it('이름과 차원이 올바르게 설정된다', () => {
      const provider = new LocalEmbeddingProvider('test-provider', 384, logger);

      expect(provider.name).toBe('test-provider');
      expect(provider.dimensions).toBe(384);
      expect(provider.tier).toBe('free');
    });

    it('createLocalEmbeddingProvider 팩토리가 기본값으로 생성한다', () => {
      const provider = createLocalEmbeddingProvider(logger);

      expect(provider.name).toBe('local-placeholder');
      expect(provider.dimensions).toBe(384);
    });

    it('createLocalEmbeddingProvider 팩토리가 커스텀 값을 적용한다', () => {
      const provider = createLocalEmbeddingProvider(logger, 'custom', 512);

      expect(provider.name).toBe('custom');
      expect(provider.dimensions).toBe(512);
    });
  });

  // ── embed ────────────────────────────────────────────────────

  describe('embed', () => {
    it('올바른 차원의 벡터를 생성한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 384, logger);

      const result = await provider.embed(['hello world']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toBeInstanceOf(Float32Array);
        expect(result.value[0]?.length).toBe(384);
      }
    });

    it('배치 임베딩이 올바른 수의 벡터를 반환한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 128, logger);

      const result = await provider.embed(['text1', 'text2', 'text3']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        for (const vec of result.value) {
          expect(vec.length).toBe(128);
        }
      }
    });

    it('동일한 텍스트에 대해 동일한 벡터를 반환한다 (결정론적)', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result1 = await provider.embed(['consistent text']);
      const result2 = await provider.embed(['consistent text']);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        const vec1 = result1.value[0];
        const vec2 = result2.value[0];
        expect(vec1).toBeDefined();
        expect(vec2).toBeDefined();

        if (vec1 && vec2) {
          for (let i = 0; i < vec1.length; i++) {
            expect(vec1[i]).toBeCloseTo(vec2[i] ?? 0, 6);
          }
        }
      }
    });

    it('다른 텍스트에 대해 다른 벡터를 반환한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result = await provider.embed(['hello', 'world']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const vec1 = result.value[0];
        const vec2 = result.value[1];
        expect(vec1).toBeDefined();
        expect(vec2).toBeDefined();

        if (vec1 && vec2) {
          let allSame = true;
          for (let i = 0; i < vec1.length; i++) {
            if (Math.abs((vec1[i] ?? 0) - (vec2[i] ?? 0)) > 0.0001) {
              allSame = false;
              break;
            }
          }
          expect(allSame).toBe(false);
        }
      }
    });

    it('정규화된 벡터를 반환한다 (L2 norm ≈ 1.0)', async () => {
      const provider = new LocalEmbeddingProvider('test', 256, logger);

      const result = await provider.embed(['normalize test']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const vec = result.value[0];
        expect(vec).toBeDefined();
        if (vec) {
          let sumSquares = 0;
          for (let i = 0; i < vec.length; i++) {
            const val = vec[i] ?? 0;
            sumSquares += val * val;
          }
          const magnitude = Math.sqrt(sumSquares);
          expect(magnitude).toBeCloseTo(1.0, 3);
        }
      }
    });
  });

  // ── embedQuery ───────────────────────────────────────────────

  describe('embedQuery', () => {
    it('올바른 차원의 벡터를 반환한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 384, logger);

      const result = await provider.embedQuery('query text');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Float32Array);
        expect(result.value.length).toBe(384);
      }
    });

    it('정규화된 벡터를 반환한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 128, logger);

      const result = await provider.embedQuery('test query');

      expect(result.ok).toBe(true);
      if (result.ok) {
        let sumSquares = 0;
        for (let i = 0; i < result.value.length; i++) {
          const val = result.value[i] ?? 0;
          sumSquares += val * val;
        }
        const magnitude = Math.sqrt(sumSquares);
        expect(magnitude).toBeCloseTo(1.0, 3);
      }
    });
  });

  // ── edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('빈 텍스트를 처리한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result = await provider.embed(['']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(64);
      }
    });

    it('빈 배열을 처리한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result = await provider.embed([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it('매우 긴 텍스트를 처리한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);
      const longText = 'a'.repeat(100_000);

      const result = await provider.embed([longText]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(64);
      }
    });

    it('한국어 텍스트를 처리한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result = await provider.embed(['한국어 테스트 임베딩']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(64);
      }
    });

    it('특수 문자를 포함한 텍스트를 처리한다', async () => {
      const provider = new LocalEmbeddingProvider('test', 64, logger);

      const result = await provider.embed(['!@#$%^&*() 🎉 <script>alert("xss")</script>']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(64);
      }
    });
  });
});

// ── normalizeVector ─────────────────────────────────────────────

describe('normalizeVector', () => {
  it('벡터를 L2 정규화한다', () => {
    const input = new Float32Array([3, 4]);
    const result = normalizeVector(input);

    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
  });

  it('영벡터는 그대로 반환한다', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = normalizeVector(input);

    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it('이미 정규화된 벡터는 변하지 않는다', () => {
    const input = new Float32Array([1, 0, 0]);
    const result = normalizeVector(input);

    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
    expect(result[2]).toBeCloseTo(0.0, 5);
  });
});
