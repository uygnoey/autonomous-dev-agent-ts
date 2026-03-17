/**
 * IpcPoller 내부 헬퍼 함수 / IpcPoller internal helper functions
 *
 * @description
 * KR: IpcPoller에서 사용하는 순수 헬퍼 함수 모음.
 *     ENOENT 판별, 안전한 경로 조합, JSON 파일 읽기, 콜백 안전 호출을 제공한다.
 * EN: Pure helper functions used by IpcPoller.
 *     Provides ENOENT detection, safe path joining, JSON file reading, and safe callback invocation.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from 'core/logger.js';
import type { IpcEvent, IpcPollerCallback } from 'layer2/ipc-poller-types.js';

/**
 * 에러가 ENOENT인지 판별 / Check if error is ENOENT
 *
 * @param err - 검사할 에러 / Error to check
 * @returns ENOENT 여부 / Whether the error is ENOENT
 */
export function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

/**
 * path traversal 방지 join — base 외부로 탈출하면 null 반환
 * Safe path join preventing path traversal — returns null if result escapes base
 *
 * @param base - 기준 디렉토리 / Base directory
 * @param segment - 추가 경로 세그먼트 / Path segment to append
 * @returns 안전한 절대 경로 또는 null / Safe absolute path or null
 */
export function safeJoin(base: string, segment: string): string | null {
  const joined = resolve(base, segment);
  if (!joined.startsWith(base)) return null;
  return joined;
}

/**
 * JSON 파일을 읽어 Record<string, unknown>으로 반환
 * Read a JSON file and return as Record<string, unknown>
 *
 * @description
 * KR: 파싱 실패 시 빈 객체 반환 (에러는 warn 로그).
 * EN: Returns empty object on parse failure (error is warn-logged).
 *
 * @param filePath - 읽을 파일 경로 / File path to read
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 파싱된 JSON 객체 / Parsed JSON object
 */
export async function readJsonFile(
  filePath: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch (err: unknown) {
    logger.warn('IpcPoller: JSON read/parse failed', { filePath, error: String(err) });
    return {};
  }
}

/**
 * 콜백을 안전하게 호출 — throw는 logger.error로 흡수
 * Safely invoke callback — absorbs throws via logger.error
 *
 * @param callback - IPC 이벤트 콜백 / IPC event callback
 * @param event - 전달할 IPC 이벤트 / IPC event to dispatch
 * @param logger - 로거 인스턴스 / Logger instance
 */
export async function invokeCallback(
  callback: IpcPollerCallback,
  event: IpcEvent,
  logger: Logger,
): Promise<void> {
  try {
    await callback(event);
  } catch (err: unknown) {
    logger.error('IpcPoller: callback threw an error', { type: event.type, error: String(err) });
  }
}
