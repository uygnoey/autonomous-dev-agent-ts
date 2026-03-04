import { beforeEach, describe, expect, it } from 'bun:test';
import { AdevError } from '../../../src/core/errors.js';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ok } from '../../../src/core/types.js';
import type { Result } from '../../../src/core/types.js';
import { CommandRouter } from '../../../src/cli/main.js';
import type { CliCommand, CliOptions } from '../../../src/cli/types.js';

// ── 테스트 헬퍼 / Test Helpers ────────────────────────────────

const logger = new ConsoleLogger('error');

/**
 * 테스트용 더미 명령 / Dummy command for testing
 */
class DummyCommand implements CliCommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];

  /** 마지막 실행 시 받은 인자 / Last received args */
  lastArgs: readonly string[] = [];
  /** 마지막 실행 시 받은 옵션 / Last received options */
  lastOptions: CliOptions = { flags: {} };
  /** 실행 횟수 / Execution count */
  executeCount = 0;

  constructor(name: string, description = '', aliases?: readonly string[]) {
    this.name = name;
    this.description = description;
    this.aliases = aliases;
  }

  async execute(
    args: readonly string[],
    options: CliOptions,
  ): Promise<Result<void, AdevError>> {
    this.lastArgs = args;
    this.lastOptions = options;
    this.executeCount++;
    return ok(undefined);
  }
}

// ── CommandRouter.parse ───────────────────────────────────────

describe('CommandRouter.parse', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize'));
    router.register(new DummyCommand('start', 'Start'));
  });

  it('단순 명령을 파싱한다', () => {
    const result = router.parse(['init']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('init');
      expect(result.value.args.length).toBe(0);
    }
  });

  it('명령과 위치 인자를 파싱한다', () => {
    const result = router.parse(['init', '/tmp/project', 'extra-arg']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('init');
      expect(result.value.args).toEqual(['/tmp/project', 'extra-arg']);
    }
  });

  it('--flag 형태의 불리언 플래그를 파싱한다', () => {
    const result = router.parse(['init', '--verbose']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options.verbose).toBe(true);
      expect(result.value.options.flags.verbose).toBe(true);
    }
  });

  it('--key=value 형태의 플래그를 파싱한다', () => {
    const result = router.parse(['init', '--project-path=/tmp/proj']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options.projectPath).toBe('/tmp/proj');
      expect(result.value.options.flags['project-path']).toBe('/tmp/proj');
    }
  });

  it('--log-level 플래그를 파싱한다', () => {
    const result = router.parse(['init', '--log-level=debug']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options.logLevel).toBe('debug');
    }
  });

  it('위치 인자와 플래그를 혼합하여 파싱한다', () => {
    const result = router.parse(['init', 'arg1', '--verbose', 'arg2', '--project-path=/tmp']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.args).toEqual(['arg1', 'arg2']);
      expect(result.value.options.verbose).toBe(true);
      expect(result.value.options.projectPath).toBe('/tmp');
    }
  });

  it('빈 인자 배열이면 에러를 반환한다', () => {
    const result = router.parse([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_no_command');
    }
  });
});

// ── CommandRouter.execute ─────────────────────────────────────

describe('CommandRouter.execute', () => {
  let router: CommandRouter;
  let dummyInit: DummyCommand;
  let dummyStart: DummyCommand;

  beforeEach(() => {
    router = new CommandRouter(logger);
    dummyInit = new DummyCommand('init', 'Initialize', ['i']);
    dummyStart = new DummyCommand('start', 'Start conversation', ['s']);
    router.register(dummyInit);
    router.register(dummyStart);
  });

  it('올바른 명령으로 라우팅한다', async () => {
    const result = await router.execute(['init']);

    expect(result.ok).toBe(true);
    expect(dummyInit.executeCount).toBe(1);
    expect(dummyStart.executeCount).toBe(0);
  });

  it('별칭으로도 명령을 찾는다', async () => {
    const result = await router.execute(['i']);

    expect(result.ok).toBe(true);
    expect(dummyInit.executeCount).toBe(1);
  });

  it('위치 인자를 명령에 전달한다', async () => {
    await router.execute(['init', 'arg1', 'arg2']);

    expect(dummyInit.lastArgs).toEqual(['arg1', 'arg2']);
  });

  it('옵션을 명령에 전달한다', async () => {
    await router.execute(['init', '--verbose', '--project-path=/tmp']);

    expect(dummyInit.lastOptions.verbose).toBe(true);
    expect(dummyInit.lastOptions.projectPath).toBe('/tmp');
  });

  it('알 수 없는 명령은 에러를 반환한다', async () => {
    const result = await router.execute(['unknown-cmd']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_unknown_command');
      expect(result.error.message).toContain('unknown-cmd');
      expect(result.error.message).toContain('init');
    }
  });

  it('빈 인자 배열이면 에러를 반환한다', async () => {
    const result = await router.execute([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cli_no_command');
    }
  });
});

// ── CommandRouter.getHelp ─────────────────────────────────────

describe('CommandRouter.getHelp', () => {
  it('등록된 명령 목록을 포함한 도움말을 생성한다', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize project', ['i']));
    router.register(new DummyCommand('start', 'Start conversation'));

    const help = router.getHelp();

    expect(help).toContain('adev');
    expect(help).toContain('init');
    expect(help).toContain('Initialize project');
    expect(help).toContain('start');
    expect(help).toContain('Start conversation');
    expect(help).toContain('--project-path');
    expect(help).toContain('--verbose');
  });

  it('별칭을 표시한다', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init', ['i']));

    const help = router.getHelp();
    expect(help).toContain('i');
  });

  it('명령이 없으면 기본 도움말만 표시한다', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();

    expect(help).toContain('adev');
    expect(help).toContain('Commands:');
  });
});

// ── CommandRouter.register ────────────────────────────────────

describe('CommandRouter.register', () => {
  it('같은 이름으로 중복 등록하면 마지막 것이 우선한다', async () => {
    const router = new CommandRouter(logger);
    const first = new DummyCommand('test', 'First');
    const second = new DummyCommand('test', 'Second');

    router.register(first);
    router.register(second);

    await router.execute(['test']);
    expect(first.executeCount).toBe(0);
    expect(second.executeCount).toBe(1);
  });
});
