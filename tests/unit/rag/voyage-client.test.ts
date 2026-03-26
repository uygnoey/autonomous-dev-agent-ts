/**
 * voyage-client.ts 직접 단위 테스트 / voyage-client.ts direct unit tests
 *
 * @description
 * KR: parseVoyageResponse()와 callVoyageApi()를 직접 테스트.
 *     edge case 80% 이상 — null, 배열, 필드 누락, HTTP 오류, 타임아웃, 정렬 등.
 * EN: Directly tests parseVoyageResponse() and callVoyageApi().
 *     80%+ edge cases — null, array, missing fields, HTTP errors, timeout, sorting.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { RagError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import {
  VOYAGE_API_URL,
  callVoyageApi,
  parseVoyageResponse,
} from 'rag/voyage-client.js';

const logger = new ConsoleLogger('error');
const DUMMY_API_KEY = 'test-voyage-key-1234';
const DUMMY_MODEL = 'voyage-code-3';

// ── fetch mock 관리 / fetch mock management ──────────────────────

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── mock 헬퍼 / Mock helpers ───────────────────────────────────

/** 1024차원 랜덤 벡터 생성 / Generate random 1024-dim vector */
function makeVector(dim = 1024): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

/** Voyage API 성공 응답 생성 / Build Voyage API success response */
function makeVoyageResponse(count: number) {
  return {
    object: 'list',
    data: Array.from({ length: count }, (_, i) => ({
      object: 'embedding',
      embedding: makeVector(),
      index: i,
    })),
    model: 'voyage-code-3',
    usage: { total_tokens: count * 10 },
  };
}

/** index 역순 응답 생성 / Build response with reversed index order */
function makeReversedResponse(count: number) {
  return {
    object: 'list',
    data: Array.from({ length: count }, (_, i) => ({
      object: 'embedding',
      embedding: makeVector(),
      index: count - 1 - i,
    })),
    model: 'voyage-code-3',
    usage: { total_tokens: count * 10 },
  };
}

// ── parseVoyageResponse() 테스트 / parseVoyageResponse() tests ──

describe('parseVoyageResponse()', () => {
  it('정상 응답 → ok 반환', () => {
    const raw = makeVoyageResponse(2);
    const result = parseVoyageResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveLength(2);
      expect(result.value.model).toBe('voyage-code-3');
    }
  });

  it('null 입력 → err', () => {
    const result = parseVoyageResponse(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
    }
  });

  it('배열 입력 → err (객체가 아님)', () => {
    const result = parseVoyageResponse([1, 2, 3]);
    // WHY: Array.isArray(obj.data) 체크 — 배열 자체는 obj.data가 없으므로 err
    expect(result.ok).toBe(false);
  });

  it('data 필드 없음 → err', () => {
    const result = parseVoyageResponse({ object: 'list', model: 'voyage-code-3' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('data');
    }
  });

  it('data가 배열이 아님 → err', () => {
    const result = parseVoyageResponse({ data: 'not-an-array', model: 'voyage-code-3' });
    expect(result.ok).toBe(false);
  });

  it('data가 객체(배열 아님) → err', () => {
    const result = parseVoyageResponse({ data: { foo: 'bar' }, model: 'voyage-code-3' });
    expect(result.ok).toBe(false);
  });

  it('data 항목에 embedding 없음 → err', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [{ object: 'embedding', index: 0 }],
      model: 'voyage-code-3',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('형식 오류');
    }
  });

  it('data 항목에 index 없음 → err', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [{ object: 'embedding', embedding: [0.1, 0.2] }],
      model: 'voyage-code-3',
    });
    expect(result.ok).toBe(false);
  });

  it('data 항목 embedding이 배열이 아님 → err', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [{ object: 'embedding', embedding: 'not-array', index: 0 }],
      model: 'voyage-code-3',
    });
    expect(result.ok).toBe(false);
  });

  it('빈 data 배열 → ok (빈 응답도 유효)', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [],
      model: 'voyage-code-3',
      usage: { total_tokens: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveLength(0);
    }
  });

  it('usage 필드 없어도 ok (선택 필드)', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [{ object: 'embedding', embedding: [0.1], index: 0 }],
      model: 'voyage-code-3',
      // WHY: usage 없어도 파싱 통과 — 필수 검증 대상 아님
    });
    expect(result.ok).toBe(true);
  });

  it('model 필드로 응답 모델명 확인', () => {
    const result = parseVoyageResponse({
      object: 'list',
      data: [{ object: 'embedding', embedding: [0.1], index: 0 }],
      model: 'voyage-3-lite',
      usage: { total_tokens: 5 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.model).toBe('voyage-3-lite');
    }
  });

  it('undefined 입력 → err', () => {
    const result = parseVoyageResponse(undefined);
    expect(result.ok).toBe(false);
  });

  it('숫자 입력 → err', () => {
    const result = parseVoyageResponse(42);
    expect(result.ok).toBe(false);
  });

  it('문자열 입력 → err', () => {
    const result = parseVoyageResponse('invalid');
    expect(result.ok).toBe(false);
  });

  it('data 항목이 null → err', () => {
    const result = parseVoyageResponse({
      data: [null],
    });
    expect(result.ok).toBe(false);
  });

  it('data 항목 index가 문자열 → err', () => {
    const result = parseVoyageResponse({
      data: [{ embedding: [0.1], index: '0' }],
    });
    expect(result.ok).toBe(false);
  });
});

// ── callVoyageApi() 테스트 / callVoyageApi() tests ──────────────

describe('callVoyageApi()', () => {
  it('정상 200 응답 → Float32Array 배열 반환', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => makeVoyageResponse(2),
      text: async () => '',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['hello', 'world'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toBeInstanceOf(Float32Array);
      expect(result.value[1]).toBeInstanceOf(Float32Array);
    }
  });

  it('index 역순 응답 → 정렬되어 반환 (순서 보장)', async () => {
    // WHY: API가 index 순서를 보장하지 않을 수 있으므로 정렬 로직 검증
    // 각 벡터를 구분하기 위해 [0]과 [1] 비율을 다르게 설정
    const vecForIndex0 = Array.from({ length: 1024 }, () => 0);
    vecForIndex0[0] = 1.0;
    vecForIndex0[1] = 0.0; // ratio [0]/[1] → ∞
    const vecForIndex1 = Array.from({ length: 1024 }, () => 0);
    vecForIndex1[0] = 1.0;
    vecForIndex1[1] = 1.0; // ratio [0]/[1] → 1
    const vecForIndex2 = Array.from({ length: 1024 }, () => 0);
    vecForIndex2[0] = 0.0;
    vecForIndex2[1] = 1.0; // ratio [0]/[1] → 0

    const reversed = {
      object: 'list',
      data: [
        { object: 'embedding', embedding: vecForIndex2, index: 2 },
        { object: 'embedding', embedding: vecForIndex1, index: 1 },
        { object: 'embedding', embedding: vecForIndex0, index: 0 },
      ],
      model: 'voyage-code-3',
      usage: { total_tokens: 30 },
    };

    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => reversed,
      text: async () => '',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['a', 'b', 'c'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
      // index=0: [1,0,...] 정규화 → [1,0,...]
      expect(result.value[0]![0]).toBeCloseTo(1.0, 2);
      expect(result.value[0]![1]).toBeCloseTo(0.0, 2);
      // index=1: [1,1,...] 정규화 → [0.707,0.707,...]
      expect(result.value[1]![0]).toBeCloseTo(Math.SQRT1_2, 2);
      expect(result.value[1]![1]).toBeCloseTo(Math.SQRT1_2, 2);
      // index=2: [0,1,...] 정규화 → [0,1,...]
      expect(result.value[2]![0]).toBeCloseTo(0.0, 2);
      expect(result.value[2]![1]).toBeCloseTo(1.0, 2);
    }
  });

  it('HTTP 401 → err(RagError) with message includes "401"', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('401');
    }
  });

  it('HTTP 429 → err(RagError) with message includes "429"', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('429');
    }
  });

  it('HTTP 500 → err(RagError) with message includes "500"', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('500');
    }
  });

  it('AbortError (타임아웃) → err(RagError) with "타임아웃" 포함', async () => {
    globalThis.fetch = mock(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('타임아웃');
    }
  });

  it('네트워크 오류 → err(RagError)', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('ECONNREFUSED');
    }
  });

  it('응답 json 파싱 오류 → err', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
      text: async () => 'not json',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
  });

  it('Authorization Bearer 헤더 검증', async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(1),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await callVoyageApi(['test'], 'my-secret-key', DUMMY_MODEL, logger);
    expect(capturedHeaders['Authorization']).toBe('Bearer my-secret-key');
  });

  it('Content-Type application/json 검증', async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(1),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('빈 배열 입력 → API 호출되나 빈 결과 반환', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => makeVoyageResponse(0),
      text: async () => '',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi([], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('응답 벡터가 Float32Array이고 정규화됨 (L2 norm ≈ 1.0)', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => makeVoyageResponse(1),
      text: async () => '',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const vec = result.value[0]!;
      expect(vec).toBeInstanceOf(Float32Array);
      // L2 norm 계산
      let sumSquares = 0;
      for (let i = 0; i < vec.length; i++) {
        const val = vec[i] ?? 0;
        sumSquares += val * val;
      }
      const norm = Math.sqrt(sumSquares);
      expect(norm).toBeCloseTo(1.0, 2);
    }
  });

  it('data 항목 순서가 섞여도 index 순으로 정렬됨 (3개 아이템 섞임)', async () => {
    // WHY: 3개 아이템을 [index=2, index=0, index=1] 순으로 보내 정렬 검증
    // 각 벡터를 고유하게 구분: non-zero 위치가 다름
    const vec0 = Array.from({ length: 1024 }, () => 0);
    vec0[0] = 1.0; // index=0 → 정규화 후 [0]=1.0
    const vec1 = Array.from({ length: 1024 }, () => 0);
    vec1[1] = 1.0; // index=1 → 정규화 후 [1]=1.0
    const vec2 = Array.from({ length: 1024 }, () => 0);
    vec2[2] = 1.0; // index=2 → 정규화 후 [2]=1.0

    const shuffled = {
      object: 'list',
      data: [
        { object: 'embedding', embedding: vec2, index: 2 },
        { object: 'embedding', embedding: vec0, index: 0 },
        { object: 'embedding', embedding: vec1, index: 1 },
      ],
      model: 'voyage-code-3',
      usage: { total_tokens: 30 },
    };

    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => shuffled,
      text: async () => '',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['a', 'b', 'c'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
      // index=0 벡터: [0]=1.0 (나머지 0)
      expect(result.value[0]![0]).toBeCloseTo(1.0, 2);
      expect(result.value[0]![1]).toBeCloseTo(0.0, 5);
      // index=1 벡터: [1]=1.0 (나머지 0)
      expect(result.value[1]![0]).toBeCloseTo(0.0, 5);
      expect(result.value[1]![1]).toBeCloseTo(1.0, 2);
      // index=2 벡터: [2]=1.0 (나머지 0)
      expect(result.value[2]![0]).toBeCloseTo(0.0, 5);
      expect(result.value[2]![2]).toBeCloseTo(1.0, 2);
    }
  });

  it('요청 URL이 VOYAGE_API_URL과 일치한다', async () => {
    let capturedUrl = '';

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(1),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(capturedUrl).toBe(VOYAGE_API_URL);
  });

  it('요청 body에 input과 model이 포함된다', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = mock(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = JSON.parse(opts?.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => makeVoyageResponse(2),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await callVoyageApi(['hello', 'world'], DUMMY_API_KEY, 'voyage-3-lite', logger);
    expect(capturedBody.input).toEqual(['hello', 'world']);
    expect(capturedBody.model).toBe('voyage-3-lite');
  });

  it('HTTP 오류 응답 body가 에러 메시지에 포함된다', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: invalid API key',
    })) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Forbidden');
    }
  });

  it('비-AbortError TypeError → 일반 호출 실패로 처리', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const result = await callVoyageApi(['test'], DUMMY_API_KEY, DUMMY_MODEL, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RagError);
      expect(result.error.message).toContain('호출 실패');
    }
  });
});
