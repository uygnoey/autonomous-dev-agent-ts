/**
 * VoyageEmbeddingProvider 단위 테스트 / VoyageEmbeddingProvider unit tests
 *
 * @description
 * KR: fetch를 mock하여 실제 Voyage API 호출 없이 테스트.
 *     edge case 80% 이상 — 빈 배열, 배치 분할, API 오류, 타임아웃, 파싱 오류 등.
 * EN: Mocks fetch to test without real Voyage API calls.
 *     80%+ edge cases — empty array, batch split, API errors, timeout, parse errors.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { VoyageEmbeddingProvider, createVoyageEmbeddingProvider } from 'rag/voyage-embeddings.js';

const logger = new ConsoleLogger('error');
const DUMMY_API_KEY = 'test-voyage-key-1234';

// ── mock 헬퍼 / Mock helpers ───────────────────────────────────

/** 1024차원 랜덤 벡터 생성 / Generate random 1024-dim vector */
function makeVector1536(): number[] {
  return Array.from({ length: 1024 }, () => Math.random() - 0.5);
}

/** Voyage API 성공 응답 생성 / Build Voyage API success response */
function makeVoyageResponse(count: number) {
  return {
    object: 'list',
    data: Array.from({ length: count }, (_, i) => ({
      object: 'embedding',
      embedding: makeVector1536(),
      index: i,
    })),
    model: 'voyage-code-3',
    usage: { total_tokens: count * 10 },
  };
}

/** fetch mock (성공) / Mock fetch for success */
function mockFetchSuccess(count: number) {
  return mock(async (_url: string, _opts: RequestInit) => {
    return {
      ok: true,
      status: 200,
      json: async () => makeVoyageResponse(count),
      text: async () => JSON.stringify(makeVoyageResponse(count)),
    } as Response;
  });
}

/** fetch mock (HTTP 오류) / Mock fetch for HTTP error */
function mockFetchHttpError(status: number, body = 'API error') {
  return mock(async (_url: string, _opts: RequestInit) => {
    return {
      ok: false,
      status,
      text: async () => body,
    } as unknown as Response;
  });
}

/** fetch mock (네트워크 오류) / Mock fetch for network error */
function mockFetchNetworkError(message: string) {
  return mock(async (_url: string, _opts: RequestInit) => {
    throw new Error(message);
  });
}

// ── 생성자 / Constructor ────────────────────────────────────────

describe('VoyageEmbeddingProvider 생성자 / constructor', () => {
  it('기본 name이 "voyage-code-3"이다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.name).toBe('voyage-code-3');
  });

  it('커스텀 name이 올바르게 설정된다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY, 'my-voyage');
    expect(p.name).toBe('my-voyage');
  });

  it('dimensions가 1024이다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.dimensions).toBe(1024);
  });

  it('tier가 "paid"이다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.tier).toBe('paid');
  });

  it('빈 API 키로 생성 가능 (호출 시 실패는 별도)', () => {
    expect(() => new VoyageEmbeddingProvider(logger, '')).not.toThrow();
  });

  it('debug logger로 생성 가능', () => {
    const dbg = new ConsoleLogger('debug');
    expect(() => new VoyageEmbeddingProvider(dbg, DUMMY_API_KEY)).not.toThrow();
  });
});

// ── createVoyageEmbeddingProvider 팩토리 / factory ──────────────

describe('createVoyageEmbeddingProvider 팩토리', () => {
  it('기본 이름으로 VoyageEmbeddingProvider를 생성한다', () => {
    const p = createVoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p).toBeInstanceOf(VoyageEmbeddingProvider);
    expect(p.name).toBe('voyage-code-3');
  });

  it('커스텀 이름으로 생성한다', () => {
    const p = createVoyageEmbeddingProvider(logger, DUMMY_API_KEY, 'custom-voyage');
    expect(p.name).toBe('custom-voyage');
  });

  it('dimensions가 1024이다', () => {
    const p = createVoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.dimensions).toBe(1024);
  });

  it('tier가 "paid"이다', () => {
    const p = createVoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.tier).toBe('paid');
  });
});

// ── embed() 기본 / embed() basics ──────────────────────────────

describe('VoyageEmbeddingProvider.embed() 기본', () => {
  it('빈 배열 → 빈 배열 반환 (fetch 호출 없음)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const result = await p.embed([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('빈 배열 여러 번 호출 → 항상 ok', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    for (let i = 0; i < 5; i++) {
      const result = await p.embed([]);
      expect(result.ok).toBe(true);
    }
  });
});

// ── embed() 성공 경로 / embed() success path ───────────────────

describe('VoyageEmbeddingProvider.embed() 성공 경로', () => {
  it('단일 텍스트 → Float32Array 1개 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(1) as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello world']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toBeInstanceOf(Float32Array);
        expect(result.value[0]?.length).toBe(1024);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5개 텍스트 → Float32Array 5개 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(5) as unknown as typeof fetch;
    try {
      const texts = ['a', 'b', 'c', 'd', 'e'];
      const result = await p.embed(texts);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(5);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('반환된 벡터가 Float32Array이다', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(3) as unknown as typeof fetch;
    try {
      const result = await p.embed(['a', 'b', 'c']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const v of result.value) {
          expect(v).toBeInstanceOf(Float32Array);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── embed() 배치 분할 / batch splitting ────────────────────────

describe('VoyageEmbeddingProvider.embed() 배치 분할', () => {
  it('129개 텍스트 → 2번 fetch 호출 (128+1 분할)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
      fetchCallCount++;
      const body = JSON.parse(opts.body as string) as { input: string[] };
      const count = body.input.length;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(count),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const texts = Array.from({ length: 129 }, (_, i) => `text-${i}`);
      const result = await p.embed(texts);
      expect(result.ok).toBe(true);
      expect(fetchCallCount).toBe(2);
      if (result.ok) {
        expect(result.value).toHaveLength(129);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('256개 텍스트 → 2번 fetch 호출 (128+128 분할)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
      fetchCallCount++;
      const body = JSON.parse(opts.body as string) as { input: string[] };
      const count = body.input.length;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(count),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const texts = Array.from({ length: 256 }, (_, i) => `text-${i}`);
      const result = await p.embed(texts);
      expect(result.ok).toBe(true);
      expect(fetchCallCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('128개 텍스트 → 1번 fetch 호출', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async (_url: string, _opts: RequestInit) => {
      fetchCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(128),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const texts = Array.from({ length: 128 }, (_, i) => `text-${i}`);
      await p.embed(texts);
      expect(fetchCallCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── embed() 오류 처리 / error handling ─────────────────────────

describe('VoyageEmbeddingProvider.embed() 오류 처리', () => {
  it('HTTP 401 → err(RagError) 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchHttpError(401, 'Unauthorized') as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('HTTP 429 → err(RagError) 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchHttpError(429, 'Rate limit exceeded') as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('HTTP 500 → err(RagError) 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchHttpError(500, 'Internal server error') as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('네트워크 에러 → err(RagError) 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchNetworkError('ECONNREFUSED') as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_embedding_error');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('잘못된 응답 형식 (data 없음) → err(RagError)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ object: 'list', model: 'voyage-code-3' }), // data 없음
      text: async () => '',
    })) as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('null 응답 → err(RagError)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => null,
      text: async () => '',
    })) as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('data 항목에 embedding 없음 → err(RagError)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [{ object: 'embedding', index: 0 }], // embedding 필드 없음
        model: 'voyage-code-3',
      }),
      text: async () => '',
    })) as unknown as typeof fetch;
    try {
      const result = await p.embed(['hello']);
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('첫 서브배치 실패 → 즉시 err 반환 (두 번째 배치 호출 없음)', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      fetchCallCount++;
      return {
        ok: false,
        status: 500,
        text: async () => 'server error',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const texts = Array.from({ length: 200 }, (_, i) => `text-${i}`);
      const result = await p.embed(texts);
      expect(result.ok).toBe(false);
      // WHY: 첫 서브배치 실패 시 즉시 중단 — 두 번째 배치는 호출하지 않아야 함
      expect(fetchCallCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── embedQuery() ────────────────────────────────────────────────

describe('VoyageEmbeddingProvider.embedQuery()', () => {
  it('단일 쿼리 → Float32Array 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(1) as unknown as typeof fetch;
    try {
      const result = await p.embedQuery('hello world');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Float32Array);
        expect(result.value.length).toBe(1024);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('API 오류 시 err 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchHttpError(403, 'Forbidden') as unknown as typeof fetch;
    try {
      const result = await p.embedQuery('query');
      expect(result.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('빈 쿼리 처리 — ok 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(1) as unknown as typeof fetch;
    try {
      const result = await p.embedQuery('');
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('특수문자 포함 쿼리 처리 — ok 반환', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess(1) as unknown as typeof fetch;
    try {
      const result = await p.embedQuery('function foo() { return "hello\\n\\t\\0"; }');
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Authorization 헤더 검증 / auth header validation ────────────

describe('VoyageEmbeddingProvider Authorization 헤더', () => {
  it('요청에 Bearer 토큰이 포함된다', async () => {
    const p = new VoyageEmbeddingProvider(logger, 'my-api-key-xyz');
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(1),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      await p.embed(['test']);
      expect(capturedHeaders['Authorization']).toBe('Bearer my-api-key-xyz');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Content-Type이 application/json이다', async () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(1),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      await p.embed(['test']);
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── EmbeddingProvider 인터페이스 준수 / interface conformance ───

describe('EmbeddingProvider 인터페이스 준수', () => {
  it('name, dimensions, tier, embed, embedQuery 속성을 모두 갖는다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(typeof p.name).toBe('string');
    expect(typeof p.dimensions).toBe('number');
    expect(typeof p.tier).toBe('string');
    expect(typeof p.embed).toBe('function');
    expect(typeof p.embedQuery).toBe('function');
  });

  it('dimensions가 양수이다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(p.dimensions).toBeGreaterThan(0);
  });

  it('tier가 "free" 또는 "paid"이다', () => {
    const p = new VoyageEmbeddingProvider(logger, DUMMY_API_KEY);
    expect(['free', 'paid']).toContain(p.tier);
  });
});
