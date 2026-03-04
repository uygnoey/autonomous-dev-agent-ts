import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import {
  TransformersEmbeddingProvider,
  createTransformersEmbeddingProvider,
  normalizeVector,
} from '../../../src/rag/embeddings.js';

const logger = new ConsoleLogger('error');

describe('TransformersEmbeddingProvider', () => {
  // ── 생성 / Construction ──────────────────────────────────────

  describe('construction', () => {
    it('이름과 차원이 올바르게 설정된다', () => {
      const provider = new TransformersEmbeddingProvider('test-provider', 'Xenova/all-MiniLM-L6-v2', 384, logger);

      expect(provider.name).toBe('test-provider');
      expect(provider.dimensions).toBe(384);
      expect(provider.tier).toBe('free');
    });

    it('createTransformersEmbeddingProvider 팩토리가 기본값으로 생성한다', () => {
      const provider = createTransformersEmbeddingProvider(logger);

      expect(provider.name).toBe('transformers');
      expect(provider.dimensions).toBe(384);
    });

    it('createTransformersEmbeddingProvider 팩토리가 커스텀 값을 적용한다', () => {
      const provider = createTransformersEmbeddingProvider(logger, 'custom', 'Xenova/all-MiniLM-L6-v2', 384);

      expect(provider.name).toBe('custom');
      expect(provider.dimensions).toBe(384);
    });
  });

  // ── initialize ───────────────────────────────────────────────

  describe('initialize', () => {
    it('모델을 성공적으로 로드한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);

      const result = await provider.initialize();

      expect(result.ok).toBe(true);
    }, { timeout: 60000 }); // WHY: 모델 다운로드 시간을 고려하여 60초 타임아웃

    it('중복 초기화는 문제없이 처리된다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);

      const result1 = await provider.initialize();
      const result2 = await provider.initialize();

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    }, { timeout: 60000 });
  });

  // ── embed ────────────────────────────────────────────────────

  describe('embed', () => {
    it('올바른 차원의 벡터를 생성한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed(['hello world']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toBeInstanceOf(Float32Array);
        expect(result.value[0]?.length).toBe(384);
      }
    }, { timeout: 60000 });

    it('배치 임베딩이 올바른 수의 벡터를 반환한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed(['text1', 'text2', 'text3']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);
        for (const vec of result.value) {
          expect(vec.length).toBe(384);
        }
      }
    }, { timeout: 60000 });

    it('자동 초기화가 작동한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);

      // WHY: initialize() 호출 없이 바로 embed() 호출 — 자동 초기화 테스트
      const result = await provider.embed(['auto-init test']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(384);
      }
    }, { timeout: 60000 });

    it('정규화된 벡터를 반환한다 (L2 norm ≈ 1.0)', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

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
    }, { timeout: 60000 });
  });

  // ── embedQuery ───────────────────────────────────────────────

  describe('embedQuery', () => {
    it('올바른 차원의 벡터를 반환한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embedQuery('query text');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Float32Array);
        expect(result.value.length).toBe(384);
      }
    }, { timeout: 60000 });

    it('정규화된 벡터를 반환한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

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
    }, { timeout: 60000 });
  });

  // ── edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('빈 텍스트를 처리한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed(['']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(384);
      }
    }, { timeout: 60000 });

    it('빈 배열을 처리한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    }, { timeout: 60000 });

    it('한국어 텍스트를 처리한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed(['한국어 테스트 임베딩']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(384);
      }
    }, { timeout: 60000 });

    it('특수 문자를 포함한 텍스트를 처리한다', async () => {
      const provider = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
      await provider.initialize();

      const result = await provider.embed(['!@#$%^&*() 🎉 <script>alert("xss")</script>']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.length).toBe(384);
      }
    }, { timeout: 60000 });
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
