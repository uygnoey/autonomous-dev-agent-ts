/**
 * layer3 (3계층) public API / Layer 3 public exports
 *
 * @description
 * KR: 비즈니스 산출물, 통합 문서, E2E 테스트, 버그 에스컬레이션 모듈의 공개 API를 re-export한다.
 * EN: Re-exports the public API of deliverables, integrated docs, E2E testing, and bug escalation.
 */

// ── 구현 클래스 / Implementation classes ────────────────────────

export {
  BugEscalator,
  type BugEscalationResult,
  type ContinuousE2EResult,
  type EscalateBugOptions,
  type IBugEscalator,
  type StepwiseVerificationResult,
  type TriggerLayer2Options,
} from './bug-escalator.js';
export {
  DeliverableBuilder,
  type IDeliverableBuilder,
} from './deliverable-builder.js';
export {
  DocCollaborator,
  type CollabDocState,
  type CollabPhase,
  type IDocCollaborator,
  type Layer1Request,
  type Layer1Response,
  type Layer2Request,
  type Layer2Response,
} from './doc-collaborator.js';
export {
  DocIntegrator,
  type IDocIntegrator,
  type IntegrateOptions,
} from './doc-integrator.js';
export {
  type ContinuousE2EConfig,
  type ContinuousE2ESession,
  type ContinuousE2EStatus,
  type IProductionTester,
  ProductionTester,
  type StartContinuousE2EOptions,
} from './production-tester.js';

// ── 타입 / Types ────────────────────────────────────────────────

export type {
  BugCategory,
  BugReport,
  BugSeverity,
  BusinessDeliverable,
  BusinessDeliverableType,
  CollaborativeDocOptions,
  CollaborativeDocResult,
  Deliverable,
  DeliverableBuildOptions,
  DeliverableMetadata,
  DeliverableStatus,
  DeliverableType,
  DocumentFormat,
  DocumentFragment,
  DocumentSection,
  DocumentTemplate,
  DocumentType,
  E2ETestRun,
  IntegratedDocument,
  ProjectDocumentType,
  TestExecutionReport,
  TestFailure,
} from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

export {
  DEFAULT_BUSINESS_TEMPLATES,
  DEFAULT_CONTINUOUS_E2E_CONFIG,
  DEFAULT_PROJECT_TEMPLATES,
} from './types.js';
