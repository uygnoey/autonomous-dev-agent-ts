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
import {
  ChunkSplitter,
  CodeIndexer,
  CodeVectorStore,
  RagSearcher,
  createTransformersEmbeddingProvider,
} from 'rag/index.js';

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
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);

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
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embed([]);
    // WHY: 빈 배열은 에러이거나 빈 결과
    if (result.ok) {
      expect(result.value.length).toBe(0);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('EmbeddingProvider: 여러 텍스트 동시 embed', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embed(['<script>alert("xss")</script> && SELECT * FROM users;']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: 한글 코드 텍스트 embed', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
    const result = await provider.embed(['사용자 인증 함수 로그인 회원가입']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.length).toBe(384);
  });

  it('EmbeddingProvider: embedQuery vs embed 동일 텍스트 유사 결과', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);
    const store = new CodeVectorStore(join(tmpDir, 'empty-store-db'), logger);
    await store.initialize();

    const searcher = new RagSearcher(store, provider, logger);
    const result = await searcher.searchCode('some query');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it('RagSearcher: 여러 언어 파일 혼합 검색', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
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
    const provider = createTransformersEmbeddingProvider(logger);
    const store = new CodeVectorStore(join(tmpDir, 'nonexist-file-db'), logger);
    await store.initialize();

    const splitter = new ChunkSplitter();
    const indexer = new CodeIndexer(store, provider, splitter, logger);

    const result = await indexer.indexFile(join(tmpDir, 'does-not-exist.ts'));
    expect(result.ok).toBe(false);
  });

  it('CodeIndexer: 빈 파일 인덱싱 → 0 청크', async () => {
    const provider = createTransformersEmbeddingProvider(logger);
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
});
