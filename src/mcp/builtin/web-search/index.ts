/**
 * 웹 검색 MCP 서버 / Web search MCP server
 *
 * @description
 * KR: 웹 검색 기능을 제공하는 내장 MCP 서버.
 *     ProcessExecutor + curl 기반 간단한 구현.
 * EN: Built-in MCP server for web search functionality.
 *     Simple implementation using ProcessExecutor + curl.
 */

import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import type { Result } from '../../../core/types.js';
import type { McpServerConfig, McpTool } from '../../types.js';
import {
  type FetchInput,
  SearchExecutor,
  type SearchInput,
  type SearchOutput,
  WEB_SEARCH_TOOLS,
} from './search-operations.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * 웹 검색 MCP 서버 설정 / Web search server configuration
 *
 * @description
 * KR: ProcessExecutor 기반 자체 구현. npx 외부 패키지 불필요.
 * EN: Self-implemented using ProcessExecutor. No external npx packages needed.
 *
 * @example
 * import { WEB_SEARCH_SERVER } from './web-search/index.js';
 * registry.register(WEB_SEARCH_SERVER);
 */
export const WEB_SEARCH_SERVER: McpServerConfig = {
  name: 'web-search',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * 웹 검색 MCP 서버 실행기 / Web search MCP server executor
 *
 * @description
 * KR: 웹 검색 도구를 MCP 프로토콜로 제공한다.
 * EN: Provides web search tools via MCP protocol.
 *
 * @example
 * const server = new WebSearchServer(executor, logger);
 * const result = await server.executeTool('web_search', { query: 'TypeScript' });
 */
export class WebSearchServer {
  private readonly searchExecutor: SearchExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.searchExecutor = new SearchExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return WEB_SEARCH_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @description
   * KR: 웹 검색 도구를 실행하고 결과를 반환한다.
   * EN: Executes web search tool and returns result.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   *
   * @example
   * const result = await server.executeTool('web_search', {
   *   query: 'Bun TypeScript',
   *   limit: 5
   * });
   */
  async executeTool(
    toolName: string,
    input: SearchInput | FetchInput,
  ): Promise<Result<SearchOutput>> {
    return this.searchExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  SearchExecutor,
  WEB_SEARCH_TOOLS,
  type SearchInput,
  type FetchInput,
  type SearchOutput,
} from './search-operations.js';
