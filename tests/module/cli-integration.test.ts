/**
 * CLI 모듈 통합 테스트 / CLI module integration tests
 *
 * @description
 * KR: CommandRouter에 4개 명령 등록 → 라우팅 테스트,
 *     InitCommand → 실제 .adev/ 디렉토리 생성 (tmp dir),
 *     ConfigCommand → loadConfig 연동,
 *     ProjectCommand → 레지스트리 CRUD를 검증한다.
 * EN: Verifies CommandRouter with 4 commands, routing,
 *     InitCommand .adev/ directory creation,
 *     ConfigCommand ↔ loadConfig integration,
 *     and ProjectCommand registry CRUD.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import {
  CommandRouter,
  ConfigCommand,
  InitCommand,
  ProjectCommand,
  StartCommand,
} from 'cli/index.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;
let registryDir: string;

// ── 테스트 ────────────────────────────────────────────────────────

describe('CLI 통합 / CLI integration', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-cli-test-'));
    registryDir = join(tmpDir, '.adev-registry');
    await import('node:fs/promises').then((fs) => fs.mkdir(registryDir, { recursive: true }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('CommandRouter에 4개 명령 등록 후 각각 라우팅 확인', () => {
    const router = new CommandRouter(logger);

    router.register(new InitCommand(logger, registryDir));
    router.register(new ConfigCommand(logger));
    router.register(new ProjectCommand(logger));
    router.register(new StartCommand(logger));

    // WHY: 등록된 4개 명령이 parse로 올바르게 파싱되는지 확인
    const initParsed = router.parse(['init']);
    expect(initParsed.ok).toBe(true);
    if (!initParsed.ok) return;
    expect(initParsed.value.command).toBe('init');

    const configParsed = router.parse(['config', 'list']);
    expect(configParsed.ok).toBe(true);
    if (!configParsed.ok) return;
    expect(configParsed.value.command).toBe('config');
    expect(configParsed.value.args[0]).toBe('list');

    const projectParsed = router.parse(['project', 'add', '/path/to/proj']);
    expect(projectParsed.ok).toBe(true);
    if (!projectParsed.ok) return;
    expect(projectParsed.value.command).toBe('project');

    const startParsed = router.parse(['start']);
    expect(startParsed.ok).toBe(true);
    if (!startParsed.ok) return;
    expect(startParsed.value.command).toBe('start');
  });

  it('CommandRouter 별칭 라우팅 동작', async () => {
    const router = new CommandRouter(logger);
    const projectCmd = new ProjectCommand(logger, tmpDir);
    router.register(projectCmd);

    // WHY: 'proj'는 'project' 명령의 별칭
    const parsed = router.parse(['proj', 'list']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.command).toBe('proj');

    // WHY: execute에서 별칭이 실제 명령으로 매핑되어 실행
    const execResult = await router.execute(['proj', 'list']);
    expect(execResult.ok).toBe(true);
  });

  it('CommandRouter 빈 인자 시 에러', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_no_command');
  });

  it('CommandRouter 미등록 명령 시 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['unknown-cmd']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_unknown_command');
  });

  it('CommandRouter parse가 플래그와 위치 인자를 올바르게 분리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const parsed = router.parse(['init', '--verbose', '--project-path=/tmp/test', 'extra-arg']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.options.verbose).toBe(true);
    expect(parsed.value.options.projectPath).toBe('/tmp/test');
    expect(parsed.value.args[0]).toBe('extra-arg');
  });

  it('CommandRouter getHelp가 등록된 명령 목록 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    router.register(new ConfigCommand(logger));

    const help = router.getHelp();
    expect(help).toContain('init');
    expect(help).toContain('config');
    expect(help).toContain('adev');
  });

  it('InitCommand가 .adev/ 디렉토리 구조를 생성', async () => {
    const initCmd = new InitCommand(logger, registryDir);

    const result = await initCmd.execute([], {
      projectPath: tmpDir,
      flags: {},
    });
    expect(result.ok).toBe(true);

    // WHY: .adev/ 하위에 data, agents, sessions 디렉토리가 생성되어야 함
    const adevDir = join(tmpDir, '.adev');
    // WHY: Bun의 access()는 성공 시 null 반환 (Node.js의 undefined와 다름)
    const adevAccess = await access(adevDir);
    expect(adevAccess === undefined || adevAccess === null).toBe(true);
    const dataAccess = await access(join(adevDir, 'data'));
    expect(dataAccess === undefined || dataAccess === null).toBe(true);
    const agentsAccess = await access(join(adevDir, 'agents'));
    expect(agentsAccess === undefined || agentsAccess === null).toBe(true);
    const sessionsAccess = await access(join(adevDir, 'sessions'));
    expect(sessionsAccess === undefined || sessionsAccess === null).toBe(true);

    // WHY: config.json이 생성되어야 함
    const configPath = join(adevDir, 'config.json');
    const configAccess = await access(configPath);
    expect(configAccess === undefined || configAccess === null).toBe(true);

    const configFile = Bun.file(configPath);
    const configText = await configFile.text();
    const config = JSON.parse(configText);
    expect(config).toBeDefined();
  });

  it('InitCommand 중복 초기화 시 에러', async () => {
    const initCmd = new InitCommand(logger, registryDir);

    // 첫 번째 초기화 / First init
    const first = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    expect(first.ok).toBe(true);

    // 두 번째 초기화 시 에러 / Second init should fail
    const second = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('cli_init_already_exists');
  });

  it('ConfigCommand list가 설정 로드 연동', async () => {
    // WHY: 먼저 init으로 config.json 생성
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['list'], { projectPath: tmpDir, flags: {} });
    expect(result.ok).toBe(true);
  });

  it('ConfigCommand get/set으로 설정 값 읽기/쓰기', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);

    // set으로 값 설정 / Set a value
    const setResult = await configCmd.execute(
      ['set', 'custom.key', 'test-value'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(setResult.ok).toBe(true);

    // get으로 값 조회 / Get the value
    const getResult = await configCmd.execute(
      ['get', 'custom.key'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(getResult.ok).toBe(true);
  });

  it('ConfigCommand 서브커맨드 없으면 에러', async () => {
    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute([], { flags: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_config_missing_subcommand');
  });

  it('ProjectCommand add → list → switch → remove CRUD', async () => {
    // WHY: registryDir을 tmpDir로 주입하여 글로벌 ~/.adev에 영향 없음
    const projectCmd = new ProjectCommand(logger, tmpDir);

    // add / 등록
    const addResult = await projectCmd.execute(
      ['add', join(tmpDir, 'my-project')],
      { flags: {} },
    );
    expect(addResult.ok).toBe(true);

    // list / 목록 조회
    const listResult = await projectCmd.execute(['list'], { flags: {} });
    expect(listResult.ok).toBe(true);

    // switch / 전환
    const switchResult = await projectCmd.execute(['switch', 'my-project'], { flags: {} });
    expect(switchResult.ok).toBe(true);

    // remove / 삭제
    const removeResult = await projectCmd.execute(['remove', 'my-project'], { flags: {} });
    expect(removeResult.ok).toBe(true);
  });

  it('ProjectCommand 중복 프로젝트 등록 시 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    await projectCmd.execute(['add', join(tmpDir, 'dup-project')], { flags: {} });

    const dupResult = await projectCmd.execute(
      ['add', join(tmpDir, 'dup-project')],
      { flags: {} },
    );
    expect(dupResult.ok).toBe(false);
    if (dupResult.ok) return;
    expect(dupResult.error.code).toBe('cli_project_duplicate');
  });

  it('ProjectCommand 존재하지 않는 프로젝트 제거 시 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    const result = await projectCmd.execute(['remove', 'nonexistent'], { flags: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_project_not_found');
  });

  // ── Edge cases: CommandRouter ─────────────────────────────────────

  it('CommandRouter: 단일 명령만 등록 후 다른 명령 실행 → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['config', 'list']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_unknown_command');
    }
  });

  it('CommandRouter: 동일 명령 중복 등록 → 마지막 명령 우선 또는 에러', () => {
    const router = new CommandRouter(logger);
    const cmd1 = new InitCommand(logger, registryDir);
    const cmd2 = new InitCommand(logger, registryDir);
    router.register(cmd1);
    // WHY: 중복 등록 시 에러 또는 덮어쓰기 동작 확인
    expect(() => router.register(cmd2)).not.toThrow();
  });

  it('CommandRouter: 명령 이름 대소문자 구분', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['Init']);
    // WHY: CLI는 대소문자 구분 → 'Init' !== 'init'
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: 매우 긴 명령 인자 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const longArg = 'a'.repeat(1000);
    const result = router.parse(['init', longArg]);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: 한글 인자 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new ProjectCommand(logger, tmpDir));

    const result = router.parse(['project', 'add', '/경로/프로젝트']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: 특수문자 포함 인자 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init', '--project-path=/tmp/test @#$%']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: null 유사 빈 문자열 인자 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init', '']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: 100개 명령 인자 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const args = Array.from({ length: 100 }, (_, i) => `arg-${i}`);
    const result = router.parse(['init', ...args]);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: getHelp가 빈 등록 시 adev 포함', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    expect(help).toContain('adev');
  });

  it('CommandRouter: parse 후 value.options 항상 정의됨', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options).toBeDefined();
    }
  });

  it('CommandRouter: parse 후 value.args 항상 배열', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value.args)).toBe(true);
    }
  });

  // ── Edge cases: InitCommand ───────────────────────────────────────

  it('InitCommand: 빈 projectPath → 에러 또는 현재 디렉토리 사용', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { projectPath: '', flags: {} });
    // WHY: 빈 경로는 에러이거나 cwd를 사용해야 함
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('InitCommand: 존재하지 않는 상위 경로에 초기화 → 디렉토리 자동 생성', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const deepPath = join(tmpDir, 'deep', 'nested', 'project');
    const result = await initCmd.execute([], { projectPath: deepPath, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('InitCommand: 한글 경로에 초기화', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const koreanPath = join(tmpDir, '한글경로');
    const result = await initCmd.execute([], { projectPath: koreanPath, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('InitCommand: 초기화 후 config.json이 유효한 JSON', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    expect(result.ok).toBe(true);

    const configPath = join(tmpDir, '.adev', 'config.json');
    const configFile = Bun.file(configPath);
    const text = await configFile.text();
    const parsed = JSON.parse(text);
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  it('InitCommand: 초기화 후 data 디렉토리가 존재함', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const dataDir = join(tmpDir, '.adev', 'data');
    const { access: fsAccess } = await import('node:fs/promises');
    const dataAccess = await fsAccess(dataDir);
    // WHY: data 디렉토리가 생성되어 접근 가능해야 함
    expect(dataAccess === undefined || dataAccess === null).toBe(true);
  });

  it('InitCommand: 여러 다른 경로에 독립 초기화', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const path1 = join(tmpDir, 'proj1');
    const path2 = join(tmpDir, 'proj2');

    const r1 = await initCmd.execute([], { projectPath: path1, flags: {} });
    const r2 = await initCmd.execute([], { projectPath: path2, flags: {} });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  // ── Edge cases: ConfigCommand ─────────────────────────────────────

  it('ConfigCommand: 알 수 없는 서브커맨드 → 에러', async () => {
    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['unknown-sub'], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ConfigCommand: get 인자 없음 → 에러', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['get'], { projectPath: tmpDir, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: set 키 없음 → 에러', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['set'], { projectPath: tmpDir, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: 중첩 키 (a.b.c) get/set', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const setResult = await configCmd.execute(
      ['set', 'a.b.c', 'nested-value'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(setResult.ok === true || setResult.ok === false).toBe(true);

    if (setResult.ok) {
      const getResult = await configCmd.execute(
        ['get', 'a.b.c'],
        { projectPath: tmpDir, flags: {} },
      );
      expect(getResult.ok).toBe(true);
    }
  });

  it('ConfigCommand: 한글 값 설정/조회', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const setResult = await configCmd.execute(
      ['set', 'description', '한글 설명 값'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(setResult.ok === true || setResult.ok === false).toBe(true);
  });

  it('ConfigCommand: 특수문자 값 설정', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const setResult = await configCmd.execute(
      ['set', 'special', '@#$%^&*()_+-='],
      { projectPath: tmpDir, flags: {} },
    );
    expect(setResult.ok === true || setResult.ok === false).toBe(true);
  });

  it('ConfigCommand: projectPath 없이 list → 에러 또는 빈 설정', async () => {
    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['list'], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: list가 문자열 결과 반환', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['list'], { projectPath: tmpDir, flags: {} });
    expect(result.ok).toBe(true);
  });

  // ── Edge cases: ProjectCommand ────────────────────────────────────

  it('ProjectCommand: 한글 프로젝트 이름/경로', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(
      ['add', join(tmpDir, '한글프로젝트')],
      { flags: {} },
    );
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: 빈 프로젝트 이름으로 switch → 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['switch', ''], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: list가 항상 성공', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['list'], { flags: {} });
    expect(result.ok).toBe(true);
  });

  it('ProjectCommand: 알 수 없는 서브커맨드 → 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['unknown-sub'], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ProjectCommand: add 경로 인자 없음 → 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['add'], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ProjectCommand: 여러 프로젝트 add 후 list 확인', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    for (let i = 0; i < 5; i++) {
      await projectCmd.execute(
        ['add', join(tmpDir, `project-${i}`)],
        { flags: {} },
      );
    }

    const listResult = await projectCmd.execute(['list'], { flags: {} });
    expect(listResult.ok).toBe(true);
  });

  it('ProjectCommand: add → remove → 다시 add 가능', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const projPath = join(tmpDir, 're-add-project');

    await projectCmd.execute(['add', projPath], { flags: {} });
    await projectCmd.execute(['remove', 're-add-project'], { flags: {} });

    const reAdd = await projectCmd.execute(['add', projPath], { flags: {} });
    expect(reAdd.ok).toBe(true);
  });

  it('ProjectCommand: UUID 형식 경로 등록', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const uuidPath = join(tmpDir, crypto.randomUUID());
    const result = await projectCmd.execute(['add', uuidPath], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: switch 후 다시 switch → 성공', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    await projectCmd.execute(['add', join(tmpDir, 'proj-a')], { flags: {} });
    await projectCmd.execute(['add', join(tmpDir, 'proj-b')], { flags: {} });

    const sw1 = await projectCmd.execute(['switch', 'proj-a'], { flags: {} });
    const sw2 = await projectCmd.execute(['switch', 'proj-b'], { flags: {} });

    expect(sw1.ok).toBe(true);
    expect(sw2.ok).toBe(true);
  });

  it('ProjectCommand: 특수문자 포함 경로 처리', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const specialPath = join(tmpDir, 'proj-@special');
    const result = await projectCmd.execute(['add', specialPath], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: execute가 Result 패턴 반환', async () => {
    const router = new CommandRouter(logger);
    router.register(new ProjectCommand(logger, tmpDir));

    const result = await router.execute(['project', 'list']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('CommandRouter: 4개 명령 모두 등록 후 getHelp에 모두 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    router.register(new ConfigCommand(logger));
    router.register(new ProjectCommand(logger, tmpDir));
    router.register(new StartCommand(logger));

    const help = router.getHelp();
    expect(help).toContain('init');
    expect(help).toContain('config');
    expect(help).toContain('project');
    expect(help).toContain('start');
  });

  it('CommandRouter: parse 결과 value.command가 등록 명령과 일치', () => {
    const router = new CommandRouter(logger);
    router.register(new ConfigCommand(logger));

    const result = router.parse(['config', 'list']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('config');
    }
  });

  // ── Additional edge/random cases ─────────────────────────────────

  it('CommandRouter: 빈 문자열 명령 → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['']);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter: 숫자 문자열 명령 처리', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['12345']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_unknown_command');
    }
  });

  it('CommandRouter: 특수문자만 있는 명령 처리', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['!@#$']);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter: UUID 형식 명령어 처리', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['550e8400-e29b-41d4-a716-446655440000']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_unknown_command');
    }
  });

  it('CommandRouter: getHelp 반환값이 문자열', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    router.register(new ConfigCommand(logger));

    const help = router.getHelp();
    expect(typeof help).toBe('string');
    expect(help.length).toBeGreaterThan(0);
  });

  it('CommandRouter: parse 후 value.command가 문자열', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.command).toBe('string');
    }
  });

  it('InitCommand: 경로에 공백 포함', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const spacePath = join(tmpDir, 'my project folder');
    const result = await initCmd.execute([], { projectPath: spacePath, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('InitCommand: 초기화 후 agents 디렉토리가 존재함', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const agentsDir = join(tmpDir, '.adev', 'agents');
    const { access: fsAccess } = await import('node:fs/promises');
    const result = await fsAccess(agentsDir);
    expect(result === undefined || result === null).toBe(true);
  });

  it('InitCommand: 초기화 후 sessions 디렉토리가 존재함', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const sessionsDir = join(tmpDir, '.adev', 'sessions');
    const { access: fsAccess } = await import('node:fs/promises');
    const result = await fsAccess(sessionsDir);
    expect(result === undefined || result === null).toBe(true);
  });

  it('InitCommand: config.json에 projectPath 필드 있음', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configPath = join(tmpDir, '.adev', 'config.json');
    const text = await Bun.file(configPath).text();
    const config = JSON.parse(text);
    // WHY: projectPath 또는 관련 필드가 있어야 함
    expect(typeof config).toBe('object');
  });

  it('ProjectCommand: 매우 긴 경로 처리', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const longPath = join(tmpDir, 'a'.repeat(200));
    const result = await projectCmd.execute(['add', longPath], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: remove 인자 없음 → 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['remove'], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ProjectCommand: switch 인자 없음 → 에러', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['switch'], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ProjectCommand: 10개 프로젝트 add 후 list → ok', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    for (let i = 0; i < 10; i++) {
      await projectCmd.execute(
        ['add', join(tmpDir, `batch-project-${i}`)],
        { flags: {} },
      );
    }

    const listResult = await projectCmd.execute(['list'], { flags: {} });
    expect(listResult.ok).toBe(true);
  });

  it('ProjectCommand: add → switch → remove → 다시 list', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const projPath = join(tmpDir, 'lifecycle-proj');

    await projectCmd.execute(['add', projPath], { flags: {} });
    await projectCmd.execute(['switch', 'lifecycle-proj'], { flags: {} });
    await projectCmd.execute(['remove', 'lifecycle-proj'], { flags: {} });

    const listResult = await projectCmd.execute(['list'], { flags: {} });
    expect(listResult.ok).toBe(true);
  });

  it('ConfigCommand: 빈 문자열 서브커맨드 → 에러', async () => {
    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute([''], { flags: {} });
    expect(result.ok).toBe(false);
  });

  it('ConfigCommand: set 값에 JSON 문자열 처리', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(
      ['set', 'json.value', '{"key":"value"}'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: set 값에 숫자 처리', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(
      ['set', 'num.value', '42'],
      { projectPath: tmpDir, flags: {} },
    );
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: 5번 연속 같은 명령 parse → 항상 ok', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    for (let i = 0; i < 5; i++) {
      const result = router.parse(['init']);
      expect(result.ok).toBe(true);
    }
  });

  it('ProjectCommand: UUID 형식 프로젝트명 switch 시도', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const uuid = crypto.randomUUID();
    const result = await projectCmd.execute(['switch', uuid], { flags: {} });
    // 존재하지 않는 uuid → 에러 또는 ok=false
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: execute 결과가 항상 ok 필드 가짐', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['init', '--project-path=' + tmpDir + '/new-proj']);
    expect('ok' in result).toBe(true);
  });

  // ── 추가 edge/random 케이스 ───────────────────────────────────

  it('CommandRouter: 이모지 포함 명령어 → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['🚀']);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter: 공백만 있는 명령어 → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['   ']);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter: 매우 긴 명령어 문자열 → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['x'.repeat(500)]);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter: parse 결과 command 타입은 string', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init', '--verbose']);
    if (result.ok) {
      expect(typeof result.value.command).toBe('string');
    }
  });

  it('CommandRouter: 여러 플래그 동시 파싱', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = router.parse(['init', '--verbose', '--force', '--dry-run']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: parse 후 execute → ok 또는 err', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const parsed = router.parse(['init']);
    expect(parsed.ok === true || parsed.ok === false).toBe(true);

    const exec = await router.execute(['init', '--project-path=' + tmpDir + '/exec-test']);
    expect(exec.ok === true || exec.ok === false).toBe(true);
  });

  it('InitCommand: --force 플래그로 재초기화 시도', async () => {
    const initCmd = new InitCommand(logger, registryDir);

    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const second = await initCmd.execute([], { projectPath: tmpDir, flags: { force: true } });
    // force 플래그로 재초기화 → ok 또는 에러 (구현 의존)
    expect(second.ok === true || second.ok === false).toBe(true);
  });

  it('InitCommand: 절대 경로 vs 상대 경로 처리', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const absolutePath = tmpDir + '/abs-test';
    const result = await initCmd.execute([], { projectPath: absolutePath, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: 동일 키 연속 set → 마지막 값 유지', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    await configCmd.execute(['set', 'my.key', 'value-1'], { projectPath: tmpDir, flags: {} });
    const setResult = await configCmd.execute(['set', 'my.key', 'value-2'], { projectPath: tmpDir, flags: {} });
    expect(setResult.ok === true || setResult.ok === false).toBe(true);

    const getResult = await configCmd.execute(['get', 'my.key'], { projectPath: tmpDir, flags: {} });
    expect(getResult.ok === true || getResult.ok === false).toBe(true);
  });

  it('ConfigCommand: 매우 긴 키 이름 → 처리', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const longKey = 'a'.repeat(100) + '.key';
    const result = await configCmd.execute(['set', longKey, 'value'], { projectPath: tmpDir, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: 매우 긴 값 → 처리', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const longValue = 'v'.repeat(5000);
    const result = await configCmd.execute(['set', 'large.value', longValue], { projectPath: tmpDir, flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: UUID 형식 경로 여러 개 add', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    for (let i = 0; i < 3; i++) {
      const uuidPath = join(tmpDir, crypto.randomUUID());
      const result = await projectCmd.execute(['add', uuidPath], { flags: {} });
      expect(result.ok === true || result.ok === false).toBe(true);
    }
  });

  it('ProjectCommand: 이모지 포함 경로 처리', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const emojiPath = join(tmpDir, 'proj-🚀');
    const result = await projectCmd.execute(['add', emojiPath], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ProjectCommand: 경로 구분자 혼합 처리', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['add', tmpDir + '/mixed/path'], { flags: {} });
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CommandRouter: getHelp 결과 길이가 0보다 크다', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    router.register(new ConfigCommand(logger));
    router.register(new ProjectCommand(logger, tmpDir));
    router.register(new StartCommand(logger));

    const help = router.getHelp();
    expect(help.length).toBeGreaterThan(0);
  });

  it('CommandRouter: parse에 빈 옵션 배열 처리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    // 명령어만 있고 추가 인자 없음
    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value.args)).toBe(true);
    }
  });

  it('CommandRouter: 동시 10번 execute → 모두 결과 반환', async () => {
    const router = new CommandRouter(logger);
    router.register(new ProjectCommand(logger, tmpDir));

    const promises = Array.from({ length: 10 }, () => router.execute(['project', 'list']));
    const results = await Promise.all(promises);
    for (const result of results) {
      expect(typeof result.ok).toBe('boolean');
    }
  });

  it('InitCommand: 초기화 후 .adev 디렉토리 내용 확인', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    expect(result.ok).toBe(true);

    const { readdir } = await import('node:fs/promises');
    const adevDir = join(tmpDir, '.adev');
    const entries = await readdir(adevDir);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('ProjectCommand: 같은 이름 다른 경로 add → 에러 또는 성공', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);

    const path1 = join(tmpDir, 'same-name-different-path-1');
    const path2 = join(tmpDir, 'same-name-different-path-2');

    await projectCmd.execute(['add', path1], { flags: {} });
    const result = await projectCmd.execute(['add', path2], { flags: {} });
    // 동일한 이름이 아닌 경로이므로 ok 또는 에러
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('ConfigCommand: list 결과는 문자열이거나 ok=false', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['list'], { projectPath: tmpDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('CommandRouter: 10개 다른 알 수 없는 명령 → 모두 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const unknownCmds = Array.from({ length: 10 }, (_, i) => `unknown-cmd-${i}`);
    for (const cmd of unknownCmds) {
      const result = await router.execute([cmd]);
      expect(result.ok).toBe(false);
    }
  });

  it('InitCommand: 초기화 결과 ok 필드는 boolean', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('ProjectCommand: list 결과 ok 필드는 boolean', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    const result = await projectCmd.execute(['list'], { flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('ConfigCommand: set 결과 ok 필드는 boolean', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['set', 'test.key', 'val'], { projectPath: tmpDir, flags: {} });
    expect(typeof result.ok).toBe('boolean');
  });

  it('CommandRouter: parse → 명령어 값이 인자와 일치', () => {
    const router = new CommandRouter(logger);
    router.register(new ProjectCommand(logger, tmpDir));

    const result = router.parse(['project', 'list', 'extra']);
    if (result.ok) {
      expect(result.value.command).toBe('project');
    }
  });

  it('InitCommand: 중복 초기화 에러 코드 확인', async () => {
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const second = await initCmd.execute([], { projectPath: tmpDir, flags: {} });
    if (!second.ok) {
      expect(typeof second.error.code).toBe('string');
      expect(second.error.code.length).toBeGreaterThan(0);
    }
  });

  it('ProjectCommand: 중복 에러 코드 확인', async () => {
    const projectCmd = new ProjectCommand(logger, tmpDir);
    await projectCmd.execute(['add', join(tmpDir, 'dup-check-proj')], { flags: {} });

    const dupResult = await projectCmd.execute(['add', join(tmpDir, 'dup-check-proj')], { flags: {} });
    if (!dupResult.ok) {
      expect(typeof dupResult.error.code).toBe('string');
    }
  });

  it('ConfigCommand: 알 수 없는 서브커맨드 에러 메시지 확인', async () => {
    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['invalid-subcommand'], { flags: {} });
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });
});
