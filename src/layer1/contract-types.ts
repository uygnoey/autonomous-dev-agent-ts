/**
 * layer1 Contract 및 HandoffPackage 타입 정의 / Layer 1 contract and handoff type definitions
 *
 * @description
 * KR: ContractSchema, VerificationMatrix, HandoffPackage 타입.
 * EN: Types for ContractSchema, VerificationMatrix, and HandoffPackage.
 */

import type { ContractChangeRecord } from 'layer1/contract-change-types.js';
import type { FeatureSpec, TestTypeDefinition } from 'layer1/feature-types.js';

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

  /** Contract 버전 (1부터 시작) / Contract version starting at 1 */
  readonly version?: number;

  /** 변경 이력 / Change history */
  readonly changeHistory?: readonly ContractChangeRecord[];
}

// ── Contract 스펙 / Contract Spec ───────────────────────────────

/**
 * Contract 스펙 인터페이스 — HandoffPackage의 핵심 요건 정의 / Contract spec — core requirements for HandoffPackage
 *
 * @description
 * KR: 단일 기능에 대한 요구사항, 수락 기준, 테스트 전략, 제약 조건을 정의하는 스펙.
 * EN: Spec defining requirements, acceptance criteria, test strategy, and constraints
 *     for a single feature.
 */
export interface ContractSpec {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 기능 제목 / Feature title */
  readonly title: string;
  /** 요구사항 목록 / List of requirements */
  readonly requirements: readonly string[];
  /** 수락 기준 목록 / List of acceptance criteria */
  readonly acceptanceCriteria: readonly string[];
  /** 테스트 전략 / Test strategy */
  readonly testStrategy: string;
  /** 제약 조건 목록 / List of constraints */
  readonly constraints: readonly string[];
}
