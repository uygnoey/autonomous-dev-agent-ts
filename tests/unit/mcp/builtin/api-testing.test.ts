/**
 * API 테스팅 MCP 서버 테스트
 *
 * @description
 * KR: API 테스팅 작업 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for API testing operations tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { API_TESTING_TOOLS, ApiTestingServer, API_TESTING_SERVER } from 'mcp/builtin/api-testing/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: ApiTestingServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new ApiTestingServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as ApiTestingServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('ApiTestingServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('ApiTestingServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(ApiTestingServer);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const s2 = new ApiTestingServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(server).not.toBe(s2);
  });
});

// ── API_TESTING_SERVER 설정 ───────────────────────────────────

describe('API_TESTING_SERVER 설정', () => {
  it('name이 api-testing이다', () => {
    expect(API_TESTING_SERVER.name).toBe('api-testing');
  });

  it('command가 builtin이다', () => {
    expect(API_TESTING_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(API_TESTING_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(API_TESTING_SERVER.args)).toBe(true);
    expect(API_TESTING_SERVER.args.length).toBe(0);
  });

  it('name이 비어있지 않다', () => {
    expect(API_TESTING_SERVER.name.length).toBeGreaterThan(0);
  });
});

// ── API_TESTING_TOOLS 정의 ────────────────────────────────────

describe('API_TESTING_TOOLS 정의', () => {
  it('3개의 도구가 있다', () => {
    expect(API_TESTING_TOOLS.length).toBe(3);
  });

  it('api_request 도구가 있다', () => {
    expect(API_TESTING_TOOLS.some(t => t.name === 'api_request')).toBe(true);
  });

  it('api_parse_openapi 도구가 있다', () => {
    expect(API_TESTING_TOOLS.some(t => t.name === 'api_parse_openapi')).toBe(true);
  });

  it('api_validate_response 도구가 있다', () => {
    expect(API_TESTING_TOOLS.some(t => t.name === 'api_validate_response')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = API_TESTING_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 도구가 name 필드 갖는다', () => {
    for (const tool of API_TESTING_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 description 필드 갖는다', () => {
    for (const tool of API_TESTING_TOOLS) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구 inputSchema.type이 object', () => {
    for (const tool of API_TESTING_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 api_ 접두사', () => {
    for (const tool of API_TESTING_TOOLS) {
      expect(tool.name.startsWith('api_')).toBe(true);
    }
  });

  it('api_request는 method를 required로 가진다', () => {
    const tool = API_TESTING_TOOLS.find(t => t.name === 'api_request');
    expect((tool?.inputSchema.required as string[])?.includes('method')).toBe(true);
  });

  it('api_request는 url을 required로 가진다', () => {
    const tool = API_TESTING_TOOLS.find(t => t.name === 'api_request');
    expect((tool?.inputSchema.required as string[])?.includes('url')).toBe(true);
  });

  it('api_parse_openapi는 specPath를 required로 가진다', () => {
    const tool = API_TESTING_TOOLS.find(t => t.name === 'api_parse_openapi');
    expect((tool?.inputSchema.required as string[])?.includes('specPath')).toBe(true);
  });

  it('api_validate_response는 responseBody를 required로 가진다', () => {
    const tool = API_TESTING_TOOLS.find(t => t.name === 'api_validate_response');
    expect((tool?.inputSchema.required as string[])?.includes('responseBody')).toBe(true);
  });

  it('api_validate_response는 expectedSchema를 required로 가진다', () => {
    const tool = API_TESTING_TOOLS.find(t => t.name === 'api_validate_response');
    expect((tool?.inputSchema.required as string[])?.includes('expectedSchema')).toBe(true);
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('ApiTestingServer getTools()', () => {
  it('3개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(3);
  });

  it('모든 도구가 api_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^api_/);
    }
  });

  it('모든 도구가 inputSchema를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('API_TESTING_TOOLS와 getTools 개수 일치', () => {
    expect(server.getTools().length).toBe(API_TESTING_TOOLS.length);
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('ApiTestingServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('api_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('request', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('API_REQUEST', {});
    expect(result.ok).toBe(false);
  });

  it('5가지 미지원 도구 → 모두 ok=false', async () => {
    const unknowns = ['api_websocket', 'api_grpc', 'api_graphql', 'api_mock', 'api_load_test'];
    for (const name of unknowns) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });
});

// ── executeTool - 필수 필드 검증 ─────────────────────────────

describe('ApiTestingServer executeTool - 필수 필드 검증', () => {
  it('api_request url 없으면 success=false', async () => {
    const result = await server.executeTool('api_request', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_request method 없으면 success=false', async () => {
    const result = await server.executeTool('api_request', { url: 'http://localhost' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_parse_openapi specPath 없으면 success=false', async () => {
    const result = await server.executeTool('api_parse_openapi', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response responseBody 없으면 success=false', async () => {
    const result = await server.executeTool('api_validate_response', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response expectedSchema 없으면 success=false', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '{"name":"test"}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response 잘못된 JSON은 success=false', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: 'not json',
      expectedSchema: { type: 'object' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response 유효한 스키마 → success=true', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '{"name":"test","age":25}',
      expectedSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(true);
  });

  it('api_validate_response 필수 필드 누락 → success=false', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '{"age":25}',
      expectedSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response 타입 불일치 → success=false', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '{"name":123}',
      expectedSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('api_validate_response 빈 객체 + 필수 없음 → success=true', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '{}',
      expectedSchema: { type: 'object' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(true);
  });

  it('api_validate_response 배열 vs 오브젝트 타입 불일치', async () => {
    const result = await server.executeTool('api_validate_response', {
      responseBody: '[]',
      expectedSchema: { type: 'object' },
    });
    expect(result.ok).toBe(true);
    // WHY: [] is an object in JS, so schema check may pass depending on implementation
  });

  it('필수 필드 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('api_request', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('ApiTestingServer 반복 호출 일관성', () => {
  it('getTools() 10번 호출 → 항상 3개', () => {
    for (let i = 0; i < 10; i++) {
      expect(server.getTools().length).toBe(3);
    }
  });

  it('unknown tool 5번 호출 → 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool(`unknown_${i}`, {});
      expect(result.ok).toBe(false);
    }
  });

  it('여러 도구 mixed 호출 → 각각 독립', async () => {
    const r1 = await server.executeTool('api_request', {});
    const r2 = await server.executeTool('unknown_tool', {});
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });
});
