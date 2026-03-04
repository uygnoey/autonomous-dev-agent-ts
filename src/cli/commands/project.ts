/**
 * project 명령 / Project command
 *
 * @description
 * KR: 프로젝트 레지스트리(~/.adev/projects.json)를 관리한다 (add, remove, list, switch).
 * EN: Manages project registry (~/.adev/projects.json) with add, remove, list, switch subcommands.
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { CliCommand, CliOptions, ProjectInfo, ProjectRegistry } from '../types.js';

// ── 경로 헬퍼 / Path Helpers ───────────────────────────────────

/**
 * 기본 글로벌 adev 디렉토리 경로 / Default global adev directory path
 */
function getDefaultGlobalAdevDir(): string {
  return resolve(homedir(), '.adev');
}

// ── ProjectCommand ─────────────────────────────────────────────

/**
 * 프로젝트 관리 명령 / Project management command
 *
 * @description
 * KR: 프로젝트를 등록, 삭제, 목록 조회, 전환하는 CLI 명령.
 * EN: CLI command for project registration, removal, listing, and switching.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param registryDir - 레지스트리 디렉토리 경로 (테스트용 주입) / Registry dir path (for testing DI)
 *
 * @example
 * const cmd = new ProjectCommand(logger);
 * await cmd.execute(['add', '/path/to/project'], { flags: {} });
 * await cmd.execute(['list'], { flags: {} });
 * await cmd.execute(['switch', 'my-project'], { flags: {} });
 */
export class ProjectCommand implements CliCommand {
  readonly name = 'project';
  readonly description = 'Project management / 프로젝트 관리 (add/remove/list/switch)';
  readonly aliases = ['proj'] as const;
  private readonly logger: Logger;
  private readonly registryDir: string;

  constructor(logger: Logger, registryDir?: string) {
    this.logger = logger.child({ module: 'cli:project' });
    this.registryDir = registryDir ?? getDefaultGlobalAdevDir();
  }

  /**
   * project 명령 실행 / Execute project command
   *
   * @param args - 서브커맨드 + 인자 / Subcommand + arguments
   * @param _options - CLI 옵션 (미사용) / CLI options (unused)
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(args: readonly string[], _options: CliOptions): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError(
          'cli_project_missing_subcommand',
          '서브커맨드가 필요합니다: add, remove, list, switch',
        ),
      );
    }

    switch (subcommand) {
      case 'add':
        return this.handleAdd(args.slice(1));
      case 'remove':
        return this.handleRemove(args.slice(1));
      case 'list':
        return this.handleList();
      case 'switch':
        return this.handleSwitch(args.slice(1));
      default:
        return err(
          new AdevError(
            'cli_project_unknown_subcommand',
            `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: add, remove, list, switch`,
          ),
        );
    }
  }

  /**
   * project add <path>: 프로젝트 등록 / Register a project
   */
  private async handleAdd(args: readonly string[]): Promise<Result<void, AdevError>> {
    const rawPath = args[0];
    if (!rawPath) {
      return err(
        new AdevError('cli_project_missing_path', 'project add: 프로젝트 경로를 지정하세요'),
      );
    }

    const projectPath = resolve(rawPath);
    const projectName = basename(projectPath);

    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) return registryResult;

    const registry = registryResult.value;

    // WHY: 중복 등록 방지 -- 이름 또는 경로가 같은 프로젝트가 있는지 확인
    const duplicate = registry.projects.find(
      (p) => p.name === projectName || p.path === projectPath,
    );
    if (duplicate) {
      return err(
        new AdevError(
          'cli_project_duplicate',
          `이미 등록된 프로젝트입니다: '${duplicate.name}' (${duplicate.path})`,
        ),
      );
    }

    const now = new Date();
    const newProject: ProjectInfo = {
      id: crypto.randomUUID(),
      name: projectName,
      path: projectPath,
      createdAt: now,
      lastAccessedAt: now,
    };

    const updatedRegistry: ProjectRegistry = {
      activeProject: registry.activeProject ?? projectName,
      projects: [...registry.projects, newProject],
    };

    const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
    if (!saveResult.ok) return saveResult;

    this.logger.info('프로젝트 등록 완료 / Project registered', {
      name: projectName,
      path: projectPath,
    });
    return ok(undefined);
  }

  /**
   * project remove <name>: 프로젝트 삭제 / Unregister a project
   */
  private async handleRemove(args: readonly string[]): Promise<Result<void, AdevError>> {
    const projectName = args[0];
    if (!projectName) {
      return err(
        new AdevError('cli_project_missing_name', 'project remove: 프로젝트 이름을 지정하세요'),
      );
    }

    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) return registryResult;

    const registry = registryResult.value;
    const filtered = registry.projects.filter((p) => p.name !== projectName);

    if (filtered.length === registry.projects.length) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    const updatedRegistry: ProjectRegistry = {
      activeProject:
        registry.activeProject === projectName
          ? (filtered[0]?.name ?? null)
          : registry.activeProject,
      projects: filtered,
    };

    const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
    if (!saveResult.ok) return saveResult;

    this.logger.info('프로젝트 삭제 완료 / Project removed', { name: projectName });
    return ok(undefined);
  }

  /**
   * project list: 등록된 프로젝트 목록 표시 / List registered projects
   */
  private async handleList(): Promise<Result<void, AdevError>> {
    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) return registryResult;

    const registry = registryResult.value;

    this.logger.info('등록된 프로젝트 목록 / Registered projects', {
      activeProject: registry.activeProject,
      count: registry.projects.length,
      projects: registry.projects.map((p) => ({
        name: p.name,
        path: p.path,
      })),
    });

    return ok(undefined);
  }

  /**
   * project switch <name>: 활성 프로젝트 전환 / Switch active project
   */
  private async handleSwitch(args: readonly string[]): Promise<Result<void, AdevError>> {
    const projectName = args[0];
    if (!projectName) {
      return err(
        new AdevError('cli_project_missing_name', 'project switch: 프로젝트 이름을 지정하세요'),
      );
    }

    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) return registryResult;

    const registry = registryResult.value;
    const target = registry.projects.find((p) => p.name === projectName);

    if (!target) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    const updatedRegistry: ProjectRegistry = {
      activeProject: projectName,
      projects: registry.projects.map((p) =>
        p.name === projectName ? { ...p, lastAccessedAt: new Date() } : p,
      ),
    };

    const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
    if (!saveResult.ok) return saveResult;

    this.logger.info('활성 프로젝트 전환 / Active project switched', {
      name: projectName,
      path: target.path,
    });
    return ok(undefined);
  }
}

// ── Registry I/O ───────────────────────────────────────────────

/**
 * 프로젝트 레지스트리를 로드한다 / Load project registry
 *
 * @param registryDir - 레지스트리 디렉토리 (기본: ~/.adev) / Registry directory (default: ~/.adev)
 * @returns ProjectRegistry 또는 에러 / ProjectRegistry or error
 */
export async function loadRegistry(
  registryDir?: string,
): Promise<Result<ProjectRegistry, AdevError>> {
  const dir = registryDir ?? getDefaultGlobalAdevDir();
  const registryPath = resolve(dir, 'projects.json');

  try {
    const file = Bun.file(registryPath);
    if (!(await file.exists())) {
      return ok({ activeProject: null, projects: [] });
    }

    const text = await file.text();
    if (text.trim() === '') {
      return ok({ activeProject: null, projects: [] });
    }

    const parsed = JSON.parse(text) as ProjectRegistry;
    return ok(parsed);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_project_registry_read_failed',
        `레지스트리 파일 읽기 실패: ${String(error)}`,
        error,
      ),
    );
  }
}

/**
 * 프로젝트 레지스트리를 저장한다 / Save project registry
 *
 * @param registry - 저장할 레지스트리 / Registry to save
 * @param registryDir - 레지스트리 디렉토리 (기본: ~/.adev) / Registry directory (default: ~/.adev)
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function saveRegistry(
  registry: ProjectRegistry,
  registryDir?: string,
): Promise<Result<void, AdevError>> {
  const dir = registryDir ?? getDefaultGlobalAdevDir();
  const registryPath = resolve(dir, 'projects.json');

  try {
    await mkdir(dir, { recursive: true });
    await Bun.write(registryPath, JSON.stringify(registry, null, 2));
    return ok(undefined);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_project_registry_write_failed',
        `레지스트리 파일 쓰기 실패: ${String(error)}`,
        error,
      ),
    );
  }
}
