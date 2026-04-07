/**
 * adev 설정 관리 / Configuration management
 *
 * @description
 * KR: process.env 접근의 유일한 진입점.
 *     타입 정의는 config-schema.ts, 병합/검증은 config-merge.ts에 분리.
 * EN: Single entry point for process.env access.
 *     Types in config-schema.ts, merge/validate in config-merge.ts.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from 'core/errors.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── re-export 분할 파일 / Re-export split files ──────────────

export { DEFAULT_CONFIG } from 'core/config-schema.js';
export type {
  AuthMode,
  CleanEnvType,
  ConfigSchema,
  DeepPartial,
  EmbeddingConfig,
  EnvironmentVars,
  LogConfig,
  ModelReferenceConfig,
  ModelsConfig,
  PhaseModelMappingConfig,
  TestingConfig,
  VerificationConfig,
} from 'core/config-schema.js';

export { deepMerge, validateConfig } from 'core/config-merge.js';

// ── 내부 import / Internal imports ──────────────────────────────

import { deepMerge, validateConfig } from 'core/config-merge.js';
import { DEFAULT_CONFIG } from 'core/config-schema.js';
import type { ConfigSchema, EnvironmentVars } from 'core/config-schema.js';

// ── 서브프로세스 안전 환경변수 / Safe env for subprocesses ─────────

/**
 * 서브프로세스에 전달할 안전한 환경변수 서브셋 반환 / Return safe environment variable subset for subprocesses
 *
 * @description
 * KR: 민감한 인증 정보(API 키, OAuth 토큰 등)를 제외하고
 *     시스템 동작에 필요한 최소한의 변수만 전달한다.
 * EN: Excludes sensitive credentials (API keys, OAuth tokens, etc.)
 *     and passes only minimal system variables needed for subprocess operation.
 *
 * @returns 안전한 환경변수 레코드 / Record of safe environment variables
 */
export function getSafeEnvForSubprocess(): Record<string, string> {
  const SAFE_KEYS = [
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'TERM',
    'SHELL',
    'TMPDIR',
    'XDG_RUNTIME_DIR',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_CACHE_HOME',
  ] as const;

  const result: Record<string, string> = {};
  for (const key of SAFE_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ── Headless 모드 / Headless Mode ───────────────────────────────

/**
 * headless 모드 여부를 반환한다 / Check if running in headless mode
 *
 * @description
 * KR: ADEV_HEADLESS=1 이면 TUI를 비활성화하고 plain text 출력으로 전환.
 *     Docker, CI, 파이프라인 등 비대화형 환경에서 사용.
 * EN: When ADEV_HEADLESS=1, disables TUI and switches to plain text output.
 *     Used in Docker, CI, pipeline, and other non-interactive environments.
 *
 * @returns true if headless mode is active
 */
export function isHeadless(): boolean {
  return process.env.ADEV_HEADLESS === '1' || process.env.ADEV_HEADLESS === 'true';
}

// ── 환경변수 / Environment Variables ────────────────────────────

/**
 * 환경변수에서 Voyage API 키를 읽는다 / Read Voyage API key from environment
 *
 * @returns VOYAGE_API_KEY 값 또는 null / VOYAGE_API_KEY value or null
 */
function getVoyageApiKey(): string | null {
  return process.env.VOYAGE_API_KEY ?? null;
}

/**
 * 환경변수에서 인증 정보를 읽는다 / Load authentication from environment variables
 *
 * @returns 성공 시 EnvironmentVars, 실패 시 ConfigError
 */
export function loadEnvironment(): Result<EnvironmentVars, ConfigError> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (!(apiKey || oauthToken)) {
    return err(
      new ConfigError(
        'config_missing_key',
        'ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN 중 하나를 설정하세요.',
      ),
    );
  }

  // WHY: 스펙 §3 — API key와 Subscription 동시 설정 불가. 혼동 방지를 위해 하나만 허용
  if (apiKey && oauthToken) {
    return err(
      new ConfigError(
        'config_dual_auth',
        'ANTHROPIC_API_KEY와 CLAUDE_CODE_OAUTH_TOKEN이 동시에 설정되어 있습니다. 하나만 사용하세요. ' +
          '제거: unset ANTHROPIC_API_KEY 또는 unset CLAUDE_CODE_OAUTH_TOKEN',
      ),
    );
  }

  return ok({
    authMode: apiKey ? 'api-key' : 'oauth-token',
    anthropicApiKey: apiKey,
    claudeCodeOauthToken: oauthToken,
  });
}

// ── 설정 로드 / Config Loading ───────────────────────────────────

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
 * 글로벌 + 프로젝트 설정을 병합하여 로드한다 / Load and merge global + project config
 *
 * @param projectPath - 프로젝트 경로 (없으면 글로벌만 로드)
 * @returns 병합된 ConfigSchema
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
