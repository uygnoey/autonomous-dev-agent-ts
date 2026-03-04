/**
 * Browser MCP 서버 테스트
 *
 * @description
 * KR: 브라우저 자동화 도구 테스트
 *     비율: Normal 20%, Edge 50%, Error 30%
 * EN: Tests for browser automation tools
 *     Ratio: Normal 20%, Edge 50%, Error 30%
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../../src/core/logger.js';
import { ProcessExecutor } from '../../../../src/core/process-executor.js';
import {
  BrowserServer,
  BROWSER_SERVER,
} from '../../../../src/mcp/builtin/browser/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: BrowserServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new BrowserServer(executor, logger);
});

afterEach(() => {
  logger = null as any;
  executor = null as any;
  server = null as any;
});

describe('BrowserServer - Normal Cases', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('서버 설정이 올바르다', () => {
    expect(BROWSER_SERVER.name).toBe('browser');
    expect(BROWSER_SERVER.command).toBe('builtin');
    expect(BROWSER_SERVER.enabled).toBe(true);
  });

  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});

describe('BrowserServer - Edge Cases', () => {
  it('browser_ 접두사 도구를 처리한다', async () => {
    const result = await server.executeTool('browser_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('모든 도구가 browser_ 접두사를 가진다', () => {
    const tools = server.getTools();
    for (const tool of tools) {
      expect(tool.name).toMatch(/^browser_/);
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

describe('BrowserServer - Error Cases', () => {
  it('알 수 없는 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('null input은 TypeError를 발생시킨다', async () => {
    // WHY: 구현이 null 체크를 하지 않으므로 TypeError 발생
    expect(async () => {
      await server.executeTool('browser_navigate', null);
    }).toThrow();
  });
});
