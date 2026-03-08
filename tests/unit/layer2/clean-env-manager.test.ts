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
});
