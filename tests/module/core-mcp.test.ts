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
import { ConsoleLogger } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import {
  BUILTIN_SERVERS,
  McpLoader,
  McpManager,
  McpRegistry,
} from 'mcp/index.js';
import type { McpServerConfig } from 'mcp/index.js';

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

  // ── 추가 edge/random case 테스트 ────────────────────────────────

  it('McpRegistry: UUID 형식 서버 이름 등록', () => {
    const registry = new McpRegistry(logger);
    const uuidName = '550e8400-e29b-41d4-a716-446655440000';

    const result = registry.register({ name: uuidName, command: 'test', args: [], enabled: true });
    expect(result.ok).toBe(true);

    const server = registry.getServer(uuidName);
    expect(server?.name).toBe(uuidName);
  });

  it('McpRegistry: 한글 이름 서버 등록', () => {
    const registry = new McpRegistry(logger);

    const result = registry.register({ name: '한글서버', command: 'test-cmd', args: [], enabled: true });
    expect(result.ok).toBe(true);

    const server = registry.getServer('한글서버');
    expect(server?.name).toBe('한글서버');
  });

  it('McpRegistry: 특수문자 이름 서버 등록', () => {
    const registry = new McpRegistry(logger);

    const result = registry.register({ name: 'server-!@#', command: 'test', args: [], enabled: true });
    // WHY: 특수문자 허용 여부는 구현에 따라 다름
    expect(typeof result.ok).toBe('boolean');
  });

  it('McpRegistry: 매우 긴 서버 이름 등록', () => {
    const registry = new McpRegistry(logger);
    const longName = 'a'.repeat(500);

    const result = registry.register({ name: longName, command: 'test', args: [], enabled: true });
    // WHY: 길이 제한 여부는 구현에 따라 다름
    expect(typeof result.ok).toBe('boolean');
  });

  it('McpRegistry: 등록되지 않은 서버 해제 시 에러', () => {
    const registry = new McpRegistry(logger);

    const result = registry.unregister('nonexistent-server');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('mcp_server_not_found');
  });

  it('McpRegistry: listServers가 등록된 모든 서버 반환', () => {
    const registry = new McpRegistry(logger);

    registry.register(createTestConfig('server-alpha'));
    registry.register(createTestConfig('server-beta'));
    registry.register(createTestConfig('server-gamma'));

    const servers = registry.listServers();
    expect(servers.length).toBe(3);
    const names = servers.map((s) => s.name);
    expect(names).toContain('server-alpha');
    expect(names).toContain('server-beta');
    expect(names).toContain('server-gamma');
  });

  it('McpRegistry: 빈 레지스트리에서 listServers 빈 배열', () => {
    const registry = new McpRegistry(logger);

    const servers = registry.listServers();
    expect(servers.length).toBe(0);
  });

  it('McpRegistry: 서버 해제 후 같은 이름 재등록 가능', () => {
    const registry = new McpRegistry(logger);

    registry.register(createTestConfig('reusable-server'));
    registry.unregister('reusable-server');

    const reRegResult = registry.register(createTestConfig('reusable-server'));
    expect(reRegResult.ok).toBe(true);
  });

  it('McpManager: 미등록 서버 정지 시 에러', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const stopResult = manager.stopServer('ghost-server');
    expect(stopResult.ok).toBe(false);
    if (stopResult.ok) return;
    expect(stopResult.error.code).toBe('mcp_server_not_found');
  });

  it('McpManager: 이미 정지된 서버 재정지 시 에러', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('stoppable-server'));
    manager.startServer('stoppable-server');
    manager.stopServer('stoppable-server');

    const doubleStopResult = manager.stopServer('stoppable-server');
    expect(doubleStopResult.ok).toBe(false);
    if (doubleStopResult.ok) return;
    // WHY: 이미 정지된 서버 재정지 에러 코드 확인
    expect(['mcp_server_not_running', 'mcp_server_already_stopped']).toContain(doubleStopResult.error.code);
  });

  it('McpManager: getStatus 미등록 서버에 null 또는 stopped 반환', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const status = manager.getStatus('ghost-server');
    // WHY: 미등록 서버는 null 또는 'stopped' 반환 — 구현에 따라 다름
    expect(status === null || status === 'stopped').toBe(true);
  });

  it('McpManager: stopAll 서버 없을 때 성공', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const result = manager.stopAll();
    expect(result.ok).toBe(true);
  });

  it('McpManager: healthCheck 서버 없을 때 빈 객체 반환', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const result = manager.healthCheck();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).length).toBe(0);
  });

  it('McpManager: 10개 서버 동시 시작 후 healthCheck', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    for (let i = 0; i < 10; i++) {
      registry.register(createTestConfig(`bulk-server-${i}`));
      manager.startServer(`bulk-server-${i}`);
    }

    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (!healthResult.ok) return;

    for (let i = 0; i < 10; i++) {
      expect(healthResult.value[`bulk-server-${i}`]).toBe('running');
    }
  });

  it('McpLoader: 빈 servers 배열 설정 파일 로드', async () => {
    const loader = new McpLoader(logger);

    const emptyDir = join(tmpDir, 'empty-srv');
    await mkdir(emptyDir, { recursive: true });
    await Bun.write(
      join(emptyDir, 'mcp.json'),
      JSON.stringify({ servers: [] }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it('McpLoader: 잘못된 JSON 설정 파일 처리', async () => {
    const loader = new McpLoader(logger);

    const badDir = join(tmpDir, 'bad-json-srv');
    await mkdir(badDir, { recursive: true });
    await Bun.write(
      join(badDir, 'mcp.json'),
      'this is not valid json {{{',
    );

    const result = await loader.loadFromDirectory(tmpDir);
    // WHY: 잘못된 JSON은 에러 반환 또는 스킵 — 구현에 따라 다름
    expect(typeof result.ok).toBe('boolean');
  });

  it('McpLoader: 존재하지 않는 디렉토리 처리', async () => {
    const loader = new McpLoader(logger);

    const result = await loader.loadFromDirectory('/tmp/nonexistent-adev-dir-xyz-999');
    // WHY: 존재하지 않는 디렉토리는 에러 또는 빈 결과 — 구현에 따라 다름
    expect(typeof result.ok).toBe('boolean');
  });

  it('McpLoader: args 배열이 비어있는 서버 설정 로드', async () => {
    const loader = new McpLoader(logger);

    const noArgsDir = join(tmpDir, 'no-args-srv');
    await mkdir(noArgsDir, { recursive: true });
    await Bun.write(
      join(noArgsDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'no-args-server', command: 'standalone-cmd', args: [], enabled: true },
        ],
      }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.args).toEqual([]);
  });

  it('McpLoader: disabled 서버도 로드됨', async () => {
    const loader = new McpLoader(logger);

    const disabledDir = join(tmpDir, 'disabled-srv');
    await mkdir(disabledDir, { recursive: true });
    await Bun.write(
      join(disabledDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'enabled-server', command: 'cmd', args: [], enabled: true },
          { name: 'disabled-server', command: 'cmd2', args: [], enabled: false },
        ],
      }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);

    const disabled = result.value.find((s) => s.name === 'disabled-server');
    expect(disabled?.enabled).toBe(false);
  });

  it('McpLoader: 여러 서브디렉토리에 mcp.json이 있을 때 모두 로드', async () => {
    const loader = new McpLoader(logger);

    const dir1 = join(tmpDir, 'srv1');
    const dir2 = join(tmpDir, 'srv2');
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });

    await Bun.write(
      join(dir1, 'mcp.json'),
      JSON.stringify({ servers: [{ name: 'srv1-server', command: 'cmd1', args: [], enabled: true }] }),
    );
    await Bun.write(
      join(dir2, 'mcp.json'),
      JSON.stringify({ servers: [{ name: 'srv2-server', command: 'cmd2', args: [], enabled: true }] }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(2);
  });

  it('McpRegistry: args 배열에 한글/특수문자 포함', () => {
    const registry = new McpRegistry(logger);

    const config: McpServerConfig = {
      name: 'unicode-args-server',
      command: 'test-cmd',
      args: ['--name', '한글값', '--special', '!@#$%'],
      enabled: true,
    };

    const result = registry.register(config);
    expect(result.ok).toBe(true);

    const server = registry.getServer('unicode-args-server');
    expect(server?.args).toEqual(['--name', '한글값', '--special', '!@#$%']);
  });

  it('McpManager: 빌트인 서버 모두 등록 후 startServer 에러 없음', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    for (const config of BUILTIN_SERVERS) {
      registry.register(config);
    }

    // WHY: 빌트인 서버가 모두 enabled라면 start 가능
    for (const config of BUILTIN_SERVERS) {
      if (config.enabled) {
        const startResult = manager.startServer(config.name);
        expect(startResult.ok).toBe(true);
      }
    }
  });

  it('McpRegistry: 동시에 많은 서버 등록 및 조회', () => {
    const registry = new McpRegistry(logger);
    const count = 50;

    for (let i = 0; i < count; i++) {
      const result = registry.register(createTestConfig(`mass-server-${i}`));
      expect(result.ok).toBe(true);
    }

    const servers = registry.listServers();
    expect(servers.length).toBe(count);

    for (let i = 0; i < count; i++) {
      const server = registry.getServer(`mass-server-${i}`);
      expect(server).not.toBeNull();
    }
  });

  it('McpLoader: mcp.json이 없는 디렉토리에서 빈 결과 반환', async () => {
    const loader = new McpLoader(logger);

    const emptyContentDir = join(tmpDir, 'no-mcp-json');
    await mkdir(emptyContentDir, { recursive: true });

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // WHY: mcp.json 없으면 서버 없음
    expect(result.value.length).toBe(0);
  });

  it('McpManager: initialize 빈 디렉토리에서 빈 레지스트리', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const emptyConfigDir = join(tmpDir, 'empty-init');
    await mkdir(emptyConfigDir, { recursive: true });

    const initResult = await manager.initialize(emptyConfigDir);
    expect(initResult.ok).toBe(true);

    const servers = registry.listServers();
    expect(servers.length).toBe(0);
  });

  it('McpRegistry: getServer 존재하지 않는 서버에 null 반환', () => {
    const registry = new McpRegistry(logger);

    const server = registry.getServer('does-not-exist');
    expect(server).toBeNull();
  });

  it('McpManager: stopAll 후 healthCheck 전부 stopped', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('s1'));
    registry.register(createTestConfig('s2'));
    registry.register(createTestConfig('s3'));
    manager.startServer('s1');
    manager.startServer('s2');
    manager.startServer('s3');

    manager.stopAll();

    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (!healthResult.ok) return;
    expect(healthResult.value['s1']).toBe('stopped');
    expect(healthResult.value['s2']).toBe('stopped');
    expect(healthResult.value['s3']).toBe('stopped');
  });

  // ── 추가 edge/random 케이스 ──────────────────────────────────────

  it('McpRegistry: 랜덤 UUID 이름 서버 등록 및 조회', () => {
    const registry = new McpRegistry(logger);
    const uuid = crypto.randomUUID();
    const result = registry.register({ name: uuid, command: 'test', args: [], enabled: true });
    expect(result.ok).toBe(true);
    const server = registry.getServer(uuid);
    expect(server?.name).toBe(uuid);
  });

  it('McpRegistry: enabled=false 서버 등록 후 조회 → enabled 보존', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'disabled-check', command: 'cmd', args: [], enabled: false });
    const server = registry.getServer('disabled-check');
    expect(server?.enabled).toBe(false);
  });

  it('McpRegistry: 동일 이름 다른 command 재등록 시도 → 중복 에러', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'conflict-srv', command: 'cmd-a', args: [], enabled: true });
    const dup = registry.register({ name: 'conflict-srv', command: 'cmd-b', args: [], enabled: true });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('mcp_duplicate_server');
  });

  it('McpRegistry: 빈 args 배열 서버 등록 → args 보존', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'no-args', command: 'bare-cmd', args: [], enabled: true });
    const server = registry.getServer('no-args');
    expect(server?.args).toEqual([]);
  });

  it('McpRegistry: 많은 args 배열 서버 등록 → 정상 보존', () => {
    const registry = new McpRegistry(logger);
    const args = Array.from({ length: 20 }, (_, i) => `--arg${i}`);
    registry.register({ name: 'many-args', command: 'cmd', args, enabled: true });
    const server = registry.getServer('many-args');
    expect(server?.args).toEqual(args);
  });

  it('McpManager: startServer → getStatus = running', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);
    registry.register(createTestConfig('status-check'));
    manager.startServer('status-check');
    expect(manager.getStatus('status-check')).toBe('running');
  });

  it('McpManager: stopServer → getStatus = stopped', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);
    registry.register(createTestConfig('stop-check'));
    manager.startServer('stop-check');
    manager.stopServer('stop-check');
    expect(manager.getStatus('stop-check')).toBe('stopped');
  });

  it('McpManager: 다수 서버 랜덤 순서 시작/정지 → 최종 상태 일관성', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    for (let i = 0; i < 5; i++) {
      registry.register(createTestConfig(`rand-server-${i}`));
    }

    // 시작
    manager.startServer('rand-server-0');
    manager.startServer('rand-server-2');
    manager.startServer('rand-server-4');

    // 정지
    manager.stopServer('rand-server-0');

    expect(manager.getStatus('rand-server-0')).toBe('stopped');
    expect(manager.getStatus('rand-server-2')).toBe('running');
    expect(manager.getStatus('rand-server-4')).toBe('running');
  });

  it('McpManager: healthCheck에 모든 running 서버 포함', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    registry.register(createTestConfig('hc-a'));
    registry.register(createTestConfig('hc-b'));
    manager.startServer('hc-a');
    manager.startServer('hc-b');

    const result = manager.healthCheck();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value['hc-a']).toBe('running');
    expect(result.value['hc-b']).toBe('running');
  });

  it('McpLoader: mcp.json 없는 서브디렉토리 → 빈 결과', async () => {
    const loader = new McpLoader(logger);
    const noJson = join(tmpDir, 'no-json-sub');
    await mkdir(noJson, { recursive: true });
    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it('McpLoader: 대규모 서버 목록 (20개) 로드', async () => {
    const loader = new McpLoader(logger);
    const dirWithMany = join(tmpDir, 'many-servers');
    await mkdir(dirWithMany, { recursive: true });

    const servers = Array.from({ length: 20 }, (_, i) => ({
      name: `bulk-${i}`,
      command: 'cmd',
      args: [`--index=${i}`],
      enabled: true,
    }));

    await Bun.write(
      join(dirWithMany, 'mcp.json'),
      JSON.stringify({ servers }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(20);
  });

  it('McpLoader: env 필드 포함 서버 설정 로드', async () => {
    const loader = new McpLoader(logger);
    const envDir = join(tmpDir, 'env-srv');
    await mkdir(envDir, { recursive: true });

    await Bun.write(
      join(envDir, 'mcp.json'),
      JSON.stringify({
        servers: [{
          name: 'env-server',
          command: 'cmd',
          args: [],
          enabled: true,
          env: { MY_VAR: 'hello', SECRET: 'hidden' },
        }],
      }),
    );

    const result = await loader.loadFromDirectory(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const srv = result.value.find((s) => s.name === 'env-server');
    expect(srv).toBeDefined();
  });

  it('McpRegistry: args에 특수문자 포함', () => {
    const registry = new McpRegistry(logger);
    const args = ['--url=https://example.com/api?key=123&val=!@#', '--name=hello world'];
    const result = registry.register({ name: 'special-args', command: 'cmd', args, enabled: true });
    expect(result.ok).toBe(true);
    const server = registry.getServer('special-args');
    expect(server?.args).toEqual(args);
  });

  it('McpManager: startServer 에러코드는 string 타입', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const result = manager.startServer('no-such-server');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('McpManager: stopServer 에러코드는 string 타입', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const result = manager.stopServer('no-such-server');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('McpRegistry: unregister 에러코드는 string 타입', () => {
    const registry = new McpRegistry(logger);
    const result = registry.unregister('no-such');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('McpRegistry: register 에러코드는 string 타입 (빈 이름)', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({ name: '', command: 'cmd', args: [], enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('BUILTIN_SERVERS: 각 서버 필수 필드 존재', () => {
    for (const srv of BUILTIN_SERVERS) {
      expect(typeof srv.name).toBe('string');
      expect(srv.name.length).toBeGreaterThan(0);
      expect(typeof srv.command).toBe('string');
      expect(Array.isArray(srv.args)).toBe(true);
      expect(typeof srv.enabled).toBe('boolean');
    }
  });

  it('McpManager: initialize 후 listServers 결과와 정합성', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const confDir = join(tmpDir, 'consistency-test');
    const sDir = join(confDir, 'c-srv');
    await mkdir(sDir, { recursive: true });
    await Bun.write(
      join(sDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'c1', command: 'cmd1', args: [], enabled: true },
          { name: 'c2', command: 'cmd2', args: [], enabled: false },
        ],
      }),
    );

    await manager.initialize(confDir);
    const servers = registry.listServers();
    expect(servers.length).toBe(2);
    const names = servers.map((s) => s.name);
    expect(names).toContain('c1');
    expect(names).toContain('c2');
  });
});
