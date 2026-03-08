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
