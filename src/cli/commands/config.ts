/**
 * config 명령 / Config command
 *
 * @description
 * KR: 프로젝트 설정을 조회하거나 수정한다 (get, set, list 서브커맨드).
 * EN: View or update project configuration (get, set, list subcommands).
 */

import { resolve } from 'node:path';
import { loadConfig } from '../../core/config.js';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { CliCommand, CliOptions } from '../types.js';

// ── ConfigCommand ──────────────────────────────────────────────

/**
 * 설정 관리 명령 / Configuration management command
 *
 * @description
 * KR: 프로젝트 설정을 list/get/set 서브커맨드로 관리한다.
 * EN: Manages project configuration via list/get/set subcommands.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new ConfigCommand(logger);
 * await cmd.execute(['list'], { flags: {} });
 * await cmd.execute(['get', 'log.level'], { flags: {} });
 * await cmd.execute(['set', 'log.level', 'debug'], { flags: {} });
 */
export class ConfigCommand implements CliCommand {
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
   * @param args - 서브커맨드 + 인자 / Subcommand + arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>> {
    const subcommand = args[0];

    if (!subcommand) {
      return err(
        new AdevError('cli_config_missing_subcommand', '서브커맨드가 필요합니다: list, get, set'),
      );
    }

    switch (subcommand) {
      case 'list':
        return this.handleList(options);
      case 'get':
        return this.handleGet(args.slice(1), options);
      case 'set':
        return this.handleSet(args.slice(1), options);
      default:
        return err(
          new AdevError(
            'cli_config_unknown_subcommand',
            `알 수 없는 서브커맨드: '${subcommand}'. 사용 가능: list, get, set`,
          ),
        );
    }
  }

  /**
   * config list: 현재 설정 전체 표시 / Display all current configuration
   */
  private async handleList(options: CliOptions): Promise<Result<void, AdevError>> {
    const projectPath = resolve(options.projectPath ?? '.');
    const configResult = await loadConfig(projectPath);

    if (!configResult.ok) {
      return err(
        new AdevError(
          'cli_config_load_failed',
          `설정 로드 실패: ${configResult.error.message}`,
          configResult.error,
        ),
      );
    }

    this.logger.info('현재 설정 / Current configuration', {
      config: configResult.value as unknown as Record<string, unknown>,
    });

    return ok(undefined);
  }

  /**
   * config get <key>: 특정 키 값 조회 / Get specific config value by dot-notation key
   */
  private async handleGet(
    args: readonly string[],
    options: CliOptions,
  ): Promise<Result<void, AdevError>> {
    const key = args[0];
    if (!key) {
      return err(new AdevError('cli_config_missing_key', 'config get: 키를 지정하세요'));
    }

    const projectPath = resolve(options.projectPath ?? '.');
    const configResult = await loadConfig(projectPath);

    if (!configResult.ok) {
      return err(
        new AdevError(
          'cli_config_load_failed',
          `설정 로드 실패: ${configResult.error.message}`,
          configResult.error,
        ),
      );
    }

    const value = getNestedValue(configResult.value as unknown as Record<string, unknown>, key);
    if (value === undefined) {
      return err(new AdevError('cli_config_key_not_found', `설정 키를 찾을 수 없습니다: '${key}'`));
    }

    this.logger.info(`config.${key}`, { value });
    return ok(undefined);
  }

  /**
   * config set <key> <value>: 프로젝트 설정 값 수정 / Set a project config value
   */
  private async handleSet(
    args: readonly string[],
    options: CliOptions,
  ): Promise<Result<void, AdevError>> {
    const key = args[0];
    const rawValue = args[1];

    if (!key || rawValue === undefined) {
      return err(new AdevError('cli_config_missing_args', 'config set: 키와 값을 모두 지정하세요'));
    }

    const projectPath = resolve(options.projectPath ?? '.');
    const configFilePath = resolve(projectPath, '.adev', 'config.json');

    // 기존 설정 파일 읽기 / Read existing config file
    let existing: Record<string, unknown> = {};
    try {
      const file = Bun.file(configFilePath);
      if (await file.exists()) {
        const text = await file.text();
        if (text.trim() !== '') {
          existing = JSON.parse(text) as Record<string, unknown>;
        }
      }
    } catch (error: unknown) {
      return err(
        new AdevError('cli_config_read_failed', `설정 파일 읽기 실패: ${String(error)}`, error),
      );
    }

    // dot notation 키로 값 설정 / Set value via dot notation key
    const parsed = parseConfigValue(rawValue);
    setNestedValue(existing, key, parsed);

    // 설정 파일 쓰기 / Write config file
    try {
      await Bun.write(configFilePath, JSON.stringify(existing, null, 2));
    } catch (error: unknown) {
      return err(
        new AdevError('cli_config_write_failed', `설정 파일 쓰기 실패: ${String(error)}`, error),
      );
    }

    this.logger.info(`설정 업데이트 / Config updated: ${key}`, { key, value: parsed });
    return ok(undefined);
  }
}

// ── 유틸리티 / Utility ─────────────────────────────────────────

/**
 * dot notation 키로 중첩 객체에서 값을 가져온다 / Get nested value via dot notation
 *
 * @param obj - 대상 객체 / Target object
 * @param key - dot notation 키 (예: 'log.level') / Dot notation key
 * @returns 값 또는 undefined / Value or undefined
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
 * @param obj - 대상 객체 / Target object
 * @param key - dot notation 키 (예: 'log.level') / Dot notation key
 * @param value - 설정할 값 / Value to set
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
 * @param value - 파싱할 문자열 / String to parse
 * @returns 파싱된 값 (number, boolean, 또는 string) / Parsed value
 */
export function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;

  return value;
}
