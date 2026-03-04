/**
 * 웹 검색 도구 / Web search tools
 *
 * @description
 * KR: 웹 검색 API를 래핑하여 MCP 도구로 제공한다.
 *     현재는 간단한 curl 기반 구현 (추후 API 키 기반 검색으로 확장 가능).
 * EN: Wraps web search API as MCP tools.
 *     Currently simple curl-based implementation (can be extended with API keys).
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import { err, ok } from '../../../core/types.js';
import type { Result } from '../../../core/types.js';
import type { McpTool } from '../../types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 웹 검색 입력 / Web search input
 */
export interface SearchInput {
  readonly query: string;
  readonly limit?: number;
}

/**
 * 웹 검색 출력 / Web search output
 */
export interface SearchOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

/**
 * HTML fetch 입력 / HTML fetch input
 */
export interface FetchInput {
  readonly url: string;
  readonly timeout?: number;
}

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * 웹 검색 MCP 도구 목록 / Web search MCP tools
 */
export const WEB_SEARCH_TOOLS: readonly McpTool[] = [
  {
    name: 'web_search',
    description: '웹 검색 (간단한 구현) / Web search (simple implementation)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 쿼리 / Search query' },
        limit: {
          type: 'number',
          description: '결과 개수 제한 / Limit number of results',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'URL에서 HTML 가져오기 / Fetch HTML from URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL 주소 / URL address' },
        timeout: {
          type: 'number',
          description: '타임아웃 (초) / Timeout in seconds',
        },
      },
      required: ['url'],
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 웹 검색 실행기 / Web search executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 curl 기반 웹 검색을 수행한다.
 *     실제 프로덕션에서는 API 키 기반 검색 API 사용 권장.
 * EN: Performs curl-based web search using ProcessExecutor.
 *     For production, API key-based search API is recommended.
 */
export class SearchExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'search-executor' });
  }

  /**
   * 웹 검색 (간단한 구현) / Web search (simple)
   *
   * @description
   * KR: DuckDuckGo HTML 검색 (API 키 불필요).
   *     실제 프로덕션에서는 Google Custom Search API 등 사용 권장.
   * EN: DuckDuckGo HTML search (no API key required).
   *     For production, use Google Custom Search API etc.
   */
  async search(query: string, limit = 10): Promise<Result<string>> {
    this.logger.debug('웹 검색 시도', { query, limit });

    // WHY: DuckDuckGo HTML 검색 (간단한 구현)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const result = await this.executor.execute('curl', [
      '-L', // WHY: 리다이렉트 따라가기
      '-s', // WHY: silent 모드
      '--max-time',
      '10', // WHY: 10초 타임아웃
      url,
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('web_search_error', `웹 검색 실패: ${result.value.stderr}`));
    }

    // WHY: HTML 응답 전체 반환 (파싱은 호출자가 수행)
    return ok(result.value.stdout);
  }

  /**
   * URL에서 HTML 가져오기 / Fetch HTML from URL
   */
  async fetch(url: string, timeout = 10): Promise<Result<string>> {
    this.logger.debug('URL fetch 시도', { url, timeout });

    const result = await this.executor.execute('curl', [
      '-L', // WHY: 리다이렉트 따라가기
      '-s', // WHY: silent 모드
      '--max-time',
      String(timeout),
      url,
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fetch_error', `URL fetch 실패: ${result.value.stderr}`));
    }

    return ok(result.value.stdout);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(
    toolName: string,
    // biome-ignore lint/suspicious/noExplicitAny: MCP input은 동적이므로 any 허용
    input: any,
  ): Promise<Result<SearchOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    switch (toolName) {
      case 'web_search': {
        const searchInput = input as SearchInput;
        if (!searchInput.query) {
          return ok({
            success: false,
            message: 'query 필드 필수',
          });
        }

        const result = await this.search(searchInput.query, searchInput.limit);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }

        return ok({
          success: true,
          data: result.value,
          message: '웹 검색 성공',
        });
      }

      case 'web_fetch': {
        const fetchInput = input as FetchInput;
        if (!fetchInput.url) {
          return ok({
            success: false,
            message: 'url 필드 필수',
          });
        }

        const result = await this.fetch(fetchInput.url, fetchInput.timeout);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }

        return ok({
          success: true,
          data: result.value,
          message: 'URL fetch 성공',
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
