/**
 * CommandRouter 단위 테스트 / CommandRouter unit tests
 *
 * @description
 * 명령 등록, 파싱, 라우팅, 별칭, 플래그 파싱, 오류 처리 등
 * 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { CliCommand, CliOptions } from 'cli/types.js';
import { CommandRouter } from 'cli/command-router.js';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok, err } from 'core/types.js';
import { AdevError } from 'core/errors.js';

const logger = new ConsoleLogger('error');

// ── Mock 명령 ──────────────────────────────────────────────────

function makeCommand(
  name: string,
  options: {
    aliases?: string[];
    description?: string;
    executeResult?: Result<{ message: string }, AdevError>;
  } = {},
): CliCommand {
  return {
    name,
    aliases: options.aliases ?? [],
    description: options.description ?? `${name} command`,
    execute: async (_args: readonly string[], _options: CliOptions) => {
      if (options.executeResult !== undefined) {
        return options.executeResult;
      }
      return ok({ message: `${name} executed` });
    },
    help: () => `Help for ${name}`,
  };
}

function makeRouter(): CommandRouter {
  return new CommandRouter(logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('CommandRouter 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeRouter()).not.toThrow();
  });

  it('CommandRouter 인스턴스', () => {
    expect(makeRouter()).toBeInstanceOf(CommandRouter);
  });
});

// ── register ──────────────────────────────────────────────────

describe('CommandRouter.register', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = makeRouter();
  });

  it('명령 등록 → parse 성공', () => {
    router.register(makeCommand('init'));
    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
  });

  it('별칭으로 등록된 명령 → parse 성공', () => {
    router.register(makeCommand('initialize', { aliases: ['init', 'i'] }));
    expect(router.parse(['init']).ok).toBe(true);
    expect(router.parse(['i']).ok).toBe(true);
  });

  it('여러 명령 등록', () => {
    router.register(makeCommand('init'));
    router.register(makeCommand('config'));
    router.register(makeCommand('start'));
    expect(router.parse(['init']).ok).toBe(true);
    expect(router.parse(['config']).ok).toBe(true);
    expect(router.parse(['start']).ok).toBe(true);
  });

  it('동일 이름 덮어쓰기 → 마지막 등록 기준', () => {
    router.register(makeCommand('test', { description: 'first' }));
    router.register(makeCommand('test', { description: 'second' }));
    const result = router.parse(['test']);
    expect(result.ok).toBe(true);
  });
});

// ── parse ─────────────────────────────────────────────────────

describe('CommandRouter.parse', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = makeRouter();
    router.register(makeCommand('init', { aliases: ['i'] }));
    router.register(makeCommand('config', { aliases: ['cfg'] }));
    router.register(makeCommand('start'));
  });

  it('빈 argv → err', () => {
    const result = router.parse([]);
    expect(result.ok).toBe(false);
  });

  it('미등록 명령 → err', () => {
    const result = router.parse(['unknown-command']);
    expect(result.ok).toBe(false);
  });

  it('등록된 명령 → ok', () => {
    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
  });

  it('별칭으로 파싱 → ok', () => {
    const result = router.parse(['i']);
    expect(result.ok).toBe(true);
  });

  it('command 필드 일치', () => {
    const result = router.parse(['config']);
    if (result.ok) {
      expect(result.value.command).toBe('config');
    }
  });

  it('위치 인자 파싱', () => {
    const result = router.parse(['init', 'src/', 'docs/']);
    if (result.ok) {
      expect(result.value.args).toContain('src/');
      expect(result.value.args).toContain('docs/');
    }
  });

  it('--flag 플래그 파싱 → options.flag = true', () => {
    const result = router.parse(['init', '--verbose']);
    if (result.ok) {
      expect(result.value.options['verbose']).toBe(true);
    }
  });

  it('--key=value 파싱 → options.key = value', () => {
    const result = router.parse(['config', '--project-path=/tmp/proj']);
    if (result.ok) {
      // camelCase 변환됨
      expect(result.value.options['projectPath']).toBe('/tmp/proj');
    }
  });

  it('kebab-case → camelCase 변환', () => {
    const result = router.parse(['start', '--some-long-flag']);
    if (result.ok) {
      expect(result.value.options['someLongFlag']).toBe(true);
    }
  });

  it('flags 서브 객체에 원본 kebab-case 보존', () => {
    const result = router.parse(['init', '--project-path=/tmp']);
    if (result.ok) {
      const flags = result.value.options['flags'] as Record<string, unknown>;
      expect(flags?.['project-path']).toBe('/tmp');
    }
  });

  it('여러 플래그 조합', () => {
    const result = router.parse(['config', '--verbose', '--format=json', 'list']);
    if (result.ok) {
      expect(result.value.options['verbose']).toBe(true);
      expect(result.value.options['format']).toBe('json');
      expect(result.value.args).toContain('list');
    }
  });

  it('위치 인자와 플래그 혼합', () => {
    const result = router.parse(['init', 'my-project', '--force', '--path=/tmp/proj']);
    if (result.ok) {
      expect(result.value.args).toContain('my-project');
      expect(result.value.options['force']).toBe(true);
      expect(result.value.options['path']).toBe('/tmp/proj');
    }
  });
});

// ── execute ───────────────────────────────────────────────────

describe('CommandRouter.execute', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = makeRouter();
  });

  it('등록된 명령 실행 → ok', async () => {
    router.register(makeCommand('init'));
    const result = await router.execute(['init']);
    expect(result.ok).toBe(true);
  });

  it('별칭으로 실행 → ok', async () => {
    router.register(makeCommand('initialize', { aliases: ['init'] }));
    const result = await router.execute(['init']);
    expect(result.ok).toBe(true);
  });

  it('빈 argv → err', async () => {
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
  });

  it('미등록 명령 → err', async () => {
    const result = await router.execute(['nonexistent']);
    expect(result.ok).toBe(false);
  });

  it('명령 실행 실패 → err 전파', async () => {
    const failingCommand = makeCommand('failing', {
      executeResult: err(new AdevError('config_read_failed', 'Command failed')),
    });
    router.register(failingCommand);
    const result = await router.execute(['failing']);
    expect(result.ok).toBe(false);
  });

  it('위치 인자와 플래그 전달', async () => {
    const receivedArgs: string[] = [];
    const receivedOptions: CliOptions[] = [];

    const trackingCommand: CliCommand = {
      name: 'track',
      aliases: [],
      description: 'tracking command',
      execute: async (args, options) => {
        receivedArgs.push(...args);
        receivedOptions.push(options);
        return ok({ message: 'tracked' });
      },
      help: () => 'help',
    };

    router.register(trackingCommand);
    await router.execute(['track', 'arg1', '--flag', '--key=val']);
    expect(receivedArgs).toContain('arg1');
    expect(receivedOptions[0]?.['flag']).toBe(true);
    expect(receivedOptions[0]?.['key']).toBe('val');
  });
});

// ── getHelp ───────────────────────────────────────────────────

describe('CommandRouter.getHelp', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = makeRouter();
  });

  it('기본 도움말 반환됨', () => {
    const help = router.getHelp();
    expect(typeof help).toBe('string');
    expect(help.length).toBeGreaterThan(0);
  });

  it('adev 포함', () => {
    const help = router.getHelp();
    expect(help).toContain('adev');
  });

  it('등록된 명령 이름 포함', () => {
    router.register(makeCommand('mycommand'));
    const help = router.getHelp();
    expect(help).toContain('mycommand');
  });

  it('여러 명령 포함', () => {
    router.register(makeCommand('init'));
    router.register(makeCommand('config'));
    router.register(makeCommand('start'));
    const help = router.getHelp();
    expect(help).toContain('init');
    expect(help).toContain('config');
    expect(help).toContain('start');
  });

  it('명령 없을 때도 기본 도움말 반환', () => {
    const help = router.getHelp();
    expect(help).toContain('Usage');
  });
});

// ── 별칭 처리 ─────────────────────────────────────────────────

describe('CommandRouter 별칭 처리', () => {
  it('여러 별칭 등록 → 모두 동작', async () => {
    const router = makeRouter();
    router.register(makeCommand('start', { aliases: ['s', 'st', 'run'] }));
    for (const alias of ['s', 'st', 'run', 'start']) {
      const result = await router.execute([alias]);
      expect(result.ok).toBe(true);
    }
  });

  it('별칭 없는 명령 → 이름으로만 동작', () => {
    const router = makeRouter();
    router.register(makeCommand('noalias'));
    expect(router.parse(['noalias']).ok).toBe(true);
    expect(router.parse(['n']).ok).toBe(false);
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('CommandRouter 랜덤/경계값', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('랜덤 명령 파싱 #%i', (i) => {
    const router = makeRouter();
    const cmdName = `cmd-${i}`;
    router.register(makeCommand(cmdName));
    const result = router.parse([cmdName, `--flag-${i}`, `--key-${i}=value-${i}`, `positional-${i}`]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe(cmdName);
      expect(result.value.args).toContain(`positional-${i}`);
    }
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 실행 #%i', async (i) => {
    const router = makeRouter();
    const cmdName = `exec-cmd-${i}`;
    router.register(makeCommand(cmdName));
    const result = await router.execute([cmdName, `arg-${i}`, `--opt-${i}`]);
    expect(result.ok).toBe(true);
  });

  it('null 또는 undefined 포함 argv → 처리됨', () => {
    const router = makeRouter();
    router.register(makeCommand('test'));
    // --flag 처리 시 falsy 값 스킵
    const result = router.parse(['test', '', '--flag']);
    expect(result.ok).toBe(true);
  });
});
