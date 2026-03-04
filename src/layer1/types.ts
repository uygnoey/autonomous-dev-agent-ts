/**
 * layer1 (1계층) 타입 정의 / Layer 1 type definitions
 *
 * @description
 * KR: 사용자 대화, 기획, 설계, 스펙 작성, Contract/HandoffPackage 생성에 사용되는 타입.
 * EN: Types for user conversation, planning, design, spec building,
 *     and Contract/HandoffPackage generation.
 */

// ── 대화 / Conversation ──────────────────────────────────────────

/**
 * Claude API 대화 메시지 / Conversation message for Claude API dialog
 *
 * @description
 * KR: 사용자와 어시스턴트 간 대화 한 턴을 나타낸다.
 * EN: Represents a single turn of dialog between user and assistant.
 */
export interface ConversationMessage {
  /** 메시지 고유 ID / Unique message ID */
  readonly id: string;

  /** 발화자 역할 / Speaker role */
  readonly role: 'user' | 'assistant';

  /** 메시지 내용 / Message content */
  readonly content: string;

  /** 생성 시각 / Creation timestamp */
  readonly timestamp: Date;

  /** 소속 프로젝트 ID / Owning project ID */
  readonly projectId: string;
}

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

// ── Contract 스키마 / Contract Schema ────────────────────────────

/**
 * Contract 스키마 - 프로젝트 유형별 동적 구조 / Contract schema - dynamic per project type
 *
 * @description
 * KR: 기능 명세, 테스트 정의, 구현 순서, 검증 매트릭스를 포함하는 계약 문서.
 * EN: Contract document containing feature specs, test definitions,
 *     implementation order, and verification matrix.
 */
export interface ContractSchema {
  /** 스키마 버전 / Schema version */
  readonly version: number;

  /** 프로젝트 유형 / Project type */
  readonly projectType: string;

  /** 기능 명세 목록 / Feature specification list */
  readonly features: readonly FeatureSpec[];

  /** 테스트 정의 목록 / Test definition list */
  readonly testDefinitions: readonly TestTypeDefinition[];

  /** 구현 순서 (기능 ID 순서) / Implementation order (feature IDs in order) */
  readonly implementationOrder: readonly string[];

  /** 검증 매트릭스 / Verification matrix */
  readonly verificationMatrix: VerificationMatrix;
}

/**
 * 검증 매트릭스 / Verification matrix
 *
 * @description
 * KR: Contract의 5대 검증 원칙 충족 여부를 나타낸다.
 * EN: Indicates whether the 5 verification principles of a Contract are met.
 */
export interface VerificationMatrix {
  /** 모든 기능에 수락 기준이 있는지 / All features have criteria */
  readonly allFeaturesHaveCriteria: boolean;

  /** 모든 기준에 테스트가 있는지 / All criteria have tests */
  readonly allCriteriaHaveTests: boolean;

  /** 순환 의존성이 없는지 / No cyclic dependencies */
  readonly noCyclicDependencies: boolean;

  /** 모든 입출력이 정의되었는지 / All I/O defined */
  readonly allIODefined: boolean;

  /** 완전성 점수 (0~1) / Completeness score (0~1) */
  readonly completenessScore: number;
}

// ── HandoffPackage ───────────────────────────────────────────────

/**
 * layer1 → layer2 인수 패키지 / Handoff package from layer1 to layer2
 *
 * @description
 * KR: 기획, 설계, 스펙, Contract를 묶어 layer2에 전달하는 패키지.
 * EN: Package bundling plan, design, spec, and contract for layer2.
 */
export interface HandoffPackage {
  /** 패키지 고유 ID / Package unique ID */
  readonly id: string;

  /** 프로젝트 ID / Project ID */
  readonly projectId: string;

  /** Contract 스키마 / Contract schema */
  readonly contract: ContractSchema;

  /** 기획 문서 / Plan document */
  readonly planDocument: string;

  /** 설계 문서 / Design document */
  readonly designDocument: string;

  /** 스펙 문서 / Spec document */
  readonly specDocument: string;

  /** 생성 시각 / Creation timestamp */
  readonly createdAt: Date;

  /** 사용자 확인 여부 / Whether confirmed by user */
  readonly confirmedByUser: boolean;
}

// ── layer2 검증 요청/결과 / Layer2 Verification ─────────────────

/**
 * layer2에서의 검증 요청 / Verification request from layer2
 *
 * @description
 * KR: layer2가 구현 결과를 layer1에 검증 요청할 때 사용.
 * EN: Used when layer2 requests verification of implementation from layer1.
 */
export interface Layer1VerificationRequest {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;

  /** 구현 코드 / Implemented code */
  readonly implementedCode: string;

  /** 테스트 결과 / Test results */
  readonly testResults: string;

  /** 질문 / Question */
  readonly question: string;
}

/**
 * layer1 검증 결과 / Layer1 verification result
 *
 * @description
 * KR: layer1이 구현을 검증한 결과.
 * EN: Result of layer1's verification of an implementation.
 */
export interface Layer1VerificationResult {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;

  /** 통과 여부 / Whether passed */
  readonly passed: boolean;

  /** 피드백 / Feedback */
  readonly feedback: string;

  /** 사용자 입력 필요 여부 / Whether user input is needed */
  readonly needsUserInput: boolean;
}
