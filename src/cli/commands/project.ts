/**
 * project 명령 / Project command
 *
 * @description
 * KR: 프로젝트 레지스트리 관리 진입점. CRUD(project-crud)와 Registry I/O(project-registry)를 조합한다.
 * EN: Project registry management entry point. Composes CRUD (project-crud) and Registry I/O (project-registry).
 */

import { listProjects } from 'cli/commands/project-crud-reads.js';
import { ProjectCrudHandler } from 'cli/commands/project-crud.js';
import { getDefaultGlobalAdevDir } from 'cli/commands/project-registry.js';
import type { ProjectOptions } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── re-export (기존 import 호환) ────────────────────────────────

export { loadRegistry, saveRegistry } from 'cli/commands/project-registry.js';

// ── ProjectCommand (Facade) ─────────────────────────────────────

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
  private readonly crud: ProjectCrudHandler;
  private readonly logger: Logger;
  private readonly registryDir: string;

  constructor(logger: Logger, registryDir?: string) {
    this.registryDir = registryDir ?? getDefaultGlobalAdevDir();
    this.logger = logger.child({ module: 'cli:project' });
    this.crud = new ProjectCrudHandler(this.logger, this.registryDir);
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
        return this.crud.handleAdd(args.slice(1));
      case 'remove':
        return this.crud.handleRemove(args.slice(1), options);
      case 'list':
        return listProjects(this.logger.child({ module: 'cli:project:list' }), this.registryDir);
      case 'switch':
        return this.crud.handleSwitch(args.slice(1));
      case 'update':
        return this.crud.handleUpdate(args.slice(1), options);
      default:
        return err(
          new AdevError(
            'cli_project_unknown_subcommand',
            `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: add, remove, list, switch, update`,
          ),
        );
    }
  }
}
