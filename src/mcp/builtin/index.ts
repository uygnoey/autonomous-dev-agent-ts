/**
 * 내장 MCP 서버 설정 모음 / Built-in MCP server configurations
 *
 * @description
 * KR: adev에 기본 포함된 4개의 MCP 서버 설정을 export한다.
 * EN: Exports 4 built-in MCP server configurations bundled with adev.
 */

import type { McpServerConfig } from '../types.js';
import { BROWSER_SERVER } from './browser/index.js';
import { GIT_SERVER } from './git/index.js';
import { OS_CONTROL_SERVER } from './os-control/index.js';
import { WEB_SEARCH_SERVER } from './web-search/index.js';

export { BROWSER_SERVER } from './browser/index.js';
export { GIT_SERVER } from './git/index.js';
export { OS_CONTROL_SERVER } from './os-control/index.js';
export { WEB_SEARCH_SERVER } from './web-search/index.js';

/**
 * 모든 내장 MCP 서버 설정 배열 / Array of all built-in MCP server configurations
 *
 * @example
 * for (const config of BUILTIN_SERVERS) {
 *   registry.register(config);
 * }
 */
export const BUILTIN_SERVERS: readonly McpServerConfig[] = [
  OS_CONTROL_SERVER,
  BROWSER_SERVER,
  WEB_SEARCH_SERVER,
  GIT_SERVER,
];
