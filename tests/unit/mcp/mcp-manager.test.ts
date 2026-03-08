import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { McpLoader } from 'mcp/loader.js';
import { McpManager } from 'mcp/mcp-manager.js';
import { McpRegistry } from 'mcp/registry.js';

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

  // ── 생성자 ──────────────────────────────────────────────────

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

    it('초기화 반환값 ok=true', async () => {
      const manager = createManager();
      const result = await manager.initialize(globalDir);
      expect(result.ok).toBe(true);
    });

    it('존재하지 않는 디렉토리로 초기화 → ok', async () => {
      const manager = createManager();
      const nonExistent = join(tempDir, 'nonexistent');
      const result = await manager.initialize(nonExistent);
      expect(result.ok).toBe(true);
    });

    it('여러 서버 초기화 → 모두 stopped 상태', async () => {
      await createMcpConfig(globalDir, 'srv1', [
        { name: 'srv1', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'srv2', [
        { name: 'srv2', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('srv1')).toBe('stopped');
      expect(manager.getStatus('srv2')).toBe('stopped');
    });

    it('초기화 후 listTools → 빈 배열 (아직 시작 안 됨)', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
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

    it('시작 후 상태가 running이다', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');
      expect(manager.getStatus('srv')).toBe('running');
    });

    it('startedAt이 현재 시간과 가깝다', async () => {
      await createMcpConfig(globalDir, 'timed', [
        { name: 'timed', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const before = new Date();
      const result = manager.startServer('timed');
      const after = new Date();
      if (result.ok) {
        expect(result.value.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.value.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it('빈 이름 서버 시작 → err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('');
      expect(result.ok).toBe(false);
    });

    it('여러 다른 서버 순차 시작 → 모두 ok', async () => {
      for (const name of ['s1', 's2', 's3']) {
        await createMcpConfig(globalDir, name, [
          { name, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (const name of ['s1', 's2', 's3']) {
        const result = manager.startServer(name);
        expect(result.ok).toBe(true);
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

    it('정지 후 상태가 stopped이다', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');
      manager.stopServer('srv');
      expect(manager.getStatus('srv')).toBe('stopped');
    });

    it('정지 후 재시작 가능', async () => {
      await createMcpConfig(globalDir, 'restart', [
        { name: 'restart', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('restart');
      manager.stopServer('restart');
      const r2 = manager.startServer('restart');
      expect(r2.ok).toBe(true);
    });

    it('빈 이름 정지 → err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('');
      expect(result.ok).toBe(false);
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

    it('stopAll 후 listTools → 빈 배열', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');
      manager.stopAll();
      expect(manager.listTools()).toHaveLength(0);
    });

    it('stopAll 반환값 ok=true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.stopAll().ok).toBe(true);
    });

    it('stopAll 후 healthCheck → 모두 stopped', async () => {
      await createMcpConfig(globalDir, 'x', [
        { name: 'x', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('x');
      manager.stopAll();
      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value.x).toBe('stopped');
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

    it('시작 후 정지 → stopped', async () => {
      await createMcpConfig(globalDir, 'cycle', [
        { name: 'cycle', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('cycle');
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

    it('연속 healthCheck → 일관됨', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');
      const h1 = manager.healthCheck();
      const h2 = manager.healthCheck();
      if (h1.ok && h2.ok) {
        expect(h1.value.srv).toBe(h2.value.srv);
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

    it('반환값이 배열이다', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(Array.isArray(manager.listTools())).toBe(true);
    });

    it('stopAll 후 → 빈 배열', async () => {
      await createMcpConfig(globalDir, 'srv', [
        { name: 'srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('srv');
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
  });

  // ── startServer - 경계값 ─────────────────────────────────────

  describe('startServer - 추가 경계값', () => {
    it('UUID 이름 서버 시작 → ok=true', async () => {
      const uuid = crypto.randomUUID();
      await createMcpConfig(globalDir, uuid, [
        { name: uuid, command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer(uuid);
      expect(result.ok).toBe(true);
    });

    it('UUID 이름 서버 시작 후 상태 running', async () => {
      const uuid = crypto.randomUUID();
      await createMcpConfig(globalDir, uuid, [
        { name: uuid, command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer(uuid);
      expect(manager.getStatus(uuid)).toBe('running');
    });

    it('초기화 없이 startServer → ok=false', () => {
      const manager = createManager();
      const result = manager.startServer('any');
      expect(result.ok).toBe(false);
    });

    it('10개 서버 순차 시작 → 모두 ok=true', async () => {
      for (let i = 0; i < 10; i++) {
        await createMcpConfig(globalDir, `srv-${i}`, [
          { name: `srv-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 10; i++) {
        const result = manager.startServer(`srv-${i}`);
        expect(result.ok).toBe(true);
      }
    });

    it('10개 서버 시작 → 모두 running', async () => {
      for (let i = 0; i < 10; i++) {
        await createMcpConfig(globalDir, `s-${i}`, [
          { name: `s-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 10; i++) {
        manager.startServer(`s-${i}`);
        expect(manager.getStatus(`s-${i}`)).toBe('running');
      }
    });

    it('startServer error.code 문자열', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('nonexistent');
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
      }
    });

    it('disabled 서버 에러 코드 확인', async () => {
      await createMcpConfig(globalDir, 'dis', [
        { name: 'dis', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('dis');
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_disabled');
      }
    });

    it('이미 실행 중 에러 코드 확인', async () => {
      await createMcpConfig(globalDir, 'dup', [
        { name: 'dup', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('dup');
      const result = manager.startServer('dup');
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_running');
      }
    });

    it('start → stop → start 사이클 3회 반복', async () => {
      await createMcpConfig(globalDir, 'cycle', [
        { name: 'cycle', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 3; i++) {
        expect(manager.startServer('cycle').ok).toBe(true);
        expect(manager.stopServer('cycle').ok).toBe(true);
      }
    });
  });

  // ── stopServer - 경계값 ──────────────────────────────────────

  describe('stopServer - 추가 경계값', () => {
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

    it('여러 서버 시작 후 순차 중지 → 모두 ok', async () => {
      for (const name of ['a1', 'b1', 'c1']) {
        await createMcpConfig(globalDir, name, [
          { name, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (const name of ['a1', 'b1', 'c1']) {
        manager.startServer(name);
      }
      for (const name of ['a1', 'b1', 'c1']) {
        const result = manager.stopServer(name);
        expect(result.ok).toBe(true);
      }
    });

    it('이미 정지된 서버 error.code 확인', async () => {
      await createMcpConfig(globalDir, 'stopped2', [
        { name: 'stopped2', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stopped2');
      manager.stopServer('stopped2');
      const result = manager.stopServer('stopped2');
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_stopped');
      }
    });

    it('정지 후 상태 확인은 stopped', async () => {
      await createMcpConfig(globalDir, 'done', [
        { name: 'done', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('done');
      manager.stopServer('done');
      expect(manager.getStatus('done')).toBe('stopped');
    });
  });

  // ── healthCheck - 경계값 ─────────────────────────────────────

  describe('healthCheck - 추가 경계값', () => {
    it('초기화 없이 healthCheck → ok=true', () => {
      const manager = createManager();
      const health = manager.healthCheck();
      expect(health.ok).toBe(true);
    });

    it('5개 서버 모두 running → healthCheck 5개 running', async () => {
      for (let i = 0; i < 5; i++) {
        await createMcpConfig(globalDir, `h-${i}`, [
          { name: `h-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 5; i++) {
        manager.startServer(`h-${i}`);
      }
      const health = manager.healthCheck();
      if (health.ok) {
        for (let i = 0; i < 5; i++) {
          expect(health.value[`h-${i}`]).toBe('running');
        }
      }
    });

    it('5개 서버 모두 stopped → healthCheck 5개 stopped', async () => {
      for (let i = 0; i < 5; i++) {
        await createMcpConfig(globalDir, `hs-${i}`, [
          { name: `hs-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      const health = manager.healthCheck();
      if (health.ok) {
        for (let i = 0; i < 5; i++) {
          expect(health.value[`hs-${i}`]).toBe('stopped');
        }
      }
    });

    it('healthCheck ok는 boolean', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const health = manager.healthCheck();
      expect(typeof health.ok).toBe('boolean');
    });

    it('혼합 상태(running+stopped) healthCheck', async () => {
      await createMcpConfig(globalDir, 'run-srv', [
        { name: 'run-srv', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'stop-srv', [
        { name: 'stop-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('run-srv');
      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value['run-srv']).toBe('running');
        expect(health.value['stop-srv']).toBe('stopped');
      }
    });

    it('stopAll 후 healthCheck → 모두 stopped', async () => {
      for (let i = 0; i < 3; i++) {
        await createMcpConfig(globalDir, `all-${i}`, [
          { name: `all-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 3; i++) manager.startServer(`all-${i}`);
      manager.stopAll();
      const health = manager.healthCheck();
      if (health.ok) {
        for (let i = 0; i < 3; i++) {
          expect(health.value[`all-${i}`]).toBe('stopped');
        }
      }
    });
  });

  // ── getStatus - 경계값 ───────────────────────────────────────

  describe('getStatus - 추가 경계값', () => {
    it('UUID 이름 → stopped', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus(crypto.randomUUID())).toBe('stopped');
    });

    it('한글 이름 → stopped', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('한글서버')).toBe('stopped');
    });

    it('특수문자 이름 → stopped', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('srv!@#$%')).toBe('stopped');
    });

    it('매우 긴 이름 → stopped', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('x'.repeat(1000))).toBe('stopped');
    });

    it('초기화 없이 getStatus → stopped', () => {
      const manager = createManager();
      expect(manager.getStatus('any')).toBe('stopped');
    });

    it('start → getStatus=running → stop → getStatus=stopped 사이클', async () => {
      await createMcpConfig(globalDir, 'st-cycle', [
        { name: 'st-cycle', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('st-cycle');
      expect(manager.getStatus('st-cycle')).toBe('running');
      manager.stopServer('st-cycle');
      expect(manager.getStatus('st-cycle')).toBe('stopped');
    });
  });

  // ── initialize - 추가 경계값 ─────────────────────────────────

  describe('initialize - 추가 경계값', () => {
    it('path traversal globalDir → ok=false', async () => {
      const manager = createManager();
      const result = await manager.initialize(`${tempDir}/../../etc`);
      expect(result.ok).toBe(false);
    });

    it('빈 문자열 디렉토리 → ok 또는 err (안전하게)', async () => {
      const manager = createManager();
      const result = await manager.initialize('');
      expect(typeof result.ok).toBe('boolean');
    });

    it('초기화 후 enabled=false 서버 존재 → startServer 거부', async () => {
      await createMcpConfig(globalDir, 'dis2', [
        { name: 'dis2', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('dis2');
      expect(result.ok).toBe(false);
    });

    it('초기화 후 listTools → 배열', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(Array.isArray(manager.listTools())).toBe(true);
    });

    it('초기화 후 getStatus 모든 서버 → stopped', async () => {
      for (let i = 0; i < 3; i++) {
        await createMcpConfig(globalDir, `init-srv-${i}`, [
          { name: `init-srv-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 3; i++) {
        expect(manager.getStatus(`init-srv-${i}`)).toBe('stopped');
      }
    });

    it('초기화 결과 ok는 boolean', async () => {
      const manager = createManager();
      const result = await manager.initialize(globalDir);
      expect(typeof result.ok).toBe('boolean');
    });
  });

  // ── stopAll - 추가 경계값 ────────────────────────────────────

  describe('stopAll - 추가 경계값', () => {
    it('10개 서버 모두 시작 후 stopAll → 모두 stopped', async () => {
      for (let i = 0; i < 10; i++) {
        await createMcpConfig(globalDir, `sa-${i}`, [
          { name: `sa-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 10; i++) manager.startServer(`sa-${i}`);
      manager.stopAll();
      for (let i = 0; i < 10; i++) {
        expect(manager.getStatus(`sa-${i}`)).toBe('stopped');
      }
    });

    it('초기화 없이 stopAll → ok=true', () => {
      const manager = createManager();
      expect(manager.stopAll().ok).toBe(true);
    });

    it('stopAll 후 재시작 가능', async () => {
      await createMcpConfig(globalDir, 'restart-all', [
        { name: 'restart-all', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('restart-all');
      manager.stopAll();
      const result = manager.startServer('restart-all');
      expect(result.ok).toBe(true);
    });

    it('stopAll 3회 연속 → 모두 ok=true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 3; i++) {
        expect(manager.stopAll().ok).toBe(true);
      }
    });
  });
});
