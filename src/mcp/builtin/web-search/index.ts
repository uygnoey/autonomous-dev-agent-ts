/**
 * 웹 검색 MCP 서버 설정 / Web search MCP server configuration
 *
 * @description
 * KR: 웹 검색 기능을 위한 내장 MCP 서버 설정.
 * EN: Built-in MCP server config for web search capability.
 */

import type { McpServerConfig } from '../../types.js';

/**
 * 웹 검색 서버 설정 상수 / Web search server config constant
 *
 * @example
 * import { WEB_SEARCH_SERVER } from './web-search/index.js';
 * registry.register(WEB_SEARCH_SERVER);
 */
export const WEB_SEARCH_SERVER: McpServerConfig = {
  name: 'web-search',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-web-search'],
  enabled: true,
};
