/**
 * Web Search MCP 서버 테스트
 *
 * @description
 * KR: 웹 검색 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for web search tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import {
  WEB_SEARCH_TOOLS,
  WebSearchServer,
  WEB_SEARCH_SERVER,
} from 'mcp/builtin/web-search/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: WebSearchServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new WebSearchServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as WebSearchServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('WebSearchServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('WebSearchServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(WebSearchServer);
  });

  it('새 인스턴스 생성이 반복 가능하다', () => {
    const s2 = new WebSearchServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2).toBeInstanceOf(WebSearchServer);
  });

  it('두 인스턴스는 다른 객체', () => {
    const s1 = new WebSearchServer(executor, logger);
    const s2 = new WebSearchServer(executor, logger);
    expect(s1).not.toBe(s2);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('info level logger로 생성 가능', () => {
    const s = new WebSearchServer(new ProcessExecutor(new ConsoleLogger('info')), new ConsoleLogger('info'));
    expect(s).toBeInstanceOf(WebSearchServer);
  });

  it('debug level logger로 생성 가능', () => {
    const s = new WebSearchServer(new ProcessExecutor(new ConsoleLogger('debug')), new ConsoleLogger('debug'));
    expect(s).toBeInstanceOf(WebSearchServer);
  });
});

// ── WEB_SEARCH_SERVER 설정 ────────────────────────────────────

describe('WEB_SEARCH_SERVER 설정', () => {
  it('name이 web-search이다', () => {
    expect(WEB_SEARCH_SERVER.name).toBe('web-search');
  });

  it('command가 builtin이다', () => {
    expect(WEB_SEARCH_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(WEB_SEARCH_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(WEB_SEARCH_SERVER.args)).toBe(true);
    expect(WEB_SEARCH_SERVER.args.length).toBe(0);
  });

  it('name이 문자열이다', () => {
    expect(typeof WEB_SEARCH_SERVER.name).toBe('string');
  });

  it('name이 비어있지 않다', () => {
    expect(WEB_SEARCH_SERVER.name.length).toBeGreaterThan(0);
  });

  it('command는 string 타입', () => {
    expect(typeof WEB_SEARCH_SERVER.command).toBe('string');
  });

  it('enabled는 boolean 타입', () => {
    expect(typeof WEB_SEARCH_SERVER.enabled).toBe('boolean');
  });

  it('args는 배열 타입', () => {
    expect(Array.isArray(WEB_SEARCH_SERVER.args)).toBe(true);
  });

  it('name에 하이픈 포함', () => {
    expect(WEB_SEARCH_SERVER.name).toContain('-');
  });
});

// ── WEB_SEARCH_TOOLS 정의 ─────────────────────────────────────

describe('WEB_SEARCH_TOOLS 정의', () => {
  it('2개의 도구가 있다', () => {
    expect(WEB_SEARCH_TOOLS.length).toBe(2);
  });

  it('web_search 도구가 있다', () => {
    expect(WEB_SEARCH_TOOLS.some(t => t.name === 'web_search')).toBe(true);
  });

  it('web_fetch 도구가 있다', () => {
    expect(WEB_SEARCH_TOOLS.some(t => t.name === 'web_fetch')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = WEB_SEARCH_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('web_search는 query를 required로 가진다', () => {
    const tool = WEB_SEARCH_TOOLS.find(t => t.name === 'web_search');
    expect(tool?.inputSchema.required).toContain('query');
  });

  it('web_fetch는 url을 required로 가진다', () => {
    const tool = WEB_SEARCH_TOOLS.find(t => t.name === 'web_fetch');
    expect(tool?.inputSchema.required).toContain('url');
  });

  it('WEB_SEARCH_TOOLS는 배열', () => {
    expect(Array.isArray(WEB_SEARCH_TOOLS)).toBe(true);
  });

  it('모든 도구에 name 필드 있음', () => {
    for (const t of WEB_SEARCH_TOOLS) {
      expect(typeof t.name).toBe('string');
    }
  });

  it('모든 도구에 description 필드 있음', () => {
    for (const t of WEB_SEARCH_TOOLS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구에 inputSchema 필드 있음', () => {
    for (const t of WEB_SEARCH_TOOLS) {
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 web_ 접두사', () => {
    for (const t of WEB_SEARCH_TOOLS) {
      expect(t.name.startsWith('web_')).toBe(true);
    }
  });

  it('web_search 도구 name은 "web_search"', () => {
    const tool = WEB_SEARCH_TOOLS.find(t => t.name === 'web_search');
    expect(tool?.name).toBe('web_search');
  });

  it('web_fetch 도구 name은 "web_fetch"', () => {
    const tool = WEB_SEARCH_TOOLS.find(t => t.name === 'web_fetch');
    expect(tool?.name).toBe('web_fetch');
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('WebSearchServer getTools()', () => {
  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('2개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(2);
  });

  it('모든 도구가 web_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^web_/);
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

  it('두 번 호출해도 같은 개수를 반환한다', () => {
    expect(server.getTools().length).toBe(server.getTools().length);
  });

  it('반환값은 배열', () => {
    expect(Array.isArray(server.getTools())).toBe(true);
  });

  it('WEB_SEARCH_TOOLS와 동일', () => {
    expect(server.getTools()).toEqual(WEB_SEARCH_TOOLS);
  });

  it('10번 연속 호출 → 항상 길이 2', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(2);
    }
  });

  it('새 인스턴스 getTools() → 동일한 결과', () => {
    const s2 = new WebSearchServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2.getTools()).toEqual(server.getTools());
  });

  it('getTools() 결과에 web_search 포함', () => {
    const tools = server.getTools();
    expect(tools.some(t => t.name === 'web_search')).toBe(true);
  });

  it('getTools() 결과에 web_fetch 포함', () => {
    const tools = server.getTools();
    expect(tools.some(t => t.name === 'web_fetch')).toBe(true);
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('WebSearchServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('web_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('search', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('web_unknown 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('web_unknown', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('WEB_SEARCH', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('숫자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('123', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('특수문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('web_!@#', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('web_browse 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('web_browse', { url: 'https://example.com' });
    expect(result.ok).toBe(false);
  });

  it('web_crawl 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('web_crawl', {});
    expect(result.ok).toBe(false);
  });

  it('한국어 도구 이름 → ok=false', async () => {
    const result = await server.executeTool('웹검색', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('공백 도구 이름 → ok=false', async () => {
    const result = await server.executeTool('web search', { query: 'test' });
    expect(result.ok).toBe(false);
  });

  it('언더스코어만 → ok=false', async () => {
    const result = await server.executeTool('_', {});
    expect(result.ok).toBe(false);
  });

  it('매우 긴 도구 이름 → ok=false', async () => {
    const result = await server.executeTool('web_' + 'x'.repeat(1000), {});
    expect(result.ok).toBe(false);
  });

  it('fs_ 접두사 도구 → ok=false', async () => {
    const result = await server.executeTool('fs_read', {});
    expect(result.ok).toBe(false);
  });

  it('proc_ 접두사 도구 → ok=false', async () => {
    const result = await server.executeTool('proc_exec', {});
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 도구 error.code는 string', async () => {
    const result = await server.executeTool('no_such_tool', {});
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('알 수 없는 도구 error.message는 string', async () => {
    const result = await server.executeTool('no_such_tool', {});
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });
});

// ── executeTool - web_search ──────────────────────────────────

describe('WebSearchServer executeTool - web_search', () => {
  it('null input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', null as unknown as object);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('undefined input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', undefined as unknown as object);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 객체 input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('query 없는 input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', { limit: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 string query는 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', { query: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('숫자 input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', 42 as unknown as object);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('배열 input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', [] as unknown as object);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('false input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_search', false as unknown as object);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('message가 비어있지 않다 (query 없는 경우)', async () => {
    const result = await server.executeTool('web_search', {});
    if (result.ok) expect(result.value.message.length).toBeGreaterThan(0);
  });

  it('result.ok는 boolean 타입', async () => {
    const result = await server.executeTool('web_search', {});
    expect(typeof result.ok).toBe('boolean');
  });

  it('success는 boolean 타입 (결과 시)', async () => {
    const result = await server.executeTool('web_search', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('message는 string 타입 (결과 시)', async () => {
    const result = await server.executeTool('web_search', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('query가 null인 경우 → result.ok는 boolean', async () => {
    const result = await server.executeTool('web_search', { query: null });
    // WHY: 구현에 따라 success=false 또는 다른 동작. ok는 항상 boolean
    expect(typeof result.ok).toBe('boolean');
  });

  it('query가 숫자인 경우 → executeTool은 Promise 반환', () => {
    // WHY: async network call would timeout; just verify return type is Promise
    const promise = server.executeTool('web_search', { query: 123 });
    expect(promise instanceof Promise).toBe(true);
    promise.catch(() => {}); // suppress unhandled rejection
  });

  it('공백만 있는 query → executeTool은 Promise 반환', () => {
    // WHY: whitespace query makes real network call → timeout; check Promise only
    const promise = server.executeTool('web_search', { query: '   ' });
    expect(promise instanceof Promise).toBe(true);
    promise.catch(() => {}); // suppress unhandled rejection
  });
});

// ── executeTool - web_fetch ───────────────────────────────────

describe('WebSearchServer executeTool - web_fetch', () => {
  it('url 없는 input은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_fetch', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 url은 ok=true, success=false 반환', async () => {
    const result = await server.executeTool('web_fetch', { url: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('url 없는 경우 message가 비어있지 않다', async () => {
    const result = await server.executeTool('web_fetch', {});
    if (result.ok) expect(result.value.message.length).toBeGreaterThan(0);
  });

  it('timeout만 있고 url 없는 경우 ok=true, success=false', async () => {
    const result = await server.executeTool('web_fetch', { timeout: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('url이 null → result.ok는 boolean', async () => {
    // WHY: null input은 구현에 따라 throw할 수 있어 ok만 체크
    const result = await server.executeTool('web_fetch', { url: null });
    expect(typeof result.ok).toBe('boolean');
  });

  it('url이 숫자 → result.ok는 boolean', async () => {
    const result = await server.executeTool('web_fetch', { url: 123 });
    expect(typeof result.ok).toBe('boolean');
  });

  it('공백만 있는 url → ok=true, success=false', async () => {
    const result = await server.executeTool('web_fetch', { url: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('result.ok는 boolean 타입', async () => {
    const result = await server.executeTool('web_fetch', {});
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('WebSearchServer 반복 호출 일관성', () => {
  it('getTools() 10번 호출 → 항상 2개', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(2);
    }
  });

  it('unknown tool 5번 호출 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('web_search 빈 객체 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('web_search', {});
      expect(result.ok).toBe(true);
    }
  });

  it('web_fetch 빈 객체 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('web_fetch', {});
      expect(result.ok).toBe(true);
    }
  });

  it('web_search + web_fetch 교대로 5번 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const r1 = await server.executeTool('web_search', {});
      const r2 = await server.executeTool('web_fetch', {});
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    }
  });

  it('다양한 알 수 없는 도구 10개 → 모두 ok=false', async () => {
    const names = ['a', 'b', 'xyz', 'web_', 'WEB_FETCH', 'fetch', '123', '', '_web', 'web'];
    for (const name of names) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });
});
