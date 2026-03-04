/**
 * layer3 (3계층) 타입 정의 / Layer 3 type definitions
 *
 * @description
 * KR: 비즈니스 산출물, 통합 문서, 지속 E2E 테스트, 버그 에스컬레이션에 사용되는 타입.
 * EN: Types for business deliverables, integrated documents, continuous E2E testing, and bug escalation.
 */

import type { Phase } from '../core/types.js';

// ── 문서 템플릿 / Document Template ─────────────────────────────

/**
 * 문서 유형 / Document type
 *
 * @description
 * KR: 생성 가능한 문서 유형을 정의한다.
 * EN: Defines the types of documents that can be generated.
 */
export type DocumentType =
  | 'api-reference'
  | 'user-guide'
  | 'architecture'
  | 'changelog'
  | 'test-report'
  | 'custom';

/**
 * 문서 템플릿 / Document template
 *
 * @description
 * KR: 문서 생성에 사용할 템플릿 구조를 정의한다.
 * EN: Defines the template structure used for document generation.
 */
export interface DocumentTemplate {
  readonly type: DocumentType;
  readonly title: string;
  readonly sections: readonly DocumentSection[];
  readonly language: 'ko' | 'en' | 'bilingual';
}

/**
 * 문서 섹션 / Document section
 *
 * @description
 * KR: 문서 템플릿 내 개별 섹션.
 * EN: Individual section within a document template.
 */
export interface DocumentSection {
  readonly heading: string;
  readonly content: string;
  readonly order: number;
  readonly required: boolean;
}

// ── 산출물 / Deliverable ────────────────────────────────────────

/**
 * 산출물 유형 / Deliverable type
 */
export type DeliverableType = 'portfolio' | 'business-plan' | 'presentation' | 'report' | 'custom';

/**
 * 비즈니스 산출물 / Business deliverable
 *
 * @description
 * KR: 프로젝트에서 생성된 비즈니스 산출물.
 * EN: Business deliverable generated from a project.
 */
export interface Deliverable {
  readonly id: string;
  readonly type: DeliverableType;
  readonly title: string;
  readonly content: string;
  readonly format: 'markdown' | 'html' | 'json';
  readonly createdAt: Date;
  readonly projectId: string;
}

// ── 통합 문서 / Integrated Document ─────────────────────────────

/**
 * 통합 문서 / Integrated document (from layer2 fragments)
 *
 * @description
 * KR: layer2의 조각 문서들을 통합한 프로젝트 문서.
 * EN: Project document integrated from layer2 document fragments.
 */
export interface IntegratedDocument {
  readonly id: string;
  readonly projectId: string;
  readonly template: DocumentTemplate;
  readonly content: string;
  readonly sourceFragments: readonly string[];
  readonly generatedAt: Date;
  readonly version: number;
}

// ── 버그 리포트 / Bug Report ────────────────────────────────────

/**
 * 버그 리포트 / Bug report for escalation to layer2
 *
 * @description
 * KR: E2E 테스트 실패에서 생성된 버그 리포트. layer2로 에스컬레이션한다.
 * EN: Bug report generated from E2E test failures. Escalated to layer2.
 */
export interface BugReport {
  readonly id: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly severity: 'critical' | 'major' | 'minor';
  readonly description: string;
  readonly stackTrace: string;
  readonly phase: Phase;
  readonly reproducible: boolean;
  readonly timestamp: Date;
}

// ── E2E 테스트 / E2E Test ───────────────────────────────────────

/**
 * E2E 테스트 실행 결과 / E2E test run result
 *
 * @description
 * KR: 지속 E2E 테스트 한 번의 실행 결과.
 * EN: Result of a single continuous E2E test run.
 */
export interface E2ETestRun {
  readonly id: string;
  readonly projectId: string;
  readonly totalTests: number;
  readonly passedTests: number;
  readonly failedTests: number;
  readonly duration: number;
  readonly failures: readonly TestFailure[];
  readonly timestamp: Date;
}

/**
 * 테스트 실패 정보 / Test failure information
 *
 * @description
 * KR: 개별 테스트 실패의 상세 정보.
 * EN: Details of an individual test failure.
 */
export interface TestFailure {
  readonly testName: string;
  readonly error: string;
  readonly featureId: string;
}
