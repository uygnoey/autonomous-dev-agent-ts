/**
 * LanceDB 설계 결정 Repository / Design Decision repository backed by LanceDB
 *
 * @description
 * KR: DesignDecision의 CRUD + 벡터 검색을 제공한다.
 *     LanceDB의 flat 레코드를 DesignDecision 인터페이스로 변환한다.
 * EN: Provides CRUD + vector search for DesignDecision records.
 *     Converts LanceDB flat records to/from the DesignDecision interface.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { DesignDecision, Phase, Result, VectorRepository } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) ────────────────────────────

/** LanceDB에 저장되는 flat 레코드 형식 */
interface FlatDesignDecision {
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

function toFlat(record: DesignDecision): FlatDesignDecision {
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

function fromFlat(flat: FlatDesignDecision): DesignDecision {
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

// ── DesignDecisionRepository ─────────────────────────────────────

/** design_decisions 테이블 이름 / Table name for design decisions */
const DESIGN_DECISIONS_TABLE = 'design_decisions';

/**
 * LanceDB 기반 설계 결정 Repository / Design Decision repository backed by LanceDB
 *
 * @description
 * KR: design_decisions 테이블에 대한 CRUD + 벡터 검색을 제공한다.
 * EN: Provides CRUD + vector search for the design_decisions table.
 *
 * @param dbPath - LanceDB 데이터 디렉토리 경로 / LanceDB data directory path
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const repo = new DesignDecisionRepository('/path/to/data', logger);
 * await repo.initialize();
 * await repo.insert(designDecision);
 */
export class DesignDecisionRepository implements VectorRepository<DesignDecision> {
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

      if (tableNames.includes(DESIGN_DECISIONS_TABLE)) {
        this.table = await this.db.openTable(DESIGN_DECISIONS_TABLE);
      }
      // WHY: 테이블은 첫 insert 시 생성 — createEmptyTable은 Arrow 스키마가 필요하여 복잡도 증가
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new RagError(
          'rag_db_error',
          `LanceDB 설계 결정 저장소 초기화 실패: ${String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 설계 결정 레코드 삽입 / Insert a design decision record
   *
   * @param record - 삽입할 DesignDecision / DesignDecision to insert
   */
  async insert(record: DesignDecision): Promise<Result<void>> {
    return this.safeExecute('insert', async () => {
      const flat = toFlat(record) as unknown as Record<string, unknown>;

      if (this.table === null) {
        if (this.db === null) {
          throw new Error('초기화되지 않은 상태입니다. initialize()를 먼저 호출하세요.');
        }
        this.table = await this.db.createTable(DESIGN_DECISIONS_TABLE, [flat]);
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
   * @param filter - 필터 조건 (projectId, featureId 등) / Filter conditions
   * @returns DesignDecision 배열 / Array of DesignDecisions
   */
  async search(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<DesignDecision[]>> {
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
      return results.map((row) => fromFlat(row as unknown as FlatDesignDecision));
    });
  }

  /**
   * ID로 단건 조회 / Get a single record by ID
   *
   * @param id - 레코드 ID / Record ID
   */
  async getById(id: string): Promise<Result<DesignDecision | null>> {
    return this.safeExecute('getById', async () => {
      if (this.table === null) return null;

      const results = await this.table
        .query()
        .where(`id = '${escapeString(id)}'`)
        .limit(1)
        .toArray();

      const first = results[0];
      if (!first) return null;
      return fromFlat(first as unknown as FlatDesignDecision);
    });
  }

  /**
   * 부분 업데이트 / Partial update of a record
   *
   * @param id - 레코드 ID / Record ID
   * @param partial - 업데이트할 필드 / Fields to update
   */
  async update(id: string, partial: Partial<DesignDecision>): Promise<Result<void>> {
    return this.safeExecute('update', async () => {
      if (this.table === null) {
        throw new Error('테이블이 초기화되지 않았습니다.');
      }

      const updates: Record<string, string> = {};

      if (partial.decision !== undefined) {
        updates.decision = `'${escapeString(partial.decision)}'`;
      }
      if (partial.rationale !== undefined) {
        updates.rationale = `'${escapeString(partial.rationale)}'`;
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
   * 프로젝트별 설계 결정 조회 / Query by projectId
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param limit - 최대 결과 수 / Maximum number of results
   * @returns DesignDecision 배열 / Array of DesignDecisions
   */
  async getByProject(projectId: string, limit = 100): Promise<Result<DesignDecision[]>> {
    return this.safeExecute('getByProject', async () => {
      if (this.table === null) return [];

      const results = await this.table
        .query()
        .where(`"projectId" = '${escapeString(projectId)}'`)
        .limit(limit)
        .toArray();

      return results.map((row) => fromFlat(row as unknown as FlatDesignDecision));
    });
  }

  /**
   * 기능별 설계 결정 조회 / Query by featureId
   *
   * @param featureId - 기능 ID / Feature ID
   * @param limit - 최대 결과 수 / Maximum number of results
   * @returns DesignDecision 배열 / Array of DesignDecisions
   */
  async getByFeature(featureId: string, limit = 50): Promise<Result<DesignDecision[]>> {
    return this.safeExecute('getByFeature', async () => {
      if (this.table === null) return [];

      const results = await this.table
        .query()
        .where(`"featureId" = '${escapeString(featureId)}'`)
        .limit(limit)
        .toArray();

      return results.map((row) => fromFlat(row as unknown as FlatDesignDecision));
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
      this.logger.error(`DesignDecisionRepository.${operation} 실패`, {
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

// WHY: Phase 타입 참조용 (unused import 방지)
type _Phase = Phase;
