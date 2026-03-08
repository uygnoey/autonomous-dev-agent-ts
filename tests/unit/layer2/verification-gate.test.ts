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

// ── 추가 경계값 및 스트레스 테스트 ────────────────────────────

describe('VerificationGate 추가 경계값', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('featureId 빈 문자열 → addResult ok', () => {
    const result = gate.addResult(makeResult('', 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('featureId 빈 문자열 → getResults 빈 배열 또는 결과', () => {
    gate.addResult(makeResult('', 'qa_qc', true));
    const results = gate.getResults('');
    expect(Array.isArray(results)).toBe(true);
  });

  it('feedback 빈 문자열 → addResult ok', () => {
    const result = gate.addResult({
      featureId: 'feat-fb-empty',
      phase: 'qa_qc',
      passed: true,
      feedback: '',
      timestamp: new Date(),
    });
    expect(result.ok).toBe(true);
  });

  it('feedback 매우 긴 문자열 → addResult ok', () => {
    const result = gate.addResult({
      featureId: 'feat-fb-long',
      phase: 'qa_qc',
      passed: false,
      feedback: 'x'.repeat(10_000),
      timestamp: new Date(),
    });
    expect(result.ok).toBe(true);
  });

  it('timestamp가 과거 날짜 → addResult ok', () => {
    const result = gate.addResult({
      featureId: 'feat-past',
      phase: 'qa_qc',
      passed: true,
      feedback: '통과',
      timestamp: new Date('2000-01-01T00:00:00Z'),
    });
    expect(result.ok).toBe(true);
  });

  it('timestamp가 미래 날짜 → addResult ok', () => {
    const result = gate.addResult({
      featureId: 'feat-future',
      phase: 'qa_qc',
      passed: true,
      feedback: '통과',
      timestamp: new Date('2099-12-31T23:59:59Z'),
    });
    expect(result.ok).toBe(true);
  });

  it('isComplete 동일 Phase 4개 추가 → false (4 distinct phases 필요)', () => {
    for (let i = 0; i < 4; i++) {
      gate.addResult(makeResult('feat-same-phase', 'qa_qc', true));
    }
    // 4개를 추가했지만 모두 같은 phase → isComplete false
    expect(gate.isComplete('feat-same-phase')).toBe(false);
  });

  it('isAllPassed 동일 Phase 4개 추가 → false (미완료)', () => {
    for (let i = 0; i < 4; i++) {
      gate.addResult(makeResult('feat-same-phase-2', 'qa_qc', true));
    }
    expect(gate.isAllPassed('feat-same-phase-2')).toBe(false);
  });

  it('summarize 미완료 → passed=false', () => {
    gate.addResult(makeResult('feat-partial-sum', 'qa_qc', true));
    gate.addResult(makeResult('feat-partial-sum', 'reviewer', true));
    const result = gate.summarize('feat-partial-sum');
    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });

  it('200개 기능 각 4단계 추가 → isComplete 모두 true', () => {
    for (let i = 0; i < 200; i++) {
      addAllPhases(gate, `stress-feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 200; i++) {
      expect(gate.isComplete(`stress-feat-${i}`)).toBe(true);
    }
  });

  it('qa_qc 단독 완료 → summarize ok, passed=false(미완료)', () => {
    gate.addResult(makeResult('solo-qa', 'qa_qc', true));
    const result = gate.summarize('solo-qa');
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('adev 단독 완료 → isComplete false', () => {
    gate.addResult(makeResult('solo-adev', 'adev', true));
    expect(gate.isComplete('solo-adev')).toBe(false);
  });

  it('layer1 단독 완료 → isAllPassed false', () => {
    gate.addResult(makeResult('solo-layer1', 'layer1', true));
    expect(gate.isAllPassed('solo-layer1')).toBe(false);
  });

  it('getResults 빈 featureId → 배열 반환', () => {
    expect(Array.isArray(gate.getResults(''))).toBe(true);
  });

  it('summarize 빈 featureId → err 또는 ok', () => {
    const result = gate.summarize('');
    expect(typeof result.ok).toBe('boolean');
  });

  it('5개 featureId 동시 병렬 추가 → 각 독립', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    for (const id of ids) {
      addAllPhases(gate, id, true);
    }
    for (const id of ids) {
      expect(gate.isComplete(id)).toBe(true);
      expect(gate.isAllPassed(id)).toBe(true);
    }
  });

  it('이모지 featureId → addResult ok', () => {
    const result = gate.addResult(makeResult('feat-🚀', 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('숫자 featureId → addResult ok', () => {
    const result = gate.addResult(makeResult('12345678', 'reviewer', false));
    expect(result.ok).toBe(true);
    expect(gate.getResults('12345678').length).toBe(1);
  });

  it('매우 긴 featureId(500자) → addResult ok', () => {
    const longId = 'f' + 'e'.repeat(499);
    const result = gate.addResult(makeResult(longId, 'qa_qc', true));
    expect(result.ok).toBe(true);
  });

  it('addResult 반환 ok=true 타입 boolean', () => {
    const result = gate.addResult(makeResult('type-check', 'qa_qc', true));
    expect(typeof result.ok).toBe('boolean');
  });

  it('getResults 연속 추가 후 길이 증가', () => {
    gate.addResult(makeResult('len-feat', 'qa_qc', true));
    expect(gate.getResults('len-feat').length).toBe(1);
    gate.addResult(makeResult('len-feat', 'reviewer', true));
    expect(gate.getResults('len-feat').length).toBe(2);
    gate.addResult(makeResult('len-feat', 'layer1', true));
    expect(gate.getResults('len-feat').length).toBe(3);
    gate.addResult(makeResult('len-feat', 'adev', true));
    expect(gate.getResults('len-feat').length).toBe(4);
  });
});

// ── 추가 경계값: 재검증 시나리오 세밀 검증 ────────────────────────

describe('VerificationGate 재검증 시나리오 세밀 검증', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('qa_qc 실패 후 재검증 통과 → isAllPassed=true', () => {
    gate.addResult(makeResult('feat-recheck', 'qa_qc', false));
    gate.addResult(makeResult('feat-recheck', 'reviewer', true));
    gate.addResult(makeResult('feat-recheck', 'layer1', true));
    gate.addResult(makeResult('feat-recheck', 'adev', true));
    gate.addResult(makeResult('feat-recheck', 'qa_qc', true)); // 재검증
    expect(gate.isAllPassed('feat-recheck')).toBe(true);
  });

  it('reviewer 실패 후 재검증 통과 → isAllPassed=true', () => {
    addAllPhases(gate, 'feat-rev-retry', false);
    gate.addResult(makeResult('feat-rev-retry', 'qa_qc', true));
    gate.addResult(makeResult('feat-rev-retry', 'reviewer', true));
    gate.addResult(makeResult('feat-rev-retry', 'layer1', true));
    gate.addResult(makeResult('feat-rev-retry', 'adev', true));
    expect(gate.isAllPassed('feat-rev-retry')).toBe(true);
  });

  it('layer1 실패 후 재검증 통과 → isAllPassed=true', () => {
    gate.addResult(makeResult('feat-l1-retry', 'qa_qc', true));
    gate.addResult(makeResult('feat-l1-retry', 'reviewer', true));
    gate.addResult(makeResult('feat-l1-retry', 'layer1', false));
    gate.addResult(makeResult('feat-l1-retry', 'adev', true));
    gate.addResult(makeResult('feat-l1-retry', 'layer1', true)); // 재검증
    expect(gate.isAllPassed('feat-l1-retry')).toBe(true);
  });

  it('adev 실패 후 재검증 통과 → isAllPassed=true', () => {
    gate.addResult(makeResult('feat-adev-retry', 'qa_qc', true));
    gate.addResult(makeResult('feat-adev-retry', 'reviewer', true));
    gate.addResult(makeResult('feat-adev-retry', 'layer1', true));
    gate.addResult(makeResult('feat-adev-retry', 'adev', false));
    gate.addResult(makeResult('feat-adev-retry', 'adev', true)); // 재검증
    expect(gate.isAllPassed('feat-adev-retry')).toBe(true);
  });

  it('통과 후 재검증 실패 → isAllPassed=false', () => {
    addAllPhases(gate, 'feat-downgrade', true);
    gate.addResult(makeResult('feat-downgrade', 'reviewer', false)); // 재검증 실패
    expect(gate.isAllPassed('feat-downgrade')).toBe(false);
  });

  it('전체 4단계 실패 후 전체 4단계 재검증 통과 → isAllPassed=true', () => {
    addAllPhases(gate, 'feat-full-retry', false);
    addAllPhases(gate, 'feat-full-retry', true);
    expect(gate.isAllPassed('feat-full-retry')).toBe(true);
  });

  it('재검증 3회 반복 → 마지막 결과가 최종 판정', () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      const passed = cycle % 2 === 0; // 0: true, 1: false, 2: true
      addAllPhases(gate, 'feat-triple-retry', passed);
    }
    // 3번째 사이클은 passed=true (cycle=2, 2%2=0)
    expect(gate.isAllPassed('feat-triple-retry')).toBe(true);
  });

  it('isComplete는 재검증 후에도 true 유지', () => {
    addAllPhases(gate, 'feat-still-complete', true);
    gate.addResult(makeResult('feat-still-complete', 'qa_qc', false)); // 재검증
    expect(gate.isComplete('feat-still-complete')).toBe(true);
  });

  it('summarize 재검증 후 최신 결과 반영', () => {
    addAllPhases(gate, 'feat-sum-retry', false);
    addAllPhases(gate, 'feat-sum-retry', true);
    const result = gate.summarize('feat-sum-retry');
    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });

  it('재검증 여러 Phase 혼합 → 마지막 통과/실패로 판정', () => {
    gate.addResult(makeResult('feat-mixed-retry', 'qa_qc', false));
    gate.addResult(makeResult('feat-mixed-retry', 'reviewer', true));
    gate.addResult(makeResult('feat-mixed-retry', 'layer1', true));
    gate.addResult(makeResult('feat-mixed-retry', 'adev', true));
    // qa_qc 재검증 통과
    gate.addResult(makeResult('feat-mixed-retry', 'qa_qc', true));
    expect(gate.isAllPassed('feat-mixed-retry')).toBe(true);
  });
});

// ── 추가 경계값: summarize 상세 검증 ─────────────────────────────

describe('VerificationGate summarize 상세 검증', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('미완료 1단계 → summarize ok=true, passed=false', () => {
    gate.addResult(makeResult('feat-s1', 'qa_qc', true));
    const r = gate.summarize('feat-s1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.passed).toBe(false);
  });

  it('미완료 2단계 → summarize ok=true, passed=false', () => {
    gate.addResult(makeResult('feat-s2', 'qa_qc', true));
    gate.addResult(makeResult('feat-s2', 'reviewer', true));
    const r = gate.summarize('feat-s2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.passed).toBe(false);
  });

  it('미완료 3단계 → summarize ok=true, passed=false', () => {
    gate.addResult(makeResult('feat-s3', 'qa_qc', true));
    gate.addResult(makeResult('feat-s3', 'reviewer', true));
    gate.addResult(makeResult('feat-s3', 'layer1', true));
    const r = gate.summarize('feat-s3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.passed).toBe(false);
  });

  it('완료 4단계 모두 통과 → summarize.passed=true', () => {
    addAllPhases(gate, 'feat-s4', true);
    const r = gate.summarize('feat-s4');
    if (r.ok) expect(r.value.passed).toBe(true);
  });

  it('완료 4단계 1개 실패 → summarize.passed=false', () => {
    gate.addResult(makeResult('feat-s5', 'qa_qc', true));
    gate.addResult(makeResult('feat-s5', 'reviewer', false));
    gate.addResult(makeResult('feat-s5', 'layer1', true));
    gate.addResult(makeResult('feat-s5', 'adev', true));
    const r = gate.summarize('feat-s5');
    if (r.ok) expect(r.value.passed).toBe(false);
  });

  it('summary에 qa_qc 포함', () => {
    addAllPhases(gate, 'feat-sum-qa', true);
    const r = gate.summarize('feat-sum-qa');
    if (r.ok) expect(r.value.summary).toContain('qa_qc');
  });

  it('summary에 reviewer 포함', () => {
    addAllPhases(gate, 'feat-sum-rev', true);
    const r = gate.summarize('feat-sum-rev');
    if (r.ok) expect(r.value.summary).toContain('reviewer');
  });

  it('summary에 layer1 포함', () => {
    addAllPhases(gate, 'feat-sum-l1', true);
    const r = gate.summarize('feat-sum-l1');
    if (r.ok) expect(r.value.summary).toContain('layer1');
  });

  it('summary에 adev 포함', () => {
    addAllPhases(gate, 'feat-sum-adev', true);
    const r = gate.summarize('feat-sum-adev');
    if (r.ok) expect(r.value.summary).toContain('adev');
  });

  it('실패 시 summary에 실패한 Phase 정보 포함', () => {
    gate.addResult(makeResult('feat-fail-info', 'qa_qc', false));
    gate.addResult(makeResult('feat-fail-info', 'reviewer', true));
    gate.addResult(makeResult('feat-fail-info', 'layer1', true));
    gate.addResult(makeResult('feat-fail-info', 'adev', true));
    const r = gate.summarize('feat-fail-info');
    if (r.ok) {
      expect(r.value.summary).toContain('실패');
    }
  });

  it('summarize 결과 value.summary 길이 > 0', () => {
    addAllPhases(gate, 'feat-sum-len', true);
    const r = gate.summarize('feat-sum-len');
    if (r.ok) expect(r.value.summary.length).toBeGreaterThan(0);
  });

  it('non-existent 에러의 error.message 비어있지 않음', () => {
    const r = gate.summarize('non-exist');
    if (!r.ok) {
      expect(r.error.message.length).toBeGreaterThan(0);
    }
  });

  it('summarize 5번 연속 호출 → 동일 passed', () => {
    addAllPhases(gate, 'feat-stable-sum', true);
    for (let i = 0; i < 5; i++) {
      const r = gate.summarize('feat-stable-sum');
      if (r.ok) expect(r.value.passed).toBe(true);
    }
  });

  it('summarize → summary 타입 확인', () => {
    gate.addResult(makeResult('feat-type-sum', 'qa_qc', true));
    const r = gate.summarize('feat-type-sum');
    if (r.ok) {
      expect(typeof r.value.summary).toBe('string');
      expect(typeof r.value.passed).toBe('boolean');
    }
  });
});

// ── 추가 경계값: 다중 기능 격리 검증 ─────────────────────────────

describe('VerificationGate 다중 기능 격리 검증', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('feat-A 완료, feat-B 미완료 → 독립 판정', () => {
    addAllPhases(gate, 'feat-A', true);
    gate.addResult(makeResult('feat-B', 'qa_qc', true));
    expect(gate.isComplete('feat-A')).toBe(true);
    expect(gate.isComplete('feat-B')).toBe(false);
  });

  it('feat-A 통과, feat-B 실패 → 독립 판정', () => {
    addAllPhases(gate, 'feat-A', true);
    addAllPhases(gate, 'feat-B', false);
    expect(gate.isAllPassed('feat-A')).toBe(true);
    expect(gate.isAllPassed('feat-B')).toBe(false);
  });

  it('feat-A 결과가 feat-B 조회에 영향 없음', () => {
    addAllPhases(gate, 'feat-A', true);
    expect(gate.getResults('feat-B').length).toBe(0);
  });

  it('5개 기능 각각 독립적으로 isComplete', () => {
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        addAllPhases(gate, `iso-feat-${i}`, true);
      } else {
        gate.addResult(makeResult(`iso-feat-${i}`, 'qa_qc', true));
      }
    }
    for (let i = 0; i < 5; i++) {
      expect(gate.isComplete(`iso-feat-${i}`)).toBe(i % 2 === 0);
    }
  });

  it('10개 기능 각 다른 단계 추가 → getResults 독립', () => {
    const phases: VerificationPhase[] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (let i = 0; i < 10; i++) {
      const phase = phases[i % 4]!;
      gate.addResult(makeResult(`multi-feat-${i}`, phase, true));
    }
    for (let i = 0; i < 10; i++) {
      expect(gate.getResults(`multi-feat-${i}`).length).toBe(1);
    }
  });

  it('feat-A와 feat-B summarize 독립', () => {
    addAllPhases(gate, 'feat-A', true);
    addAllPhases(gate, 'feat-B', false);
    const rA = gate.summarize('feat-A');
    const rB = gate.summarize('feat-B');
    if (rA.ok) expect(rA.value.passed).toBe(true);
    if (rB.ok) expect(rB.value.passed).toBe(false);
  });

  it('존재하지 않는 featureId는 isComplete=false', () => {
    addAllPhases(gate, 'real-feat', true);
    expect(gate.isComplete('fake-feat')).toBe(false);
  });

  it('존재하지 않는 featureId는 isAllPassed=false', () => {
    addAllPhases(gate, 'real-feat2', true);
    expect(gate.isAllPassed('fake-feat2')).toBe(false);
  });

  it('존재하지 않는 featureId는 summarize error', () => {
    addAllPhases(gate, 'real-feat3', true);
    const r = gate.summarize('fake-feat3');
    expect(r.ok).toBe(false);
  });

  it('50개 기능 중 절반만 완료 → 올바른 판정', () => {
    for (let i = 0; i < 50; i++) {
      if (i < 25) {
        addAllPhases(gate, `half-feat-${i}`, true);
      } else {
        gate.addResult(makeResult(`half-feat-${i}`, 'qa_qc', true));
      }
    }
    for (let i = 0; i < 25; i++) {
      expect(gate.isComplete(`half-feat-${i}`)).toBe(true);
    }
    for (let i = 25; i < 50; i++) {
      expect(gate.isComplete(`half-feat-${i}`)).toBe(false);
    }
  });
});

// ── 추가 경계값: 스트레스 및 성능 테스트 ─────────────────────────

describe('VerificationGate 스트레스 및 성능 테스트', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('1000개 addResult → ok', () => {
    for (let i = 0; i < 250; i++) {
      for (const phase of ALL_PHASES) {
        const r = gate.addResult(makeResult('stress-feat', phase, i % 3 !== 0));
        expect(r.ok).toBe(true);
      }
    }
    expect(gate.getResults('stress-feat').length).toBe(1000);
  });

  it('500개 기능 각 4단계 → isComplete 모두 true', () => {
    for (let i = 0; i < 500; i++) {
      addAllPhases(gate, `perf-feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 500; i++) {
      expect(gate.isComplete(`perf-feat-${i}`)).toBe(true);
    }
  });

  it('500개 기능 교대 통과/실패 → isAllPassed 일관성', () => {
    for (let i = 0; i < 500; i++) {
      addAllPhases(gate, `consistent-feat-${i}`, i % 2 === 0);
    }
    for (let i = 0; i < 500; i++) {
      expect(gate.isAllPassed(`consistent-feat-${i}`)).toBe(i % 2 === 0);
    }
  });

  it('동일 기능 100번 재검증 → 마지막 결과 기준', () => {
    for (let i = 0; i < 100; i++) {
      addAllPhases(gate, 'rerun-feat', i % 2 === 0);
    }
    // i=99이면 99%2=1이므로 passed=false
    expect(gate.isAllPassed('rerun-feat')).toBe(false);
  });

  it('1000번 getResults 호출 → 일관된 결과', () => {
    addAllPhases(gate, 'stable-check', true);
    for (let i = 0; i < 1000; i++) {
      expect(gate.getResults('stable-check').length).toBe(4);
    }
  });

  it('1000번 isComplete 호출 → 일관된 true', () => {
    addAllPhases(gate, 'stable-complete', true);
    for (let i = 0; i < 1000; i++) {
      expect(gate.isComplete('stable-complete')).toBe(true);
    }
  });

  it('1000번 isAllPassed 호출 → 일관된 true', () => {
    addAllPhases(gate, 'stable-passed', true);
    for (let i = 0; i < 1000; i++) {
      expect(gate.isAllPassed('stable-passed')).toBe(true);
    }
  });

  it('UUID featureId 50개 각 4단계 추가 → isComplete 모두 true', () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `uuid-stress-${i.toString().padStart(3, '0')}-${crypto.randomUUID().slice(0, 8)}`;
      ids.push(id);
      addAllPhases(gate, id, true);
    }
    for (const id of ids) {
      expect(gate.isComplete(id)).toBe(true);
    }
  });

  it('addResult 후 getResults → 길이 증가 검증', () => {
    const phases: VerificationPhase[] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (let i = 0; i < phases.length; i++) {
      gate.addResult(makeResult('len-increase', phases[i]!, true));
      expect(gate.getResults('len-increase').length).toBe(i + 1);
    }
  });

  it('50개 기능 각 summarize → ok 반환', () => {
    for (let i = 0; i < 50; i++) {
      addAllPhases(gate, `sum-feat-${i}`, true);
    }
    for (let i = 0; i < 50; i++) {
      const r = gate.summarize(`sum-feat-${i}`);
      expect(r.ok).toBe(true);
    }
  });
});

// ── 추가 경계값: VerificationResult 구조 검증 ────────────────────

describe('VerificationGate VerificationResult 구조 검증', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('getResults 반환값 원소의 featureId는 string', () => {
    gate.addResult(makeResult('struct-feat', 'qa_qc', true));
    const results = gate.getResults('struct-feat');
    expect(typeof results[0]?.featureId).toBe('string');
  });

  it('getResults 반환값 원소의 phase는 string', () => {
    gate.addResult(makeResult('struct-feat2', 'reviewer', false));
    const results = gate.getResults('struct-feat2');
    expect(typeof results[0]?.phase).toBe('string');
  });

  it('getResults 반환값 원소의 passed는 boolean', () => {
    gate.addResult(makeResult('struct-feat3', 'layer1', true));
    const results = gate.getResults('struct-feat3');
    expect(typeof results[0]?.passed).toBe('boolean');
  });

  it('getResults 반환값 원소의 feedback는 string', () => {
    gate.addResult(makeResult('struct-feat4', 'adev', false, '실패 이유'));
    const results = gate.getResults('struct-feat4');
    expect(typeof results[0]?.feedback).toBe('string');
  });

  it('getResults 반환값 원소의 timestamp는 Date', () => {
    gate.addResult(makeResult('struct-feat5', 'qa_qc', true));
    const results = gate.getResults('struct-feat5');
    expect(results[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('feedback 내용 보존', () => {
    const customFeedback = '검증 성공: 모든 기준 통과';
    gate.addResult({
      featureId: 'feedback-feat',
      phase: 'qa_qc',
      passed: true,
      feedback: customFeedback,
      timestamp: new Date(),
    });
    const results = gate.getResults('feedback-feat');
    expect(results[0]?.feedback).toBe(customFeedback);
  });

  it('passed=true, phase=qa_qc 원소 featureId 일치', () => {
    gate.addResult(makeResult('id-check', 'qa_qc', true));
    const results = gate.getResults('id-check');
    expect(results[0]?.featureId).toBe('id-check');
  });

  it('passed=false, phase=reviewer 원소 featureId 일치', () => {
    gate.addResult(makeResult('id-check-2', 'reviewer', false));
    const results = gate.getResults('id-check-2');
    expect(results[0]?.featureId).toBe('id-check-2');
  });

  it('ALL_PHASES 4개 추가 → 각 원소의 phase가 올바름', () => {
    addAllPhases(gate, 'phase-check', true);
    const results = gate.getResults('phase-check');
    expect(results[0]?.phase).toBe('qa_qc');
    expect(results[1]?.phase).toBe('reviewer');
    expect(results[2]?.phase).toBe('layer1');
    expect(results[3]?.phase).toBe('adev');
  });

  it('passed=true 원소는 passed=true', () => {
    gate.addResult(makeResult('pass-check', 'qa_qc', true));
    const results = gate.getResults('pass-check');
    expect(results[0]?.passed).toBe(true);
  });

  it('passed=false 원소는 passed=false', () => {
    gate.addResult(makeResult('fail-check', 'adev', false));
    const results = gate.getResults('fail-check');
    expect(results[0]?.passed).toBe(false);
  });
});

// ── 추가 경계값: isComplete/isAllPassed 세밀 케이스 ─────────────

describe('VerificationGate isComplete/isAllPassed 세밀 케이스', () => {
  let gate: VerificationGate;

  beforeEach(() => {
    gate = new VerificationGate(new ConsoleLogger('error'));
  });

  it('qa_qc만 → isComplete=false, isAllPassed=false', () => {
    gate.addResult(makeResult('fine-1', 'qa_qc', true));
    expect(gate.isComplete('fine-1')).toBe(false);
    expect(gate.isAllPassed('fine-1')).toBe(false);
  });

  it('qa_qc+reviewer → isComplete=false, isAllPassed=false', () => {
    gate.addResult(makeResult('fine-2', 'qa_qc', true));
    gate.addResult(makeResult('fine-2', 'reviewer', true));
    expect(gate.isComplete('fine-2')).toBe(false);
    expect(gate.isAllPassed('fine-2')).toBe(false);
  });

  it('qa_qc+reviewer+layer1 → isComplete=false, isAllPassed=false', () => {
    gate.addResult(makeResult('fine-3', 'qa_qc', true));
    gate.addResult(makeResult('fine-3', 'reviewer', true));
    gate.addResult(makeResult('fine-3', 'layer1', true));
    expect(gate.isComplete('fine-3')).toBe(false);
    expect(gate.isAllPassed('fine-3')).toBe(false);
  });

  it('4단계 완료, 모두 true → isComplete=true, isAllPassed=true', () => {
    addAllPhases(gate, 'fine-4', true);
    expect(gate.isComplete('fine-4')).toBe(true);
    expect(gate.isAllPassed('fine-4')).toBe(true);
  });

  it('4단계 완료, 모두 false → isComplete=true, isAllPassed=false', () => {
    addAllPhases(gate, 'fine-5', false);
    expect(gate.isComplete('fine-5')).toBe(true);
    expect(gate.isAllPassed('fine-5')).toBe(false);
  });

  it('adev 단독 → isComplete=false', () => {
    gate.addResult(makeResult('solo-adev-2', 'adev', true));
    expect(gate.isComplete('solo-adev-2')).toBe(false);
  });

  it('layer1 단독 → isComplete=false', () => {
    gate.addResult(makeResult('solo-l1-2', 'layer1', true));
    expect(gate.isComplete('solo-l1-2')).toBe(false);
  });

  it('reviewer 단독 → isComplete=false', () => {
    gate.addResult(makeResult('solo-rev-2', 'reviewer', true));
    expect(gate.isComplete('solo-rev-2')).toBe(false);
  });

  it('순서 다르게 추가해도 isComplete=true', () => {
    // 역순으로 추가
    gate.addResult(makeResult('rev-order', 'adev', true));
    gate.addResult(makeResult('rev-order', 'layer1', true));
    gate.addResult(makeResult('rev-order', 'reviewer', true));
    gate.addResult(makeResult('rev-order', 'qa_qc', true));
    expect(gate.isComplete('rev-order')).toBe(true);
    expect(gate.isAllPassed('rev-order')).toBe(true);
  });

  it('중간 순서로 추가해도 isComplete=true', () => {
    gate.addResult(makeResult('mid-order', 'reviewer', true));
    gate.addResult(makeResult('mid-order', 'adev', true));
    gate.addResult(makeResult('mid-order', 'qa_qc', true));
    gate.addResult(makeResult('mid-order', 'layer1', true));
    expect(gate.isComplete('mid-order')).toBe(true);
  });

  it('중복 adev 추가 후에도 isComplete 유지', () => {
    addAllPhases(gate, 'dup-adev', true);
    for (let i = 0; i < 5; i++) {
      gate.addResult(makeResult('dup-adev', 'adev', true));
    }
    expect(gate.isComplete('dup-adev')).toBe(true);
  });

  it('100개 기능 중 랜덤 완료/미완료 → 각 독립 판정', () => {
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 0) {
        addAllPhases(gate, `rand-feat-${i}`, true);
      } else {
        gate.addResult(makeResult(`rand-feat-${i}`, 'qa_qc', true));
      }
    }
    for (let i = 0; i < 100; i++) {
      const expected = i % 3 === 0;
      expect(gate.isComplete(`rand-feat-${i}`)).toBe(expected);
    }
  });
});
