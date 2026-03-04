/**
 * layer1 검증기 / Layer1 verifier
 *
 * @description
 * KR: layer2가 구현한 코드가 원래 의도(대화, 기획)에 부합하는지 검증한다.
 * EN: Verifies that code implemented by layer2 matches the original intent
 *     (conversations, plan).
 */

import type { Logger } from '../core/logger.js';
import { ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { Layer1VerificationRequest, Layer1VerificationResult } from './types.js';

// ── Layer1Verifier ──────────────────────────────────────────────

/**
 * layer1 검증기 / Layer1 verifier
 *
 * @description
 * KR: layer2에서 전달된 구현 결과를 평가하여 합격/불합격을 결정한다.
 *     테스트 결과와 구현 코드를 분석하여 피드백을 제공한다.
 * EN: Evaluates implementation results from layer2 and determines pass/fail.
 *     Analyzes test results and implementation code to provide feedback.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const verifier = new Layer1Verifier(logger);
 * const result = verifier.verify(request);
 */
export class Layer1Verifier {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'layer1-verifier' });
  }

  /**
   * 구현 결과 검증 / Verify implementation result
   *
   * @param request - 검증 요청 / Verification request
   * @returns 검증 결과 / Verification result
   */
  verify(request: Layer1VerificationRequest): Result<Layer1VerificationResult> {
    this.logger.debug('검증 시작', { featureId: request.featureId });

    const issues: string[] = [];

    // WHY: 구현 코드가 비어 있으면 즉시 실패
    if (request.implementedCode.trim().length === 0) {
      issues.push('구현 코드가 비어 있습니다 / Implementation code is empty');
    }

    // WHY: 테스트 결과에서 실패 패턴 탐지
    if (hasTestFailures(request.testResults)) {
      issues.push('테스트 실패가 있습니다 / Test failures detected');
    }

    // WHY: 질문이 있으면 사용자 입력이 필요할 수 있음
    const needsUserInput = request.question.trim().length > 0;

    const passed = issues.length === 0;
    const feedback = passed
      ? '모든 검증을 통과했습니다 / All verifications passed'
      : issues.join('\n');

    const result: Layer1VerificationResult = {
      featureId: request.featureId,
      passed,
      feedback,
      needsUserInput,
    };

    this.logger.info('검증 완료', {
      featureId: request.featureId,
      passed,
      needsUserInput,
    });

    return ok(result);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 테스트 결과에서 실패 패턴 탐지 / Detect failure patterns in test results
 *
 * @param testResults - 테스트 결과 문자열 / Test results string
 * @returns 실패 패턴이 있으면 true / true if failure patterns found
 */
function hasTestFailures(testResults: string): boolean {
  const lower = testResults.toLowerCase();
  const failurePatterns = ['fail', 'error', 'exception', 'not passed'];
  return failurePatterns.some((pattern) => lower.includes(pattern));
}
