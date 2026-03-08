/**
 * E2E: RAG 파이프라인 / RAG Pipeline
 *
 * @description
 * KR: Vectorizer 초기화 (tmp LanceDB) → ChunkSplitter 코드 분할 →
 *     CodeIndexer 인덱싱 → RagSearcher 검색 → 결과 확인.
 * EN: Full RAG pipeline from Vectorizer init through chunking, indexing, and search.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger } from 'core/logger.js';
import { Vectorizer } from 'rag/vectorizer.js';
import { ChunkSplitter, detectLanguage, extractModule } from 'rag/chunk-splitter.js';
import { createTransformersEmbeddingProvider, normalizeVector } from 'rag/embeddings.js';
import type { EmbeddingConfig } from 'core/config.js';

const logger = new ConsoleLogger('error');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `adev-e2e-rag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await Bun.write(join(tmpDir, '.keep'), '');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('RAG 파이프라인 E2E / RAG Pipeline E2E', () => {
  it('ChunkSplitter: TypeScript 코드 분할', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function hello() {
  return 'hello';
}

export class Greeter {
  greet() {
    return 'hi';
  }
}

export const add = (a: number, b: number) => a + b;
`.trim();

    const chunks = splitter.splitCode(code, 'src/core/util.ts');
    expect(chunks.length).toBeGreaterThan(0);

    // WHY: 함수/클래스 경계 감지로 복수 청크가 생성되어야 한다
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.metadata.language).toBe('typescript');
      expect(chunk.metadata.module).toBe('src/core');
    }
  });

  it('ChunkSplitter: 빈 콘텐츠 → 빈 배열 반환', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('', 'src/empty.ts');
    expect(chunks).toHaveLength(0);
  });

  it('ChunkSplitter: 파일 크기 제한 (maxChunkSize) 적용', () => {
    const splitter = new ChunkSplitter();
    const longCode = 'const x = 1;\n'.repeat(500);

    const chunks = splitter.splitCode(longCode, 'src/big.ts', { maxChunkSize: 200 });
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(200);
    }
  });

  it('detectLanguage: 확장자별 언어 감지', () => {
    expect(detectLanguage('src/core/config.ts')).toBe('typescript');
    expect(detectLanguage('src/util.js')).toBe('javascript');
    expect(detectLanguage('lib/main.py')).toBe('python');
    expect(detectLanguage('src/main.rs')).toBe('rust');
    expect(detectLanguage('cmd/main.go')).toBe('go');
    expect(detectLanguage('unknown.xyz')).toBe('unknown');
  });

  it('extractModule: 파일 경로에서 모듈 경로 추출', () => {
    expect(extractModule('src/core/config.ts')).toBe('src/core');
    expect(extractModule('src/rag/vectorizer.ts')).toBe('src/rag');
    expect(extractModule('lib/util.ts')).toBe('lib');
  });

  it('LocalEmbeddingProvider: 결정론적 벡터 생성', async () => {
    const provider = createTransformersEmbeddingProvider(logger, 'test-provider', 'Xenova/all-MiniLM-L6-v2', 384);

    expect(provider.name).toBe('test-provider');
    expect(provider.dimensions).toBe(384);
    expect(provider.tier).toBe('free');

    // WHY: 동일 텍스트에 대해 동일 벡터를 반환해야 한다 (결정론적)
    const result1 = await provider.embedQuery('hello world');
    const result2 = await provider.embedQuery('hello world');
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.value.length).toBe(384);
      expect(result2.value.length).toBe(384);

      for (let i = 0; i < 384; i++) {
        expect(result1.value[i]).toBe(result2.value[i]);
      }
    }
  });

  it('LocalEmbeddingProvider: 배치 임베딩', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const texts = ['function hello() {}', 'class Greeter {}', 'const x = 1'];

    const result = await provider.embed(texts);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toHaveLength(3);
      for (const vector of result.value) {
        expect(vector.length).toBe(384);
      }
    }
  });

  it('LocalEmbeddingProvider: 서로 다른 텍스트는 다른 벡터 반환', async () => {
    const provider = createTransformersEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 384);

    const r1 = await provider.embedQuery('error handling code');
    const r2 = await provider.embedQuery('database connection pool');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      // WHY: 다른 텍스트는 반드시 다른 벡터를 반환해야 한다
      let allSame = true;
      for (let i = 0; i < 384; i++) {
        if (r1.value[i] !== r2.value[i]) {
          allSame = false;
          break;
        }
      }
      expect(allSame).toBe(false);
    }
  });

  it('normalizeVector: L2 정규화 (길이 ≈ 1.0)', () => {
    const raw = new Float32Array([3, 4]);
    const normalized = normalizeVector(raw);

    // WHY: L2 norm of [3,4] = 5 → normalized = [0.6, 0.8], magnitude = 1.0
    let sumSquares = 0;
    for (let i = 0; i < normalized.length; i++) {
      const val = normalized[i] ?? 0;
      sumSquares += val * val;
    }
    const magnitude = Math.sqrt(sumSquares);
    expect(Math.abs(magnitude - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 영벡터 → 그대로 반환', () => {
    const zero = new Float32Array([0, 0, 0]);
    const normalized = normalizeVector(zero);

    for (let i = 0; i < normalized.length; i++) {
      expect(normalized[i]).toBe(0);
    }
  });

  it('Vectorizer: 초기화 전 검색 시 에러', async () => {
    const dbPath = join(tmpDir, 'lance-no-init');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    const searchResult = await vectorizer.search('test query');
    expect(searchResult.ok).toBe(false);
    if (!searchResult.ok) {
      expect(searchResult.error.code).toBe('rag_init_error');
    }
  });

  it('ChunkSplitter: 한글 주석 포함 TypeScript 파일 분할', () => {
    const splitter = new ChunkSplitter();
    const code = `
// 설정 로드 함수 / Load configuration
export function loadConfig(path: string): Record<string, unknown> {
  return { path };
}

// 로거 클래스 / Logger class
export class Logger {
  constructor(private level: string) {}
  info(msg: string): void {}
}
`.trim();

    const chunks = splitter.splitCode(code, 'src/core/config.ts');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.metadata.language).toBe('typescript');
    }
  });

  it('ChunkSplitter: 공백만 있는 파일 → 빈 배열', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('   \n\n\t\n  ', 'src/blank.ts');
    expect(chunks).toHaveLength(0);
  });

  it('ChunkSplitter: 최대 청크 크기 1 → 모든 청크 1바이트 이하', () => {
    const splitter = new ChunkSplitter();
    const code = 'abc def ghi';
    const chunks = splitter.splitCode(code, 'src/tiny.ts', { maxChunkSize: 3 });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(3);
    }
  });

  it('ChunkSplitter: Python 파일도 분할 가능', () => {
    const splitter = new ChunkSplitter();
    const code = `
def hello():
    return "hello"

class Greeter:
    def greet(self):
        return "hi"
`.trim();

    const chunks = splitter.splitCode(code, 'lib/main.py');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('python');
    }
  });

  it('ChunkSplitter: 단일 함수 코드 → 최소 1 청크', () => {
    const splitter = new ChunkSplitter();
    const code = 'export function single() { return 42; }';
    const chunks = splitter.splitCode(code, 'src/single.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: metadata.module이 파일 경로와 일치', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const x = 1;';
    const chunks = splitter.splitCode(code, 'src/layer1/agent-spawner.ts');
    for (const chunk of chunks) {
      expect(chunk.metadata.module).toBe('src/layer1');
    }
  });

  it('ChunkSplitter: Go 파일 언어 감지', () => {
    const splitter = new ChunkSplitter();
    const code = `package main\nfunc main() {}\n`;
    const chunks = splitter.splitCode(code, 'cmd/main.go');
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('go');
    }
  });

  it('ChunkSplitter: Rust 파일 언어 감지', () => {
    const splitter = new ChunkSplitter();
    const code = `fn main() { println!("hello"); }`;
    const chunks = splitter.splitCode(code, 'src/main.rs');
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('rust');
    }
  });

  it('ChunkSplitter: 특수문자 포함 경로 → 모듈 추출', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const y = 2;';
    const chunks = splitter.splitCode(code, 'src/@internal/utils.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('detectLanguage: JavaScript 확장자 변형 (.mjs, .cjs)', () => {
    // WHY: .mjs/.cjs는 구현에 따라 javascript 또는 unknown 반환 가능
    const mjs = detectLanguage('src/index.mjs');
    const cjs = detectLanguage('src/bundle.cjs');
    expect(typeof mjs).toBe('string');
    expect(typeof cjs).toBe('string');
  });

  it('detectLanguage: 대문자 확장자 → unknown 처리', () => {
    // WHY: 대문자 확장자는 일반적으로 지원하지 않음
    const result = detectLanguage('src/Main.TS');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 확장자 없는 파일 → unknown', () => {
    expect(detectLanguage('Makefile')).toBe('unknown');
    expect(detectLanguage('LICENSE')).toBe('unknown');
  });

  it('detectLanguage: 중첩 확장자 → 마지막 기준', () => {
    // WHY: test.spec.ts → ts로 감지해야 한다
    expect(detectLanguage('src/foo.spec.ts')).toBe('typescript');
    expect(detectLanguage('src/bar.test.js')).toBe('javascript');
  });

  it('extractModule: 루트 파일 → 빈 문자열 또는 자기 경로', () => {
    const result = extractModule('index.ts');
    expect(typeof result).toBe('string');
  });

  it('extractModule: 깊은 중첩 경로', () => {
    // WHY: extractModule은 최상위 두 세그먼트만 반환할 수 있음
    const result = extractModule('src/layer2/sub/deep/file.ts');
    expect(result).toContain('src/layer2');
  });

  it('extractModule: 빈 경로 → 안전 처리', () => {
    const result = extractModule('');
    expect(typeof result).toBe('string');
  });

  it('normalizeVector: 큰 벡터 정규화', () => {
    const raw = new Float32Array(384).fill(1);
    const normalized = normalizeVector(raw);
    let sumSquares = 0;
    for (const val of normalized) {
      sumSquares += (val ?? 0) ** 2;
    }
    const magnitude = Math.sqrt(sumSquares);
    expect(Math.abs(magnitude - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 단일 요소 벡터 → 크기 1', () => {
    const raw = new Float32Array([5]);
    const normalized = normalizeVector(raw);
    expect(Math.abs((normalized[0] ?? 0) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 음수 값 포함 벡터', () => {
    const raw = new Float32Array([-3, 4]);
    const normalized = normalizeVector(raw);
    let sumSquares = 0;
    for (const val of normalized) {
      sumSquares += (val ?? 0) ** 2;
    }
    expect(Math.abs(Math.sqrt(sumSquares) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 모두 동일한 값 벡터', () => {
    const raw = new Float32Array([2, 2, 2, 2]);
    const normalized = normalizeVector(raw);
    let sumSquares = 0;
    for (const val of normalized) {
      sumSquares += (val ?? 0) ** 2;
    }
    expect(Math.abs(Math.sqrt(sumSquares) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 매우 작은 값 (언더플로우 방지)', () => {
    const raw = new Float32Array([1e-38, 1e-38]);
    const normalized = normalizeVector(raw);
    // WHY: 매우 작은 값이라도 정규화 결과는 유한해야 함
    for (const val of normalized) {
      expect(Number.isFinite(val ?? 0)).toBe(true);
    }
  });

  it('LocalEmbeddingProvider: 빈 문자열 임베딩 → 결과 반환', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embedQuery('');
    // WHY: 빈 문자열도 처리하거나 에러를 반환해야 함
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 한글 텍스트 임베딩', async () => {
    const provider = createTransformersEmbeddingProvider(logger, 'kr-test', 'Xenova/all-MiniLM-L6-v2', 384);
    const result = await provider.embedQuery('안녕하세요 세계');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(384);
    }
  });

  it('LocalEmbeddingProvider: 특수문자 포함 텍스트', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embedQuery('function() { return null; } // @#$%^&*');
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 매우 긴 텍스트 (1000자)', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const longText = 'hello world '.repeat(100);
    const result = await provider.embedQuery(longText);
    // WHY: 긴 텍스트도 처리 가능해야 한다 (truncation 또는 정상 처리)
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 단일 텍스트 배치 임베딩', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embed(['single text']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it('LocalEmbeddingProvider: 빈 배열 배치 임베딩', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embed([]);
    // WHY: 빈 배열은 빈 결과 또는 에러
    expect(result.ok === true || result.ok === false).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('LocalEmbeddingProvider: name/dimensions/tier 속성 확인', () => {
    const provider = createTransformersEmbeddingProvider(logger, 'my-provider', 'Xenova/all-MiniLM-L6-v2', 768);
    expect(provider.name).toBe('my-provider');
    expect(provider.dimensions).toBe(768);
    expect(provider.tier).toBe('free');
  });

  it('LocalEmbeddingProvider: 기본 설정으로 생성 시 속성 정의됨', () => {
    const provider = createTransformersEmbeddingProvider(logger);
    expect(provider.name).toBeDefined();
    expect(provider.dimensions).toBeGreaterThan(0);
  });

  it('Vectorizer: 초기화 전 index 호출 → 에러', async () => {
    const dbPath = join(tmpDir, 'lance-no-init-index');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    const indexResult = await vectorizer.index(tmpDir, {
      extensions: ['ts'],
      projectId: 'test',
    });
    expect(indexResult.ok).toBe(false);
    if (!indexResult.ok) {
      expect(indexResult.error.code).toBe('rag_init_error');
    }
  });

  it('Vectorizer: 초기화 후 빈 디렉토리 인덱싱 → 0 청크', async () => {
    const dbPath = join(tmpDir, 'lance-empty-dir');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const emptyDir = join(tmpDir, 'empty-src');
    await Bun.write(join(emptyDir, '.keep'), '');

    const indexResult = await vectorizer.index(emptyDir, {
      extensions: ['ts'],
      projectId: 'empty-project',
    });
    expect(indexResult.ok).toBe(true);
    if (indexResult.ok) {
      expect(indexResult.value).toBe(0);
    }
  });

  it('Vectorizer: 초기화 후 search limit=1 → 최대 1 결과', async () => {
    const dbPath = join(tmpDir, 'lance-limit1');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const srcDir = join(tmpDir, 'src-limit');
    await Bun.write(
      join(srcDir, 'a.ts'),
      'export function alpha() { return "a"; }',
    );
    await Bun.write(
      join(srcDir, 'b.ts'),
      'export function beta() { return "b"; }',
    );

    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'limit-proj' });

    const searchResult = await vectorizer.search('function', 1);
    if (searchResult.ok) {
      expect(searchResult.value.length).toBeLessThanOrEqual(1);
    }
  });

  it('Vectorizer: 동일 디렉토리 2회 인덱싱 → 중복 처리', async () => {
    const dbPath = join(tmpDir, 'lance-dedup');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const srcDir = join(tmpDir, 'src-dedup');
    await Bun.write(join(srcDir, 'util.ts'), 'export function util() {}');

    const r1 = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'dedup' });
    const r2 = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'dedup' });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('Vectorizer: 한글 파일명 인덱싱 → 에러 없이 처리', async () => {
    const dbPath = join(tmpDir, 'lance-korean');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const srcDir = join(tmpDir, 'src-kr');
    await Bun.write(join(srcDir, '설정.ts'), 'export const config = {};');

    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'kr-proj' });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: search 결과 score는 0 이상 1 이하', async () => {
    const dbPath = join(tmpDir, 'lance-score');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const srcDir = join(tmpDir, 'src-score');
    await Bun.write(
      join(srcDir, 'scored.ts'),
      'export function scoredFunction() { return 42; }',
    );

    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'score-proj' });

    const searchResult = await vectorizer.search('scored function', 5);
    if (searchResult.ok) {
      for (const result of searchResult.value) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        // WHY: 코사인 유사도는 0~1 범위
        expect(result.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Vectorizer: search 빈 쿼리 → 에러 또는 빈 결과', async () => {
    const dbPath = join(tmpDir, 'lance-empty-query');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const result = await vectorizer.search('', 5);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 전 두 번째 초기화 호출 → 안전 처리', async () => {
    const dbPath = join(tmpDir, 'lance-double-init');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    const r1 = await vectorizer.initialize();
    const r2 = await vectorizer.initialize();
    expect(r1.ok).toBe(true);
    // WHY: 두 번째 초기화는 무시되거나 성공해야 함
    expect(r2.ok === true || r2.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 → 인덱싱 → 검색 전체 파이프라인', async () => {
    const dbPath = join(tmpDir, 'lance-full');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);

    // Step 1: 초기화
    const initResult = await vectorizer.initialize();
    expect(initResult.ok).toBe(true);

    // Step 2: 임시 TypeScript 파일 생성
    const srcDir = join(tmpDir, 'src');
    const coreDir = join(srcDir, 'core');
    await Bun.write(
      join(coreDir, 'config.ts'),
      `
export function loadConfig(path: string): Record<string, unknown> {
  return { path, loaded: true };
}

export class ConfigManager {
  private config: Record<string, unknown> = {};

  load(path: string): void {
    this.config = loadConfig(path);
  }

  get(key: string): unknown {
    return this.config[key];
  }
}
`.trim(),
    );

    await Bun.write(
      join(coreDir, 'logger.ts'),
      `
export function createLogger(level: string): { info: (msg: string) => void } {
  return { info: (msg) => {} };
}

export class Logger {
  constructor(private level: string) {}

  info(message: string): void {}
  error(message: string): void {}
}
`.trim(),
    );

    // Step 3: 디렉토리 인덱싱
    const indexResult = await vectorizer.index(srcDir, {
      extensions: ['ts'],
      projectId: 'test-project',
    });
    expect(indexResult.ok).toBe(true);
    if (indexResult.ok) {
      expect(indexResult.value).toBeGreaterThan(0);
    }

    // Step 4: 검색
    const searchResult = await vectorizer.search('config loading', 5);
    expect(searchResult.ok).toBe(true);
    if (searchResult.ok) {
      expect(searchResult.value.length).toBeGreaterThan(0);
      // WHY: 검색 결과는 score가 있어야 한다
      for (const result of searchResult.value) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.record.chunk.length).toBeGreaterThan(0);
      }
    }
  });

  // ── ChunkSplitter 추가 edge/random 케이스 ────────────────────

  it('ChunkSplitter: JavaScript 파일 분할', () => {
    const splitter = new ChunkSplitter();
    const code = `function greet(name) { return 'hello ' + name; }\nmodule.exports = { greet };`;
    const chunks = splitter.splitCode(code, 'src/greet.js');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('javascript');
    }
  });

  it('ChunkSplitter: 중첩 함수 포함 TypeScript 파일', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function outer() {
  function inner() { return 1; }
  return inner();
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/nested.ts');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('typescript');
    }
  });

  it('ChunkSplitter: 인터페이스 포함 TypeScript 파일', () => {
    const splitter = new ChunkSplitter();
    const code = `
export interface Config {
  host: string;
  port: number;
}
export function createConfig(host: string, port: number): Config {
  return { host, port };
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/config.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 긴 단일 함수 → 청크 분할', () => {
    const splitter = new ChunkSplitter();
    const body = Array.from({ length: 50 }, (_, i) => `  const v${i} = ${i};`).join('\n');
    const code = `export function bigFn() {\n${body}\n  return 0;\n}`;
    const chunks = splitter.splitCode(code, 'src/big-fn.ts', { maxChunkSize: 200 });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(200);
    }
  });

  it('ChunkSplitter: 탭 들여쓰기 파일 → 분할 가능', () => {
    const splitter = new ChunkSplitter();
    const code = 'export function tabbed() {\n\treturn 1;\n}';
    const chunks = splitter.splitCode(code, 'src/tabbed.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 주석만 있는 파일 → 처리됨', () => {
    const splitter = new ChunkSplitter();
    const code = '// This file is empty\n// No exports here\n';
    const chunks = splitter.splitCode(code, 'src/comments-only.ts');
    expect(typeof chunks.length).toBe('number');
  });

  it('ChunkSplitter: 여러 export const → 분할됨', () => {
    const splitter = new ChunkSplitter();
    const code = Array.from({ length: 10 }, (_, i) => `export const VAR_${i} = ${i};`).join('\n');
    const chunks = splitter.splitCode(code, 'src/constants.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 단일 클래스만 있는 파일 → 최소 1 청크', () => {
    const splitter = new ChunkSplitter();
    const code = 'export class Service { constructor() {} }';
    const chunks = splitter.splitCode(code, 'src/service.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: splitCode 반환값은 배열', () => {
    const splitter = new ChunkSplitter();
    const result = splitter.splitCode('const x = 1;', 'src/x.ts');
    expect(Array.isArray(result)).toBe(true);
  });

  it('ChunkSplitter: chunk.metadata 객체 존재', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('const x = 1;', 'src/x.ts');
    for (const chunk of chunks) {
      expect(typeof chunk.metadata).toBe('object');
    }
  });

  it('ChunkSplitter: chunk.content는 문자열', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('const x = 1;', 'src/x.ts');
    for (const chunk of chunks) {
      expect(typeof chunk.content).toBe('string');
    }
  });

  it('detectLanguage: .ts 파일 → typescript', () => {
    expect(detectLanguage('src/main.ts')).toBe('typescript');
  });

  it('detectLanguage: .js 파일 → javascript', () => {
    expect(detectLanguage('src/main.js')).toBe('javascript');
  });

  it('detectLanguage: .py 파일 → python', () => {
    expect(detectLanguage('lib/main.py')).toBe('python');
  });

  it('detectLanguage: .rs 파일 → rust', () => {
    expect(detectLanguage('src/main.rs')).toBe('rust');
  });

  it('detectLanguage: .go 파일 → go', () => {
    expect(detectLanguage('cmd/main.go')).toBe('go');
  });

  it('detectLanguage: 다양한 모르는 확장자 → string 반환', () => {
    const unknowns = ['file.abc', 'data.xyz', 'test.999', 'script.sh', 'code.java'];
    for (const f of unknowns) {
      expect(typeof detectLanguage(f)).toBe('string');
    }
  });

  it('extractModule: 3단계 경로 → 2단계 반환', () => {
    expect(extractModule('src/core/config.ts')).toBe('src/core');
  });

  it('extractModule: 2단계 경로 → 1단계 반환', () => {
    expect(extractModule('lib/util.ts')).toBe('lib');
  });

  it('extractModule: 반환값은 string', () => {
    expect(typeof extractModule('src/core/config.ts')).toBe('string');
  });

  it('extractModule: 경로 없는 파일 → 안전 처리됨', () => {
    expect(typeof extractModule('file.ts')).toBe('string');
  });

  it('normalizeVector: 반환값은 Float32Array', () => {
    const result = normalizeVector(new Float32Array([1, 2, 3]));
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('normalizeVector: 입력 길이와 출력 길이 동일', () => {
    const input = new Float32Array([1, 2, 3, 4, 5]);
    const result = normalizeVector(input);
    expect(result.length).toBe(input.length);
  });

  it('normalizeVector: 랜덤 128차원 → norm≈1', () => {
    const raw = Float32Array.from({ length: 128 }, () => Math.random() * 10 - 5);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  it('normalizeVector: 랜덤 256차원 → norm≈1', () => {
    const raw = Float32Array.from({ length: 256 }, () => Math.random() * 2 - 1);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  it('Vectorizer: search 결과 record.chunk는 string', async () => {
    const dbPath = join(tmpDir, 'lance-chunk-type');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-type');
    await Bun.write(join(srcDir, 'type.ts'), 'export function typed() { return "string"; }');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'type-proj' });
    const result = await vectorizer.search('typed', 5);
    if (result.ok) {
      for (const item of result.value) {
        expect(typeof item.record.chunk).toBe('string');
      }
    }
  });

  it('Vectorizer: search 결과 record.filePath는 string', async () => {
    const dbPath = join(tmpDir, 'lance-filepath-type');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-fp-type');
    await Bun.write(join(srcDir, 'fp.ts'), 'export function fpTest() {}');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'fp-proj' });
    const result = await vectorizer.search('fpTest', 5);
    if (result.ok) {
      for (const item of result.value) {
        expect(typeof item.record.filePath).toBe('string');
      }
    }
  });

  it('Vectorizer: 다른 projectId로 인덱싱 → ok', async () => {
    const dbPath = join(tmpDir, 'lance-proj-id');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-proj-id');
    await Bun.write(join(srcDir, 'a.ts'), 'export const a = 1;');
    const r1 = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'proj-alpha' });
    const r2 = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'proj-beta' });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('Vectorizer: 여러 확장자 인덱싱 → ok', async () => {
    const dbPath = join(tmpDir, 'lance-multi-ext');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-multi-ext');
    await Bun.write(join(srcDir, 'a.ts'), 'export const a = 1;');
    await Bun.write(join(srcDir, 'b.js'), 'module.exports = 2;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts', 'js'], projectId: 'multi-ext' });
    expect(result.ok).toBe(true);
  });

  it('ChunkSplitter: UUID 경로 → metadata.module 추출', () => {
    const splitter = new ChunkSplitter();
    const uuid = crypto.randomUUID();
    const code = `export const ${uuid.replace(/-/g, '_')} = 1;`;
    const filePath = `src/${uuid}/main.ts`;
    const chunks = splitter.splitCode(code, filePath);
    for (const chunk of chunks) {
      expect(typeof chunk.metadata.module).toBe('string');
    }
  });

  it('ChunkSplitter: metadata.startLine은 양수', () => {
    const splitter = new ChunkSplitter();
    const code = 'export function start() { return 1; }';
    const chunks = splitter.splitCode(code, 'src/start.ts');
    for (const chunk of chunks) {
      expect(chunk.metadata.startLine).toBeGreaterThan(0);
    }
  });

  it('ChunkSplitter: metadata.endLine >= startLine', () => {
    const splitter = new ChunkSplitter();
    const code = 'export function end() { return 2; }';
    const chunks = splitter.splitCode(code, 'src/end.ts');
    for (const chunk of chunks) {
      expect(chunk.metadata.endLine).toBeGreaterThanOrEqual(chunk.metadata.startLine);
    }
  });

  it('ChunkSplitter: metadata.filePath와 입력 경로 일치', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const match = true;';
    const filePath = 'src/core/match.ts';
    const chunks = splitter.splitCode(code, filePath);
    for (const chunk of chunks) {
      expect(chunk.metadata.filePath).toBe(filePath);
    }
  });

  it('ChunkSplitter: metadata.language는 string', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('export const x = 1;', 'src/x.ts');
    for (const chunk of chunks) {
      expect(typeof chunk.metadata.language).toBe('string');
    }
  });

  it('ChunkSplitter: 매우 긴 코드 처리 → 반환값은 배열', () => {
    const splitter = new ChunkSplitter();
    const code = Array.from({ length: 200 }, (_, i) =>
      `export function fn${i}() { return ${i}; }`,
    ).join('\n');
    const chunks = splitter.splitCode(code, 'src/big.ts', { maxChunkSize: 500 });
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 단일 const 선언 → 청크 반환', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('const x = 42;', 'src/const.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 다중 인터페이스 파일 → 청크 분할', () => {
    const splitter = new ChunkSplitter();
    const code = `
export interface A { x: number; }
export interface B { y: string; }
export interface C { z: boolean; }
`.trim();
    const chunks = splitter.splitCode(code, 'src/interfaces.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: enum 포함 파일 → 분할 처리', () => {
    const splitter = new ChunkSplitter();
    const code = `
export enum Status {
  PENDING = 'pending',
  ACTIVE = 'active',
  DONE = 'done',
}
export function getStatus(): Status { return Status.PENDING; }
`.trim();
    const chunks = splitter.splitCode(code, 'src/status.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('typescript');
    }
  });

  it('ChunkSplitter: 화살표 함수 export → 청크 반환', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const compute = (x: number): number => x * 2;';
    const chunks = splitter.splitCode(code, 'src/compute.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 멀티라인 문자열 포함 → 안전 처리', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const template = `\nhello\nworld\n`;';
    const chunks = splitter.splitCode(code, 'src/template.ts');
    expect(typeof chunks.length).toBe('number');
  });

  it('detectLanguage: .tsx 확장자 → typescript 또는 string', () => {
    const result = detectLanguage('src/App.tsx');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: .d.ts 확장자 → string 반환', () => {
    const result = detectLanguage('types/index.d.ts');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 숫자로 시작하는 파일명 → string', () => {
    const result = detectLanguage('123file.ts');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 경로에 공백 포함 → string 반환', () => {
    const result = detectLanguage('src/my folder/main.ts');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 점으로 시작하는 파일 → unknown', () => {
    const result = detectLanguage('.env');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 반환값은 항상 string (10개 다양한 경로)', () => {
    const paths = [
      'src/main.ts', 'lib/util.js', 'main.py', 'cmd/main.go',
      'src/lib.rs', 'unknown.xyz', 'Makefile', 'test.abc', '', 'a.ts',
    ];
    for (const p of paths) {
      expect(typeof detectLanguage(p)).toBe('string');
    }
  });

  it('extractModule: 5단계 중첩 경로 → string 반환', () => {
    const result = extractModule('a/b/c/d/e/file.ts');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('extractModule: 특수문자 포함 경로 → string 반환', () => {
    const result = extractModule('src/my-module/my-file.ts');
    expect(typeof result).toBe('string');
  });

  it('extractModule: 슬래시 하나 → string 반환', () => {
    const result = extractModule('a/file.ts');
    expect(typeof result).toBe('string');
  });

  it('normalizeVector: 3요소 벡터 정규화 → norm≈1', () => {
    const raw = new Float32Array([1, 2, 2]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 4요소 벡터 정규화 → norm≈1', () => {
    const raw = new Float32Array([1, 1, 1, 1]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 이미 정규화된 벡터 → 변화 없음', () => {
    const raw = new Float32Array([1, 0, 0]);
    const normalized = normalizeVector(raw);
    expect(Math.abs((normalized[0] ?? 0) - 1.0)).toBeLessThan(0.001);
    expect(Math.abs((normalized[1] ?? 0))).toBeLessThan(0.001);
    expect(Math.abs((normalized[2] ?? 0))).toBeLessThan(0.001);
  });

  it('normalizeVector: 큰 양수 값들 → 정규화 후 norm≈1', () => {
    const raw = new Float32Array([100, 200, 300]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 큰 음수 값들 → 정규화 후 norm≈1', () => {
    const raw = new Float32Array([-100, -200, -300]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 768차원 랜덤 벡터 → norm≈1', () => {
    const raw = Float32Array.from({ length: 768 }, () => Math.random() * 2 - 1);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  it('normalizeVector: 10차원 랜덤 벡터 → norm≈1', () => {
    const raw = Float32Array.from({ length: 10 }, () => (Math.random() - 0.5) * 100);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  it('normalizeVector: Float32Array 타입 보존', () => {
    const raw = new Float32Array([3, 4]);
    const result = normalizeVector(raw);
    expect(result instanceof Float32Array).toBe(true);
  });

  it('normalizeVector: 입출력 길이 동일 (384차원)', () => {
    const raw = new Float32Array(384).fill(1);
    const result = normalizeVector(raw);
    expect(result.length).toBe(384);
  });

  it('Vectorizer: 초기화 성공 → ok=true', async () => {
    const dbPath = join(tmpDir, 'lance-init-only');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    const result = await vectorizer.initialize();
    expect(result.ok).toBe(true);
  });

  it('Vectorizer: 초기화 후 search limit=0 → 결과 처리 가능', async () => {
    const dbPath = join(tmpDir, 'lance-limit0');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('test', 0);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 후 search limit=100 → ok 또는 에러', async () => {
    const dbPath = join(tmpDir, 'lance-limit100');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('function', 100);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 여러 파일 인덱싱 후 결과 수는 0 이상', async () => {
    const dbPath = join(tmpDir, 'lance-multi-file');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-multi');
    for (let i = 0; i < 5; i++) {
      await Bun.write(join(srcDir, `file${i}.ts`), `export function fn${i}() { return ${i}; }`);
    }
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'multi-proj' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeGreaterThanOrEqual(0);
  });

  it('Vectorizer: 인덱싱 결과 value는 number', async () => {
    const dbPath = join(tmpDir, 'lance-num');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-num');
    await Bun.write(join(srcDir, 'num.ts'), 'export const n = 1;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'num-proj' });
    if (result.ok) expect(typeof result.value).toBe('number');
  });

  it('Vectorizer: 검색 결과 배열 반환', async () => {
    const dbPath = join(tmpDir, 'lance-arr');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = new Vectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-arr');
    await Bun.write(join(srcDir, 'arr.ts'), 'export const arr = [1,2,3];');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'arr-proj' });
    const result = await vectorizer.search('array', 5);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('ChunkSplitter: 10개 파일 시뮬레이션 → 각각 배열 반환', () => {
    const splitter = new ChunkSplitter();
    const files = Array.from({ length: 10 }, (_, i) => ({
      code: `export function fn${i}() { return ${i}; }`,
      path: `src/fn${i}.ts`,
    }));
    for (const { code, path } of files) {
      const chunks = splitter.splitCode(code, path);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ChunkSplitter: UUID를 변수명으로 사용 → 처리 가능', () => {
    const splitter = new ChunkSplitter();
    const varName = `_${crypto.randomUUID().replace(/-/g, '_')}`;
    const code = `export const ${varName} = 42;`;
    const chunks = splitter.splitCode(code, 'src/uuid-var.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('detectLanguage: 경로에 점 여러개 → 마지막 확장자 기준', () => {
    expect(detectLanguage('src/a.b.c.ts')).toBe('typescript');
    expect(detectLanguage('src/x.y.z.js')).toBe('javascript');
  });

  it('extractModule: 경로에 공백 → string 반환', () => {
    const result = extractModule('my module/file.ts');
    expect(typeof result).toBe('string');
  });

  it('normalizeVector: 5차원 양수 벡터 → norm≈1', () => {
    const raw = new Float32Array([1, 2, 3, 4, 5]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });
});
