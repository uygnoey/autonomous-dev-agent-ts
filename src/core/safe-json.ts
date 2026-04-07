/**
 * 안전한 JSON 파싱 유틸리티 / Safe JSON parsing utilities
 *
 * @description
 * KR: 외부 입력의 JSON 파싱 시 크기/깊이 제한을 적용하여 DoS 공격을 방지한다.
 * EN: Applies size/depth limits when parsing JSON from external input to prevent DoS attacks.
 */

import { AdevError } from 'core/errors.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

// ── 상수 / Constants ─────────────────────────────────────────────

/** 기본 최대 JSON 문자열 크기 (bytes) / Default max JSON string size */
export const DEFAULT_MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB

/** 기본 최대 중첩 깊이 / Default max nesting depth */
export const DEFAULT_MAX_JSON_DEPTH = 64;

// ── 옵션 타입 / Options ──────────────────────────────────────────

/**
 * 안전한 JSON 파싱 옵션 / Safe JSON parse options
 *
 * @param maxSize - 최대 허용 크기 (bytes) / Max allowed size in bytes
 * @param maxDepth - 최대 허용 중첩 깊이 / Max allowed nesting depth
 */
export interface SafeJsonParseOptions {
  readonly maxSize?: number;
  readonly maxDepth?: number;
}

// ── 구현 / Implementation ────────────────────────────────────────

/**
 * 크기와 깊이 제한이 적용된 안전한 JSON 파싱 / Safe JSON parse with size and depth limits
 *
 * @description
 * KR: 입력 문자열의 크기를 먼저 검사한 후 JSON.parse를 수행하고,
 *     결과 객체의 중첩 깊이를 검증한다.
 * EN: Checks input string size first, then performs JSON.parse,
 *     and validates the nesting depth of the resulting object.
 *
 * @param input - 파싱할 JSON 문자열 / JSON string to parse
 * @param options - 크기/깊이 제한 옵션 / Size/depth limit options
 * @returns ok(T) 파싱 성공, err(AdevError) 실패 / ok on success, err on failure
 */
export function safeJsonParse<T = unknown>(
  input: string,
  options?: SafeJsonParseOptions,
): Result<T> {
  const maxSize = options?.maxSize ?? DEFAULT_MAX_JSON_SIZE;
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_JSON_DEPTH;

  // WHY: JSON.parse 전에 크기를 먼저 검사하여 대용량 문자열 파싱으로 인한 메모리 폭발 방지
  if (input.length > maxSize) {
    return err(
      new AdevError(
        'json_size_exceeded',
        `JSON 크기 초과: ${input.length} bytes > ${maxSize} bytes 제한`,
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (cause) {
    return err(new AdevError('json_parse_failed', 'JSON 파싱 실패', cause));
  }

  // WHY: 깊이 검증으로 깊은 중첩 구조를 통한 스택 오버플로 및 과도한 재귀 방지
  if (!checkDepth(parsed, maxDepth, 0)) {
    return err(
      new AdevError('json_depth_exceeded', `JSON 중첩 깊이 초과: 최대 ${maxDepth} 레벨 허용`),
    );
  }

  return ok(parsed as T);
}

/**
 * 객체의 중첩 깊이를 재귀적으로 검사한다 / Recursively checks object nesting depth
 *
 * @param value - 검사할 값 / Value to check
 * @param maxDepth - 최대 허용 깊이 / Maximum allowed depth
 * @param currentDepth - 현재 깊이 / Current depth
 * @returns 깊이 제한 이내이면 true / true if within depth limit
 */
function checkDepth(value: unknown, maxDepth: number, currentDepth: number): boolean {
  if (currentDepth > maxDepth) {
    return false;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!checkDepth(item, maxDepth, currentDepth + 1)) {
        return false;
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      if (!checkDepth((value as Record<string, unknown>)[key], maxDepth, currentDepth + 1)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * 파일 경로에서 path traversal 시도를 감지한다 / Detects path traversal attempts in file paths
 *
 * @description
 * KR: '../', '..\\', 절대 경로, null 바이트 등 경로 순회 패턴을 검사한다.
 * EN: Checks for path traversal patterns like '../', '..\\', absolute paths, null bytes.
 *
 * @param filePath - 검사할 파일 경로 / File path to check
 * @returns ok(string) 안전한 경로, err(AdevError) 위험한 경로 / ok if safe, err if dangerous
 */
export function sanitizeFilePath(filePath: string): Result<string> {
  if (!filePath || filePath.length === 0) {
    return err(new AdevError('path_empty', '파일 경로가 비어있습니다'));
  }

  // WHY: null 바이트를 포함한 경로는 C 기반 시스템에서 경로 해석을 오염시킬 수 있음
  if (filePath.includes('\0')) {
    return err(new AdevError('path_null_byte', '파일 경로에 null 바이트가 포함되어 있습니다'));
  }

  // WHY: 상대 경로 순회를 통한 상위 디렉토리 접근 방지
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('../') || normalized.includes('/..') || normalized === '..') {
    return err(new AdevError('path_traversal', `경로 순회 시도 감지: ${filePath}`));
  }

  // WHY: 절대 경로를 통한 임의 파일 시스템 접근 방지
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return err(new AdevError('path_absolute', `절대 경로 사용 금지: ${filePath}`));
  }

  return ok(filePath);
}
