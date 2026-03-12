/**
 * LanceDB 세션 스냅샷 저장소 / Session Snapshot repository backed by LanceDB
 *
 * @description
 * KR: PersistableSessionSnapshot의 upsert, 조회, 삭제를 제공한다.
 *     LanceDB의 flat 레코드를 PersistableSessionSnapshot으로 변환한다.
 * EN: Provides upsert, query, and delete for PersistableSessionSnapshot records.
 *     Converts LanceDB flat records to/from the PersistableSessionSnapshot interface.
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table as LanceTable } from '@lancedb/lancedb';
import { RagError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import {
  type FlatSessionSnapshot,
  type PersistableSessionSnapshot,
  fromFlatSnapshot,
  toFlatSnapshot,
} from 'layer2/session-snapshot-store-types.js';
import { escapeString } from 'rag/sql-utils.js';

// ── 상수 ────────────────────────────────────────────────────────

/** session_snapshots 테이블 이름 / Table name for session snapshots */
const TABLE_NAME = 'session_snapshots';

// ── SessionSnapshotStore ─────────────────────────────────────────

/**
 * LanceDB 기반 세션 스냅샷 저장소 / Session Snapshot repository backed by LanceDB
 *
 * @description
 * KR: session_snapshots 테이블에 대한 upsert, 조회, 삭제를 제공한다.
 *     토큰 리셋 후 세션 복원을 위해 대화 이력을 포함한 스냅샷을 영속화한다.
 * EN: Provides upsert, query, and delete for the session_snapshots table.
 *     Persists snapshots including conversation history for token reset recovery.
 *
 * @example
 * const store = new SessionSnapshotStore('/path/to/db', logger);
 * await store.initialize();
 * await store.save(snapshot);
 * const result = await store.loadByFeature('feat-1');
 */
export class SessionSnapshotStore {
  private db: lancedb.Connection | null = null;
  private table: LanceTable | null = null;
  private readonly logger: Logger;

  /**
   * @param dbPath - LanceDB 데이터 디렉토리 경로 / LanceDB data directory path
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(
    private readonly dbPath: string,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'session-snapshot-store' });
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

      if (tableNames.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
      }
      // WHY: 테이블은 첫 save 시 생성 — createEmptyTable은 Arrow 스키마가 필요하여 복잡도 증가
      this.logger.info('세션 스냅샷 저장소 초기화 완료', { dbPath: this.dbPath });
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new RagError(
          'rag_db_error',
          `LanceDB 세션 스냅샷 저장소 초기화 실패: ${String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 세션 스냅샷을 저장 (upsert) / Save session snapshot (upsert)
   *
   * @description
   * KR: 동일 sessionId가 존재하면 삭제 후 재삽입 (upsert 시뮬레이션).
   * EN: Deletes existing record with same sessionId before inserting (upsert simulation).
   *
   * @param snapshot - 저장할 스냅샷 / Snapshot to save
   * @returns 성공 시 ok(void), 실패 시 err(RagError)
   */
  async save(snapshot: PersistableSessionSnapshot): Promise<Result<void, RagError>> {
    const db = this.db;
    if (this.table === null && db === null) {
      return err(
        new RagError('rag_db_error', '초기화되지 않은 상태입니다. initialize()를 먼저 호출하세요.'),
      );
    }

    return this.safeExecute('save', async () => {
      const flat = toFlatSnapshot(snapshot) as unknown as Record<string, unknown>;

      if (this.table === null) {
        // WHY: db is guaranteed non-null by the guard above
        this.table = await (db as lancedb.Connection).createTable(TABLE_NAME, [flat]);
      } else {
        // WHY: LanceDB는 기본 upsert를 지원하지 않으므로 delete + add로 upsert 구현
        // WHY: 백틱으로 camelCase 컬럼명 참조 (큰따옴표는 LanceDB에서 무시됨)
        await this.table.delete(`\`sessionId\` = '${escapeString(snapshot.sessionId)}'`);
        await this.table.add([flat]);
      }

      this.logger.debug('세션 스냅샷 저장 완료', { sessionId: snapshot.sessionId });
    });
  }

  /**
   * 기능 ID로 세션 스냅샷 목록 조회 / Load session snapshots by feature ID
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 스냅샷 배열 / Array of snapshots
   */
  async loadByFeature(featureId: string): Promise<Result<PersistableSessionSnapshot[], RagError>> {
    return this.safeExecute('loadByFeature', async () => {
      if (this.table === null) return [];

      // WHY: LanceDB는 camelCase 컬럼명에 백틱 필요 (큰따옴표는 무시됨)
      const results = await this.table
        .query()
        .where(`\`featureId\` = '${escapeString(featureId)}'`)
        .toArray();

      return results.map((row) => fromFlatSnapshot(row as unknown as FlatSessionSnapshot));
    });
  }

  /**
   * 프로젝트 ID로 세션 스냅샷 목록 조회 / Load session snapshots by project ID
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 스냅샷 배열 / Array of snapshots
   */
  async loadByProject(projectId: string): Promise<Result<PersistableSessionSnapshot[], RagError>> {
    return this.safeExecute('loadByProject', async () => {
      if (this.table === null) return [];

      // WHY: LanceDB는 camelCase 컬럼명에 백틱 필요 (큰따옴표는 무시됨)
      const results = await this.table
        .query()
        .where(`\`projectId\` = '${escapeString(projectId)}'`)
        .toArray();

      return results.map((row) => fromFlatSnapshot(row as unknown as FlatSessionSnapshot));
    });
  }

  /**
   * 모든 세션 스냅샷 목록을 조회한다 / List all session snapshots
   *
   * @description
   * KR: 복원 순서 결정을 위해 전체 스냅샷 목록을 createdAt 오름차순으로 반환한다.
   * EN: Returns all snapshots ordered by createdAt ascending for restoration ordering.
   *
   * @returns 스냅샷 배열 / Array of snapshots
   */
  async listSnapshots(): Promise<Result<PersistableSessionSnapshot[], RagError>> {
    return this.safeExecute('listSnapshots', async () => {
      if (this.table === null) return [];

      const results = await this.table.query().toArray();

      const snapshots = results.map((row) =>
        fromFlatSnapshot(row as unknown as FlatSessionSnapshot),
      );

      // WHY: createdAt 오름차순 정렬 — 먼저 생성된 세션부터 복원해야 순서 보장
      return snapshots.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    });
  }

  /**
   * 세션 ID로 스냅샷 삭제 / Delete snapshot by session ID
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 시 ok(void), 실패 시 err(RagError)
   */
  async delete(sessionId: string): Promise<Result<void, RagError>> {
    const table = this.table;
    if (table === null) {
      return err(new RagError('rag_db_error', '테이블이 초기화되지 않았습니다.'));
    }

    return this.safeExecute('delete', async () => {
      // WHY: LanceDB는 camelCase 컬럼명에 백틱 필요 (큰따옴표는 무시됨)
      await table.delete(`\`sessionId\` = '${escapeString(sessionId)}'`);
      this.logger.debug('세션 스냅샷 삭제 완료', { sessionId });
    });
  }

  /**
   * LanceDB 연결 해제 / Close LanceDB connection
   */
  async close(): Promise<void> {
    this.table = null;
    this.db = null;
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
      this.logger.error(`SessionSnapshotStore.${operation} 실패`, {
        error: String(error),
      });
      return err(new RagError('rag_db_error', `${operation} 실패: ${String(error)}`, error));
    }
  }
}
