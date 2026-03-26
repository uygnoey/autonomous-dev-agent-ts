/**
 * 프로젝트 CRUD 로직 / Project CRUD logic
 *
 * @description
 * KR: 프로젝트 add/remove/switch/update 핸들러를 담당한다.
 * EN: Handles project add/remove/switch/update operations.
 */

import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { scaffoldProjectDirectories } from 'cli/commands/project-crud-scaffold.js';
import {
  handleRemove as handleRemoveImpl,
  handleSwitch as handleSwitchImpl,
  handleUpdate as handleUpdateImpl,
} from 'cli/commands/project-crud-writes.js';
import { loadRegistry, saveRegistry } from 'cli/commands/project-registry.js';
import type { ProjectInfo, ProjectOptions, ProjectRegistry } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * 중복 프로젝트 처리 결과 / Duplicate project resolution result
 *
 * @description
 * KR: 이름 중복 시 반환되는 구조화된 에러. duplicateAction 필드로 호출 측이
 *     '다른 이름 / 기존 업데이트 / 취소' 선택지를 유저에게 제시할 수 있다.
 * EN: Structured error returned on name collision. The duplicateAction field
 *     enables the caller to present 'rename / update / cancel' options to the user.
 */
export interface DuplicateProjectInfo {
  readonly existingName: string;
  readonly existingPath: string;
  readonly suggestedActions: readonly ['rename', 'update', 'cancel'];
}

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
      // WHY: PI-012 — TTY 환경에서는 3선택지 인터랙티브 UI를 제공한다
      if (process.stdin.isTTY && process.stdout.isTTY) {
        const choice = await this.promptDuplicateAction(duplicate.name);

        if (choice === 'rename') {
          const newName = await this.promptNewName();
          if (!newName) {
            return err(new AdevError('cli_project_cancelled', '프로젝트 등록이 취소되었습니다'));
          }
          return this.registerProject(newName, projectPath, registry);
        }

        if (choice === 'update') {
          const updatedProjects = registry.projects.map((p) =>
            p.name === duplicate.name ? { ...p, path: projectPath, lastAccessedAt: new Date() } : p,
          );
          const updatedRegistry: ProjectRegistry = {
            activeProject: registry.activeProject,
            projects: updatedProjects,
          };
          const saveResult = await saveRegistry(updatedRegistry, this.registryDir);
          if (!saveResult.ok) return saveResult;
          this.logger.info('기존 프로젝트 업데이트 완료', {
            name: duplicate.name,
            path: projectPath,
          });
          return ok(undefined);
        }

        return err(new AdevError('cli_project_cancelled', '프로젝트 등록이 취소되었습니다'));
      }

      // WHY: non-TTY 환경에서는 구조화된 에러로 반환
      const duplicateInfo: DuplicateProjectInfo = {
        existingName: duplicate.name,
        existingPath: duplicate.path,
        suggestedActions: ['rename', 'update', 'cancel'],
      };
      const error = new AdevError(
        'cli_project_duplicate',
        `이미 등록된 프로젝트입니다: '${duplicate.name}' (${duplicate.path}). 선택: 1) 다른 이름으로 등록 (rename) 2) 기존 업데이트 (update) 3) 취소 (cancel)`,
      );
      (error as AdevError & { duplicateInfo: DuplicateProjectInfo }).duplicateInfo = duplicateInfo;
      return err(error);
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

    // WHY: 프로젝트 등록 시 .adev/ 서브디렉토리를 자동 scaffold (PI-006)
    await scaffoldProjectDirectories(projectPath, this.logger);

    this.logger.info('프로젝트 등록 완료 / Project registered', {
      name: projectName,
      path: projectPath,
    });
    return ok(undefined);
  }

  /**
   * 중복 시 3선택지 인터랙티브 프롬프트 / Interactive prompt for duplicate resolution
   */
  private async promptDuplicateAction(
    existingName: string,
  ): Promise<'rename' | 'update' | 'cancel'> {
    process.stdout.write(`\n프로젝트 이름 '${existingName}'이 이미 존재합니다.\n`);
    process.stdout.write('  1) 다른 이름 입력\n');
    process.stdout.write('  2) 기존 프로젝트 업데이트\n');
    process.stdout.write('  3) 취소\n');
    process.stdout.write('선택 (1-3, 기본값: 3): ');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const input = await new Promise<string>((resolve) => {
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
    });

    if (input === '1') return 'rename';
    if (input === '2') return 'update';
    return 'cancel';
  }

  /**
   * 새 프로젝트 이름을 입력받는다 / Prompts for a new project name
   */
  private async promptNewName(): Promise<string | null> {
    process.stdout.write('새 프로젝트 이름을 입력하세요 (엔터=취소): ');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const input = await new Promise<string>((resolve) => {
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
    });

    return input || null;
  }

  /**
   * 프로젝트를 레지스트리에 등록한다 / Registers a project to the registry
   */
  private async registerProject(
    projectName: string,
    projectPath: string,
    registry: ProjectRegistry,
  ): Promise<Result<void, AdevError>> {
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

    await scaffoldProjectDirectories(projectPath, this.logger);

    this.logger.info('프로젝트 등록 완료 / Project registered', {
      name: projectName,
      path: projectPath,
    });
    return ok(undefined);
  }

  /**
   * project remove <name>: 프로젝트 삭제 / Unregister a project
   */
  async handleRemove(
    args: readonly string[],
    options: ProjectOptions,
  ): Promise<Result<void, AdevError>> {
    return handleRemoveImpl(args, options, this.logger, this.registryDir);
  }

  /**
   * project switch <name>: 활성 프로젝트 전환 / Switch active project
   */
  async handleSwitch(args: readonly string[]): Promise<Result<void, AdevError>> {
    return handleSwitchImpl(args, this.logger, this.registryDir);
  }

  /**
   * project update <name>: 프로젝트 정보 수정 / Update project info
   */
  async handleUpdate(
    args: readonly string[],
    options: ProjectOptions,
  ): Promise<Result<void, AdevError>> {
    return handleUpdateImpl(args, options, this.logger, this.registryDir);
  }
}
