/**
 * 프로젝트 CRUD 로직 / Project CRUD logic
 *
 * @description
 * KR: 프로젝트 add/remove/switch/update 핸들러를 담당한다.
 * EN: Handles project add/remove/switch/update operations.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { loadRegistry, saveRegistry } from 'cli/commands/project-registry.js';
import type { ProjectInfo, ProjectOptions, ProjectRegistry } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * 프로젝트 CRUD 핸들러 / Project CRUD handler
 *
 * @description
 * KR: 프로젝트 등록, 삭제, 전환, 수정 로직을 담당한다.
 * EN: Handles project registration, removal, switching, and updating logic.
 */
export class ProjectCrudHandler {
  private readonly logger: Logger;
  private readonly registryDir: string;

  constructor(logger: Logger, registryDir: string) {
    this.logger = logger;
    this.registryDir = registryDir;
  }

  /**
   * project add <path>: 프로젝트 등록 / Register a project
   *
   * @param args - CLI 인자 / CLI arguments
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async handleAdd(args: readonly string[]): Promise<Result<void, AdevError>> {
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
   *
   * @param args - CLI 인자 / CLI arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async handleRemove(
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

    // WHY: --delete-data 플래그가 있으면 .adev/ 디렉토리도 삭제
    if (deleteData) {
      this.logger.warn('경고: .adev/ 디렉토리를 삭제합니다', {
        projectPath: target.path,
      });

      try {
        const adevDir = resolve(target.path, '.adev');
        if (existsSync(adevDir)) {
          await rm(adevDir, { recursive: true, force: true });
          this.logger.info('.adev/ 디렉토리 삭제됨', { path: adevDir });
        }
      } catch (error: unknown) {
        this.logger.error('.adev/ 디렉토리 삭제 실패', { error: String(error) });
        // WHY: 디렉토리 삭제 실패해도 레지스트리에서는 제거
      }
    }

    const filtered = registry.projects.filter((p) => p.name !== projectName);

    const updatedRegistry: ProjectRegistry = {
      activeProject:
        registry.activeProject === target.name
          ? (filtered[0]?.name ?? null)
          : registry.activeProject,
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
   * project switch <name>: 활성 프로젝트 전환 / Switch active project
   *
   * @param args - CLI 인자 / CLI arguments
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async handleSwitch(args: readonly string[]): Promise<Result<void, AdevError>> {
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
      activeProject: target.name,
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
   * @param args - CLI 인자 / CLI arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async handleUpdate(
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
      activeProject: registry.activeProject === projectName ? newName : registry.activeProject,
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
