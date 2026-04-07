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
import { CircuitBreaker, CircuitBreakerOpenError } from 'core/circuit-breaker.js';
import type { CircuitBreakerConfig } from 'core/circuit-breaker.js';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { PerfTracker } from 'core/perf.js';
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
  private readonly circuitBreaker: CircuitBreaker;
  private readonly perf: PerfTracker;

  constructor(
    private readonly dbPath: string,
    private readonly logger: Logger,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
  ) {
    this.circuitBreaker = new CircuitBreaker('lancedb', logger, circuitBreakerConfig);
    this.perf = new PerfTracker(logger);
  }

  /**
   * LanceDB 연결 해제 / Close LanceDB connection
   *
   * @description
   * KR: 네이티브 LanceDB 연결을 명시적으로 해제하여 NAPI 리소스를 정리한다.
   *     Bun 1.3.10에서 미해제 네이티브 리소스가 프로세스 종료 시 C++ panic을 유발.
   * EN: Explicitly closes the native LanceDB connection to release NAPI resources.
   *     Unreleased native resources cause C++ panic on process exit in Bun 1.3.10.
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
      this.db = await this.perf.measureAsync(
        'lancedb.connect',
        () => lancedb.connect(this.dbPath),
        { warnThresholdMs: 500 },
      );
      const tableNames = await this.perf.measureAsync('lancedb.tableNames', () =>
        (this.db as lancedb.Connection).tableNames(),
      );

      if (tableNames.includes(CODE_INDEX_TABLE)) {
        this.table = await this.perf.measureAsync(
          'lancedb.openTable',
          () => (this.db as lancedb.Connection).openTable(CODE_INDEX_TABLE),
          { warnThresholdMs: 200 },
        );
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
    return this.safeSearch('search', async () => {
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
    return this.safeSearch('searchWithScore', async () => {
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
   * Circuit breaker 상태 스냅샷 반환 / Get circuit breaker snapshot
   */
  getCircuitBreakerSnapshot() {
    return this.circuitBreaker.getSnapshot();
  }

  /**
   * 성능 측정 결과 반환 / Get performance profiling entries
   */
  getPerfEntries() {
    return this.perf.getEntries();
  }

  /**
   * 성능 측정 요약 로깅 / Log performance profiling summary
   */
  logPerfSummary(): void {
    this.perf.summary();
  }

  /**
   * 외부 라이브러리 호출을 circuit breaker + try-catch → Result 패턴으로 래핑
   * Wraps external library calls with circuit breaker + try-catch → Result pattern
   */
  private async safeExecute<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<Result<T, RagError>> {
    try {
      const value = await this.perf.measureAsync(
        `vectorStore.${operation}`,
        () => this.circuitBreaker.execute(fn),
        { warnThresholdMs: 300, context: { operation } },
      );
      return ok(value);
    } catch (error: unknown) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn(
          `CodeVectorStore.${operation} — circuit breaker open, graceful degradation`,
          {
            circuit: error.circuitName,
          },
        );
        return err(
          new RagError(
            'rag_circuit_open',
            `LanceDB circuit breaker가 열려 있습니다 — ${operation} 차단됨`,
            error,
          ),
        );
      }
      this.logger.error(`CodeVectorStore.${operation} 실패`, {
        error: String(error),
      });
      return err(new RagError('rag_db_error', `${operation} 실패: ${String(error)}`, error));
    }
  }

  /**
   * Graceful degradation: circuit open 시 빈 배열 반환하는 검색 래퍼
   * Search wrapper that returns empty array when circuit is open
   */
  private async safeSearch<T>(operation: string, fn: () => Promise<T[]>): Promise<Result<T[]>> {
    const result = await this.safeExecute(operation, fn);
    if (!result.ok && result.error.code === 'rag_circuit_open') {
      // WHY: circuit open 시 빈 배열로 graceful degradation — 검색 실패가 전체 시스템을 멈추지 않도록
      this.logger.warn(`${operation} — circuit open, 빈 배열 반환 (graceful degradation)`);
      return ok([]);
    }
    return result;
  }
}
