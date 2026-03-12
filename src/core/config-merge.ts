/**
 * 설정 병합 및 검증 / Configuration merging and validation
 *
 * @description
 * KR: 깊은 병합(deepMerge)과 설정 값 검증(validateConfig) 로직을 담당한다.
 * EN: Handles deep merge and config value validation logic.
 */

import type { ConfigSchema, DeepPartial } from 'core/config-schema.js';
import { ConfigError } from 'core/errors.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const VALID_MODELS = new Set(['opus', 'sonnet']);

// ── 깊은 병합 / Deep Merge ─────────────────────────────────────

/**
 * 두 객체를 깊은 병합한다 / Deep merge two objects (target wins for scalar, recursively for objects)
 *
 * @param base - 기본 객체 / Base object
 * @param override - 오버라이드 객체 (우선) / Override object (takes precedence)
 * @returns 병합된 새 객체 / Merged new object
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

// ── 설정 검증 / Config Validation ───────────────────────────────

/**
 * 설정 값의 유효성을 검증한다 / Validate config values
 *
 * @param config - 검증할 설정 객체 / Config object to validate
 * @returns 성공 시 ok, 실패 시 ConfigError / ok on success, ConfigError on failure
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
