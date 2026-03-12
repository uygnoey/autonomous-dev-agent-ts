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
  ConfigSchema,
  DeepPartial,
  EmbeddingConfig,
  EnvironmentVars,
  LogConfig,
  TestingConfig,
  VerificationConfig,
} from 'core/config-schema.js';

export { deepMerge, validateConfig } from 'core/config-merge.js';

// ── 내부 import / Internal imports ──────────────────────────────

import { deepMerge, validateConfig } from 'core/config-merge.js';
import { DEFAULT_CONFIG } from 'core/config-schema.js';
import type { ConfigSchema, EnvironmentVars } from 'core/config-schema.js';

// ── 환경변수 / Environment Variables ────────────────────────────

/**
 * 환경변수에서 Voyage API 키를 읽는다 / Read Voyage API key from environment
 *
 * @returns VOYAGE_API_KEY 값 또는 null / VOYAGE_API_KEY value or null
 */
export function getVoyageApiKey(): string | null {
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
