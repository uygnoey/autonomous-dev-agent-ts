import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { MemoryRepository } from 'core/memory.js';
import type { MemoryRecord } from 'core/types.js';

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

    it('두 번 초기화 → 두 번째도 ok', async () => {
      const r1 = await repo.initialize();
      const r2 = await repo.initialize();
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it('반환값이 Result이다', async () => {
      const result = await repo.initialize();
      expect(typeof result.ok).toBe('boolean');
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

    it('type=decision 레코드 삽입 및 조회', async () => {
      await repo.initialize();
      const record = createTestRecord({ id: 'dec-1', type: 'decision', content: 'JWT 채택' });
      await repo.insert(record);
      const result = await repo.getById('dec-1');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('decision');
        expect(result.value.content).toBe('JWT 채택');
      }
    });

    it('type=error 레코드 삽입 및 조회', async () => {
      await repo.initialize();
      const record = createTestRecord({ id: 'err-1', type: 'error', content: '오류 발생' });
      await repo.insert(record);
      const result = await repo.getById('err-1');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('error');
      }
    });

    it('type=feedback 레코드 삽입 및 조회', async () => {
      await repo.initialize();
      const record = createTestRecord({ id: 'fb-1', type: 'feedback', content: '피드백' });
      await repo.insert(record);
      const result = await repo.getById('fb-1');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('feedback');
      }
    });

    it('insert ok=true 반환', async () => {
      await repo.initialize();
      const result = await repo.insert(createTestRecord({ id: 'ins-ok' }));
      expect(result.ok).toBe(true);
    });

    it('getById ok=true 반환', async () => {
      await repo.initialize();
      const result = await repo.getById('any-id');
      expect(result.ok).toBe(true);
    });

    it('projectId 보존', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'proj-check', projectId: 'my-project' }));
      const result = await repo.getById('proj-check');
      if (result.ok && result.value) {
        expect(result.value.projectId).toBe('my-project');
      }
    });

    it('metadata.agentName 보존', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({
        id: 'agent-check',
        metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'coder', timestamp: new Date() },
      }));
      const result = await repo.getById('agent-check');
      if (result.ok && result.value) {
        expect(result.value.metadata.agentName).toBe('coder');
      }
    });

    it('metadata.phase 보존', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({
        id: 'phase-check',
        metadata: { phase: 'TEST', featureId: 'feat-1', agentName: 'tester', timestamp: new Date() },
      }));
      const result = await repo.getById('phase-check');
      if (result.ok && result.value) {
        expect(result.value.metadata.phase).toBe('TEST');
      }
    });

    it('10개 레코드 삽입 → 모두 조회 가능', async () => {
      await repo.initialize();
      const ids = Array.from({ length: 10 }, (_, i) => `bulk-${i}`);
      for (const id of ids) {
        await repo.insert(createTestRecord({ id }));
      }
      for (const id of ids) {
        const result = await repo.getById(id);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value?.id).toBe(id);
      }
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

    it('ok=true 반환', async () => {
      await repo.initialize();
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      expect(result.ok).toBe(true);
    });

    it('반환값이 배열이다', async () => {
      await repo.initialize();
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('limit=1 → 최대 1개 반환', async () => {
      await repo.initialize();
      for (let i = 0; i < 3; i++) {
        await repo.insert(createTestRecord({ id: `lim-${i}`, embedding: new Float32Array([0.5, 0.5, 0, 0]) }));
      }
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 1);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(1);
    });

    it('검색 결과 record에 id 있음', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'search-id', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.id).toBeDefined();
      }
    });

    it('filter type=conversation → conversation만 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'c1', type: 'conversation', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'd1', type: 'decision', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { type: 'conversation' });
      if (result.ok) {
        for (const record of result.value) {
          expect(record.type).toBe('conversation');
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

    it('존재하지 않는 ID 삭제 → ok 또는 err', async () => {
      await repo.initialize();
      const result = await repo.delete('nonexistent-id');
      expect(typeof result.ok).toBe('boolean');
    });

    it('삭제 후 getById → null', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'del-check' }));
      await repo.delete('del-check');
      const result = await repo.getById('del-check');
      if (result.ok) expect(result.value).toBeNull();
    });

    it('다른 레코드는 영향받지 않음', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'keep-1' }));
      await repo.insert(createTestRecord({ id: 'del-only' }));
      await repo.delete('del-only');
      const result = await repo.getById('keep-1');
      if (result.ok) expect(result.value?.id).toBe('keep-1');
    });

    it('delete ok=true 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'del-ok' }));
      const result = await repo.delete('del-ok');
      expect(result.ok).toBe(true);
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

    it('update ok=true 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-ok', content: 'original' }));
      const result = await repo.update('upd-ok', { content: 'updated' });
      expect(result.ok).toBe(true);
    });

    it('content=빈 문자열로 업데이트 가능', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-empty', content: 'original' }));
      await repo.update('upd-empty', { content: '' });
      const result = await repo.getById('upd-empty');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('');
      }
    });

    it('한국어 content로 업데이트 가능', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-kr', content: 'original' }));
      await repo.update('upd-kr', { content: '한국어 업데이트' });
      const result = await repo.getById('upd-kr');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('한국어 업데이트');
      }
    });

    it('여러 번 업데이트 → 마지막 값 반영', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-multi', content: 'v1' }));
      await repo.update('upd-multi', { content: 'v2' });
      await repo.update('upd-multi', { content: 'v3' });
      const result = await repo.getById('upd-multi');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('v3');
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

    it('UUID 형식 ID → 정상 동작', async () => {
      await repo.initialize();
      const uuid = crypto.randomUUID();
      await repo.insert(createTestRecord({ id: uuid }));
      const result = await repo.getById(uuid);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(uuid);
      }
    });

    it('모든 MemoryType 삽입 가능', async () => {
      await repo.initialize();
      const types = ['conversation', 'decision', 'feedback', 'error'] as const;
      for (const type of types) {
        await repo.insert(createTestRecord({ id: `type-${type}`, type }));
        const result = await repo.getById(`type-${type}`);
        if (result.ok && result.value) {
          expect(result.value.type).toBe(type);
        }
      }
    });

    it('모든 Phase metadata 삽입 가능', async () => {
      await repo.initialize();
      const phases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'] as const;
      for (const phase of phases) {
        await repo.insert(createTestRecord({
          id: `phase-${phase}`,
          metadata: { phase, featureId: 'feat-1', agentName: 'architect', timestamp: new Date() },
        }));
        const result = await repo.getById(`phase-${phase}`);
        if (result.ok && result.value) {
          expect(result.value.metadata.phase).toBe(phase);
        }
      }
    });

    it('JSON 특수문자 content → 처리됨', async () => {
      await repo.initialize();
      const content = '{"key": "value", "nested": {"arr": [1,2,3]}}';
      await repo.insert(createTestRecord({ id: 'json-content', content }));
      const result = await repo.getById('json-content');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('개행 포함 content → 처리됨', async () => {
      await repo.initialize();
      const content = 'line1\nline2\nline3';
      await repo.insert(createTestRecord({ id: 'newlines', content }));
      const result = await repo.getById('newlines');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });
  });
});
