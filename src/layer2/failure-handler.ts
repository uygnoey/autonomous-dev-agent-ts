/**
 * 실패 처리기 / Failure Handler
 *
 * @description
 * KR: 실패를 분류하고 복구 방안을 제시한다.
 *     실패 유형에 따라 적절한 Phase로의 롤백을 권장한다.
 *     - design_flaw → DESIGN
 *     - implementation_bug → CODE
 *     - test_gap → TEST
 *     - spec_ambiguity → escalate (layer1)
 *     - infrastructure → retry
 * EN: Classifies failures and suggests recovery actions.
 *     Recommends rollback to appropriate phase based on failure type.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Phase, Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { FailureReport, FailureType, RecoveryAction } from './types.js';

/**
 * 실패 유형별 키워드 매핑 / Keyword mapping per failure type
 *
 * @description
 * KR: 에러 메시지에 포함된 키워드를 기반으로 실패 유형을 추론한다.
 * EN: Infers failure type from keywords in error messages.
 */
const FAILURE_KEYWORDS: ReadonlyMap<FailureType, readonly string[]> = new Map([
  [
    'design_flaw',
    ['architecture', 'design', 'structure', 'interface', '설계', '구조', '인터페이스'],
  ],
  [
    'implementation_bug',
    ['bug', 'error', 'exception', 'crash', 'undefined', '버그', '에러', '오류'],
  ],
  ['test_gap', ['test', 'coverage', 'assertion', 'expect', '테스트', '커버리지']],
  ['spec_ambiguity', ['spec', 'requirement', 'unclear', 'ambiguous', '스펙', '요구사항', '모호']],
  [
    'infrastructure',
    ['timeout', 'connection', 'network', 'rate_limit', '타임아웃', '네트워크', '연결'],
  ],
]);

/**
 * 실패 유형별 복구 Phase 매핑 / Recovery phase mapping per failure type
 */
const RECOVERY_PHASE_MAP: Readonly<Record<FailureType, Phase>> = {
  design_flaw: 'DESIGN',
  implementation_bug: 'CODE',
  test_gap: 'TEST',
  spec_ambiguity: 'DESIGN',
  infrastructure: 'CODE',
  unknown: 'CODE',
};

/**
 * 실패 유형별 복구 동작 매핑 / Recovery action mapping per failure type
 */
const RECOVERY_ACTION_MAP: Readonly<Record<FailureType, RecoveryAction>> = {
  design_flaw: 'rollback_phase',
  implementation_bug: 'rollback_phase',
  test_gap: 'rollback_phase',
  spec_ambiguity: 'escalate_user',
  infrastructure: 'retry',
  unknown: 'retry',
};

/**
 * 실패 처리기 / Failure Handler
 *
 * @description
 * KR: 실패를 분류하고 복구 전략을 결정한다.
 * EN: Classifies failures and determines recovery strategy.
 *
 * @example
 * const handler = new FailureHandler(logger);
 * const report = handler.classify('feat-1', 'CODE', 'undefined is not a function');
 */
export class FailureHandler {
  private reportCounter = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'failure-handler' });
  }

  /**
   * 실패를 분류하고 보고서를 생성한다 / Classifies failure and generates report
   *
   * @param featureId - 기능 ID / Feature ID
   * @param phase - 실패 발생 Phase / Phase where failure occurred
   * @param error - 에러 메시지 / Error message
   * @returns 실패 보고서 / Failure report
   */
  classify(featureId: string, phase: Phase, error: string): Result<FailureReport> {
    if (!error.trim()) {
      return err(new AgentError('agent_invalid_input', '에러 메시지가 비어있습니다'));
    }

    const failureType = this.inferFailureType(error);
    const suggestedAction = RECOVERY_ACTION_MAP[failureType];
    const targetPhase = RECOVERY_PHASE_MAP[failureType];

    this.reportCounter += 1;
    const report: FailureReport = {
      id: `failure-${this.reportCounter}`,
      featureId,
      phase,
      type: failureType,
      description: error,
      rootCause: this.inferRootCause(failureType, error),
      suggestedAction,
      targetPhase,
      timestamp: new Date(),
    };

    this.logger.warn('실패 분류 완료', {
      reportId: report.id,
      featureId,
      phase,
      type: failureType,
      action: suggestedAction,
    });

    return ok(report);
  }

  /**
   * 실패 보고서에서 복구 대상 Phase를 반환한다 / Returns recovery phase from report
   *
   * @param report - 실패 보고서 / Failure report
   * @returns 복구 대상 Phase / Recovery target phase
   */
  getRecoveryPhase(report: FailureReport): Phase {
    return report.targetPhase;
  }

  /**
   * 에러 메시지에서 실패 유형을 추론한다 / Infers failure type from error message
   *
   * @param error - 에러 메시지 / Error message
   * @returns 실패 유형 / Failure type
   */
  private inferFailureType(error: string): FailureType {
    const lowerError = error.toLowerCase();

    for (const [failureType, keywords] of FAILURE_KEYWORDS) {
      for (const keyword of keywords) {
        if (lowerError.includes(keyword.toLowerCase())) {
          return failureType;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 실패 유형과 에러에서 근본 원인을 추론한다 / Infers root cause from failure type and error
   *
   * @param failureType - 실패 유형 / Failure type
   * @param error - 에러 메시지 / Error message
   * @returns 근본 원인 설명 / Root cause description
   */
  private inferRootCause(failureType: FailureType, error: string): string {
    const causeMap: Readonly<Record<FailureType, string>> = {
      design_flaw: '설계 단계의 구조적 결함으로 인한 실패',
      implementation_bug: '구현 단계의 코드 버그로 인한 실패',
      test_gap: '테스트 커버리지 부족 또는 테스트 로직 오류',
      spec_ambiguity: '스펙 모호성으로 인한 해석 차이',
      infrastructure: '인프라/네트워크/시스템 레벨 문제',
      unknown: '원인 미분류',
    };

    return `${causeMap[failureType]}: ${error.slice(0, 200)}`;
  }
}
