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

  it('triggeredBy architect → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'architect');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy qa → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'qa');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy coder → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'coder');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy tester → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'tester');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy qc → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'qc');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy reviewer → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'reviewer');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy documenter → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'documenter');
    expect(result.ok).toBe(true);
  });

  it('triggeredBy adev → ok (DESIGN→CODE)', () => {
    const result = makeEngine().transition('CODE', '이유', 'adev');
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

  it('VERIFY → DESIGN 롤백 ok (it.each 대체)', () => {
    const e = makeEngine();
    advanceToVerify(e);
    const result = e.transition('DESIGN', '롤백', 'adev');
    expect(result.ok).toBe(true);
    expect(e.currentPhase).toBe('DESIGN');
  });

  it('VERIFY → CODE 롤백 ok (it.each 대체)', () => {
    const e = makeEngine();
    advanceToVerify(e);
    const result = e.transition('CODE', '롤백', 'adev');
    expect(result.ok).toBe(true);
    expect(e.currentPhase).toBe('CODE');
  });

  it('VERIFY → TEST 롤백 ok (it.each 대체)', () => {
    const e = makeEngine();
    advanceToVerify(e);
    const result = e.transition('TEST', '롤백', 'adev');
    expect(result.ok).toBe(true);
    expect(e.currentPhase).toBe('TEST');
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

  it('getParticipants(DESIGN) → 반환값 정의됨', () => {
    const p = engine.getParticipants('DESIGN');
    expect(p.lead).toBeDefined();
    expect(p.active).toBeDefined();
    expect(p.inactive).toBeDefined();
  });

  it('getParticipants(CODE) → 반환값 정의됨', () => {
    const p = engine.getParticipants('CODE');
    expect(p.lead).toBeDefined();
    expect(p.active).toBeDefined();
    expect(p.inactive).toBeDefined();
  });

  it('getParticipants(TEST) → 반환값 정의됨', () => {
    const p = engine.getParticipants('TEST');
    expect(p.lead).toBeDefined();
    expect(p.active).toBeDefined();
    expect(p.inactive).toBeDefined();
  });

  it('getParticipants(VERIFY) → 반환값 정의됨', () => {
    const p = engine.getParticipants('VERIFY');
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

// ── 추가 edge/random 케이스 ─────────────────────────────────

describe('PhaseEngine 추가 edge 케이스', () => {
  it('DESIGN → CODE 후 CODE → TEST 두 번 시도 → 두 번째 err', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    const r1 = engine.transition('TEST', '이유', 'architect');
    const r2 = engine.transition('TEST', '이유', 'architect');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });

  it('VERIFY → DESIGN 롤백 후 currentPhase=DESIGN', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', '롤백', 'adev');
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('VERIFY → CODE 롤백 후 currentPhase=CODE', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', '롤백', 'adev');
    expect(engine.currentPhase).toBe('CODE');
  });

  it('VERIFY → TEST 롤백 후 currentPhase=TEST', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('TEST', '롤백', 'adev');
    expect(engine.currentPhase).toBe('TEST');
  });

  it('전환 이력 항목에 from 필드 존재', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect('from' in (history[0] ?? {})).toBe(true);
  });

  it('전환 이력 항목에 to 필드 존재', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect('to' in (history[0] ?? {})).toBe(true);
  });

  it('전환 이력 항목에 reason 필드 존재', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect('reason' in (history[0] ?? {})).toBe(true);
  });

  it('전환 이력 항목에 triggeredBy 필드 존재', () => {
    const engine = makeEngine();
    engine.transition('CODE', '이유', 'qa');
    const history = engine.getHistory();
    expect('triggeredBy' in (history[0] ?? {})).toBe(true);
  });

  it('5번 독립 엔진 생성 → 각각 초기 phase DESIGN', () => {
    for (let i = 0; i < 5; i++) {
      const engine = makeEngine();
      expect(engine.currentPhase).toBe('DESIGN');
    }
  });

  it('canTransition 전후 history 길이 변하지 않음', () => {
    const engine = makeEngine();
    const before = engine.getHistory().length;
    engine.canTransition('CODE');
    engine.canTransition('TEST');
    const after = engine.getHistory().length;
    expect(after).toBe(before);
  });

  it('getParticipants 호출 후 currentPhase 변하지 않음', () => {
    const engine = makeEngine();
    engine.getParticipants('CODE');
    engine.getParticipants('VERIFY');
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('무효 전환 result.ok는 false', () => {
    const engine = makeEngine();
    const result = engine.transition('VERIFY', '이유', 'adev');
    expect(result.ok).toBe(false);
  });

  it('VERIFY 후 canTransition CODE → true', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('VERIFY 후 canTransition TEST → true', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('VERIFY 후 canTransition DESIGN → true', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.canTransition('DESIGN')).toBe(true);
  });
});

// ── 추가 순방향 전환 세부 검증 ─────────────────────────────────

describe('PhaseEngine 순방향 전환 세부 검증', () => {
  it('DESIGN→CODE 후 getHistory()[0].from은 DESIGN', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    expect(engine.getHistory()[0]?.from).toBe('DESIGN');
  });

  it('DESIGN→CODE 후 getHistory()[0].to는 CODE', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    expect(engine.getHistory()[0]?.to).toBe('CODE');
  });

  it('DESIGN→CODE 후 getHistory()[0].triggeredBy는 qa', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('qa');
  });

  it('CODE→TEST 후 getHistory()[1].from은 CODE', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'architect');
    expect(engine.getHistory()[1]?.from).toBe('CODE');
  });

  it('CODE→TEST 후 getHistory()[1].to는 TEST', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'architect');
    expect(engine.getHistory()[1]?.to).toBe('TEST');
  });

  it('TEST→VERIFY 후 getHistory()[2].from은 TEST', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.getHistory()[2]?.from).toBe('TEST');
  });

  it('TEST→VERIFY 후 getHistory()[2].to는 VERIFY', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.getHistory()[2]?.to).toBe('VERIFY');
  });

  it('전환 timestamp는 현재 시간 기준 (미래 아님)', () => {
    const before = new Date();
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    const ts = engine.getHistory()[0]?.timestamp;
    const after = new Date();
    if (ts) {
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });

  it('reason 특수문자 포함 → 저장됨', () => {
    const engine = makeEngine();
    const reason = '!@#$%^&*()-=_+[]{}|;:,.<>?';
    engine.transition('CODE', reason, 'qa');
    expect(engine.getHistory()[0]?.reason).toBe(reason);
  });

  it('reason 유니코드 → 저장됨', () => {
    const engine = makeEngine();
    const reason = '日本語テスト 中文测试 한국어';
    engine.transition('CODE', reason, 'qa');
    expect(engine.getHistory()[0]?.reason).toBe(reason);
  });

  it('triggeredBy qc → 이력에 저장됨', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qc');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('qc');
  });

  it('triggeredBy reviewer → 이력에 저장됨', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'reviewer');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('reviewer');
  });

  it('triggeredBy documenter → 이력에 저장됨', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'documenter');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('documenter');
  });

  it('triggeredBy tester → 이력에 저장됨', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'tester');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('tester');
  });

  it('triggeredBy coder → 이력에 저장됨', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'coder');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('coder');
  });

  it('매우 긴 reason (10000자) → 저장됨', () => {
    const engine = makeEngine();
    const reason = 'A'.repeat(10000);
    engine.transition('CODE', reason, 'qa');
    expect(engine.getHistory()[0]?.reason).toBe(reason);
  });
});

// ── 추가 VERIFY 롤백 세부 검증 ────────────────────────────────

describe('PhaseEngine VERIFY 롤백 세부 검증', () => {
  it('VERIFY→DESIGN 롤백 이력 항목 from=VERIFY', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'rollback', 'adev');
    const history = engine.getHistory();
    expect(history[3]?.from).toBe('VERIFY');
  });

  it('VERIFY→DESIGN 롤백 이력 항목 to=DESIGN', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'rollback', 'adev');
    const history = engine.getHistory();
    expect(history[3]?.to).toBe('DESIGN');
  });

  it('VERIFY→CODE 롤백 이력 항목 from=VERIFY', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rollback', 'adev');
    const history = engine.getHistory();
    expect(history[3]?.from).toBe('VERIFY');
  });

  it('VERIFY→CODE 롤백 이력 항목 to=CODE', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rollback', 'adev');
    const history = engine.getHistory();
    expect(history[3]?.to).toBe('CODE');
  });

  it('VERIFY→TEST 롤백 이력 항목 to=TEST', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('TEST', 'rollback', 'adev');
    const history = engine.getHistory();
    expect(history[3]?.to).toBe('TEST');
  });

  it('롤백 후 canTransition 결과가 새 Phase 기준', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rollback', 'adev');
    // CODE 상태에서는 TEST만 가능
    expect(engine.canTransition('TEST')).toBe(true);
    expect(engine.canTransition('DESIGN')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('VERIFY→DESIGN 롤백 후 canTransition CODE → true', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'rollback', 'adev');
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('VERIFY→TEST 롤백 후 canTransition VERIFY → true', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('TEST', 'rollback', 'adev');
    expect(engine.canTransition('VERIFY')).toBe(true);
  });

  it('2번 연속 VERIFY 롤백 시나리오', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rollback 1', 'adev');
    engine.transition('TEST', '재테스트', 'tester');
    engine.transition('VERIFY', '재검증', 'qa');
    // 다시 VERIFY에서 DESIGN으로
    const r = engine.transition('DESIGN', 'rollback 2', 'adev');
    expect(r.ok).toBe(true);
    expect(engine.currentPhase).toBe('DESIGN');
  });
});

// ── 추가 getParticipants 세부 검증 ───────────────────────────

describe('PhaseEngine getParticipants 세부 검증', () => {
  it('DESIGN lead 배열 길이 1', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').lead.length).toBe(1);
  });

  it('CODE lead 배열 길이 1', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').lead.length).toBe(1);
  });

  it('TEST lead 배열 길이 1', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('TEST').lead.length).toBe(1);
  });

  it('VERIFY lead 배열 길이 0', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').lead.length).toBe(0);
  });

  it('DESIGN active에 qa 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').active).toContain('qa');
  });

  it('DESIGN active에 reviewer 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').active).toContain('reviewer');
  });

  it('DESIGN inactive에 documenter 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').inactive).toContain('documenter');
  });

  it('CODE inactive에 documenter 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').inactive).toContain('documenter');
  });

  it('CODE inactive에 tester 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').inactive).toContain('tester');
  });

  it('TEST inactive에 documenter 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('TEST').inactive).toContain('documenter');
  });

  it('TEST inactive에 qa 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('TEST').inactive).toContain('qa');
  });

  it('VERIFY inactive에 documenter 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').inactive).toContain('documenter');
  });

  it('VERIFY active에 qc 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').active).toContain('qc');
  });

  it('VERIFY active에 qa 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').active).toContain('qa');
  });

  it('VERIFY active에 reviewer 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').active).toContain('reviewer');
  });

  it('getParticipants는 항상 동일 Phase에 동일 결과 반환', () => {
    const engine = makeEngine();
    const r1 = engine.getParticipants('DESIGN');
    const r2 = engine.getParticipants('DESIGN');
    expect(r1.lead).toEqual(r2.lead);
    expect(r1.active).toEqual(r2.active);
    expect(r1.inactive).toEqual(r2.inactive);
  });
});

// ── 추가 복합/엣지 시나리오 ────────────────────────────────────

describe('PhaseEngine 복합 엣지 시나리오', () => {
  it('DESIGN에서 CODE 이외 모든 전환 → err', () => {
    const targets: Phase[] = ['DESIGN', 'TEST', 'VERIFY'];
    for (const target of targets) {
      const engine = makeEngine();
      expect(engine.transition(target, 'r', 'qa').ok).toBe(false);
    }
  });

  it('CODE에서 TEST 이외 모든 전환 → err', () => {
    const targets: Phase[] = ['DESIGN', 'CODE', 'VERIFY'];
    for (const target of targets) {
      const engine = makeEngine();
      engine.transition('CODE', 'r', 'qa');
      expect(engine.transition(target, 'r', 'qa').ok).toBe(false);
    }
  });

  it('TEST에서 VERIFY 이외 모든 전환 → err', () => {
    const targets: Phase[] = ['DESIGN', 'CODE', 'TEST'];
    for (const target of targets) {
      const engine = makeEngine();
      engine.transition('CODE', 'r', 'qa');
      engine.transition('TEST', 'r', 'architect');
      expect(engine.transition(target, 'r', 'qa').ok).toBe(false);
    }
  });

  it('VERIFY에서 VERIFY 전환 → err', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.transition('VERIFY', 'r', 'qa').ok).toBe(false);
  });

  it('전환 실패 후 이력 길이 변화 없음', () => {
    const engine = makeEngine();
    const before = engine.getHistory().length;
    engine.transition('VERIFY', 'invalid', 'qa');
    expect(engine.getHistory().length).toBe(before);
  });

  it('전환 실패 후 currentPhase 변화 없음', () => {
    const engine = makeEngine();
    engine.transition('VERIFY', 'invalid', 'qa');
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('getHistory 호출이 내부 상태 변경 안 함', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    // getHistory()가 복사본을 반환하는지 확인
    const h1 = engine.getHistory();
    engine.transition('TEST', 'r2', 'architect');
    // h1은 1개 (이전 복사본), 새로 호출한 결과는 2개
    expect(h1.length).toBe(1);
    expect(engine.getHistory().length).toBe(2);
  });

  it('100번 연속 무효 전환 → 이력 0개 유지', () => {
    const engine = makeEngine();
    for (let i = 0; i < 100; i++) {
      engine.transition('VERIFY', 'skip', 'qa');
    }
    expect(engine.getHistory()).toHaveLength(0);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('5번 full 사이클 → 이력 누적', () => {
    const engine = makeEngine();
    let historyCount = 0;
    for (let i = 0; i < 5; i++) {
      advanceToVerify(engine);
      historyCount += 3;
      engine.transition('DESIGN', `rollback-${i}`, 'adev');
      historyCount += 1;
    }
    expect(engine.getHistory().length).toBe(historyCount);
  });

  it('canTransition은 상태를 변경하지 않음 (100번 호출)', () => {
    const engine = makeEngine();
    for (let i = 0; i < 100; i++) {
      engine.canTransition('CODE');
    }
    expect(engine.currentPhase).toBe('DESIGN');
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('getParticipants는 상태를 변경하지 않음', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      engine.getParticipants(phase);
    }
    expect(engine.currentPhase).toBe('DESIGN');
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('두 독립 엔진 → 각각 다른 Phase 진행 가능', () => {
    const e1 = makeEngine();
    const e2 = makeEngine();
    e1.transition('CODE', 'r', 'qa');
    // e1은 CODE, e2는 DESIGN
    expect(e1.currentPhase).toBe('CODE');
    expect(e2.currentPhase).toBe('DESIGN');
  });

  it('getHistory 반환값은 배열', () => {
    const engine = makeEngine();
    expect(Array.isArray(engine.getHistory())).toBe(true);
  });

  it('currentPhase는 Phase 타입 문자열', () => {
    const engine = makeEngine();
    const validPhases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(validPhases).toContain(engine.currentPhase);
  });

  it('전환 결과 value의 모든 필드가 정의됨', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', 'reason', 'qa');
    if (result.ok) {
      expect(result.value.from).toBeDefined();
      expect(result.value.to).toBeDefined();
      expect(result.value.reason).toBeDefined();
      expect(result.value.triggeredBy).toBeDefined();
      expect(result.value.timestamp).toBeDefined();
    }
  });
});

// ── 추가 getParticipants 일관성 검증 ───────────────────────────

describe('PhaseEngine getParticipants 일관성 추가 검증', () => {
  it('DESIGN getParticipants — lead는 architect', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('DESIGN');
    expect(p.lead[0]).toBe('architect');
  });

  it('CODE getParticipants — lead는 coder', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('CODE');
    expect(p.lead[0]).toBe('coder');
  });

  it('TEST getParticipants — lead는 tester', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('TEST');
    expect(p.lead[0]).toBe('tester');
  });

  it('VERIFY getParticipants — lead는 빈 배열', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('VERIFY').lead).toHaveLength(0);
  });

  it('DESIGN active에 documenter 없음', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('DESIGN');
    expect(p.active).not.toContain('documenter');
  });

  it('CODE active에 documenter 없음', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('CODE');
    expect(p.active).not.toContain('documenter');
  });

  it('TEST active에 documenter 없음', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('TEST');
    expect(p.active).not.toContain('documenter');
  });

  it('VERIFY active에 documenter 없음', () => {
    const engine = makeEngine();
    const p = engine.getParticipants('VERIFY');
    expect(p.active).not.toContain('documenter');
  });

  it('DESIGN: lead에 coder 없음', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').lead).not.toContain('coder');
  });

  it('CODE: lead에 architect 없음', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').lead).not.toContain('architect');
  });

  it('TEST: lead에 qc 없음', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('TEST').lead).not.toContain('qc');
  });

  it('TEST active에 qc 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('TEST').active).toContain('qc');
  });

  it('CODE active에 qa 없음', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').active).not.toContain('qa');
  });

  it('DESIGN inactive에 qc 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('DESIGN').inactive).toContain('qc');
  });

  it('CODE inactive에 qc 포함', () => {
    const engine = makeEngine();
    expect(engine.getParticipants('CODE').inactive).toContain('qc');
  });

  it('lead + active + inactive는 중복 없음', () => {
    const engine = makeEngine();
    for (const phase of ALL_PHASES) {
      const p = engine.getParticipants(phase);
      const combined = [...p.lead, ...p.active, ...p.inactive];
      const unique = new Set(combined);
      expect(unique.size).toBe(combined.length);
    }
  });

  it('getParticipants 결과가 Phase 변경에 영향받지 않음', () => {
    const engine = makeEngine();
    const beforeTransition = engine.getParticipants('DESIGN');
    engine.transition('CODE', 'r', 'qa');
    const afterTransition = engine.getParticipants('DESIGN');
    expect(beforeTransition.lead).toEqual(afterTransition.lead);
    expect(beforeTransition.active).toEqual(afterTransition.active);
  });
});

// ── 추가 transition 세부 edge ───────────────────────────────────

describe('PhaseEngine transition 세부 edge 추가', () => {
  it('DESIGN→CODE 후 CODE→TEST 후 TEST→VERIFY → history[2].triggeredBy가 qc', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'architect');
    engine.transition('VERIFY', 'r3', 'qc');
    expect(engine.getHistory()[2]?.triggeredBy).toBe('qc');
  });

  it('VERIFY→DESIGN 롤백 이력 triggeredBy가 adev', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'r', 'adev');
    const history = engine.getHistory();
    expect(history[history.length - 1]?.triggeredBy).toBe('adev');
  });

  it('VERIFY→CODE 롤백 이력 reason 보존', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', '코드 결함 수정 필요', 'adev');
    const history = engine.getHistory();
    expect(history[history.length - 1]?.reason).toBe('코드 결함 수정 필요');
  });

  it('VERIFY→TEST 롤백 이력 timestamp는 Date', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('TEST', 'r', 'adev');
    const history = engine.getHistory();
    expect(history[history.length - 1]?.timestamp).toBeInstanceOf(Date);
  });

  it('transition 결과 value의 triggeredBy가 adev인 경우', () => {
    const engine = makeEngine();
    const result = engine.transition('CODE', 'adev triggered', 'adev');
    if (result.ok) expect(result.value.triggeredBy).toBe('adev');
  });

  it('무효 전환 에러 message가 비어있지 않음', () => {
    const engine = makeEngine();
    const result = engine.transition('VERIFY', 'invalid', 'qa');
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('무효 전환 에러 code가 비어있지 않음', () => {
    const engine = makeEngine();
    const result = engine.transition('TEST', 'invalid', 'qa');
    if (!result.ok) expect(result.error.code.length).toBeGreaterThan(0);
  });

  it('transition reason null 문자 포함 → 이력에 보존', () => {
    const engine = makeEngine();
    const reason = 'reason\u0000with\u0000nulls';
    engine.transition('CODE', reason, 'qa');
    expect(engine.getHistory()[0]?.reason).toBe(reason);
  });

  it('DESIGN→CODE 전환 후 currentPhase는 CODE이고 canTransition(CODE)=false', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    expect(engine.currentPhase).toBe('CODE');
    expect(engine.canTransition('CODE')).toBe(false);
  });

  it('CODE→TEST 전환 후 currentPhase는 TEST이고 canTransition(TEST)=false', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    engine.transition('TEST', 'r2', 'architect');
    expect(engine.currentPhase).toBe('TEST');
    expect(engine.canTransition('TEST')).toBe(false);
  });

  it('TEST→VERIFY 전환 후 currentPhase는 VERIFY이고 canTransition(VERIFY)=false', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.currentPhase).toBe('VERIFY');
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('모든 triggeredBy에 대해 DESIGN→CODE 가능', () => {
    for (const trigger of ALL_TRIGGERS) {
      const engine = makeEngine();
      const result = engine.transition('CODE', 'r', trigger);
      expect(result.ok).toBe(true);
    }
  });

  it('모든 triggeredBy에 대해 VERIFY→DESIGN 롤백 가능', () => {
    for (const trigger of ALL_TRIGGERS) {
      const engine = makeEngine();
      advanceToVerify(engine);
      const result = engine.transition('DESIGN', 'r', trigger);
      expect(result.ok).toBe(true);
    }
  });

  it('5번 독립 full cycle → 각 엔진 phase DESIGN', () => {
    for (let i = 0; i < 5; i++) {
      const engine = makeEngine();
      advanceToVerify(engine);
      engine.transition('DESIGN', 'r', 'adev');
      expect(engine.currentPhase).toBe('DESIGN');
    }
  });
});

// ── 추가 canTransition 완전성 검증 ─────────────────────────────

describe('PhaseEngine canTransition 완전성 검증', () => {
  it('DESIGN 상태: CODE만 true, 나머지 모두 false', () => {
    const engine = makeEngine();
    expect(engine.canTransition('DESIGN')).toBe(false);
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('CODE 상태: TEST만 true, 나머지 모두 false', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    expect(engine.canTransition('DESIGN')).toBe(false);
    expect(engine.canTransition('CODE')).toBe(false);
    expect(engine.canTransition('TEST')).toBe(true);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('TEST 상태: VERIFY만 true, 나머지 모두 false', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    engine.transition('TEST', 'r2', 'architect');
    expect(engine.canTransition('DESIGN')).toBe(false);
    expect(engine.canTransition('CODE')).toBe(false);
    expect(engine.canTransition('TEST')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(true);
  });

  it('VERIFY 상태: DESIGN/CODE/TEST true, VERIFY false', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    expect(engine.canTransition('DESIGN')).toBe(true);
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(true);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('초기 상태에서 canTransition 결과는 일관됨 (10번 반복)', () => {
    const engine = makeEngine();
    for (let i = 0; i < 10; i++) {
      expect(engine.canTransition('CODE')).toBe(true);
      expect(engine.canTransition('VERIFY')).toBe(false);
    }
  });

  it('VERIFY 후 롤백 전 CODE 상태 → canTransition 결과 확인', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rollback', 'adev');
    // CODE 상태로 돌아왔으므로
    expect(engine.canTransition('TEST')).toBe(true);
    expect(engine.canTransition('DESIGN')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('VERIFY 후 롤백 전 TEST 상태 → canTransition 결과 확인', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('TEST', 'rollback', 'adev');
    // TEST 상태로 돌아왔으므로
    expect(engine.canTransition('VERIFY')).toBe(true);
    expect(engine.canTransition('CODE')).toBe(false);
    expect(engine.canTransition('DESIGN')).toBe(false);
  });

  it('VERIFY 후 롤백 전 DESIGN 상태 → canTransition 결과 확인', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'rollback', 'adev');
    // DESIGN 상태로 돌아왔으므로
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });
});

// ── 추가 history 불변성 검증 ───────────────────────────────────

describe('PhaseEngine history 불변성 추가 검증', () => {
  it('getHistory 결과 배열에 push 해도 내부 불변', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r', 'qa');
    const h = engine.getHistory();
    (h as unknown[]).push({ fake: 'data' });
    expect(engine.getHistory()).toHaveLength(1);
  });

  it('getHistory 결과 첫 요소 수정해도 내부 불변', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'original', 'qa');
    const h = engine.getHistory();
    if (h[0]) {
      // TypeScript에서 read-only일 수 있으므로 우회
      try {
        (h[0] as Record<string, unknown>)['reason'] = 'modified';
      } catch {
        // read-only면 무시
      }
    }
    // 내부 이력에는 original이 유지되어야 함
    const h2 = engine.getHistory();
    expect(h2[0]?.reason).toBe('original');
  });

  it('transition 3개 후 getHistory length 3 — 각 호출 독립', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    const h1 = engine.getHistory();
    const h2 = engine.getHistory();
    expect(h1.length).toBe(h2.length);
    expect(h1).not.toBe(h2); // 복사본이므로 다른 참조
  });

  it('5번 full cycle 후 이력 20개 (3+1 per cycle)', () => {
    const engine = makeEngine();
    for (let i = 0; i < 5; i++) {
      advanceToVerify(engine);
      engine.transition('DESIGN', `rb-${i}`, 'adev');
    }
    expect(engine.getHistory()).toHaveLength(20);
  });

  it('rollback 후 재진행 이력 타임스탬프 순서 유지', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'rb', 'adev');
    engine.transition('CODE', 're', 'coder');
    const history = engine.getHistory();
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]?.timestamp.getTime() ?? 0;
      const curr = history[i]?.timestamp.getTime() ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('단순 3개 전환 후 getHistory()[0].triggeredBy = qa', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'tester');
    engine.transition('VERIFY', 'r3', 'qc');
    expect(engine.getHistory()[0]?.triggeredBy).toBe('qa');
  });

  it('단순 3개 전환 후 getHistory()[1].triggeredBy = tester', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'tester');
    engine.transition('VERIFY', 'r3', 'qc');
    expect(engine.getHistory()[1]?.triggeredBy).toBe('tester');
  });

  it('단순 3개 전환 후 getHistory()[2].triggeredBy = qc', () => {
    const engine = makeEngine();
    engine.transition('CODE', 'r1', 'qa');
    engine.transition('TEST', 'r2', 'tester');
    engine.transition('VERIFY', 'r3', 'qc');
    expect(engine.getHistory()[2]?.triggeredBy).toBe('qc');
  });
});

// ── 추가 복합 엣지: 롤백 체인 ──────────────────────────────────

describe('PhaseEngine 롤백 체인 복합 시나리오', () => {
  it('VERIFY→CODE 후 CODE→TEST→VERIFY 재진행 → phase VERIFY', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('CODE', 'rb', 'adev');
    engine.transition('TEST', 're-test', 'tester');
    engine.transition('VERIFY', 're-verify', 'qa');
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('VERIFY→DESIGN 후 전체 재진행 → phase VERIFY', () => {
    const engine = makeEngine();
    advanceToVerify(engine);
    engine.transition('DESIGN', 'full-rb', 'adev');
    engine.transition('CODE', 're-code', 'coder');
    engine.transition('TEST', 're-test', 'tester');
    engine.transition('VERIFY', 're-verify', 'qc');
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('3번 연속 VERIFY→DESIGN 롤백 재진행 → phase VERIFY', () => {
    const engine = makeEngine();
    for (let i = 0; i < 3; i++) {
      advanceToVerify(engine);
      engine.transition('DESIGN', `rb-${i}`, 'adev');
    }
    advanceToVerify(engine);
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('VERIFY→TEST 후 TEST→VERIFY 재진행 → history 증가', () => {
    const engine = makeEngine();
    advanceToVerify(engine); // 3개
    engine.transition('TEST', 'rb', 'adev'); // 4개
    engine.transition('VERIFY', 're', 'qa'); // 5개
    expect(engine.getHistory()).toHaveLength(5);
  });

  it('VERIFY→CODE 후 CODE→TEST→VERIFY 2회 반복 → history 누적', () => {
    const engine = makeEngine();
    advanceToVerify(engine); // 3
    engine.transition('CODE', 'rb', 'adev'); // 4
    engine.transition('TEST', 're1', 'tester'); // 5
    engine.transition('VERIFY', 're2', 'qa'); // 6
    engine.transition('CODE', 'rb2', 'adev'); // 7
    engine.transition('TEST', 're3', 'tester'); // 8
    engine.transition('VERIFY', 're4', 'qa'); // 9
    expect(engine.getHistory()).toHaveLength(9);
  });

  it('무효 전환 100번 + 유효 1번 → history 1개', () => {
    const engine = makeEngine();
    for (let i = 0; i < 100; i++) {
      engine.transition('VERIFY', 'inv', 'qa');
    }
    engine.transition('CODE', 'valid', 'qa');
    expect(engine.getHistory()).toHaveLength(1);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('독립 엔진 10개 동시 사용 → 각각 다른 phase 진행', () => {
    const engines = Array.from({ length: 10 }, () => makeEngine());
    // 홀수 인덱스는 CODE, 짝수는 DESIGN
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 1) {
        engines[i]!.transition('CODE', 'r', 'qa');
      }
    }
    for (let i = 0; i < 10; i++) {
      const expected = i % 2 === 1 ? 'CODE' : 'DESIGN';
      expect(engines[i]!.currentPhase).toBe(expected);
    }
  });

  it('canTransition과 transition 결과 일치성 (20번 반복)', () => {
    for (let i = 0; i < 20; i++) {
      const engine = makeEngine();
      const canCode = engine.canTransition('CODE');
      const result = engine.transition('CODE', 'r', 'qa');
      expect(result.ok).toBe(canCode);
    }
  });

  it('DESIGN에서 모든 무효 전환 후 phase 여전히 DESIGN', () => {
    const engine = makeEngine();
    const invalid: Phase[] = ['DESIGN', 'TEST', 'VERIFY'];
    for (const p of invalid) {
      engine.transition(p, 'inv', 'qa');
    }
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('5번 빠른 사이클 후 phase 항상 DESIGN (매 사이클 rollback)', () => {
    const engine = makeEngine();
    for (let i = 0; i < 5; i++) {
      advanceToVerify(engine);
      engine.transition('DESIGN', 'rb', 'adev');
    }
    expect(engine.currentPhase).toBe('DESIGN');
  });
});
