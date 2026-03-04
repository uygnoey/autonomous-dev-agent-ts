import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { MemoryRepository } from '../../../src/core/memory.js';
import type { MemoryRecord } from '../../../src/core/types.js';

function createTestRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: overrides.id ?? `mem-${crypto.randomUUID()}`,
    projectId: overrides.projectId ?? 'proj-test',
    type: overrides.type ?? 'conversation',
    content: overrides.content ?? '테스트 대화 내용',
    embedding: overrides.embedding ?? new Float32Array([0.1, 0.2, 0.3, 0.4]),
    metadata: overrides.metadata ?? {
      phase: 'DESIGN',
      featureId: 'feat-001',
      agentName: 'architect',
      timestamp: new Date('2026-03-04T00:00:00Z'),
    },
  };
}

describe('MemoryRepository', () => {
  let tempDir: string;
  let repo: MemoryRepository;
  const logger = new ConsoleLogger('error'); // 테스트 시 로그 최소화

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'adev-memory-test-'));
    repo = new MemoryRepository(tempDir, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── initialize ──────────────────────────────────────────────

  describe('initialize', () => {
    it('정상적으로 초기화된다', async () => {
      const result = await repo.initialize();

      expect(result.ok).toBe(true);
    });

    it('잘못된 경로에서 초기화 실패한다', async () => {
      const badRepo = new MemoryRepository('/nonexistent/path/\0invalid', logger);
      const result = await badRepo.initialize();

      expect(result.ok).toBe(false);
    });
  });

  // ── insert + getById ────────────────────────────────────────

  describe('insert + getById', () => {
    it('레코드를 삽입하고 조회할 수 있다', async () => {
      await repo.initialize();
      const record = createTestRecord({ id: 'mem-001' });

      const insertResult = await repo.insert(record);
      expect(insertResult.ok).toBe(true);

      const getResult = await repo.getById('mem-001');
      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value) {
        expect(getResult.value.id).toBe('mem-001');
        expect(getResult.value.content).toBe('테스트 대화 내용');
        expect(getResult.value.type).toBe('conversation');
        expect(getResult.value.metadata.phase).toBe('DESIGN');
      }
    });

    it('여러 레코드를 삽입할 수 있다', async () => {
      await repo.initialize();

      await repo.insert(createTestRecord({ id: 'a' }));
      await repo.insert(createTestRecord({ id: 'b' }));
      await repo.insert(createTestRecord({ id: 'c' }));

      const resultA = await repo.getById('a');
      const resultC = await repo.getById('c');

      expect(resultA.ok).toBe(true);
      expect(resultC.ok).toBe(true);
      if (resultA.ok) expect(resultA.value?.id).toBe('a');
      if (resultC.ok) expect(resultC.value?.id).toBe('c');
    });

    it('존재하지 않는 ID는 null을 반환한다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'exists' }));

      const result = await repo.getById('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('초기화 전 getById는 null을 반환한다', async () => {
      await repo.initialize();
      // 테이블이 아직 없는 상태 (insert 전)
      const result = await repo.getById('any');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });
  });

  // ── search ──────────────────────────────────────────────────

  describe('search', () => {
    it('벡터 검색이 동작한다', async () => {
      await repo.initialize();

      await repo.insert(
        createTestRecord({
          id: 's1',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
          content: '첫 번째',
        }),
      );
      await repo.insert(
        createTestRecord({
          id: 's2',
          embedding: new Float32Array([0.0, 1.0, 0.0, 0.0]),
          content: '두 번째',
        }),
      );

      const query = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const result = await repo.search(query, 2);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        // 가장 유사한 벡터가 첫 번째여야 함
        expect(result.value[0]?.id).toBe('s1');
      }
    });

    it('빈 테이블에서 검색하면 빈 배열을 반환한다', async () => {
      await repo.initialize();

      const result = await repo.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 10);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('limit이 적용된다', async () => {
      await repo.initialize();

      for (let i = 0; i < 5; i++) {
        await repo.insert(createTestRecord({ id: `item-${i}` }));
      }

      const result = await repo.search(new Float32Array([0.1, 0.2, 0.3, 0.4]), 2);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(2);
    });

    it('filter를 적용하여 검색할 수 있다', async () => {
      await repo.initialize();

      await repo.insert(
        createTestRecord({
          id: 'conv-1',
          type: 'conversation',
          embedding: new Float32Array([1.0, 0.0, 0.0, 0.0]),
        }),
      );
      await repo.insert(
        createTestRecord({
          id: 'err-1',
          type: 'error',
          embedding: new Float32Array([0.9, 0.1, 0.0, 0.0]),
        }),
      );

      const result = await repo.search(new Float32Array([1.0, 0.0, 0.0, 0.0]), 10, {
        type: 'error',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const record of result.value) {
          expect(record.type).toBe('error');
        }
      }
    });
  });

  // ── delete ──────────────────────────────────────────────────

  describe('delete', () => {
    it('레코드를 삭제할 수 있다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'del-me' }));

      const deleteResult = await repo.delete('del-me');
      expect(deleteResult.ok).toBe(true);

      const getResult = await repo.getById('del-me');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) expect(getResult.value).toBeNull();
    });
  });

  // ── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('content를 업데이트할 수 있다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-1', content: '원래 내용' }));

      const updateResult = await repo.update('upd-1', { content: '수정된 내용' });
      expect(updateResult.ok).toBe(true);

      const getResult = await repo.getById('upd-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value) {
        expect(getResult.value.content).toBe('수정된 내용');
      }
    });

    it('type을 업데이트할 수 있다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-2', type: 'conversation' }));

      const updateResult = await repo.update('upd-2', { type: 'decision' });
      expect(updateResult.ok).toBe(true);

      const getResult = await repo.getById('upd-2');
      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value) {
        expect(getResult.value.type).toBe('decision');
      }
    });
  });

  // ── edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('특수문자가 포함된 content를 처리한다', async () => {
      await repo.initialize();
      const content = "it's a test with 'single quotes' and \"double\"";
      await repo.insert(createTestRecord({ id: 'special', content }));

      const result = await repo.getById('special');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('빈 content를 처리한다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'empty', content: '' }));

      const result = await repo.getById('empty');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.content).toBe('');
      }
    });

    it('매우 긴 content를 처리한다', async () => {
      await repo.initialize();
      const longContent = 'x'.repeat(10_000);
      await repo.insert(createTestRecord({ id: 'long', content: longContent }));

      const result = await repo.getById('long');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.content.length).toBe(10_000);
      }
    });

    it('한국어 content를 처리한다', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'kr', content: '한국어 테스트 콘텐츠' }));

      const result = await repo.getById('kr');
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.content).toBe('한국어 테스트 콘텐츠');
      }
    });
  });
});
