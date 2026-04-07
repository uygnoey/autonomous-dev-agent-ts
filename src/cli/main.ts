/**
 * CLI 애플리케이션 진입점 / CLI application entry point
 *
 * @description
 * KR: CLI 명령어 파싱 및 라우팅을 담당하는 메인 애플리케이션.
 *     yargs 기반 명령어 파싱, 전역 옵션 처리, 에러 처리를 수행한다.
 *     도움말 텍스트는 yargs-commands.ts에 분리.
 *     인터페이스는 cli-app-types.ts에 분리.
 *     yargs 파서 설정은 cli-yargs-builder.ts에 분리.
 * EN: Main application responsible for CLI command parsing and routing.
 *     Performs yargs-based command parsing, global option handling, and error handling.
 *     Help text is in yargs-commands.ts.
 *     Interface is in cli-app-types.ts.
 *     yargs parser configuration is in cli-yargs-builder.ts.
 */

import type { ICliApp } from 'cli/cli-app-types.js';
import { buildYargsParser } from 'cli/cli-yargs-builder.js';
import type { CliCommandHandler, CliResult, GlobalCliOptions } from 'cli/types.js';
import { EXIT_CODES } from 'cli/types.js';
import { getHelpText } from 'cli/yargs-commands.js';
import { isAdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { hideBin } from 'yargs/helpers';
// WHY: package.json에서 버전을 동적으로 읽어 단일 소스 유지
import packageJson from '../../package.json' with { type: 'json' };

export type { ICliApp } from 'cli/cli-app-types.js';

/**
 * CLI 애플리케이션 버전 / CLI application version
 */
const CLI_VERSION = packageJson.version;

/**
 * CLI 애플리케이션 구현 / CLI application implementation
 *
 * @description
 * KR: yargs 기반 CLI 애플리케이션. 명령어 파싱, 라우팅, 에러 처리를 수행한다.
 * EN: yargs-based CLI application. Performs command parsing, routing, and error handling.
 *
 * @example
 * const app = new CliApp(logger);
 * app.registerCommand('init', initHandler);
 * const exitCode = await app.run(process.argv);
 * process.exit(exitCode);
 */
export class CliApp implements ICliApp {
  private readonly logger: Logger;
  private readonly commandHandlers: Map<string, CliCommandHandler>;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli-app' });
    this.commandHandlers = new Map();
  }

  /**
   * CLI 애플리케이션을 실행한다 / Run CLI application
   *
   * @param argv - 명령행 인자 (process.argv 형식) / Command-line arguments (process.argv format)
   * @returns 종료 코드 / Exit code
   *
   * @throws 절대 throw하지 않음, 모든 에러를 catch하여 종료 코드로 변환
   */
  async run(argv: string[]): Promise<number> {
    try {
      this.logger.debug('CLI 실행 시작', { argv });

      // WHY: yargs는 process.argv 형식을 기대하므로 hideBin으로 전처리
      const args = hideBin(argv);

      // WHY: 빈 인자일 경우 도움말 표시
      if (args.length === 0) {
        this.showHelp();
        return EXIT_CODES.SUCCESS;
      }

      // WHY: 전역 옵션 먼저 확인 (인자가 --help / -h만 있을 때만 전역 도움말 표시)
      // WHY: `adev init --help` 등은 yargs가 명령어별 도움말을 처리하도록 통과시킨다.
      if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
        this.showHelp();
        return EXIT_CODES.SUCCESS;
      }

      if (args.includes('--version') || args.includes('-V')) {
        this.showVersion();
        return EXIT_CODES.SUCCESS;
      }

      // WHY: yargs로 명령어 파싱 (cli-yargs-builder.ts에 설정 분리)
      const parsed = await buildYargsParser(args, CLI_VERSION);

      // WHY: verbose 플래그 처리
      if (parsed.verbose) {
        this.logger.debug('Verbose 모드 활성화');
      }

      // WHY: 명령어 추출
      const command = parsed._[0] as string | undefined;

      if (!command) {
        this.logger.error('명령어가 지정되지 않음');
        process.stderr.write('Error: No command specified. Use --help for usage information.\n');
        return EXIT_CODES.INVALID_USAGE;
      }

      // WHY: 명령어 핸들러 조회
      const handler = this.commandHandlers.get(command);

      if (!handler) {
        this.logger.error('알 수 없는 명령어', { command });
        process.stderr.write(
          `Error: Unknown command '${command}'. Use --help for available commands.\n`,
        );
        return EXIT_CODES.INVALID_USAGE;
      }

      // WHY: 핸들러 실행 (parsed를 옵션으로 전달)
      // WHY: yargs parse() 결과를 GlobalCliOptions로 캐스팅 — 실제 구조가 일치함
      this.logger.info('명령어 실행', { command });
      const result: CliResult = await handler.execute(parsed as unknown as GlobalCliOptions);

      // WHY: 결과 출력
      if (result.success) {
        if (result.message) {
          process.stdout.write(`${result.message}\n`);
        }
        this.logger.info('명령어 실행 완료', { command, exitCode: result.exitCode });
      } else {
        if (result.message) {
          process.stderr.write(`${result.message}\n`);
        }
        this.logger.error('명령어 실행 실패', { command, exitCode: result.exitCode });
      }

      return result.exitCode;
    } catch (error: unknown) {
      return this.handleError(error);
    }
  }

  /**
   * 명령어 핸들러를 등록한다 / Register command handler
   *
   * @param command - 명령어 이름 / Command name
   * @param handler - 핸들러 / Handler
   */
  registerCommand(command: string, handler: CliCommandHandler): void {
    this.commandHandlers.set(command, handler);
    this.logger.debug('명령어 핸들러 등록', { command });
  }

  /**
   * 전역 도움말을 표시한다 / Show global help
   */
  showHelp(): void {
    process.stdout.write(`${getHelpText()}\n`);
  }

  /**
   * 버전을 표시한다 / Show version
   */
  showVersion(): void {
    process.stdout.write(`adev v${CLI_VERSION}\n`);
  }

  /**
   * 에러를 처리하여 종료 코드를 반환한다 / Handle error and return exit code
   *
   * @param error - 에러 객체 / Error object
   * @returns 종료 코드 / Exit code
   */
  private handleError(error: unknown): number {
    // WHY: 모든 예외를 catch하여 적절한 종료 코드 반환
    if (isAdevError(error)) {
      this.logger.error('CLI 에러', {
        code: error.code,
        message: error.message,
        cause: error.cause,
      });
      process.stderr.write(`Error: ${error.message}\n`);

      // WHY: 에러 코드에 따라 적절한 종료 코드 매핑
      if (error.code.startsWith('auth_')) {
        return EXIT_CODES.AUTH_ERROR;
      }
      if (error.code.startsWith('config_')) {
        return EXIT_CODES.GENERAL_ERROR;
      }
      return EXIT_CODES.GENERAL_ERROR;
    }

    // WHY: yargs strict 모드에서 발생하는 파싱 에러는 INVALID_USAGE로 분류
    if (
      error instanceof Error &&
      (error.message.includes('Unknown argument') ||
        error.message.includes('Not enough non-option') ||
        error.message.includes('Missing required argument'))
    ) {
      this.logger.error('잘못된 사용법', { message: error.message });
      process.stderr.write(`Error: ${error.message}\n`);
      return EXIT_CODES.INVALID_USAGE;
    }

    // WHY: 예상치 못한 에러
    this.logger.error('예상치 못한 에러', { error: String(error) });
    process.stderr.write('An unexpected error occurred. Please check logs for details.\n');
    return EXIT_CODES.GENERAL_ERROR;
  }
}
