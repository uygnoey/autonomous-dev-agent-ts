/**
 * Config 조회 로직 / Config read operations
 *
 * @description
 * KR: 설정 파일 읽기, list/get 서브커맨드 처리, dot notation 유틸리티.
 * EN: Config file reading, list/get subcommand handling, dot notation utilities.
 */

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG } from 'core/config.js';
import type { ConfigSchema } from 'core/config.js';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * config list: 현재 설정 전체 표시 / Display all current configuration
 *
 * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
 * @param projectPath - 프로젝트 경로 / Project path
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleList(
  isGlobal: boolean,
  projectPath: string,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  const configPath = isGlobal
    ? getGlobalConfigPath()
    : resolve(projectPath, '.adev', 'config.json');

  const configResult = await readConfigFile(configPath);
  if (!configResult.ok) {
    const errorResult = configResult as { readonly ok: false; readonly error: AdevError };
    return err(errorResult.error);
  }

  const config = configResult.value;
  const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';

  logger.info(`${scope} 설정 / configuration`, {
    path: configPath,
    config: config as unknown as Record<string, unknown>,
  });

  return ok(undefined);
}

/**
 * config get <key>: 특정 키 값 조회 / Get specific config value by dot-notation key
 *
 * @param key - 설정 키 / Config key
 * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
 * @param projectPath - 프로젝트 경로 / Project path
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function handleGet(
  key: string,
  isGlobal: boolean,
  projectPath: string,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  const configPath = isGlobal
    ? getGlobalConfigPath()
    : resolve(projectPath, '.adev', 'config.json');

  const configResult = await readConfigFile(configPath);
  if (!configResult.ok) {
    const errorResult = configResult as { readonly ok: false; readonly error: AdevError };
    return err(errorResult.error);
  }

  const value = getNestedValue(configResult.value as unknown as Record<string, unknown>, key);
  if (value === undefined) {
    return err(new AdevError('cli_config_key_not_found', `설정 키를 찾을 수 없습니다: '${key}'`));
  }

  const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';
  logger.info(`${scope} config.${key}`, { value });
  return ok(undefined);
}

/**
 * 글로벌 설정 파일 경로를 반환한다 / Get global config file path
 *
 * @returns 글로벌 설정 파일 경로 / Global config file path
 */
export function getGlobalConfigPath(): string {
  return resolve(homedir(), '.adev', 'config.json');
}

/**
 * 설정 파일을 읽는다 / Read config file
 *
 * @param filePath - 설정 파일 경로 / Config file path
 * @returns 설정 객체 / Config object
 */
export async function readConfigFile(filePath: string): Promise<Result<ConfigSchema, AdevError>> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      // WHY: 파일이 없으면 기본값 반환
      return ok(structuredClone(DEFAULT_CONFIG));
    }

    const text = await file.text();
    if (text.trim() === '') {
      return ok(structuredClone(DEFAULT_CONFIG));
    }

    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return err(
        new AdevError(
          'cli_config_invalid_value',
          `설정 파일이 올바른 JSON 객체가 아닙니다: ${filePath}`,
        ),
      );
    }

    return ok(parsed as ConfigSchema);
  } catch (error: unknown) {
    return err(new AdevError('cli_config_read_failed', `설정 파일 읽기 실패: ${filePath}`, error));
  }
}

/**
 * dot notation 키로 중첩 객체에서 값을 가져온다 / Get nested value via dot notation
 *
 * @param obj - 대상 객체 / Target object
 * @param key - dot notation 키 (예: 'log.level') / Dot notation key
 * @returns 값 또는 undefined / Value or undefined
 *
 * @example
 * getNestedValue({ log: { level: 'info' } }, 'log.level') // 'info'
 */
export function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * 문자열 값을 적절한 타입으로 파싱한다 / Parse string value to appropriate type
 *
 * @param value - 파싱할 문자열 / String to parse
 * @returns 파싱된 값 (boolean, number, null, 또는 string) / Parsed value
 *
 * @example
 * parseConfigValue('true') // true
 * parseConfigValue('123') // 123
 * parseConfigValue('null') // null
 * parseConfigValue('debug') // 'debug'
 */
export function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;

  return value;
}
