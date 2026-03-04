/**
 * OS 제어 MCP 서버 설정 / OS control MCP server configuration
 *
 * @description
 * KR: 파일 시스템 및 프로세스 관리를 위한 내장 MCP 서버 설정.
 * EN: Built-in MCP server config for filesystem and process management.
 */

import type { McpServerConfig } from '../../types.js';

/**
 * OS 제어 서버 설정 상수 / OS control server config constant
 *
 * @example
 * import { OS_CONTROL_SERVER } from './os-control/index.js';
 * registry.register(OS_CONTROL_SERVER);
 */
export const OS_CONTROL_SERVER: McpServerConfig = {
  name: 'os-control',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-os-control'],
  enabled: true,
};
