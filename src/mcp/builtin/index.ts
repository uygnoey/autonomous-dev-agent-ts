/**
 * 내장 MCP 서버 모음 / Built-in MCP servers collection
 *
 * @description
 * KR: adev에 기본 포함된 4개의 MCP 서버를 export한다.
 *     모두 ProcessExecutor 기반으로 구현되어 외부 의존성이 없다.
 * EN: Exports 4 built-in MCP servers bundled with adev.
 *     All implemented with ProcessExecutor, no external dependencies.
 */

import type { McpServerConfig } from 'mcp/types.js';

// ── 서버 설정 / Server Configurations ──────────────────────

export { OS_CONTROL_SERVER } from 'mcp/builtin/os-control/index.js';
export { BROWSER_SERVER } from 'mcp/builtin/browser/index.js';
export { WEB_SEARCH_SERVER } from 'mcp/builtin/web-search/index.js';
export { GIT_SERVER } from 'mcp/builtin/git/index.js';

import { BROWSER_SERVER } from 'mcp/builtin/browser/index.js';
import { GIT_SERVER } from 'mcp/builtin/git/index.js';
import { OS_CONTROL_SERVER } from 'mcp/builtin/os-control/index.js';
import { WEB_SEARCH_SERVER } from 'mcp/builtin/web-search/index.js';

/**
 * 모든 내장 MCP 서버 설정 배열 / Array of all built-in MCP server configurations
 *
 * @description
 * KR: 4개 내장 서버 설정을 배열로 제공한다.
 *     registry에 일괄 등록할 때 사용.
 * EN: Provides 4 built-in server configurations as an array.
 *     Used for bulk registration in registry.
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

// ── 서버 인스턴스 / Server Instances ───────────────────────

export { OsControlServer } from 'mcp/builtin/os-control/index.js';
export { BrowserServer } from 'mcp/builtin/browser/index.js';
export { WebSearchServer } from 'mcp/builtin/web-search/index.js';
export { GitServer } from 'mcp/builtin/git/index.js';

// ── 도구 목록 / Tool Lists ─────────────────────────────────

export { OS_CONTROL_TOOLS } from 'mcp/builtin/os-control/index.js';
export { BROWSER_TOOLS } from 'mcp/builtin/browser/index.js';
export { WEB_SEARCH_TOOLS } from 'mcp/builtin/web-search/index.js';
export { GIT_TOOLS } from 'mcp/builtin/git/index.js';

// ── 타입 / Types ───────────────────────────────────────────

export type {
  FilesystemInput,
  FilesystemOutput,
  ProcessInput,
  ProcessOutput,
  SystemInfoOutput,
} from 'mcp/builtin/os-control/index.js';

export type { BrowserInput, BrowserOutput } from 'mcp/builtin/browser/index.js';

export type {
  SearchInput,
  FetchInput,
  SearchOutput,
} from 'mcp/builtin/web-search/index.js';

export type { GitInput, GitOutput } from 'mcp/builtin/git/index.js';
