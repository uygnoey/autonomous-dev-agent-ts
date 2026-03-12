/**
 * config 명령 진입점 / Config command entry point
 *
 * @description
 * KR: 프로젝트 설정을 조회하거나 수정한다 (list, get, set, reset 서브커맨드).
 *     조회 로직은 config-reader, 쓰기 로직은 config-writer에 위임한다.
 * EN: View or update project configuration (list, get, set, reset subcommands).
 *     Delegates read operations to config-reader and write operations to config-writer.
 *
 * @example
 * adev config list                         # 모든 설정 조회
 * adev config get log.level                # 특정 설정 조회
 * adev config set log.level debug          # 설정 변경
 * adev config set log.level info --global  # 글로벌 설정 변경
 * adev config reset                        # 설정 초기화 (기본값)
 * adev config reset --global               # 글로벌 설정 초기화
 */

import { handleGet, handleList } from 'cli/commands/config-reader.js';
import { handleReset, handleSet } from 'cli/commands/config-writer.js';
import type { CliOptions, GlobalCliOptions } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err } from 'core/types.js';
import type { Result } from 'core/types.js';

// WHY: 기존 import 호환성을 위한 re-export
export { getNestedValue, parseConfigValue } from 'cli/commands/config-reader.js';
export { setNestedValue } from 'cli/commands/config-writer.js';

// ── ConfigCommand ──────────────────────────────────────────────

/**
 * 설정 관리 명령 / Configuration management command
 *
 * @description
 * KR: 프로젝트 설정을 list/get/set/reset 서브커맨드로 관리한다.
 *     --global 플래그로 글로벌 설정과 프로젝트 설정을 구분한다.
 * EN: Manages project configuration via list/get/set/reset subcommands.
 *     Uses --global flag to distinguish between global and project config.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new ConfigCommand(logger);
 * await cmd.execute(['list'], {});
 * await cmd.execute(['get', 'log.level'], {});
 * await cmd.execute(['set', 'log.level', 'debug'], {});
 * await cmd.execute(['reset'], { global: true });
 */
export class ConfigCommand {
  readonly name = 'config';
  readonly description = 'View or update configuration / 설정 조회 및 수정';
  readonly aliases = ['cfg'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:config' });
  }

  /**
   * config 명령 실행 / Execute config command
   *
   * @param args - 서브커맨드 + 인자 / Subcommand + arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(
    args: readonly string[],
    options: GlobalCliOptions | CliOptions,
  ): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError(
          'cli_config_missing_subcommand',
          '서브커맨드가 필요합니다: list, get, set, reset',
        ),
      );
    }

    // WHY: 서브커맨드 검증
    if (!['list', 'get', 'set', 'reset'].includes(subcommand)) {
      return err(
        new AdevError(
          'cli_config_unknown_subcommand',
          `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: list, get, set, reset`,
        ),
      );
    }

    // WHY: --global 플래그 확인
    const isGlobal = 'global' in options && options.global === true;
    // WHY: projectPath가 있으면 해당 경로 기반, 없으면 현재 디렉토리 기반
    const projectPath =
      'projectPath' in options && typeof options.projectPath === 'string'
        ? options.projectPath
        : '.';

    switch (subcommand) {
      case 'list':
        return handleList(isGlobal, projectPath, this.logger);
      case 'get': {
        const key = args[1];
        if (!key) {
          return err(new AdevError('cli_config_missing_key', 'config get: 키를 지정하세요'));
        }
        return handleGet(key, isGlobal, projectPath, this.logger);
      }
      case 'set': {
        const key = args[1];
        const rawValue = args[2];
        if (!key || rawValue === undefined) {
          return err(
            new AdevError('cli_config_missing_args', 'config set: 키와 값을 모두 지정하세요'),
          );
        }
        return handleSet(key, rawValue, isGlobal, projectPath, this.logger);
      }
      case 'reset':
        return handleReset(isGlobal, projectPath, this.logger);
      default:
        return err(
          new AdevError('cli_config_unknown_subcommand', `알 수 없는 서브커맨드: '${subcommand}'.`),
        );
    }
  }
}
