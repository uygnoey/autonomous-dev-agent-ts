/**
 * layer3 (3계층) public API / Layer 3 public exports
 *
 * @description
 * KR: 비즈니스 산출물, 통합 문서, E2E 테스트, 버그 에스컬레이션 모듈의 공개 API를 re-export한다.
 * EN: Re-exports the public API of deliverables, integrated docs, E2E testing, and bug escalation.
 */

// ── 구현 클래스 / Implementation classes ────────────────────────

export { BugEscalator } from './bug-escalator.js';
export { DeliverableBuilder } from './deliverable-builder.js';
export { DocCollaborator } from './doc-collaborator.js';
export { DocIntegrator } from './doc-integrator.js';
export { ProductionTester } from './production-tester.js';

// ── 타입 / Types ────────────────────────────────────────────────

export type {
  BugReport,
  Deliverable,
  DeliverableType,
  DocumentSection,
  DocumentTemplate,
  DocumentType,
  E2ETestRun,
  IntegratedDocument,
  TestFailure,
} from './types.js';
