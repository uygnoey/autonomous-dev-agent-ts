/**
 * adev 설정 관리 / Configuration management
 *
 * @description
 * process.env 접근의 유일한 진입점.
 * 글로벌(~/.adev/config.json) + 프로젝트(/project/.adev/config.json) 설정 병합.
 * 환경변수 검증 (ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN 동시 설정 불가).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from './errors.js';
import { err, ok } from './types.js';
import type { Result } from './types.js';

// ── 타입 정의 ────────────────────────────────────────────────

/** 인증 방식 */
export type AuthMode = 'api-key' | 'oauth-token';

/** 환경변수에서 읽은 인증 정보 */
export interface EnvironmentVars {
  readonly authMode: AuthMode;
  readonly anthropicApiKey: string | undefined;
  readonly claudeCodeOauthToken: string | undefined;
}

/** 임베딩 설정 */
export interface EmbeddingConfig {
  readonly default: string;
  readonly code: string;
  readonly voyageApiKey: string | null;
}

/** 테스트 수량 설정 */
export interface TestingConfig {
  readonly unitCount: number;
  readonly moduleCount: number;
  readonly e2eCount: number;
  readonly integrationE2eCount: number;
  readonly parallelWorkers: number | 'auto';
  readonly e2eTimeoutSeconds: number;
}

/** 4중 검증 모델 설정 */
export interface VerificationConfig {
  readonly layer1Model: 'opus' | 'sonnet';
  readonly adevModel: 'opus' | 'sonnet';
  readonly opusEscalationOnFailure: boolean;
}

/** 로그 설정 */
export interface LogConfig {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
}

/** 전체 설정 스키마 */
export interface ConfigSchema {
  readonly embedding: EmbeddingConfig;
  readonly testing: TestingConfig;
  readonly verification: VerificationConfig;
  readonly log: LogConfig;
}

/** 깊은 Partial 타입 / Deep partial type */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ── 기본값 ───────────────────────────────────────────────────

/** 기본 설정 / Default configuration */
export const DEFAULT_CONFIG: ConfigSchema = {
  embedding: {
    default: 'xenova-minilm',
    code: 'xenova-minilm',
    voyageApiKey: null,
  },
  testing: {
    unitCount: 10_000,
    moduleCount: 10_000,
    e2eCount: 100_000,
    integrationE2eCount: 1_000_000,
    parallelWorkers: 'auto',
    e2eTimeoutSeconds: 300,
  },
  verification: {
    layer1Model: 'opus',
    adevModel: 'opus',
    opusEscalationOnFailure: true,
  },
  log: {
    level: 'info',
  },
};

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const VALID_MODELS = new Set(['opus', 'sonnet']);

// ── 환경변수 ─────────────────────────────────────────────────

/**
 * 환경변수에서 인증 정보를 읽는다 / Load authentication from environment variables
 *
 * @returns 성공 시 EnvironmentVars, 실패 시 ConfigError
 *
 * @example
 * const envResult = loadEnvironment();
 * if (!envResult.ok) throw envResult.error;
 */
export function loadEnvironment(): Result<EnvironmentVars, ConfigError> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (apiKey && oauthToken) {
    return err(
      new ConfigError(
        'config_invalid_auth_both',
        'ANTHROPIC_API_KEY와 CLAUDE_CODE_OAUTH_TOKEN을 동시에 설정할 수 없습니다. 하나만 사용하세요.',
      ),
    );
  }

  if (!(apiKey || oauthToken)) {
    return err(
      new ConfigError(
        'config_missing_key',
        'ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN 중 하나를 설정하세요.',
      ),
    );
  }

  return ok({
    authMode: apiKey ? 'api-key' : 'oauth-token',
    anthropicApiKey: apiKey,
    claudeCodeOauthToken: oauthToken,
  });
}

// ── 설정 로드 ────────────────────────────────────────────────

/**
 * JSON 파일을 읽어 객체로 반환한다 / Read a JSON config file
 *
 * @param filePath - 읽을 JSON 파일 경로
 * @returns 파싱된 객체. 파일 없으면 빈 객체 반환.
 */
async function loadJsonFile(
  filePath: string,
): Promise<Result<Record<string, unknown>, ConfigError>> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      return ok({});
    }
    const text = await file.text();
    if (text.trim() === '') {
      return ok({});
    }
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return err(
        new ConfigError(
          'config_invalid_value',
          `설정 파일이 올바른 JSON 객체가 아닙니다: ${filePath}`,
        ),
      );
    }
    return ok(parsed as Record<string, unknown>);
  } catch (error: unknown) {
    return err(new ConfigError('config_invalid_value', `설정 파일 읽기 실패: ${filePath}`, error));
  }
}

/**
 * 두 객체를 깊은 병합한다 / Deep merge two objects (target wins for scalar, recursively for objects)
 *
 * @param base - 기본 객체
 * @param override - 오버라이드 객체 (우선)
 * @returns 병합된 새 객체
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base } as Record<string, unknown>;

  for (const key of Object.keys(override)) {
    const baseVal = result[key];
    const overrideVal = override[key];

    if (
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }

  return result as T;
}

/**
 * 설정 값의 유효성을 검증한다 / Validate config values
 *
 * @param config - 검증할 설정 객체
 * @returns 성공 시 ok, 실패 시 ConfigError
 */
export function validateConfig(config: DeepPartial<ConfigSchema>): Result<void, ConfigError> {
  // WHY: partial config 지원 — 설정된 필드만 검증
  if (config.log?.level !== undefined && !VALID_LOG_LEVELS.has(config.log.level)) {
    return err(
      new ConfigError(
        'config_invalid_value',
        `유효하지 않은 log level: '${config.log.level}'. 가능한 값: debug, info, warn, error`,
      ),
    );
  }

  if (
    config.verification?.layer1Model !== undefined &&
    !VALID_MODELS.has(config.verification.layer1Model)
  ) {
    return err(
      new ConfigError(
        'config_invalid_value',
        `유효하지 않은 verification.layer1Model: '${config.verification.layer1Model}'`,
      ),
    );
  }

  if (
    config.verification?.adevModel !== undefined &&
    !VALID_MODELS.has(config.verification.adevModel)
  ) {
    return err(
      new ConfigError(
        'config_invalid_value',
        `유효하지 않은 verification.adevModel: '${config.verification.adevModel}'`,
      ),
    );
  }

  if (config.testing?.unitCount !== undefined && config.testing.unitCount <= 0) {
    return err(new ConfigError('config_invalid_value', 'testing.unitCount는 0보다 커야 합니다'));
  }

  if (config.testing?.e2eTimeoutSeconds !== undefined && config.testing.e2eTimeoutSeconds <= 0) {
    return err(
      new ConfigError('config_invalid_value', 'testing.e2eTimeoutSeconds는 0보다 커야 합니다'),
    );
  }

  return ok(undefined);
}

/**
 * 글로벌 + 프로젝트 설정을 병합하여 로드한다 / Load and merge global + project config
 *
 * @param projectPath - 프로젝트 경로 (없으면 글로벌만 로드)
 * @returns 병합된 ConfigSchema
 *
 * @example
 * const configResult = await loadConfig('/path/to/project');
 * if (!configResult.ok) console.error(configResult.error);
 */
export async function loadConfig(projectPath?: string): Promise<Result<ConfigSchema, ConfigError>> {
  const globalConfigPath = join(homedir(), '.adev', 'config.json');
  const globalResult = await loadJsonFile(globalConfigPath);
  if (!globalResult.ok) return globalResult;

  let merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, globalResult.value);

  if (projectPath) {
    const projectConfigPath = join(projectPath, '.adev', 'config.json');
    const projectResult = await loadJsonFile(projectConfigPath);
    if (!projectResult.ok) return projectResult;
    merged = deepMerge(merged, projectResult.value);
  }

  const config = merged as unknown as ConfigSchema;
  const validationResult = validateConfig(config);
  if (!validationResult.ok) return validationResult;

  return ok(config);
}
