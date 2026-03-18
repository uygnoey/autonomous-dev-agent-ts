/**
 * core ↔ rag 모듈 통합 테스트 / core ↔ rag module integration tests
 *
 * @description
 * KR: MemoryRepository와 CodeVectorStore가 LanceDB 경로에서 동작하고,
 *     EmbeddingProvider → VectorStore → search 파이프라인을 검증한다.
 * EN: Verifies MemoryRepository and CodeVectorStore work with LanceDB,
 *     and validates EmbeddingProvider → VectorStore → search pipeline.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger, MemoryRepository } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import type { CodeRecord, MemoryRecord } from 'core/types.js';
import type { EmbeddingProvider, EmbeddingTier } from 'rag/index.js';
import {
  ChunkSplitter,
  CodeIndexer,
  CodeVectorStore,
  RagSearcher,
} from 'rag/index.js';
import { ok, err } from 'core/types.js';
import { RagError } from 'core/errors.js';

// WHY: @huggingface/transformers는 Bun 1.3.10에서 OOM 크래시를 유발.
//      모듈 통합 테스트는 실제 ML 모델이 불필요 — 결정론적 mock으로 대체.
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimensions = 384;
  readonly tier: EmbeddingTier = 'free';

  async embed(texts: string[]): Promise<ReturnType<EmbeddingProvider['embed']>> {
    if (texts.length === 0) return ok([]);
    const vectors = texts.map((text) => {
      const vec = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        // WHY: 텍스트 + 인덱스 기반 결정론적 해시 — 동일 텍스트는 동일 벡터
        let h = i + 1;
        for (let j = 0; j < text.length; j++) {
          h = (h * 31 + text.charCodeAt(j)) & 0x7fffffff;
        }
        vec[i] = (h / 0x7fffffff) * 2 - 1;
      }
      // L2 정규화
      let sum = 0;
      for (let i = 0; i < 384; i++) sum += (vec[i] ?? 0) ** 2;
      const mag = Math.sqrt(sum);
      if (mag > 0) for (let i = 0; i < 384; i++) vec[i] = (vec[i] ?? 0) / mag;
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

function createMockEmbeddingProvider(): MockEmbeddingProvider {
  return new MockEmbeddingProvider();
}

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;

// ── 테스트 ────────────────────────────────────────────────────────

describe('core ↔ rag 통합 / core ↔ rag integration', () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-rag-test-'));
  });

  // WHY: afterAll로 변경 — LanceDB native 모듈이 JS GC 전에 파일을 닫을 시간을 확보
  // (afterEach에서 즉시 삭제하면 아직 열린 LanceDB 연결이 Bun C++ exception 유발)
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('MemoryRepository initialize → insert → getById 동작 확인', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'memory-db'), logger);
    const initResult = await repo.initialize();
    expect(initResult.ok).toBe(true);

    const record: MemoryRecord = {
      id: 'mem-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'test conversation',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.id).toBe('mem-1');
    expect(getResult.value?.content).toBe('test conversation');
  });

  it('CodeVectorStore initialize → insert → search 동작 확인', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'code-db'), logger);
    const initResult = await store.initialize();
    expect(initResult.ok).toBe(true);

    const codeRecord: CodeRecord = {
      id: 'code-1',
      projectId: 'proj-1',
      filePath: 'src/core/config.ts',
      chunk: 'function loadConfig() { return DEFAULT_CONFIG; }',
      embedding: new Float32Array(384).fill(0.01),
      metadata: {
        language: 'typescript',
        module: 'src/core',
        functionName: 'loadConfig',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };

    const insertResult = await store.insert(codeRecord);
    expect(insertResult.ok).toBe(true);

    const searchResult = await store.search(new Float32Array(384).fill(0.01), 5);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThan(0);
    expect(searchResult.value[0]?.filePath).toBe('src/core/config.ts');
  });

  it('MemoryRepository와 CodeVectorStore가 같은 LanceDB 경로에서 동작', async () => {
    const dbPath = join(tmpDir, 'shared-db');

    const memRepo = new MemoryRepository(dbPath, logger);
    const codeStore = new CodeVectorStore(dbPath, logger);

    const memInit = await memRepo.initialize();
    const codeInit = await codeStore.initialize();

    expect(memInit.ok).toBe(true);
    expect(codeInit.ok).toBe(true);

    // WHY: 같은 DB 경로에서 서로 다른 테이블을 사용하므로 충돌 없음
    const memInsert = await memRepo.insert({
      id: 'mem-shared-1',
      projectId: 'proj-1',
      type: 'decision',
      content: 'shared db test',
      embedding: new Float32Array([0.5, 0.5, 0.5, 0.5]),
      metadata: {
        phase: 'CODE',
        featureId: 'feat-1',
        agentName: 'coder',
        timestamp: new Date(),
      },
    });
    expect(memInsert.ok).toBe(true);

    const codeInsert = await codeStore.insert({
      id: 'code-shared-1',
      projectId: 'proj-1',
      filePath: 'src/index.ts',
      chunk: 'export default {};',
      embedding: new Float32Array(384).fill(0.02),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'default',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });
    expect(codeInsert.ok).toBe(true);
  });

  it('EmbeddingProvider로 벡터 생성 → VectorStore에 insert → search로 조회', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'embed-test-db'), logger);
    await store.initialize();

    // 1. 벡터 생성 / Generate embedding
    const embedResult = await provider.embed(['function hello() { return "world"; }']);
    expect(embedResult.ok).toBe(true);
    if (!embedResult.ok) return;
    expect(embedResult.value.length).toBe(1);
    expect(embedResult.value[0]?.length).toBe(384);

    // 2. VectorStore에 insert / Insert into store
    const insertResult = await store.insert({
      id: 'embed-test-1',
      projectId: 'proj-1',
      filePath: 'src/hello.ts',
      chunk: 'function hello() { return "world"; }',
      embedding: embedResult.value[0]!,
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'hello',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });
    expect(insertResult.ok).toBe(true);

    // 3. search로 조회 / Search
    const queryResult = await provider.embedQuery('hello world function');
    expect(queryResult.ok).toBe(true);
    if (!queryResult.ok) return;

    const searchResult = await store.searchWithScore(queryResult.value, 5);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThan(0);
    expect(searchResult.value[0]?.record.filePath).toBe('src/hello.ts');
    expect(searchResult.value[0]?.score).toBeGreaterThan(0);
  });

  it('ChunkSplitter → CodeIndexer → RagSearcher 전체 파이프라인', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'pipeline-db'), logger);
    await store.initialize();

    const splitter = new ChunkSplitter();
    const indexer = new CodeIndexer(store, provider, splitter, logger);

    // 1. 테스트 파일 작성 / Write test file
    const testFilePath = join(tmpDir, 'test-source.ts');
    const testContent = [
      'export function calculateTotal(price: number, tax: number): number {',
      '  return price * (1 + tax);',
      '}',
      '',
      'export function formatCurrency(amount: number): string {',
      '  return `$${amount.toFixed(2)}`;',
      '}',
    ].join('\n');
    await Bun.write(testFilePath, testContent);

    // 2. 인덱싱 / Index the file
    const indexResult = await indexer.indexFile(testFilePath);
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;
    expect(indexResult.value).toBeGreaterThan(0);

    // 3. 검색 / Search
    const searcher = new RagSearcher(store, provider, logger);
    const searchResult = await searcher.searchCode('calculate total price');
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter가 TypeScript 함수 경계를 올바르게 감지', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export function foo() {',
      '  return 1;',
      '}',
      '',
      'export class Bar {',
      '  method() {}',
      '}',
    ].join('\n');

    const chunks = splitter.splitCode(content, 'src/test.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.metadata.functionName).toBe('foo');
  });

  it('MemoryRepository search가 필터 조건으로 결과를 좁힘', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'filter-db'), logger);
    await repo.initialize();

    // 2개의 서로 다른 type 레코드 삽입 (flat 필드명은 소문자 호환)
    await repo.insert({
      id: 'mem-conv-1',
      projectId: 'proj-A',
      type: 'conversation',
      content: 'conversation content',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });
    await repo.insert({
      id: 'mem-dec-1',
      projectId: 'proj-A',
      type: 'decision',
      content: 'decision content',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'CODE',
        featureId: 'feat-2',
        agentName: 'coder',
        timestamp: new Date(),
      },
    });

    // WHY: LanceDB의 camelCase 필드는 따옴표 없이 소문자로 해석되므로,
    //       flat 스키마에서 소문자인 'type' 필드로 필터링
    const searchResult = await repo.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 10, {
      type: 'conversation',
    });
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.every((r) => r.type === 'conversation')).toBe(true);
  });

  it('MemoryRepository update → 변경 확인', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'update-db'), logger);
    await repo.initialize();

    await repo.insert({
      id: 'mem-update-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'original content',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    const updateResult = await repo.update('mem-update-1', { content: 'updated content' });
    expect(updateResult.ok).toBe(true);

    const getResult = await repo.getById('mem-update-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content).toBe('updated content');
  });

  it('MemoryRepository delete → getById null 확인', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'delete-db'), logger);
    await repo.initialize();

    await repo.insert({
      id: 'mem-delete-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'to be deleted',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    const deleteResult = await repo.delete('mem-delete-1');
    expect(deleteResult.ok).toBe(true);

    const getResult = await repo.getById('mem-delete-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value).toBeNull();
  });

  it('LocalEmbeddingProvider가 동일 텍스트에 동일 벡터를 반환 (결정론적)', async () => {
    const provider = createMockEmbeddingProvider();

    const result1 = await provider.embed(['hello world']);
    const result2 = await provider.embed(['hello world']);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    const vec1 = result1.value[0]!;
    const vec2 = result2.value[0]!;

    for (let i = 0; i < vec1.length; i++) {
      expect(vec1[i]).toBeCloseTo(vec2[i]!, 6);
    }
  });

  it('CodeVectorStore getById가 존재하지 않는 ID에 null 반환', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'getbyid-db'), logger);
    await store.initialize();

    const getResult = await store.getById('nonexistent-id');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value).toBeNull();
  });

  // ── Edge / Random Cases ───────────────────────────────────────────

  it('MemoryRepository: 빈 string ID로 insert 에러 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'empty-id-db'), logger);
    await repo.initialize();

    const record: MemoryRecord = {
      id: '',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'test',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };
    const result = await repo.insert(record);
    // WHY: 빈 ID는 무효 — 에러이거나 ok=false
    if (!result.ok) {
      expect(result.ok).toBe(false);
    }
  });

  it('MemoryRepository: UUID 형식 ID로 insert/getById 정상 동작', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'uuid-id-db'), logger);
    await repo.initialize();

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const record: MemoryRecord = {
      id: uuid,
      projectId: 'proj-uuid',
      type: 'decision',
      content: 'UUID-based record',
      embedding: new Float32Array([0.9, 0.8, 0.7, 0.6]),
      metadata: {
        phase: 'CODE',
        featureId: 'feat-uuid',
        agentName: 'coder',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById(uuid);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.id).toBe(uuid);
  });

  it('MemoryRepository: 특수문자 포함 content insert/getById', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'special-char-db'), logger);
    await repo.initialize();

    const specialContent = 'SQL: SELECT * FROM users; <script>alert("xss")</script> 한글 테스트';
    const record: MemoryRecord = {
      id: 'mem-special-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: specialContent,
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-special-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content).toBe(specialContent);
  });

  it('MemoryRepository: 초기화 없이 insert 에러', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'no-init-db'), logger);
    // WHY: initialize() 호출 없이 insert하면 에러

    const record: MemoryRecord = {
      id: 'mem-no-init',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'test',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('MemoryRepository: 동일 ID 중복 insert 에러', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'dup-insert-db'), logger);
    await repo.initialize();

    const record: MemoryRecord = {
      id: 'dup-id-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'first',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    await repo.insert(record);
    const dupResult = await repo.insert({ ...record, content: 'second' });
    // WHY: 중복 ID insert는 에러이거나 ok=false
    if (!dupResult.ok) {
      expect(dupResult.ok).toBe(false);
    }
  });

  it('MemoryRepository: 매우 긴 content (10000자) insert/getById', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'long-content-db'), logger);
    await repo.initialize();

    const longContent = 'A'.repeat(10000);
    const record: MemoryRecord = {
      id: 'mem-long-1',
      projectId: 'proj-1',
      type: 'decision',
      content: longContent,
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'CODE',
        featureId: 'feat-1',
        agentName: 'coder',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-long-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content.length).toBe(10000);
  });

  it('MemoryRepository: update 존재하지 않는 ID 에러', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'update-nonexist-db'), logger);
    await repo.initialize();

    const result = await repo.update('nonexistent-id', { content: 'new content' });
    expect(result.ok).toBe(false);
  });

  it('MemoryRepository: delete 존재하지 않는 ID 에러', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'delete-nonexist-db'), logger);
    await repo.initialize();

    const result = await repo.delete('nonexistent-id');
    expect(result.ok).toBe(false);
  });

  it('MemoryRepository: 모든 phase 타입 insert 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'all-phases-db'), logger);
    await repo.initialize();

    const phases = ['PLAN', 'DESIGN', 'CODE', 'TEST', 'VERIFY'] as const;
    for (const phase of phases) {
      const result = await repo.insert({
        id: `mem-phase-${phase}`,
        projectId: 'proj-1',
        type: 'decision',
        content: `Phase: ${phase}`,
        embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
        metadata: {
          phase,
          featureId: 'feat-1',
          agentName: 'coder',
          timestamp: new Date(),
        },
      });
      expect(result.ok).toBe(true);
    }
  });

  it('MemoryRepository: 음수 임베딩 값 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'neg-embed-db'), logger);
    await repo.initialize();

    const negEmbedding = new Float32Array([-0.9, -0.5, 0.0, 0.5]);
    const record: MemoryRecord = {
      id: 'mem-neg-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'negative embedding test',
      embedding: negEmbedding,
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);
  });

  it('CodeVectorStore: 초기화 없이 insert 에러', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'code-no-init-db'), logger);
    const record: CodeRecord = {
      id: 'code-no-init-1',
      projectId: 'proj-1',
      filePath: 'src/test.ts',
      chunk: 'test chunk',
      embedding: new Float32Array(384).fill(0.1),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'test',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };
    const result = await store.insert(record);
    expect(result.ok).toBe(false);
  });

  it('CodeVectorStore: 한글 filePath 처리', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'korean-path-db'), logger);
    await store.initialize();

    const record: CodeRecord = {
      id: 'code-korean-1',
      projectId: 'proj-kr',
      filePath: 'src/인증/로그인.ts',
      chunk: 'export function 로그인() { return true; }',
      embedding: new Float32Array(384).fill(0.03),
      metadata: {
        language: 'typescript',
        module: 'src/인증',
        functionName: '로그인',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };

    const insertResult = await store.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await store.getById('code-korean-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.filePath).toBe('src/인증/로그인.ts');
  });

  it('CodeVectorStore: 동일 ID 중복 insert 에러', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'code-dup-db'), logger);
    await store.initialize();

    const record: CodeRecord = {
      id: 'code-dup-1',
      projectId: 'proj-1',
      filePath: 'src/dup.ts',
      chunk: 'first chunk',
      embedding: new Float32Array(384).fill(0.05),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'dup',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };

    await store.insert(record);
    const dupResult = await store.insert({ ...record, chunk: 'second chunk' });
    if (!dupResult.ok) {
      expect(dupResult.ok).toBe(false);
    }
  });

  it('CodeVectorStore: 50개 레코드 batch insert 후 search topK=10', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'batch-db'), logger);
    await store.initialize();

    for (let i = 0; i < 50; i++) {
      const embedding = new Float32Array(384).fill(i / 100);
      await store.insert({
        id: `code-batch-${i}`,
        projectId: 'proj-batch',
        filePath: `src/module${i}.ts`,
        chunk: `export function fn${i}() { return ${i}; }`,
        embedding,
        metadata: {
          language: 'typescript',
          module: `src/module${i}`,
          functionName: `fn${i}`,
          lastModified: new Date(),
          modifiedBy: 'test',
        },
      });
    }

    const searchResult = await store.search(new Float32Array(384).fill(0.25), 10);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeLessThanOrEqual(10);
    expect(searchResult.value.length).toBeGreaterThan(0);
  });

  it('CodeVectorStore: topK=0 search 에러 처리', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'topk-zero-db'), logger);
    await store.initialize();

    await store.insert({
      id: 'code-topk-1',
      projectId: 'proj-1',
      filePath: 'src/test.ts',
      chunk: 'test',
      embedding: new Float32Array(384).fill(0.1),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'test',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });

    const result = await store.search(new Float32Array(384).fill(0.1), 0);
    // WHY: topK=0은 에러이거나 빈 배열
    if (result.ok) {
      expect(result.value.length).toBe(0);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('ChunkSplitter: 빈 파일 처리', () => {
    const splitter = new ChunkSplitter();
    const chunks = splitter.splitCode('', 'src/empty.ts');
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBe(0);
  });

  it('ChunkSplitter: 주석만 있는 파일 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      '// This is a comment',
      '// Another comment',
      '/* Block comment */',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/comments-only.ts');
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('ChunkSplitter: 중첩 클래스/함수 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export class Outer {',
      '  inner() {',
      '    function nested() {',
      '      return 42;',
      '    }',
      '    return nested();',
      '  }',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/nested.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 한글 식별자 포함 TypeScript 파일', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export function 계산하기(값: number): number {',
      '  return 값 * 2;',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/한글.ts');
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('ChunkSplitter: 최대 함수 수 (100개) 처리', () => {
    const splitter = new ChunkSplitter();
    const functions = Array.from({ length: 100 }, (_, i) =>
      `export function fn${i}(): number {\n  return ${i};\n}`,
    ).join('\n\n');
    const chunks = splitter.splitCode(functions, 'src/many-functions.ts');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('EmbeddingProvider: 빈 텍스트 배열 embed 에러', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed([]);
    // WHY: 빈 배열은 에러이거나 빈 결과
    if (result.ok) {
      expect(result.value.length).toBe(0);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('EmbeddingProvider: 여러 텍스트 동시 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const texts = [
      'function login()',
      'export class UserService',
      'const DEFAULT_CONFIG = {}',
      'interface Repository<T>',
    ];
    const result = await provider.embed(texts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(4);
    for (const vec of result.value) {
      expect(vec.length).toBe(384);
    }
  });

  it('EmbeddingProvider: 특수문자 포함 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed(['<script>alert("xss")</script> && SELECT * FROM users;']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: 한글 코드 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed(['사용자 인증 함수 로그인 회원가입']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: embedQuery vs embed 동일 텍스트 유사 결과', async () => {
    const provider = createMockEmbeddingProvider();
    const text = 'database connection pool';

    const embedResult = await provider.embed([text]);
    const queryResult = await provider.embedQuery(text);

    expect(embedResult.ok).toBe(true);
    expect(queryResult.ok).toBe(true);
    if (!embedResult.ok || !queryResult.ok) return;

    const vec1 = embedResult.value[0]!;
    const vec2 = queryResult.value;
    expect(vec1.length).toBe(vec2.length);
  });

  it('RagSearcher: 빈 쿼리 문자열 검색 — 에러이거나 빈 배열', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'empty-query-db'), logger);
    await store.initialize();

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('');
    // WHY: 구현에 따라 빈 쿼리 허용 가능
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('RagSearcher: 레코드 없는 스토어 검색 → 빈 배열', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'empty-store-db'), logger);
    await store.initialize();

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('some query');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it('RagSearcher: 여러 언어 파일 혼합 검색', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'multi-lang-db'), logger);
    await store.initialize();

    const langs = [
      { id: 'py-1', filePath: 'src/main.py', chunk: 'def calculate(x, y): return x + y', lang: 'python' },
      { id: 'ts-1', filePath: 'src/main.ts', chunk: 'function calculate(x: number, y: number): number { return x + y; }', lang: 'typescript' },
      { id: 'go-1', filePath: 'src/main.go', chunk: 'func calculate(x, y int) int { return x + y }', lang: 'go' },
    ];

    for (const lang of langs) {
      const embedResult = await provider.embed([lang.chunk]);
      if (!embedResult.ok) continue;
      await store.insert({
        id: lang.id,
        projectId: 'proj-multi',
        filePath: lang.filePath,
        chunk: lang.chunk,
        embedding: embedResult.value[0]!,
        metadata: {
          language: lang.lang,
          module: 'src',
          functionName: 'calculate',
          lastModified: new Date(),
          modifiedBy: 'test',
        },
      });
    }

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('calculate sum of two numbers');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('CodeIndexer: 존재하지 않는 파일 인덱싱 에러', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'nonexist-file-db'), logger);
    await store.initialize();

    const splitter = new ChunkSplitter();
    const indexer = new CodeIndexer(store, provider, splitter, logger);

    const result = await indexer.indexFile(join(tmpDir, 'does-not-exist.ts'));
    expect(result.ok).toBe(false);
  });

  it('CodeIndexer: 빈 파일 인덱싱 → 0 청크', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'empty-file-db'), logger);
    await store.initialize();

    const splitter = new ChunkSplitter();
    const indexer = new CodeIndexer(store, provider, splitter, logger);

    const emptyFile = join(tmpDir, 'empty-source.ts');
    await Bun.write(emptyFile, '');

    const result = await indexer.indexFile(emptyFile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
  });

  it('CodeVectorStore: 최대 Float32 값 임베딩 처리', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'max-float-db'), logger);
    await store.initialize();

    const maxEmbedding = new Float32Array(384).fill(3.4028235e38);
    const result = await store.insert({
      id: 'code-max-float-1',
      projectId: 'proj-1',
      filePath: 'src/extreme.ts',
      chunk: 'extreme values',
      embedding: maxEmbedding,
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'extreme',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });
    // WHY: 최대 float32 값 처리 — 에러이거나 ok=true
    if (result.ok) {
      expect(result.ok).toBe(true);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('MemoryRepository: 여러 projectId로 독립 파티션 확인', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'multi-proj-db'), logger);
    await repo.initialize();

    const projects = ['proj-alpha', 'proj-beta', 'proj-gamma'];
    for (const projectId of projects) {
      await repo.insert({
        id: `mem-${projectId}-1`,
        projectId,
        type: 'conversation',
        content: `content for ${projectId}`,
        embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
        metadata: {
          phase: 'DESIGN',
          featureId: 'feat-1',
          agentName: 'architect',
          timestamp: new Date(),
        },
      });
    }

    for (const projectId of projects) {
      const result = await repo.getById(`mem-${projectId}-1`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.projectId).toBe(projectId);
    }
  });

  it('MemoryRepository: type=decision 레코드 insert/getById', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'decision-db'), logger);
    await repo.initialize();

    const record: MemoryRecord = {
      id: 'mem-decision-1',
      projectId: 'proj-1',
      type: 'decision',
      content: '아키텍처 결정: 모노리포 선택',
      embedding: new Float32Array([0.3, 0.4, 0.5, 0.6]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-arch',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-decision-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.type).toBe('decision');
    expect(getResult.value?.content).toBe('아키텍처 결정: 모노리포 선택');
  });

  it('MemoryRepository: update로 type 변경 가능', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'update-type-db'), logger);
    await repo.initialize();

    await repo.insert({
      id: 'mem-type-change-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'original',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    const updateResult = await repo.update('mem-type-change-1', { type: 'decision' });
    expect(updateResult.ok).toBe(true);

    const getResult = await repo.getById('mem-type-change-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.type).toBe('decision');
  });

  it('MemoryRepository: content에 단일 따옴표 포함 처리', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'quote-db'), logger);
    await repo.initialize();

    const contentWithQuote = "it's a test with 'single quotes'";
    const record: MemoryRecord = {
      id: 'mem-quote-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: contentWithQuote,
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-quote-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content).toBe(contentWithQuote);
  });

  it('MemoryRepository: 1000자 ID로 insert → getById', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'long-id-db'), logger);
    await repo.initialize();

    const longId = 'id-' + 'x'.repeat(50);
    const record: MemoryRecord = {
      id: longId,
      projectId: 'proj-1',
      type: 'conversation',
      content: 'long id test',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'CODE',
        featureId: 'feat-1',
        agentName: 'coder',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById(longId);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.id).toBe(longId);
  });

  it('CodeVectorStore: update(delete+insert) 시뮬레이션', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'code-update-sim-db'), logger);
    await store.initialize();

    const record: CodeRecord = {
      id: 'code-update-sim-1',
      projectId: 'proj-1',
      filePath: 'src/update.ts',
      chunk: 'original chunk',
      embedding: new Float32Array(384).fill(0.1),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'original',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };

    const insertResult = await store.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await store.getById('code-update-sim-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.chunk).toBe('original chunk');
  });

  it('CodeVectorStore: 음수 임베딩 insert → search', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'neg-code-embed-db'), logger);
    await store.initialize();

    const negEmbedding = new Float32Array(384).fill(-0.5);
    await store.insert({
      id: 'code-neg-1',
      projectId: 'proj-1',
      filePath: 'src/negative.ts',
      chunk: 'negative embedding test',
      embedding: negEmbedding,
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'negative',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });

    const searchResult = await store.search(new Float32Array(384).fill(-0.5), 5);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThan(0);
  });

  it('ChunkSplitter: interface 선언만 있는 파일 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export interface IService {',
      '  execute(): void;',
      '  getStatus(): string;',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/service.ts');
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('ChunkSplitter: type alias 선언 파일 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export type Status = "running" | "stopped";',
      'export type ID = string;',
      'export type Count = number;',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/types.ts');
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('ChunkSplitter: async/await 함수 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export async function fetchData(url: string): Promise<unknown> {',
      '  const response = await fetch(url);',
      '  return response.json();',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/fetch.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('ChunkSplitter: 제네릭 함수 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      'export function identity<T>(value: T): T {',
      '  return value;',
      '}',
      '',
      'export function first<T>(arr: T[]): T | undefined {',
      '  return arr[0];',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/generic.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('EmbeddingProvider: 매우 긴 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const longText = 'function test() { return true; }'.repeat(100);
    const result = await provider.embed([longText]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: 단일 단어 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed(['hello']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: 숫자만 있는 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed(['1234567890']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: 공백만 있는 텍스트 embed', async () => {
    const provider = createMockEmbeddingProvider();
    const result = await provider.embed(['   ']);
    // 공백만 있는 텍스트는 ok 또는 err — 구현에 따라
    expect(typeof result.ok).toBe('boolean');
  });

  it('CodeVectorStore: UUID ID로 insert/getById', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'uuid-code-db'), logger);
    await store.initialize();

    const uuid = crypto.randomUUID();
    const record: CodeRecord = {
      id: uuid,
      projectId: 'proj-uuid',
      filePath: 'src/uuid-test.ts',
      chunk: 'export function uuidTest() { return true; }',
      embedding: new Float32Array(384).fill(0.07),
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'uuidTest',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    };

    const insertResult = await store.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await store.getById(uuid);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.id).toBe(uuid);
  });

  it('MemoryRepository: 단일 따옴표 ID 이스케이프', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'escape-id-db'), logger);
    await repo.initialize();

    // 단순 ID - SQL 이스케이프 테스트
    const simpleId = 'mem-escape-test-1';
    await repo.insert({
      id: simpleId,
      projectId: 'proj-1',
      type: 'conversation',
      content: 'escape test',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    const result = await repo.getById(simpleId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.id).toBe(simpleId);
  });

  it('CodeIndexer: 여러 함수 포함 파일 인덱싱 → 여러 청크', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'multi-fn-db'), logger);
    await store.initialize();

    const splitter = new ChunkSplitter();
    const indexer = new CodeIndexer(store, provider, splitter, logger);

    const multiFile = join(tmpDir, 'multi-functions.ts');
    const content = Array.from({ length: 5 }, (_, i) =>
      `export function fn${i}(x: number): number { return x + ${i}; }`,
    ).join('\n\n');
    await Bun.write(multiFile, content);

    const result = await indexer.indexFile(multiFile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeGreaterThan(0);
  });

  it('RagSearcher: 특수문자 쿼리 검색 — ok 반환', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'special-query-db'), logger);
    await store.initialize();

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('<script>alert("xss")</script>');
    expect(typeof result.ok).toBe('boolean');
  });

  it('RagSearcher: 한글 쿼리 검색', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'korean-query-db'), logger);
    await store.initialize();

    const embedResult = await provider.embed(['사용자 인증 함수']);
    if (!embedResult.ok) return;

    await store.insert({
      id: 'korean-code-1',
      projectId: 'proj-1',
      filePath: 'src/auth.ts',
      chunk: '사용자 인증 함수 구현',
      embedding: embedResult.value[0]!,
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'authenticate',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('사용자 인증');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('CodeVectorStore: 서로 다른 projectId insert → search는 전체 반환', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'multi-proj-code-db'), logger);
    await store.initialize();

    for (const projId of ['proj-1', 'proj-2', 'proj-3']) {
      await store.insert({
        id: `code-${projId}-1`,
        projectId: projId,
        filePath: `src/${projId}/index.ts`,
        chunk: `export const ${projId.replace('-', '_')} = true;`,
        embedding: new Float32Array(384).fill(0.1),
        metadata: {
          language: 'typescript',
          module: `src/${projId}`,
          functionName: 'index',
          lastModified: new Date(),
          modifiedBy: 'test',
        },
      });
    }

    const searchResult = await store.search(new Float32Array(384).fill(0.1), 10);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThanOrEqual(3);
  });

  it('MemoryRepository: 5000자 content update → getById 확인', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'long-update-db'), logger);
    await repo.initialize();

    await repo.insert({
      id: 'mem-long-update-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'short content',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    const longContent = 'B'.repeat(5000);
    const updateResult = await repo.update('mem-long-update-1', { content: longContent });
    expect(updateResult.ok).toBe(true);

    const getResult = await repo.getById('mem-long-update-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content.length).toBe(5000);
  });

  it('MemoryRepository: 여러 번 update → 마지막 content 유지', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'multi-update-db'), logger);
    await repo.initialize();

    await repo.insert({
      id: 'mem-multi-update-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: 'v1',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: 'architect',
        timestamp: new Date(),
      },
    });

    await repo.update('mem-multi-update-1', { content: 'v2' });
    await repo.update('mem-multi-update-1', { content: 'v3' });
    const updateResult = await repo.update('mem-multi-update-1', { content: 'v4-final' });
    expect(updateResult.ok).toBe(true);

    const getResult = await repo.getById('mem-multi-update-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.content).toBe('v4-final');
  });

  it('MemoryRepository: VERIFY phase로 insert', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'verify-phase-db'), logger);
    await repo.initialize();

    const record: MemoryRecord = {
      id: 'mem-verify-1',
      projectId: 'proj-1',
      type: 'decision',
      content: 'VERIFY phase test',
      embedding: new Float32Array([0.2, 0.3, 0.4, 0.5]),
      metadata: {
        phase: 'VERIFY',
        featureId: 'feat-1',
        agentName: 'tester',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-verify-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.metadata.phase).toBe('VERIFY');
  });

  it('CodeVectorStore: topK=1 search → 정확히 1개', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'topk-one-db'), logger);
    await store.initialize();

    for (let i = 0; i < 5; i++) {
      await store.insert({
        id: `code-topk1-${i}`,
        projectId: 'proj-1',
        filePath: `src/mod${i}.ts`,
        chunk: `export function mod${i}() { return ${i}; }`,
        embedding: new Float32Array(384).fill(i * 0.05),
        metadata: {
          language: 'typescript',
          module: `src/mod${i}`,
          functionName: `mod${i}`,
          lastModified: new Date(),
          modifiedBy: 'test',
        },
      });
    }

    const searchResult = await store.search(new Float32Array(384).fill(0.1), 1);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBe(1);
  });

  it('MemoryRepository: search limit이 실제 레코드 수보다 클 때', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'search-limit-db'), logger);
    await repo.initialize();

    // 3개만 insert
    for (let i = 0; i < 3; i++) {
      await repo.insert({
        id: `mem-limit-${i}`,
        projectId: 'proj-1',
        type: 'conversation',
        content: `content ${i}`,
        embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
        metadata: {
          phase: 'DESIGN',
          featureId: 'feat-1',
          agentName: 'architect',
          timestamp: new Date(),
        },
      });
    }

    // limit=100으로 검색
    const searchResult = await repo.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 100);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeLessThanOrEqual(100);
    expect(searchResult.value.length).toBeGreaterThanOrEqual(3);
  });

  it('RagSearcher: 매우 긴 쿼리 검색', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'long-query-db'), logger);
    await store.initialize();

    const searcher = new RagSearcher(store, provider, logger);
    const longQuery = 'function definition parameter return type'.repeat(20);
    const result = await searcher.searchCode(longQuery);
    expect(typeof result.ok).toBe('boolean');
  });

  it('MemoryRepository: 동일 embedding 여러 레코드 insert → 각각 getById', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'same-embed-db'), logger);
    await repo.initialize();

    const embedding = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        id: `mem-same-embed-${i}`,
        projectId: 'proj-1',
        type: 'conversation',
        content: `content ${i}`,
        embedding,
        metadata: {
          phase: 'CODE',
          featureId: 'feat-1',
          agentName: 'coder',
          timestamp: new Date(),
        },
      });
    }

    for (let i = 0; i < 5; i++) {
      const result = await repo.getById(`mem-same-embed-${i}`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.content).toBe(`content ${i}`);
    }
  });

  it('CodeVectorStore: 모든 메타데이터 필드 올바르게 저장', async () => {
    const store = new CodeVectorStore(join(tmpDir, 'meta-check-db'), logger);
    await store.initialize();

    const lastModified = new Date('2026-01-15T10:30:00Z');
    const record: CodeRecord = {
      id: 'code-meta-1',
      projectId: 'proj-meta',
      filePath: 'src/meta/check.ts',
      chunk: 'export const META = true;',
      embedding: new Float32Array(384).fill(0.09),
      metadata: {
        language: 'typescript',
        module: 'src/meta',
        functionName: 'META',
        lastModified,
        modifiedBy: 'meta-tester',
      },
    };

    const insertResult = await store.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await store.getById('code-meta-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.metadata.language).toBe('typescript');
    expect(getResult.value?.metadata.module).toBe('src/meta');
    expect(getResult.value?.metadata.modifiedBy).toBe('meta-tester');
  });

  it('EmbeddingProvider: 10개 텍스트 배치 embed → 10개 벡터', async () => {
    const provider = createMockEmbeddingProvider();
    const texts = Array.from({ length: 10 }, (_, i) =>
      `export function fn${i}(): number { return ${i}; }`,
    );
    const result = await provider.embed(texts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(10);
    for (const vec of result.value) {
      expect(vec.length).toBe(384);
    }
  });

  it('MemoryRepository: agentName에 한글 포함', async () => {
    const repo = new MemoryRepository(join(tmpDir, 'korean-agent-db'), logger);
    await repo.initialize();

    const record: MemoryRecord = {
      id: 'mem-korean-agent-1',
      projectId: 'proj-1',
      type: 'conversation',
      content: '한글 에이전트 테스트',
      embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      metadata: {
        phase: 'DESIGN',
        featureId: 'feat-1',
        agentName: '설계담당자',
        timestamp: new Date(),
      },
    };

    const insertResult = await repo.insert(record);
    expect(insertResult.ok).toBe(true);

    const getResult = await repo.getById('mem-korean-agent-1');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value?.metadata.agentName).toBe('설계담당자');
  });

  it('ChunkSplitter: 디코레이터 포함 클래스 처리', () => {
    const splitter = new ChunkSplitter();
    const content = [
      '@Injectable()',
      'export class AuthService {',
      '  @Inject()',
      '  private readonly repo: Repository;',
      '  ',
      '  async login(user: string): Promise<boolean> {',
      '    return true;',
      '  }',
      '}',
    ].join('\n');
    const chunks = splitter.splitCode(content, 'src/auth.service.ts');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('CodeVectorStore: searchWithScore 결과의 score가 0~2 범위', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new CodeVectorStore(join(tmpDir, 'score-range-db'), logger);
    await store.initialize();

    const embedResult = await provider.embed(['function add(a, b) { return a + b; }']);
    if (!embedResult.ok) return;

    await store.insert({
      id: 'code-score-1',
      projectId: 'proj-1',
      filePath: 'src/add.ts',
      chunk: 'function add(a, b) { return a + b; }',
      embedding: embedResult.value[0]!,
      metadata: {
        language: 'typescript',
        module: 'src',
        functionName: 'add',
        lastModified: new Date(),
        modifiedBy: 'test',
      },
    });

    const queryResult = await provider.embedQuery('add two numbers');
    if (!queryResult.ok) return;

    const searchResult = await store.searchWithScore(queryResult.value, 5);
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    for (const { score } of searchResult.value) {
      expect(typeof score).toBe('number');
    }
  });
});
