/**
 * 데이터베이스 MCP 서버 / Database MCP server
 *
 * @description
 * KR: SQL 데이터베이스 조회 기능을 제공하는 내장 MCP 서버.
 *     읽기 전용 쿼리, 스키마 조회, 마이그레이션 상태 확인을 지원한다.
 * EN: Built-in MCP server for SQL database queries.
 *     Supports read-only queries, schema inspection, and migration status.
 */

import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import {
  DATABASE_TOOLS,
  DatabaseExecutor,
  type DatabaseInput,
  type DatabaseOutput,
} from 'mcp/builtin/database/db-operations.js';
import type { McpServerConfig, McpTool } from 'mcp/types.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * 데이터베이스 MCP 서버 설정 / Database server configuration
 *
 * @description
 * KR: ProcessExecutor 기반 자체 구현. npx 외부 패키지 불필요.
 * EN: Self-implemented using ProcessExecutor. No external npx packages needed.
 *
 * @example
 * import { DATABASE_SERVER } from 'mcp/builtin/database/index.js';
 * registry.register(DATABASE_SERVER);
 */
export const DATABASE_SERVER: McpServerConfig = {
  name: 'database',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * 데이터베이스 MCP 서버 실행기 / Database MCP server executor
 *
 * @description
 * KR: 데이터베이스 조회 도구를 MCP 프로토콜로 제공한다.
 * EN: Provides database query tools via MCP protocol.
 *
 * @example
 * const server = new DatabaseServer(executor, logger);
 * const result = await server.executeTool('db_list_tables', { connectionString: 'test.db' });
 */
export class DatabaseServer {
  private readonly dbExecutor: DatabaseExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.dbExecutor = new DatabaseExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return DATABASE_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: DatabaseInput): Promise<Result<DatabaseOutput>> {
    return this.dbExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  DatabaseExecutor,
  DATABASE_TOOLS,
  type DatabaseInput,
  type DatabaseOutput,
} from 'mcp/builtin/database/db-operations.js';
