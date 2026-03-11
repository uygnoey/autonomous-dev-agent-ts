/**
 * layer1 검증기 / Layer1 verifier
 *
 * @description
 * KR: layer2가 구현한 코드가 원래 의도(대화, 기획)에 부합하는지 검증한다.
 * EN: Verifies that code implemented by layer2 matches the original intent
 *     (conversations, plan).
 */

import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { Layer1VerificationRequest, Layer1VerificationResult } from 'layer1/types.js';

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
 * @param claudeApi - Claude API 인스턴스 (선택) / Claude API instance (optional)
 *
 * @example
 * const verifier = new Layer1Verifier(logger);
 * const result = verifier.verify(request);
 *
 * @example
 * // With AI-powered async verification
 * const verifier = new Layer1Verifier(logger, claudeApi);
 * const result = await verifier.verifyAsync(request);
 */
export class Layer1Verifier {
  private readonly logger: Logger;
  private readonly claudeApi?: ClaudeApi;

  constructor(logger: Logger, claudeApi?: ClaudeApi) {
    this.logger = logger.child({ module: 'layer1-verifier' });
    this.claudeApi = claudeApi;
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

  /**
   * 비동기 구현 결과 검증 (AI 선택 지원) / Async verification with optional AI
   *
   * @description
   * KR: 로컬 검사를 먼저 수행한 뒤, claudeApi가 주입된 경우 AI 판정도 수행한다.
   *     claudeApi가 없으면 로컬 결과만 반환한다.
   * EN: Performs local checks first, then AI judgment if claudeApi is injected.
   *     Falls back to local result when claudeApi is absent.
   *
   * @param request - 검증 요청 / Verification request
   * @returns 검증 결과 / Verification result
   *
   * @example
   * const result = await verifier.verifyAsync(request);
   * if (result.ok && result.value.passed) {
   *   // 검증 통과
   * }
   */
  async verifyAsync(
    request: Layer1VerificationRequest,
  ): Promise<Result<Layer1VerificationResult, AdevError>> {
    this.logger.debug('비동기 검증 시작 / Starting async verification', {
      featureId: request.featureId,
    });

    // WHY: 로컬 검사를 먼저 수행해 API 호출을 최소화한다.
    const localResult = this.verify(request);
    if (!localResult.ok) {
      return localResult;
    }

    const local = localResult.value;

    // WHY: claudeApi 없으면 로컬 판정으로 폴백한다.
    if (!this.claudeApi) {
      this.logger.debug('claudeApi 없음 — 로컬 판정 반환 / No claudeApi — returning local result', {
        featureId: request.featureId,
      });
      return ok(local);
    }

    // WHY: 로컬 검사를 통과한 경우에만 Claude API 호출로 추가 판정한다.
    const aiPrompt = buildAiVerificationPrompt(request);

    const apiResult = await this.claudeApi.createMessage([{ role: 'user', content: aiPrompt }], {
      maxTokens: 512,
    });

    if (!apiResult.ok) {
      this.logger.warn(
        'AI 검증 실패 — 로컬 판정 사용 / AI verification failed — using local result',
        {
          featureId: request.featureId,
          error: apiResult.error.code,
        },
      );
      // WHY: AI 오류 시 로컬 판정으로 폴백한다. 에러를 올리지 않는다.
      return ok(local);
    }

    const aiContent = apiResult.value.content.trim().toUpperCase();
    const aiPassed = aiContent.includes('PASS') && !aiContent.startsWith('FAIL');

    const result: Layer1VerificationResult = {
      featureId: request.featureId,
      passed: local.passed && aiPassed,
      feedback: aiPassed
        ? '로컬 + AI 검증을 모두 통과했습니다 / Passed both local and AI verification'
        : `AI 검증 실패 / AI verification failed: ${apiResult.value.content.slice(0, 200)}`,
      needsUserInput: local.needsUserInput,
    };

    this.logger.info('비동기 검증 완료 / Async verification complete', {
      featureId: request.featureId,
      passed: result.passed,
      aiPassed,
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

/**
 * AI 검증용 프롬프트 빌드 / Build AI verification prompt
 *
 * @param request - 검증 요청 / Verification request
 * @returns 프롬프트 문자열 / Prompt string
 */
function buildAiVerificationPrompt(request: Layer1VerificationRequest): string {
  return [
    'Review the following implementation result and respond with PASS or FAIL:',
    `Feature ID: ${request.featureId}`,
    `Test Results: ${request.testResults.slice(0, 500)}`,
    `Question: ${request.question || '(none)'}`,
    `Implementation Code Length: ${request.implementedCode.length} chars`,
  ].join('\n');
}
