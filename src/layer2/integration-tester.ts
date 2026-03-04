/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 통합 테스트를 실행한다.
 *     Step 1: 기능별 E2E (unit tests)
 *     Step 2: 관련 기능 회귀 (module tests)
 *     Step 3: 비관련 기능 스모크 (integration tests)
 *     Step 4: 전체 통합 E2E (e2e tests)
 *     Fail-Fast: 1개 실패 시 즉시 중단.
 * EN: Runs 4-step integration tests.
 *     Fail-Fast: stops immediately on first failure.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { ProcessExecutor } from '../core/process-executor.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { CleanEnvManager } from './clean-env-manager.js';
import type { IntegrationStepResult } from './types.js';

/**
 * 유효한 통합 테스트 단계 / Valid integration test steps
 */
type IntegrationStep = 1 | 2 | 3 | 4;

/**
 * 테스트 단계 정보 / Test step information
 */
interface TestStepConfig {
  readonly step: IntegrationStep;
  readonly name: string;
  readonly testPath: string;
  readonly description: string;
}

/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 통합 테스트를 순차적으로 실행한다.
 *     각 단계는 이전 단계 통과 후에만 진행한다.
 * EN: Runs 4-step integration tests sequentially.
 *     Each step proceeds only after the previous step passes.
 *
 * @example
 * const tester = new IntegrationTester(logger, processExecutor, envManager);
 * const result = await tester.runIntegrationTests('my-project', '/path/to/project');
 * if (result.ok) console.log('All tests passed');
 */
export class IntegrationTester {
  private readonly results: IntegrationStepResult[] = [];
  private currentStep = 0;
  private readonly logger: Logger;
  private readonly processExecutor: ProcessExecutor;
  private readonly envManager: CleanEnvManager;

  /**
   * 테스트 단계 설정 / Test step configurations
   */
  private readonly stepConfigs: readonly TestStepConfig[] = [
    { step: 1, name: 'unit', testPath: 'tests/unit', description: '기능별 E2E' },
    { step: 2, name: 'module', testPath: 'tests/module', description: '관련 기능 회귀' },
    {
      step: 3,
      name: 'integration',
      testPath: 'tests/integration',
      description: '비관련 기능 스모크',
    },
    { step: 4, name: 'e2e', testPath: 'tests/e2e', description: '전체 통합 E2E' },
  ];

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   * @param processExecutor - 프로세스 실행기 / Process executor
   * @param envManager - 클린 환경 관리자 / Clean environment manager
   */
  constructor(logger: Logger, processExecutor: ProcessExecutor, envManager: CleanEnvManager) {
    this.logger = logger.child({ module: 'integration-tester' });
    this.processExecutor = processExecutor;
    this.envManager = envManager;
  }

  /**
   * 통합 테스트를 4단계로 실행한다 / Runs 4-step integration tests
   *
   * @description
   * KR: Fail-Fast 원칙에 따라 4단계 통합 테스트를 순차 실행한다.
   *     각 단계는 이전 단계가 통과해야만 진행한다.
   *     1개 실패 시 즉시 중단하고 실패 결과를 반환한다.
   * EN: Runs 4-step integration tests following Fail-Fast principle.
   *     Each step proceeds only after previous step passes.
   *     Stops immediately on first failure and returns failure result.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 통합 테스트 결과 / Integration test results
   */
  async runIntegrationTests(
    projectId: string,
    projectPath: string,
  ): Promise<Result<readonly IntegrationStepResult[]>> {
    this.logger.info('통합 테스트 시작', { projectId, projectPath });

    // WHY: 클린 환경 생성 (테스트 격리)
    const envResult = await this.envManager.create(projectId);
    if (!envResult.ok) {
      return err(envResult.error);
    }

    const { envPath } = envResult.value;

    try {
      // WHY: 4단계 순차 실행 (Fail-Fast)
      for (const config of this.stepConfigs) {
        const stepResult = await this.runStep(config, projectPath);

        if (!stepResult.ok) {
          return err(stepResult.error);
        }

        // WHY: 실패 시 즉시 중단 (Fail-Fast)
        if (!stepResult.value.passed) {
          this.logger.warn('통합 테스트 실패 - 즉시 중단', {
            step: config.step,
            failCount: stepResult.value.failCount,
          });
          break;
        }
      }

      this.logger.info('통합 테스트 완료', {
        projectId,
        totalSteps: this.results.length,
        allPassed: this.results.every((r) => r.passed),
      });

      return ok(this.results);
    } finally {
      // WHY: 항상 클린 환경 정리
      await this.envManager.destroy(envPath);
    }
  }

  /**
   * 통합 테스트 단계를 실행한다 / Runs an integration test step
   *
   * @description
   * KR: 지정된 단계의 통합 테스트를 실행한다.
   *     ProcessExecutor로 `bun test` 실행 후 결과를 파싱한다.
   * EN: Runs the specified integration test step.
   *     Executes `bun test` via ProcessExecutor and parses results.
   *
   * @param config - 테스트 단계 설정 / Test step configuration
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 단계 실행 결과 / Step execution result
   */
  private async runStep(
    config: TestStepConfig,
    projectPath: string,
  ): Promise<Result<IntegrationStepResult>> {
    this.logger.info('테스트 단계 시작', {
      step: config.step,
      name: config.name,
      description: config.description,
    });

    // WHY: bun test 실행 (지정된 경로만)
    const testResult = await this.processExecutor.execute('bun', ['test', config.testPath], {
      cwd: projectPath,
      timeoutMs: 300_000, // WHY: 테스트는 5분 타임아웃
    });

    if (!testResult.ok) {
      return err(testResult.error);
    }

    const { exitCode, stdout, stderr } = testResult.value;

    // WHY: 테스트 결과 파싱
    const parseResult = this.parseTestResult(stdout, stderr);
    const passed = exitCode === 0 && parseResult.failCount === 0;

    const stepResult: IntegrationStepResult = {
      step: config.step,
      passed,
      failCount: parseResult.failCount,
    };

    this.results.push(stepResult);
    this.currentStep = config.step;

    this.logger.info('테스트 단계 완료', {
      step: config.step,
      name: config.name,
      passed,
      failCount: parseResult.failCount,
      totalTests: parseResult.totalTests,
    });

    return ok(stepResult);
  }

  /**
   * Bun 테스트 출력을 파싱한다 / Parses Bun test output
   *
   * @description
   * KR: stdout/stderr에서 테스트 결과를 추출한다.
   *     Bun 테스트 출력 형식: "X tests | Y passed | Z failed"
   * EN: Extracts test results from stdout/stderr.
   *     Bun test output format: "X tests | Y passed | Z failed"
   *
   * @param stdout - 표준 출력 / Standard output
   * @param stderr - 표준 에러 / Standard error
   * @returns 파싱된 결과 / Parsed result
   */
  private parseTestResult(
    stdout: string,
    stderr: string,
  ): { totalTests: number; failCount: number } {
    const output = stdout + stderr;

    // WHY: Bun 테스트 출력 패턴 매칭
    // 예: "10 tests | 8 passed | 2 failed"
    const testCountMatch = /(\d+)\s+tests?/i.exec(output);
    const failCountMatch = /(\d+)\s+failed/i.exec(output);

    const totalTests = testCountMatch?.[1] ? Number.parseInt(testCountMatch[1], 10) : 0;
    const failCount = failCountMatch?.[1] ? Number.parseInt(failCountMatch[1], 10) : 0;

    return { totalTests, failCount };
  }

  /**
   * 현재 진행 중인 단계를 반환한다 / Returns current step
   *
   * @returns 현재 단계 번호 (0이면 미시작) / Current step number (0 if not started)
   */
  getCurrentStep(): number {
    return this.currentStep;
  }

  /**
   * 전체 결과를 반환한다 / Returns all results
   *
   * @returns 단계별 결과 배열 / Step results array
   */
  getResults(): IntegrationStepResult[] {
    return [...this.results];
  }
}
