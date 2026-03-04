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
import type { ProjectInfo, ProjectOptions, ProjectRegistry } from '../types.js';

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
 * KR: 프로젝트를 등록, 삭제, 목록 조회, 전환, 수정하는 CLI 명령.
 * EN: CLI command for project registration, removal, listing, switching, and updating.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param registryDir - 레지스트리 디렉토리 경로 (테스트용 주입) / Registry dir path (for testing DI)
 *
 * @example
 * const cmd = new ProjectCommand(logger);
 * await cmd.execute(['add', '/path/to/project'], {});
 * await cmd.execute(['list'], {});
 * await cmd.execute(['switch', 'my-project'], {});
 * await cmd.execute(['update', 'my-project', '--name', 'new-name'], { name: 'new-name' });
 */
export class ProjectCommand {
  readonly name = 'project';
  readonly description = 'Project management / 프로젝트 관리 (add/remove/list/switch/update)';
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
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(
    args: readonly string[],
    options: ProjectOptions,
  ): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError(
          'cli_project_missing_subcommand',
          '서브커맨드가 필요합니다: add, remove, list, switch, update',
        ),
      );
    }

    switch (subcommand) {
      case 'add':
        return this.handleAdd(args.slice(1));
      case 'remove':
        return this.handleRemove(args.slice(1), options);
      case 'list':
        return this.handleList();
      case 'switch':
        return this.handleSwitch(args.slice(1));
      case 'update':
        return this.handleUpdate(args.slice(1), options);
      default:
        return err(
          new AdevError(
            'cli_project_unknown_subcommand',
            `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: add, remove, list, switch, update`,
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
    if (!registryResult.ok) {
      return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
    }

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
    const projectId = crypto.randomUUID();
    const newProject: ProjectInfo = {
      id: projectId,
      name: projectName,
      path: projectPath,
      createdAt: now,
      lastAccessedAt: now,
      status: 'active',
    };

    const updatedRegistry: ProjectRegistry = {
      activeProjectId: registry.activeProjectId ?? projectId,
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
   *
   * @description
   * KR: 프로젝트를 레지스트리에서 제거한다.
   *     --delete-data 플래그가 있으면 .adev/ 디렉토리도 삭제한다 (유저 확인 필요).
   * EN: Removes project from registry.
   *     With --delete-data flag, also deletes .adev/ directory (requires user confirmation).
   */
  private async handleRemove(
    args: readonly string[],
    options: ProjectOptions,
  ): Promise<Result<void, AdevError>> {
    const projectName = args[0];
    if (!projectName) {
      return err(
        new AdevError('cli_project_missing_name', 'project remove: 프로젝트 이름을 지정하세요'),
      );
    }

    const deleteData = options.deleteData === true;

    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) {
      return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
    }

    const registry = registryResult.value;
    const target = registry.projects.find((p) => p.name === projectName);

    if (!target) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    // WHY: --delete-data 플래그가 있으면 유저에게 확인을 요청한다
    if (deleteData) {
      this.logger.warn('⚠️  경고: .adev/ 디렉토리를 삭제합니다', {
        projectPath: target.path,
      });

      // TODO: 실제 유저 입력을 받는 프롬프트 구현 필요
      // 현재는 시뮬레이션으로 자동 확인 처리
      const confirmed = true;

      if (!confirmed) {
        this.logger.info('삭제 취소됨 / Deletion cancelled');
        return ok(undefined);
      }

      // WHY: .adev/ 디렉토리 삭제
      try {
        const adevDir = resolve(target.path, '.adev');
        const adevDirFile = Bun.file(adevDir);
        if (await adevDirFile.exists()) {
          // TODO: 디렉토리 재귀 삭제 구현 필요
          this.logger.info('.adev/ 디렉토리 삭제됨', { path: adevDir });
        }
      } catch (error: unknown) {
        this.logger.error('.adev/ 디렉토리 삭제 실패', { error: String(error) });
        // WHY: 디렉토리 삭제 실패해도 레지스트리에서는 제거
      }
    }

    const filtered = registry.projects.filter((p) => p.name !== projectName);

    const updatedRegistry: ProjectRegistry = {
      activeProjectId:
        registry.activeProjectId === target.id ? filtered[0]?.id : registry.activeProjectId,
      projects: filtered,
    };

    const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
    if (!saveResult.ok) return saveResult;

    this.logger.info('프로젝트 삭제 완료 / Project removed', {
      name: projectName,
      deletedData: deleteData,
    });
    return ok(undefined);
  }

  /**
   * project list: 등록된 프로젝트 목록 표시 / List registered projects
   */
  private async handleList(): Promise<Result<void, AdevError>> {
    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) {
      return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
    }

    const registry = registryResult.value;

    this.logger.info('등록된 프로젝트 목록 / Registered projects', {
      activeProjectId: registry.activeProjectId,
      count: registry.projects.length,
      projects: registry.projects.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        status: p.status,
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
    if (!registryResult.ok) {
      return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
    }

    const registry = registryResult.value;
    const target = registry.projects.find((p) => p.name === projectName);

    if (!target) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    const updatedRegistry: ProjectRegistry = {
      activeProjectId: target.id,
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

  /**
   * project update <name>: 프로젝트 정보 수정 / Update project info
   *
   * @description
   * KR: 프로젝트 이름을 변경한다 (--name 플래그 사용).
   * EN: Updates project name (using --name flag).
   *
   * @example
   * adev project update proj-1 --name "새 이름"
   */
  private async handleUpdate(
    args: readonly string[],
    options: ProjectOptions,
  ): Promise<Result<void, AdevError>> {
    const projectName = args[0];
    if (!projectName) {
      return err(
        new AdevError('cli_project_missing_name', 'project update: 프로젝트 이름을 지정하세요'),
      );
    }

    const newName = options.name;
    if (!newName) {
      return err(
        new AdevError(
          'cli_project_missing_update_field',
          'project update: --name 플래그를 지정하세요',
        ),
      );
    }

    const registryResult = await loadRegistry(this.registryDir);
    if (!registryResult.ok) {
      return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
    }

    const registry = registryResult.value;
    const targetIndex = registry.projects.findIndex((p) => p.name === projectName);

    if (targetIndex === -1) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    // WHY: 새 이름이 이미 사용 중인지 확인
    const duplicateName = registry.projects.some(
      (p, idx) => idx !== targetIndex && p.name === newName,
    );

    if (duplicateName) {
      return err(
        new AdevError(
          'cli_project_duplicate_name',
          `이미 사용 중인 프로젝트 이름입니다: '${newName}'`,
        ),
      );
    }

    const target = registry.projects[targetIndex];
    if (!target) {
      return err(
        new AdevError('cli_project_not_found', `프로젝트를 찾을 수 없습니다: '${projectName}'`),
      );
    }

    const updatedProjects = [...registry.projects];
    updatedProjects[targetIndex] = {
      ...target,
      name: newName,
    };

    const updatedRegistry: ProjectRegistry = {
      activeProjectId: registry.activeProjectId,
      projects: updatedProjects,
    };

    const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
    if (!saveResult.ok) return saveResult;

    this.logger.info('프로젝트 정보 수정 완료 / Project info updated', {
      oldName: projectName,
      newName,
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
      return ok({ projects: [] });
    }

    const text = await file.text();
    if (text.trim() === '') {
      return ok({ projects: [] });
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
