/**
 * CLI 명령 라우터 / CLI command router
 *
 * @description
 * KR: CLI 인자를 파싱하고 적절한 명령으로 라우팅한다.
 * EN: Parses CLI arguments and routes to the appropriate command.
 */

import { AdevError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { CliCommand, CliOptions } from './types.js';

// ── 파싱 결과 / Parse Result ───────────────────────────────────

/**
 * CLI 인자 파싱 결과 / CLI argument parse result
 */
export interface ParsedArgs {
  /** 명령 이름 / Command name */
  readonly command: string;
  /** 위치 인자 / Positional arguments */
  readonly args: readonly string[];
  /** 파싱된 옵션 / Parsed options */
  readonly options: CliOptions;
}

// ── CommandRouter ──────────────────────────────────────────────

/**
 * CLI 명령 라우터 / CLI command router
 *
 * @description
 * KR: 명령을 등록하고, 인자를 파싱하여 적절한 명령을 실행한다.
 * EN: Registers commands, parses arguments, and executes the matching command.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const router = new CommandRouter(logger);
 * router.register(new InitCommand(logger));
 * const result = await router.execute(['init', '--verbose']);
 */
export class CommandRouter {
  private readonly commands = new Map<string, CliCommand>();
  private readonly aliasMap = new Map<string, string>();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:router' });
  }

  /**
   * 명령을 등록한다 / Register a command
   *
   * @param command - 등록할 CLI 명령 / CLI command to register
   */
  register(command: CliCommand): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.set(alias, command.name);
      }
    }

    this.logger.debug('명령 등록 / Command registered', { name: command.name });
  }

  /**
   * CLI 인자를 파싱한다 / Parse CLI arguments
   *
   * @description
   * KR: process.argv 스타일의 인자 배열을 파싱한다.
   *     첫 번째 인자를 명령으로, 나머지를 위치 인자와 플래그로 분리한다.
   * EN: Parses process.argv-style argument arrays.
   *     First argument is the command, rest are positional args and flags.
   *
   * @param args - 인자 배열 (process.argv[2:] 스타일) / Argument array
   * @returns 파싱 결과 또는 에러 / Parse result or error
   *
   * @example
   * router.parse(['init', '--verbose', '--project-path=/tmp/proj']);
   */
  parse(args: readonly string[]): Result<ParsedArgs, AdevError> {
    if (args.length === 0) {
      return err(
        new AdevError(
          'cli_no_command',
          `명령이 필요합니다. 사용 가능한 명령: ${this.getCommandNames().join(', ')}`,
        ),
      );
    }

    // WHY: args.length > 0 은 위에서 검증됨 — 안전한 인덱스 접근
    const commandName = args[0] as string;
    const restArgs = args.slice(1);

    const positionalArgs: string[] = [];
    const flags: Record<string, string | boolean> = {};
    let projectPath: string | undefined;
    let verbose = false;
    let logLevel: CliOptions['logLevel'];

    for (const arg of restArgs) {
      if (arg.startsWith('--')) {
        const withoutDashes = arg.slice(2);
        const eqIndex = withoutDashes.indexOf('=');

        if (eqIndex !== -1) {
          // --key=value 형태 / --key=value form
          const key = withoutDashes.slice(0, eqIndex);
          const value = withoutDashes.slice(eqIndex + 1);
          flags[key] = value;

          if (key === 'project-path') projectPath = value;
          if (key === 'log-level') logLevel = value as CliOptions['logLevel'];
        } else {
          // --flag 형태 / --flag form
          flags[withoutDashes] = true;
          if (withoutDashes === 'verbose') verbose = true;
        }
      } else {
        positionalArgs.push(arg);
      }
    }

    return ok({
      command: commandName,
      args: positionalArgs,
      options: {
        projectPath,
        verbose,
        logLevel,
        flags,
      },
    });
  }

  /**
   * 파싱 + 실행을 한 번에 수행한다 / Parse and execute in one step
   *
   * @param args - CLI 인자 배열 / CLI argument array
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(args: readonly string[]): Promise<Result<void, AdevError>> {
    const parseResult = this.parse(args);
    if (!parseResult.ok) return parseResult;

    const { command: commandName, args: positionalArgs, options } = parseResult.value;

    // 별칭을 실제 명령 이름으로 변환 / Resolve alias to actual command name
    const resolvedName = this.aliasMap.get(commandName) ?? commandName;
    const command = this.commands.get(resolvedName);

    if (!command) {
      return err(
        new AdevError(
          'cli_unknown_command',
          `알 수 없는 명령: '${commandName}'. 사용 가능한 명령: ${this.getCommandNames().join(', ')}`,
        ),
      );
    }

    this.logger.info('명령 실행 / Executing command', {
      command: resolvedName,
      args: positionalArgs,
    });

    return command.execute(positionalArgs, options);
  }

  /**
   * 도움말 텍스트를 생성한다 / Generate help text
   *
   * @returns 사용 가능한 명령 목록을 포함한 도움말 / Help text with available commands
   */
  getHelp(): string {
    const lines = ['adev - Autonomous Dev Agent CLI', '', 'Commands:'];

    for (const command of this.commands.values()) {
      const aliasStr = command.aliases ? ` (${command.aliases.join(', ')})` : '';
      lines.push(`  ${command.name}${aliasStr}  ${command.description}`);
    }

    lines.push('', 'Options:');
    lines.push('  --project-path=<path>  Project directory path');
    lines.push('  --verbose              Enable verbose logging');
    lines.push('  --log-level=<level>    Set log level (debug|info|warn|error)');

    return lines.join('\n');
  }

  /**
   * 등록된 명령 이름 목록을 반환한다 / Return registered command names
   */
  private getCommandNames(): string[] {
    return [...this.commands.keys()];
  }
}
