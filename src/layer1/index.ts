/**
 * layer1 모듈 public API / Layer1 module public exports
 *
 * @description
 * KR: 사용자 대화, 기획, 설계, 스펙 작성, 테스트 설계, Contract 생성, 검증을 re-export한다.
 * EN: Re-exports conversation, planning, design, spec building, test design,
 *     contract building, and verification.
 */

// ── 타입 ────────────────────────────────────────────────────────

export type {
  AcceptanceCriterion,
  ContractSchema,
  ConversationMessage,
  FeatureSpec,
  HandoffPackage,
  IODefinition,
  Layer1VerificationRequest,
  Layer1VerificationResult,
  SampleTest,
  TestCategory,
  TestRatios,
  TestTypeDefinition,
  VerificationMatrix,
} from './types.js';

// ── 대화 관리 ───────────────────────────────────────────────────

export { ConversationManager } from './conversation.js';

// ── 기획 ────────────────────────────────────────────────────────

export { Planner } from './planner.js';

// ── 설계 ────────────────────────────────────────────────────────

export { Designer } from './designer.js';

// ── 스펙 빌더 ───────────────────────────────────────────────────

export { SpecBuilder } from './spec-builder.js';

// ── 테스트 타입 설계 ────────────────────────────────────────────

export { TestTypeDesigner } from './test-type-designer.js';

// ── Contract 빌더 ───────────────────────────────────────────────

export { ContractBuilder } from './contract-builder.js';

// ── 검증기 ──────────────────────────────────────────────────────

export { Layer1Verifier } from './verifier.js';

// ── Claude API ──────────────────────────────────────────────────

export {
  ClaudeApi,
  type ClaudeApiRequestOptions,
  type ClaudeApiResponse,
  type ClaudeApiResponseMetadata,
  type ClaudeStreamEvent,
  type StreamCallback,
} from './claude-api.js';
