/**
 * Web Search MCP 서버 테스트
 *
 * @description
 * KR: 웹 검색 도구 테스트
 *     비율: Normal 20%, Edge 50%, Error 30%
 * EN: Tests for web search tools
 *     Ratio: Normal 20%, Edge 50%, Error 30%
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../../src/core/logger.js';
import { ProcessExecutor } from '../../../../src/core/process-executor.js';
import {
  WebSearchServer,
  WEB_SEARCH_SERVER,
} from '../../../../src/mcp/builtin/web-search/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: WebSearchServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new WebSearchServer(executor, logger);
});

afterEach(() => {
  logger = null as any;
  executor = null as any;
  server = null as any;
});

describe('WebSearchServer - Normal Cases', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('서버 설정이 올바르다', () => {
    expect(WEB_SEARCH_SERVER.name).toBe('web-search');
    expect(WEB_SEARCH_SERVER.command).toBe('builtin');
    expect(WEB_SEARCH_SERVER.enabled).toBe(true);
  });

  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});

describe('WebSearchServer - Edge Cases', () => {
  it('web_ 접두사 도구를 처리한다', async () => {
    const result = await server.executeTool('web_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('모든 도구가 web_ 접두사를 가진다', () => {
    const tools = server.getTools();
    for (const tool of tools) {
      expect(tool.name).toMatch(/^web_/);
    }
  });

  it('모든 도구가 description을 가진다', () => {
    const tools = server.getTools();
    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 inputSchema를 가진다', () => {
    const tools = server.getTools();
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('WebSearchServer - Error Cases', () => {
  it('알 수 없는 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('null input은 유효성 검증 에러를 반환한다', async () => {
    // WHY: input이 unknown 타입이므로 null은 타입 가드에서 걸려 graceful 에러 반환
    const result = await server.executeTool('web_search', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
    }
  });
});
