/**
 * CLI 애플리케이션 타입 정의 / CLI application type definitions
 *
 * @description
 * KR: CliApp 인터페이스 및 관련 타입을 정의한다.
 * EN: Defines the CliApp interface and related types.
 */

import type { CliCommandHandler } from 'cli/types.js';

/**
 * CLI 애플리케이션 인터페이스 / CLI application interface
 */
export interface ICliApp {
  /**
   * CLI 애플리케이션을 실행한다 / Run CLI application
   *
   * @param argv - 명령행 인자 / Command-line arguments
   * @returns 종료 코드 / Exit code
   */
  run(argv: string[]): Promise<number>;

  /**
   * 명령어 핸들러를 등록한다 / Register command handler
   *
   * @param command - 명령어 이름 / Command name
   * @param handler - 핸들러 / Handler
   */
  registerCommand(command: string, handler: CliCommandHandler): void;

  /**
   * 전역 도움말을 표시한다 / Show global help
   */
  showHelp(): void;

  /**
   * 버전을 표시한다 / Show version
   */
  showVersion(): void;
}
