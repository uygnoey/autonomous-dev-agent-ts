/**
 * 사용자 체크포인트 타입 / User checkpoint types
 *
 * @description
 * KR: UserCheckpoint에서 사용하는 타입, 인터페이스, 상수를 정의한다.
 * EN: Defines types, interfaces, and constants used by UserCheckpoint.
 */

import type { IntegrationStepResult } from 'layer2/phase-types.js';

/**
 * 사용자 결정 / User decision
 *
 * @description
 * KR: approve = 3계층 진입, revise = 2계층-A/B 재실행, revise_integration = 통합 재검증
 * EN: approve = enter layer3, revise = re-run layer2-A/B, revise_integration = re-run integration
 */
export type UserDecision = 'approve' | 'revise' | 'revise_integration';

/**
 * 사용자 입력 제공자 인터페이스 / User input provider interface
 */
export interface UserInputProvider {
  /** 시스템 메시지를 출력한다 / Outputs a system message */
  system(message: string): void;
  /** 성공 메시지를 출력한다 / Outputs a success message */
  success(message: string): void;
  /** 사용자 입력을 대기한다 / Waits for user input */
  waitForInput(): Promise<{ type: string; text?: string }>;
}

/**
 * 통합 테스트 결과 요약 / Integration test results summary
 */
export interface IntegrationResultsSummary {
  /** 전체 통과 여부 / Whether all passed */
  readonly allPassed: boolean;
  /** 단계별 결과 / Step results */
  readonly stepResults: readonly IntegrationStepResult[];
  /** 실패한 단계 (선택) / Failed step (optional) */
  readonly failedAtStep?: number;
}

/**
 * 테스트 보고서 / Test report
 */
export interface TestReport {
  /** 4중 검증 요약 / Verification summary */
  readonly verificationSummary: string;
  /** 통합 테스트 결과 / Integration results */
  readonly integrationResults: IntegrationResultsSummary;
  /** 생성된 파일 목록 / Generated files */
  readonly generatedFiles: readonly string[];
}

/**
 * 체크포인트 데이터 / Checkpoint data
 */
export interface CheckpointData {
  /** 체크포인트 ID / Checkpoint ID */
  readonly checkpointId: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 검증 결과 요약 / Verification result summary */
  readonly results: string;
  /** 사용자 결정 (선택) / User decision (optional) */
  readonly decision?: UserDecision;
  /** 사용자 피드백 (선택) / User feedback (optional) */
  readonly feedback?: string;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
}

/**
 * 이슈 심각도 / Issue severity
 */
export type IssueSeverity = 'critical' | 'normal';

/**
 * 크리티컬 이슈 대응 / Critical issue response
 */
export type CriticalIssueResponse = 'acknowledge' | 'abort';

/** 크리티컬 키워드 목록 / Critical keywords list */
export const CRITICAL_KEYWORDS = [
  '보안',
  'security',
  'crash',
  '데이터 손실',
  'data loss',
  '치명적',
  'critical',
] as const;
