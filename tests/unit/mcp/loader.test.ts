import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { McpLoader } from '../../../src/mcp/loader.js';

describe('McpLoader', () => {
  let tempDir: string;
  let globalDir: string;
  let projectDir: string;
  const logger = new ConsoleLogger('error');

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-mcp-loader-test-${crypto.randomUUID()}`);
    globalDir = join(tempDir, 'global');
    projectDir = join(tempDir, 'project');
    await mkdir(globalDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createMcpConfig(
    dir: string,
    folderName: string,
    servers: Record<string, unknown>[],
  ): Promise<void> {
    const configDir = join(dir, folderName);
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ servers }));
  }

  // ── loadFromDirectory ───────────────────────────────────────

  describe('loadFromDirectory', () => {
    it('디렉토리에서 mcp.json을 로드한다', async () => {
      await createMcpConfig(globalDir, 'server-a', [
        { name: 'server-a', command: 'npx', args: ['-y', '@test/a'], enabled: true },
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.name).toBe('server-a');
      }
    });

    it('여러 하위 디렉토리에서 설정을 로드한다', async () => {
      await createMcpConfig(globalDir, 'a', [
        { name: 'a', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(globalDir, 'b', [
        { name: 'b', command: 'npx', args: [], enabled: true },
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('존재하지 않는 디렉토리는 빈 배열을 반환한다', async () => {
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(join(tempDir, 'nonexistent'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('빈 디렉토리는 빈 배열을 반환한다', async () => {
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('잘못된 JSON은 건너뛴다', async () => {
      const configDir = join(globalDir, 'broken');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'mcp.json'), '{broken!!}');
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('servers 필드가 없는 mcp.json은 건너뛴다', async () => {
      const configDir = join(globalDir, 'no-servers');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ name: 'test' }));
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('필수 필드가 누락된 서버 설정은 건너뛴다', async () => {
      await createMcpConfig(globalDir, 'invalid', [
        { name: 'valid', command: 'npx', args: [], enabled: true },
        { name: 'missing-command' }, // command 누락
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.name).toBe('valid');
      }
    });

    it('path traversal이 포함된 디렉토리를 거부한다', async () => {
      const loader = new McpLoader(logger);

      // WHY: join()은 ..을 resolve하므로 직접 문자열 결합 사용
      const result = await loader.loadFromDirectory(`${tempDir}/../../etc`);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('mcp_path_traversal');
      }
    });

    it('mcp.json이 없는 하위 디렉토리는 건너뛴다', async () => {
      const emptySubDir = join(globalDir, 'no-config');
      await mkdir(emptySubDir, { recursive: true });
      const loader = new McpLoader(logger);

      const result = await loader.loadFromDirectory(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  // ── loadAndMerge ────────────────────────────────────────────

  describe('loadAndMerge', () => {
    it('프로젝트 설정이 글로벌 설정을 덮어쓴다', async () => {
      await createMcpConfig(globalDir, 'shared', [
        { name: 'shared', command: 'global-cmd', args: [], enabled: true },
      ]);
      await createMcpConfig(projectDir, 'shared', [
        { name: 'shared', command: 'project-cmd', args: [], enabled: false },
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadAndMerge(globalDir, projectDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.command).toBe('project-cmd');
        expect(result.value[0]?.enabled).toBe(false);
      }
    });

    it('글로벌과 프로젝트 고유 설정을 모두 포함한다', async () => {
      await createMcpConfig(globalDir, 'global-only', [
        { name: 'global-only', command: 'npx', args: [], enabled: true },
      ]);
      await createMcpConfig(projectDir, 'project-only', [
        { name: 'project-only', command: 'npx', args: [], enabled: true },
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadAndMerge(globalDir, projectDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const names = result.value.map((c) => c.name);
        expect(names).toContain('global-only');
        expect(names).toContain('project-only');
      }
    });

    it('projectDir가 없으면 글로벌만 로드한다', async () => {
      await createMcpConfig(globalDir, 'global', [
        { name: 'global', command: 'npx', args: [], enabled: true },
      ]);
      const loader = new McpLoader(logger);

      const result = await loader.loadAndMerge(globalDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.name).toBe('global');
      }
    });

    it('두 디렉토리 모두 비어있으면 빈 배열을 반환한다', async () => {
      const loader = new McpLoader(logger);

      const result = await loader.loadAndMerge(globalDir, projectDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
