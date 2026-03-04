/**
 * Playwright 브라우저 자동화 도구 / Playwright browser automation tools
 *
 * @description
 * KR: Playwright CLI를 ProcessExecutor로 래핑하여 MCP 도구로 제공한다.
 *     실제 프로덕션에서는 Playwright 라이브러리 직접 사용 권장.
 * EN: Wraps Playwright CLI using ProcessExecutor as MCP tools.
 *     For production, direct Playwright library usage is recommended.
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import { err, ok } from '../../../core/types.js';
import type { Result } from '../../../core/types.js';
import type { McpTool } from '../../types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 브라우저 작업 입력 / Browser operation input
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
 */
export interface BrowserOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * 브라우저 MCP 도구 목록 / Browser MCP tools
 */
export const BROWSER_TOOLS: readonly McpTool[] = [
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

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * Playwright 실행기 / Playwright executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 Playwright CLI를 실행한다.
 *     간단한 구현으로, 실제 프로덕션에서는 Playwright 라이브러리 직접 사용 권장.
 * EN: Executes Playwright CLI using ProcessExecutor.
 *     Simple implementation; direct library usage recommended for production.
 *
 * @note
 * 현재는 간소화된 구현. 실제 프로덕션에서는:
 * - playwright 패키지를 dependencies에 추가
 * - 라이브러리 직접 import하여 사용
 * - 브라우저 인스턴스 재사용 (성능 최적화)
 */
export class PlaywrightExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'playwright-executor' });
  }

  /**
   * URL로 이동 / Navigate to URL
   *
   * @description
   * KR: Playwright CLI로 URL을 방문한다.
   * EN: Visits URL using Playwright CLI.
   */
  async navigate(url: string): Promise<Result<string>> {
    this.logger.debug('URL 이동', { url });

    // WHY: 실제 구현에서는 playwright codegen이나 라이브러리 직접 사용
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
   * 스크린샷 캡처 / Capture screenshot
   *
   * @description
   * KR: Playwright CLI로 스크린샷을 캡처한다.
   * EN: Captures screenshot using Playwright CLI.
   */
  async screenshot(url: string, outputPath: string): Promise<Result<void>> {
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
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   *
   * @description
   * KR: MCP 프로토콜에 따라 브라우저 도구를 실행한다.
   * EN: Executes browser tool according to MCP protocol.
   *
   * @note
   * browser_click, browser_type, browser_eval은 간소화된 구현.
   * 실제 프로덕션에서는 Playwright 라이브러리를 직접 사용하여 구현 필요.
   */
  async executeTool(toolName: string, input: BrowserInput): Promise<Result<BrowserOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    switch (toolName) {
      case 'browser_navigate': {
        if (!input.url) {
          return ok({
            success: false,
            message: 'url 필드 필수',
          });
        }

        const result = await this.navigate(input.url);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }

        return ok({
          success: true,
          data: result.value,
          message: 'URL 이동 성공',
        });
      }

      case 'browser_screenshot': {
        if (!(input.url && input.outputPath)) {
          return ok({
            success: false,
            message: 'url, outputPath 필드 필수',
          });
        }

        const result = await this.screenshot(input.url, input.outputPath);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }

        return ok({
          success: true,
          message: '스크린샷 캡처 성공',
        });
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
