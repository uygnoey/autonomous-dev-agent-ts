import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectCrudHandler } from 'cli/commands/project-crud.js';
import type { DuplicateProjectInfo } from 'cli/commands/project-crud.js';
import { ConsoleLogger } from 'core/logger.js';

const logger = new ConsoleLogger('error');

describe('ProjectCrudHandler — .adev/ scaffold (PI-006)', () => {
  let tmpDir: string;
  let registryDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `adev-scaffold-${crypto.randomUUID()}`);
    registryDir = join(tmpDir, 'registry');
    mkdirSync(registryDir, { recursive: true });
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

  it('[normal] handleAdd 후 전체 디렉토리 구조 생성됨', async () => {
    const projectPath = join(tmpDir, 'my-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    const result = await handler.handleAdd([projectPath]);
    expect(result.ok).toBe(true);

    // 서브디렉토리 확인
    const subdirs = ['agents', 'sessions', 'mcp', 'skills', 'templates'];
    for (const subdir of subdirs) {
      expect(existsSync(join(projectPath, '.adev', subdir))).toBe(true);
    }

    // data 디렉토리 확인
    expect(existsSync(join(projectPath, '.adev', 'data', 'memory'))).toBe(true);
    expect(existsSync(join(projectPath, '.adev', 'data', 'code-index'))).toBe(true);
  });

  it('[normal] handleAdd 후 config.json 생성됨', async () => {
    const projectPath = join(tmpDir, 'config-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    await handler.handleAdd([projectPath]);

    const configPath = join(projectPath, '.adev', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.log.level).toBe('info');
    expect(config.embedding.default).toBe('xenova-minilm');
  });

  it('[normal] handleAdd 후 7개 agent.md 생성됨', async () => {
    const projectPath = join(tmpDir, 'agent-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    await handler.handleAdd([projectPath]);

    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agentNames) {
      const agentPath = join(projectPath, '.adev', 'agents', `${name}.md`);
      expect(existsSync(agentPath)).toBe(true);
      const content = readFileSync(agentPath, 'utf-8');
      expect(content).toContain(`# ${name} Agent`);
    }
  });

  it('[edge] handleAdd에서 프로젝트 경로 없음 → 에러', async () => {
    const handler = new ProjectCrudHandler(logger, registryDir);
    const result = await handler.handleAdd([]);
    expect(result.ok).toBe(false);
  });

  it('[edge] 중복 등록 → cli_project_duplicate 에러 + duplicateInfo 포함', async () => {
    const projectPath = join(tmpDir, 'dup-project');
    mkdirSync(projectPath, { recursive: true });

    const handler = new ProjectCrudHandler(logger, registryDir);
    const first = await handler.handleAdd([projectPath]);
    expect(first.ok).toBe(true);

    const second = await handler.handleAdd([projectPath]);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('cli_project_duplicate');
      // WHY: duplicateInfo가 에러에 첨부되어 CLI에서 유저 선택지 제시 가능
      const info = (second.error as unknown as { duplicateInfo: DuplicateProjectInfo })
        .duplicateInfo;
      expect(info).toBeDefined();
      expect(info.suggestedActions).toEqual(['rename', 'update', 'cancel']);
      expect(info.existingName).toBe('dup-project');
    }
  });

  it('[edge] 기존 config.json 있으면 덮어쓰지 않음', async () => {
    const projectPath = join(tmpDir, 'existing-config');
    mkdirSync(projectPath, { recursive: true });
    const adevPath = join(projectPath, '.adev');
    mkdirSync(adevPath, { recursive: true });
    writeFileSync(join(adevPath, 'config.json'), '{"custom": true}', 'utf-8');

    const handler = new ProjectCrudHandler(logger, registryDir);
    await handler.handleAdd([projectPath]);

    const config = JSON.parse(readFileSync(join(adevPath, 'config.json'), 'utf-8'));
    expect(config.custom).toBe(true);
  });

  it('[edge] 기존 agent.md 있으면 덮어쓰지 않음', async () => {
    const projectPath = join(tmpDir, 'existing-agent');
    mkdirSync(projectPath, { recursive: true });
    const agentsPath = join(projectPath, '.adev', 'agents');
    mkdirSync(agentsPath, { recursive: true });
    writeFileSync(join(agentsPath, 'coder.md'), '# Custom Coder', 'utf-8');

    const handler = new ProjectCrudHandler(logger, registryDir);
    await handler.handleAdd([projectPath]);

    const content = readFileSync(join(agentsPath, 'coder.md'), 'utf-8');
    expect(content).toBe('# Custom Coder');
  });
});
