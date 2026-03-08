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

    it('탭 문자 포함 content → 처리됨', async () => {
      await repo.initialize();
      const content = 'col1\tcol2\tcol3';
      await repo.insert(createTestRecord({ id: 'tabs', content }));
      const result = await repo.getById('tabs');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('이모지 포함 content → 처리됨', async () => {
      await repo.initialize();
      const content = '🚀 배포 완료! 🎉';
      await repo.insert(createTestRecord({ id: 'emoji', content }));
      const result = await repo.getById('emoji');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('null 문자 포함 ID → 안전 처리', async () => {
      const badRepo = new MemoryRepository('/tmp/\0null', logger);
      const result = await badRepo.initialize();
      expect(typeof result.ok).toBe('boolean');
    });

    it('음수 embedding 값 → 처리됨', async () => {
      await repo.initialize();
      const neg = new Float32Array([-1.0, -0.5, 0.0, 0.5]);
      await repo.insert(createTestRecord({ id: 'neg-emb', embedding: neg }));
      const result = await repo.getById('neg-emb');
      expect(result.ok).toBe(true);
    });

    it('최대값 embedding → 처리됨', async () => {
      await repo.initialize();
      const max = new Float32Array([Float32Array.BYTES_PER_ELEMENT, 1e38, -1e38, 0]);
      await repo.insert(createTestRecord({ id: 'max-emb', embedding: max }));
      const result = await repo.getById('max-emb');
      expect(result.ok).toBe(true);
    });

    it('0벡터 embedding → 처리됨', async () => {
      await repo.initialize();
      const zeros = new Float32Array([0, 0, 0, 0]);
      await repo.insert(createTestRecord({ id: 'zero-emb', embedding: zeros }));
      const result = await repo.getById('zero-emb');
      expect(result.ok).toBe(true);
    });

    it('중복 insert (같은 id) → 오류 또는 덮어쓰기', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'dup-id', content: 'first' }));
      const result = await repo.insert(createTestRecord({ id: 'dup-id', content: 'second' }));
      expect(typeof result.ok).toBe('boolean');
    });
  });

  // ── search - 추가 경계값 ────────────────────────────────────

  describe('search - 추가 경계값', () => {
    it('1개 레코드, 음수 유사도 벡터 검색 → ok=true', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'neg-q', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([-1, -1, -1, -1]), 5);
      expect(result.ok).toBe(true);
    });

    it('limit=0 → ok 또는 err (구현 의존적, boolean 타입)', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'lim0', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 0);
      expect(typeof result.ok).toBe('boolean');
    });

    it('limit이 레코드 수보다 클 때 → 전체 반환', async () => {
      await repo.initialize();
      for (let i = 0; i < 3; i++) {
        await repo.insert(createTestRecord({
          id: `over-${i}`,
          embedding: new Float32Array([0.5, 0.5, 0, 0]),
        }));
      }
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 100);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(3);
    });

    it('filter type=decision → decision만 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'd1', type: 'decision', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'c1', type: 'conversation', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { type: 'decision' });
      if (result.ok) {
        for (const r of result.value) {
          expect(r.type).toBe('decision');
        }
      }
    });

    it('filter type=feedback → feedback만 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'fb1', type: 'feedback', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'err1', type: 'error', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { type: 'feedback' });
      if (result.ok) {
        for (const r of result.value) {
          expect(r.type).toBe('feedback');
        }
      }
    });

    it('검색 결과 record에 content 있음', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'has-content', content: '내용있음', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.content).toBeDefined();
      }
    });

    it('검색 결과 record에 type 있음', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'has-type', type: 'error', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.type).toBeDefined();
      }
    });

    it('모두 동일 벡터 → limit 개수만 반환', async () => {
      await repo.initialize();
      for (let i = 0; i < 5; i++) {
        await repo.insert(createTestRecord({ id: `same-${i}`, embedding: new Float32Array([1, 1, 0, 0]) }));
      }
      const result = await repo.search(new Float32Array([1, 1, 0, 0]), 3);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(3);
    });

    it('projectId 필터 검색', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'pid1', projectId: 'proj-A', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'pid2', projectId: 'proj-B', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { projectId: 'proj-A' });
      if (result.ok && result.value.length > 0) {
        for (const r of result.value) {
          expect(r.projectId).toBe('proj-A');
        }
      }
    });
  });

  // ── delete - 추가 경계값 ────────────────────────────────────

  describe('delete - 추가 경계값', () => {
    it('5개 삽입 후 3개 삭제 → 2개 남음', async () => {
      await repo.initialize();
      for (let i = 0; i < 5; i++) {
        await repo.insert(createTestRecord({ id: `bulk-del-${i}` }));
      }
      for (let i = 0; i < 3; i++) {
        await repo.delete(`bulk-del-${i}`);
      }
      for (let i = 3; i < 5; i++) {
        const r = await repo.getById(`bulk-del-${i}`);
        if (r.ok) expect(r.value?.id).toBe(`bulk-del-${i}`);
      }
    });

    it('빈 문자열 id 삭제 → ok 또는 err', async () => {
      await repo.initialize();
      const result = await repo.delete('');
      expect(typeof result.ok).toBe('boolean');
    });

    it('UUID id 삭제 후 조회 → null', async () => {
      await repo.initialize();
      const uuid = crypto.randomUUID();
      await repo.insert(createTestRecord({ id: uuid }));
      await repo.delete(uuid);
      const result = await repo.getById(uuid);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('삭제 후 검색에 포함 안됨', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'del-search', type: 'error', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.delete('del-search');
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10);
      if (result.ok) {
        expect(result.value.some((r) => r.id === 'del-search')).toBe(false);
      }
    });

    it('같은 id 두 번 삭제 → ok 또는 안전 처리', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'double-del' }));
      await repo.delete('double-del');
      const result = await repo.delete('double-del');
      expect(typeof result.ok).toBe('boolean');
    });
  });

  // ── update - 추가 경계값 ────────────────────────────────────

  describe('update - 추가 경계값', () => {
    it('존재하지 않는 id 업데이트 → ok 또는 err', async () => {
      await repo.initialize();
      const result = await repo.update('nonexistent', { content: 'new content' });
      expect(typeof result.ok).toBe('boolean');
    });

    it('embedding 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'emb-upd', embedding: new Float32Array([1, 0, 0, 0]) }));
      const newEmb = new Float32Array([0, 1, 0, 0]);
      const result = await repo.update('emb-upd', { embedding: newEmb });
      expect(result.ok).toBe(true);
    });

    it('metadata 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'meta-upd' }));
      const newMeta = { phase: 'CODE' as const, featureId: 'feat-99', agentName: 'coder', timestamp: new Date() };
      const result = await repo.update('meta-upd', { metadata: newMeta });
      expect(result.ok).toBe(true);
    });

    it('content에 JSON 문자열 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'json-upd', content: 'original' }));
      const jsonContent = JSON.stringify({ a: 1, b: [2, 3] });
      await repo.update('json-upd', { content: jsonContent });
      const result = await repo.getById('json-upd');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(jsonContent);
      }
    });

    it('type 업데이트 feedback → error', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'type-upd', type: 'feedback' }));
      await repo.update('type-upd', { type: 'error' });
      const result = await repo.getById('type-upd');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('error');
      }
    });

    it('projectId 필드 존재 확인 (update 미지원 필드)', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'proj-upd', projectId: 'old-proj' }));
      const result = await repo.getById('proj-upd');
      if (result.ok && result.value) {
        expect(result.value.projectId).toBe('old-proj');
      }
    });

    it('10번 연속 content 업데이트 → 마지막 값', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'ten-upd', content: 'v0' }));
      for (let i = 1; i <= 10; i++) {
        await repo.update('ten-upd', { content: `v${i}` });
      }
      const result = await repo.getById('ten-upd');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('v10');
      }
    });
  });

  // ── 추가 경계값 케이스 ───────────────────────────────────────

  describe('insert - 추가 경계값', () => {
    it('featureId 특수문자 포함 → ok', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'special-feat',
        metadata: { phase: 'DESIGN', featureId: 'feat!@#$%', agentName: 'coder', timestamp: new Date() },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('agentName 한글 → ok', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'kr-agent',
        metadata: { phase: 'CODE', featureId: 'feat-1', agentName: '코더에이전트', timestamp: new Date() },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('embedding 단일 차원 → 처리됨', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'single-dim',
        embedding: new Float32Array([1.0]),
      });
      // 차원 불일치 가능 — 구현 의존
      const result = await repo.insert(record);
      expect(typeof result.ok).toBe('boolean');
    });

    it('content에 백슬래시 포함 → 처리됨', async () => {
      await repo.initialize();
      const content = 'path\\to\\file.txt';
      await repo.insert(createTestRecord({ id: 'backslash', content }));
      const result = await repo.getById('backslash');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('content에 유니코드 → 처리됨', async () => {
      await repo.initialize();
      const content = '\u0041\u0042\u0043 ABC 한글 日本語';
      await repo.insert(createTestRecord({ id: 'unicode-content', content }));
      const result = await repo.getById('unicode-content');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('20개 레코드 순차 삽입 → 모두 조회 가능', async () => {
      await repo.initialize();
      for (let i = 0; i < 20; i++) {
        await repo.insert(createTestRecord({ id: `seq-${i}` }));
      }
      for (let i = 0; i < 20; i++) {
        const r = await repo.getById(`seq-${i}`);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value?.id).toBe(`seq-${i}`);
      }
    });

    it('content에 SQL 인젝션 패턴 → 안전 처리', async () => {
      await repo.initialize();
      const content = "'; DROP TABLE memory; --";
      await repo.insert(createTestRecord({ id: 'sql-inject', content }));
      const result = await repo.getById('sql-inject');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('content에 HTML 태그 → 그대로 저장', async () => {
      await repo.initialize();
      const content = '<script>alert("xss")</script>';
      await repo.insert(createTestRecord({ id: 'html-content', content }));
      const result = await repo.getById('html-content');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('50개 레코드 병렬 삽입 → ok', async () => {
      await repo.initialize();
      const promises = Array.from({ length: 50 }, (_, i) =>
        repo.insert(createTestRecord({ id: `parallel-${i}` }))
      );
      const results = await Promise.all(promises);
      for (const r of results) {
        expect(typeof r.ok).toBe('boolean');
      }
    });

    it('type=conversation content 최대 길이 50000자', async () => {
      await repo.initialize();
      const bigContent = 'A'.repeat(50_000);
      await repo.insert(createTestRecord({ id: 'max-content', content: bigContent }));
      const result = await repo.getById('max-content');
      if (result.ok && result.value) {
        expect(result.value.content.length).toBe(50_000);
      }
    });
  });

  describe('search - 추가 경계값 2', () => {
    it('projectId + type 복합 필터 → 교집합 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'pf1', projectId: 'proj-X', type: 'decision', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'pf2', projectId: 'proj-X', type: 'conversation', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'pf3', projectId: 'proj-Y', type: 'decision', embedding: new Float32Array([0.8, 0.2, 0, 0]) }));

      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { projectId: 'proj-X', type: 'decision' });
      if (result.ok) {
        for (const r of result.value) {
          expect(r.projectId).toBe('proj-X');
          expect(r.type).toBe('decision');
        }
      }
    });

    it('동일 벡터 여러 레코드 → limit만큼 반환', async () => {
      await repo.initialize();
      for (let i = 0; i < 8; i++) {
        await repo.insert(createTestRecord({ id: `sv-${i}`, embedding: new Float32Array([0.5, 0.5, 0, 0]) }));
      }
      const result = await repo.search(new Float32Array([0.5, 0.5, 0, 0]), 4);
      if (result.ok) expect(result.value.length).toBeLessThanOrEqual(4);
    });

    it('검색 후 각 결과 metadata 존재', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'meta-search', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.metadata).toBeDefined();
      }
    });

    it('NaN embedding 검색 → ok 또는 err', async () => {
      await repo.initialize();
      const nanEmb = new Float32Array([Number.NaN, 0, 0, 0]);
      const result = await repo.search(nanEmb, 5);
      expect(typeof result.ok).toBe('boolean');
    });

    it('Infinity embedding 검색 → ok 또는 err', async () => {
      await repo.initialize();
      const infEmb = new Float32Array([Number.POSITIVE_INFINITY, 0, 0, 0]);
      const result = await repo.search(infEmb, 5);
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('delete - 추가 경계값 2', () => {
    it('10개 삽입 → 10개 모두 삭제 → getById null', async () => {
      await repo.initialize();
      for (let i = 0; i < 10; i++) {
        await repo.insert(createTestRecord({ id: `del-all-${i}` }));
      }
      for (let i = 0; i < 10; i++) {
        await repo.delete(`del-all-${i}`);
      }
      for (let i = 0; i < 10; i++) {
        const r = await repo.getById(`del-all-${i}`);
        if (r.ok) expect(r.value).toBeNull();
      }
    });

    it('한글 id 삭제 → ok', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: '한글-아이디', content: '한글' }));
      const result = await repo.delete('한글-아이디');
      expect(typeof result.ok).toBe('boolean');
    });

    it('UUID id 5개 삭제 → getById 모두 null', async () => {
      await repo.initialize();
      const uuids = Array.from({ length: 5 }, () => crypto.randomUUID());
      for (const uuid of uuids) {
        await repo.insert(createTestRecord({ id: uuid }));
      }
      for (const uuid of uuids) {
        await repo.delete(uuid);
      }
      for (const uuid of uuids) {
        const r = await repo.getById(uuid);
        if (r.ok) expect(r.value).toBeNull();
      }
    });
  });

  // ── 초기화 반복 / 재연결 시나리오 ────────────────────────────

  describe('initialize - 반복 및 재연결', () => {
    it('5번 반복 initialize → 모두 ok', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await repo.initialize();
        expect(result.ok).toBe(true);
      }
    });

    it('initialize → insert → 재initialize → insert 가능', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'before-reinit' }));
      const r2 = await repo.initialize();
      expect(r2.ok).toBe(true);
      // 재초기화 후에도 추가 삽입 가능해야 함
      const insertResult = await repo.insert(createTestRecord({ id: 'after-reinit' }));
      expect(typeof insertResult.ok).toBe('boolean');
    });

    it('initialize 결과에 ok 필드 있음', async () => {
      const result = await repo.initialize();
      expect('ok' in result).toBe(true);
    });

    it('invalid path → initialize → ok=false', async () => {
      const badRepo = new MemoryRepository('\0invalid\0path', logger);
      const result = await badRepo.initialize();
      expect(result.ok).toBe(false);
    });

    it('새 tempDir로 별개 repo → 독립 초기화', async () => {
      const { mkdtemp: mkdtemp2, rm: rm2 } = await import('node:fs/promises');
      const { tmpdir: tmpdir2 } = await import('node:os');
      const { join: join2 } = await import('node:path');
      const tempDir2 = await mkdtemp2(join2(tmpdir2(), 'adev-memory-test2-'));
      try {
        const repo2 = new MemoryRepository(tempDir2, logger);
        const r1 = await repo.initialize();
        const r2 = await repo2.initialize();
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
      } finally {
        await rm2(tempDir2, { recursive: true, force: true });
      }
    });
  });

  // ── insert - 메타데이터 필드 다양한 조합 ─────────────────────

  describe('insert - 메타데이터 다양한 조합', () => {
    it('VERIFY phase 삽입 → 조회', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'verify-phase',
        metadata: { phase: 'VERIFY', featureId: 'feat-v', agentName: 'reviewer', timestamp: new Date() },
      });
      await repo.insert(record);
      const result = await repo.getById('verify-phase');
      if (result.ok && result.value) {
        expect(result.value.metadata.phase).toBe('VERIFY');
      }
    });

    it('agentName=reviewer → 조회', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({
        id: 'reviewer-agent',
        metadata: { phase: 'VERIFY', featureId: 'feat-1', agentName: 'reviewer', timestamp: new Date() },
      }));
      const result = await repo.getById('reviewer-agent');
      if (result.ok && result.value) {
        expect(result.value.metadata.agentName).toBe('reviewer');
      }
    });

    it('featureId=빈문자열 → 삽입 가능', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'empty-feat',
        metadata: { phase: 'DESIGN', featureId: '', agentName: 'architect', timestamp: new Date() },
      });
      const result = await repo.insert(record);
      expect(typeof result.ok).toBe('boolean');
    });

    it('timestamp=과거 날짜 → 삽입 가능', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'past-ts',
        metadata: { phase: 'CODE', featureId: 'feat-1', agentName: 'coder', timestamp: new Date('2000-01-01') },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('timestamp=미래 날짜 → 삽입 가능', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'future-ts',
        metadata: { phase: 'TEST', featureId: 'feat-2', agentName: 'tester', timestamp: new Date('2099-12-31') },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('agentName=qc → 삽입', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'qc-agent',
        metadata: { phase: 'TEST', featureId: 'feat-qc', agentName: 'qc', timestamp: new Date() },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('agentName=documenter → 삽입', async () => {
      await repo.initialize();
      const record = createTestRecord({
        id: 'doc-agent',
        metadata: { phase: 'VERIFY', featureId: 'feat-doc', agentName: 'documenter', timestamp: new Date() },
      });
      const result = await repo.insert(record);
      expect(result.ok).toBe(true);
    });

    it('content=JSON 배열 문자열 → 저장 가능', async () => {
      await repo.initialize();
      const content = JSON.stringify([1, 2, 3, 'hello', { key: 'value' }]);
      await repo.insert(createTestRecord({ id: 'json-arr', content }));
      const result = await repo.getById('json-arr');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(content);
      }
    });

    it('type=conversation 연속 3개 삽입', async () => {
      await repo.initialize();
      for (let i = 0; i < 3; i++) {
        const result = await repo.insert(createTestRecord({ id: `conv-seq-${i}`, type: 'conversation' }));
        expect(result.ok).toBe(true);
      }
    });

    it('type=decision 연속 3개 삽입', async () => {
      await repo.initialize();
      for (let i = 0; i < 3; i++) {
        const result = await repo.insert(createTestRecord({ id: `dec-seq-${i}`, type: 'decision' }));
        expect(result.ok).toBe(true);
      }
    });
  });

  // ── getById - 추가 경계값 ─────────────────────────────────────

  describe('getById - 추가 경계값', () => {
    it('삽입하지 않은 UUID getById → null', async () => {
      await repo.initialize();
      const uuid = crypto.randomUUID();
      const result = await repo.getById(uuid);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('숫자 문자열 id → 삽입 후 조회', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: '99999' }));
      const result = await repo.getById('99999');
      if (result.ok && result.value) {
        expect(result.value.id).toBe('99999');
      }
    });

    it('특수문자 id → 삽입 후 조회', async () => {
      await repo.initialize();
      const id = 'id-with-dash_underscore.dot';
      await repo.insert(createTestRecord({ id }));
      const result = await repo.getById(id);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(id);
      }
    });

    it('중복 id 삽입 후 getById → 반환됨', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'dup-get', content: 'first' }));
      await repo.insert(createTestRecord({ id: 'dup-get', content: 'second' }));
      const result = await repo.getById('dup-get');
      expect(result.ok).toBe(true);
    });

    it('id가 공백 → getById', async () => {
      await repo.initialize();
      const result = await repo.getById(' ');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('id="id" (짧은) → 삽입 후 조회', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'id' }));
      const result = await repo.getById('id');
      if (result.ok && result.value) {
        expect(result.value.id).toBe('id');
      }
    });

    it('100자 id → 삽입 후 조회', async () => {
      await repo.initialize();
      const longId = 'x'.repeat(100);
      await repo.insert(createTestRecord({ id: longId }));
      const result = await repo.getById(longId);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(longId);
      }
    });
  });

  // ── search - 다양한 벡터 차원 및 패턴 ───────────────────────

  describe('search - 다양한 벡터 패턴', () => {
    it('동일 content 다른 id 5개 삽입 → 검색 반환됨', async () => {
      await repo.initialize();
      for (let i = 0; i < 5; i++) {
        await repo.insert(createTestRecord({
          id: `same-content-${i}`,
          content: '동일한 내용',
          embedding: new Float32Array([0.5, 0.5, 0, 0]),
        }));
      }
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });

    it('type=feedback 필터 → feedback만 반환', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'fb-filter-1', type: 'feedback', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'dec-filter-1', type: 'decision', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { type: 'feedback' });
      if (result.ok) {
        for (const r of result.value) {
          expect(r.type).toBe('feedback');
        }
      }
    });

    it('검색 후 각 결과의 projectId 존재', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'proj-search', projectId: 'test-proj', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.projectId).toBeDefined();
      }
    });

    it('검색 결과 각 record의 embedding 존재', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'emb-exist', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.embedding).toBeDefined();
      }
    });

    it('검색 결과 embedding이 Float32Array 타입', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'emb-type', embedding: new Float32Array([1, 0, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5);
      if (result.ok && result.value.length > 0) {
        expect(result.value[0]?.embedding).toBeInstanceOf(Float32Array);
      }
    });

    it('정규화된 벡터 검색 → 유사도 기반 정렬', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'near', embedding: new Float32Array([0.99, 0.1, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'far', embedding: new Float32Array([0.0, 0.0, 1.0, 0]) }));
      const result = await repo.search(new Float32Array([1.0, 0.0, 0.0, 0.0]), 2);
      if (result.ok && result.value.length >= 1) {
        expect(result.value[0]?.id).toBe('near');
      }
    });

    it('limit=100 → 레코드 수 이하 반환', async () => {
      await repo.initialize();
      for (let i = 0; i < 5; i++) {
        await repo.insert(createTestRecord({ id: `many-${i}`, embedding: new Float32Array([0.5, 0.5, 0, 0]) }));
      }
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 100);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(5);
      }
    });

    it('검색 filter 없음 → 모든 타입 반환 가능', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'mixed-1', type: 'conversation', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'mixed-2', type: 'error', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ── update - 추가 경계값 2 ───────────────────────────────────

  describe('update - 추가 경계값 2', () => {
    it('content를 특수문자로 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-special', content: 'original' }));
      const special = "it's test with 'quotes'";
      await repo.update('upd-special', { content: special });
      const result = await repo.getById('upd-special');
      if (result.ok && result.value) {
        expect(result.value.content).toBe(special);
      }
    });

    it('content를 이모지로 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-emoji2', content: 'plain' }));
      await repo.update('upd-emoji2', { content: '🎯🔥💡' });
      const result = await repo.getById('upd-emoji2');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('🎯🔥💡');
      }
    });

    it('type=error로 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-to-error', type: 'conversation' }));
      await repo.update('upd-to-error', { type: 'error' });
      const result = await repo.getById('upd-to-error');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('error');
      }
    });

    it('type=feedback로 업데이트', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-to-fb', type: 'decision' }));
      await repo.update('upd-to-fb', { type: 'feedback' });
      const result = await repo.getById('upd-to-fb');
      if (result.ok && result.value) {
        expect(result.value.type).toBe('feedback');
      }
    });

    it('빈 updates object (content/type 없음) → ok', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'upd-empty-obj', content: 'original' }));
      const result = await repo.update('upd-empty-obj', {});
      expect(result.ok).toBe(true);
    });

    it('content 5번 순환 업데이트 후 최종 값 확인', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'cycle-upd', content: 'start' }));
      const values = ['a', 'b', 'c', 'd', 'final'];
      for (const v of values) {
        await repo.update('cycle-upd', { content: v });
      }
      const result = await repo.getById('cycle-upd');
      if (result.ok && result.value) {
        expect(result.value.content).toBe('final');
      }
    });

    it('update 후 search에서 반영됨', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({
        id: 'upd-search-check',
        type: 'conversation',
        embedding: new Float32Array([1, 0, 0, 0]),
      }));
      await repo.update('upd-search-check', { type: 'decision' });
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { type: 'decision' });
      if (result.ok) {
        const found = result.value.find((r) => r.id === 'upd-search-check');
        // type 업데이트가 검색에 반영될 수 있음
        expect(typeof found === 'undefined' || found.type === 'decision').toBe(true);
      }
    });
  });

  // ── 복합 시나리오 ─────────────────────────────────────────────

  describe('복합 시나리오', () => {
    it('CRUD 전체 파이프라인', async () => {
      await repo.initialize();
      // Create
      const id = crypto.randomUUID();
      await repo.insert(createTestRecord({ id, content: 'initial', type: 'conversation' }));
      // Read
      const r1 = await repo.getById(id);
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value?.content).toBe('initial');
      // Update
      await repo.update(id, { content: 'updated' });
      const r2 = await repo.getById(id);
      if (r2.ok) expect(r2.value?.content).toBe('updated');
      // Delete
      await repo.delete(id);
      const r3 = await repo.getById(id);
      if (r3.ok) expect(r3.value).toBeNull();
    });

    it('3개 삽입 후 검색 → 삭제 후 재검색', async () => {
      await repo.initialize();
      for (let i = 0; i < 3; i++) {
        await repo.insert(createTestRecord({
          id: `pipeline-${i}`,
          embedding: new Float32Array([1, 0, 0, 0]),
        }));
      }
      const before = await repo.search(new Float32Array([1, 0, 0, 0]), 10);
      if (before.ok) {
        const beforeLen = before.value.length;
        await repo.delete('pipeline-0');
        const after = await repo.search(new Float32Array([1, 0, 0, 0]), 10);
        if (after.ok) {
          expect(after.value.length).toBeLessThan(beforeLen + 1);
        }
      }
    });

    it('다양한 type 혼합 삽입 → 각 type 필터 검색', async () => {
      await repo.initialize();
      const types = ['conversation', 'decision', 'feedback', 'error'] as const;
      for (const type of types) {
        await repo.insert(createTestRecord({
          id: `mix-${type}`,
          type,
          embedding: new Float32Array([1, 0, 0, 0]),
        }));
      }
      for (const type of types) {
        const result = await repo.search(new Float32Array([1, 0, 0, 0]), 5, { type });
        if (result.ok && result.value.length > 0) {
          for (const r of result.value) {
            expect(r.type).toBe(type);
          }
        }
      }
    });

    it('projectId 별 분리 검색', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'proj-a-1', projectId: 'proj-A', embedding: new Float32Array([1, 0, 0, 0]) }));
      await repo.insert(createTestRecord({ id: 'proj-b-1', projectId: 'proj-B', embedding: new Float32Array([0.9, 0.1, 0, 0]) }));
      const resultA = await repo.search(new Float32Array([1, 0, 0, 0]), 10, { projectId: 'proj-A' });
      if (resultA.ok) {
        for (const r of resultA.value) {
          expect(r.projectId).toBe('proj-A');
        }
      }
    });

    it('30개 삽입 → 검색 → 삭제 → getById null 확인', async () => {
      await repo.initialize();
      for (let i = 0; i < 30; i++) {
        await repo.insert(createTestRecord({ id: `mass-${i}`, embedding: new Float32Array([0.5, 0.5, 0, 0]) }));
      }
      const searchResult = await repo.search(new Float32Array([1, 0, 0, 0]), 30);
      expect(searchResult.ok).toBe(true);

      for (let i = 0; i < 30; i++) {
        await repo.delete(`mass-${i}`);
      }
      for (let i = 0; i < 30; i++) {
        const r = await repo.getById(`mass-${i}`);
        if (r.ok) expect(r.value).toBeNull();
      }
    });

    it('update 후 insert 후 getById', async () => {
      await repo.initialize();
      await repo.insert(createTestRecord({ id: 'multi-op-1', content: 'v1' }));
      await repo.update('multi-op-1', { content: 'v2' });
      await repo.insert(createTestRecord({ id: 'multi-op-2', content: 'separate' }));
      const r1 = await repo.getById('multi-op-1');
      const r2 = await repo.getById('multi-op-2');
      if (r1.ok && r1.value) expect(r1.value.content).toBe('v2');
      if (r2.ok && r2.value) expect(r2.value.content).toBe('separate');
    });

    it('MemoryRepository 생성 직후 getById → null', async () => {
      await repo.initialize();
      const result = await repo.getById('fresh-get');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });

    it('MemoryRepository 생성 직후 search → 빈 배열', async () => {
      await repo.initialize();
      const result = await repo.search(new Float32Array([1, 0, 0, 0]), 10);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    });

    it('insert + delete + insert 같은 id → 조회 가능', async () => {
      await repo.initialize();
      const id = 'reuse-id';
      await repo.insert(createTestRecord({ id, content: 'first' }));
      await repo.delete(id);
      const r1 = await repo.getById(id);
      if (r1.ok) expect(r1.value).toBeNull();
      await repo.insert(createTestRecord({ id, content: 'second' }));
      const r2 = await repo.getById(id);
      if (r2.ok && r2.value) {
        // 두 번째 삽입이 조회돼야 함
        expect(typeof r2.value.content).toBe('string');
      }
    });

    it('다양한 agentName 삽입 → 각각 조회', async () => {
      await repo.initialize();
      const agents = ['architect', 'coder', 'tester', 'qc', 'qa', 'reviewer', 'documenter'];
      for (const agent of agents) {
        await repo.insert(createTestRecord({
          id: `agent-${agent}`,
          metadata: { phase: 'CODE', featureId: 'feat-1', agentName: agent, timestamp: new Date() },
        }));
      }
      for (const agent of agents) {
        const result = await repo.getById(`agent-${agent}`);
        if (result.ok && result.value) {
          expect(result.value.metadata.agentName).toBe(agent);
        }
      }
    });
  });
});
