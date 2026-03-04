import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { CodeRecord } from '../../../src/core/types.js';
import { CodeVectorStore } from '../../../src/rag/vector-store.js';

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

describe('CodeVectorStore', () => {
  let tempDir: string;
  let store: CodeVectorStore;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-code-store-test-'));
    store = new CodeVectorStore(tempDir, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── initialize ────────────────────────────────────────────────

  describe('initialize', () => {
    it('정상적으로 초기화된다', async () => {
      const result = await store.initialize();

      expect(result.ok).toBe(true);
    });

    it('잘못된 경로에서 초기화 실패한다', async () => {
      const badStore = new CodeVectorStore('/nonexistent/path/\0invalid', logger);
      const result = await badStore.initialize();

      expect(result.ok).toBe(false);
    });
  });

  // ── insert + getById ──────────────────────────────────────────

  describe('insert + getById', () => {
    it('레코드를 삽입하고 조회할 수 있다', async () => {
      await store.initialize();
      const record = createTestCodeRecord({ id: 'code-001' });

      const insertResult = await store.insert(record);
      expect(insertResult.ok).toBe(true);

      const getResult = await store.getById('code-001');
      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value) {
        expect(getResult.value.id).toBe('code-001');
        expect(getResult.value.filePath).toBe('src/core/config.ts');
        expect(getResult.value.metadata.language).toBe('typescript');
      }
    });

    it('여러 레코드를 삽입할 수 있다', async () => {
      await store.initialize();

      await store.insert(createTestCodeRecord({ id: 'a' }));
      await store.insert(createTestCodeRecord({ id: 'b' }));
      await store.insert(createTestCodeRecord({ id: 'c' }));

      const resultA = await store.getById('a');
      const resultC = await store.getById('c');

      expect(resultA.ok).toBe(true);
      expect(resultC.ok).toBe(true);
      if (resultA.ok) expect(resultA.value?.id).toBe('a');
      if (resultC.ok) expect(resultC.value?.id).toBe('c');
    });

    it('존재하지 않는 ID는 null을 반환한다', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'exists' }));

      const result = await store.getById('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('초기화 후 insert 전에 getById는 null을 반환한다', async () => {
      await store.initialize();

      const result = await store.getById('any-id');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });
  });

  // ── search ────────────────────────────────────────────────────

  describe('search', () => {
    it('벡터 검색이 동작한다', async () => {
      await store.initialize();

      await store.insert(
        createTestCodeRecord({
          id: 's1',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
          chunk: 'first chunk',
        }),
      );
      await store.insert(
        createTestCodeRecord({
          id: 's2',
          embedding: new Float32Array([0.0, 1.0, 0.0, 0.0]),
          chunk: 'second chunk',
        }),
      );

      const query = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const result = await store.search(query, 2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0]?.id).toBe('s1');
      }
    });

    it('빈 테이블에서 검색하면 빈 배열을 반환한다', async () => {
      await store.initialize();

      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 10);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('limit이 적용된다', async () => {
      await store.initialize();

      for (let i = 0; i < 5; i++) {
        await store.insert(createTestCodeRecord({ id: `item-${i}` }));
      }

      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 2);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(2);
    });

    it('filter를 적용하여 검색할 수 있다 (language)', async () => {
      await store.initialize();

      await store.insert(
        createTestCodeRecord({
          id: 'ts-1',
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
          id: 'py-1',
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

      const result = await store.search(new Float32Array([1.0, 0.0, 0.0, 0.0]), 10, {
        language: 'python',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const record of result.value) {
          expect(record.metadata.language).toBe('python');
        }
      }
    });

    it('filter를 적용하여 검색할 수 있다 (filePath)', async () => {
      await store.initialize();

      await store.insert(
        createTestCodeRecord({
          id: 'file-a',
          filePath: 'src/core/config.ts',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );
      await store.insert(
        createTestCodeRecord({
          id: 'file-b',
          filePath: 'src/rag/search.ts',
          embedding: new Float32Array([0.9, 0.1, 0.0, 0.0]),
        }),
      );

      const result = await store.search(new Float32Array([1.0, 0.0, 0.0, 0.0]), 10, {
        filePath: 'src/rag/search.ts',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const record of result.value) {
          expect(record.filePath).toBe('src/rag/search.ts');
        }
      }
    });
  });

  // ── searchWithScore ───────────────────────────────────────────

  describe('searchWithScore', () => {
    it('점수가 포함된 검색 결과를 반환한다', async () => {
      await store.initialize();

      await store.insert(
        createTestCodeRecord({
          id: 'scored-1',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );

      const result = await store.searchWithScore(
        new Float32Array([1.0, 0.0, 0.0, 0.0]),
        5,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        const first = result.value[0];
        expect(first).toBeDefined();
        if (first) {
          expect(first.record.id).toBe('scored-1');
          expect(first.score).toBeGreaterThan(0);
          expect(first.score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // ── delete ────────────────────────────────────────────────────

  describe('delete', () => {
    it('레코드를 삭제할 수 있다', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'del-me' }));

      const deleteResult = await store.delete('del-me');
      expect(deleteResult.ok).toBe(true);

      const getResult = await store.getById('del-me');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) expect(getResult.value).toBeNull();
    });
  });

  // ── update ────────────────────────────────────────────────────

  describe('update', () => {
    it('chunk를 업데이트할 수 있다', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'upd-1', chunk: '원래 코드' }));

      const updateResult = await store.update('upd-1', { chunk: '수정된 코드' });
      expect(updateResult.ok).toBe(true);

      const getResult = await store.getById('upd-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value) {
        expect(getResult.value.chunk).toBe('수정된 코드');
      }
    });
  });

  // ── edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('특수문자가 포함된 chunk를 처리한다', async () => {
      await store.initialize();
      const chunk = "it's a test with 'single quotes' and \"double\"";
      await store.insert(createTestCodeRecord({ id: 'special', chunk }));

      const result = await store.getById('special');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe(chunk);
      }
    });

    it('빈 chunk를 처리한다', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'empty', chunk: '' }));

      const result = await store.getById('empty');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe('');
      }
    });

    it('한국어 chunk를 처리한다', async () => {
      await store.initialize();
      await store.insert(
        createTestCodeRecord({ id: 'kr', chunk: '// 한국어 코드 주석' }),
      );

      const result = await store.getById('kr');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe('// 한국어 코드 주석');
      }
    });
  });
});
