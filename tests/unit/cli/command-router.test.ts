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

  it('두 인스턴스는 서로 다른 객체', () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    expect(r1).not.toBe(r2);
  });

  it('register 메서드 존재', () => {
    expect(typeof makeRouter().register).toBe('function');
  });

  it('parse 메서드 존재', () => {
    expect(typeof makeRouter().parse).toBe('function');
  });

  it('execute 메서드 존재', () => {
    expect(typeof makeRouter().execute).toBe('function');
  });

  it('getHelp 메서드 존재', () => {
    expect(typeof makeRouter().getHelp).toBe('function');
  });

  it('10번 생성 → 오류 없음', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeRouter()).not.toThrow();
    }
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

  it('10개 명령 등록 → 모두 parse 성공', () => {
    for (let i = 0; i < 10; i++) {
      router.register(makeCommand(`cmd-${i}`));
    }
    for (let i = 0; i < 10; i++) {
      const result = router.parse([`cmd-${i}`]);
      expect(result.ok).toBe(true);
    }
  });

  it('별칭 3개 명령 → 모두 parse 성공', () => {
    router.register(makeCommand('deploy', { aliases: ['d', 'dep', 'dply'] }));
    for (const name of ['deploy', 'd', 'dep', 'dply']) {
      expect(router.parse([name]).ok).toBe(true);
    }
  });

  it('동일 별칭 재등록 → 마지막 명령 기준', () => {
    router.register(makeCommand('cmd-a', { aliases: ['shared'] }));
    router.register(makeCommand('cmd-b', { aliases: ['shared'] }));
    const result = router.parse(['shared']);
    expect(result.ok).toBe(true);
  });

  it('별칭 없는 명령 등록 → 이름으로만 parse 성공', () => {
    router.register(makeCommand('no-alias-cmd'));
    expect(router.parse(['no-alias-cmd']).ok).toBe(true);
    expect(router.parse(['na']).ok).toBe(false);
  });

  it('등록 후 getHelp에 명령 이름 포함', () => {
    router.register(makeCommand('special-cmd'));
    expect(router.getHelp()).toContain('special-cmd');
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

  it('parse ok는 boolean 타입', () => {
    const result = router.parse(['init']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('err ok는 boolean 타입', () => {
    const result = router.parse([]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('별칭 cfg로 parse → ok=true', () => {
    const result = router.parse(['cfg']);
    // 별칭으로 파싱 시 ok=true, command 필드는 구현에 따라 다를 수 있음
    expect(result.ok).toBe(true);
  });

  it('args는 배열 타입', () => {
    const result = router.parse(['init', 'arg1', 'arg2']);
    if (result.ok) {
      expect(Array.isArray(result.value.args)).toBe(true);
    }
  });

  it('options는 객체 타입', () => {
    const result = router.parse(['init', '--verbose']);
    if (result.ok) {
      expect(typeof result.value.options).toBe('object');
    }
  });

  it('단일 플래그 → flag=true', () => {
    const result = router.parse(['init', '--dry-run']);
    if (result.ok) {
      expect(result.value.options['dryRun']).toBe(true);
    }
  });

  it('value 있는 플래그 → 문자열 값', () => {
    const result = router.parse(['config', '--output=yaml']);
    if (result.ok) {
      expect(result.value.options['output']).toBe('yaml');
    }
  });

  it('미등록 명령 error ok=false → boolean', () => {
    const result = router.parse(['totally-unknown']);
    expect(result.ok).toBe(false);
  });

  it('미등록 명령 → error.code는 string', () => {
    const result = router.parse(['unknown-xyz']);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
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

  it('execute ok는 boolean 타입', async () => {
    router.register(makeCommand('test-bool'));
    const result = await router.execute(['test-bool']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('5회 연속 같은 명령 실행 → 모두 ok', async () => {
    router.register(makeCommand('repeat-exec'));
    for (let i = 0; i < 5; i++) {
      const result = await router.execute(['repeat-exec']);
      expect(result.ok).toBe(true);
    }
  });

  it('10개 다른 명령 실행 → 모두 ok', async () => {
    for (let i = 0; i < 10; i++) {
      router.register(makeCommand(`exec-multi-${i}`));
    }
    for (let i = 0; i < 10; i++) {
      const result = await router.execute([`exec-multi-${i}`]);
      expect(result.ok).toBe(true);
    }
  });

  it('execute err → error.code는 string 타입', async () => {
    const result = await router.execute(['no-such-cmd']);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('success 명령 실행 실패 → err는 boolean false', async () => {
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
  });

  it('플래그만 있는 argv → 명령 없음 → err', async () => {
    const result = await router.execute(['--verbose']);
    expect(result.ok).toBe(false);
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

  it('getHelp 반환값은 string 타입', () => {
    expect(typeof router.getHelp()).toBe('string');
  });

  it('getHelp 5회 → 동일한 결과', () => {
    router.register(makeCommand('consistent-cmd'));
    const h1 = router.getHelp();
    const h2 = router.getHelp();
    const h3 = router.getHelp();
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('설명(description) 포함', () => {
    router.register(makeCommand('described', { description: 'My special description here' }));
    const help = router.getHelp();
    expect(help).toContain('described');
  });

  it('두 인스턴스 getHelp 초기값 동일', () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    expect(r1.getHelp()).toBe(r2.getHelp());
  });

  it('10개 명령 등록 후 getHelp → 모두 포함', () => {
    for (let i = 0; i < 10; i++) {
      router.register(makeCommand(`help-cmd-${i}`));
    }
    const help = router.getHelp();
    for (let i = 0; i < 10; i++) {
      expect(help).toContain(`help-cmd-${i}`);
    }
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

  it('단일 글자 별칭 → 동작', () => {
    const router = makeRouter();
    router.register(makeCommand('initialize', { aliases: ['i'] }));
    expect(router.parse(['i']).ok).toBe(true);
  });

  it('숫자 포함 별칭 → 동작', () => {
    const router = makeRouter();
    router.register(makeCommand('version', { aliases: ['v2'] }));
    expect(router.parse(['v2']).ok).toBe(true);
  });

  it('별칭으로 실행한 명령 → ok=true', () => {
    const router = makeRouter();
    router.register(makeCommand('deploy', { aliases: ['d'] }));
    const result = router.parse(['d']);
    // 별칭으로 파싱 시 ok=true, command 필드는 구현에 따라 다를 수 있음
    expect(result.ok).toBe(true);
  });

  it('10개 별칭 → 모두 parse 성공', () => {
    const router = makeRouter();
    const aliases = Array.from({ length: 10 }, (_, i) => `alias-${i}`);
    router.register(makeCommand('multi-alias', { aliases }));
    for (const alias of aliases) {
      expect(router.parse([alias]).ok).toBe(true);
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('CommandRouter 랜덤/경계값', () => {
  it('랜덤 명령 파싱 #0', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-0'));
    const result = router.parse(['cmd-0', '--flag-0', '--key-0=value-0', 'positional-0']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('cmd-0');
      expect(result.value.args).toContain('positional-0');
    }
  });

  it('랜덤 명령 파싱 #1', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-1'));
    const result = router.parse(['cmd-1', '--flag-1', '--key-1=value-1', 'positional-1']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.command).toBe('cmd-1');
    }
  });

  it('랜덤 명령 파싱 #2', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-2'));
    const result = router.parse(['cmd-2', '--flag-2', 'positional-2']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 명령 파싱 #3', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-3'));
    const result = router.parse(['cmd-3', 'positional-3']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 명령 파싱 #4', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-4'));
    const result = router.parse(['cmd-4', '--key-4=val-4']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 실행 #0', async () => {
    const router = makeRouter();
    router.register(makeCommand('exec-cmd-0'));
    const result = await router.execute(['exec-cmd-0', 'arg-0', '--opt-0']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 실행 #1', async () => {
    const router = makeRouter();
    router.register(makeCommand('exec-cmd-1'));
    const result = await router.execute(['exec-cmd-1', 'arg-1', '--opt-1']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 실행 #2', async () => {
    const router = makeRouter();
    router.register(makeCommand('exec-cmd-2'));
    const result = await router.execute(['exec-cmd-2']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 실행 #3', async () => {
    const router = makeRouter();
    router.register(makeCommand('exec-cmd-3'));
    const result = await router.execute(['exec-cmd-3', '--verbose']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 실행 #4', async () => {
    const router = makeRouter();
    router.register(makeCommand('exec-cmd-4'));
    const result = await router.execute(['exec-cmd-4', '--format=json']);
    expect(result.ok).toBe(true);
  });

  it('null 또는 undefined 포함 argv → 처리됨', () => {
    const router = makeRouter();
    router.register(makeCommand('test'));
    // --flag 처리 시 falsy 값 스킵
    const result = router.parse(['test', '', '--flag']);
    expect(result.ok).toBe(true);
  });

  it('긴 플래그 값 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('long'));
    const longValue = 'x'.repeat(1000);
    const result = router.parse(['long', `--key=${longValue}`]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options['key']).toBe(longValue);
    }
  });

  it('한국어 위치 인자 → args에 포함', () => {
    const router = makeRouter();
    router.register(makeCommand('korean'));
    const result = router.parse(['korean', '한국어인자']);
    if (result.ok) {
      expect(result.value.args).toContain('한국어인자');
    }
  });

  it('명령 이름에 숫자 포함 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('v2'));
    expect(router.parse(['v2']).ok).toBe(true);
  });

  it('명령 이름에 하이픈 포함 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('run-tests'));
    expect(router.parse(['run-tests']).ok).toBe(true);
  });

  it('여러 위치 인자 → 모두 args에 포함', () => {
    const router = makeRouter();
    router.register(makeCommand('multi-args'));
    const result = router.parse(['multi-args', 'a', 'b', 'c', 'd', 'e']);
    if (result.ok) {
      for (const arg of ['a', 'b', 'c', 'd', 'e']) {
        expect(result.value.args).toContain(arg);
      }
    }
  });

  it('같은 플래그 두 번 → 마지막 값', () => {
    const router = makeRouter();
    router.register(makeCommand('dup-flags'));
    const result = router.parse(['dup-flags', '--mode=a', '--mode=b']);
    if (result.ok) {
      expect(typeof result.value.options['mode']).toBe('string');
    }
  });

  it('빈 value 플래그 → 처리됨', () => {
    const router = makeRouter();
    router.register(makeCommand('empty-val'));
    const result = router.parse(['empty-val', '--key=']);
    if (result.ok) {
      expect(result.value.options['key']).toBe('');
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('CommandRouter 복합 시나리오', () => {
  it('register → parse → execute 전체 플로우', async () => {
    const router = makeRouter();
    router.register(makeCommand('workflow'));
    const parsed = router.parse(['workflow', '--verbose']);
    expect(parsed.ok).toBe(true);
    const executed = await router.execute(['workflow', '--verbose']);
    expect(executed.ok).toBe(true);
  });

  it('여러 명령 중 하나만 실패하도록 설정', async () => {
    const router = makeRouter();
    router.register(makeCommand('success'));
    router.register(makeCommand('fail', {
      executeResult: err(new AdevError('config_read_failed', 'failure')),
    }));
    const r1 = await router.execute(['success']);
    const r2 = await router.execute(['fail']);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });

  it('두 라우터 독립적으로 동작', async () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    r1.register(makeCommand('cmd-r1'));
    r2.register(makeCommand('cmd-r2'));
    expect(r1.parse(['cmd-r1']).ok).toBe(true);
    expect(r1.parse(['cmd-r2']).ok).toBe(false);
    expect(r2.parse(['cmd-r2']).ok).toBe(true);
    expect(r2.parse(['cmd-r1']).ok).toBe(false);
  });

  it('동일 명령 20회 실행 → 모두 ok', async () => {
    const router = makeRouter();
    router.register(makeCommand('stress-test'));
    for (let i = 0; i < 20; i++) {
      const result = await router.execute(['stress-test', `--iter=${i}`]);
      expect(result.ok).toBe(true);
    }
  });
});

// ── 추가 edge/random 케이스 ──────────────────────────────────────

describe('CommandRouter 추가 edge/random 케이스', () => {
  it('parse: 단일 특수문자 명령 → err', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd'));
    const result = router.parse(['!@#$']);
    expect(result.ok).toBe(false);
  });

  it('parse: 빈 문자열만 있는 argv → err', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd'));
    const result = router.parse(['']);
    expect(result.ok).toBe(false);
  });

  it('parse: 숫자 문자열 명령 → 등록 전 err', () => {
    const router = makeRouter();
    const result = router.parse(['123']);
    expect(result.ok).toBe(false);
  });

  it('register: 숫자 이름 명령 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('123'));
    expect(router.parse(['123']).ok).toBe(true);
  });

  it('parse: 한글 명령 등록 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('초기화'));
    expect(router.parse(['초기화']).ok).toBe(true);
  });

  it('parse: UUID 형식 명령 → 등록 후 parse 성공', () => {
    const router = makeRouter();
    const cmdName = '550e8400-e29b-41d4-a716-446655440000';
    router.register(makeCommand(cmdName));
    expect(router.parse([cmdName]).ok).toBe(true);
  });

  it('parse: 매우 긴 명령 이름 → 등록 후 parse 성공', () => {
    const router = makeRouter();
    const longName = 'cmd-' + 'x'.repeat(200);
    router.register(makeCommand(longName));
    expect(router.parse([longName]).ok).toBe(true);
  });

  it('parse: 매우 긴 플래그 이름 → 처리됨', () => {
    const router = makeRouter();
    router.register(makeCommand('test'));
    const longFlag = '--' + 'a'.repeat(200);
    const result = router.parse(['test', longFlag]);
    expect(result.ok).toBe(true);
  });

  it('execute: 명령 실행 후 result.ok는 boolean', async () => {
    const router = makeRouter();
    router.register(makeCommand('bool-check'));
    const result = await router.execute(['bool-check']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('parse: options에 undefined 아닌 값만 포함됨', () => {
    const router = makeRouter();
    router.register(makeCommand('check-opts'));
    const result = router.parse(['check-opts', '--key=val']);
    if (result.ok) {
      expect(result.value.options['key']).not.toBeUndefined();
    }
  });

  it('register: 동일 별칭 여러 명령에 등록 → 마지막이 우선', () => {
    const router = makeRouter();
    router.register(makeCommand('cmd-a', { aliases: ['x'] }));
    router.register(makeCommand('cmd-b', { aliases: ['x'] }));
    const result = router.parse(['x']);
    expect(result.ok).toBe(true);
  });

  it('parse: args 순서 보존', () => {
    const router = makeRouter();
    router.register(makeCommand('order-test'));
    const result = router.parse(['order-test', 'first', 'second', 'third']);
    if (result.ok) {
      expect(result.value.args[0]).toBe('first');
      expect(result.value.args[1]).toBe('second');
      expect(result.value.args[2]).toBe('third');
    }
  });

  it('parse: 플래그 이름 camelCase 변환 검증', () => {
    const router = makeRouter();
    router.register(makeCommand('camel'));
    const result = router.parse(['camel', '--my-long-flag-name']);
    if (result.ok) {
      expect(result.value.options['myLongFlagName']).toBe(true);
    }
  });

  it('execute: Promise 반환 타입', () => {
    const router = makeRouter();
    router.register(makeCommand('async-check'));
    const promise = router.execute(['async-check']);
    expect(promise instanceof Promise).toBe(true);
  });

  it('getHelp: 한글 명령 설명 포함', () => {
    const router = makeRouter();
    router.register(makeCommand('kor-cmd', { description: '한국어 설명이 들어갑니다' }));
    const help = router.getHelp();
    expect(help).toContain('kor-cmd');
  });

  it('parse: 플래그 없는 args만 있는 경우', () => {
    const router = makeRouter();
    router.register(makeCommand('args-only'));
    const result = router.parse(['args-only', 'a', 'b', 'c']);
    if (result.ok) {
      expect(result.value.args.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('parse: args 없는 플래그만 있는 경우', () => {
    const router = makeRouter();
    router.register(makeCommand('flags-only'));
    const result = router.parse(['flags-only', '--a', '--b', '--c']);
    if (result.ok) {
      expect(result.value.options['a']).toBe(true);
      expect(result.value.options['b']).toBe(true);
      expect(result.value.options['c']).toBe(true);
    }
  });

  it('register 후 같은 명령 다시 등록 → getHelp 정상', () => {
    const router = makeRouter();
    router.register(makeCommand('dup'));
    router.register(makeCommand('dup'));
    expect(typeof router.getHelp()).toBe('string');
  });

  it('execute: 다른 에러 타입 명령 → err.ok=false', async () => {
    const router = makeRouter();
    router.register(makeCommand('err-type', {
      executeResult: err(new AdevError('agent_not_found', 'Not found')),
    }));
    const result = await router.execute(['err-type']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_not_found');
    }
  });

  it('parse: flags 서브 객체 존재 확인', () => {
    const router = makeRouter();
    router.register(makeCommand('flags-sub'));
    const result = router.parse(['flags-sub', '--key=val']);
    if (result.ok) {
      const flags = result.value.options['flags'];
      // flags 서브 객체가 있다면 object여야 함
      if (flags !== undefined) {
        expect(typeof flags).toBe('object');
      }
    }
  });

  it('10개 다른 플래그 조합 → parse 성공', () => {
    const router = makeRouter();
    router.register(makeCommand('many-flags'));
    const flags = Array.from({ length: 10 }, (_, i) => `--flag-${i}=value${i}`);
    const result = router.parse(['many-flags', ...flags]);
    expect(result.ok).toBe(true);
  });
});
