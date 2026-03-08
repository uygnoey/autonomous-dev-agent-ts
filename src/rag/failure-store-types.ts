/**
 * LanceDB 실패 이력 저장소 타입 및 변환 함수 / Failure store flat record types and converters
 *
 * @description
 * KR: LanceDB에 저장되는 flat 레코드 형식 및 FailureRecord 변환 함수.
 * EN: Flat record format for LanceDB storage and FailureRecord conversion functions.
 */

import type { FailureRecord, Phase } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) ────────────────────────────

/** LanceDB에 저장되는 flat 레코드 형식 */
export interface FlatFailureRecord {
  id: string;
  projectId: string;
  featureId: string;
  phase: string;
  failureType: string;
  rootCause: string;
  resolution: string;
  vector: number[];
  timestamp: string;
}

/**
 * FailureRecord → flat LanceDB 레코드 변환 / Convert FailureRecord to flat LanceDB record
 *
 * @param record - 변환할 FailureRecord / FailureRecord to convert
 * @returns flat LanceDB 레코드 / Flat LanceDB record
 */
export function toFlat(record: FailureRecord): FlatFailureRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    featureId: record.featureId,
    phase: record.phase,
    failureType: record.failureType,
    rootCause: record.rootCause,
    resolution: record.resolution,
    vector: Array.from(record.embedding),
    timestamp: record.timestamp.toISOString(),
  };
}

/**
 * flat LanceDB 레코드 → FailureRecord 변환 / Convert flat LanceDB record to FailureRecord
 *
 * @param flat - 변환할 flat 레코드 / Flat record to convert
 * @returns FailureRecord
 */
export function fromFlat(flat: FlatFailureRecord): FailureRecord {
  return {
    id: flat.id,
    projectId: flat.projectId,
    featureId: flat.featureId,
    phase: flat.phase as Phase,
    failureType: flat.failureType,
    rootCause: flat.rootCause,
    resolution: flat.resolution,
    embedding: new Float32Array(flat.vector),
    timestamp: new Date(flat.timestamp),
  };
}
