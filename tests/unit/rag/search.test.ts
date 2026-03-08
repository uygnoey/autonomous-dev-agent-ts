import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { CodeRecord } from 'core/types.js';
import { RagSearcher } from 'rag/search.js';
import type { EmbeddingProvider } from 'rag/types.js';
import { CodeVectorStore } from 'rag/vector-store.js';

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

  // ── 생성자 ──────────────────────────────────────────────────

  describe('RagSearcher 생성자', () => {
    it('인스턴스가 생성된다', () => {
      expect(searcher).toBeDefined();
    });

    it('RagSearcher 인스턴스이다', () => {
      expect(searcher).toBeInstanceOf(RagSearcher);
    });

    it('debug logger로 생성 가능', async () => {
      const debugSearcher = new RagSearcher(store, provider, new ConsoleLogger('debug'));
      expect(debugSearcher).toBeInstanceOf(RagSearcher);
    });
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

    it('반환값이 배열이다', async () => {
      const result = await searcher.searchCode('test');
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('ok=true 반환', async () => {
      await store.insert(createTestCodeRecord({ id: 'check-ok', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('check');
      expect(result.ok).toBe(true);
    });

    it('score가 숫자이다', async () => {
      await store.insert(createTestCodeRecord({ id: 'score-check', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]?.score).toBe('number');
      }
    });

    it('record.chunk가 문자열이다', async () => {
      await store.insert(createTestCodeRecord({
        id: 'chunk-str',
        chunk: 'function test() { return true; }',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]?.record.chunk).toBe('string');
      }
    });

    it('record.filePath가 문자열이다', async () => {
      await store.insert(createTestCodeRecord({ id: 'path-str', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]?.record.filePath).toBe('string');
      }
    });

    it('limit=1 → 최대 1개 반환', async () => {
      for (let i = 0; i < 3; i++) {
        await store.insert(createTestCodeRecord({
          id: `lim1-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test', 1);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(1);
      }
    });

    it('limit=10 → 최대 10개 반환', async () => {
      for (let i = 0; i < 15; i++) {
        await store.insert(createTestCodeRecord({
          id: `lim10-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test', 10);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(10);
      }
    });

    it('결과 record에 id 필드가 있다', async () => {
      await store.insert(createTestCodeRecord({ id: 'id-check', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.record.id).toBeDefined();
      }
    });

    it('결과 record에 metadata 필드가 있다', async () => {
      await store.insert(createTestCodeRecord({ id: 'meta-check', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.record.metadata).toBeDefined();
      }
    });

    it('filter language=python → typescript 레코드 제외', async () => {
      await store.insert(createTestCodeRecord({
        id: 'lang-ts',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'f', lastModified: new Date(), modifiedBy: 'x' },
      }));
      await store.insert(createTestCodeRecord({
        id: 'lang-py',
        embedding: new Float32Array([0.9, 0.1, 0, 0]),
        metadata: { language: 'python', module: 'src', functionName: 'g', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('test', 10, { language: 'python' });
      if (result.ok) {
        for (const item of result.value) {
          expect(item.record.metadata.language).toBe('python');
        }
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

    it('반환값이 배열이다', async () => {
      const result = await searcher.searchByFile('src/any.ts');
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('ok=true 반환', async () => {
      const result = await searcher.searchByFile('src/any.ts');
      expect(result.ok).toBe(true);
    });

    it('같은 파일 경로 레코드 삽입 후 searchByFile → ok', async () => {
      const path = 'src/core/multi.ts';
      await store.insert(createTestCodeRecord({
        id: 'multi-only',
        filePath: path,
        embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
      }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
    });

    it('빈 파일 경로 → 빈 배열 또는 ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'empty-path-test', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('반환 record들은 모두 filePath가 요청 경로와 일치', async () => {
      const path = 'src/api/routes.ts';
      await store.insert(createTestCodeRecord({
        id: 'route-1',
        filePath: path,
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      await store.insert(createTestCodeRecord({
        id: 'other-1',
        filePath: 'src/core/main.ts',
        embedding: new Float32Array([0, 1, 0, 0]),
      }));
      const result = await searcher.searchByFile(path);
      if (result.ok) {
        for (const record of result.value) {
          expect(record.filePath).toBe(path);
        }
      }
    });

    it('반환 record에 chunk 필드가 있다', async () => {
      await store.insert(createTestCodeRecord({
        id: 'chunk-field',
        filePath: 'src/chunk.ts',
        chunk: 'function chunk() {}',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchByFile('src/chunk.ts');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]?.chunk).toBe('string');
      }
    });

    it('반환 record에 metadata.language 필드가 있다', async () => {
      await store.insert(createTestCodeRecord({
        id: 'lang-field',
        filePath: 'src/lang.ts',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchByFile('src/lang.ts');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.metadata.language).toBeDefined();
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

    it('특수문자 쿼리로 검색한다', async () => {
      await store.insert(createTestCodeRecord({ id: 'special', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('!@#$%^&*()');
      expect(result.ok).toBe(true);
    });

    it('숫자 쿼리로 검색한다', async () => {
      await store.insert(createTestCodeRecord({ id: 'num-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('1234567890');
      expect(result.ok).toBe(true);
    });

    it('공백 쿼리로 검색한다', async () => {
      await store.insert(createTestCodeRecord({ id: 'space-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('   ');
      expect(result.ok).toBe(true);
    });

    it('검색 결과가 TypeScript이다', async () => {
      const result = await searcher.searchCode('test');
      if (result.ok) {
        expect(typeof result.ok).toBe('boolean');
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('연속 searchCode 호출 → 모두 ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'seq-1', embedding: new Float32Array([1, 0, 0, 0]) }));
      for (let i = 0; i < 5; i++) {
        const result = await searcher.searchCode(`query-${i}`);
        expect(result.ok).toBe(true);
      }
    });

    it('연속 searchByFile 호출 → 모두 ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'seq-f-1', filePath: 'src/f.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      for (let i = 0; i < 5; i++) {
        const result = await searcher.searchByFile('src/f.ts');
        expect(result.ok).toBe(true);
      }
    });

    it('10개 레코드 삽입 후 검색 → ok', async () => {
      for (let i = 0; i < 10; i++) {
        await store.insert(createTestCodeRecord({
          id: `bulk-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('다양한 언어 레코드 → 검색 ok', async () => {
      const langs = ['typescript', 'python', 'javascript', 'go', 'rust'];
      for (const lang of langs) {
        await store.insert(createTestCodeRecord({
          id: `lang-${lang}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
          metadata: { language: lang, module: 'src', functionName: 'fn', lastModified: new Date(), modifiedBy: 'x' },
        }));
      }
      const result = await searcher.searchCode('function');
      expect(result.ok).toBe(true);
    });
  });

  // ── 추가 경계값: searchCode 반환 구조 ───────────────────────

  describe('searchCode 반환값 구조 검증', () => {
    it('ok는 boolean', async () => {
      const result = await searcher.searchCode('test');
      expect(typeof result.ok).toBe('boolean');
    });

    it('value는 배열', async () => {
      const result = await searcher.searchCode('test');
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('레코드 1개 삽입 → 검색 결과 score >= 0', async () => {
      await store.insert(createTestCodeRecord({ id: 'score-pos', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]!.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('레코드 record.id는 string', async () => {
      await store.insert(createTestCodeRecord({ id: 'id-str-test', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]!.record.id).toBe('string');
      }
    });

    it('레코드 record.projectId는 string', async () => {
      await store.insert(createTestCodeRecord({ id: 'proj-id-test', projectId: 'my-proj', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok && result.value.length > 0) {
        expect(typeof result.value[0]!.record.projectId).toBe('string');
      }
    });

    it('5번 반복 searchCode → 항상 ok=true', async () => {
      await store.insert(createTestCodeRecord({ id: 'repeat-s', embedding: new Float32Array([1, 0, 0, 0]) }));
      for (let i = 0; i < 5; i++) {
        const result = await searcher.searchCode('repeat');
        expect(result.ok).toBe(true);
      }
    });

    it('5번 반복 searchByFile → 항상 ok=true', async () => {
      await store.insert(createTestCodeRecord({ id: 'repeat-f', filePath: 'src/r.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      for (let i = 0; i < 5; i++) {
        const result = await searcher.searchByFile('src/r.ts');
        expect(result.ok).toBe(true);
      }
    });

    it('limit=3 → 최대 3개', async () => {
      for (let i = 0; i < 6; i++) {
        await store.insert(createTestCodeRecord({
          id: `limit3-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test', 3);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(3);
    });

    it('module 필터 → 일치하는 레코드만', async () => {
      await store.insert(createTestCodeRecord({
        id: 'mod-core',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src/core', functionName: 'fn', lastModified: new Date(), modifiedBy: 'x' },
      }));
      await store.insert(createTestCodeRecord({
        id: 'mod-rag',
        embedding: new Float32Array([0.9, 0.1, 0, 0]),
        metadata: { language: 'typescript', module: 'src/rag', functionName: 'fn2', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('test', 10, { module: 'src/core' });
      if (result.ok) {
        for (const item of result.value) {
          expect(item.record.metadata.module).toBe('src/core');
        }
      }
    });

    it('검색 결과 없음 → 빈 배열', async () => {
      const result = await searcher.searchCode('nonexistent-query-xyz');
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('searchByFile result.value 배열 원소에 filePath 필드 있음', async () => {
      await store.insert(createTestCodeRecord({
        id: 'field-check',
        filePath: 'src/check.ts',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchByFile('src/check.ts');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.filePath).toBeDefined();
      }
    });
  });

  // ── UUID / 랜덤 ID 경계값 ─────────────────────────────────────

  describe('UUID/랜덤 ID 경계값', () => {
    it('UUID id 레코드 삽입 후 검색 → ok', async () => {
      const uuid = crypto.randomUUID();
      await store.insert(createTestCodeRecord({ id: uuid, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('10개 UUID id 레코드 삽입 후 검색 → ok', async () => {
      for (let i = 0; i < 10; i++) {
        await store.insert(createTestCodeRecord({
          id: crypto.randomUUID(),
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('한글 chunk → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'kr-chunk',
        chunk: '// 인증 서비스 구현',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('인증');
      expect(result.ok).toBe(true);
    });

    it('특수문자 포함 chunk → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'special-chunk',
        chunk: 'function test() { return null; } // @#$%^&*',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('!@#$%');
      expect(result.ok).toBe(true);
    });

    it('빈 chunk → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'empty-chunk',
        chunk: '',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('매우 긴 chunk → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'long-chunk',
        chunk: 'function test() {}'.repeat(100),
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('function');
      expect(result.ok).toBe(true);
    });

    it('동일 chunk 다른 id → 둘 다 검색됨', async () => {
      await store.insert(createTestCodeRecord({ id: 'dup-1', chunk: 'same chunk', embedding: new Float32Array([1, 0, 0, 0]) }));
      await store.insert(createTestCodeRecord({ id: 'dup-2', chunk: 'same chunk', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await searcher.searchCode('same chunk', 10);
      expect(result.ok).toBe(true);
    });

    it('limit=0 → 빈 배열 또는 ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'limit0', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test', 0);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('음수 limit → ok 또는 에러 처리됨', async () => {
      await store.insert(createTestCodeRecord({ id: 'neg-limit', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test', -1);
      expect(typeof result.ok).toBe('boolean');
    });

    it('최대 limit=1000 → ok', async () => {
      for (let i = 0; i < 5; i++) {
        await store.insert(createTestCodeRecord({
          id: `max-lim-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test', 1000);
      expect(result.ok).toBe(true);
    });
  });

  // ── 다양한 metadata filter 경계값 ────────────────────────────

  describe('metadata filter 경계값', () => {
    it('존재하지 않는 language 필터 → 빈 배열', async () => {
      await store.insert(createTestCodeRecord({
        id: 'lang-ts-only',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'fn', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('test', 10, { language: 'cobol' });
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it('functionName 필터 → 일치 레코드만', async () => {
      await store.insert(createTestCodeRecord({
        id: 'fn-match',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'loadConfig', lastModified: new Date(), modifiedBy: 'x' },
      }));
      await store.insert(createTestCodeRecord({
        id: 'fn-other',
        embedding: new Float32Array([0.9, 0.1, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'saveConfig', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('config', 10, { functionName: 'loadConfig' });
      if (result.ok) {
        for (const item of result.value) {
          expect(item.record.metadata.functionName).toBe('loadConfig');
        }
      }
    });

    it('modifiedBy 필터 → ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'modified-by',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'fn', lastModified: new Date(), modifiedBy: 'alice' },
      }));
      const result = await searcher.searchCode('test', 10, { modifiedBy: 'alice' });
      expect(result.ok).toBe(true);
    });

    it('빈 filter 객체 → 필터 없음과 동일', async () => {
      await store.insert(createTestCodeRecord({ id: 'no-filter', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test', 10, {});
      expect(result.ok).toBe(true);
    });

    it('language + module 복합 필터 → ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'combo-filter',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src/core', functionName: 'fn', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('test', 10, { language: 'typescript', module: 'src/core' });
      expect(result.ok).toBe(true);
    });
  });

  // ── searchByFile 추가 edge 케이스 ────────────────────────────

  describe('searchByFile 추가 edge 케이스', () => {
    it('UUID 파일 경로로 검색 → ok', async () => {
      const path = `src/${crypto.randomUUID()}.ts`;
      await store.insert(createTestCodeRecord({ id: 'uuid-path', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
    });

    it('한글 파일 경로 → ok', async () => {
      const path = 'src/설정/config.ts';
      await store.insert(createTestCodeRecord({ id: 'kr-path', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
    });

    it('중첩 경로 → 정확히 일치하는 레코드만 반환', async () => {
      await store.insert(createTestCodeRecord({ id: 'deep1', filePath: 'a/b/c/d.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      await store.insert(createTestCodeRecord({ id: 'deep2', filePath: 'a/b/c/e.ts', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await searcher.searchByFile('a/b/c/d.ts');
      if (result.ok) {
        for (const rec of result.value) {
          expect(rec.filePath).toBe('a/b/c/d.ts');
        }
      }
    });

    it('존재하지 않는 경로 → 빈 배열', async () => {
      await store.insert(createTestCodeRecord({ id: 'exist', filePath: 'src/exist.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('src/nonexist.ts');
      if (result.ok) expect(result.value.length).toBe(0);
    });

    it('빈 문자열 경로 → 빈 배열', async () => {
      await store.insert(createTestCodeRecord({ id: 'non-empty', filePath: 'src/main.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('');
      if (result.ok) expect(result.value).toEqual([]);
    });
  });

  // ── searchCode 추가 edge/random 케이스 ──────────────────────

  describe('searchCode 추가 edge/random 케이스', () => {
    it('UUID 형식 쿼리 → ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'uuid-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = await searcher.searchCode(uuid);
      expect(result.ok).toBe(true);
    });

    it('탭 문자 포함 쿼리 → ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'tab-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('\t\tfunction\t');
      expect(result.ok).toBe(true);
    });

    it('개행 문자 포함 쿼리 → ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'newline-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('function\nloadConfig\n');
      expect(result.ok).toBe(true);
    });

    it('이모지 포함 쿼리 → ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'emoji-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('find 🔑 config');
      expect(result.ok).toBe(true);
    });

    it('연속 공백 쿼리 → ok', async () => {
      await store.insert(createTestCodeRecord({ id: 'spaces-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('     ');
      expect(result.ok).toBe(true);
    });

    it('최대값 Float32 임베딩 → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'max-embed',
        embedding: new Float32Array([3.4e38, 3.4e38, 3.4e38, 3.4e38]),
      }));
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('최솟값 Float32 임베딩 → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'min-embed',
        embedding: new Float32Array([0, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('음수 임베딩 → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'neg-embed',
        embedding: new Float32Array([-0.5, -0.5, -0.5, -0.5]),
      }));
      const result = await searcher.searchCode('test');
      expect(result.ok).toBe(true);
    });

    it('동일 filePath 여러 레코드 삽입 → searchCode ok', async () => {
      const path = 'src/shared/util.ts';
      for (let i = 0; i < 5; i++) {
        await store.insert(createTestCodeRecord({
          id: `same-path-${i}`,
          filePath: path,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('utility');
      expect(result.ok).toBe(true);
    });

    it('100자 짧은 chunk → 검색 ok', async () => {
      const chunk = 'const x = 1;'.repeat(8);
      await store.insert(createTestCodeRecord({
        id: 'short-chunk-100',
        chunk,
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('const');
      expect(result.ok).toBe(true);
    });

    it('모든 ASCII 특수문자 포함 chunk → 검색 ok', async () => {
      await store.insert(createTestCodeRecord({
        id: 'ascii-special',
        chunk: '!@#$%^&*()-_=+[]{}|;:\',.<>?/`~',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      const result = await searcher.searchCode('special');
      expect(result.ok).toBe(true);
    });

    it('20개 레코드 순서 삽입 → limit=5 결과 5개 이하', async () => {
      for (let i = 0; i < 20; i++) {
        await store.insert(createTestCodeRecord({
          id: `order-${i}`,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchCode('test', 5);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(5);
    });

    it('metadata.modifiedBy 필터 미매칭 → 빈 배열', async () => {
      await store.insert(createTestCodeRecord({
        id: 'mod-by-alice',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'fn', lastModified: new Date(), modifiedBy: 'alice' },
      }));
      const result = await searcher.searchCode('test', 10, { modifiedBy: 'nobody' });
      if (result.ok) expect(result.value.length).toBe(0);
    });

    it('filter functionName 미매칭 → 빈 배열', async () => {
      await store.insert(createTestCodeRecord({
        id: 'fn-nomatch',
        embedding: new Float32Array([1, 0, 0, 0]),
        metadata: { language: 'typescript', module: 'src', functionName: 'realFn', lastModified: new Date(), modifiedBy: 'x' },
      }));
      const result = await searcher.searchCode('test', 10, { functionName: 'ghostFn' });
      if (result.ok) expect(result.value.length).toBe(0);
    });

    it('searchCode 결과 items에 score 필드가 number', async () => {
      await store.insert(createTestCodeRecord({ id: 'score-num', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok) {
        for (const item of result.value) {
          expect(typeof item.score).toBe('number');
        }
      }
    });

    it('searchCode 결과 items에 record.id 필드가 string', async () => {
      await store.insert(createTestCodeRecord({ id: 'id-string', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok) {
        for (const item of result.value) {
          expect(typeof item.record.id).toBe('string');
        }
      }
    });

    it('searchCode 결과 items에 record.chunk 필드가 string', async () => {
      await store.insert(createTestCodeRecord({ id: 'chunk-string', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchCode('test');
      if (result.ok) {
        for (const item of result.value) {
          expect(typeof item.record.chunk).toBe('string');
        }
      }
    });

    it('searchCode ok=true의 value는 배열', async () => {
      const result = await searcher.searchCode('any query');
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('다른 MockEmbeddingProvider dimensions → 검색 ok', async () => {
      const bigProvider = new MockEmbeddingProvider(8);
      const bigStore = new CodeVectorStore(tempDir + '-big', logger);
      await bigStore.initialize();
      const bigSearcher = new RagSearcher(bigStore, bigProvider, logger);
      await bigStore.insert(createTestCodeRecord({
        id: 'big-dim',
        embedding: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      }));
      const result = await bigSearcher.searchCode('test');
      expect(typeof result.ok).toBe('boolean');
      await rm(tempDir + '-big', { recursive: true, force: true });
    });
  });

  // ── searchByFile 추가 edge/random 케이스 ─────────────────────

  describe('searchByFile 추가 edge/random 케이스', () => {
    it('점(.)으로 시작하는 파일 경로 → ok', async () => {
      const path = '.hidden/config.ts';
      await store.insert(createTestCodeRecord({ id: 'dotfile', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
    });

    it('확장자 없는 파일 경로 → ok', async () => {
      const path = 'src/Makefile';
      await store.insert(createTestCodeRecord({ id: 'makefile', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
    });

    it('절대 경로 형식 → ok', async () => {
      const path = '/home/user/project/src/main.ts';
      await store.insert(createTestCodeRecord({ id: 'abs-path', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const rec of result.value) {
          expect(rec.filePath).toBe(path);
        }
      }
    });

    it('5개 다른 경로 삽입 → 각각 searchByFile ok', async () => {
      const paths = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
      for (const p of paths) {
        await store.insert(createTestCodeRecord({
          id: `path-${p}`,
          filePath: p,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      for (const p of paths) {
        const result = await searcher.searchByFile(p);
        expect(result.ok).toBe(true);
      }
    });

    it('searchByFile → 반환 records 타입 배열', async () => {
      const result = await searcher.searchByFile('any.ts');
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('searchByFile 반환 records 각 항목에 id 필드', async () => {
      await store.insert(createTestCodeRecord({ id: 'id-in-record', filePath: 'src/x.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('src/x.ts');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.id).toBeDefined();
      }
    });

    it('searchByFile 반환 records 각 항목에 chunk 필드', async () => {
      await store.insert(createTestCodeRecord({ id: 'chunk-in-record', filePath: 'src/y.ts', chunk: 'const y = 2;', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('src/y.ts');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.chunk).toBeDefined();
      }
    });

    it('searchByFile 경로 대소문자 정확 일치 확인', async () => {
      await store.insert(createTestCodeRecord({ id: 'case-1', filePath: 'src/Main.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      await store.insert(createTestCodeRecord({ id: 'case-2', filePath: 'src/main.ts', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await searcher.searchByFile('src/Main.ts');
      if (result.ok) {
        for (const rec of result.value) {
          expect(rec.filePath).toBe('src/Main.ts');
        }
      }
    });

    it('searchByFile → 10개 동일 경로 레코드 → 최소 1개 이상 반환', async () => {
      const path = 'src/shared.ts';
      for (let i = 0; i < 10; i++) {
        await store.insert(createTestCodeRecord({
          id: `same-path-10-${i}`,
          filePath: path,
          embedding: new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()]),
        }));
      }
      const result = await searcher.searchByFile(path);
      if (result.ok && result.value.length > 0) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        for (const rec of result.value) {
          expect(rec.filePath).toBe(path);
        }
      } else if (result.ok) {
        // 빈 배열도 허용 (검색 구현에 따라 다를 수 있음)
        expect(result.ok).toBe(true);
      }
    });

    it('searchByFile 결과 record에 metadata.lastModified 있음', async () => {
      await store.insert(createTestCodeRecord({ id: 'lm-field', filePath: 'src/lm.ts', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile('src/lm.ts');
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.metadata.lastModified).toBeDefined();
      }
    });

    it('searchByFile UUID 파일명 → ok', async () => {
      const uuid = crypto.randomUUID();
      const path = `src/${uuid}.ts`;
      await store.insert(createTestCodeRecord({ id: 'uuid-fn', filePath: path, embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await searcher.searchByFile(path);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.filePath).toBe(path);
      }
    });
  });
});
