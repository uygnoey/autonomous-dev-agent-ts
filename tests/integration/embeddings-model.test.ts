/**
 * TransformersEmbeddingProvider 모델 로드 통합 테스트
 *
 * @description
 * KR: 실제 @huggingface/transformers 모델을 로드하는 통합 테스트.
 *     Bun 1.3.10 OOM 회피를 위해 단위 테스트에서 분리됨.
 *     CI 환경이나 모델 다운로드가 불가한 환경에서는 실행하지 않는다.
 * EN: Integration tests that actually load @huggingface/transformers model.
 *     Separated from unit tests to avoid Bun 1.3.10 OOM crash.
 *     Do not run in CI or environments without model download access.
 *
 * @note 실행 방법 / How to run:
 *   bun test tests/integration/embeddings-model.test.ts
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { TransformersEmbeddingProvider } from 'rag/embeddings.js';

const logger = new ConsoleLogger('error');

// ── 모델 초기화 ────────────────────────────────────────────────

describe('TransformersEmbeddingProvider initialize (통합)', () => {
  it('모델 로드 → ok=true', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = await p.initialize();
    expect(result.ok).toBe(true);
  }, { timeout: 60000 });

  it('중복 초기화 → 모두 ok=true', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const r1 = await p.initialize();
    const r2 = await p.initialize();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  }, { timeout: 60000 });

  it('ok는 boolean이다', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = await p.initialize();
    expect(typeof result.ok).toBe('boolean');
  }, { timeout: 60000 });
});

// ── embed ──────────────────────────────────────────────────────

describe('TransformersEmbeddingProvider embed (통합)', () => {
  it('올바른 차원의 벡터 생성', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['hello world']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]).toBeInstanceOf(Float32Array);
      expect(result.value[0]?.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('배치 임베딩 → 올바른 수의 벡터', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['text1', 'text2', 'text3']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
      for (const vec of result.value) expect(vec.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('자동 초기화 (initialize 호출 없이)', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = await p.embed(['auto-init test']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('정규화된 벡터 반환 (L2 norm ≈ 1.0)', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['normalize test']);
    if (result.ok) {
      const vec = result.value[0];
      if (vec) {
        let sumSq = 0;
        for (let i = 0; i < vec.length; i++) sumSq += (vec[i] ?? 0) ** 2;
        expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
      }
    }
  }, { timeout: 60000 });

  it('빈 배열 처리', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(0);
  }, { timeout: 60000 });

  it('한국어 텍스트 처리', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['한국어 테스트 임베딩']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('동일 텍스트 두 번 embed → 동일 벡터', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const r1 = await p.embed(['consistent text']);
    const r2 = await p.embed(['consistent text']);
    if (r1.ok && r2.ok) {
      const v1 = r1.value[0];
      const v2 = r2.value[0];
      if (v1 && v2) {
        let maxDiff = 0;
        for (let i = 0; i < v1.length; i++) {
          maxDiff = Math.max(maxDiff, Math.abs((v1[i] ?? 0) - (v2[i] ?? 0)));
        }
        expect(maxDiff).toBeLessThan(0.001);
      }
    }
  }, { timeout: 60000 });
});

// ── embedQuery ─────────────────────────────────────────────────

describe('TransformersEmbeddingProvider embedQuery (통합)', () => {
  it('올바른 차원의 벡터 반환', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embedQuery('query text');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Float32Array);
      expect(result.value.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('정규화된 벡터 반환', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embedQuery('test query');
    if (result.ok) {
      let sumSq = 0;
      for (let i = 0; i < result.value.length; i++) sumSq += (result.value[i] ?? 0) ** 2;
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
    }
  }, { timeout: 60000 });

  it('한국어 쿼리 임베딩', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embedQuery('한국어 쿼리');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Float32Array);
      expect(result.value.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('embedQuery vs embed[0] → 동일한 결과', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const q = await p.embedQuery('comparison test');
    const b = await p.embed(['comparison test']);
    if (q.ok && b.ok) {
      const qvec = q.value;
      const bvec = b.value[0];
      if (bvec) {
        let maxDiff = 0;
        for (let i = 0; i < qvec.length; i++) {
          maxDiff = Math.max(maxDiff, Math.abs((qvec[i] ?? 0) - (bvec[i] ?? 0)));
        }
        expect(maxDiff).toBeLessThan(0.001);
      }
    }
  }, { timeout: 60000 });
});
