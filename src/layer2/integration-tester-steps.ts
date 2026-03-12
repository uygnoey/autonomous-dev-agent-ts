/**
 * 계단식 테스트 단계 정의 / Staircase test step definitions
 *
 * @description
 * KR: 4단계 계단식 Fail-Fast 통합 테스트의 단계 설정과
 *     연관 기능 자동 식별 로직을 정의한다.
 * EN: Defines step configurations for 4-step staircase Fail-Fast
 *     integration tests and related feature auto-identification logic.
 */

import type { TestingConfig } from 'core/config-schema.js';
import type { TestScope } from 'layer2/phase-types.js';

// ── 타입 / Types ────────────────────────────────────────────────

/**
 * 유효한 통합 테스트 단계 번호 / Valid integration test step number
 */
export type StepNumber = 1 | 2 | 3 | 4;

/**
 * 계단식 테스트 단계 설정 / Staircase test step configuration
 *
 * @description
 * KR: 각 단계의 범위, 목표 테스트 수, 테스트 경로를 정의한다.
 * EN: Defines scope, target count, and test path for each step.
 */
export interface TestStep {
  /** 단계 번호 / Step number */
  readonly stepNumber: StepNumber;
  /** 목표 테스트 수 / Target test count */
  readonly targetCount: number;
  /** 테스트 범위 / Test scope */
  readonly scope: TestScope;
  /** 단계 이름 / Step name */
  readonly name: string;
  /** 기본 테스트 경로 / Default test path */
  readonly testPath: string;
  /** 단계 설명 / Step description */
  readonly description: string;
}

/**
 * 수정된 파일 정보 / Modified file information
 *
 * @description
 * KR: 변경된 파일의 경로 목록.
 * EN: List of modified file paths.
 */
export interface ModifiedFiles {
  /** 수정된 파일 경로 / Modified file paths */
  readonly paths: readonly string[];
}

// ── 상수 / Constants ────────────────────────────────────────────

/**
 * 4단계 계단식 테스트 설정 / 4-step staircase test configurations
 *
 * @description
 * KR: 스펙 정의:
 *     Step 1: 수정된 기능 E2E 전체 (targetCount=100,000+)
 *     Step 2: 연관 기능 회귀 (targetCount=10,000)
 *     Step 3: 비연관 기능 스모크 (targetCount=1,000)
 *     Step 4: 전체 통합 최종 (targetCount=1,000,000)
 * EN: Spec-defined staircase steps with cascading target counts.
 */
export const TEST_STEPS: readonly TestStep[] = [
  {
    stepNumber: 1,
    targetCount: 100_000,
    scope: 'modified',
    name: 'modified-e2e',
    testPath: 'tests/unit',
    description: '수정된 기능 E2E 전체',
  },
  {
    stepNumber: 2,
    targetCount: 10_000,
    scope: 'related',
    name: 'related-regression',
    testPath: 'tests/module',
    description: '연관 기능 회귀',
  },
  {
    stepNumber: 3,
    targetCount: 1_000,
    scope: 'unrelated',
    name: 'unrelated-smoke',
    testPath: 'tests/integration',
    description: '비연관 기능 스모크',
  },
  {
    stepNumber: 4,
    targetCount: 1_000_000,
    scope: 'full',
    name: 'full-integration',
    testPath: 'tests/e2e',
    description: '전체 통합 최종',
  },
] as const;

// ── 동적 단계 빌더 / Dynamic step builder ───────────────────────

/**
 * TestingConfig에서 4단계 테스트 설정을 생성한다 / Builds 4-step configs from TestingConfig
 *
 * @description
 * KR: 스펙 §8.4 — 설정값으로 각 단계의 targetCount를 동적으로 결정한다.
 *     Step 1: e2eCount, Step 2: moduleCount, Step 3: unitCount, Step 4: integrationE2eCount
 * EN: Spec §8.4 — dynamically sets each step's targetCount from config values.
 *
 * @param testing - 테스트 수량 설정 / Testing configuration
 * @returns 단계 설정 배열 / Step configuration array
 */
export function buildTestSteps(testing: TestingConfig): readonly TestStep[] {
  return [
    {
      stepNumber: 1 as const,
      targetCount: testing.e2eCount,
      scope: 'modified' as const,
      name: 'modified-e2e',
      testPath: 'tests/unit',
      description: '수정된 기능 E2E 전체',
    },
    {
      stepNumber: 2 as const,
      targetCount: testing.moduleCount,
      scope: 'related' as const,
      name: 'related-regression',
      testPath: 'tests/module',
      description: '연관 기능 회귀',
    },
    {
      stepNumber: 3 as const,
      targetCount: testing.unitCount,
      scope: 'unrelated' as const,
      name: 'unrelated-smoke',
      testPath: 'tests/integration',
      description: '비연관 기능 스모크',
    },
    {
      stepNumber: 4 as const,
      targetCount: testing.integrationE2eCount,
      scope: 'full' as const,
      name: 'full-integration',
      testPath: 'tests/e2e',
      description: '전체 통합 최종',
    },
  ];
}

// ── 연관 기능 식별 / Related feature identification ──────────────

/**
 * 파일 경로에서 모듈 접두사를 추출한다 / Extracts module prefix from file path
 *
 * @description
 * KR: 'src/layer2/agent-spawner.ts' → 'src/layer2'
 * EN: Extracts directory-level module prefix from a file path.
 *
 * @param filePath - 파일 경로 / File path
 * @returns 모듈 접두사 / Module prefix
 */
function extractModulePrefix(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : filePath;
}

/**
 * 수정된 파일에서 연관 테스트 경로 패턴을 생성한다 / Generates related test path patterns from modified files
 *
 * @description
 * KR: 수정된 파일의 디렉토리 패턴을 기반으로 연관 테스트 경로를 추론한다.
 *     예: src/layer2/agent-spawner.ts → tests/unit/layer2/, tests/module/layer2/
 * EN: Infers related test paths based on directory patterns of modified files.
 *
 * @param modifiedFiles - 수정된 파일 목록 / Modified files list
 * @returns 연관 테스트 경로 패턴 / Related test path patterns
 */
export function identifyRelatedTestPaths(modifiedFiles: ModifiedFiles): readonly string[] {
  const prefixes = new Set<string>();

  for (const filePath of modifiedFiles.paths) {
    // WHY: src/ 접두사 제거 후 모듈 레벨 디렉토리 추출
    const normalized = filePath.replace(/^src\//, '');
    const modulePrefix = extractModulePrefix(normalized);
    if (modulePrefix) {
      prefixes.add(modulePrefix);
    }
  }

  // WHY: 각 모듈 접두사에 대해 테스트 디렉토리 패턴 생성
  const relatedPaths: string[] = [];
  for (const prefix of prefixes) {
    relatedPaths.push(`tests/unit/${prefix}`);
    relatedPaths.push(`tests/module/${prefix}`);
  }

  return relatedPaths;
}

/**
 * 수정된 파일에서 직접 관련된 테스트 경로를 생성한다 / Generates direct test paths from modified files
 *
 * @description
 * KR: 수정된 소스 파일에 대응하는 테스트 파일 경로를 생성한다.
 *     예: src/layer2/agent-spawner.ts → tests/unit/layer2/agent-spawner.test.ts
 * EN: Generates test file paths corresponding to modified source files.
 *
 * @param modifiedFiles - 수정된 파일 목록 / Modified files list
 * @returns 대응하는 테스트 경로 / Corresponding test paths
 */
export function identifyModifiedTestPaths(modifiedFiles: ModifiedFiles): readonly string[] {
  const testPaths: string[] = [];

  for (const filePath of modifiedFiles.paths) {
    // WHY: src/X/Y.ts → tests/unit/X/Y.test.ts
    const withoutSrc = filePath.replace(/^src\//, '');
    const withoutExt = withoutSrc.replace(/\.ts$/, '');
    testPaths.push(`tests/unit/${withoutExt}.test.ts`);
  }

  return testPaths;
}

/**
 * 비연관 테스트 경로를 식별한다 / Identifies unrelated test paths
 *
 * @description
 * KR: 전체 테스트 경로에서 수정/연관 경로를 제외한 나머지를 반환한다.
 * EN: Returns test paths excluding modified and related paths.
 *
 * @param allTestPaths - 전체 테스트 경로 / All test paths
 * @param modifiedFiles - 수정된 파일 목록 / Modified files
 * @returns 비연관 테스트 경로 / Unrelated test paths
 */
export function identifyUnrelatedTestPaths(
  allTestPaths: readonly string[],
  modifiedFiles: ModifiedFiles,
): readonly string[] {
  const modifiedPrefixes = new Set<string>();

  for (const filePath of modifiedFiles.paths) {
    const normalized = filePath.replace(/^src\//, '');
    const modulePrefix = extractModulePrefix(normalized);
    if (modulePrefix) {
      modifiedPrefixes.add(modulePrefix);
    }
  }

  // WHY: 수정된 모듈과 관련없는 테스트 경로만 필터링
  return allTestPaths.filter((testPath) => {
    for (const prefix of modifiedPrefixes) {
      if (testPath.includes(prefix)) {
        return false;
      }
    }
    return true;
  });
}
