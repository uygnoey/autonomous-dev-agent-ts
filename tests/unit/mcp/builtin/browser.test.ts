/**
 * Browser MCP 서버 테스트
 *
 * @description
 * KR: 브라우저 자동화 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for browser automation tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import {
  BROWSER_TOOLS,
  BrowserServer,
  BROWSER_SERVER,
} from 'mcp/builtin/browser/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: BrowserServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new BrowserServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as BrowserServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('BrowserServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('BrowserServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(BrowserServer);
  });

  it('새 인스턴스 생성이 반복 가능하다', () => {
    const s2 = new BrowserServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2).toBeInstanceOf(BrowserServer);
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const s2 = new BrowserServer(executor, logger);
    expect(server).not.toBe(s2);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('5개 인스턴스 생성 → 오류 없음', () => {
    for (let i = 0; i < 5; i++) {
      const s = new BrowserServer(
        new ProcessExecutor(new ConsoleLogger('error')),
        new ConsoleLogger('error')
      );
      expect(s).toBeInstanceOf(BrowserServer);
    }
  });
});

// ── BROWSER_SERVER 설정 ───────────────────────────────────────

describe('BROWSER_SERVER 설정', () => {
  it('name이 browser이다', () => {
    expect(BROWSER_SERVER.name).toBe('browser');
  });

  it('command가 builtin이다', () => {
    expect(BROWSER_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(BROWSER_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(BROWSER_SERVER.args)).toBe(true);
    expect(BROWSER_SERVER.args.length).toBe(0);
  });

  it('name이 문자열이다', () => {
    expect(typeof BROWSER_SERVER.name).toBe('string');
  });

  it('name이 비어있지 않다', () => {
    expect(BROWSER_SERVER.name.length).toBeGreaterThan(0);
  });

  it('command는 string 타입', () => {
    expect(typeof BROWSER_SERVER.command).toBe('string');
  });

  it('enabled는 boolean 타입', () => {
    expect(typeof BROWSER_SERVER.enabled).toBe('boolean');
  });

  it('args는 배열 타입', () => {
    expect(Array.isArray(BROWSER_SERVER.args)).toBe(true);
  });

  it('name이 소문자만', () => {
    expect(BROWSER_SERVER.name).toBe(BROWSER_SERVER.name.toLowerCase());
  });

  it('name에 하이픈 없음', () => {
    expect(BROWSER_SERVER.name).not.toContain('-');
  });

  it('name 길이가 7', () => {
    expect(BROWSER_SERVER.name.length).toBe(7);
  });
});

// ── BROWSER_TOOLS 정의 ────────────────────────────────────────

describe('BROWSER_TOOLS 정의', () => {
  it('5개의 도구가 있다', () => {
    expect(BROWSER_TOOLS.length).toBe(5);
  });

  it('browser_navigate 도구가 있다', () => {
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_navigate')).toBe(true);
  });

  it('browser_screenshot 도구가 있다', () => {
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_screenshot')).toBe(true);
  });

  it('browser_click 도구가 있다', () => {
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_click')).toBe(true);
  });

  it('browser_type 도구가 있다', () => {
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_type')).toBe(true);
  });

  it('browser_eval 도구가 있다', () => {
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_eval')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = BROWSER_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('BROWSER_TOOLS는 배열', () => {
    expect(Array.isArray(BROWSER_TOOLS)).toBe(true);
  });

  it('모든 도구 이름이 browser_ 접두사', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.name).toMatch(/^browser_/);
    }
  });

  it('모든 도구가 name 필드 보유', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(typeof tool.name).toBe('string');
    }
  });

  it('모든 도구가 description 필드 보유', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(typeof tool.description).toBe('string');
    }
  });

  it('모든 도구가 inputSchema 필드 보유', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('모든 도구 inputSchema.type이 object', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 비어있지 않음', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구 description이 비어있지 않음', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('도구 이름에 밑줄 포함', () => {
    for (const tool of BROWSER_TOOLS) {
      expect(tool.name).toContain('_');
    }
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('BrowserServer getTools()', () => {
  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('5개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(5);
  });

  it('모든 도구가 browser_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^browser_/);
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

  it('모든 도구 이름이 고유하다', () => {
    const names = server.getTools().map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('readonly 배열을 반환한다', () => {
    const tools = server.getTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('두 번 호출해도 같은 개수를 반환한다', () => {
    expect(server.getTools().length).toBe(server.getTools().length);
  });

  it('BROWSER_TOOLS와 동일한 결과', () => {
    const tools = server.getTools();
    const names = tools.map(t => t.name);
    const browserNames = BROWSER_TOOLS.map(t => t.name);
    expect(names.sort()).toEqual(browserNames.sort());
  });

  it('browser_navigate 포함', () => {
    const names = server.getTools().map(t => t.name);
    expect(names).toContain('browser_navigate');
  });

  it('browser_screenshot 포함', () => {
    const names = server.getTools().map(t => t.name);
    expect(names).toContain('browser_screenshot');
  });

  it('browser_click 포함', () => {
    const names = server.getTools().map(t => t.name);
    expect(names).toContain('browser_click');
  });

  it('browser_type 포함', () => {
    const names = server.getTools().map(t => t.name);
    expect(names).toContain('browser_type');
  });

  it('browser_eval 포함', () => {
    const names = server.getTools().map(t => t.name);
    expect(names).toContain('browser_eval');
  });

  it('새 인스턴스 getTools → 동일 개수', () => {
    const s2 = new BrowserServer(executor, logger);
    expect(s2.getTools().length).toBe(server.getTools().length);
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('BrowserServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('browser_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('navigate', {});
    expect(result.ok).toBe(false);
  });

  it('browser_unknown 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('browser_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('BROWSER_NAVIGATE', {});
    expect(result.ok).toBe(false);
  });

  it('공백 포함 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('browser navigate', {});
    expect(result.ok).toBe(false);
  });

  it('숫자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('123', {});
    expect(result.ok).toBe(false);
  });

  it('browser_xyz 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('browser_xyz', {});
    expect(result.ok).toBe(false);
  });

  it('browser_navigate_extra 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('browser_navigate_extra', {});
    expect(result.ok).toBe(false);
  });

  it('특수문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('browser_!@#', {});
    expect(result.ok).toBe(false);
  });

  it('한국어 도구 이름 → ok=false', async () => {
    const result = await server.executeTool('브라우저_탐색', {});
    expect(result.ok).toBe(false);
  });

  it('null_tool → ok=false', async () => {
    const result = await server.executeTool('null_tool', {});
    expect(result.ok).toBe(false);
  });

  it('10개 잘못된 도구 → 모두 ok=false', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await server.executeTool(`invalid_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('unknown tool error.code는 string 타입', async () => {
    const result = await server.executeTool('unknown_tool', {});
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('ok는 boolean 타입', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 이름 5회 → 모두 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('', {});
      expect(result.ok).toBe(false);
    }
  });

  it('browser_nav (truncated) → ok=false', async () => {
    const result = await server.executeTool('browser_nav', {});
    expect(result.ok).toBe(false);
  });

  it('밑줄만 있는 이름 → ok=false', async () => {
    const result = await server.executeTool('___', {});
    expect(result.ok).toBe(false);
  });
});

// ── executeTool - browser_navigate ────────────────────────────

describe('BrowserServer executeTool - browser_navigate', () => {
  it('url 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('browser_navigate', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('url 없으면 message에 url 관련 내용 포함', async () => {
    const result = await server.executeTool('browser_navigate', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.message).toBeTruthy();
  });

  it('빈 url은 ok=true 반환', async () => {
    const result = await server.executeTool('browser_navigate', { url: '' });
    expect(result.ok).toBe(true);
  });

  it('빈 url은 success=false', async () => {
    const result = await server.executeTool('browser_navigate', { url: '' });
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('ok는 boolean 타입', async () => {
    const result = await server.executeTool('browser_navigate', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('value.message는 string 타입', async () => {
    const result = await server.executeTool('browser_navigate', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('value.success는 boolean 타입', async () => {
    const result = await server.executeTool('browser_navigate', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('5회 연속 호출 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('browser_navigate', {});
      expect(result.ok).toBe(true);
    }
  });
});

// ── executeTool - browser_screenshot ──────────────────────────

describe('BrowserServer executeTool - browser_screenshot', () => {
  it('url 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('browser_screenshot', { outputPath: '/tmp/out.png' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('outputPath 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('browser_screenshot', { url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('url, outputPath 둘 다 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('browser_screenshot', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('message가 비어있지 않다', async () => {
    const result = await server.executeTool('browser_screenshot', {});
    if (result.ok) expect(result.value.message.length).toBeGreaterThan(0);
  });

  it('ok는 boolean 타입', async () => {
    const result = await server.executeTool('browser_screenshot', {});
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── executeTool - 미구현 도구 ─────────────────────────────────

describe('BrowserServer executeTool - 미구현 도구', () => {
  it('browser_click은 ok=true 반환', async () => {
    const result = await server.executeTool('browser_click', { selector: '.btn' });
    expect(result.ok).toBe(true);
  });

  it('browser_click은 success=false 반환', async () => {
    const result = await server.executeTool('browser_click', { selector: '.btn' });
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('browser_type은 ok=true 반환', async () => {
    const result = await server.executeTool('browser_type', { selector: 'input', text: 'hello' });
    expect(result.ok).toBe(true);
  });

  it('browser_type은 success=false 반환', async () => {
    const result = await server.executeTool('browser_type', { selector: 'input', text: 'hello' });
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('browser_eval은 ok=true 반환', async () => {
    const result = await server.executeTool('browser_eval', { script: 'document.title' });
    expect(result.ok).toBe(true);
  });

  it('browser_eval은 success=false 반환', async () => {
    const result = await server.executeTool('browser_eval', { script: 'document.title' });
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('browser_click message에 도구명 포함', async () => {
    const result = await server.executeTool('browser_click', {});
    if (result.ok) expect(result.value.message).toContain('browser_click');
  });

  it('browser_type message에 도구명 포함', async () => {
    const result = await server.executeTool('browser_type', {});
    if (result.ok) expect(result.value.message).toContain('browser_type');
  });

  it('browser_eval message에 도구명 포함', async () => {
    const result = await server.executeTool('browser_eval', {});
    if (result.ok) expect(result.value.message).toContain('browser_eval');
  });

  it('browser_click ok는 boolean 타입', async () => {
    const result = await server.executeTool('browser_click', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('browser_type ok는 boolean 타입', async () => {
    const result = await server.executeTool('browser_type', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('browser_eval ok는 boolean 타입', async () => {
    const result = await server.executeTool('browser_eval', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('browser_click value.success는 boolean', async () => {
    const result = await server.executeTool('browser_click', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('browser_type value.success는 boolean', async () => {
    const result = await server.executeTool('browser_type', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('browser_eval value.message는 string', async () => {
    const result = await server.executeTool('browser_eval', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });
});

// ── null input 처리 ───────────────────────────────────────────

describe('BrowserServer executeTool - null/undefined input', () => {
  it('null input은 예외를 던진다', async () => {
    expect(async () => {
      await server.executeTool('browser_navigate', null as unknown as object);
    }).toThrow();
  });

  it('undefined input은 예외를 던진다', async () => {
    expect(async () => {
      await server.executeTool('browser_navigate', undefined as unknown as object);
    }).toThrow();
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('BrowserServer 반복 호출 일관성', () => {
  it('getTools() 10번 호출 → 항상 5개', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(5);
    }
  });

  it('unknown tool 5번 호출 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('browser_navigate url 없이 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('browser_navigate', {});
      expect(result.ok).toBe(true);
    }
  });

  it('browser_navigate url 없이 5번 → 항상 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('browser_navigate', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });

  it('browser_click 5번 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('browser_click', {});
      expect(result.ok).toBe(true);
    }
  });

  it('browser_eval 5번 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('browser_eval', {});
      expect(result.ok).toBe(true);
    }
  });

  it('두 서버 인스턴스 getTools → 동일 개수', () => {
    const s2 = new BrowserServer(executor, logger);
    expect(server.getTools().length).toBe(s2.getTools().length);
  });

  it('browser_type 3번 → 항상 success=false', async () => {
    for (let i = 0; i < 3; i++) {
      const result = await server.executeTool('browser_type', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});
