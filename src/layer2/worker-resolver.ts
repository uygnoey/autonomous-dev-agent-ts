/**
 * 병렬 워커 수 자동 산출 / Parallel Worker Count Resolver
 *
 * @description
 * KR: 스펙 §8.4 — parallel_workers: "auto" 시 CPU 코어 수와 메모리 기반으로 안전한 워커 수 산출.
 *     메모리 80% 초과 시 자동 축소.
 * EN: Spec §8.4 — when parallel_workers is "auto", calculates safe worker count
 *     based on CPU cores and available memory. Reduces automatically above 80% memory usage.
 */

import { cpus, freemem, totalmem } from 'node:os';
import type { Logger } from 'core/logger.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 메모리 사용률 안전 한도 / Safe memory usage ceiling */
const MEMORY_SAFE_CEILING = 0.8;
/** 워커당 최소 필요 메모리 (바이트) / Minimum memory per worker (bytes) */
const MIN_MEMORY_PER_WORKER_BYTES = 512 * 1024 * 1024; // 512 MB
/** 최소 워커 수 / Minimum worker count */
const MIN_WORKERS = 1;
/** 최대 워커 수 (하드 캡) / Maximum worker count (hard cap) */
const MAX_WORKERS = 16;

// ── 공개 함수 / Public Functions ────────────────────────────────

/**
 * parallel_workers 설정값을 실제 워커 수로 변환한다 / Resolve parallel_workers to an actual count
 *
 * @description
 * KR: - 숫자면 그대로 반환 (min/max 클램프 적용)
 *     - "auto"면 CPU 코어 수와 사용 가능 메모리를 기반으로 안전한 워커 수 산출
 *     - 메모리 사용률 80% 초과 시 자동 축소
 * EN: - If number, returns as-is (clamped to min/max)
 *     - If "auto", calculates based on CPU cores and available memory
 *     - Reduces when memory usage exceeds 80%
 *
 * @param workers - 설정값 / Config value
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 사용할 워커 수 / Worker count to use
 */
export function resolveParallelWorkers(workers: number | 'auto', logger: Logger): number {
  if (workers !== 'auto') {
    const clamped = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, workers));
    logger.debug('parallel_workers: 고정값 사용', { configured: workers, resolved: clamped });
    return clamped;
  }

  return calculateAutoWorkers(logger);
}

// ── 내부 함수 / Internal Functions ────────────────────────────────

/**
 * CPU/메모리 기반으로 안전한 워커 수를 산출한다 / Calculate safe worker count from CPU/memory
 *
 * @description
 * KR: 1. CPU 코어 수 기반 상한 (코어 수 - 1, 최소 1)
 *     2. 사용 가능 메모리 기반 상한 (freemem * 0.8 / 512MB)
 *     3. 두 상한 중 낮은 값 선택
 *     4. 메모리 사용률 80% 초과 시 CPU 기반 상한을 절반으로 축소
 * EN: 1. CPU cores upper bound (cores - 1, min 1)
 *     2. Free memory upper bound (freemem * 0.8 / 512 MB)
 *     3. Take the lower of the two
 *     4. If memory usage > 80%, halve the CPU-based upper bound
 */
function calculateAutoWorkers(logger: Logger): number {
  const coreCount = cpus().length;
  const total = totalmem();
  const free = freemem();
  const usageRatio = 1 - free / total;

  // WHY: 메모리 80% 초과 시 CPU 기반 상한 절반으로 축소 (안전장치)
  const cpuBased =
    usageRatio > MEMORY_SAFE_CEILING
      ? Math.max(MIN_WORKERS, Math.floor((coreCount - 1) / 2))
      : Math.max(MIN_WORKERS, coreCount - 1);

  // WHY: 사용 가능 메모리의 80% 기준으로 워커당 512MB 확보
  const availableBytes = free * MEMORY_SAFE_CEILING;
  const memoryBased = Math.max(
    MIN_WORKERS,
    Math.floor(availableBytes / MIN_MEMORY_PER_WORKER_BYTES),
  );

  const resolved = Math.min(cpuBased, memoryBased, MAX_WORKERS);

  logger.debug('parallel_workers: auto 산출', {
    coreCount,
    memUsagePercent: Math.round(usageRatio * 100),
    cpuBased,
    memoryBased,
    resolved,
  });

  return resolved;
}
