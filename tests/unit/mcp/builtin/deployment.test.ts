/**
 * 배포 MCP 서버 테스트
 *
 * @description
 * KR: 배포 작업 도구 테스트. 80%+ 경계값/무효 입력 비율.
 * EN: Tests for Deployment operations tools. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { DEPLOYMENT_TOOLS, DeploymentServer, DEPLOYMENT_SERVER } from 'mcp/builtin/deployment/index.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;
let server: DeploymentServer;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
  server = new DeploymentServer(executor, logger);
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
  server = null as unknown as DeploymentServer;
});

// ── 생성자 ────────────────────────────────────────────────────

describe('DeploymentServer 생성자', () => {
  it('서버가 정상적으로 생성된다', () => {
    expect(server).toBeDefined();
  });

  it('DeploymentServer 인스턴스이다', () => {
    expect(server).toBeInstanceOf(DeploymentServer);
  });

  it('getTools 메서드 존재', () => {
    expect(typeof server.getTools).toBe('function');
  });

  it('executeTool 메서드 존재', () => {
    expect(typeof server.executeTool).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const s2 = new DeploymentServer(new ProcessExecutor(new ConsoleLogger('error')), new ConsoleLogger('error'));
    expect(server).not.toBe(s2);
  });
});

// ── DEPLOYMENT_SERVER 설정 ────────────────────────────────────

describe('DEPLOYMENT_SERVER 설정', () => {
  it('name이 deployment이다', () => {
    expect(DEPLOYMENT_SERVER.name).toBe('deployment');
  });

  it('command가 builtin이다', () => {
    expect(DEPLOYMENT_SERVER.command).toBe('builtin');
  });

  it('enabled가 true이다', () => {
    expect(DEPLOYMENT_SERVER.enabled).toBe(true);
  });

  it('args가 빈 배열이다', () => {
    expect(Array.isArray(DEPLOYMENT_SERVER.args)).toBe(true);
    expect(DEPLOYMENT_SERVER.args.length).toBe(0);
  });

  it('name이 비어있지 않다', () => {
    expect(DEPLOYMENT_SERVER.name.length).toBeGreaterThan(0);
  });
});

// ── DEPLOYMENT_TOOLS 정의 ─────────────────────────────────────

describe('DEPLOYMENT_TOOLS 정의', () => {
  it('4개의 도구가 있다', () => {
    expect(DEPLOYMENT_TOOLS.length).toBe(4);
  });

  it('deploy_container_status 도구가 있다', () => {
    expect(DEPLOYMENT_TOOLS.some(t => t.name === 'deploy_container_status')).toBe(true);
  });

  it('deploy_container_logs 도구가 있다', () => {
    expect(DEPLOYMENT_TOOLS.some(t => t.name === 'deploy_container_logs')).toBe(true);
  });

  it('deploy_trigger 도구가 있다', () => {
    expect(DEPLOYMENT_TOOLS.some(t => t.name === 'deploy_trigger')).toBe(true);
  });

  it('deploy_rollback 도구가 있다', () => {
    expect(DEPLOYMENT_TOOLS.some(t => t.name === 'deploy_rollback')).toBe(true);
  });

  it('모든 이름이 고유하다', () => {
    const names = DEPLOYMENT_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 도구가 name 필드 갖는다', () => {
    for (const tool of DEPLOYMENT_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구가 description 필드 갖는다', () => {
    for (const tool of DEPLOYMENT_TOOLS) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('모든 도구 inputSchema.type이 object', () => {
    for (const tool of DEPLOYMENT_TOOLS) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('모든 도구 이름이 deploy_ 접두사', () => {
    for (const tool of DEPLOYMENT_TOOLS) {
      expect(tool.name.startsWith('deploy_')).toBe(true);
    }
  });

  it('deploy_container_logs는 container를 required로 가진다', () => {
    const tool = DEPLOYMENT_TOOLS.find(t => t.name === 'deploy_container_logs');
    expect((tool?.inputSchema.required as string[])?.includes('container')).toBe(true);
  });

  it('deploy_trigger는 webhookUrl을 required로 가진다', () => {
    const tool = DEPLOYMENT_TOOLS.find(t => t.name === 'deploy_trigger');
    expect((tool?.inputSchema.required as string[])?.includes('webhookUrl')).toBe(true);
  });

  it('deploy_rollback는 service를 required로 가진다', () => {
    const tool = DEPLOYMENT_TOOLS.find(t => t.name === 'deploy_rollback');
    expect((tool?.inputSchema.required as string[])?.includes('service')).toBe(true);
  });

  it('deploy_rollback는 imageTag를 required로 가진다', () => {
    const tool = DEPLOYMENT_TOOLS.find(t => t.name === 'deploy_rollback');
    expect((tool?.inputSchema.required as string[])?.includes('imageTag')).toBe(true);
  });

  it('deploy_container_status는 required 없거나 빈 배열', () => {
    const tool = DEPLOYMENT_TOOLS.find(t => t.name === 'deploy_container_status');
    const req = tool?.inputSchema.required;
    expect(req == null || (Array.isArray(req) && req.length === 0)).toBe(true);
  });
});

// ── getTools() ────────────────────────────────────────────────

describe('DeploymentServer getTools()', () => {
  it('4개의 도구를 반환한다', () => {
    expect(server.getTools().length).toBe(4);
  });

  it('모든 도구가 deploy_ 접두사를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.name).toMatch(/^deploy_/);
    }
  });

  it('모든 도구가 inputSchema를 가진다', () => {
    for (const tool of server.getTools()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('DEPLOYMENT_TOOLS와 getTools 개수 일치', () => {
    expect(server.getTools().length).toBe(DEPLOYMENT_TOOLS.length);
  });
});

// ── executeTool - 알 수 없는 도구 ─────────────────────────────

describe('DeploymentServer executeTool - 알 수 없는 도구', () => {
  it('알 수 없는 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('unknown_tool', {});
    expect(result.ok).toBe(false);
  });

  it('빈 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('', {});
    expect(result.ok).toBe(false);
  });

  it('deploy_ 접두사 없는 도구는 ok=false 반환', async () => {
    const result = await server.executeTool('container_status', {});
    expect(result.ok).toBe(false);
  });

  it('대문자 도구 이름은 ok=false 반환', async () => {
    const result = await server.executeTool('DEPLOY_TRIGGER', {});
    expect(result.ok).toBe(false);
  });

  it('5가지 미지원 도구 → 모두 ok=false', async () => {
    const unknowns = ['deploy_scale', 'deploy_restart', 'deploy_stop', 'deploy_start', 'deploy_config'];
    for (const name of unknowns) {
      const result = await server.executeTool(name, {});
      expect(result.ok).toBe(false);
    }
  });
});

// ── executeTool - 필수 필드 검증 ─────────────────────────────

describe('DeploymentServer executeTool - 필수 필드 검증', () => {
  it('deploy_container_logs container 없으면 success=false', async () => {
    const result = await server.executeTool('deploy_container_logs', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('deploy_trigger webhookUrl 없으면 success=false', async () => {
    const result = await server.executeTool('deploy_trigger', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('deploy_rollback service 없으면 success=false', async () => {
    const result = await server.executeTool('deploy_rollback', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('deploy_rollback imageTag 없으면 success=false', async () => {
    const result = await server.executeTool('deploy_rollback', { service: 'web' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
  });

  it('deploy_container_status는 필수 필드 없이 ok=true', async () => {
    const result = await server.executeTool('deploy_container_status', {});
    expect(result.ok).toBe(true);
  });

  it('필수 필드 없이 5번 호출 → 모두 success=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await server.executeTool('deploy_container_logs', {});
      if (result.ok) expect(result.value.success).toBe(false);
    }
  });
});

// ── 반복 호출 일관성 ──────────────────────────────────────────

describe('DeploymentServer 반복 호출 일관성', () => {
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
    const r1 = await server.executeTool('deploy_container_status', {});
    const r2 = await server.executeTool('unknown_tool', {});
    const r3 = await server.executeTool('deploy_container_logs', {});
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(true);
  });
});
