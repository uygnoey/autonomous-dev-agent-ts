/**
 * Layer1 검증 유틸리티 / Layer1 verification utility
 *
 * @description
 * KR: VERIFY Phase에서 layer1 의도 기반 검증을 위한 유틸리티 함수.
 *     Layer1Verifier.verifyAsync()를 래핑하여 agentResults로부터 검증 요청을 생성한다.
 *     layer1Verifier가 없으면 auto-pass 반환한다.
 * EN: Utility for layer1 intent-based verification in VERIFY phase.
 *     Wraps Layer1Verifier.verifyAsync() and builds verification request from agentResults.
 *     Returns auto-pass when layer1Verifier is absent.
 */

import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { Layer1Verifier } from 'layer1/verifier.js';

/** layer1 검증 결과 / Layer1 verification result */
interface Layer1VerifyResult {
  readonly passed: boolean;
  readonly feedback: string;
}

/**
 * verifyWithLayer1에 필요한 최소 의존성 / Minimal deps needed by verifyWithLayer1
 */
interface Layer1VerifierDeps {
  readonly logger: Logger;
  readonly layer1Verifier?: Layer1Verifier;
}

/**
 * layer1 의도 기반 검증을 수행한다 / Performs layer1 intent-based verification
 *
 * @description
 * KR: 에이전트 실행 결과를 종합하여 Layer1Verifier.verifyAsync()로 스펙 의도 충족 여부를 확인한다.
 *     layer1Verifier가 없으면 auto-pass 반환한다.
 * EN: Aggregates agent results and checks spec intent via Layer1Verifier.verifyAsync().
 *     Returns auto-pass when layer1Verifier is absent.
 *
 * @param deps - layer1 검증 의존성 / Layer1 verifier dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param agentResults - 에이전트 실행 결과 맵 / Agent execution results map
 * @returns layer1 검증 결과 / Layer1 verification result
 */
async function verifyWithLayer1(
  deps: Layer1VerifierDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  agentResults: ReadonlyMap<string, { hasError: boolean; lastMessage: string }>,
): Promise<Layer1VerifyResult> {
  if (!deps.layer1Verifier) {
    deps.logger.info('layer1Verifier 미주입 — auto-pass', { featureId });
    return { passed: true, feedback: 'layer1 auto-pass (verifier not configured)' };
  }

  // WHY: 에이전트 피드백을 테스트 결과 문자열로 합산
  const testResults = Array.from(agentResults.entries())
    .map(([agent, result]) => {
      const status = result.hasError ? 'FAIL' : 'PASS';
      return `[${agent}] ${status}: ${result.lastMessage || '(no feedback)'}`;
    })
    .join('\n');

  const verifyResult = await deps.layer1Verifier.verifyAsync({
    featureId,
    implementedCode: handoffPackage.specDocument,
    testResults,
    question: '',
    contractSnapshot: handoffPackage,
  });

  if (!verifyResult.ok) {
    deps.logger.error('layer1 verifyAsync 실패', {
      featureId,
      error: verifyResult.error.message,
    });
    return { passed: false, feedback: `layer1 검증 실패: ${verifyResult.error.message}` };
  }

  return {
    passed: verifyResult.value.passed,
    feedback: verifyResult.value.feedback,
  };
}
