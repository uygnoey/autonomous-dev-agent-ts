/**
 * layer1 기능 명세 타입 정의 / Layer 1 feature specification type definitions
 *
 * @description
 * KR: 기능 명세, 수락 기준, 입출력 정의, 테스트 타입 정의에 사용되는 타입.
 * EN: Types for feature specifications, acceptance criteria, I/O definitions,
 *     and test type definitions.
 */

// ── 기능 명세 / Feature Specification ────────────────────────────

/**
 * 단일 기능 명세 / Feature specification for a single feature
 *
 * @description
 * KR: 기능의 이름, 설명, 수락 기준, 의존성, 입출력을 정의한다.
 * EN: Defines a feature's name, description, acceptance criteria,
 *     dependencies, and I/O.
 */
export interface FeatureSpec {
  /** 기능 고유 ID / Feature unique ID */
  readonly id: string;

  /** 기능 이름 / Feature name */
  readonly name: string;

  /** 기능 설명 / Feature description */
  readonly description: string;

  /** 수락 기준 목록 / Acceptance criteria list */
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];

  /** 의존하는 기능 ID 목록 / Dependent feature IDs */
  readonly dependencies: readonly string[];

  /** 입력 정의 / Input definitions */
  readonly inputs: readonly IODefinition[];

  /** 출력 정의 / Output definitions */
  readonly outputs: readonly IODefinition[];
}

/**
 * 수락 기준 / Acceptance criterion
 *
 * @description
 * KR: 기능이 완료되었는지 판단하는 검증 가능한 기준.
 * EN: A verifiable criterion for determining feature completeness.
 */
export interface AcceptanceCriterion {
  /** 기준 고유 ID / Criterion unique ID */
  readonly id: string;

  /** 기준 설명 / Criterion description */
  readonly description: string;

  /** 검증 가능 여부 / Whether verifiable */
  readonly verifiable: boolean;

  /** 테스트 카테고리 / Test category */
  readonly testCategory: string;
}

/**
 * 입출력 정의 / Input/Output definition
 *
 * @description
 * KR: 기능의 입력 또는 출력 하나를 정의한다.
 * EN: Defines a single input or output of a feature.
 */
export interface IODefinition {
  /** 필드명 / Field name */
  readonly name: string;

  /** 타입 / Type */
  readonly type: string;

  /** 제약 조건 / Constraints */
  readonly constraints: string;

  /** 필수 여부 / Whether required */
  readonly required: boolean;
}

// ── 테스트 타입 정의 / Test Type Definition ──────────────────────

/**
 * 기능별 테스트 타입 정의 / Test type definition for each feature
 *
 * @description
 * KR: 기능 하나에 대한 테스트 카테고리, 규칙, 샘플 테스트, 비율을 정의한다.
 * EN: Defines test categories, rules, sample tests, and ratios for a feature.
 */
export interface TestTypeDefinition {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;

  /** 테스트 카테고리 목록 / Test category list */
  readonly categories: readonly TestCategory[];

  /** 테스트 규칙 / Test rules */
  readonly rules: readonly string[];

  /** 샘플 테스트 / Sample tests */
  readonly sampleTests: readonly SampleTest[];

  /** 테스트 비율 / Test ratios */
  readonly ratios: TestRatios;
}

/**
 * 테스트 카테고리 / Test category
 */
export interface TestCategory {
  /** 카테고리 이름 / Category name */
  readonly name: string;

  /** 카테고리 설명 / Category description */
  readonly description: string;

  /** 매핑된 수락 기준 ID 목록 / Mapped acceptance criterion IDs */
  readonly mappedCriteria: readonly string[];
}

/**
 * 샘플 테스트 / Sample test
 */
export interface SampleTest {
  /** 테스트 카테고리 / Test category */
  readonly category: string;

  /** 테스트 설명 / Test description */
  readonly description: string;

  /** 기대 동작 / Expected behavior */
  readonly expectedBehavior: string;
}

/**
 * 테스트 비율 / Test ratios (unit / module / e2e)
 */
export interface TestRatios {
  /** 단위 테스트 비율 / Unit test ratio */
  readonly unit: number;

  /** 모듈 테스트 비율 / Module test ratio */
  readonly module: number;

  /** E2E 테스트 비율 / E2E test ratio */
  readonly e2e: number;
}
