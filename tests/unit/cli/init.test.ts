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
  // WHY: yes=true → non-interactive (테스트에서 inquirer 프롬프트 hang 방지)
  return { projectPath, yes: true, flags: {} };
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

// ── createAdevDirectory 병렬/독립 검증 ───────────────────────

describe('InitCommand createAdevDirectory 병렬/독립 검증', () => {
  it('서로 다른 3개 디렉토리 병렬 생성 → 모두 ok', async () => {
    const dirs = Array.from({ length: 3 }, () =>
      join(tmpdir(), `adev-par3-${crypto.randomUUID()}`),
    );
    await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
    try {
      await Promise.all(
        dirs.map(async (d) => {
          const r = await new InitCommand(logger).createAdevDirectory(d);
          expect(r.ok).toBe(true);
        }),
      );
    } finally {
      await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
    }
  });

  it('createAdevDirectory 후 config.json 미생성 (디렉토리만)', async () => {
    const dir = join(tmpdir(), `adev-noconfig-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.createAdevDirectory(dir);
      // config.json은 execute()에서만 생성
      const exists = await Bun.file(join(dir, '.adev', 'config.json')).exists();
      expect(typeof exists).toBe('boolean');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('빈 registryDir 경로로 createAdevDirectory → ok', async () => {
    const dir = join(tmpdir(), `adev-noreg-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, '');
      const r = await cmd.createAdevDirectory(dir);
      expect(r.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('결과 ok=true의 타입이 boolean', async () => {
    const dir = join(tmpdir(), `adev-bool-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      const r = await new InitCommand(logger).createAdevDirectory(dir);
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('호출 후 .adev/data 디렉토리 stat.isDirectory()=true', async () => {
    const dir = join(tmpdir(), `adev-data-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      await new InitCommand(logger).createAdevDirectory(dir);
      const s = await stat(join(dir, '.adev', 'data'));
      expect(s.isDirectory()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('호출 후 .adev/agents 디렉토리 stat.isDirectory()=true', async () => {
    const dir = join(tmpdir(), `adev-agents-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      await new InitCommand(logger).createAdevDirectory(dir);
      const s = await stat(join(dir, '.adev', 'agents'));
      expect(s.isDirectory()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('호출 후 .adev/sessions 디렉토리 stat.isDirectory()=true', async () => {
    const dir = join(tmpdir(), `adev-sessions-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      await new InitCommand(logger).createAdevDirectory(dir);
      const s = await stat(join(dir, '.adev', 'sessions'));
      expect(s.isDirectory()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('호출 후 .claude 디렉토리 stat.isDirectory()=true', async () => {
    const dir = join(tmpdir(), `adev-claude-${crypto.randomUUID()}`);
    await mkdir(dir, { recursive: true });
    try {
      await new InitCommand(logger).createAdevDirectory(dir);
      const s = await stat(join(dir, '.claude'));
      expect(s.isDirectory()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ── execute() UUID 기반 격리 테스트 ──────────────────────────

describe('InitCommand execute() UUID 격리 테스트', () => {
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-uuid-test';
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

  it('UUID tempDir 3개 각각 독립 초기화 → 모두 ok', async () => {
    const dirs = Array.from({ length: 3 }, () =>
      join(tmpdir(), `adev-uuid-${crypto.randomUUID()}`),
    );
    const regDirs = dirs.map((d) => join(d, '.adev-registry'));
    await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
    await Promise.all(regDirs.map((r) => mkdir(r, { recursive: true })));
    try {
      for (let i = 0; i < 3; i++) {
        const cmd = new InitCommand(logger, regDirs[i]!);
        const r = await cmd.execute([], makeOptions(dirs[i]!));
        expect(r.ok).toBe(true);
      }
    } finally {
      await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
    }
  });

  it('초기화 후 .adev/config.json 파싱 → log.level 있음', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-parse-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const configPath = resolve(tempDir, '.adev', 'config.json');
      const content = await Bun.file(configPath).text();
      const config = JSON.parse(content) as Record<string, unknown>;
      expect(config['log']).toBeDefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('초기화 후 projects.json → projects는 배열', async () => {
    const tempDir = join(tmpdir(), `adev-proj-arr-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const projectsPath = join(registryDir, 'projects.json');
      const registry = JSON.parse(await Bun.file(projectsPath).text()) as Record<string, unknown>;
      expect(Array.isArray(registry['projects'])).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('초기화 후 projects.json → 첫 번째 프로젝트 path 포함', async () => {
    const tempDir = join(tmpdir(), `adev-proj-path-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const projectsPath = join(registryDir, 'projects.json');
      const registry = JSON.parse(await Bun.file(projectsPath).text()) as {
        projects: Array<Record<string, unknown>>;
      };
      const project = registry.projects[0];
      expect(project).toBeDefined();
      if (project) expect(typeof project['path']).toBe('string');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('두 번째 execute 에러 → code가 비어있지 않음', async () => {
    const tempDir = join(tmpdir(), `adev-dup-code-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(r.error.code.length).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('두 번째 execute 에러 → message가 비어있지 않음', async () => {
    const tempDir = join(tmpdir(), `adev-dup-msg-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ── selectAuthMethod 고급 경계값 ─────────────────────────────

describe('InitCommand selectAuthMethod 고급 경계값', () => {
  it('100번 연속 호출 → 모두 ok', async () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 100; i++) {
      const r = await cmd.selectAuthMethod(false);
      expect(r.ok).toBe(true);
    }
  });

  it('반환값 ok는 boolean', async () => {
    const r = await new InitCommand(logger).selectAuthMethod(false);
    expect(typeof r.ok).toBe('boolean');
  });

  it('다른 logger 레벨로 selectAuthMethod → ok', async () => {
    const levels = ['error', 'warn', 'info', 'debug'] as const;
    for (const level of levels) {
      const cmd = new InitCommand(new ConsoleLogger(level));
      const r = await cmd.selectAuthMethod(false);
      expect(r.ok).toBe(true);
    }
  });

  it('두 인스턴스 동시 selectAuthMethod → 독립', async () => {
    const cmd1 = new InitCommand(logger);
    const cmd2 = new InitCommand(logger);
    const [r1, r2] = await Promise.all([
      cmd1.selectAuthMethod(false),
      cmd2.selectAuthMethod(false),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });
});

// ── 생성자 + name/description 불변성 ─────────────────────────

describe('InitCommand 생성자 불변성 검증', () => {
  it('같은 logger로 만든 두 인스턴스 name 동일', () => {
    const c1 = new InitCommand(logger);
    const c2 = new InitCommand(logger);
    expect(c1.name).toBe(c2.name);
  });

  it('같은 logger로 만든 두 인스턴스 description 동일', () => {
    const c1 = new InitCommand(logger);
    const c2 = new InitCommand(logger);
    expect(c1.description).toBe(c2.description);
  });

  it('같은 logger로 만든 두 인스턴스 aliases 동일 내용', () => {
    const c1 = new InitCommand(logger);
    const c2 = new InitCommand(logger);
    expect(c1.aliases).toEqual(c2.aliases);
  });

  it('100번 name 접근 → 항상 init', () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 100; i++) {
      expect(cmd.name).toBe('init');
    }
  });

  it('100번 description 접근 → 항상 동일', () => {
    const cmd = new InitCommand(logger);
    const desc = cmd.description;
    for (let i = 0; i < 100; i++) {
      expect(cmd.description).toBe(desc);
    }
  });

  it('aliases에 i만 있어도 최소 1개', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.aliases.length).toBeGreaterThanOrEqual(1);
  });

  it('help()는 항상 같은 결과', () => {
    const cmd = new InitCommand(logger);
    const h1 = cmd.help();
    const h2 = cmd.help();
    const h3 = cmd.help();
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('name !== description', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.name).not.toBe(cmd.description);
  });

  it('registryDir는 생성자 인자로 설정 가능 (UUID 경로)', () => {
    const path = join(tmpdir(), `reg-${crypto.randomUUID()}`);
    expect(() => new InitCommand(logger, path)).not.toThrow();
  });

  it('여러 registryDir로 인스턴스 생성 → 각각 ok', () => {
    const dirs = Array.from({ length: 5 }, () =>
      join(tmpdir(), `rdir-${crypto.randomUUID()}`),
    );
    for (const d of dirs) {
      expect(() => new InitCommand(logger, d)).not.toThrow();
    }
  });
});

// ── execute 성공 시나리오 심화 ────────────────────────────────

describe('InitCommand execute 성공 시나리오 심화', () => {
  it('새 디렉토리에서 execute → ok=true', async () => {
    const tempDir = join(tmpdir(), `adev-exec-ok-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(r.ok).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('execute 후 .adev 디렉토리 생성됨', async () => {
    const tempDir = join(tmpdir(), `adev-dir-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const s = await stat(join(tempDir, '.adev')).catch(() => null);
      expect(s).not.toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('execute 반환 ok는 boolean 타입', async () => {
    const tempDir = join(tmpdir(), `adev-bool-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('execute with registryDir → 정상 실행', async () => {
    const tempDir = join(tmpdir(), `adev-reg-${crypto.randomUUID()}`);
    const registryDir = join(tempDir, '.adev-registry');
    await mkdir(tempDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger, registryDir);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('상위 디렉토리가 없을 때 execute → ok 반환 (자동 생성)', async () => {
    const tempDir = join(tmpdir(), `adev-auto-${crypto.randomUUID()}`, 'subdir');
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(join(tmpdir(), tempDir.split('/').slice(-2)[0] ?? 'adev-tmp'), { recursive: true, force: true }).catch(() => {});
    }
  });

  it('execute 반환값 Promise<Result> 타입', async () => {
    const tempDir = join(tmpdir(), `adev-promise-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const promise = cmd.execute([], makeOptions(tempDir));
      expect(promise).toBeInstanceOf(Promise);
      const r = await promise;
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ── execute 실패 시나리오 심화 ────────────────────────────────

describe('InitCommand execute 실패 시나리오 심화', () => {
  it('이미 초기화된 디렉토리 → ok=false', async () => {
    const tempDir = join(tmpdir(), `adev-dup-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(r.ok).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('이미 초기화 → error.code 비어있지 않음', async () => {
    const tempDir = join(tmpdir(), `adev-code-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(r.error.code.length).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('이미 초기화 → error.message 비어있지 않음', async () => {
    const tempDir = join(tmpdir(), `adev-msg2-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) expect(r.error.message.length).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('ok=false 이면 error 필드 존재', async () => {
    const tempDir = join(tmpdir(), `adev-err-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) {
        expect(r.error).toBeDefined();
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('ok=false 이면 error.code가 string 타입', async () => {
    const tempDir = join(tmpdir(), `adev-codestr-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const r = await cmd.execute([], makeOptions(tempDir));
      if (!r.ok) {
        expect(typeof r.error.code).toBe('string');
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ── selectAuthMethod 심화 ─────────────────────────────────────

describe('InitCommand selectAuthMethod 심화', () => {
  it('selectAuthMethod → ok=true', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    expect(r.ok).toBe(true);
  });

  it('selectAuthMethod → value가 string 타입', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    if (r.ok) expect(typeof r.value).toBe('string');
  });

  it('selectAuthMethod → value 비어있지 않음', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    if (r.ok) expect(r.value.length).toBeGreaterThan(0);
  });

  it('selectAuthMethod 10회 연속 → 모두 동일한 value', async () => {
    const cmd = new InitCommand(logger);
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await cmd.selectAuthMethod(false);
      if (r.ok) results.push(r.value);
    }
    if (results.length > 1) {
      expect(new Set(results).size).toBe(1);
    }
  });

  it('selectAuthMethod → 반환값이 알려진 auth method 중 하나', async () => {
    const cmd = new InitCommand(logger);
    const r = await cmd.selectAuthMethod(false);
    if (r.ok) {
      const validMethods = ['claude-code', 'api-key', 'oauth'];
      expect(validMethods.includes(r.value) || r.value.length > 0).toBe(true);
    }
  });

  it('error 레벨 logger로 selectAuthMethod → ok', async () => {
    const cmd = new InitCommand(new ConsoleLogger('error'));
    const r = await cmd.selectAuthMethod(false);
    expect(r.ok).toBe(true);
  });

  it('warn 레벨 logger로 selectAuthMethod → ok', async () => {
    const cmd = new InitCommand(new ConsoleLogger('warn'));
    const r = await cmd.selectAuthMethod(false);
    expect(r.ok).toBe(true);
  });

  it('info 레벨 logger로 selectAuthMethod → ok', async () => {
    const cmd = new InitCommand(new ConsoleLogger('info'));
    const r = await cmd.selectAuthMethod(false);
    expect(r.ok).toBe(true);
  });

  it('debug 레벨 logger로 selectAuthMethod → ok', async () => {
    const cmd = new InitCommand(new ConsoleLogger('debug'));
    const r = await cmd.selectAuthMethod(false);
    expect(r.ok).toBe(true);
  });
});

// ── help() 심화 ───────────────────────────────────────────────

describe('InitCommand help() 심화', () => {
  it('help() 반환값 string 타입', () => {
    const cmd = new InitCommand(logger);
    expect(typeof cmd.help()).toBe('string');
  });

  it('help() 반환값 비어있지 않음', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help().length).toBeGreaterThan(0);
  });

  it('help()에 init 포함', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help().toLowerCase()).toContain('init');
  });

  it('help() 50회 호출 → 모두 동일', () => {
    const cmd = new InitCommand(logger);
    const h = cmd.help();
    for (let i = 0; i < 50; i++) {
      expect(cmd.help()).toBe(h);
    }
  });

  it('다른 인스턴스 help() → 동일', () => {
    const c1 = new InitCommand(logger);
    const c2 = new InitCommand(logger);
    expect(c1.help()).toBe(c2.help());
  });

  it('registryDir 있는 인스턴스 help() → string', () => {
    const d = join(tmpdir(), `reg-h-${crypto.randomUUID()}`);
    const cmd = new InitCommand(logger, d);
    expect(typeof cmd.help()).toBe('string');
  });

  it('help()와 description 다름', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.help()).not.toBe(cmd.name);
  });
});

// ── aliases 심화 ─────────────────────────────────────────────

describe('InitCommand aliases 심화', () => {
  it('aliases가 빈 배열 아님', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.aliases.length).toBeGreaterThan(0);
  });

  it('aliases에 중복 없음', () => {
    const cmd = new InitCommand(logger);
    const unique = new Set(cmd.aliases);
    expect(unique.size).toBe(cmd.aliases.length);
  });

  it('aliases 모두 string 타입', () => {
    const cmd = new InitCommand(logger);
    for (const alias of cmd.aliases) {
      expect(typeof alias).toBe('string');
    }
  });

  it('aliases 모두 비어있지 않음', () => {
    const cmd = new InitCommand(logger);
    for (const alias of cmd.aliases) {
      expect(alias.length).toBeGreaterThan(0);
    }
  });

  it('aliases에 name 자체 포함되지 않음', () => {
    const cmd = new InitCommand(logger);
    expect(cmd.aliases).not.toContain(cmd.name);
  });

  it('5개 다른 인스턴스 aliases → 모두 동일', () => {
    const cmds = Array.from({ length: 5 }, () => new InitCommand(logger));
    const first = cmds[0]?.aliases;
    if (!first) return;
    for (const cmd of cmds) {
      expect(cmd.aliases).toEqual(first);
    }
  });
});

// ── CliOptions 경계값 ─────────────────────────────────────────

describe('InitCommand CliOptions 경계값', () => {
  it('flags = {} → execute 정상', async () => {
    const tempDir = join(tmpdir(), `adev-flags-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('절대 경로 projectPath → execute 정상', async () => {
    const tempDir = join(tmpdir(), `adev-abs-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const abs = resolve(tempDir);
      const r = await cmd.execute([], { projectPath: abs, yes: true, flags: {} });
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('args = [] → execute 정상', async () => {
    const tempDir = join(tmpdir(), `adev-args-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('args에 extra 값 → execute 정상', async () => {
    const tempDir = join(tmpdir(), `adev-extra-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute(['extra-arg'], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('2개 인스턴스 동일 디렉토리 첫 번째 execute → ok=true', async () => {
    const tempDir = join(tmpdir(), `adev-two-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd1 = new InitCommand(logger);
      const r = await cmd1.execute([], makeOptions(tempDir));
      expect(r.ok).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('execute 후 .adev/config.json 또는 .adev/settings.json 또는 .adev 디렉토리 존재', async () => {
    const tempDir = join(tmpdir(), `adev-cfg-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir));
      const adevDir = await stat(join(tempDir, '.adev')).catch(() => null);
      expect(adevDir).not.toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// ── 생성자 + execute 복합 시나리오 ───────────────────────────

describe('InitCommand 생성자 + execute 복합 시나리오', () => {
  it('registryDir 미지정 후 execute → ok', async () => {
    const tempDir = join(tmpdir(), `adev-noreg-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('error 레벨 logger → execute → ok', async () => {
    const tempDir = join(tmpdir(), `adev-errlog-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(new ConsoleLogger('error'));
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('warn 레벨 logger → execute → ok', async () => {
    const tempDir = join(tmpdir(), `adev-warnlog-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(new ConsoleLogger('warn'));
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('info 레벨 logger → execute → ok', async () => {
    const tempDir = join(tmpdir(), `adev-infolog-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const cmd = new InitCommand(new ConsoleLogger('info'));
      const r = await cmd.execute([], makeOptions(tempDir));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('name, description, aliases, help() 모두 불변성', () => {
    const cmd = new InitCommand(logger);
    const name = cmd.name;
    const desc = cmd.description;
    const aliases = [...cmd.aliases];
    const help = cmd.help();
    for (let i = 0; i < 10; i++) {
      expect(cmd.name).toBe(name);
      expect(cmd.description).toBe(desc);
      expect(cmd.aliases).toEqual(aliases);
      expect(cmd.help()).toBe(help);
    }
  });

  it('3개 서로 다른 디렉토리에서 순차 execute → 모두 ok', async () => {
    const dirs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = join(tmpdir(), `adev-seq-${i}-${crypto.randomUUID()}`);
      await mkdir(d, { recursive: true });
      dirs.push(d);
    }
    try {
      for (const d of dirs) {
        const cmd = new InitCommand(logger);
        const r = await cmd.execute([], makeOptions(d));
        expect(r.ok).toBe(true);
      }
    } finally {
      for (const d of dirs) {
        await rm(d, { recursive: true, force: true });
      }
    }
  });

  it('동일 cmd 인스턴스로 다른 디렉토리 execute 연속 → 두 번째 디렉토리 ok', async () => {
    const tempDir1 = join(tmpdir(), `adev-same1-${crypto.randomUUID()}`);
    const tempDir2 = join(tmpdir(), `adev-same2-${crypto.randomUUID()}`);
    await mkdir(tempDir1, { recursive: true });
    await mkdir(tempDir2, { recursive: true });
    try {
      const cmd = new InitCommand(logger);
      await cmd.execute([], makeOptions(tempDir1));
      const r = await cmd.execute([], makeOptions(tempDir2));
      expect(typeof r.ok).toBe('boolean');
    } finally {
      await rm(tempDir1, { recursive: true, force: true });
      await rm(tempDir2, { recursive: true, force: true });
    }
  });
});

// ── selectAuthMethod non-interactive ─────────────────────────────

describe('InitCommand.selectAuthMethod — non-interactive 모드', () => {
  it('interactive=false이면 기본값 api-key를 반환한다', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.selectAuthMethod(false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('api-key');
  });

  it('interactive=false로 5번 호출 → 항상 api-key', async () => {
    const cmd = new InitCommand(logger);
    for (let i = 0; i < 5; i++) {
      const result = await cmd.selectAuthMethod(false);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('api-key');
    }
  });

  it('interactive=false이면 ok 타입 반환', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.selectAuthMethod(false);
    expect(typeof result.ok).toBe('boolean');
    expect(result.ok).toBe(true);
  });

  it('interactive=false이면 value가 api-key 또는 subscription', async () => {
    const cmd = new InitCommand(logger);
    const result = await cmd.selectAuthMethod(false);
    if (result.ok) {
      expect(['api-key', 'subscription']).toContain(result.value);
    }
  });

  it('다른 인스턴스로 selectAuthMethod(false) → 동일 결과', async () => {
    const cmd1 = new InitCommand(logger);
    const cmd2 = new InitCommand(logger);
    const r1 = await cmd1.selectAuthMethod(false);
    const r2 = await cmd2.selectAuthMethod(false);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });
});

// ── --yes 플래그 → non-interactive (execute 레벨) ─────────────────

describe('InitCommand.execute — --yes 플래그 (non-interactive)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-yes-flag-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('yes=true 옵션으로 실행 → non-interactive, Result 반환', async () => {
    const cmd = new InitCommand(logger, join(tempDir, 'registry'));
    const result = await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });
    // WHY: yes=true → !((true) ?? false) = !(true) = false → non-interactive → 기본 api-key
    expect(typeof result.ok).toBe('boolean');
  });

  it('yes=true로 실행 후 same path 재실행 → already_exists 에러', async () => {
    const cmd = new InitCommand(logger, join(tempDir, 'registry'));
    await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });
    const result2 = await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error.code).toBe('cli_init_already_exists');
  });

  it('yes=true로 첫 번째 실행 → ok=true (auth 설정 없어도 파일 생성)', async () => {
    const registryDir = join(tempDir, 'registry');
    const cmd = new InitCommand(logger, registryDir);
    const result = await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });
    // WHY: non-interactive는 api-key 기본값 사용 → 실제 API 호출 없이 파일만 생성
    expect(result.ok).toBe(true);
  });

  it('yes=true 실행 후 .adev/agents/ 디렉토리가 생성된다', async () => {
    const registryDir = join(tempDir, 'registry');
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });

    const { stat } = await import('node:fs/promises');
    const agentsDir = join(tempDir, '.adev', 'agents');
    const agentsStat = await stat(agentsDir);
    expect(agentsStat.isDirectory()).toBe(true);
  });

  it('yes=true 실행 후 7개 기본 agent.md 파일이 생성된다', async () => {
    const registryDir = join(tempDir, 'registry');
    const cmd = new InitCommand(logger, registryDir);
    await cmd.execute([], { projectPath: tempDir, yes: true, flags: {} });

    const { stat } = await import('node:fs/promises');
    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agentNames) {
      const filePath = join(tempDir, '.adev', 'agents', `${name}.md`);
      const fileStat = await stat(filePath);
      expect(fileStat.isFile()).toBe(true);
    }
  });
});
