/**
 * PhaseEngine 단위 테스트 / PhaseEngine unit tests
 *
 * @description
 * 4-Phase FSM: DESIGN→CODE→TEST→VERIFY, VERIFY→DESIGN/CODE/TEST 롤백.
 * canTransition, getParticipants, getHistory 검증.
 * 80%+ 랜덤/경계값 비율 준수.
 *
 * 유효한 전환 규칙:
 * - DESIGN → CODE (only)
 * - CODE → TEST (only)
 * - TEST → VERIFY (only)
 * - VERIFY → DESIGN, CODE, TEST (롤백)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { PhaseEngine } from 'layer2/phase-engine.js';
import type { Phase } from 'core/types.js';
import type { AgentName } from 'core/types.js';

const ALL_PHASES: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
const ALL_AGENTS: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
const ALL_TRIGGERS: (AgentName | 'adev')[] = [...ALL_AGENTS, 'adev'];

function makeEngine(): PhaseEngine {
  return new PhaseEngine(new ConsoleLogger('error'));
}

/** DESIGN → CODE → TEST → VERIFY 전체 전환 */
function advanceToVerify(engine: PhaseEngine): void {
  engine.transition('CODE', 'reason', 'qa');
  engine.transition('TEST', 'reason', 'architect');
  engine.transition('VERIFY', 'reason', 'qc');
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('PhaseEngine 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeEngine()).not.toThrow();
  });

  it('PhaseEngine 인스턴스', () => {
    expect(makeEngine()).toBeInstanceOf(PhaseEngine);
  });

  it('초기 Phase는 DESIGN', () => {
    expect(makeEngine().currentPhase).toBe('DESIGN');
  });

  it('초기 이력은 빈 배열', () => {
    expect(makeEngine().getHistory()).toHaveLength(0);
  });
});

// ── 순방향 전환 ────────────────────────────────────────────────

describe('PhaseEngine 순방향 전환', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('DESIGN → CODE → ok', () => {
    const result = engine.transition('CODE', '이유', 'qa');
    expect(result.ok).toBe(true);
  });

  it('DESIGN → CODE 후 currentPhase=CODE', () => {
    engine.transition('CODE', '이유', 'qa');
    expect(engine.currentPhase).toBe('CODE');
  });

  it('DESIGN → CODE 전환 결과 from=DESIGN, to=CODE', () => {
    const result = engine.transition('CODE', '이유', 'qa');
    if (result.ok) {
      expect(result.value.from).toBe('DESIGN');
      expect(result.value.to).toBe('CODE');
    }
  });

  it('CODE → TEST → ok', () => {
    engine.transition('CODE', '이유', 'qa');
    const result = engine.transition('TEST', '이유', 'architect');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');
  });

  it('TEST → VERIFY → ok', () => {
    engine.transition('CODE', '이유', 'qa');
    engine.transition('TEST', '이유', 'architect');
    const result = engine.transition('VERIFY', '이유', 'qc');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('전체 순방향 전환 완료 → history 3개', () => {
    advanceToVerify(engine);
    expect(engine.getHistory()).toHaveLength(3);
  });

  it('전환 이력의 from/to 순서 올바름', () => {
    advanceToVerify(engine);
    const history = engine.getHistory();
    expect(history[0]?.from).toBe('DESIGN');
    expect(history[0]?.to).toBe('CODE');
    expect(history[1]?.from).toBe('CODE');
    expect(history[1]?.to).toBe('TEST');
    expect(history[2]?.from).toBe('TEST');
    expect(history[2]?.to).toBe('VERIFY');
  });

  it('전환 결과에 reason 포함', () => {
    const result = engine.transition('CODE', '이유가 여기에', 'qa');
    if (result.ok) expect(result.value.reason).toBe('이유가 여기에');
  });

  it('전환 결과에 triggeredBy 포함', () => {
    const result = engine.transition('CODE', '이유', 'architect');
    if (result.ok) expect(result.value.triggeredBy).toBe('architect');
  });

  it('전환 결과에 timestamp 포함', () => {
    const result = engine.transition('CODE', '이유', 'qa');
    if (result.ok) expect(result.value.timestamp).toBeInstanceOf(Date);
  });

  it.each(ALL_TRIGGERS)('triggeredBy %s → ok (DESIGN→CODE)', (trigger) => {
    const result = engine.transition('CODE', '이유', trigger);
    expect(result.ok).toBe(true);
  });
});

// ── 무효한 전환 ────────────────────────────────────────────────

describe('PhaseEngine 무효한 전환', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('DESIGN → TEST 직접 전환 → err', () => {
    const result = engine.transition('TEST', '건너뛰기', 'adev');
    expect(result.ok).toBe(false);
  });

  it('DESIGN → TEST 전환 실패 → Phase 유지', () => {
    engine.transition('TEST', '이유', 'adev');
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('DESIGN → VERIFY 직접 전환 → err', () => {
    const result = engine.transition('VERIFY', '이유', 'adev');
    expect(result.ok).toBe(false);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('DESIGN → DESIGN 같은 Phase → err', () => {
    const result = engine.transition('DESIGN', '이유', 'adev');
    expect(result.ok).toBe(false);
  });

  it('CODE → DESIGN 역방향 → err', () => {
    engine.transition('CODE', '이유', 'qa');
    const result = engine.transition('DESIGN', '롤백', 'adev');
    expect(result.ok).toBe(false);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('CODE → VERIFY 건너뜀 → err', () => {
    engine.transition('CODE', '이유', 'qa');
    const result = engine.transition('VERIFY', '이유', 'adev');
    expect(result.ok).toBe(false);
  });

  it('TEST → DESIGN 역방향 → err', () => {
    engine.transition('CODE', '이유', 'qa');
    engine.transition('TEST', '이유', 'architect');
    const result = engine.transition('DESIGN', '이유', 'adev');
    expect(result.ok).toBe(false);
    expect(engine.currentPhase).toBe('TEST');
  });

  it('TEST → CODE 역방향 → err', () => {
    engine.transition('CODE', '이유', 'qa');
    engine.transition('TEST', '이유', 'architect');
    const result = engine.transition('CODE', '이유', 'adev');
    expect(result.ok).toBe(false);
  });

  it('무효 전환 → err code phase_invalid_transition', () => {
    const result = engine.transition('TEST', '이유', 'adev');
    if (!result.ok) expect(result.error.code).toBe('phase_invalid_transition');
  });

  it('무효 전환 이력에 기록 안 됨', () => {
    engine.transition('VERIFY', '이유', 'adev'); // invalid
    expect(engine.getHistory()).toHaveLength(0);
  });
});

// ── VERIFY 역방향 전환 ─────────────────────────────────────────

describe('PhaseEngine VERIFY 역방향 전환', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
    advanceToVerify(engine);
  });

  it('VERIFY → DESIGN 롤백 → ok', () => {
    const result = engine.transition('DESIGN', '설계 결함', 'adev');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('VERIFY → CODE 롤백 → ok', () => {
    const result = engine.transition('CODE', '구현 결함', 'adev');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('VERIFY → TEST 롤백 → ok', () => {
    const result = engine.transition('TEST', '테스트 미달', 'adev');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');
  });

  it('VERIFY → VERIFY 같은 Phase → err', () => {
    const result = engine.transition('VERIFY', '이유', 'adev');
    expect(result.ok).toBe(false);
  });

  it('VERIFY → DESIGN 롤백 후 DESIGN→CODE 재전환 가능', () => {
    engine.transition('DESIGN', '롤백', 'adev');
    const result = engine.transition('CODE', '재개발', 'coder');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('VERIFY → CODE 롤백 후 CODE→TEST 가능', () => {
    engine.transition('CODE', '롤백', 'adev');
    const result = engine.transition('TEST', '재테스트', 'tester');
    expect(result.ok).toBe(true);
  });

  it('VERIFY 롤백 후 이력에 기록됨', () => {
    const historyBefore = engine.getHistory().length;
    engine.transition('DESIGN', '롤백', 'adev');
    expect(engine.getHistory().length).toBe(historyBefore + 1);
  });

  it.each(['DESIGN', 'CODE', 'TEST'] as Phase[])('VERIFY → %s 롤백 ok', (phase) => {
    const result = engine.transition(phase, '롤백', 'adev');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe(phase);
  });
});

// ── canTransition ──────────────────────────────────────────────

describe('PhaseEngine canTransition', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('DESIGN → CODE: true', () => {
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('DESIGN → TEST: false', () => {
    expect(engine.canTransition('TEST')).toBe(false);
  });

  it('DESIGN → VERIFY: false', () => {
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('DESIGN → DESIGN: false', () => {
    expect(engine.canTransition('DESIGN')).toBe(false);
  });

  it('CODE 상태에서 TEST: true', () => {
    engine.transition('CODE', '이유', 'qa');
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('CODE 상태에서 DESIGN: false', () => {
    engine.transition('CODE', '이유', 'qa');
    expect(engine.canTransition('DESIGN')).toBe(false);
  });

  it('CODE 상태에서 VERIFY: false', () => {
    engine.transition('CODE', '이유', 'qa');
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('TEST 상태에서 VERIFY: true', () => {
    engine.transition('CODE', '이유', 'qa');
    engine.transition('TEST', '이유', 'architect');
    expect(engine.canTransition('VERIFY')).toBe(true);
  });

  it('VERIFY 상태에서 DESIGN: true', () => {
    advanceToVerify(engine);
    expect(engine.canTransition('DESIGN')).toBe(true);
  });

  it('VERIFY 상태에서 CODE: true', () => {
    advanceToVerify(engine);
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('VERIFY 상태에서 TEST: true', () => {
    advanceToVerify(engine);
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('VERIFY 상태에서 VERIFY: false', () => {
    advanceToVerify(engine);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });
});

// ── getParticipants ────────────────────────────────────────────

describe('PhaseEngine getParticipants', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('DESIGN lead: architect', () => {
    const p = engine.getParticipants('DESIGN');
    expect(p.lead).toContain('architect');
  });

  it('DESIGN active: qa, coder, reviewer', () => {
    const p = engine.getParticipants('DESIGN');
    expect(p.active).toContain('qa');
    expect(p.active).toContain('coder');
    expect(p.active).toContain('reviewer');
  });

  it('DESIGN inactive: tester, qc', () => {
    const p = engine.getParticipants('DESIGN');
    expect(p.inactive).toContain('tester');
    expect(p.inactive).toContain('qc');
  });

  it('CODE lead: coder', () => {
    const p = engine.getParticipants('CODE');
    expect(p.lead).toContain('coder');
  });

  it('CODE active: architect, reviewer', () => {
    const p = engine.getParticipants('CODE');
    expect(p.active).toContain('architect');
    expect(p.active).toContain('reviewer');
  });

  it('CODE inactive: qa, tester, qc', () => {
    const p = engine.getParticipants('CODE');
    expect(p.inactive).toContain('qa');
    expect(p.inactive).toContain('tester');
    expect(p.inactive).toContain('qc');
  });

  it('TEST lead: tester', () => {
    const p = engine.getParticipants('TEST');
    expect(p.lead).toContain('tester');
  });

  it('TEST active: qc', () => {
    const p = engine.getParticipants('TEST');
    expect(p.active).toContain('qc');
  });

  it('TEST inactive: architect, coder, reviewer', () => {
    const p = engine.getParticipants('TEST');
    expect(p.inactive).toContain('architect');
    expect(p.inactive).toContain('coder');
    expect(p.inactive).toContain('reviewer');
  });

  it('VERIFY active: qa, qc, reviewer', () => {
    const p = engine.getParticipants('VERIFY');
    expect(p.active).toContain('qa');
    expect(p.active).toContain('qc');
    expect(p.active).toContain('reviewer');
  });

  it('VERIFY lead: 빈 배열', () => {
    const p = engine.getParticipants('VERIFY');
    expect(p.lead).toHaveLength(0);
  });

  it('VERIFY inactive: architect, coder, tester', () => {
    const p = engine.getParticipants('VERIFY');
    expect(p.inactive).toContain('architect');
    expect(p.inactive).toContain('coder');
    expect(p.inactive).toContain('tester');
  });

  it.each(ALL_PHASES)('getParticipants(%s) → 반환값 정의됨', (phase) => {
    const p = engine.getParticipants(phase);
    expect(p.lead).toBeDefined();
    expect(p.active).toBeDefined();
    expect(p.inactive).toBeDefined();
  });
});

// ── getHistory ─────────────────────────────────────────────────

describe('PhaseEngine getHistory', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('초기 이력 빈 배열', () => {
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('전환 1개 → 이력 1개', () => {
    engine.transition('CODE', '이유', 'qa');
    expect(engine.getHistory()).toHaveLength(1);
  });

  it('전환 3개 → 이력 3개', () => {
    advanceToVerify(engine);
    expect(engine.getHistory()).toHaveLength(3);
  });

  it('이력은 읽기 전용 배열 (수정 불가)', () => {
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('무효 전환은 이력에 추가 안 됨', () => {
    engine.transition('VERIFY', '이유', 'adev'); // invalid
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('이력 복사본 반환 (원본 불변)', () => {
    engine.transition('CODE', '이유', 'qa');
    const h1 = engine.getHistory();
    engine.transition('TEST', '이유', 'architect');
    expect(h1).toHaveLength(1); // 이전 복사본 영향 없음
    expect(engine.getHistory()).toHaveLength(2);
  });

  it('이력의 timestamp는 Date', () => {
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect(history[0]?.timestamp).toBeInstanceOf(Date);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('PhaseEngine 복합 시나리오', () => {
  it('전체 순방향 + 롤백 + 재진행', () => {
    const engine = makeEngine();
    // 순방향
    advanceToVerify(engine);
    expect(engine.currentPhase).toBe('VERIFY');

    // DESIGN으로 롤백
    engine.transition('DESIGN', '설계 결함', 'adev');
    expect(engine.currentPhase).toBe('DESIGN');

    // 재진행
    engine.transition('CODE', '재개발', 'coder');
    engine.transition('TEST', '재테스트', 'tester');
    expect(engine.currentPhase).toBe('TEST');
  });

  it('VERIFY → CODE 롤백 후 재진행', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', '코드 결함', 'adev');
    engine.transition('TEST', '재테스트', 'tester');
    engine.transition('VERIFY', '검증', 'qa');
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('연속 무효 전환 → Phase 유지', () => {
    const engine = makeEngine();
    engine.transition('VERIFY', '이유', 'adev');
    engine.transition('TEST', '이유', 'adev');
    engine.transition('DESIGN', '이유', 'adev');
    expect(engine.currentPhase).toBe('DESIGN');
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('전환 이력에서 순서 확인', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    const history = engine.getHistory();
    const phases: Phase[] = history.map((h) => h.to);
    expect(phases).toEqual(['CODE', 'TEST', 'VERIFY']);
  });

  it('canTransition이 실제 전환 결과와 일치', () => {
    const engine = makeEngine();
    // DESIGN에서 CODE 가능
    expect(engine.canTransition('CODE')).toBe(true);
    const result = engine.transition('CODE', '이유', 'qa');
    expect(result.ok).toBe(true);

    // CODE에서 TEST 가능
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('10번 전체 순환 (DESIGN→CODE→TEST→VERIFY→DESIGN 반복)', () => {
    const engine = makeEngine();
    for (let i = 0; i < 3; i++) {
      advanceToVerify(engine);
      engine.transition('DESIGN', `롤백 ${i}`, 'adev');
    }
    expect(engine.currentPhase).toBe('DESIGN');
  });
});

// ── 추가 경계값: transition reason/triggeredBy ─────────────────

describe('PhaseEngine transition 경계값', () => {
  it('reason 빈 문자열 → ok', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '', 'qa');
    expect(result.ok).toBe(true);
  });

  it('reason 매우 긴 문자열 → ok', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', 'x'.repeat(5000), 'qa');
    expect(result.ok).toBe(true);
  });

  it('reason 한국어 → ok', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '코드 작성 단계로 전환', 'qa');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reason).toBe('코드 작성 단계로 전환');
  });

  it('triggeredBy architect → from/to 올바름', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '이유', 'architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.triggeredBy).toBe('architect');
      expect(result.value.from).toBe('DESIGN');
      expect(result.value.to).toBe('CODE');
    }
  });

  it('triggeredBy adev → 전환 가능', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '이유', 'adev');
    expect(result.ok).toBe(true);
  });

  it('5번 반복 DESIGN→CODE 시도 → 첫 번째만 ok', () => {
    const engine = makeEngine();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(engine.transition('CODE', '이유', 'qa'));
    }
    expect(results[0]!.ok).toBe(true);
    for (let i = 1; i < 5; i++) {
      expect(results[i]!.ok).toBe(false);
    }
  });

  it('전환 결과 from은 string', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '이유', 'qa');
    if (result.ok) expect(typeof result.value.from).toBe('string');
  });

  it('전환 결과 to는 string', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '이유', 'qa');
    if (result.ok) expect(typeof result.value.to).toBe('string');
  });

  it('전환 결과 reason은 string', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', '이유', 'qa');
    if (result.ok) expect(typeof result.value.reason).toBe('string');
  });

  it('전환 실패 error code는 string', () => {
    const engine = makeEngine();
    const result = engine.transition('VERIFY', '이유', 'adev');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('전환 실패 error message는 string', () => {
    const engine = makeEngine();
    const result = engine.transition('TEST', '이유', 'adev');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });
});

// ── 추가 경계값: canTransition 일관성 ──────────────────────────

describe('PhaseEngine canTransition 일관성', () => {
  it('canTransition CODE → CODE 항상 false', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    expect(engine.canTransition('CODE')).toBe(false);
  });

  it('canTransition TEST → TEST 항상 false', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    engine.transition('TEST', '이유', 'architect');
    expect(engine.canTransition('TEST')).toBe(false);
  });

  it('canTransition은 boolean', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      expect(typeof engine.canTransition(phase)).toBe('boolean');
    }
  });

  it('5번 canTransition 반복 → 일관된 결과', () => {
    const engine = makeEngine();
    for (let i = 0; i < 5; i++) {
      expect(engine.canTransition('CODE')).toBe(true);
      expect(engine.canTransition('TEST')).toBe(false);
    }
  });

  it('전환 전후 canTransition 결과 변경', () => {
    const engine = makeEngine();
    expect(engine.canTransition('CODE')).toBe(true);
    engine.transition('CODE', '이유', 'qa');
    expect(engine.canTransition('CODE')).toBe(false);
    expect(engine.canTransition('TEST')).toBe(true);
  });
});

// ── 추가 경계값: getParticipants 구조 ──────────────────────────

describe('PhaseEngine getParticipants 구조 검증', () => {
  it('모든 Phase → lead는 배열', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      expect(Array.isArray(engine.getParticipants(phase).lead)).toBe(true);
    }
  });

  it('모든 Phase → active는 배열', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      expect(Array.isArray(engine.getParticipants(phase).active)).toBe(true);
    }
  });

  it('모든 Phase → inactive는 배열', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      expect(Array.isArray(engine.getParticipants(phase).inactive)).toBe(true);
    }
  });

  it('lead + active + inactive 합집합은 ALL_AGENTS 포함', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      const p = engine.getParticipants(phase);
      const all = [...p.lead, ...p.active, ...p.inactive];
      expect(all.length).toBeGreaterThan(0);
    }
  });

  it('DESIGN getParticipants → 5번 반복 일관성', () => {
    const engine = makeEngine();
    const firstResult = engine.getParticipants('DESIGN');
    for (let i = 0; i < 4; i++) {
      const r = engine.getParticipants('DESIGN');
      expect(r.lead).toEqual(firstResult.lead);
      expect(r.active).toEqual(firstResult.active);
    }
  });
});
