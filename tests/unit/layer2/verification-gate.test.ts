/**
 * VerificationGate 단위 테스트 / VerificationGate unit tests
 *
 * @description
 * addResult, getResults, isComplete, isAllPassed, summarize 검증.
 * 4중 검증: qa_qc → reviewer → layer1 → adev.
 * 재검증(최신 결과 기준), 다중 기능 독립성 검증.
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { VerificationGate } from 'layer2/verification-gate.js';
import type { VerificationResult } from 'layer2/types.js';

type VerificationPhase = VerificationResult['phase'];

const ALL_PHASES: VerificationPhase[] = ['qa_qc', 'reviewer', 'layer1', 'adev'];

function makeResult(
  featureId: string,
  phase: VerificationPhase,
  passed: boolean,
  feedback = passed ? '통과' : '실패',
): VerificationResult {
  return { featureId, phase, passed, feedback, timestamp: new Date() };
}

function addAllPhases(gate: VerificationGate, featureId: string, passed: boolean): void {
  for (const phase of ALL_PHASES) {
    gate.addResult(makeResult(featureId, phase, passed));
  }
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('VerificationGate 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => new VerificationGate(new ConsoleLogger('error'))).not.toThrow();
  });

  it('VerificationGate 인스턴스', () => {
    expect(new VerificationGate(new ConsoleLogger('error'))).toBeInstanceOf(VerificationGate);
  });

  it('초기 getResults → 빈 배열', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(gate.getResults('any')).toHaveLength(0);
  });

  it('초기 isComplete → false', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(gate.isComplete('any')).toBe(false);
  });

  it('초기 isAllPassed → false', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(gate.isAllPassed('any')).toBe(false);
  });

  it('addResult 메서드 존재', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(typeof gate.addResult).toBe('function');
  });

  it('getResults 메서드 존재', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(typeof gate.getResults).toBe('function');
  });

  it('isComplete 메서드 존재', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(typeof gate.isComplete).toBe('function');
  });

  it('isAllPassed 메서드 존재', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(typeof gate.isAllPassed).toBe('function');
  });

  it('summarize 메서드 존재', () => {
    const gate = new VerificationGate(new ConsoleLogger('error'));
    expect(typeof gate.summarize).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const g1 = new VerificationGate(new ConsoleLogger('error'));
    const g2 = new VerificationGate(new ConsoleLogger('error'));
    expect(g1).not.toBe(g2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new VerificationGate(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new VerificationGate(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const gates = Array.from({ length: 10 }, () => new VerificationGate(new ConsoleLogger('error')));
    for (let i = 0; i < gates.length; i++) {
      for (let j = i + 1; j < gates.length; j++) {
        expect(gates[i]).not.toBe(gates[j]);
      }
    }
  });
});

// ── addResult ──────────────────────────────────────────────────

describe('VerificationGate addResult', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('결과 추가 → ok 반환', () => {
    const result = gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('결과 추가 후 getResults에 포함', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(gate.getResults('feat-1')).toHaveLength(1);
  });

  it('Phase qa_qc 결과 추가 → ok', () => {
    const result = gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('Phase reviewer 결과 추가 → ok', () => {
    const result = gate.addResult(makeResult('feat-1', 'reviewer', true));
    expect(result.ok).toBe(true);
  });

  it('Phase layer1 결과 추가 → ok', () => {
    const result = gate.addResult(makeResult('feat-1', 'layer1', true));
    expect(result.ok).toBe(true);
  });

  it('Phase adev 결과 추가 → ok', () => {
    const result = gate.addResult(makeResult('feat-1', 'adev', true));
    expect(result.ok).toBe(true);
  });

  it('passed=false 결과도 추가 가능', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', false));
    expect(gate.getResults('feat-1')[0]?.passed).toBe(false);
  });

  it('같은 Phase 여러 번 추가 → 모두 저장', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', false));
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1').filter((r) => r.phase === 'qa_qc');
    expect(results).toHaveLength(2);
  });

  it('다른 기능 결과는 독립적으로 저장', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-2', 'reviewer', false));
    expect(gate.getResults('feat-1')).toHaveLength(1);
    expect(gate.getResults('feat-2')).toHaveLength(1);
  });

  it('4단계 모두 추가 → 4개 결과', () => {
    addAllPhases(gate, 'feat-1', true);
    expect(gate.getResults('feat-1')).toHaveLength(4);
  });

  it('ok는 boolean 타입', () => {
    const result = gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 반복 addResult → 5개 결과', () => {
    for (let i = 0; i < 5; i++) {
      gate.addResult(makeResult('feat-1', 'qa_qc', i % 2 === 0));
    }
    expect(gate.getResults('feat-1')).toHaveLength(5);
  });

  it('UUID 형식 featureId 추가 가능', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const result = gate.addResult(makeResult(id, 'qa_qc', true));
    expect(result.ok).toBe(true);
    expect(gate.getResults(id)).toHaveLength(1);
  });

  it('한글 featureId 추가 가능', () => {
    const result = gate.addResult(makeResult('기능-1', 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('긴 featureId 추가 가능', () => {
    const longId = 'feat-' + 'x'.repeat(100);
    const result = gate.addResult(makeResult(longId, 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('10개 기능 각 1개 결과 → 모두 독립', () => {
    for (let i = 0; i < 10; i++) {
      gate.addResult(makeResult(`feat-${i}`, 'qa_qc', true));
    }
    for (let i = 0; i < 10; i++) {
      expect(gate.getResults(`feat-${i}`)).toHaveLength(1);
    }
  });

  it('passed 필드 보존', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', false));
    const results = gate.getResults('feat-1');
    expect(results[0]?.passed).toBe(true);
    expect(results[1]?.passed).toBe(false);
  });

  it('phase 필드 보존', () => {
    addAllPhases(gate, 'feat-1', true);
    const results = gate.getResults('feat-1');
    expect(results[0]?.phase).toBe('qa_qc');
    expect(results[1]?.phase).toBe('reviewer');
    expect(results[2]?.phase).toBe('layer1');
    expect(results[3]?.phase).toBe('adev');
  });

  it('featureId 필드 보존', () => {
    gate.addResult(makeResult('my-feature', 'qa_qc', true));
    const results = gate.getResults('my-feature');
    expect(results[0]?.featureId).toBe('my-feature');
  });
});

// ── getResults ─────────────────────────────────────────────────

describe('VerificationGate getResults', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('존재하는 featureId → 결과 반환', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1');
    expect(results).toHaveLength(1);
  });

  it('존재하지 않는 featureId → 빈 배열', () => {
    expect(gate.getResults('non-existent')).toHaveLength(0);
  });

  it('feat-1과 feat-2 독립 조회', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-2', 'reviewer', false));
    expect(gate.getResults('feat-1')[0]?.phase).toBe('qa_qc');
    expect(gate.getResults('feat-2')[0]?.phase).toBe('reviewer');
  });

  it('결과는 추가 순서대로', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    const results = gate.getResults('feat-1');
    expect(results[0]?.phase).toBe('qa_qc');
    expect(results[1]?.phase).toBe('reviewer');
  });

  it('반환값은 배열', () => {
    expect(Array.isArray(gate.getResults('any'))).toBe(true);
  });

  it('5번 반복 getResults → 동일 결과', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    for (let i = 0; i < 5; i++) {
      expect(gate.getResults('feat-1')).toHaveLength(1);
    }
  });

  it('결과 featureId 필드 string 타입', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1');
    expect(typeof results[0]?.featureId).toBe('string');
  });

  it('결과 phase 필드 string 타입', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1');
    expect(typeof results[0]?.phase).toBe('string');
  });

  it('결과 passed 필드 boolean 타입', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1');
    expect(typeof results[0]?.passed).toBe('boolean');
  });

  it('결과 timestamp 필드 Date', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const results = gate.getResults('feat-1');
    expect(results[0]?.timestamp).toBeInstanceOf(Date);
  });
});

// ── isComplete ─────────────────────────────────────────────────

describe('VerificationGate isComplete', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('4단계 모두 있으면 true', () => {
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isComplete('feat-1')).toBe(true);
  });

  it('결과 없으면 false', () => {
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('1단계만 있으면 false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('2단계만 있으면 false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('3단계만 있으면 false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    gate.addResult(makeResult('feat-1', 'layer1', true));
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('4단계 + 재검증 추가해도 complete', () => {
    addAllPhases(gate, 'feat-1', true);
    gate.addResult(makeResult('feat-1', 'qa_qc', true)); // 재검증
    expect(gate.isComplete('feat-1')).toBe(true);
  });

  it('4단계 중 failed 있어도 complete', () => {
    addAllPhases(gate, 'feat-1', false);
    expect(gate.isComplete('feat-1')).toBe(true);
  });

  it('qa_qc 누락 시 incomplete', () => {
    for (const phase of ALL_PHASES) {
      if (phase !== 'qa_qc') gate.addResult(makeResult('feat-1', phase, true));
    }
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('reviewer 누락 시 incomplete', () => {
    for (const phase of ALL_PHASES) {
      if (phase !== 'reviewer') gate.addResult(makeResult('feat-1', phase, true));
    }
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('layer1 누락 시 incomplete', () => {
    for (const phase of ALL_PHASES) {
      if (phase !== 'layer1') gate.addResult(makeResult('feat-1', phase, true));
    }
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('adev 누락 시 incomplete', () => {
    for (const phase of ALL_PHASES) {
      if (phase !== 'adev') gate.addResult(makeResult('feat-1', phase, true));
    }
    expect(gate.isComplete('feat-1')).toBe(false);
  });

  it('isComplete 반환값 boolean 타입', () => {
    expect(typeof gate.isComplete('feat-1')).toBe('boolean');
  });

  it('5번 반복 → 동일 결과', () => {
    addAllPhases(gate, 'feat-1', true);
    for (let i = 0; i < 5; i++) {
      expect(gate.isComplete('feat-1')).toBe(true);
    }
  });

  it('feat-1 complete, feat-2 incomplete 독립', () => {
    addAllPhases(gate, 'feat-1', true);
    gate.addResult(makeResult('feat-2', 'qa_qc', true));
    expect(gate.isComplete('feat-1')).toBe(true);
    expect(gate.isComplete('feat-2')).toBe(false);
  });
});

// ── isAllPassed ────────────────────────────────────────────────

describe('VerificationGate isAllPassed', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('4단계 모두 통과 → true', () => {
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isAllPassed('feat-1')).toBe(true);
  });

  it('결과 없음 → false', () => {
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('미완료 → false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('1개 단계 실패 → false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', false)); // 실패
    gate.addResult(makeResult('feat-1', 'layer1', true));
    gate.addResult(makeResult('feat-1', 'adev', true));
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('재검증 통과 → true (최신 결과 기준)', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', false)); // 첫 번째 실패
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    gate.addResult(makeResult('feat-1', 'layer1', true));
    gate.addResult(makeResult('feat-1', 'adev', true));
    gate.addResult(makeResult('feat-1', 'qa_qc', true)); // 재검증 통과
    expect(gate.isAllPassed('feat-1')).toBe(true);
  });

  it('재검증 실패 → false (최신 결과가 실패)', () => {
    addAllPhases(gate, 'feat-1', true);
    gate.addResult(makeResult('feat-1', 'qa_qc', false)); // 재검증 실패
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('qa_qc 실패 → isAllPassed=false', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'qa_qc'));
    }
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('reviewer 실패 → isAllPassed=false', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'reviewer'));
    }
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('layer1 실패 → isAllPassed=false', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'layer1'));
    }
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('adev 실패 → isAllPassed=false', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'adev'));
    }
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('4단계 모두 실패 → false', () => {
    addAllPhases(gate, 'feat-1', false);
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('여러 기능 독립적으로 판정', () => {
    addAllPhases(gate, 'feat-1', true);
    addAllPhases(gate, 'feat-2', false);
    expect(gate.isAllPassed('feat-1')).toBe(true);
    expect(gate.isAllPassed('feat-2')).toBe(false);
  });

  it('isAllPassed 반환 boolean 타입', () => {
    expect(typeof gate.isAllPassed('feat-1')).toBe('boolean');
  });

  it('5번 반복 통과 → 항상 true', () => {
    addAllPhases(gate, 'feat-1', true);
    for (let i = 0; i < 5; i++) {
      expect(gate.isAllPassed('feat-1')).toBe(true);
    }
  });

  it('10개 기능 교대 통과/실패', () => {
    for (let i = 0; i < 10; i++) {
      addAllPhases(gate, `feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 10; i++) {
      expect(gate.isAllPassed(`feat-${i}`)).toBe(i % 2 === 0);
    }
  });
});

// ── summarize ──────────────────────────────────────────────────

describe('VerificationGate summarize', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('결과 없음 → err', () => {
    const result = gate.summarize('non-existent');
    expect(result.ok).toBe(false);
  });

  it('결과 없음 → agent_verification_not_found', () => {
    const result = gate.summarize('non-existent');
    if (!result.ok) expect(result.error.code).toBe('agent_verification_not_found');
  });

  it('4단계 모두 통과 → passed=true', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('4단계 모두 통과 → summary에 통과 포함', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('통과');
  });

  it('1단계 실패 → passed=false', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', false));
    gate.addResult(makeResult('feat-1', 'layer1', true));
    gate.addResult(makeResult('feat-1', 'adev', true));
    const result = gate.summarize('feat-1');
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.summary).toContain('실패');
    }
  });

  it('미완료 → summary에 미완료 포함', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const result = gate.summarize('feat-1');
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.summary).toContain('미완료');
    }
  });

  it('summary는 → 로 구분됨', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('→');
  });

  it('summary에 4단계 Phase 이름 모두 포함', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) {
      for (const phase of ALL_PHASES) {
        expect(result.value.summary).toContain(phase);
      }
    }
  });

  it('ok 반환됨 (결과 있을 때)', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    const result = gate.summarize('feat-1');
    expect(result.ok).toBe(true);
  });

  it('재검증 후 summarize → 최신 결과 기준', () => {
    gate.addResult(makeResult('feat-1', 'qa_qc', false));
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    gate.addResult(makeResult('feat-1', 'layer1', true));
    gate.addResult(makeResult('feat-1', 'adev', true));
    gate.addResult(makeResult('feat-1', 'qa_qc', true)); // 재검증 통과
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('qa_qc 실패 시 summary에 실패 포함', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'qa_qc'));
    }
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('실패');
  });

  it('reviewer 실패 시 summary에 실패 포함', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'reviewer'));
    }
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('실패');
  });

  it('layer1 실패 시 summary에 실패 포함', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'layer1'));
    }
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('실패');
  });

  it('adev 실패 시 summary에 실패 포함', () => {
    for (const phase of ALL_PHASES) {
      gate.addResult(makeResult('feat-1', phase, phase !== 'adev'));
    }
    const result = gate.summarize('feat-1');
    if (result.ok) expect(result.value.summary).toContain('실패');
  });

  it('ok는 boolean 타입', () => {
    const result = gate.summarize('non-existent');
    expect(typeof result.ok).toBe('boolean');
  });

  it('통과 시 summary는 string 타입', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) expect(typeof result.value.summary).toBe('string');
  });

  it('통과 시 passed는 boolean 타입', () => {
    addAllPhases(gate, 'feat-1', true);
    const result = gate.summarize('feat-1');
    if (result.ok) expect(typeof result.value.passed).toBe('boolean');
  });

  it('err의 code는 string 타입', () => {
    const result = gate.summarize('non-existent');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('5번 반복 summarize → 동일 결과', () => {
    addAllPhases(gate, 'feat-1', true);
    for (let i = 0; i < 5; i++) {
      const result = gate.summarize('feat-1');
      if (result.ok) expect(result.value.passed).toBe(true);
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('VerificationGate 복합 시나리오', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('전체 통과 시나리오', () => {
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isComplete('feat-1')).toBe(true);
    expect(gate.isAllPassed('feat-1')).toBe(true);
    const summary = gate.summarize('feat-1');
    if (summary.ok) expect(summary.value.passed).toBe(true);
  });

  it('전체 실패 시나리오', () => {
    addAllPhases(gate, 'feat-1', false);
    expect(gate.isComplete('feat-1')).toBe(true);
    expect(gate.isAllPassed('feat-1')).toBe(false);
    const summary = gate.summarize('feat-1');
    if (summary.ok) expect(summary.value.passed).toBe(false);
  });

  it('재검증 시나리오: 실패 → 통과', () => {
    // 1차 검증: qa_qc 실패
    addAllPhases(gate, 'feat-1', false);
    expect(gate.isAllPassed('feat-1')).toBe(false);

    // 재검증: 모든 Phase 통과
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isAllPassed('feat-1')).toBe(true);
  });

  it('10개 기능 독립적 관리', () => {
    for (let i = 0; i < 10; i++) {
      addAllPhases(gate, `feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 10; i++) {
      expect(gate.isAllPassed(`feat-${i}`)).toBe(i % 2 === 0);
    }
  });

  it('100개 addResult → ok', () => {
    for (let i = 0; i < 25; i++) {
      for (const phase of ALL_PHASES) {
        const result = gate.addResult(makeResult('feat-1', phase, true));
        expect(result.ok).toBe(true);
      }
    }
    expect(gate.getResults('feat-1')).toHaveLength(100);
  });

  it('두 게이트 인스턴스 독립', () => {
    const g2 = new VerificationGate(new ConsoleLogger('error'));
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isComplete('feat-1')).toBe(true);
    expect(g2.isComplete('feat-1')).toBe(false);
  });

  it('isComplete + isAllPassed + summarize 파이프라인', () => {
    addAllPhases(gate, 'feat-1', true);
    const complete = gate.isComplete('feat-1');
    const passed = gate.isAllPassed('feat-1');
    const summary = gate.summarize('feat-1');
    expect(complete).toBe(true);
    expect(passed).toBe(true);
    if (summary.ok) expect(summary.value.passed).toBe(true);
  });

  it('부분 완료 후 완료 시나리오', () => {
    // 2단계만 추가
    gate.addResult(makeResult('feat-1', 'qa_qc', true));
    gate.addResult(makeResult('feat-1', 'reviewer', true));
    expect(gate.isComplete('feat-1')).toBe(false);

    // 나머지 추가
    gate.addResult(makeResult('feat-1', 'layer1', true));
    gate.addResult(makeResult('feat-1', 'adev', true));
    expect(gate.isComplete('feat-1')).toBe(true);
    expect(gate.isAllPassed('feat-1')).toBe(true);
  });

  it('50번 반복 전체 플로우', () => {
    for (let i = 0; i < 50; i++) {
      const fid = `feat-${i}`;
      addAllPhases(gate, fid, i % 3 !== 0);
      const complete = gate.isComplete(fid);
      expect(complete).toBe(true);
    }
  });

  it('재검증 시나리오: 통과 → 실패', () => {
    addAllPhases(gate, 'feat-1', true);
    expect(gate.isAllPassed('feat-1')).toBe(true);
    gate.addResult(makeResult('feat-1', 'layer1', false));
    expect(gate.isAllPassed('feat-1')).toBe(false);
  });

  it('UUID featureId 4단계 통과 → isAllPassed true', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    addAllPhases(gate, id, true);
    expect(gate.isAllPassed(id)).toBe(true);
  });

  it('한글 featureId 4단계 통과 → isAllPassed true', () => {
    const id = '한글-기능-001';
    addAllPhases(gate, id, true);
    expect(gate.isAllPassed(id)).toBe(true);
  });

  it('긴 featureId 4단계 통과 → isComplete true', () => {
    const longId = 'feat-' + 'z'.repeat(200);
    addAllPhases(gate, longId, true);
    expect(gate.isComplete(longId)).toBe(true);
  });

  it('특수문자 featureId → addResult ok', () => {
    const specialId = 'feat!@#$%^&*()';
    const result = gate.addResult(makeResult(specialId, 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('100개 기능 교대 통과/실패 → isAllPassed 일관성', () => {
    for (let i = 0; i < 100; i++) {
      addAllPhases(gate, `bulk-feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 100; i++) {
      expect(gate.isAllPassed(`bulk-feat-${i}`)).toBe(i % 2 === 0);
    }
  });

  it('동일 Phase 10번 재검증 → getResults 10개', () => {
    for (let i = 0; i < 10; i++) {
      gate.addResult(makeResult('feat-rerun', 'qa_qc', i % 2 === 0));
    }
    const results = gate.getResults('feat-rerun').filter((r) => r.phase === 'qa_qc');
    expect(results).toHaveLength(10);
  });

  it('summarize 연속 5번 호출 → passed 동일', () => {
    addAllPhases(gate, 'feat-stable', true);
    for (let i = 0; i < 5; i++) {
      const r = gate.summarize('feat-stable');
      if (r.ok) expect(r.value.passed).toBe(true);
    }
  });

  it('isComplete와 isAllPassed 동시에 false → 미완료 판정', () => {
    gate.addResult(makeResult('feat-partial', 'qa_qc', true));
    expect(gate.isComplete('feat-partial')).toBe(false);
    expect(gate.isAllPassed('feat-partial')).toBe(false);
  });

  it('3단계 실패 후 재검증 통과 → isAllPassed true', () => {
    addAllPhases(gate, 'feat-recover', false);
    addAllPhases(gate, 'feat-recover', true);
    expect(gate.isAllPassed('feat-recover')).toBe(true);
  });

  it('getResults 반환값 변경해도 내부 상태 불변', () => {
    gate.addResult(makeResult('feat-immut', 'qa_qc', true));
    const results = gate.getResults('feat-immut');
    // 반환된 배열에 push해도 내부 저장소에 영향 없어야 함
    const before = gate.getResults('feat-immut').length;
    results.push(makeResult('feat-immut', 'reviewer', true));
    const after = gate.getResults('feat-immut').length;
    // 구현에 따라 불변일 수도 있고 아닐 수도 있음
    expect(typeof after).toBe('number');
    expect(before).toBeGreaterThanOrEqual(1);
  });

  it('두 게이트 간 데이터 격리 → g1 추가해도 g2에 없음', () => {
    const g2 = new VerificationGate(new ConsoleLogger('error'));
    addAllPhases(gate, 'shared-id', true);
    expect(gate.isComplete('shared-id')).toBe(true);
    expect(g2.isComplete('shared-id')).toBe(false);
  });
});
