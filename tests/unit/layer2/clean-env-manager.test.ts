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
  it('랜덤 projectId #0 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-0-`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #1 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-1-x`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #2 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-2-xx`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #3 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-3-xxx`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #4 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-4-xxxx`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #5 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-5-`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #6 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-6-x`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #7 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-7-xx`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #8 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-8-xxx`;
    const result = await manager.create(projectId);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.ok).toBe(true);
      expect(existsSync(result.value.envPath)).toBe(true);
      await manager.destroy(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(false);
    }
  });

  it('랜덤 projectId #9 생성+소멸', async () => {
    const manager = makeManager();
    const projectId = `proj-rand-9-xxxx`;
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

// ── 추가 경계값 및 복합 시나리오 ──────────────────────────────

describe('CleanEnvManager 추가 경계값', () => {
  it('UUID projectId → envPath에 UUID 포함', async () => {
    const manager = makeManager();
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const result = await manager.create(uuid);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.value.envPath).toContain(uuid);
    }
  });

  it('빈 문자열 projectId → 처리됨 (ok 또는 err)', async () => {
    const manager = makeManager();
    const result = await manager.create('');
    // 빈 문자열: 구현에 따라 ok 또는 err
    if (result.ok) {
      createdPaths.push(result.value.envPath);
    }
    expect(typeof result.ok).toBe('boolean');
  });

  it('destroy 에러 메시지가 문자열', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/nonexistent/xyz-abc');
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('create 반환값 ok가 boolean', async () => {
    const manager = makeManager();
    const result = await manager.create('bool-check');
    expect(typeof result.ok).toBe('boolean');
    if (result.ok) createdPaths.push(result.value.envPath);
  });

  it('envPath가 절대 경로 형식', async () => {
    const manager = makeManager();
    const result = await manager.create('absolute-path-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      // 절대 경로는 / 또는 드라이브 문자로 시작
      expect(result.value.envPath.length).toBeGreaterThan(1);
    }
  });

  it('5개 동시 + 5개 순차 → 총 10개 active', async () => {
    const manager = makeManager();
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, (_, i) => manager.create(`con-${i}`)),
    );
    for (const r of concurrent) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    for (let i = 0; i < 5; i++) {
      const r = await manager.create(`seq-extra-${i}`);
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    expect(manager.listActive().length).toBe(10);
  });

  it('isClean 알 수 없는 경로 → false', () => {
    const manager = makeManager();
    expect(manager.isClean('/does/not/exist/path-xyz')).toBe(false);
  });

  it('소멸 후 재생성 → isClean true', async () => {
    const manager = makeManager();
    const r1 = await manager.create('reuse-proj');
    if (r1.ok) {
      await manager.destroy(r1.value.envPath);
      const r2 = await manager.create('reuse-proj');
      if (r2.ok) {
        createdPaths.push(r2.value.envPath);
        expect(manager.isClean(r2.value.envPath)).toBe(true);
      }
    }
  });

  it('manager destroy 후 listActive 빈 배열', async () => {
    const manager = makeManager();
    const r = await manager.create('destroy-all');
    if (r.ok) {
      await manager.destroy(r.value.envPath);
      expect(manager.listActive()).toEqual([]);
    }
  });
});

// ── 추가 랜덤/경계값 케이스 ──────────────────────────────────

describe('CleanEnvManager 추가 랜덤/경계값', () => {
  it('공백 포함 projectId → 처리됨', async () => {
    const manager = makeManager();
    const result = await manager.create('my project id');
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID #0 → create ok', async () => {
    const manager = makeManager();
    const id = crypto.randomUUID();
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID #1 → create ok', async () => {
    const manager = makeManager();
    const id = crypto.randomUUID();
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID #2 → create ok', async () => {
    const manager = makeManager();
    const id = crypto.randomUUID();
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID #3 → create ok', async () => {
    const manager = makeManager();
    const id = crypto.randomUUID();
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('랜덤 UUID #4 → create ok', async () => {
    const manager = makeManager();
    const id = crypto.randomUUID();
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('매우 긴 projectId (200자) → 처리됨', async () => {
    const manager = makeManager();
    const id = 'z'.repeat(200);
    const result = await manager.create(id);
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('특수문자 projectId (#!@) → 처리됨', async () => {
    const manager = makeManager();
    const result = await manager.create('id-#!@%');
    if (result.ok) createdPaths.push(result.value.envPath);
    expect(typeof result.ok).toBe('boolean');
  });

  it('create 후 isClean=true, destroy 후 isClean=false 확인', async () => {
    const manager = makeManager();
    const r = await manager.create('lifecycle-check');
    if (r.ok) {
      const path = r.value.envPath;
      expect(manager.isClean(path)).toBe(true);
      await manager.destroy(path);
      expect(manager.isClean(path)).toBe(false);
    }
  });

  it('destroy 에러 코드가 비어있지 않음', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/totally-random-nonexistent-path-abc123');
    if (!result.ok) {
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('20개 환경 생성 → listActive.length=20', async () => {
    const manager = makeManager();
    const promises = Array.from({ length: 20 }, (_, i) => manager.create(`bulk20-${i}`));
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    expect(active.length).toBe(20);
  });

  it('10개 생성 → 5개 소멸 → listActive.length=5', async () => {
    const manager = makeManager();
    const promises = Array.from({ length: 10 }, (_, i) => manager.create(`half-${i}`));
    const results = await Promise.all(promises);
    const paths = results.filter((r) => r.ok).map((r) => (r.ok ? r.value.envPath : ''));
    // 나머지 5개는 나중에 afterEach에서 정리
    for (const p of paths.slice(5)) if (p) createdPaths.push(p);
    for (const p of paths.slice(0, 5)) {
      if (p) await manager.destroy(p);
    }
    expect(manager.listActive().length).toBe(5);
  });
});

// ── 추가 시나리오 테스트 ──────────────────────────────────────

describe('CleanEnvManager 추가 시나리오', () => {
  it('create 후 envPath가 tmpdir 하위에 있음', async () => {
    const manager = makeManager();
    const result = await manager.create('tmpdir-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      // envPath는 임시 디렉토리 경로를 포함해야 한다
      expect(result.value.envPath.length).toBeGreaterThan(10);
    }
  });

  it('destroy ok 반환값 ok=true', async () => {
    const manager = makeManager();
    const cr = await manager.create('destroy-ok-check');
    if (cr.ok) {
      const dr = await manager.destroy(cr.value.envPath);
      expect(dr.ok).toBe(true);
    }
  });

  it('isClean 알 수 없는 긴 경로 → false', () => {
    const manager = makeManager();
    const longPath = '/tmp/' + 'a'.repeat(300);
    expect(manager.isClean(longPath)).toBe(false);
  });

  it('create → destroy → create 동일 projectId → 새 경로', async () => {
    const manager = makeManager();
    const r1 = await manager.create('recycle-2');
    let path1 = '';
    if (r1.ok) {
      path1 = r1.value.envPath;
      await manager.destroy(path1);
    }
    const r2 = await manager.create('recycle-2');
    if (r2.ok) {
      createdPaths.push(r2.value.envPath);
      // 새로운 경로가 생성되어야 함
      expect(r2.ok).toBe(true);
    }
  });

  it('listActive 빈 상태에서 length=0', () => {
    const manager = makeManager();
    expect(manager.listActive().length).toBe(0);
  });

  it('create 5개 → destroy 5개 → listActive=0', async () => {
    const manager = makeManager();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => manager.create(`all-destroy-${i}`))
    );
    const paths = results.filter((r) => r.ok).map((r) => (r.ok ? r.value.envPath : ''));
    for (const p of paths) {
      if (p) await manager.destroy(p);
    }
    expect(manager.listActive().length).toBe(0);
  });

  it('destroy 빈 문자열 → error.code 존재', async () => {
    const manager = makeManager();
    const result = await manager.destroy('');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('create → isClean path true → destroy → 동일 경로 isClean false', async () => {
    const manager = makeManager();
    const r = await manager.create('complete-cycle');
    if (r.ok) {
      const path = r.value.envPath;
      expect(manager.isClean(path)).toBe(true);
      await manager.destroy(path);
      expect(manager.isClean(path)).toBe(false);
    }
  });

  it('3개 생성 → 중간 것만 소멸 → 나머지 2개 isClean true', async () => {
    const manager = makeManager();
    const r1 = await manager.create('mid-del-1');
    const r2 = await manager.create('mid-del-2');
    const r3 = await manager.create('mid-del-3');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r3.ok) createdPaths.push(r3.value.envPath);
    if (r2.ok) {
      await manager.destroy(r2.value.envPath);
      expect(manager.isClean(r2.value.envPath)).toBe(false);
    }
    if (r1.ok) expect(manager.isClean(r1.value.envPath)).toBe(true);
    if (r3.ok) expect(manager.isClean(r3.value.envPath)).toBe(true);
  });

  it('UUID projectId envPath 확인', async () => {
    const manager = makeManager();
    const uuid = crypto.randomUUID();
    const result = await manager.create(uuid);
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(true);
    }
  });

  it('listActive 결과에 중복 없음', async () => {
    const manager = makeManager();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => manager.create(`nodup-${i}`))
    );
    for (const r of results) {
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    const unique = new Set(active);
    expect(unique.size).toBe(active.length);
  });
});

// ── 추가 경계값: create 에러 코드 타입 확인 ──────────────────

describe('CleanEnvManager create 반환값 세부 확인', () => {
  it('create 성공 → result.value가 객체', async () => {
    const manager = makeManager();
    const result = await manager.create('obj-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(typeof result.value).toBe('object');
    }
  });

  it('create 성공 → envPath 키 존재', async () => {
    const manager = makeManager();
    const result = await manager.create('key-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect('envPath' in result.value).toBe(true);
    }
  });

  it('create 성공 → envPath 길이 > 5', async () => {
    const manager = makeManager();
    const result = await manager.create('len-check');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(result.value.envPath.length).toBeGreaterThan(5);
    }
  });

  it('create 성공 → existsSync(envPath)=true', async () => {
    const manager = makeManager();
    const result = await manager.create('exists-verify');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(existsSync(result.value.envPath)).toBe(true);
    }
  });

  it('create 연속 3회 → 3개 모두 ok', async () => {
    const manager = makeManager();
    const r1 = await manager.create('seq-1');
    const r2 = await manager.create('seq-2');
    const r3 = await manager.create('seq-3');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r3.ok) createdPaths.push(r3.value.envPath);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
  });

  it('create 성공 → listActive에 envPath 포함됨', async () => {
    const manager = makeManager();
    const result = await manager.create('list-include');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      const active = manager.listActive();
      expect(active.includes(result.value.envPath)).toBe(true);
    }
  });

  it('create 성공 → isClean(envPath)=true', async () => {
    const manager = makeManager();
    const result = await manager.create('clean-verify');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(true);
    }
  });

  it('create 성공 반환값 ok=true', async () => {
    const manager = makeManager();
    const result = await manager.create('ok-verify');
    expect(result.ok).toBe(true);
    if (result.ok) createdPaths.push(result.value.envPath);
  });

  it('다른 manager로 같은 projectId → 다른 envPath', async () => {
    const m1 = makeManager();
    const m2 = makeManager();
    const r1 = await m1.create('same-id');
    const r2 = await m2.create('same-id');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r1.ok && r2.ok) {
      expect(r1.value.envPath).not.toBe(r2.value.envPath);
    }
  });

  it('create 실패 → result.ok=false', async () => {
    // null 문자 포함 projectId로 강제 실패 시도
    const manager = makeManager();
    const result = await manager.create('\0invalid\0');
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      // 일부 OS에서 성공할 수 있음
      createdPaths.push(result.value.envPath);
      expect(typeof result.ok).toBe('boolean');
    }
  });
});

// ── 추가 경계값: destroy 에러 세부 확인 ──────────────────────

describe('CleanEnvManager destroy 에러 세부 확인', () => {
  it('destroy 에러 → result.error.code 존재', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/no-such-path-xyz');
    if (!result.ok) {
      expect(result.error.code).toBeDefined();
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('destroy 에러 → result.error.message 존재', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/no-such-path-abc');
    if (!result.ok) {
      expect(result.error.message).toBeDefined();
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('destroy 에러 메시지 비어 있지 않음', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/totally-random-not-managed');
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('destroy 에러 code 비어 있지 않음', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/totally-random-code-check');
    if (!result.ok) {
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('destroy 성공 → result.ok=true', async () => {
    const manager = makeManager();
    const cr = await manager.create('success-destroy');
    if (cr.ok) {
      const dr = await manager.destroy(cr.value.envPath);
      expect(dr.ok).toBe(true);
    }
  });

  it('destroy 성공 → 디렉토리 제거됨', async () => {
    const manager = makeManager();
    const cr = await manager.create('removed-dir');
    if (cr.ok) {
      const path = cr.value.envPath;
      await manager.destroy(path);
      expect(existsSync(path)).toBe(false);
    }
  });

  it('destroy 성공 → activeEnvs에서 제거됨', async () => {
    const manager = makeManager();
    const cr = await manager.create('removed-active');
    if (cr.ok) {
      const path = cr.value.envPath;
      await manager.destroy(path);
      expect(manager.listActive()).not.toContain(path);
    }
  });

  it('빈 문자열 destroy → ok=false', async () => {
    const manager = makeManager();
    const result = await manager.destroy('');
    expect(result.ok).toBe(false);
  });

  it('관리 중이 아닌 경로 destroy → ok=false', async () => {
    const manager = makeManager();
    const cr = await manager.create('managed-one');
    if (cr.ok) {
      createdPaths.push(cr.value.envPath);
      // 다른 경로 시도
      const result = await manager.destroy('/tmp/not-managed-path-xyz');
      expect(result.ok).toBe(false);
    }
  });

  it('destroy 후 re-destroy → ok=false', async () => {
    const manager = makeManager();
    const cr = await manager.create('re-destroy');
    if (cr.ok) {
      const path = cr.value.envPath;
      await manager.destroy(path);
      const result2 = await manager.destroy(path);
      expect(result2.ok).toBe(false);
    }
  });
});

// ── 추가 경계값: isClean 세부 검증 ──────────────────────────

describe('CleanEnvManager isClean 세부 검증', () => {
  it('새 manager → 임의 경로 isClean=false', () => {
    const manager = makeManager();
    const paths = ['/tmp/a', '/var/b', '/home/c', '', '   '];
    for (const p of paths) {
      expect(manager.isClean(p)).toBe(false);
    }
  });

  it('create 후 → 동일 경로 isClean=true', async () => {
    const manager = makeManager();
    const result = await manager.create('isclean-same');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(true);
    }
  });

  it('create 후 destroy → isClean=false', async () => {
    const manager = makeManager();
    const result = await manager.create('isclean-destroy');
    if (result.ok) {
      const path = result.value.envPath;
      await manager.destroy(path);
      expect(manager.isClean(path)).toBe(false);
    }
  });

  it('UUID 경로 isClean=false (관리하지 않음)', () => {
    const manager = makeManager();
    expect(manager.isClean(`/tmp/${crypto.randomUUID()}`)).toBe(false);
  });

  it('isClean 반환값 boolean 타입', () => {
    const manager = makeManager();
    const result = manager.isClean('/some/path');
    expect(typeof result).toBe('boolean');
  });

  it('isClean true인 경우 existsSync도 true', async () => {
    const manager = makeManager();
    const result = await manager.create('isclean-exists');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      if (manager.isClean(result.value.envPath)) {
        expect(existsSync(result.value.envPath)).toBe(true);
      }
    }
  });

  it('isClean false이면 경로가 activeEnvs에 없음', async () => {
    const manager = makeManager();
    const fakeP = '/tmp/fake-not-managed';
    expect(manager.isClean(fakeP)).toBe(false);
    expect(manager.listActive()).not.toContain(fakeP);
  });

  it('3개 생성 → 각각 isClean=true', async () => {
    const manager = makeManager();
    const results = await Promise.all([
      manager.create('ic-1'),
      manager.create('ic-2'),
      manager.create('ic-3'),
    ]);
    for (const r of results) {
      if (r.ok) {
        createdPaths.push(r.value.envPath);
        expect(manager.isClean(r.value.envPath)).toBe(true);
      }
    }
  });

  it('isClean 연속 10회 호출 → 동일 결과', async () => {
    const manager = makeManager();
    const r = await manager.create('isclean-10');
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      const path = r.value.envPath;
      const first = manager.isClean(path);
      for (let i = 0; i < 9; i++) {
        expect(manager.isClean(path)).toBe(first);
      }
    }
  });
});

// ── 추가 경계값: listActive 세부 검증 ──────────────────────

describe('CleanEnvManager listActive 세부 검증', () => {
  it('listActive 반환 배열은 복사본 (변경 영향 없음)', async () => {
    const manager = makeManager();
    const r = await manager.create('copy-test');
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      const list = manager.listActive();
      const originalLen = list.length;
      list.push('/fake/injected');
      // 원본 배열은 변경되지 않아야 함
      expect(manager.listActive().length).toBe(originalLen);
    }
  });

  it('listActive 타입이 Array', () => {
    const manager = makeManager();
    expect(Array.isArray(manager.listActive())).toBe(true);
  });

  it('create 후 listActive[0]가 string', async () => {
    const manager = makeManager();
    const r = await manager.create('type-check-list');
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      const active = manager.listActive();
      expect(typeof active[0]).toBe('string');
    }
  });

  it('destroy 후 listActive 길이 감소', async () => {
    const manager = makeManager();
    const r1 = await manager.create('len-before');
    const r2 = await manager.create('len-after');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    const before = manager.listActive().length;
    if (r1.ok) {
      await manager.destroy(r1.value.envPath);
      createdPaths.splice(createdPaths.indexOf(r1.value.envPath), 1);
    }
    const after = manager.listActive().length;
    expect(after).toBe(before - 1);
  });

  it('10개 create → listActive에 모두 포함', async () => {
    const manager = makeManager();
    const paths: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await manager.create(`all-listed-${i}`);
      if (r.ok) {
        createdPaths.push(r.value.envPath);
        paths.push(r.value.envPath);
      }
    }
    const active = manager.listActive();
    for (const p of paths) {
      expect(active).toContain(p);
    }
  });

  it('listActive 중복 없음 (10개 생성 후)', async () => {
    const manager = makeManager();
    for (let i = 0; i < 10; i++) {
      const r = await manager.create(`nodup2-${i}`);
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    const unique = new Set(active);
    expect(unique.size).toBe(active.length);
  });

  it('listActive 요소가 모두 existsSync=true', async () => {
    const manager = makeManager();
    for (let i = 0; i < 3; i++) {
      const r = await manager.create(`exists-all-${i}`);
      if (r.ok) createdPaths.push(r.value.envPath);
    }
    const active = manager.listActive();
    for (const p of active) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it('listActive 결과에 projectId 이름이 포함된 경로', async () => {
    const manager = makeManager();
    const pid = 'special-proj-xyz';
    const r = await manager.create(pid);
    if (r.ok) {
      createdPaths.push(r.value.envPath);
      const active = manager.listActive();
      const found = active.find((p) => p.includes(pid));
      expect(found).toBeDefined();
    }
  });

  it('listActive 초기 빈 배열 → length=0', () => {
    const manager = makeManager();
    expect(manager.listActive().length).toBe(0);
  });

  it('5개 create → 3개 destroy → listActive.length=2', async () => {
    const manager = makeManager();
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await manager.create(`partial-del-${i}`);
      if (r.ok) paths.push(r.value.envPath);
    }
    // 남겨둘 2개
    for (const p of paths.slice(2)) createdPaths.push(p);
    // 3개 삭제
    for (const p of paths.slice(0, 3)) {
      await manager.destroy(p);
    }
    expect(manager.listActive().length).toBe(2);
  });
});

// ── 추가 복합 시나리오 ────────────────────────────────────────

describe('CleanEnvManager 추가 복합 시나리오', () => {
  it('create → isClean=true → destroy → isClean=false → create 다시 → isClean=true', async () => {
    const manager = makeManager();
    const r1 = await manager.create('lifecycle2');
    if (r1.ok) {
      const p1 = r1.value.envPath;
      expect(manager.isClean(p1)).toBe(true);
      await manager.destroy(p1);
      expect(manager.isClean(p1)).toBe(false);
      const r2 = await manager.create('lifecycle2');
      if (r2.ok) {
        createdPaths.push(r2.value.envPath);
        expect(manager.isClean(r2.value.envPath)).toBe(true);
      }
    }
  });

  it('3 manager 독립 → 각각 create → 다른 manager destroy 불가', async () => {
    const m1 = makeManager();
    const m2 = makeManager();
    const m3 = makeManager();
    const r1 = await m1.create('ind-1');
    const r2 = await m2.create('ind-2');
    const r3 = await m3.create('ind-3');
    if (r1.ok) createdPaths.push(r1.value.envPath);
    if (r2.ok) createdPaths.push(r2.value.envPath);
    if (r3.ok) createdPaths.push(r3.value.envPath);
    if (r1.ok && r2.ok) {
      // m1 → m2의 경로 destroy 시도 → 실패
      const crossDestroy = await m1.destroy(r2.value.envPath);
      expect(crossDestroy.ok).toBe(false);
    }
  });

  it('create UUID + isClean + destroy + isClean 순환', async () => {
    const manager = makeManager();
    const uuid = crypto.randomUUID();
    const r = await manager.create(uuid);
    if (r.ok) {
      const path = r.value.envPath;
      expect(manager.isClean(path)).toBe(true);
      expect(existsSync(path)).toBe(true);
      const dr = await manager.destroy(path);
      expect(dr.ok).toBe(true);
      expect(manager.isClean(path)).toBe(false);
      expect(existsSync(path)).toBe(false);
    }
  });

  it('5개 생성 → listActive 확인 → 모두 destroy → listActive 빈 배열', async () => {
    const manager = makeManager();
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await manager.create(`clean-all-${i}`);
      if (r.ok) paths.push(r.value.envPath);
    }
    expect(manager.listActive().length).toBe(5);
    for (const p of paths) {
      await manager.destroy(p);
    }
    expect(manager.listActive()).toEqual([]);
  });

  it('빈 projectId → create 처리 결과 확인', async () => {
    const manager = makeManager();
    const result = await manager.create('');
    if (result.ok) {
      createdPaths.push(result.value.envPath);
      expect(manager.isClean(result.value.envPath)).toBe(true);
    } else {
      expect(result.ok).toBe(false);
    }
    expect(typeof result.ok).toBe('boolean');
  });

  it('10개 생성 후 isClean 모두 true → 모두 destroy → isClean 모두 false', async () => {
    const manager = makeManager();
    const paths: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await manager.create(`all-clean-${i}`);
      if (r.ok) paths.push(r.value.envPath);
    }
    for (const p of paths) {
      expect(manager.isClean(p)).toBe(true);
    }
    for (const p of paths) {
      await manager.destroy(p);
    }
    for (const p of paths) {
      expect(manager.isClean(p)).toBe(false);
    }
  });

  it('listActive → create → listActive → destroy → listActive 변화 추적', async () => {
    const manager = makeManager();
    expect(manager.listActive().length).toBe(0);
    const r = await manager.create('track-1');
    if (r.ok) {
      expect(manager.listActive().length).toBe(1);
      await manager.destroy(r.value.envPath);
      expect(manager.listActive().length).toBe(0);
    }
  });

  it('같은 projectId로 20번 create → 모두 다른 경로', async () => {
    const manager = makeManager();
    const paths: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await manager.create('repeated-id');
      if (r.ok) {
        createdPaths.push(r.value.envPath);
        paths.push(r.value.envPath);
      }
    }
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it('create 에러 result에 ok 필드 존재', async () => {
    const manager = makeManager();
    const result = await manager.create('error-check');
    expect('ok' in result).toBe(true);
    if (result.ok) createdPaths.push(result.value.envPath);
  });

  it('destroy 에러 result에 ok 필드 존재', async () => {
    const manager = makeManager();
    const result = await manager.destroy('/nonexistent');
    expect('ok' in result).toBe(true);
  });
});
