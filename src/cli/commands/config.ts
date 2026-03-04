/**
 * config 명령 / Config command
 *
 * @description
 * KR: 프로젝트 설정을 조회하거나 수정한다 (list, get, set, reset 서브커맨드).
 *     글로벌 설정 (~/.adev/config.json) 또는 프로젝트 설정 (.adev/config.json) 관리.
 * EN: View or update project configuration (list, get, set, reset subcommands).
 *     Manages global config (~/.adev/config.json) or project config (.adev/config.json).
 *
 * @example
 * adev config list                         # 모든 설정 조회
 * adev config get log.level                # 특정 설정 조회
 * adev config set log.level debug          # 설정 변경
 * adev config set log.level info --global  # 글로벌 설정 변경
 * adev config reset                        # 설정 초기화 (기본값)
 * adev config reset --global               # 글로벌 설정 초기화
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONFIG, validateConfig } from '../../core/config.js';
import type { ConfigSchema } from '../../core/config.js';
import { AdevError, ConfigError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { GlobalCliOptions } from '../types.js';

// ── ConfigCommand ──────────────────────────────────────────────

/**
 * 설정 관리 명령 / Configuration management command
 *
 * @description
 * KR: 프로젝트 설정을 list/get/set/reset 서브커맨드로 관리한다.
 *     --global 플래그로 글로벌 설정과 프로젝트 설정을 구분한다.
 * EN: Manages project configuration via list/get/set/reset subcommands.
 *     Uses --global flag to distinguish between global and project config.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new ConfigCommand(logger);
 * await cmd.execute(['list'], {});
 * await cmd.execute(['get', 'log.level'], {});
 * await cmd.execute(['set', 'log.level', 'debug'], {});
 * await cmd.execute(['reset'], { global: true });
 */
export class ConfigCommand {
  readonly name = 'config';
  readonly description = 'View or update configuration / 설정 조회 및 수정';
  readonly aliases = ['cfg'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:config' });
  }

  /**
   * config 명령 실행 / Execute config command
   *
   * @description
   * KR: 서브커맨드(list, get, set, reset)에 따라 분기하여 실행한다.
   * EN: Executes based on subcommand (list, get, set, reset).
   *
   * @param args - 서브커맨드 + 인자 / Subcommand + arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(
    args: readonly string[],
    options: GlobalCliOptions,
  ): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError(
          'cli_config_missing_subcommand',
          '서브커맨드가 필요합니다: list, get, set, reset',
        ),
      );
    }

    // WHY: 서브커맨드 검증
    if (!['list', 'get', 'set', 'reset'].includes(subcommand)) {
      return err(
        new AdevError(
          'cli_config_unknown_subcommand',
          `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: list, get, set, reset`,
        ),
      );
    }

    // WHY: --global 플래그 확인 (options를 any로 캐스팅하여 flags 접근)
    const isGlobal = (options as { global?: boolean }).global === true;

    switch (subcommand) {
      case 'list':
        return this.handleList(isGlobal);
      case 'get': {
        const key = args[1];
        if (!key) {
          return err(new AdevError('cli_config_missing_key', 'config get: 키를 지정하세요'));
        }
        return this.handleGet(key, isGlobal);
      }
      case 'set': {
        const key = args[1];
        const rawValue = args[2];
        if (!key || rawValue === undefined) {
          return err(
            new AdevError('cli_config_missing_args', 'config set: 키와 값을 모두 지정하세요'),
          );
        }
        return this.handleSet(key, rawValue, isGlobal);
      }
      case 'reset':
        return this.handleReset(isGlobal);
      default:
        return err(
          new AdevError('cli_config_unknown_subcommand', `알 수 없는 서브커맨드: '${subcommand}'.`),
        );
    }
  }

  /**
   * config list: 현재 설정 전체 표시 / Display all current configuration
   *
   * @description
   * KR: 글로벌 또는 프로젝트 설정을 JSON 형식으로 출력한다.
   * EN: Outputs global or project configuration in JSON format.
   *
   * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async handleList(isGlobal: boolean): Promise<Result<void, AdevError>> {
    const configPath = isGlobal ? this.getGlobalConfigPath() : resolve('.', '.adev', 'config.json');

    // WHY: 설정 파일 읽기
    const configResult = await this.readConfigFile(configPath);
    if (!configResult.ok) {
      const errorResult = configResult as { readonly ok: false; readonly error: AdevError };
      return err(errorResult.error);
    }

    const config = configResult.value;
    const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';

    this.logger.info(`${scope} 설정 / configuration`, {
      path: configPath,
      config: config as unknown as Record<string, unknown>,
    });

    return ok(undefined);
  }

  /**
   * config get <key>: 특정 키 값 조회 / Get specific config value by dot-notation key
   *
   * @description
   * KR: dot notation 키(예: log.level)로 설정 값을 조회한다.
   * EN: Retrieves config value using dot notation key (e.g., log.level).
   *
   * @param key - 설정 키 / Config key
   * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async handleGet(key: string, isGlobal: boolean): Promise<Result<void, AdevError>> {
    const configPath = isGlobal ? this.getGlobalConfigPath() : resolve('.', '.adev', 'config.json');

    // WHY: 설정 파일 읽기
    const configResult = await this.readConfigFile(configPath);
    if (!configResult.ok) {
      const errorResult = configResult as { readonly ok: false; readonly error: AdevError };
      return err(errorResult.error);
    }

    const value = getNestedValue(configResult.value as unknown as Record<string, unknown>, key);
    if (value === undefined) {
      return err(new AdevError('cli_config_key_not_found', `설정 키를 찾을 수 없습니다: '${key}'`));
    }

    const scope = isGlobal ? '글로벌 / Global' : '프로젝트 / Project';
    this.logger.info(`${scope} config.${key}`, { value });
    return ok(undefined);
  }

  /**
   * config set <key> <value>: 설정 값 수정 / Set a config value
   *
   * @description
   * KR: dot notation 키로 설정 값을 변경하고 파일에 저장한다.
   *     변경 후 검증을 수행하여 유효성을 확인한다.
   * EN: Changes config value using dot notation key and saves to file.
   *     Validates the config after modification.
   *
   * @param key - 설정 키 / Config key
   * @param rawValue - 설정 값 (문자열) / Config value (string)
   * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async handleSet(
    key: string,
    rawValue: string,
    isGlobal: boolean,
  ): Promise<Result<void, AdevError>> {
    const configPath = isGlobal ? this.getGlobalConfigPath() : resolve('.', '.adev', 'config.json');

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
    const validationResult = validateConfig(existing as unknown as ConfigSchema);
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
    this.logger.info(`${scope} 설정 업데이트 / Config updated: ${key}`, { key, value: parsed });
    return ok(undefined);
  }

  /**
   * config reset: 설정을 기본값으로 초기화 / Reset config to default values
   *
   * @description
   * KR: 설정 파일을 기본값(DEFAULT_CONFIG)으로 덮어쓴다.
   * EN: Overwrites the config file with default values (DEFAULT_CONFIG).
   *
   * @param isGlobal - 글로벌 설정 여부 / Whether to use global config
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async handleReset(isGlobal: boolean): Promise<Result<void, AdevError>> {
    const configPath = isGlobal ? this.getGlobalConfigPath() : resolve('.', '.adev', 'config.json');

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
    this.logger.info(`${scope} 설정 초기화 완료 / Config reset to defaults`, { path: configPath });
    return ok(undefined);
  }

  /**
   * 글로벌 설정 파일 경로를 반환한다 / Get global config file path
   *
   * @returns 글로벌 설정 파일 경로 / Global config file path
   */
  private getGlobalConfigPath(): string {
    return resolve(homedir(), '.adev', 'config.json');
  }

  /**
   * 설정 파일을 읽는다 / Read config file
   *
   * @description
   * KR: JSON 파일을 읽어 파싱한다. 파일이 없으면 기본값을 반환한다.
   * EN: Reads and parses JSON file. Returns default config if file doesn't exist.
   *
   * @param filePath - 설정 파일 경로 / Config file path
   * @returns 설정 객체 / Config object
   */
  private async readConfigFile(filePath: string): Promise<Result<ConfigSchema, AdevError>> {
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
      return err(
        new AdevError('cli_config_read_failed', `설정 파일 읽기 실패: ${filePath}`, error),
      );
    }
  }
}

// ── 유틸리티 / Utility ─────────────────────────────────────────

/**
 * dot notation 키로 중첩 객체에서 값을 가져온다 / Get nested value via dot notation
 *
 * @description
 * KR: 'log.level'과 같은 dot notation 키로 중첩된 객체의 값을 조회한다.
 * EN: Retrieves nested object value using dot notation key like 'log.level'.
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
 * dot notation 키로 중첩 객체에 값을 설정한다 / Set nested value via dot notation
 *
 * @description
 * KR: 'log.level'과 같은 dot notation 키로 중첩된 객체에 값을 설정한다.
 *     중간 경로가 없으면 자동으로 생성한다.
 * EN: Sets value in nested object using dot notation key like 'log.level'.
 *     Automatically creates intermediate paths if missing.
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

/**
 * 문자열 값을 적절한 타입으로 파싱한다 / Parse string value to appropriate type
 *
 * @description
 * KR: 문자열을 boolean, number, null 등 적절한 타입으로 변환한다.
 * EN: Converts string to appropriate type (boolean, number, null).
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
