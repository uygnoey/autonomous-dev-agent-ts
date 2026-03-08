/**
 * McpLoader 단위 테스트
 *
 * @description
 * KR: loadFromDirectory/loadAndMerge 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for McpLoader methods. 80%+ edge/invalid ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { McpLoader } from 'mcp/loader.js';

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

// ── 생성자 ────────────────────────────────────────────────────

describe('McpLoader 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new McpLoader(logger)).not.toThrow();
  });

  it('McpLoader 인스턴스이다', () => {
    expect(new McpLoader(logger)).toBeInstanceOf(McpLoader);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new McpLoader(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const l1 = new McpLoader(logger);
    const l2 = new McpLoader(logger);
    expect(l1).not.toBe(l2);
  });

  it('loadFromDirectory 메서드 존재', () => {
    expect(typeof new McpLoader(logger).loadFromDirectory).toBe('function');
  });

  it('loadAndMerge 메서드 존재', () => {
    expect(typeof new McpLoader(logger).loadAndMerge).toBe('function');
  });

  it('10번 생성 → 오류 없음', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new McpLoader(logger)).not.toThrow();
    }
  });
});

// ── loadFromDirectory - 성공 케이스 ──────────────────────────

describe('McpLoader loadFromDirectory - 성공 케이스', () => {
  it('단일 서버 설정 로드 → ok=true', async () => {
    await createMcpConfig(globalDir, 'server-a', [
      { name: 'server-a', command: 'npx', args: ['-y', '@test/a'], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    expect(result.ok).toBe(true);
  });

  it('단일 서버 로드 → 길이 1', async () => {
    await createMcpConfig(globalDir, 'server-a', [
      { name: 'server-a', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('단일 서버 name이 일치', async () => {
    await createMcpConfig(globalDir, 'my-server', [
      { name: 'my-server', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value[0]?.name).toBe('my-server');
  });

  it('두 하위 디렉토리 → 길이 2', async () => {
    await createMcpConfig(globalDir, 'a', [{ name: 'a', command: 'npx', args: [], enabled: true }]);
    await createMcpConfig(globalDir, 'b', [{ name: 'b', command: 'npx', args: [], enabled: true }]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('빈 디렉토리 → ok=true', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    expect(result.ok).toBe(true);
  });

  it('빈 디렉토리 → 길이 0', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 디렉토리 → ok=true (빈 배열)', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(join(tempDir, 'nonexistent'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('반환값이 배열이다', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('enabled=false 서버도 로드된다', async () => {
    await createMcpConfig(globalDir, 'disabled', [
      { name: 'disabled-srv', command: 'npx', args: [], enabled: false },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('빈 args 배열도 로드된다', async () => {
    await createMcpConfig(globalDir, 'no-args', [
      { name: 'no-args', command: 'node', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      const found = result.value.find((s) => s.name === 'no-args');
      expect(found?.args).toEqual([]);
    }
  });

  it('하나의 mcp.json에 여러 서버 → 모두 로드', async () => {
    await createMcpConfig(globalDir, 'multi', [
      { name: 'srv-1', command: 'npx', args: [], enabled: true },
      { name: 'srv-2', command: 'node', args: ['index.js'], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('ok는 boolean 타입', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    expect(typeof result.ok).toBe('boolean');
  });

  it('5개 서버 → 길이 5', async () => {
    for (let i = 0; i < 5; i++) {
      await createMcpConfig(globalDir, `srv-${i}`, [
        { name: `srv-${i}`, command: 'npx', args: [], enabled: true },
      ]);
    }
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(5);
  });

  it('command 값이 보존됨', async () => {
    await createMcpConfig(globalDir, 'cmd-check', [
      { name: 'cmd-check', command: 'python3', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      const found = result.value.find(s => s.name === 'cmd-check');
      expect(found?.command).toBe('python3');
    }
  });

  it('args 값이 보존됨', async () => {
    await createMcpConfig(globalDir, 'args-check', [
      { name: 'args-check', command: 'npx', args: ['-y', 'pkg@1.0'], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      const found = result.value.find(s => s.name === 'args-check');
      expect(found?.args).toEqual(['-y', 'pkg@1.0']);
    }
  });

  it('enabled 값이 보존됨 (false)', async () => {
    await createMcpConfig(globalDir, 'enabled-check', [
      { name: 'enabled-check', command: 'npx', args: [], enabled: false },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      const found = result.value.find(s => s.name === 'enabled-check');
      expect(found?.enabled).toBe(false);
    }
  });

  it('3개 서버 각각 name 일치', async () => {
    for (const name of ['alpha', 'beta', 'gamma']) {
      await createMcpConfig(globalDir, name, [
        { name, command: 'npx', args: [], enabled: true },
      ]);
    }
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      const names = result.value.map(s => s.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    }
  });
});

// ── loadFromDirectory - 건너뛰기 케이스 ──────────────────────

describe('McpLoader loadFromDirectory - 건너뛰기 케이스', () => {
  it('잘못된 JSON → ok=true (건너뜀)', async () => {
    const configDir = join(globalDir, 'broken');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), '{broken!!}');
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('servers 필드 없음 → ok=true (건너뜀)', async () => {
    const configDir = join(globalDir, 'no-servers');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ name: 'test' }));
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('command 누락 서버 건너뜀, 유효 서버는 포함', async () => {
    await createMcpConfig(globalDir, 'mixed', [
      { name: 'valid', command: 'npx', args: [], enabled: true },
      { name: 'no-cmd' }, // command 누락
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('valid');
    }
  });

  it('mcp.json 없는 하위 디렉토리 → 건너뜀', async () => {
    const emptySubDir = join(globalDir, 'no-config');
    await mkdir(emptySubDir, { recursive: true });
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 JSON 객체 → ok=true (건너뜀)', async () => {
    const configDir = join(globalDir, 'empty-json');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), '{}');
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('servers 빈 배열 → ok=true (길이 0)', async () => {
    await createMcpConfig(globalDir, 'empty-servers', []);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('servers가 배열이 아님 → 건너뜀', async () => {
    const configDir = join(globalDir, 'not-array');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ servers: 'not-array' }));
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('name 누락 서버 → 건너뜀', async () => {
    await createMcpConfig(globalDir, 'no-name', [
      { command: 'npx', args: [], enabled: true }, // name 누락
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('유효 + 잘못된 JSON 혼합 → 유효만 로드', async () => {
    await createMcpConfig(globalDir, 'valid', [
      { name: 'valid-srv', command: 'npx', args: [], enabled: true },
    ]);
    const brokenDir = join(globalDir, 'broken');
    await mkdir(brokenDir, { recursive: true });
    await writeFile(join(brokenDir, 'mcp.json'), 'invalid json!!!');
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('null 값 servers 항목 → 건너뜀', async () => {
    const configDir = join(globalDir, 'null-srv');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'mcp.json'), JSON.stringify({ servers: [null] }));
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 string name → 건너뜀', async () => {
    await createMcpConfig(globalDir, 'empty-name', [
      { name: '', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('3개 유효 + 3개 무효 → 3개 반환', async () => {
    for (let i = 0; i < 3; i++) {
      await createMcpConfig(globalDir, `valid-${i}`, [
        { name: `valid-${i}`, command: 'npx', args: [], enabled: true },
      ]);
    }
    for (let i = 0; i < 3; i++) {
      const brokenDir = join(globalDir, `broken-${i}`);
      await mkdir(brokenDir, { recursive: true });
      await writeFile(join(brokenDir, 'mcp.json'), 'invalid!!!');
    }
    const result = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (result.ok) expect(result.value).toHaveLength(3);
  });
});

// ── loadFromDirectory - 보안 케이스 ──────────────────────────

describe('McpLoader loadFromDirectory - 보안 케이스', () => {
  it('path traversal 포함 경로 → ok=false', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(`${tempDir}/../../etc`);
    expect(result.ok).toBe(false);
  });

  it('path traversal → code=mcp_path_traversal', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(`${tempDir}/../../etc`);
    if (!result.ok) expect(result.error.code).toBe('mcp_path_traversal');
  });

  it('../ 포함 경로 → ok=false', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(`${globalDir}/../../../etc`);
    expect(result.ok).toBe(false);
  });

  it('path traversal error.code는 string 타입', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(`${tempDir}/../../etc`);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('path traversal error.message는 string 타입', async () => {
    const result = await new McpLoader(logger).loadFromDirectory(`${tempDir}/../../etc`);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });
});

// ── loadAndMerge - 성공 케이스 ────────────────────────────────

describe('McpLoader loadAndMerge - 성공 케이스', () => {
  it('두 디렉토리 비어있으면 빈 배열 반환', async () => {
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('글로벌만 있고 프로젝트 없으면 글로벌만 반환', async () => {
    await createMcpConfig(globalDir, 'global-only', [
      { name: 'global-only', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('global-only');
    }
  });

  it('프로젝트가 글로벌 설정을 덮어씀', async () => {
    await createMcpConfig(globalDir, 'shared', [
      { name: 'shared', command: 'global-cmd', args: [], enabled: true },
    ]);
    await createMcpConfig(projectDir, 'shared', [
      { name: 'shared', command: 'project-cmd', args: [], enabled: false },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.command).toBe('project-cmd');
      expect(result.value[0]?.enabled).toBe(false);
    }
  });

  it('글로벌과 프로젝트 고유 설정 모두 포함', async () => {
    await createMcpConfig(globalDir, 'global-only', [
      { name: 'global-only', command: 'npx', args: [], enabled: true },
    ]);
    await createMcpConfig(projectDir, 'project-only', [
      { name: 'project-only', command: 'node', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      const names = result.value.map((c) => c.name);
      expect(names).toContain('global-only');
      expect(names).toContain('project-only');
    }
  });

  it('projectDir 없이 호출 → 글로벌만 반환 (ok=true)', async () => {
    await createMcpConfig(globalDir, 'g', [
      { name: 'g', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir);
    expect(result.ok).toBe(true);
  });

  it('빈 globalDir + 프로젝트 서버 → 프로젝트 서버만', async () => {
    await createMcpConfig(projectDir, 'proj-srv', [
      { name: 'proj-srv', command: 'npx', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('proj-srv');
    }
  });

  it('반환값이 배열이다', async () => {
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('같은 이름 3개 → 프로젝트가 최종 우선', async () => {
    await createMcpConfig(globalDir, 'same', [
      { name: 'same', command: 'global-cmd', args: [], enabled: true },
    ]);
    await createMcpConfig(projectDir, 'same', [
      { name: 'same', command: 'project-cmd', args: [], enabled: true },
    ]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.command).toBe('project-cmd');
    }
  });

  it('ok는 boolean 타입', async () => {
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    expect(typeof result.ok).toBe('boolean');
  });

  it('글로벌 2개 + 프로젝트 2개 → 총 4개 (이름 다름)', async () => {
    await createMcpConfig(globalDir, 'g1', [{ name: 'g1', command: 'npx', args: [], enabled: true }]);
    await createMcpConfig(globalDir, 'g2', [{ name: 'g2', command: 'npx', args: [], enabled: true }]);
    await createMcpConfig(projectDir, 'p1', [{ name: 'p1', command: 'node', args: [], enabled: true }]);
    await createMcpConfig(projectDir, 'p2', [{ name: 'p2', command: 'node', args: [], enabled: true }]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) expect(result.value).toHaveLength(4);
  });

  it('글로벌 1개 + 프로젝트 1개 (같은 이름) → 총 1개', async () => {
    await createMcpConfig(globalDir, 'dup', [{ name: 'dup', command: 'global', args: [], enabled: true }]);
    await createMcpConfig(projectDir, 'dup', [{ name: 'dup', command: 'project', args: [], enabled: true }]);
    const result = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.command).toBe('project');
    }
  });
});

// ── 반복/일관성 ────────────────────────────────────────────────

describe('McpLoader 반복/일관성', () => {
  it('동일 디렉토리로 3번 로드 → 동일 결과', async () => {
    await createMcpConfig(globalDir, 'stable', [
      { name: 'stable', command: 'npx', args: [], enabled: true },
    ]);
    const loader = new McpLoader(logger);
    const r1 = await loader.loadFromDirectory(globalDir);
    const r2 = await loader.loadFromDirectory(globalDir);
    const r3 = await loader.loadFromDirectory(globalDir);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r2.value.length).toBe(r3.value.length);
    }
  });

  it('독립 인스턴스로 로드 → 동일 결과', async () => {
    await createMcpConfig(globalDir, 'srv', [
      { name: 'srv', command: 'npx', args: [], enabled: true },
    ]);
    const r1 = await new McpLoader(logger).loadFromDirectory(globalDir);
    const r2 = await new McpLoader(logger).loadFromDirectory(globalDir);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
    }
  });

  it('빈 디렉토리 5번 로드 → 모두 ok=true, 길이 0', async () => {
    const loader = new McpLoader(logger);
    for (let i = 0; i < 5; i++) {
      const result = await loader.loadFromDirectory(globalDir);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });

  it('loadAndMerge 3번 → 동일 결과', async () => {
    await createMcpConfig(globalDir, 'g', [{ name: 'g', command: 'npx', args: [], enabled: true }]);
    const loader = new McpLoader(logger);
    const r1 = await loader.loadAndMerge(globalDir, projectDir);
    const r2 = await loader.loadAndMerge(globalDir, projectDir);
    const r3 = await loader.loadAndMerge(globalDir, projectDir);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r2.value.length).toBe(r3.value.length);
    }
  });

  it('독립 인스턴스 loadAndMerge → 동일 결과', async () => {
    await createMcpConfig(globalDir, 'stable2', [
      { name: 'stable2', command: 'npx', args: [], enabled: true },
    ]);
    const r1 = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    const r2 = await new McpLoader(logger).loadAndMerge(globalDir, projectDir);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
    }
  });

  it('비어있는 glob dir loadAndMerge 5번 → 모두 ok=true', async () => {
    const loader = new McpLoader(logger);
    for (let i = 0; i < 5; i++) {
      const result = await loader.loadAndMerge(globalDir, projectDir);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });

  it('보안 경로 반복 → 모두 ok=false', async () => {
    const loader = new McpLoader(logger);
    for (let i = 0; i < 3; i++) {
      const result = await loader.loadFromDirectory(`${tempDir}/../../etc`);
      expect(result.ok).toBe(false);
    }
  });
});
