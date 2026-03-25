/**
 * 테스트 타입 설계자 / Test type designer
 *
 * @description
 * KR: 기능 명세의 수락 기준을 테스트 카테고리에 매핑하고,
 *     샘플 테스트와 비율을 생성한다.
 * EN: Maps feature acceptance criteria to test categories,
 *     and generates sample tests and ratios.
 */

import type { Logger } from 'core/logger.js';
import { ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type {
  FeatureSpec,
  SampleTest,
  TestCategory,
  TestRatios,
  TestTargetCounts,
  TestTypeDefinition,
} from 'layer1/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 테스트 비율 / Default test ratios */
const DEFAULT_RATIOS: TestRatios = {
  unit: 0.6,
  module: 0.25,
  e2e: 0.15,
};

/**
 * 기본 목표 수량 / Default target counts
 *
 * @description
 * KR: 스펙 §6.6 기준 유형별 목표 테스트 수량.
 * EN: Target test counts per type, per spec §6.6.
 */
const DEFAULT_TARGET_COUNTS: TestTargetCounts = {
  unit: 10_000,
  module: 10_000,
  e2e: 100_000,
};

/** 기본 테스트 규칙 / Default test rules */
const DEFAULT_TEST_RULES: readonly string[] = [
  'edge case 비율 80%+ / Edge case ratio 80%+',
  'normal case 20% 이내 / Normal case within 20%',
  'Arrange-Act-Assert 패턴 / Arrange-Act-Assert pattern',
  '테스트 간 상태 공유 금지 / No shared state between tests',
];

// ── TestTypeDesigner ────────────────────────────────────────────

/**
 * 테스트 타입 설계자 / Test type designer
 *
 * @description
 * KR: 각 기능에 대한 테스트 타입 정의를 생성한다.
 *     수락 기준 → 테스트 카테고리 매핑, 샘플 테스트 생성.
 * EN: Creates test type definitions for each feature.
 *     Maps acceptance criteria to test categories, generates sample tests.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const designer = new TestTypeDesigner(logger);
 * const definitions = designer.createDefinitions(features);
 */
export class TestTypeDesigner {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'test-type-designer' });
  }

  /**
   * 기능별 테스트 정의 생성 / Create test definitions for features
   *
   * @param features - 기능 명세 목록 / Feature specification list
   * @returns TestTypeDefinition 배열 / Array of TestTypeDefinition
   */
  createDefinitions(features: readonly FeatureSpec[]): Result<TestTypeDefinition[]> {
    this.logger.debug('테스트 정의 생성 시작', { featureCount: features.length });

    const definitions: TestTypeDefinition[] = [];

    for (const feature of features) {
      const categories = buildCategories(feature);
      const sampleTests = buildSampleTests(feature, categories);

      definitions.push({
        featureId: feature.id,
        categories,
        rules: [...DEFAULT_TEST_RULES],
        sampleTests,
        ratios: DEFAULT_RATIOS,
      });
    }

    this.logger.info('테스트 정의 생성 완료', {
      featureCount: features.length,
      definitionCount: definitions.length,
    });

    return ok(definitions);
  }

  /**
   * 목표 수량 설정 반환 / Get target counts for test types
   *
   * @description
   * KR: 유형별 목표 테스트 수량을 반환한다. 커스텀 수량을 지정하면 기본값을 덮어쓴다.
   * EN: Returns target test counts per type. Custom counts override defaults.
   *
   * @param customCounts - 커스텀 목표 수량 (선택) / Custom target counts (optional)
   * @returns 목표 수량 / Target counts
   */
  getTargetCounts(customCounts?: Partial<TestTargetCounts>): TestTargetCounts {
    return {
      unit: customCounts?.unit ?? DEFAULT_TARGET_COUNTS.unit,
      module: customCounts?.module ?? DEFAULT_TARGET_COUNTS.module,
      e2e: customCounts?.e2e ?? DEFAULT_TARGET_COUNTS.e2e,
    };
  }

  /**
   * 테스트 정의 검증 / Validate test definitions against features
   *
   * @param definitions - 테스트 정의 목록 / Test definitions
   * @param features - 기능 명세 목록 / Feature specifications
   * @returns 경고 메시지 목록 (빈 배열이면 정상) / Warning messages (empty = valid)
   */
  validate(
    definitions: readonly TestTypeDefinition[],
    features: readonly FeatureSpec[],
  ): Result<string[]> {
    this.logger.debug('테스트 정의 검증 시작');

    const warnings: string[] = [];

    // WHY: 모든 기능에 대해 테스트 정의가 존재하는지 확인
    const definedFeatureIds = new Set(definitions.map((d) => d.featureId));
    for (const feature of features) {
      if (!definedFeatureIds.has(feature.id)) {
        warnings.push(
          `기능 '${feature.name}' (${feature.id})에 대한 테스트 정의가 없습니다 / ` +
            `No test definition for feature '${feature.name}' (${feature.id})`,
        );
      }
    }

    // WHY: 각 수락 기준이 테스트 카테고리에 매핑되었는지 확인
    for (const feature of features) {
      const definition = definitions.find((d) => d.featureId === feature.id);
      if (!definition) continue;

      const mappedCriteriaIds = new Set(definition.categories.flatMap((c) => c.mappedCriteria));

      for (const criterion of feature.acceptanceCriteria) {
        if (!mappedCriteriaIds.has(criterion.id)) {
          warnings.push(
            `수락 기준 '${criterion.id}'가 테스트 카테고리에 매핑되지 않았습니다 / ` +
              `Acceptance criterion '${criterion.id}' is not mapped to any test category`,
          );
        }
      }
    }

    this.logger.info('테스트 정의 검증 완료', { warningCount: warnings.length });
    return ok(warnings);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 기능의 수락 기준에서 테스트 카테고리 생성 / Build test categories from acceptance criteria
 */
function buildCategories(feature: FeatureSpec): TestCategory[] {
  if (feature.acceptanceCriteria.length === 0) {
    // WHY: 수락 기준이 없으면 기본 카테고리 생성
    return [
      {
        name: 'general',
        description: `General tests for ${feature.name}`,
        mappedCriteria: [],
      },
    ];
  }

  // WHY: testCategory 필드를 기준으로 그룹핑하여 카테고리 생성
  const categoryMap = new Map<string, string[]>();

  for (const criterion of feature.acceptanceCriteria) {
    const categoryName = criterion.testCategory || 'general';
    const existing = categoryMap.get(categoryName) ?? [];
    existing.push(criterion.id);
    categoryMap.set(categoryName, existing);
  }

  const categories: TestCategory[] = [];
  for (const [name, criteriaIds] of categoryMap) {
    categories.push({
      name,
      description: `${name} tests for ${feature.name}`,
      mappedCriteria: criteriaIds,
    });
  }

  return categories;
}

/**
 * 샘플 테스트 생성 / Build sample tests from feature and categories
 *
 * @description
 * KR: 카테고리별 10~20개의 샘플 테스트를 생성한다.
 *     normal case 20% + edge/boundary case 80% 비율을 준수한다.
 * EN: Generates 10~20 sample tests per category.
 *     Maintains ratio of 20% normal cases + 80% edge/boundary cases.
 */
function buildSampleTests(feature: FeatureSpec, categories: readonly TestCategory[]): SampleTest[] {
  const sampleTests: SampleTest[] = [];

  for (const category of categories) {
    const templates = getSampleTestTemplates(feature.name, category.name);
    for (const template of templates) {
      sampleTests.push(template);
    }
  }

  return sampleTests;
}

/**
 * 카테고리별 샘플 테스트 템플릿 / Sample test templates per category
 *
 * @description
 * KR: normal 20% + edge/boundary 80% 비율로 10~20개의 샘플을 생성한다.
 *     입력 검증, 경계값, 에러 처리, 동시성, 성능 등 다양한 관점의 테스트를 포함한다.
 * EN: Generates 10~20 samples with 20% normal + 80% edge/boundary ratio.
 *     Includes tests for input validation, boundaries, error handling, concurrency, performance.
 */
function getSampleTestTemplates(featureName: string, categoryName: string): SampleTest[] {
  // WHY: normal case 20% (2~4개) + edge/boundary case 80% (8~16개) = 10~20개
  return [
    // ── Normal cases (20%) ──────────────────────────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 기본 정상 동작 / Normal behavior of ${categoryName} in ${featureName}`,
      expectedBehavior:
        '유효한 입력에 대해 정상 결과를 반환한다 / Returns correct result for valid input',
    },
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 일반 사용 시나리오 / Common usage scenario of ${categoryName} in ${featureName}`,
      expectedBehavior:
        '일반적인 사용 패턴에서 기대한 동작을 수행한다 / Performs as expected in common usage patterns',
    },
    // ── Edge cases — 빈 입력 / Empty input (80%) ────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 빈 입력 처리 / Empty input handling in ${categoryName}`,
      expectedBehavior:
        '빈 입력에 대해 적절한 에러 또는 기본값을 반환한다 / Returns appropriate error or default for empty input',
    },
    // ── Edge cases — null/undefined ──────────────────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} null/undefined 입력 / Null/undefined input in ${categoryName}`,
      expectedBehavior:
        'null/undefined 입력을 안전하게 처리한다 / Safely handles null/undefined input',
    },
    // ── Edge cases — 경계값 최솟값 / Boundary min ────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 최솟값 경계 테스트 / Minimum boundary test for ${categoryName}`,
      expectedBehavior: '최솟값 경계에서 올바르게 처리한다 / Handles minimum boundary correctly',
    },
    // ── Edge cases — 경계값 최댓값 / Boundary max ────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 최댓값 경계 테스트 / Maximum boundary test for ${categoryName}`,
      expectedBehavior: '최댓값 경계에서 올바르게 처리한다 / Handles maximum boundary correctly',
    },
    // ── Edge cases — 대량 데이터 / Large data ────────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 대량 데이터 처리 / Large data handling in ${categoryName}`,
      expectedBehavior:
        '대량 데이터에서도 성능 저하 없이 처리한다 / Processes large data without performance degradation',
    },
    // ── Edge cases — 중복 입력 / Duplicate input ─────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 중복 입력 처리 / Duplicate input handling in ${categoryName}`,
      expectedBehavior:
        '중복 입력을 적절히 처리한다 (무시/병합/에러) / Handles duplicate input appropriately',
    },
    // ── Edge cases — 잘못된 타입 / Invalid type ──────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 잘못된 타입 입력 / Invalid type input in ${categoryName}`,
      expectedBehavior:
        '타입이 맞지 않는 입력에 대해 명확한 에러를 반환한다 / Returns clear error for type-mismatched input',
    },
    // ── Edge cases — 동시 호출 / Concurrent calls ────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 동시 호출 처리 / Concurrent call handling in ${categoryName}`,
      expectedBehavior:
        '동시 호출 시 데이터 정합성을 유지한다 / Maintains data integrity under concurrent calls',
    },
    // ── Edge cases — 타임아웃 / Timeout ──────────────
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 타임아웃 처리 / Timeout handling in ${categoryName}`,
      expectedBehavior:
        '타임아웃 시 적절한 에러를 반환하고 리소스를 정리한다 / Returns appropriate error and cleans up resources on timeout',
    },
    // ── Edge cases — 특수 문자 / Special characters ──
    {
      category: categoryName,
      description: `${featureName}의 ${categoryName} 특수 문자 입력 / Special character input in ${categoryName}`,
      expectedBehavior:
        '특수 문자, 유니코드, 이모지를 올바르게 처리한다 / Correctly handles special characters, unicode, and emojis',
    },
  ];
}
