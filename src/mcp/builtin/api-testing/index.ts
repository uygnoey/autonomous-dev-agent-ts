/**
 * API 테스팅 MCP 서버 / API testing MCP server
 *
 * @description
 * KR: HTTP 요청 전송, OpenAPI 스펙 파싱, 응답 검증을 제공하는 내장 MCP 서버.
 * EN: Built-in MCP server for HTTP requests, OpenAPI spec parsing, and response validation.
 */

import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import {
  API_TESTING_TOOLS,
  type ApiTestInput,
  type ApiTestOutput,
  ApiTestingExecutor,
} from 'mcp/builtin/api-testing/api-operations.js';
import type { McpServerConfig, McpTool } from 'mcp/types.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * API 테스팅 MCP 서버 설정 / API testing server configuration
 *
 * @description
 * KR: ProcessExecutor + curl 기반 자체 구현.
 * EN: Self-implemented using ProcessExecutor + curl.
 *
 * @example
 * import { API_TESTING_SERVER } from 'mcp/builtin/api-testing/index.js';
 * registry.register(API_TESTING_SERVER);
 */
export const API_TESTING_SERVER: McpServerConfig = {
  name: 'api-testing',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * API 테스팅 MCP 서버 실행기 / API testing MCP server executor
 *
 * @description
 * KR: API 테스팅 도구를 MCP 프로토콜로 제공한다.
 * EN: Provides API testing tools via MCP protocol.
 *
 * @example
 * const server = new ApiTestingServer(executor, logger);
 * const result = await server.executeTool('api_request', {
 *   method: 'GET',
 *   url: 'https://api.example.com/users'
 * });
 */
export class ApiTestingServer {
  private readonly apiExecutor: ApiTestingExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.apiExecutor = new ApiTestingExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return API_TESTING_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: ApiTestInput): Promise<Result<ApiTestOutput>> {
    return this.apiExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  ApiTestingExecutor,
  API_TESTING_TOOLS,
  type ApiTestInput,
  type ApiTestOutput,
} from 'mcp/builtin/api-testing/api-operations.js';
