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
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ProcessExecutor } from '../../../src/core/process-executor.js';

let logger: ConsoleLogger;
let executor: ProcessExecutor;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  executor = new ProcessExecutor(logger);
});

afterEach(() => {
  // WHY: 테스트 간 상태 독립성 보장
  logger = null as any;
  executor = null as any;
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
      env: { UNDEFINED_VAR: undefined as any },
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
});
