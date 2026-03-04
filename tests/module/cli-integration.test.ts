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
import { ConsoleLogger } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import {
  CommandRouter,
  ConfigCommand,
  InitCommand,
  ProjectCommand,
  StartCommand,
} from '../../src/cli/index.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');
let tmpDir: string;

// ── 테스트 ────────────────────────────────────────────────────────

describe('CLI 통합 / CLI integration', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'adev-cli-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('CommandRouter에 4개 명령 등록 후 각각 라우팅 확인', () => {
    const router = new CommandRouter(logger);

    router.register(new InitCommand(logger));
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
    router.register(new InitCommand(logger));

    const result = router.parse([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_no_command');
  });

  it('CommandRouter 미등록 명령 시 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger));

    const result = await router.execute(['unknown-cmd']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('cli_unknown_command');
  });

  it('CommandRouter parse가 플래그와 위치 인자를 올바르게 분리', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger));

    const parsed = router.parse(['init', '--verbose', '--project-path=/tmp/test', 'extra-arg']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.options.verbose).toBe(true);
    expect(parsed.value.options.projectPath).toBe('/tmp/test');
    expect(parsed.value.args[0]).toBe('extra-arg');
  });

  it('CommandRouter getHelp가 등록된 명령 목록 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger));
    router.register(new ConfigCommand(logger));

    const help = router.getHelp();
    expect(help).toContain('init');
    expect(help).toContain('config');
    expect(help).toContain('adev');
  });

  it('InitCommand가 .adev/ 디렉토리 구조를 생성', async () => {
    const initCmd = new InitCommand(logger);

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
    const initCmd = new InitCommand(logger);

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
    const initCmd = new InitCommand(logger);
    await initCmd.execute([], { projectPath: tmpDir, flags: {} });

    const configCmd = new ConfigCommand(logger);
    const result = await configCmd.execute(['list'], { projectPath: tmpDir, flags: {} });
    expect(result.ok).toBe(true);
  });

  it('ConfigCommand get/set으로 설정 값 읽기/쓰기', async () => {
    const initCmd = new InitCommand(logger);
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
});
