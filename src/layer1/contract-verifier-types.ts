/**
 * Contract 검증 결과 타입 / Contract verification result types
 *
 * @description
 * KR: ContractVerifier가 생성하는 검증 이슈 및 최종 결과 타입을 정의한다.
 * EN: Defines verification issue and final result types produced by ContractVerifier.
 */

// ── ContractVerificationIssue ────────────────────────────────────

/**
 * Contract 검증 이슈 / Single verification issue
 *
 * @description
 * KR: 검증 중 발견된 개별 문제를 나타낸다.
 * EN: Represents an individual problem found during verification.
 */
export interface ContractVerificationIssue {
  /** 심각도 / Severity */
  readonly severity: 'error' | 'warning';

  /** 문제 발생 필드 / Field where issue was found */
  readonly field: string;

  /** 문제 설명 / Issue description */
  readonly message: string;
}

// ── ContractVerificationResult ───────────────────────────────────

/**
 * Contract 검증 결과 / Contract verification result
 *
 * @description
 * KR: ContractVerifier.verifyContract()가 반환하는 전체 검증 결과.
 * EN: Full verification result returned by ContractVerifier.verifyContract().
 */
export interface ContractVerificationResult {
  /** 검증 대상 패키지 ID / ID of the verified package */
  readonly packageId: string;

  /** 통과 여부 / Whether verification passed */
  readonly passed: boolean;

  /** 발견된 이슈 목록 / List of found issues */
  readonly issues: readonly ContractVerificationIssue[];

  /** AI 피드백 문자열 / AI feedback string */
  readonly feedback: string;

  /** 사용된 모델 / Model used */
  readonly modelUsed: string;

  /** 에스컬레이션 여부 / Whether escalated */
  readonly escalated: boolean;

  /** 검증 시각 / Verification timestamp */
  readonly timestamp: Date;
}
