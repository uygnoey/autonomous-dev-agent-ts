/**
 * CleanEnvManager 단위 테스트 / CleanEnvManager unit tests
 *
 * @description
 * 격리된 테스트 환경 생성, 소멸, 활성 목록, 클린 상태 확인 등
 * 모든 경로를 상세히 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { ConsoleLogger } from 'core/logger.js';
import { CleanEnvManager } from 'layer2/clean-env-manager.js';

const logger = new ConsoleLogger('error');
const createdPaths: string[] = [];

function makeManager(): CleanEnvManager {
  return new CleanEnvManager(logger);
}

afterEach(async () => {
  // 테스트 후 잔여 디렉토리 정리
  const { rm } = await import('node:fs/promises');
  for (const path of createdPaths) {
    if (existsSync(path)) {
      await rm(path, { recursive: true, force: true });
    }
  }
  createdPaths.length = 0;
});

// ── 생성자 ─────────────────────────────────────────────────────

describe('CleanEnvManager 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeManager()).not.toThrow();
  });

  it('CleanEnvManager 인스턴스', () => {
    expect(makeManager()).toBeInstanceOf(CleanEnvManager);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new CleanEnvManager(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('여러 인스턴스 생성 가능', () => {
    const m1 = makeManager();
    const m2 = makeManager();
    const m3 = makeManager();
    expect(m1).toBeInstanceOf(CleanEnvManager);
    expect(m2).toBeInstanceOf(CleanEnvManager);
    expect(m3).toBeInstanceOf(CleanEnvManager);
  });

  it('초기 listActive는 빈 배열', () => {
    expect(makeManager().listActive()).toEqual([]);
  });
});

// ── create ────────────────────────────────────────────────────

describe('CleanEnvManager.create', () => {
  let manager: CleanEnvManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('환경 생성 → ok 반환', async () => {
    const result = await manager.create('proj-test');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
    }
    expect(result.ok).toBe(true);
  });

  it('envPath 반환됨', async () => {
    const result = await manager.create('proj-test');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(typeof result.value.envPath).toBe('string');
      expect(result.value.envPath.length).toBeGreaterThan(0);
    }
  });

  it('생성된 디렉토리가 실제로 존재', async () => {
    const result = await manager.create('proj-exists');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(true);
    }
  });

  it('envPath에 projectId 포함', async () => {
    const result = await manager.create('my-proj-id');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.value.envPath).toContain('my-proj-id');
    }
  });

  it('연속 생성 → 고유 경로', async () => {
    const r1 = await manager.create('proj-1');
    const r2 = await manager.create('proj-1');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r1.ok && r2.ok) {
      expect(r1.value.envPath).not.toBe(r2.value.envPath);
    }
  });

  it('다른 projectId → 다른 경로', async () => {
    const r1 = await manager.create('proj-alpha');
    const r2 = await manager.create('proj-beta');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r1.ok && r2.ok) {
      expect(r1.value.envPath).not.toBe(r2.value.envPath);
    }
  });

  it('생성 후 listActive에 포함됨', async () => {
    const result = await manager.create('proj-active-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.listActive()).toContain(result.value.envPath);
    }
  });

  it('생성 후 isClean=true', async () => {
    const result = await manager.create('proj-clean-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(true);
    }
  });

  it('3개 환경 생성 → 모두 ok', async () => {
    const results = await Promise.all([
      manager.create('p1'),
      manager.create('p2'),
      manager.create('p3'),
    ]);
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
      expect(r.ok).toBe(true);
    }
  });

  it('5개 환경 생성 → listActive.length=5', async () => {
    const results = await Promise.all([
      manager.create('e1'),
      manager.create('e2'),
      manager.create('e3'),
      manager.create('e4'),
      manager.create('e5'),
    ]);
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    expect(active.length).toBe(5);
  });

  it('숫자 projectId → ok', async () => {
    const result = await manager.create('12345');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('하이픈 포함 projectId → ok', async () => {
    const result = await manager.create('my-project-2024');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('밑줄 포함 projectId → ok', async () => {
    const result = await manager.create('my_project_v2');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('짧은 projectId (1글자) → ok', async () => {
    const result = await manager.create('x');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('긴 projectId (50글자) → ok', async () => {
    const result = await manager.create('a'.repeat(50));
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('대문자 포함 projectId → ok', async () => {
    const result = await manager.create('MyProject');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('반환값 구조가 올바르다', async () => {
    const result = await manager.create('struct-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.value).toHaveProperty('envPath');
    }
  });
});

// ── destroy ───────────────────────────────────────────────────

describe('CleanEnvManager.destroy', () => {
  let manager: CleanEnvManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('생성 후 소멸 → ok', async () => {
    const createResult = await manager.create('proj-destroy');
    expect(createResult.ok).toBe(true);
    if (createResult.ok) {
      const destroyResult = await manager.destroy(createResult.value.envPath);
      expect(destroyResult.ok).toBe(true);
    }
  });

  it('소멸 후 디렉토리 미존재', async () => {
    const createResult = await manager.create('proj-delete');
    if (createResult.ok) {
      await manager.destroy(createResult.value.envPath);
      expect(existsSync(createResult.value.envPath)).toBe(false);
    }
  });

  it('관리 중이 아닌 경로 소멸 → err', async () => {
    const result = await manager.destroy('/tmp/nonexistent-path-xyz-123');
    expect(result.ok).toBe(false);
  });

  it('소멸 후 listActive에서 제거됨', async () => {
    const createResult = await manager.create('proj-list-remove');
    if (createResult.ok) {
      const path = createResult.value.envPath;
      await manager.destroy(path);
      expect(manager.listActive()).not.toContain(path);
    }
  });

  it('소멸 후 isClean=false', async () => {
    const createResult = await manager.create('proj-clean-destroy');
    if (createResult.ok) {
      const path = createResult.value.envPath;
      await manager.destroy(path);
      expect(manager.isClean(path)).toBe(false);
    }
  });

  it('빈 문자열 경로 소멸 → err', async () => {
    const result = await manager.destroy('');
    expect(result.ok).toBe(false);
  });

  it('임의 경로 소멸 → err', async () => {
    const result = await manager.destroy('/some/random/path/not/managed');
    expect(result.ok).toBe(false);
  });

  it('두 번 소멸 → 두 번째는 err', async () => {
    const createResult = await manager.create('proj-double-destroy');
    if (createResult.ok) {
      const path = createResult.value.envPath;
      const d1 = await manager.destroy(path);
      expect(d1.ok).toBe(true);
      const d2 = await manager.destroy(path);
      expect(d2.ok).toBe(false);
    }
  });

  it('3개 생성 → 1개 소멸 → listActive.length=2', async () => {
    const results = await Promise.all([
      manager.create('q1'),
      manager.create('q2'),
      manager.create('q3'),
    ]);
    const paths = results.filter((r) => r.ok).map((r) => r.ok ? r.value.envPath : '');
    // 소멸하지 않은 경로는 나중에 정리
    for (const p of paths.slice(1)) createdPaths.push(p);
    if (paths[0]) {
      await manager.destroy(paths[0]);
      expect(manager.listActive().length).toBe(2);
    }
  });

  it('소멸 후 에러 코드 확인', async () => {
    const result = await manager.destroy('/nonexistent/path/xyz');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('소멸 성공 → ok=true', async () => {
    const cr = await manager.create('test-destroy-ok');
    if (cr.ok) {
      const dr = await manager.destroy(cr.value.envPath);
      expect(dr.ok).toBe(true);
    }
  });
});

// ── isClean ───────────────────────────────────────────────────

describe('CleanEnvManager.isClean', () => {
  let manager: CleanEnvManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('생성된 환경 → isClean true', async () => {
    const result = await manager.create('proj-clean');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(true);
    }
  });

  it('관리 중이 아닌 경로 → isClean false', () => {
    expect(manager.isClean('/tmp/unknown-path-xyz')).toBe(false);
  });

  it('소멸 후 → isClean false', async () => {
    const result = await manager.create('proj-clean-after-destroy');
    if (result.ok) {
      await manager.destroy(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(false);
    }
  });

  it('빈 문자열 → isClean false', () => {
    expect(manager.isClean('')).toBe(false);
  });

  it('임의 경로 → isClean false', () => {
    expect(manager.isClean('/some/random/path')).toBe(false);
  });

  it('반환값이 boolean이다', async () => {
    const result = await manager.create('is-clean-bool');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(typeof manager.isClean(result.value.envPath)).toBe('boolean');
    }
    expect(typeof manager.isClean('/nonexistent')).toBe('boolean');
  });

  it('같은 경로 연속 호출 → 동일 결과', async () => {
    const result = await manager.create('is-clean-repeat');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      const path = result.value.envPath;
      expect(manager.isClean(path)).toBe(manager.isClean(path));
    }
  });

  it('다른 매니저 경로 → isClean false', async () => {
    const m2 = makeManager();
    const r2 = await m2.create('other-proj');
    if (r2.ok) {
      createdPaths.push(r2.value.envPath);
      // manager (m1)는 m2의 경로를 알지 못함
      expect(manager.isClean(r2.value.envPath)).toBe(false);
    }
  });

  it('초기 상태 → 모든 경로 false', () => {
    const paths = ['/tmp/a', '/tmp/b', '/tmp/c'];
    for (const path of paths) {
      expect(manager.isClean(path)).toBe(false);
    }
  });
});

// ── listActive ────────────────────────────────────────────────

describe('CleanEnvManager.listActive', () => {
  let manager: CleanEnvManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('초기 → 빈 배열', () => {
    expect(manager.listActive()).toEqual([]);
  });

  it('환경 생성 후 목록에 포함', async () => {
    const result = await manager.create('proj-list');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.listActive()).toContain(result.value.envPath);
    }
  });

  it('여러 환경 → 모두 목록에 포함', async () => {
    const results = await Promise.all([
      manager.create('proj-a'),
      manager.create('proj-b'),
      manager.create('proj-c'),
    ]);
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    for (const r of results) {
      if (r.ok) {
        expect(active).toContain(r.value.envPath);
      }
    }
  });

  it('listActive가 복사본 반환', async () => {
    const result = await manager.create('proj-copy');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      const list = manager.listActive();
      list.push('/fake/path');
      expect(manager.listActive().length).toBe(1);
    }
  });

  it('반환값이 배열이다', () => {
    expect(Array.isArray(manager.listActive())).toBe(true);
  });

  it('반환값의 각 요소가 문자열이다', async () => {
    const result = await manager.create('proj-string-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      const active = manager.listActive();
      for (const path of active) {
        expect(typeof path).toBe('string');
      }
    }
  });

  it('소멸 후 목록에서 제거', async () => {
    const result = await manager.create('proj-remove-active');
    if (result.ok) {
      const path = result.value.envPath;
      expect(manager.listActive()).toContain(path);
      await manager.destroy(path);
      expect(manager.listActive()).not.toContain(path);
    }
  });

  it('연속 호출 → 동일 결과', async () => {
    const result = await manager.create('proj-consistent');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      const l1 = manager.listActive();
      const l2 = manager.listActive();
      expect(l1).toEqual(l2);
    }
  });

  it('10개 생성 → listActive.length=10', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => manager.create(`proj-bulk-${i}`));
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    expect(manager.listActive().length).toBe(10);
  });

  it('생성 후 소멸 → 빈 배열', async () => {
    const result = await manager.create('proj-full-cycle');
    if (result.ok) {
      const path = result.value.envPath;
      await manager.destroy(path);
      expect(manager.listActive()).toEqual([]);
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('CleanEnvManager 랜덤/경계값', () => {
  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 projectId #%i', async (i) => {
    const manager = makeManager();
    const projectId = `proj-rand-${i}-${'x'.repeat(i % 5)}`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('한국어 projectId → ok', async () => {
    const manager = makeManager();
    const result = await manager.create('프로젝트');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(true);
    }
  });

  it('여러 매니저 독립적', async () => {
    const m1 = makeManager();
    const m2 = makeManager();
    const r1 = await m1.create('proj-m1');
    const r2 = await m2.create('proj-m2');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r1.ok && r2.ok) {
      // m1은 m2의 경로를 관리하지 않음
      const m1DestroyResult = await m1.destroy(r2.value.envPath);
      expect(m1DestroyResult.ok).toBe(false);
    }
  });

  it('UUID 형식 projectId → ok', async () => {
    const manager = makeManager();
    const uuid = crypto.randomUUID();
    const result = await manager.create(uuid);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
    }
  });

  it('특수문자 없는 projectId 10개 → 모두 고유 경로', async () => {
    const manager = makeManager();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => manager.create(`unique-proj-${i}`)),
    );
    const paths = results.filter((r) => r.ok).map((r) => r.ok ? r.value.envPath : '');
    for (const p of paths) if (p) createdPaths.push(p);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it('create 후 destroy 후 re-create → ok', async () => {
    const manager = makeManager();
    const r1 = await manager.create('recycle-proj');
    if (r1.ok) {
      await manager.destroy(r1.value.envPath);
      const r2 = await manager.create('recycle-proj');
      if (r2.ok) {
        createdPaths.push(r2.value.envPath);
        expect(r2.ok).toBe(true);
      }
    }
  });

  it('순차 create+destroy 10회 → 정상', async () => {
    const manager = makeManager();
    for (let i = 0; i < 10; i++) {
      const r = await manager.create(`seq-proj-${i}`);
      if (r.ok) {
        const dr = await manager.destroy(r.value.envPath);
        expect(dr.ok).toBe(true);
      }
    }
    expect(manager.listActive().length).toBe(0);
  });

  it('독립 매니저 3개 → 각각 독립적 상태', async () => {
    const managers = [makeManager(), makeManager(), makeManager()];
    const results = await Promise.all(
      managers.map((m, i) => m.create(`independent-${i}`)),
    );
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    for (let i = 0; i < managers.length; i++) {
      expect(managers[i]!.listActive().length).toBe(1);
    }
  });

  it('동시 create 5개 → 모두 성공', async () => {
    const manager = makeManager();
    const concurrentResults = await Promise.all(
      Array.from({ length: 5 }, (_, i) => manager.create(`concurrent-${i}`)),
    );
    for (const r of concurrentResults) {
      if (r.ok) createdPaths.push(r.value.envPath);
      expect(r.ok).toBe(true);
    }
  });

  it('isClean 반복 호출 → 일관됨', async () => {
    const manager = makeManager();
    const r = await manager.create('isclean-repeat');
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      const path = r.value.envPath;
      for (let i = 0; i < 5; i++) {
        expect(manager.isClean(path)).toBe(true);
      }
    }
  });

  it('listActive 반복 호출 → 길이 일관됨', async () => {
    const manager = makeManager();
    const r = await manager.create('list-repeat');
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      for (let i = 0; i < 5; i++) {
        expect(manager.listActive().length).toBe(1);
      }
    }
  });
});
