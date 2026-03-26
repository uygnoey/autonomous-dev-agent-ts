/**
 * 프로젝트 CRUD 쓰기 로직 / Project CRUD write operations
 *
 * @description
 * KR: 프로젝트 remove/switch/update 핸들러를 담당한다.
 * EN: Handles project remove/switch/update operations.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadRegistry, saveRegistry } from 'cli/commands/project-registry.js';
import type { ProjectOptions, ProjectRegistry } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * project remove <name>: 프로젝트 삭제 / Unregister a project
 *
 * @param args - CLI 인자 / CLI arguments
 * @param options - CLI 옵션 / CLI options
 * @param logger - 로거 / Logger
 * @param registryDir - 레지스트리 디렉토리 / Registry directory
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleRemove(
  args: readonly string[],
  options: ProjectOptions,
  logger: Logger,
  registryDir: string,
): Promise<Result<void, AdevError>> {
  const projectName = args[0];
  if (!projectName) {
    return err(
      new AdevError('cli_project_missing_name', 'project remove: 프로젝트 이름을 지정하세요'),
    );
  }

  const deleteData = options.deleteData === true;

  const registryResult = await loadRegistry(registryDir);
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
    logger.warn('경고: .adev/ 디렉토리를 삭제합니다', {
      projectPath: target.path,
    });

    try {
      const adevDir = resolve(target.path, '.adev');
      if (existsSync(adevDir)) {
        await rm(adevDir, { recursive: true, force: true });
        logger.info('.adev/ 디렉토리 삭제됨', { path: adevDir });
      }
    } catch (error: unknown) {
      logger.error('.adev/ 디렉토리 삭제 실패', { error: String(error) });
      // WHY: 디렉토리 삭제 실패해도 레지스트리에서는 제거
    }
  }

  const filtered = registry.projects.filter((p) => p.name !== projectName);

  const updatedRegistry: ProjectRegistry = {
    activeProject:
      registry.activeProject === target.name ? (filtered[0]?.name ?? null) : registry.activeProject,
    projects: filtered,
  };

  const saveResult = await saveRegistry(updatedRegistry, registryDir);
  if (!saveResult.ok) return saveResult;

  logger.info('프로젝트 삭제 완료 / Project removed', {
    name: projectName,
    deletedData: deleteData,
  });
  return ok(undefined);
}

/**
 * project switch <name>: 활성 프로젝트 전환 / Switch active project
 *
 * @param args - CLI 인자 / CLI arguments
 * @param logger - 로거 / Logger
 * @param registryDir - 레지스트리 디렉토리 / Registry directory
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleSwitch(
  args: readonly string[],
  logger: Logger,
  registryDir: string,
): Promise<Result<void, AdevError>> {
  const projectName = args[0];
  if (!projectName) {
    return err(
      new AdevError('cli_project_missing_name', 'project switch: 프로젝트 이름을 지정하세요'),
    );
  }

  const registryResult = await loadRegistry(registryDir);
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

  const saveResult = await saveRegistry(updatedRegistry, registryDir);
  if (!saveResult.ok) return saveResult;

  logger.info('활성 프로젝트 전환 / Active project switched', {
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
 * @param logger - 로거 / Logger
 * @param registryDir - 레지스트리 디렉토리 / Registry directory
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleUpdate(
  args: readonly string[],
  options: ProjectOptions,
  logger: Logger,
  registryDir: string,
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

  const registryResult = await loadRegistry(registryDir);
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

  const saveResult = await saveRegistry(updatedRegistry, registryDir);
  if (!saveResult.ok) return saveResult;

  logger.info('프로젝트 정보 수정 완료 / Project info updated', {
    oldName: projectName,
    newName,
    path: target.path,
  });
  return ok(undefined);
}
