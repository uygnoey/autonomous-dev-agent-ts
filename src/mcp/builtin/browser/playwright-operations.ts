/**
 * Playwright 브라우저 자동화 도구 (호환성 re-export) / Playwright browser automation tools (compatibility re-export)
 *
 * @description
 * KR: 이 파일은 기존 import 호환성을 위해 유지한다.
 *     실제 구현은 아래 3개 파일로 분리되었다:
 *     - chrome-control.ts  : 브라우저 제어 (navigate, click, type, eval)
 *     - page-reader.ts     : 공유 타입 및 페이지 읽기 (BrowserInput, BrowserOutput)
 *     - screenshot.ts      : 스크린샷 캡처 (browser_screenshot)
 * EN: This file is kept for backward-compatible imports.
 *     Actual implementation has been split into:
 *     - chrome-control.ts  : Browser control (navigate, click, type, eval)
 *     - page-reader.ts     : Shared types and page reading (BrowserInput, BrowserOutput)
 *     - screenshot.ts      : Screenshot capture (browser_screenshot)
 */

import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import { CHROME_CONTROL_TOOLS, ChromeControl } from './chrome-control.js';
import type { BrowserInput, BrowserOutput } from './page-reader.js';
import { PAGE_READER_TOOLS } from './page-reader.js';
import { SCREENSHOT_TOOLS, ScreenshotTool } from './screenshot.js';

// ── 공유 타입 re-export / Shared type re-exports ───────────

export type { BrowserInput, BrowserOutput } from './page-reader.js';

// ── 통합 도구 목록 / Combined tool list ────────────────────

/**
 * 브라우저 MCP 도구 목록 (통합) / Browser MCP tools (combined)
 *
 * @description
 * KR: chrome-control, page-reader, screenshot 도구를 통합한 목록.
 * EN: Combined tool list from chrome-control, page-reader, and screenshot.
 */
export const BROWSER_TOOLS = [
  ...CHROME_CONTROL_TOOLS,
  ...PAGE_READER_TOOLS,
  ...SCREENSHOT_TOOLS,
] as const;

// ── 호환성 래퍼 / Compatibility Wrapper ────────────────────

/**
 * Playwright 실행기 (호환성 래퍼) / Playwright executor (compatibility wrapper)
 *
 * @description
 * KR: 기존 코드 호환성을 위해 ChromeControl + ScreenshotTool을 통합하는 래퍼.
 *     신규 코드에서는 ChromeControl, ScreenshotTool을 직접 사용 권장.
 * EN: Compatibility wrapper combining ChromeControl and ScreenshotTool.
 *     New code should use ChromeControl and ScreenshotTool directly.
 *
 * @example
 * const executor = new PlaywrightExecutor(processExecutor, logger);
 * const result = await executor.executeTool('browser_navigate', { url: 'https://example.com' });
 */
export class PlaywrightExecutor {
  private readonly chromeControl: ChromeControl;
  private readonly screenshotTool: ScreenshotTool;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.chromeControl = new ChromeControl(executor, logger);
    this.screenshotTool = new ScreenshotTool(executor, logger);
  }

  /**
   * URL로 이동 / Navigate to URL
   *
   * @param url - 이동할 URL / URL to navigate
   * @returns HTML 응답 또는 에러 / HTML response or error
   */
  async navigate(url: string): Promise<Result<string>> {
    return this.chromeControl.navigate(url);
  }

  /**
   * 스크린샷 캡처 / Capture screenshot
   *
   * @param url - 캡처할 URL / URL to capture
   * @param outputPath - 저장 경로 / Output file path
   * @returns void 또는 에러 / void or error
   */
  async screenshot(url: string, outputPath: string): Promise<Result<void>> {
    return this.screenshotTool.capture(url, outputPath);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   *
   * @description
   * KR: 도구 이름에 따라 ChromeControl 또는 ScreenshotTool로 라우팅한다.
   * EN: Routes to ChromeControl or ScreenshotTool based on tool name.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: BrowserInput): Promise<Result<BrowserOutput>> {
    if (toolName === 'browser_screenshot') {
      return this.screenshotTool.executeTool(toolName, input);
    }

    return this.chromeControl.executeTool(toolName, input);
  }
}
