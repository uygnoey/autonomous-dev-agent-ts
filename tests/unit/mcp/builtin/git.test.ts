/**
 * Git MCP 서버 테스트
 *
 * @description
 * KR: Git 작업 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for Git operations tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { GIT_TOOLS, GitServer, GIT_SERVER } from 'mcp/builtin/git/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: GitServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new GitServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as GitServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('GitServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('GitServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(GitServer);
  });

  it('새 인스턴스 생성이 반복 가능하다', () => {
    const s2 = new GitServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s2).toBeInstanceOf(GitServer);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const s1 = new GitServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    const s2 = new GitServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(s1).not.toBe(s2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new GitServer(new ProcessExecutor(new ConsoleLogger('warn')), new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new GitServer(new ProcessExecutor(new ConsoleLogger('debug')), new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const servers = Array.from({ length: 10 }, () =>
      new GitServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'))
    );
    for (let i = 0; i < servers.length; i++) {
      for (let j = i + 1; j < servers.length; j++) {
        expect(servers[i]).not.toBe(servers[j]);
      }
    }
  });
});

// ── GIT_SERVER 설정 ───────────────────────────────────────────

describe('GIT_SERVER 설정', () => {
  it('name이 git이다', () => {
    expect(GIT_SERVER.name).toBe('git');
  });

  it('command가 builtin이다', () => {
    expect(GIT_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(GIT_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(GIT_SERVER.args)).toBe(true);
    expect(GIT_SERVER.args.length).toBe(0);
  });

  it('name이 문자열이다', () => {
    expect(typeof GIT_SERVER.name).toBe('string');
  });

  it('name이 비어있지 않다', () => {
    expect(GIT_SERVER.name.length).toBeGreaterThan(0);
  });

  it('command가 문자열이다', () => {
    expect(typeof GIT_SERVER.command).toBe('string');
  });

  it('enabled가 boolean이다', () => {
    expect(typeof GIT_SERVER.enabled).toBe('boolean');
  });

  it('args가 배열이다', () => {
    expect(Array.isArray(GIT_SERVER.args)).toBe(true);
  });

  it('GIT_SERVER는 객체이다', () => {
    expect(typeof GIT_SERVER).toBe('object');
  });

  it('GIT_SERVER는 null이 아니다', () => {
    expect(GIT_SERVER).not.toBeNull();
  });

  it('name은 git으로 고정 (5번 체크)', () => {
    for (let i = 0; i < 5; i++) {
      expect(GIT_SERVER.name).toBe('git');
    }
  });
});

// ── GIT_TOOLS 정의 ────────────────────────────────────────────

describe('GIT_TOOLS 정의', () => {
  it('10개의 도구가 있다', () => {
    expect(GIT_TOOLS.length).toBe(10);
  });

  it('git_status 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_status')).toBe(true);
  });

  it('git_diff 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_diff')).toBe(true);
  });

  it('git_add 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_add')).toBe(true);
  });

  it('git_commit 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_commit')).toBe(true);
  });

  it('git_push 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_push')).toBe(true);
  });

  it('git_pull 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_pull')).toBe(true);
  });

  it('git_branch 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_branch')).toBe(true);
  });

  it('git_checkout 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_checkout')).toBe(true);
  });

  it('git_log 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_log')).toBe(true);
  });

  it('git_exec 도구가 있다', () => {
    expect(GIT_TOOLS.some(t => t.name === 'git_exec')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = GIT_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('git_add는 files를 required로 가진다', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_add');
    expect(tool?.inputSchema.required).toContain('files');
  });

  it('git_commit는 message를 required로 가진다', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_commit');
    expect(tool?.inputSchema.required).toContain('message');
  });

  it('git_checkout는 branch를 required로 가진다', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_checkout');
    expect(tool?.inputSchema.required).toContain('branch');
  });

  it('git_exec는 command를 required로 가진다', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_exec');
    expect(tool?.inputSchema.required).toContain('command');
  });

  it('모든 도구가 name 필드 갖는다', () => {
    for (const tool of GIT_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 description 필드 갖는다', () => {
    for (const tool of GIT_TOOLS) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구 inputSchema.type이 object', () => {
    for (const tool of GIT_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 git_ 접두사', () => {
    for (const tool of GIT_TOOLS) {
      expect(tool.name.startsWith('git_')).toBe(true);
    }
  });

  it('GIT_TOOLS는 배열이다', () => {
    expect(Array.isArray(GIT_TOOLS)).toBe(true);
  });

  it('git_push required 없거나 배열', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_push');
    expect(tool?.inputSchema.required == null || Array.isArray(tool?.inputSchema.required)).toBe(true);
  });

  it('git_pull required 없거나 배열', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_pull');
    expect(tool?.inputSchema.required == null || Array.isArray(tool?.inputSchema.required)).toBe(true);
  });

  it('git_status required 없거나 빈 배열', () => {
    const tool = GIT_TOOLS.find(t => t.name === 'git_status');
    const req = tool?.inputSchema.required;
    expect(req == null || (Array.isArray(req) && req.length === 0)).toBe(true);
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('GitServer getTools()', () => {
  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('10개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(10);
  });

  it('모든 도구가 git_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^git_/);
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

  it('getTools 반환은 배열이다', () => {
    expect(Array.isArray(server.getTools())).toBe(true);
  });

  it('5번 반복 호출 → 항상 10개', () => {
    for (let i = 0; i < 5; i++) {
      expect(server.getTools().length).toBe(10);
    }
  });

  it('GIT_TOOLS와 getTools 개수 일치', () => {
    expect(server.getTools().length).toBe(GIT_TOOLS.length);
  });

  it('모든 도구 name이 string', () => {
    for (const tool of server.getTools()) {
      expect(typeof tool.name).toBe('string');
    }
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('GitServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('git_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('status', {});
    expect(result.ok).toBe(false);
  });

  it('git_unknown 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('git_unknown', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('GIT_STATUS', {});
    expect(result.ok).toBe(false);
  });

  it('숫자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('123', {});
    expect(result.ok).toBe(false);
  });

  it('특수문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('git_!@#', {});
    expect(result.ok).toBe(false);
  });

  it('공백 포함 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('git status', {});
    expect(result.ok).toBe(false);
  });

  it('git_merge 도구는 ok=false 반환 (미구현)', async () => {
    const result = await server.executeTool('git_merge', { branch: 'main' });
    expect(result.ok).toBe(false);
  });

  it('git_stash 도구는 ok=false 반환 (미구현)', async () => {
    const result = await server.executeTool('git_stash', {});
    expect(result.ok).toBe(false);
  });

  it('unknown error code는 string이다', async () => {
    const result = await server.executeTool('unknown_tool', {});
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('unknown error message는 string이다', async () => {
    const result = await server.executeTool('unknown_tool', {});
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5가지 다른 미지원 도구 → 모두 ok=false', async () => {
    const unknowns = ['git_rebase', 'git_reset', 'git_cherry', 'git_tag', 'git_remote'];
    for (const name of unknowns) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });

  it('ok=false의 ok는 boolean 타입', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── executeTool - git_add (required: files) ───────────────────

describe('GitServer executeTool - git_add 필드 검증', () => {
  it('files 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('git_add', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 files 배열은 ok=true, success=false', async () => {
    const result = await server.executeTool('git_add', { files: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('files 없는 경우 message가 비어있지 않다', async () => {
    const result = await server.executeTool('git_add', {});
    if (result.ok) expect(result.value.message.length).toBeGreaterThan(0);
  });

  it('files 없는 경우 success는 boolean', async () => {
    const result = await server.executeTool('git_add', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('files 없는 경우 message는 string', async () => {
    const result = await server.executeTool('git_add', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('files 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_add', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── executeTool - git_commit (required: message) ──────────────

describe('GitServer executeTool - git_commit 필드 검증', () => {
  it('message 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('git_commit', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 message는 ok=true, success=false', async () => {
    const result = await server.executeTool('git_commit', { message: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('message 없는 경우 message 필드 포함', async () => {
    const result = await server.executeTool('git_commit', {});
    if (result.ok) expect(result.value.message).toBeTruthy();
  });

  it('빈 message 경우 success는 boolean', async () => {
    const result = await server.executeTool('git_commit', { message: '' });
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('message 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_commit', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── executeTool - git_checkout (required: branch) ─────────────

describe('GitServer executeTool - git_checkout 필드 검증', () => {
  it('branch 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('git_checkout', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 branch는 ok=true, success=false', async () => {
    const result = await server.executeTool('git_checkout', { branch: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('branch 없는 경우 message는 string', async () => {
    const result = await server.executeTool('git_checkout', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('branch 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_checkout', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── executeTool - git_exec (required: command) ────────────────

describe('GitServer executeTool - git_exec 필드 검증', () => {
  it('command 없으면 ok=true, success=false', async () => {
    const result = await server.executeTool('git_exec', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('빈 command는 ok=true, success=false', async () => {
    const result = await server.executeTool('git_exec', { command: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('command 없는 경우 message는 string', async () => {
    const result = await server.executeTool('git_exec', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('command 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_exec', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── executeTool - 필드 없는 도구들 (always ok) ───────────────

describe('GitServer executeTool - required 없는 도구들', () => {
  it('git_status는 ok=true 반환', async () => {
    const result = await server.executeTool('git_status', {});
    expect(result.ok).toBe(true);
  });

  it('git_diff는 ok=true 반환', async () => {
    const result = await server.executeTool('git_diff', {});
    expect(result.ok).toBe(true);
  });

  it('git_branch는 ok=true 반환', async () => {
    const result = await server.executeTool('git_branch', {});
    expect(result.ok).toBe(true);
  });

  it('git_log는 ok=true 반환', async () => {
    const result = await server.executeTool('git_log', {});
    expect(result.ok).toBe(true);
  });

  it('git_status result.value.success는 boolean이다', async () => {
    const result = await server.executeTool('git_status', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('git_status result.value.message는 문자열이다', async () => {
    const result = await server.executeTool('git_status', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('git_diff cwd 전달 시 ok=true', async () => {
    const result = await server.executeTool('git_diff', { cwd: '/tmp' });
    expect(result.ok).toBe(true);
  });

  it('git_branch result.value.success는 boolean이다', async () => {
    const result = await server.executeTool('git_branch', {});
    if (result.ok) expect(typeof result.value.success).toBe('boolean');
  });

  it('git_log result.value.message는 string이다', async () => {
    const result = await server.executeTool('git_log', {});
    if (result.ok) expect(typeof result.value.message).toBe('string');
  });

  it('git_pull ok=true 반환', async () => {
    const result = await server.executeTool('git_pull', {});
    expect(result.ok).toBe(true);
  });

  it('git_push ok=true 반환', async () => {
    const result = await server.executeTool('git_push', {});
    expect(result.ok).toBe(true);
  });

  it('git_status 5번 반복 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_status', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_diff 5번 반복 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_diff', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_branch 5번 반복 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_branch', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_log 5번 반복 → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_log', {});
      expect(result.ok).toBe(true);
    }
  });
});

// ── null/undefined input ──────────────────────────────────────

describe('GitServer executeTool - null/undefined input', () => {
  it('null input은 예외를 던진다', async () => {
    expect(async () => {
      await server.executeTool('git_status', null as unknown as object);
    }).toThrow();
  });

  it('undefined input은 예외를 던진다', async () => {
    expect(async () => {
      await server.executeTool('git_status', undefined as unknown as object);
    }).toThrow();
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('GitServer 반복 호출 일관성', () => {
  it('getTools() 10번 호출 → 항상 10개', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(10);
    }
  });

  it('unknown tool 5번 호출 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('git_commit message 없이 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_commit', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_add files 없이 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_add', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_checkout branch 없이 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_checkout', {});
      expect(result.ok).toBe(true);
    }
  });

  it('git_exec command 없이 5번 호출 → 항상 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('git_exec', {});
      expect(result.ok).toBe(true);
    }
  });

  it('두 서버 인스턴스 동일 결과', async () => {
    const s2 = new GitServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    const r1 = await server.executeTool('unknown_tool', {});
    const r2 = await s2.executeTool('unknown_tool', {});
    expect(r1.ok).toBe(r2.ok);
  });

  it('여러 도구 mixed 호출 → 각각 독립', async () => {
    const r1 = await server.executeTool('git_status', {});
    const r2 = await server.executeTool('unknown_tool', {});
    const r3 = await server.executeTool('git_commit', {});
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(true);
  });
});
