/**
 * Plugin Manager — 플러그인 라이프사이클 관리 / Plugin lifecycle manager
 *
 * @description
 * KR: v2 플러그인의 로드, 초기화, Phase hook 실행, 해제를 관리한다.
 *     DefaultPluginLoader를 사용해 파일 시스템에서 플러그인을 로드하고,
 *     PluginContext를 생성하여 각 플러그인에 주입한다.
 * EN: Manages loading, initialization, phase hook execution, and teardown of v2 plugins.
 *     Uses DefaultPluginLoader to load from filesystem, creates PluginContext for each plugin.
 */

import type { Logger } from 'core/logger.js';
import { DefaultPluginContext } from 'core/plugin-context.js';
import type { PluginEventListener } from 'core/plugin-context.js';
import type { PluginManifest } from 'core/plugin-loader.js';
import { DefaultPluginLoader } from 'core/plugin-loader.js';
import type {
  AdevPlugin,
  LoadedPluginV2,
  PhaseChangeInfo,
  PluginCompletionResult,
  PluginConfigAccess,
  PluginContext,
  PluginManifestV2,
} from 'core/plugin-types.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── PluginManager ───────────────────────────────────────────────

/**
 * 플러그인 라이프사이클 매니저 / Plugin lifecycle manager
 *
 * @description
 * KR: 플러그인을 로드하고, 초기화하고, Phase hook을 실행하고, 해제한다.
 *     v1 manifest도 v2로 자동 업그레이드하여 하위 호환성을 유지한다.
 * EN: Loads, initializes, executes phase hooks, and destroys plugins.
 *     Auto-upgrades v1 manifests to v2 for backward compatibility.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param configAccess - 플러그인 설정 접근 / Plugin config access
 * @param eventListener - 이벤트 리스너 (선택) / Event listener (optional)
 *
 * @example
 * const manager = new PluginManager(logger, configAccess);
 * await manager.loadAndInitialize('~/.adev/plugins', '/project/.adev/plugins');
 * await manager.onPhaseChange({ from: null, to: 'DESIGN', featureId: 'feat-1' });
 * await manager.destroyAll();
 */
export class PluginManager {
  private readonly plugins = new Map<string, LoadedPluginV2>();
  private readonly loader: DefaultPluginLoader;
  private readonly logger: Logger;
  private readonly configAccess: PluginConfigAccess;
  private readonly eventListener: PluginEventListener | undefined;

  constructor(
    logger: Logger,
    configAccess: PluginConfigAccess,
    eventListener?: PluginEventListener,
  ) {
    this.logger = logger.child({ module: 'PluginManager' });
    this.loader = new DefaultPluginLoader(this.logger);
    this.configAccess = configAccess;
    this.eventListener = eventListener;
  }

  /**
   * 플러그인을 로드하고 초기화한다 / Load and initialize plugins
   *
   * @param globalDir - 글로벌 플러그인 디렉토리 / Global plugin directory
   * @param projectDir - 프로젝트 플러그인 디렉토리 (선택) / Project plugin directory
   * @returns 로드된 플러그인 수 / Number of loaded plugins
   */
  async loadAndInitialize(globalDir: string, projectDir?: string): Promise<Result<number>> {
    const loadResult = await this.loader.loadPlugins(globalDir, projectDir);
    if (!loadResult.ok) return loadResult;

    for (const rawPlugin of loadResult.value) {
      const manifest = upgradeManifest(rawPlugin.manifest);
      const plugin = extractAdevPlugin(rawPlugin.module);

      if (!plugin) {
        this.logger.warn('플러그인에 AdevPlugin export가 없음, 건너뜀', {
          name: manifest.name,
        });
        continue;
      }

      const loaded: LoadedPluginV2 = {
        manifest,
        plugin,
        status: 'loaded',
      };

      this.plugins.set(manifest.name, loaded);

      // WHY: 초기화를 개별 try-catch로 감싸서 한 플러그인 실패가 다른 플러그인에 영향하지 않음
      const ctx = this.createContext(manifest);
      try {
        if (plugin.onInit) {
          await plugin.onInit(ctx);
        }
        loaded.status = 'initialized';
        this.logger.info('플러그인 초기화 완료', {
          name: manifest.name,
          version: manifest.version,
        });
      } catch (error: unknown) {
        loaded.status = 'error';
        this.logger.error('플러그인 초기화 실패', {
          name: manifest.name,
          error: String(error),
        });
      }
    }

    return ok(this.plugins.size);
  }

  /**
   * 모든 활성 플러그인의 Phase 전환 hook을 실행한다 / Execute phase change hooks
   *
   * @param info - Phase 전환 정보 / Phase transition info
   */
  async onPhaseChange(info: PhaseChangeInfo): Promise<void> {
    for (const [name, loaded] of this.plugins) {
      if (loaded.status !== 'initialized') continue;
      if (!loaded.plugin.onPhaseChange) continue;

      const ctx = this.createContext(loaded.manifest);
      try {
        await loaded.plugin.onPhaseChange(ctx, info);
      } catch (error: unknown) {
        this.logger.error('플러그인 onPhaseChange 실패', {
          plugin: name,
          phase: info.to,
          error: String(error),
        });
      }
    }
  }

  /**
   * 모든 활성 플러그인의 완료 hook을 실행한다 / Execute completion hooks
   *
   * @param result - 파이프라인 완료 결과 / Pipeline completion result
   */
  async onComplete(result: PluginCompletionResult): Promise<void> {
    for (const [name, loaded] of this.plugins) {
      if (loaded.status !== 'initialized') continue;
      if (!loaded.plugin.onComplete) continue;

      const ctx = this.createContext(loaded.manifest);
      try {
        await loaded.plugin.onComplete(ctx, result);
      } catch (error: unknown) {
        this.logger.error('플러그인 onComplete 실패', {
          plugin: name,
          error: String(error),
        });
      }
    }
  }

  /**
   * 모든 플러그인을 해제한다 / Destroy all plugins
   */
  async destroyAll(): Promise<void> {
    for (const [name, loaded] of this.plugins) {
      if (loaded.status === 'destroyed') continue;

      const ctx = this.createContext(loaded.manifest);
      try {
        if (loaded.plugin.onDestroy) {
          await loaded.plugin.onDestroy(ctx);
        }
      } catch (error: unknown) {
        this.logger.warn('플러그인 onDestroy 실패', {
          plugin: name,
          error: String(error),
        });
      }
      loaded.status = 'destroyed';
    }

    this.plugins.clear();
    this.logger.info('모든 플러그인 해제 완료');
  }

  /**
   * 이름으로 로드된 플러그인을 조회한다 / Get loaded plugin by name
   *
   * @param name - 플러그인 이름 / Plugin name
   * @returns 로드된 플러그인 또는 undefined / Loaded plugin or undefined
   */
  getPlugin(name: string): LoadedPluginV2 | undefined {
    return this.plugins.get(name);
  }

  /**
   * 로드된 모든 플러그인 목록을 반환한다 / List all loaded plugins
   */
  listPlugins(): LoadedPluginV2[] {
    return [...this.plugins.values()];
  }

  // ── 내부 메서드 / Private methods ────────────────────────────

  /** 플러그인별 PluginContext를 생성한다 / Create per-plugin PluginContext */
  private createContext(manifest: PluginManifestV2): PluginContext {
    return new DefaultPluginContext(manifest, this.logger, this.configAccess, this.eventListener);
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────────

/**
 * v1 manifest를 v2로 업그레이드한다 / Upgrade v1 manifest to v2
 *
 * @description
 * KR: v1 필드는 그대로 유지하고, v2 전용 필드를 기본값으로 추가한다.
 * EN: Preserves v1 fields and adds v2-specific fields with defaults.
 */
function upgradeManifest(v1: PluginManifest): PluginManifestV2 {
  return {
    name: v1.name,
    version: v1.version,
    description: v1.description,
    entryPoint: v1.entryPoint,
    // WHY: v1 manifest에는 없는 v2 필드를 기본값으로 채움
    capabilities: [],
    permissions: [],
    dependencies: [],
  };
}

/**
 * 모듈에서 AdevPlugin을 추출한다 / Extract AdevPlugin from module
 *
 * @description
 * KR: default export 또는 named export에서 AdevPlugin 형태의 객체를 찾는다.
 * EN: Finds AdevPlugin-shaped object from default or named exports.
 */
function extractAdevPlugin(module: unknown): AdevPlugin | null {
  if (typeof module !== 'object' || module === null) return null;

  const mod = module as Record<string, unknown>;

  // WHY: default export 우선 확인
  if (isAdevPlugin(mod.default)) return mod.default;

  // WHY: named export 'plugin' 확인
  if (isAdevPlugin(mod.plugin)) return mod.plugin;

  // WHY: 모듈 자체가 AdevPlugin 형태인 경우
  if (isAdevPlugin(module)) return module;

  return null;
}

/**
 * AdevPlugin 타입 가드 / AdevPlugin type guard
 *
 * @description
 * KR: 최소 하나의 lifecycle hook이 함수인지 확인한다.
 * EN: Checks if at least one lifecycle hook is a function.
 */
function isAdevPlugin(value: unknown): value is AdevPlugin {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;

  return (
    typeof obj.onInit === 'function' ||
    typeof obj.onPhaseChange === 'function' ||
    typeof obj.onComplete === 'function' ||
    typeof obj.onDestroy === 'function'
  );
}
