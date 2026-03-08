import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectCommand } from 'cli/commands/project.js';
import { loadRegistry, saveRegistry } from 'cli/commands/project.js';
import type { CliOptions, ProjectRegistry } from 'cli/types.js';
import { ConsoleLogger } from 'core/logger.js';

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

  // ── 생성자 ──────────────────────────────────────────────────

  describe('ProjectCommand 생성자', () => {
    it('인스턴스 생성됨', () => {
      expect(() => new ProjectCommand(logger, registryDir)).not.toThrow();
    });

    it('ProjectCommand 인스턴스', () => {
      expect(new ProjectCommand(logger, registryDir)).toBeInstanceOf(ProjectCommand);
    });
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

    it('add ok=true 반환', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['add', projectDir], defaultOptions);
      expect(result.ok).toBe(true);
    });

    it('등록된 프로젝트에 id 필드가 있다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.projects[0]?.id).toBeDefined();
      }
    });

    it('등록된 프로젝트에 createdAt 필드가 있다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.projects[0]?.createdAt).toBeDefined();
      }
    });

    it('두 번째 프로젝트 등록 → 목록 2개', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const secondDir = join(tempDir, 'second-project');
      await mkdir(secondDir, { recursive: true });
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', secondDir], defaultOptions);
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.projects.length).toBe(2);
      }
    });

    it('두 번째 프로젝트 등록 → activeProject 변경 없음', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const secondDir = join(tempDir, 'second-project');
      await mkdir(secondDir, { recursive: true });
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', secondDir], defaultOptions);
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBe('my-project');
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

    it('삭제 후 재등록 → ok', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['remove', 'my-project'], defaultOptions);
      const result = await cmd.execute(['add', projectDir], defaultOptions);
      expect(result.ok).toBe(true);
    });

    it('삭제 에러 코드 cli_project_not_found', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const result = await cmd.execute(['remove', 'xyz-nonexistent'], defaultOptions);
      if (!result.ok) {
        expect(result.error.code).toBe('cli_project_not_found');
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

    it('list ok=true 반환', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      expect((await cmd.execute(['list'], defaultOptions)).ok).toBe(true);
    });

    it('연속 list 호출 → 모두 ok', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      await cmd.execute(['add', projectDir], defaultOptions);
      for (let i = 0; i < 3; i++) {
        const result = await cmd.execute(['list'], defaultOptions);
        expect(result.ok).toBe(true);
      }
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

    it('switch ok=true 반환', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const otherDir = join(tempDir, 'other-project');
      await mkdir(otherDir, { recursive: true });
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', otherDir], defaultOptions);
      const result = await cmd.execute(['switch', 'other-project'], defaultOptions);
      expect(result.ok).toBe(true);
    });

    it('switch → activeProject가 변경된다', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const otherDir = join(tempDir, 'switch-proj');
      await mkdir(otherDir, { recursive: true });
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', otherDir], defaultOptions);
      await cmd.execute(['switch', 'switch-proj'], defaultOptions);
      const reg = await loadRegistry(registryDir);
      if (reg.ok) {
        expect(reg.value.activeProject).toBe('switch-proj');
      }
    });

    it('switch 두 번 → 마지막 값 반영', async () => {
      const cmd = new ProjectCommand(logger, registryDir);
      const dir1 = join(tempDir, 'p1');
      const dir2 = join(tempDir, 'p2');
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });
      await cmd.execute(['add', projectDir], defaultOptions);
      await cmd.execute(['add', dir1], defaultOptions);
      await cmd.execute(['add', dir2], defaultOptions);
      await cmd.execute(['switch', 'p1'], defaultOptions);
      await cmd.execute(['switch', 'p2'], defaultOptions);
      const reg = await loadRegistry(registryDir);
      if (reg.ok) {
        expect(reg.value.activeProject).toBe('p2');
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

  it('알 수 없는 다양한 서브커맨드 → 모두 err', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const cmds = ['xyz', 'zzz', 'foo', '123'];
    for (const sub of cmds) {
      const result = await cmd.execute([sub], defaultOptions);
      expect(result.ok).toBe(false);
    }
  });

  it('missing_subcommand 에러 코드 확인', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute([], defaultOptions);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_project_missing_subcommand');
    }
  });

  it('unknown_subcommand 에러 메시지 확인', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['foobar'], defaultOptions);
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
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

  it('loadRegistry ok=true 반환', async () => {
    const result = await loadRegistry(registryDir);
    expect(result.ok).toBe(true);
  });

  it('반환값에 projects 배열이 있다', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(Array.isArray(result.value.projects)).toBe(true);
    }
  });

  it('반환값에 activeProject 필드가 있다', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect('activeProject' in result.value).toBe(true);
    }
  });

  it('저장 후 불러오면 projects 길이 일치', async () => {
    const registry: ProjectRegistry = {
      activeProject: null,
      projects: [
        { id: 'a', name: 'p1', path: '/tmp/p1', createdAt: new Date(), lastAccessedAt: new Date() },
        { id: 'b', name: 'p2', path: '/tmp/p2', createdAt: new Date(), lastAccessedAt: new Date() },
      ],
    };
    await saveRegistry(registry, registryDir);
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.projects.length).toBe(2);
    }
  });

  it('saveRegistry → ok', async () => {
    const registry: ProjectRegistry = { activeProject: null, projects: [] };
    const result = await saveRegistry(registry, registryDir);
    expect(result.ok).toBe(true);
  });

  it('activeProject=null 저장 후 불러오기', async () => {
    const registry: ProjectRegistry = { activeProject: null, projects: [] };
    await saveRegistry(registry, registryDir);
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.activeProject).toBeNull();
    }
  });

  it('activeProject 저장 후 불러오기', async () => {
    const registry: ProjectRegistry = {
      activeProject: 'my-proj',
      projects: [
        { id: 'x', name: 'my-proj', path: '/tmp/mp', createdAt: new Date(), lastAccessedAt: new Date() },
      ],
    };
    await saveRegistry(registry, registryDir);
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.activeProject).toBe('my-proj');
    }
  });

  it('연속 loadRegistry 호출 → 동일 결과', async () => {
    const r1 = await loadRegistry(registryDir);
    const r2 = await loadRegistry(registryDir);
    if (r1.ok && r2.ok) {
      expect(r1.value.projects.length).toBe(r2.value.projects.length);
    }
  });
});
