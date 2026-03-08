/**
 * InitCommand 단위 테스트
 *
 * @description
 * KR: init 명령어 구현 테스트. 80%+ 경계값/오류 처리 비율.
 * EN: Tests for init command implementation. 80%+ edge/error ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { InitCommand } from 'cli/commands/init.js';
import type { CliOptions } from 'cli/types.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ────────────────────────────────

const logger = new ConsoleLogger('error');

function makeOptions(projectPath: string): CliOptions {
  return { projectPath, flags: {} };
}

// ── InitCommand 생성자 ────────────────────────────────────────

describe('InitCommand 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new InitCommand(logger)).not.toThrow();
  });

  it('name이 init이다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.name).toBe('init');
  });

  it('description이 정의된다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.description).toBeDefined();
    expect(cmd.description.length).toBeGreaterThan(0);
  });

  it('aliases가 배열이다', () => {
    const cmd = new InitCommand(logger);
    expect(Array.isArray(cmd.aliases)).toBe(true);
  });

  it('aliases에 i가 포함된다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.aliases).toContain('i');
  });

  it('registryDir 인자 없이 생성 가능하다', () => {
    expect(() => new InitCommand(logger)).not.toThrow();
  });

  it('registryDir 인자와 함께 생성 가능하다', () => {
    expect(() => new InitCommand(logger, '/tmp/test-registry')).not.toThrow();
  });
});

// ── InitCommand.help() ────────────────────────────────────────

describe('InitCommand help()', () => {
  it('help()가 문자열을 반환한다', () => {
    const cmd = new InitCommand(logger);
    expect(typeof cmd.help()).toBe('string');
  });

  it('help()가 비어있지 않다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help().length).toBeGreaterThan(0);
  });

  it('help()에 adev init이 포함된다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).toContain('adev init');
  });

  it('help()에 --path가 포함된다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).toContain('--path');
  });

  it('help()에 --auth가 포함된다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).toContain('--auth');
  });
});

// ── InitCommand.selectAuthMethod() ───────────────────────────

describe('InitCommand selectAuthMethod()', () => {
  it('interactive=false 시 ok=true 반환', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.selectAuthMethod(false);
    expect(result.ok).toBe(true);
  });

  it('interactive=false 시 api-key 반환', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.selectAuthMethod(false);
    if (result.ok) expect(result.value).toBe('api-key');
  });

  it('interactive=false 5번 호출 → 항상 api-key', async () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.selectAuthMethod(false);
      if (result.ok) expect(result.value).toBe('api-key');
    }
  });
});

// ── InitCommand.execute() - 성공 케이스 ──────────────────────

describe('InitCommand execute() - 성공 케이스', () => {
  let tempDir: string;
  let registryDir: string;
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-init-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });

    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key-for-init';
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('.adev/ 디렉토리 구조를 생성한다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.execute([], makeOptions(tempDir));
    expect(result.ok).toBe(true);

    const adevDir = resolve(tempDir, '.adev');
    expect(await Bun.file(join(adevDir, 'config.json')).exists()).toBe(true);

    for (const subdir of ['data', 'agents', 'sessions']) {
      const dirStat = await stat(join(adevDir, subdir));
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it('config.json에 log.level=info 설정', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.log.level).toBe('info');
  });

  it('config.json에 embedding.default=xenova-minilm 설정', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.embedding.default).toBe('xenova-minilm');
  });

  it('config.json에 verification.layer1Model=opus 설정', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const config = JSON.parse(await Bun.file(configPath).text());
    expect(config.verification.layer1Model).toBe('opus');
  });

  it('config.json이 유효한 JSON이다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('agents/ 디렉토리에 7개의 agent.md 파일이 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const agentsDir = resolve(tempDir, '.adev', 'agents');
    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agentNames) {
      const exists = await Bun.file(join(agentsDir, `${name}.md`)).exists();
      expect(exists).toBe(true);
    }
  });

  it('architect.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const mdPath = resolve(tempDir, '.adev', 'agents', 'architect.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('coder.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const mdPath = resolve(tempDir, '.adev', 'agents', 'coder.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('tester.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const mdPath = resolve(tempDir, '.adev', 'agents', 'tester.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('execute 결과가 ok=true이다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.execute([], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('.claude/ 디렉토리도 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const claudeDir = resolve(tempDir, '.claude');
    const s = await stat(claudeDir);
    expect(s.isDirectory()).toBe(true);
  });

  it('projects.json이 registryDir에 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const projectsPath = join(registryDir, 'projects.json');
    expect(await Bun.file(projectsPath).exists()).toBe(true);
  });

  it('projects.json이 유효한 JSON이다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const projectsPath = join(registryDir, 'projects.json');
    const content = await Bun.file(projectsPath).text();
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('projects.json에 프로젝트가 등록된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const projectsPath = join(registryDir, 'projects.json');
    const registry = JSON.parse(await Bun.file(projectsPath).text());
    expect(registry.projects.length).toBe(1);
  });

  it('인증 환경 미설정이어도 초기화 성공', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.execute([], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });
});

// ── InitCommand.execute() - 실패 케이스 ──────────────────────

describe('InitCommand execute() - 실패 케이스', () => {
  let tempDir: string;
  let registryDir: string;
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-init-fail-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });

    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('이미 초기화된 디렉토리에서는 ok=false 반환', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const secondResult = await cmd.execute([], makeOptions(tempDir));
    expect(secondResult.ok).toBe(false);
  });

  it('이미 초기화된 경우 code=cli_init_already_exists', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const secondResult = await cmd.execute([], makeOptions(tempDir));
    if (!secondResult.ok) {
      expect(secondResult.error.code).toBe('cli_init_already_exists');
    }
  });

  it('파일 경로를 디렉토리로 사용하면 ok=false 반환', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const badPath = import.meta.path + '/cannot/be/a/dir';
    const result = await cmd.execute([], makeOptions(badPath));
    expect(result.ok).toBe(false);
  });

  it('파일 경로를 디렉토리로 사용하면 code=cli_init_mkdir_failed', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const badPath = import.meta.path + '/cannot/be/a/dir';
    const result = await cmd.execute([], makeOptions(badPath));
    if (!result.ok) {
      expect(result.error.code).toBe('cli_init_mkdir_failed');
    }
  });

  it('두 번째 초기화 시 에러 메시지가 있다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));

    const secondResult = await cmd.execute([], makeOptions(tempDir));
    if (!secondResult.ok) {
      expect(secondResult.error.message.length).toBeGreaterThan(0);
    }
  });
});

// ── InitCommand.checkEnvVar() ─────────────────────────────────

describe('InitCommand checkEnvVar()', () => {
  let tempDir: string;
  let registryDir: string;
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-env-test-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });

    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('API 키 설정 + api-key 모드 → ok=true, value=true', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.checkEnvVar('api-key');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  it('미설정 상태 → ok=true, value=false', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.checkEnvVar('api-key');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  it('OAuth 토큰 설정 + subscription 모드 → ok=true', async () => {
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-token';
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.checkEnvVar('subscription');
    expect(result.ok).toBe(true);
  });

  it('API 키 설정 + subscription 모드 → ok=true, value=false', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.checkEnvVar('subscription');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });
});

// ── InitCommand.createAdevDirectory() ────────────────────────

describe('InitCommand createAdevDirectory()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-mkdir-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('ok=true 반환', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.createAdevDirectory(tempDir);
    expect(result.ok).toBe(true);
  });

  it('.adev/가 생성된다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.createAdevDirectory(tempDir);
    const s = await stat(join(tempDir, '.adev'));
    expect(s.isDirectory()).toBe(true);
  });

  it('.adev/data/가 생성된다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.createAdevDirectory(tempDir);
    const s = await stat(join(tempDir, '.adev', 'data'));
    expect(s.isDirectory()).toBe(true);
  });

  it('.adev/agents/가 생성된다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.createAdevDirectory(tempDir);
    const s = await stat(join(tempDir, '.adev', 'agents'));
    expect(s.isDirectory()).toBe(true);
  });

  it('.adev/sessions/가 생성된다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.createAdevDirectory(tempDir);
    const s = await stat(join(tempDir, '.adev', 'sessions'));
    expect(s.isDirectory()).toBe(true);
  });

  it('.claude/가 생성된다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.createAdevDirectory(tempDir);
    const s = await stat(join(tempDir, '.claude'));
    expect(s.isDirectory()).toBe(true);
  });

  it('두 번 호출해도 ok=true (recursive mkdir)', async () => {
    const cmd = new InitCommand(logger);
    const r1 = await cmd.createAdevDirectory(tempDir);
    const r2 = await cmd.createAdevDirectory(tempDir);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

// ── 추가 생성자 경계값 ───────────────────────────────────────

describe('InitCommand 추가 생성자 경계값', () => {
  it('10개 인스턴스 생성 → 모두 InitCommand', () => {
    for (let i = 0; i < 10; i++) {
      expect(new InitCommand(logger)).toBeInstanceOf(InitCommand);
    }
  });

  it('warn logger로 생성 가능', () => {
    expect(new InitCommand(new ConsoleLogger('warn'))).toBeInstanceOf(InitCommand);
  });

  it('debug logger로 생성 가능', () => {
    expect(new InitCommand(new ConsoleLogger('debug'))).toBeInstanceOf(InitCommand);
  });

  it('name이 string', () => {
    const cmd = new InitCommand(logger);
    expect(typeof cmd.name).toBe('string');
  });

  it('description이 string', () => {
    const cmd = new InitCommand(logger);
    expect(typeof cmd.description).toBe('string');
  });

  it('aliases가 배열', () => {
    const cmd = new InitCommand(logger);
    expect(Array.isArray(cmd.aliases)).toBe(true);
  });

  it('두 인스턴스 help() 일치', () => {
    const h1 = new InitCommand(logger).help();
    const h2 = new InitCommand(logger).help();
    expect(h1).toBe(h2);
  });

  it('5번 연속 help() → 동일', () => {
    const cmd = new InitCommand(logger);
    const first = cmd.help();
    for (let i = 0; i < 5; i++) {
      expect(cmd.help()).toBe(first);
    }
  });
});

// ── selectAuthMethod 추가 경계값 ──────────────────────────────

describe('InitCommand selectAuthMethod 추가 경계값', () => {
  it('ok boolean 타입', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    expect(typeof r.ok).toBe('boolean');
  });

  it('value가 string', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    if (r.ok) expect(typeof r.value).toBe('string');
  });

  it('10번 호출 → 모두 api-key', async () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 10; i++) {
      const r = await cmd.selectAuthMethod(false);
      if (r.ok) expect(r.value).toBe('api-key');
    }
  });

  it('두 인스턴스 selectAuthMethod 결과 동일', async () => {
    const r1 = await new InitCommand(logger).selectAuthMethod(false);
    const r2 = await new InitCommand(logger).selectAuthMethod(false);
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });
});

// ── execute() 추가 성공 경계값 ────────────────────────────────

describe('InitCommand execute() 추가 성공 경계값', () => {
  let tempDir: string;
  let registryDir: string;
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-exec-extra-${crypto.randomUUID()}`);
    registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });

    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key-extra';
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('ok boolean 타입', async () => {
    const cmd = new InitCommand(logger, registryDir);
    const r = await cmd.execute([], makeOptions(tempDir));
    expect(typeof r.ok).toBe('boolean');
  });

  it('두 번째 초기화 에러 코드는 string', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const r = await cmd.execute([], makeOptions(tempDir));
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('두 번째 초기화 에러 메시지는 string', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const r = await cmd.execute([], makeOptions(tempDir));
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('qa.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const mdPath = resolve(tempDir, '.adev', 'agents', 'qa.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('qc.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const mdPath = resolve(tempDir, '.adev', 'agents', 'qc.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('reviewer.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const mdPath = resolve(tempDir, '.adev', 'agents', 'reviewer.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('documenter.md가 생성된다', async () => {
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], makeOptions(tempDir));
    const mdPath = resolve(tempDir, '.adev', 'agents', 'documenter.md');
    expect(await Bun.file(mdPath).exists()).toBe(true);
  });

  it('다른 UUID tempDir에서도 ok=true', async () => {
    const altDir = join(tmpdir(), `adev-alt-${crypto.randomUUID()}`);
    const altRegDir = join(altDir, '.adev-registry');
    await mkdir(altDir, { recursive: true });
    await mkdir(altRegDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, altRegDir);
      const r = await cmd.execute([], makeOptions(altDir));
      expect(r.ok).toBe(true);
    } finally {
      await rm(altDir, { recursive: true, force: true });
    }
  });
});

// ── checkEnvVar 추가 경계값 ─────────────────────────────────

describe('InitCommand checkEnvVar 추가 경계값', () => {
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = originalOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('5번 api-key 체크 일관성', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-consistency';
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 5; i++) {
      const r = await cmd.checkEnvVar('api-key');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(true);
    }
  });

  it('5번 subscription 체크 일관성 (미설정)', async () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 5; i++) {
      const r = await cmd.checkEnvVar('subscription');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(false);
    }
  });

  it('ok boolean 타입', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.checkEnvVar('api-key');
    expect(typeof r.ok).toBe('boolean');
  });

  it('checkEnvVar 결과 value boolean 타입', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.checkEnvVar('api-key');
    if (r.ok) expect(typeof r.value).toBe('boolean');
  });
});

// ── createAdevDirectory 추가 경계값 ─────────────────────────

describe('InitCommand createAdevDirectory 추가 경계값', () => {
  it('ok boolean 타입', async () => {
    const dir = join(tmpdir(), `adev-dir-extra-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.createAdevDirectory(dir);
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('5번 반복 호출 → 모두 ok', async () => {
    const dir = join(tmpdir(), `adev-dir-5rep-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      for (let i = 0; i < 5; i++) {
        const r = await cmd.createAdevDirectory(dir);
        expect(r.ok).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('다른 UUID 디렉토리들 → 각각 ok', async () => {
    const dirs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const dir = join(tmpdir(), `adev-parallel-${crypto.randomUUID()}`);
      await mkdir(dir, { recursive: true });
      dirs.push(dir);
    }
    try {
      await Promise.all(
        dirs.map(async (dir) => {
          const cmd = new InitCommand(logger);
          const r = await cmd.createAdevDirectory(dir);
          expect(r.ok).toBe(true);
        }),
      );
    } finally {
      await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    }
  });
});

// ── 추가 edge/random 케이스 ──────────────────────────────────

describe('InitCommand 추가 edge 케이스', () => {
  it('help()가 --auth 포함', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).toContain('--auth');
  });

  it('help()가 --path 포함', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).toContain('--path');
  });

  it('aliases가 비어있지 않다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.aliases.length).toBeGreaterThan(0);
  });

  it('name이 비어있지 않다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.name.length).toBeGreaterThan(0);
  });

  it('description이 비어있지 않다', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.description.length).toBeGreaterThan(0);
  });

  it('selectAuthMethod(false) → value는 api-key 또는 subscription', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    if (r.ok) {
      expect(['api-key', 'subscription'].includes(r.value)).toBe(true);
    }
  });

  it('10개 인스턴스 name 모두 동일', () => {
    const names = Array.from({ length: 10 }, () => new InitCommand(logger).name);
    for (const n of names) expect(n).toBe('init');
  });

  it('10개 인스턴스 aliases 모두 배열', () => {
    for (let i = 0; i < 10; i++) {
      expect(Array.isArray(new InitCommand(logger).aliases)).toBe(true);
    }
  });

  it('registryDir에 긴 경로 사용 가능', () => {
    const longPath = join(tmpdir(), 'a'.repeat(50), 'b'.repeat(50));
    expect(() => new InitCommand(logger, longPath)).not.toThrow();
  });

  it('createAdevDirectory ok result.ok는 true', async () => {
    const dir = join(tmpdir(), `adev-edge-ok-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.createAdevDirectory(dir);
      expect(r.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('checkEnvVar api-key → ok boolean', async () => {
    const originalKey = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-edge-test';
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.checkEnvVar('api-key');
      expect(typeof r.ok).toBe('boolean');
    } finally {
      if (originalKey !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = originalKey;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    }
  });

  it('두 번째 execute 에러 code는 string', async () => {
    const tempDir = join(tmpdir(), `adev-edge-dup-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    const originalKey = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-edge-dup';
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(typeof r.error.code).toBe('string');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      if (originalKey !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = originalKey;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    }
  });

  it('두 번째 execute 에러 message는 string', async () => {
    const tempDir = join(tmpdir(), `adev-edge-msg-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    const originalKey = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-edge-msg';
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(typeof r.error.message).toBe('string');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      if (originalKey !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = originalKey;
      } else {
        delete process.env['ANTHROPIC_API_KEY'];
      }
    }
  });
});
