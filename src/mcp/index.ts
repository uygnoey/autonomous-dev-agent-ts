/**
 * MCP 모듈 공개 API / MCP module public API
 *
 * @description
 * KR: MCP 서버 관리에 필요한 타입, 레지스트리, 로더, 매니저, 내장 설정을 re-export한다.
 * EN: Re-exports types, registry, loader, manager, and built-in configs for MCP server management.
 */

// ── 타입 ─────────────────────────────────────────────────────
export type {
  McpManifest,
  McpServerConfig,
  McpServerInstance,
  McpServerStatus,
  McpTool,
} from './types.js';

// ── 클래스 ───────────────────────────────────────────────────
export { McpLoader } from './loader.js';
export { McpManager } from './mcp-manager.js';
export { McpRegistry } from './registry.js';

// ── 내장 서버 ────────────────────────────────────────────────
export {
  BROWSER_SERVER,
  BUILTIN_SERVERS,
  GIT_SERVER,
  OS_CONTROL_SERVER,
  WEB_SEARCH_SERVER,
} from './builtin/index.js';
