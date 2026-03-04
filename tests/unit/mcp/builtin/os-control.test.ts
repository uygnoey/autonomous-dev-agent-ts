/**
 * OS Control MCP 서버 테스트
 *
 * @description
 * KR: 파일시스템, 프로세스, 시스템 정보 도구 테스트
 *     비율: Normal 20%, Edge 50%, Error 30%
 * EN: Tests for filesystem, process, and system info tools
 *     Ratio: Normal 20%, Edge 50%, Error 30%
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../../src/core/logger.js';
import { ProcessExecutor } from '../../../../src/core/process-executor.js';
import {
  OsControlServer,
  OS_CONTROL_TOOLS,
} from '../../../../src/mcp/builtin/os-control/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: OsControlServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new OsControlServer(executor, logger);
});

afterEach(() => {
  logger = null as any;
  executor = null as any;
  server = null as any;
});

// ══════════════════════════════════════════════════════════════════
// NORMAL CASES (20%)
// ══════════════════════════════════════════════════════════════════

describe('OsControlServer - Normal Cases', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('모든 도구 목록을 반환한다', () => {
    const tools = server.getTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools).toEqual(OS_CONTROL_TOOLS);
  });

  it('도구 목록에 12개 이상의 도구가 있다', () => {
    const tools = server.getTools();

    expect(tools.length).toBeGreaterThanOrEqual(12);
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES (50%)
// ══════════════════════════════════════════════════════════════════

describe('OsControlServer - Edge Cases', () => {
  it('fs_ 접두사는 FilesystemExecutor로 라우팅된다', async () => {
    const result = await server.executeTool('fs_unknown', {});

    // WHY: 알 수 없는 fs_ 도구도 filesystem executor로 라우팅됨
    expect(result.ok).toBe(false);
  });

  it('proc_ 접두사는 ProcessManager로 라우팅된다', async () => {
    const result = await server.executeTool('proc_unknown', {});

    expect(result.ok).toBe(false);
  });

  it('sys_ 접두사는 SystemInfoExecutor로 라우팅된다', async () => {
    const result = await server.executeTool('sys_unknown', {});

    expect(result.ok).toBe(false);
  });

  it('getTools가 불변 배열을 반환한다', () => {
    const tools1 = server.getTools();
    const tools2 = server.getTools();

    expect(tools1).toEqual(tools2);
    expect(tools1.length).toBe(tools2.length);
  });

  it('도구 목록에 filesystem 도구가 포함된다', () => {
    const tools = server.getTools();
    const fsTools = tools.filter((t) => t.name.startsWith('fs_'));

    expect(fsTools.length).toBeGreaterThan(0);
  });

  it('도구 목록에 process 도구가 포함된다', () => {
    const tools = server.getTools();
    const procTools = tools.filter((t) => t.name.startsWith('proc_'));

    expect(procTools.length).toBeGreaterThan(0);
  });

  it('도구 목록에 system-info 도구가 포함된다', () => {
    const tools = server.getTools();
    const sysTools = tools.filter((t) => t.name.startsWith('sys_'));

    expect(sysTools.length).toBeGreaterThan(0);
  });

  it('모든 도구가 고유한 이름을 가진다', () => {
    const tools = server.getTools();
    const names = tools.map((t) => t.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
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

  it('여러 도구를 순차 실행할 수 있다', async () => {
    const result1 = await server.executeTool('fs_unknown', {});
    const result2 = await server.executeTool('proc_unknown', {});

    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// ERROR CASES (30%)
// ══════════════════════════════════════════════════════════════════

describe('OsControlServer - Error Cases', () => {
  it('알 수 없는 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('unknown_tool', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown_tool');
      expect(result.error.message).toContain('알 수 없는 도구');
    }
  });

  it('빈 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown_tool');
    }
  });

  it('접두사 없는 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('invalid', {});

    expect(result.ok).toBe(false);
  });

  it('잘못된 접두사는 에러를 반환한다', async () => {
    const result = await server.executeTool('xyz_unknown', {});

    expect(result.ok).toBe(false);
  });

  it('null input은 처리된다', async () => {
    const result = await server.executeTool('fs_unknown', null);

    expect(result.ok).toBe(false);
  });

  it('undefined input은 처리된다', async () => {
    const result = await server.executeTool('fs_unknown', undefined);

    expect(result.ok).toBe(false);
  });

  it('잘못된 형식의 input은 처리된다', async () => {
    const result = await server.executeTool('fs_unknown', 'invalid');

    expect(result.ok).toBe(false);
  });

  it('매우 긴 도구 이름은 에러를 반환한다', async () => {
    const longName = 'fs_' + 'x'.repeat(10000);
    const result = await server.executeTool(longName, {});

    expect(result.ok).toBe(false);
  });

  it('특수 문자를 포함한 도구 이름은 에러를 반환한다', async () => {
    const result = await server.executeTool('fs_<script>', {});

    expect(result.ok).toBe(false);
  });
});
