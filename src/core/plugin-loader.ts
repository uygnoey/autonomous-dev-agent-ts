/**
 * 동적 플러그인 로더 / Dynamic plugin loader
 *
 * @description
 * ~/.adev/ 및 프로젝트별 .adev/ 디렉토리에서 커스텀 모듈을 동적으로 로드한다.
 * 글로벌 + 프로젝트 병합 시 프로젝트가 우선한다.
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConfigError } from './errors.js';
import type { Logger } from './logger.js';
import { err, ok } from './types.js';
import type { Result } from './types.js';

// ── 타입 정의 ────────────────────────────────────────────────

/** 플러그인 매니페스트 (manifest.json) */
export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly entryPoint: string;
}

/** 로드된 플러그인 */
export interface Plugin {
  readonly manifest: PluginManifest;
  readonly module: unknown;
}

/** 플러그인 로더 인터페이스 */
export interface PluginLoader {
  loadPlugins(globalDir: string, projectDir?: string): Promise<Result<Plugin[]>>;
  getPlugin(name: string): Plugin | undefined;
}

// ── DefaultPluginLoader ──────────────────────────────────────

/**
 * 기본 플러그인 로더 구현 / Default plugin loader implementation
 *
 * @param logger - 로거 인스턴스
 *
 * @example
 * const loader = new DefaultPluginLoader(logger);
 * await loader.loadPlugins('~/.adev/mcp', '/project/.adev/mcp');
 * const plugin = loader.getPlugin('my-custom');
 */
export class DefaultPluginLoader implements PluginLoader {
  private readonly plugins = new Map<string, Plugin>();

  constructor(private readonly logger: Logger) {}

  /**
   * 글로벌 + 프로젝트 디렉토리에서 플러그인을 로드한다 / Load plugins from directories
   *
   * @param globalDir - 글로벌 플러그인 디렉토리
   * @param projectDir - 프로젝트 플러그인 디렉토리 (선택, 우선)
   * @returns 로드된 플러그인 목록
   */
  async loadPlugins(globalDir: string, projectDir?: string): Promise<Result<Plugin[]>> {
    this.plugins.clear();

    const globalPlugins = await this.scanDirectory(globalDir);
    for (const plugin of globalPlugins) {
      this.plugins.set(plugin.manifest.name, plugin);
    }

    if (projectDir) {
      const projectPlugins = await this.scanDirectory(projectDir);
      // WHY: 프로젝트 플러그인이 동일 이름의 글로벌 플러그인을 덮어씀
      for (const plugin of projectPlugins) {
        this.plugins.set(plugin.manifest.name, plugin);
      }
    }

    return ok([...this.plugins.values()]);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 디렉토리를 스캔하여 플러그인을 로드한다
   *
   * 각 하위 폴더에서 manifest.json을 읽고, entryPoint를 dynamic import한다.
   * 로드 실패 시 해당 플러그인만 건너뛰고 경고 로그를 남긴다.
   */
  private async scanDirectory(dir: string): Promise<Plugin[]> {
    const plugins: Plugin[] = [];

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // WHY: 디렉토리가 없으면 플러그인 0개 — 에러가 아님
      return plugins;
    }

    for (const entry of entries) {
      const pluginDir = join(dir, entry);
      const manifestPath = join(pluginDir, 'manifest.json');

      try {
        const manifest = await this.loadManifest(manifestPath);
        if (!manifest) continue;

        if (hasPathTraversal(manifest.entryPoint)) {
          this.logger.warn('path traversal 시도 감지', {
            plugin: manifest.name,
            entryPoint: manifest.entryPoint,
          });
          continue;
        }

        const entryPath = resolve(pluginDir, manifest.entryPoint);
        const module: unknown = await import(entryPath);

        plugins.push({ manifest, module });
        this.logger.debug('플러그인 로드 완료', { name: manifest.name });
      } catch (error: unknown) {
        this.logger.warn('플러그인 로드 실패, 건너뜀', {
          dir: pluginDir,
          error: String(error),
        });
      }
    }

    return plugins;
  }

  /**
   * manifest.json을 읽고 검증한다
   *
   * @returns 유효한 PluginManifest 또는 null (파일 없거나 유효하지 않음)
   */
  private async loadManifest(path: string): Promise<PluginManifest | null> {
    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) return null;

      const parsed: unknown = await file.json();

      if (!isValidManifest(parsed)) {
        this.logger.warn('유효하지 않은 manifest.json', { path });
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────

/** manifest 구조 검증 타입 가드 */
function isValidManifest(value: unknown): value is PluginManifest {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.entryPoint === 'string' &&
    obj.name.length > 0 &&
    obj.entryPoint.length > 0
  );
}

/** path traversal 공격 감지 */
function hasPathTraversal(path: string): boolean {
  return path.includes('..') || path.startsWith('/') || path.startsWith('\\');
}
