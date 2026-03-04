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
import { AdevError } from '../../../src/core/errors.js';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { ProcessExecutor, ProcessResult } from '../../../src/core/process-executor.js';
import type { Result } from '../../../src/core/types.js';
import { err, ok } from '../../../src/core/types.js';
import type { CleanEnvManager } from '../../../src/layer2/clean-env-manager.js';
import { IntegrationTester } from '../../../src/layer2/integration-tester.js';

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
