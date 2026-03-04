/**
 * cli 모듈 public API / CLI module public exports
 *
 * @description
 * KR: CLI 명령 라우터, 명령 구현, 타입을 re-export한다.
 * EN: Re-exports CLI command router, command implementations, and types.
 */

// ── 메인 애플리케이션 / Main Application ──────────────────────

export { CliApp, type ICliApp } from './main.js';

// ── 명령 / Commands ────────────────────────────────────────────

export { ConfigCommand } from './commands/config.js';
export { InitCommand } from './commands/init.js';
export { ProjectCommand } from './commands/project.js';
export { StartCommand } from './commands/start.js';

// ── 타입 / Types ───────────────────────────────────────────────

export type {
  CliCommand,
  CliCommandHandler,
  CliResult,
  ConfigOptions,
  GlobalCliOptions,
  InitOptions,
  ProjectInfo,
  ProjectOptions,
  ProjectRegistry,
  StartOptions,
} from './types.js';
export { EXIT_CODES } from './types.js';
