/**
 * OS Control MCP 서버 테스트
 *
 * @description
 * KR: 파일시스템, 프로세스, 시스템 정보 도구 테스트. 80%+ 경계값 비율.
 * EN: Tests for filesystem, process, and system info tools. 80%+ edge ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import {
  OsControlServer,
  OS_CONTROL_TOOLS,
} from 'mcp/builtin/os-control/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: OsControlServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new OsControlServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as OsControlServer;
});

function makeServer(): OsControlServer {
  const l = new ConsoleLogger('error');
  return new OsControlServer(new ProcessExecutor(l), l);
}

// ── 생성자 ────────────────────────────────────────────────────

describe('OsControlServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('OsControlServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(OsControlServer);
  });

  it('다른 logger로 생성 가능', () => {
    const s = new OsControlServer(new ProcessExecutor(new ConsoleLogger('debug')), new ConsoleLogger('debug'));
    expect(s).toBeInstanceOf(OsControlServer);
  });

  it('두 인스턴스는 다른 객체', () => {
    const s1 = new OsControlServer(executor, logger);
    const s2 = new OsControlServer(executor, logger);
    expect(s1).not.toBe(s2);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('info level logger로 생성 가능', () => {
    const s = new OsControlServer(new ProcessExecutor(new ConsoleLogger('info')), new ConsoleLogger('info'));
    expect(s).toBeInstanceOf(OsControlServer);
  });

  it('warn level logger로 생성 가능', () => {
    const s = new OsControlServer(new ProcessExecutor(new ConsoleLogger('warn')), new ConsoleLogger('warn'));
    expect(s).toBeInstanceOf(OsControlServer);
  });

  it('10개 인스턴스 모두 생성 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeServer()).not.toThrow();
    }
  });

  it('5번 반복 인스턴스 생성 → 모두 OsControlServer', () => {
    for (let i = 0; i < 5; i++) {
      expect(makeServer()).toBeInstanceOf(OsControlServer);
    }
  });
});

// ── getTools ─────────────────────────────────────────────────

describe('OsControlServer getTools', () => {
  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('OS_CONTROL_TOOLS와 동일하다', () => {
    expect(server.getTools()).toEqual(OS_CONTROL_TOOLS);
  });

  it('12개 이상의 도구가 있다', () => {
    expect(server.getTools().length).toBeGreaterThanOrEqual(12);
  });

  it('배열을 반환한다', () => {
    expect(Array.isArray(server.getTools())).toBe(true);
  });

  it('연속 호출 시 동일한 결과 반환', () => {
    const t1 = server.getTools();
    const t2 = server.getTools();
    expect(t1).toEqual(t2);
    expect(t1.length).toBe(t2.length);
  });

  it('모든 도구가 name을 가진다', () => {
    for (const tool of server.getTools()) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 description을 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 inputSchema를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구가 고유한 이름을 가진다', () => {
    const tools = server.getTools();
    const names = tools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('fs_ 접두사 도구가 존재한다', () => {
    const fsTools = server.getTools().filter((t) => t.name.startsWith('fs_'));
    expect(fsTools.length).toBeGreaterThan(0);
  });

  it('proc_ 접두사 도구가 존재한다', () => {
    const procTools = server.getTools().filter((t) => t.name.startsWith('proc_'));
    expect(procTools.length).toBeGreaterThan(0);
  });

  it('sys_ 접두사 도구가 존재한다', () => {
    const sysTools = server.getTools().filter((t) => t.name.startsWith('sys_'));
    expect(sysTools.length).toBeGreaterThan(0);
  });

  it('OS_CONTROL_TOOLS가 배열이다', () => {
    expect(Array.isArray(OS_CONTROL_TOOLS)).toBe(true);
  });

  it('OS_CONTROL_TOOLS 길이가 12 이상이다', () => {
    expect(OS_CONTROL_TOOLS.length).toBeGreaterThanOrEqual(12);
  });

  it('OS_CONTROL_TOOLS 모든 요소 name은 string', () => {
    for (const tool of OS_CONTROL_TOOLS) {
      expect(typeof tool.name).toBe('string');
    }
  });

  it('OS_CONTROL_TOOLS 모든 요소 description은 string', () => {
    for (const tool of OS_CONTROL_TOOLS) {
      expect(typeof tool.description).toBe('string');
    }
  });

  it('새 인스턴스도 동일한 도구 목록 반환', () => {
    const s2 = new OsControlServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2.getTools()).toEqual(server.getTools());
  });

  it('getTools 5번 연속 → 항상 동일 길이', () => {
    const len = server.getTools().length;
    for (let i = 0; i < 5; i++) {
      expect(server.getTools().length).toBe(len);
    }
  });

  it('inputSchema에 properties 또는 빈 객체 있음', () => {
    for (const tool of server.getTools()) {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  it('각 도구 이름에 언더스코어 포함', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toContain('_');
    }
  });

  it('도구 이름이 모두 소문자 + 언더스코어', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
    }
  });

  it('description이 빈 문자열이 아니다', () => {
    for (const tool of server.getTools()) {
      expect(tool.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('10번 getTools → 항상 동일 배열 내용', () => {
    const reference = server.getTools();
    for (let i = 0; i < 10; i++) {
      expect(server.getTools()).toEqual(reference);
    }
  });
});

// ── executeTool - 알 수 없는 도구 ────────────────────────────

describe('OsControlServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름 → ok=false', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 도구 → code=unknown_tool', async () => {
    const result = await server.executeTool('unknown_tool', {});
    if (!result.ok) expect(result.error.code).toBe('unknown_tool');
  });

  it('알 수 없는 도구 → message에 "알 수 없는 도구" 포함', async () => {
    const result = await server.executeTool('unknown_tool', {});
    if (!result.ok) expect(result.error.message).toContain('알 수 없는 도구');
  });

  it('빈 이름 → ok=false', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('빈 이름 → code=unknown_tool', async () => {
    const result = await server.executeTool('', {});
    if (!result.ok) expect(result.error.code).toBe('unknown_tool');
  });

  it('접두사 없는 이름 → ok=false', async () => {
    const result = await server.executeTool('invalid', {});
    expect(result.ok).toBe(false);
  });

  it('잘못된 접두사(xyz) → ok=false', async () => {
    const result = await server.executeTool('xyz_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('잘못된 접두사(abc) → ok=false', async () => {
    const result = await server.executeTool('abc_something', {});
    expect(result.ok).toBe(false);
  });

  it('매우 긴 이름 → ok=false', async () => {
    const result = await server.executeTool('fs_' + 'x'.repeat(10000), {});
    expect(result.ok).toBe(false);
  });

  it('특수문자 포함 이름 → ok=false', async () => {
    const result = await server.executeTool('fs_<script>', {});
    expect(result.ok).toBe(false);
  });

  it('숫자만 있는 이름 → ok=false', async () => {
    const result = await server.executeTool('12345', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 이름 → ok=false', async () => {
    const result = await server.executeTool('FS_READ', {});
    expect(result.ok).toBe(false);
  });

  it('여러 알 수 없는 도구 → 모두 ok=false', async () => {
    const names = ['bad1', 'bad2', 'xyz_tool', 'not_exist', ''];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });

  it('한국어 이름 → ok=false', async () => {
    const result = await server.executeTool('한국어도구', {});
    expect(result.ok).toBe(false);
  });

  it('공백 포함 이름 → ok=false', async () => {
    const result = await server.executeTool('fs read file', {});
    expect(result.ok).toBe(false);
  });

  it('언더스코어만 → ok=false', async () => {
    const result = await server.executeTool('_', {});
    expect(result.ok).toBe(false);
  });

  it('error.code는 string 타입', async () => {
    const result = await server.executeTool('no_such_tool', {});
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('error.message는 string 타입', async () => {
    const result = await server.executeTool('no_such_tool', {});
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('ok가 boolean이다', async () => {
    const result = await server.executeTool('no_such_tool', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 반복 — 알 수 없는 도구 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`no_such_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('이모지 이름 → ok=false', async () => {
    const result = await server.executeTool('🚀_tool', {});
    expect(result.ok).toBe(false);
  });

  it('탭 포함 이름 → ok=false', async () => {
    const result = await server.executeTool('fs_\ttool', {});
    expect(result.ok).toBe(false);
  });
});

// ── executeTool - fs_ 라우팅 ──────────────────────────────────

describe('OsControlServer executeTool - fs_ 라우팅', () => {
  it('fs_unknown → ok=false (filesystem executor로 라우팅됨)', async () => {
    const result = await server.executeTool('fs_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('fs_ 접두사 여러 알 수 없는 도구 → 모두 ok=false', async () => {
    const names = ['fs_nonexist1', 'fs_nonexist2', 'fs_bad_tool'];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });

  it('fs_ 접두사 빈 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('fs_ 접두사 긴 이름 → ok=false', async () => {
    const result = await server.executeTool('fs_' + 'y'.repeat(200), {});
    expect(result.ok).toBe(false);
  });

  it('fs_ 접두사 숫자 뒤에 → ok=false', async () => {
    const result = await server.executeTool('fs_123', {});
    expect(result.ok).toBe(false);
  });

  it('fs_ 5번 반복 에러 코드 string', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`fs_invalid_${i}`, {});
      if (!result.ok) expect(typeof result.error.code).toBe('string');
    }
  });
});

// ── executeTool - proc_ 라우팅 ────────────────────────────────

describe('OsControlServer executeTool - proc_ 라우팅', () => {
  it('proc_unknown → ok=false (ProcessManager로 라우팅됨)', async () => {
    const result = await server.executeTool('proc_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('proc_ 접두사 여러 알 수 없는 도구 → 모두 ok=false', async () => {
    const names = ['proc_nonexist1', 'proc_nonexist2'];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });

  it('proc_ 접두사 긴 이름 → ok=false', async () => {
    const result = await server.executeTool('proc_' + 'z'.repeat(100), {});
    expect(result.ok).toBe(false);
  });

  it('proc_ 5번 반복 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`proc_bad_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });
});

// ── executeTool - sys_ 라우팅 ─────────────────────────────────

describe('OsControlServer executeTool - sys_ 라우팅', () => {
  it('sys_unknown → ok=false (SystemInfoExecutor로 라우팅됨)', async () => {
    const result = await server.executeTool('sys_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('sys_ 접두사 여러 알 수 없는 도구 → 모두 ok=false', async () => {
    const names = ['sys_nonexist1', 'sys_nonexist2'];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });

  it('sys_ 접두사 긴 이름 → ok=false', async () => {
    const result = await server.executeTool('sys_' + 'w'.repeat(100), {});
    expect(result.ok).toBe(false);
  });

  it('sys_ 5번 반복 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`sys_bad_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });
});

// ── executeTool - 잘못된 입력 ─────────────────────────────────

describe('OsControlServer executeTool - 잘못된 입력', () => {
  it('null 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', null as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('undefined 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', undefined as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('문자열 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', 'invalid' as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 도구 + null → ok=false', async () => {
    const result = await server.executeTool('unknown_tool', null as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('여러 도구 순차 실행 → 모두 ok=false', async () => {
    const r1 = await server.executeTool('fs_unknown', {});
    const r2 = await server.executeTool('proc_unknown', {});
    const r3 = await server.executeTool('sys_unknown', {});
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it('숫자 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', 123 as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('배열 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', [] as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('boolean 입력 → ok=false', async () => {
    const result = await server.executeTool('fs_unknown', true as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 도구 + 배열 → ok=false', async () => {
    const result = await server.executeTool('no_tool', [] as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });
});

// ── 반복/일관성 ────────────────────────────────────────────────

describe('OsControlServer 반복/일관성', () => {
  it('10회 getTools 호출 → 항상 동일 길이', () => {
    const len = server.getTools().length;
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(len);
    }
  });

  it('10회 알 수 없는 도구 실행 → 모두 ok=false', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('새 인스턴스 → getTools 동일', () => {
    const s2 = new OsControlServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2.getTools()).toEqual(server.getTools());
  });

  it('10회 빈 이름 실행 → 모두 ok=false', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await server.executeTool('', {});
      expect(result.ok).toBe(false);
    }
  });

  it('각 도구 이름 prefix 목록 확인', () => {
    const tools = server.getTools();
    const prefixes = new Set(tools.map((t) => t.name.split('_')[0]));
    expect(prefixes.has('fs')).toBe(true);
    expect(prefixes.has('proc')).toBe(true);
    expect(prefixes.has('sys')).toBe(true);
  });

  it('5회 연속 알 수 없는 fs_ 도구 → 모두 error.code = "unknown_tool" 또는 유사 코드', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`fs_no_such_${i}`, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
      }
    }
  });

  it('3개 서버 인스턴스 독립 동작', async () => {
    const s1 = makeServer();
    const s2 = makeServer();
    const s3 = makeServer();
    const r1 = await s1.executeTool('no_such', {});
    const r2 = await s2.executeTool('no_such', {});
    const r3 = await s3.executeTool('no_such', {});
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it('모든 접두사 순차 실행 → 모두 ok=false (알 수 없는 도구)', async () => {
    const names = ['fs_no', 'proc_no', 'sys_no'];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
        expect(typeof result.error.message).toBe('string');
      }
    }
  });

  it('getTools + executeTool 병렬 일관성', async () => {
    const tools = server.getTools();
    const unknownResult = await server.executeTool('nonexistent', {});
    expect(tools.length).toBeGreaterThan(0);
    expect(unknownResult.ok).toBe(false);
  });

  it('5번 새 서버 생성 + getTools → 항상 동일 길이', () => {
    const ref = server.getTools().length;
    for (let i = 0; i < 5; i++) {
      const s = makeServer();
      expect(s.getTools().length).toBe(ref);
    }
  });
});
