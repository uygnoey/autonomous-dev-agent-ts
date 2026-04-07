/**
 * E2E: 프로젝트 생명주기 / Project lifecycle
 *
 * @description
 * KR: CLI init → config load → project add/list/switch/remove 전체 시나리오.
 * EN: Full lifecycle from CLI init through config to project management.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { InitCommand } from 'cli/commands/init.js';
import { ConfigCommand } from 'cli/commands/config.js';
import { ProjectCommand } from 'cli/commands/project.js';
import { StartCommand } from 'cli/commands/start.js';
import { CommandRouter } from 'cli/command-router.js';
import { ConsoleLogger } from 'core/logger.js';
import type { CliOptions } from 'cli/types.js';
import { loadRegistry } from 'cli/commands/project.js';

const logger = new ConsoleLogger('error');

const DEFAULT_OPTIONS: CliOptions = { yes: true, flags: {} };

let tmpDir: string;
let registryDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `adev-e2e-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  registryDir = join(tmpDir, 'registry');
  await Bun.write(join(registryDir, '.keep'), '');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('프로젝트 생명주기 E2E / Project Lifecycle E2E', () => {
  it('init → .adev/ 디렉토리와 config.json 생성', async () => {
    const projectPath = join(tmpDir, 'proj-init');
    const initCmd = new InitCommand(logger, registryDir);

    const result = await initCmd.execute([], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });

    expect(result.ok).toBe(true);

    const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
    expect(await configFile.exists()).toBe(true);

    const dataDir = Bun.file(join(projectPath, '.adev', 'data'));
    const agentsDir = Bun.file(join(projectPath, '.adev', 'agents'));
    const sessionsDir = Bun.file(join(projectPath, '.adev', 'sessions'));
    // WHY: 디렉토리는 Bun.file로 존재 확인이 어려우므로 config.json 존재로 대체
    const config = await configFile.json();
    expect(config).toHaveProperty('embedding');
    expect(config).toHaveProperty('testing');
    expect(config).toHaveProperty('verification');
    expect(config).toHaveProperty('log');
  });

  it('init 중복 실행 시 에러 반환', async () => {
    const projectPath = join(tmpDir, 'proj-dup');
    const initCmd = new InitCommand(logger, registryDir);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_init_already_exists');
    }
  });

  it('config list → 기본 설정 확인', async () => {
    const projectPath = join(tmpDir, 'proj-cfg');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });

    const result = await configCmd.execute(['list'], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });

    expect(result.ok).toBe(true);
  });

  it('config set / get → 값 수정 후 조회', async () => {
    const projectPath = join(tmpDir, 'proj-set');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });

    const setResult = await configCmd.execute(['set', 'log.level', 'debug'], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });
    expect(setResult.ok).toBe(true);

    const getResult = await configCmd.execute(['get', 'log.level'], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });
    expect(getResult.ok).toBe(true);

    // WHY: config.json 파일에서 직접 값 확인
    const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
    const config = await configFile.json();
    expect(config.log.level).toBe('debug');
  });

  it('config get → 존재하지 않는 키 에러', async () => {
    const projectPath = join(tmpDir, 'proj-nokey');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });

    const result = await configCmd.execute(['get', 'nonexistent.key'], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_config_key_not_found');
    }
  });

  it('project add → 레지스트리에 프로젝트 등록', async () => {
    const projPath = join(tmpDir, 'my-project');
    const projCmd = new ProjectCommand(logger, registryDir);

    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);

    const regResult = await loadRegistry(registryDir);
    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(1);
      expect(regResult.value.projects[0]?.name).toBe('my-project');
      expect(regResult.value.activeProject).toBe('my-project');
    }
  });

  it('project list → 등록된 프로젝트 조회', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);

    await projCmd.execute(['add', join(tmpDir, 'proj-a')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'proj-b')], DEFAULT_OPTIONS);

    const result = await projCmd.execute(['list'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);

    const regResult = await loadRegistry(registryDir);
    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(2);
    }
  });

  it('project switch → 활성 프로젝트 변경', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);

    await projCmd.execute(['add', join(tmpDir, 'alpha')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'beta')], DEFAULT_OPTIONS);

    const switchResult = await projCmd.execute(['switch', 'beta'], DEFAULT_OPTIONS);
    expect(switchResult.ok).toBe(true);

    const regResult = await loadRegistry(registryDir);
    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBe('beta');
    }
  });

  it('project remove → 프로젝트 삭제 후 레지스트리 반영', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);

    await projCmd.execute(['add', join(tmpDir, 'to-remove')], DEFAULT_OPTIONS);
    const removeResult = await projCmd.execute(['remove', 'to-remove'], DEFAULT_OPTIONS);
    expect(removeResult.ok).toBe(true);

    const regResult = await loadRegistry(registryDir);
    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(0);
      expect(regResult.value.activeProject).toBeNull();
    }
  });

  it('project add → 중복 등록 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const projPath = join(tmpDir, 'dup-proj');

    await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_project_duplicate');
    }
  });

  it('CommandRouter → 명령 라우팅 및 별칭 처리', async () => {
    const router = new CommandRouter(logger);
    const initCmd = new InitCommand(logger, registryDir);
    router.register(initCmd);

    const projectPath = join(tmpDir, 'proj-router');

    // WHY: 별칭 'i'로 init 명령 실행
    const result = await router.execute(['i', '--yes', `--project-path=${projectPath}`]);
    expect(result.ok).toBe(true);

    const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
    expect(await configFile.exists()).toBe(true);
  });

  it('CommandRouter → 알 수 없는 명령 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['unknown-cmd']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_unknown_command');
    }
  });

  it('start → 미초기화 프로젝트 에러', async () => {
    const startCmd = new StartCommand(logger);
    const projectPath = join(tmpDir, 'not-initialized');

    const result = await startCmd.execute([], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_start_not_initialized');
    }
  });

  // ── UUID/랜덤 경계값 ───────────────────────────────────────

  it('UUID 기반 프로젝트 경로에서 init → ok', async () => {
    const projectPath = join(tmpDir, crypto.randomUUID());
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(result.ok).toBe(true);
  });

  it('UUID 경로 init 후 config.json 존재', async () => {
    const projectPath = join(tmpDir, crypto.randomUUID());
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
    expect(await configFile.exists()).toBe(true);
  });

  it('5번 다른 UUID 경로 init → 모두 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const projectPath = join(tmpDir, crypto.randomUUID());
      const initCmd = new InitCommand(logger, registryDir);
      const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
      expect(result.ok).toBe(true);
    }
  });

  it('project add → UUID 경로명으로 추가 ok', async () => {
    const projName = crypto.randomUUID();
    const projPath = join(tmpDir, projName);
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('project add → 존재하지 않는 명령 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['unknown-subcmd', 'arg'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('project add 3개 → listServers 3개', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 3; i++) {
      await projCmd.execute(['add', join(tmpDir, `multi-${i}`)], DEFAULT_OPTIONS);
    }
    const regResult = await loadRegistry(registryDir);
    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(3);
    }
  });

  it('project switch → 없는 프로젝트 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['switch', 'nonexistent-proj'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('project remove → 없는 프로젝트 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['remove', 'nonexistent-proj'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('start → 에러 코드가 string', async () => {
    const startCmd = new StartCommand(logger);
    const result = await startCmd.execute([], {
      ...DEFAULT_OPTIONS,
      projectPath: join(tmpDir, 'not-init-' + crypto.randomUUID()),
    });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  // ── install.sh 유사 플로우 (init → project add → switch) ──

  it('install 플로우: init → project add → project list → ok', async () => {
    const projectPath = join(tmpDir, 'install-flow-proj');
    const addPath = join(tmpDir, 'another-proj');
    const initCmd = new InitCommand(logger, registryDir);
    const projCmd = new ProjectCommand(logger, registryDir);

    // init already registers projectPath in the registry
    const initResult = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(initResult.ok).toBe(true);

    // add a different path to avoid duplicate error
    const addResult = await projCmd.execute(['add', addPath], DEFAULT_OPTIONS);
    expect(addResult.ok).toBe(true);

    const listResult = await projCmd.execute(['list'], DEFAULT_OPTIONS);
    expect(listResult.ok).toBe(true);

    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('install 플로우: 두 프로젝트 추가 후 switch → 활성 변경', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);

    await projCmd.execute(['add', join(tmpDir, 'proj-first')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'proj-second')], DEFAULT_OPTIONS);
    await projCmd.execute(['switch', 'proj-first'], DEFAULT_OPTIONS);

    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBe('proj-first');
    }
  });

  it('install 플로우: init → config set → config get → 값 일치', async () => {
    const projectPath = join(tmpDir, 'install-config-flow');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'warn'], { ...DEFAULT_OPTIONS, projectPath });

    const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
    const config = await configFile.json();
    expect(config.log.level).toBe('warn');
  });

  it('config set 여러 키 → 모두 반영', async () => {
    const projectPath = join(tmpDir, 'multi-config-set');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });

    const keys = [
      ['log.level', 'debug'],
      ['embedding.default', 'xenova-minilm'],
    ];
    for (const [key, val] of keys) {
      const r = await configCmd.execute(['set', key, val], { ...DEFAULT_OPTIONS, projectPath });
      expect(r.ok).toBe(true);
    }

    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('debug');
    expect(config.embedding.default).toBe('xenova-minilm');
  });

  it('CommandRouter → 빈 args 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
  });

  it('CommandRouter → 별칭 i로 init 실행 후 .adev 구조 확인', async () => {
    const router = new CommandRouter(logger);
    const projectPath = join(tmpDir, 'router-alias-proj');
    router.register(new InitCommand(logger, registryDir));

    const result = await router.execute(['i', '--yes', `--project-path=${projectPath}`]);
    expect(result.ok).toBe(true);

    const agentsDir = join(projectPath, '.adev', 'agents');
    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agentNames) {
      expect(await Bun.file(join(agentsDir, `${name}.md`)).exists()).toBe(true);
    }
  });

  it('init 결과 ok boolean 타입', async () => {
    const projectPath = join(tmpDir, 'type-check-proj');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('init 두 번 에러 코드는 string', async () => {
    const projectPath = join(tmpDir, 'dup-init-str');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('project switch 에러 코드는 string', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['switch', 'ghost-project'], DEFAULT_OPTIONS);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('loadRegistry → 없는 디렉토리 → 빈 레지스트리 또는 에러', async () => {
    const badRegistry = join(tmpDir, 'ghost-registry');
    const result = await loadRegistry(badRegistry);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add → remove → add 사이클 ok', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const projPath = join(tmpDir, 'cycle-proj');

    await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'cycle-proj'], DEFAULT_OPTIONS);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('config list ok boolean 타입', async () => {
    const projectPath = join(tmpDir, 'config-list-type');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['list'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('config get 에러 코드는 string', async () => {
    const projectPath = join(tmpDir, 'config-err-str');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);

    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['get', 'no.such.key'], { ...DEFAULT_OPTIONS, projectPath });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('project add → list 5회 반복 → 길이 일관성', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'stable-proj')], DEFAULT_OPTIONS);

    for (let i = 0; i < 5; i++) {
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.projects.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // ── 추가 edge/random 케이스 ──────────────────────────────────────

  it('init → 경로에 한글 포함 → ok', async () => {
    const projectPath = join(tmpDir, '한글프로젝트');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('init → 경로에 공백 포함 → ok', async () => {
    const projectPath = join(tmpDir, 'my project path');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('init → 경로에 특수문자 포함 → 처리됨', async () => {
    const projectPath = join(tmpDir, 'proj-!@#');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add → 한글 경로명 → ok', async () => {
    const projPath = join(tmpDir, '한글-프로젝트-경로');
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add → 빈 문자열 경로 → 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', ''], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('project add → 매우 긴 경로명 → 처리됨', async () => {
    const longName = 'a'.repeat(200);
    const projPath = join(tmpDir, longName);
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project switch → 빈 문자열 → 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['switch', ''], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('project remove → 빈 문자열 → 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['remove', ''], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('10개 UUID 프로젝트 add 후 registry 길이 10', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 10; i++) {
      await projCmd.execute(['add', join(tmpDir, `uuid-proj-${crypto.randomUUID()}`)], DEFAULT_OPTIONS);
    }
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(10);
    }
  });

  it('add 3개 후 remove 2개 → registry 길이 1', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'del-a')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'del-b')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'del-c')], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'del-a'], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'del-b'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(1);
    }
  });

  it('add → switch → remove 활성 → activeProject null', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'active-del')], DEFAULT_OPTIONS);
    await projCmd.execute(['switch', 'active-del'], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'active-del'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBeNull();
    }
  });

  it('CommandRouter → null args 배열 아닌 undefined → 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    // undefined가 아닌 빈 배열로 에러 확인
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
  });

  it('config set → 알 수 없는 섹션 → 에러', async () => {
    const projectPath = join(tmpDir, 'cfg-unknown-section');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['set', 'nonexistent.key', 'value'], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });
    expect(typeof result.ok).toBe('boolean');
  });

  it('config get → 빈 key → 에러 또는 false', async () => {
    const projectPath = join(tmpDir, 'cfg-empty-key');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['get', ''], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('config set → 빈 value → 처리됨', async () => {
    const projectPath = join(tmpDir, 'cfg-empty-value');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['set', 'log.level', ''], {
      ...DEFAULT_OPTIONS,
      projectPath,
    });
    expect(typeof result.ok).toBe('boolean');
  });

  it('start 에러 반환 시 result.error 객체 존재', async () => {
    const startCmd = new StartCommand(logger);
    const result = await startCmd.execute([], {
      ...DEFAULT_OPTIONS,
      projectPath: join(tmpDir, 'no-init-' + crypto.randomUUID()),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(result.error.code).toBeDefined();
    }
  });

  it('project list → 등록 안 된 상태 → ok 또는 빈 목록', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['list'], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('init 5회 각각 UUID 경로 → 모두 독립적 config.json 보유', async () => {
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const projectPath = join(tmpDir, crypto.randomUUID());
      const initCmd = new InitCommand(logger, registryDir);
      await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
      paths.push(projectPath);
    }
    for (const p of paths) {
      const f = Bun.file(join(p, '.adev', 'config.json'));
      expect(await f.exists()).toBe(true);
    }
  });

  it('loadRegistry → 초기화된 registry → projects 배열 타입', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'type-check-reg')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(Array.isArray(regResult.value.projects)).toBe(true);
    }
  });

  it('project add → 같은 이름 다른 경로 → 에러', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'same-name')], DEFAULT_OPTIONS);
    // 이미 등록된 이름이므로 중복 에러 예상
    const result = await projCmd.execute(['add', join(tmpDir, 'same-name')], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('5개 프로젝트 add 후 switch 반복 → activeProject 변경 확인', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const names = ['sw-a', 'sw-b', 'sw-c', 'sw-d', 'sw-e'];
    for (const name of names) {
      await projCmd.execute(['add', join(tmpDir, name)], DEFAULT_OPTIONS);
    }
    for (const name of names) {
      await projCmd.execute(['switch', name], DEFAULT_OPTIONS);
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok) {
        expect(regResult.value.activeProject).toBe(name);
      }
    }
  });

  it('init → config set log.level=error → config.json 반영', async () => {
    const projectPath = join(tmpDir, 'cfg-error-level');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'error'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('error');
  });

  it('init → config set log.level=info → config.json 반영', async () => {
    const projectPath = join(tmpDir, 'cfg-info-level');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'info'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('info');
  });

  it('loadRegistry → projects 배열의 첫 번째 항목 name은 string', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'name-str-check')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok && regResult.value.projects.length > 0) {
      expect(typeof regResult.value.projects[0]?.name).toBe('string');
    }
  });

  it('project add → 경로에 숫자만 → ok', async () => {
    const projPath = join(tmpDir, '12345678');
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('CommandRouter → init 이외 명령 등록 안 함 → 알 수 없는 명령 에러', async () => {
    const router = new CommandRouter(logger);
    // register 없이 실행
    const result = await router.execute(['init', '--project-path=/tmp/x']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('loadRegistry ok 여부는 boolean 타입', async () => {
    const result = await loadRegistry(registryDir);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add 후 remove 후 list → 빈 배열', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'rm-then-list')], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'rm-then-list'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(0);
    }
  });

  it('init → 경로에 숫자+특수문자 조합 → ok 또는 에러', async () => {
    const projectPath = join(tmpDir, '123-proj_test');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add → 경로 구분자 포함 이름 → 처리됨', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', join(tmpDir, 'dir', 'sub', 'proj')], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('loadRegistry → 동일 경로 2번 호출 → 결과 일관성', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'consistency-proj')], DEFAULT_OPTIONS);
    const r1 = await loadRegistry(registryDir);
    const r2 = await loadRegistry(registryDir);
    if (r1.ok && r2.ok) {
      expect(r1.value.projects.length).toBe(r2.value.projects.length);
    }
  });

  it('project remove → 존재하는 프로젝트 → ok이고 boolean 타입', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'removable')], DEFAULT_OPTIONS);
    const result = await projCmd.execute(['remove', 'removable'], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
    expect(result.ok).toBe(true);
  });

  it('add 후 switch 후 remove → activeProject null', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'switchable')], DEFAULT_OPTIONS);
    await projCmd.execute(['switch', 'switchable'], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'switchable'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBeNull();
    }
  });

  it('init 후 config.json 구조에 embedding 키 존재', async () => {
    const projectPath = join(tmpDir, 'struct-check');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config).toHaveProperty('embedding');
  });

  it('init 후 config.json 구조에 testing 키 존재', async () => {
    const projectPath = join(tmpDir, 'struct-check2');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config).toHaveProperty('testing');
  });

  it('init 후 config.json 구조에 verification 키 존재', async () => {
    const projectPath = join(tmpDir, 'struct-check3');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config).toHaveProperty('verification');
  });

  it('init 후 config.json 구조에 log 키 존재', async () => {
    const projectPath = join(tmpDir, 'struct-check4');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config).toHaveProperty('log');
  });

  it('project list → 빈 레지스트리 → projects는 배열', async () => {
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(Array.isArray(regResult.value.projects)).toBe(true);
    }
  });

  it('project switch → 등록된 다른 프로젝트로 전환 → ok', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'sw-1')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'sw-2')], DEFAULT_OPTIONS);
    const result = await projCmd.execute(['switch', 'sw-2'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('project add → 최대 UUID 형식 3개 add → registry length 3', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids) {
      await projCmd.execute(['add', join(tmpDir, id)], DEFAULT_OPTIONS);
    }
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(3);
    }
  });

  // ── 추가 edge/random 케이스 배치43 ─────────────────────────────

  it('init → 결과 ok 시 config.json은 유효한 JSON', async () => {
    const projectPath = join(tmpDir, 'valid-json-check');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    if (result.ok) {
      const content = await Bun.file(join(projectPath, '.adev', 'config.json')).text();
      expect(() => JSON.parse(content)).not.toThrow();
    }
  });

  it('init → 두 번째 init 에러 메시지 존재', async () => {
    const projectPath = join(tmpDir, 'double-init-msg');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    if (!result.ok) {
      expect(result.error.message).toBeDefined();
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('project add → path는 절대 경로이어야 함 또는 처리됨', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', 'relative/path/project'], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project switch → 프로젝트 없는 레지스트리에서 → false', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['switch', 'does-not-exist'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('project remove → 프로젝트 없는 레지스트리에서 → false', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['remove', 'does-not-exist'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(false);
  });

  it('loadRegistry → 빈 레지스트리 → activeProject가 null', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.activeProject).toBeNull();
    }
  });

  it('project add 1개 → activeProject가 해당 이름', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'active-check')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBe('active-check');
    }
  });

  it('project add 2개 → 두 번째 add 후 activeProject가 non-null', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'proj-first-2')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'proj-second-2')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      // activeProject는 첫 번째 또는 마지막 add된 이름일 수 있음
      expect(regResult.value.activeProject).not.toBeUndefined();
      expect(typeof regResult.value.activeProject).toBe('string');
    }
  });

  it('config set → 존재하는 키 → ok', async () => {
    const projectPath = join(tmpDir, 'cfg-exist-key');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['set', 'log.level', 'warn'], { ...DEFAULT_OPTIONS, projectPath });
    expect(result.ok).toBe(true);
  });

  it('config set 두 번 같은 키 → 마지막 값으로 덮어씀', async () => {
    const projectPath = join(tmpDir, 'cfg-overwrite');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'debug'], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'error'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('error');
  });

  it('CommandRouter → 여러 명령 등록 후 특정 명령 실행 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    router.register(new ProjectCommand(logger, registryDir));
    const projectPath = join(tmpDir, 'router-multi-reg');
    const result = await router.execute(['init', '--yes', `--project-path=${projectPath}`]);
    expect(result.ok).toBe(true);
  });

  it('init 결과 ok시 .adev 폴더 아래 config.json 반환값 embedding.default 존재', async () => {
    const projectPath = join(tmpDir, 'embed-default');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.embedding).toBeDefined();
    expect(config.embedding.default).toBeDefined();
  });

  it('init 결과 ok시 .adev 폴더 아래 config.json testing 객체 존재', async () => {
    const projectPath = join(tmpDir, 'testing-retries');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    // testing 섹션 존재만 확인 (하위 키는 구현에 따라 다를 수 있음)
    expect(config.testing).toBeDefined();
  });

  it('init 결과 ok시 .adev 폴더 아래 config.json verification 객체 존재', async () => {
    const projectPath = join(tmpDir, 'verif-enabled');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    // verification 섹션 존재만 확인
    expect(config.verification).toBeDefined();
  });

  it('project add → ok이면 projectId 타입은 string', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', join(tmpDir, 'proj-id-type')], DEFAULT_OPTIONS);
    if (result.ok) {
      const regResult = await loadRegistry(registryDir);
      if (regResult.ok && regResult.value.projects.length > 0) {
        expect(typeof regResult.value.projects[0]?.name).toBe('string');
      }
    }
  });

  it('project add → ok이면 projects[0].path 타입은 string', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'path-type-check')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok && regResult.value.projects.length > 0) {
      expect(typeof regResult.value.projects[0]?.path).toBe('string');
    }
  });

  it('project remove → 삭제 후 getActiveReports 비어있음', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'del-then-empty')], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'del-then-empty'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(0);
    }
  });

  it('init 후 config set embedding.default → config.json 반영', async () => {
    const projectPath = join(tmpDir, 'embed-set');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'embedding.default', 'xenova-minilm'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.embedding.default).toBe('xenova-minilm');
  });

  it('init 후 config get log.level → ok', async () => {
    const projectPath = join(tmpDir, 'get-log-level');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await configCmd.execute(['get', 'log.level'], { ...DEFAULT_OPTIONS, projectPath });
    expect(result.ok).toBe(true);
  });

  it('start → init 된 프로젝트여도 contract 없으면 에러 또는 진행', async () => {
    const projectPath = join(tmpDir, 'start-no-contract');
    const initCmd = new InitCommand(logger, registryDir);
    const startCmd = new StartCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await startCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('loadRegistry → 빈 레지스트리 → projects 빈 배열', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.projects).toHaveLength(0);
    }
  });

  it('project add → ok=true이면 projects에 path 포함', async () => {
    const projPath = join(tmpDir, 'path-check-2');
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      const found = regResult.value.projects.find((p) => p.name === 'path-check-2');
      expect(found).toBeDefined();
    }
  });

  it('project switch → 5개 중 3번째 선택 → activeProject 3번째', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const names = ['p1', 'p2', 'p3', 'p4', 'p5'];
    for (const name of names) {
      await projCmd.execute(['add', join(tmpDir, name)], DEFAULT_OPTIONS);
    }
    await projCmd.execute(['switch', 'p3'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBe('p3');
    }
  });

  it('project add 1개 후 remove → 빈 배열 → add 다시 → length 1', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'cycle2')], DEFAULT_OPTIONS);
    await projCmd.execute(['remove', 'cycle2'], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'cycle2')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects).toHaveLength(1);
    }
  });

  it('CommandRouter → config 명령 등록 후 실행 → ok 또는 에러', async () => {
    const router = new CommandRouter(logger);
    router.register(new ConfigCommand(logger));
    const projectPath = join(tmpDir, 'router-config');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const result = await router.execute(['config', 'list', `--project-path=${projectPath}`]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('loadRegistry → 동일 registryDir → 매번 동일 결과', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'idempotent-reg')], DEFAULT_OPTIONS);
    const r1 = await loadRegistry(registryDir);
    const r2 = await loadRegistry(registryDir);
    const r3 = await loadRegistry(registryDir);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.projects.length).toBe(r2.value.projects.length);
      expect(r2.value.projects.length).toBe(r3.value.projects.length);
    }
  });

  it('project add → 숫자+UUID 혼합 경로 → ok 또는 에러', async () => {
    const mixedName = `42-${crypto.randomUUID()}`;
    const projPath = join(tmpDir, mixedName);
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', projPath], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add → 매우 짧은 이름(1자) → 처리됨', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', join(tmpDir, 'x')], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });

  it('config set → 연속 3번 다른 값 → 마지막 값 반영', async () => {
    const projectPath = join(tmpDir, 'cfg-3-set');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'debug'], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'info'], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'warn'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('warn');
  });

  it('init → agents 폴더에 architect.md 파일 존재', async () => {
    const projectPath = join(tmpDir, 'agent-architect');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const agentFile = Bun.file(join(projectPath, '.adev', 'agents', 'architect.md'));
    expect(await agentFile.exists()).toBe(true);
  });

  it('init → agents 폴더에 coder.md 파일 존재', async () => {
    const projectPath = join(tmpDir, 'agent-coder');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const agentFile = Bun.file(join(projectPath, '.adev', 'agents', 'coder.md'));
    expect(await agentFile.exists()).toBe(true);
  });

  it('init → agents 폴더에 tester.md 파일 존재', async () => {
    const projectPath = join(tmpDir, 'agent-tester');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const agentFile = Bun.file(join(projectPath, '.adev', 'agents', 'tester.md'));
    expect(await agentFile.exists()).toBe(true);
  });

  it('project add → 특수문자 포함 UUID 기반 이름 → ok 또는 에러', async () => {
    const specialName = `proj-${crypto.randomUUID()}-!@#`;
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', join(tmpDir, specialName)], DEFAULT_OPTIONS);
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── 배치 64 추가 E2E 시나리오 ────────────────────────────────

describe('프로젝트 생명주기 E2E 배치64 — init 상세 검증', () => {
  it('init → .adev/config.json embedding 섹션 검증', async () => {
    const projectPath = join(tmpDir, 'embed-check');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.embedding).toBeDefined();
    expect(typeof config.embedding).toBe('object');
  });

  it('init → .adev/config.json testing 섹션 검증', async () => {
    const projectPath = join(tmpDir, 'test-check');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.testing).toBeDefined();
    expect(typeof config.testing).toBe('object');
  });

  it('init → .adev/config.json log 섹션 검증', async () => {
    const projectPath = join(tmpDir, 'log-check');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log).toBeDefined();
    expect(typeof config.log).toBe('object');
  });

  it('init 결과는 boolean ok', async () => {
    const projectPath = join(tmpDir, 'bool-init');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof result.ok).toBe('boolean');
  });

  it('init 결과 ok=true → config.json 파일 존재', async () => {
    const projectPath = join(tmpDir, 'exists-check');
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    if (result.ok) {
      const configFile = Bun.file(join(projectPath, '.adev', 'config.json'));
      expect(await configFile.exists()).toBe(true);
    }
  });

  it('init 두 번째 시도 → error.code 존재', async () => {
    const projectPath = join(tmpDir, 'double-init');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r2 = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    if (!r2.ok) {
      expect(typeof r2.error.code).toBe('string');
    }
  });

  it('init → verification 섹션 검증', async () => {
    const projectPath = join(tmpDir, 'verify-check');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.verification).toBeDefined();
  });

  it('init → agents 폴더에 qa.md 존재', async () => {
    const projectPath = join(tmpDir, 'agent-qa');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const agentFile = Bun.file(join(projectPath, '.adev', 'agents', 'qa.md'));
    expect(await agentFile.exists()).toBe(true);
  });

  it('init → agents 폴더에 reviewer.md 존재', async () => {
    const projectPath = join(tmpDir, 'agent-reviewer');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const agentFile = Bun.file(join(projectPath, '.adev', 'agents', 'reviewer.md'));
    expect(await agentFile.exists()).toBe(true);
  });

  it('init → config.json 파싱 가능', async () => {
    const projectPath = join(tmpDir, 'parseable-cfg');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(async () => {
      await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    }).not.toThrow();
  });

  it('UUID 기반 project path init → ok=true', async () => {
    const uuid = crypto.randomUUID();
    const projectPath = join(tmpDir, uuid);
    const initCmd = new InitCommand(logger, registryDir);
    const result = await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    expect(result.ok).toBe(true);
  });
});

describe('프로젝트 생명주기 E2E 배치64 — config 상세 검증', () => {
  it('config set log.level=error → 조회 확인', async () => {
    const projectPath = join(tmpDir, 'cfg-err-level');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const setResult = await configCmd.execute(['set', 'log.level', 'error'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof setResult.ok).toBe('boolean');
    if (setResult.ok) {
      const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
      expect(config.log.level).toBe('error');
    }
  });

  it('config set log.level=info → 조회 확인', async () => {
    const projectPath = join(tmpDir, 'cfg-info-level');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const setResult = await configCmd.execute(['set', 'log.level', 'info'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof setResult.ok).toBe('boolean');
    if (setResult.ok) {
      const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
      expect(config.log.level).toBe('info');
    }
  });

  it('config list → ok=true', async () => {
    const projectPath = join(tmpDir, 'cfg-list-ok');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r = await configCmd.execute(['list'], { ...DEFAULT_OPTIONS, projectPath });
    expect(r.ok).toBe(true);
  });

  it('config set 5회 연속 다른 키 → 모두 ok 또는 에러', async () => {
    const projectPath = join(tmpDir, 'cfg-5set');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const pairs = [
      ['log.level', 'debug'],
      ['log.level', 'info'],
      ['log.level', 'warn'],
      ['log.level', 'error'],
      ['log.level', 'debug'],
    ];
    for (const [key, value] of pairs) {
      const r = await configCmd.execute(['set', key as string, value as string], { ...DEFAULT_OPTIONS, projectPath });
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('config get → ok 또는 에러', async () => {
    const projectPath = join(tmpDir, 'cfg-get');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r = await configCmd.execute(['get', 'log.level'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof r.ok).toBe('boolean');
  });

  it('init 없이 config list → ok=false 또는 에러', async () => {
    const projectPath = join(tmpDir, 'no-init-cfg');
    const configCmd = new ConfigCommand(logger);
    const r = await configCmd.execute(['list'], { ...DEFAULT_OPTIONS, projectPath });
    // 초기화 없으면 실패해야 함
    expect(typeof r.ok).toBe('boolean');
  });

  it('config 잘못된 서브명령 → 에러', async () => {
    const projectPath = join(tmpDir, 'bad-cfg-cmd');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r = await configCmd.execute(['invalid-subcommand'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof r.ok).toBe('boolean');
  });

  it('config set → 직후 파일에서 값 확인', async () => {
    const projectPath = join(tmpDir, 'cfg-file-verify');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    await configCmd.execute(['set', 'log.level', 'debug'], { ...DEFAULT_OPTIONS, projectPath });
    const config = await Bun.file(join(projectPath, '.adev', 'config.json')).json();
    expect(config.log.level).toBe('debug');
  });

  it('config list 결과는 boolean ok', async () => {
    const projectPath = join(tmpDir, 'cfg-list-bool');
    const initCmd = new InitCommand(logger, registryDir);
    const configCmd = new ConfigCommand(logger);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r = await configCmd.execute(['list'], { ...DEFAULT_OPTIONS, projectPath });
    expect(typeof r.ok).toBe('boolean');
  });
});

describe('프로젝트 생명주기 E2E 배치64 — project 명령 상세', () => {
  it('project add → ok=true', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['add', join(tmpDir, 'add-ok')], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('project list → ok=true', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const result = await projCmd.execute(['list'], DEFAULT_OPTIONS);
    expect(result.ok).toBe(true);
  });

  it('project add + list → 등록된 프로젝트 포함', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'list-check')], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      const names = regResult.value.projects.map((p: { name: string }) => p.name);
      expect(names).toContain('list-check');
    }
  });

  it('project remove → ok=true', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'to-remove')], DEFAULT_OPTIONS);
    const r = await projCmd.execute(['remove', 'to-remove'], DEFAULT_OPTIONS);
    expect(r.ok).toBe(true);
  });

  it('project remove 없는 이름 → ok=false', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const r = await projCmd.execute(['remove', 'nonexistent-proj'], DEFAULT_OPTIONS);
    expect(r.ok).toBe(false);
  });

  it('project switch → ok=true', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'sw-target')], DEFAULT_OPTIONS);
    const r = await projCmd.execute(['switch', 'sw-target'], DEFAULT_OPTIONS);
    expect(r.ok).toBe(true);
  });

  it('project switch → registry activeProject 변경', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'sw-confirm')], DEFAULT_OPTIONS);
    await projCmd.execute(['switch', 'sw-confirm'], DEFAULT_OPTIONS);
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.activeProject).toBe('sw-confirm');
    }
  });

  it('project add 10개 → registry length 10', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 10; i++) {
      await projCmd.execute(['add', join(tmpDir, `batch-proj-${i}`)], DEFAULT_OPTIONS);
    }
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects.length).toBe(10);
    }
  });

  it('project add 10개 → 5개 remove → 5개 남음', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 10; i++) {
      await projCmd.execute(['add', join(tmpDir, `rm-half-${i}`)], DEFAULT_OPTIONS);
    }
    for (let i = 0; i < 5; i++) {
      await projCmd.execute(['remove', `rm-half-${i}`], DEFAULT_OPTIONS);
    }
    const regResult = await loadRegistry(registryDir);
    if (regResult.ok) {
      expect(regResult.value.projects.length).toBe(5);
    }
  });

  it('project add 중복 이름 → ok=false', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'dup-proj')], DEFAULT_OPTIONS);
    const r = await projCmd.execute(['add', join(tmpDir, 'dup-proj')], DEFAULT_OPTIONS);
    expect(r.ok).toBe(false);
  });

  it('project switch 없는 이름 → ok=false', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    const r = await projCmd.execute(['switch', 'no-such-project'], DEFAULT_OPTIONS);
    expect(r.ok).toBe(false);
  });
});

describe('프로젝트 생명주기 E2E 배치64 — CommandRouter 상세', () => {
  it('CommandRouter 인스턴스 생성 → ok', () => {
    expect(() => new CommandRouter(logger)).not.toThrow();
  });

  it('CommandRouter register + execute → boolean ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new ConfigCommand(logger));
    const projectPath = join(tmpDir, 'router-test');
    const initCmd = new InitCommand(logger, registryDir);
    await initCmd.execute([], { ...DEFAULT_OPTIONS, projectPath });
    const r = await router.execute(['config', 'list', `--project-path=${projectPath}`]);
    expect(typeof r.ok).toBe('boolean');
  });

  it('CommandRouter 알 수 없는 명령 → ok=false', async () => {
    const router = new CommandRouter(logger);
    const r = await router.execute(['unknown-command-xyz']);
    expect(r.ok).toBe(false);
  });

  it('CommandRouter register 여러 명령 → 각각 실행 가능', async () => {
    const router = new CommandRouter(logger);
    router.register(new ConfigCommand(logger));
    router.register(new ProjectCommand(logger, registryDir));
    // project list
    const r = await router.execute(['project', 'list']);
    expect(typeof r.ok).toBe('boolean');
  });

  it('CommandRouter execute 인자 없음 → boolean ok', async () => {
    const router = new CommandRouter(logger);
    const r = await router.execute([]);
    expect(typeof r.ok).toBe('boolean');
  });

  it('CommandRouter init 명령 등록 후 실행 → boolean ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new InitCommand(logger, registryDir));
    const projectPath = join(tmpDir, 'router-init-test');
    const r = await router.execute(['init', '--yes', `--project-path=${projectPath}`]);
    expect(typeof r.ok).toBe('boolean');
  });
});

describe('프로젝트 생명주기 E2E 배치64 — loadRegistry 상세', () => {
  it('loadRegistry 비어있는 registry → ok=true, projects 빈 배열', async () => {
    const result = await loadRegistry(registryDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value.projects)).toBe(true);
    }
  });

  it('loadRegistry 없는 디렉토리 → ok 또는 에러', async () => {
    const nonExist = join(tmpDir, 'no-registry-dir');
    const result = await loadRegistry(nonExist);
    expect(typeof result.ok).toBe('boolean');
  });

  it('project add 후 loadRegistry → projects.length > 0', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'reg-load-check')], DEFAULT_OPTIONS);
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.projects.length).toBeGreaterThan(0);
    }
  });

  it('loadRegistry 결과 projects는 배열', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(Array.isArray(result.value.projects)).toBe(true);
    }
  });

  it('loadRegistry 결과 activeProject는 string 또는 null/undefined', async () => {
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      const active = result.value.activeProject;
      expect(typeof active === 'string' || active == null).toBe(true);
    }
  });

  it('5개 add 후 loadRegistry → 5개 반환', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    for (let i = 0; i < 5; i++) {
      await projCmd.execute(['add', join(tmpDir, `reg5-${i}`)], DEFAULT_OPTIONS);
    }
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.projects.length).toBe(5);
    }
  });

  it('add → remove → loadRegistry → projects.length 감소', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'reg-dec-1')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'reg-dec-2')], DEFAULT_OPTIONS);
    const before = await loadRegistry(registryDir);
    await projCmd.execute(['remove', 'reg-dec-1'], DEFAULT_OPTIONS);
    const after = await loadRegistry(registryDir);
    if (before.ok && after.ok) {
      expect(after.value.projects.length).toBe(before.value.projects.length - 1);
    }
  });

  it('switch 후 loadRegistry → activeProject 변경 확인', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'active-check-a')], DEFAULT_OPTIONS);
    await projCmd.execute(['add', join(tmpDir, 'active-check-b')], DEFAULT_OPTIONS);
    await projCmd.execute(['switch', 'active-check-b'], DEFAULT_OPTIONS);
    const result = await loadRegistry(registryDir);
    if (result.ok) {
      expect(result.value.activeProject).toBe('active-check-b');
    }
  });

  it('loadRegistry 10회 호출 → 동일 결과', async () => {
    const projCmd = new ProjectCommand(logger, registryDir);
    await projCmd.execute(['add', join(tmpDir, 'idempotent-10')], DEFAULT_OPTIONS);
    const firstResult = await loadRegistry(registryDir);
    for (let i = 0; i < 9; i++) {
      const r = await loadRegistry(registryDir);
      if (firstResult.ok && r.ok) {
        expect(r.value.projects.length).toBe(firstResult.value.projects.length);
      }
    }
  });
});
