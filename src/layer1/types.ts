/**
 * layer1 (1계층) 타입 정의 / Layer 1 type definitions
 *
 * @description
 * KR: 사용자 대화, 기획, 설계, 스펙 작성, Contract/HandoffPackage 생성에 사용되는 타입.
 *     세부 타입은 도메인별 파일로 분리되어 있으며, 이 파일은 모두 re-export한다.
 * EN: Types for user conversation, planning, design, spec building,
 *     and Contract/HandoffPackage generation.
 *     Detailed types are split by domain; this file re-exports all.
 */

export type {
  ConversationMessage,
  Layer1VerificationRequest,
  Layer1VerificationResult,
} from 'layer1/conversation-types.js';

export type {
  AcceptanceCriterion,
  FeatureSpec,
  IODefinition,
  SampleTest,
  TestCategory,
  TestRatios,
  TestTypeDefinition,
} from 'layer1/feature-types.js';

export type {
  ContractSchema,
  HandoffPackage,
  VerificationMatrix,
} from 'layer1/contract-types.js';
