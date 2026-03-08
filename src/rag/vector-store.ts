/**
 * LanceDB 코드 벡터 저장소 / LanceDB vector store for code records
 *
 * @description
 * KR: code_index 테이블에 대한 VectorRepository 구현.
 *     memory.ts의 MemoryRepository 패턴을 따른다.
 * EN: VectorRepository implementation for the code_index table.
 *     Follows the same pattern as MemoryRepository in memory.ts.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { CodeRecord, Result, VectorRepository } from 'core/types.js';
import { buildWhereClause, escapeString } from 'rag/sql-utils.js';
import type { SearchResult } from 'rag/types.js';
import { type FlatCodeRecord, fromFlat, toFlat } from 'rag/vector-store-types.js';

// ── CodeVectorStore ─────────────────────────────────────────────

/** code_index 테이블 이름 / Table name for code index */
const CODE_INDEX_TABLE = 'code_index';

/**
 * LanceDB 기반 코드 벡터 저장소 / Code vector store backed by LanceDB
 *
 * @description
 * KR: code_index 테이블에 대한 CRUD + 벡터 검색을 제공한다.
 *     MemoryRepository와 동일한 safeExecute 패턴 사용.
 * EN: Provides CRUD + vector search for the code_index table.
 *     Uses the same safeExecute pattern as MemoryRepository.
 *
 * @param dbPath - LanceDB 데이터 디렉토리 경로 / LanceDB data directory path
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const store = new CodeVectorStore('/path/to/data', logger);
 * await store.initialize();
 * await store.insert(codeRecord);
 */
export class CodeVectorStore implements VectorRepository<CodeRecord> {
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

      if (tableNames.includes(CODE_INDEX_TABLE)) {
        this.table = await this.db.openTable(CODE_INDEX_TABLE);
      }
      // WHY: 테이블은 첫 insert 시 생성 — createEmptyTable은 Arrow 스키마가 필요하여 복잡도 증가
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new RagError('rag_db_error', `LanceDB 코드 저장소 초기화 실패: ${String(error)}`, error),
      );
    }
  }

  /**
   * 코드 레코드 삽입 / Insert a code record
   *
   * @param record - 삽입할 CodeRecord / CodeRecord to insert
   */
  async insert(record: CodeRecord): Promise<Result<void>> {
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
        this.table = await (db as lancedb.Connection).createTable(CODE_INDEX_TABLE, [flat]);
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
   * @param filter - 필터 조건 (filePath, language, module 등) / Filter conditions
   * @returns CodeRecord 배열 / Array of CodeRecords
   */
  async search(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<CodeRecord[]>> {
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
      return results.map((row) => fromFlat(row as unknown as FlatCodeRecord));
    });
  }

  /**
   * 벡터 유사도 검색 (점수 포함) / Vector similarity search with scores
   *
   * @param query - 검색 쿼리 벡터 / Query vector
   * @param limit - 최대 결과 수 / Maximum number of results
   * @param filter - 필터 조건 / Filter conditions
   * @returns SearchResult<CodeRecord> 배열 (점수 포함) / Array with scores
   */
  async searchWithScore(
    query: Float32Array,
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<Result<SearchResult<CodeRecord>[]>> {
    return this.safeExecute('searchWithScore', async () => {
      if (this.table === null) return [];

      let queryBuilder = this.table.vectorSearch(Array.from(query));

      if (filter) {
        const whereClause = buildWhereClause(filter);
        if (whereClause) {
          queryBuilder = queryBuilder.where(whereClause);
        }
      }

      const results = await queryBuilder.limit(limit).toArray();
      return results.map((row) => {
        const flat = row as unknown as FlatCodeRecord & { _distance?: number };
        const record = fromFlat(flat);
        // WHY: LanceDB는 _distance를 반환. 유사도 = 1 / (1 + distance) 변환.
        const distance = flat._distance ?? 0;
        const score = 1 / (1 + distance);
        return { record, score };
      });
    });
  }

  /**
   * ID로 단건 조회 / Get a single record by ID
   *
   * @param id - 레코드 ID / Record ID
   */
  async getById(id: string): Promise<Result<CodeRecord | null>> {
    return this.safeExecute('getById', async () => {
      if (this.table === null) return null;

      const results = await this.table
        .query()
        .where(`id = '${escapeString(id)}'`)
        .limit(1)
        .toArray();

      const first = results[0];
      if (!first) return null;
      return fromFlat(first as unknown as FlatCodeRecord);
    });
  }

  /**
   * 부분 업데이트 / Partial update of a record
   *
   * @param id - 레코드 ID / Record ID
   * @param partial - 업데이트할 필드 / Fields to update
   */
  async update(id: string, partial: Partial<CodeRecord>): Promise<Result<void>> {
    const table = this.table;
    if (table === null) {
      return err(new RagError('rag_db_error', '테이블이 초기화되지 않았습니다.'));
    }
    return this.safeExecute('update', async () => {
      const updates: Record<string, string> = {};

      if (partial.chunk !== undefined) {
        updates.chunk = `'${escapeString(partial.chunk)}'`;
      }
      if (partial.filePath !== undefined) {
        updates.filePath = `'${escapeString(partial.filePath)}'`;
      }

      if (Object.keys(updates).length > 0) {
        await table.update(updates, {
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
      this.logger.error(`CodeVectorStore.${operation} 실패`, {
        error: String(error),
      });
      return err(new RagError('rag_db_error', `${operation} 실패: ${String(error)}`, error));
    }
  }
}
