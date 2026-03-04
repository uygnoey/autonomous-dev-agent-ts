/**
 * MCP 설정 로더 / MCP configuration loader
 *
 * @description
 * KR: 파일 시스템에서 mcp.json을 읽어 McpServerConfig 배열로 변환한다.
 *     글로벌(~/.adev/mcp/)과 프로젝트(/project/.adev/mcp/)를 병합하며,
 *     이름 충돌 시 프로젝트 설정이 우선한다.
 * EN: Reads mcp.json files from filesystem and converts to McpServerConfig arrays.
 *     Merges global (~/.adev/mcp/) and project (/project/.adev/mcp/) configs,
 *     with project overriding global on name collision.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { McpError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { McpServerConfig } from './types.js';

// ── McpLoader ────────────────────────────────────────────────

/**
 * MCP 설정 파일 로더 / MCP configuration file loader
 *
 * @description
 * KR: mcp.json 파일을 디렉토리에서 스캔하여 McpServerConfig를 로드한다.
 * EN: Scans directories for mcp.json files and loads McpServerConfig entries.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const loader = new McpLoader(logger);
 * const result = await loader.loadAndMerge('~/.adev/mcp', '/project/.adev/mcp');
 */
export class McpLoader {
  constructor(private readonly logger: Logger) {}

  /**
   * 디렉토리에서 mcp.json 파일들을 스캔한다 / Scan directory for mcp.json files
   *
   * @description
   * KR: 지정 디렉토리의 하위 폴더에서 mcp.json을 찾아 서버 설정을 로드한다.
   * EN: Finds mcp.json in subdirectories and loads server configurations.
   *
   * @param dirPath - 스캔할 디렉토리 경로 / Directory path to scan
   * @returns 서버 설정 배열 / Array of server configs
   */
  async loadFromDirectory(dirPath: string): Promise<Result<McpServerConfig[]>> {
    if (hasPathTraversal(dirPath)) {
      return err(
        new McpError(
          'mcp_path_traversal',
          `경로에 traversal이 포함됨 / Path traversal detected: ${dirPath}`,
        ),
      );
    }

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      // WHY: 디렉토리가 없으면 설정 0개 — 에러가 아님
      this.logger.debug('MCP 디렉토리 없음, 빈 목록 반환', { dir: dirPath });
      return ok([]);
    }

    const configs: McpServerConfig[] = [];

    for (const entry of entries) {
      const mcpJsonPath = join(dirPath, entry, 'mcp.json');

      try {
        const config = await this.loadManifest(mcpJsonPath);
        if (config) {
          configs.push(...config);
        }
      } catch (error: unknown) {
        this.logger.warn('MCP 설정 로드 실패, 건너뜀', {
          path: mcpJsonPath,
          error: String(error),
        });
      }
    }

    this.logger.debug('MCP 설정 로드 완료', { dir: dirPath, count: configs.length });
    return ok(configs);
  }

  /**
   * 글로벌 + 프로젝트 설정을 병합한다 / Merge global and project configurations
   *
   * @description
   * KR: 글로벌 디렉토리를 먼저 로드한 후 프로젝트 디렉토리를 로드한다.
   *     동일 이름 충돌 시 프로젝트 설정이 글로벌을 덮어쓴다.
   * EN: Loads global directory first, then project directory.
   *     Project config overrides global on name collision.
   *
   * @param globalDir - 글로벌 설정 디렉토리 / Global config directory
   * @param projectDir - 프로젝트 설정 디렉토리 (선택) / Project config directory (optional)
   * @returns 병합된 서버 설정 배열 / Merged array of server configs
   */
  async loadAndMerge(globalDir: string, projectDir?: string): Promise<Result<McpServerConfig[]>> {
    const merged = new Map<string, McpServerConfig>();

    const globalResult = await this.loadFromDirectory(globalDir);
    if (!globalResult.ok) return globalResult;

    for (const config of globalResult.value) {
      merged.set(config.name, config);
    }

    if (projectDir) {
      const projectResult = await this.loadFromDirectory(projectDir);
      if (!projectResult.ok) return projectResult;

      // WHY: 프로젝트 설정이 동일 이름의 글로벌 설정을 덮어씀
      for (const config of projectResult.value) {
        merged.set(config.name, config);
      }
    }

    return ok([...merged.values()]);
  }

  /**
   * mcp.json 파일을 읽고 검증한다 / Read and validate mcp.json file
   *
   * @param path - mcp.json 파일 경로 / Path to mcp.json
   * @returns 유효한 McpServerConfig 배열 또는 null / Valid configs or null
   */
  private async loadManifest(path: string): Promise<McpServerConfig[] | null> {
    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) return null;

      const parsed: unknown = await file.json();

      if (!isValidManifest(parsed)) {
        this.logger.warn('유효하지 않은 mcp.json', { path });
        return null;
      }

      // WHY: 각 서버 설정을 개별 검증하여 잘못된 항목만 건너뜀
      const valid = parsed.servers.filter((server): server is McpServerConfig =>
        isValidServerConfig(server),
      );

      return valid.length > 0 ? valid : null;
    } catch {
      return null;
    }
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────

/** mcp.json 구조 검증 타입 가드 / Validate mcp.json structure */
function isValidManifest(value: unknown): value is { servers: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.servers);
}

/** McpServerConfig 검증 타입 가드 / Validate server config structure */
function isValidServerConfig(value: unknown): value is McpServerConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    obj.name.length > 0 &&
    typeof obj.command === 'string' &&
    obj.command.length > 0 &&
    Array.isArray(obj.args) &&
    typeof obj.enabled === 'boolean'
  );
}

/** path traversal 공격 감지 / Detect path traversal attacks */
function hasPathTraversal(path: string): boolean {
  return path.includes('..');
}
