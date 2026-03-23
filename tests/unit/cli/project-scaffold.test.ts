import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectCrudHandler } from 'cli/commands/project-crud.js';
import { ConsoleLogger } from 'core/logger.js';

const logger = new ConsoleLogger('error');

describe('ProjectCrudHandler — .adev/ scaffold (PI-006)', () => {
  let tmpDir: string;
  let registryDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `adev-scaffold-${crypto.randomUUID()}`);
    registryDir = join(tmpDir, 'registry');
    mkdirSync(registryDir, { recursive: true });
    // WHY: 빈 projects.json 생성하여 레지스트리 초기화
    writeFileSync(
      join(registryDir, 'projects.json'),
      JSON.stringify({ activeProject: null, projects: [] }),
    );
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 정리 실패 무시
    }
  });

  it('[normal] handleAdd 후 .adev/ 서브디렉토리 5개 생성됨', async () => {
    const projectPath = join(tmpDir, 'my-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    const result = await handler.handleAdd([projectPath]);
    expect(result.ok).toBe(true);

    const subdirs = ['agents', 'sessions', 'mcp', 'skills', 'templates'];
    for (const subdir of subdirs) {
      expect(existsSync(join(projectPath, '.adev', subdir))).toBe(true);
    }
  });

  it('[edge] handleAdd에서 프로젝트 경로 없음 → 에러', async () => {
    const handler = new ProjectCrudHandler(logger, registryDir);
    const result = await handler.handleAdd([]);
    expect(result.ok).toBe(false);
  });

  it('[edge] 중복 등록 → 에러 (scaffold 미실행)', async () => {
    const projectPath = join(tmpDir, 'dup-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    const first = await handler.handleAdd([projectPath]);
    expect(first.ok).toBe(true);

    const second = await handler.handleAdd([projectPath]);
    expect(second.ok).toBe(false);
  });
});
