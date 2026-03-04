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
import { ConsoleLogger } from '../../src/core/logger.js';
import { Vectorizer } from '../../src/rag/vectorizer.js';
import { ChunkSplitter, detectLanguage, extractModule } from '../../src/rag/chunk-splitter.js';
import { createLocalEmbeddingProvider, normalizeVector } from '../../src/rag/embeddings.js';
import type { EmbeddingConfig } from '../../src/core/config.js';

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
    const provider = createLocalEmbeddingProvider(logger, 'test-provider', 128);

    expect(provider.name).toBe('test-provider');
    expect(provider.dimensions).toBe(128);
    expect(provider.tier).toBe('free');

    // WHY: 동일 텍스트에 대해 동일 벡터를 반환해야 한다 (결정론적)
    const result1 = await provider.embedQuery('hello world');
    const result2 = await provider.embedQuery('hello world');
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.value.length).toBe(128);
      expect(result2.value.length).toBe(128);

      for (let i = 0; i < 128; i++) {
        expect(result1.value[i]).toBe(result2.value[i]);
      }
    }
  });

  it('LocalEmbeddingProvider: 배치 임베딩', async () => {
    const provider = createLocalEmbeddingProvider(logger);
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
    const provider = createLocalEmbeddingProvider(logger, 'test', 64);

    const r1 = await provider.embedQuery('error handling code');
    const r2 = await provider.embedQuery('database connection pool');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      // WHY: 다른 텍스트는 반드시 다른 벡터를 반환해야 한다
      let allSame = true;
      for (let i = 0; i < 64; i++) {
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
});
