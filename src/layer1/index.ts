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
  ConversationPhase,
  FeatureSpec,
  HandoffPackage,
  IODefinition,
  Layer1VerificationRequest,
  Layer1VerificationResult,
  SampleTest,
  TestCategory,
  TestRatios,
  TestTargetCounts,
  TestTypeDefinition,
  VerificationMatrix,
} from 'layer1/types.js';

export {
  CONFIRMATION_KEYWORDS,
  PHASE_SYSTEM_PROMPTS,
  PHASE_TRANSITIONS,
} from 'layer1/types.js';

// ── 대화 관리 ───────────────────────────────────────────────────

export { ConversationManager } from 'layer1/conversation.js';

// ── 대화 Phase FSM ──────────────────────────────────────────────

export { ConversationFsm } from 'layer1/conversation-fsm.js';

// ── 기획 ────────────────────────────────────────────────────────

export { Planner } from 'layer1/planner.js';

// ── 설계 ────────────────────────────────────────────────────────

export { Designer } from 'layer1/designer.js';

// ── 스펙 빌더 ───────────────────────────────────────────────────

export { SpecBuilder } from 'layer1/spec-builder.js';

// ── 테스트 타입 설계 ────────────────────────────────────────────

export { TestTypeDesigner } from 'layer1/test-type-designer.js';

// ── Contract 빌더 ───────────────────────────────────────────────

export { ContractBuilder } from 'layer1/contract-builder.js';

// ── 검증기 ──────────────────────────────────────────────────────

export { Layer1Verifier } from 'layer1/verifier.js';

// ── Contract AI 검증기 ───────────────────────────────────────────

export { ContractVerifier } from 'layer1/contract-verifier.js';
export type {
  ContractVerificationIssue,
  ContractVerificationResult,
} from 'layer1/contract-verifier-types.js';

// ── Contract AI 정합성 검증기 ─────────────────────────────────────

export { ContractAiConsistencyVerifier } from 'layer1/contract-ai-consistency-verifier.js';
export type { ContractAiConsistencyDeps } from 'layer1/contract-ai-consistency-verifier.js';

// ── Agent .md 생성 + 검토 ────────────────────────────────────────

export { AgentMdGenerator } from 'layer1/agent-md-generator.js';
export type { AgentMdGeneratorConfig } from 'layer1/agent-md-generator.js';
export { AgentMdReviewer } from 'layer1/agent-md-reviewer.js';
export type { AgentMdReviewInput, AgentReviewResult, ReviewDecision } from 'layer1/agent-md-reviewer.js';

// ── Claude API ──────────────────────────────────────────────────

export {
  ClaudeApi,
  type IClaudeApi,
  type ClaudeApiRequestOptions,
  type ClaudeApiResponse,
  type ClaudeApiResponseMetadata,
  type ClaudeStreamEvent,
  type StreamCallback,
} from 'layer1/claude-api.js';
