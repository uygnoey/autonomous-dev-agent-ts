/**
 * cli 모듈 public API / CLI module public exports
 *
 * @description
 * KR: CLI 명령 라우터, 명령 구현, 타입을 re-export한다.
 * EN: Re-exports CLI command router, command implementations, and types.
 */

// ── 메인 애플리케이션 / Main Application ──────────────────────

export { CliApp, type ICliApp } from 'cli/main.js';

// ── 라우터 / Router ──────────────────────────────────────────

export { CommandRouter, type ParsedArgs, type RoutableCommand } from 'cli/command-router.js';

// ── 명령 / Commands ────────────────────────────────────────────

export { ConfigCommand } from 'cli/commands/config.js';
export { InitCommand } from 'cli/commands/init.js';
export { PluginCommand } from 'cli/commands/plugin.js';
export { ProjectCommand } from 'cli/commands/project.js';
export { StartCommand } from 'cli/commands/start.js';
export { StatusCommand } from 'cli/commands/status.js';

// ── 타입 / Types ───────────────────────────────────────────────

export type {
  CliCommand,
  CliCommandHandler,
  CliCommandName,
  CliResult,
  ConfigOptions,
  GlobalCliOptions,
  InitOptions,
  ProjectInfo,
  PluginSubCommand,
  ProjectOptions,
  ProjectRegistry,
  StartOptions,
} from 'cli/types.js';
export { EXIT_CODES } from 'cli/types.js';
