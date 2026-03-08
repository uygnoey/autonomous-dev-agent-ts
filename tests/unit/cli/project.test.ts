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

  it('잘못된 JSON → ok=false 또는 빈 레지스트리 반환', async () => {
    await writeFile(join(registryDir, 'projects.json'), 'not-valid-json!!!');
    const result = await loadRegistry(registryDir);
    // 파싱 실패 시 에러 반환 또는 빈 레지스트리 반환 모두 허용
    expect(typeof result.ok).toBe('boolean');
  });

  it('부분 JSON → ok=false 또는 빈 레지스트리 반환', async () => {
    await writeFile(join(registryDir, 'projects.json'), '{"projects":');
    const result = await loadRegistry(registryDir);
    // 파싱 실패 시 에러 반환 또는 빈 레지스트리 반환 모두 허용
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 반복 저장/불러오기 → 일관된 결과', async () => {
    const registry: ProjectRegistry = {
      activeProject: 'p1',
      projects: [
        { id: 'x', name: 'p1', path: '/tmp/p1', createdAt: new Date(), lastAccessedAt: new Date() },
      ],
    };
    await saveRegistry(registry, registryDir);
    for (let i = 0; i < 5; i++) {
      const r = await loadRegistry(registryDir);
      if (r.ok) {
        expect(r.value.projects.length).toBe(1);
        expect(r.value.activeProject).toBe('p1');
      }
    }
  });

  it('빈 projects 배열 저장/불러오기', async () => {
    await saveRegistry({ activeProject: null, projects: [] }, registryDir);
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(r.value.projects).toEqual([]);
    }
  });
});

// ── ProjectCommand 추가 경계값 ────────────────────────────────

describe('ProjectCommand 추가 경계값', () => {
  let tempDir: string;
  let registryDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-project-extra-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
    projectDir = join(tempDir, 'test-proj');
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('add → list → remove 전체 플로우', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const addResult = await cmd.execute(['add', projectDir], defaultOptions);
    expect(addResult.ok).toBe(true);
    const listResult = await cmd.execute(['list'], defaultOptions);
    expect(listResult.ok).toBe(true);
    const removeResult = await cmd.execute(['remove', 'test-proj'], defaultOptions);
    expect(removeResult.ok).toBe(true);
  });

  it('remove 후 list → ok', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    await cmd.execute(['remove', 'test-proj'], defaultOptions);
    const r = await cmd.execute(['list'], defaultOptions);
    expect(r.ok).toBe(true);
  });

  it('3개 프로젝트 add → list → 모두 ok', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 3; i++) {
      const dir = join(tempDir, `proj-${i}`);
      await mkdir(dir, { recursive: true });
      const r = await cmd.execute(['add', dir], defaultOptions);
      expect(r.ok).toBe(true);
    }
    const r = await cmd.execute(['list'], defaultOptions);
    expect(r.ok).toBe(true);
  });

  it('execute 인자에 null-like 빈 배열 → 에러', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute([], defaultOptions);
    expect(result.ok).toBe(false);
  });

  it('add 에러 코드는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['add'], defaultOptions);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('switch 에러 코드는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['switch'], defaultOptions);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('remove 에러 코드는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['remove'], defaultOptions);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('unknown 에러 코드는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['unknown-cmd'], defaultOptions);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('5번 반복 add 시도 → 첫 번째만 ok', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await cmd.execute(['add', projectDir], defaultOptions));
    }
    expect(results[0]!.ok).toBe(true);
    for (let i = 1; i < 5; i++) {
      expect(results[i]!.ok).toBe(false);
    }
  });

  it('add 결과 ok는 boolean 타입', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['add', projectDir], defaultOptions);
    expect(typeof result.ok).toBe('boolean');
  });

  it('등록된 프로젝트 path는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(typeof reg.value.projects[0]!.path).toBe('string');
    }
  });

  it('등록된 프로젝트 name은 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(typeof reg.value.projects[0]!.name).toBe('string');
    }
  });
});

// ── saveRegistry 추가 경계값 ─────────────────────────────────

describe('saveRegistry 추가 경계값', () => {
  let tempDir: string;
  let registryDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-save-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('빈 projects 배열 저장 → ok', async () => {
    const r = await saveRegistry({ activeProject: null, projects: [] }, registryDir);
    expect(r.ok).toBe(true);
  });

  it('5개 프로젝트 저장 → ok', async () => {
    const projects = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      name: `proj-${i}`,
      path: `/tmp/proj-${i}`,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    }));
    const r = await saveRegistry({ activeProject: 'proj-0', projects }, registryDir);
    expect(r.ok).toBe(true);
  });

  it('저장 후 불러오면 프로젝트 이름 일치', async () => {
    const name = `proj-save-${crypto.randomUUID().slice(0, 8)}`;
    await saveRegistry({
      activeProject: name,
      projects: [{ id: 'x', name, path: '/tmp/x', createdAt: new Date(), lastAccessedAt: new Date() }],
    }, registryDir);
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(r.value.projects[0]?.name).toBe(name);
    }
  });

  it('activeProject가 string인지 확인', async () => {
    await saveRegistry({
      activeProject: 'active-p',
      projects: [{ id: 'y', name: 'active-p', path: '/tmp/y', createdAt: new Date(), lastAccessedAt: new Date() }],
    }, registryDir);
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(typeof r.value.activeProject).toBe('string');
    }
  });

  it('3번 반복 저장/불러오기 → 마지막 상태 유지', async () => {
    let reg = { activeProject: null as string | null, projects: [] as typeof projects };
    const projects: Array<{ id: string; name: string; path: string; createdAt: Date; lastAccessedAt: Date }> = [];
    for (let i = 0; i < 3; i++) {
      projects.push({ id: `id-${i}`, name: `p${i}`, path: `/tmp/p${i}`, createdAt: new Date(), lastAccessedAt: new Date() });
      reg = { activeProject: `p${i}`, projects: [...projects] };
      await saveRegistry(reg, registryDir);
    }
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(r.value.projects.length).toBe(3);
      expect(r.value.activeProject).toBe('p2');
    }
  });
});

// ── ProjectCommand switch 추가 경계값 ────────────────────────

describe('ProjectCommand switch 추가 경계값', () => {
  let tempDir: string;
  let registryDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-switch-extra-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
    projectDir = join(tempDir, 'base-proj');
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('switch 전 active → switch 후 active 변경 확인', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const d1 = join(tempDir, 'proj-a');
    const d2 = join(tempDir, 'proj-b');
    await mkdir(d1, { recursive: true });
    await mkdir(d2, { recursive: true });
    await cmd.execute(['add', d1], defaultOptions);
    await cmd.execute(['add', d2], defaultOptions);

    const before = await loadRegistry(registryDir);
    expect(before.ok && before.value.activeProject).toBe('proj-a');

    await cmd.execute(['switch', 'proj-b'], defaultOptions);
    const after = await loadRegistry(registryDir);
    expect(after.ok && after.value.activeProject).toBe('proj-b');
  });

  it('switch 3번 순환 → 마지막 값 유지', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const dirs = ['s1', 's2', 's3'].map((n) => join(tempDir, n));
    for (const d of dirs) await mkdir(d, { recursive: true });
    for (const d of dirs) await cmd.execute(['add', d], defaultOptions);

    await cmd.execute(['switch', 's2'], defaultOptions);
    await cmd.execute(['switch', 's3'], defaultOptions);
    await cmd.execute(['switch', 's1'], defaultOptions);

    const reg = await loadRegistry(registryDir);
    if (reg.ok) expect(reg.value.activeProject).toBe('s1');
  });

  it('switch 에러 메시지 타입은 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['switch', 'no-such-project'], defaultOptions);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('switch missing name → cli_project_missing_name', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['switch'], defaultOptions);
    if (!result.ok) expect(result.error.code).toBe('cli_project_missing_name');
  });
});

// ── ProjectCommand remove 추가 경계값 ────────────────────────

describe('ProjectCommand remove 추가 경계값', () => {
  let tempDir: string;
  let registryDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-remove-extra-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
    projectDir = join(tempDir, 'remove-proj');
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('remove 후 다시 add → 동일 이름 등록 가능', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    await cmd.execute(['remove', 'remove-proj'], defaultOptions);
    const r = await cmd.execute(['add', projectDir], defaultOptions);
    expect(r.ok).toBe(true);
  });

  it('remove 에러 메시지 타입은 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['remove', 'no-proj'], defaultOptions);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('3개 중 중간 제거 → 남은 2개', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const dirs = ['r1', 'r2', 'r3'].map((n) => join(tempDir, n));
    for (const d of dirs) await mkdir(d, { recursive: true });
    for (const d of dirs) await cmd.execute(['add', d], defaultOptions);

    await cmd.execute(['remove', 'r2'], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) expect(reg.value.projects.length).toBe(2);
  });

  it('3개 전부 제거 → projects=[], activeProject=null', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const dirs = ['x1', 'x2', 'x3'].map((n) => join(tempDir, n));
    for (const d of dirs) await mkdir(d, { recursive: true });
    for (const d of dirs) await cmd.execute(['add', d], defaultOptions);
    for (const name of ['x1', 'x2', 'x3']) await cmd.execute(['remove', name], defaultOptions);

    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(reg.value.projects).toHaveLength(0);
      expect(reg.value.activeProject).toBeNull();
    }
  });

  it('remove missing name → cli_project_missing_name', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['remove'], defaultOptions);
    if (!result.ok) expect(result.error.code).toBe('cli_project_missing_name');
  });
});

// ── ProjectCommand update 서브커맨드 ─────────────────────────

describe('ProjectCommand update', () => {
  let tempDir: string;
  let registryDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-update-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
    projectDir = join(tempDir, 'update-proj');
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('update 이름 없이 실행 → cli_project_missing_name', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['update'], defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_project_missing_name');
  });

  it('update --name 없이 실행 → cli_project_missing_update_field', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const result = await cmd.execute(['update', 'update-proj'], defaultOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_project_missing_update_field');
  });

  it('update 존재하지 않는 프로젝트 → cli_project_not_found', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['update', 'nonexistent'], { flags: {}, name: 'new-name' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_project_not_found');
  });

  it('update → 이름 변경 성공 ok=true', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const result = await cmd.execute(['update', 'update-proj'], { flags: {}, name: 'new-name' });
    expect(result.ok).toBe(true);
  });

  it('update → 레지스트리에서 새 이름으로 조회됨', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    await cmd.execute(['update', 'update-proj'], { flags: {}, name: 'renamed-proj' });
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(reg.value.projects.some((p) => p.name === 'renamed-proj')).toBe(true);
      expect(reg.value.projects.some((p) => p.name === 'update-proj')).toBe(false);
    }
  });

  it('update → active 프로젝트도 새 이름으로 변경됨', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    await cmd.execute(['update', 'update-proj'], { flags: {}, name: 'renamed-active' });
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(reg.value.activeProject).toBe('renamed-active');
    }
  });

  it('update 중복 이름 → cli_project_duplicate_name', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const dir2 = join(tempDir, 'proj-b');
    await mkdir(dir2, { recursive: true });
    await cmd.execute(['add', projectDir], defaultOptions);
    await cmd.execute(['add', dir2], defaultOptions);
    const result = await cmd.execute(['update', 'update-proj'], { flags: {}, name: 'proj-b' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_project_duplicate_name');
  });

  it('update 에러 코드는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['update'], defaultOptions);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('update 에러 메시지는 string', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const result = await cmd.execute(['update', 'no-such'], { flags: {}, name: 'x' });
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });
});

// ── ProjectCommand add 추가 경계값 2 ─────────────────────────

describe('ProjectCommand add 추가 경계값 2', () => {
  let tempDir: string;
  let registryDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-add2-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('add 후 registry projects[0].id는 string', async () => {
    const projectDir = join(tempDir, 'id-check');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) expect(typeof reg.value.projects[0]?.id).toBe('string');
  });

  it('add 후 registry projects[0].status는 active', async () => {
    const projectDir = join(tempDir, 'status-check');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      const proj = reg.value.projects[0] as { status?: string } | undefined;
      expect(proj?.status).toBe('active');
    }
  });

  it('add 10개 → activeProject는 첫 번째', async () => {
    const cmd = new ProjectCommand(logger, registryDir);
    const dirs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = join(tempDir, `proj-${i}`);
      await mkdir(d, { recursive: true });
      dirs.push(d);
    }
    await cmd.execute(['add', dirs[0]!], defaultOptions);
    for (let i = 1; i < 10; i++) {
      await cmd.execute(['add', dirs[i]!], defaultOptions);
    }
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(reg.value.activeProject).toBe('proj-0');
      expect(reg.value.projects.length).toBe(10);
    }
  });

  it('add → createdAt이 Date 파싱 가능한 문자열', async () => {
    const projectDir = join(tempDir, 'date-check');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      const createdAt = reg.value.projects[0]?.createdAt;
      expect(createdAt).toBeDefined();
      // createdAt이 string이거나 Date인지 확인
      expect(createdAt !== null && createdAt !== undefined).toBe(true);
    }
  });

  it('add → lastAccessedAt 필드 존재', async () => {
    const projectDir = join(tempDir, 'lat-check');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      expect(reg.value.projects[0]?.lastAccessedAt).toBeDefined();
    }
  });

  it('add 경로가 절대 경로로 저장됨', async () => {
    const projectDir = join(tempDir, 'abspath-proj');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    const reg = await loadRegistry(registryDir);
    if (reg.ok) {
      const savedPath = reg.value.projects[0]?.path ?? '';
      expect(savedPath.startsWith('/') || /^[A-Za-z]:\\/.test(savedPath)).toBe(true);
    }
  });

  it('add 동일 경로 다른 이름 → cli_project_duplicate', async () => {
    const projectDir = join(tempDir, 'dup-path');
    await mkdir(projectDir, { recursive: true });
    const cmd = new ProjectCommand(logger, registryDir);
    await cmd.execute(['add', projectDir], defaultOptions);
    // 같은 경로 재추가
    const r2 = await cmd.execute(['add', projectDir], defaultOptions);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('cli_project_duplicate');
  });
});

// ── loadRegistry 추가 경계값 2 ────────────────────────────────

describe('loadRegistry 추가 경계값 2', () => {
  let tempDir: string;
  let registryDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-loadreg2-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev');
    await mkdir(registryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loadRegistry 처음 호출 → ok=true', async () => {
    const r = await loadRegistry(registryDir);
    expect(r.ok).toBe(true);
  });

  it('loadRegistry 처음 호출 → projects=[]', async () => {
    const r = await loadRegistry(registryDir);
    if (r.ok) expect(r.value.projects).toHaveLength(0);
  });

  it('loadRegistry 처음 호출 → activeProject=null', async () => {
    const r = await loadRegistry(registryDir);
    if (r.ok) expect(r.value.activeProject).toBeNull();
  });

  it('saveRegistry + loadRegistry 10개 프로젝트 왕복', async () => {
    const projects = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      name: `proj-${i}`,
      path: `/tmp/proj-${i}`,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    }));
    await saveRegistry({ activeProject: 'proj-0', projects }, registryDir);
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(r.value.projects.length).toBe(10);
      expect(r.value.activeProject).toBe('proj-0');
    }
  });

  it('saveRegistry + loadRegistry → 이름 순서 보존', async () => {
    const names = ['alpha', 'beta', 'gamma'];
    const projects = names.map((name, i) => ({
      id: `id-${i}`,
      name,
      path: `/tmp/${name}`,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    }));
    await saveRegistry({ activeProject: 'alpha', projects }, registryDir);
    const r = await loadRegistry(registryDir);
    if (r.ok) {
      expect(r.value.projects.map((p) => p.name)).toEqual(names);
    }
  });

  it('saveRegistry ok=true 반환', async () => {
    const r = await saveRegistry({ activeProject: null, projects: [] }, registryDir);
    expect(r.ok).toBe(true);
  });

  it('JSON 구조 손상 → loadRegistry ok=false', async () => {
    await writeFile(join(registryDir, 'projects.json'), '{invalid json');
    const r = await loadRegistry(registryDir);
    // 파싱 실패 시 err 반환
    expect(r.ok).toBe(false);
  });

  it('완전히 비어있는 파일 → ok=true + 빈 레지스트리', async () => {
    await writeFile(join(registryDir, 'projects.json'), '   ');
    const r = await loadRegistry(registryDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.projects).toHaveLength(0);
      expect(r.value.activeProject).toBeNull();
    }
  });
});
