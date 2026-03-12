/**
 * Config 쓰기 로직 / Config write operations
 *
 * @description
 * KR: 설정 파일 쓰기, set/reset 서브커맨드 처리, dot notation 설정.
 * EN: Config file writing, set/reset subcommand handling, dot notation setting.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getGlobalConfigPath } from 'cli/commands/config-reader.js';
import { parseConfigValue } from 'cli/commands/config-reader.js';
import { DEFAULT_CONFIG, validateConfig } from 'core/config.js';
import type { ConfigSchema, DeepPartial } from 'core/config.js';
import { AdevError, type ConfigError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * config set <key> <value>: 설정 값 수정 / Set a config value
 *
 * @param key - 설정 키 / Config key
 * @param rawValue - 설정 값 (문자열) / Config value (string)
 * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
 * @param projectPath - 프로젝트 경로 / Project path
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleSet(
  key: string,
  rawValue: string,
  isGlobal: boolean,
  projectPath: string,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  const configPath = isGlobal
    ? getGlobalConfigPath()
    : resolve(projectPath, '.adev', 'config.json');

  // WHY: 기존 설정 파일 읽기
  let existing: Record<string, unknown> = {};
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const text = await file.text();
      if (text.trim() !== '') {
        existing = JSON.parse(text) as Record<string, unknown>;
      }
    } else {
      // WHY: 파일이 없으면 기본값으로 초기화
      existing = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
    }
  } catch (error: unknown) {
    return err(
      new AdevError('cli_config_read_failed', `설정 파일 읽기 실패: ${String(error)}`, error),
    );
  }

  // WHY: dot notation 키로 값 설정
  const parsed = parseConfigValue(rawValue);
  setNestedValue(existing, key, parsed);

  // WHY: 변경된 설정 검증
  const validationResult = validateConfig(existing as DeepPartial<ConfigSchema>);
  if (!validationResult.ok) {
    const errorResult = validationResult as { readonly ok: false; readonly error: ConfigError };
    return err(
      new AdevError(
        'cli_config_invalid_value',
        `설정 검증 실패: ${errorResult.error.message}`,
        errorResult.error,
      ),
    );
  }

  // WHY: 디렉토리 생성 (글로벌 설정 시 필요)
  try {
    await mkdir(dirname(configPath), { recursive: true });
  } catch (error: unknown) {
    return err(
      new AdevError('cli_config_mkdir_failed', `디렉토리 생성 실패: ${String(error)}`, error),
    );
  }

  // WHY: 설정 파일 쓰기
  try {
    await Bun.write(configPath, JSON.stringify(existing, null, 2));
  } catch (error: unknown) {
    return err(
      new AdevError('cli_config_write_failed', `설정 파일 쓰기 실패: ${String(error)}`, error),
    );
  }

  const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';
  logger.info(`${scope} 설정 업데이트 / Config updated: ${key}`, { key, value: parsed });
  return ok(undefined);
}

/**
 * config reset: 설정을 기본값으로 초기화 / Reset config to default values
 *
 * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
 * @param projectPath - 프로젝트 경로 / Project path
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleReset(
  isGlobal: boolean,
  projectPath: string,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  const configPath = isGlobal
    ? getGlobalConfigPath()
    : resolve(projectPath, '.adev', 'config.json');

  // WHY: 디렉토리 생성 (없을 경우 대비)
  try {
    await mkdir(dirname(configPath), { recursive: true });
  } catch (error: unknown) {
    return err(
      new AdevError('cli_config_mkdir_failed', `디렉토리 생성 실패: ${String(error)}`, error),
    );
  }

  // WHY: 기본값으로 덮어쓰기
  try {
    await Bun.write(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  } catch (error: unknown) {
    return err(
      new AdevError('cli_config_write_failed', `설정 파일 쓰기 실패: ${String(error)}`, error),
    );
  }

  const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';
  logger.info(`${scope} 설정 초기화 완료 / Config reset to defaults`, { path: configPath });
  return ok(undefined);
}

/**
 * dot notation 키로 중첩 객체에 값을 설정한다 / Set nested value via dot notation
 *
 * @param obj - 대상 객체 / Target object
 * @param key - dot notation 키 (예: 'log.level') / Dot notation key
 * @param value - 설정할 값 / Value to set
 *
 * @example
 * const obj = {};
 * setNestedValue(obj, 'log.level', 'debug');
 * // obj === { log: { level: 'debug' } }
 */
export function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    // WHY: i < parts.length - 1 이므로 parts[i]는 항상 존재
    const part = parts[i] ?? '';
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  // WHY: parts.length >= 1 (split은 항상 1개 이상 반환) 이므로 안전한 접근
  const lastPart = parts[parts.length - 1] ?? '';
  current[lastPart] = value;
}
