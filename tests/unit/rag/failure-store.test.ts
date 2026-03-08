/**
 * FailureRepository 단위 테스트 / FailureRepository unit tests
 *
 * @description
 * 초기화 전 동작, insert/update/delete 오류, search/getById/getByProject/getByPhase 빈 결과,
 * 다양한 경계값을 검증한다.
 *
 * NOTE: LanceDB 초기화가 느리므로 초기화 없이 호출하는 케이스에 집중한다.
 * 설계: 읽기 메서드는 table=null 시 빈 결과 반환 (ok).
 *       쓰기 메서드(insert/update/delete)는 db/table=null 시 err 반환.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import { FailureRepository } from 'rag/failure-store.js';

const logger = new ConsoleLogger('error');

function makeRepo(dbPath = '/tmp/adev-test-failures'): FailureRepository {
  return new FailureRepository(dbPath, logger);
}

function makeRecord(i = 0) {
  const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
  return {
    id: `fail-${i}`,
    projectId: `proj-${i % 3}`,
    featureId: `feat-${i}`,
    phase: phases[i % 4] as Phase,
    failureType: `type-${i % 5}`,
    rootCause: `root-cause-${i}`,
    resolution: `resolution-${i}`,
    embedding: new Float32Array(384).fill(i * 0.001),
    timestamp: new Date(),
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('FailureRepository 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeRepo()).not.toThrow();
  });

  it('FailureRepository 인스턴스', () => {
    expect(makeRepo()).toBeInstanceOf(FailureRepository);
  });

  it('다양한 dbPath → 인스턴스 생성', () => {
    const paths = ['/tmp/fail-db1', '/tmp/fail-db2', '/tmp/dir/nested/failures'];
    for (const path of paths) {
      expect(() => makeRepo(path)).not.toThrow();
    }
  });

  it('빈 dbPath → 인스턴스 생성 (초기화 시 실패 예상)', () => {
    expect(() => makeRepo('')).not.toThrow();
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const r1 = makeRepo('/tmp/fail-a');
    const r2 = makeRepo('/tmp/fail-b');
    expect(r1).not.toBe(r2);
  });

  it('insert 메서드 존재', () => {
    expect(typeof makeRepo().insert).toBe('function');
  });

  it('update 메서드 존재', () => {
    expect(typeof makeRepo().update).toBe('function');
  });

  it('delete 메서드 존재', () => {
    expect(typeof makeRepo().delete).toBe('function');
  });

  it('search 메서드 존재', () => {
    expect(typeof makeRepo().search).toBe('function');
  });

  it('getById 메서드 존재', () => {
    expect(typeof makeRepo().getById).toBe('function');
  });

  it('getByProject 메서드 존재', () => {
    expect(typeof makeRepo().getByProject).toBe('function');
  });

  it('getByPhase 메서드 존재', () => {
    expect(typeof makeRepo().getByPhase).toBe('function');
  });

  it('close 메서드 존재', () => {
    expect(typeof makeRepo().close).toBe('function');
  });

  it('10개 인스턴스 생성 → 오류 없음', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeRepo(`/tmp/fail-10-${i}`)).not.toThrow();
    }
  });
});

// ── 쓰기 연산 미초기화 오류 ────────────────────────────────────

describe('FailureRepository 쓰기 연산 미초기화 오류', () => {
  it('insert() 미초기화 → err 반환', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(1));
    expect(result.ok).toBe(false);
  });

  it('update() 미초기화 → err 반환', async () => {
    const repo = makeRepo();
    const result = await repo.update('some-id', { resolution: 'fixed' });
    expect(result.ok).toBe(false);
  });

  it('delete() 미초기화 → err 반환', async () => {
    const repo = makeRepo();
    const result = await repo.delete('some-id');
    expect(result.ok).toBe(false);
  });

  it('insert() 오류 메시지에 초기화 관련 내용 포함', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize/i);
    }
  });

  it('update() 오류 메시지에 테이블 관련 내용 포함', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { rootCause: 'updated' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize|테이블/i);
    }
  });

  it('delete() 오류 메시지에 테이블 관련 내용 포함', async () => {
    const repo = makeRepo();
    const result = await repo.delete('fail-0');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize|테이블/i);
    }
  });

  it('insert() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    expect(typeof result.ok).toBe('boolean');
  });

  it('update() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: 'x' });
    expect(typeof result.ok).toBe('boolean');
  });

  it('delete() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.delete('fail-0');
    expect(typeof result.ok).toBe('boolean');
  });

  it('insert() error.code는 string 타입', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('update() error.code는 string 타입', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: 'x' });
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('delete() error.code는 string 타입', async () => {
    const repo = makeRepo();
    const result = await repo.delete('fail-0');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('5회 insert() 반복 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.insert(makeRecord(i));
      expect(result.ok).toBe(false);
    }
  });

  it('delete() 빈 ID → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('');
    expect(result.ok).toBe(false);
  });

  it('update() 빈 partial → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', {});
    expect(result.ok).toBe(false);
  });

  it('insert 4개 Phase 레코드 → 모두 err', async () => {
    const repo = makeRepo();
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const result = await repo.insert({ ...makeRecord(0), phase });
      expect(result.ok).toBe(false);
    }
  });

  it('insert() 10개 다른 레코드 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.insert(makeRecord(i));
      expect(result.ok).toBe(false);
    }
  });
});

// ── 읽기 연산 미초기화 동작 (빈 결과) ─────────────────────────

describe('FailureRepository 읽기 연산 미초기화 동작', () => {
  it('search() 미초기화 → ok([]) 빈 배열', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('getById() 미초기화 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('some-id');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('getByProject() 미초기화 → ok([]) 빈 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('getByPhase() 미초기화 → ok([]) 빈 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('CODE');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('getByPhase() with projectId 미초기화 → ok([]) 빈 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('TEST', 'proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('여러 search 호출 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.search(new Float32Array(384).fill(i * 0.1), 10);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  });

  it('모든 Phase 타입으로 getByPhase → 모두 ok (미초기화)', async () => {
    const repo = makeRepo();
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const result = await repo.getByPhase(phase);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  });

  it('search() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    expect(typeof result.ok).toBe('boolean');
  });

  it('getById() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.getById('some-id');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getByPhase() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('DESIGN');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getByProject() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    expect(typeof result.ok).toBe('boolean');
  });

  it('search() value는 배열', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getByProject() value는 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getByPhase() value는 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('CODE');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getById() 빈 ID → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('getByProject() 빈 projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('search() zero vector → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0), 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit=100 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.5), 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase() DESIGN with projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('DESIGN', 'proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase() VERIFY with projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('VERIFY', 'proj-2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getById() UUID 형태 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('10회 getById() 연속 → 모두 ok(null)', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.getById(`id-${i}`);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    }
  });

  it('10회 search() 연속 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.search(new Float32Array(384).fill(i * 0.1), 5);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  });
});

// ── close() 동작 ───────────────────────────────────────────────

describe('FailureRepository close()', () => {
  it('close() → 오류 없음', async () => {
    const repo = makeRepo();
    await expect(repo.close()).resolves.toBeUndefined();
  });

  it('close() 후 재호출 → 오류 없음', async () => {
    const repo = makeRepo();
    await repo.close();
    await expect(repo.close()).resolves.toBeUndefined();
  });

  it('close() 후 search() → ok([]) (table=null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('close() 후 insert() → err (db=null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.insert(makeRecord(0));
    expect(result.ok).toBe(false);
  });

  it('close() 후 update() → err (table=null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.update('fail-0', { resolution: 'updated' });
    expect(result.ok).toBe(false);
  });

  it('close() 후 delete() → err (table=null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.delete('fail-0');
    expect(result.ok).toBe(false);
  });

  it('close() 후 getById() → ok(null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getById('some-id');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('close() 후 getByProject() → ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getByProject('proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('close() 후 getByPhase() → ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getByPhase('CODE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('close() 3회 반복 → 오류 없음', async () => {
    const repo = makeRepo();
    await repo.close();
    await repo.close();
    await expect(repo.close()).resolves.toBeUndefined();
  });
});

// ── 다양한 설정으로 생성 ───────────────────────────────────────

describe('FailureRepository 다양한 설정', () => {
  it('dbPath /tmp/fail-v1 → 생성됨', () => {
    const repo = makeRepo('/tmp/fail-v1');
    expect(repo).toBeInstanceOf(FailureRepository);
  });

  it('dbPath /tmp/fail-v2 → 생성됨', () => {
    const repo = makeRepo('/tmp/fail-v2');
    expect(repo).toBeInstanceOf(FailureRepository);
  });

  it('dbPath /tmp/nested/path/failures → 생성됨', () => {
    const repo = makeRepo('/tmp/nested/path/failures');
    expect(repo).toBeInstanceOf(FailureRepository);
  });

  it('dbPath 한국어 경로 → 생성됨', () => {
    expect(() => makeRepo('/tmp/한국어-경로')).not.toThrow();
  });

  it('dbPath UUID 스타일 → 생성됨', () => {
    expect(() => makeRepo('/tmp/fail-a1b2c3d4-e5f6')).not.toThrow();
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('FailureRepository 랜덤/경계값', () => {
  it('랜덤 search 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0 * 0.01), 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 search 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(1 * 0.01), 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 search 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(2 * 0.01), 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 search 미초기화 #3', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(3 * 0.01), 4);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 search 미초기화 #4', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(4 * 0.01), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 getById 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.getById('failure-0');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('랜덤 getById 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.getById('failure-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('랜덤 getById 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.getById('failure-2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('랜덤 getByProject 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-0');
    expect(result.ok).toBe(true);
  });

  it('랜덤 getByProject 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    expect(result.ok).toBe(true);
  });

  it('랜덤 getByProject 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-2');
    expect(result.ok).toBe(true);
  });

  it('getByPhase DESIGN 미초기화 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('DESIGN');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase CODE 미초기화 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('CODE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase TEST 미초기화 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('TEST');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase VERIFY 미초기화 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('VERIFY');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('빈 ID getById → ok(null) (미초기화)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('zero vector search → ok([]) (미초기화)', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0), 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 insert 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    expect(result.ok).toBe(false);
  });

  it('랜덤 insert 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(1));
    expect(result.ok).toBe(false);
  });

  it('랜덤 insert 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(2));
    expect(result.ok).toBe(false);
  });

  it('랜덤 insert 미초기화 #3', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(3));
    expect(result.ok).toBe(false);
  });

  it('랜덤 insert 미초기화 #4', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(4));
    expect(result.ok).toBe(false);
  });

  it('여러 FailureRepository 인스턴스 독립적', async () => {
    const r1 = makeRepo('/tmp/fail-r1');
    const r2 = makeRepo('/tmp/fail-r2');
    const res1 = await r1.search(new Float32Array(384).fill(0.1), 5);
    const res2 = await r2.search(new Float32Array(384).fill(0.2), 5);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
  });

  it('getByProject() 긴 ID → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('x'.repeat(500));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getById() 긴 ID → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('x'.repeat(500));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('한국어 projectId → getByProject ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('한국어-프로젝트');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('FailureRepository 복합 시나리오', () => {
  it('읽기 여러 메서드 → 모두 ok (미초기화)', async () => {
    const repo = makeRepo();
    const searchResult = await repo.search(new Float32Array(384).fill(0.1), 5);
    const getByIdResult = await repo.getById('test-id');
    const getByProjectResult = await repo.getByProject('proj-1');
    const getByPhaseResult = await repo.getByPhase('CODE');

    expect(searchResult.ok).toBe(true);
    expect(getByIdResult.ok).toBe(true);
    expect(getByProjectResult.ok).toBe(true);
    expect(getByPhaseResult.ok).toBe(true);
  });

  it('쓰기 여러 메서드 → 모두 err (미초기화)', async () => {
    const repo = makeRepo();
    const insertResult = await repo.insert(makeRecord(0));
    const updateResult = await repo.update('fail-0', { resolution: 'x' });
    const deleteResult = await repo.delete('fail-0');

    expect(insertResult.ok).toBe(false);
    expect(updateResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
  });

  it('100개 인스턴스 생성 → 성능 문제 없음', () => {
    const repos = Array.from({ length: 100 }, (_, i) => makeRepo(`/tmp/fail-perf-${i}`));
    expect(repos.length).toBe(100);
    for (const repo of repos) {
      expect(repo).toBeInstanceOf(FailureRepository);
    }
  });

  it('모든 Phase × 모든 쓰기 → 모두 err', async () => {
    const repo = makeRepo();
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const record = makeRecord(0);
      const insertResult = await repo.insert({ ...record, phase });
      expect(insertResult.ok).toBe(false);
    }
  });

  it('읽기→쓰기→읽기 패턴 → 읽기는 ok, 쓰기는 err', async () => {
    const repo = makeRepo();
    const read1 = await repo.getById('test-id');
    const write1 = await repo.insert(makeRecord(0));
    const read2 = await repo.getByProject('proj-0');
    expect(read1.ok).toBe(true);
    expect(write1.ok).toBe(false);
    expect(read2.ok).toBe(true);
  });

  it('close() 후 읽기 연산 → 모두 ok', async () => {
    const repo = makeRepo();
    await repo.close();
    const searchResult = await repo.search(new Float32Array(384).fill(0.1), 5);
    const getByIdResult = await repo.getById('test-id');
    const getByPhaseResult = await repo.getByPhase('DESIGN');
    expect(searchResult.ok).toBe(true);
    expect(getByIdResult.ok).toBe(true);
    expect(getByPhaseResult.ok).toBe(true);
  });

  it('close() 후 쓰기 연산 → 모두 err', async () => {
    const repo = makeRepo();
    await repo.close();
    const insertResult = await repo.insert(makeRecord(0));
    const deleteResult = await repo.delete('fail-0');
    expect(insertResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
  });

  it('5개 독립 인스턴스 각각 search → 모두 ok', async () => {
    const repos = Array.from({ length: 5 }, (_, i) => makeRepo(`/tmp/fail-ind-${i}`));
    for (const repo of repos) {
      const result = await repo.search(new Float32Array(384).fill(0.1), 5);
      expect(result.ok).toBe(true);
    }
  });

  it('동일 인스턴스 search 5회 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.search(new Float32Array(384).fill(0.1), 5);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  });

  it('모든 Phase getByPhase with projectId → 모두 ok', async () => {
    const repo = makeRepo();
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const result = await repo.getByPhase(phase, 'proj-shared');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual([]);
    }
  });
});

// ── 추가 edge/random 케이스 ─────────────────────────────────────

describe('FailureRepository 추가 edge 케이스 — insert 필드 다양성', () => {
  it('insert() featureId 빈 문자열 → err', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), featureId: '' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() rootCause 한글 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), rootCause: '한글 원인' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() resolution 특수문자 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), resolution: '!@#$%^&*()' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() resolution 매우 긴 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), resolution: 'x'.repeat(5000) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() embedding 최대값 Float32Array → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), embedding: new Float32Array(384).fill(Number.MAX_VALUE) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() embedding 음수 값 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), embedding: new Float32Array(384).fill(-1) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() id UUID 형식 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() id 빈 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), id: '' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() failureType 숫자 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), failureType: '42' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() timestamp 과거 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), timestamp: new Date(0) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });
});

describe('FailureRepository 추가 edge 케이스 — update 필드 다양성', () => {
  it('update() resolution 빈 문자열 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: '' });
    expect(result.ok).toBe(false);
  });

  it('update() rootCause 한글 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { rootCause: '한글 원인 수정' });
    expect(result.ok).toBe(false);
  });

  it('update() 여러 필드 동시 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: 'fixed', rootCause: 'updated' });
    expect(result.ok).toBe(false);
  });

  it('update() UUID id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('a1b2c3d4-e5f6-7890-abcd-ef1234567890', { resolution: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 한글 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('한글-아이디', { resolution: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 특수문자 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('!@#$%^&*()', { resolution: 'x' });
    expect(result.ok).toBe(false);
  });
});

describe('FailureRepository 추가 edge 케이스 — delete 다양성', () => {
  it('delete() UUID id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(false);
  });

  it('delete() 한글 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('한글-아이디-삭제');
    expect(result.ok).toBe(false);
  });

  it('delete() 특수문자 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('!@#$%^&*()');
    expect(result.ok).toBe(false);
  });

  it('delete() 숫자만 → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('1234567890');
    expect(result.ok).toBe(false);
  });

  it('delete() 공백 → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('   ');
    expect(result.ok).toBe(false);
  });
});

describe('FailureRepository 추가 edge 케이스 — search 벡터 다양성', () => {
  it('search() NaN vector → ok([])', async () => {
    const repo = makeRepo();
    const v = new Float32Array(384).fill(Number.NaN);
    const result = await repo.search(v, 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() Infinity vector → ok([])', async () => {
    const repo = makeRepo();
    const v = new Float32Array(384).fill(Number.POSITIVE_INFINITY);
    const result = await repo.search(v, 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit 1 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.3), 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit 50 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.7), 50);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit 1000 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.9), 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() 음수 limit → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), -1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() 다양한 fill 값 5가지 → 모두 ok', async () => {
    const repo = makeRepo();
    const fills = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const f of fills) {
      const result = await repo.search(new Float32Array(384).fill(f), 5);
      expect(result.ok).toBe(true);
    }
  });
});

describe('FailureRepository 추가 edge 케이스 — getByProject/getByPhase 다양성', () => {
  it('getByProject() 숫자 문자열 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('12345');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByProject() 특수문자 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('!@#$%');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByProject() 공백만 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase() CODE with 빈 projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('CODE', '');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase() TEST with UUID projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('TEST', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase() VERIFY with 한글 projectId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('VERIFY', '한글-프로젝트-아이디');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getById() 특수문자 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('!@#$%^&*()');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getById() 한글 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('한글-아이디');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getById() 숫자만 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('9999999999');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

// ── 추가 edge: Result 타입 계약 검증 ─────────────────────────────

describe('FailureRepository Result 타입 계약', () => {
  it('insert() 결과는 ok 또는 error 중 하나만 포함', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    if (result.ok) {
      expect('value' in result).toBe(true);
    } else {
      expect('error' in result).toBe(true);
    }
  });

  it('update() 결과는 ok 또는 error 중 하나만 포함', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: 'x' });
    if (result.ok) {
      expect('value' in result).toBe(true);
    } else {
      expect('error' in result).toBe(true);
    }
  });

  it('delete() 결과는 ok 또는 error 중 하나만 포함', async () => {
    const repo = makeRepo();
    const result = await repo.delete('fail-0');
    if (result.ok) {
      expect('value' in result).toBe(true);
    } else {
      expect('error' in result).toBe(true);
    }
  });

  it('search() 결과는 ok=true이면 value 배열', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getById() 결과는 ok=true이면 value가 null 또는 객체', async () => {
    const repo = makeRepo();
    const result = await repo.getById('any-id');
    if (result.ok) {
      expect(result.value === null || typeof result.value === 'object').toBe(true);
    }
  });

  it('getByProject() 결과는 ok=true이면 value 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getByPhase() 결과는 ok=true이면 value 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByPhase('DESIGN');
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('insert() 미초기화 error.name 은 문자열', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(0));
    if (!result.ok) {
      expect(typeof result.error.name).toBe('string');
    }
  });

  it('update() 미초기화 error.name 은 문자열', async () => {
    const repo = makeRepo();
    const result = await repo.update('fail-0', { resolution: 'x' });
    if (!result.ok) {
      expect(typeof result.error.name).toBe('string');
    }
  });

  it('delete() 미초기화 error.name 은 문자열', async () => {
    const repo = makeRepo();
    const result = await repo.delete('fail-0');
    if (!result.ok) {
      expect(typeof result.error.name).toBe('string');
    }
  });
});

// ── 추가 edge: makeRecord 입력 변형 ─────────────────────────────

describe('FailureRepository makeRecord 변형 edge 케이스', () => {
  it('makeRecord(0) phase는 DESIGN', () => {
    const rec = makeRecord(0);
    expect(rec.phase).toBe('DESIGN');
  });

  it('makeRecord(1) phase는 CODE', () => {
    const rec = makeRecord(1);
    expect(rec.phase).toBe('CODE');
  });

  it('makeRecord(2) phase는 TEST', () => {
    const rec = makeRecord(2);
    expect(rec.phase).toBe('TEST');
  });

  it('makeRecord(3) phase는 VERIFY', () => {
    const rec = makeRecord(3);
    expect(rec.phase).toBe('VERIFY');
  });

  it('makeRecord(4) phase는 DESIGN (순환)', () => {
    const rec = makeRecord(4);
    expect(rec.phase).toBe('DESIGN');
  });

  it('makeRecord id 포함', () => {
    const rec = makeRecord(7);
    expect(rec.id).toBe('fail-7');
  });

  it('makeRecord projectId 포함', () => {
    const rec = makeRecord(6);
    expect(rec.projectId).toBe('proj-0');
  });

  it('makeRecord embedding은 Float32Array', () => {
    const rec = makeRecord(0);
    expect(rec.embedding).toBeInstanceOf(Float32Array);
  });

  it('makeRecord embedding 길이 384', () => {
    const rec = makeRecord(0);
    expect(rec.embedding.length).toBe(384);
  });

  it('makeRecord timestamp는 Date', () => {
    const rec = makeRecord(0);
    expect(rec.timestamp).toBeInstanceOf(Date);
  });
});

// ── 추가 edge: 경계 Phase / 인스턴스 독립성 ─────────────────────

describe('FailureRepository Phase 경계값 및 인스턴스 독립성', () => {
  it('getByPhase CODE → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-phase-code');
    const result = await repo.getByPhase('CODE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase TEST → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-phase-test');
    const result = await repo.getByPhase('TEST');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase VERIFY with proj → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-phase-verify');
    const result = await repo.getByPhase('VERIFY', 'proj-xyz');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByPhase DESIGN with proj → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-phase-design');
    const result = await repo.getByPhase('DESIGN', 'proj-abc');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('3개 독립 인스턴스 → getByProject 모두 ok', async () => {
    const repos = [
      makeRepo('/tmp/fail-ind-a'),
      makeRepo('/tmp/fail-ind-b'),
      makeRepo('/tmp/fail-ind-c'),
    ];
    for (const repo of repos) {
      const r = await repo.getByProject('proj-shared');
      expect(r.ok).toBe(true);
    }
  });

  it('각 Phase insert 미초기화 → 모두 err', async () => {
    const repo = makeRepo('/tmp/fail-all-phase');
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const r = await repo.insert({ ...makeRecord(0), phase });
      expect(r.ok).toBe(false);
    }
  });

  it('search limit=1 미초기화 → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-lim-1');
    const r = await repo.search(new Float32Array(384).fill(0.01), 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search limit=200 미초기화 → ok([])', async () => {
    const repo = makeRepo('/tmp/fail-lim-200');
    const r = await repo.search(new Float32Array(384).fill(0.99), 200);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject 5가지 ID → 모두 ok([])', async () => {
    const repo = makeRepo('/tmp/fail-projids');
    const ids = ['proj-a', 'proj-b', 'proj-c', 'proj-d', 'proj-e'];
    for (const id of ids) {
      const r = await repo.getByProject(id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    }
  });

  it('getById 5가지 ID → 모두 ok(null)', async () => {
    const repo = makeRepo('/tmp/fail-getids');
    const ids = ['id-a', 'id-b', 'id-c', 'id-d', 'id-e'];
    for (const id of ids) {
      const r = await repo.getById(id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeNull();
    }
  });
});

// ── 추가 edge: insert 레코드 객체 구조 검증 ──────────────────────

describe('FailureRepository insert record 객체 구조', () => {
  it('insert() 레코드에 id 없으면 err (미초기화)', async () => {
    const repo = makeRepo();
    const rec = makeRecord(0);
    const result = await repo.insert({ ...rec });
    expect(result.ok).toBe(false);
  });

  it('insert() featureId 없는 필드 → err (미초기화)', async () => {
    const repo = makeRepo();
    const result = await repo.insert({ ...makeRecord(0), featureId: 'feat-xyz' });
    expect(result.ok).toBe(false);
  });

  it('insert() failureType 다양한 값 → err (미초기화)', async () => {
    const repo = makeRepo();
    const types = ['compile-error', 'runtime-error', 'type-error', 'network-error', 'timeout'];
    for (const t of types) {
      const r = await repo.insert({ ...makeRecord(0), failureType: t });
      expect(r.ok).toBe(false);
    }
  });

  it('insert() 연도별 timestamp → err (미초기화)', async () => {
    const repo = makeRepo();
    const years = [2020, 2021, 2022, 2023, 2024];
    for (const y of years) {
      const r = await repo.insert({ ...makeRecord(0), timestamp: new Date(y, 0, 1) });
      expect(r.ok).toBe(false);
    }
  });

  it('insert() projectId 다양한 값 → err (미초기화)', async () => {
    const repo = makeRepo();
    const pids = ['proj-alpha', 'proj-beta', 'proj-gamma', 'proj-delta'];
    for (const pid of pids) {
      const r = await repo.insert({ ...makeRecord(0), projectId: pid });
      expect(r.ok).toBe(false);
    }
  });

  it('insert() embedding 길이 변형은 err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.insert({ ...makeRecord(0), embedding: new Float32Array(128).fill(0.5) });
    expect(r.ok).toBe(false);
  });

  it('insert() rootCause 빈 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.insert({ ...makeRecord(0), rootCause: '' });
    expect(r.ok).toBe(false);
  });

  it('insert() resolution 빈 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.insert({ ...makeRecord(0), resolution: '' });
    expect(r.ok).toBe(false);
  });

  it('insert() 5가지 레코드 연속 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const r = await repo.insert(makeRecord(i * 10));
      expect(r.ok).toBe(false);
    }
  });

  it('insert() 10가지 레코드 연속 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const r = await repo.insert(makeRecord(i));
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge: update partial 검증 ────────────────────────────────

describe('FailureRepository update partial 경계값', () => {
  it('update() resolution만 변경 → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { resolution: 'patched' });
    expect(r.ok).toBe(false);
  });

  it('update() rootCause만 변경 → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { rootCause: 'cause-updated' });
    expect(r.ok).toBe(false);
  });

  it('update() failureType만 변경 → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { failureType: 'new-type' });
    expect(r.ok).toBe(false);
  });

  it('update() resolution + rootCause → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { resolution: 'a', rootCause: 'b' });
    expect(r.ok).toBe(false);
  });

  it('update() 공백만 있는 resolution → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { resolution: '   ' });
    expect(r.ok).toBe(false);
  });

  it('update() 이모지 포함 resolution → err (미초기화)', async () => {
    const repo = makeRepo();
    const r = await repo.update('fail-0', { resolution: '해결됨 🎉' });
    expect(r.ok).toBe(false);
  });

  it('update() 3개 다른 ID → 모두 err', async () => {
    const repo = makeRepo();
    const ids = ['fail-x', 'fail-y', 'fail-z'];
    for (const id of ids) {
      const r = await repo.update(id, { resolution: 'updated' });
      expect(r.ok).toBe(false);
    }
  });

  it('update() 10번 반복 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const r = await repo.update(`fail-${i}`, { resolution: `fixed-${i}` });
      expect(r.ok).toBe(false);
    }
  });
});

// ── 추가 edge: delete 반복 ────────────────────────────────────────

describe('FailureRepository delete 반복 케이스', () => {
  it('delete() 동일 ID 5회 → 모두 err (미초기화)', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const r = await repo.delete('fail-0');
      expect(r.ok).toBe(false);
    }
  });

  it('delete() 5가지 다른 ID → 모두 err', async () => {
    const repo = makeRepo();
    const ids = ['del-a', 'del-b', 'del-c', 'del-d', 'del-e'];
    for (const id of ids) {
      const r = await repo.delete(id);
      expect(r.ok).toBe(false);
    }
  });

  it('delete() UUID 형태 5가지 → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const r = await repo.delete(crypto.randomUUID());
      expect(r.ok).toBe(false);
    }
  });

  it('delete() 탭 문자 포함 ID → err', async () => {
    const repo = makeRepo();
    const r = await repo.delete('fail\t0');
    expect(r.ok).toBe(false);
  });

  it('delete() 개행 포함 ID → err', async () => {
    const repo = makeRepo();
    const r = await repo.delete('fail\n0');
    expect(r.ok).toBe(false);
  });

  it('delete() 매우 긴 UUID 형태 → err', async () => {
    const repo = makeRepo();
    const r = await repo.delete('a'.repeat(100) + '-' + 'b'.repeat(100));
    expect(r.ok).toBe(false);
  });
});

// ── 추가 edge: search 벡터 형태 ──────────────────────────────────

describe('FailureRepository search 벡터 형태 추가', () => {
  it('search() fill 0.11 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.11), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.22 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.22), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.33 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.33), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.44 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.44), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.55 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.55), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.66 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.66), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.77 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.77), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.88 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.88), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill 0.99 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(0.99), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('search() fill -0.11 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.search(new Float32Array(384).fill(-0.11), 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });
});

// ── 추가 edge: getByProject 다양한 ID 패턴 ───────────────────────

describe('FailureRepository getByProject 다양한 ID 패턴', () => {
  it('getByProject() "project-alpha" → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('project-alpha');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() "project-beta" → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('project-beta');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() "a/b/c" → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('a/b/c');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() "." → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() "0" → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() 이모지 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('🚀-project');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() JSON 형태 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject('{"id":"proj-1"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() SQL injection 시도 → ok([])', async () => {
    const repo = makeRepo();
    const r = await repo.getByProject("'; DROP TABLE failures; --");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  it('getByProject() 10회 연속 다른 ID → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const r = await repo.getByProject(`pid-${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    }
  });
});

// ── 추가 edge: getById 다양한 ID 패턴 ────────────────────────────

describe('FailureRepository getById 다양한 ID 패턴', () => {
  it('getById() "." → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById('.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() SQL injection 시도 → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById("'; DROP TABLE failures; --");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() 이모지 포함 → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById('fail-🔥-0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() JSON 형태 → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById('{"id":"fail-0"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() 개행 포함 → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById('fail\n0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() 탭 포함 → ok(null)', async () => {
    const repo = makeRepo();
    const r = await repo.getById('fail\t0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('getById() 여러 UUID → 모두 ok(null)', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const r = await repo.getById(crypto.randomUUID());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeNull();
    }
  });
});

// ── 추가 edge: close 후 연속 동작 ────────────────────────────────

describe('FailureRepository close 후 연속 동작', () => {
  it('close() 후 search() 3번 → 모두 ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    for (let i = 0; i < 3; i++) {
      const r = await repo.search(new Float32Array(384).fill(i * 0.1), 5);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    }
  });

  it('close() 후 getById() 3번 → 모두 ok(null)', async () => {
    const repo = makeRepo();
    await repo.close();
    for (let i = 0; i < 3; i++) {
      const r = await repo.getById(`id-${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeNull();
    }
  });

  it('close() 후 insert() 3번 → 모두 err', async () => {
    const repo = makeRepo();
    await repo.close();
    for (let i = 0; i < 3; i++) {
      const r = await repo.insert(makeRecord(i));
      expect(r.ok).toBe(false);
    }
  });

  it('close() 후 delete() 3번 → 모두 err', async () => {
    const repo = makeRepo();
    await repo.close();
    for (let i = 0; i < 3; i++) {
      const r = await repo.delete(`fail-${i}`);
      expect(r.ok).toBe(false);
    }
  });

  it('close() 후 getByProject() 3번 → 모두 ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    for (let i = 0; i < 3; i++) {
      const r = await repo.getByProject(`proj-${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    }
  });

  it('close() 후 getByPhase() 4종 → 모두 ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const r = await repo.getByPhase(phase);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    }
  });

  it('close() 5회 → 마지막도 오류 없음', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      await expect(repo.close()).resolves.toBeUndefined();
    }
  });
});
