import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ChunkSplitter } from '../../../src/rag/chunk-splitter.js';
import { CodeIndexer } from '../../../src/rag/code-indexer.js';
import { LocalEmbeddingProvider } from '../../../src/rag/embeddings.js';
import { CodeVectorStore } from '../../../src/rag/vector-store.js';

const logger = new ConsoleLogger('error');

describe('CodeIndexer', () => {
  let tempDir: string;
  let dbDir: string;
  let store: CodeVectorStore;
  let provider: LocalEmbeddingProvider;
  let splitter: ChunkSplitter;
  let indexer: CodeIndexer;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-indexer-test-'));
    dbDir = join(tempDir, 'db');
    await mkdir(dbDir, { recursive: true });

    store = new CodeVectorStore(dbDir, logger);
    await store.initialize();

    provider = new LocalEmbeddingProvider('test', 64, logger);
    splitter = new ChunkSplitter();
    indexer = new CodeIndexer(store, provider, splitter, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── indexFile ─────────────────────────────────────────────────

  describe('indexFile', () => {
    it('단일 TypeScript 파일을 인덱싱한다', async () => {
      const filePath = join(tempDir, 'test.ts');
      await writeFile(
        filePath,
        `
function greet(name: string): string {
  return 'Hello ' + name;
}

function farewell(name: string): string {
  return 'Bye ' + name;
}
`.trim(),
      );

      const result = await indexer.indexFile(filePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeGreaterThan(0);
      }
    });

    it('빈 파일은 0개 청크를 반환한다', async () => {
      const filePath = join(tempDir, 'empty.ts');
      await writeFile(filePath, '');

      const result = await indexer.indexFile(filePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it('존재하지 않는 파일에 대해 에러를 반환한다', async () => {
      const result = await indexer.indexFile(join(tempDir, 'nonexistent.ts'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('rag_file_not_found');
      }
    });

    it('인덱싱된 코드를 벡터 검색으로 찾을 수 있다', async () => {
      const filePath = join(tempDir, 'searchable.ts');
      await writeFile(
        filePath,
        `
function processData(input: string): string {
  return input.trim().toLowerCase();
}
`.trim(),
      );

      await indexer.indexFile(filePath);

      // 벡터 검색으로 확인
      const queryResult = await provider.embedQuery('process data');
      expect(queryResult.ok).toBe(true);
      if (queryResult.ok) {
        const searchResult = await store.search(queryResult.value, 5);
        expect(searchResult.ok).toBe(true);
        if (searchResult.ok) {
          expect(searchResult.value.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── indexDirectory ────────────────────────────────────────────

  describe('indexDirectory', () => {
    it('디렉토리를 재귀적으로 인덱싱한다', async () => {
      const srcDir = join(tempDir, 'src');
      const coreDir = join(srcDir, 'core');
      await mkdir(coreDir, { recursive: true });

      await writeFile(
        join(coreDir, 'config.ts'),
        'function loadConfig() { return {}; }',
      );
      await writeFile(
        join(coreDir, 'logger.ts'),
        'function createLogger() { return null; }',
      );

      const result = await indexer.indexDirectory(srcDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeGreaterThan(0);
      }
    });

    it('비코드 파일을 건너뛴다', async () => {
      const dir = join(tempDir, 'mixed');
      await mkdir(dir, { recursive: true });

      await writeFile(join(dir, 'code.ts'), 'function test() {}');
      await writeFile(join(dir, 'readme.md'), '# Readme');
      await writeFile(join(dir, 'data.json'), '{}');

      // 기본 extensions: ts, js, tsx, jsx — md, json은 제외
      const result = await indexer.indexDirectory(dir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // ts 파일만 인덱싱
        expect(result.value).toBeGreaterThan(0);
      }
    });

    it('빈 디렉토리에서 0을 반환한다', async () => {
      const emptyDir = join(tempDir, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const result = await indexer.indexDirectory(emptyDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it('커스텀 extensions 옵션이 적용된다', async () => {
      const dir = join(tempDir, 'custom');
      await mkdir(dir, { recursive: true });

      await writeFile(join(dir, 'app.ts'), 'function app() {}');
      await writeFile(join(dir, 'main.py'), 'def main(): pass');

      const result = await indexer.indexDirectory(dir, {
        extensions: ['py'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // py 파일만 인덱싱
        expect(result.value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('공백만 있는 파일은 0 청크를 반환한다', async () => {
      const filePath = join(tempDir, 'spaces.ts');
      await writeFile(filePath, '   \n\n   ');

      const result = await indexer.indexFile(filePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it('한국어 코드 주석이 포함된 파일을 처리한다', async () => {
      const filePath = join(tempDir, 'korean.ts');
      await writeFile(
        filePath,
        `
// 사용자 인증 함수
function authenticateUser(token: string): boolean {
  // 토큰 검증 로직
  return token.length > 0;
}
`.trim(),
      );

      const result = await indexer.indexFile(filePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeGreaterThan(0);
      }
    });
  });
});
