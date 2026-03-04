/**
 * 브라우저 자동화 MCP 서버 / Browser automation MCP server
 *
 * @description
 * KR: Playwright 기반 브라우저 자동화를 제공하는 내장 MCP 서버.
 *     ProcessExecutor 기반 간단한 구현 (향후 라이브러리 직접 사용으로 확장).
 * EN: Built-in MCP server for Playwright-based browser automation.
 *     Simple ProcessExecutor-based implementation (can be extended with library).
 */

import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import type { Result } from '../../../core/types.js';
import type { McpServerConfig, McpTool } from '../../types.js';
import {
  BROWSER_TOOLS,
  type BrowserInput,
  type BrowserOutput,
  PlaywrightExecutor,
} from './playwright-operations.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * 브라우저 MCP 서버 설정 / Browser server configuration
 *
 * @description
 * KR: ProcessExecutor 기반 자체 구현. npx 외부 패키지 불필요.
 * EN: Self-implemented using ProcessExecutor. No external npx packages needed.
 *
 * @example
 * import { BROWSER_SERVER } from './browser/index.js';
 * registry.register(BROWSER_SERVER);
 */
export const BROWSER_SERVER: McpServerConfig = {
  name: 'browser',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * 브라우저 MCP 서버 실행기 / Browser MCP server executor
 *
 * @description
 * KR: Playwright 기반 브라우저 자동화 도구를 MCP 프로토콜로 제공한다.
 * EN: Provides Playwright-based browser automation tools via MCP protocol.
 *
 * @example
 * const server = new BrowserServer(executor, logger);
 * const result = await server.executeTool('browser_screenshot', {
 *   url: 'https://example.com',
 *   outputPath: '/tmp/screenshot.png'
 * });
 */
export class BrowserServer {
  private readonly playwrightExecutor: PlaywrightExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.playwrightExecutor = new PlaywrightExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return BROWSER_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @description
   * KR: 브라우저 자동화 도구를 실행하고 결과를 반환한다.
   * EN: Executes browser automation tool and returns result.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   *
   * @example
   * const result = await server.executeTool('browser_navigate', {
   *   url: 'https://github.com'
   * });
   */
  async executeTool(toolName: string, input: BrowserInput): Promise<Result<BrowserOutput>> {
    return this.playwrightExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  PlaywrightExecutor,
  BROWSER_TOOLS,
  type BrowserInput,
  type BrowserOutput,
} from './playwright-operations.js';
