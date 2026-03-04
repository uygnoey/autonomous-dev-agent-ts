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
import { ConsoleLogger } from '../../src/core/logger.js';
import { McpLoader } from '../../src/mcp/loader.js';
import { McpRegistry } from '../../src/mcp/registry.js';
import { McpManager } from '../../src/mcp/mcp-manager.js';
import type { McpServerConfig } from '../../src/mcp/types.js';

const logger = new ConsoleLogger('error');

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
      { name: 'git', command: 'npx', args: ['-y', '@anthropic/mcp-git'], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: ['-y', '@anthropic/mcp-fs'], enabled: true },
    ]);

    // Step 1: 초기화
    const initResult = await manager.initialize(mcpDir);
    expect(initResult.ok).toBe(true);

    // Step 2: 서버 시작
    const startResult = manager.startServer('git');
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

    const result = manager.startServer('nonexistent');
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

    const result = manager.startServer('disabled');
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
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    manager.startServer('git');

    const dupResult = manager.startServer('git');
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
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: [], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    manager.startServer('git');

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
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);
    await writeMcpConfig(mcpDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: [], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    manager.startServer('git');
    manager.startServer('filesystem');

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
      { name: 'git', command: 'npx', args: [], enabled: true },
    ]);

    await manager.initialize(mcpDir);
    manager.startServer('git');

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
      { name: 'git', command: 'npx', args: ['--global'], enabled: true },
    ]);
    await writeMcpConfig(globalDir, 'fs-server', [
      { name: 'filesystem', command: 'npx', args: ['--global'], enabled: true },
    ]);
    await writeMcpConfig(projectDir, 'db-server', [
      { name: 'database', command: 'npx', args: ['--project'], enabled: true },
    ]);

    // Step 2: 초기화 (글로벌 + 프로젝트 병합)
    const initResult = await manager.initialize(globalDir, projectDir);
    expect(initResult.ok).toBe(true);

    // Step 3: 모든 서버 시작
    const gitStart = manager.startServer('git');
    expect(gitStart.ok).toBe(true);

    const fsStart = manager.startServer('filesystem');
    expect(fsStart.ok).toBe(true);

    const dbStart = manager.startServer('database');
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
});
