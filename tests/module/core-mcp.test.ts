/**
 * core ↔ mcp 모듈 통합 테스트 / core ↔ mcp module integration tests
 *
 * @description
 * KR: McpRegistry 서버 등록, McpManager 라이프사이클 관리,
 *     McpLoader 설정 로드, 빌트인 서버 등록을 검증한다.
 * EN: Verifies McpRegistry server registration, McpManager lifecycle,
 *     McpLoader config loading, and built-in server registration.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ConsoleLogger } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import {
  BUILTIN_SERVERS,
  McpLoader,
  McpManager,
  McpRegistry,
} from '../../src/mcp/index.js';
import type { McpServerConfig } from '../../src/mcp/index.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;

/** 테스트용 MCP 서버 설정 / Test MCP server config */
function createTestConfig(name: string, enabled = true): McpServerConfig {
  return {
    name,
    command: 'npx',
    args: ['-y', `@test/${name}`],
    enabled,
  };
}

// ── 테스트 ────────────────────────────────────────────────────────

describe('core ↔ mcp 통합 / core ↔ mcp integration', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-mcp-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('McpRegistry에 서버 등록 → 조회 → 해제', () => {
    const registry = new McpRegistry(logger);
    const config = createTestConfig('test-server');

    const regResult = registry.register(config);
    expect(regResult.ok).toBe(true);

    const server = registry.getServer('test-server');
    expect(server).not.toBeNull();
    expect(server?.name).toBe('test-server');
    expect(server?.command).toBe('npx');

    const unregResult = registry.unregister('test-server');
    expect(unregResult.ok).toBe(true);

    const afterUnreg = registry.getServer('test-server');
    expect(afterUnreg).toBeNull();
  });

  it('McpRegistry 중복 이름 등록 시 에러', () => {
    const registry = new McpRegistry(logger);
    registry.register(createTestConfig('dup-server'));

    const dupResult = registry.register(createTestConfig('dup-server'));
    expect(dupResult.ok).toBe(false);
    if (dupResult.ok) return;
    expect(dupResult.error.code).toBe('mcp_duplicate_server');
  });

  it('McpRegistry 빈 이름/command 등록 시 에러', () => {
    const registry = new McpRegistry(logger);

    const emptyName = registry.register({ name: '', command: 'test', args: [], enabled: true });
    expect(emptyName.ok).toBe(false);

    const emptyCmd = registry.register({ name: 'valid', command: '', args: [], enabled: true });
    expect(emptyCmd.ok).toBe(false);
  });

  it('McpManager startServer → stopServer 라이프사이클', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('lifecycle-server'));

    const startResult = manager.startServer('lifecycle-server');
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) return;
    expect(startResult.value.status).toBe('running');
    expect(manager.getStatus('lifecycle-server')).toBe('running');

    const stopResult = manager.stopServer('lifecycle-server');
    expect(stopResult.ok).toBe(true);
    expect(manager.getStatus('lifecycle-server')).toBe('stopped');
  });

  it('McpManager 비활성 서버 시작 시 에러', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('disabled-server', false));

    const startResult = manager.startServer('disabled-server');
    expect(startResult.ok).toBe(false);
    if (startResult.ok) return;
    expect(startResult.error.code).toBe('mcp_server_disabled');
  });

  it('McpManager 미등록 서버 시작 시 에러', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const startResult = manager.startServer('nonexistent');
    expect(startResult.ok).toBe(false);
    if (startResult.ok) return;
    expect(startResult.error.code).toBe('mcp_server_not_found');
  });

  it('McpManager stopAll로 모든 서버 정지', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('server-a'));
    registry.register(createTestConfig('server-b'));

    manager.startServer('server-a');
    manager.startServer('server-b');

    expect(manager.getStatus('server-a')).toBe('running');
    expect(manager.getStatus('server-b')).toBe('running');

    const stopAllResult = manager.stopAll();
    expect(stopAllResult.ok).toBe(true);
    expect(manager.getStatus('server-a')).toBe('stopped');
    expect(manager.getStatus('server-b')).toBe('stopped');
  });

  it('McpLoader로 임시 디렉토리에서 설정 로드', async () => {
    const loader = new McpLoader(logger);

    // 테스트 mcp.json 작성 / Write test mcp.json
    const serverDir = join(tmpDir, 'test-server');
    await mkdir(serverDir, { recursive: true });
    await Bun.write(
      join(serverDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'loaded-server', command: 'bun', args: ['run'], enabled: true },
        ],
      }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]?.name).toBe('loaded-server');
  });

  it('McpLoader loadAndMerge로 글로벌 + 프로젝트 설정 병합', async () => {
    const loader = new McpLoader(logger);

    // 글로벌 설정 / Global config
    const globalDir = join(tmpDir, 'global');
    const globalServerDir = join(globalDir, 'global-srv');
    await mkdir(globalServerDir, { recursive: true });
    await Bun.write(
      join(globalServerDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'shared', command: 'global-cmd', args: [], enabled: true },
          { name: 'global-only', command: 'global', args: [], enabled: true },
        ],
      }),
    );

    // 프로젝트 설정 (shared 오버라이드) / Project config (overrides shared)
    const projectDir = join(tmpDir, 'project');
    const projectServerDir = join(projectDir, 'proj-srv');
    await mkdir(projectServerDir, { recursive: true });
    await Bun.write(
      join(projectServerDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'shared', command: 'project-cmd', args: [], enabled: true },
        ],
      }),
    );

    const result = await loader.loadAndMerge(globalDir, projectDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // WHY: 프로젝트 설정이 글로벌을 오버라이드
    const shared = result.value.find((s) => s.name === 'shared');
    expect(shared?.command).toBe('project-cmd');

    const globalOnly = result.value.find((s) => s.name === 'global-only');
    expect(globalOnly).toBeDefined();
  });

  it('빌트인 서버 4개 자동 등록', () => {
    expect(BUILTIN_SERVERS.length).toBe(4);

    const registry = new McpRegistry(logger);
    for (const config of BUILTIN_SERVERS) {
      const result = registry.register(config);
      expect(result.ok).toBe(true);
    }

    const servers = registry.listServers();
    expect(servers.length).toBe(4);
  });

  it('McpManager healthCheck로 모든 서버 상태 확인', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('health-a'));
    registry.register(createTestConfig('health-b'));

    manager.startServer('health-a');

    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (!healthResult.ok) return;
    expect(healthResult.value['health-a']).toBe('running');
    expect(healthResult.value['health-b']).toBe('stopped');
  });

  it('McpManager initialize로 설정 로드 → 자동 레지스트리 등록', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    // 설정 파일 준비 / Prepare config files
    const configDir = join(tmpDir, 'init-test');
    const srvDir = join(configDir, 'auto-srv');
    await mkdir(srvDir, { recursive: true });
    await Bun.write(
      join(srvDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'auto-server', command: 'auto-cmd', args: ['--flag'], enabled: true },
        ],
      }),
    );

    const initResult = await manager.initialize(configDir);
    expect(initResult.ok).toBe(true);

    const server = registry.getServer('auto-server');
    expect(server).not.toBeNull();
    expect(server?.command).toBe('auto-cmd');
  });

  it('McpLoader path traversal 공격 감지', async () => {
    const loader = new McpLoader(logger);

    const result = await loader.loadFromDirectory('/tmp/../etc/passwd');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('mcp_path_traversal');
  });

  it('McpManager 이미 실행 중인 서버 재시작 시 에러', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('running-server'));
    manager.startServer('running-server');

    const reStartResult = manager.startServer('running-server');
    expect(reStartResult.ok).toBe(false);
    if (reStartResult.ok) return;
    expect(reStartResult.error.code).toBe('mcp_server_already_running');
  });
});
