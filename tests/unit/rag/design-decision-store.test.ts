/**
 * DesignDecisionRepository 단위 테스트 / DesignDecisionRepository unit tests
 *
 * @description
 * 초기화 전 동작, insert/update/delete 오류, search/getById 빈 결과,
 * getByProject/getByFeature 조회, 다양한 경계값을 검증한다.
 *
 * NOTE: LanceDB 초기화가 느리므로 초기화 없이 호출하는 케이스에 집중한다.
 * 설계: 읽기 메서드(search/getById/getByProject/getByFeature)는 table=null 시 빈 결과 반환 (ok).
 *       쓰기 메서드(insert/update/delete)는 db/table=null 시 err 반환.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { DesignDecisionRepository } from 'rag/design-decision-store.js';

const logger = new ConsoleLogger('error');

function makeRepo(dbPath = '/tmp/adev-test-design-decisions'): DesignDecisionRepository {
  return new DesignDecisionRepository(dbPath, logger);
}

function makeRecord(i = 0) {
  return {
    id: `dd-${i}`,
    projectId: `proj-${i % 3}`,
    featureId: `feat-${i}`,
    decision: `decision-${i}`,
    rationale: `rationale-${i}`,
    alternatives: [`alt-a-${i}`, `alt-b-${i}`],
    decidedBy: ['architect', 'reviewer'],
    embedding: new Float32Array(384).fill(i * 0.001),
    timestamp: new Date(),
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('DesignDecisionRepository 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeRepo()).not.toThrow();
  });

  it('DesignDecisionRepository 인스턴스', () => {
    expect(makeRepo()).toBeInstanceOf(DesignDecisionRepository);
  });

  it('다양한 dbPath → 인스턴스 생성', () => {
    const paths = ['/tmp/db1', '/tmp/db2', '/tmp/dir/nested/db'];
    for (const path of paths) {
      expect(() => makeRepo(path)).not.toThrow();
    }
  });

  it('빈 dbPath → 인스턴스 생성 (초기화 시 실패 예상)', () => {
    expect(() => makeRepo('')).not.toThrow();
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const r1 = makeRepo('/tmp/dd-a');
    const r2 = makeRepo('/tmp/dd-b');
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

  it('getByFeature 메서드 존재', () => {
    expect(typeof makeRepo().getByFeature).toBe('function');
  });

  it('close 메서드 존재', () => {
    expect(typeof makeRepo().close).toBe('function');
  });

  it('10개 인스턴스 생성 → 오류 없음', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeRepo(`/tmp/dd-10-${i}`)).not.toThrow();
    }
  });
});

// ── 쓰기 연산 미초기화 오류 ────────────────────────────────────

describe('DesignDecisionRepository 쓰기 연산 미초기화 오류', () => {
  it('insert() 미초기화 → err 반환', async () => {
    const repo = makeRepo();
    const result = await repo.insert(makeRecord(1));
    expect(result.ok).toBe(false);
  });

  it('update() 미초기화 → err 반환', async () => {
    const repo = makeRepo();
    const result = await repo.update('some-id', { decision: 'updated' });
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
    const result = await repo.update('dd-0', { rationale: 'updated rationale' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/초기화|initialize|테이블/i);
    }
  });

  it('delete() 오류 메시지에 테이블 관련 내용 포함', async () => {
    const repo = makeRepo();
    const result = await repo.delete('dd-0');
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
    const result = await repo.update('dd-0', { decision: 'x' });
    expect(typeof result.ok).toBe('boolean');
  });

  it('delete() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.delete('dd-0');
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
    const result = await repo.update('dd-0', { decision: 'x' });
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('delete() error.code는 string 타입', async () => {
    const repo = makeRepo();
    const result = await repo.delete('dd-0');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('insert() 5회 반복 모두 err', async () => {
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
    const result = await repo.update('dd-0', {});
    expect(result.ok).toBe(false);
  });

  it('update() 긴 ID → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('x'.repeat(1000), { decision: 'x' });
    expect(result.ok).toBe(false);
  });

  it('delete() 긴 ID → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('x'.repeat(1000));
    expect(result.ok).toBe(false);
  });

  it('10개 다른 레코드 insert() → 모두 err', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.insert(makeRecord(i));
      expect(result.ok).toBe(false);
    }
  });
});

// ── 읽기 연산 미초기화 동작 (빈 결과) ─────────────────────────

describe('DesignDecisionRepository 읽기 연산 미초기화 동작', () => {
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

  it('getByFeature() 미초기화 → ok([]) 빈 배열', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('여러 search 호출 → 모두 ok([])', async () => {
    const repo = makeRepo();
    const queries = [0.1, 0.2, 0.3, 0.4, 0.5];
    for (const q of queries) {
      const result = await repo.search(new Float32Array(384).fill(q), 10);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    }
  });

  it('여러 getByProject 호출 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.getByProject(`proj-${i}`);
      expect(result.ok).toBe(true);
    }
  });

  it('여러 getByFeature 호출 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.getByFeature(`feat-${i}`);
      expect(result.ok).toBe(true);
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

  it('getByProject() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('proj-1');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getByFeature() ok는 boolean 타입', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat-1');
    expect(typeof result.ok).toBe('boolean');
  });

  it('search() value는 배열', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 5);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('search() limit=1 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.5), 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('search() zero vector → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0), 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('search() one vector → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(1.0), 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
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

  it('getByFeature() 빈 featureId → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('getByProject() 한국어 ID → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('프로젝트-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('getByFeature() 특수문자 ID → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat!@#$%');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('search() 10회 연속 → 모두 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.search(new Float32Array(384).fill(i * 0.1), 5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    }
  });

  it('getById() 10회 연속 다른 ID → 모두 ok(null)', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 10; i++) {
      const result = await repo.getById(`id-${i}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    }
  });
});

// ── close() 동작 ───────────────────────────────────────────────

describe('DesignDecisionRepository close()', () => {
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
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
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
    const result = await repo.update('dd-0', { decision: 'updated' });
    expect(result.ok).toBe(false);
  });

  it('close() 후 delete() → err (table=null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.delete('dd-0');
    expect(result.ok).toBe(false);
  });

  it('close() 후 getById() → ok(null)', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getById('some-id');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('close() 후 getByProject() → ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getByProject('proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('close() 후 getByFeature() → ok([])', async () => {
    const repo = makeRepo();
    await repo.close();
    const result = await repo.getByFeature('feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('close() 3회 반복 → 오류 없음', async () => {
    const repo = makeRepo();
    await repo.close();
    await repo.close();
    await expect(repo.close()).resolves.toBeUndefined();
  });
});

// ── 다양한 설정으로 생성 ───────────────────────────────────────

describe('DesignDecisionRepository 다양한 설정', () => {
  it('dbPath /tmp/dd-v1 → 생성됨', () => {
    const repo = makeRepo('/tmp/dd-v1');
    expect(repo).toBeInstanceOf(DesignDecisionRepository);
  });

  it('dbPath /tmp/dd-v2 → 생성됨', () => {
    const repo = makeRepo('/tmp/dd-v2');
    expect(repo).toBeInstanceOf(DesignDecisionRepository);
  });

  it('dbPath /tmp/nested/path/db → 생성됨', () => {
    const repo = makeRepo('/tmp/nested/path/db');
    expect(repo).toBeInstanceOf(DesignDecisionRepository);
  });

  it('dbPath 한국어 경로 → 생성됨 (초기화 시 실패 가능)', () => {
    expect(() => makeRepo('/tmp/한국어-경로')).not.toThrow();
  });

  it('dbPath UUID 스타일 → 생성됨', () => {
    const path = '/tmp/dd-a1b2c3d4-e5f6-7890-abcd';
    expect(() => makeRepo(path)).not.toThrow();
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('DesignDecisionRepository 랜덤/경계값', () => {
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

  it('랜덤 search 미초기화 #5', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(5 * 0.01), 6);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('랜덤 getById 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.getById('decision-0');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('랜덤 getById 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.getById('decision-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('랜덤 getById 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.getById('decision-2');
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

  it('랜덤 getByFeature 미초기화 #0', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat-0');
    expect(result.ok).toBe(true);
  });

  it('랜덤 getByFeature 미초기화 #1', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat-1');
    expect(result.ok).toBe(true);
  });

  it('랜덤 getByFeature 미초기화 #2', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('feat-2');
    expect(result.ok).toBe(true);
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

  it('여러 DesignDecisionRepository 인스턴스 독립적', async () => {
    const r1 = makeRepo('/tmp/dd-r1');
    const r2 = makeRepo('/tmp/dd-r2');
    const res1 = await r1.search(new Float32Array(384).fill(0.1), 5);
    const res2 = await r2.search(new Float32Array(384).fill(0.2), 5);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
  });

  it('getById() UUID 형태 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getByProject() UUID 형태 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit=100 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.3), 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByProject() 긴 ID → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('x'.repeat(500));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('DesignDecisionRepository 복합 시나리오', () => {
  it('읽기 여러 메서드 → 모두 ok (미초기화)', async () => {
    const repo = makeRepo();
    const searchResult = await repo.search(new Float32Array(384).fill(0.1), 5);
    const getByIdResult = await repo.getById('test-id');
    const getByProjectResult = await repo.getByProject('proj-1');
    const getByFeatureResult = await repo.getByFeature('feat-1');

    expect(searchResult.ok).toBe(true);
    expect(getByIdResult.ok).toBe(true);
    expect(getByProjectResult.ok).toBe(true);
    expect(getByFeatureResult.ok).toBe(true);
  });

  it('쓰기 여러 메서드 → 모두 err (미초기화)', async () => {
    const repo = makeRepo();
    const insertResult = await repo.insert(makeRecord(0));
    const updateResult = await repo.update('dd-0', { decision: 'x' });
    const deleteResult = await repo.delete('dd-0');

    expect(insertResult.ok).toBe(false);
    expect(updateResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
  });

  it('100개 인스턴스 생성 → 성능 문제 없음', () => {
    const repos = Array.from({ length: 100 }, (_, i) => makeRepo(`/tmp/dd-perf-${i}`));
    expect(repos.length).toBe(100);
    for (const repo of repos) {
      expect(repo).toBeInstanceOf(DesignDecisionRepository);
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
    expect(searchResult.ok).toBe(true);
    expect(getByIdResult.ok).toBe(true);
  });

  it('close() 후 쓰기 연산 → 모두 err', async () => {
    const repo = makeRepo();
    await repo.close();
    const insertResult = await repo.insert(makeRecord(0));
    const deleteResult = await repo.delete('dd-0');
    expect(insertResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
  });

  it('5개 독립 인스턴스 각각 search → 모두 ok', async () => {
    const repos = Array.from({ length: 5 }, (_, i) => makeRepo(`/tmp/dd-ind-${i}`));
    for (const repo of repos) {
      const result = await repo.search(new Float32Array(384).fill(0.1), 5);
      expect(result.ok).toBe(true);
    }
  });

  it('동일 인스턴스 search 5회 → 모두 동일한 ok([])', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      const result = await repo.search(new Float32Array(384).fill(0.1), 5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    }
  });
});

// ── 추가 edge/random 케이스 ─────────────────────────────────────

describe('DesignDecisionRepository 추가 edge — insert 필드 다양성', () => {
  it('insert() decision 빈 문자열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), decision: '' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() rationale 한글 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), rationale: '한글 근거입니다' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() alternatives 빈 배열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), alternatives: [] };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() alternatives 특수문자 요소 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), alternatives: ['!@#$%', '&*()'] };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() decidedBy 빈 배열 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), decidedBy: [] };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() embedding 음수 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), embedding: new Float32Array(384).fill(-0.5) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() embedding Infinity → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), embedding: new Float32Array(384).fill(Number.POSITIVE_INFINITY) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() id UUID 형식 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() id 한글 → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), id: '한글-아이디' };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });

  it('insert() timestamp 과거 Date → err (미초기화)', async () => {
    const repo = makeRepo();
    const record = { ...makeRecord(0), timestamp: new Date(0) };
    const result = await repo.insert(record);
    expect(result.ok).toBe(false);
  });
});

describe('DesignDecisionRepository 추가 edge — update 필드 다양성', () => {
  it('update() decision 한글 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('dd-0', { decision: '한글 결정' });
    expect(result.ok).toBe(false);
  });

  it('update() rationale 빈 문자열 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('dd-0', { rationale: '' });
    expect(result.ok).toBe(false);
  });

  it('update() rationale 매우 긴 문자열 → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('dd-0', { rationale: 'x'.repeat(5000) });
    expect(result.ok).toBe(false);
  });

  it('update() 빈 id UUID → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('a1b2c3d4-e5f6-7890-abcd-ef1234567890', { decision: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 한글 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('한글-결정-아이디', { decision: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 특수문자 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('!@#$%', { decision: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 숫자 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('123456789', { decision: 'x' });
    expect(result.ok).toBe(false);
  });

  it('update() 공백 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.update('   ', { decision: 'x' });
    expect(result.ok).toBe(false);
  });
});

describe('DesignDecisionRepository 추가 edge — delete 다양성', () => {
  it('delete() UUID id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(false);
  });

  it('delete() 한글 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('한글-삭제-아이디');
    expect(result.ok).toBe(false);
  });

  it('delete() 특수문자 id → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('!@#$%^&*()');
    expect(result.ok).toBe(false);
  });

  it('delete() 숫자만 → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('9876543210');
    expect(result.ok).toBe(false);
  });

  it('delete() 공백 → err', async () => {
    const repo = makeRepo();
    const result = await repo.delete('   ');
    expect(result.ok).toBe(false);
  });
});

describe('DesignDecisionRepository 추가 edge — search 벡터 다양성', () => {
  it('search() NaN vector → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(Number.NaN), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() 음수 fill → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(-0.5), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() 최소값 fill → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(-Number.MAX_VALUE), 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit 0 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.1), 0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() limit 500 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.search(new Float32Array(384).fill(0.5), 500);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('search() 5종 fill → 모두 ok', async () => {
    const repo = makeRepo();
    const fills = [0.1, 0.3, 0.5, 0.7, 0.9];
    for (const f of fills) {
      const result = await repo.search(new Float32Array(384).fill(f), 3);
      expect(result.ok).toBe(true);
    }
  });
});

describe('DesignDecisionRepository 추가 edge — getByProject/getByFeature 다양성', () => {
  it('getByProject() 숫자 문자열 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('12345');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByProject() 특수문자 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('!@#$%^&*');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByProject() 공백만 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByProject('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByFeature() UUID 형식 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByFeature() 한글 → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('한글-기능-아이디');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getByFeature() 긴 ID → ok([])', async () => {
    const repo = makeRepo();
    const result = await repo.getByFeature('x'.repeat(500));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('getById() 특수문자 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('!@#$%^');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getById() 한글 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('한글-결정-조회');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getById() 숫자만 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('9876543210');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('getById() 공백 → ok(null)', async () => {
    const repo = makeRepo();
    const result = await repo.getById('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
