/**
 * 브라우저 제어 도구 / Browser control tools
 *
 * @description
 * KR: 브라우저 탐색, 클릭, 텍스트 입력, JavaScript 실행 등 제어 기능.
 * EN: Browser control features: navigation, click, type, JavaScript execution.
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
 * 브라우저 제어 MCP 도구 목록 / Browser control MCP tools
 *
 * @description
 * KR: navigate, click, type, eval 등 브라우저 제어 관련 도구.
 * EN: Browser control tools: navigate, click, type, eval.
 */
export const CHROME_CONTROL_TOOLS: readonly McpTool[] = [
  {
    name: 'browser_navigate',
    description: 'URL로 이동 / Navigate to URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '이동할 URL / URL to navigate' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: '요소 클릭 / Click element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 선택자 / CSS selector',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: '텍스트 입력 / Type text',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS 선택자 / CSS selector',
        },
        text: { type: 'string', description: '입력할 텍스트 / Text to type' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_eval',
    description: 'JavaScript 실행 / Execute JavaScript',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: '실행할 스크립트 / Script to execute',
        },
      },
      required: ['script'],
    },
  },
];

// ── 브라우저 제어 실행기 / Chrome Control Executor ─────────

/**
 * 브라우저 제어 실행기 / Chrome control executor
 *
 * @description
 * KR: URL 이동, 클릭, 텍스트 입력, JS 실행 등 브라우저 제어 기능을 담당한다.
 * EN: Handles browser control: navigation, click, type, JavaScript execution.
 *
 * @example
 * const ctrl = new ChromeControl(executor, logger);
 * const result = await ctrl.navigate('https://example.com');
 */
export class ChromeControl {
  private readonly logger: Logger;

  constructor(
    private readonly executor: ProcessExecutor,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'chrome-control' });
  }

  /**
   * URL로 이동 / Navigate to URL
   *
   * @description
   * KR: curl을 사용하여 URL을 방문한다 (Playwright 미설치 환경 고려).
   * EN: Visits URL using curl (for environments without Playwright).
   *
   * @param url - 이동할 URL / URL to navigate
   * @returns HTML 응답 또는 에러 / HTML response or error
   */
  async navigate(url: string): Promise<Result<string>> {
    this.logger.debug('URL 이동', { url });

    // WHY: 실제 구현에서는 playwright 라이브러리 직접 사용 권장
    // 현재는 간단한 curl로 대체 (Playwright 미설치 환경 고려)
    const result = await this.executor.execute('curl', ['-L', '-s', '--max-time', '10', url]);

    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('browser_navigate_error', `URL 이동 실패: ${result.value.stderr}`));
    }

    return ok(result.value.stdout);
  }

  /**
   * MCP 제어 도구 실행 / Execute control MCP tool
   *
   * @description
   * KR: navigate, click, type, eval 도구를 실행한다.
   * EN: Executes navigate, click, type, eval tools.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: BrowserInput): Promise<Result<BrowserOutput>> {
    this.logger.debug('MCP 제어 도구 실행', { toolName, input });

    switch (toolName) {
      case 'browser_navigate': {
        if (!input.url) {
          return ok({ success: false, message: 'url 필드 필수' });
        }

        const result = await this.navigate(input.url);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }

        return ok({ success: true, data: result.value, message: 'URL 이동 성공' });
      }

      case 'browser_click':
      case 'browser_type':
      case 'browser_eval':
        // WHY: 간소화된 구현. 실제 구현은 Playwright 라이브러리 필요
        return ok({
          success: false,
          message: `${toolName}은 Playwright 라이브러리 직접 사용 필요 (향후 구현 예정)`,
        });

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
