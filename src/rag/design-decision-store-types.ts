/**
 * LanceDB 설계 결정 저장소 타입 및 변환 함수 / Design decision store flat record types and converters
 *
 * @description
 * KR: LanceDB에 저장되는 flat 레코드 형식 및 DesignDecision 변환 함수.
 * EN: Flat record format for LanceDB storage and DesignDecision conversion functions.
 */

import type { DesignDecision } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) ────────────────────────────

/** LanceDB에 저장되는 flat 레코드 형식 */
export interface FlatDesignDecision {
  id: string;
  projectId: string;
  featureId: string;
  decision: string;
  rationale: string;
  alternatives: string; // JSON serialized string[]
  decidedBy: string; // JSON serialized string[]
  vector: number[];
  timestamp: string;
}

/**
 * DesignDecision → flat LanceDB 레코드 변환 / Convert DesignDecision to flat LanceDB record
 *
 * @param record - 변환할 DesignDecision / DesignDecision to convert
 * @returns flat LanceDB 레코드 / Flat LanceDB record
 */
export function toFlat(record: DesignDecision): FlatDesignDecision {
  return {
    id: record.id,
    projectId: record.projectId,
    featureId: record.featureId,
    decision: record.decision,
    rationale: record.rationale,
    alternatives: JSON.stringify(record.alternatives),
    decidedBy: JSON.stringify(record.decidedBy),
    vector: Array.from(record.embedding),
    timestamp: record.timestamp.toISOString(),
  };
}

/**
 * flat LanceDB 레코드 → DesignDecision 변환 / Convert flat LanceDB record to DesignDecision
 *
 * @param flat - 변환할 flat 레코드 / Flat record to convert
 * @returns DesignDecision
 */
export function fromFlat(flat: FlatDesignDecision): DesignDecision {
  return {
    id: flat.id,
    projectId: flat.projectId,
    featureId: flat.featureId,
    decision: flat.decision,
    rationale: flat.rationale,
    alternatives: JSON.parse(flat.alternatives) as string[],
    decidedBy: JSON.parse(flat.decidedBy) as string[],
    embedding: new Float32Array(flat.vector),
    timestamp: new Date(flat.timestamp),
  };
}
