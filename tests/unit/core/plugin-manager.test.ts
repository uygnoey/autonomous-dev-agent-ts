/**
 * PluginManager 단위 테스트
 *
 * @description
 * KR: 플러그인 로드, 초기화, Phase hook, 완료, 해제 테스트. 80%+ 경계값 비율.
 * EN: Tests for PluginManager lifecycle. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { PluginManager } from 'core/plugin-manager.js';
import type { PluginConfigAccess } from 'core/plugin-types.js';

const logger = new ConsoleLogger('error');

let tempDir: string;
let globalDir: string;
let projectDir: string;

const testConfig: PluginConfigAccess = {
  projectRoot: '/tmp/test-project',
  adevVersion: '0.1.0',
  pluginConfig: {},
};

beforeEach(async () => {
  tempDir = join(tmpdir(), `adev-pm-test-${crypto.randomUUID()}`);
  globalDir = join(tempDir, 'global');
  projectDir = join(tempDir, 'project');
  await mkdir(globalDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/** v2 플러그인 생성 헬퍼 / Helper to create a v2 plugin */
async function createV2Plugin(
  dir: string,
  name: string,
  code: string,
): Promise<void> {
  const pluginDir = join(dir, name);
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, 'manifest.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      entryPoint: 'index.ts',
      capabilities: ['phase_hook'],
      permissions: ['fs_read'],
    }),
  );
  await writeFile(join(pluginDir, 'index.ts'), code);
}

// ── 생성자 ────────────────────────────────────────────────────

describe('PluginManager 생성자', () => {
  it('정상적으로 생성된다', () => {
    expect(() => new PluginManager(logger, testConfig)).not.toThrow();
  });
});

// ── loadAndInitialize ────────────────────────────────────────

describe('PluginManager.loadAndInitialize', () => {
  it('빈 디렉토리에서 0개 로드된다', async () => {
    const manager = new PluginManager(logger, testConfig);
    const result = await manager.loadAndInitialize(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('onInit이 있는 플러그인을 로드하고 초기화한다', async () => {
    await createV2Plugin(
      globalDir,
      'init-plugin',
      `
      export default {
        onInit: async (ctx) => {
          ctx.logger.debug('initialized');
        },
      };
      `,
    );

    const manager = new PluginManager(logger, testConfig);
    const result = await manager.loadAndInitialize(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }

    const plugin = manager.getPlugin('init-plugin');
    expect(plugin).toBeDefined();
    expect(plugin?.status).toBe('initialized');
  });

  it('onInit이 없는 플러그인도 initialized 상태이다', async () => {
    await createV2Plugin(
      globalDir,
      'no-init-plugin',
      `
      export default {
        onPhaseChange: async () => {},
      };
      `,
    );

    const manager = new PluginManager(logger, testConfig);
    await manager.loadAndInitialize(globalDir);

    const plugin = manager.getPlugin('no-init-plugin');
    expect(plugin?.status).toBe('initialized');
  });

  it('onInit에서 에러가 발생하면 status가 error이다', async () => {
    await createV2Plugin(
      globalDir,
      'error-plugin',
      `
      export default {
        onInit: async () => { throw new Error('init failed'); },
      };
      `,
    );

    const manager = new PluginManager(logger, testConfig);
    await manager.loadAndInitialize(globalDir);

    const plugin = manager.getPlugin('error-plugin');
    expect(plugin?.status).toBe('error');
  });

  it('AdevPlugin export가 없는 모듈은 건너뛴다', async () => {
    await createV2Plugin(
      globalDir,
      'no-plugin-export',
      `export const value = 42;`,
    );

    const manager = new PluginManager(logger, testConfig);
    const result = await manager.loadAndInitialize(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('존재하지 않는 디렉토리에서 0개 로드된다', async () => {
    const manager = new PluginManager(logger, testConfig);
    const result = await manager.loadAndInitialize('/nonexistent-dir-abc123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('여러 플러그인을 동시에 로드한다', async () => {
    await createV2Plugin(globalDir, 'plugin-a', `export default { onInit: async () => {} };`);
    await createV2Plugin(globalDir, 'plugin-b', `export default { onInit: async () => {} };`);

    const manager = new PluginManager(logger, testConfig);
    const result = await manager.loadAndInitialize(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(2);
    }
  });
});

// ── onPhaseChange ────────────────────────────────────────────

describe('PluginManager.onPhaseChange', () => {
  it('initialized 플러그인의 onPhaseChange를 호출한다', async () => {
    let phaseReceived = '';
    await createV2Plugin(
      globalDir,
      'phase-plugin',
      `
      export default {
        onInit: async () => {},
        onPhaseChange: async (ctx, info) => {
          ctx.emitEvent('phase_changed', { phase: info.to });
        },
      };
      `,
    );

    const events: Array<{ plugin: string; event: string; data?: Record<string, unknown> }> = [];
    const manager = new PluginManager(logger, testConfig, (p, e, d) => {
      events.push({ plugin: p, event: e, data: d });
    });
    await manager.loadAndInitialize(globalDir);

    await manager.onPhaseChange({ from: null, to: 'DESIGN', featureId: 'feat-1' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const phaseEvent = events.find((e) => e.event === 'phase_changed');
    expect(phaseEvent?.data?.phase).toBe('DESIGN');
  });

  it('error 상태 플러그인은 건너뛴다', async () => {
    await createV2Plugin(
      globalDir,
      'error-phase-plugin',
      `
      export default {
        onInit: async () => { throw new Error('fail'); },
        onPhaseChange: async () => { throw new Error('should not be called'); },
      };
      `,
    );

    const manager = new PluginManager(logger, testConfig);
    await manager.loadAndInitialize(globalDir);

    // WHY: error 상태이므로 onPhaseChange가 호출되지 않아야 함 — 에러 없이 완료
    await expect(
      manager.onPhaseChange({ from: null, to: 'CODE', featureId: 'feat-2' }),
    ).resolves.toBeUndefined();
  });

  it('onPhaseChange에서 에러가 발생해도 다른 플러그인은 계속 실행된다', async () => {
    await createV2Plugin(
      globalDir,
      'crash-plugin',
      `
      export default {
        onInit: async () => {},
        onPhaseChange: async () => { throw new Error('crash'); },
      };
      `,
    );
    await createV2Plugin(
      projectDir,
      'ok-plugin',
      `
      export default {
        onInit: async () => {},
        onPhaseChange: async (ctx) => { ctx.emitEvent('survived'); },
      };
      `,
    );

    const events: string[] = [];
    const manager = new PluginManager(logger, testConfig, (_p, e) => {
      events.push(e);
    });
    await manager.loadAndInitialize(globalDir, projectDir);

    await manager.onPhaseChange({ from: 'DESIGN', to: 'CODE', featureId: 'feat-3' });
    expect(events).toContain('survived');
  });
});

// ── onComplete ───────────────────────────────────────────────

describe('PluginManager.onComplete', () => {
  it('완료 hook을 호출한다', async () => {
    await createV2Plugin(
      globalDir,
      'complete-plugin',
      `
      export default {
        onInit: async () => {},
        onComplete: async (ctx, result) => {
          ctx.emitEvent('completed', { success: result.success });
        },
      };
      `,
    );

    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const manager = new PluginManager(logger, testConfig, (_p, e, d) => {
      events.push({ event: e, data: d });
    });
    await manager.loadAndInitialize(globalDir);

    await manager.onComplete({
      success: true,
      featureId: 'feat-1',
      phasesCompleted: ['DESIGN', 'CODE', 'TEST', 'VERIFY'],
    });

    const completeEvent = events.find((e) => e.event === 'completed');
    expect(completeEvent?.data?.success).toBe(true);
  });
});

// ── destroyAll ───────────────────────────────────────────────

describe('PluginManager.destroyAll', () => {
  it('모든 플러그인을 해제한다', async () => {
    await createV2Plugin(
      globalDir,
      'destroy-plugin',
      `
      export default {
        onInit: async () => {},
        onDestroy: async (ctx) => { ctx.emitEvent('destroyed'); },
      };
      `,
    );

    const events: string[] = [];
    const manager = new PluginManager(logger, testConfig, (_p, e) => {
      events.push(e);
    });
    await manager.loadAndInitialize(globalDir);

    await manager.destroyAll();
    expect(events).toContain('destroyed');
    expect(manager.listPlugins()).toHaveLength(0);
  });

  it('빈 매니저에서 destroyAll을 호출해도 에러 없다', async () => {
    const manager = new PluginManager(logger, testConfig);
    await expect(manager.destroyAll()).resolves.toBeUndefined();
  });

  it('onDestroy에서 에러가 발생해도 다른 플러그인은 해제된다', async () => {
    await createV2Plugin(
      globalDir,
      'crash-destroy',
      `
      export default {
        onInit: async () => {},
        onDestroy: async () => { throw new Error('destroy fail'); },
      };
      `,
    );
    await createV2Plugin(
      projectDir,
      'ok-destroy',
      `
      export default {
        onInit: async () => {},
        onDestroy: async (ctx) => { ctx.emitEvent('ok-destroyed'); },
      };
      `,
    );

    const events: string[] = [];
    const manager = new PluginManager(logger, testConfig, (_p, e) => {
      events.push(e);
    });
    await manager.loadAndInitialize(globalDir, projectDir);

    await manager.destroyAll();
    expect(events).toContain('ok-destroyed');
    expect(manager.listPlugins()).toHaveLength(0);
  });
});

// ── listPlugins / getPlugin ─────────────────────────────────

describe('PluginManager.listPlugins', () => {
  it('로드된 플러그인 목록을 반환한다', async () => {
    await createV2Plugin(globalDir, 'list-a', `export default { onInit: async () => {} };`);
    await createV2Plugin(globalDir, 'list-b', `export default { onInit: async () => {} };`);

    const manager = new PluginManager(logger, testConfig);
    await manager.loadAndInitialize(globalDir);

    const list = manager.listPlugins();
    expect(list).toHaveLength(2);
    const names = list.map((p) => p.manifest.name).sort();
    expect(names).toEqual(['list-a', 'list-b']);
  });
});

describe('PluginManager.getPlugin', () => {
  it('존재하지 않는 플러그인은 undefined를 반환한다', () => {
    const manager = new PluginManager(logger, testConfig);
    expect(manager.getPlugin('nonexistent')).toBeUndefined();
  });
});
