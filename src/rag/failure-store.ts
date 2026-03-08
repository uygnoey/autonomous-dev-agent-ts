/**
 * LanceDB 실패 이력 Repository / Failure Record repository backed by LanceDB
 *
 * @description
 * KR: FailureRecord의 CRUD + 벡터 검색을 제공한다.
 *     LanceDB의 flat 레코드를 FailureRecord 인터페이스로 변환한다.
 * EN: Provides CRUD + vector search for FailureRecord records.
 *     Converts LanceDB flat records to/from the FailureRecord interface.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { FailureRecord, Phase, Result, VectorRepository } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) ────────────────────────────

/** LanceDB에 저장되는 flat 레코드 형식 */
interface FlatFailureRecord {
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

function toFlat(record: FailureRecord): FlatFailureRecord {
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

function fromFlat(flat: FlatFailureRecord): FailureRecord {
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

// ── FailureRepository ────────────────────────────────────────────

/** failures 테이블 이름 / Table name for failure records */
const FAILURES_TABLE = 'failures';

/**
 * LanceDB 기반 실패 이력 Repository / Failure Record repository backed by LanceDB
 *
 * @description
 * KR: failures 테이블에 대한 CRUD + 벡터 검색을 제공한다.
 * EN: Provides CRUD + vector search for the failures table.
 *
 * @param dbPath - LanceDB 데이터 디렉토리 경로 / LanceDB data directory path
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const repo = new FailureRepository('/path/to/data', logger);
 * await repo.initialize();
 * await repo.insert(failureRecord);
 */
export class FailureRepository implements VectorRepository<FailureRecord> {
  private db: lancedb.Connection | null = null;
  private table: LanceTable | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly logger: Logger,
  ) {}

  /**
   * LanceDB 연결 해제 / Close LanceDB connection
   */
  async close(): Promise<void> {
    this.table = null;
    this.db = null;
  }

  /**
   * LanceDB 연결 및 테이블 초기화 / Initialize LanceDB connection and table
   *
   * @returns 성공 시 ok(void), 실패 시 err(RagError)
   */
  async initialize(): Promise<Result<void, RagError>> {
    try {
      this.db = await lancedb.connect(this.dbPath);
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(FAILURES_TABLE)) {
        this.table = await this.db.openTable(FAILURES_TABLE);
      }
      // WHY: 테이블은 첫 insert 시 생성 — createEmptyTable은 Arrow 스키마가 필요하여 복잡도 증가
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new RagError(
          'rag_db_error',
          `LanceDB 실패 이력 저장소 초기화 실패: ${String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 실패 이력 레코드 삽입 / Insert a failure record
   *
   * @param record - 삽입할 FailureRecord / FailureRecord to insert
   */
  async insert(record: FailureRecord): Promise<Result<void>> {
    return this.safeExecute('insert', async () => {
      const flat = toFlat(record) as unknown as Record<string, unknown>;

      if (this.table === null) {
        if (this.db === null) {
          throw new Error('초기화되지 않은 상태입니다. initialize()를 먼저 호출하세요.');
        }
        this.table = await this.db.createTable(FAILURES_TABLE, [flat]);
      } else {
        await this.table.add([flat]);
      }
    });
  }

  /**
   * 벡터 유사도 검색 / Vector similarity search
   *
   * @param query - 검색 쿼리 벡터 / Query vector
   * @param limit - 최대 결과 수 / Maximum number of results
   * @param filter - 필터 조건 (projectId, phase 등) / Filter conditions
   * @returns FailureRecord 배열 / Array of FailureRecords
   */
  async search(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<FailureRecord[]>> {
    return this.safeExecute('search', async () => {
      if (this.table === null) return [];

      let queryBuilder = this.table.vectorSearch(Array.from(query));

      if (filter) {
        const whereClause = buildWhereClause(filter);
        if (whereClause) {
          queryBuilder = queryBuilder.where(whereClause);
        }
      }

      const results = await queryBuilder.limit(limit).toArray();
      return results.map((row) => fromFlat(row as unknown as FlatFailureRecord));
    });
  }

  /**
   * ID로 단건 조회 / Get a single record by ID
   *
   * @param id - 레코드 ID / Record ID
   */
  async getById(id: string): Promise<Result<FailureRecord | null>> {
    return this.safeExecute('getById', async () => {
      if (this.table === null) return null;

      const results = await this.table
        .query()
        .where(`id = '${escapeString(id)}'`)
        .limit(1)
        .toArray();

      const first = results[0];
      if (!first) return null;
      return fromFlat(first as unknown as FlatFailureRecord);
    });
  }

  /**
   * 부분 업데이트 / Partial update of a record
   *
   * @param id - 레코드 ID / Record ID
   * @param partial - 업데이트할 필드 / Fields to update
   */
  async update(id: string, partial: Partial<FailureRecord>): Promise<Result<void>> {
    return this.safeExecute('update', async () => {
      if (this.table === null) {
        throw new Error('테이블이 초기화되지 않았습니다.');
      }

      const updates: Record<string, string> = {};

      if (partial.resolution !== undefined) {
        updates.resolution = `'${escapeString(partial.resolution)}'`;
      }
      if (partial.rootCause !== undefined) {
        updates.rootCause = `'${escapeString(partial.rootCause)}'`;
      }

      if (Object.keys(updates).length > 0) {
        await this.table.update(updates, {
          where: `id = '${escapeString(id)}'`,
        });
      }
    });
  }

  /**
   * 레코드 삭제 / Delete a record
   *
   * @param id - 삭제할 레코드 ID / Record ID to delete
   */
  async delete(id: string): Promise<Result<void>> {
    return this.safeExecute('delete', async () => {
      if (this.table === null) {
        throw new Error('테이블이 초기화되지 않았습니다.');
      }
      await this.table.delete(`id = '${escapeString(id)}'`);
    });
  }

  /**
   * 프로젝트별 실패 이력 조회 / Query by projectId
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param limit - 최대 결과 수 / Maximum number of results
   * @returns FailureRecord 배열 / Array of FailureRecords
   */
  async getByProject(projectId: string, limit = 100): Promise<Result<FailureRecord[]>> {
    return this.safeExecute('getByProject', async () => {
      if (this.table === null) return [];

      const results = await this.table
        .query()
        .where(`"projectId" = '${escapeString(projectId)}'`)
        .limit(limit)
        .toArray();

      return results.map((row) => fromFlat(row as unknown as FlatFailureRecord));
    });
  }

  /**
   * Phase별 실패 이력 조회 / Query by phase
   *
   * @param phase - Phase / Phase
   * @param projectId - 프로젝트 ID (선택) / Project ID (optional)
   * @param limit - 최대 결과 수 / Maximum number of results
   * @returns FailureRecord 배열 / Array of FailureRecords
   */
  async getByPhase(
    phase: Phase,
    projectId?: string,
    limit = 50,
  ): Promise<Result<FailureRecord[]>> {
    return this.safeExecute('getByPhase', async () => {
      if (this.table === null) return [];

      let whereClause = `phase = '${escapeString(phase)}'`;
      if (projectId) {
        whereClause += ` AND "projectId" = '${escapeString(projectId)}'`;
      }

      const results = await this.table.query().where(whereClause).limit(limit).toArray();

      return results.map((row) => fromFlat(row as unknown as FlatFailureRecord));
    });
  }

  /**
   * 외부 라이브러리 호출을 try-catch → Result 패턴으로 래핑
   * Wraps external library calls with try-catch → Result pattern
   */
  private async safeExecute<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<Result<T, RagError>> {
    try {
      const value = await fn();
      return ok(value);
    } catch (error: unknown) {
      this.logger.error(`FailureRepository.${operation} 실패`, {
        error: String(error),
      });
      return err(new RagError('rag_db_error', `${operation} 실패: ${String(error)}`, error));
    }
  }
}

// ── 유틸리티 / Utilities ────────────────────────────────────────

/**
 * SQL injection 방지를 위한 문자열 이스케이프 / Escape string for SQL injection prevention
 */
function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * filter 객체를 SQL where 절로 변환 / Convert filter object to SQL where clause
 */
function buildWhereClause(filter: Record<string, unknown>): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    const quotedKey = `"${key}"`;
    if (typeof value === 'string') {
      conditions.push(`${quotedKey} = '${escapeString(value)}'`);
    } else if (typeof value === 'number') {
      conditions.push(`${quotedKey} = ${value}`);
    }
  }

  return conditions.join(' AND ');
}
