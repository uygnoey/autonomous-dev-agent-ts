/**
 * Git 작업 MCP 서버 설정 / Git operations MCP server configuration
 *
 * @description
 * KR: Git 작업(commit, push, branch 등)을 위한 내장 MCP 서버 설정.
 * EN: Built-in MCP server config for Git operations (commit, push, branch, etc.).
 */

import type { McpServerConfig } from '../../types.js';

/**
 * Git 서버 설정 상수 / Git server config constant
 *
 * @example
 * import { GIT_SERVER } from './git/index.js';
 * registry.register(GIT_SERVER);
 */
export const GIT_SERVER: McpServerConfig = {
  name: 'git',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-git'],
  enabled: true,
};
