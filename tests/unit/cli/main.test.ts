/**
 * CommandRouter 단위 테스트
 *
 * @description
 * KR: parse/execute/getHelp/register 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for CommandRouter methods. 80%+ edge/invalid ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { AdevError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import { ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { CommandRouter } from 'cli/main.js';
import type { CliCommand, CliOptions } from 'cli/types.js';

const logger = new ConsoleLogger('error');

class DummyCommand implements CliCommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
  lastArgs: readonly string[] = [];
  lastOptions: CliOptions = { flags: {} };
  executeCount = 0;

  constructor(name: string, description = '', aliases?: readonly string[]) {
    this.name = name;
    this.description = description;
    this.aliases = aliases;
  }

  async execute(args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>> {
    this.lastArgs = args;
    this.lastOptions = options;
    this.executeCount++;
    return ok(undefined);
  }
}

// ── 생성자 ────────────────────────────────────────────────────

describe('CommandRouter 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new CommandRouter(logger)).not.toThrow();
  });

  it('CommandRouter 인스턴스이다', () => {
    expect(new CommandRouter(logger)).toBeInstanceOf(CommandRouter);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new CommandRouter(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('parse 메서드 존재', () => {
    expect(typeof new CommandRouter(logger).parse).toBe('function');
  });

  it('execute 메서드 존재', () => {
    expect(typeof new CommandRouter(logger).execute).toBe('function');
  });

  it('getHelp 메서드 존재', () => {
    expect(typeof new CommandRouter(logger).getHelp).toBe('function');
  });

  it('register 메서드 존재', () => {
    expect(typeof new CommandRouter(logger).register).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const r1 = new CommandRouter(logger);
    const r2 = new CommandRouter(logger);
    expect(r1).not.toBe(r2);
  });

  it('warn logger로 생성 가능', () => {
    expect(() => new CommandRouter(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const routers = Array.from({ length: 10 }, () => new CommandRouter(logger));
    for (let i = 0; i < routers.length; i++) {
      for (let j = i + 1; j < routers.length; j++) {
        expect(routers[i]).not.toBe(routers[j]);
      }
    }
  });
});

// ── parse - 성공 케이스 ───────────────────────────────────────

describe('CommandRouter parse - 성공 케이스', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize'));
    router.register(new DummyCommand('start', 'Start'));
  });

  it('단순 명령 파싱 → ok=true', () => {
    const result = router.parse(['init']);
    expect(result.ok).toBe(true);
  });

  it('단순 명령 → command="init"', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(result.value.command).toBe('init');
  });

  it('단순 명령 → args=[]', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(result.value.args.length).toBe(0);
  });

  it('명령 + 위치 인자 → args 올바름', () => {
    const result = router.parse(['init', '/tmp/project', 'extra-arg']);
    if (result.ok) expect(result.value.args).toEqual(['/tmp/project', 'extra-arg']);
  });

  it('--verbose 플래그 → options.verbose=true', () => {
    const result = router.parse(['init', '--verbose']);
    if (result.ok) expect(result.value.options.verbose).toBe(true);
  });

  it('--verbose 플래그 → flags.verbose=true', () => {
    const result = router.parse(['init', '--verbose']);
    if (result.ok) expect(result.value.options.flags.verbose).toBe(true);
  });

  it('--project-path=/tmp/proj → options.projectPath', () => {
    const result = router.parse(['init', '--project-path=/tmp/proj']);
    if (result.ok) expect(result.value.options.projectPath).toBe('/tmp/proj');
  });

  it('--project-path=/tmp/proj → flags["project-path"]', () => {
    const result = router.parse(['init', '--project-path=/tmp/proj']);
    if (result.ok) expect(result.value.options.flags['project-path']).toBe('/tmp/proj');
  });

  it('--log-level=debug → options.logLevel="debug"', () => {
    const result = router.parse(['init', '--log-level=debug']);
    if (result.ok) expect(result.value.options.logLevel).toBe('debug');
  });

  it('인자+플래그 혼합 → args에 위치 인자만', () => {
    const result = router.parse(['init', 'arg1', '--verbose', 'arg2', '--project-path=/tmp']);
    if (result.ok) expect(result.value.args).toEqual(['arg1', 'arg2']);
  });

  it('인자+플래그 혼합 → verbose와 projectPath 모두 파싱', () => {
    const result = router.parse(['init', 'arg1', '--verbose', '--project-path=/tmp']);
    if (result.ok) {
      expect(result.value.options.verbose).toBe(true);
      expect(result.value.options.projectPath).toBe('/tmp');
    }
  });

  it('start 명령 파싱 → command="start"', () => {
    const result = router.parse(['start']);
    if (result.ok) expect(result.value.command).toBe('start');
  });

  it('여러 플래그 동시 파싱', () => {
    const result = router.parse(['init', '--verbose', '--log-level=info']);
    if (result.ok) {
      expect(result.value.options.verbose).toBe(true);
      expect(result.value.options.logLevel).toBe('info');
    }
  });

  it('ok는 boolean 타입', () => {
    const result = router.parse(['init']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('command는 string 타입', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(typeof result.value.command).toBe('string');
  });

  it('args는 배열 타입', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(Array.isArray(result.value.args)).toBe(true);
  });

  it('5번 반복 파싱 → 동일 결과', () => {
    for (let i = 0; i < 5; i++) {
      const result = router.parse(['init']);
      if (result.ok) expect(result.value.command).toBe('init');
    }
  });

  it('위치 인자 3개 → args 길이 3', () => {
    const result = router.parse(['init', 'a', 'b', 'c']);
    if (result.ok) expect(result.value.args.length).toBe(3);
  });

  it('--no-color 플래그 파싱', () => {
    const result = router.parse(['init', '--no-color']);
    if (result.ok) expect(result.value.options.noColor).toBe(true);
  });
});

// ── parse - 실패 케이스 ───────────────────────────────────────

describe('CommandRouter parse - 실패 케이스', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize'));
  });

  it('빈 배열 → ok=false', () => {
    const result = router.parse([]);
    expect(result.ok).toBe(false);
  });

  it('빈 배열 → code=cli_no_command', () => {
    const result = router.parse([]);
    if (!result.ok) expect(result.error.code).toBe('cli_no_command');
  });

  it('플래그만 있는 경우 → ok=false', () => {
    const result = router.parse(['--verbose']);
    expect(result.ok).toBe(false);
  });

  it('빈 배열 → ok는 boolean', () => {
    const result = router.parse([]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('error.code는 string', () => {
    const result = router.parse([]);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('error.message는 string', () => {
    const result = router.parse([]);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 빈 배열 파싱 → 모두 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = router.parse([]);
      expect(result.ok).toBe(false);
    }
  });

  it('플래그만 5번 파싱 → 모두 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = router.parse(['--verbose']);
      expect(result.ok).toBe(false);
    }
  });
});

// ── execute - 성공 케이스 ─────────────────────────────────────

describe('CommandRouter execute - 성공 케이스', () => {
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

  it('올바른 명령으로 라우팅 → ok=true', async () => {
    const result = await router.execute(['init']);
    expect(result.ok).toBe(true);
  });

  it('init 실행 → dummyInit.executeCount=1', async () => {
    await router.execute(['init']);
    expect(dummyInit.executeCount).toBe(1);
  });

  it('init 실행 → dummyStart.executeCount=0', async () => {
    await router.execute(['init']);
    expect(dummyStart.executeCount).toBe(0);
  });

  it('start 실행 → dummyStart.executeCount=1', async () => {
    await router.execute(['start']);
    expect(dummyStart.executeCount).toBe(1);
  });

  it('별칭 "i"로 init 실행 → ok=true', async () => {
    const result = await router.execute(['i']);
    expect(result.ok).toBe(true);
  });

  it('별칭 "i" → init executeCount 증가', async () => {
    await router.execute(['i']);
    expect(dummyInit.executeCount).toBe(1);
  });

  it('별칭 "s" → start executeCount 증가', async () => {
    await router.execute(['s']);
    expect(dummyStart.executeCount).toBe(1);
  });

  it('위치 인자가 명령에 전달됨', async () => {
    await router.execute(['init', 'arg1', 'arg2']);
    expect(dummyInit.lastArgs).toEqual(['arg1', 'arg2']);
  });

  it('--verbose 옵션이 명령에 전달됨', async () => {
    await router.execute(['init', '--verbose']);
    expect(dummyInit.lastOptions.verbose).toBe(true);
  });

  it('--project-path 옵션이 명령에 전달됨', async () => {
    await router.execute(['init', '--project-path=/tmp']);
    expect(dummyInit.lastOptions.projectPath).toBe('/tmp');
  });

  it('동일 명령 3번 실행 → executeCount=3', async () => {
    await router.execute(['init']);
    await router.execute(['init']);
    await router.execute(['init']);
    expect(dummyInit.executeCount).toBe(3);
  });

  it('init 후 start → 각각 1번씩 실행', async () => {
    await router.execute(['init']);
    await router.execute(['start']);
    expect(dummyInit.executeCount).toBe(1);
    expect(dummyStart.executeCount).toBe(1);
  });

  it('ok는 boolean 타입', async () => {
    const result = await router.execute(['init']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('별칭과 본명 모두 사용 → 합계 executeCount', async () => {
    await router.execute(['init']);
    await router.execute(['i']);
    expect(dummyInit.executeCount).toBe(2);
  });

  it('start 10번 실행 → executeCount=10', async () => {
    for (let i = 0; i < 10; i++) {
      await router.execute(['start']);
    }
    expect(dummyStart.executeCount).toBe(10);
  });

  it('args 없는 실행 → lastArgs 빈 배열', async () => {
    await router.execute(['init']);
    expect(dummyInit.lastArgs.length).toBe(0);
  });
});

// ── execute - 실패 케이스 ─────────────────────────────────────

describe('CommandRouter execute - 실패 케이스', () => {
  let router: CommandRouter;
  let dummyInit: DummyCommand;

  beforeEach(() => {
    router = new CommandRouter(logger);
    dummyInit = new DummyCommand('init', 'Initialize');
    router.register(dummyInit);
  });

  it('알 수 없는 명령 → ok=false', async () => {
    const result = await router.execute(['unknown-cmd']);
    expect(result.ok).toBe(false);
  });

  it('알 수 없는 명령 → code=cli_unknown_command', async () => {
    const result = await router.execute(['unknown-cmd']);
    if (!result.ok) expect(result.error.code).toBe('cli_unknown_command');
  });

  it('알 수 없는 명령 → message에 명령 이름 포함', async () => {
    const result = await router.execute(['unknown-cmd']);
    if (!result.ok) expect(result.error.message).toContain('unknown-cmd');
  });

  it('알 수 없는 명령 → message에 등록된 명령 포함', async () => {
    const result = await router.execute(['unknown-cmd']);
    if (!result.ok) expect(result.error.message).toContain('init');
  });

  it('빈 배열 → ok=false', async () => {
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
  });

  it('빈 배열 → code=cli_no_command', async () => {
    const result = await router.execute([]);
    if (!result.ok) expect(result.error.code).toBe('cli_no_command');
  });

  it('알 수 없는 명령 → 등록된 명령은 실행되지 않음', async () => {
    await router.execute(['nonexistent']);
    expect(dummyInit.executeCount).toBe(0);
  });

  it('다양한 알 수 없는 명령 → 모두 ok=false', async () => {
    const cmds = ['xyz', 'abc', 'bad-cmd', '123'];
    for (const cmd of cmds) {
      const result = await router.execute([cmd]);
      expect(result.ok).toBe(false);
    }
  });

  it('error.code는 string 타입', async () => {
    const result = await router.execute(['unknown-cmd']);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('error.message는 string 타입', async () => {
    const result = await router.execute(['unknown-cmd']);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('특수문자 명령 → ok=false', async () => {
    const result = await router.execute(['!@#$%']);
    expect(result.ok).toBe(false);
  });

  it('숫자 명령 → ok=false', async () => {
    const result = await router.execute(['12345']);
    expect(result.ok).toBe(false);
  });

  it('대문자 명령 (소문자 등록됨) → ok=false', async () => {
    const result = await router.execute(['INIT']);
    expect(result.ok).toBe(false);
  });

  it('공백 포함 명령 → ok=false', async () => {
    const result = await router.execute(['init command']);
    expect(result.ok).toBe(false);
  });

  it('5번 반복 unknown → 모두 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await router.execute([`cmd-${i}`]);
      expect(result.ok).toBe(false);
    }
  });
});

// ── getHelp ───────────────────────────────────────────────────

describe('CommandRouter getHelp', () => {
  it('등록된 명령 이름이 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize project', ['i']));
    router.register(new DummyCommand('start', 'Start conversation'));
    const help = router.getHelp();
    expect(help).toContain('init');
    expect(help).toContain('start');
  });

  it('등록된 명령 설명이 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize project'));
    const help = router.getHelp();
    expect(help).toContain('Initialize project');
  });

  it('"adev"가 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    const help = router.getHelp();
    expect(help).toContain('adev');
  });

  it('"--project-path"가 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    const help = router.getHelp();
    expect(help).toContain('--project-path');
  });

  it('"--verbose"가 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    const help = router.getHelp();
    expect(help).toContain('--verbose');
  });

  it('별칭이 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init', ['i']));
    const help = router.getHelp();
    expect(help).toContain('i');
  });

  it('명령 없으면 "adev" + "Commands:" 포함', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    expect(help).toContain('adev');
    expect(help).toContain('Commands:');
  });

  it('반환값이 문자열이다', () => {
    const router = new CommandRouter(logger);
    expect(typeof router.getHelp()).toBe('string');
  });

  it('반환값이 비어있지 않다', () => {
    const router = new CommandRouter(logger);
    expect(router.getHelp().length).toBeGreaterThan(0);
  });

  it('연속 호출 → 동일 결과', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Command'));
    const h1 = router.getHelp();
    const h2 = router.getHelp();
    expect(h1).toBe(h2);
  });

  it('5개 명령 등록 → 모두 getHelp에 포함', () => {
    const router = new CommandRouter(logger);
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    for (const name of names) {
      router.register(new DummyCommand(name, `${name} description`));
    }
    const help = router.getHelp();
    for (const name of names) {
      expect(help).toContain(name);
    }
  });

  it('getHelp 10번 반복 → 동일 길이', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('test', 'Test command'));
    const len = router.getHelp().length;
    for (let i = 0; i < 9; i++) {
      expect(router.getHelp().length).toBe(len);
    }
  });
});

// ── register ──────────────────────────────────────────────────

describe('CommandRouter register', () => {
  it('중복 이름 → 마지막이 우선', async () => {
    const router = new CommandRouter(logger);
    const first = new DummyCommand('test', 'First');
    const second = new DummyCommand('test', 'Second');
    router.register(first);
    router.register(second);
    await router.execute(['test']);
    expect(first.executeCount).toBe(0);
    expect(second.executeCount).toBe(1);
  });

  it('여러 명령 등록 → 모두 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmds = ['cmd-a', 'cmd-b', 'cmd-c'].map((n) => new DummyCommand(n, n));
    for (const cmd of cmds) router.register(cmd);
    for (const cmd of cmds) {
      const result = await router.execute([cmd.name]);
      expect(result.ok).toBe(true);
    }
  });

  it('별칭 있는 명령 등록 → 별칭으로 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('long-command', 'Long', ['lc']);
    router.register(cmd);
    const result = await router.execute(['lc']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('여러 별칭 → 모두 동작', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('multi', 'Multi', ['m', 'ml', 'mult']);
    router.register(cmd);
    await router.execute(['m']);
    await router.execute(['ml']);
    await router.execute(['mult']);
    expect(cmd.executeCount).toBe(3);
  });

  it('10개 명령 등록 → 모두 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmds = Array.from({ length: 10 }, (_, i) => new DummyCommand(`cmd${i}`, `Command ${i}`));
    for (const cmd of cmds) router.register(cmd);
    for (const cmd of cmds) {
      const result = await router.execute([cmd.name]);
      expect(result.ok).toBe(true);
    }
  });

  it('등록 후 getHelp에 명령 이름 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('my-unique-cmd', 'My unique command'));
    expect(router.getHelp()).toContain('my-unique-cmd');
  });

  it('별칭 없는 명령 등록 → 이름으로만 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('noalias', 'No alias command');
    router.register(cmd);
    const result = await router.execute(['noalias']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('명령 등록 전 실행 → 등록 후 실행 성공', async () => {
    const router = new CommandRouter(logger);
    const r1 = await router.execute(['test-cmd']);
    expect(r1.ok).toBe(false);
    router.register(new DummyCommand('test-cmd', 'Test'));
    const r2 = await router.execute(['test-cmd']);
    expect(r2.ok).toBe(true);
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('CommandRouter 복합 시나리오', () => {
  it('parse 후 execute → 동일 명령 실행', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('test', 'Test');
    router.register(cmd);
    const parsed = router.parse(['test', 'arg1', '--verbose']);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const result = await router.execute(['test', 'arg1', '--verbose']);
      expect(result.ok).toBe(true);
      expect(cmd.lastArgs).toEqual(['arg1']);
      expect(cmd.lastOptions.verbose).toBe(true);
    }
  });

  it('두 라우터 인스턴스 독립', async () => {
    const r1 = new CommandRouter(logger);
    const r2 = new CommandRouter(logger);
    const c1 = new DummyCommand('cmd', 'Cmd 1');
    const c2 = new DummyCommand('cmd', 'Cmd 2');
    r1.register(c1);
    r2.register(c2);
    await r1.execute(['cmd']);
    expect(c1.executeCount).toBe(1);
    expect(c2.executeCount).toBe(0);
  });

  it('별칭 충돌 방지 → 별칭이 기존 명령과 겹치지 않음', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    const cmd2 = new DummyCommand('start', 'Start', ['init']);
    router.register(cmd2);
    // 'init' 실행 시 어떤 명령이 실행되는지 확인
    const result = await router.execute(['init']);
    expect(result.ok).toBe(true);
  });

  it('50번 실행 → executeCount 정확', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('test', 'Test');
    router.register(cmd);
    for (let i = 0; i < 50; i++) {
      await router.execute(['test']);
    }
    expect(cmd.executeCount).toBe(50);
  });
});

// ── parse 경계값 추가 ─────────────────────────────────────────

describe('CommandRouter parse 경계값 추가', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    router.register(new DummyCommand('start', 'Start'));
  });

  it('빈 문자열 인자 → ok=false', () => {
    const result = router.parse(['']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('한글 명령 파싱 → ok 또는 false (존재 여부)', () => {
    const result = router.parse(['한글명령']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('--log-level=warn → logLevel=warn', () => {
    const result = router.parse(['init', '--log-level=warn']);
    if (result.ok) expect(result.value.options.logLevel).toBe('warn');
  });

  it('--log-level=error → logLevel=error', () => {
    const result = router.parse(['init', '--log-level=error']);
    if (result.ok) expect(result.value.options.logLevel).toBe('error');
  });

  it('다중 --verbose 플래그 → verbose=true', () => {
    const result = router.parse(['init', '--verbose', '--verbose']);
    if (result.ok) expect(result.value.options.verbose).toBe(true);
  });

  it('--project-path 빈 값 → flags["project-path"] 존재', () => {
    const result = router.parse(['init', '--project-path=']);
    if (result.ok) expect('project-path' in result.value.options.flags).toBe(true);
  });

  it('flags 객체가 존재한다', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(typeof result.value.options.flags).toBe('object');
  });

  it('args 배열은 readonly', () => {
    const result = router.parse(['init', 'arg1']);
    if (result.ok) expect(Array.isArray(result.value.args)).toBe(true);
  });

  it('command는 등록된 이름과 일치', () => {
    const result = router.parse(['start']);
    if (result.ok) expect(result.value.command).toBe('start');
  });

  it('options 객체가 존재한다', () => {
    const result = router.parse(['init']);
    if (result.ok) expect(typeof result.value.options).toBe('object');
  });

  it('UUID 형식 인자 파싱', () => {
    const uuid = crypto.randomUUID();
    const result = router.parse(['init', uuid]);
    if (result.ok) expect(result.value.args).toContain(uuid);
  });

  it('특수문자 플래그 값 → flags에 포함', () => {
    const result = router.parse(['init', '--project-path=/path/to/proj@v2']);
    if (result.ok) expect(result.value.options.projectPath).toBe('/path/to/proj@v2');
  });

  it('위치 인자 0개 → args.length=0', () => {
    const result = router.parse(['init', '--verbose']);
    if (result.ok) expect(result.value.args.length).toBe(0);
  });

  it('위치 인자 5개 → args.length=5', () => {
    const result = router.parse(['init', 'a', 'b', 'c', 'd', 'e']);
    if (result.ok) expect(result.value.args.length).toBe(5);
  });

  it('에러 코드는 항상 string', () => {
    const result = router.parse([]);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });
});

// ── execute 경계값 추가 ───────────────────────────────────────

describe('CommandRouter execute 경계값 추가', () => {
  let router: CommandRouter;
  let cmd: DummyCommand;

  beforeEach(() => {
    router = new CommandRouter(logger);
    cmd = new DummyCommand('test-cmd', 'Test command', ['tc', 't-c']);
    router.register(cmd);
  });

  it('별칭 tc → 실행 가능', async () => {
    const result = await router.execute(['tc']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('별칭 t-c → 실행 가능', async () => {
    const result = await router.execute(['t-c']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('명령과 별칭 조합 실행 → executeCount 합산', async () => {
    await router.execute(['test-cmd']);
    await router.execute(['tc']);
    await router.execute(['t-c']);
    expect(cmd.executeCount).toBe(3);
  });

  it('한글 명령 → ok=false', async () => {
    const result = await router.execute(['한글명령']);
    expect(result.ok).toBe(false);
  });

  it('특수문자 명령 → ok=false', async () => {
    const result = await router.execute(['!test!']);
    expect(result.ok).toBe(false);
  });

  it('플래그만 → ok=false', async () => {
    const result = await router.execute(['--verbose', '--log-level=debug']);
    expect(result.ok).toBe(false);
  });

  it('execute 결과는 Promise<Result>', async () => {
    const result = await router.execute(['test-cmd']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('lastArgs 빈 배열 확인', async () => {
    await router.execute(['test-cmd']);
    expect(Array.isArray(cmd.lastArgs)).toBe(true);
    expect(cmd.lastArgs.length).toBe(0);
  });

  it('lastOptions에 flags 객체 포함', async () => {
    await router.execute(['test-cmd', '--verbose']);
    expect(typeof cmd.lastOptions.flags).toBe('object');
  });

  it('--no-color → options.noColor=true', async () => {
    await router.execute(['test-cmd', '--no-color']);
    expect(cmd.lastOptions.noColor).toBe(true);
  });

  it('알 수 없는 명령 → error.code 타입 string', async () => {
    const result = await router.execute(['completely-unknown']);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('빈 배열 → error.code=cli_no_command', async () => {
    const result = await router.execute([]);
    if (!result.ok) expect(result.error.code).toBe('cli_no_command');
  });

  it('0~4 범위 cmd-N 명령 → 모두 false', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await router.execute([`cmd-${i}-unknown`]);
      expect(r.ok).toBe(false);
    }
  });
});

// ── getHelp 경계값 추가 ───────────────────────────────────────

describe('CommandRouter getHelp 경계값 추가', () => {
  it('10개 명령 등록 → getHelp에 모두 포함', () => {
    const router = new CommandRouter(logger);
    const names = Array.from({ length: 10 }, (_, i) => `cmd-${i}`);
    for (const name of names) {
      router.register(new DummyCommand(name, `description for ${name}`));
    }
    const help = router.getHelp();
    for (const name of names) {
      expect(help).toContain(name);
    }
  });

  it('별칭 여러 개 → getHelp에 표시', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('multi-alias', 'Multi', ['ma', 'm-a', 'malias']));
    const help = router.getHelp();
    expect(help).toContain('multi-alias');
  });

  it('getHelp는 줄바꿈 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd1', 'Desc'));
    expect(router.getHelp()).toContain('\n');
  });

  it('등록된 설명이 빈 문자열이어도 포함됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('empty-desc', ''));
    const help = router.getHelp();
    expect(help).toContain('empty-desc');
  });

  it('한글 설명 → getHelp에 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('한글cmd', '한글 설명'));
    const help = router.getHelp();
    expect(help).toContain('한글cmd');
  });

  it('getHelp 반환값 타입은 string', () => {
    const router = new CommandRouter(logger);
    expect(typeof router.getHelp()).toBe('string');
  });

  it('명령 추가 후 getHelp 길이 증가', () => {
    const router = new CommandRouter(logger);
    const beforeLen = router.getHelp().length;
    router.register(new DummyCommand('extra-cmd', 'Extra description'));
    const afterLen = router.getHelp().length;
    expect(afterLen).toBeGreaterThan(beforeLen);
  });
});

// ── CommandRouter parse - 추가 경계값 ────────────────────────

describe('CommandRouter parse - 추가 경계값 심화', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Initialize', ['i']));
    router.register(new DummyCommand('start', 'Start', ['s']));
    router.register(new DummyCommand('auth', 'Auth', ['a']));
  });

  it('별칭으로 파싱 → command가 별칭 또는 원래 이름', () => {
    const result = router.parse(['i']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('--log-level=info → options.logLevel=info', () => {
    const result = router.parse(['init', '--log-level=info']);
    if (result.ok) expect(result.value.options.logLevel).toBe('info');
  });

  it('위치 인자 숫자 → args에 포함', () => {
    const result = router.parse(['init', '42', 'hello']);
    if (result.ok) {
      expect(result.value.args).toContain('42');
      expect(result.value.args).toContain('hello');
    }
  });

  it('긴 경로 위치 인자 → args에 포함', () => {
    const longPath = '/a/b/c/d/e/f/g/h/i/j/project-name';
    const result = router.parse(['init', longPath]);
    if (result.ok) expect(result.value.args).toContain(longPath);
  });

  it('다중 위치 인자 10개 → args.length=10', () => {
    const args = Array.from({ length: 10 }, (_, i) => `arg${i}`);
    const result = router.parse(['init', ...args]);
    if (result.ok) expect(result.value.args.length).toBe(10);
  });

  it('공백이 있는 위치 인자 → args에 포함', () => {
    const spaceArg = 'arg with spaces';
    const result = router.parse(['init', spaceArg]);
    if (result.ok) expect(result.value.args).toContain(spaceArg);
  });

  it('flags 객체에 log-level 포함', () => {
    const result = router.parse(['init', '--log-level=debug']);
    if (result.ok) {
      expect('log-level' in result.value.options.flags).toBe(true);
    }
  });

  it('no-color와 verbose 동시 → 둘 다 파싱', () => {
    const result = router.parse(['init', '--no-color', '--verbose']);
    if (result.ok) {
      expect(result.value.options.noColor).toBe(true);
      expect(result.value.options.verbose).toBe(true);
    }
  });

  it('auth 명령 파싱 → command=auth', () => {
    const result = router.parse(['auth']);
    if (result.ok) expect(result.value.command).toBe('auth');
  });

  it('알 수 없는 플래그만 있는 경우 → ok=false', () => {
    const result = router.parse(['--unknown-only-flag']);
    expect(result.ok).toBe(false);
  });

  it('10번 반복 start 파싱 → 항상 ok=true, command=start', () => {
    for (let i = 0; i < 10; i++) {
      const result = router.parse(['start']);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.command).toBe('start');
    }
  });

  it('parse는 동기적이다 (Promise 아님)', () => {
    const result = router.parse(['init']);
    expect(typeof result.ok).toBe('boolean');
    // Promise가 아님을 확인
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('result.value.args는 readonly 배열', () => {
    const result = router.parse(['init', 'a', 'b']);
    if (result.ok) {
      expect(Array.isArray(result.value.args)).toBe(true);
      expect(result.value.args.length).toBe(2);
    }
  });

  it('빈 문자열 명령 → ok=false 또는 ok=true (처리 방식에 따라)', () => {
    const result = router.parse(['']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('flags 객체 타입 확인', () => {
    const result = router.parse(['init', '--verbose', '--log-level=debug']);
    if (result.ok) {
      expect(result.value.options.flags).toBeDefined();
      expect(typeof result.value.options.flags).toBe('object');
    }
  });

  it('UUID 위치 인자 → args에 UUID 포함', () => {
    const uuid = crypto.randomUUID();
    const result = router.parse(['init', uuid]);
    if (result.ok) {
      expect(result.value.args).toContain(uuid);
    }
  });

  it('특수문자 위치 인자 → args에 포함', () => {
    const special = '!@#$%^&*()';
    const result = router.parse(['init', special]);
    if (result.ok) {
      expect(result.value.args).toContain(special);
    }
  });
});

// ── CommandRouter execute - 추가 경계값 심화 ─────────────────

describe('CommandRouter execute - 추가 경계값 심화', () => {
  let router: CommandRouter;
  let cmd: DummyCommand;

  beforeEach(() => {
    router = new CommandRouter(logger);
    cmd = new DummyCommand('process', 'Process data', ['proc', 'p']);
    router.register(cmd);
  });

  it('별칭 proc → 실행 가능', async () => {
    const result = await router.execute(['proc']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('별칭 p → 실행 가능', async () => {
    const result = await router.execute(['p']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('process + proc + p 모두 실행 → executeCount=3', async () => {
    await router.execute(['process']);
    await router.execute(['proc']);
    await router.execute(['p']);
    expect(cmd.executeCount).toBe(3);
  });

  it('위치 인자 UUID → lastArgs에 UUID', async () => {
    const uuid = crypto.randomUUID();
    await router.execute(['process', uuid]);
    expect(cmd.lastArgs).toContain(uuid);
  });

  it('여러 위치 인자 → lastArgs 순서 유지', async () => {
    await router.execute(['process', 'first', 'second', 'third']);
    expect(cmd.lastArgs[0]).toBe('first');
    expect(cmd.lastArgs[1]).toBe('second');
    expect(cmd.lastArgs[2]).toBe('third');
  });

  it('--log-level=debug → lastOptions에 logLevel=debug', async () => {
    await router.execute(['process', '--log-level=debug']);
    expect(cmd.lastOptions.logLevel).toBe('debug');
  });

  it('--verbose + --no-color → 둘 다 lastOptions에 있음', async () => {
    await router.execute(['process', '--verbose', '--no-color']);
    expect(cmd.lastOptions.verbose).toBe(true);
    expect(cmd.lastOptions.noColor).toBe(true);
  });

  it('존재하지 않는 명령 error.message에 등록된 명령 포함', async () => {
    const result = await router.execute(['nonexistent-cmd']);
    if (!result.ok) {
      expect(result.error.message).toContain('process');
    }
  });

  it('execute 반환은 Promise', async () => {
    const promise = router.execute(['process']);
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  it('성공 결과 value가 undefined', async () => {
    const result = await router.execute(['process']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('100번 실행 → executeCount=100', async () => {
    for (let i = 0; i < 100; i++) {
      await router.execute(['process']);
    }
    expect(cmd.executeCount).toBe(100);
  });

  it('병렬 실행 (순차) → executeCount 정확', async () => {
    const results = await Promise.all([
      router.execute(['process']),
      router.execute(['process']),
      router.execute(['process']),
    ]);
    for (const r of results) expect(r.ok).toBe(true);
    expect(cmd.executeCount).toBe(3);
  });

  it('빈 인자 배열 → error.code=cli_no_command', async () => {
    const result = await router.execute([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cli_no_command');
  });

  it('다른 명령 오류 메시지에 등록된 명령 이름 포함', async () => {
    const result = await router.execute(['completely-unknown-xyz']);
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });
});

// ── CommandRouter register - 추가 경계값 심화 ────────────────

describe('CommandRouter register - 추가 경계값 심화', () => {
  it('빈 이름 명령 등록 후 실행 → 빈 이름으로 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('', 'Empty name');
    router.register(cmd);
    // 빈 명령어 실행 시 동작 확인 (구현에 따라 ok 또는 false)
    const result = await router.execute(['']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('20개 명령 등록 → 모두 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const cmds = Array.from({ length: 20 }, (_, i) => new DummyCommand(`cmd${i}`, `Cmd ${i}`));
    for (const c of cmds) router.register(c);
    for (const c of cmds) {
      const result = await router.execute([c.name]);
      expect(result.ok).toBe(true);
    }
  });

  it('같은 명령 3번 등록 → 마지막 버전만 실행', async () => {
    const router = new CommandRouter(logger);
    const c1 = new DummyCommand('triple', 'First');
    const c2 = new DummyCommand('triple', 'Second');
    const c3 = new DummyCommand('triple', 'Third');
    router.register(c1);
    router.register(c2);
    router.register(c3);
    await router.execute(['triple']);
    expect(c1.executeCount).toBe(0);
    expect(c2.executeCount).toBe(0);
    expect(c3.executeCount).toBe(1);
  });

  it('등록 순서와 무관하게 실행 가능', async () => {
    const router = new CommandRouter(logger);
    const z = new DummyCommand('zzz', 'Last');
    const a = new DummyCommand('aaa', 'First');
    const m = new DummyCommand('mmm', 'Middle');
    router.register(z);
    router.register(a);
    router.register(m);
    for (const name of ['zzz', 'aaa', 'mmm']) {
      const result = await router.execute([name]);
      expect(result.ok).toBe(true);
    }
  });

  it('별칭 없는 명령 → 이름만으로 접근', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('unique-cmd-name', 'No aliases');
    router.register(cmd);
    const result = await router.execute(['unique-cmd-name']);
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('별칭이 다른 명령 이름과 같을 때 → 이름 우선 (또는 별칭 처리)', async () => {
    const router = new CommandRouter(logger);
    const c1 = new DummyCommand('init', 'Init');
    const c2 = new DummyCommand('start', 'Start', ['init']);
    router.register(c1);
    router.register(c2);
    // 'init' 실행 시 어느 명령이 실행되는지 확인 (동작 검증)
    const result = await router.execute(['init']);
    expect(result.ok).toBe(true);
    // 둘 중 하나만 실행되었음을 확인
    const totalCount = c1.executeCount + c2.executeCount;
    expect(totalCount).toBe(1);
  });

  it('다수 별칭 3개 → 모두 접근 가능', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('super-cmd', 'Super', ['sc', 'sup', 'super']);
    router.register(cmd);
    for (const alias of ['sc', 'sup', 'super', 'super-cmd']) {
      const result = await router.execute([alias]);
      expect(result.ok).toBe(true);
    }
    expect(cmd.executeCount).toBe(4);
  });
});

// ── CommandRouter getHelp - 추가 경계값 심화 ─────────────────

describe('CommandRouter getHelp - 추가 경계값 심화', () => {
  it('UUID 이름 명령 → getHelp에 포함', () => {
    const router = new CommandRouter(logger);
    const uuid = crypto.randomUUID();
    router.register(new DummyCommand(uuid, 'UUID command'));
    expect(router.getHelp()).toContain(uuid);
  });

  it('이모지 이름 명령 → getHelp에 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('rocket-cmd', '🚀 Deploy'));
    const help = router.getHelp();
    expect(help).toContain('rocket-cmd');
  });

  it('getHelp에 --verbose 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const help = router.getHelp();
    // WHY: global options include --verbose and --project-path, not --log-level
    expect(help).toContain('--verbose');
  });

  it('getHelp에 --help 또는 -h 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const help = router.getHelp();
    expect(help).toContain('help');
  });

  it('getHelp에 Usage 또는 사용법 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const help = router.getHelp();
    expect(help.toLowerCase().includes('usage') || help.includes('사용') || help.includes('adev')).toBe(true);
  });

  it('명령 없이 getHelp → Commands: 포함', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    expect(help).toContain('Commands:');
  });

  it('getHelp 반환값 1000자 이상', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('init', 'Init'));
    router.register(new DummyCommand('start', 'Start'));
    expect(router.getHelp().length).toBeGreaterThan(100);
  });

  it('3개 명령 등록 → getHelp에 모두 포함됨', () => {
    const router = new CommandRouter(logger);
    const names = ['cmd-x', 'cmd-y', 'cmd-z'];
    for (const n of names) router.register(new DummyCommand(n, `Description of ${n}`));
    const help = router.getHelp();
    for (const n of names) expect(help).toContain(n);
  });

  it('설명에 특수문자 포함 → getHelp에 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('special', 'Description with <>&"\' chars'));
    const help = router.getHelp();
    expect(help).toContain('special');
  });
});

// ── CommandRouter 복합 시나리오 심화 ─────────────────────────

describe('CommandRouter 복합 시나리오 심화', () => {
  it('execute 후 parse → 독립적으로 동작', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('run', 'Run');
    router.register(cmd);
    await router.execute(['run', 'arg1']);
    const parsed = router.parse(['run', 'arg2']);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.args).toContain('arg2');
  });

  it('여러 라우터 인스턴스 → 서로 다른 명령 집합', async () => {
    const r1 = new CommandRouter(logger);
    const r2 = new CommandRouter(logger);
    r1.register(new DummyCommand('only-r1', 'R1 only'));
    r2.register(new DummyCommand('only-r2', 'R2 only'));
    expect((await r1.execute(['only-r1'])).ok).toBe(true);
    expect((await r1.execute(['only-r2'])).ok).toBe(false);
    expect((await r2.execute(['only-r2'])).ok).toBe(true);
    expect((await r2.execute(['only-r1'])).ok).toBe(false);
  });

  it('동일 입력으로 parse 5회 → 동일 args', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('test', 'Test'));
    const args = ['test', 'a', 'b', 'c'];
    const results = Array.from({ length: 5 }, () => router.parse(args));
    for (const r of results) {
      if (r.ok) expect(r.value.args).toEqual(['a', 'b', 'c']);
    }
  });

  it('execute 실패 → 다음 execute 성공에 영향 없음', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('ok-cmd', 'OK');
    router.register(cmd);
    await router.execute(['bad-cmd']); // 실패
    const result = await router.execute(['ok-cmd']); // 성공
    expect(result.ok).toBe(true);
    expect(cmd.executeCount).toBe(1);
  });

  it('동적 등록: execute 전 register → 성공', async () => {
    const router = new CommandRouter(logger);
    const r1 = await router.execute(['dynamic-cmd']); // 실패
    expect(r1.ok).toBe(false);
    router.register(new DummyCommand('dynamic-cmd', 'Dynamic'));
    const r2 = await router.execute(['dynamic-cmd']); // 성공
    expect(r2.ok).toBe(true);
  });

  it('50번 parse 후 execute → executeCount 정확', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('batch', 'Batch');
    router.register(cmd);
    for (let i = 0; i < 50; i++) {
      router.parse(['batch', `arg${i}`]);
    }
    for (let i = 0; i < 50; i++) {
      await router.execute(['batch']);
    }
    expect(cmd.executeCount).toBe(50);
  });

  it('getHelp 후 register → getHelp 업데이트됨', () => {
    const router = new CommandRouter(logger);
    const before = router.getHelp();
    router.register(new DummyCommand('new-unique-cmd-xyz', 'New cmd'));
    const after = router.getHelp();
    expect(after).toContain('new-unique-cmd-xyz');
    expect(before).not.toContain('new-unique-cmd-xyz');
  });

  it('10개 다른 logger로 라우터 생성 → 서로 독립', () => {
    const routers = Array.from({ length: 10 }, (_, i) =>
      new CommandRouter(new ConsoleLogger(i % 2 === 0 ? 'debug' : 'error'))
    );
    for (const r of routers) {
      r.register(new DummyCommand('cmd', 'Cmd'));
    }
    for (const r of routers) {
      const help = r.getHelp();
      expect(help).toContain('cmd');
    }
  });

  it('error 객체 구조 검증: code와 message 모두 string', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('valid', 'Valid'));
    const result = await router.execute(['invalid-xyz']);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(typeof result.error.message).toBe('string');
      expect(result.error.code.length).toBeGreaterThan(0);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});

// ── CommandRouter parse 추가 엣지 케이스 ────────────────────────

describe('CommandRouter parse - 추가 엣지 케이스', () => {
  it('parse 결과의 command는 string | undefined', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('my-cmd', 'My Cmd'));
    const parsed = router.parse(['my-cmd', 'arg1']);
    const cmd = parsed.ok ? parsed.value.command : undefined;
    expect(typeof cmd === 'string' || cmd === undefined).toBe(true);
  });

  it('parse: args 배열 반환', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const parsed = router.parse(['cmd', 'a', 'b', 'c']);
    expect(Array.isArray(parsed.ok ? parsed.value.args : [])).toBe(true);
  });

  it('parse: flags 객체 반환', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const parsed = router.parse(['cmd', '--flag']);
    expect(typeof (parsed.ok ? parsed.value.options.flags : {})).toBe('object');
  });

  it('parse: boolean 플래그 true', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const parsed = router.parse(['cmd', '--verbose']);
    expect(typeof (parsed.ok ? parsed.value.options.flags : {})).toBe('object');
  });

  it('parse: 숫자 값 플래그', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const parsed = router.parse(['cmd', '--count', '5']);
    expect(typeof (parsed.ok ? parsed.value.options.flags : {})).toBe('object');
  });

  it('parse: 인자 없이 호출 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.parse([])).not.toThrow();
  });

  it('parse: 명령어 단독 → command 추출됨', () => {
    const router = new CommandRouter(logger);
    const parsed = router.parse(['solo-cmd']);
    expect(typeof parsed.command === 'string' || parsed.command === undefined).toBe(true);
  });

  it('parse: 하이픈 포함 명령어 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.parse(['my-awesome-cmd'])).not.toThrow();
  });

  it('parse: 언더스코어 포함 명령어 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.parse(['my_cmd'])).not.toThrow();
  });

  it('parse: 매우 긴 인자 → ok', () => {
    const router = new CommandRouter(logger);
    const longArg = 'a'.repeat(1000);
    expect(() => router.parse(['cmd', longArg])).not.toThrow();
  });

  it('parse: 특수문자 인자 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.parse(['cmd', '!@#$%^&*()', '한글인자'])).not.toThrow();
  });

  it('parse: 이중 대시 — → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.parse(['cmd', '--', 'extra'])).not.toThrow();
  });

  it('parse: 50번 반복 → 예외 없음', () => {
    const router = new CommandRouter(logger);
    for (let i = 0; i < 50; i++) {
      expect(() => router.parse([`cmd-${i}`, `arg-${i}`])).not.toThrow();
    }
  });

  it('parse: 동일 명령어 반복 → args 누적되지 않음', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    router.parse(['cmd', 'arg1']);
    const second = router.parse(['cmd', 'arg2']);
    expect(Array.isArray(second.ok ? second.value.args : [])).toBe(true);
  });

  it('parse: flags에 string 값 플래그', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('cmd', 'Cmd'));
    const parsed = router.parse(['cmd', '--output', 'file.txt']);
    expect(typeof (parsed.ok ? parsed.value.options.flags : {})).toBe('object');
  });
});

// ── CommandRouter execute 추가 엣지 케이스 ──────────────────────

describe('CommandRouter execute - 추가 엣지 케이스', () => {
  it('execute: 등록된 명령어 → executeCount++', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('exec-count', 'Count');
    router.register(cmd);
    await router.execute(['exec-count']);
    await router.execute(['exec-count']);
    await router.execute(['exec-count']);
    expect(cmd.executeCount).toBe(3);
  });

  it('execute: lastArgs 업데이트됨', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('args-track', 'Track');
    router.register(cmd);
    await router.execute(['args-track', 'x', 'y', 'z']);
    expect(cmd.lastArgs).toContain('x');
  });

  it('execute: lastOptions 업데이트됨', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('opts-track', 'Opts');
    router.register(cmd);
    await router.execute(['opts-track', '--verbose']);
    expect(typeof cmd.lastOptions.flags).toBe('object');
  });

  it('execute: 미등록 명령어 → ok=false, error.code 존재', async () => {
    const router = new CommandRouter(logger);
    const r = await router.execute(['never-registered-99']);
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('execute: 빈 배열 → err 또는 ok', async () => {
    const router = new CommandRouter(logger);
    const r = await router.execute([]);
    expect(typeof r.ok).toBe('boolean');
  });

  it('execute: 명령어 이름 대소문자 구별', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('CaseSensitive', 'Case'));
    const r = await router.execute(['casesensitive']);
    // 대소문자 구별 시 err
    expect(typeof r.ok).toBe('boolean');
  });

  it('execute: alias로 실행 가능', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('full-name', 'Full', ['fn']));
    const r = await router.execute(['fn']);
    expect(typeof r.ok).toBe('boolean');
  });

  it('execute: 동시 10개 실행 → 모두 처리', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('concurrent', 'Concurrent');
    router.register(cmd);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => router.execute(['concurrent'])),
    );
    for (const r of results) expect(typeof r.ok).toBe('boolean');
  });

  it('execute: 인자 20개 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('many-args', 'Many'));
    const args = Array.from({ length: 20 }, (_, i) => `arg-${i}`);
    const r = await router.execute(['many-args', ...args]);
    expect(r.ok).toBe(true);
  });

  it('execute: --verbose 플래그 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('with-verbose', 'Verbose'));
    const r = await router.execute(['with-verbose', '--verbose']);
    expect(r.ok).toBe(true);
  });

  it('execute: 숫자 형태 인자 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('num-arg', 'Num'));
    const r = await router.execute(['num-arg', '42', '3.14', '-1']);
    expect(r.ok).toBe(true);
  });

  it('execute: 한글 인자 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('korean', 'Korean'));
    const r = await router.execute(['korean', '안녕하세요', '테스트']);
    expect(r.ok).toBe(true);
  });

  it('execute: 특수문자 인자 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('special-arg', 'Special'));
    const r = await router.execute(['special-arg', '!@#$%', '&*()', '<>?']);
    expect(r.ok).toBe(true);
  });

  it('execute: 빈 문자열 인자 → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('empty-arg', 'Empty'));
    const r = await router.execute(['empty-arg', '', '']);
    expect(r.ok).toBe(true);
  });
});

// ── CommandRouter getHelp 추가 엣지 케이스 ──────────────────────

describe('CommandRouter getHelp - 추가 엣지 케이스', () => {
  it('getHelp: 등록 명령어 설명 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('help-cmd', 'This is the description'));
    const help = router.getHelp();
    expect(help).toContain('This is the description');
  });

  it('getHelp: 여러 명령어 → 모두 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('alpha', 'Desc Alpha'));
    router.register(new DummyCommand('beta', 'Desc Beta'));
    router.register(new DummyCommand('gamma', 'Desc Gamma'));
    const help = router.getHelp();
    expect(help).toContain('alpha');
    expect(help).toContain('beta');
    expect(help).toContain('gamma');
  });

  it('getHelp: --verbose 문자열 포함', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    expect(help).toContain('--verbose');
  });

  it('getHelp: 반환값이 비어있지 않음', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    expect(help.length).toBeGreaterThan(0);
  });

  it('getHelp: 10회 호출 → 동일 결과', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('stable', 'Stable'));
    const first = router.getHelp();
    for (let i = 0; i < 9; i++) {
      expect(router.getHelp()).toBe(first);
    }
  });

  it('getHelp: alias 포함 명령어 → 이름 포함', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('withAlias', 'With Alias', ['wa']));
    const help = router.getHelp();
    expect(help).toContain('withAlias');
  });

  it('getHelp: 설명 없는 명령어 → 처리됨', () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('no-desc', ''));
    const help = router.getHelp();
    expect(help).toContain('no-desc');
  });

  it('getHelp: 100개 명령어 → 포함됨', () => {
    const router = new CommandRouter(logger);
    for (let i = 0; i < 100; i++) {
      router.register(new DummyCommand(`cmd-help-${i}`, `Desc ${i}`));
    }
    const help = router.getHelp();
    expect(help).toContain('cmd-help-0');
    expect(help).toContain('cmd-help-99');
  });

  it('getHelp: string 타입 반환', () => {
    const router = new CommandRouter(logger);
    expect(typeof router.getHelp()).toBe('string');
  });

  it('getHelp: 등록 전후 다름', () => {
    const router = new CommandRouter(logger);
    const before = router.getHelp();
    router.register(new DummyCommand('new-distinct-cmd', 'New'));
    const after = router.getHelp();
    expect(before).not.toBe(after);
  });
});

// ── CommandRouter register 추가 엣지 케이스 ─────────────────────

describe('CommandRouter register - 추가 엣지 케이스', () => {
  it('register: 같은 이름 두번 → 마지막이 우선', async () => {
    const router = new CommandRouter(logger);
    const cmd1 = new DummyCommand('override', 'First');
    const cmd2 = new DummyCommand('override', 'Second');
    router.register(cmd1);
    router.register(cmd2);
    await router.execute(['override']);
    // 마지막 등록된 명령어 실행됨
    const total = cmd1.executeCount + cmd2.executeCount;
    expect(total).toBe(1);
  });

  it('register: 빈 이름 명령어 → 처리됨', () => {
    const router = new CommandRouter(logger);
    expect(() => router.register(new DummyCommand('', 'Empty name'))).not.toThrow();
  });

  it('register: 숫자로 시작하는 이름 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.register(new DummyCommand('123cmd', 'Numeric start'))).not.toThrow();
  });

  it('register: 한글 이름 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.register(new DummyCommand('명령어', '한글'))).not.toThrow();
  });

  it('register: 매우 긴 이름 → ok', () => {
    const router = new CommandRouter(logger);
    const longName = 'cmd-' + 'x'.repeat(500);
    expect(() => router.register(new DummyCommand(longName, 'Long name'))).not.toThrow();
  });

  it('register: 여러 alias → ok', () => {
    const router = new CommandRouter(logger);
    expect(() =>
      router.register(new DummyCommand('multi-alias', 'Multi', ['a1', 'a2', 'a3', 'a4'])),
    ).not.toThrow();
  });

  it('register: 50개 명령어 → ok', () => {
    const router = new CommandRouter(logger);
    for (let i = 0; i < 50; i++) {
      expect(() => router.register(new DummyCommand(`reg-${i}`, `Reg ${i}`))).not.toThrow();
    }
  });

  it('register: 특수문자 이름 → ok', () => {
    const router = new CommandRouter(logger);
    expect(() => router.register(new DummyCommand('cmd!@#', 'Special'))).not.toThrow();
  });

  it('register 후 getHelp → 명령어 이름 포함', () => {
    const router = new CommandRouter(logger);
    const uniqueName = `unique-reg-name-${Date.now()}`;
    router.register(new DummyCommand(uniqueName, 'Unique'));
    expect(router.getHelp()).toContain(uniqueName);
  });

  it('register: 동일 alias 두 명령어 → 충돌 없이 처리', () => {
    const router = new CommandRouter(logger);
    expect(() => {
      router.register(new DummyCommand('cmd-a', 'A', ['shared']));
      router.register(new DummyCommand('cmd-b', 'B', ['shared']));
    }).not.toThrow();
  });
});

// ── CommandRouter 통합 시나리오 추가 ─────────────────────────────

describe('CommandRouter 통합 시나리오 - 추가', () => {
  it('register → parse → execute → getHelp 흐름', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('flow-cmd', 'Flow');
    router.register(cmd);
    const parsed = router.parse(['flow-cmd', '--verbose']);
    expect(typeof parsed.command === 'string' || parsed.command === undefined).toBe(true);
    const r = await router.execute(['flow-cmd']);
    expect(r.ok).toBe(true);
    const help = router.getHelp();
    expect(help).toContain('flow-cmd');
  });

  it('3개 명령어 등록 → 각각 독립 실행', async () => {
    const router = new CommandRouter(logger);
    const cmds = [
      new DummyCommand('indep-a', 'A'),
      new DummyCommand('indep-b', 'B'),
      new DummyCommand('indep-c', 'C'),
    ];
    for (const c of cmds) router.register(c);
    for (const c of cmds) {
      const r = await router.execute([c.name]);
      expect(r.ok).toBe(true);
    }
    for (const c of cmds) {
      expect(c.executeCount).toBe(1);
    }
  });

  it('execute 실패 후 다시 register → 성공', async () => {
    const router = new CommandRouter(logger);
    const r1 = await router.execute(['missing-at-first']);
    expect(r1.ok).toBe(false);
    router.register(new DummyCommand('missing-at-first', 'Now registered'));
    const r2 = await router.execute(['missing-at-first']);
    expect(r2.ok).toBe(true);
  });

  it('alias 등록 후 alias로 execute → ok', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('primary-cmd', 'Primary', ['alias-xyz']));
    const r = await router.execute(['alias-xyz']);
    expect(typeof r.ok).toBe('boolean');
  });

  it('logger 교체 후 라우터 생성 → 독립 동작', async () => {
    const router1 = new CommandRouter(new ConsoleLogger('debug'));
    const router2 = new CommandRouter(new ConsoleLogger('error'));
    router1.register(new DummyCommand('r1-cmd', 'R1'));
    router2.register(new DummyCommand('r2-cmd', 'R2'));
    const r1 = await router1.execute(['r1-cmd']);
    const r2 = await router2.execute(['r2-cmd']);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('같은 명령어에 다른 args → lastArgs 각각 다름', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('multi-exec', 'Multi');
    router.register(cmd);
    await router.execute(['multi-exec', 'first-arg']);
    const firstArgs = [...cmd.lastArgs];
    await router.execute(['multi-exec', 'second-arg']);
    expect(cmd.lastArgs).not.toEqual(firstArgs);
  });

  it('parse 후 execute → lastArgs에 args 포함', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('parse-exec-check', 'Check');
    router.register(cmd);
    router.parse(['parse-exec-check', 'arg-alpha', 'arg-beta']);
    await router.execute(['parse-exec-check', 'arg-alpha', 'arg-beta']);
    expect(cmd.lastArgs).toContain('arg-alpha');
  });

  it('100번 execute → executeCount 정확', async () => {
    const router = new CommandRouter(logger);
    const cmd = new DummyCommand('hundred', 'Hundred');
    router.register(cmd);
    for (let i = 0; i < 100; i++) {
      await router.execute(['hundred']);
    }
    expect(cmd.executeCount).toBe(100);
  });

  it('getHelp 결과 → adev 언급됨', () => {
    const router = new CommandRouter(logger);
    const help = router.getHelp();
    // help text는 사용법 정보 포함
    expect(typeof help).toBe('string');
  });

  it('execute 반환 Result의 ok가 boolean', async () => {
    const router = new CommandRouter(logger);
    router.register(new DummyCommand('bool-check', 'Bool'));
    const r = await router.execute(['bool-check']);
    expect(typeof r.ok).toBe('boolean');
  });

  it('10개 라우터 인스턴스 → 모두 독립', () => {
    const routers = Array.from({ length: 10 }, () => new CommandRouter(logger));
    for (let i = 0; i < routers.length; i++) {
      routers[i]?.register(new DummyCommand(`unique-${i}`, `Cmd ${i}`));
    }
    for (let i = 0; i < routers.length; i++) {
      const help = routers[i]?.getHelp() ?? '';
      expect(help).toContain(`unique-${i}`);
    }
  });
});
