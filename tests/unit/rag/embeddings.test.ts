/**
 * TransformersEmbeddingProvider + normalizeVector 단위 테스트
 *
 * @description
 * KR: 생성자/normalizeVector 경계값 테스트(빠름). 모델 초기화 테스트는 60초 타임아웃.
 * EN: Constructor/normalizeVector edge tests (fast). Model init tests use 60s timeout.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import {
  TransformersEmbeddingProvider,
  createTransformersEmbeddingProvider,
  normalizeVector,
} from 'rag/embeddings.js';

const logger = new ConsoleLogger('error');

// ── 생성자 ────────────────────────────────────────────────────

describe('TransformersEmbeddingProvider 생성자', () => {
  it('name이 올바르게 설정된다', () => {
    const p = new TransformersEmbeddingProvider('my-name', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('my-name');
  });

  it('dimensions가 올바르게 설정된다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.dimensions).toBe(384);
  });

  it('tier가 "free"이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.tier).toBe('free');
  });

  it('dimensions=128로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 128, logger);
    expect(p.dimensions).toBe(128);
  });

  it('dimensions=768로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 768, logger);
    expect(p.dimensions).toBe(768);
  });

  it('이름 "custom"으로 생성', () => {
    const p = new TransformersEmbeddingProvider('custom', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('custom');
  });

  it('이름 "embedding-provider"으로 생성', () => {
    const p = new TransformersEmbeddingProvider('embedding-provider', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('embedding-provider');
  });

  it('debug logger로 생성 가능', () => {
    const dbgLogger = new ConsoleLogger('debug');
    expect(() => new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, dbgLogger)).not.toThrow();
  });

  it('여러 인스턴스 생성 가능', () => {
    const p1 = new TransformersEmbeddingProvider('p1', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const p2 = new TransformersEmbeddingProvider('p2', 'Xenova/all-MiniLM-L6-v2', 128, logger);
    expect(p1.name).toBe('p1');
    expect(p2.name).toBe('p2');
    expect(p1.dimensions).toBe(384);
    expect(p2.dimensions).toBe(128);
  });

  it('인스턴스이다', () => {
    expect(new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger))
      .toBeInstanceOf(TransformersEmbeddingProvider);
  });

  it('name은 문자열이다', () => {
    const p = new TransformersEmbeddingProvider('str-check', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.name).toBe('string');
  });

  it('dimensions는 숫자이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 512, logger);
    expect(typeof p.dimensions).toBe('number');
  });

  it('tier는 문자열이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.tier).toBe('string');
  });

  it('dimensions=256으로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 256, logger);
    expect(p.dimensions).toBe(256);
  });

  it('dimensions=512로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 512, logger);
    expect(p.dimensions).toBe(512);
  });

  it('dimensions=1536으로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 1536, logger);
    expect(p.dimensions).toBe(1536);
  });

  it('두 인스턴스는 서로 다른 객체이다', () => {
    const p1 = new TransformersEmbeddingProvider('a', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const p2 = new TransformersEmbeddingProvider('b', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p1).not.toBe(p2);
  });

  it('10 인스턴스 모두 tier=free', () => {
    for (let i = 0; i < 10; i++) {
      const p = new TransformersEmbeddingProvider(`p${i}`, 'Xenova/all-MiniLM-L6-v2', 384, logger);
      expect(p.tier).toBe('free');
    }
  });

  it('initialize 메서드가 존재한다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.initialize).toBe('function');
  });

  it('embed 메서드가 존재한다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.embed).toBe('function');
  });

  it('embedQuery 메서드가 존재한다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.embedQuery).toBe('function');
  });

  it('warn logger로 생성 가능', () => {
    const warnLogger = new ConsoleLogger('warn');
    expect(() => new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, warnLogger)).not.toThrow();
  });

  it('긴 name으로 생성 가능', () => {
    const longName = 'embedding-provider-' + 'x'.repeat(50);
    const p = new TransformersEmbeddingProvider(longName, 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe(longName);
  });
});

// ── createTransformersEmbeddingProvider 팩토리 ────────────────

describe('createTransformersEmbeddingProvider 팩토리', () => {
  it('기본값으로 생성 → name="transformers"', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(p.name).toBe('transformers');
  });

  it('기본값으로 생성 → dimensions=384', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(p.dimensions).toBe(384);
  });

  it('기본값으로 생성 → tier="free"', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(p.tier).toBe('free');
  });

  it('커스텀 name 적용', () => {
    const p = createTransformersEmbeddingProvider(logger, 'custom', 'Xenova/all-MiniLM-L6-v2', 384);
    expect(p.name).toBe('custom');
  });

  it('커스텀 dimensions=384 적용', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 384);
    expect(p.dimensions).toBe(384);
  });

  it('커스텀 dimensions=128 적용', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 128);
    expect(p.dimensions).toBe(128);
  });

  it('TransformersEmbeddingProvider 인스턴스이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(p).toBeInstanceOf(TransformersEmbeddingProvider);
  });

  it('연속 생성 → 각각 독립적', () => {
    const p1 = createTransformersEmbeddingProvider(logger);
    const p2 = createTransformersEmbeddingProvider(logger, 'other');
    expect(p1.name).toBe('transformers');
    expect(p2.name).toBe('other');
  });

  it('5번 연속 생성 → 각각 독립 인스턴스', () => {
    const providers = Array.from({ length: 5 }, () => createTransformersEmbeddingProvider(logger));
    expect(providers.every((p) => p.tier === 'free')).toBe(true);
  });

  it('name은 문자열이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.name).toBe('string');
  });

  it('dimensions는 숫자이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.dimensions).toBe('number');
  });

  it('10개 팩토리 생성 → 모두 다른 객체', () => {
    const providers = Array.from({ length: 10 }, (_, i) =>
      createTransformersEmbeddingProvider(logger, `p${i}`),
    );
    for (let i = 0; i < providers.length; i++) {
      for (let j = i + 1; j < providers.length; j++) {
        expect(providers[i]).not.toBe(providers[j]);
      }
    }
  });

  it('커스텀 dimensions=512 적용', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 512);
    expect(p.dimensions).toBe(512);
  });

  it('커스텀 dimensions=256 적용', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 256);
    expect(p.dimensions).toBe(256);
  });
});

// ── normalizeVector - 기본 케이스 ─────────────────────────────

describe('normalizeVector 기본 케이스', () => {
  it('[3, 4] → [0.6, 0.8]', () => {
    const result = normalizeVector(new Float32Array([3, 4]));
    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
  });

  it('[0, 0, 0] → [0, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([0, 0, 0]));
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it('[1, 0, 0] → [1, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([1, 0, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
    expect(result[2]).toBeCloseTo(0.0, 5);
  });

  it('정규화 후 L2 norm ≈ 1', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('Float32Array를 반환한다', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3]));
    expect(result).toBeInstanceOf(Float32Array);
  });
});

// ── normalizeVector - 경계값 케이스 ──────────────────────────

describe('normalizeVector 경계값 케이스', () => {
  it('[1] 단일 원소 → [1]', () => {
    const result = normalizeVector(new Float32Array([1]));
    expect(result[0]).toBeCloseTo(1.0, 5);
  });

  it('[0] 단일 영벡터 → [0]', () => {
    const result = normalizeVector(new Float32Array([0]));
    expect(result[0]).toBe(0);
  });

  it('음수 성분 정규화', () => {
    const result = normalizeVector(new Float32Array([-3, 4]));
    expect(result[0]).toBeCloseTo(-0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
  });

  it('모두 음수 정규화', () => {
    const result = normalizeVector(new Float32Array([-1, -1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[5, 0, 0] → [1, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([5, 0, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
    expect(result[2]).toBeCloseTo(0.0, 5);
  });

  it('[2, 2, 2, 2] 정규화 후 norm=1', () => {
    const result = normalizeVector(new Float32Array([2, 2, 2, 2]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[0.5, 0.5] 정규화', () => {
    const result = normalizeVector(new Float32Array([0.5, 0.5]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('큰 값 [100, 0] → [1, 0]', () => {
    const result = normalizeVector(new Float32Array([100, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
  });

  it('반환 길이가 입력 길이와 동일', () => {
    const input = new Float32Array([1, 2, 3, 4, 5]);
    const result = normalizeVector(input);
    expect(result.length).toBe(input.length);
  });

  it('384 차원 벡터 정규화 후 norm≈1', () => {
    const input = new Float32Array(384).fill(1);
    const result = normalizeVector(input);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('10번 호출 → 항상 norm≈1', () => {
    for (let i = 1; i <= 10; i++) {
      const input = new Float32Array([i, i * 2, i * 3]);
      const result = normalizeVector(input);
      let sumSq = 0;
      for (let j = 0; j < result.length; j++) sumSq += (result[j] ?? 0) ** 2;
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
    }
  });

  it('[0, 1] → [0, 1]', () => {
    const result = normalizeVector(new Float32Array([0, 1]));
    expect(result[0]).toBeCloseTo(0.0, 5);
    expect(result[1]).toBeCloseTo(1.0, 5);
  });

  it('매우 작은 값 [0.001, 0.001] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([0.001, 0.001]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('[-1, 0, 1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-1, 0, 1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[10000, 0, 0] → [1, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([10000, 0, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
  });

  it('128 차원 벡터 norm≈1', () => {
    const input = new Float32Array(128).fill(1);
    const result = normalizeVector(input);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('768 차원 벡터 norm≈1', () => {
    const input = new Float32Array(768).fill(1);
    const result = normalizeVector(input);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('1024 차원 벡터 norm≈1', () => {
    const input = new Float32Array(1024).fill(0.5);
    const result = normalizeVector(input);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('[3, 4] 결과의 각 원소가 숫자이다', () => {
    const result = normalizeVector(new Float32Array([3, 4]));
    expect(typeof result[0]).toBe('number');
    expect(typeof result[1]).toBe('number');
  });

  it('입력이 변경되지 않는다', () => {
    const input = new Float32Array([3, 4]);
    const originalVal0 = input[0];
    const originalVal1 = input[1];
    normalizeVector(input);
    expect(input[0]).toBe(originalVal0);
    expect(input[1]).toBe(originalVal1);
  });

  it('5번 동일 입력 → 항상 동일 결과', () => {
    const input = new Float32Array([1, 2, 3]);
    const first = normalizeVector(input);
    for (let i = 0; i < 5; i++) {
      const result = normalizeVector(input);
      for (let j = 0; j < result.length; j++) {
        expect(result[j]).toBeCloseTo(first[j] ?? 0, 5);
      }
    }
  });

  it('[1, 1, 1] → 각 원소 ≈ 1/√3', () => {
    const result = normalizeVector(new Float32Array([1, 1, 1]));
    const expected = 1 / Math.sqrt(3);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(expected, 4);
    }
  });

  it('[-5, -5] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-5, -5]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });
});

// ── 모델 초기화/embed/embedQuery (60초 타임아웃) ──────────────

describe('TransformersEmbeddingProvider initialize', () => {
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

describe('TransformersEmbeddingProvider embed', () => {
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

  it('빈 텍스트 처리', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.length).toBe(384);
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

  it('특수 문자 포함 텍스트 처리', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['!@#$%^&*() 🎉 <script>alert("xss")</script>']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.length).toBe(384);
    }
  }, { timeout: 60000 });

  it('ok는 boolean이다', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['type check']);
    expect(typeof result.ok).toBe('boolean');
  }, { timeout: 60000 });

  it('값이 Float32Array 배열이다', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embed(['array check']);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  }, { timeout: 60000 });

  it('5개 텍스트 배치 → 5개 벡터', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const result = await p.embed(texts);
    if (result.ok) expect(result.value.length).toBe(5);
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

describe('TransformersEmbeddingProvider embedQuery', () => {
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

  it('ok는 boolean이다', async () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    await p.initialize();
    const result = await p.embedQuery('type check');
    expect(typeof result.ok).toBe('boolean');
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

// ── normalizeVector 추가 edge/random 케이스 ───────────────────

describe('normalizeVector 추가 edge 케이스', () => {
  it('[0.001, 0] → [1, 0]에 근접', () => {
    const result = normalizeVector(new Float32Array([0.001, 0]));
    expect(result[0]).toBeCloseTo(1.0, 3);
    expect(result[1]).toBeCloseTo(0.0, 3);
  });

  it('[NaN 방어] — 정상 벡터 → 유한값 반환', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3]));
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i] ?? 0)).toBe(true);
    }
  });

  it('[7, 24] → norm≈1 (피타고라스 25)', () => {
    const result = normalizeVector(new Float32Array([7, 24]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[8, 15, 0] → norm≈1 (피타고라스 17)', () => {
    const result = normalizeVector(new Float32Array([8, 15, 0]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('랜덤 5차원 벡터 → norm≈1', () => {
    const arr = Float32Array.from({ length: 5 }, () => Math.random() * 10 - 5);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    const allZero = Array.from(arr).every((v) => v === 0);
    if (!allZero) expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('랜덤 10차원 벡터 → norm≈1', () => {
    const arr = Float32Array.from({ length: 10 }, () => Math.random() * 100);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    const allZero = Array.from(arr).every((v) => v === 0);
    if (!allZero) expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('랜덤 20차원 벡터 → norm≈1', () => {
    const arr = Float32Array.from({ length: 20 }, () => Math.random() - 0.5);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    const allZero = Array.from(arr).every((v) => v === 0);
    if (!allZero) expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('Float32Array 길이 2 → 반환 길이 2', () => {
    const result = normalizeVector(new Float32Array([3, 4]));
    expect(result.length).toBe(2);
  });

  it('Float32Array 길이 3 → 반환 길이 3', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3]));
    expect(result.length).toBe(3);
  });

  it('[0.1, 0.2, 0.3, 0.4, 0.5] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('[-100, -200, -300] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-100, -200, -300]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('[0, 0, 1, 0, 0] → [0, 0, 1, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([0, 0, 1, 0, 0]));
    expect(result[2]).toBeCloseTo(1.0, 5);
    expect(result[0]).toBeCloseTo(0.0, 5);
  });

  it('50차원 랜덤 → norm≈1', () => {
    const arr = Float32Array.from({ length: 50 }, () => Math.random() * 2 - 1);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    const allZero = Array.from(arr).every((v) => v === 0);
    if (!allZero) expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('연속 10번 랜덤 벡터 → 모두 norm≈1', () => {
    for (let t = 0; t < 10; t++) {
      const dim = Math.floor(Math.random() * 10) + 2;
      const arr = Float32Array.from({ length: dim }, () => Math.random() * 10 - 5);
      const allZero = Array.from(arr).every((v) => v === 0);
      if (allZero) continue;
      const result = normalizeVector(arr);
      let sumSq = 0;
      for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
    }
  });
});

// ── 생성자 추가 경계값 ─────────────────────────────────────────

describe('TransformersEmbeddingProvider 생성자 추가 경계값', () => {
  it('UUID name으로 생성', () => {
    const name = crypto.randomUUID();
    const p = new TransformersEmbeddingProvider(name, 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe(name);
  });

  it('한글 name으로 생성', () => {
    const p = new TransformersEmbeddingProvider('임베딩-프로바이더', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('임베딩-프로바이더');
  });

  it('특수문자 name으로 생성', () => {
    const p = new TransformersEmbeddingProvider('test!@#$', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(typeof p.name).toBe('string');
  });

  it('dimensions=1 → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 1, logger);
    expect(p.dimensions).toBe(1);
  });

  it('dimensions=9999 → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 9999, logger);
    expect(p.dimensions).toBe(9999);
  });

  it('tier는 항상 "free"', () => {
    const dims = [1, 128, 256, 384, 512, 768, 1024, 1536];
    for (const d of dims) {
      const p = new TransformersEmbeddingProvider('t', 'Xenova/all-MiniLM-L6-v2', d, logger);
      expect(p.tier).toBe('free');
    }
  });

  it('빈 name으로 생성 가능', () => {
    const p = new TransformersEmbeddingProvider('', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('');
  });

  it('initialize는 비동기 함수', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.initialize();
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('embed는 비동기 함수', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.embed(['test']);
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});

// ── 생성자 추가 경계값 2 ───────────────────────────────────────

describe('TransformersEmbeddingProvider 생성자 경계값 2', () => {
  it('숫자만 있는 name → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('12345', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('12345');
  });

  it('하이픈 포함 name → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('embed-provider-v2', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('embed-provider-v2');
  });

  it('underscore 포함 name → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('embed_provider', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('embed_provider');
  });

  it('dimensions=2048로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 2048, logger);
    expect(p.dimensions).toBe(2048);
  });

  it('dimensions=3072로 생성', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 3072, logger);
    expect(p.dimensions).toBe(3072);
  });

  it('20개 인스턴스 연속 생성 → 모두 tier=free', () => {
    for (let i = 0; i < 20; i++) {
      const p = new TransformersEmbeddingProvider(`p-${i}`, 'Xenova/all-MiniLM-L6-v2', 384, logger);
      expect(p.tier).toBe('free');
    }
  });

  it('embedQuery는 비동기 함수', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.embedQuery('test');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('각 인스턴스의 dimensions 독립성', () => {
    const dims = [128, 256, 384, 512, 768, 1024];
    const providers = dims.map((d) => new TransformersEmbeddingProvider('t', 'Xenova/all-MiniLM-L6-v2', d, logger));
    dims.forEach((d, i) => {
      expect(providers[i]?.dimensions).toBe(d);
    });
  });
});

// ── normalizeVector 추가 랜덤 케이스 ─────────────────────────

describe('normalizeVector 랜덤 케이스', () => {
  it('[1, 2] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, 2]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[4, 4, 4, 4] → 각 원소 ≈ 0.5', () => {
    const result = normalizeVector(new Float32Array([4, 4, 4, 4]));
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0.5, 5);
    }
  });

  it('[-0.5, -0.5, -0.5, -0.5] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-0.5, -0.5, -0.5, -0.5]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[0, 0, 0, 1] → [0, 0, 0, 1]', () => {
    const result = normalizeVector(new Float32Array([0, 0, 0, 1]));
    expect(result[3]).toBeCloseTo(1.0, 5);
    expect(result[0]).toBeCloseTo(0.0, 5);
  });

  it('256차원 랜덤 벡터 → norm≈1', () => {
    const arr = Float32Array.from({ length: 256 }, () => Math.random() * 2 - 1);
    const allZero = Array.from(arr).every((v) => v === 0);
    if (allZero) return;
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });

  it('단위 벡터는 정규화 후 동일', () => {
    const result = normalizeVector(new Float32Array([1, 0, 0, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
  });

  it('[99, 0, 0, 0, 0] → [1, 0, 0, 0, 0]', () => {
    const result = normalizeVector(new Float32Array([99, 0, 0, 0, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0.0, 5);
    }
  });

  it('반환값의 모든 원소가 -1 이상 1 이하이다', () => {
    const arr = Float32Array.from({ length: 10 }, () => Math.random() * 100 - 50);
    const allZero = Array.from(arr).every((v) => v === 0);
    if (allZero) return;
    const result = normalizeVector(arr);
    for (let i = 0; i < result.length; i++) {
      expect(result[i] ?? 0).toBeGreaterThanOrEqual(-1.0 - 1e-5);
      expect(result[i] ?? 0).toBeLessThanOrEqual(1.0 + 1e-5);
    }
  });
});

// ── normalizeVector 추가 수치 정밀도 케이스 ──────────────────

describe('normalizeVector 수치 정밀도 케이스', () => {
  it('[5, 12] → norm=1 (피타고라스 13)', () => {
    const result = normalizeVector(new Float32Array([5, 12]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[5, 12] → [5/13, 12/13]', () => {
    const result = normalizeVector(new Float32Array([5, 12]));
    expect(result[0]).toBeCloseTo(5 / 13, 4);
    expect(result[1]).toBeCloseTo(12 / 13, 4);
  });

  it('[3, 4] → [0.6, 0.8] 5번 일관성', () => {
    for (let t = 0; t < 5; t++) {
      const result = normalizeVector(new Float32Array([3, 4]));
      expect(result[0]).toBeCloseTo(0.6, 5);
      expect(result[1]).toBeCloseTo(0.8, 5);
    }
  });

  it('[0, 0, 1] → [0, 0, 1]', () => {
    const result = normalizeVector(new Float32Array([0, 0, 1]));
    expect(result[2]).toBeCloseTo(1.0, 5);
    expect(result[0]).toBeCloseTo(0.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
  });

  it('[2, 0] → [1, 0]', () => {
    const result = normalizeVector(new Float32Array([2, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
  });

  it('[0, 3] → [0, 1]', () => {
    const result = normalizeVector(new Float32Array([0, 3]));
    expect(result[0]).toBeCloseTo(0.0, 5);
    expect(result[1]).toBeCloseTo(1.0, 5);
  });

  it('512차원 랜덤 벡터 → norm≈1', () => {
    const arr = Float32Array.from({ length: 512 }, () => Math.random() * 2 - 1);
    const allZero = Array.from(arr).every((v) => v === 0);
    if (allZero) return;
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 2);
  });

  it('1536차원 벡터 norm≈1', () => {
    const arr = new Float32Array(1536).fill(0.1);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 2);
  });

  it('[1, 1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, 1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('영벡터 반환 시 Float32Array이다', () => {
    const result = normalizeVector(new Float32Array([0, 0]));
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('정규화 결과의 모든 원소가 유한하다 (큰 값)', () => {
    const arr = new Float32Array([1e30, 1e30]);
    const result = normalizeVector(arr);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i] ?? 0)).toBe(true);
    }
  });

  it('[-0, 1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-0, 1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('입력 Float32Array는 불변이다 (큰 배열)', () => {
    const input = new Float32Array(100).fill(2.5);
    const originalValues = Array.from(input);
    normalizeVector(input);
    for (let i = 0; i < input.length; i++) {
      expect(input[i]).toBe(originalValues[i]);
    }
  });

  it('[1, -1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, -1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[1, 0, -1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, 0, -1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });
});

// ── TransformersEmbeddingProvider 생성자 추가 경계값 3 ────────

describe('TransformersEmbeddingProvider 생성자 경계값 3', () => {
  it('name이 공백만 있는 경우도 설정됨', () => {
    const p = new TransformersEmbeddingProvider('   ', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('   ');
  });

  it('dimensions=4096 → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 4096, logger);
    expect(p.dimensions).toBe(4096);
  });

  it('두 인스턴스 name 독립성', () => {
    const p1 = new TransformersEmbeddingProvider('provider-alpha', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const p2 = new TransformersEmbeddingProvider('provider-beta', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p1.name).toBe('provider-alpha');
    expect(p2.name).toBe('provider-beta');
  });

  it('두 인스턴스 dimensions 독립성', () => {
    const p1 = new TransformersEmbeddingProvider('t', 'Xenova/all-MiniLM-L6-v2', 128, logger);
    const p2 = new TransformersEmbeddingProvider('t', 'Xenova/all-MiniLM-L6-v2', 768, logger);
    expect(p1.dimensions).toBe(128);
    expect(p2.dimensions).toBe(768);
  });

  it('tier는 "free" 이외의 값이 아니다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.tier).not.toBe('paid');
    expect(p.tier).not.toBe('premium');
    expect(p.tier).toBe('free');
  });

  it('30개 인스턴스 연속 생성 → 각각 독립', () => {
    const providers = Array.from({ length: 30 }, (_, i) =>
      new TransformersEmbeddingProvider(`p-${i}`, 'Xenova/all-MiniLM-L6-v2', 384, logger),
    );
    for (let i = 0; i < providers.length; i++) {
      expect(providers[i]?.name).toBe(`p-${i}`);
    }
  });

  it('initialize 반환값은 Promise이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.initialize();
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('embed 반환값은 Promise이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.embed(['test']);
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('embedQuery 반환값은 Promise이다', () => {
    const p = new TransformersEmbeddingProvider('test', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    const result = p.embedQuery('test');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('name에 슬래시 포함 → 설정됨', () => {
    const p = new TransformersEmbeddingProvider('Xenova/custom-model', 'Xenova/all-MiniLM-L6-v2', 384, logger);
    expect(p.name).toBe('Xenova/custom-model');
  });
});

// ── createTransformersEmbeddingProvider 팩토리 추가 edge ──────

describe('createTransformersEmbeddingProvider 팩토리 추가 edge', () => {
  it('name="abc" → name="abc"', () => {
    const p = createTransformersEmbeddingProvider(logger, 'abc');
    expect(p.name).toBe('abc');
  });

  it('dimensions=1024 → 설정됨', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 1024);
    expect(p.dimensions).toBe(1024);
  });

  it('dimensions=1536 → 설정됨', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 1536);
    expect(p.dimensions).toBe(1536);
  });

  it('생성된 인스턴스는 tier=free', () => {
    const p = createTransformersEmbeddingProvider(logger, 'custom-name', 'Xenova/all-MiniLM-L6-v2', 256);
    expect(p.tier).toBe('free');
  });

  it('다른 logger로 생성해도 tier=free', () => {
    const warnLogger = new ConsoleLogger('warn');
    const p = createTransformersEmbeddingProvider(warnLogger);
    expect(p.tier).toBe('free');
  });

  it('생성된 인스턴스의 initialize 메서드 존재', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.initialize).toBe('function');
  });

  it('생성된 인스턴스의 embed 메서드 존재', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.embed).toBe('function');
  });

  it('생성된 인스턴스의 embedQuery 메서드 존재', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.embedQuery).toBe('function');
  });

  it('UUID name으로 팩토리 생성', () => {
    const uuid = crypto.randomUUID();
    const p = createTransformersEmbeddingProvider(logger, uuid);
    expect(p.name).toBe(uuid);
  });

  it('한글 name으로 팩토리 생성', () => {
    const p = createTransformersEmbeddingProvider(logger, '임베딩-v2');
    expect(p.name).toBe('임베딩-v2');
  });

  it('팩토리 5번 연속 생성 → 모두 dimensions=384', () => {
    const providers = Array.from({ length: 5 }, () => createTransformersEmbeddingProvider(logger));
    for (const p of providers) {
      expect(p.dimensions).toBe(384);
    }
  });

  it('팩토리 생성 인스턴스 → 두 인스턴스는 다른 객체', () => {
    const p1 = createTransformersEmbeddingProvider(logger, 'p1');
    const p2 = createTransformersEmbeddingProvider(logger, 'p2');
    expect(p1).not.toBe(p2);
  });
});

// ── normalizeVector 특수 케이스 ───────────────────────────────

describe('normalizeVector 특수 케이스', () => {
  it('[1, 2, 3, 4] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3, 4]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[-2, -4, -6] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-2, -4, -6]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('정규화는 원래 방향을 유지한다 (양수 벡터)', () => {
    const input = new Float32Array([3, 4]);
    const result = normalizeVector(input);
    // 정규화 후 원소 부호가 동일해야 한다
    expect(result[0]).toBeGreaterThan(0);
    expect(result[1]).toBeGreaterThan(0);
  });

  it('정규화는 원래 방향을 유지한다 (음수 벡터)', () => {
    const input = new Float32Array([-3, -4]);
    const result = normalizeVector(input);
    expect(result[0]).toBeLessThan(0);
    expect(result[1]).toBeLessThan(0);
  });

  it('Float32Array 길이 100 → 반환 길이 100', () => {
    const input = new Float32Array(100).fill(1);
    const result = normalizeVector(input);
    expect(result.length).toBe(100);
  });

  it('[1, 0] → [1, 0]', () => {
    const result = normalizeVector(new Float32Array([1, 0]));
    expect(result[0]).toBeCloseTo(1.0, 5);
    expect(result[1]).toBeCloseTo(0.0, 5);
  });

  it('[0, 5] → [0, 1]', () => {
    const result = normalizeVector(new Float32Array([0, 5]));
    expect(result[0]).toBeCloseTo(0.0, 5);
    expect(result[1]).toBeCloseTo(1.0, 5);
  });

  it('반환값이 입력 배열과 다른 객체이다 (비영벡터)', () => {
    const input = new Float32Array([3, 4]);
    const result = normalizeVector(input);
    expect(result).not.toBe(input);
  });

  it('영벡터 반환값은 입력과 동일한 참조', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = normalizeVector(input);
    // WHY: 영벡터는 magnitude=0이면 동일 배열 반환 (구현 의존)
    expect(result).toBe(input);
  });

  it('[1e-10, 0] → norm≈1 (매우 작은 값)', () => {
    const result = normalizeVector(new Float32Array([1e-10, 0]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    // 매우 작은 값이지만 방향은 유지되어야 함
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
  });
});

// ── normalizeVector 반복 랜덤 검증 케이스 ─────────────────────

describe('normalizeVector 반복 랜덤 검증', () => {
  it('랜덤 3차원 벡터 20번 → 모두 norm≈1', () => {
    for (let t = 0; t < 20; t++) {
      const arr = Float32Array.from({ length: 3 }, () => Math.random() * 20 - 10);
      const allZero = Array.from(arr).every((v) => v === 0);
      if (allZero) continue;
      const result = normalizeVector(arr);
      let sumSq = 0;
      for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
    }
  });

  it('[2, 1] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([2, 1]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[10, 10, 10, 10, 10] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([10, 10, 10, 10, 10]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[-10, 10, -10] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-10, 10, -10]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('32차원 벡터 → norm≈1', () => {
    const arr = new Float32Array(32).fill(1);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('64차원 벡터 → norm≈1', () => {
    const arr = new Float32Array(64).fill(2);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('[0.0001, 0.0002, 0.0003] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([0.0001, 0.0002, 0.0003]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('[-0.5, 0.5, -0.5, 0.5] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([-0.5, 0.5, -0.5, 0.5]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  it('[1, 2] 정규화 후 [2, 4] 정규화와 동일 방향', () => {
    const r1 = normalizeVector(new Float32Array([1, 2]));
    const r2 = normalizeVector(new Float32Array([2, 4]));
    // 방향 같으면 원소 비율 동일
    expect(r1[0]).toBeCloseTo(r2[0] ?? 0, 5);
    expect(r1[1]).toBeCloseTo(r2[1] ?? 0, 5);
  });

  it('16차원 랜덤 벡터 10번 → 모두 norm≈1', () => {
    for (let t = 0; t < 10; t++) {
      const arr = Float32Array.from({ length: 16 }, () => Math.random() * 10 - 5);
      const allZero = Array.from(arr).every((v) => v === 0);
      if (allZero) continue;
      const result = normalizeVector(arr);
      let sumSq = 0;
      for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
    }
  });

  it('정규화 연속 2회 → 동일 결과 (이미 정규화된 경우)', () => {
    const input = new Float32Array([3, 4]);
    const r1 = normalizeVector(input);
    const r2 = normalizeVector(r1);
    for (let i = 0; i < r1.length; i++) {
      expect(r2[i]).toBeCloseTo(r1[i] ?? 0, 4);
    }
  });

  it('[1000, 2000, 3000] → norm≈1', () => {
    const result = normalizeVector(new Float32Array([1000, 2000, 3000]));
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 4);
  });

  it('8차원 벡터 → norm≈1', () => {
    const arr = new Float32Array([1, -1, 2, -2, 3, -3, 4, -4]);
    const result = normalizeVector(arr);
    let sumSq = 0;
    for (let i = 0; i < result.length; i++) sumSq += (result[i] ?? 0) ** 2;
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });
});

// ── TransformersEmbeddingProvider 메서드 존재 추가 확인 ────────

describe('TransformersEmbeddingProvider 메서드 타입 확인', () => {
  it('initialize 메서드가 함수이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.initialize).toBe('function');
  });

  it('embed 메서드가 함수이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.embed).toBe('function');
  });

  it('embedQuery 메서드가 함수이다', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(typeof p.embedQuery).toBe('function');
  });

  it('name 속성이 문자열이다 (팩토리)', () => {
    const p = createTransformersEmbeddingProvider(logger, 'my-provider');
    expect(typeof p.name).toBe('string');
    expect(p.name).toBe('my-provider');
  });

  it('dimensions 속성이 숫자이다 (팩토리)', () => {
    const p = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 768);
    expect(typeof p.dimensions).toBe('number');
    expect(p.dimensions).toBe(768);
  });

  it('tier 속성이 "free"이다 (팩토리)', () => {
    const p = createTransformersEmbeddingProvider(logger);
    expect(p.tier).toBe('free');
  });

  it('10번 연속 팩토리 → 모두 instanceof TransformersEmbeddingProvider', () => {
    for (let i = 0; i < 10; i++) {
      const p = createTransformersEmbeddingProvider(logger, `p-${i}`);
      expect(p).toBeInstanceOf(TransformersEmbeddingProvider);
    }
  });

  it('생성자로 생성한 인스턴스 → instanceof TransformersEmbeddingProvider', () => {
    for (let i = 0; i < 5; i++) {
      const p = new TransformersEmbeddingProvider(`t-${i}`, 'Xenova/all-MiniLM-L6-v2', 384, logger);
      expect(p).toBeInstanceOf(TransformersEmbeddingProvider);
    }
  });

  it('name 설정값 독립성 (10 인스턴스)', () => {
    const names = Array.from({ length: 10 }, (_, i) => `name-${i}`);
    const providers = names.map((n) => createTransformersEmbeddingProvider(logger, n));
    names.forEach((n, i) => {
      expect(providers[i]?.name).toBe(n);
    });
  });

  it('dimensions 설정값 독립성 (5 인스턴스)', () => {
    const dims = [128, 256, 384, 512, 768];
    const providers = dims.map((d) => createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', d));
    dims.forEach((d, i) => {
      expect(providers[i]?.dimensions).toBe(d);
    });
  });
});
