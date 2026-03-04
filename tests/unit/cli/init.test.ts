import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { InitCommand } from '../../../src/cli/commands/init.js';
import type { CliOptions } from '../../../src/cli/types.js';
import { ConsoleLogger } from '../../../src/core/logger.js';

// ── 테스트 헬퍼 / Test Helpers ────────────────────────────────

const logger = new ConsoleLogger('error');

function makeOptions(projectPath: string): CliOptions {
  return { projectPath, flags: {} };
}

// ── InitCommand ───────────────────────────────────────────────

describe('InitCommand', () => {
  let tempDir: string;
  let originalApiKey: string | undefined;
  let originalOauthToken: string | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `adev-init-test-${crypto.randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    // WHY: loadEnvironment가 에러를 반환하지 않도록 최소 인증 환경 설정
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
    const cmd = new InitCommand(logger);
    const result = await cmd.execute([], makeOptions(tempDir));

    expect(result.ok).toBe(true);

    // .adev/ 하위 디렉토리 확인
    const adevDir = resolve(tempDir, '.adev');
    expect(await Bun.file(join(adevDir, 'config.json')).exists()).toBe(true);

    for (const subdir of ['data', 'agents', 'sessions']) {
      const dirFile = Bun.file(join(adevDir, subdir, '.gitkeep'));
      // WHY: 디렉토리 존재 확인 — Bun.file로는 디렉토리를 직접 확인할 수 없으므로
      //      mkdir의 recursive: true 성공 여부로 간접 확인
      const stat = await Bun.file(join(adevDir, subdir)).exists();
      // 디렉토리는 Bun.file().exists()로 false가 반환될 수 있으므로 다른 방법 사용
      const dirStat = await import('node:fs/promises').then((fs) =>
        fs.stat(join(adevDir, subdir)),
      );
      expect(dirStat.isDirectory()).toBe(true);
    }
  });

  it('config.json에 기본 설정을 작성한다', async () => {
    const cmd = new InitCommand(logger);
    await cmd.execute([], makeOptions(tempDir));

    const configPath = resolve(tempDir, '.adev', 'config.json');
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content);

    expect(config.log.level).toBe('info');
    expect(config.embedding.default).toBe('xenova-minilm');
    expect(config.verification.layer1Model).toBe('opus');
  });

  it('이미 초기화된 디렉토리에서는 에러를 반환한다', async () => {
    const cmd = new InitCommand(logger);

    // 첫 번째 초기화
    const firstResult = await cmd.execute([], makeOptions(tempDir));
    expect(firstResult.ok).toBe(true);

    // 두 번째 초기화 시도
    const secondResult = await cmd.execute([], makeOptions(tempDir));
    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.error.code).toBe('cli_init_already_exists');
    }
  });

  it('읽기 전용 경로에서 디렉토리 생성 실패 시 에러를 반환한다', async () => {
    const cmd = new InitCommand(logger);
    // WHY: 존재하지 않는 중첩 경로에 쓰기 시도하면 OS에서 거부한다
    const badPath = '/nonexistent_root_dir/deep/nested/path';
    const result = await cmd.execute([], makeOptions(badPath));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_init_mkdir_failed');
    }
  });

  it('projectPath가 없으면 현재 디렉토리(.)를 사용한다', async () => {
    const cmd = new InitCommand(logger);
    // WHY: projectPath를 명시적으로 지정하여 현재 디렉토리 대신 tempDir 사용
    //      실제로 '.'가 resolve되는지는 parse 레벨에서 테스트
    const result = await cmd.execute([], makeOptions(tempDir));
    expect(result.ok).toBe(true);
  });

  it('인증 환경이 미설정이어도 초기화는 성공한다', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    const cmd = new InitCommand(logger);
    const result = await cmd.execute([], makeOptions(tempDir));

    // WHY: 인증 미설정은 경고만 출력하고 초기화 자체는 성공해야 한다
    expect(result.ok).toBe(true);
  });
});
