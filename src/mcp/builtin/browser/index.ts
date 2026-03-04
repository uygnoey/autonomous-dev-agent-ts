/**
 * 브라우저 자동화 MCP 서버 설정 / Browser automation MCP server configuration
 *
 * @description
 * KR: 웹 브라우저 제어를 위한 내장 MCP 서버 설정.
 * EN: Built-in MCP server config for web browser automation.
 */

import type { McpServerConfig } from '../../types.js';

/**
 * 브라우저 서버 설정 상수 / Browser server config constant
 *
 * @example
 * import { BROWSER_SERVER } from './browser/index.js';
 * registry.register(BROWSER_SERVER);
 */
export const BROWSER_SERVER: McpServerConfig = {
  name: 'browser',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-browser'],
  enabled: true,
};
