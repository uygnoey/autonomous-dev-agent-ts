/**
 * 페이지 읽기 타입 및 공유 정의 / Page reader types and shared definitions
 *
 * @description
 * KR: 브라우저 모듈 전반에서 공유하는 타입 정의 및 향후 getText, getHtml,
 *     getLinks 등 페이지 콘텐츠 읽기 기능을 담당할 모듈.
 * EN: Shared type definitions for the browser module and future page content
 *     reading features (getText, getHtml, getLinks, etc.).
 */

import type { McpTool } from 'mcp/types.js';

// ── 공유 타입 / Shared Types ────────────────────────────────

/**
 * 브라우저 작업 입력 / Browser operation input
 *
 * @description
 * KR: 모든 브라우저 MCP 도구가 공유하는 입력 형식.
 * EN: Input format shared by all browser MCP tools.
 */
export interface BrowserInput {
  readonly url?: string;
  readonly selector?: string;
  readonly text?: string;
  readonly script?: string;
  readonly outputPath?: string;
  readonly timeout?: number;
}

/**
 * 브라우저 작업 출력 / Browser operation output
 *
 * @description
 * KR: 모든 브라우저 MCP 도구가 공유하는 출력 형식.
 * EN: Output format shared by all browser MCP tools.
 */
export interface BrowserOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 페이지 읽기 도구 정의 / Page Reader Tool Definitions ───

/**
 * 페이지 읽기 MCP 도구 목록 / Page reader MCP tools
 *
 * @description
 * KR: 향후 getText, getHtml, getLinks 등을 포함할 예정.
 *     현재는 빈 배열 (chrome-control, screenshot 도구만 활성화).
 * EN: Will include getText, getHtml, getLinks, etc. in the future.
 *     Currently empty (only chrome-control and screenshot tools are active).
 */
export const PAGE_READER_TOOLS: readonly McpTool[] = [];
