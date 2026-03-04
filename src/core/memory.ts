/**
 * LanceDB 메모리 Repository / Memory repository backed by LanceDB
 *
 * @description
 * MemoryRecord의 CRUD + 벡터 검색을 제공한다.
 * LanceDB의 flat 레코드를 MemoryRecord 인터페이스로 변환하여 사용한다.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from './errors.js';
import type { Logger } from './logger.js';
import { err, ok } from './types.js';
import type { MemoryRecord, Result, VectorRepository } from './types.js';

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
    return this.safeExecute('insert', async () => {
      const flat = toFlat(record) as unknown as Record<string, unknown>;

      if (this.table === null) {
        if (this.db === null) {
          throw new Error('초기화되지 않은 상태입니다. initialize()를 먼저 호출하세요.');
        }
        this.table = await this.db.createTable('memory', [flat]);
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
    return this.safeExecute('update', async () => {
      if (this.table === null) {
        throw new Error('테이블이 초기화되지 않았습니다.');
      }

      const updates: Record<string, string> = {};

      if (partial.content !== undefined) {
        updates.content = `'${escapeString(partial.content)}'`;
      }
      if (partial.type !== undefined) {
        updates.type = `'${escapeString(partial.type)}'`;
      }

      if (Object.keys(updates).length > 0) {
        await this.table.update(updates, {
          where: `id = '${escapeString(id)}'`,
        });
      }
    });
  }

  async delete(id: string): Promise<Result<void>> {
    return this.safeExecute('delete', async () => {
      if (this.table === null) {
        throw new Error('테이블이 초기화되지 않았습니다.');
      }
      await this.table.delete(`id = '${escapeString(id)}'`);
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

/** filter 객체를 SQL where 절로 변환 */
function buildWhereClause(filter: Record<string, unknown>): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string') {
      conditions.push(`${key} = '${escapeString(value)}'`);
    } else if (typeof value === 'number') {
      conditions.push(`${key} = ${value}`);
    }
  }

  return conditions.join(' AND ');
}
