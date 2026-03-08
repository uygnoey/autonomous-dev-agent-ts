/**
 * LanceDB 코드 벡터 저장소 타입 및 변환 함수 / Code vector store flat record types and converters
 *
 * @description
 * KR: LanceDB에 저장되는 flat 레코드 형식 및 CodeRecord 변환 함수.
 * EN: Flat record format for LanceDB storage and CodeRecord conversion functions.
 */

import type { CodeRecord } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) / Flat record for LanceDB ─────

/**
 * LanceDB에 저장되는 flat CodeRecord 형식
 * LanceDB flat record format for CodeRecord
 */
export interface FlatCodeRecord {
  id: string;
  projectId: string;
  filePath: string;
  chunk: string;
  vector: number[];
  language: string;
  module: string;
  functionName: string;
  lastModified: string;
  modifiedBy: string;
}

/**
 * CodeRecord → flat LanceDB 레코드 변환 / Convert CodeRecord to flat LanceDB record
 *
 * @param record - 변환할 CodeRecord / CodeRecord to convert
 * @returns flat LanceDB 레코드 / Flat LanceDB record
 */
export function toFlat(record: CodeRecord): FlatCodeRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    filePath: record.filePath,
    chunk: record.chunk,
    vector: Array.from(record.embedding),
    language: record.metadata.language,
    module: record.metadata.module,
    functionName: record.metadata.functionName,
    lastModified: record.metadata.lastModified.toISOString(),
    modifiedBy: record.metadata.modifiedBy,
  };
}

/**
 * flat LanceDB 레코드 → CodeRecord 변환 / Convert flat LanceDB record to CodeRecord
 *
 * @param flat - 변환할 flat 레코드 / Flat record to convert
 * @returns CodeRecord
 */
export function fromFlat(flat: FlatCodeRecord): CodeRecord {
  return {
    id: flat.id,
    projectId: flat.projectId,
    filePath: flat.filePath,
    chunk: flat.chunk,
    embedding: new Float32Array(flat.vector),
    metadata: {
      language: flat.language,
      module: flat.module,
      functionName: flat.functionName,
      lastModified: new Date(flat.lastModified),
      modifiedBy: flat.modifiedBy,
    },
  };
}
