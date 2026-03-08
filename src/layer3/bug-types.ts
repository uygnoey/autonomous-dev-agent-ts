/**
 * layer3 버그 리포트 타입 정의 / Layer 3 bug report type definitions
 *
 * @description
 * KR: 버그 심각도, 카테고리, 리포트, 에스컬레이션 결과 관련 타입.
 * EN: Types for bug severity, category, reports, and escalation results.
 */

import type { Phase } from 'core/types.js';

// ── 버그 리포트 / Bug Report ─────────────────────────────────────

/**
 * 버그 심각도 / Bug severity
 */
export type BugSeverity = 'critical' | 'major' | 'high' | 'medium' | 'minor' | 'low';

/**
 * 버그 카테고리 / Bug category
 */
export type BugCategory = 'design-flaw' | 'implementation-bug' | 'test-gap' | 'regression';

/**
 * 버그 리포트 / Bug report
 *
 * @description
 * KR: 3계층 지속 E2E에서 발견한 버그를 2계층에 보고하는 리포트.
 * EN: Bug report sent from Layer 3 continuous E2E to Layer 2.
 */
export interface BugReport {
  /** 리포트 ID / Report ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID (연관된 경우) / Feature ID (if related) */
  readonly featureId?: string;
  /** 버그 제목 / Bug title */
  readonly title: string;
  /** 버그 설명 / Bug description */
  readonly description: string;
  /** 재현 단계 / Reproduction steps */
  readonly reproductionSteps: readonly string[];
  /** 기대 동작 / Expected behavior */
  readonly expectedBehavior: string;
  /** 실제 동작 / Actual behavior */
  readonly actualBehavior: string;
  /** 심각도 / Severity */
  readonly severity: BugSeverity;
  /** 카테고리 / Category */
  readonly category: BugCategory;
  /** 근본 원인 (qc 분석 결과) / Root cause (from qc analysis) */
  readonly rootCause?: string;
  /** 리포트 생성 시각 / Reported at */
  readonly reportedAt: Date;
  /** 에스컬레이션 대상 Phase / Escalation target phase */
  readonly phase?: Phase;
}

/**
 * 버그 에스컬레이션 결과 / Bug escalation result
 *
 * @description
 * KR: 버그를 2계층에 에스컬레이션한 결과.
 * EN: Result of escalating a bug to Layer 2.
 */
export interface BugEscalationResult {
  /** 에스컬레이션 ID / Escalation ID */
  readonly id: string;
  /** 버그 리포트 ID / Bug report ID */
  readonly bugReportId: string;
  /** 2계층 재실행 트리거됨 / Layer 2 re-execution triggered */
  readonly triggered: boolean;
  /** 대상 Phase (architect부터 시작) / Target phase (starting from architect) */
  readonly targetPhase: Phase;
  /** 에스컬레이션 시각 / Escalated at */
  readonly escalatedAt: Date;
}
