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
