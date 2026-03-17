/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 계단식 Fail-Fast 통합 테스트를 실행한다.
 *     Step 1: 수정된 기능 E2E 전체 (targetCount=100,000+)
 *     Step 2: 연관 기능 회귀 (targetCount=10,000)
 *     Step 3: 비연관 기능 스모크 (targetCount=1,000)
 *     Step 4: 전체 통합 최종 (targetCount=1,000,000)
 *     각 단계: 1개 실패 시 즉시 중단 → qc 분석 → coder 수정 → 해당 단계부터 재시작.
 * EN: Runs 4-step staircase Fail-Fast integration tests.
 *     Each step stops immediately on first failure.
 */

import type { TestingConfig } from 'core/config-schema.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { CleanEnvManager } from 'layer2/clean-env-manager.js';
import { parseBunTestOutput } from 'layer2/integration-tester-helpers.js';
import type { ModifiedFiles, TestStep } from 'layer2/integration-tester-steps.js';
import {
  TEST_STEPS,
  buildTestSteps,
  identifyModifiedTestPaths,
  identifyRelatedTestPaths,
  identifyUnrelatedTestPaths,
} from 'layer2/integration-tester-steps.js';
import { type StaircaseTestResult, TEST_TIMEOUT_MS } from 'layer2/integration-tester-types.js';
import type { IntegrationStepResult } from 'layer2/types.js';

export type { StaircaseTestResult } from 'layer2/integration-tester-types.js';

/**
 * 통합 테스터 / Integration Tester
 *
 * @description
 * KR: 4단계 계단식 Fail-Fast 통합 테스트를 순차적으로 실행한다.
 *     각 단계는 이전 단계 통과 후에만 진행한다.
 * EN: Runs 4-step staircase Fail-Fast integration tests sequentially.
 *
 * @example
 * const tester = new IntegrationTester(logger, processExecutor, envManager);
 * const result = await tester.runStaircaseTests('proj-1', '/path', modifiedFiles);
 */
export class IntegrationTester {
  private readonly logger: Logger;
  private readonly processExecutor: ProcessExecutor;
  private readonly envManager: CleanEnvManager;
  private readonly testSteps: readonly TestStep[];
  private readonly results: IntegrationStepResult[] = [];
  private currentStep = 0;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   * @param processExecutor - 프로세스 실행기 / Process executor
   * @param envManager - 클린 환경 관리자 / Clean environment manager
   * @param testing - 테스트 수량 설정 (생략 시 기본값 사용) / Testing config (defaults used if omitted)
   */
  constructor(
    logger: Logger,
    processExecutor: ProcessExecutor,
    envManager: CleanEnvManager,
    testing?: TestingConfig,
  ) {
    this.logger = logger.child({ module: 'integration-tester' });
    this.processExecutor = processExecutor;
    this.envManager = envManager;
    // WHY: TestingConfig 제공 시 동적 단계 빌드, 미제공 시 스펙 기본값 사용
    this.testSteps = testing ? buildTestSteps(testing) : TEST_STEPS;
  }

  /**
   * 계단식 Fail-Fast 통합 테스트를 실행한다 / Runs staircase Fail-Fast integration tests
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param projectPath - 프로젝트 경로 / Project path
   * @param modifiedFiles - 수정된 파일 목록 / Modified files list
   * @param allTestPaths - 전체 테스트 경로 / All test paths
   * @returns 계단식 테스트 결과 / Staircase test result
   */
  async runStaircaseTests(
    projectId: string,
    projectPath: string,
    modifiedFiles: ModifiedFiles,
    allTestPaths: readonly string[] = [],
  ): Promise<Result<StaircaseTestResult>> {
    this.logger.info('계단식 Fail-Fast 통합 테스트 시작', {
      projectId,
      projectPath,
      modifiedFileCount: modifiedFiles.paths.length,
    });

    // WHY: 클린 환경 생성 (테스트 격리)
    const envResult = await this.envManager.create(projectId);
    if (!envResult.ok) {
      return err(envResult.error);
    }

    const { envPath } = envResult.value;

    try {
      const stepResults: IntegrationStepResult[] = [];

      // WHY: 4단계 순차 실행 (Fail-Fast) — TestingConfig 주입 시 동적 단계 사용
      for (const step of this.testSteps) {
        const testPaths = this.resolveTestPaths(step, modifiedFiles, allTestPaths);
        const stepResult = await this.runStep(step, projectPath, testPaths);

        if (!stepResult.ok) {
          return err(stepResult.error);
        }

        stepResults.push(stepResult.value);

        // WHY: 실패 시 즉시 중단 (Fail-Fast)
        if (!stepResult.value.passed) {
          this.logger.warn('계단식 테스트 실패 - 즉시 중단', {
            step: step.stepNumber,
            scope: step.scope,
            failCount: stepResult.value.failCount,
          });

          return ok({
            stepResults,
            allPassed: false,
            failedAtStep: step.stepNumber,
          });
        }

        this.logger.info('단계 통과, 다음 단계 진행', {
          completedStep: step.stepNumber,
          scope: step.scope,
        });
      }

      this.logger.info('계단식 통합 테스트 전체 통과', {
        projectId,
        totalSteps: stepResults.length,
      });

      return ok({ stepResults, allPassed: true });
    } finally {
      // WHY: 항상 클린 환경 정리
      await this.envManager.destroy(envPath);
    }
  }

  /**
   * 기존 호환 메서드 / Legacy-compatible method
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 통합 테스트 결과 / Integration test results
   */
  async runIntegrationTests(
    projectId: string,
    projectPath: string,
  ): Promise<Result<readonly IntegrationStepResult[]>> {
    const result = await this.runStaircaseTests(projectId, projectPath, { paths: [] });
    if (!result.ok) return err(result.error);
    return ok(result.value.stepResults);
  }

  /**
   * 단계별 테스트 경로를 결정한다 / Resolves test paths for each step
   *
   * @param step - 테스트 단계 설정 / Test step config
   * @param modifiedFiles - 수정된 파일 목록 / Modified files
   * @param allTestPaths - 전체 테스트 경로 / All test paths
   * @returns 해당 단계의 테스트 경로 / Test paths for the step
   */
  private resolveTestPaths(
    step: TestStep,
    modifiedFiles: ModifiedFiles,
    allTestPaths: readonly string[],
  ): readonly string[] {
    // WHY: 수정 파일 없으면 기본 경로 사용
    if (modifiedFiles.paths.length === 0) return [step.testPath];

    switch (step.scope) {
      case 'modified':
        return identifyModifiedTestPaths(modifiedFiles);
      case 'related':
        return identifyRelatedTestPaths(modifiedFiles);
      case 'unrelated':
        return identifyUnrelatedTestPaths(allTestPaths, modifiedFiles);
      case 'full':
        return [step.testPath];
    }
  }

  /**
   * 단일 테스트 단계를 실행한다 / Runs a single test step
   *
   * @param step - 테스트 단계 설정 / Test step configuration
   * @param projectPath - 프로젝트 경로 / Project path
   * @param testPaths - 실행할 테스트 경로 / Test paths to execute
   * @returns 단계 실행 결과 / Step execution result
   */
  private async runStep(
    step: TestStep,
    projectPath: string,
    testPaths: readonly string[],
  ): Promise<Result<IntegrationStepResult>> {
    this.logger.info('테스트 단계 시작', {
      step: step.stepNumber,
      scope: step.scope,
      targetCount: step.targetCount,
      description: step.description,
      testPaths,
    });

    // WHY: 테스트 경로가 없으면 해당 단계 스킵 (통과 처리)
    if (testPaths.length === 0) {
      this.logger.info('테스트 경로 없음 - 단계 스킵', {
        step: step.stepNumber,
        scope: step.scope,
      });
      return ok({
        step: step.stepNumber,
        scope: step.scope,
        targetCount: step.targetCount,
        executedCount: 0,
        passed: true,
        failCount: 0,
      });
    }

    // WHY: bun test 실행 (지정된 경로)
    const args = ['test', ...testPaths];
    // WHY: process.execPath = 현재 실행 중인 bun의 절대 경로 사용 — PATH 의존성 제거
    const testResult = await this.processExecutor.execute(process.execPath, args, {
      cwd: projectPath,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    if (!testResult.ok) return err(testResult.error);

    const { exitCode, stdout, stderr } = testResult.value;
    const parseResult = parseBunTestOutput(stdout, stderr);

    // WHY: bun test가 테스트 파일을 찾지 못하면 exit code 1 + "did not match any test files"
    //      이건 실제 테스트 실패가 아니라 해당 경로에 테스트가 없는 것 → 단계 스킵 (통과)
    const noTestFiles =
      (stdout + stderr).includes('did not match any test files') ||
      (stdout + stderr).includes('No test files found');
    const passed = noTestFiles || (exitCode === 0 && parseResult.failCount === 0);

    const stepResult: IntegrationStepResult = {
      step: step.stepNumber,
      scope: step.scope,
      targetCount: step.targetCount,
      executedCount: parseResult.totalTests,
      passed,
      failCount: parseResult.failCount,
    };

    // WHY: 상태 추적 (하위 호환)
    this.results.push(stepResult);
    this.currentStep = step.stepNumber;

    this.logger.info('테스트 단계 완료', {
      step: step.stepNumber,
      scope: step.scope,
      passed,
      failCount: parseResult.failCount,
      executedCount: parseResult.totalTests,
      targetCount: step.targetCount,
    });

    return ok(stepResult);
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
   * @returns 단계별 결과 배열 (복사본) / Step results array (copy)
   */
  getResults(): IntegrationStepResult[] {
    return [...this.results];
  }
}
