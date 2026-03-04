/**
 * 검증 게이트 / Verification Gate
 *
 * @description
 * KR: 4중 검증(qa_qc → reviewer → layer1 → adev)을 관리한다.
 *     각 단계의 결과를 수집하고 전체 통과 여부를 판정한다.
 * EN: Manages 4-layer verification (qa_qc → reviewer → layer1 → adev).
 *     Collects results per stage and determines overall pass/fail.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { VerificationPhase, VerificationResult } from './types.js';

/**
 * 4중 검증 순서 / 4-layer verification order
 *
 * @description
 * KR: 검증은 반드시 이 순서대로 수행된다.
 * EN: Verification must be performed in this exact order.
 */
const VERIFICATION_ORDER: readonly VerificationPhase[] = ['qa_qc', 'reviewer', 'layer1', 'adev'];

/**
 * 검증 게이트 / Verification Gate
 *
 * @description
 * KR: 기능별 4중 검증 결과를 관리하고 최종 판정을 내린다.
 * EN: Manages per-feature 4-layer verification results and final verdict.
 *
 * @example
 * const gate = new VerificationGate(logger);
 * gate.addResult({ featureId: 'feat-1', phase: 'qa_qc', passed: true, ... });
 * if (gate.isAllPassed('feat-1')) logger.info('전체 검증 통과');
 */
export class VerificationGate {
  private readonly results: Map<string, VerificationResult[]> = new Map();
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'verification-gate' });
  }

  /**
   * 검증 결과를 추가한다 / Adds a verification result
   *
   * @param result - 검증 결과 / Verification result
   * @returns 성공 시 ok / ok on success
   */
  addResult(result: VerificationResult): Result<void> {
    const existing = this.results.get(result.featureId) ?? [];
    existing.push(result);
    this.results.set(result.featureId, existing);

    this.logger.info('검증 결과 추가', {
      featureId: result.featureId,
      phase: result.phase,
      passed: result.passed,
    });

    return ok(undefined);
  }

  /**
   * 기능별 검증 결과를 조회한다 / Gets verification results for a feature
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 검증 결과 배열 / Verification results
   */
  getResults(featureId: string): VerificationResult[] {
    return this.results.get(featureId) ?? [];
  }

  /**
   * 4중 검증이 모두 완료되었는지 확인한다 / Checks if all 4 verification phases are done
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 완료 여부 / Whether all phases are done
   */
  isComplete(featureId: string): boolean {
    const featureResults = this.results.get(featureId) ?? [];
    const completedPhases = new Set(featureResults.map((r) => r.phase));
    return VERIFICATION_ORDER.every((phase) => completedPhases.has(phase));
  }

  /**
   * 4중 검증이 모두 통과했는지 확인한다 / Checks if all 4 verification phases passed
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 전체 통과 여부 / Whether all phases passed
   */
  isAllPassed(featureId: string): boolean {
    if (!this.isComplete(featureId)) return false;

    const featureResults = this.results.get(featureId) ?? [];

    // WHY: 각 Phase의 최신 결과만을 기준으로 판정한다 (재검증 가능)
    for (const phase of VERIFICATION_ORDER) {
      const phaseResults = featureResults.filter((r) => r.phase === phase);
      const latest = phaseResults[phaseResults.length - 1];
      if (!latest?.passed) return false;
    }

    return true;
  }

  /**
   * 검증 요약을 생성한다 / Generates verification summary
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 요약 객체: passed 여부와 요약 문자열 / Summary: passed status and summary string
   */
  summarize(featureId: string): Result<{ passed: boolean; summary: string }> {
    const featureResults = this.results.get(featureId);
    if (!featureResults || featureResults.length === 0) {
      return err(
        new AgentError(
          'agent_verification_not_found',
          `기능 '${featureId}'에 대한 검증 결과가 없습니다`,
        ),
      );
    }

    const summaryParts: string[] = [];
    let allPassed = true;

    for (const phase of VERIFICATION_ORDER) {
      const phaseResults = featureResults.filter((r) => r.phase === phase);
      const latest = phaseResults[phaseResults.length - 1];

      if (!latest) {
        summaryParts.push(`${phase}: 미완료`);
        allPassed = false;
      } else {
        const status = latest.passed ? '통과' : '실패';
        summaryParts.push(`${phase}: ${status}`);
        if (!latest.passed) allPassed = false;
      }
    }

    const summary = summaryParts.join(' → ');

    this.logger.info('검증 요약 생성', { featureId, passed: allPassed, summary });

    return ok({ passed: allPassed, summary });
  }
}
