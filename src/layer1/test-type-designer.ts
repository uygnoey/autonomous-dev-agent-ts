/**
 * 테스트 타입 설계자 / Test type designer
 *
 * @description
 * KR: 기능 명세의 수락 기준을 테스트 카테고리에 매핑하고,
 *     샘플 테스트와 비율을 생성한다.
 * EN: Maps feature acceptance criteria to test categories,
 *     and generates sample tests and ratios.
 */

import type { Logger } from '../core/logger.js';
import { ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type {
  FeatureSpec,
  SampleTest,
  TestCategory,
  TestRatios,
  TestTypeDefinition,
} from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 기본 테스트 비율 / Default test ratios */
const DEFAULT_RATIOS: TestRatios = {
  unit: 0.6,
  module: 0.25,
  e2e: 0.15,
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
 */
function buildSampleTests(feature: FeatureSpec, categories: readonly TestCategory[]): SampleTest[] {
  const sampleTests: SampleTest[] = [];

  for (const category of categories) {
    sampleTests.push({
      category: category.name,
      description:
        `${feature.name}의 ${category.name} 정상 동작 테스트 / ` +
        `Test normal behavior of ${category.name} in ${feature.name}`,
      expectedBehavior:
        `${category.name} 카테고리 기능이 정상 동작한다 / ` +
        `${category.name} category functions correctly`,
    });

    // WHY: edge case 테스트 비중이 높으므로 edge case 샘플도 추가
    sampleTests.push({
      category: category.name,
      description:
        `${feature.name}의 ${category.name} 엣지 케이스 테스트 / ` +
        `Test edge cases of ${category.name} in ${feature.name}`,
      expectedBehavior:
        '경계 조건에서 올바르게 처리한다 / ' + 'Handles boundary conditions correctly',
    });
  }

  return sampleTests;
}
