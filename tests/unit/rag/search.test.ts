import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { Result } from '../../../src/core/types.js';
import { ok } from '../../../src/core/types.js';
import type { CodeRecord } from '../../../src/core/types.js';
import { RagSearcher } from '../../../src/rag/search.js';
import type { EmbeddingProvider } from '../../../src/rag/types.js';
import { CodeVectorStore } from '../../../src/rag/vector-store.js';

const logger = new ConsoleLogger('error');

/** 테스트용 임베딩 프로바이더 — 랜덤 벡터 생성 */
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly tier = 'free' as const;
  constructor(readonly dimensions: number) {}

  async embed(texts: string[]): Promise<Result<Float32Array[]>> {
    return ok(texts.map(() => {
      const arr = new Float32Array(this.dimensions);
      for (let i = 0; i < this.dimensions; i++) arr[i] = Math.random();
      return arr;
    }));
  }

  async embedQuery(query: string): Promise<Result<Float32Array>> {
    const result = await this.embed([query]);
    if (!result.ok) return result;
    const first = result.value[0];
    if (!first) return ok(new Float32Array(this.dimensions));
    return ok(first);
  }
}

function createTestCodeRecord(overrides: Partial<CodeRecord> = {}): CodeRecord {
  return {
    id: overrides.id ?? `code-${crypto.randomUUID()}`,
    projectId: overrides.projectId ?? 'proj-test',
    filePath: overrides.filePath ?? 'src/core/config.ts',
    chunk: overrides.chunk ?? 'function loadConfig() { return {}; }',
    embedding: overrides.embedding ?? new Float32Array([0.1, 0.2, 0.3, 0.4]),
    metadata: overrides.metadata ?? {
      language: 'typescript',
      module: 'src/core',
      functionName: 'loadConfig',
      lastModified: new Date('2026-03-04T00:00:00Z'),
      modifiedBy: 'code-indexer',
    },
  };
}

describe('RagSearcher', () => {
  let tempDir: string;
  let store: CodeVectorStore;
  let provider: MockEmbeddingProvider;
  let searcher: RagSearcher;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-search-test-'));
    store = new CodeVectorStore(tempDir, logger);
    await store.initialize();

    provider = new MockEmbeddingProvider(4);
    searcher = new RagSearcher(store, provider, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── searchCode ────────────────────────────────────────────────

  describe('searchCode', () => {
    it('쿼리 텍스트로 코드를 검색한다', async () => {
      // 데이터 삽입
      await store.insert(
        createTestCodeRecord({
          id: 'r1',
          chunk: 'function loadConfig() { return {}; }',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );
      await store.insert(
        createTestCodeRecord({
          id: 'r2',
          chunk: 'function processData(input: string) { return input; }',
          embedding: new Float32Array([0.0, 1.0, 0.0, 0.0]),
        }),
      );

      const result = await searcher.searchCode('load config');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        // 결과에 record와 score가 있는지 확인
        const first = result.value[0];
        expect(first).toBeDefined();
        if (first) {
          expect(first.record).toBeDefined();
          expect(first.score).toBeDefined();
          expect(typeof first.score).toBe('number');
        }
      }
    });

    it('limit 옵션이 적용된다', async () => {
      // 5개 레코드 삽입
      for (let i = 0; i < 5; i++) {
        await store.insert(
          createTestCodeRecord({
            id: `limit-${i}`,
            embedding: new Float32Array([
              Math.random(),
              Math.random(),
              Math.random(),
              Math.random(),
            ]),
          }),
        );
      }

      const result = await searcher.searchCode('test query', 2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(2);
      }
    });

    it('filter 조건이 적용된다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'filter-ts',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
          metadata: {
            language: 'typescript',
            module: 'src/core',
            functionName: 'fn1',
            lastModified: new Date(),
            modifiedBy: 'indexer',
          },
        }),
      );
      await store.insert(
        createTestCodeRecord({
          id: 'filter-py',
          embedding: new Float32Array([0.9, 0.1, 0.0, 0.0]),
          metadata: {
            language: 'python',
            module: 'scripts',
            functionName: 'fn2',
            lastModified: new Date(),
            modifiedBy: 'indexer',
          },
        }),
      );

      const result = await searcher.searchCode('test', 10, {
        language: 'typescript',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const item of result.value) {
          expect(item.record.metadata.language).toBe('typescript');
        }
      }
    });

    it('빈 저장소에서 검색하면 빈 배열을 반환한다', async () => {
      const result = await searcher.searchCode('anything');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  // ── searchByFile ──────────────────────────────────────────────

  describe('searchByFile', () => {
    it('파일 경로로 코드를 검색한다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'file-search-1',
          filePath: 'src/core/config.ts',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );
      await store.insert(
        createTestCodeRecord({
          id: 'file-search-2',
          filePath: 'src/rag/search.ts',
          embedding: new Float32Array([0.0, 1.0, 0.0, 0.0]),
        }),
      );

      const result = await searcher.searchByFile('src/core/config.ts');

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const record of result.value) {
          expect(record.filePath).toBe('src/core/config.ts');
        }
      }
    });

    it('일치하는 파일이 없으면 빈 배열을 반환한다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'no-match',
          filePath: 'src/core/config.ts',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );

      const result = await searcher.searchByFile('src/nonexistent.ts');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it('빈 저장소에서 검색하면 빈 배열을 반환한다', async () => {
      const result = await searcher.searchByFile('any/path.ts');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  // ── edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('한국어 쿼리로 검색한다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'kr-search',
          chunk: '// 사용자 인증 함수',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );

      const result = await searcher.searchCode('사용자 인증');

      expect(result.ok).toBe(true);
    });

    it('빈 쿼리로 검색한다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'empty-query',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );

      const result = await searcher.searchCode('');

      expect(result.ok).toBe(true);
    });

    it('매우 긴 쿼리로 검색한다', async () => {
      await store.insert(
        createTestCodeRecord({
          id: 'long-query',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );

      const longQuery = 'search term '.repeat(1000);
      const result = await searcher.searchCode(longQuery);

      expect(result.ok).toBe(true);
    });
  });
});
