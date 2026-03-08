/**
 * layer3 (3계층) 타입 정의 — 재내보내기 배럴 / Layer 3 type definitions — re-export barrel
 *
 * @description
 * KR: 하위 타입 모듈을 통합하여 단일 진입점을 제공한다.
 * EN: Aggregates sub-type modules to provide a single entry point.
 */

export type {
  BusinessDeliverableType,
  CollaborativeDocOptions,
  CollaborativeDocResult,
  DocumentFormat,
  DocumentFragment,
  DocumentSection,
  DocumentTemplate,
  DocumentType,
  IntegratedDocument,
  ProjectDocumentType,
} from 'layer3/doc-types.js';

export type {
  BugCategory,
  BugEscalationResult,
  BugReport,
  BugSeverity,
} from 'layer3/bug-types.js';

export type {
  ContinuousE2EConfig,
  ContinuousE2EResult,
  E2ETestRun,
  TestExecutionReport,
  TestFailure,
} from 'layer3/e2e-types.js';
export { DEFAULT_CONTINUOUS_E2E_CONFIG } from 'layer3/e2e-types.js';

export type {
  BusinessDeliverable,
  Deliverable,
  DeliverableBuildOptions,
  DeliverableMetadata,
  DeliverableStatus,
  DeliverableType,
} from 'layer3/deliverable-types.js';
export { DEFAULT_BUSINESS_TEMPLATES, DEFAULT_PROJECT_TEMPLATES } from 'layer3/deliverable-types.js';
