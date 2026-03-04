import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DefaultPluginLoader } from '../../../src/core/plugin-loader.js';

describe('DefaultPluginLoader', () => {
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

  // ── 기본 로드 ───────────────────────────────────────────────

  describe('loadPlugins', () => {
    it('플러그인을 정상적으로 로드한다', async () => {
      await createPlugin(globalDir, 'test-plugin');
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.manifest.name).toBe('test-plugin');
      }
    });

    it('여러 플러그인을 로드한다', async () => {
      await createPlugin(globalDir, 'plugin-a');
      await createPlugin(globalDir, 'plugin-b');
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });

    it('존재하지 않는 디렉토리는 빈 배열을 반환한다', async () => {
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(join(tempDir, 'nonexistent'));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('빈 디렉토리는 빈 배열을 반환한다', async () => {
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  // ── 프로젝트 우선 병합 ──────────────────────────────────────

  describe('글로벌 + 프로젝트 병합', () => {
    it('프로젝트 플러그인이 동일 이름의 글로벌 플러그인을 덮어쓴다', async () => {
      await createPlugin(globalDir, 'shared', 'export const source = "global";');
      await createPlugin(projectDir, 'shared', 'export const source = "project";');
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(globalDir, projectDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        const mod = result.value[0]?.module as { source: string };
        expect(mod.source).toBe('project');
      }
    });

    it('글로벌과 프로젝트 고유 플러그인을 모두 로드한다', async () => {
      await createPlugin(globalDir, 'global-only');
      await createPlugin(projectDir, 'project-only');
      const loader = new DefaultPluginLoader(logger);

      const result = await loader.loadPlugins(globalDir, projectDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });
  });

  // ── getPlugin ───────────────────────────────────────────────

  describe('getPlugin', () => {
    it('로드된 플러그인을 이름으로 조회한다', async () => {
      await createPlugin(globalDir, 'my-plugin');
      const loader = new DefaultPluginLoader(logger);
      await loader.loadPlugins(globalDir);

      const plugin = loader.getPlugin('my-plugin');

      expect(plugin).toBeDefined();
      expect(plugin?.manifest.name).toBe('my-plugin');
    });

    it('존재하지 않는 플러그인은 undefined를 반환한다', async () => {
      const loader = new DefaultPluginLoader(logger);
      await loader.loadPlugins(globalDir);

      expect(loader.getPlugin('nonexistent')).toBeUndefined();
    });
  });

  // ── edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('manifest.json이 없는 폴더는 건너뛴다', async () => {
      const pluginDir = join(globalDir, 'no-manifest');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'index.ts'), 'export const x = 1;');

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('깨진 manifest.json은 건너뛴다', async () => {
      const pluginDir = join(globalDir, 'broken');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'manifest.json'), '{broken!!}');

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('필수 필드가 누락된 manifest.json은 건너뛴다', async () => {
      const pluginDir = join(globalDir, 'invalid');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'manifest.json'),
        JSON.stringify({ name: 'test' }), // version, entryPoint 누락
      );

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('path traversal이 포함된 entryPoint를 거부한다', async () => {
      const pluginDir = join(globalDir, 'traversal');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'traversal',
          version: '1.0.0',
          entryPoint: '../../../etc/passwd',
        }),
      );

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('절대 경로 entryPoint를 거부한다', async () => {
      const pluginDir = join(globalDir, 'abs-path');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'abs-path',
          version: '1.0.0',
          entryPoint: '/etc/passwd',
        }),
      );

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('entryPoint 파일이 존재하지 않으면 건너뛴다', async () => {
      const pluginDir = join(globalDir, 'no-entry');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'manifest.json'),
        JSON.stringify({
          name: 'no-entry',
          version: '1.0.0',
          entryPoint: 'nonexistent.ts',
        }),
      );

      const loader = new DefaultPluginLoader(logger);
      const result = await loader.loadPlugins(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });

    it('loadPlugins를 두 번 호출하면 이전 결과를 초기화한다', async () => {
      await createPlugin(globalDir, 'first-load');
      const loader = new DefaultPluginLoader(logger);

      await loader.loadPlugins(globalDir);
      expect(loader.getPlugin('first-load')).toBeDefined();

      // 빈 디렉토리로 다시 로드
      const emptyDir = join(tempDir, 'empty');
      await mkdir(emptyDir, { recursive: true });
      await loader.loadPlugins(emptyDir);

      expect(loader.getPlugin('first-load')).toBeUndefined();
    });
  });
});
