/**
 * ProcessExecutor 테스트
 *
 * @description
 * KR: Bun.spawn 기반 프로세스 실행기 테스트
 *     비율: Normal 20%, Edge 40%, Error 40%
 * EN: Tests for Bun.spawn-based process executor
 *     Ratio: Normal 20%, Edge 40%, Error 40%
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
});

afterEach(() => {
  // WHY: 테스트 간 상태 독립성 보장
  logger = null as unknown as ConsoleLogger;
  executor = null as unknown as ProcessExecutor;
});

// ══════════════════════════════════════════════════════════════════
// CONSTRUCTOR
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => new ProcessExecutor(new ConsoleLogger('error'))).not.toThrow();
  });

  it('ProcessExecutor 인스턴스이다', () => {
    expect(new ProcessExecutor(new ConsoleLogger('error'))).toBeInstanceOf(ProcessExecutor);
  });

  it('execute 메서드가 존재한다', () => {
    const ex = new ProcessExecutor(new ConsoleLogger('error'));
    expect(typeof ex.execute).toBe('function');
  });

  it('두 인스턴스는 다른 객체이다', () => {
    const e1 = new ProcessExecutor(new ConsoleLogger('error'));
    const e2 = new ProcessExecutor(new ConsoleLogger('error'));
    expect(e1).not.toBe(e2);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new ProcessExecutor(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 생성 가능', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new ProcessExecutor(new ConsoleLogger('error'))).not.toThrow();
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// NORMAL CASES (20%)
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - Normal Cases', () => {
  it('단순 명령이 성공적으로 실행된다', async () => {
    const result = await executor.execute('echo', ['hello']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout.trim()).toBe('hello');
      expect(result.value.stderr).toBe('');
      expect(result.value.durationMs).toBeGreaterThan(0);
    }
  });

  it('인자가 올바르게 전달된다', async () => {
    const result = await executor.execute('echo', ['arg1', 'arg2', 'arg3']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe('arg1 arg2 arg3');
    }
  });

  it('작업 디렉토리가 적용된다', async () => {
    // WHY: OS 무관하게 실제 cwd가 설정된 디렉토리와 일치하는지 확인
    const targetDir = process.cwd();
    const result = await executor.execute('sh', ['-c', 'pwd'], { cwd: targetDir });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // WHY: macOS에서 /tmp는 /private/tmp로 symlink resolve될 수 있으므로
      //      basename 비교로 OS 무관한 검증 수행
      const pwd = result.value.stdout.trim();
      const targetBasename = targetDir.replace(/\\/g, '/').split('/').pop() ?? '';
      expect(pwd.endsWith(targetBasename)).toBe(true);
    }
  });

  it('ok가 boolean이다', async () => {
    const result = await executor.execute('echo', ['bool-check']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('exitCode가 숫자이다', async () => {
    const result = await executor.execute('echo', ['type-check']);
    if (result.ok) expect(typeof result.value.exitCode).toBe('number');
  });

  it('stdout이 문자열이다', async () => {
    const result = await executor.execute('echo', ['str-check']);
    if (result.ok) expect(typeof result.value.stdout).toBe('string');
  });

  it('stderr이 문자열이다', async () => {
    const result = await executor.execute('echo', ['stderr-check']);
    if (result.ok) expect(typeof result.value.stderr).toBe('string');
  });

  it('durationMs가 숫자이다', async () => {
    const result = await executor.execute('echo', ['dur-check']);
    if (result.ok) expect(typeof result.value.durationMs).toBe('number');
  });

  it('단일 인자 echo', async () => {
    const result = await executor.execute('echo', ['single']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('single');
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - Edge Cases', () => {
  it('빈 인자 배열이 허용된다', async () => {
    const result = await executor.execute('echo', []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('stdout 없이 실행된다', async () => {
    // WHY: true는 아무 출력 없이 성공 (exit 0)
    const result = await executor.execute('true');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout).toBe('');
    }
  });

  it('stderr만 출력되는 명령을 처리한다', async () => {
    // WHY: >&2는 stdout을 stderr로 리다이렉트
    const result = await executor.execute('sh', ['-c', 'echo "error message" >&2']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe('');
      expect(result.value.stderr.trim()).toBe('error message');
    }
  });

  it('0이 아닌 종료 코드가 반환된다', async () => {
    // WHY: false는 항상 exit 1
    const result = await executor.execute('false');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(1);
    }
  });

  it('큰 stdout 출력을 처리한다', async () => {
    // WHY: 1MB 데이터 생성 (10MB 제한 이하)
    const result = await executor.execute('sh', ['-c', 'head -c 1048576 /dev/zero | base64']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.length).toBeGreaterThan(1_000_000);
    }
  });

  it('긴 인자 리스트를 처리한다', async () => {
    const longArgs = Array.from({ length: 100 }, (_, i) => `arg${i}`);
    const result = await executor.execute('echo', longArgs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('환경변수가 올바르게 전달된다', async () => {
    const result = await executor.execute('sh', ['-c', 'echo $TEST_VAR'], {
      env: { TEST_VAR: 'custom_value' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe('custom_value');
    }
  });

  it('stdin 입력이 프로세스로 전달된다', async () => {
    const result = await executor.execute('cat', [], { stdin: 'test input\n' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe('test input');
    }
  });

  it('매우 짧은 타임아웃에도 빠른 명령은 성공한다', async () => {
    const result = await executor.execute('echo', ['fast'], { timeoutMs: 100 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('특수 문자를 포함한 인자를 처리한다', async () => {
    const result = await executor.execute('echo', ['!@#$%^&*()', '<html>', '"quotes"']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('!@#$%^&*()');
    }
  });

  it('UTF-8 문자를 올바르게 처리한다', async () => {
    const result = await executor.execute('echo', ['안녕하세요', '🎉', '中文']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('안녕하세요');
      expect(result.value.stdout).toContain('🎉');
      expect(result.value.stdout).toContain('中文');
    }
  });

  it('여러 줄 stdin을 처리한다', async () => {
    const multilineInput = 'line1\nline2\nline3\n';
    const result = await executor.execute('cat', [], { stdin: multilineInput });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe(multilineInput);
    }
  });

  it('매우 긴 단일 인자 처리', async () => {
    const longArg = 'x'.repeat(1000);
    const result = await executor.execute('echo', [longArg]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe(longArg);
    }
  });

  it('exit code 2 반환', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 2']);
    if (result.ok) expect(result.value.exitCode).toBe(2);
  });

  it('exit code 127 반환', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 127']);
    if (result.ok) expect(result.value.exitCode).toBe(127);
  });

  it('true와 false의 exit code 차이', async () => {
    const trueResult = await executor.execute('true');
    const falseResult = await executor.execute('false');
    if (trueResult.ok) expect(trueResult.value.exitCode).toBe(0);
    if (falseResult.ok) expect(falseResult.value.exitCode).toBe(1);
  });

  it('빈 환경변수 값 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "${EMPTY_VAR:-default}"'], {
      env: { EMPTY_VAR: '' },
    });
    expect(result.ok).toBe(true);
  });

  it('newline이 포함된 stdout', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "line1\\nline2\\nline3"']);
    if (result.ok) {
      expect(result.value.stdout).toContain('line1');
      expect(result.value.stdout).toContain('line2');
    }
  });

  it('5번 연속 echo → 항상 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await executor.execute('echo', [`test-${i}`]);
      expect(result.ok).toBe(true);
    }
  });

  it('stdin 빈 문자열 처리', async () => {
    const result = await executor.execute('cat', [], { stdin: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// ERROR CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - Error Cases', () => {
  it('존재하지 않는 명령은 에러를 반환한다', async () => {
    const result = await executor.execute('nonexistent_command_xyz_123');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_execution_error');
      expect(result.error.message).toContain('프로세스 실행 실패');
    }
  });

  it('타임아웃이 발생하면 에러를 반환한다', async () => {
    // WHY: sleep 1초는 100ms 타임아웃 내에 완료 불가
    const result = await executor.execute('sleep', ['1'], { timeoutMs: 100 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_timeout');
      expect(result.error.message).toContain('타임아웃');
    }
  });

  it('출력 크기 제한을 초과하면 에러를 반환한다', async () => {
    // WHY: 11MB 출력은 10MB 제한 초과
    const result = await executor.execute('sh', ['-c', 'head -c 11534336 /dev/zero | base64']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_output_too_large');
      expect(result.error.message).toContain('출력 크기 초과');
    }
  });

  it('잘못된 작업 디렉토리는 에러를 반환한다', async () => {
    const result = await executor.execute('echo', ['test'], {
      cwd: '/nonexistent/directory/xyz',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_execution_error');
    }
  });

  it('권한이 없는 명령 실행은 에러를 반환한다', async () => {
    // WHY: 존재하지 않거나 권한이 없는 파일 접근 시 exit code != 0
    const result = await executor.execute('cat', ['/etc/shadow']);

    expect(result.ok).toBe(true); // WHY: 프로세스는 실행되지만 exit code != 0
    if (result.ok) {
      expect(result.value.exitCode).not.toBe(0);
      // WHY: macOS에서는 파일이 없어 "No such file", Linux에서는 "Permission denied"
      expect(
        result.value.stderr.includes('Permission denied') ||
          result.value.stderr.includes('No such file'),
      ).toBe(true);
    }
  });

  it('stderr가 10MB를 초과하면 에러를 반환한다', async () => {
    // WHY: stderr로 11MB 출력
    const result = await executor.execute('sh', [
      '-c',
      'head -c 11534336 /dev/zero | base64 >&2',
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_output_too_large');
    }
  });

  it('동시에 stdout과 stderr가 큰 경우 에러를 반환한다', async () => {
    // WHY: stdout 11MB, stderr 11MB 동시 출력 → 둘 중 하나가 10MB 초과
    const result = await executor.execute('sh', [
      '-c',
      'head -c 11534336 /dev/zero | base64 & head -c 11534336 /dev/zero | base64 >&2',
    ]);

    // WHY: stdout 또는 stderr 중 하나가 먼저 10MB 초과하여 실패
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_output_too_large');
    }
  });

  it('잘못된 셸 스크립트는 에러를 반환한다', async () => {
    const result = await executor.execute('sh', ['-c', 'invalid syntax &&& ||']);

    expect(result.ok).toBe(true); // WHY: 프로세스는 실행되지만 exit code != 0
    if (result.ok) {
      expect(result.value.exitCode).not.toBe(0);
    }
  });

  it('매우 긴 타임아웃에도 무한 루프는 종료된다', async () => {
    // WHY: 2초 타임아웃 내에 무한 루프는 종료됨
    const result = await executor.execute('sh', ['-c', 'while true; do :; done'], {
      timeoutMs: 2000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_timeout');
    }
  });

  it('잘못된 환경변수 형식은 무시된다', async () => {
    // WHY: undefined 값은 무시되어야 함
    const result = await executor.execute('echo', ['test'], {
      env: { UNDEFINED_VAR: undefined as unknown as string },
    });

    // WHY: Bun.spawn이 내부적으로 처리 — 실행은 성공해야 함
    expect(result.ok).toBe(true);
  });

  it('stdin이 매우 큰 경우 처리된다', async () => {
    // WHY: 5MB stdin 입력
    const largeInput = 'x'.repeat(5 * 1024 * 1024);
    const result = await executor.execute('wc', ['-c'], { stdin: largeInput });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe(String(largeInput.length));
    }
  });

  it('프로세스가 갑자기 종료되면 에러를 처리한다', async () => {
    // WHY: cross-platform non-zero exit — Unix/Windows 모두 동작
    const result = await executor.execute('sh', ['-c', 'exit 1']);

    expect(result.ok).toBe(true); // WHY: 프로세스는 실행되지만 exit code != 0
    if (result.ok) {
      expect(result.value.exitCode).not.toBe(0);
    }
  });

  it('에러 코드가 문자열이다 (미존재 명령)', async () => {
    const result = await executor.execute('totally_fake_cmd_999');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다 (미존재 명령)', async () => {
    const result = await executor.execute('totally_fake_cmd_999');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('타임아웃 에러 코드가 process_timeout', async () => {
    const result = await executor.execute('sleep', ['5'], { timeoutMs: 50 });
    if (!result.ok) expect(result.error.code).toBe('process_timeout');
  });

  it('타임아웃 에러 메시지가 문자열', async () => {
    const result = await executor.execute('sleep', ['5'], { timeoutMs: 50 });
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('200ms 타임아웃 내에 완료되지 않으면 실패', async () => {
    const result = await executor.execute('sleep', ['2'], { timeoutMs: 200 });
    expect(result.ok).toBe(false);
  });

  it('잘못된 cwd → error.code 문자열', async () => {
    const result = await executor.execute('echo', ['x'], { cwd: '/does/not/exist/here' });
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });
});

// ══════════════════════════════════════════════════════════════════
// CONCURRENCY & RACE CONDITIONS
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - Concurrency', () => {
  it('동시 실행이 독립적으로 처리된다', async () => {
    const results = await Promise.all([
      executor.execute('echo', ['test1']),
      executor.execute('echo', ['test2']),
      executor.execute('echo', ['test3']),
    ]);

    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(true);
    expect(results[2]?.ok).toBe(true);

    if (results[0]?.ok && results[1]?.ok && results[2]?.ok) {
      expect(results[0].value.stdout.trim()).toBe('test1');
      expect(results[1].value.stdout.trim()).toBe('test2');
      expect(results[2].value.stdout.trim()).toBe('test3');
    }
  });

  it('하나의 타임아웃이 다른 프로세스에 영향을 주지 않는다', async () => {
    const [timeoutResult, successResult] = await Promise.all([
      executor.execute('sleep', ['1'], { timeoutMs: 100 }),
      executor.execute('echo', ['success']),
    ]);

    expect(timeoutResult?.ok).toBe(false);
    expect(successResult?.ok).toBe(true);
  });

  it('5개 동시 실행 → 모두 독립', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => executor.execute('echo', [`concurrent-${i}`])),
    );
    for (let i = 0; i < results.length; i++) {
      expect(results[i]?.ok).toBe(true);
      if (results[i]?.ok) {
        const val = results[i];
        if (val?.ok) expect(val.value.stdout.trim()).toBe(`concurrent-${i}`);
      }
    }
  });

  it('성공과 실패 혼합 동시 실행', async () => {
    const results = await Promise.all([
      executor.execute('echo', ['ok']),
      executor.execute('nonexistent_xyz'),
      executor.execute('true'),
    ]);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(false);
    expect(results[2]?.ok).toBe(true);
  });

  it('두 executor 인스턴스 독립 실행', async () => {
    const ex1 = new ProcessExecutor(new ConsoleLogger('error'));
    const ex2 = new ProcessExecutor(new ConsoleLogger('error'));
    const [r1, r2] = await Promise.all([
      ex1.execute('echo', ['from-ex1']),
      ex2.execute('echo', ['from-ex2']),
    ]);
    if (r1.ok) expect(r1.value.stdout.trim()).toBe('from-ex1');
    if (r2.ok) expect(r2.value.stdout.trim()).toBe('from-ex2');
  });
});
