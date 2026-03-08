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

// ══════════════════════════════════════════════════════════════════
// 추가 경계값: 반환값 구조 및 일관성
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 반환값 구조 및 일관성', () => {
  it('echo 성공 → ok=true', async () => {
    const result = await executor.execute('echo', ['x']);
    expect(result.ok).toBe(true);
  });

  it('true 성공 → exitCode=0', async () => {
    const result = await executor.execute('true');
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('false 성공 → exitCode=1', async () => {
    const result = await executor.execute('false');
    if (result.ok) expect(result.value.exitCode).toBe(1);
  });

  it('5번 반복 echo → 모두 ok=true', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await executor.execute('echo', [`repeat-${i}`]);
      expect(result.ok).toBe(true);
    }
  });

  it('durationMs > 0', async () => {
    const result = await executor.execute('echo', ['duration-check']);
    if (result.ok) expect(result.value.durationMs).toBeGreaterThan(0);
  });

  it('stdout은 개행 포함 문자열', async () => {
    const result = await executor.execute('echo', ['test']);
    if (result.ok) {
      expect(typeof result.value.stdout).toBe('string');
    }
  });

  it('stderr 빈 문자열 (echo는 stderr 없음)', async () => {
    const result = await executor.execute('echo', ['no-stderr']);
    if (result.ok) expect(result.value.stderr).toBe('');
  });

  it('인자 없이 echo → ok', async () => {
    const result = await executor.execute('echo', []);
    expect(result.ok).toBe(true);
  });

  it('두 줄 echo → stdout에 두 줄 포함', async () => {
    const result = await executor.execute('sh', ['-c', 'echo line1; echo line2']);
    if (result.ok) {
      expect(result.value.stdout).toContain('line1');
      expect(result.value.stdout).toContain('line2');
    }
  });

  it('exit code 0 → ok=true', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 0']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('exit code 1 → ok=true (프로세스 실행됨)', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 1']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(1);
  });

  it('echo 여러 단어 → stdout에 모두 포함', async () => {
    const result = await executor.execute('echo', ['hello', 'world', 'foo', 'bar']);
    if (result.ok) {
      expect(result.value.stdout).toContain('hello');
      expect(result.value.stdout).toContain('world');
    }
  });

  it('sh -c true → exitCode=0', async () => {
    const result = await executor.execute('sh', ['-c', 'true']);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('sh -c false → exitCode!=0', async () => {
    const result = await executor.execute('sh', ['-c', 'false']);
    if (result.ok) expect(result.value.exitCode).not.toBe(0);
  });

  it('미존재 명령 → ok=false', async () => {
    const result = await executor.execute('nonexistent_command_abc_999_xyz');
    expect(result.ok).toBe(false);
  });

  it('타임아웃 50ms → sleep 3 → ok=false', async () => {
    const result = await executor.execute('sleep', ['3'], { timeoutMs: 50 });
    expect(result.ok).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 경계값 및 랜덤 케이스
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 추가 Edge Cases', () => {
  it('숫자 문자열 인자 전달', async () => {
    const result = await executor.execute('echo', ['42', '-1', '0', '999999']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('42');
      expect(result.value.stdout).toContain('-1');
    }
  });

  it('한국어 인자 echo', async () => {
    const result = await executor.execute('echo', ['안녕', '세상']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('안녕');
    }
  });

  it('중국어 인자 echo', async () => {
    const result = await executor.execute('echo', ['你好', '世界']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('你好');
    }
  });

  it('이모지 인자 echo', async () => {
    const result = await executor.execute('echo', ['🚀', '🎉', '✅']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('🚀');
    }
  });

  it('200자 인자 echo', async () => {
    const arg = 'a'.repeat(200);
    const result = await executor.execute('echo', [arg]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe(arg);
    }
  });

  it('50개 동일 인자 echo', async () => {
    const args = Array.from({ length: 50 }, () => 'x');
    const result = await executor.execute('echo', args);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('exit code 42 반환', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 42']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(42);
    }
  });

  it('exit code 255 반환', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 255']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(255);
    }
  });

  it('sh -c printf → 개행 없는 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "no-newline"']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe('no-newline');
    }
  });

  it('newline만 있는 stdin 처리', async () => {
    const result = await executor.execute('cat', [], { stdin: '\n' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe('\n');
    }
  });

  it('tab 문자 포함 인자', async () => {
    const result = await executor.execute('echo', ['col1\tcol2\tcol3']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('col1');
    }
  });

  it('역슬래시 포함 인자', async () => {
    const result = await executor.execute('echo', ['path\\to\\file']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('path');
    }
  });

  it('랜덤 UUID를 인자로 echo', async () => {
    const uuid = crypto.randomUUID();
    const result = await executor.execute('echo', [uuid]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe(uuid);
    }
  });

  it('env 변수 여러 개 동시 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$A $B $C"'], {
      env: { A: 'alpha', B: 'beta', C: 'gamma' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('alpha');
      expect(result.value.stdout).toContain('beta');
      expect(result.value.stdout).toContain('gamma');
    }
  });

  it('stdout + stderr 동시 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "out"; echo "err" >&2']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe('out');
      expect(result.value.stderr.trim()).toBe('err');
    }
  });

  it('durationMs는 양수이다 (true 명령)', async () => {
    const result = await executor.execute('true');
    if (result.ok) {
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('10개 병렬 UUID echo → 각자 일치', async () => {
    const uuids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const results = await Promise.all(uuids.map((u) => executor.execute('echo', [u])));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r?.ok) {
        expect(r.value.stdout.trim()).toBe(uuids[i]);
      }
    }
  });

  it('sh -c with semicolons', async () => {
    const result = await executor.execute('sh', ['-c', 'echo a; echo b; echo c']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toContain('a');
      expect(result.value.stdout).toContain('b');
      expect(result.value.stdout).toContain('c');
    }
  });

  it('환경변수 없이 sh 실행', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "no-env"'], { env: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('타임아웃 1000ms - 빠른 명령 성공', async () => {
    const result = await executor.execute('true', [], { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('미존재 명령 error.code는 process_execution_error', async () => {
    const result = await executor.execute('absolutely_does_not_exist_cmd_xyz');
    if (!result.ok) {
      expect(result.error.code).toBe('process_execution_error');
    }
  });

  it('음수 exit code 시나리오 (sh는 exit code를 0-255로 wrapping)', async () => {
    // sh exit 256 → exit code 0 (wrapping)
    const result = await executor.execute('sh', ['-c', 'exit 256']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('stdin에 JSON 문자열 전달', async () => {
    const json = JSON.stringify({ key: 'value', num: 42 });
    const result = await executor.execute('cat', [], { stdin: json });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe(json);
    }
  });

  it('stdin에 유니코드 문자열 전달', async () => {
    const unicode = '안녕하세요 🎉 こんにちは';
    const result = await executor.execute('cat', [], { stdin: unicode });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout).toBe(unicode);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 경계값 및 랜덤 케이스 시리즈 2
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 추가 경계값 케이스 2', () => {
  it('exit code 0 → result.ok true이고 exitCode 0', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 0']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('exit code 100 → result.ok true이고 exitCode 100', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 100']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(100);
  });

  it('sh -c "echo $?" → 이전 명령이 0이면 0 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'true; echo $?']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('0');
  });

  it('sh -c "echo $?" → 이전 명령이 실패면 0 아님', async () => {
    const result = await executor.execute('sh', ['-c', 'false; echo $?']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).not.toBe('0');
  });

  it('빈 stdin 전달 후 cat → 빈 stdout', async () => {
    const result = await executor.execute('cat', [], { stdin: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout).toBe('');
  });

  it('stdin에 개행만 → stdout에 개행', async () => {
    const result = await executor.execute('cat', [], { stdin: '\n\n\n' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout).toBe('\n\n\n');
  });

  it('환경변수 키에 숫자 포함 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$VAR_123"'], {
      env: { VAR_123: 'numeric-key-ok' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('numeric-key-ok');
  });

  it('환경변수 값이 빈 문자열 → 셸에서 빈 값으로 확인', async () => {
    const result = await executor.execute('sh', ['-c', '[ -z "$EMPTY_K" ] && echo "yes" || echo "no"'], {
      env: { EMPTY_K: '' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('yes');
  });

  it('stdout과 stderr 순서 독립성 검증', async () => {
    const result = await executor.execute('sh', [
      '-c',
      'echo "stdout-first"; echo "stderr-second" >&2',
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stdout.trim()).toBe('stdout-first');
      expect(result.value.stderr.trim()).toBe('stderr-second');
    }
  });

  it('echo 공백 문자열 → 공백 포함 stdout', async () => {
    const result = await executor.execute('echo', ['  spaces  ']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('spaces');
  });

  it('sh -c with subshell → 서브셸 exit 코드 전달', async () => {
    const result = await executor.execute('sh', ['-c', '(exit 3)']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(3);
  });

  it('sh -c pipeline → 마지막 exit code 반환', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "foo" | cat']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout.trim()).toBe('foo');
    }
  });

  it('execute 반환값 ok는 true 또는 false만', async () => {
    const result = await executor.execute('echo', ['bool-contract']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('성공 시 value.exitCode는 정수', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 7']);
    if (result.ok) {
      expect(Number.isInteger(result.value.exitCode)).toBe(true);
      expect(result.value.exitCode).toBe(7);
    }
  });

  it('성공 시 value.durationMs는 0 이상', async () => {
    const result = await executor.execute('true');
    if (result.ok) expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('실패 시 error.code는 빈 문자열이 아님', async () => {
    const result = await executor.execute('nonexistent_cmd_abc_xyz_000');
    if (!result.ok) {
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('실패 시 error.message는 빈 문자열이 아님', async () => {
    const result = await executor.execute('nonexistent_cmd_abc_xyz_111');
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('타임아웃 에러는 ok=false', async () => {
    const result = await executor.execute('sleep', ['10'], { timeoutMs: 50 });
    expect(result.ok).toBe(false);
  });

  it('타임아웃 에러의 code는 process_timeout', async () => {
    const result = await executor.execute('sleep', ['10'], { timeoutMs: 50 });
    if (!result.ok) expect(result.error.code).toBe('process_timeout');
  });

  it('미존재 명령 에러 code는 process_execution_error', async () => {
    const result = await executor.execute('zxcvbnm_not_a_cmd_at_all');
    if (!result.ok) expect(result.error.code).toBe('process_execution_error');
  });

  it('cwd 잘못된 경우 에러 code는 process_execution_error', async () => {
    const result = await executor.execute('echo', ['x'], { cwd: '/no/such/path/xyz/abc' });
    if (!result.ok) expect(result.error.code).toBe('process_execution_error');
  });

  it('10회 병렬 true 실행 → 모두 exitCode 0', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => executor.execute('true')),
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.exitCode).toBe(0);
    }
  });

  it('10회 병렬 false 실행 → 모두 exitCode 1', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => executor.execute('false')),
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.exitCode).toBe(1);
    }
  });

  it('랜덤 UUID를 환경변수로 전달 → 일치 확인', async () => {
    const uuid = crypto.randomUUID();
    const result = await executor.execute('sh', ['-c', 'echo "$THE_UUID"'], {
      env: { THE_UUID: uuid },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe(uuid);
  });

  it('sh -c echo with redirect > /dev/null → stdout empty', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "hidden" > /dev/null']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout).toBe('');
  });

  it('sh -c : (noop) → exitCode 0, stdout empty', async () => {
    const result = await executor.execute('sh', ['-c', ':']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout).toBe('');
    }
  });

  it('wc -l stdin 라인 수 계산', async () => {
    const lines = 'a\nb\nc\nd\ne\n';
    const result = await executor.execute('wc', ['-l'], { stdin: lines });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const count = Number.parseInt(result.value.stdout.trim(), 10);
      expect(count).toBe(5);
    }
  });

  it('tr 명령으로 소문자→대문자 변환', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "hello" | tr a-z A-Z']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('HELLO');
  });

  it('두 executor가 동시에 다른 cwd에서 실행 → 각자 독립', async () => {
    const ex1 = new ProcessExecutor(new ConsoleLogger('error'));
    const ex2 = new ProcessExecutor(new ConsoleLogger('error'));
    const [r1, r2] = await Promise.all([
      ex1.execute('sh', ['-c', 'echo "ex1"']),
      ex2.execute('sh', ['-c', 'echo "ex2"']),
    ]);
    if (r1.ok) expect(r1.value.stdout.trim()).toBe('ex1');
    if (r2.ok) expect(r2.value.stdout.trim()).toBe('ex2');
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: Result 계약 및 타입 일관성
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - Result 계약 및 타입 일관성', () => {
  it('성공 결과에 value 필드 존재', async () => {
    const result = await executor.execute('echo', ['contract']);
    if (result.ok) {
      expect('value' in result).toBe(true);
    }
  });

  it('실패 결과에 error 필드 존재', async () => {
    const result = await executor.execute('nonexistent_contract_cmd');
    if (!result.ok) {
      expect('error' in result).toBe(true);
    }
  });

  it('성공 시 value.stdout은 string', async () => {
    const result = await executor.execute('echo', ['type-ok']);
    if (result.ok) {
      expect(typeof result.value.stdout).toBe('string');
    }
  });

  it('성공 시 value.stderr은 string', async () => {
    const result = await executor.execute('echo', ['type-ok-err']);
    if (result.ok) {
      expect(typeof result.value.stderr).toBe('string');
    }
  });

  it('성공 시 value.exitCode는 number', async () => {
    const result = await executor.execute('echo', ['code-type']);
    if (result.ok) {
      expect(typeof result.value.exitCode).toBe('number');
    }
  });

  it('성공 시 value.durationMs는 number', async () => {
    const result = await executor.execute('echo', ['dur-type']);
    if (result.ok) {
      expect(typeof result.value.durationMs).toBe('number');
    }
  });

  it('실패 시 error.code는 non-empty string', async () => {
    const result = await executor.execute('bogus_cmd_xyz_contract');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('실패 시 error.message는 non-empty string', async () => {
    const result = await executor.execute('bogus_cmd_xyz_msg');
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('ok는 항상 boolean', async () => {
    const results = await Promise.all([
      executor.execute('echo', ['bool1']),
      executor.execute('true'),
      executor.execute('false'),
    ]);
    for (const r of results) {
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('durationMs는 항상 0 이상', async () => {
    const result = await executor.execute('echo', ['dur-pos']);
    if (result.ok) {
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: 다양한 exit code 검증
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 다양한 exit code 검증', () => {
  it('exit 0 → exitCode 0', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 0']);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('exit 1 → exitCode 1', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 1']);
    if (result.ok) expect(result.value.exitCode).toBe(1);
  });

  it('exit 2 → exitCode 2', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 2']);
    if (result.ok) expect(result.value.exitCode).toBe(2);
  });

  it('exit 3 → exitCode 3', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 3']);
    if (result.ok) expect(result.value.exitCode).toBe(3);
  });

  it('exit 5 → exitCode 5', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 5']);
    if (result.ok) expect(result.value.exitCode).toBe(5);
  });

  it('exit 10 → exitCode 10', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 10']);
    if (result.ok) expect(result.value.exitCode).toBe(10);
  });

  it('exit 50 → exitCode 50', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 50']);
    if (result.ok) expect(result.value.exitCode).toBe(50);
  });

  it('exit 99 → exitCode 99', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 99']);
    if (result.ok) expect(result.value.exitCode).toBe(99);
  });

  it('exit 127 → exitCode 127 (command not found)', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 127']);
    if (result.ok) expect(result.value.exitCode).toBe(127);
  });

  it('exit 200 → exitCode 200', async () => {
    const result = await executor.execute('sh', ['-c', 'exit 200']);
    if (result.ok) expect(result.value.exitCode).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: stdin 다양한 패턴
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - stdin 다양한 패턴', () => {
  it('단일 문자 stdin → cat 출력', async () => {
    const result = await executor.execute('cat', [], { stdin: 'x' });
    if (result.ok) expect(result.value.stdout).toBe('x');
  });

  it('ASCII 제어문자 포함 stdin → cat 처리', async () => {
    const result = await executor.execute('cat', [], { stdin: 'a\tb\tc' });
    if (result.ok) expect(result.value.stdout).toContain('a');
  });

  it('숫자만 있는 stdin → cat 출력', async () => {
    const result = await executor.execute('cat', [], { stdin: '1234567890' });
    if (result.ok) expect(result.value.stdout).toBe('1234567890');
  });

  it('한국어 stdin → cat 출력', async () => {
    const result = await executor.execute('cat', [], { stdin: '안녕하세요' });
    if (result.ok) expect(result.value.stdout).toBe('안녕하세요');
  });

  it('JSON stdin → cat 출력', async () => {
    const json = '{"key":"value"}';
    const result = await executor.execute('cat', [], { stdin: json });
    if (result.ok) expect(result.value.stdout).toBe(json);
  });

  it('여러 줄 stdin 개수 확인 wc -l', async () => {
    const input = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n') + '\n';
    const result = await executor.execute('wc', ['-l'], { stdin: input });
    if (result.ok) {
      const count = Number.parseInt(result.value.stdout.trim(), 10);
      expect(count).toBe(10);
    }
  });

  it('특수문자 stdin → cat 처리', async () => {
    const special = '!@#$%^&*()_+-=[]{}|;:\'",./<>?';
    const result = await executor.execute('cat', [], { stdin: special });
    if (result.ok) expect(result.value.stdout).toBe(special);
  });

  it('이모지 stdin → cat 처리', async () => {
    const emoji = '🚀🎉💻🔥⚡';
    const result = await executor.execute('cat', [], { stdin: emoji });
    if (result.ok) expect(result.value.stdout).toBe(emoji);
  });

  it('CRLF stdin → cat 처리', async () => {
    const crlf = 'line1\r\nline2\r\n';
    const result = await executor.execute('cat', [], { stdin: crlf });
    expect(result.ok).toBe(true);
  });

  it('500자 반복 문자 stdin → cat 일치', async () => {
    const input = 'z'.repeat(500);
    const result = await executor.execute('cat', [], { stdin: input });
    if (result.ok) expect(result.value.stdout).toBe(input);
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: 환경변수 다양한 패턴
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 환경변수 다양한 패턴', () => {
  it('환경변수 값에 공백 포함 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$MY_VAR"'], {
      env: { MY_VAR: 'hello world' },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe('hello world');
  });

  it('환경변수 값에 특수문자 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "%s" "$SPEC"'], {
      env: { SPEC: '!@#$%' },
    });
    if (result.ok) expect(result.value.stdout).toBe('!@#$%');
  });

  it('환경변수 값에 숫자 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$PORT"'], {
      env: { PORT: '8080' },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe('8080');
  });

  it('환경변수 5개 동시 전달 → 모두 확인', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$A$B$C$D$E"'], {
      env: { A: '1', B: '2', C: '3', D: '4', E: '5' },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe('12345');
  });

  it('환경변수 키에 언더스코어 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$MY_LONG_VAR_NAME"'], {
      env: { MY_LONG_VAR_NAME: 'long-value' },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe('long-value');
  });

  it('환경변수 값에 개행 → 셸 처리 결과 확인', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "${MULTI}"'], {
      env: { MULTI: 'line1\nline2' },
    });
    expect(result.ok).toBe(true);
  });

  it('환경변수 값에 PATH 형태 → 정상 전달', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "$MY_PATH"'], {
      env: { MY_PATH: '/usr/local/bin:/usr/bin:/bin' },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  it('환경변수 값에 UUID → 정상 전달', async () => {
    const uuid = crypto.randomUUID();
    const result = await executor.execute('sh', ['-c', 'echo "$UUID_VAL"'], {
      env: { UUID_VAL: uuid },
    });
    if (result.ok) expect(result.value.stdout.trim()).toBe(uuid);
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: 타임아웃 경계값
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 타임아웃 경계값', () => {
  it('timeoutMs=500ms, 빠른 명령 → 성공', async () => {
    const result = await executor.execute('echo', ['fast'], { timeoutMs: 500 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('timeoutMs=200ms, 빠른 명령 → 성공', async () => {
    const result = await executor.execute('true', [], { timeoutMs: 200 });
    expect(result.ok).toBe(true);
  });

  it('timeoutMs=50ms, sleep 2 → process_timeout', async () => {
    const result = await executor.execute('sleep', ['2'], { timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('process_timeout');
  });

  it('timeoutMs=100ms, sleep 3 → process_timeout', async () => {
    const result = await executor.execute('sleep', ['3'], { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('process_timeout');
  });

  it('timeoutMs=150ms, sleep 2 → process_timeout', async () => {
    const result = await executor.execute('sleep', ['2'], { timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('process_timeout');
  });

  it('타임아웃 없음 (기본값) + 빠른 명령 → 성공', async () => {
    const result = await executor.execute('echo', ['default-timeout']);
    expect(result.ok).toBe(true);
  });

  it('timeoutMs=1000ms, echo → 성공', async () => {
    const result = await executor.execute('echo', ['1s-timeout'], { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('1s-timeout');
  });

  it('timeoutMs=2000ms, true → 성공', async () => {
    const result = await executor.execute('true', [], { timeoutMs: 2000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('타임아웃 후 error.message에 타임아웃 언급', async () => {
    const result = await executor.execute('sleep', ['5'], { timeoutMs: 50 });
    if (!result.ok) {
      expect(result.error.message).toContain('타임아웃');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: sh 파이프라인 및 복합 명령
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - sh 파이프라인 및 복합 명령', () => {
  it('echo | cat → stdout 일치', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "piped" | cat']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('piped');
  });

  it('echo | wc -c → 바이트 수 확인', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "hello" | wc -c']);
    if (result.ok) {
      const count = Number.parseInt(result.value.stdout.trim(), 10);
      expect(count).toBe(5);
    }
  });

  it('두 echo 파이프 → 두 번째 echo 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "a" | echo "b"']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('b');
  });

  it('seq 명령으로 숫자 시퀀스 → 각 숫자 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'seq 1 5']);
    if (result.ok) {
      const lines = result.value.stdout.trim().split('\n');
      expect(lines.length).toBe(5);
    }
  });

  it('head -1 파이프 → 첫 줄만 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "line1\\nline2\\nline3" | head -1']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('line1');
  });

  it('tail -1 파이프 → 마지막 줄만 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "line1\\nline2\\nline3" | tail -1']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('line3');
  });

  it('sort 파이프 → 정렬 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "c\\na\\nb" | sort']);
    if (result.ok) {
      const lines = result.value.stdout.trim().split('\n');
      expect(lines[0]).toBe('a');
    }
  });

  it('grep 파이프 → 패턴 일치 출력', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "apple\\nbanana\\napricot" | grep "^a"']);
    if (result.ok) {
      expect(result.value.stdout).toContain('apple');
      expect(result.value.stdout).not.toContain('banana');
    }
  });

  it('wc -w → 단어 수 계산', async () => {
    const result = await executor.execute('sh', ['-c', 'echo "one two three four five" | wc -w']);
    if (result.ok) {
      const count = Number.parseInt(result.value.stdout.trim(), 10);
      expect(count).toBe(5);
    }
  });

  it('uniq 파이프 → 중복 제거', async () => {
    const result = await executor.execute('sh', ['-c', 'printf "a\\na\\nb\\nb\\nc" | uniq']);
    if (result.ok) {
      const lines = result.value.stdout.trim().split('\n');
      expect(lines).toEqual(['a', 'b', 'c']);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 추가 edge: 인수 경계값 및 특수 패턴
// ══════════════════════════════════════════════════════════════════

describe('ProcessExecutor - 인수 경계값 및 특수 패턴', () => {
  it('단일 공백 인수 → echo 공백 출력', async () => {
    const result = await executor.execute('echo', [' ']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stdout.trim()).toBe('');
  });

  it('빈 문자열 인수 → echo 처리', async () => {
    const result = await executor.execute('echo', ['']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('숫자 인수 → echo 출력', async () => {
    const result = await executor.execute('echo', ['0', '1', '999']);
    if (result.ok) {
      expect(result.value.stdout).toContain('0');
      expect(result.value.stdout).toContain('999');
    }
  });

  it('점 인수 → echo 출력', async () => {
    const result = await executor.execute('echo', ['.', '..', '...']);
    if (result.ok) expect(result.value.exitCode).toBe(0);
  });

  it('슬래시 인수 → echo 출력', async () => {
    const result = await executor.execute('echo', ['/']);
    if (result.ok) expect(result.value.stdout.trim()).toBe('/');
  });

  it('백슬래시 인수 → echo 출력', async () => {
    const result = await executor.execute('echo', ['\\']);
    expect(result.ok).toBe(true);
  });

  it('단일 따옴표 인수 → echo 처리', async () => {
    const result = await executor.execute('echo', ["it's"]);
    // Windows cmd strips single quotes; just verify execution succeeds
    expect(result.ok).toBe(true);
  });

  it('앰퍼샌드 인수 → echo 처리', async () => {
    const result = await executor.execute('echo', ['a&b']);
    expect(result.ok).toBe(true);
  });

  it('파이프 기호 인수 → echo 처리', async () => {
    const result = await executor.execute('echo', ['a|b']);
    expect(result.ok).toBe(true);
  });

  it('세미콜론 인수 → echo 처리', async () => {
    const result = await executor.execute('echo', ['a;b']);
    if (result.ok) expect(result.value.stdout).toContain('a;b');
  });
});
