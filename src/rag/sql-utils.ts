/**
 * LanceDB SQL 유틸리티 / LanceDB SQL utilities
 *
 * @description
 * KR: RAG 저장소 모듈에서 공유하는 SQL 이스케이프 및 WHERE 절 생성 유틸리티.
 * EN: Shared SQL escape and WHERE clause builder utilities for RAG store modules.
 */

/**
 * SQL injection 방지를 위한 문자열 이스케이프 / Escape string for SQL injection prevention
 *
 * @param value - 이스케이프할 문자열 / String to escape
 * @returns 이스케이프된 문자열 / Escaped string
 */
export function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * filter 객체를 SQL WHERE 절로 변환 / Convert filter object to SQL WHERE clause
 *
 * @param filter - 필터 조건 객체 / Filter conditions object
 * @returns SQL WHERE 절 문자열 (빈 객체면 빈 문자열) / SQL WHERE clause string
 */
export function buildWhereClause(filter: Record<string, unknown>): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    // WHY: LanceDB는 camelCase 컬럼명에 큰따옴표 필요 (예: "filePath")
    const quotedKey = `"${key}"`;
    if (typeof value === 'string') {
      conditions.push(`${quotedKey} = '${escapeString(value)}'`);
    } else if (typeof value === 'number') {
      conditions.push(`${quotedKey} = ${value}`);
    }
  }

  return conditions.join(' AND ');
}
