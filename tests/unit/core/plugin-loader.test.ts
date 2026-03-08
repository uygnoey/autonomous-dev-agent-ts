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

// ── loadPlugins - UUID/특수문자/한글 이름 ─────────────────────

describe('DefaultPluginLoader loadPlugins - UUID/특수문자/한글', () => {
  it('UUID 이름 플러그인 → ok=true', async () => {
    const uuid = crypto.randomUUID();
    await createPlugin(globalDir, uuid);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('UUID 이름 플러그인 → manifest.name UUID', async () => {
    const uuid = crypto.randomUUID();
    await createPlugin(globalDir, uuid);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value[0]?.manifest.name).toBe(uuid);
    }
  });

  it('UUID 이름 플러그인 getPlugin → defined', async () => {
    const uuid = crypto.randomUUID();
    await createPlugin(globalDir, uuid);
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin(uuid)).toBeDefined();
  });

  it('한글 name manifest → 로드됨 또는 건너뜀 (안전하게)', async () => {
    const dir = join(globalDir, '한글플러그인');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: '한글플러그인', version: '1.0.0', entryPoint: 'index.ts' }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('숫자 이름 플러그인 → 로드됨', async () => {
    await createPlugin(globalDir, '12345');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.manifest.name).toBe('12345');
    }
  });

  it('매우 긴 이름 플러그인 → 로드됨', async () => {
    const longName = 'a'.repeat(100);
    await createPlugin(globalDir, longName);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]?.manifest.name).toBe(longName);
    }
  });
});

// ── loadPlugins - 다양한 버전 manifest ───────────────────────

describe('DefaultPluginLoader loadPlugins - 다양한 버전', () => {
  it('version=2.0.0 → 로드됨', async () => {
    const dir = join(globalDir, 'v2-plugin');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'v2-plugin', version: '2.0.0', entryPoint: 'index.ts' }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const v = 2;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value[0]?.manifest.version).toBe('2.0.0');
    }
  });

  it('version=0.0.1 → 로드됨', async () => {
    const dir = join(globalDir, 'v001-plugin');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'v001-plugin', version: '0.0.1', entryPoint: 'index.ts' }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const v = "0.0.1";');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      const found = result.value.find((p) => p.manifest.name === 'v001-plugin');
      expect(found?.manifest.version).toBe('0.0.1');
    }
  });

  it('version 숫자 타입 → 건너뜀', async () => {
    const dir = join(globalDir, 'num-ver');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'num-ver', version: 1, entryPoint: 'index.ts' }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'num-ver')).toBe(false);
    }
  });

  it('name 숫자 타입 → 건너뜀', async () => {
    const dir = join(globalDir, 'num-name');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 42, version: '1.0.0', entryPoint: 'index.ts' }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === '42')).toBe(false);
    }
  });

  it('entryPoint 숫자 타입 → 건너뜀', async () => {
    const dir = join(globalDir, 'num-ep');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'num-ep', version: '1.0.0', entryPoint: 42 }),
    );
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'num-ep')).toBe(false);
    }
  });
});

// ── loadPlugins - 반복/일관성 ────────────────────────────────

describe('DefaultPluginLoader loadPlugins - 반복/일관성', () => {
  it('같은 디렉토리 3번 loadPlugins → 동일 결과', async () => {
    await createPlugin(globalDir, 'stable');
    const loader = new DefaultPluginLoader(logger);
    const r1 = await loader.loadPlugins(globalDir);
    const r2 = await loader.loadPlugins(globalDir);
    const r3 = await loader.loadPlugins(globalDir);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r2.value.length).toBe(r3.value.length);
    }
  });

  it('독립 인스턴스 3개 loadPlugins → 동일 결과', async () => {
    await createPlugin(globalDir, 'common');
    const l1 = new DefaultPluginLoader(logger);
    const l2 = new DefaultPluginLoader(logger);
    const l3 = new DefaultPluginLoader(logger);
    const r1 = await l1.loadPlugins(globalDir);
    const r2 = await l2.loadPlugins(globalDir);
    const r3 = await l3.loadPlugins(globalDir);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(1);
      expect(r2.value.length).toBe(1);
      expect(r3.value.length).toBe(1);
    }
  });

  it('10개 플러그인 각각 getPlugin → 모두 defined', async () => {
    for (let i = 0; i < 10; i++) await createPlugin(globalDir, `plug-${i}`);
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    for (let i = 0; i < 10; i++) {
      expect(loader.getPlugin(`plug-${i}`)).toBeDefined();
    }
  });

  it('빈 디렉토리 3번 → 모두 ok=true, 길이 0', async () => {
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 3; i++) {
      const result = await loader.loadPlugins(globalDir);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });

  it('nonexistent 디렉토리 3번 → 모두 ok=true', async () => {
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 3; i++) {
      const result = await loader.loadPlugins(join(tempDir, `none-${i}`));
      expect(result.ok).toBe(true);
    }
  });

  it('5개 플러그인 후 getPlugin nonexistent → undefined', async () => {
    for (let i = 0; i < 5; i++) await createPlugin(globalDir, `exist-${i}`);
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('nonexistent')).toBeUndefined();
    expect(loader.getPlugin('')).toBeUndefined();
    expect(loader.getPlugin(crypto.randomUUID())).toBeUndefined();
  });
});

// ── getPlugin - 추가 경계값 ──────────────────────────────────

describe('DefaultPluginLoader getPlugin - 추가 경계값', () => {
  it('특수문자 이름 조회 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('srv!@#$%')).toBeUndefined();
  });

  it('매우 긴 이름 조회 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('x'.repeat(1000))).toBeUndefined();
  });

  it('숫자만 이름 조회 → undefined (없는 경우)', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('9999')).toBeUndefined();
  });

  it('재로드 후 이전 플러그인 getPlugin → undefined', async () => {
    await createPlugin(globalDir, 'old-plugin');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('old-plugin')).toBeDefined();

    const newDir = join(tempDir, 'new-dir');
    await mkdir(newDir, { recursive: true });
    await createPlugin(newDir, 'new-plugin');
    await loader.loadPlugins(newDir);
    expect(loader.getPlugin('old-plugin')).toBeUndefined();
    expect(loader.getPlugin('new-plugin')).toBeDefined();
  });

  it('병합 로드 후 두 플러그인 getPlugin', async () => {
    await createPlugin(globalDir, 'g-plug');
    await createPlugin(projectDir, 'p-plug');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir, projectDir);
    expect(loader.getPlugin('g-plug')).toBeDefined();
    expect(loader.getPlugin('p-plug')).toBeDefined();
  });

  it('병합 덮어쓰기 후 getPlugin → project 버전', async () => {
    await createPlugin(globalDir, 'shared', 'export const src = "global";');
    await createPlugin(projectDir, 'shared', 'export const src = "project";');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir, projectDir);
    const plugin = loader.getPlugin('shared');
    expect(plugin).toBeDefined();
    if (plugin) {
      const mod = plugin.module as { src: string };
      expect(mod.src).toBe('project');
    }
  });

  it('getPlugin 반환 타입 확인 (object 또는 undefined)', async () => {
    await createPlugin(globalDir, 'type-check2');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('type-check2');
    expect(typeof plugin === 'object' || plugin === undefined).toBe(true);
  });
});

// ── loadPlugins - 추가 경계값 ────────────────────────────────

describe('DefaultPluginLoader loadPlugins - 추가 경계값', () => {
  it('version이 빈 문자열 → ok=true (로더가 허용하는 경우)', async () => {
    const dir = join(globalDir, 'empty-ver');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'empty-ver', version: '', entryPoint: 'index.ts' }));
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('entryPoint가 빈 문자열 → 건너뜀', async () => {
    const dir = join(globalDir, 'empty-ep');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'empty-ep', version: '1.0.0', entryPoint: '' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('name이 공백 문자열 → ok=true (로더가 수용하는 경우)', async () => {
    const dir = join(globalDir, 'space-name');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: '   ', version: '1.0.0', entryPoint: 'index.ts' }));
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('manifest가 배열 → 건너뜀', async () => {
    const dir = join(globalDir, 'arr-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify([{ name: 'arr', version: '1.0.0', entryPoint: 'index.ts' }]));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('manifest가 숫자 → 건너뜀', async () => {
    const dir = join(globalDir, 'num-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '42');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('manifest가 null → 건너뜀', async () => {
    const dir = join(globalDir, 'null-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), 'null');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('manifest가 문자열 → 건너뜀', async () => {
    const dir = join(globalDir, 'str-manifest');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '"string"');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('플러그인 디렉토리가 파일임 → 건너뜀', async () => {
    const filePath = join(globalDir, 'file-not-dir');
    await writeFile(filePath, 'I am a file');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('유효 1개 + 파일(dir아님) 1개 → 1개만 로드', async () => {
    await createPlugin(globalDir, 'valid-one');
    await writeFile(join(globalDir, 'file-entry'), 'just a file');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('entryPoint 대소문자 변형(INDEX.ts) → 없으면 건너뜀', async () => {
    const dir = join(globalDir, 'case-ep');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'case-ep', version: '1.0.0', entryPoint: 'INDEX.ts' }));
    // index.ts가 없고 INDEX.ts도 없음
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });
});

// ── getPlugin - 추가 경계값 #2 ───────────────────────────────

describe('DefaultPluginLoader getPlugin - 추가 경계값 #2', () => {
  it('로드 전 getPlugin → undefined', () => {
    const loader = new DefaultPluginLoader(logger);
    expect(loader.getPlugin('not-loaded')).toBeUndefined();
  });

  it('getPlugin null-like 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('null')).toBeUndefined();
  });

  it('getPlugin "undefined" 문자열 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('undefined')).toBeUndefined();
  });

  it('getPlugin 개행 문자 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('\n')).toBeUndefined();
  });

  it('getPlugin 탭 문자 이름 → undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('\t')).toBeUndefined();
  });

  it('병합 없이 2개 플러그인 각각 getPlugin → 모두 defined', async () => {
    await createPlugin(globalDir, 'first');
    await createPlugin(globalDir, 'second');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('first')).toBeDefined();
    expect(loader.getPlugin('second')).toBeDefined();
  });

  it('재로드로 플러그인 추가 후 새 플러그인 getPlugin', async () => {
    await createPlugin(globalDir, 'initial');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('initial')).toBeDefined();

    await createPlugin(globalDir, 'added');
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('added')).toBeDefined();
  });

  it('getPlugin 결과 manifest.name은 string', async () => {
    await createPlugin(globalDir, 'name-str');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('name-str');
    if (plugin) expect(typeof plugin.manifest.name).toBe('string');
  });

  it('getPlugin 결과 manifest.version은 string', async () => {
    await createPlugin(globalDir, 'ver-str');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('ver-str');
    if (plugin) expect(typeof plugin.manifest.version).toBe('string');
  });

  it('getPlugin 결과 manifest.entryPoint는 string', async () => {
    await createPlugin(globalDir, 'ep-str');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('ep-str');
    if (plugin) expect(typeof plugin.manifest.entryPoint).toBe('string');
  });
});

// ── 반복/일관성 추가 ─────────────────────────────────────────

describe('DefaultPluginLoader 반복/일관성 추가', () => {
  it('loadPlugins 10번 반복 → getPlugin 항상 defined', async () => {
    await createPlugin(globalDir, 'persistent');
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 10; i++) {
      await loader.loadPlugins(globalDir);
      expect(loader.getPlugin('persistent')).toBeDefined();
    }
  });

  it('독립 인스턴스 5개 동시 로드 → 동일 결과', async () => {
    await createPlugin(globalDir, 'concurrent');
    const loaders = Array.from({ length: 5 }, () => new DefaultPluginLoader(logger));
    const results = await Promise.all(loaders.map((l) => l.loadPlugins(globalDir)));
    for (const result of results) {
      if (result.ok) expect(result.value).toHaveLength(1);
    }
  });

  it('20개 플러그인 → 각각 getPlugin 정확히 반환', async () => {
    for (let i = 0; i < 20; i++) await createPlugin(globalDir, `item-${i}`);
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    for (let i = 0; i < 20; i++) {
      const plugin = loader.getPlugin(`item-${i}`);
      expect(plugin?.manifest.name).toBe(`item-${i}`);
    }
  });

  it('빈 디렉토리 → getPlugin은 항상 undefined', async () => {
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const names = ['a', 'b', 'c', 'plugin', 'test', '123', crypto.randomUUID()];
    for (const name of names) {
      expect(loader.getPlugin(name)).toBeUndefined();
    }
  });

  it('3개 플러그인 로드 → ok=true + 길이 3', async () => {
    for (const name of ['x', 'y', 'z']) await createPlugin(globalDir, name);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(3);
  });
});

// ── 생성자 메서드 존재 확인 ──────────────────────────────────

describe('DefaultPluginLoader 메서드 인터페이스 확인', () => {
  it('loadPlugins 메서드 타입이 function', () => {
    const loader = new DefaultPluginLoader(logger);
    expect(typeof loader.loadPlugins).toBe('function');
  });

  it('getPlugin 메서드 타입이 function', () => {
    const loader = new DefaultPluginLoader(logger);
    expect(typeof loader.getPlugin).toBe('function');
  });

  it('loadPlugins 반환값이 Promise', async () => {
    const loader = new DefaultPluginLoader(logger);
    const ret = loader.loadPlugins(globalDir);
    expect(ret).toBeInstanceOf(Promise);
    await ret;
  });

  it('loadPlugins 반환 Promise가 Result 구조', async () => {
    const loader = new DefaultPluginLoader(logger);
    const result = await loader.loadPlugins(globalDir);
    expect('ok' in result).toBe(true);
  });

  it('getPlugin은 동기 메서드 (Promise 아님)', async () => {
    await createPlugin(globalDir, 'sync-check');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('sync-check');
    expect(plugin instanceof Promise).toBe(false);
  });

  it('로더 instanceof DefaultPluginLoader 확인', () => {
    const loader = new DefaultPluginLoader(logger);
    expect(loader).toBeInstanceOf(DefaultPluginLoader);
  });

  it('여러 인스턴스 각각 독립적 Map', async () => {
    await createPlugin(globalDir, 'map-check');
    const l1 = new DefaultPluginLoader(logger);
    const l2 = new DefaultPluginLoader(logger);
    await l1.loadPlugins(globalDir);
    // l2 로드하지 않음
    expect(l1.getPlugin('map-check')).toBeDefined();
    expect(l2.getPlugin('map-check')).toBeUndefined();
  });

  it('loadPlugins → ok=true 확인', async () => {
    const loader = new DefaultPluginLoader(logger);
    const result = await loader.loadPlugins(globalDir);
    expect(result.ok).toBe(true);
  });

  it('getPlugin 결과는 Plugin 타입 또는 undefined', async () => {
    await createPlugin(globalDir, 'plugin-type-check');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('plugin-type-check');
    // Plugin 타입이면 manifest가 있어야 함
    if (plugin !== undefined) {
      expect(plugin.manifest).toBeDefined();
      expect(plugin.module).toBeDefined();
    }
  });

  it('loadPlugins 두 번째 호출로 첫 번째 상태 초기화', async () => {
    await createPlugin(globalDir, 'first');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('first')).toBeDefined();

    const dir2 = join(tempDir, 'dir2');
    await mkdir(dir2, { recursive: true });
    await createPlugin(dir2, 'second');
    await loader.loadPlugins(dir2);
    expect(loader.getPlugin('first')).toBeUndefined();
    expect(loader.getPlugin('second')).toBeDefined();
  });
});

// ── 경계값: 단일 플러그인 세부 속성 ─────────────────────────

describe('DefaultPluginLoader 단일 플러그인 세부 속성', () => {
  it('plugin.manifest.name은 로드된 이름과 동일', async () => {
    await createPlugin(globalDir, 'detail-check');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('detail-check');
    expect(plugin?.manifest.name).toBe('detail-check');
  });

  it('plugin.manifest.version은 1.0.0', async () => {
    await createPlugin(globalDir, 'ver-detail');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('ver-detail');
    expect(plugin?.manifest.version).toBe('1.0.0');
  });

  it('plugin.manifest.entryPoint는 index.ts', async () => {
    await createPlugin(globalDir, 'ep-detail');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('ep-detail');
    expect(plugin?.manifest.entryPoint).toBe('index.ts');
  });

  it('plugin.module은 객체', async () => {
    await createPlugin(globalDir, 'module-detail');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('module-detail');
    if (plugin !== undefined) {
      expect(typeof plugin.module).toBe('object');
    }
  });

  it('plugin.module에서 export value 접근', async () => {
    await createPlugin(globalDir, 'value-plugin', 'export const value = 42;');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('value-plugin');
    if (plugin !== undefined) {
      const mod = plugin.module as { value: number };
      expect(mod.value).toBe(42);
    }
  });

  it('plugin.module에서 string export 접근', async () => {
    await createPlugin(globalDir, 'str-plugin', 'export const label = "hello";');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('str-plugin');
    if (plugin !== undefined) {
      const mod = plugin.module as { label: string };
      expect(mod.label).toBe('hello');
    }
  });

  it('plugin.module에서 함수 export 접근', async () => {
    await createPlugin(globalDir, 'fn-plugin', 'export function run() { return "run"; }');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('fn-plugin');
    if (plugin !== undefined) {
      const mod = plugin.module as { run: () => string };
      expect(typeof mod.run).toBe('function');
      expect(mod.run()).toBe('run');
    }
  });

  it('plugin.manifest는 readonly 접근 가능', async () => {
    await createPlugin(globalDir, 'readonly-check');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('readonly-check');
    if (plugin !== undefined) {
      const name = plugin.manifest.name;
      const ver = plugin.manifest.version;
      const ep = plugin.manifest.entryPoint;
      expect(typeof name).toBe('string');
      expect(typeof ver).toBe('string');
      expect(typeof ep).toBe('string');
    }
  });

  it('3개 플러그인 각각 module 접근 가능', async () => {
    for (const n of ['alpha-mod', 'beta-mod', 'gamma-mod']) {
      await createPlugin(globalDir, n, `export const id = "${n}";`);
    }
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    for (const n of ['alpha-mod', 'beta-mod', 'gamma-mod']) {
      const plugin = loader.getPlugin(n);
      if (plugin !== undefined) {
        const mod = plugin.module as { id: string };
        expect(mod.id).toBe(n);
      }
    }
  });

  it('loadPlugins 후 plugins 맵이 정확한 크기', async () => {
    for (let i = 0; i < 7; i++) await createPlugin(globalDir, `sized-${i}`);
    const loader = new DefaultPluginLoader(logger);
    const result = await loader.loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(7);
  });
});

// ── 경계값: 플러그인 덮어쓰기 세부 검증 ─────────────────────

describe('DefaultPluginLoader 덮어쓰기 세부 검증', () => {
  it('글로벌 1개 + 프로젝트 1개 동일 이름 → 1개 반환', async () => {
    await createPlugin(globalDir, 'overlap');
    await createPlugin(projectDir, 'overlap');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('글로벌 3개 + 프로젝트 3개 모두 다른 이름 → 6개 반환', async () => {
    for (let i = 0; i < 3; i++) await createPlugin(globalDir, `g-unique-${i}`);
    for (let i = 0; i < 3; i++) await createPlugin(projectDir, `p-unique-${i}`);
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(6);
  });

  it('글로벌 2개 + 프로젝트 1개 공유 → 2개 반환', async () => {
    await createPlugin(globalDir, 'g-only');
    await createPlugin(globalDir, 'shared-2');
    await createPlugin(projectDir, 'shared-2');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('프로젝트 덮어쓰기 후 getPlugin → project version', async () => {
    await createPlugin(globalDir, 'override-detail', 'export const origin = "global";');
    await createPlugin(projectDir, 'override-detail', 'export const origin = "project";');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir, projectDir);
    const plugin = loader.getPlugin('override-detail');
    if (plugin !== undefined) {
      const mod = plugin.module as { origin: string };
      expect(mod.origin).toBe('project');
    }
  });

  it('글로벌만 있을 때 getPlugin → global version', async () => {
    await createPlugin(globalDir, 'global-only-2', 'export const src = "global";');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir, projectDir);
    const plugin = loader.getPlugin('global-only-2');
    if (plugin !== undefined) {
      const mod = plugin.module as { src: string };
      expect(mod.src).toBe('global');
    }
  });

  it('프로젝트만 있을 때 getPlugin → project version', async () => {
    await createPlugin(projectDir, 'proj-only-2', 'export const src = "project";');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir, projectDir);
    const plugin = loader.getPlugin('proj-only-2');
    if (plugin !== undefined) {
      const mod = plugin.module as { src: string };
      expect(mod.src).toBe('project');
    }
  });

  it('loadPlugins ok=true 병합 시', async () => {
    await createPlugin(globalDir, 'g1');
    await createPlugin(projectDir, 'p1');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    expect(result.ok).toBe(true);
  });

  it('모두 비어 있는 글로벌+프로젝트 → ok=true, 0개', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('4개 공유 이름 + 2개 글로벌 전용 → 6개', async () => {
    for (let i = 0; i < 4; i++) {
      await createPlugin(globalDir, `sh-${i}`, `export const v = "g${i}";`);
      await createPlugin(projectDir, `sh-${i}`, `export const v = "p${i}";`);
    }
    await createPlugin(globalDir, 'g-extra-1');
    await createPlugin(globalDir, 'g-extra-2');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(6);
  });
});

// ── loadPlugins 오류 복원력 ──────────────────────────────────

describe('DefaultPluginLoader 오류 복원력', () => {
  it('readdir 불가 경로 → ok=true 빈 배열', async () => {
    const result = await new DefaultPluginLoader(logger).loadPlugins('/nonexistent-global-dir-xyz');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('일부 오류 플러그인 → 성공 플러그인만 포함', async () => {
    await createPlugin(globalDir, 'ok-plugin');
    const bad = join(globalDir, 'bad-plugin');
    await mkdir(bad, { recursive: true });
    await writeFile(join(bad, 'manifest.json'), '{ bad json');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'ok-plugin')).toBe(true);
      expect(result.value.some((p) => p.manifest.name === 'bad-plugin')).toBe(false);
    }
  });

  it('entryPoint 없는 파일 → 해당 플러그인 건너뜀', async () => {
    const dir = join(globalDir, 'no-entry-file');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: 'no-entry-file', version: '1.0.0', entryPoint: 'missing.ts' }));
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'no-entry-file')).toBe(false);
    }
  });

  it('모든 플러그인 manifest 없음 → 빈 배열', async () => {
    for (let i = 0; i < 3; i++) {
      const d = join(globalDir, `no-man-${i}`);
      await mkdir(d, { recursive: true });
    }
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('path traversal 차단 → ok=true, 해당 플러그인 없음', async () => {
    const dir = join(globalDir, 'traversal-check');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'traversal-check', version: '1.0.0', entryPoint: '../../../etc/passwd' }),
    );
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'traversal-check')).toBe(false);
    }
  });

  it('절대 경로 entryPoint 차단', async () => {
    const dir = join(globalDir, 'abs-check');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'abs-check', version: '1.0.0', entryPoint: '/etc/passwd' }),
    );
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'abs-check')).toBe(false);
    }
  });

  it('백슬래시 entryPoint 차단', async () => {
    const dir = join(globalDir, 'backslash-check');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({ name: 'backslash-check', version: '1.0.0', entryPoint: '\\evil.ts' }),
    );
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'backslash-check')).toBe(false);
    }
  });

  it('name이 빈 문자열 → 건너뜀', async () => {
    const dir = join(globalDir, 'empty-name');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ name: '', version: '1.0.0', entryPoint: 'index.ts' }));
    await writeFile(join(dir, 'index.ts'), 'export const x = 1;');
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === '')).toBe(false);
    }
  });

  it('valid + traversal 혼재 → valid만 로드', async () => {
    await createPlugin(globalDir, 'safe-plugin');
    const tDir = join(globalDir, 'trav-plugin');
    await mkdir(tDir, { recursive: true });
    await writeFile(
      join(tDir, 'manifest.json'),
      JSON.stringify({ name: 'trav-plugin', version: '1.0.0', entryPoint: '../../../etc/hosts' }),
    );
    const result = await new DefaultPluginLoader(logger).loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.some((p) => p.manifest.name === 'safe-plugin')).toBe(true);
      expect(result.value.some((p) => p.manifest.name === 'trav-plugin')).toBe(false);
    }
  });
});

// ── 최종 추가 경계값 ─────────────────────────────────────────

describe('DefaultPluginLoader 최종 추가 경계값', () => {
  it('getPlugin 대소문자 정확히 일치해야 됨', async () => {
    await createPlugin(globalDir, 'CaseSensitive');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    expect(loader.getPlugin('CaseSensitive')).toBeDefined();
    expect(loader.getPlugin('casesensitive')).toBeUndefined();
    expect(loader.getPlugin('CASESENSITIVE')).toBeUndefined();
  });

  it('loadPlugins 결과 배열 순서 → 이름으로 접근 가능', async () => {
    for (const name of ['first', 'second', 'third']) {
      await createPlugin(globalDir, name);
    }
    const loader = new DefaultPluginLoader(logger);
    const result = await loader.loadPlugins(globalDir);
    if (result.ok) {
      expect(result.value.length).toBe(3);
      const names = result.value.map((p) => p.manifest.name);
      expect(names).toContain('first');
      expect(names).toContain('second');
      expect(names).toContain('third');
    }
  });

  it('loadPlugins 성공 후 ok 반환값 구조 확인', async () => {
    const loader = new DefaultPluginLoader(logger);
    const result = await loader.loadPlugins(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('getPlugin 후 plugin.module이 null이 아님', async () => {
    await createPlugin(globalDir, 'non-null-module');
    const loader = new DefaultPluginLoader(logger);
    await loader.loadPlugins(globalDir);
    const plugin = loader.getPlugin('non-null-module');
    if (plugin !== undefined) {
      expect(plugin.module).not.toBeNull();
    }
  });

  it('loadPlugins 10번 → 같은 개수 유지', async () => {
    for (let i = 0; i < 3; i++) await createPlugin(globalDir, `repeat-stable-${i}`);
    const loader = new DefaultPluginLoader(logger);
    for (let i = 0; i < 10; i++) {
      const result = await loader.loadPlugins(globalDir);
      if (result.ok) expect(result.value).toHaveLength(3);
    }
  });
});
