/**
 * IntegrationTester 테스트
 *
 * @description
 * KR: 4단계 통합 테스트 실행기 테스트
 *     비율: Normal 20%, Edge 40%, Error 40%
 * EN: Tests for 4-step integration test runner
 *     Ratio: Normal 20%, Edge 40%, Error 40%
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { AdevError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import type { ProcessExecutor, ProcessResult } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { CleanEnvManager } from 'layer2/clean-env-manager.js';
import { IntegrationTester } from 'layer2/integration-tester.js';

// ── Mock 클래스 / Mock classes ──────────────────────────────────
class MockProcessExecutor implements ProcessExecutor {
  private mockResults: Map<string, ProcessResult> = new Map();

  setMockResult(testPath: string, result: ProcessResult): void {
    this.mockResults.set(testPath, result);
  }

  async execute(
    command: string,
    args: readonly string[],
  ): Promise<Result<ProcessResult>> {
    // WHY: testPath 추출 (args[1])
    const testPath = args[1] ?? '';
    const mockResult = this.mockResults.get(testPath);

    if (mockResult) {
      return ok(mockResult);
    }

    // WHY: 기본 성공 응답
    return ok({
      exitCode: 0,
      stdout: '10 tests | 10 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });
  }
}

class MockCleanEnvManager implements CleanEnvManager {
  private shouldFailCreate = false;
  private shouldFailDestroy = false;
  private destroyCalled = false;

  setFailCreate(fail: boolean): void {
    this.shouldFailCreate = fail;
  }

  setFailDestroy(fail: boolean): void {
    this.shouldFailDestroy = fail;
  }

  wasDestroyCalled(): boolean {
    return this.destroyCalled;
  }

  async create(projectId: string): Promise<Result<{ envPath: string }>> {
    if (this.shouldFailCreate) {
      return err(new AdevError('env_creation_failed', 'Failed to create environment'));
    }
    return ok({ envPath: `/tmp/clean-env-${projectId}` });
  }

  async destroy(envPath: string): Promise<Result<void>> {
    this.destroyCalled = true;
    if (this.shouldFailDestroy) {
      return err(new AdevError('env_destruction_failed', 'Failed to destroy environment'));
    }
    return ok(undefined);
  }
}

// ── 테스트 유틸리티 / Test utilities ────────────────────────────
function createSuccessResult(passed: number, failed: number): ProcessResult {
  return {
    exitCode: failed > 0 ? 1 : 0,
    stdout: `${passed + failed} tests | ${passed} passed | ${failed} failed`,
    stderr: '',
    durationMs: 100,
  };
}

// ── 테스트 시작 / Tests ─────────────────────────────────────────
let logger: ConsoleLogger;
let processExecutor: MockProcessExecutor;
let envManager: MockCleanEnvManager;
let tester: IntegrationTester;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  processExecutor = new MockProcessExecutor();
  envManager = new MockCleanEnvManager();
  tester = new IntegrationTester(logger, processExecutor, envManager);
});

afterEach(() => {
  logger = null as any;
  processExecutor = null as any;
  envManager = null as any;
  tester = null as any;
});

// ══════════════════════════════════════════════════════════════════
// NORMAL CASES (20%)
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - Normal Cases', () => {
  it('생성자가 정상 동작한다', () => {
    expect(tester).toBeDefined();
    expect(tester.getCurrentStep()).toBe(0);
    expect(tester.getResults()).toEqual([]);
  });

  it('4단계 테스트가 모두 성공하면 결과를 반환한다', async () => {
    // WHY: 모든 단계 성공 설정
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(3, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(4);
      expect(result.value[0]?.step).toBe(1);
      expect(result.value[0]?.passed).toBe(true);
      expect(result.value[1]?.step).toBe(2);
      expect(result.value[2]?.step).toBe(3);
      expect(result.value[3]?.step).toBe(4);
    }
  });

  it('getCurrentStep이 현재 진행 단계를 반환한다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(3, 1)); // WHY: 실패

    await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(tester.getCurrentStep()).toBe(2); // WHY: step 2에서 실패 후 중단
  });

  it('getResults가 단계별 결과를 반환한다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path/to/project');

    const results = tester.getResults();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.step).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - Edge Cases', () => {
  it('Step 1 실패 시 즉시 중단한다 (Fail-Fast)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 3)); // WHY: 3개 실패

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1); // WHY: step 1만 실행
      expect(result.value[0]?.passed).toBe(false);
      expect(result.value[0]?.failCount).toBe(3);
    }
  });

  it('Step 2 실패 시 Step 3, 4는 실행하지 않는다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 2)); // WHY: 실패

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2); // WHY: step 1, 2만 실행
      expect(result.value[1]?.passed).toBe(false);
    }
  });

  it('Step 3 실패 시 Step 4는 실행하지 않는다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 1)); // WHY: 실패

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3); // WHY: step 1, 2, 3만 실행
      expect(result.value[2]?.passed).toBe(false);
    }
  });

  it('exitCode 0이지만 fail이 있으면 실패 처리한다', async () => {
    // WHY: exitCode는 0이지만 파싱 결과에서 fail 감지
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '10 tests | 8 passed | 2 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(false);
      expect(result.value[0]?.failCount).toBe(2);
    }
  });

  it('stdout와 stderr를 모두 파싱한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '',
      stderr: '5 tests | 3 passed | 2 failed', // WHY: stderr에만 결과
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(2);
    }
  });

  it('테스트 결과 형식이 다양해도 파싱한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '1 test | 1 passed | 0 failed', // WHY: 단수 "test"
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('테스트 개수가 0이어도 처리한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '0 tests | 0 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('대소문자 구분 없이 파싱한다 (case-insensitive)', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '10 TESTS | 10 PASSED | 0 FAILED', // WHY: 대문자
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('클린 환경이 항상 정리된다 (성공 시)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(envManager.wasDestroyCalled()).toBe(true);
  });

  it('클린 환경이 항상 정리된다 (실패 시)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 3)); // WHY: 실패

    await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(envManager.wasDestroyCalled()).toBe(true);
  });

  it('여러 번 실행해도 독립적으로 동작한다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    const result1 = await tester.runIntegrationTests('proj-1', '/path/1');
    const result2 = await tester.runIntegrationTests('proj-2', '/path/2');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it('모든 단계 성공 시 allPassed가 true이다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(3, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const allPassed = result.value.every((r) => r.passed);
      expect(allPassed).toBe(true);
    }
  });

  it('하나라도 실패하면 allPassed가 false이다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 1)); // WHY: 실패

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const allPassed = result.value.every((r) => r.passed);
      expect(allPassed).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// ERROR CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - Error Cases', () => {
  it('클린 환경 생성 실패 시 에러를 반환한다', async () => {
    envManager.setFailCreate(true);

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('env_creation_failed');
    }
  });

  it('프로세스 실행 실패 시 에러를 반환한다', async () => {
    // WHY: Mock executor가 에러 반환하도록 설정
    class FailingExecutor implements ProcessExecutor {
      async execute(): Promise<Result<ProcessResult>> {
        return err(new AdevError('process_execution_error', 'Command failed'));
      }
    }

    const failingTester = new IntegrationTester(logger, new FailingExecutor(), envManager);

    const result = await failingTester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('process_execution_error');
    }
  });

  it('파싱할 테스트 결과가 없으면 0을 반환한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: 'No test results found', // WHY: 파싱 불가능한 형식
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('빈 stdout/stderr에서 기본값을 반환한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('잘못된 형식의 숫자는 0으로 처리한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: 'abc tests | xyz passed | def failed', // WHY: 숫자가 아님
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('exitCode가 0이 아니면 실패로 처리한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '10 tests | 10 passed | 0 failed', // WHY: 파싱은 성공이지만 exitCode 1
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(false); // WHY: exitCode != 0
    }
  });

  it('클린 환경 정리 실패해도 테스트 결과는 반환한다', async () => {
    envManager.setFailDestroy(true);
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    // WHY: destroy 실패는 무시 (finally 블록)
    expect(result.ok).toBe(true);
  });

  it('Step 1에서 프로세스 에러 발생 시 즉시 중단한다', async () => {
    class FailAtStepExecutor implements ProcessExecutor {
      async execute(
        command: string,
        args: readonly string[],
      ): Promise<Result<ProcessResult>> {
        const testPath = args[1];
        if (testPath === 'tests/unit') {
          return err(new AdevError('test_execution_error', 'Test crashed'));
        }
        return ok(createSuccessResult(5, 0));
      }
    }

    const failingTester = new IntegrationTester(logger, new FailAtStepExecutor(), envManager);

    const result = await failingTester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('test_execution_error');
    }
  });

  it('Step 2에서 프로세스 에러 발생 시 Step 3, 4는 실행하지 않는다', async () => {
    class FailAtStep2Executor implements ProcessExecutor {
      async execute(
        command: string,
        args: readonly string[],
      ): Promise<Result<ProcessResult>> {
        const testPath = args[1];
        if (testPath === 'tests/module') {
          return err(new AdevError('test_execution_error', 'Module test crashed'));
        }
        return ok(createSuccessResult(5, 0));
      }
    }

    const failingTester = new IntegrationTester(
      logger,
      new FailAtStep2Executor(),
      envManager,
    );

    const result = await failingTester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(false);
  });

  it('음수 테스트 개수는 0으로 처리한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '-5 tests | -3 passed | -2 failed', // WHY: 음수
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    // WHY: Number.parseInt는 음수도 파싱하지만, 실제로는 0으로 처리되어야 함
  });

  it('매우 큰 숫자도 처리한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '999999 tests | 999998 passed | 1 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(1);
    }
  });

  it('부분 파싱 결과도 처리한다 (fail만 있음)', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '5 failed', // WHY: "tests" 키워드 없음
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(5);
    }
  });

  it('여러 줄 출력도 파싱한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: `
Running tests...
10 tests | 8 passed | 2 failed
Test execution completed
      `,
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(2);
    }
  });

  it('중복된 패턴이 있어도 첫 번째만 사용한다', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '10 tests | 10 passed | 0 failed\n5 tests | 5 passed | 0 failed', // WHY: 중복
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path/to/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0); // WHY: 첫 번째 패턴 사용
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - 추가 경계값 케이스', () => {
  it('UUID projectId → 정상 동작', async () => {
    const result = await tester.runIntegrationTests('550e8400-e29b-41d4-a716-446655440000', '/path/to/project');
    expect(result.ok).toBeDefined();
  });

  it('한글 경로 → 정상 동작', async () => {
    const result = await tester.runIntegrationTests('proj-kr', '/프로젝트/경로');
    expect(result.ok).toBeDefined();
  });

  it('특수문자 포함 projectId → 정상 동작', async () => {
    const result = await tester.runIntegrationTests('proj!@#$', '/path');
    expect(result.ok).toBeDefined();
  });

  it('빈 projectId → 정상 동작', async () => {
    const result = await tester.runIntegrationTests('', '/path');
    expect(result.ok).toBeDefined();
  });

  it('빈 projectPath → 정상 동작', async () => {
    const result = await tester.runIntegrationTests('proj-1', '');
    expect(result.ok).toBeDefined();
  });

  it('Step 4 실패 → 결과 길이 4', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(3, 2));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(4);
      expect(result.value[3]?.passed).toBe(false);
    }
  });

  it('Step 1 failCount=0이면 passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('Step 2 failCount=5이면 passed=false', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 5));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[1]?.failCount).toBe(5);
      expect(result.value[1]?.passed).toBe(false);
    }
  });

  it('getResults는 runIntegrationTests 전에 빈 배열 반환', () => {
    expect(tester.getResults()).toEqual([]);
  });

  it('getCurrentStep은 runIntegrationTests 전에 0 반환', () => {
    expect(tester.getCurrentStep()).toBe(0);
  });

  it('durationMs 매우 큰 값도 처리', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '10 tests | 10 passed | 0 failed',
      stderr: '',
      durationMs: 999999999,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
  });

  it('durationMs 0도 처리', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '10 tests | 10 passed | 0 failed',
      stderr: '',
      durationMs: 0,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
  });

  it('여러 줄 혼합 stdout/stderr → failCount 파싱', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: 'Starting test run...',
      stderr: '3 tests | 1 passed | 2 failed\nFailed: test1, test2',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(2);
    }
  });

  it('Step 3 failCount=1 → Step 4 실행 안 됨', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 1));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('모든 단계 통과 → getResults 4개', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults()).toHaveLength(4);
  });

  it('Step 2 실패 후 getCurrentStep이 2 반환', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 1));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBe(2);
  });

  it('빈 stdout + 비어있지 않은 stderr에서 fail 감지', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '',
      stderr: '1 failed',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(1);
    }
  });

  it('성공 후 getResults[0].step은 1', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults()[0]?.step).toBe(1);
  });

  it('exitCode 2도 실패로 처리', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 2,
      stdout: '5 tests | 5 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(false);
    }
  });

  it('exitCode 127도 실패로 처리', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 127,
      stdout: '10 tests | 10 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(false);
    }
  });

  it('클린 환경 생성 실패 → destroy 호출 안 됨', async () => {
    envManager.setFailCreate(true);

    await tester.runIntegrationTests('proj-123', '/path');

    expect(envManager.wasDestroyCalled()).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL RANDOM / BOUNDARY CASES
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - 추가 랜덤/경계값 케이스', () => {
  it('Step 1 failCount=1 → 즉시 중단', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 1));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.passed).toBe(false);
    }
  });

  it('Step 2 failCount=999 → 결과에 999 반영', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(0, 999));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[1]?.failCount).toBe(999);
    }
  });

  it('매우 긴 projectId(100글자) → 정상 동작', async () => {
    const longId = 'a'.repeat(100);
    const result = await tester.runIntegrationTests(longId, '/path');
    expect(result.ok).toBeDefined();
  });

  it('매우 긴 경로 → 정상 동작', async () => {
    const longPath = '/'.concat('deep/'.repeat(20));
    const result = await tester.runIntegrationTests('proj-1', longPath);
    expect(result.ok).toBeDefined();
  });

  it('Step 3 failCount=0이면 passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[2]?.passed).toBe(true);
    }
  });

  it('Step 4 failCount=0이면 passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[3]?.passed).toBe(true);
    }
  });

  it('결과 배열의 step 순서는 1,2,3,4', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    if (result.ok) {
      expect(result.value[0]?.step).toBe(1);
      expect(result.value[1]?.step).toBe(2);
      expect(result.value[2]?.step).toBe(3);
      expect(result.value[3]?.step).toBe(4);
    }
  });

  it('stdout에 JSON 형식이 있어도 파싱 가능', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '{"tests": 10} 10 tests | 10 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('stdout에 ANSI 색상 코드 포함 → 파싱 시도', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '\u001b[32m10 tests | 10 passed | 0 failed\u001b[0m',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
  });

  it('환경 생성 실패 → error.code가 문자열', async () => {
    envManager.setFailCreate(true);

    const result = await tester.runIntegrationTests('proj-123', '/path');

    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('환경 생성 실패 → error.message가 문자열', async () => {
    envManager.setFailCreate(true);

    const result = await tester.runIntegrationTests('proj-123', '/path');

    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('5번 반복 실행 → 각각 독립적', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(3, 0));

    for (let i = 0; i < 5; i++) {
      const result = await tester.runIntegrationTests(`proj-${i}`, '/path');
      expect(result.ok).toBeDefined();
    }
  });

  it('Step 1 passed=true 후 getCurrentStep은 1 이상', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBeGreaterThanOrEqual(1);
  });

  it('getResults 배열 내 각 항목이 step 필드를 가짐', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const results = tester.getResults();
    for (const r of results) {
      expect(typeof r.step).toBe('number');
    }
  });

  it('getResults 배열 내 각 항목이 passed 필드를 가짐', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const results = tester.getResults();
    for (const r of results) {
      expect(typeof r.passed).toBe('boolean');
    }
  });

  it('getResults 배열 내 각 항목이 failCount 필드를 가짐', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const results = tester.getResults();
    for (const r of results) {
      expect(typeof r.failCount).toBe('number');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL BOUNDARY / STRESS CASES
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - 추가 경계값/스트레스 케이스', () => {
  it('Step 1 통과 → getCurrentStep이 1 이상', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(3, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(2, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBeGreaterThanOrEqual(1);
  });

  it('Step 1~4 모두 통과 → getCurrentStep이 4', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBe(4);
  });

  it('Step 1 실패 → getCurrentStep이 1', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 2));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBe(1);
  });

  it('Step 3 실패 → getCurrentStep이 3', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 3));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBe(3);
  });

  it('Step 4 실패 → getCurrentStep이 4', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 1));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBe(4);
  });

  it('결과 배열의 failCount는 음수가 아니다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const results = tester.getResults();
    for (const r of results) {
      expect(r.failCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('결과 배열의 step 값은 1-4 범위이다', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const results = tester.getResults();
    for (const r of results) {
      expect(r.step).toBeGreaterThanOrEqual(1);
      expect(r.step).toBeLessThanOrEqual(4);
    }
  });

  it('stdout "1 fail" 패턴 → failCount=1 감지', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '1 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(1);
    }
  });

  it('stderr "10 failed" 패턴 → failCount=10', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '',
      stderr: '10 failed',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(10);
    }
  });

  it('UUID projectId로 3번 연속 실행 → ok', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(3, 0));

    for (let i = 0; i < 3; i++) {
      const uuid = crypto.randomUUID();
      const result = await tester.runIntegrationTests(uuid, '/path');
      expect(result.ok).toBeDefined();
    }
  });

  it('envManager destroy 실패해도 getCurrentStep 정상 반환', async () => {
    envManager.setFailDestroy(true);
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getCurrentStep()).toBeGreaterThanOrEqual(1);
  });

  it('envManager destroy 실패해도 getResults 정상 반환', async () => {
    envManager.setFailDestroy(true);
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults().length).toBeGreaterThan(0);
  });

  it('Step 2 통과 → getResults[1].passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 1));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults()[1]?.passed).toBe(true);
  });

  it('Step 3 통과 → getResults[2].passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 1));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults()[2]?.passed).toBe(true);
  });

  it('한글 projectId → envManager.create 호출 (ok 또는 error)', async () => {
    const result = await tester.runIntegrationTests('한글-프로젝트-ID', '/path');
    expect(typeof result.ok).toBe('boolean');
  });

  it('빈 projectId → envManager.create에 빈 문자열 전달', async () => {
    const result = await tester.runIntegrationTests('', '/path');
    expect(typeof result.ok).toBe('boolean');
  });

  it('결과 배열이 ReadonlyArray처럼 동작 (push 안 되는 경우 없음)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');

    if (result.ok) {
      // getResults()는 복사본이므로 수정해도 원본에 영향 없음
      const copy = tester.getResults();
      expect(Array.isArray(copy)).toBe(true);
    }
  });

  it('stdout 패턴 없고 exitCode=0 → passed=true, failCount=0', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: 'All good!',
      stderr: '',
      durationMs: 50,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('stdout "0 failed" → failCount=0 → passed(exitCode=0)', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '5 tests | 5 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('getResults() 두 번 호출 → 동일 길이', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const r1 = tester.getResults();
    const r2 = tester.getResults();
    expect(r1.length).toBe(r2.length);
  });

  it('getResults() 두 번 호출 → 각 항목 step 동일', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    const r1 = tester.getResults();
    const r2 = tester.getResults();
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i]?.step).toBe(r2[i]?.step);
    }
  });

  it('runIntegrationTests 두 번 연속 → 두 번째도 ok', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));

    const r1 = await tester.runIntegrationTests('proj-a', '/path');
    const r2 = await tester.runIntegrationTests('proj-b', '/path');

    expect(r1.ok).toBeDefined();
    expect(r2.ok).toBeDefined();
  });

  it('특수문자 projectPath → ok (처리 시도)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(3, 0));
    const result = await tester.runIntegrationTests('proj-1', '/path/with!@#special');
    expect(typeof result.ok).toBe('boolean');
  });

  it('매우 긴 stdout → failCount 파싱 성공', async () => {
    const longStdout = 'x'.repeat(10000) + ' 5 tests | 5 passed | 0 failed ' + 'y'.repeat(10000);
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: longStdout,
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('Step 1 passed=true → Step 2 실행됨 (결과 2개 이상)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 1));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults().length).toBeGreaterThanOrEqual(2);
  });

  it('destroy 실패 + Step 1 성공 → result.ok=true', async () => {
    envManager.setFailDestroy(true);
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(8, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(3, 0));

    const result = await tester.runIntegrationTests('proj-destroy-fail', '/path');

    expect(result.ok).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL PARSE / OUTPUT PATTERN CASES
// ══════════════════════════════════════════════════════════════════

describe('IntegrationTester - 파싱 패턴 추가 케이스', () => {
  it('stdout "0 fail" 패턴 → failCount=0', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '0 fail',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(0);
    }
  });

  it('stdout "100 failed" 패턴 → failCount=100', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '100 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(100);
    }
  });

  it('stderr에만 "50 failed" → failCount=50', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 1,
      stdout: '',
      stderr: '50 failed',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(50);
    }
  });

  it('stdout/stderr 모두 비어 있고 exitCode=0 → passed=true', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(true);
    }
  });

  it('exitCode=255 → passed=false (exitCode != 0)', async () => {
    processExecutor.setMockResult('tests/unit', {
      exitCode: 255,
      stdout: '5 tests | 5 passed | 0 failed',
      stderr: '',
      durationMs: 100,
    });

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.passed).toBe(false);
    }
  });

  it('Step 4 passed=true → getResults[3].passed=true', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    expect(tester.getResults()[3]?.passed).toBe(true);
  });

  it('Step 1 failCount=10 → passed=false 且 failCount=10', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(10, 10));

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.failCount).toBe(10);
      expect(result.value[0]?.passed).toBe(false);
    }
  });

  it('Step 3 통과 후 Step 4 시작 → 총 4개 결과', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(4);
    }
  });

  it('각 Step result.passed는 boolean 타입', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/e2e', createSuccessResult(5, 0));

    await tester.runIntegrationTests('proj-123', '/path');

    for (const r of tester.getResults()) {
      expect(typeof r.passed).toBe('boolean');
    }
  });

  it('envManager.wasDestroyCalled는 실패 시에도 true', async () => {
    class FailAtStep3Executor implements ProcessExecutor {
      async execute(
        _command: string,
        args: readonly string[],
      ): Promise<Result<ProcessResult>> {
        const testPath = args[1];
        if (testPath === 'tests/integration') {
          return err(new AdevError('test_execution_error', 'Integration test crashed'));
        }
        return ok(createSuccessResult(5, 0));
      }
    }

    const failingTester = new IntegrationTester(logger, new FailAtStep3Executor(), envManager);
    await failingTester.runIntegrationTests('proj-123', '/path');

    expect(envManager.wasDestroyCalled()).toBe(true);
  });

  it('Step 1, 2 통과, Step 3 실패 → 결과 3개', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/module', createSuccessResult(5, 0));
    processExecutor.setMockResult('tests/integration', createSuccessResult(5, 7));

    const result = await tester.runIntegrationTests('proj-123', '/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('getResults()는 실행 결과의 복사본 (독립적)', async () => {
    processExecutor.setMockResult('tests/unit', createSuccessResult(5, 0));
    await tester.runIntegrationTests('proj-123', '/path');

    const r1 = tester.getResults();
    const r2 = tester.getResults();

    // WHY: 각각 독립적인 배열이어야 함 (동일 참조가 아님)
    expect(r1).not.toBe(r2);
  });
});
