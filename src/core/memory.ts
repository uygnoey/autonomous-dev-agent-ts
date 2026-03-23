/**
 * LanceDB 메모리 Repository / Memory repository backed by LanceDB
 *
 * @description
 * MemoryRecord의 CRUD + 벡터 검색을 제공한다.
 * LanceDB의 flat 레코드를 MemoryRecord 인터페이스로 변환하여 사용한다.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { MemoryRecord, Result, VectorRepository } from 'core/types.js';

// ── flat 레코드 (LanceDB 저장용) ────────────────────────────

/** LanceDB에 저장되는 flat 레코드 형식 */
interface FlatMemoryRecord {
  id: string;
  projectId: string;
  type: string;
  content: string;
  vector: number[];
  phase: string;
  featureId: string;
  agentName: string;
  timestamp: string;
}

function toFlat(record: MemoryRecord): FlatMemoryRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    type: record.type,
    content: record.content,
    vector: Array.from(record.embedding),
    phase: record.metadata.phase,
    featureId: record.metadata.featureId,
    agentName: record.metadata.agentName,
    timestamp: record.metadata.timestamp.toISOString(),
  };
}

function fromFlat(flat: FlatMemoryRecord): MemoryRecord {
  return {
    id: flat.id,
    projectId: flat.projectId,
    type: flat.type as MemoryRecord['type'],
    content: flat.content,
    embedding: new Float32Array(flat.vector),
    metadata: {
      phase: flat.phase as MemoryRecord['metadata']['phase'],
      featureId: flat.featureId,
      agentName: flat.agentName,
      timestamp: new Date(flat.timestamp),
    },
  };
}

// ── MemoryRepository ─────────────────────────────────────────

/**
 * LanceDB 기반 메모리 Repository / VectorRepository implementation for MemoryRecord
 *
 * @param dbPath - LanceDB 데이터 디렉토리 경로
 * @param logger - 로거 인스턴스
 *
 * @example
 * const repo = new MemoryRepository('/path/to/data', logger);
 * await repo.initialize();
 * await repo.insert(record);
 */
export class MemoryRepository implements VectorRepository<MemoryRecord> {
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
    // WHY: db.close()는 네이티브 Arrow/NAPI 리소스를 명시적으로 해제.
    //      null 설정만으로는 GC 타이밍에 의존하여 프로세스 종료 시 크래시 유발.
    if (this.db !== null) {
      try {
        this.db.close();
      } catch {
        // WHY: 이미 닫힌 연결에 대한 close는 무시
      }
    }
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

      if (tableNames.includes('memory')) {
        this.table = await this.db.openTable('memory');
      }
      // WHY: 테이블은 첫 insert 시 생성 — createEmptyTable은 Arrow 스키마가 필요하여 복잡도 증가
      return ok(undefined);
    } catch (error: unknown) {
      return err(new RagError('rag_db_error', `LanceDB 초기화 실패: ${String(error)}`, error));
    }
  }

  async insert(record: MemoryRecord): Promise<Result<void>> {
    const db = this.db;
    if (this.table === null && db === null) {
      return err(
        new RagError('rag_db_error', '초기화되지 않은 상태입니다. initialize()를 먼저 호출하세요.'),
      );
    }
    return this.safeExecute('insert', async () => {
      const flat = toFlat(record) as unknown as Record<string, unknown>;

      if (this.table === null) {
        // WHY: db is guaranteed non-null by the guard above
        this.table = await (db as lancedb.Connection).createTable('memory', [flat]);
      } else {
        await this.table.add([flat]);
      }
    });
  }

  async search(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<MemoryRecord[]>> {
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
      return results.map((row) => fromFlat(row as unknown as FlatMemoryRecord));
    });
  }

  /**
   * 필터 기반 레코드 목록 조회 (비-벡터 쿼리) / List records by filter without vector search
   *
   * @description
   * KR: 벡터 유사도 없이 SQL WHERE 절로 레코드를 조회한다.
   *     getHistory 등 비-시맨틱 조회에 사용한다.
   * EN: Queries records via SQL WHERE clause without vector similarity.
   *     Used for non-semantic queries such as getHistory.
   *
   * @param filter - 필터 조건 / Filter conditions
   * @param limit - 최대 조회 수 / Max record count
   * @returns MemoryRecord 배열 / Array of MemoryRecord
   */
  async listByFilter(
    filter: Record<string, string>,
    limit: number,
  ): Promise<Result<MemoryRecord[]>> {
    return this.safeExecute('listByFilter', async () => {
      if (this.table === null) return [];

      const whereClause = buildWhereClause(filter);
      // WHY: query()는 vectorSearch()와 달리 순수 SQL 필터로 동작하므로
      //      camelCase 컬럼명 WHERE절 호환성이 더 높다
      const q = whereClause ? this.table.query().where(whereClause) : this.table.query();
      const results = await q.limit(limit).toArray();
      return results.map((row) => fromFlat(row as unknown as FlatMemoryRecord));
    });
  }

  async getById(id: string): Promise<Result<MemoryRecord | null>> {
    return this.safeExecute('getById', async () => {
      if (this.table === null) return null;

      const results = await this.table
        .query()
        .where(`id = '${escapeString(id)}'`)
        .limit(1)
        .toArray();

      const first = results[0];
      if (!first) return null;
      return fromFlat(first as unknown as FlatMemoryRecord);
    });
  }

  async update(id: string, partial: Partial<MemoryRecord>): Promise<Result<void>> {
    const table = this.table;
    if (table === null) {
      return err(new RagError('rag_db_error', '테이블이 초기화되지 않았습니다.'));
    }
    return this.safeExecute('update', async () => {
      const updates: Record<string, string> = {};

      if (partial.content !== undefined) {
        updates.content = `'${escapeString(partial.content)}'`;
      }
      if (partial.type !== undefined) {
        updates.type = `'${escapeString(partial.type)}'`;
      }

      if (Object.keys(updates).length > 0) {
        await table.update(updates, {
          where: `id = '${escapeString(id)}'`,
        });
      }
    });
  }

  async delete(id: string): Promise<Result<void>> {
    const table = this.table;
    if (table === null) {
      return err(new RagError('rag_db_error', '테이블이 초기화되지 않았습니다.'));
    }
    return this.safeExecute('delete', async () => {
      await table.delete(`id = '${escapeString(id)}'`);
    });
  }

  /**
   * 외부 라이브러리 호출을 try-catch → Result 패턴으로 래핑
   */
  private async safeExecute<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<Result<T, RagError>> {
    try {
      const value = await fn();
      return ok(value);
    } catch (error: unknown) {
      this.logger.error(`MemoryRepository.${operation} 실패`, {
        error: String(error),
      });
      return err(new RagError('rag_db_error', `${operation} 실패: ${String(error)}`, error));
    }
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────

/** SQL injection 방지를 위한 문자열 이스케이프 */
function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * filter 객체를 SQL where 절로 변환 / Convert filter object to SQL where clause
 *
 * WHY: LanceDB DataFusion에서 이중 따옴표(")는 문자열 리터럴로 해석된다.
 *      camelCase 컬럼명(projectId 등)은 백틱(`)으로 감싸야 식별자로 처리된다.
 *      소문자 컬럼(id, type)도 백틱으로 감싸면 안전하게 사용 가능하다.
 */
function buildWhereClause(filter: Record<string, unknown>): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    // WHY: 백틱으로 컬럼명을 감싸서 camelCase 컬럼 호환성 확보
    //      LanceDB DataFusion: "col" = string literal, `col` = identifier
    if (typeof value === 'string') {
      conditions.push(`\`${key}\` = '${escapeString(value)}'`);
    } else if (typeof value === 'number') {
      conditions.push(`\`${key}\` = ${value}`);
    }
  }

  return conditions.join(' AND ');
}
