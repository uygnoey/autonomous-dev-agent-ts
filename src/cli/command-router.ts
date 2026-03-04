/**
 * CLI 명령 라우터 / CLI Command Router
 *
 * @description
 * KR: CLI 명령을 등록하고, 인자를 파싱하여 적절한 명령으로 라우팅한다.
 * EN: Registers CLI commands, parses arguments, and routes to the appropriate command.
 */

import { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { CliCommand, CliOptions } from './types.js';

// ── 타입 / Types ───────────────────────────────────────────────

/**
 * 라우터에 등록 가능한 CLI 명령 인터페이스 / Registrable CLI command interface
 *
 * @deprecated CliCommand를 사용하세요 / Use CliCommand instead
 */
export type RoutableCommand = CliCommand;

/**
 * 파싱된 CLI 인자 / Parsed CLI arguments
 */
export interface ParsedArgs {
  /** 명령 이름 또는 별칭 / Command name or alias */
  readonly command: string;
  /** 위치 인자 / Positional arguments */
  readonly args: readonly string[];
  /** 옵션 (플래그) / Options (flags) */
  readonly options: CliOptions;
}

// ── CommandRouter ──────────────────────────────────────────────

/**
 * CLI 명령 라우터 / CLI command router
 *
 * @description
 * KR: 명령을 등록하고 CLI 인자를 파싱하여 적절한 명령을 실행한다.
 *     별칭(aliases)을 지원하며, 플래그와 위치 인자를 분리한다.
 * EN: Registers commands, parses CLI args, and executes the matching command.
 *     Supports aliases, separates flags from positional args.
 *
 * @example
 * const router = new CommandRouter(logger);
 * router.register(new InitCommand(logger));
 * router.register(new ConfigCommand(logger));
 * const result = await router.execute(['config', 'list']);
 */
export class CommandRouter {
  private readonly logger: Logger;
  private readonly commands: Map<string, CliCommand>;
  private readonly aliasMap: Map<string, string>;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:router' });
    this.commands = new Map();
    this.aliasMap = new Map();
  }

  /**
   * 명령을 등록한다 / Register a command
   *
   * @param command - 등록할 명령 / Command to register
   */
  register(command: CliCommand): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.set(alias, command.name);
      }
    }

    this.logger.debug('명령 등록됨 / Command registered', {
      name: command.name,
      aliases: command.aliases,
    });
  }

  /**
   * CLI 인자를 파싱한다 / Parse CLI arguments
   *
   * @description
   * KR: 첫 번째 인자를 명령으로, 나머지를 플래그와 위치 인자로 분리한다.
   *     --key=value, --flag, positional-arg 형식을 지원한다.
   *     kebab-case 플래그를 camelCase로 변환하여 옵션에 추가한다.
   *     원본 kebab-case 키는 flags 서브 객체에 보존한다.
   * EN: First arg becomes command, rest split into flags and positional args.
   *     Supports --key=value, --flag, positional-arg formats.
   *     Converts kebab-case flags to camelCase in options.
   *     Original kebab-case keys preserved in flags sub-object.
   *
   * @param argv - CLI 인자 배열 / CLI argument array
   * @returns 파싱된 인자 / Parsed arguments
   */
  parse(argv: readonly string[]): Result<ParsedArgs, AdevError> {
    if (argv.length === 0 || !argv[0]) {
      return err(new AdevError('cli_no_command', '명령을 지정하세요. `adev --help`를 참조하세요.'));
    }

    const command = argv[0];

    // WHY: 등록된 명령 또는 별칭인지 확인
    const resolvedName = this.commands.has(command) ? command : this.aliasMap.get(command);

    if (!resolvedName) {
      const available = [...this.commands.keys()].join(', ');
      return err(
        new AdevError(
          'cli_unknown_command',
          `알 수 없는 명령: '${command}'. 사용 가능: ${available}`,
        ),
      );
    }

    const args: string[] = [];
    const flags: Record<string, unknown> = {};
    const camelOptions: Record<string, unknown> = {};

    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;

      if (arg.startsWith('--')) {
        const withoutDashes = arg.slice(2);
        const eqIndex = withoutDashes.indexOf('=');

        if (eqIndex !== -1) {
          // WHY: --key=value 형식
          const rawKey = withoutDashes.slice(0, eqIndex);
          const value = withoutDashes.slice(eqIndex + 1);
          const camelKey = kebabToCamel(rawKey);
          flags[rawKey] = value;
          camelOptions[camelKey] = value;
        } else {
          // WHY: --flag (boolean true)
          const camelKey = kebabToCamel(withoutDashes);
          flags[withoutDashes] = true;
          camelOptions[camelKey] = true;
        }
      } else {
        args.push(arg);
      }
    }

    const options: CliOptions = { ...camelOptions, flags };

    return ok({ command, args, options });
  }

  /**
   * CLI 인자를 파싱하고 명령을 실행한다 / Parse args and execute the matched command
   *
   * @param argv - CLI 인자 배열 / CLI argument array
   * @returns 실행 결과 / Execution result
   */
  async execute(argv: readonly string[]): Promise<Result<void, AdevError>> {
    const parseResult = this.parse(argv);
    if (!parseResult.ok) {
      return err(parseResult.error);
    }

    const { command: rawCommand, args, options } = parseResult.value;

    // WHY: 별칭을 실제 명령 이름으로 변환
    const commandName = this.aliasMap.get(rawCommand) ?? rawCommand;
    const cmd = this.commands.get(commandName);

    if (!cmd) {
      const available = [...this.commands.keys()].join(', ');
      return err(
        new AdevError(
          'cli_unknown_command',
          `알 수 없는 명령: '${rawCommand}'. 사용 가능: ${available}`,
        ),
      );
    }

    this.logger.debug('명령 실행 / Executing command', {
      command: commandName,
      args,
      options,
    });

    const result = await cmd.execute(args, options);
    if (!result.ok) {
      return err(result.error as AdevError);
    }

    return ok(undefined);
  }

  /**
   * 도움말 텍스트를 반환한다 / Get help text
   *
   * @returns 등록된 명령 목록을 포함한 도움말 / Help text with registered commands
   */
  getHelp(): string {
    const lines: string[] = [
      'adev - autonomous dev agent',
      '',
      'Usage: adev <command> [options]',
      '',
      'Commands:',
    ];

    for (const cmd of this.commands.values()) {
      const aliases = cmd.aliases && cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      lines.push(`  ${cmd.name}${aliases}  ${cmd.description}`);
    }

    lines.push('');
    lines.push('Global Options:');
    lines.push('  --project-path=<path>  프로젝트 경로 / Project path');
    lines.push('  --verbose              상세 로그 출력 / Verbose logging');
    lines.push('  --help                 도움말 표시 / Show help');

    return lines.join('\n');
  }
}

// ── 유틸리티 / Utilities ───────────────────────────────────────

/**
 * kebab-case를 camelCase로 변환한다 / Convert kebab-case to camelCase
 *
 * @param str - kebab-case 문자열 / kebab-case string
 * @returns camelCase 문자열 / camelCase string
 *
 * @example
 * kebabToCamel('project-path') // 'projectPath'
 * kebabToCamel('verbose') // 'verbose'
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}
