import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectCommand } from '../../../src/cli/commands/project.js';
import { loadRegistry, saveRegistry } from '../../../src/cli/commands/project.js';
import type { CliOptions, ProjectRegistry } from '../../../src/cli/types.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ────────────────────────────────

const logger = new ConsoleLogger('error');

const defaultOptions: CliOptions = { flags: {} };

// ── ProjectCommand ────────────────────────────────────────────

describe('ProjectCommand', () => {
  let tempDir: string;
  let registryDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-project-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });

    projectDir = join(tempDir, 'my-project');
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── add ─────────────────────────────────────────────────────

  describe('add', () => {
    it('프로젝트를 레지스트리에 등록한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['add', projectDir], defaultOptions);

      expect(result.ok).toBe(true);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.projects.length).toBe(1);
        expect(regResult.value.projects[0]!.name).toBe('my-project');
        expect(regResult.value.projects[0]!.path).toBe(projectDir);
      }
    });

    it('첫 번째 프로젝트를 active로 설정한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBe('my-project');
      }
    });

    it('중복 프로젝트 등록 시 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);

      const result = await cmd.execute(['add', projectDir], defaultOptions);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_duplicate');
      }
    });

    it('경로 없이 실행하면 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['add'], defaultOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_missing_path');
      }
    });
  });

  // ── remove ──────────────────────────────────────────────────

  describe('remove', () => {
    it('등록된 프로젝트를 삭제한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);

      const result = await cmd.execute(['remove', 'my-project'], defaultOptions);
      expect(result.ok).toBe(true);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.projects.length).toBe(0);
      }
    });

    it('존재하지 않는 프로젝트 삭제 시 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['remove', 'nonexistent'], defaultOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_not_found');
      }
    });

    it('active 프로젝트 삭제 시 다른 프로젝트를 active로 전환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const otherDir = join(tempDir, 'other-project');
      await mkdir(otherDir, { recursive: true });

      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', otherDir], defaultOptions);

      // my-project가 active -> 삭제하면 other-project가 active
      await cmd.execute(['remove', 'my-project'], defaultOptions);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBe('other-project');
      }
    });

    it('마지막 프로젝트 삭제 시 activeProject를 null로 설정한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['remove', 'my-project'], defaultOptions);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBeNull();
      }
    });

    it('이름 없이 실행하면 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['remove'], defaultOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_missing_name');
      }
    });
  });

  // ── list ────────────────────────────────────────────────────

  describe('list', () => {
    it('빈 목록을 표시한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['list'], defaultOptions);

      expect(result.ok).toBe(true);
    });

    it('여러 프로젝트를 표시한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const otherDir = join(tempDir, 'other-project');
      await mkdir(otherDir, { recursive: true });

      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', otherDir], defaultOptions);

      const result = await cmd.execute(['list'], defaultOptions);
      expect(result.ok).toBe(true);
    });
  });

  // ── switch ──────────────────────────────────────────────────

  describe('switch', () => {
    it('활성 프로젝트를 전환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const otherDir = join(tempDir, 'other-project');
      await mkdir(otherDir, { recursive: true });

      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', otherDir], defaultOptions);

      const result = await cmd.execute(['switch', 'other-project'], defaultOptions);
      expect(result.ok).toBe(true);

      const regResult = await loadRegistry(registryDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBe('other-project');
      }
    });

    it('존재하지 않는 프로젝트로 전환 시 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['switch', 'nonexistent'], defaultOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_not_found');
      }
    });

    it('이름 없이 실행하면 에러를 반환한다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['switch'], defaultOptions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_missing_name');
      }
    });
  });

  // ── 서브커맨드 검증 ─────────────────────────────────────────

  it('서브커맨드 없이 실행하면 에러를 반환한다', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute([], defaultOptions);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_project_missing_subcommand');
    }
  });

  it('알 수 없는 서브커맨드는 에러를 반환한다', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['unknown'], defaultOptions);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_project_unknown_subcommand');
    }
  });
});

// ── loadRegistry / saveRegistry ───────────────────────────────

describe('loadRegistry', () => {
  let tempDir: string;
  let registryDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-reg-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('파일이 없으면 빈 레지스트리를 반환한다', async () => {
    const result = await loadRegistry(registryDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projects.length).toBe(0);
      expect(result.value.activeProject).toBeNull();
    }
  });

  it('빈 파일이면 빈 레지스트리를 반환한다', async () => {
    await writeFile(join(registryDir, 'projects.json'), '');

    const result = await loadRegistry(registryDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projects.length).toBe(0);
    }
  });

  it('올바른 레지스트리 파일을 파싱한다', async () => {
    const registry: ProjectRegistry = {
      activeProject: 'test-proj',
      projects: [
        {
          id: 'uuid-1',
          name: 'test-proj',
          path: '/tmp/test',
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        },
      ],
    };
    await saveRegistry(registry, registryDir);

    const result = await loadRegistry(registryDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.activeProject).toBe('test-proj');
      expect(result.value.projects.length).toBe(1);
    }
  });
});
