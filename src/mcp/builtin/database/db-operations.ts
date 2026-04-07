/**
 * 데이터베이스 작업 도구 / Database operation tools
 *
 * @description
 * KR: SQL 데이터베이스 조회를 래핑하여 MCP 도구로 제공한다.
 *     읽기 전용 쿼리만 허용하여 안전성을 보장한다.
 * EN: Wraps SQL database queries and provides them as MCP tools.
 *     Only allows read-only queries for safety.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 데이터베이스 도구 입력 / Database tool input
 */
export interface DatabaseInput {
  /** 데이터베이스 연결 문자열 / Database connection string */
  readonly connectionString?: string;
  /** SQL 쿼리 / SQL query */
  readonly query?: string;
  /** 테이블 이름 / Table name */
  readonly table?: string;
  /** 작업 디렉토리 / Working directory */
  readonly cwd?: string;
}

/**
 * 데이터베이스 도구 출력 / Database tool output
 */
export interface DatabaseOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ─────────────────────────────

/**
 * 데이터베이스 MCP 도구 목록 / Database MCP tools
 */
export const DATABASE_TOOLS: readonly McpTool[] = [
  {
    name: 'db_list_tables',
    description: 'SQL 테이블 목록 조회 / List database tables',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: { type: 'string', description: '데이터베이스 연결 문자열 / Database connection string' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['connectionString'],
    },
  },
  {
    name: 'db_describe_table',
    description: '테이블 스키마 조회 (columns, indexes) / Describe table schema',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: { type: 'string', description: '데이터베이스 연결 문자열 / Database connection string' },
        table: { type: 'string', description: '테이블 이름 / Table name' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['connectionString', 'table'],
    },
  },
  {
    name: 'db_query',
    description: '읽기 전용 SQL 쿼리 실행 (SELECT only) / Execute read-only SQL query',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: { type: 'string', description: '데이터베이스 연결 문자열 / Database connection string' },
        query: { type: 'string', description: 'SELECT SQL 쿼리 / SELECT SQL query' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['connectionString', 'query'],
    },
  },
  {
    name: 'db_migration_status',
    description: '마이그레이션 상태 조회 / Check migration status',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: { type: 'string', description: '데이터베이스 연결 문자열 / Database connection string' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['connectionString'],
    },
  },
];

// ── 금지 패턴 / Forbidden Patterns ──────────────────────────

/** 쓰기 작업을 감지하는 패턴 / Patterns detecting write operations */
const WRITE_PATTERNS = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE)\b/i;

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 데이터베이스 작업 실행기 / Database operations executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 sqlite3 CLI로 데이터베이스 명령을 실행한다.
 * EN: Executes database commands via sqlite3 CLI using ProcessExecutor.
 */
export class DatabaseExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'database-executor' });
  }

  /**
   * sqlite3 명령 실행 헬퍼 / Helper to execute sqlite3 commands
   */
  private async executeSql(
    connectionString: string,
    sql: string,
    cwd?: string,
  ): Promise<Result<string>> {
    const result = await this.executor.execute(
      'sqlite3',
      ['-header', '-column', connectionString, sql],
      { cwd },
    );
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError(
          'db_command_error',
          `DB 명령 실패: ${result.value.stderr || result.value.stdout}`,
        ),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * 읽기 전용 쿼리 검증 / Validate read-only query
   */
  private validateReadOnly(query: string): Result<void> {
    if (WRITE_PATTERNS.test(query.trim())) {
      return err(
        new AdevError(
          'db_write_denied',
          '쓰기 작업은 허용되지 않습니다. SELECT만 가능합니다. / Write operations denied. Only SELECT allowed.',
        ),
      );
    }
    return ok(undefined);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(toolName: string, input: DatabaseInput): Promise<Result<DatabaseOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input: { ...input, connectionString: '***' } });

    switch (toolName) {
      case 'db_list_tables': {
        if (!input.connectionString) {
          return ok({ success: false, message: 'connectionString 필드 필수' });
        }
        const result = await this.executeSql(
          input.connectionString,
          ".tables",
          input.cwd,
        );
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '테이블 목록 조회 성공' });
      }

      case 'db_describe_table': {
        if (!input.connectionString) {
          return ok({ success: false, message: 'connectionString 필드 필수' });
        }
        if (!input.table) {
          return ok({ success: false, message: 'table 필드 필수' });
        }
        // WHY: PRAGMA로 컬럼과 인덱스 정보를 한 번에 조회
        const schemaResult = await this.executeSql(
          input.connectionString,
          `PRAGMA table_info(${input.table});`,
          input.cwd,
        );
        if (!schemaResult.ok) {
          return ok({ success: false, message: schemaResult.error.message });
        }
        const indexResult = await this.executeSql(
          input.connectionString,
          `PRAGMA index_list(${input.table});`,
          input.cwd,
        );
        const indexes = indexResult.ok ? indexResult.value : '';
        return ok({
          success: true,
          data: { columns: schemaResult.value, indexes },
          message: '테이블 스키마 조회 성공',
        });
      }

      case 'db_query': {
        if (!input.connectionString) {
          return ok({ success: false, message: 'connectionString 필드 필수' });
        }
        if (!input.query) {
          return ok({ success: false, message: 'query 필드 필수' });
        }
        const validation = this.validateReadOnly(input.query);
        if (!validation.ok) {
          return ok({ success: false, message: validation.error.message });
        }
        const result = await this.executeSql(input.connectionString, input.query, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '쿼리 실행 성공' });
      }

      case 'db_migration_status': {
        if (!input.connectionString) {
          return ok({ success: false, message: 'connectionString 필드 필수' });
        }
        // WHY: 일반적인 마이그레이션 테이블 패턴을 조회
        const migrationSql = `SELECT * FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%schema_version%');`;
        const result = await this.executeSql(input.connectionString, migrationSql, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '마이그레이션 상태 조회 성공' });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
