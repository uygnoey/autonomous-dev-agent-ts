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
  CleanEnvType,
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

// ── 플러그인 SDK v2 ──────────────────────────────────────────

export type {
  AdevPlugin,
  LoadedPluginV2,
  PhaseChangeInfo,
  PluginCapability,
  PluginCompletionResult,
  PluginConfigAccess,
  PluginContext,
  PluginDependency,
  PluginManifestV2,
  PluginPermission,
  PluginStatus,
} from 'core/plugin-types.js';

export { DefaultPluginContext } from 'core/plugin-context.js';
export type { PluginEventListener } from 'core/plugin-context.js';

export { PluginManager } from 'core/plugin-manager.js';

// ── 프로세스 실행 ─────────────────────────────────────────────

export { ProcessExecutor } from 'core/process-executor.js';
export type { ProcessOptions, ProcessResult } from 'core/process-executor.js';

// ── skill 병합 ────────────────────────────────────────────────

export { SkillMerger } from 'core/skill-merger.js';
export type {
  ISkillMerger,
  SkillFile,
  SkillMergeOptions,
  SkillReference,
} from 'core/skill-merger-types.js';

// ── 템플릿 로더 ───────────────────────────────────────────────

export { TemplateLoader } from 'core/template-loader.js';
export type {
  ITemplateLoader,
  PromptTemplate,
  TemplateFormat,
  TemplateLoadOptions,
} from 'core/template-loader-types.js';

// ── Circuit Breaker ──────────────────────────────────────────────

export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from 'core/circuit-breaker.js';
export type {
  CircuitBreakerConfig,
  CircuitBreakerSnapshot,
  CircuitBreakerState,
} from 'core/circuit-breaker.js';

// ── 성능 프로파일링 ──────────────────────────────────────────────

export { PerfTracker } from 'core/perf.js';
export type { PerfEntry, PerfOptions } from 'core/perf.js';

// ── 파일 크기 가드 ─────────────────────────────────────────────

export {
  checkFileSize,
  guardAndSplitIfNeeded,
  MAX_FILE_SIZE_BYTES,
  SPLIT_CHUNK_SIZE_BYTES,
  splitLargeFile,
} from 'core/file-size-guard.js';

// ── 안전한 JSON 파싱 ──────────────────────────────────────────────

export {
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_SIZE,
  safeJsonParse,
  sanitizeFilePath,
} from 'core/safe-json.js';
export type { SafeJsonParseOptions } from 'core/safe-json.js';

// ── 메트릭스 ────────────────────────────────────────────────────

export {
  createMetricsEvent,
  JsonStdoutMetricsCollector,
  NoOpMetricsCollector,
} from 'core/metrics.js';
export type { MetricsCollector, MetricsEvent, MetricsLabels } from 'core/metrics.js';
