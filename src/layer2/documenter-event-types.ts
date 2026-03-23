/**
 * documenter 이벤트 타입 정의 / Documenter event type definitions
 *
 * @description
 * KR: documenter가 트리거되는 5가지 이벤트 유형과 각 이벤트의 컨텍스트를 정의한다.
 *     - feature_complete: 기능 완료 시
 *     - test_executed: 테스트 실행 시 (완료/실패)
 *     - bug_detected: 버그 발생 시
 *     - phase_boundary: Phase 경계 전환 시
 *     - translation: 다국어 번역 요청 시
 * EN: Defines 5 event types that trigger the documenter agent and their context.
 */

import type { Phase } from 'core/types.js';

// ── documenter 이벤트 유형 / Documenter event types ─────────────

/**
 * documenter를 트리거하는 이벤트 유형 / Event types that trigger the documenter
 */
export type DocumenterEventType =
  | 'feature_complete'  // 기능 완료 / Feature completed
  | 'test_executed'     // 테스트 실행 (완료/실패) / Test executed (pass/fail)
  | 'bug_detected'      // 버그 발생 / Bug detected
  | 'phase_boundary'    // Phase 경계 전환 / Phase boundary transition
  | 'translation';      // 다국어 번역 요청 / Translation request

// ── 이벤트별 컨텍스트 / Event-specific contexts ──────────────────

/**
 * 기능 완료 이벤트 컨텍스트 / Feature complete event context
 *
 * @description
 * KR: 기능 설명서, API 연동 정의서, 아키텍처 변경 이력 생성에 필요한 컨텍스트.
 * EN: Context needed to generate feature docs, API definitions, architecture changelog.
 */
export interface FeatureCompleteContext {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 기능 이름 / Feature name */
  readonly featureName: string;
  /** 변경된 파일 목록 / Changed files */
  readonly changedFiles: readonly string[];
  /** 기능 설명 / Feature description */
  readonly description: string;
}

/**
 * 테스트 실행 이벤트 컨텍스트 / Test executed event context
 *
 * @description
 * KR: 테스트 결과서, 커버리지 리포트, 성능 벤치마크 생성에 필요한 컨텍스트.
 * EN: Context needed to generate test reports, coverage reports, benchmark reports.
 */
export interface TestExecutedContext {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 테스트 통과 여부 / Whether tests passed */
  readonly passed: boolean;
  /** 전체 테스트 수 / Total test count */
  readonly totalTests: number;
  /** 통과 테스트 수 / Passed test count */
  readonly passedTests: number;
  /** 실패 테스트 수 / Failed test count */
  readonly failedTests: number;
  /** 커버리지 비율 (0~1) / Coverage ratio (0~1) */
  readonly coverage: number;
  /** 실패 메시지 목록 / Failure messages */
  readonly failureMessages: readonly string[];
}

/**
 * 버그 발생 이벤트 컨텍스트 / Bug detected event context
 *
 * @description
 * KR: 버그 리포트, 수정 내역서, 회귀 테스트 결과 생성에 필요한 컨텍스트.
 * EN: Context needed to generate bug reports, fix changelogs, regression test results.
 */
export interface BugDetectedContext {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** Phase에서 발견됨 / Phase where detected */
  readonly phase: Phase;
  /** 재현 경로 / Reproduction path */
  readonly reproductionPath: string;
  /** 근본 원인 / Root cause */
  readonly rootCause: string;
  /** 영향 범위 / Impact scope */
  readonly impactScope: string;
}

/**
 * Phase 경계 이벤트 컨텍스트 / Phase boundary event context
 *
 * @description
 * KR: CHANGELOG, 의사결정 기록, 코드 리뷰 요약 생성에 필요한 컨텍스트.
 * EN: Context needed to generate CHANGELOG, decision records, code review summaries.
 */
export interface PhaseBoundaryContext {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 이전 Phase / Previous phase */
  readonly fromPhase: Phase;
  /** 다음 Phase / Next phase */
  readonly toPhase: Phase;
  /** 전환 사유 / Transition reason */
  readonly reason: string;
  /** 에이전트 간 의사결정 요약 / Agent decision summary */
  readonly decisionSummary: string;
}

/**
 * 다국어 번역 이벤트 컨텍스트 / Translation event context
 *
 * @description
 * KR: 기존 문서를 다른 언어로 번역할 때 필요한 컨텍스트.
 * EN: Context needed for translating existing documents to other languages.
 */
export interface TranslationContext {
  /** 원본 문서 경로 / Source document path */
  readonly sourceDocPath: string;
  /** 대상 언어 목록 / Target languages */
  readonly targetLanguages: readonly string[];
  /** 기술 용어 보존 여부 / Whether to preserve technical terms */
  readonly preserveTechnicalTerms: boolean;
}

// ── DocumenterEvent 통합 타입 / Unified DocumenterEvent ─────────

/**
 * documenter 이벤트 (디스크리미네이티드 유니온) / Documenter event (discriminated union)
 *
 * @description
 * KR: 이벤트 유형에 따라 적절한 컨텍스트를 제공하는 통합 이벤트 타입.
 * EN: Unified event type providing appropriate context per event type.
 */
export type DocumenterEvent =
  | {
      readonly type: 'feature_complete';
      readonly projectId: string;
      readonly context: FeatureCompleteContext;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'test_executed';
      readonly projectId: string;
      readonly context: TestExecutedContext;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'bug_detected';
      readonly projectId: string;
      readonly context: BugDetectedContext;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'phase_boundary';
      readonly projectId: string;
      readonly context: PhaseBoundaryContext;
      readonly timestamp: Date;
    }
  | {
      readonly type: 'translation';
      readonly projectId: string;
      readonly context: TranslationContext;
      readonly timestamp: Date;
    };

/**
 * 이벤트별 생성할 문서 목록 / Documents to generate per event type
 *
 * @description
 * KR: documenter가 각 이벤트 유형에서 생성해야 할 문서 목록을 정의한다.
 * EN: Defines documents the documenter must generate for each event type.
 */
export const DOCUMENTER_OUTPUT_MAP: Readonly<Record<DocumenterEventType, readonly string[]>> = {
  feature_complete: [
    '기능 설명서 (자연어)',
    'API 연동 정의서',
    '아키텍처 변경 이력',
  ],
  test_executed: [
    'Unit/Module/E2E 테스트 결과서',
    '커버리지 리포트',
    '성능 벤치마크 리포트',
  ],
  bug_detected: [
    '버그 리포트 (재현 경로, 원인, 영향 범위)',
    '수정 내역서',
    '회귀 테스트 결과',
  ],
  phase_boundary: [
    'CHANGELOG (git diff → 일반 언어 번역)',
    '에이전트 간 의사결정 기록',
    '설계 변경 사유서',
    '코드 리뷰 결과 요약',
  ],
  translation: [
    '번역된 문서 (대상 언어별)',
  ],
};
