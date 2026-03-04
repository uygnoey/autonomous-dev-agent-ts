#!/usr/bin/env bun
/**
 * adev CLI 엔트리포인트 / adev CLI entry point
 *
 * @description
 * KR: adev CLI 애플리케이션의 진입점. process.argv를 받아 CommandRouter에 전달하고,
 *     종료 코드를 process.exit()로 반환한다. 글로벌 에러 핸들러를 등록하여
 *     uncaught exception, unhandled rejection, SIGINT를 처리한다.
 * EN: Entry point for adev CLI application. Receives process.argv, passes to CommandRouter,
 *     and returns exit code via process.exit(). Registers global error handlers for
 *     uncaught exceptions, unhandled rejections, and SIGINT.
 *
 * @note process.exit()은 이 파일에서만 사용 / process.exit() is ONLY allowed in this file
 */

import { CliApp } from './cli/index.js';
import { ConsoleLogger } from './core/logger.js';

// ── 글로벌 에러 핸들러 / Global error handlers ─────────────────

/**
 * Uncaught exception 핸들러 / Uncaught exception handler
 *
 * @description
 * KR: 동기 코드에서 발생한 예외를 처리한다.
 * EN: Handles exceptions thrown in synchronous code.
 */
process.on('uncaughtException', (error: Error) => {
  process.stderr.write(`\n[FATAL] Uncaught exception: ${error.message}\n`);
  if (error.stack) {
    process.stderr.write(`Stack: ${error.stack}\n`);
  }
  process.exit(1);
});

/**
 * Unhandled rejection 핸들러 / Unhandled rejection handler
 *
 * @description
 * KR: Promise에서 처리되지 않은 reject를 처리한다.
 * EN: Handles unhandled Promise rejections.
 */
process.on('unhandledRejection', (reason: unknown) => {
  process.stderr.write(`\n[FATAL] Unhandled rejection: ${String(reason)}\n`);
  process.exit(1);
});

/**
 * SIGINT 핸들러 (Ctrl+C) / SIGINT handler (Ctrl+C)
 *
 * @description
 * KR: Ctrl+C 입력 시 정상 종료한다. 종료 코드 130 (128 + SIGINT(2))
 * EN: Gracefully exits on Ctrl+C. Exit code 130 (128 + SIGINT(2))
 */
process.on('SIGINT', () => {
  process.stderr.write('\n\nInterrupted. Exiting...\n');
  process.exit(130); // 128 + SIGINT(2) = 130
});

// ── 메인 실행 / Main execution ─────────────────────────────────

/**
 * 메인 함수 / Main function
 *
 * @description
 * KR: CLI 애플리케이션을 초기화하고 실행한다.
 *     Logger 초기화 → CliApp 생성 → app.run() 실행 → 종료 코드 반환
 * EN: Initializes and runs the CLI application.
 *     Initialize Logger → Create CliApp → Execute app.run() → Return exit code
 *
 * @returns 정상 종료 시 0, 에러 시 종료 코드 / 0 on success, exit code on error
 */
async function main(): Promise<void> {
  // 1. Logger 초기화 / Initialize logger
  const logger = new ConsoleLogger('info');

  // 2. CliApp 생성 / Create CliApp
  const app = new CliApp(logger);

  // 3. CLI 실행 (process.argv 전달) / Execute CLI (pass process.argv)
  // WHY: process.argv를 그대로 전달 (CliApp 내부에서 hideBin 처리)
  const exitCode = await app.run(process.argv);

  // 4. 종료 코드로 프로세스 종료 / Exit process with exit code
  process.exit(exitCode);
}

// 메인 함수 실행 / Execute main function
main().catch((error: unknown) => {
  process.stderr.write(`\n[FATAL] Unexpected error: ${String(error)}\n`);
  process.exit(1);
});
