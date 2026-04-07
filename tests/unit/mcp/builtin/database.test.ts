/**
 * 데이터베이스 MCP 서버 테스트
 *
 * @description
 * KR: 데이터베이스 작업 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for Database operations tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { DATABASE_TOOLS, DatabaseServer, DATABASE_SERVER } from 'mcp/builtin/database/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: DatabaseServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new DatabaseServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as DatabaseServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('DatabaseServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('DatabaseServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(DatabaseServer);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const s2 = new DatabaseServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(server).not.toBe(s2);
  });
});

// ── DATABASE_SERVER 설정 ──────────────────────────────────────

describe('DATABASE_SERVER 설정', () => {
  it('name이 database이다', () => {
    expect(DATABASE_SERVER.name).toBe('database');
  });

  it('command가 builtin이다', () => {
    expect(DATABASE_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(DATABASE_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(DATABASE_SERVER.args)).toBe(true);
    expect(DATABASE_SERVER.args.length).toBe(0);
  });

  it('name이 문자열이다', () => {
    expect(typeof DATABASE_SERVER.name).toBe('string');
  });

  it('name이 비어있지 않다', () => {
    expect(DATABASE_SERVER.name.length).toBeGreaterThan(0);
  });
});

// ── DATABASE_TOOLS 정의 ───────────────────────────────────────

describe('DATABASE_TOOLS 정의', () => {
  it('4개의 도구가 있다', () => {
    expect(DATABASE_TOOLS.length).toBe(4);
  });

  it('db_list_tables 도구가 있다', () => {
    expect(DATABASE_TOOLS.some(t => t.name === 'db_list_tables')).toBe(true);
  });

  it('db_describe_table 도구가 있다', () => {
    expect(DATABASE_TOOLS.some(t => t.name === 'db_describe_table')).toBe(true);
  });

  it('db_query 도구가 있다', () => {
    expect(DATABASE_TOOLS.some(t => t.name === 'db_query')).toBe(true);
  });

  it('db_migration_status 도구가 있다', () => {
    expect(DATABASE_TOOLS.some(t => t.name === 'db_migration_status')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = DATABASE_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 도구가 name 필드 갖는다', () => {
    for (const tool of DATABASE_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 description 필드 갖는다', () => {
    for (const tool of DATABASE_TOOLS) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구 inputSchema.type이 object', () => {
    for (const tool of DATABASE_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 db_ 접두사', () => {
    for (const tool of DATABASE_TOOLS) {
      expect(tool.name.startsWith('db_')).toBe(true);
    }
  });

  it('db_list_tables는 connectionString을 required로 가진다', () => {
    const tool = DATABASE_TOOLS.find(t => t.name === 'db_list_tables');
    expect((tool?.inputSchema.required as string[])?.includes('connectionString')).toBe(true);
  });

  it('db_describe_table는 table을 required로 가진다', () => {
    const tool = DATABASE_TOOLS.find(t => t.name === 'db_describe_table');
    expect((tool?.inputSchema.required as string[])?.includes('table')).toBe(true);
  });

  it('db_query는 query를 required로 가진다', () => {
    const tool = DATABASE_TOOLS.find(t => t.name === 'db_query');
    expect((tool?.inputSchema.required as string[])?.includes('query')).toBe(true);
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('DatabaseServer getTools()', () => {
  it('도구 목록을 반환한다', () => {
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('4개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(4);
  });

  it('모든 도구가 db_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^db_/);
    }
  });

  it('모든 도구가 inputSchema를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('DATABASE_TOOLS와 getTools 개수 일치', () => {
    expect(server.getTools().length).toBe(DATABASE_TOOLS.length);
  });

  it('두 번 호출해도 같은 개수를 반환한다', () => {
    expect(server.getTools().length).toBe(server.getTools().length);
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('DatabaseServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('db_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('list_tables', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('DB_QUERY', {});
    expect(result.ok).toBe(false);
  });

  it('5가지 미지원 도구 → 모두 ok=false', async () => {
    const unknowns = ['db_create', 'db_drop', 'db_insert', 'db_update', 'db_delete'];
    for (const name of unknowns) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });
});

// ── executeTool - 필수 필드 검증 ─────────────────────────────

describe('DatabaseServer executeTool - 필수 필드 검증', () => {
  it('db_list_tables connectionString 없으면 success=false', async () => {
    const result = await server.executeTool('db_list_tables', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_describe_table connectionString 없으면 success=false', async () => {
    const result = await server.executeTool('db_describe_table', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_describe_table table 없으면 success=false', async () => {
    const result = await server.executeTool('db_describe_table', { connectionString: 'test.db' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query connectionString 없으면 success=false', async () => {
    const result = await server.executeTool('db_query', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query query 없으면 success=false', async () => {
    const result = await server.executeTool('db_query', { connectionString: 'test.db' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_migration_status connectionString 없으면 success=false', async () => {
    const result = await server.executeTool('db_migration_status', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query INSERT 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'INSERT INTO users VALUES (1, "test")',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query DELETE 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'DELETE FROM users WHERE id=1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query DROP 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'DROP TABLE users',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query UPDATE 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'UPDATE users SET name="test" WHERE id=1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query ALTER 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'ALTER TABLE users ADD COLUMN age INTEGER',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query CREATE 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'CREATE TABLE test (id INTEGER)',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('db_query TRUNCATE 쿼리는 success=false (읽기 전용)', async () => {
    const result = await server.executeTool('db_query', {
      connectionString: 'test.db',
      query: 'TRUNCATE TABLE users',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('필수 필드 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('db_list_tables', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('DatabaseServer 반복 호출 일관성', () => {
  it('getTools() 10번 호출 → 항상 4개', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(4);
    }
  });

  it('unknown tool 5번 호출 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('여러 도구 mixed 호출 → 각각 독립', async () => {
    const r1 = await server.executeTool('db_list_tables', {});
    const r2 = await server.executeTool('unknown_tool', {});
    const r3 = await server.executeTool('db_query', {});
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(true);
  });
});
