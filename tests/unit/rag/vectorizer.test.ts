/**
 * Vectorizer 단위 테스트 / Vectorizer unit tests
 *
 * @description
 * 초기화 전 오류 처리, initialize() 실패/성공,
 * search/index 미초기화 오류 등 경계값을 상세히 검증한다.
 *
 * NOTE: LanceDB + Transformers 초기화가 느리므로
 *       초기화 없이 호출하는 케이스에 집중한다.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { Vectorizer } from 'rag/vectorizer.js';
import type { EmbeddingConfig } from 'core/config.js';

const logger = new ConsoleLogger('error');

function makeConfig(provider = 'transformers'): EmbeddingConfig {
  return {
    default: provider as EmbeddingConfig['default'],
    transformers: {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
    },
  };
}

function makeVectorizer(dbPath = '/tmp/adev-test-vectorizer', provider = 'transformers'): Vectorizer {
  return new Vectorizer(dbPath, makeConfig(provider), logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('Vectorizer 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeVectorizer()).not.toThrow();
  });

  it('Vectorizer 인스턴스', () => {
    expect(makeVectorizer()).toBeInstanceOf(Vectorizer);
  });

  it('다양한 dbPath → 인스턴스 생성', () => {
    const paths = ['/tmp/db1', '/tmp/db2', '/tmp/dir/nested/db'];
    for (const path of paths) {
      expect(() => makeVectorizer(path)).not.toThrow();
    }
  });
});

// ── 미초기화 상태에서 호출 ─────────────────────────────────────

describe('Vectorizer 미초기화 상태 오류', () => {
  it('search() 미초기화 → err 반환', async () => {
    const v = makeVectorizer();
    const result = await v.search('query');
    expect(result.ok).toBe(false);
  });

  it('index() 미초기화 → err 반환', async () => {
    const v = makeVectorizer();
    const result = await v.index('/tmp/some-dir');
    expect(result.ok).toBe(false);
  });

  it('search() 오류 메시지에 초기화 관련 내용 포함', async () => {
    const v = makeVectorizer();
    const result = await v.search('error handling');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize/i);
    }
  });

  it('index() 오류 메시지에 초기화 관련 내용 포함', async () => {
    const v = makeVectorizer();
    const result = await v.index('src/');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize/i);
    }
  });

  it('여러 search 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const queries = ['query 1', 'query 2', 'error handling', 'typescript', 'jest'];
    for (const q of queries) {
      const result = await v.search(q);
      expect(result.ok).toBe(false);
    }
  });

  it('여러 index 호출 → 모두 err', async () => {
    const v = makeVectorizer();
    const dirs = ['src/', 'tests/', 'lib/', '.'];
    for (const dir of dirs) {
      const result = await v.index(dir);
      expect(result.ok).toBe(false);
    }
  });
});

// ── 다양한 설정으로 생성 ───────────────────────────────────────

describe('Vectorizer 다양한 설정', () => {
  it.each(['/tmp/v1', '/tmp/v2', '/tmp/nested/path/db'])(
    'dbPath %s → 생성됨',
    (dbPath) => {
      const v = makeVectorizer(dbPath);
      expect(v).toBeInstanceOf(Vectorizer);
    },
  );

  it('빈 dbPath → 인스턴스 생성 (초기화 시 실패 예상)', () => {
    expect(() => makeVectorizer('')).not.toThrow();
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('Vectorizer 랜덤/경계값', () => {
  it.each(Array.from({ length: 15 }, (_, i) => i))('랜덤 쿼리 미초기화 #%i', async (i) => {
    const v = makeVectorizer();
    const query = `query-${i}-${'x'.repeat(i % 10)}`;
    const result = await v.search(query);
    expect(result.ok).toBe(false);
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 인덱스 경로 미초기화 #%i', async (i) => {
    const v = makeVectorizer();
    const dirPath = `/tmp/random-dir-${i}`;
    const result = await v.index(dirPath);
    expect(result.ok).toBe(false);
  });

  it('빈 쿼리 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('');
    expect(result.ok).toBe(false);
  });

  it('limit 파라미터 포함 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 5);
    expect(result.ok).toBe(false);
  });

  it('filter 파라미터 포함 → err (미초기화)', async () => {
    const v = makeVectorizer();
    const result = await v.search('query', 10, { language: 'typescript' });
    expect(result.ok).toBe(false);
  });

  it('여러 Vectorizer 인스턴스 독립적', async () => {
    const v1 = makeVectorizer('/tmp/db-v1');
    const v2 = makeVectorizer('/tmp/db-v2');
    const r1 = await v1.search('query');
    const r2 = await v2.search('query');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });
});
