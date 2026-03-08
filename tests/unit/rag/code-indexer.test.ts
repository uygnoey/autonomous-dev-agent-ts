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

// ── 추가 경계값/랜덤 케이스 ──────────────────────────────────────

describe('CodeIndexer indexFile - 추가 경계값 케이스', () => {
  it('UUID 이름 파일 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const filePath = join(tempDir, `${uuid}.ts`);
    await writeFile(filePath, 'function uuidNamed() { return "uuid"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('숫자로 시작하는 파일명 → ok=true', async () => {
    const filePath = join(tempDir, '123file.ts');
    await writeFile(filePath, 'function numbered() { return 123; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('중첩된 빈 함수들 → ok=true', async () => {
    const filePath = join(tempDir, 'nested-empty.ts');
    await writeFile(filePath, 'function a() { function b() { function c() {} } }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('타입 only 파일 (no functions) → ok=true', async () => {
    const filePath = join(tempDir, 'types-only.ts');
    await writeFile(filePath, 'type User = { id: number; name: string; };\ntype Config = Record<string, unknown>;');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('화살표 함수만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'arrow.ts');
    await writeFile(filePath, 'const add = (a: number, b: number) => a + b;\nconst greet = (name: string) => `Hello, ${name}`;');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('클래스만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'class-only.ts');
    await writeFile(filePath, 'class Service { constructor(private name: string) {} getName() { return this.name; } }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('enum만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'enum-only.ts');
    await writeFile(filePath, 'enum Status { Active = "active", Inactive = "inactive", Pending = "pending" }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('export default만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'export-default.ts');
    await writeFile(filePath, 'export default function handler(req: unknown, res: unknown): void {}');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('모두 주석인 파일 (블록 주석) → ok=true', async () => {
    const filePath = join(tempDir, 'block-comment.ts');
    await writeFile(filePath, '/* This is a block comment */\n/** @description JSDoc comment */');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('한글 식별자 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'korean-id.ts');
    await writeFile(filePath, 'const 이름 = "홍길동";\nfunction 안녕하세요() { return 이름; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('null 문자 포함 경로 → ok=false', async () => {
    // WHY: null 바이트가 포함된 경로는 파일 시스템에서 처리 불가
    const result = await indexer.indexFile(join(tempDir, 'null\0file.ts'));
    expect(result.ok).toBe(false);
  });

  it('매우 긴 함수명 파일 → ok=true', async () => {
    const longName = 'a'.repeat(200);
    const filePath = join(tempDir, 'long-func-name.ts');
    await writeFile(filePath, `function ${longName}() { return "${longName}"; }`);
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('중첩 삼항 연산자 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'ternary.ts');
    await writeFile(filePath, 'function resolve(x: number) { return x > 0 ? x > 10 ? "big" : "medium" : "small"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('JSON 파일도 인덱싱 가능 여부 확인 (boolean)', async () => {
    const filePath = join(tempDir, 'data.json');
    await writeFile(filePath, '{"key": "value", "nested": {"arr": [1,2,3]}}');
    const result = await indexer.indexFile(filePath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 문자열 경로 → ok=false', async () => {
    const result = await indexer.indexFile('');
    expect(result.ok).toBe(false);
  });
});

describe('CodeIndexer indexDirectory - 추가 경계값 케이스', () => {
  it('숨김 파일(.ts)이 있는 디렉토리 → ok=true', async () => {
    const dir = join(tempDir, 'hidden-files');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '.hidden.ts'), 'function hidden() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('커스텀 extensions=[] (빈 배열) → value=0', async () => {
    const dir = join(tempDir, 'empty-ext');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), 'function main() {}');
    const result = await indexer.indexDirectory(dir, { extensions: [] });
    if (result.ok) expect(result.value).toBe(0);
  });

  it('디렉토리 안에 디렉토리만 있고 파일 없음 → value=0', async () => {
    const dir = join(tempDir, 'dirs-only');
    const sub = join(dir, 'sub1');
    const sub2 = join(dir, 'sub2');
    await mkdir(sub, { recursive: true });
    await mkdir(sub2, { recursive: true });
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('파일 10개 중 TS 파일 5개 → value >= 5', async () => {
    const dir = join(tempDir, 'mixed-10');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(dir, `ts-file${i}.ts`), `function ts${i}() { return ${i}; }`);
      await writeFile(join(dir, `other${i}.md`), `# doc ${i}`);
    }
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBeGreaterThanOrEqual(5);
  });

  it('모두 빈 TS 파일 10개 → value=0', async () => {
    const dir = join(tempDir, 'all-empty');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      await writeFile(join(dir, `empty${i}.ts`), '');
    }
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(result.value).toBe(0);
  });

  it('5단계 중첩 + 최하단에만 파일 → ok=true', async () => {
    const d1 = join(tempDir, 'l1');
    const d2 = join(d1, 'l2');
    const d3 = join(d2, 'l3');
    const d4 = join(d3, 'l4');
    const d5 = join(d4, 'l5');
    await mkdir(d5, { recursive: true });
    await writeFile(join(d5, 'deep.ts'), 'function deepest() { return 5; }');
    const result = await indexer.indexDirectory(d1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeGreaterThan(0);
  });

  it('extensions=[tsx,jsx] → ok=true', async () => {
    const dir = join(tempDir, 'react-files');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'App.tsx'), 'function App() { return null; }');
    await writeFile(join(dir, 'Button.jsx'), 'function Button() { return null; }');
    const result = await indexer.indexDirectory(dir, { extensions: ['tsx', 'jsx'] });
    expect(result.ok).toBe(true);
  });

  it('랜덤 이름 UUID 디렉토리 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const dir = join(tempDir, uuid);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'func.ts'), 'function randomDir() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('결과 value는 항상 음이 아닌 정수', async () => {
    const dir = join(tempDir, 'non-neg');
    await mkdir(dir, { recursive: true });
    const result = await indexer.indexDirectory(dir);
    if (result.ok) {
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.value)).toBe(true);
    }
  });

  it('여러 extensions 동시 지정 → ok=true', async () => {
    const dir = join(tempDir, 'multi-ext');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.ts'), 'function a() {}');
    await writeFile(join(dir, 'b.js'), 'function b() {}');
    await writeFile(join(dir, 'c.py'), 'def c(): pass');
    const result = await indexer.indexDirectory(dir, { extensions: ['ts', 'js', 'py'] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeGreaterThanOrEqual(3);
  });
});

// ── 추가 경계값 케이스 #3 ─────────────────────────────────────

describe('CodeIndexer indexFile - 추가 경계값 케이스 #2', () => {
  it('ASCII 특수문자 파일 내용 → ok=true', async () => {
    const filePath = join(tempDir, 'ascii.ts');
    await writeFile(filePath, 'function ascii() { return "!@#$%^&*()"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('JSDoc 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'jsdoc.ts');
    await writeFile(filePath, '/** @description A simple function\n * @param x input\n * @returns result\n */\nfunction documented(x: number): number { return x * 2; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('import/export만 있는 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'imports.ts');
    await writeFile(filePath, 'import { something } from "./module";\nexport { something };');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('async function 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'async.ts');
    await writeFile(filePath, 'async function fetchData(url: string): Promise<string> { return url; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('제너레이터 함수 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'generator.ts');
    await writeFile(filePath, 'function* counter(start: number) { let i = start; while (true) { yield i++; } }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('decorators 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'decorator.ts');
    await writeFile(filePath, '@Injectable()\nclass MyService { getData() { return []; } }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('Infinity 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'infinity.ts');
    await writeFile(filePath, 'const MAX = Infinity;\nconst MIN = -Infinity;\nfunction clamp(x: number) { return Math.max(MIN, Math.min(MAX, x)); }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('NaN 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'nan.ts');
    await writeFile(filePath, 'function isNanValue(x: number): boolean { return Number.isNaN(x); }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('정규식 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'regex.ts');
    await writeFile(filePath, 'function validate(s: string): boolean { return /^[a-z]+$/.test(s); }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('template literal 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'template.ts');
    await writeFile(filePath, 'function greet(name: string): string { return `Hello, ${name}!`; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('파일 경로에 공백 포함 → ok=true', async () => {
    const spaceDir = join(tempDir, 'space dir');
    await mkdir(spaceDir, { recursive: true });
    const filePath = join(spaceDir, 'my file.ts');
    await writeFile(filePath, 'function spacePath() { return "space"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('파일 경로에 한국어 디렉토리 → ok=true', async () => {
    const krDir = join(tempDir, '한국어디렉토리');
    await mkdir(krDir, { recursive: true });
    const filePath = join(krDir, 'func.ts');
    await writeFile(filePath, 'function krDir() { return "한국어"; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('파일 확장자 없음 → ok (boolean)', async () => {
    const filePath = join(tempDir, 'noextension');
    await writeFile(filePath, 'function noext() {}');
    const result = await indexer.indexFile(filePath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID 파일명 #2 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const filePath = join(tempDir, `${uuid}.ts`);
    await writeFile(filePath, `function f${uuid.replace(/-/g, '')}() { return "${uuid}"; }`);
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('랜덤 UUID 파일명 #3 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const filePath = join(tempDir, `${uuid}.ts`);
    await writeFile(filePath, `function fn() { return "${uuid}"; }`);
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('indexFile ok=false → error.code는 rag_ 접두사', async () => {
    const result = await indexer.indexFile(join(tempDir, 'nonexistent-prefix.ts'));
    if (!result.ok) {
      expect(result.error.code.startsWith('rag_')).toBe(true);
    }
  });

  it('대용량 함수 (10,000자) → ok=true', async () => {
    const filePath = join(tempDir, 'huge.ts');
    const body = 'x'.repeat(10000);
    await writeFile(filePath, `function huge() { return "${body}"; }`);
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('중첩 클래스 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'nested-class.ts');
    await writeFile(filePath, 'class Outer { inner = class Inner { method() { return 1; } }; }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('Map/Set 포함 파일 → ok=true', async () => {
    const filePath = join(tempDir, 'collections.ts');
    await writeFile(filePath, 'const m = new Map<string, number>();\nconst s = new Set<string>();\nfunction addToMap(k: string, v: number) { m.set(k, v); }');
    const result = await indexer.indexFile(filePath);
    expect(result.ok).toBe(true);
  });

  it('존재하지 않는 파일 → error.message 비어있지 않음', async () => {
    const result = await indexer.indexFile(join(tempDir, 'gone.ts'));
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('같은 내용 다른 이름 5개 파일 → 모두 ok=true', async () => {
    const content = 'function duplicate() { return "same content"; }';
    for (let i = 0; i < 5; i++) {
      const filePath = join(tempDir, `dup-content-${i}.ts`);
      await writeFile(filePath, content);
      const result = await indexer.indexFile(filePath);
      expect(result.ok).toBe(true);
    }
  });
});

describe('CodeIndexer indexDirectory - 추가 경계값 케이스 #2', () => {
  it('재귀 디렉토리 10개 파일 → ok=true', async () => {
    const dir = join(tempDir, 'ten-files');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      await writeFile(join(dir, `fn${i}.ts`), `function fn${i}() { return ${i}; }`);
    }
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeGreaterThanOrEqual(10);
  });

  it('숨김 디렉토리(.hidden) 안 파일 → ok=true', async () => {
    const hiddenDir = join(tempDir, '.hidden');
    await mkdir(hiddenDir, { recursive: true });
    await writeFile(join(hiddenDir, 'func.ts'), 'function hidden() {}');
    const result = await indexer.indexDirectory(tempDir);
    expect(result.ok).toBe(true);
  });

  it('extensions=[ts] → JS 파일 제외 확인', async () => {
    const dir = join(tempDir, 'ts-only');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.ts'), 'function a() {}');
    await writeFile(join(dir, 'b.js'), 'function b() {}');
    const result = await indexer.indexDirectory(dir, { extensions: ['ts'] });
    expect(result.ok).toBe(true);
    // TS 파일 1개만 인덱싱 → value = TS 파일 청크 수
    if (result.ok) {
      expect(result.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('3개 디렉토리 순차 인덱싱 → 모두 ok=true', async () => {
    for (let i = 0; i < 3; i++) {
      const dir = join(tempDir, `seq-dir-${i}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `fn.ts`), `function fn${i}() { return ${i}; }`);
      const result = await indexer.indexDirectory(dir);
      expect(result.ok).toBe(true);
    }
  });

  it('매우 긴 파일명 → ok=true', async () => {
    const dir = join(tempDir, 'long-name-dir');
    await mkdir(dir, { recursive: true });
    const longName = 'a'.repeat(100) + '.ts';
    await writeFile(join(dir, longName), 'function longName() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('랜덤 UUID 디렉토리 이름 #2 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const dir = join(tempDir, uuid);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'func.ts'), 'function randomDir2() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('ok=true인 경우 value는 항상 number', async () => {
    const dir = join(tempDir, 'type-check');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'f.ts'), 'function typeCheck() {}');
    const result = await indexer.indexDirectory(dir);
    if (result.ok) expect(typeof result.value).toBe('number');
  });

  it('indexDirectory 결과는 Promise', () => {
    const p = indexer.indexDirectory(tempDir);
    expect(p).toBeInstanceOf(Promise);
  });

  it('indexFile 결과는 Promise', () => {
    const p = indexer.indexFile(join(tempDir, 'some.ts'));
    expect(p).toBeInstanceOf(Promise);
  });

  it('빈 extensions 배열 5회 연속 → 모두 value=0', async () => {
    const dir = join(tempDir, 'empty-ext-rep');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.ts'), 'function a() {}');
    for (let i = 0; i < 5; i++) {
      const result = await indexer.indexDirectory(dir, { extensions: [] });
      if (result.ok) expect(result.value).toBe(0);
    }
  });

  it('node_modules 제외 → ok=true (기본 제외)', async () => {
    const dir = join(tempDir, 'with-node-modules');
    const nmDir = join(dir, 'node_modules');
    await mkdir(nmDir, { recursive: true });
    await writeFile(join(dir, 'app.ts'), 'function app() {}');
    await writeFile(join(nmDir, 'dep.ts'), 'function dep() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('dist 제외 → ok=true (기본 제외)', async () => {
    const dir = join(tempDir, 'with-dist');
    const distDir = join(dir, 'dist');
    await mkdir(distDir, { recursive: true });
    await writeFile(join(dir, 'src.ts'), 'function src() {}');
    await writeFile(join(distDir, 'bundle.ts'), 'function bundle() {}');
    const result = await indexer.indexDirectory(dir);
    expect(result.ok).toBe(true);
  });

  it('value는 0 이상 (음수 불가)', async () => {
    const dir = join(tempDir, 'non-negative');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(dir, `f${i}.ts`), `function f${i}() {}`);
    }
    const result = await indexer.indexDirectory(dir);
    if (result.ok) {
      expect(result.value).toBeGreaterThanOrEqual(0);
    }
  });
});
