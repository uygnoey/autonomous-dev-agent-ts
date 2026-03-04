/**
 * core ↔ rag 모듈 통합 테스트 / core ↔ rag module integration tests
 *
 * @description
 * KR: MemoryRepository와 CodeVectorStore가 LanceDB 경로에서 동작하고,
 *     EmbeddingProvider → VectorStore → search 파이프라인을 검증한다.
 * EN: Verifies MemoryRepository and CodeVectorStore work with LanceDB,
 *     and validates EmbeddingProvider → VectorStore → search pipeline.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger, MemoryRepository } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import type { CodeRecord, MemoryRecord } from '../../src/core/types.js';
import {
  ChunkSplitter,
  CodeIndexer,
  CodeVectorStore,
  RagSearcher,
  createTransformersEmbeddingProvider,
} from '../../src/rag/index.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;

// ── 테스트 ────────────────────────────────────────────────────────

describe('core ↔ rag 통합 / core ↔ rag integration', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-rag-test-'));
  });

  afterEach(async () => {
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
});
