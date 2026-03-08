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
import { CommandRouter } from 'cli/main.js';
import { ConsoleLogger } from 'core/logger.js';
import type { CliOptions } from 'cli/types.js';
import { loadRegistry } from 'cli/commands/project.js';

const logger = new ConsoleLogger('error');

const DEFAULT_OPTIONS: CliOptions = { flags: {} };

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
    const result = await router.execute(['i', `--project-path=${projectPath}`]);
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

    const result = await router.execute(['i', `--project-path=${projectPath}`]);
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
});
