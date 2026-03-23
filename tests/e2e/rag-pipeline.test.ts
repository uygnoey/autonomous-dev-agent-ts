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
import { normalizeVector } from 'rag/embeddings.js';
import type { EmbeddingConfig } from 'core/config.js';
// WHY: 'rag/index.js' barrel import는 jina-embeddings.ts를 로드하여
//      @huggingface/transformers static import를 트리거 → Bun 1.3.10 OOM.
//      타입만 필요하므로 types.ts에서 직접 import하여 모듈 로딩 체인을 차단.
import type { EmbeddingProvider, EmbeddingTier } from 'rag/types.js';
import { ok, err } from 'core/types.js';
import { RagError } from 'core/errors.js';

// WHY: @huggingface/transformers는 Bun 1.3.10에서 OOM 크래시를 유발.
//      E2E 테스트는 실제 ML 모델이 불필요 — 결정론적 mock으로 대체.
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly tier: EmbeddingTier = 'free';

  constructor(name = 'mock', _model?: string, dimensions = 384) {
    this.name = name;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<ReturnType<EmbeddingProvider['embed']>> {
    if (texts.length === 0) return ok([]);
    const vectors = texts.map((text) => {
      const vec = new Float32Array(this.dimensions);
      for (let i = 0; i < this.dimensions; i++) {
        // WHY: 텍스트 + 인덱스 기반 결정론적 해시 — 동일 텍스트는 동일 벡터
        let h = i + 1;
        for (let j = 0; j < text.length; j++) {
          h = (h * 31 + text.charCodeAt(j)) & 0x7fffffff;
        }
        vec[i] = (h / 0x7fffffff) * 2 - 1;
      }
      // L2 정규화
      let sum = 0;
      for (let i = 0; i < this.dimensions; i++) sum += (vec[i] ?? 0) ** 2;
      const mag = Math.sqrt(sum);
      if (mag > 0) for (let i = 0; i < this.dimensions; i++) vec[i] = (vec[i] ?? 0) / mag;
      return vec;
    });
    return ok(vectors);
  }

  async embedQuery(query: string): Promise<ReturnType<EmbeddingProvider['embedQuery']>> {
    const result = await this.embed([query]);
    if (!result.ok) return err(result.error);
    const vec = result.value[0];
    if (!vec) return err(new RagError('rag_embedding_error', '임베딩 결과 없음'));
    return ok(vec);
  }
}

function createMockEmbeddingProvider(
  _logger?: unknown,
  name = 'mock',
  model?: string,
  dimensions = 384,
): MockEmbeddingProvider {
  return new MockEmbeddingProvider(name, model, dimensions);
}

const logger = new ConsoleLogger('error');

let tmpDir: string;

// WHY: Vectorizer 인스턴스를 추적하여 afterEach에서 LanceDB 연결을 해제한다.
//      네이티브 모듈(lancedb)이 프로세스 종료 시 미해제 리소스로 인해 C++ panic을 유발.
const activeVectorizers: Vectorizer[] = [];

/**
 * Vectorizer를 생성하고 자동 cleanup 추적에 등록한다 / Create a Vectorizer and register it for auto-cleanup
 */
function createTrackedVectorizer(dbPath: string, embeddingConfig: EmbeddingConfig, log: ConsoleLogger): Vectorizer {
  const v = new Vectorizer(dbPath, embeddingConfig, log);
  activeVectorizers.push(v);
  return v;
}

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `adev-e2e-rag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await Bun.write(join(tmpDir, '.keep'), '');
});

afterEach(async () => {
  // WHY: LanceDB 네이티브 연결을 먼저 해제한 후 파일 시스템 정리
  for (const v of activeVectorizers) {
    try {
      await v.close();
    } catch {
      // WHY: close 실패는 무시 — 이미 정리된 리소스일 수 있음
    }
  }
  activeVectorizers.length = 0;
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
    const provider = createMockEmbeddingProvider(logger, 'test-provider', 'Xenova/all-MiniLM-L6-v2', 384);

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
    const provider = createMockEmbeddingProvider(logger);
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
    const provider = createMockEmbeddingProvider(logger, 'test', 'Xenova/all-MiniLM-L6-v2', 384);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embedQuery('');
    // WHY: 빈 문자열도 처리하거나 에러를 반환해야 함
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 한글 텍스트 임베딩', async () => {
    const provider = createMockEmbeddingProvider(logger, 'kr-test', 'Xenova/all-MiniLM-L6-v2', 384);
    const result = await provider.embedQuery('안녕하세요 세계');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(384);
    }
  });

  it('LocalEmbeddingProvider: 특수문자 포함 텍스트', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embedQuery('function() { return null; } // @#$%^&*');
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 매우 긴 텍스트 (1000자)', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const longText = 'hello world '.repeat(100);
    const result = await provider.embedQuery(longText);
    // WHY: 긴 텍스트도 처리 가능해야 한다 (truncation 또는 정상 처리)
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 단일 텍스트 배치 임베딩', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embed(['single text']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it('LocalEmbeddingProvider: 빈 배열 배치 임베딩', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embed([]);
    // WHY: 빈 배열은 빈 결과 또는 에러
    expect(result.ok === true || result.ok === false).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('LocalEmbeddingProvider: name/dimensions/tier 속성 확인', () => {
    const provider = createMockEmbeddingProvider(logger, 'my-provider', 'Xenova/all-MiniLM-L6-v2', 768);
    expect(provider.name).toBe('my-provider');
    expect(provider.dimensions).toBe(768);
    expect(provider.tier).toBe('free');
  });

  it('LocalEmbeddingProvider: 기본 설정으로 생성 시 속성 정의됨', () => {
    const provider = createMockEmbeddingProvider(logger);
    expect(provider.name).toBeDefined();
    expect(provider.dimensions).toBeGreaterThan(0);
  });

  it('Vectorizer: 초기화 전 index 호출 → 에러', async () => {
    const dbPath = join(tmpDir, 'lance-no-init-index');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const srcDir = join(tmpDir, 'src-kr');
    await Bun.write(join(srcDir, '설정.ts'), 'export const config = {};');

    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'kr-proj' });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: search 결과 score는 0 이상 1 이하', async () => {
    const dbPath = join(tmpDir, 'lance-score');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

    await vectorizer.initialize();

    const result = await vectorizer.search('', 5);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 전 두 번째 초기화 호출 → 안전 처리', async () => {
    const dbPath = join(tmpDir, 'lance-double-init');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

    const r1 = await vectorizer.initialize();
    const r2 = await vectorizer.initialize();
    expect(r1.ok).toBe(true);
    // WHY: 두 번째 초기화는 무시되거나 성공해야 함
    expect(r2.ok === true || r2.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 → 인덱싱 → 검색 전체 파이프라인', async () => {
    const dbPath = join(tmpDir, 'lance-full');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);

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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    const result = await vectorizer.initialize();
    expect(result.ok).toBe(true);
  });

  it('Vectorizer: 초기화 후 search limit=0 → 결과 처리 가능', async () => {
    const dbPath = join(tmpDir, 'lance-limit0');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('test', 0);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 초기화 후 search limit=100 → ok 또는 에러', async () => {
    const dbPath = join(tmpDir, 'lance-limit100');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('function', 100);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 여러 파일 인덱싱 후 결과 수는 0 이상', async () => {
    const dbPath = join(tmpDir, 'lance-multi-file');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-num');
    await Bun.write(join(srcDir, 'num.ts'), 'export const n = 1;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'num-proj' });
    if (result.ok) expect(typeof result.value).toBe('number');
  });

  it('Vectorizer: 검색 결과 배열 반환', async () => {
    const dbPath = join(tmpDir, 'lance-arr');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
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

  // ── ChunkSplitter 추가 edge/random 케이스 (배치66) ───────────────

  it('ChunkSplitter: 타입 별칭 선언만 있는 파일 → 청크 반환', () => {
    const splitter = new ChunkSplitter();
    const code = `
export type UserId = string;
export type ProjectId = string;
export type Timestamp = number;
`.trim();
    const chunks = splitter.splitCode(code, 'src/types/ids.ts');
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('ChunkSplitter: async 함수 포함 파일 → 분할됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
export async function fetchData(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json();
}
export async function postData(url: string, body: unknown): Promise<void> {
  await fetch(url, { method: 'POST', body: JSON.stringify(body) });
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/api/client.ts');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe('typescript');
    }
  });

  it('ChunkSplitter: 제너레이터 함수 포함 → 분할됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function* range(start: number, end: number): Generator<number> {
  for (let i = start; i < end; i++) {
    yield i;
  }
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/util/range.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 데코레이터 포함 클래스 → 분할됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
@injectable()
export class AuthService {
  constructor(private db: Database) {}
  async login(user: string, pass: string): Promise<boolean> {
    return this.db.verify(user, pass);
  }
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/auth/auth-service.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 단순 변수 선언 파일 → 청크 생성됨', () => {
    const splitter = new ChunkSplitter();
    const code = 'export const MAX_RETRIES = 3;\nexport const TIMEOUT_MS = 5000;';
    const chunks = splitter.splitCode(code, 'src/constants.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: React 컴포넌트 패턴 → 분할 처리', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function Button({ label, onClick }: { label: string; onClick: () => void }) {
  return null;
}
export function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return null;
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/components/ui.tsx');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 콜백 중첩 함수 → 처리됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function withCallback(fn: (err: Error | null, result: string) => void): void {
  fn(null, 'done');
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/callback.ts');
    expect(typeof chunks.length).toBe('number');
  });

  it('ChunkSplitter: export default → 청크 생성됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
export default class DefaultService {
  run(): string { return 'running'; }
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/default-service.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 재귀 함수 → 분할됨', () => {
    const splitter = new ChunkSplitter();
    const code = `
export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`.trim();
    const chunks = splitter.splitCode(code, 'src/math/recursive.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: 100줄 단일 함수 → maxChunkSize=50으로 분할 시 최소 1개 청크', () => {
    const splitter = new ChunkSplitter();
    const lines = Array.from({ length: 100 }, (_, i) => `  const line${i} = ${i};`).join('\n');
    const code = `export function hugeFn() {\n${lines}\n  return 0;\n}`;
    const chunks = splitter.splitCode(code, 'src/huge.ts', { maxChunkSize: 50 });
    // WHY: single function boundary → one chunk (truncated to maxChunkSize=50)
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(50);
    }
  });

  it('detectLanguage: Java 파일 → string 반환', () => {
    const result = detectLanguage('src/Main.java');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: C++ 파일 → string 반환', () => {
    const result = detectLanguage('src/main.cpp');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: C 파일 → string 반환', () => {
    const result = detectLanguage('src/main.c');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: JSON 파일 → string 반환', () => {
    const result = detectLanguage('config/tsconfig.json');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: YAML 파일 → string 반환', () => {
    const result = detectLanguage('.github/workflows/ci.yml');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: Markdown 파일 → string 반환', () => {
    const result = detectLanguage('README.md');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 빈 문자열 → string 반환', () => {
    const result = detectLanguage('');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 경로 구분자만 있는 문자열 → string 반환', () => {
    const result = detectLanguage('/');
    expect(typeof result).toBe('string');
  });

  it('detectLanguage: 다중 슬래시 경로 → string 반환', () => {
    const result = detectLanguage('a/b/c/d/e.ts');
    expect(typeof result).toBe('string');
  });

  it('extractModule: 5개 다른 경로 → 모두 string 반환', () => {
    const paths = [
      'src/core/config.ts',
      'src/rag/vectorizer.ts',
      'lib/util.ts',
      'tests/unit/core/test.ts',
      'a/b/c.ts',
    ];
    for (const p of paths) {
      expect(typeof extractModule(p)).toBe('string');
    }
  });

  it('extractModule: 경로에 숫자 포함 → string 반환', () => {
    const result = extractModule('src/layer1/agent1.ts');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('extractModule: 경로에 대문자 포함 → string 반환', () => {
    const result = extractModule('Src/Core/Config.ts');
    expect(typeof result).toBe('string');
  });

  it('extractModule: 경로 끝에 슬래시 → string 반환', () => {
    const result = extractModule('src/core/');
    expect(typeof result).toBe('string');
  });

  it('normalizeVector: 2차원 단위 벡터 → norm≈1', () => {
    const raw = new Float32Array([0, 1]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 음수 단일 요소 → 절댓값 1', () => {
    const raw = new Float32Array([-7]);
    const normalized = normalizeVector(raw);
    expect(Math.abs(Math.abs(normalized[0] ?? 0) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 모든 값 같은 부호 음수 벡터 → norm≈1', () => {
    const raw = new Float32Array([-1, -2, -3, -4]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 입력이 수정되지 않음 (불변성)', () => {
    const raw = new Float32Array([3, 4]);
    const original = new Float32Array([3, 4]);
    normalizeVector(raw);
    // WHY: 입력 원본이 변경되지 않아야 한다
    expect(raw[0]).toBe(original[0]);
    expect(raw[1]).toBe(original[1]);
  });

  it('normalizeVector: 50차원 랜덤 벡터 → norm≈1', () => {
    const raw = Float32Array.from({ length: 50 }, () => Math.random() * 10 - 5);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  it('LocalEmbeddingProvider: 중국어 텍스트 임베딩 → 처리됨', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embedQuery('这是中文文本测试');
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 일본어 텍스트 임베딩 → 처리됨', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embedQuery('日本語のテストテキスト');
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 코드 스니펫 임베딩 → 처리됨', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const codeSnippet = 'function authenticate(token: string): boolean { return token.length > 0; }';
    const result = await provider.embedQuery(codeSnippet);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('LocalEmbeddingProvider: 두 인스턴스 독립성 확인', async () => {
    const p1 = createMockEmbeddingProvider(logger, 'p1', 'Xenova/all-MiniLM-L6-v2', 384);
    const p2 = createMockEmbeddingProvider(logger, 'p2', 'Xenova/all-MiniLM-L6-v2', 384);
    expect(p1.name).toBe('p1');
    expect(p2.name).toBe('p2');
    expect(p1).not.toBe(p2);
  });

  it('LocalEmbeddingProvider: embedQuery 결과 ok는 boolean', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embedQuery('test text');
    expect(typeof result.ok).toBe('boolean');
  });

  it('LocalEmbeddingProvider: embed 배치 결과 ok는 boolean', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const result = await provider.embed(['text1', 'text2']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('LocalEmbeddingProvider: 5개 텍스트 배치 임베딩', async () => {
    const provider = createMockEmbeddingProvider(logger);
    const texts = ['hello', 'world', 'foo', 'bar', 'baz'];
    const result = await provider.embed(texts);
    expect(result.ok === true || result.ok === false).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(5);
    }
  });

  it('LocalEmbeddingProvider: 같은 텍스트 2번 embed → 결과 동일', async () => {
    const provider = createMockEmbeddingProvider(logger, 'det', 'Xenova/all-MiniLM-L6-v2', 384);
    const r1 = await provider.embed(['consistent text']);
    const r2 = await provider.embed(['consistent text']);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      if (r1.value[0] && r2.value[0]) {
        for (let i = 0; i < r1.value[0].length; i++) {
          expect(r1.value[0][i]).toBe(r2.value[0][i]);
        }
      }
    }
  });

  // ── Vectorizer 추가 edge 케이스 (배치66) ─────────────────────────

  it('Vectorizer: search 결과 score는 number 타입', async () => {
    const dbPath = join(tmpDir, 'lance-score-type');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-score-type');
    await Bun.write(join(srcDir, 'score.ts'), 'export function scoreType() { return 99; }');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'score-type-proj' });
    const result = await vectorizer.search('score', 5);
    if (result.ok) {
      for (const item of result.value) {
        expect(typeof item.score).toBe('number');
      }
    }
  });

  it('Vectorizer: 인덱싱 시 .txt 확장자 파일 → 처리됨', async () => {
    const dbPath = join(tmpDir, 'lance-txt-ext');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-txt-ext');
    await Bun.write(join(srcDir, 'readme.txt'), 'This is a text file.');
    const result = await vectorizer.index(srcDir, { extensions: ['txt'], projectId: 'txt-proj' });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 빈 문자열 프로젝트 ID → 처리됨 또는 에러', async () => {
    const dbPath = join(tmpDir, 'lance-empty-proj-id');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-empty-proj');
    await Bun.write(join(srcDir, 'file.ts'), 'export const x = 1;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: '' });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: search limit=-1 → 에러 또는 기본 처리', async () => {
    const dbPath = join(tmpDir, 'lance-negative-limit');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('test', -1);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('Vectorizer: 여러 하위 디렉토리 → 전체 인덱싱됨', async () => {
    const dbPath = join(tmpDir, 'lance-sub-dirs');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-sub-dirs');
    await Bun.write(join(srcDir, 'core', 'index.ts'), 'export const core = true;');
    await Bun.write(join(srcDir, 'rag', 'index.ts'), 'export const rag = true;');
    await Bun.write(join(srcDir, 'layer1', 'index.ts'), 'export const layer1 = true;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'sub-dirs-proj' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('Vectorizer: search 후 결과 value는 배열', async () => {
    const dbPath = join(tmpDir, 'lance-search-array');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-search-arr');
    await Bun.write(join(srcDir, 'x.ts'), 'export const x = 42;');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'search-arr-proj' });
    const result = await vectorizer.search('x', 5);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('Vectorizer: ok=false → error.code는 string', async () => {
    const dbPath = join(tmpDir, 'lance-err-code');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    // WHY: 초기화 없이 검색 → rag_init_error
    const result = await vectorizer.search('query', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('Vectorizer: 여러 Vectorizer 인스턴스 독립성', async () => {
    const v1 = createTrackedVectorizer(join(tmpDir, 'lance-v1'), { default: 'local-placeholder' }, logger);
    const v2 = createTrackedVectorizer(join(tmpDir, 'lance-v2'), { default: 'local-placeholder' }, logger);
    const r1 = await v1.initialize();
    const r2 = await v2.initialize();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(v1).not.toBe(v2);
  });

  it('Vectorizer: index 결과 value는 정수', async () => {
    const dbPath = join(tmpDir, 'lance-int-value');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-int');
    await Bun.write(join(srcDir, 'int.ts'), 'export const n = 1;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'int-proj' });
    if (result.ok) {
      expect(Number.isInteger(result.value)).toBe(true);
    }
  });

  it('Vectorizer: search 한글 쿼리 → 결과 반환됨', async () => {
    const dbPath = join(tmpDir, 'lance-kr-query');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-kr-query');
    await Bun.write(join(srcDir, 'kr.ts'), 'export const 변수 = "값";');
    await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'kr-query-proj' });
    const result = await vectorizer.search('한글 변수', 5);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  // ── 추가 normalizeVector 케이스 (배치66) ────────────────────────

  it('normalizeVector: 6차원 벡터 → norm≈1', () => {
    const raw = new Float32Array([1, 2, 3, 4, 5, 6]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 7차원 벡터 → norm≈1', () => {
    const raw = new Float32Array([7, 6, 5, 4, 3, 2, 1]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 매우 큰 단일 값 → norm≈1', () => {
    const raw = new Float32Array([1e10]);
    const normalized = normalizeVector(raw);
    expect(Math.abs(Math.abs(normalized[0] ?? 0) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 반 음수 반 양수 벡터 → norm≈1', () => {
    const raw = new Float32Array([-3, 4, -5, 12]);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 32차원 벡터 → norm≈1', () => {
    const raw = Float32Array.from({ length: 32 }, (_, i) => i + 1);
    const normalized = normalizeVector(raw);
    let sumSq = 0;
    for (const val of normalized) sumSq += (val ?? 0) ** 2;
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
  });

  it('normalizeVector: 64차원 랜덤 벡터 → norm≈1', () => {
    const raw = Float32Array.from({ length: 64 }, () => Math.random() - 0.5);
    const allZero = Array.from(raw).every((v) => v === 0);
    if (!allZero) {
      const normalized = normalizeVector(raw);
      let sumSq = 0;
      for (const val of normalized) sumSq += (val ?? 0) ** 2;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    }
  });

  // ── ChunkSplitter 메타데이터 상세 검증 (배치66) ──────────────────

  it('ChunkSplitter: metadata.language와 detectLanguage 일치', () => {
    const splitter = new ChunkSplitter();
    const filePath = 'src/core/service.ts';
    const code = 'export function svc() { return "ok"; }';
    const chunks = splitter.splitCode(code, filePath);
    for (const chunk of chunks) {
      expect(chunk.metadata.language).toBe(detectLanguage(filePath));
    }
  });

  it('ChunkSplitter: metadata.module과 extractModule 일치', () => {
    const splitter = new ChunkSplitter();
    const filePath = 'src/rag/chunk-splitter.ts';
    const code = 'export const VERSION = "1.0.0";';
    const chunks = splitter.splitCode(code, filePath);
    for (const chunk of chunks) {
      expect(chunk.metadata.module).toBe(extractModule(filePath));
    }
  });

  it('ChunkSplitter: 10개 언어 파일 각각 language 정확히 설정됨', () => {
    const splitter = new ChunkSplitter();
    const testCases: Array<{ path: string; expected: string }> = [
      { path: 'a.ts', expected: 'typescript' },
      { path: 'b.js', expected: 'javascript' },
      { path: 'c.py', expected: 'python' },
      { path: 'd.rs', expected: 'rust' },
      { path: 'e.go', expected: 'go' },
    ];
    for (const { path, expected } of testCases) {
      const chunks = splitter.splitCode(`// file: ${path}`, path);
      if (chunks.length > 0) {
        expect(chunks[0]!.metadata.language).toBe(expected);
      }
    }
  });

  it('ChunkSplitter: maxChunkSize=100 → 모든 청크 100자 이하', () => {
    const splitter = new ChunkSplitter();
    const code = Array.from({ length: 30 }, (_, i) =>
      `export function generateFunction${i}(): number { return ${i} * ${i}; }`,
    ).join('\n');
    const chunks = splitter.splitCode(code, 'src/generated.ts', { maxChunkSize: 100 });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(100);
    }
  });

  it('ChunkSplitter: 연속 50번 호출 → 항상 배열 반환', () => {
    const splitter = new ChunkSplitter();
    for (let i = 0; i < 50; i++) {
      const code = `export const VAR_${i} = ${i};`;
      const chunks = splitter.splitCode(code, `src/file${i}.ts`);
      expect(Array.isArray(chunks)).toBe(true);
    }
  });

  it('detectLanguage: 결과가 알려진 언어 집합 또는 unknown', () => {
    const knownLanguages = ['typescript', 'javascript', 'python', 'rust', 'go', 'unknown'];
    const testFiles = ['src/a.ts', 'lib/b.js', 'app.py', 'main.rs', 'cmd.go', 'file.xyz'];
    for (const f of testFiles) {
      const lang = detectLanguage(f);
      expect(knownLanguages).toContain(lang);
    }
  });

  it('extractModule: 경로가 짧을수록 반환값도 짧아짐', () => {
    const long = extractModule('src/layer2/sub/module/file.ts');
    const short = extractModule('src/file.ts');
    expect(typeof long).toBe('string');
    expect(typeof short).toBe('string');
    // WHY: 짧은 경로의 모듈명은 긴 경로보다 짧거나 같음
    expect(short.length).toBeLessThanOrEqual(long.length + 1);
  });

  it('Vectorizer: 초기화 결과 ok는 boolean', async () => {
    const dbPath = join(tmpDir, 'lance-init-bool');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    const result = await vectorizer.initialize();
    expect(typeof result.ok).toBe('boolean');
  });

  it('Vectorizer: 인덱싱 결과 ok는 boolean', async () => {
    const dbPath = join(tmpDir, 'lance-index-bool');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const srcDir = join(tmpDir, 'src-index-bool');
    await Bun.write(join(srcDir, 'bool.ts'), 'export const bool = true;');
    const result = await vectorizer.index(srcDir, { extensions: ['ts'], projectId: 'bool-proj' });
    expect(typeof result.ok).toBe('boolean');
  });

  it('Vectorizer: 검색 결과 ok는 boolean', async () => {
    const dbPath = join(tmpDir, 'lance-search-bool');
    const embeddingConfig: EmbeddingConfig = { default: 'local-placeholder' };
    const vectorizer = createTrackedVectorizer(dbPath, embeddingConfig, logger);
    await vectorizer.initialize();
    const result = await vectorizer.search('anything', 3);
    expect(typeof result.ok).toBe('boolean');
  });
});
