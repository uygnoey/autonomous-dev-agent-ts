/**
 * JinaEmbeddingProvider 단위 테스트 / JinaEmbeddingProvider unit tests
 *
 * @description
 * KR: @huggingface/transformers pipeline을 mock하여 실제 모델 다운로드 없이 테스트.
 *     edge case 80% 이상 — 빈 배열, 단일 텍스트, 긴 텍스트, 오류 처리 등.
 * EN: Mocks @huggingface/transformers pipeline to test without real model download.
 *     80%+ edge cases — empty array, single text, long text, error handling, etc.
 */

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { JinaEmbeddingProvider, createJinaEmbeddingProvider } from 'rag/jina-embeddings.js';

const logger = new ConsoleLogger('error');

// ── mock 헬퍼 / Mock helpers ───────────────────────────────────

/** 1024차원 랜덤 벡터 생성 / Generate random 1024-dim vector */
function makeVector1024(): number[] {
  return Array.from({ length: 1024 }, () => Math.random() - 0.5);
}

/** pipeline mock 결과 생성 / Build pipeline mock result */
function makePipelineMock(count: number) {
  const vectors = Array.from({ length: count }, () => makeVector1024());
  return {
    tolist: async () => vectors,
  };
}

/** pipeline 모듈을 mock하는 헬퍼 / Helper to mock the pipeline module */
function mockPipelineSuccess(count: number) {
  return mock(async (_task: string, _model: string) => {
    const pipelineFn = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(count);
    };
    return pipelineFn;
  });
}

function mockPipelineError(message: string) {
  return mock(async (_task: string, _model: string) => {
    throw new Error(message);
  });
}

// ── 생성자 / Constructor ────────────────────────────────────────

describe('JinaEmbeddingProvider 생성자 / constructor', () => {
  it('기본 name이 "jina-v3"이다 / default name is jina-v3', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(p.name).toBe('jina-v3');
  });

  it('커스텀 name이 올바르게 설정된다 / custom name is set correctly', () => {
    const p = new JinaEmbeddingProvider(logger, 'my-jina');
    expect(p.name).toBe('my-jina');
  });

  it('dimensions가 1024이다 / dimensions is 1024', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(p.dimensions).toBe(1024);
  });

  it('tier가 "free"이다 / tier is free', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(p.tier).toBe('free');
  });

  it('debug logger로 생성 가능 / can create with debug logger', () => {
    const dbg = new ConsoleLogger('debug');
    expect(() => new JinaEmbeddingProvider(dbg)).not.toThrow();
  });

  it('name=""로 생성 가능 / can create with empty string name', () => {
    const p = new JinaEmbeddingProvider(logger, '');
    expect(p.name).toBe('');
  });

  it('매우 긴 name으로 생성 가능 / can create with very long name', () => {
    const longName = 'a'.repeat(500);
    const p = new JinaEmbeddingProvider(logger, longName);
    expect(p.name).toBe(longName);
  });

  it('커스텀 modelName으로 생성 가능 / can create with custom model name', () => {
    expect(() => new JinaEmbeddingProvider(logger, 'test', 'some-other-model')).not.toThrow();
  });
});

// ── createJinaEmbeddingProvider 팩토리 / factory ────────────────

describe('createJinaEmbeddingProvider 팩토리', () => {
  it('기본 이름으로 JinaEmbeddingProvider를 생성한다', () => {
    const p = createJinaEmbeddingProvider(logger);
    expect(p).toBeInstanceOf(JinaEmbeddingProvider);
    expect(p.name).toBe('jina-v3');
  });

  it('커스텀 이름으로 생성한다', () => {
    const p = createJinaEmbeddingProvider(logger, 'custom-jina');
    expect(p.name).toBe('custom-jina');
  });

  it('생성된 인스턴스의 dimensions가 1024이다', () => {
    const p = createJinaEmbeddingProvider(logger);
    expect(p.dimensions).toBe(1024);
  });

  it('생성된 인스턴스의 tier가 "free"이다', () => {
    const p = createJinaEmbeddingProvider(logger);
    expect(p.tier).toBe('free');
  });
});

// ── embed() 기본 / embed() basics ──────────────────────────────

describe('JinaEmbeddingProvider.embed() 기본', () => {
  it('빈 배열 → 빈 배열 반환 (API 호출 없음)', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const result = await p.embed([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('빈 배열은 여러 번 호출해도 항상 ok', async () => {
    const p = new JinaEmbeddingProvider(logger);
    for (let i = 0; i < 5; i++) {
      const result = await p.embed([]);
      expect(result.ok).toBe(true);
    }
  });
});

// ── embed() edge cases ──────────────────────────────────────────

describe('JinaEmbeddingProvider.embed() edge cases', () => {
  it('공백 문자열 텍스트 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);

    // pipeline mock으로 initialize 우회
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error: private field access for testing
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error: private field access for testing
    p.initialized = true;

    const result = await p.embed(['']);
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 텍스트 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['Hello, 세계! 🌍 <script>alert("xss")</script>']);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 텍스트 단일 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const longText = 'a'.repeat(10_000);
    const result = await p.embed([longText]);
    expect(result.ok).toBe(true);
  });

  it('다수 텍스트 배치 (100개) — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(texts.length);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const texts = Array.from({ length: 100 }, (_, i) => `text ${i}`);
    const result = await p.embed(texts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(100);
    }
  });

  it('pipeline이 throw하면 err(RagError) 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      throw new Error('pipeline 에러');
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['hello']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('rag_embedding_error');
    }
  });

  it('반환된 벡터가 Float32Array이다', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['hello']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toBeInstanceOf(Float32Array);
    }
  });

  it('반환된 벡터가 1024차원이다', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['hello']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.length).toBe(1024);
    }
  });

  it('텍스트 수와 벡터 수가 일치한다', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(texts.length);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const texts = ['a', 'b', 'c', 'd', 'e'];
    const result = await p.embed(texts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(5);
    }
  });

  it('Unicode 텍스트 (한국어) 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['안녕하세요 세계']);
    expect(result.ok).toBe(true);
  });

  it('null 문자 포함 텍스트 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embed(['\0\0\0']);
    expect(result.ok).toBe(true);
  });
});

// ── embedQuery() ────────────────────────────────────────────────

describe('JinaEmbeddingProvider.embedQuery()', () => {
  it('단일 쿼리 → Float32Array 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embedQuery('hello world');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Float32Array);
      expect(result.value.length).toBe(1024);
    }
  });

  it('pipeline 에러 시 err 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      throw new Error('query embed 실패');
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embedQuery('query');
    expect(result.ok).toBe(false);
  });

  it('빈 쿼리 문자열 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embedQuery('');
    expect(result.ok).toBe(true);
  });

  it('매우 긴 쿼리 처리 — ok 반환', async () => {
    const p = new JinaEmbeddingProvider(logger);
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return makePipelineMock(1);
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embedQuery('x'.repeat(5_000));
    expect(result.ok).toBe(true);
  });

  it('결과 벡터가 정규화되어 있다 (L2 ≈ 1.0)', async () => {
    const p = new JinaEmbeddingProvider(logger);
    // 정규화된 벡터 반환
    const vec = new Array(1024).fill(0);
    vec[0] = 1;
    const mockPipeline = async (_texts: string[], _opts: Record<string, unknown>) => {
      return { tolist: async () => [[...vec]] };
    };
    // @ts-expect-error
    p.pipelineInstance = mockPipeline;
    // @ts-expect-error
    p.initialized = true;

    const result = await p.embedQuery('test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // L2 크기 계산
      let sumSq = 0;
      for (const v of result.value) {
        sumSq += v * v;
      }
      const magnitude = Math.sqrt(sumSq);
      expect(magnitude).toBeCloseTo(1.0, 5);
    }
  });
});

// ── initialize() ────────────────────────────────────────────────

describe('JinaEmbeddingProvider.initialize()', () => {
  it('이미 초기화된 경우 ok(void) 반환 (재초기화 없음)', async () => {
    const p = new JinaEmbeddingProvider(logger);
    // @ts-expect-error
    p.initialized = true;
    // @ts-expect-error
    p.pipelineInstance = async () => makePipelineMock(1);

    const result = await p.initialize();
    expect(result.ok).toBe(true);
  });
});

// ── EmbeddingProvider 인터페이스 준수 / interface conformance ───

describe('EmbeddingProvider 인터페이스 준수', () => {
  it('name, dimensions, tier, embed, embedQuery 속성을 모두 갖는다', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(typeof p.name).toBe('string');
    expect(typeof p.dimensions).toBe('number');
    expect(typeof p.tier).toBe('string');
    expect(typeof p.embed).toBe('function');
    expect(typeof p.embedQuery).toBe('function');
  });

  it('dimensions가 양수이다', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(p.dimensions).toBeGreaterThan(0);
  });

  it('tier가 "free" 또는 "paid"이다', () => {
    const p = new JinaEmbeddingProvider(logger);
    expect(['free', 'paid']).toContain(p.tier);
  });
});
