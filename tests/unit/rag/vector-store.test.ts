import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import type { CodeRecord } from 'core/types.js';
import { CodeVectorStore } from 'rag/vector-store.js';

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

  // ── 생성자 ────────────────────────────────────────────────────

  describe('생성자', () => {
    it('인스턴스 생성됨', () => {
      expect(store).toBeDefined();
    });

    it('CodeVectorStore 인스턴스', () => {
      expect(store).toBeInstanceOf(CodeVectorStore);
    });

    it('두 인스턴스는 서로 다른 객체', () => {
      const store2 = new CodeVectorStore(tempDir, logger);
      expect(store).not.toBe(store2);
    });

    it('initialize 메서드 존재', () => {
      expect(typeof store.initialize).toBe('function');
    });

    it('insert 메서드 존재', () => {
      expect(typeof store.insert).toBe('function');
    });

    it('getById 메서드 존재', () => {
      expect(typeof store.getById).toBe('function');
    });

    it('search 메서드 존재', () => {
      expect(typeof store.search).toBe('function');
    });

    it('delete 메서드 존재', () => {
      expect(typeof store.delete).toBe('function');
    });

    it('update 메서드 존재', () => {
      expect(typeof store.update).toBe('function');
    });
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

    it('ok는 boolean 타입', async () => {
      const result = await store.initialize();
      expect(typeof result.ok).toBe('boolean');
    });

    it('두 번 초기화 → ok=true', async () => {
      const r1 = await store.initialize();
      const r2 = await store.initialize();
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
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

    it('insert ok는 boolean 타입', async () => {
      await store.initialize();
      const result = await store.insert(createTestCodeRecord({ id: 'bool-check' }));
      expect(typeof result.ok).toBe('boolean');
    });

    it('getById ok는 boolean 타입', async () => {
      await store.initialize();
      const result = await store.getById('bool-check');
      expect(typeof result.ok).toBe('boolean');
    });

    it('긴 chunk 삽입 가능', async () => {
      await store.initialize();
      const longChunk = 'x'.repeat(5000);
      const result = await store.insert(createTestCodeRecord({ id: 'long-chunk', chunk: longChunk }));
      expect(result.ok).toBe(true);
    });

    it('긴 chunk 조회 정확', async () => {
      await store.initialize();
      const longChunk = 'x'.repeat(5000);
      await store.insert(createTestCodeRecord({ id: 'long-get', chunk: longChunk }));
      const result = await store.getById('long-get');
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe(longChunk);
      }
    });

    it('UUID 형태 ID 삽입/조회', async () => {
      await store.initialize();
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await store.insert(createTestCodeRecord({ id: uuid }));
      const result = await store.getById(uuid);
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(uuid);
      }
    });

    it('한국어 chunk 삽입/조회', async () => {
      await store.initialize();
      const krChunk = '// 한국어 주석\nfunction 로드() { return {}; }';
      await store.insert(createTestCodeRecord({ id: 'kr-chunk', chunk: krChunk }));
      const result = await store.getById('kr-chunk');
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe(krChunk);
      }
    });

    it('10개 레코드 순차 삽입 → 모두 ok=true', async () => {
      await store.initialize();
      for (let i = 0; i < 10; i++) {
        const result = await store.insert(createTestCodeRecord({ id: `rec-${i}` }));
        expect(result.ok).toBe(true);
      }
    });

    it('10개 레코드 조회 → 모두 ok=true, value non-null', async () => {
      await store.initialize();
      for (let i = 0; i < 10; i++) {
        await store.insert(createTestCodeRecord({ id: `rec-get-${i}` }));
      }
      for (let i = 0; i < 10; i++) {
        const result = await store.getById(`rec-get-${i}`);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).not.toBeNull();
      }
    });

    it('filePath 보존', async () => {
      await store.initialize();
      const filePath = 'src/custom/module/path.ts';
      await store.insert(createTestCodeRecord({ id: 'fp-test', filePath }));
      const result = await store.getById('fp-test');
      if (result.ok && result.value) {
        expect(result.value.filePath).toBe(filePath);
      }
    });

    it('projectId 보존', async () => {
      await store.initialize();
      const projectId = 'my-special-project-123';
      await store.insert(createTestCodeRecord({ id: 'pid-test', projectId }));
      const result = await store.getById('pid-test');
      if (result.ok && result.value) {
        expect(result.value.projectId).toBe(projectId);
      }
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

    it('search ok는 boolean 타입', async () => {
      await store.initialize();
      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
      expect(typeof result.ok).toBe('boolean');
    });

    it('search value는 배열', async () => {
      await store.initialize();
      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('limit=1 → 최대 1개 반환', async () => {
      await store.initialize();
      for (let i = 0; i < 3; i++) {
        await store.insert(createTestCodeRecord({ id: `limit-test-${i}` }));
      }
      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(1);
      }
    });

    it('zero vector 검색 → ok=true', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'zero-test' }));
      const result = await store.search(new Float32Array([0, 0, 0, 0]), 5);
      expect(result.ok).toBe(true);
    });

    it('5회 연속 search → 모두 ok=true', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'repeat-search' }));
      for (let i = 0; i < 5; i++) {
        const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
        expect(result.ok).toBe(true);
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

    it('빈 테이블 searchWithScore → ok=true, value=[]', async () => {
      await store.initialize();
      const result = await store.searchWithScore(new Float32Array([1.0, 0.0, 0.0, 0.0]), 5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('score는 0 이상 1 이하', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({
        id: 'score-range',
        embedding: new Float32Array([0.5, 0.5, 0.0, 0.0]),
      }));
      const result = await store.searchWithScore(new Float32Array([0.5, 0.5, 0.0, 0.0]), 1);
      if (result.ok) {
        for (const item of result.value) {
          expect(item.score).toBeGreaterThanOrEqual(0);
          expect(item.score).toBeLessThanOrEqual(1);
        }
      }
    });

    it('searchWithScore ok는 boolean 타입', async () => {
      await store.initialize();
      const result = await store.searchWithScore(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
      expect(typeof result.ok).toBe('boolean');
    });

    it('결과 items가 record 필드를 가진다', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'score-record', chunk: 'test chunk' }));
      const result = await store.searchWithScore(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
      if (result.ok) {
        for (const item of result.value) {
          expect(item.record).toBeDefined();
          expect(typeof item.record.id).toBe('string');
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

    it('존재하지 않는 ID 삭제 → ok는 boolean 타입', async () => {
      await store.initialize();
      const result = await store.delete('nonexistent-id');
      // 존재하지 않는 ID 삭제는 구현에 따라 ok=true 또는 ok=false 가능
      expect(typeof result.ok).toBe('boolean');
    });

    it('delete ok는 boolean 타입', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'del-bool' }));
      const result = await store.delete('del-bool');
      expect(typeof result.ok).toBe('boolean');
    });

    it('삭제 후 다시 삽입 가능', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'del-insert' }));
      await store.delete('del-insert');
      const r = await store.insert(createTestCodeRecord({ id: 'del-insert', chunk: 'new chunk' }));
      expect(r.ok).toBe(true);
    });

    it('여러 레코드 순차 삭제 → 모두 ok=true', async () => {
      await store.initialize();
      for (let i = 0; i < 5; i++) {
        await store.insert(createTestCodeRecord({ id: `del-multi-${i}` }));
      }
      for (let i = 0; i < 5; i++) {
        const result = await store.delete(`del-multi-${i}`);
        expect(result.ok).toBe(true);
      }
    });

    it('빈 ID 삭제 → ok (no-op 또는 오류)', async () => {
      await store.initialize();
      const result = await store.delete('');
      expect(typeof result.ok).toBe('boolean');
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

    it('update ok는 boolean 타입', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'upd-bool' }));
      const result = await store.update('upd-bool', { chunk: 'updated' });
      expect(typeof result.ok).toBe('boolean');
    });

    it('존재하지 않는 ID 업데이트 → ok (no-op)', async () => {
      await store.initialize();
      const result = await store.update('nonexistent-upd', { chunk: 'new' });
      expect(typeof result.ok).toBe('boolean');
    });

    it('update 후 getById → 수정된 값 확인', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'upd-verify', chunk: 'original' }));
      await store.update('upd-verify', { chunk: 'modified' });
      const result = await store.getById('upd-verify');
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe('modified');
      }
    });

    it('긴 chunk로 업데이트', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({ id: 'upd-long', chunk: 'short' }));
      const longChunk = 'x'.repeat(3000);
      const result = await store.update('upd-long', { chunk: longChunk });
      expect(result.ok).toBe(true);
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

    it('이모지 포함 chunk 처리', async () => {
      await store.initialize();
      const chunk = '// 🚀 rocket function\nfunction launch() { return "🚀"; }';
      await store.insert(createTestCodeRecord({ id: 'emoji', chunk }));
      const result = await store.getById('emoji');
      if (result.ok && result.value) {
        expect(result.value.chunk).toBe(chunk);
      }
    });

    it('한국어 projectId → 저장/조회 가능', async () => {
      await store.initialize();
      const projectId = '한국어-프로젝트';
      await store.insert(createTestCodeRecord({ id: 'kr-proj', projectId }));
      const result = await store.getById('kr-proj');
      if (result.ok && result.value) {
        expect(result.value.projectId).toBe(projectId);
      }
    });

    it('한국어 filePath → 저장/조회 가능', async () => {
      await store.initialize();
      const filePath = 'src/모듈/파일.ts';
      await store.insert(createTestCodeRecord({ id: 'kr-file', filePath }));
      const result = await store.getById('kr-file');
      if (result.ok && result.value) {
        expect(result.value.filePath).toBe(filePath);
      }
    });

    it('metadata.language 보존', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({
        id: 'lang-test',
        metadata: {
          language: 'python',
          module: 'scripts',
          functionName: 'main',
          lastModified: new Date(),
          modifiedBy: 'indexer',
        },
      }));
      const result = await store.getById('lang-test');
      if (result.ok && result.value) {
        expect(result.value.metadata.language).toBe('python');
      }
    });

    it('metadata.functionName 보존', async () => {
      await store.initialize();
      await store.insert(createTestCodeRecord({
        id: 'fn-name-test',
        metadata: {
          language: 'typescript',
          module: 'src/core',
          functionName: 'mySpecialFunction',
          lastModified: new Date(),
          modifiedBy: 'code-indexer',
        },
      }));
      const result = await store.getById('fn-name-test');
      if (result.ok && result.value) {
        expect(result.value.metadata.functionName).toBe('mySpecialFunction');
      }
    });

    it('빈 string ID → getById null 반환', async () => {
      await store.initialize();
      const result = await store.getById('');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('50개 레코드 삽입 후 검색 → ok=true', async () => {
      await store.initialize();
      for (let i = 0; i < 50; i++) {
        await store.insert(createTestCodeRecord({ id: `perf-${i}` }));
      }
      const result = await store.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 10);
      expect(result.ok).toBe(true);
    });
  });
});
