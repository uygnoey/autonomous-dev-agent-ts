/**
 * core 모듈 public API / Core module public exports
 *
 * @description
 * 프로젝트 전체에서 사용하는 에러, 타입, 설정, 로거, 메모리, 플러그인 로더를 re-export한다.
 */

// ── 에러 계층 ────────────────────────────────────────────────

export {
  AdevError,
  AgentError,
  AuthError,
  ConfigError,
  ContractError,
  DEFAULT_RETRY_POLICY,
  isAdevError,
  McpError,
  PhaseError,
  RagError,
} from 'core/errors.js';
export type { RetryPolicy } from 'core/errors.js';

// ── 타입 + 헬퍼 ──────────────────────────────────────────────

export { err, ok } from 'core/types.js';
export type {
  AgentName,
  CodeMetadata,
  CodeRecord,
  DesignDecision,
  FailureRecord,
  FeatureStatus,
  MemoryMetadata,
  MemoryRecord,
  MemoryType,
  Phase,
  Result,
  VectorRepository,
} from 'core/types.js';

// ── 설정 ─────────────────────────────────────────────────────

export {
  DEFAULT_CONFIG,
  deepMerge,
  loadConfig,
  loadEnvironment,
  validateConfig,
} from 'core/config.js';
export type {
  AuthMode,
  ConfigSchema,
  EmbeddingConfig,
  EnvironmentVars,
  LogConfig,
  TestingConfig,
  VerificationConfig,
} from 'core/config.js';

// ── 로거 ─────────────────────────────────────────────────────

export { ConsoleLogger, maskSensitiveData } from 'core/logger.js';
export type { LogEntry, Logger, LogLevel } from 'core/logger.js';

// ── 메모리 ───────────────────────────────────────────────────

export { MemoryRepository } from 'core/memory.js';

// ── 플러그인 ─────────────────────────────────────────────────

export { DefaultPluginLoader } from 'core/plugin-loader.js';
export type { Plugin, PluginLoader, PluginManifest } from 'core/plugin-loader.js';

// ── 프로세스 실행 ─────────────────────────────────────────────

export { ProcessExecutor } from 'core/process-executor.js';
export type { ProcessOptions, ProcessResult } from 'core/process-executor.js';
