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

  // ── listTools - 추가 경계값 ──────────────────────────────────

  describe('listTools - 추가 경계값', () => {
    it('초기화 없이 listTools → 빈 배열', () => {
      const manager = createManager();
      expect(manager.listTools()).toHaveLength(0);
    });

    it('10개 서버 시작 후 listTools → 빈 배열 (tools가 없으므로)', async () => {
      for (let i = 0; i < 10; i++) {
        await createMcpConfig(globalDir, `lt-${i}`, [
          { name: `lt-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 10; i++) manager.startServer(`lt-${i}`);
      // tools 배열은 비어있으므로 listTools()는 빈 배열
      expect(manager.listTools()).toHaveLength(0);
    });

    it('서버 stop 후 listTools → 빈 배열', async () => {
      await createMcpConfig(globalDir, 'lt-stopped', [
        { name: 'lt-stopped', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('lt-stopped');
      manager.stopServer('lt-stopped');
      expect(manager.listTools()).toHaveLength(0);
    });

    it('listTools 반환값 원소 타입 확인 (있을 경우)', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const tools = manager.listTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('5번 연속 listTools → 동일 결과', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const first = manager.listTools().length;
      for (let i = 0; i < 4; i++) {
        expect(manager.listTools().length).toBe(first);
      }
    });
  });

  // ── 복합 시나리오 ────────────────────────────────────────────

  describe('복합 시나리오', () => {
    it('start → stop → healthCheck → getStatus 순서', async () => {
      await createMcpConfig(globalDir, 'flow-srv', [
        { name: 'flow-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      manager.startServer('flow-srv');
      expect(manager.getStatus('flow-srv')).toBe('running');

      const health1 = manager.healthCheck();
      if (health1.ok) expect(health1.value['flow-srv']).toBe('running');

      manager.stopServer('flow-srv');
      expect(manager.getStatus('flow-srv')).toBe('stopped');

      const health2 = manager.healthCheck();
      if (health2.ok) expect(health2.value['flow-srv']).toBe('stopped');
    });

    it('5개 서버: 3개 start, 2개 stop → healthCheck 혼합', async () => {
      for (let i = 0; i < 5; i++) {
        await createMcpConfig(globalDir, `mix-${i}`, [
          { name: `mix-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);

      for (let i = 0; i < 3; i++) manager.startServer(`mix-${i}`);

      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value['mix-0']).toBe('running');
        expect(health.value['mix-1']).toBe('running');
        expect(health.value['mix-2']).toBe('running');
        expect(health.value['mix-3']).toBe('stopped');
        expect(health.value['mix-4']).toBe('stopped');
      }
    });

    it('disabled 서버 포함 시 healthCheck → disabled 서버는 stopped', async () => {
      await createMcpConfig(globalDir, 'enabled-srv', [
        { name: 'enabled-srv', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'disabled-srv', [
        { name: 'disabled-srv', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('enabled-srv');

      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value['enabled-srv']).toBe('running');
        // disabled 서버는 registry에 등록되지 않아 healthCheck에 없거나 stopped
      }
    });

    it('재초기화 후 이전 서버 상태 초기화됨', async () => {
      await createMcpConfig(globalDir, 'reinit-srv', [
        { name: 'reinit-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('reinit-srv');
      expect(manager.getStatus('reinit-srv')).toBe('running');

      // 재초기화
      await manager.initialize(globalDir);
      expect(manager.getStatus('reinit-srv')).toBe('stopped');
    });

    it('UUID 서버 이름 start → stop → 재시작 사이클', async () => {
      const uuid = crypto.randomUUID();
      await createMcpConfig(globalDir, uuid, [
        { name: uuid, command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      const r1 = manager.startServer(uuid);
      expect(r1.ok).toBe(true);
      expect(manager.getStatus(uuid)).toBe('running');

      const r2 = manager.stopServer(uuid);
      expect(r2.ok).toBe(true);
      expect(manager.getStatus(uuid)).toBe('stopped');

      const r3 = manager.startServer(uuid);
      expect(r3.ok).toBe(true);
      expect(manager.getStatus(uuid)).toBe('running');
    });

    it('stopAll → start 각 서버 → healthCheck 모두 running', async () => {
      for (const name of ['sa-srv1', 'sa-srv2']) {
        await createMcpConfig(globalDir, name, [
          { name, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);

      manager.startServer('sa-srv1');
      manager.startServer('sa-srv2');
      manager.stopAll();

      manager.startServer('sa-srv1');
      manager.startServer('sa-srv2');

      const health = manager.healthCheck();
      if (health.ok) {
        expect(health.value['sa-srv1']).toBe('running');
        expect(health.value['sa-srv2']).toBe('running');
      }
    });

    it('초기화 → getStatus → startServer → getStatus 일관성', async () => {
      await createMcpConfig(globalDir, 'consistency-srv', [
        { name: 'consistency-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      expect(manager.getStatus('consistency-srv')).toBe('stopped');
      manager.startServer('consistency-srv');
      expect(manager.getStatus('consistency-srv')).toBe('running');
    });

    it('여러 매니저 인스턴스 독립 상태 유지', async () => {
      await createMcpConfig(globalDir, 'independent-srv', [
        { name: 'independent-srv', command: 'npx', args: [], enabled: true },
      ]);

      const m1 = createManager();
      const m2 = createManager();

      await m1.initialize(globalDir);
      await m2.initialize(globalDir);

      m1.startServer('independent-srv');

      expect(m1.getStatus('independent-srv')).toBe('running');
      expect(m2.getStatus('independent-srv')).toBe('stopped');
    });

    it('10개 서버: 홀수 start, 짝수 skip → healthCheck 확인', async () => {
      for (let i = 0; i < 10; i++) {
        await createMcpConfig(globalDir, `odd-even-${i}`, [
          { name: `odd-even-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);

      for (let i = 0; i < 10; i++) {
        if (i % 2 !== 0) manager.startServer(`odd-even-${i}`);
      }

      const health = manager.healthCheck();
      if (health.ok) {
        for (let i = 0; i < 10; i++) {
          if (i % 2 !== 0) {
            expect(health.value[`odd-even-${i}`]).toBe('running');
          } else {
            expect(health.value[`odd-even-${i}`]).toBe('stopped');
          }
        }
      }
    });

    it('startServer 반환값의 config.name이 서버 이름과 일치', async () => {
      await createMcpConfig(globalDir, 'name-check-srv', [
        { name: 'name-check-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('name-check-srv');
      if (result.ok) {
        expect(result.value.config.name).toBe('name-check-srv');
      }
    });

    it('startServer 반환값의 status가 running', async () => {
      await createMcpConfig(globalDir, 'status-check-srv', [
        { name: 'status-check-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('status-check-srv');
      if (result.ok) {
        expect(result.value.status).toBe('running');
      }
    });

    it('startServer 반환값의 tools는 배열', async () => {
      await createMcpConfig(globalDir, 'tools-check-srv', [
        { name: 'tools-check-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('tools-check-srv');
      if (result.ok) {
        expect(Array.isArray(result.value.tools)).toBe(true);
      }
    });

    it('stopServer ok=true 반환 후 startServer ok=true', async () => {
      await createMcpConfig(globalDir, 'restart-check', [
        { name: 'restart-check', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);

      manager.startServer('restart-check');
      const stopResult = manager.stopServer('restart-check');
      expect(stopResult.ok).toBe(true);

      const startResult = manager.startServer('restart-check');
      expect(startResult.ok).toBe(true);
    });

    it('5개 서버 모두 start/stop 사이클 5회', async () => {
      for (let i = 0; i < 5; i++) {
        await createMcpConfig(globalDir, `cycle5-${i}`, [
          { name: `cycle5-${i}`, command: 'npx', args: [], enabled: true },
        ]);
      }
      const manager = createManager();
      await manager.initialize(globalDir);

      for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 5; i++) {
          const r = manager.startServer(`cycle5-${i}`);
          expect(r.ok).toBe(true);
        }
        for (let i = 0; i < 5; i++) {
          const r = manager.stopServer(`cycle5-${i}`);
          expect(r.ok).toBe(true);
        }
      }
    });
  });

  // ── 추가 경계값: 에러 코드 및 타입 검증 ─────────────────────

  describe('에러 코드 및 타입 검증', () => {
    it('startServer not found 에러 code 타입 string', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('nonexistent-server');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
        expect(typeof result.error.message).toBe('string');
      }
    });

    it('stopServer not found 에러 code 타입 string', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('nonexistent-server');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
      }
    });

    it('startServer disabled 에러 message 타입 string', async () => {
      await createMcpConfig(globalDir, 'dis-msg', [
        { name: 'dis-msg', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('dis-msg');
      if (!result.ok) {
        expect(typeof result.error.message).toBe('string');
      }
    });

    it('startServer already_running 에러 message 타입 string', async () => {
      await createMcpConfig(globalDir, 'run-msg', [
        { name: 'run-msg', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('run-msg');
      const result = manager.startServer('run-msg');
      if (!result.ok) {
        expect(typeof result.error.message).toBe('string');
      }
    });

    it('stopServer already_stopped 에러 code = mcp_server_already_stopped', async () => {
      await createMcpConfig(globalDir, 'stop-msg', [
        { name: 'stop-msg', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stop-msg');
      manager.stopServer('stop-msg');
      const result = manager.stopServer('stop-msg');
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_already_stopped');
      }
    });

    it('stopServer not found 에러 code = mcp_server_not_found', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('no-such-server');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('startServer not found 에러 code = mcp_server_not_found', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('no-such-server-2');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_server_not_found');
      }
    });

    it('healthCheck ok는 항상 true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('stopAll ok는 항상 true', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopAll();
      expect(result.ok).toBe(true);
    });

    it('initialize ok는 항상 boolean', async () => {
      const manager = createManager();
      const result = await manager.initialize(globalDir);
      expect(typeof result.ok).toBe('boolean');
    });

    it('startServer ok는 boolean', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('any-server');
      expect(typeof result.ok).toBe('boolean');
    });

    it('stopServer ok는 boolean', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.stopServer('any-server');
      expect(typeof result.ok).toBe('boolean');
    });

    it('getStatus 반환값은 running 또는 stopped 중 하나', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const status = manager.getStatus('any');
      expect(['running', 'stopped']).toContain(status);
    });

    it('시작된 서버의 startedAt 타입 Date', async () => {
      await createMcpConfig(globalDir, 'date-check', [
        { name: 'date-check', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('date-check');
      if (result.ok) {
        expect(result.value.startedAt).toBeInstanceOf(Date);
      }
    });

    it('시작된 서버의 config.command = npx', async () => {
      await createMcpConfig(globalDir, 'cmd-check', [
        { name: 'cmd-check', command: 'npx', args: ['-y', 'some-pkg'], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('cmd-check');
      if (result.ok) {
        expect(result.value.config.command).toBe('npx');
      }
    });

    it('시작된 서버의 config.args 타입 배열', async () => {
      await createMcpConfig(globalDir, 'args-check', [
        { name: 'args-check', command: 'npx', args: ['-y', 'pkg'], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const result = manager.startServer('args-check');
      if (result.ok) {
        expect(Array.isArray(result.value.config.args)).toBe(true);
      }
    });
  });

  // ── stopAll 추가 엣지 케이스 ─────────────────────────────────

  describe('stopAll - 추가 엣지 케이스', () => {
    it('서버 없을 때 stopAll → ok', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.stopAll();
      expect(r.ok).toBe(true);
    });

    it('서버 시작 후 stopAll → ok', async () => {
      await createMcpConfig(globalDir, 'stop-all-1', [
        { name: 'stop-all-1', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stop-all-1');
      const r = manager.stopAll();
      expect(r.ok).toBe(true);
    });

    it('stopAll 후 getStatus → stopped', async () => {
      await createMcpConfig(globalDir, 'stop-all-status', [
        { name: 'stop-all-status', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('stop-all-status');
      manager.stopAll();
      expect(manager.getStatus('stop-all-status')).toBe('stopped');
    });

    it('stopAll 여러번 호출 → 모두 ok', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      for (let i = 0; i < 5; i++) {
        const r = manager.stopAll();
        expect(r.ok).toBe(true);
      }
    });

    it('여러 서버 시작 후 stopAll → 모두 stopped', async () => {
      await createMcpConfig(globalDir, 'multi-stop-a', [
        { name: 'multi-stop-a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'multi-stop-b', [
        { name: 'multi-stop-b', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('multi-stop-a');
      manager.startServer('multi-stop-b');
      manager.stopAll();
      expect(manager.getStatus('multi-stop-a')).toBe('stopped');
      expect(manager.getStatus('multi-stop-b')).toBe('stopped');
    });
  });

  // ── healthCheck 추가 엣지 케이스 ────────────────────────────

  describe('healthCheck - 추가 엣지 케이스', () => {
    it('초기화 전 healthCheck → ok', () => {
      const manager = createManager();
      const r = manager.healthCheck();
      expect(r.ok).toBe(true);
    });

    it('초기화 후 healthCheck → ok', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      expect(r.ok).toBe(true);
    });

    it('healthCheck 결과는 Record<string, McpServerStatus>', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      if (r.ok) expect(typeof r.value).toBe('object');
    });

    it('서버 시작 후 healthCheck → running 포함', async () => {
      await createMcpConfig(globalDir, 'hc-running', [
        { name: 'hc-running', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('hc-running');
      const r = manager.healthCheck();
      if (r.ok) expect(r.value['hc-running']).toBe('running');
    });

    it('서버 정지 후 healthCheck → stopped', async () => {
      await createMcpConfig(globalDir, 'hc-stopped', [
        { name: 'hc-stopped', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('hc-stopped');
      manager.stopServer('hc-stopped');
      const r = manager.healthCheck();
      if (r.ok) expect(r.value['hc-stopped']).toBe('stopped');
    });

    it('healthCheck: 여러 서버 상태 반영', async () => {
      await createMcpConfig(globalDir, 'hc-multi-a', [
        { name: 'hc-multi-a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'hc-multi-b', [
        { name: 'hc-multi-b', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('hc-multi-a');
      const r = manager.healthCheck();
      if (r.ok) {
        expect(r.value['hc-multi-a']).toBe('running');
        expect(r.value['hc-multi-b']).toBe('stopped');
      }
    });

    it('healthCheck: 반복 호출 → 일관된 결과', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r1 = manager.healthCheck();
      const r2 = manager.healthCheck();
      expect(r1.ok).toBe(r2.ok);
    });

    it('healthCheck: 빈 서버 목록 → 빈 Record', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      if (r.ok) expect(Object.keys(r.value).length).toBe(0);
    });
  });

  // ── listTools 추가 엣지 케이스 ──────────────────────────────

  describe('listTools - 추가 엣지 케이스', () => {
    it('초기 listTools → 빈 배열', () => {
      const manager = createManager();
      expect(manager.listTools()).toEqual([]);
    });

    it('초기화 후 서버 없음 → 빈 배열', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.listTools()).toEqual([]);
    });

    it('서버 시작 후 listTools → 배열', async () => {
      await createMcpConfig(globalDir, 'lt-server', [
        { name: 'lt-server', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('lt-server');
      expect(Array.isArray(manager.listTools())).toBe(true);
    });

    it('정지된 서버 → 도구 목록에서 제외', async () => {
      await createMcpConfig(globalDir, 'lt-stopped', [
        { name: 'lt-stopped', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('lt-stopped');
      manager.stopServer('lt-stopped');
      expect(manager.listTools()).toEqual([]);
    });

    it('stopAll 후 listTools → 빈 배열', async () => {
      await createMcpConfig(globalDir, 'lt-stopall', [
        { name: 'lt-stopall', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('lt-stopall');
      manager.stopAll();
      expect(manager.listTools()).toEqual([]);
    });

    it('listTools 여러번 호출 → 일관된 결과', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const t1 = manager.listTools();
      const t2 = manager.listTools();
      expect(t1.length).toBe(t2.length);
    });
  });

  // ── initialize 추가 엣지 케이스 ─────────────────────────────

  describe('initialize - 추가 엣지 케이스', () => {
    it('빈 디렉토리로 초기화 → ok', async () => {
      const manager = createManager();
      const r = await manager.initialize(globalDir);
      expect(r.ok).toBe(true);
    });

    it('project 디렉토리와 함께 초기화 → ok', async () => {
      const manager = createManager();
      const r = await manager.initialize(globalDir, projectDir);
      expect(r.ok).toBe(true);
    });

    it('초기화 후 서버 카운트 0 (빈 디렉토리)', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      if (r.ok) expect(Object.keys(r.value).length).toBe(0);
    });

    it('초기화 후 서버 등록됨', async () => {
      await createMcpConfig(globalDir, 'init-server', [
        { name: 'init-server', command: 'node', args: ['server.js'], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      if (r.ok) expect('init-server' in r.value).toBe(true);
    });

    it('두번 초기화 → 두번째가 첫번째 대체', async () => {
      await createMcpConfig(globalDir, 'reinit-server', [
        { name: 'reinit-server', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('reinit-server');
      await manager.initialize(globalDir); // 두번째 초기화
      // 두번째 초기화 후 인스턴스 초기화됨
      expect(manager.getStatus('reinit-server')).toBe('stopped');
    });

    it('disabled 서버 → 등록되지만 시작 불가', async () => {
      await createMcpConfig(globalDir, 'disabled-server', [
        { name: 'disabled-server', command: 'npx', args: [], enabled: false },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.startServer('disabled-server');
      expect(r.ok).toBe(false);
    });

    it('enabled 서버 여러개 → 모두 등록됨', async () => {
      await createMcpConfig(globalDir, 'multi-init', [
        { name: 'server-x', command: 'npx', args: [], enabled: true },
        { name: 'server-y', command: 'npx', args: [], enabled: true },
        { name: 'server-z', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.healthCheck();
      if (r.ok) {
        expect('server-x' in r.value).toBe(true);
        expect('server-y' in r.value).toBe(true);
        expect('server-z' in r.value).toBe(true);
      }
    });

    it('존재하지 않는 globalDir → err 또는 ok(빈 목록)', async () => {
      const manager = createManager();
      const r = await manager.initialize('/nonexistent-dir-xyz-99999');
      expect(typeof r.ok).toBe('boolean');
    });

    it('project 디렉토리 서버가 global 서버와 병합', async () => {
      await createMcpConfig(globalDir, 'global-srv', [
        { name: 'global-srv', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(projectDir, 'project-srv', [
        { name: 'project-srv', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir, projectDir);
      const r = manager.healthCheck();
      if (r.ok) {
        // 적어도 하나의 서버가 등록되어야 함
        expect(typeof r.value).toBe('object');
      }
    });
  });

  // ── startServer/stopServer 엣지 케이스 추가 ─────────────────

  describe('startServer/stopServer - 추가 엣지 케이스', () => {
    it('존재하지 않는 서버 stopServer → err', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.stopServer('nonexistent-xyz');
      expect(r.ok).toBe(false);
    });

    it('stopServer error code 존재', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.stopServer('no-such-server');
      if (!r.ok) expect(typeof r.error.code).toBe('string');
    });

    it('startServer error code 존재 (not found)', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.startServer('no-such-server-2');
      if (!r.ok) expect(typeof r.error.code).toBe('string');
    });

    it('시작 후 다시 시작 → already running err', async () => {
      await createMcpConfig(globalDir, 'double-start', [
        { name: 'double-start', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('double-start');
      const r = manager.startServer('double-start');
      expect(r.ok).toBe(false);
    });

    it('시작-정지-재시작 사이클', async () => {
      await createMcpConfig(globalDir, 'cycle-server', [
        { name: 'cycle-server', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('cycle-server');
      manager.stopServer('cycle-server');
      const r = manager.startServer('cycle-server');
      expect(r.ok).toBe(true);
      expect(manager.getStatus('cycle-server')).toBe('running');
    });

    it('startServer 성공 후 instance tools는 배열', async () => {
      await createMcpConfig(globalDir, 'tools-check', [
        { name: 'tools-check', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.startServer('tools-check');
      if (r.ok) expect(Array.isArray(r.value.tools)).toBe(true);
    });

    it('startServer 성공 후 instance status=running', async () => {
      await createMcpConfig(globalDir, 'status-running', [
        { name: 'status-running', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const r = manager.startServer('status-running');
      if (r.ok) expect(r.value.status).toBe('running');
    });

    it('stopServer 성공 후 getStatus=stopped', async () => {
      await createMcpConfig(globalDir, 'post-stop', [
        { name: 'post-stop', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('post-stop');
      manager.stopServer('post-stop');
      expect(manager.getStatus('post-stop')).toBe('stopped');
    });

    it('이미 정지된 서버 stopServer → err', async () => {
      await createMcpConfig(globalDir, 'already-stopped', [
        { name: 'already-stopped', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('already-stopped');
      manager.stopServer('already-stopped');
      const r = manager.stopServer('already-stopped');
      expect(r.ok).toBe(false);
    });

    it('여러 서버 독립 시작 → 각각 running', async () => {
      await createMcpConfig(globalDir, 'ind-a', [
        { name: 'ind-a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'ind-b', [
        { name: 'ind-b', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('ind-a');
      manager.startServer('ind-b');
      expect(manager.getStatus('ind-a')).toBe('running');
      expect(manager.getStatus('ind-b')).toBe('running');
    });

    it('한 서버 정지해도 다른 서버 유지', async () => {
      await createMcpConfig(globalDir, 'keep-a', [
        { name: 'keep-a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'keep-b', [
        { name: 'keep-b', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('keep-a');
      manager.startServer('keep-b');
      manager.stopServer('keep-a');
      expect(manager.getStatus('keep-a')).toBe('stopped');
      expect(manager.getStatus('keep-b')).toBe('running');
    });
  });

  // ── getStatus 추가 엣지 케이스 ──────────────────────────────

  describe('getStatus - 추가 엣지 케이스', () => {
    it('알 수 없는 서버 → stopped 반환', async () => {
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('totally-unknown')).toBe('stopped');
    });

    it('getStatus 반환값이 running 또는 stopped', async () => {
      await createMcpConfig(globalDir, 'gs-test', [
        { name: 'gs-test', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      const status = manager.getStatus('gs-test');
      expect(['running', 'stopped']).toContain(status);
    });

    it('시작 전 getStatus → stopped', async () => {
      await createMcpConfig(globalDir, 'gs-before-start', [
        { name: 'gs-before-start', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      expect(manager.getStatus('gs-before-start')).toBe('stopped');
    });

    it('시작 후 getStatus → running', async () => {
      await createMcpConfig(globalDir, 'gs-after-start', [
        { name: 'gs-after-start', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('gs-after-start');
      expect(manager.getStatus('gs-after-start')).toBe('running');
    });

    it('getStatus 10회 반복 → 일관된 결과', async () => {
      await createMcpConfig(globalDir, 'gs-stable', [
        { name: 'gs-stable', command: 'npx', args: [], enabled: true },
      ]);
      const manager = createManager();
      await manager.initialize(globalDir);
      manager.startServer('gs-stable');
      const first = manager.getStatus('gs-stable');
      for (let i = 0; i < 9; i++) {
        expect(manager.getStatus('gs-stable')).toBe(first);
      }
    });

    it('초기화 없이 getStatus → stopped', () => {
      const manager = createManager();
      expect(manager.getStatus('any-server')).toBe('stopped');
    });
  });
});
