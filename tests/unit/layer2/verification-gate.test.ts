/**
 * VerificationGate 단위 테스트 / VerificationGate unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { VerificationGate } from '../../../src/layer2/verification-gate.js';
import type { VerificationResult } from '../../../src/layer2/types.js';

/**
 * 검증 결과를 생성한다 / Creates a verification result
 */
function createResult(
  featureId: string,
  phase: VerificationResult['phase'],
  passed: boolean,
): VerificationResult {
  return {
    featureId,
    phase,
    passed,
    feedback: passed ? '통과' : '실패',
    timestamp: new Date(),
  };
}

describe('VerificationGate', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    gate = new VerificationGate(logger);
  });

  describe('addResult / 결과 추가', () => {
    it('검증 결과를 추가한다', () => {
      const result = gate.addResult(createResult('feat-1', 'qa_qc', true));
      expect(result.ok).toBe(true);

      const results = gate.getResults('feat-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.phase).toBe('qa_qc');
    });

    it('같은 기능에 여러 결과를 추가할 수 있다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', true));

      const results = gate.getResults('feat-1');
      expect(results).toHaveLength(2);
    });
  });

  describe('isComplete / 완료 여부', () => {
    it('4단계 모두 완료되면 true를 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', true));
      gate.addResult(createResult('feat-1', 'layer1', true));
      gate.addResult(createResult('feat-1', 'adev', true));

      expect(gate.isComplete('feat-1')).toBe(true);
    });

    it('일부 단계만 완료되면 false를 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', true));

      expect(gate.isComplete('feat-1')).toBe(false);
    });

    it('결과가 없으면 false를 반환한다', () => {
      expect(gate.isComplete('feat-1')).toBe(false);
    });
  });

  describe('isAllPassed / 전체 통과 여부', () => {
    it('4단계 모두 통과하면 true를 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', true));
      gate.addResult(createResult('feat-1', 'layer1', true));
      gate.addResult(createResult('feat-1', 'adev', true));

      expect(gate.isAllPassed('feat-1')).toBe(true);
    });

    it('하나라도 실패하면 false를 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', false));
      gate.addResult(createResult('feat-1', 'layer1', true));
      gate.addResult(createResult('feat-1', 'adev', true));

      expect(gate.isAllPassed('feat-1')).toBe(false);
    });

    it('미완료 상태에서는 false를 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      expect(gate.isAllPassed('feat-1')).toBe(false);
    });

    it('재검증 시 최신 결과를 기준으로 판정한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', false)); // 첫 번째: 실패
      gate.addResult(createResult('feat-1', 'reviewer', true));
      gate.addResult(createResult('feat-1', 'layer1', true));
      gate.addResult(createResult('feat-1', 'adev', true));
      gate.addResult(createResult('feat-1', 'qa_qc', true)); // 재검증: 통과

      expect(gate.isAllPassed('feat-1')).toBe(true);
    });
  });

  describe('summarize / 요약 생성', () => {
    it('전체 통과 요약을 생성한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', true));
      gate.addResult(createResult('feat-1', 'layer1', true));
      gate.addResult(createResult('feat-1', 'adev', true));

      const result = gate.summarize('feat-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.summary).toContain('통과');
      }
    });

    it('부분 실패 요약을 생성한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-1', 'reviewer', false));

      const result = gate.summarize('feat-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.summary).toContain('실패');
      }
    });

    it('결과가 없으면 에러를 반환한다', () => {
      const result = gate.summarize('non-existent');
      expect(result.ok).toBe(false);
    });

    it('미완료 단계를 포함한 요약을 생성한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));

      const result = gate.summarize('feat-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.summary).toContain('미완료');
      }
    });
  });

  describe('getResults / 결과 조회', () => {
    it('해당 기능의 결과만 반환한다', () => {
      gate.addResult(createResult('feat-1', 'qa_qc', true));
      gate.addResult(createResult('feat-2', 'qa_qc', true));

      const results = gate.getResults('feat-1');
      expect(results).toHaveLength(1);
      expect(results[0]?.featureId).toBe('feat-1');
    });

    it('결과가 없으면 빈 배열을 반환한다', () => {
      const results = gate.getResults('non-existent');
      expect(results).toHaveLength(0);
    });
  });
});
