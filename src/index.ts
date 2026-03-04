#!/usr/bin/env bun
/**
 * adev CLI 엔트리포인트 / adev CLI entry point
 *
 * @description
 * KR: adev CLI 애플리케이션의 진입점. process.argv를 받아 CommandRouter에 전달하고,
 *     종료 코드를 process.exit()로 반환한다. 글로벌 에러 핸들러를 등록하여
 *     uncaught exception, unhandled rejection, SIGINT를 처리한다.
 *     시작 시 ~/.adev/.env 파일을 로드하여 adev 전용 인증 정보를 사용한다.
 * EN: Entry point for adev CLI application. Receives process.argv, passes to CommandRouter,
 *     and returns exit code via process.exit(). Registers global error handlers for
 *     uncaught exceptions, unhandled rejections, and SIGINT.
 *     Loads ~/.adev/.env file on startup for adev-specific authentication.
 *
 * @note process.exit()은 이 파일에서만 사용 / process.exit() is ONLY allowed in this file
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthCommand } from './cli/commands/auth.js';
import { ConfigCommand } from './cli/commands/config.js';
import { InitCommand } from './cli/commands/init.js';
import { ProjectCommand } from './cli/commands/project.js';
import { StartCommand } from './cli/commands/start.js';
import { CliApp } from './cli/index.js';
import type { CliCommandHandler, CliResult } from './cli/types.js';
import { ConsoleLogger } from './core/logger.js';

// ── .env 파일 로드 / Load .env file ─────────────────────────────

/**
 * adev 전용 .env 파일 로드 / Load adev-specific .env file
 *
 * @description
 * KR: ~/.adev/.env 파일을 읽어 환경변수로 설정한다.
 *     파일이 없거나 읽기 실패 시 무시 (선택적 설정).
 * EN: Reads ~/.adev/.env file and sets environment variables.
 *     Ignores if file does not exist or fails to read (optional config).
 */
async function loadAdevEnv(): Promise<void> {
  const envPath = join(homedir(), '.adev', '.env');

  try {
    const envFile = Bun.file(envPath);
    const exists = await envFile.exists();

    if (!exists) {
      return; // .env 파일이 없으면 무시 (선택적)
    }

    const content = await envFile.text();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // 빈 줄이나 주석 무시
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // KEY=VALUE 파싱
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();

      // 이미 환경변수가 설정되어 있으면 덮어쓰지 않음 (우선순위: 실제 환경변수 > .env)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error: unknown) {
    // .env 파일 로드 실패는 무시 (선택적 설정이므로)
    // 에러가 있어도 계속 진행
  }
}

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
 *     .env 로드 → Logger 초기화 → CliApp 생성 → app.run() 실행 → 종료 코드 반환
 * EN: Initializes and runs the CLI application.
 *     Load .env → Initialize Logger → Create CliApp → Execute app.run() → Return exit code
 *
 * @returns 정상 종료 시 0, 에러 시 종료 코드 / 0 on success, exit code on error
 */
async function main(): Promise<void> {
  // 0. adev 전용 .env 파일 로드 / Load adev-specific .env file
  // WHY: ~/.adev/.env에서 ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN 읽기
  await loadAdevEnv();

  // 1. Logger 초기화 / Initialize logger
  const logger = new ConsoleLogger('info');

  // 2. CliApp 생성 / Create CliApp
  const app = new CliApp(logger);

  // 3. 명령어 핸들러 등록 / Register command handlers
  // WHY: CliApp은 명령어 핸들러가 등록되어야 명령어를 실행할 수 있다.
  //       각 Command 클래스의 execute(args, options) 시그니처를
  //       CliCommandHandler의 execute(options) 시그니처로 어댑팅한다.
  const initCmd = new InitCommand(logger);
  app.registerCommand('init', {
    execute: async (options) => {
      const result = await initCmd.execute([], options as Parameters<typeof initCmd.execute>[1]);
      if (result.ok) {
        return { success: true, message: 'Project initialized successfully.', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => initCmd.help(),
  } satisfies CliCommandHandler);

  const startCmd = new StartCommand(logger);
  app.registerCommand('start', {
    execute: async (options) => {
      const result = await startCmd.execute([], options);
      if (result.ok) {
        return { success: true, message: 'Session completed.', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => 'adev start - Start Layer1 conversation',
  } satisfies CliCommandHandler);

  const configCmd = new ConfigCommand(logger);
  app.registerCommand('config', {
    execute: async (options) => {
      const parsed = options as Record<string, unknown>;
      const sub = parsed.sub as string | undefined;
      const args = sub ? [sub] : [];
      const result = await configCmd.execute(args, options);
      if (result.ok) {
        return { success: true, message: 'Config operation completed.', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => 'adev config <sub> - Manage configuration (get/set/list/reset)',
  } satisfies CliCommandHandler);

  const projectCmd = new ProjectCommand(logger);
  app.registerCommand('project', {
    execute: async (options) => {
      const parsed = options as Record<string, unknown>;
      const sub = parsed.sub as string | undefined;
      const args = sub ? [sub] : [];
      const result = await projectCmd.execute(
        args,
        options as Parameters<typeof projectCmd.execute>[1],
      );
      if (result.ok) {
        return { success: true, message: 'Project operation completed.', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => 'adev project <sub> - Manage projects (add/remove/list/switch/update)',
  } satisfies CliCommandHandler);

  const authCmd = new AuthCommand(logger);
  const authHandler: CliCommandHandler = {
    execute: async (options) => {
      const parsed = options as Record<string, unknown>;
      const result = await authCmd.execute([], parsed);
      if (result.ok) {
        return { success: true, message: '', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => authCmd.help(),
  };
  app.registerCommand('auth', authHandler);
  // WHY: 'setting'은 'config'의 별칭 — 직관적인 이름 제공
  app.registerCommand('setting', {
    execute: async (options) => {
      const parsed = options as Record<string, unknown>;
      const sub = parsed.sub as string | undefined;
      const args = sub ? [sub] : [];
      const result = await configCmd.execute(args, options);
      if (result.ok) {
        return { success: true, message: 'Config operation completed.', exitCode: 0 };
      }
      return { success: false, message: result.error.message, exitCode: 1 };
    },
    help: () => 'adev setting <sub> - Manage configuration (alias: config)',
  } satisfies CliCommandHandler);

  // 4. CLI 실행 (process.argv 전달) / Execute CLI (pass process.argv)
  // WHY: process.argv를 그대로 전달 (CliApp 내부에서 hideBin 처리)
  const exitCode = await app.run(process.argv);

  // 5. 종료 코드로 프로세스 종료 / Exit process with exit code
  process.exit(exitCode);
}

// 메인 함수 실행 / Execute main function
main().catch((error: unknown) => {
  process.stderr.write(`\n[FATAL] Unexpected error: ${String(error)}\n`);
  process.exit(1);
});
