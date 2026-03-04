import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { McpLoader } from '../../../src/mcp/loader.js';
import { McpManager } from '../../../src/mcp/mcp-manager.js';
import { McpRegistry } from '../../../src/mcp/registry.js';

describe('McpManager', () => {
  let tempDir: string;
  let globalDir: string;
  let projectDir: string;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-mcp-manager-test-${crypto.randomUUID()}`);
    globalDir = join(tempDir, 'global');
    projectDir = join(tempDir, 'project');
    await mkdir(globalDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createManager(): McpManager {
    const registry = new McpRegistry(logger);
    const loader = new McpLoader(logger);
    return new McpManager(registry, loader, logger);
  }

  async function createMcpConfig(
    dir: string,
    folderName: string,
    servers: Record<string, unknown>[],
  ): Promise<void> {
    const configDir = join(dir, folderName);
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ servers }));
  }

  // ── initialize ──────────────────────────────────────────────

  describe('initialize', () => {
    it('설정을 로드하고 서버를 등록한다', async () => {
      await createMcpConfig(globalDir, 'server-a', [
        { name: 'server-a', command: 'npx', args: ['-y', '@test/a'], enabled: true },
      ]);
      const manager = createManager();

      const result = await manager.initialize(globalDir);

      expect(result.ok).toBe(true);
    });

    it('빈 디렉토리로 초기화해도 성공한다', async () => {
      const manager = createManager();

      const result = await manager.initialize(globalDir);

      expect(result.ok).toBe(true);
    });

    it('초기화 후 healthCheck에서 서버 상태를 확인할 수 있다', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const health = manager.healthCheck();

      expect(health.ok).toBe(true);
      if (health.ok) {
        expect(health.value.srv).toBe('stopped');
      }
    });
  });

  // ── startServer / stopServer ────────────────────────────────

  describe('startServer', () => {
    it('서버를 시작하고 running 상태로 전환한다', async () => {
      await createMcpConfig(globalDir, 'test', [
        { name: 'test', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = manager.startServer('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('running');
        expect(result.value.config.name).toBe('test');
        expect(result.value.startedAt).toBeInstanceOf(Date);
      }
    });

    it('존재하지 않는 서버 시작을 거부한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = manager.startServer('nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('비활성화된 서버 시작을 거부한다', async () => {
      await createMcpConfig(globalDir, 'disabled', [
        { name: 'disabled', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = manager.startServer('disabled');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_disabled');
      }
    });

    it('이미 실행 중인 서버 시작을 거부한다', async () => {
      await createMcpConfig(globalDir, 'running', [
        { name: 'running', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('running');

      const result = manager.startServer('running');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_running');
      }
    });
  });

  describe('stopServer', () => {
    it('실행 중인 서버를 정지한다', async () => {
      await createMcpConfig(globalDir, 'stoppable', [
        { name: 'stoppable', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stoppable');

      const result = manager.stopServer('stoppable');

      expect(result.ok).toBe(true);
      expect(manager.getStatus('stoppable')).toBe('stopped');
    });

    it('존재하지 않는 인스턴스 정지를 거부한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = manager.stopServer('nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('이미 정지된 서버 정지를 거부한다', async () => {
      await createMcpConfig(globalDir, 'already-stopped', [
        { name: 'already-stopped', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('already-stopped');
      manager.stopServer('already-stopped');

      const result = manager.stopServer('already-stopped');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_stopped');
      }
    });
  });

  // ── stopAll ─────────────────────────────────────────────────

  describe('stopAll', () => {
    it('모든 실행 중인 서버를 정지한다', async () => {
      await createMcpConfig(globalDir, 'a', [
        { name: 'a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'b', [
        { name: 'b', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('a');
      manager.startServer('b');

      const result = manager.stopAll();

      expect(result.ok).toBe(true);
      expect(manager.getStatus('a')).toBe('stopped');
      expect(manager.getStatus('b')).toBe('stopped');
    });

    it('실행 중인 서버가 없어도 성공한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = manager.stopAll();

      expect(result.ok).toBe(true);
    });
  });

  // ── getStatus ───────────────────────────────────────────────

  describe('getStatus', () => {
    it('시작되지 않은 서버는 stopped를 반환한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      expect(manager.getStatus('unknown')).toBe('stopped');
    });

    it('시작된 서버는 running을 반환한다', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');

      expect(manager.getStatus('srv')).toBe('running');
    });
  });

  // ── healthCheck ─────────────────────────────────────────────

  describe('healthCheck', () => {
    it('모든 등록된 서버의 상태를 반환한다', async () => {
      await createMcpConfig(globalDir, 'x', [
        { name: 'x', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'y', [
        { name: 'y', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('x');

      const health = manager.healthCheck();

      expect(health.ok).toBe(true);
      if (health.ok) {
        expect(health.value.x).toBe('running');
        expect(health.value.y).toBe('stopped');
      }
    });
  });

  // ── listTools ───────────────────────────────────────────────

  describe('listTools', () => {
    it('실행 중인 서버가 없으면 빈 배열을 반환한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      const tools = manager.listTools();

      expect(tools).toHaveLength(0);
    });

    it('정지된 서버의 도구는 포함하지 않는다', async () => {
      await createMcpConfig(globalDir, 'stopped-srv', [
        { name: 'stopped-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stopped-srv');
      manager.stopServer('stopped-srv');

      const tools = manager.listTools();

      expect(tools).toHaveLength(0);
    });
  });
});
