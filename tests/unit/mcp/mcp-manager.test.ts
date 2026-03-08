import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { McpLoader } from 'mcp/loader.js';
import { McpManager } from 'mcp/mcp-manager.js';
import { McpRegistry } from 'mcp/registry.js';

/** 테스트용 mock MCP 서버 스크립트 경로 / Path to mock MCP server fixture */
const MOCK_MCP_FIXTURE = join(import.meta.dir, '../../fixtures/mock-mcp-server.ts');

describe('McpManager', () => {
  let tempDir: string;
  let globalDir: string;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-mcp-manager-test-${crypto.randomUUID()}`);
    globalDir = join(tempDir, 'global');
    await mkdir(globalDir, { recursive: true });
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
    folderName: string,
    servers: Record<string, unknown>[],
  ): Promise<void> {
    const configDir = join(globalDir, folderName);
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ servers }));
  }

  // ── 생성자 ──────────────────────────────────────────────────────

  describe('McpManager 생성자', () => {
    it('인스턴스 생성됨', () => {
      expect(() => createManager()).not.toThrow();
    });

    it('McpManager 인스턴스', () => {
      expect(createManager()).toBeInstanceOf(McpManager);
    });

    it('여러 인스턴스 독립적', () => {
      const m1 = createManager();
      const m2 = createManager();
      expect(m1).not.toBe(m2);
    });
  });

  // ── initialize ─────────────────────────────────────────────────

  describe('initialize', () => {
    it('설정을 로드하고 서버를 등록한다', async () => {
      await createMcpConfig('server-a', [
        { name: 'server-a', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
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
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const health = manager.healthCheck();

      expect(health.ok).toBe(true);
      if (health.ok) {
        expect(health.value['srv']).toBe('stopped');
      }
    });

    it('존재하지 않는 디렉토리로 초기화 → ok', async () => {
      const manager = createManager();
      const nonExistent = join(tempDir, 'nonexistent');
      const result = await manager.initialize(nonExistent);
      expect(result.ok).toBe(true);
    });

    it('여러 서버 초기화 → 모두 stopped 상태', async () => {
      await createMcpConfig('srv1', [
        { name: 'srv1', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      await createMcpConfig('srv2', [
        { name: 'srv2', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('srv1')).toBe('stopped');
      expect(manager.getStatus('srv2')).toBe('stopped');
    });

    it('초기화 후 listTools → 빈 배열 (아직 시작 안 됨)', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.listTools()).toHaveLength(0);
    });

    it('두 번 초기화 → 두 번째도 ok', async () => {
      const manager = createManager();
      const r1 = await manager.initialize(globalDir);
      const r2 = await manager.initialize(globalDir);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  // ── startServer — mock MCP 서버로 실제 핸드셰이크 ────────────────

  describe('startServer (mock MCP 서버)', () => {
    it('mock MCP 서버 시작 → status=running', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('mock');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('running');
        expect(result.value.config.name).toBe('mock');
        expect(result.value.startedAt).toBeInstanceOf(Date);
      }
    });

    it('mock MCP 서버 시작 → tools 검색됨', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('mock');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tools.length).toBeGreaterThan(0);
        expect(result.value.tools[0]?.name).toBe('mock_tool');
      }
    });

    it('mock MCP 서버 → 두 번째 도구 검색됨', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer('mock');
      if (result.ok) {
        expect(result.value.tools.length).toBe(2);
      }
    });

    it('mock 서버 시작 후 getStatus → running', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer('mock');
      if (result.ok) {
        expect(manager.getStatus('mock')).toBe('running');
      }
    });

    it('mock 서버 시작 후 listTools → 도구 포함', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('mock');
      const tools = manager.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('mock 서버 시작 후 stopServer → stopped', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('mock');

      const stopResult = manager.stopServer('mock');

      expect(stopResult.ok).toBe(true);
      expect(manager.getStatus('mock')).toBe('stopped');
    });

    it('mock 서버 시작 후 정지 → listTools 빈 배열', async () => {
      await createMcpConfig('mock', [
        { name: 'mock', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('mock');
      manager.stopServer('mock');
      expect(manager.listTools()).toHaveLength(0);
    });
  });

  // ── startServer — 에러 케이스 ────────────────────────────────────

  describe('startServer (에러 케이스)', () => {
    it('존재하지 않는 서버 시작을 거부한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('비활성화된 서버 시작을 거부한다', async () => {
      await createMcpConfig('disabled', [
        { name: 'disabled', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('disabled');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_disabled');
      }
    });

    it('이미 실행 중인 서버 시작을 거부한다', async () => {
      await createMcpConfig('running', [
        { name: 'running', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('running');

      const result = await manager.startServer('running');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_running');
      }
    });

    it('존재하지 않는 명령어 → mcp_server_start_failed', async () => {
      await createMcpConfig('bad', [
        {
          name: 'bad',
          command: 'this-command-does-not-exist-adev-test',
          args: [],
          enabled: true,
        },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('bad');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_start_failed');
      }
    });

    it('MCP 프로토콜 미지원 명령어 → error 상태', async () => {
      // WHY: echo는 MCP JSON-RPC를 구현하지 않으므로 핸드셰이크 실패
      await createMcpConfig('notmcp', [
        { name: 'notmcp', command: 'bun', args: ['-e', 'process.exit(0)'], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const result = await manager.startServer('notmcp');

      expect(result.ok).toBe(false);
      if (result.ok) {
        // 만약 성공했다면 status가 running이어야 함 (이 경로는 실행 안 됨)
        expect(result.value.status).toBe('running');
      } else {
        expect(result.error.code).toBe('mcp_server_start_failed');
      }
    });

    it('빈 이름 서버 시작 → not_found err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer('');
      expect(result.ok).toBe(false);
    });

    it('초기화 없이 startServer → ok=false', async () => {
      const manager = createManager();
      const result = await manager.startServer('any');
      expect(result.ok).toBe(false);
    });

    it('error.code는 항상 문자열', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer('nonexistent');
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
      }
    });

    it('disabled 서버 에러 코드 확인', async () => {
      await createMcpConfig('dis', [
        { name: 'dis', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer('dis');
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_disabled');
      }
    });
  });

  // ── stopServer ─────────────────────────────────────────────────

  describe('stopServer', () => {
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
      await createMcpConfig('stoppable', [
        { name: 'stoppable', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('stoppable');
      manager.stopServer('stoppable');

      const result = manager.stopServer('stoppable');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_stopped');
      }
    });

    it('정지 후 상태가 stopped이다', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('srv');
      manager.stopServer('srv');
      expect(manager.getStatus('srv')).toBe('stopped');
    });

    it('정지 후 재시작 가능 (start → stop → start)', async () => {
      await createMcpConfig('restart', [
        { name: 'restart', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('restart');
      manager.stopServer('restart');
      const r2 = await manager.startServer('restart');
      expect(r2.ok).toBe(true);
    });

    it('빈 이름 정지 → err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('');
      expect(result.ok).toBe(false);
    });

    it('초기화 없이 stopServer → ok=false', () => {
      const manager = createManager();
      const result = manager.stopServer('any');
      expect(result.ok).toBe(false);
    });

    it('특수문자 이름 서버 stop → not found err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('non-existent-!!');
      expect(result.ok).toBe(false);
    });

    it('UUID 이름 서버 stop → not found', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer(crypto.randomUUID());
      expect(result.ok).toBe(false);
    });

    it('여러 mock 서버 시작 후 순차 중지 → 모두 ok', async () => {
      for (const name of ['a1', 'b1', 'c1']) {
        await createMcpConfig(name, [
          { name, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (const name of ['a1', 'b1', 'c1']) {
        await manager.startServer(name);
      }
      for (const name of ['a1', 'b1', 'c1']) {
        const result = manager.stopServer(name);
        expect(result.ok).toBe(true);
      }
    });
  });

  // ── stopAll ───────────────────────────────────────────────────

  describe('stopAll', () => {
    it('실행 중인 서버가 없어도 성공한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopAll();
      expect(result.ok).toBe(true);
    });

    it('mock 서버 시작 후 stopAll → 모두 stopped', async () => {
      for (const name of ['a', 'b']) {
        await createMcpConfig(name, [
          { name, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('a');
      await manager.startServer('b');

      const result = manager.stopAll();

      expect(result.ok).toBe(true);
      expect(manager.getStatus('a')).toBe('stopped');
      expect(manager.getStatus('b')).toBe('stopped');
    });

    it('stopAll 후 listTools → 빈 배열', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('srv');
      manager.stopAll();
      expect(manager.listTools()).toHaveLength(0);
    });

    it('stopAll 반환값 ok=true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.stopAll().ok).toBe(true);
    });

    it('stopAll 후 healthCheck → 모두 stopped', async () => {
      await createMcpConfig('x', [
        { name: 'x', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('x');
      manager.stopAll();
      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value['x']).toBe('stopped');
      }
    });

    it('연속 stopAll 호출 → 두 번째도 ok', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r1 = manager.stopAll();
      const r2 = manager.stopAll();
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────

  describe('getStatus', () => {
    it('시작되지 않은 서버는 stopped를 반환한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('unknown')).toBe('stopped');
    });

    it('시작된 mock 서버는 running을 반환한다', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('srv');
      expect(manager.getStatus('srv')).toBe('running');
    });

    it('시작 후 정지 → stopped', async () => {
      await createMcpConfig('cycle', [
        { name: 'cycle', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('cycle');
      manager.stopServer('cycle');
      expect(manager.getStatus('cycle')).toBe('stopped');
    });

    it('반환값이 문자열이다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(typeof manager.getStatus('any')).toBe('string');
    });

    it('빈 이름 → stopped', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('')).toBe('stopped');
    });

    it('연속 getStatus 호출 → 동일 결과', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const s1 = manager.getStatus('nonexistent');
      const s2 = manager.getStatus('nonexistent');
      expect(s1).toBe(s2);
    });

    it('핸드셰이크 실패 서버 → error 상태', async () => {
      await createMcpConfig('bad', [
        {
          name: 'bad',
          command: 'bun',
          args: ['-e', 'process.exit(1)'],
          enabled: true,
        },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('bad');
      expect(manager.getStatus('bad')).toBe('error');
    });
  });

  // ── healthCheck ───────────────────────────────────────────────

  describe('healthCheck', () => {
    it('빈 상태 → ok=true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const health = manager.healthCheck();
      expect(health.ok).toBe(true);
    });

    it('반환값이 객체이다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const health = manager.healthCheck();
      if (health.ok) {
        expect(typeof health.value).toBe('object');
      }
    });

    it('mock 서버 시작 후 healthCheck → running 포함', async () => {
      await createMcpConfig('x', [
        { name: 'x', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      await createMcpConfig('y', [
        { name: 'y', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('x');

      const health = manager.healthCheck();

      expect(health.ok).toBe(true);
      if (health.ok) {
        expect(health.value['x']).toBe('running');
        expect(health.value['y']).toBe('stopped');
      }
    });

    it('연속 healthCheck → 일관됨', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('srv');
      const h1 = manager.healthCheck();
      const h2 = manager.healthCheck();
      if (h1.ok && h2.ok) {
        expect(h1.value['srv']).toBe(h2.value['srv']);
      }
    });
  });

  // ── listTools ─────────────────────────────────────────────────

  describe('listTools', () => {
    it('실행 중인 서버가 없으면 빈 배열을 반환한다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const tools = manager.listTools();
      expect(tools).toHaveLength(0);
    });

    it('정지된 서버의 도구는 포함하지 않는다', async () => {
      await createMcpConfig('stopped-srv', [
        { name: 'stopped-srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('stopped-srv');
      manager.stopServer('stopped-srv');
      const tools = manager.listTools();
      expect(tools).toHaveLength(0);
    });

    it('반환값이 배열이다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(Array.isArray(manager.listTools())).toBe(true);
    });

    it('stopAll 후 → 빈 배열', async () => {
      await createMcpConfig('srv', [
        { name: 'srv', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('srv');
      manager.stopAll();
      expect(manager.listTools()).toHaveLength(0);
    });

    it('연속 listTools 호출 → 동일 결과', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const t1 = manager.listTools();
      const t2 = manager.listTools();
      expect(t1.length).toBe(t2.length);
    });

    it('mock 서버 2개 시작 → 도구 합산', async () => {
      for (const name of ['m1', 'm2']) {
        await createMcpConfig(name, [
          { name, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      await manager.startServer('m1');
      await manager.startServer('m2');
      // WHY: 각 mock 서버는 2개 도구 제공
      expect(manager.listTools().length).toBe(4);
    });
  });

  // ── 시작/정지 사이클 통합 ─────────────────────────────────────

  describe('start/stop 사이클 통합', () => {
    it('start → stop → start 사이클 2회 반복', async () => {
      await createMcpConfig('cycle', [
        { name: 'cycle', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 2; i++) {
        const r1 = await manager.startServer('cycle');
        expect(r1.ok).toBe(true);
        const r2 = manager.stopServer('cycle');
        expect(r2.ok).toBe(true);
      }
    });

    it('UUID 이름 서버 시작 후 도구 검색 → ok', async () => {
      const uuid = crypto.randomUUID();
      await createMcpConfig(uuid, [
        { name: uuid, command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = await manager.startServer(uuid);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tools.length).toBeGreaterThan(0);
      }
    });

    it('startedAt이 현재 시간과 가깝다', async () => {
      await createMcpConfig('timed', [
        { name: 'timed', command: 'bun', args: [MOCK_MCP_FIXTURE], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const before = new Date();
      const result = await manager.startServer('timed');
      const after = new Date();
      if (result.ok) {
        expect(result.value.startedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.value.startedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });
  });
});
