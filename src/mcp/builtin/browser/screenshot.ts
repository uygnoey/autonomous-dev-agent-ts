/**
 * 스크린샷 캡처 도구 / Screenshot capture tool
 *
 * @description
 * KR: Playwright CLI를 사용하여 웹 페이지 스크린샷을 캡처한다.
 * EN: Captures web page screenshots using Playwright CLI.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';
import type { BrowserInput, BrowserOutput } from './page-reader.js';

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * 스크린샷 MCP 도구 목록 / Screenshot MCP tools
 *
 * @description
 * KR: browser_screenshot 도구 정의.
 * EN: browser_screenshot tool definition.
 */
export const SCREENSHOT_TOOLS: readonly McpTool[] = [
  {
    name: 'browser_screenshot',
    description: '스크린샷 캡처 / Capture screenshot',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '캡처할 URL / URL to capture' },
        outputPath: {
          type: 'string',
          description: '저장 경로 / Output file path',
        },
      },
      required: ['url', 'outputPath'],
    },
  },
];

// ── 스크린샷 실행기 / Screenshot Executor ──────────────────

/**
 * 스크린샷 실행기 / Screenshot executor
 *
 * @description
 * KR: Playwright CLI를 사용하여 URL 스크린샷을 캡처하고 파일로 저장한다.
 * EN: Uses Playwright CLI to capture URL screenshots and save to file.
 *
 * @example
 * const screenshotTool = new ScreenshotTool(executor, logger);
 * const result = await screenshotTool.capture('https://example.com', '/tmp/out.png');
 */
export class ScreenshotTool {
  private readonly logger: Logger;

  constructor(
    private readonly executor: ProcessExecutor,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'screenshot-tool' });
  }

  /**
   * 스크린샷 캡처 / Capture screenshot
   *
   * @description
   * KR: Playwright CLI로 URL을 방문하여 스크린샷을 outputPath에 저장한다.
   * EN: Visits URL via Playwright CLI and saves screenshot to outputPath.
   *
   * @param url - 캡처할 URL / URL to capture
   * @param outputPath - 저장 경로 / Output file path
   * @returns void 또는 에러 / void or error
   */
  async capture(url: string, outputPath: string): Promise<Result<void>> {
    this.logger.debug('스크린샷 캡처', { url, outputPath });

    // WHY: playwright screenshot 명령 사용 (Playwright 설치 필요)
    const result = await this.executor.execute(
      'bunx',
      ['playwright', 'screenshot', url, outputPath],
      {
        timeoutMs: 30_000, // WHY: 브라우저 시작 시간 고려
      },
    );

    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError('browser_screenshot_error', `스크린샷 캡처 실패: ${result.value.stderr}`),
      );
    }

    return ok(undefined);
  }

  /**
   * MCP 스크린샷 도구 실행 / Execute screenshot MCP tool
   *
   * @description
   * KR: browser_screenshot 도구를 실행한다.
   * EN: Executes the browser_screenshot tool.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: BrowserInput): Promise<Result<BrowserOutput>> {
    this.logger.debug('MCP 스크린샷 도구 실행', { toolName, input });

    if (toolName !== 'browser_screenshot') {
      return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }

    if (!(input.url && input.outputPath)) {
      return ok({ success: false, message: 'url, outputPath 필드 필수' });
    }

    const result = await this.capture(input.url, input.outputPath);
    if (!result.ok) {
      return ok({ success: false, message: result.error.message });
    }

    return ok({ success: true, message: '스크린샷 캡처 성공' });
  }
}
