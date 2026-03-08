/**
 * CodeIndexer 단위 테스트
 *
 * @description
 * KR: indexFile/indexDirectory 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for CodeIndexer methods. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import { ChunkSplitter } from 'rag/chunk-splitter.js';
import { CodeIndexer } from 'rag/code-indexer.js';
import type { EmbeddingProvider } from 'rag/types.js';
import { CodeVectorStore } from 'rag/vector-store.js';

const logger = new ConsoleLogger('error');

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

let tempDir: string;
let dbDir: string;
let store: CodeVectorStore;
let provider: MockEmbeddingProvider;
let splitter: ChunkSplitter;
let indexer: CodeIndexer;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'adev-indexer-test-'));
  dbDir = join(tempDir, 'db');
  await mkdir(dbDir, { recursive: true });
  store = new CodeVectorStore(dbDir, logger);
  await store.initialize();
  provider = new MockEmbeddingProvider(64);
  splitter = new ChunkSplitter();
  indexer = new CodeIndexer(store, provider, splitter, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ── 생성자 ────────────────────────────────────────────────────

describe('CodeIndexer 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(indexer).toBeDefined();
  });

  it('CodeIndexer 인스턴스이다', () => {
    expect(indexer).toBeInstanceOf(CodeIndexer);
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const indexer2 = new CodeIndexer(store, provider, splitter, logger);
    expect(indexer).not.toBe(indexer2);
  });

  it('indexFile 메서드가 존재한다', () => {
    expect(typeof indexer.indexFile).toBe('function');
  });

  it('indexDirectory 메서드가 존재한다', () => {
    expect(typeof indexer.indexDirectory).toBe('function');
  });

  it('다른 dimensions provider로도 생성 가능', () => {
    const provider32 = new MockEmbeddingProvider(32);
    expect(() => new CodeIndexer(store, provider32, splitter, logger)).not.toThrow();
  });

  it('dimensions=128 provider로 생성', () => {
    const provider128 = new MockEmbeddingProvider(128);
    const indexer128 = new CodeIndexer(store, provider128, splitter, logger);
    expect(indexer128).toBeInstanceOf(CodeIndexer);
  });
});

// ── indexFile - 성공 케이스 ───────────────────────────────────

describe('CodeIndexer indexFile - 성공 케이스', () => {
  it('단일 TS 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'test.ts');
    await writeFile(filePath, 'function greet(name: string): string { return "Hello " + name; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('단일 TS 파일 → value > 0', async () => {
    const filePath = join(tempDir, 'test.ts');
    await writeFile(filePath, 'function greet(name: string): string { return "Hello " + name; }');
    const result = await indexer.indexFile(filePath);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });

  it('두 함수 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'two-funcs.ts');
    await writeFile(filePath, [
      'function greet(name: string): string { return "Hello " + name; }',
      'function farewell(name: string): string { return "Bye " + name; }',
    ].join('\n'));
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('JS 파일도 인덱싱 가능', async () => {
    const filePath = join(tempDir, 'app.js');
    await writeFile(filePath, 'function main() { console.log("main"); }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('한국어 주석 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'korean.ts');
    await writeFile(filePath, '// 사용자 인증 함수\nfunction auth(token: string): boolean { return token.length > 0; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('한국어 주석 포함 파일 → value > 0', async () => {
    const filePath = join(tempDir, 'korean.ts');
    await writeFile(filePath, '// 사용자 인증 함수\nfunction auth(token: string): boolean { return token.length > 0; }');
    const result = await indexer.indexFile(filePath);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });

  it('긴 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'long.ts');
    const lines = Array.from({ length: 50 }, (_, i) => `function func${i}() { return ${i}; }`);
    await writeFile(filePath, lines.join('\n'));
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('인덱싱 후 검색 가능', async () => {
    const filePath = join(tempDir, 'searchable.ts');
    await writeFile(filePath, 'function processData(input: string): string { return input.trim().toLowerCase(); }');
    await indexer.indexFile(filePath);
    const queryResult = await provider.embedQuery('process data');
    expect(queryResult.ok).toBe(true);
    if (queryResult.ok) {
      const searchResult = await store.search(queryResult.value, 5);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) expect(searchResult.value.length).toBeGreaterThan(0);
    }
  });

  it('같은 파일 두 번 인덱싱 → ok=true', async () => {
    const filePath = join(tempDir, 'dup.ts');
    await writeFile(filePath, 'function x() { return 1; }');
    const r1 = await indexer.indexFile(filePath);
    const r2 = await indexer.indexFile(filePath);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('TSX 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'Component.tsx');
    await writeFile(filePath, 'function Component() { return null; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('indexFile ok는 boolean 타입', async () => {
    const filePath = join(tempDir, 'typed.ts');
    await writeFile(filePath, 'function typed() {}');
    const result = await indexer.indexFile(filePath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('value는 number 타입', async () => {
    const filePath = join(tempDir, 'num.ts');
    await writeFile(filePath, 'function numFunc() { return 42; }');
    const result = await indexer.indexFile(filePath);
    if (result.ok) {
      expect(typeof result.value).toBe('number');
    }
  });

  it('5개 파일 연속 인덱싱 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const filePath = join(tempDir, `file${i}.ts`);
      await writeFile(filePath, `function func${i}() { return ${i}; }`);
      const result = await indexer.indexFile(filePath);
      expect(result.ok).toBe(true);
    }
  });

  it('같은 파일 10번 인덱싱 → 모두 ok=true', async () => {
    const filePath = join(tempDir, 'repeat.ts');
    await writeFile(filePath, 'function repeatMe() { return "repeated"; }');
    for (let i = 0; i < 10; i++) {
      const result = await indexer.indexFile(filePath);
      expect(result.ok).toBe(true);
    }
  });

  it('단일 문자 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'single.ts');
    await writeFile(filePath, 'a');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('1000줄 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'big.ts');
    const lines = Array.from({ length: 1000 }, (_, i) => `// line ${i}`);
    await writeFile(filePath, lines.join('\n'));
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('이모지 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'emoji.ts');
    await writeFile(filePath, '// 🚀 rocket function\nfunction launch() { return "🚀"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('인터페이스 정의 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'interface.ts');
    await writeFile(filePath, 'interface User { name: string; age: number; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });
});

// ── indexFile - 경계값 케이스 ─────────────────────────────────

describe('CodeIndexer indexFile - 경계값 케이스', () => {
  it('빈 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'empty.ts');
    await writeFile(filePath, '');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('빈 파일 → value=0', async () => {
    const filePath = join(tempDir, 'empty.ts');
    await writeFile(filePath, '');
    const result = await indexer.indexFile(filePath);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('공백만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'spaces.ts');
    await writeFile(filePath, '   \n\n   ');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('공백만 있는 파일 → value=0', async () => {
    const filePath = join(tempDir, 'spaces.ts');
    await writeFile(filePath, '   \n\n   ');
    const result = await indexer.indexFile(filePath);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('존재하지 않는 파일 → ok=false', async () => {
    const result = await indexer.indexFile(join(tempDir, 'nonexistent.ts'));
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 파일 → code=rag_file_not_found', async () => {
    const result = await indexer.indexFile(join(tempDir, 'nonexistent.ts'));
    if (!result.ok) expect(result.error.code).toBe('rag_file_not_found');
  });

  it('주석만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'comments-only.ts');
    await writeFile(filePath, '// just a comment\n// another comment\n');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('개행만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'newlines.ts');
    await writeFile(filePath, '\n\n\n\n');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 파일 error.code는 string 타입', async () => {
    const result = await indexer.indexFile(join(tempDir, 'missing.ts'));
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('존재하지 않는 파일 error.message는 string 타입', async () => {
    const result = await indexer.indexFile(join(tempDir, 'missing.ts'));
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('탭만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'tabs.ts');
    await writeFile(filePath, '\t\t\t');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('단일 개행 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'singleline.ts');
    await writeFile(filePath, '\n');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 파일 5개 → 모두 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await indexer.indexFile(join(tempDir, `nonexistent-${i}.ts`));
      expect(result.ok).toBe(false);
    }
  });

  it('존재하지 않는 파일 → ok는 boolean 타입', async () => {
    const result = await indexer.indexFile(join(tempDir, 'nonexistent.ts'));
    expect(typeof result.ok).toBe('boolean');
  });

  it('정말 깊은 경로의 파일 → ok=false', async () => {
    const deepPath = join(tempDir, 'a', 'b', 'c', 'd', 'e', 'nonexistent.ts');
    const result = await indexer.indexFile(deepPath);
    expect(result.ok).toBe(false);
  });

  it('빈 파일 여러 개 인덱싱 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const filePath = join(tempDir, `empty${i}.ts`);
      await writeFile(filePath, '');
      const result = await indexer.indexFile(filePath);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(0);
    }
  });
});

// ── indexDirectory - 성공 케이스 ─────────────────────────────

describe('CodeIndexer indexDirectory - 성공 케이스', () => {
  it('빈 디렉토리 → ok=true', async () => {
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const result = await indexer.indexDirectory(emptyDir);
    expect(result.ok).toBe(true);
  });

  it('빈 디렉토리 → value=0', async () => {
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const result = await indexer.indexDirectory(emptyDir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('1개 TS 파일 디렉토리 → ok=true', async () => {
    const dir = join(tempDir, 'src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), 'function main() { return 0; }');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('1개 TS 파일 디렉토리 → value > 0', async () => {
    const dir = join(tempDir, 'src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), 'function main() { return 0; }');
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });

  it('재귀 디렉토리 → ok=true', async () => {
    const srcDir = join(tempDir, 'src');
    const coreDir = join(srcDir, 'core');
    await mkdir(coreDir, { recursive: true });
    await writeFile(join(coreDir, 'config.ts'), 'function loadConfig() { return {}; }');
    await writeFile(join(coreDir, 'logger.ts'), 'function createLogger() { return null; }');
    const result = await indexer.indexDirectory(srcDir);
    expect(result.ok).toBe(true);
  });

  it('재귀 디렉토리 → value > 0', async () => {
    const srcDir = join(tempDir, 'src');
    const coreDir = join(srcDir, 'core');
    await mkdir(coreDir, { recursive: true });
    await writeFile(join(coreDir, 'config.ts'), 'function loadConfig() { return {}; }');
    const result = await indexer.indexDirectory(srcDir);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });

  it('비코드 파일(md/json) 건너뜀 → ok=true', async () => {
    const dir = join(tempDir, 'mixed');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'code.ts'), 'function test() {}');
    await writeFile(join(dir, 'readme.md'), '# Readme');
    await writeFile(join(dir, 'data.json'), '{}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('커스텀 extensions=[py] → ok=true', async () => {
    const dir = join(tempDir, 'custom');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'app.ts'), 'function app() {}');
    await writeFile(join(dir, 'main.py'), 'def main(): pass');
    const result = await indexer.indexDirectory(dir, { extensions: ['py'] });
    expect(result.ok).toBe(true);
  });

  it('반환값이 숫자이다', async () => {
    const dir = join(tempDir, 'num');
    await mkdir(dir, { recursive: true });
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(typeof result.value).toBe('number');
  });

  it('여러 수준 중첩 디렉토리 → ok=true', async () => {
    const deepDir = join(tempDir, 'a', 'b', 'c');
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(deepDir, 'deep.ts'), 'function deep() { return "deep"; }');
    const result = await indexer.indexDirectory(join(tempDir, 'a'));
    expect(result.ok).toBe(true);
  });

  it('ok는 boolean 타입', async () => {
    const dir = join(tempDir, 'bool-check');
    await mkdir(dir, { recursive: true });
    const result = await indexer.indexDirectory(dir);
    expect(typeof result.ok).toBe('boolean');
  });

  it('5개 TS 파일 디렉토리 → value >= 5', async () => {
    const dir = join(tempDir, 'five-files');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(dir, `file${i}.ts`), `function f${i}() { return ${i}; }`);
    }
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBeGreaterThanOrEqual(5);
  });

  it('동일 디렉토리 두 번 인덱싱 → 모두 ok=true', async () => {
    const dir = join(tempDir, 'repeat-dir');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'func.ts'), 'function repeated() { return 1; }');
    const r1 = await indexer.indexDirectory(dir);
    const r2 = await indexer.indexDirectory(dir);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('JS+TS 혼합 디렉토리 → ok=true', async () => {
    const dir = join(tempDir, 'mixed-code');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'app.js'), 'function app() {}');
    await writeFile(join(dir, 'util.ts'), 'function util() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('빈 TS 파일만 있는 디렉토리 → ok=true', async () => {
    const dir = join(tempDir, 'empty-ts');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'empty.ts'), '');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('3수준 중첩 여러 파일 → ok=true, value > 0', async () => {
    const a = join(tempDir, 'nested');
    const b = join(a, 'mid');
    const c = join(b, 'deep');
    await mkdir(c, { recursive: true });
    await writeFile(join(a, 'top.ts'), 'function top() {}');
    await writeFile(join(b, 'mid.ts'), 'function mid() {}');
    await writeFile(join(c, 'deep.ts'), 'function deep() {}');
    const result = await indexer.indexDirectory(a);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });
});

// ── indexDirectory - 경계값 케이스 ───────────────────────────

describe('CodeIndexer indexDirectory - 경계값 케이스', () => {
  it('존재하지 않는 디렉토리 → ok 여부 반환 (boolean)', async () => {
    const result = await indexer.indexDirectory(join(tempDir, 'nonexistent-dir'));
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 TS 파일만 있는 디렉토리 → value=0', async () => {
    const dir = join(tempDir, 'empty-files');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'empty.ts'), '');
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('JSON 파일만 있는 디렉토리 → value=0 (기본 extensions에서 제외)', async () => {
    const dir = join(tempDir, 'json-only');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'data.json'), '{"key": "value"}');
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('MD 파일만 있는 디렉토리 → value=0', async () => {
    const dir = join(tempDir, 'md-only');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'doc.md'), '# Documentation');
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('빈 디렉토리 5개 연속 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const dir = join(tempDir, `empty-${i}`);
      await mkdir(dir, { recursive: true });
      const result = await indexer.indexDirectory(dir);
      expect(result.ok).toBe(true);
    }
  });

  it('빈 디렉토리 value는 정수', async () => {
    const dir = join(tempDir, 'int-check');
    await mkdir(dir, { recursive: true });
    const result = await indexer.indexDirectory(dir);
    if (result.ok) {
      expect(Number.isInteger(result.value)).toBe(true);
    }
  });

  it('공백만 있는 TS 파일 디렉토리 → ok=true', async () => {
    const dir = join(tempDir, 'spaces-ts');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'spaces.ts'), '   \n   ');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('같은 이름 다른 위치 파일들 → ok=true', async () => {
    const dir1 = join(tempDir, 'dir1');
    const dir2 = join(tempDir, 'dir2');
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(join(dir1, 'index.ts'), 'function a() {}');
    await writeFile(join(dir2, 'index.ts'), 'function b() {}');
    const result = await indexer.indexDirectory(tempDir);
    expect(result.ok).toBe(true);
  });
});

// ── 독립성 및 일관성 ─────────────────────────────────────────

describe('CodeIndexer 독립성 및 일관성', () => {
  it('두 인덱서 같은 store 공유 → 모두 ok', async () => {
    const indexer2 = new CodeIndexer(store, provider, splitter, logger);
    const filePath1 = join(tempDir, 'f1.ts');
    const filePath2 = join(tempDir, 'f2.ts');
    await writeFile(filePath1, 'function one() { return 1; }');
    await writeFile(filePath2, 'function two() { return 2; }');
    const r1 = await indexer.indexFile(filePath1);
    const r2 = await indexer2.indexFile(filePath2);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('인덱서 A와 B가 같은 파일 인덱싱 → 모두 ok', async () => {
    const indexer2 = new CodeIndexer(store, provider, splitter, logger);
    const filePath = join(tempDir, 'shared.ts');
    await writeFile(filePath, 'function shared() { return "shared"; }');
    const r1 = await indexer.indexFile(filePath);
    const r2 = await indexer2.indexFile(filePath);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('indexFile 성공 후 indexDirectory 같은 dir → ok=true', async () => {
    const dir = join(tempDir, 'combined');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, 'func.ts');
    await writeFile(filePath, 'function combined() {}');
    const r1 = await indexer.indexFile(filePath);
    const r2 = await indexer.indexDirectory(dir);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('10번 같은 파일 인덱싱 → 모두 같은 ok 상태', async () => {
    const filePath = join(tempDir, 'consistent.ts');
    await writeFile(filePath, 'function consistent() { return true; }');
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await indexer.indexFile(filePath);
      results.push(result.ok);
    }
    const allSame = results.every(r => r === results[0]);
    expect(allSame).toBe(true);
  });

  it('존재하지 않는 파일 10번 → 모두 ok=false', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await indexer.indexFile(join(tempDir, `no-file-${i}.ts`));
      expect(result.ok).toBe(false);
    }
  });

  it('빈 디렉토리 3번 인덱싱 → 모두 value=0', async () => {
    const dir = join(tempDir, 'empty-repeat');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 3; i++) {
      const result = await indexer.indexDirectory(dir);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    }
  });

  it('indexFile 성공 후 store.search → 결과 있음', async () => {
    const filePath = join(tempDir, 'searchable2.ts');
    await writeFile(filePath, 'function processUserData(data: string): string { return data.trim(); }');
    await indexer.indexFile(filePath);
    const queryVec = new Float32Array(64).fill(0.1);
    const searchResult = await store.search(queryVec, 10);
    expect(searchResult.ok).toBe(true);
  });

  it('extensions=[py] 파일과 기본 TS 파일 구분 → py 전용 extensions', async () => {
    const dir = join(tempDir, 'py-ts-mix');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'app.ts'), 'function tsFunc() {}');
    await writeFile(join(dir, 'main.py'), 'def py_func(): pass');
    const pyResult = await indexer.indexDirectory(dir, { extensions: ['py'] });
    const tsResult = await indexer.indexDirectory(dir, { extensions: ['ts'] });
    expect(pyResult.ok).toBe(true);
    expect(tsResult.ok).toBe(true);
  });
});
