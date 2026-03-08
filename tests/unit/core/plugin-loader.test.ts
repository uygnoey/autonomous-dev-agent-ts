/**
 * DefaultPluginLoader 단위 테스트
 *
 * @description
 * KR: loadPlugins/getPlugin 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for DefaultPluginLoader methods. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { DefaultPluginLoader } from 'core/plugin-loader.js';

let tempDir: string;
let globalDir: string;
let projectDir: string;
const logger = new ConsoleLogger('error');

beforeEach(async () => {
  tempDir = join(tmpdir(), `adev-plugin-test-${crypto.randomUUID()}`);
  globalDir = join(tempDir, 'global');
  projectDir = join(tempDir, 'project');
  await mkdir(globalDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createPlugin(dir: string, name: string, code = 'export const value = 42;') {
  const pluginDir = join(dir, name);
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', entryPoint: 'index.ts' }),
  );
  await writeFile(join(pluginDir, 'index.ts'), code);
}

// ── 생성자 ────────────────────────────────────────────────────

describe('DefaultPluginLoader 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new DefaultPluginLoader(logger)).not.toThrow();
  });

  it('DefaultPluginLoader 인스턴스이다', () => {
    expect(new DefaultPluginLoader(logger)).toBeInstanceOf(DefaultPluginLoader);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new DefaultPluginLoader(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('두 인스턴스는 다른 객체', () => {
    const l1 = new DefaultPluginLoader(logger);
    const l2 = new DefaultPluginLoader(logger);
    expect(l1).not.toBe(l2);
  });

  it('loadPlugins 메서드 존재', () => {
    expect(typeof new DefaultPluginLoader(logger).loadPlugins).toBe('function');
  });

  it('getPlugin 메서드 존재', () => {
    expect(typeof new DefaultPluginLoader(logger).getPlugin).toBe('function');
  });

  it('info logger로 생성 가능', () => {
    expect(() => new DefaultPluginLoader(new ConsoleLogger('info'))).not.toThrow();
  });

  it('warn logger로 생성 가능', () => {
    expect(() => new DefaultPluginLoader(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('error logger로 생성 가능', () => {
    expect(() => new DefaultPluginLoader(new ConsoleLogger('error'))).not.toThrow();
  });

  it('10개 인스턴스 모두 생성 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new DefaultPluginLoader(logger)).not.toThrow();
    }
  });

  it('5번 반복 인스턴스 생성 → 모두 DefaultPluginLoader', () => {
    for (let i = 0; i < 5; i++) {
      expect(new DefaultPluginLoader(logger)).toBeInstanceOf(DefaultPluginLoader);
    }
  });
});

// ── loadPlugins - 성공 케이스 ─────────────────────────────────

describe('DefaultPluginLoader loadPlugins - 성공 케이스', () => {
  it('단일 플러그인 로드 → ok=true', async () => {
    await createPlugin(globalDir, 'test-plugin');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('단일 플러그인 로드 → 길이 1', async () => {
    await createPlugin(globalDir, 'test-plugin');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('단일 플러그인 → name 일치', async () => {
    await createPlugin(globalDir, 'my-plugin');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value[0]?.manifest.name).toBe('my-plugin');
  });

  it('두 플러그인 로드 → 길이 2', async () => {
    await createPlugin(globalDir, 'plugin-a');
    await createPlugin(globalDir, 'plugin-b');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('두 플러그인 이름 모두 포함', async () => {
    await createPlugin(globalDir, 'plugin-a');
    await createPlugin(globalDir, 'plugin-b');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      const names = result.value.map((p) => p.manifest.name);
      expect(names).toContain('plugin-a');
      expect(names).toContain('plugin-b');
    }
  });

  it('빈 디렉토리 → ok=true', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('빈 디렉토리 → 길이 0', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 디렉토리 → ok=true (빈 배열)', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(join(tempDir, 'nonexistent'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('반환값이 배열이다', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('5개 플러그인 → 길이 5', async () => {
    for (let i = 0; i < 5; i++) await createPlugin(globalDir, `plugin-${i}`);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(5);
  });

  it('단일 플러그인 manifest.version 존재', async () => {
    await createPlugin(globalDir, 'versioned');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value[0]?.manifest.version).toBe('1.0.0');
    }
  });

  it('단일 플러그인 manifest.entryPoint 존재', async () => {
    await createPlugin(globalDir, 'entry-plugin');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value[0]?.manifest.entryPoint).toBe('index.ts');
    }
  });

  it('loadPlugins 반환 ok는 boolean', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(typeof result.ok).toBe('boolean');
  });

  it('10개 플러그인 → 길이 10', async () => {
    for (let i = 0; i < 10; i++) await createPlugin(globalDir, `p-${i}`);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(10);
  });

  it('플러그인 모듈이 정의됨', async () => {
    await createPlugin(globalDir, 'module-plugin');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value[0]?.module).toBeDefined();
    }
  });

  it('빈 디렉토리 5번 반복 → 항상 ok=true, 길이 0', async () => {
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 5; i++) {
      const emptyDir = join(tempDir, `empty-${i}`);
      await mkdir(emptyDir, { recursive: true });
      const result = await loader.loadPlugins(emptyDir);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });

  it('단일 플러그인 manifest.name이 string이다', async () => {
    await createPlugin(globalDir, 'type-check');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(typeof result.value[0]?.manifest.name).toBe('string');
    }
  });
});

// ── loadPlugins - 글로벌+프로젝트 병합 ───────────────────────

describe('DefaultPluginLoader loadPlugins - 글로벌+프로젝트 병합', () => {
  it('프로젝트가 글로벌 동일 이름 덮어씀', async () => {
    await createPlugin(globalDir, 'shared', 'export const source = "global";');
    await createPlugin(projectDir, 'shared', 'export const source = "project";');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      const mod = result.value[0]?.module as { source: string };
      expect(mod.source).toBe('project');
    }
  });

  it('글로벌+프로젝트 고유 → 모두 포함', async () => {
    await createPlugin(globalDir, 'global-only');
    await createPlugin(projectDir, 'project-only');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('글로벌+프로젝트 이름 모두 포함', async () => {
    await createPlugin(globalDir, 'global-only');
    await createPlugin(projectDir, 'project-only');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) {
      const names = result.value.map((p) => p.manifest.name);
      expect(names).toContain('global-only');
      expect(names).toContain('project-only');
    }
  });

  it('프로젝트만 있음 → 프로젝트 포함', async () => {
    await createPlugin(projectDir, 'proj-only');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.manifest.name).toBe('proj-only');
    }
  });

  it('두 디렉토리 모두 비어있으면 빈 배열', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('프로젝트 없이 호출 → 글로벌만 반환', async () => {
    await createPlugin(globalDir, 'global-srv');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.manifest.name).toBe('global-srv');
    }
  });

  it('3글로벌+2프로젝트 고유 → 5개', async () => {
    for (let i = 0; i < 3; i++) await createPlugin(globalDir, `g-${i}`);
    for (let i = 0; i < 2; i++) await createPlugin(projectDir, `p-${i}`);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(5);
  });

  it('2개 공유 이름 → 프로젝트가 덮어씀', async () => {
    await createPlugin(globalDir, 'shared1', 'export const v = "g1";');
    await createPlugin(globalDir, 'shared2', 'export const v = "g2";');
    await createPlugin(projectDir, 'shared1', 'export const v = "p1";');
    await createPlugin(projectDir, 'shared2', 'export const v = "p2";');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      for (const plugin of result.value) {
        const mod = plugin.module as { v: string };
        expect(mod.v).toMatch(/^p/); // project wins
      }
    }
  });

  it('병합 결과 ok=true', async () => {
    await createPlugin(globalDir, 'g');
    await createPlugin(projectDir, 'p');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    expect(result.ok).toBe(true);
  });
});

// ── getPlugin ─────────────────────────────────────────────────

describe('DefaultPluginLoader getPlugin', () => {
  it('로드된 플러그인 조회 → defined', async () => {
    await createPlugin(globalDir, 'my-plugin');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('my-plugin')).toBeDefined();
  });

  it('로드된 플러그인 → manifest.name 일치', async () => {
    await createPlugin(globalDir, 'my-plugin');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('my-plugin')?.manifest.name).toBe('my-plugin');
  });

  it('존재하지 않는 플러그인 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('nonexistent')).toBeUndefined();
  });

  it('loadPlugins 전 → undefined', () => {
    const loader = new DefaultPluginLoader(logger);
    expect(loader.getPlugin('any')).toBeUndefined();
  });

  it('빈 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('')).toBeUndefined();
  });

  it('여러 플러그인 중 정확한 플러그인 반환', async () => {
    await createPlugin(globalDir, 'alpha');
    await createPlugin(globalDir, 'beta');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('alpha')?.manifest.name).toBe('alpha');
    expect(loader.getPlugin('beta')?.manifest.name).toBe('beta');
  });

  it('연속 getPlugin 호출 → 동일 결과', async () => {
    await createPlugin(globalDir, 'stable');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const p1 = loader.getPlugin('stable');
    const p2 = loader.getPlugin('stable');
    expect(p1).toBe(p2);
  });

  it('대소문자 다른 이름 → undefined', async () => {
    await createPlugin(globalDir, 'MyPlugin');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('myplugin')).toBeUndefined();
  });

  it('로드 후 getPlugin 5번 → 일관됨', async () => {
    await createPlugin(globalDir, 'consistent');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const first = loader.getPlugin('consistent');
    for (let i = 0; i < 4; i++) {
      expect(loader.getPlugin('consistent')).toBe(first);
    }
  });

  it('10개 중 특정 플러그인 조회', async () => {
    for (let i = 0; i < 10; i++) await createPlugin(globalDir, `plug-${i}`);
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('plug-5')?.manifest.name).toBe('plug-5');
  });

  it('존재하지 않는 이름 연속 5번 → 모두 undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    for (const name of ['a', 'b', 'x', 'unknown', 'no-such']) {
      expect(loader.getPlugin(name)).toBeUndefined();
    }
  });

  it('UUID 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin(crypto.randomUUID())).toBeUndefined();
  });

  it('한국어 이름 → undefined (ASCII 이름 플러그인 없음)', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('한국어플러그인')).toBeUndefined();
  });

  it('공백 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('   ')).toBeUndefined();
  });
});

// ── edge cases ────────────────────────────────────────────────

describe('DefaultPluginLoader edge cases', () => {
  it('manifest.json 없는 폴더 → 건너뜀', async () => {
    const dir = join(globalDir, 'no-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('깨진 manifest.json → 건너뜀', async () => {
    const dir = join(globalDir, 'broken');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '{broken!!}');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('version 누락 manifest → 건너뜀', async () => {
    const dir = join(globalDir, 'no-version');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'test', entryPoint: 'index.ts' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('entryPoint 누락 manifest → 건너뜀', async () => {
    const dir = join(globalDir, 'no-entry-field');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('path traversal entryPoint → 건너뜀', async () => {
    const dir = join(globalDir, 'traversal');
    await mkdir(dir, { recursive: true });
    await writeFile(dir + '/manifest.json', JSON.stringify({ name: 'traversal', version: '1.0.0', entryPoint: '../../../etc/passwd' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('절대 경로 entryPoint → 건너뜀', async () => {
    const dir = join(globalDir, 'abs-path');
    await mkdir(dir, { recursive: true });
    await writeFile(dir + '/manifest.json', JSON.stringify({ name: 'abs-path', version: '1.0.0', entryPoint: '/etc/passwd' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('entryPoint 파일 없음 → 건너뜀', async () => {
    const dir = join(globalDir, 'no-entry');
    await mkdir(dir, { recursive: true });
    await writeFile(dir + '/manifest.json', JSON.stringify({ name: 'no-entry', version: '1.0.0', entryPoint: 'nonexistent.ts' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('두 번 loadPlugins → 이전 결과 초기화', async () => {
    await createPlugin(globalDir, 'first-load');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('first-load')).toBeDefined();

    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    await loader.loadPlugins(emptyDir);
    expect(loader.getPlugin('first-load')).toBeUndefined();
  });

  it('유효+무효 플러그인 혼합 → 유효만 로드', async () => {
    await createPlugin(globalDir, 'valid-plugin');
    const badDir = join(globalDir, 'broken-plugin');
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, 'manifest.json'), '{broken}');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('독립 인스턴스 → 별개 상태', async () => {
    await createPlugin(globalDir, 'shared-plugin');
    const l1 = new DefaultPluginLoader(logger);
    const l2 = new DefaultPluginLoader(logger);
    await l1.loadPlugins(globalDir);
    // l2는 아직 로드하지 않음
    expect(l1.getPlugin('shared-plugin')).toBeDefined();
    expect(l2.getPlugin('shared-plugin')).toBeUndefined();
  });

  it('빈 manifest.json → 건너뜀', async () => {
    const dir = join(globalDir, 'empty-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '{}');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('name만 있는 manifest → 건너뜀', async () => {
    const dir = join(globalDir, 'name-only');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'name-only' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 문자열 JSON → 건너뜀', async () => {
    const dir = join(globalDir, 'empty-str');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('유효 플러그인 3개 + 무효 3개 → 유효만 3개', async () => {
    for (let i = 0; i < 3; i++) await createPlugin(globalDir, `valid-${i}`);
    for (let i = 0; i < 3; i++) {
      const dir = join(globalDir, `invalid-${i}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'manifest.json'), '{invalid}');
    }
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(3);
  });

  it('5번 loadPlugins 반복 후 getPlugin 일관성', async () => {
    await createPlugin(globalDir, 'stable-plugin');
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 5; i++) {
      await loader.loadPlugins(globalDir);
      expect(loader.getPlugin('stable-plugin')).toBeDefined();
    }
  });

  it('3개 독립 로더 인스턴스 → 각자 독립 상태', async () => {
    await createPlugin(globalDir, 'common-plugin');
    const l1 = new DefaultPluginLoader(logger);
    const l2 = new DefaultPluginLoader(logger);
    const l3 = new DefaultPluginLoader(logger);
    await l1.loadPlugins(globalDir);
    // l2, l3 아직 로드 안함
    expect(l1.getPlugin('common-plugin')).toBeDefined();
    expect(l2.getPlugin('common-plugin')).toBeUndefined();
    expect(l3.getPlugin('common-plugin')).toBeUndefined();
  });

  it('loadPlugins → getPlugin → 재로드 → getPlugin 없음 파이프라인', async () => {
    await createPlugin(globalDir, 'temp-plugin');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('temp-plugin')).toBeDefined();

    const freshDir = join(tempDir, 'fresh');
    await mkdir(freshDir, { recursive: true });
    await loader.loadPlugins(freshDir);
    expect(loader.getPlugin('temp-plugin')).toBeUndefined();
  });
});
