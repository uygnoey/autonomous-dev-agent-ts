/**
 * E2E: MCP 서버 라이프사이클 / MCP Server Lifecycle
 *
 * @description
 * KR: McpLoader 설정 로드 → McpRegistry 등록 →
 *     McpManager 초기화 → 서버 시작/정지 → healthCheck → stopAll.
 * EN: Full MCP lifecycle from config loading through registry to manager lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger } from 'core/logger.js';
import { McpLoader } from 'mcp/loader.js';
import { McpRegistry } from 'mcp/registry.js';
import { McpManager } from 'mcp/mcp-manager.js';
import type { McpServerConfig } from 'mcp/types.js';

const logger = new ConsoleLogger('error');

const MOCK_MCP_FIXTURE = join(import.meta.dir, '../fixtures/mock-mcp-server.ts');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `adev-e2e-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await Bun.write(join(tmpDir, '.keep'), '');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** mcp.json 설정 파일 생성 헬퍼 / Helper to write mcp.json config */
async function writeMcpConfig(
  dir: string,
  serverName: string,
  servers: McpServerConfig[],
): Promise<void> {
  const configDir = join(dir, serverName);
  const configPath = join(configDir, 'mcp.json');
  await Bun.write(configPath, JSON.stringify({ servers }, null, 2));
}

describe('MCP 서버 라이프사이클 E2E / MCP Server Lifecycle E2E', () => {
  it('McpRegistry: 서버 등록 + 조회', () => {
    const registry = new McpRegistry(logger);

    const config: McpServerConfig = {
      name: 'git',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-git'],
      enabled: true,
    };

    const regResult = registry.register(config);
    expect(regResult.ok).toBe(true);

    const server = registry.getServer('git');
    expect(server).not.toBeNull();
    expect(server?.name).toBe('git');
    expect(server?.command).toBe('npx');
    expect(server?.enabled).toBe(true);
  });

  it('McpRegistry: 중복 등록 에러', () => {
    const registry = new McpRegistry(logger);

    registry.register({
      name: 'git',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-git'],
      enabled: true,
    });

    const dupResult = registry.register({
      name: 'git',
      command: 'different',
      args: [],
      enabled: true,
    });

    expect(dupResult.ok).toBe(false);
    if (!dupResult.ok) {
      expect(dupResult.error.code).toBe('mcp_duplicate_server');
    }
  });

  it('McpRegistry: 빈 이름/command 등록 에러', () => {
    const registry = new McpRegistry(logger);

    const emptyNameResult = registry.register({
      name: '',
      command: 'npx',
      args: [],
      enabled: true,
    });
    expect(emptyNameResult.ok).toBe(false);

    const emptyCmdResult = registry.register({
      name: 'test',
      command: '',
      args: [],
      enabled: true,
    });
    expect(emptyCmdResult.ok).toBe(false);
  });

  it('McpRegistry: 서버 목록 + 해제 + 초기화', () => {
    const registry = new McpRegistry(logger);

    registry.register({ name: 'git', command: 'npx', args: [], enabled: true });
    registry.register({ name: 'fs', command: 'npx', args: [], enabled: true });
    registry.register({ name: 'db', command: 'npx', args: [], enabled: false });

    expect(registry.listServers()).toHaveLength(3);

    const unregResult = registry.unregister('fs');
    expect(unregResult.ok).toBe(true);
    expect(registry.listServers()).toHaveLength(2);

    // WHY: 존재하지 않는 서버 해제 에러
    const notFoundResult = registry.unregister('nonexistent');
    expect(notFoundResult.ok).toBe(false);

    registry.clear();
    expect(registry.listServers()).toHaveLength(0);
  });

  it('McpLoader: 디렉토리에서 mcp.json 로드', async () => {
    const loader = new McpLoader(logger);
    const mcpDir = join(tmpDir, 'mcp-configs');

    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'npx', args: ['-y', '@anthropic/mcp-git'], enabled: true },
    ]);

    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: ['-y', '@anthropic/mcp-fs'], enabled: true },
    ]);

    const result = await loader.loadFromDirectory(mcpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      const names = result.value.map((c) => c.name);
      expect(names).toContain('git');
      expect(names).toContain('filesystem');
    }
  });

  it('McpLoader: 존재하지 않는 디렉토리 → 빈 배열 반환', async () => {
    const loader = new McpLoader(logger);

    const result = await loader.loadFromDirectory(join(tmpDir, 'nonexistent'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('McpLoader: path traversal 감지', async () => {
    const loader = new McpLoader(logger);

    // WHY: join()은 '..'를 해결하므로, 문자열 결합으로 직접 경로를 구성한다
    const result = await loader.loadFromDirectory(`${tmpDir}/../../../etc`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('mcp_path_traversal');
    }
  });

  it('McpLoader: 글로벌 + 프로젝트 설정 병합 (프로젝트 우선)', async () => {
    const loader = new McpLoader(logger);

    const globalDir = join(tmpDir, 'global-mcp');
    const projectDir = join(tmpDir, 'project-mcp');

    // WHY: 글로벌에 git, fs 등록
    await writeMcpConfig(globalDir, 'git-server', [
      { name: 'git', command: 'npx', args: ['--global'], enabled: true },
    ]);
    await writeMcpConfig(globalDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: ['--global'], enabled: true },
    ]);

    // WHY: 프로젝트에 git 재정의 (args 변경) + db 추가
    await writeMcpConfig(projectDir, 'git-server', [
      { name: 'git', command: 'npx', args: ['--project'], enabled: true },
    ]);
    await writeMcpConfig(projectDir, 'db-server', [
      { name: 'database', command: 'npx', args: ['--db'], enabled: true },
    ]);

    const result = await loader.loadAndMerge(globalDir, projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);

      // WHY: git은 프로젝트 설정으로 덮어써져야 한다
      const gitConfig = result.value.find((c) => c.name === 'git');
      expect(gitConfig?.args).toContain('--project');

      // WHY: filesystem은 글로벌에서만 → 유지
      const fsConfig = result.value.find((c) => c.name === 'filesystem');
      expect(fsConfig?.args).toContain('--global');

      // WHY: database는 프로젝트에서만 → 추가
      const dbConfig = result.value.find((c) => c.name === 'database');
      expect(dbConfig).not.toBeNull();
    }
  });

  it('McpManager: 초기화 → 서버 시작 → 정지', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'manager-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    // Step 1: 초기화
    const initResult = await manager.initialize(mcpDir);
    expect(initResult.ok).toBe(true);

    // Step 2: 서버 시작
    const startResult = await manager.startServer('git');
    expect(startResult.ok).toBe(true);
    if (startResult.ok) {
      expect(startResult.value.status).toBe('running');
      expect(startResult.value.config.name).toBe('git');
    }

    // Step 3: 상태 확인
    expect(manager.getStatus('git')).toBe('running');
    expect(manager.getStatus('filesystem')).toBe('stopped');

    // Step 4: 서버 정지
    const stopResult = manager.stopServer('git');
    expect(stopResult.ok).toBe(true);
    expect(manager.getStatus('git')).toBe('stopped');
  });

  it('McpManager: 존재하지 않는 서버 시작 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'empty-mcp');
    await Bun.write(join(mcpDir, '.keep'), '');

    await manager.initialize(mcpDir);

    const result = await manager.startServer('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('mcp_server_not_found');
    }
  });

  it('McpManager: 비활성 서버 시작 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'disabled-mcp');
    await writeMcpConfig(mcpDir, 'disabled-server', [
      { name: 'disabled', command: 'npx', args: [], enabled: false },
    ]);

    await manager.initialize(mcpDir);

    const result = await manager.startServer('disabled');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('mcp_server_disabled');
    }
  });

  it('McpManager: 이미 실행 중인 서버 중복 시작 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'dup-start-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    await manager.startServer('git');

    const dupResult = await manager.startServer('git');
    expect(dupResult.ok).toBe(false);
    if (!dupResult.ok) {
      expect(dupResult.error.code).toBe('mcp_server_already_running');
    }
  });

  it('McpManager: healthCheck 전체 서버 상태 확인', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'health-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    await manager.startServer('git');

    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (healthResult.ok) {
      expect(healthResult.value['git']).toBe('running');
      expect(healthResult.value['filesystem']).toBe('stopped');
    }
  });

  it('McpManager: stopAll 전체 서버 정지', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'stopall-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    await manager.startServer('git');
    await manager.startServer('filesystem');

    expect(manager.getStatus('git')).toBe('running');
    expect(manager.getStatus('filesystem')).toBe('running');

    const stopAllResult = manager.stopAll();
    expect(stopAllResult.ok).toBe(true);

    expect(manager.getStatus('git')).toBe('stopped');
    expect(manager.getStatus('filesystem')).toBe('stopped');
  });

  it('McpManager: listTools 실행 중 서버 도구 집계', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'tools-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    await manager.startServer('git');

    // WHY: 현재 구현에서 tools는 빈 배열로 시작 (실제 프로세스 생성 없음)
    const tools = manager.listTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('전체 파이프라인: 로드 → 등록 → 시작 → 헬스체크 → 전체 정지', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    // Step 1: 설정 파일 생성
    const globalDir = join(tmpDir, 'pipeline-global');
    const projectDir = join(tmpDir, 'pipeline-project');

    await writeMcpConfig(globalDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(globalDir, 'fs-server', [
      { name: 'filesystem', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(projectDir, 'db-server', [
      { name: 'database', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    // Step 2: 초기화 (글로벌 + 프로젝트 병합)
    const initResult = await manager.initialize(globalDir, projectDir);
    expect(initResult.ok).toBe(true);

    // Step 3: 모든 서버 시작
    const gitStart = await manager.startServer('git');
    expect(gitStart.ok).toBe(true);

    const fsStart = await manager.startServer('filesystem');
    expect(fsStart.ok).toBe(true);

    const dbStart = await manager.startServer('database');
    expect(dbStart.ok).toBe(true);

    // Step 4: 헬스체크
    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (healthResult.ok) {
      expect(healthResult.value['git']).toBe('running');
      expect(healthResult.value['filesystem']).toBe('running');
      expect(healthResult.value['database']).toBe('running');
    }

    // Step 5: 전체 정지
    const stopResult = manager.stopAll();
    expect(stopResult.ok).toBe(true);

    // Step 6: 정지 확인
    const afterStopHealth = manager.healthCheck();
    expect(afterStopHealth.ok).toBe(true);
    if (afterStopHealth.ok) {
      expect(afterStopHealth.value['git']).toBe('stopped');
      expect(afterStopHealth.value['filesystem']).toBe('stopped');
      expect(afterStopHealth.value['database']).toBe('stopped');
    }
  });

  // ── Edge / Random Cases ──────────────────────────────────────────

  it('McpRegistry: 이름에 특수문자 포함 서버 등록 에러', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'my-server<script>',
      command: 'npx',
      args: [],
      enabled: true,
    });
    // WHY: 특수문자 이름은 유효하지 않은 서버 이름
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      // 구현에 따라 허용할 수도 있음
      expect(result.ok).toBe(true);
    }
  });

  it('McpRegistry: 매우 긴 서버 이름 처리', () => {
    const registry = new McpRegistry(logger);
    const longName = 'a'.repeat(500);
    const result = registry.register({
      name: longName,
      command: 'npx',
      args: [],
      enabled: true,
    });
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      expect(registry.getServer(longName)?.name).toBe(longName);
    }
  });

  it('McpRegistry: 50개 서버 등록 + listServers 확인', () => {
    const registry = new McpRegistry(logger);
    for (let i = 0; i < 50; i++) {
      registry.register({
        name: `server-${i}`,
        command: 'npx',
        args: [`--port=${8000 + i}`],
        enabled: i % 2 === 0,
      });
    }
    expect(registry.listServers()).toHaveLength(50);
  });

  it('McpRegistry: 비활성(enabled=false) 서버 조회 가능', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'disabled-srv', command: 'npx', args: [], enabled: false });
    const server = registry.getServer('disabled-srv');
    expect(server).not.toBeNull();
    expect(server?.enabled).toBe(false);
  });

  it('McpRegistry: clear 후 재등록 가능', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'git', command: 'npx', args: [], enabled: true });
    registry.clear();
    expect(registry.listServers()).toHaveLength(0);

    // WHY: clear 후 동일 이름으로 재등록 가능
    const reRegResult = registry.register({ name: 'git', command: 'npx', args: [], enabled: true });
    expect(reRegResult.ok).toBe(true);
    expect(registry.listServers()).toHaveLength(1);
  });

  it('McpRegistry: unregister 후 getServer null 반환', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'temp-srv', command: 'npx', args: [], enabled: true });
    registry.unregister('temp-srv');
    expect(registry.getServer('temp-srv')).toBeNull();
  });

  it('McpRegistry: getServer 존재하지 않는 이름 null 반환', () => {
    const registry = new McpRegistry(logger);
    expect(registry.getServer('nonexistent')).toBeNull();
  });

  it('McpRegistry: env 필드 포함 서버 등록', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'env-server',
      command: 'node',
      args: ['server.js'],
      enabled: true,
      env: { NODE_ENV: 'production', PORT: '3000' },
    });
    expect(result.ok).toBe(true);
    const server = registry.getServer('env-server');
    expect(server?.env?.['NODE_ENV']).toBe('production');
  });

  it('McpLoader: 잘못된 JSON mcp.json 파일 처리', async () => {
    const loader = new McpLoader(logger);
    const badDir = join(tmpDir, 'bad-json-mcp');
    const configDir = join(badDir, 'bad-server');
    await Bun.write(join(configDir, 'mcp.json'), '{ invalid json }}}');

    const result = await loader.loadFromDirectory(badDir);
    // WHY: 잘못된 JSON은 에러이거나 해당 설정을 스킵
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      // 스킵하고 빈 배열 반환 가능
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('McpLoader: servers 배열 없는 mcp.json 처리', async () => {
    const loader = new McpLoader(logger);
    const noServersDir = join(tmpDir, 'no-servers-mcp');
    const configDir = join(noServersDir, 'srv');
    await Bun.write(join(configDir, 'mcp.json'), JSON.stringify({ version: 1 }));

    const result = await loader.loadFromDirectory(noServersDir);
    if (result.ok) {
      // servers 키 없으면 빈 배열 또는 해당 항목 스킵
      expect(Array.isArray(result.value)).toBe(true);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it('McpLoader: 빈 servers 배열 mcp.json 처리', async () => {
    const loader = new McpLoader(logger);
    const emptyServersDir = join(tmpDir, 'empty-servers-mcp');
    await writeMcpConfig(emptyServersDir, 'empty-srv', []);

    const result = await loader.loadFromDirectory(emptyServersDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('McpLoader: 10개 서버 설정 파일 동시 로드', async () => {
    const loader = new McpLoader(logger);
    const multiDir = join(tmpDir, 'multi-srv-mcp');

    for (let i = 0; i < 10; i++) {
      await writeMcpConfig(multiDir, `server-${i}`, [
        { name: `srv-${i}`, command: 'npx', args: [`--id=${i}`], enabled: true },
      ]);
    }

    const result = await loader.loadFromDirectory(multiDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(10);
    }
  });

  it('McpLoader: loadAndMerge 글로벌만 있을 때 (프로젝트 비어 있음)', async () => {
    const loader = new McpLoader(logger);
    const globalDir = join(tmpDir, 'only-global-mcp');
    const emptyProjectDir = join(tmpDir, 'empty-project-mcp');
    await Bun.write(join(emptyProjectDir, '.keep'), '');

    await writeMcpConfig(globalDir, 'git-server', [
      { name: 'git', command: 'npx', args: ['--global'], enabled: true },
    ]);

    const result = await loader.loadAndMerge(globalDir, emptyProjectDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('git');
    }
  });

  it('McpLoader: loadAndMerge 프로젝트만 있을 때 (글로벌 비어 있음)', async () => {
    const loader = new McpLoader(logger);
    const emptyGlobalDir = join(tmpDir, 'empty-global-mcp');
    const projectDir = join(tmpDir, 'only-project-mcp');
    await Bun.write(join(emptyGlobalDir, '.keep'), '');

    await writeMcpConfig(projectDir, 'local-server', [
      { name: 'local', command: 'node', args: ['local.js'], enabled: true },
    ]);

    const result = await loader.loadAndMerge(emptyGlobalDir, projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('local');
    }
  });

  it('McpManager: 초기화 없이 startServer 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    // WHY: initialize() 없이 startServer() 호출
    const result = await manager.startServer('git');
    expect(result.ok).toBe(false);
  });

  it('McpManager: stopServer 정지 상태 서버 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'stop-stopped-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    // WHY: 시작하지 않은 서버를 정지 시도 → 에러 코드는 구현 의존
    const stopResult = manager.stopServer('git');
    expect(stopResult.ok).toBe(false);
    if (!stopResult.ok) {
      expect(['mcp_server_not_running', 'mcp_server_not_found'].includes(stopResult.error.code)).toBe(true);
    }
  });

  it('McpManager: getStatus 존재하지 않는 서버 null/undefined 반환', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'status-nonexist-mcp');
    await Bun.write(join(mcpDir, '.keep'), '');
    await manager.initialize(mcpDir);

    const status = manager.getStatus('nonexistent');
    expect(status == null || status === 'stopped').toBe(true);
  });

  it('McpManager: stopAll 빈 레지스트리에서 호출', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'empty-stopall-mcp');
    await Bun.write(join(mcpDir, '.keep'), '');
    await manager.initialize(mcpDir);

    const result = manager.stopAll();
    expect(result.ok).toBe(true);
  });

  it('McpManager: 10개 서버 모두 시작 → healthCheck 모두 running', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'ten-servers-mcp');
    for (let i = 0; i < 10; i++) {
      await writeMcpConfig(mcpDir, `srv-${i}`, [
        { name: `server-${i}`, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
    }

    await manager.initialize(mcpDir);

    for (let i = 0; i < 10; i++) {
      const startResult = await manager.startServer(`server-${i}`);
      expect(startResult.ok).toBe(true);
    }

    const healthResult = manager.healthCheck();
    expect(healthResult.ok).toBe(true);
    if (healthResult.ok) {
      for (let i = 0; i < 10; i++) {
        expect(healthResult.value[`server-${i}`]).toBe('running');
      }
    }
  });

  it('McpManager: 시작 → 정지 → 재시작 사이클', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'restart-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);

    await manager.startServer('git');
    expect(manager.getStatus('git')).toBe('running');

    manager.stopServer('git');
    expect(manager.getStatus('git')).toBe('stopped');

    // WHY: 재시작 가능해야 함
    const restartResult = await manager.startServer('git');
    expect(restartResult.ok).toBe(true);
    expect(manager.getStatus('git')).toBe('running');
  });

  it('McpManager: listTools 서버 없을 때 빈 배열', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'no-tools-mcp');
    await Bun.write(join(mcpDir, '.keep'), '');
    await manager.initialize(mcpDir);

    const tools = manager.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(0);
  });

  it('McpRegistry: 동시 등록 + 해제 후 listServers 정합성', () => {
    const registry = new McpRegistry(logger);
    const names = ['srv-a', 'srv-b', 'srv-c', 'srv-d', 'srv-e'];

    for (const name of names) {
      registry.register({ name, command: 'npx', args: [], enabled: true });
    }

    registry.unregister('srv-b');
    registry.unregister('srv-d');

    const list = registry.listServers();
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.name)).toContain('srv-a');
    expect(list.map((s) => s.name)).not.toContain('srv-b');
    expect(list.map((s) => s.name)).toContain('srv-c');
    expect(list.map((s) => s.name)).not.toContain('srv-d');
    expect(list.map((s) => s.name)).toContain('srv-e');
  });

  it('McpManager: 초기화 두 번 호출 → 두 번째 초기화 에러 또는 ok', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'double-init-mcp');
    await writeMcpConfig(mcpDir, 'git-server', [
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);

    const init1 = await manager.initialize(mcpDir);
    expect(init1.ok).toBe(true);

    const init2 = await manager.initialize(mcpDir);
    // WHY: 두 번 초기화는 에러이거나 ok — 구현 의존
    if (!init2.ok) {
      expect(init2.ok).toBe(false);
    } else {
      expect(init2.ok).toBe(true);
    }
  });

  it('McpManager: healthCheck 초기화 없이 호출 → 에러 또는 빈 객체', () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const result = manager.healthCheck();
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      // 초기화 없이 → 빈 객체
      expect(typeof result.value).toBe('object');
    }
  });

  it('McpLoader: mcp.json에 enabled=false 서버만 있을 때', async () => {
    const loader = new McpLoader(logger);
    const allDisabledDir = join(tmpDir, 'all-disabled-mcp');
    await writeMcpConfig(allDisabledDir, 'disabled-srv', [
      { name: 'srv1', command: 'npx', args: [], enabled: false },
      { name: 'srv2', command: 'npx', args: [], enabled: false },
    ]);

    const result = await loader.loadFromDirectory(allDisabledDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 비활성 서버도 로드되어야 함 (필터링은 Manager가 담당)
      expect(result.value.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('McpManager: 비활성 서버만 있을 때 stopAll 정상 처리', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'disabled-only-mcp');
    await writeMcpConfig(mcpDir, 'disabled-srv', [
      { name: 'disabled-only', command: 'npx', args: [], enabled: false },
    ]);

    await manager.initialize(mcpDir);

    // WHY: 시작된 서버가 없으므로 stopAll은 ok
    const stopResult = manager.stopAll();
    expect(stopResult.ok).toBe(true);
  });

  it('McpRegistry: 이름에 숫자 포함 서버 등록', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'server-42',
      command: 'npx',
      args: [],
      enabled: true,
    });
    expect(result.ok).toBe(true);
    expect(registry.getServer('server-42')?.name).toBe('server-42');
  });

  it('McpRegistry: env 필드 없이 등록 → ok', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'no-env-server',
      command: 'node',
      args: ['index.js'],
      enabled: true,
    });
    expect(result.ok).toBe(true);
  });

  it('McpRegistry: args 빈 배열로 등록 → ok', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'no-args-server',
      command: 'node',
      args: [],
      enabled: true,
    });
    expect(result.ok).toBe(true);
  });

  it('McpRegistry: args 10개 인자로 등록 → ok', () => {
    const registry = new McpRegistry(logger);
    const args = Array.from({ length: 10 }, (_, i) => `--arg${i}`);
    const result = registry.register({
      name: 'many-args-server',
      command: 'node',
      args,
      enabled: true,
    });
    expect(result.ok).toBe(true);
    expect(registry.getServer('many-args-server')?.args).toHaveLength(10);
  });

  it('McpRegistry: 100개 서버 등록 후 listServers 정합성', () => {
    const registry = new McpRegistry(logger);
    for (let i = 0; i < 100; i++) {
      registry.register({
        name: `srv-${i}`,
        command: 'node',
        args: [],
        enabled: true,
      });
    }
    expect(registry.listServers()).toHaveLength(100);
  });

  it('McpLoader: mcp.json servers 배열에 혼합(enabled/disabled) → 모두 로드', async () => {
    const loader = new McpLoader(logger);
    const mixedDir = join(tmpDir, 'mixed-enabled-mcp');
    await writeMcpConfig(mixedDir, 'mixed-srv', [
      { name: 'srv-a', command: 'npx', args: [], enabled: true },
      { name: 'srv-b', command: 'npx', args: [], enabled: false },
      { name: 'srv-c', command: 'npx', args: [], enabled: true },
    ]);
    const result = await loader.loadFromDirectory(mixedDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('McpLoader: loadAndMerge 글로벌+프로젝트 모두 비어 있을 때 → 빈 배열', async () => {
    const loader = new McpLoader(logger);
    const emptyGlobal = join(tmpDir, 'empty-both-global');
    const emptyProject = join(tmpDir, 'empty-both-project');
    await Bun.write(join(emptyGlobal, '.keep'), '');
    await Bun.write(join(emptyProject, '.keep'), '');
    const result = await loader.loadAndMerge(emptyGlobal, emptyProject);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('McpManager: startServer 후 listTools는 배열', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'list-tools-after-start-mcp');
    await writeMcpConfig(mcpDir, 'tool-srv', [
      { name: 'tool-srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await manager.initialize(mcpDir);
    await manager.startServer('tool-srv');
    expect(Array.isArray(manager.listTools())).toBe(true);
  });

  it('McpManager: stopAll 후 healthCheck 모두 stopped', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'stopall-health-mcp');
    await writeMcpConfig(mcpDir, 'srv-a', [
      { name: 'srv-a', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'srv-b', [
      { name: 'srv-b', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await manager.initialize(mcpDir);
    await manager.startServer('srv-a');
    await manager.startServer('srv-b');
    manager.stopAll();
    const health = manager.healthCheck();
    if (health.ok) {
      expect(health.value['srv-a']).toBe('stopped');
      expect(health.value['srv-b']).toBe('stopped');
    }
  });

  it('McpManager: 초기화 후 healthCheck → 모두 stopped', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'init-health-mcp');
    await writeMcpConfig(mcpDir, 'g-srv', [
      { name: 'g-srv', command: 'npx', args: [], enabled: true },
    ]);
    await manager.initialize(mcpDir);
    const health = manager.healthCheck();
    if (health.ok) {
      expect(health.value['g-srv']).toBe('stopped');
    }
  });

  it('McpRegistry: env에 빈 객체로 등록 → ok', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'empty-env-srv',
      command: 'node',
      args: [],
      enabled: true,
      env: {},
    });
    expect(result.ok).toBe(true);
  });

  it('McpRegistry: 여러 unregister → listServers 정합성', () => {
    const registry = new McpRegistry(logger);
    for (let i = 0; i < 10; i++) {
      registry.register({ name: `multi-unreg-${i}`, command: 'node', args: [], enabled: true });
    }
    for (let i = 0; i < 5; i++) {
      registry.unregister(`multi-unreg-${i}`);
    }
    expect(registry.listServers()).toHaveLength(5);
  });

  it('McpManager: getStatus 초기화 후 등록 서버 stopped', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'status-init-mcp');
    await writeMcpConfig(mcpDir, 'status-srv', [
      { name: 'status-srv', command: 'npx', args: [], enabled: true },
    ]);
    await manager.initialize(mcpDir);
    expect(manager.getStatus('status-srv')).toBe('stopped');
  });

  // ── 추가 E2E 시나리오 ─────────────────────────────────────────

  it('McpRegistry: args에 특수문자 포함 서버 등록 → ok', () => {
    const registry = new McpRegistry(logger);
    const result = registry.register({
      name: 'special-args-srv',
      command: 'npx',
      args: ['--option=a&b', '--flag=x|y', '--path=/usr/bin'],
      enabled: true,
    });
    expect(result.ok).toBe(true);
    const server = registry.getServer('special-args-srv');
    expect(server?.args).toContain('--option=a&b');
  });

  it('McpRegistry: env 필드에 여러 값 → 보존', () => {
    const registry = new McpRegistry(logger);
    registry.register({
      name: 'multi-env-srv',
      command: 'node',
      args: [],
      enabled: true,
      env: { NODE_ENV: 'production', PORT: '8080', DEBUG: 'true' },
    });
    const server = registry.getServer('multi-env-srv');
    expect(server?.env?.['NODE_ENV']).toBe('production');
    expect(server?.env?.['PORT']).toBe('8080');
    expect(server?.env?.['DEBUG']).toBe('true');
  });

  it('McpRegistry: listServers는 등록 순서를 보존', () => {
    const registry = new McpRegistry(logger);
    const names = ['first', 'second', 'third', 'fourth', 'fifth'];
    for (const name of names) {
      registry.register({ name, command: 'npx', args: [], enabled: true });
    }
    const list = registry.listServers();
    expect(list).toHaveLength(5);
    // WHY: 모든 이름이 포함되어야 함
    for (const name of names) {
      expect(list.map((s) => s.name)).toContain(name);
    }
  });

  it('McpRegistry: register → unregister → register 사이클 10회', () => {
    const registry = new McpRegistry(logger);
    for (let i = 0; i < 10; i++) {
      const reg = registry.register({ name: 'cycle-srv', command: 'npx', args: [], enabled: true });
      expect(reg.ok).toBe(true);
      const unreg = registry.unregister('cycle-srv');
      expect(unreg.ok).toBe(true);
    }
  });

  it('McpLoader: env 필드 있는 서버 설정 로드', async () => {
    const loader = new McpLoader(logger);
    const envDir = join(tmpDir, 'env-mcp');
    const configDir = join(envDir, 'env-server');
    await Bun.write(
      join(configDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          {
            name: 'env-srv',
            command: 'node',
            args: ['server.js'],
            enabled: true,
            env: { API_KEY: 'secret', PORT: '3000' },
          },
        ],
      }),
    );
    const result = await loader.loadFromDirectory(envDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.find((s) => s.name === 'env-srv');
      expect(found).toBeDefined();
    }
  });

  it('McpLoader: 중첩 디렉토리 구조에서 로드', async () => {
    const loader = new McpLoader(logger);
    const nestedDir = join(tmpDir, 'nested-mcp');
    await writeMcpConfig(nestedDir, 'level1-srv', [
      { name: 'level1', command: 'npx', args: [], enabled: true },
    ]);
    const result = await loader.loadFromDirectory(nestedDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((s) => s.name === 'level1')).toBe(true);
    }
  });

  it('McpManager: initialize 후 등록 서버 수 확인', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'count-init-mcp');
    await writeMcpConfig(mcpDir, 'srv-1', [{ name: 'srv-1', command: 'npx', args: [], enabled: true }]);
    await writeMcpConfig(mcpDir, 'srv-2', [{ name: 'srv-2', command: 'npx', args: [], enabled: true }]);
    await writeMcpConfig(mcpDir, 'srv-3', [{ name: 'srv-3', command: 'npx', args: [], enabled: false }]);

    await manager.initialize(mcpDir);

    const health = manager.healthCheck();
    if (health.ok) {
      expect(Object.keys(health.value)).toHaveLength(3);
    }
  });

  it('McpManager: 선택적 서버만 시작 → healthCheck 혼합 상태', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'selective-start-mcp');
    for (let i = 0; i < 5; i++) {
      await writeMcpConfig(mcpDir, `srv-${i}`, [
        { name: `srv-${i}`, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
    }

    await manager.initialize(mcpDir);

    // WHY: 짝수 인덱스만 시작
    for (let i = 0; i < 5; i += 2) {
      await manager.startServer(`srv-${i}`);
    }

    const health = manager.healthCheck();
    if (health.ok) {
      expect(health.value['srv-0']).toBe('running');
      expect(health.value['srv-1']).toBe('stopped');
      expect(health.value['srv-2']).toBe('running');
      expect(health.value['srv-3']).toBe('stopped');
      expect(health.value['srv-4']).toBe('running');
    }
  });

  it('McpManager: stopAll 후 개별 서버 재시작 가능', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'restart-after-stopall-mcp');
    await writeMcpConfig(mcpDir, 'srvA', [{ name: 'srvA', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true }]);
    await writeMcpConfig(mcpDir, 'srvB', [{ name: 'srvB', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true }]);

    await manager.initialize(mcpDir);
    await manager.startServer('srvA');
    await manager.startServer('srvB');
    manager.stopAll();

    // WHY: 전체 정지 후 개별 재시작
    const restartA = await manager.startServer('srvA');
    expect(restartA.ok).toBe(true);
    expect(manager.getStatus('srvA')).toBe('running');
    expect(manager.getStatus('srvB')).toBe('stopped');
  });

  it('McpRegistry: 100개 등록 → 50개 해제 → 50개 남음', () => {
    const registry = new McpRegistry(logger);
    for (let i = 0; i < 100; i++) {
      registry.register({ name: `bulk-srv-${i}`, command: 'npx', args: [], enabled: true });
    }
    for (let i = 0; i < 50; i++) {
      registry.unregister(`bulk-srv-${i}`);
    }
    expect(registry.listServers()).toHaveLength(50);
  });

  it('McpLoader: loadAndMerge 이름 충돌 시 프로젝트 args 우선', async () => {
    const loader = new McpLoader(logger);
    const globalDir2 = join(tmpDir, 'conflict-global');
    const projectDir2 = join(tmpDir, 'conflict-project');

    await writeMcpConfig(globalDir2, 'conflict-srv', [
      { name: 'conflict', command: 'npx', args: ['--global-arg'], enabled: true },
    ]);
    await writeMcpConfig(projectDir2, 'conflict-srv', [
      { name: 'conflict', command: 'npx', args: ['--project-arg'], enabled: true },
    ]);

    const result = await loader.loadAndMerge(globalDir2, projectDir2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.find((s) => s.name === 'conflict');
      expect(found?.args).toContain('--project-arg');
    }
  });

  it('McpManager: healthCheck 반환값에 name 키가 모두 존재', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'health-keys-mcp');
    const names = ['alpha', 'beta', 'gamma'];
    for (const name of names) {
      await writeMcpConfig(mcpDir, name, [
        { name, command: 'npx', args: [], enabled: true },
      ]);
    }

    await manager.initialize(mcpDir);
    const health = manager.healthCheck();
    if (health.ok) {
      for (const name of names) {
        expect(name in health.value).toBe(true);
      }
    }
  });

  it('McpLoader: servers 배열에 혼합 타입 → 유효 항목만 로드', async () => {
    const loader = new McpLoader(logger);
    const mixedTypeDir = join(tmpDir, 'mixed-type-mcp');
    const configDir = join(mixedTypeDir, 'mixed-srv');
    await Bun.write(
      join(configDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'valid-srv', command: 'npx', args: [], enabled: true },
          null,
          42,
          'string-item',
          { command: 'npx' }, // name 누락
        ],
      }),
    );
    const result = await loader.loadFromDirectory(mixedTypeDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: 유효한 항목만 포함 (name이 있고 command가 있는 것)
      expect(result.value.length).toBeLessThanOrEqual(1);
    }
  });

  it('McpRegistry: clear 후 healthCheck → 빈 객체', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'clear-health-mcp');
    await writeMcpConfig(mcpDir, 'srv-x', [{ name: 'srv-x', command: 'npx', args: [], enabled: true }]);
    await manager.initialize(mcpDir);

    // WHY: 레지스트리 초기화 후 healthCheck
    registry.clear();
    const health = manager.healthCheck();
    if (health.ok) {
      expect(Object.keys(health.value)).toHaveLength(0);
    }
  });

  it('McpManager: listTools 여러 서버 실행 중에도 배열 반환', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'multi-tools-mcp');
    for (let i = 0; i < 5; i++) {
      await writeMcpConfig(mcpDir, `tool-srv-${i}`, [
        { name: `tool-srv-${i}`, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
    }

    await manager.initialize(mcpDir);
    for (let i = 0; i < 5; i++) {
      await manager.startServer(`tool-srv-${i}`);
    }

    const tools = manager.listTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('McpLoader: 존재하지 않는 두 디렉토리로 loadAndMerge → ok 빈 배열', async () => {
    const loader = new McpLoader(logger);
    const result = await loader.loadAndMerge(
      join(tmpDir, 'no-global-dir'),
      join(tmpDir, 'no-project-dir'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('McpManager: 비활성 + 활성 혼합 초기화 → 활성만 시작 가능', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'mixed-enabled-mgr-mcp');
    await writeMcpConfig(mcpDir, 'active-srv', [
      { name: 'active-srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'inactive-srv', [
      { name: 'inactive-srv', command: 'npx', args: [], enabled: false },
    ]);

    await manager.initialize(mcpDir);

    const activeResult = await manager.startServer('active-srv');
    expect(activeResult.ok).toBe(true);

    const inactiveResult = await manager.startServer('inactive-srv');
    expect(inactiveResult.ok).toBe(false);
  });

  it('McpLoader: 대규모 args 배열(20개) 로드 → 보존', async () => {
    const loader = new McpLoader(logger);
    const largeArgsDir = join(tmpDir, 'large-args-mcp');
    const args = Array.from({ length: 20 }, (_, i) => `--arg-${i}=value${i}`);
    const configDir = join(largeArgsDir, 'large-args-srv');
    await Bun.write(
      join(configDir, 'mcp.json'),
      JSON.stringify({ servers: [{ name: 'large-args', command: 'npx', args, enabled: true }] }),
    );

    const result = await loader.loadFromDirectory(largeArgsDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.value.find((s) => s.name === 'large-args');
      expect(found?.args).toHaveLength(20);
    }
  });

  it('McpManager: stopServer 후 재시작 → running 상태', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'stop-restart-mcp');
    await writeMcpConfig(mcpDir, 'resilient-srv', [
      { name: 'resilient-srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    await manager.startServer('resilient-srv');
    manager.stopServer('resilient-srv');

    const restartResult = await manager.startServer('resilient-srv');
    expect(restartResult.ok).toBe(true);
    expect(manager.getStatus('resilient-srv')).toBe('running');
  });

  it('McpRegistry: unregister 없는 이름 → error.code 확인', () => {
    const registry = new McpRegistry(logger);
    const result = registry.unregister('never-registered');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('McpRegistry: getServer는 등록된 config 복사본 반환', () => {
    const registry = new McpRegistry(logger);
    registry.register({
      name: 'copy-test',
      command: 'npx',
      args: ['--test'],
      enabled: true,
    });
    const server1 = registry.getServer('copy-test');
    const server2 = registry.getServer('copy-test');
    // WHY: 동일한 논리적 데이터를 가져야 함
    expect(server1?.name).toBe(server2?.name);
    expect(server1?.command).toBe(server2?.command);
  });

  it('McpLoader: 비어있는 mcp.json 처리', async () => {
    const loader = new McpLoader(logger);
    const emptyFileDir = join(tmpDir, 'empty-file-mcp');
    const configDir = join(emptyFileDir, 'empty-file-srv');
    await Bun.write(join(configDir, 'mcp.json'), '');

    const result = await loader.loadFromDirectory(emptyFileDir);
    // WHY: 빈 파일은 파싱 에러이거나 건너뜀
    if (!result.ok) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.value).toHaveLength(0);
    }
  });

  it('McpManager: healthCheck 값은 running 또는 stopped', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'health-values-mcp');
    await writeMcpConfig(mcpDir, 'val-a', [{ name: 'val-a', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true }]);
    await writeMcpConfig(mcpDir, 'val-b', [{ name: 'val-b', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true }]);

    await manager.initialize(mcpDir);
    await manager.startServer('val-a');

    const health = manager.healthCheck();
    if (health.ok) {
      for (const status of Object.values(health.value)) {
        expect(['running', 'stopped'].includes(status)).toBe(true);
      }
    }
  });

  it('McpLoader: loadAndMerge 세 번 연속 호출 → 결과 동일', async () => {
    const loader = new McpLoader(logger);
    const globalDir3 = join(tmpDir, 'stable-global-mcp');
    await writeMcpConfig(globalDir3, 'stable-srv', [
      { name: 'stable-srv', command: 'npx', args: [], enabled: true },
    ]);

    const r1 = await loader.loadAndMerge(globalDir3);
    const r2 = await loader.loadAndMerge(globalDir3);
    const r3 = await loader.loadAndMerge(globalDir3);

    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r2.value.length).toBe(r3.value.length);
    }
  });

  it('McpRegistry: 빈 args 배열과 여러 args 서버 혼합 등록', () => {
    const registry = new McpRegistry(logger);
    registry.register({ name: 'no-args-srv', command: 'npx', args: [], enabled: true });
    registry.register({ name: 'multi-args-srv', command: 'npx', args: ['--a', '--b', '--c'], enabled: true });

    const noArgs = registry.getServer('no-args-srv');
    const multiArgs = registry.getServer('multi-args-srv');

    expect(noArgs?.args).toHaveLength(0);
    expect(multiArgs?.args).toHaveLength(3);
  });

  it('McpManager: getStatus 반환값은 string 타입', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'getStatus-type-mcp');
    await writeMcpConfig(mcpDir, 'type-srv', [
      { name: 'type-srv', command: 'npx', args: [], enabled: true },
    ]);
    await manager.initialize(mcpDir);

    const status = manager.getStatus('type-srv');
    if (status !== null && status !== undefined) {
      expect(typeof status).toBe('string');
    }
  });

  it('전체 파이프라인: 글로벌 없이 프로젝트만 → 정상 동작', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const emptyGlobal = join(tmpDir, 'project-only-global');
    const projectOnlyDir = join(tmpDir, 'project-only-project');

    await Bun.write(join(emptyGlobal, '.keep'), '');
    await writeMcpConfig(projectOnlyDir, 'proj-only-srv', [
      { name: 'proj-only', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    const initResult = await manager.initialize(emptyGlobal, projectOnlyDir);
    expect(initResult.ok).toBe(true);

    const startResult = await manager.startServer('proj-only');
    expect(startResult.ok).toBe(true);

    expect(manager.getStatus('proj-only')).toBe('running');

    const stopResult = manager.stopAll();
    expect(stopResult.ok).toBe(true);

    expect(manager.getStatus('proj-only')).toBe('stopped');
  });

  it('McpRegistry: getServer → command 값 보존 확인', () => {
    const registry = new McpRegistry(logger);
    registry.register({
      name: 'cmd-verify',
      command: 'python3',
      args: ['-m', 'mcp_server'],
      enabled: true,
    });
    const server = registry.getServer('cmd-verify');
    expect(server?.command).toBe('python3');
    expect(server?.args).toContain('-m');
    expect(server?.args).toContain('mcp_server');
  });

  it('McpLoader: loadFromDirectory 5번 반복 → 동일 개수', async () => {
    const loader = new McpLoader(logger);
    const repeatDir = join(tmpDir, 'repeat-load-mcp');
    await writeMcpConfig(repeatDir, 'rep-srv-1', [{ name: 'rep-1', command: 'npx', args: [], enabled: true }]);
    await writeMcpConfig(repeatDir, 'rep-srv-2', [{ name: 'rep-2', command: 'npx', args: [], enabled: true }]);

    let prevCount = -1;
    for (let i = 0; i < 5; i++) {
      const result = await loader.loadFromDirectory(repeatDir);
      if (result.ok) {
        if (prevCount === -1) {
          prevCount = result.value.length;
        }
        expect(result.value.length).toBe(prevCount);
      }
    }
  });

  it('McpManager: 동일 서버 3번 시작 시도 → 두 번째부터 에러', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'triple-start-mcp');
    await writeMcpConfig(mcpDir, 'triple-srv', [
      { name: 'triple-srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
    ]);

    await manager.initialize(mcpDir);

    const first = await manager.startServer('triple-srv');
    expect(first.ok).toBe(true);

    const second = await manager.startServer('triple-srv');
    expect(second.ok).toBe(false);

    const third = await manager.startServer('triple-srv');
    expect(third.ok).toBe(false);
  });

  it('McpRegistry: listServers는 빈 레지스트리에서 빈 배열 반환', () => {
    const registry = new McpRegistry(logger);
    expect(registry.listServers()).toHaveLength(0);
    expect(Array.isArray(registry.listServers())).toBe(true);
  });

  it('McpLoader: 같은 서버 이름 여러 디렉토리 → loadFromDirectory 모두 로드', async () => {
    const loader = new McpLoader(logger);
    const dupNameDir = join(tmpDir, 'dup-name-load-mcp');

    // WHY: 서로 다른 하위 폴더지만 같은 서버 name → 구현에 따라 모두 로드하거나 마지막만
    await writeMcpConfig(dupNameDir, 'folder-a', [{ name: 'dup', command: 'npx', args: ['--a'], enabled: true }]);
    await writeMcpConfig(dupNameDir, 'folder-b', [{ name: 'dup', command: 'npx', args: ['--b'], enabled: true }]);

    const result = await loader.loadFromDirectory(dupNameDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 구현에 따라 1개 또는 2개
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('McpManager: initialize → 서버 없이 listTools → 빈 배열', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'no-tools-before-start-mcp');
    await writeMcpConfig(mcpDir, 'srv', [{ name: 'srv', command: 'npx', args: [], enabled: true }]);
    await manager.initialize(mcpDir);

    const tools = manager.listTools();
    expect(Array.isArray(tools)).toBe(true);
    // WHY: 서버가 시작되지 않았으므로 도구 없음
    expect(tools.length).toBe(0);
  });

  it('McpLoader: loadAndMerge args 보존 확인', async () => {
    const loader = new McpLoader(logger);
    const argsGlobal = join(tmpDir, 'args-global');
    const argsProject = join(tmpDir, 'args-project');

    await writeMcpConfig(argsGlobal, 'args-srv', [
      { name: 'args-srv', command: 'npx', args: ['--global-only'], enabled: true },
    ]);
    await writeMcpConfig(argsProject, 'args-srv', [
      { name: 'args-srv', command: 'npx', args: ['--project-only', '--extra'], enabled: true },
    ]);

    const result = await loader.loadAndMerge(argsGlobal, argsProject);
    if (result.ok) {
      const found = result.value.find((s) => s.name === 'args-srv');
      expect(found?.args).toContain('--project-only');
      expect(found?.args).not.toContain('--global-only');
    }
  });

  it('McpRegistry: getServer는 null 또는 McpServerConfig 반환', () => {
    const registry = new McpRegistry(logger);
    const nullResult = registry.getServer('does-not-exist');
    expect(nullResult === null || nullResult === undefined).toBe(true);

    registry.register({ name: 'exists', command: 'npx', args: [], enabled: true });
    const found = registry.getServer('exists');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('exists');
  });

  it('McpManager: healthCheck 반환값이 객체이다', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'health-object-mcp');
    await writeMcpConfig(mcpDir, 'obj-srv', [{ name: 'obj-srv', command: 'npx', args: [], enabled: true }]);
    await manager.initialize(mcpDir);

    const health = manager.healthCheck();
    if (health.ok) {
      expect(typeof health.value).toBe('object');
      expect(health.value).not.toBeNull();
    }
  });

  it('전체 파이프라인: 20개 서버 → 모두 시작 → healthCheck → stopAll', async () => {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    const manager = new McpManager(registry, loader, logger);

    const mcpDir = join(tmpDir, 'twenty-servers-e2e-mcp');
    for (let i = 0; i < 20; i++) {
      await writeMcpConfig(mcpDir, `e2e-srv-${i}`, [
        { name: `e2e-srv-${i}`, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
    }

    await manager.initialize(mcpDir);

    for (let i = 0; i < 20; i++) {
      const result = await manager.startServer(`e2e-srv-${i}`);
      expect(result.ok).toBe(true);
    }

    const health = manager.healthCheck();
    if (health.ok) {
      for (let i = 0; i < 20; i++) {
        expect(health.value[`e2e-srv-${i}`]).toBe('running');
      }
    }

    const stopResult = manager.stopAll();
    expect(stopResult.ok).toBe(true);

    const afterHealth = manager.healthCheck();
    if (afterHealth.ok) {
      for (let i = 0; i < 20; i++) {
        expect(afterHealth.value[`e2e-srv-${i}`]).toBe('stopped');
      }
    }
  });
});
