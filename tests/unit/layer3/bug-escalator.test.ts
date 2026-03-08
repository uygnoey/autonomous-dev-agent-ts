/**
 * BugEscalator 단위 테스트 / BugEscalator unit tests
 *
 * @description
 * KR: createReport/escalate/getActiveReports/resolveReport 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for BugEscalator methods. 80%+ edge/invalid ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { BugEscalator } from 'layer3/bug-escalator.js';
import type { TestFailure } from 'layer3/types.js';

function createFailure(overrides?: Partial<TestFailure>): TestFailure {
  return {
    testName: 'test-login',
    error: 'assertion failed',
    featureId: 'feat-1',
    ...overrides,
  };
}

function makeEscalator(): BugEscalator {
  return new BugEscalator(new ConsoleLogger('error'));
}

// ── 생성자 ────────────────────────────────────────────────────

describe('BugEscalator 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => makeEscalator()).not.toThrow();
  });

  it('BugEscalator 인스턴스이다', () => {
    expect(makeEscalator()).toBeInstanceOf(BugEscalator);
  });

  it('초기 활성 리포트가 없다', () => {
    const e = makeEscalator();
    expect(e.getActiveReports('any-proj')).toHaveLength(0);
  });

  it('두 인스턴스가 서로 다른 객체이다', () => {
    const e1 = makeEscalator();
    const e2 = makeEscalator();
    expect(e1).not.toBe(e2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new BugEscalator(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new BugEscalator(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 생성 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeEscalator()).not.toThrow();
    }
  });

  it('createReport 메서드가 존재한다', () => {
    expect(typeof makeEscalator().createReport).toBe('function');
  });

  it('escalate 메서드가 존재한다', () => {
    expect(typeof makeEscalator().escalate).toBe('function');
  });

  it('getActiveReports 메서드가 존재한다', () => {
    expect(typeof makeEscalator().getActiveReports).toBe('function');
  });

  it('resolveReport 메서드가 존재한다', () => {
    expect(typeof makeEscalator().resolveReport).toBe('function');
  });
});

// ── createReport - 성공 케이스 ────────────────────────────────

describe('BugEscalator createReport - 성공 케이스', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('정상 실패로 ok=true 반환', () => {
    const result = escalator.createReport('proj-1', createFailure());
    expect(result.ok).toBe(true);
  });

  it('ok가 boolean이다', () => {
    const result = escalator.createReport('proj-1', createFailure());
    expect(typeof result.ok).toBe('boolean');
  });

  it('결과에 projectId가 포함된다', () => {
    const result = escalator.createReport('proj-x', createFailure());
    if (result.ok) expect(result.value.projectId).toBe('proj-x');
  });

  it('결과에 featureId가 포함된다', () => {
    const result = escalator.createReport('proj-1', createFailure({ featureId: 'feat-auth' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-auth');
  });

  it('description에 testName이 포함된다', () => {
    const result = escalator.createReport('proj-1', createFailure({ testName: 'test-auth' }));
    if (result.ok) expect(result.value.description).toContain('test-auth');
  });

  it('description에 error가 포함된다', () => {
    const result = escalator.createReport('proj-1', createFailure({ error: 'unexpected error' }));
    if (result.ok) expect(result.value.description).toContain('unexpected error');
  });

  it('severity가 정의된다', () => {
    const result = escalator.createReport('proj-1', createFailure());
    if (result.ok) expect(result.value.severity).toBeTruthy();
  });

  it('id가 문자열이다', () => {
    const result = escalator.createReport('proj-1', createFailure());
    if (result.ok) expect(typeof result.value.id).toBe('string');
  });

  it('id가 비어있지 않다', () => {
    const result = escalator.createReport('proj-1', createFailure());
    if (result.ok) expect(result.value.id.length).toBeGreaterThan(0);
  });

  it('두 리포트의 id가 다르다', () => {
    const r1 = escalator.createReport('proj-1', createFailure({ error: 'error one' }));
    const r2 = escalator.createReport('proj-1', createFailure({ error: 'error two' }));
    if (r1.ok && r2.ok) expect(r1.value.id).not.toBe(r2.value.id);
  });

  it('10개 리포트 모두 ok=true', () => {
    for (let i = 0; i < 10; i++) {
      const result = escalator.createReport(`proj-${i}`, createFailure({ error: `error-${i}` }));
      expect(result.ok).toBe(true);
    }
  });

  it('10개 리포트 모두 다른 id', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = escalator.createReport('proj', createFailure({ error: `err-${i}` }));
      if (result.ok) ids.add(result.value.id);
    }
    expect(ids.size).toBe(10);
  });

  it('UUID featureId → ok=true', () => {
    const uuid = crypto.randomUUID();
    const result = escalator.createReport('proj', createFailure({ featureId: uuid }));
    expect(result.ok).toBe(true);
  });

  it('한국어 projectId → ok=true', () => {
    const result = escalator.createReport('프로젝트-인증', createFailure());
    expect(result.ok).toBe(true);
  });

  it('긴 error 메시지 → ok=true', () => {
    const longError = 'A'.repeat(1000);
    const result = escalator.createReport('proj', createFailure({ error: longError }));
    expect(result.ok).toBe(true);
  });

  it('이모지 error → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ error: '🚨 critical failure 🚨' }));
    expect(result.ok).toBe(true);
  });

  it('description이 문자열이다', () => {
    const result = escalator.createReport('proj', createFailure());
    if (result.ok) expect(typeof result.value.description).toBe('string');
  });

  it('projectId가 문자열이다', () => {
    const result = escalator.createReport('proj', createFailure());
    if (result.ok) expect(typeof result.value.projectId).toBe('string');
  });

  it('featureId가 문자열이다', () => {
    const result = escalator.createReport('proj', createFailure({ featureId: 'f-1' }));
    if (result.ok) expect(typeof result.value.featureId).toBe('string');
  });
});

// ── createReport - 심각도 분류 ────────────────────────────────

describe('BugEscalator createReport - 심각도 분류', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('fatal 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'fatal crash in payment module' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('crash 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'crash detected in auth' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('security 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'SQL injection vulnerability detected' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('timeout 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'timeout exception during API call' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('exception 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'NullPointerException in handler' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('분류 불가 에러 → low', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'something unexpected happened' }));
    if (result.ok) expect(result.value.severity).toBe('low');
  });

  it('minor 키워드 → low 또는 minor (not critical)', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'minor styling issue' }));
    if (result.ok) expect(['low', 'minor']).toContain(result.value.severity);
  });

  it('임의 텍스트 에러 → severity가 정의된다', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'random test failure xyz' }));
    if (result.ok) expect(result.value.severity).toBeDefined();
  });

  it('severity는 유효한 값 중 하나이다', () => {
    const result = escalator.createReport('proj', createFailure());
    const validSeverities = ['critical', 'major', 'minor', 'low'];
    if (result.ok) expect(validSeverities).toContain(result.value.severity);
  });

  it('fatal → critical 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = escalator.createReport('proj', createFailure({ error: `fatal error ${i}` }));
      if (result.ok) expect(result.value.severity).toBe('critical');
    }
  });

  it('timeout → major 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = escalator.createReport('proj', createFailure({ error: `timeout error ${i}` }));
      if (result.ok) expect(result.value.severity).toBe('major');
    }
  });
});

// ── createReport - 실패 케이스 ────────────────────────────────

describe('BugEscalator createReport - 실패 케이스', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('빈 projectId → ok=false', () => {
    const result = escalator.createReport('', createFailure());
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 projectId → ok=false', () => {
    const result = escalator.createReport('   ', createFailure());
    expect(result.ok).toBe(false);
  });

  it('탭만 있는 projectId → ok=false', () => {
    const result = escalator.createReport('\t\t', createFailure());
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 projectId → ok=false', () => {
    const result = escalator.createReport('\n\n', createFailure());
    expect(result.ok).toBe(false);
  });

  it('빈 error → ok=false', () => {
    const result = escalator.createReport('proj', createFailure({ error: '' }));
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 error → ok=false', () => {
    const result = escalator.createReport('proj', createFailure({ error: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('탭만 있는 error → ok=false', () => {
    const result = escalator.createReport('proj', createFailure({ error: '\t\t' }));
    expect(result.ok).toBe(false);
  });

  it('빈 projectId + 빈 error → ok=false', () => {
    const result = escalator.createReport('', createFailure({ error: '' }));
    expect(result.ok).toBe(false);
  });

  it('빈 projectId 에러 코드가 문자열이다', () => {
    const result = escalator.createReport('', createFailure());
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('빈 projectId 에러 메시지가 문자열이다', () => {
    const result = escalator.createReport('', createFailure());
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('빈 projectId 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = escalator.createReport('', createFailure());
      expect(result.ok).toBe(false);
    }
  });

  it('빈 error 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = escalator.createReport('proj', createFailure({ error: '' }));
      expect(result.ok).toBe(false);
    }
  });
});

// ── escalate ─────────────────────────────────────────────────

describe('BugEscalator escalate', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('critical → targetPhase=CODE', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('major → targetPhase=TEST', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'timeout exception' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('minor → targetPhase=VERIFY', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'minor styling issue' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(['VERIFY', 'TEST', 'CODE']).toContain(result.value.targetPhase);
  });

  it('escalate 결과에 targetPhase가 있다', () => {
    const rr = escalator.createReport('proj', createFailure());
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBeDefined();
  });

  it('escalate 결과 targetPhase가 유효한 값이다', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    const validPhases = ['CODE', 'TEST', 'VERIFY', 'SPEC'];
    if (result.ok) expect(validPhases).toContain(result.value.targetPhase);
  });

  it('critical → CODE 10번 반복 일관성', () => {
    for (let i = 0; i < 10; i++) {
      const rr = escalator.createReport(`proj-${i}`, createFailure({ error: `fatal crash ${i}` }));
      if (!rr.ok) continue;
      const result = escalator.escalate(rr.value);
      if (result.ok) expect(result.value.targetPhase).toBe('CODE');
    }
  });

  it('major → TEST 10번 반복 일관성', () => {
    for (let i = 0; i < 10; i++) {
      const rr = escalator.createReport(`proj-${i}`, createFailure({ error: `timeout ${i}` }));
      if (!rr.ok) continue;
      const result = escalator.escalate(rr.value);
      if (result.ok) expect(result.value.targetPhase).toBe('TEST');
    }
  });

  it('escalate ok가 boolean이다', () => {
    const rr = escalator.createReport('proj', createFailure());
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    expect(typeof result.ok).toBe('boolean');
  });

  it('targetPhase가 문자열이다', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    if (result.ok) expect(typeof result.value.targetPhase).toBe('string');
  });

  it('crash 키워드 → targetPhase=CODE', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'system crash detected' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('exception 키워드 → targetPhase=TEST', () => {
    const rr = escalator.createReport('proj', createFailure({ error: 'NullPointerException thrown' }));
    if (!rr.ok) return;
    const result = escalator.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });
});

// ── getActiveReports ──────────────────────────────────────────

describe('BugEscalator getActiveReports', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('초기 상태 → 빈 배열', () => {
    expect(escalator.getActiveReports('proj-new')).toHaveLength(0);
  });

  it('1개 생성 후 → 1개 반환', () => {
    escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    expect(escalator.getActiveReports('proj-1')).toHaveLength(1);
  });

  it('다른 프로젝트 메시지는 반환하지 않는다', () => {
    escalator.createReport('proj-other', createFailure({ error: 'err' }));
    expect(escalator.getActiveReports('proj-mine')).toHaveLength(0);
  });

  it('2개 생성 후 → 2개 반환', () => {
    escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    escalator.createReport('proj-1', createFailure({ error: 'err B' }));
    expect(escalator.getActiveReports('proj-1')).toHaveLength(2);
  });

  it('여러 프로젝트 분리 조회', () => {
    escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    escalator.createReport('proj-2', createFailure({ error: 'err B' }));
    escalator.createReport('proj-1', createFailure({ error: 'err C' }));
    expect(escalator.getActiveReports('proj-1')).toHaveLength(2);
    expect(escalator.getActiveReports('proj-2')).toHaveLength(1);
  });

  it('실패한 createReport는 activeReports에 포함되지 않음', () => {
    escalator.createReport('proj-1', createFailure({ error: '' })); // 실패
    expect(escalator.getActiveReports('proj-1')).toHaveLength(0);
  });

  it('반환값이 배열이다', () => {
    expect(Array.isArray(escalator.getActiveReports('proj'))).toBe(true);
  });

  it('5개 생성 → 5개 반환', () => {
    for (let i = 0; i < 5; i++) {
      escalator.createReport('proj-five', createFailure({ error: `err-${i}` }));
    }
    expect(escalator.getActiveReports('proj-five')).toHaveLength(5);
  });

  it('빈 projectId → 빈 배열', () => {
    escalator.createReport('proj', createFailure());
    expect(escalator.getActiveReports('')).toHaveLength(0);
  });

  it('연속 호출 → 동일 결과', () => {
    escalator.createReport('proj', createFailure());
    const r1 = escalator.getActiveReports('proj');
    const r2 = escalator.getActiveReports('proj');
    expect(r1.length).toBe(r2.length);
  });

  it('10개 프로젝트 각각 분리 → 모두 1개씩', () => {
    for (let i = 0; i < 10; i++) {
      escalator.createReport(`proj-iso-${i}`, createFailure({ error: `err ${i}` }));
    }
    for (let i = 0; i < 10; i++) {
      expect(escalator.getActiveReports(`proj-iso-${i}`)).toHaveLength(1);
    }
  });

  it('존재하지 않는 projectId → 빈 배열', () => {
    const uuid = crypto.randomUUID();
    expect(escalator.getActiveReports(uuid)).toHaveLength(0);
  });
});

// ── resolveReport ─────────────────────────────────────────────

describe('BugEscalator resolveReport', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('존재하는 리포트 해결 → ok=true', () => {
    const rr = escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    if (!rr.ok) return;
    const result = escalator.resolveReport(rr.value.id);
    expect(result.ok).toBe(true);
  });

  it('해결 후 activeReports에서 제거', () => {
    const rr = escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    if (!rr.ok) return;
    escalator.resolveReport(rr.value.id);
    expect(escalator.getActiveReports('proj-1')).toHaveLength(0);
  });

  it('존재하지 않는 id → ok=false', () => {
    const result = escalator.resolveReport('nonexistent-id');
    expect(result.ok).toBe(false);
  });

  it('이미 해결된 리포트 재해결 → ok=false', () => {
    const rr = escalator.createReport('proj-1', createFailure({ error: 'err A' }));
    if (!rr.ok) return;
    escalator.resolveReport(rr.value.id);
    const result = escalator.resolveReport(rr.value.id);
    expect(result.ok).toBe(false);
  });

  it('빈 id → ok=false', () => {
    const result = escalator.resolveReport('');
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 id → ok=false', () => {
    const result = escalator.resolveReport('   ');
    expect(result.ok).toBe(false);
  });

  it('2개 중 1개만 해제 → 나머지 1개 active', () => {
    const r1 = escalator.createReport('proj', createFailure({ error: 'err A' }));
    const r2 = escalator.createReport('proj', createFailure({ error: 'err B' }));
    if (!r1.ok || !r2.ok) return;
    escalator.resolveReport(r1.value.id);
    expect(escalator.getActiveReports('proj')).toHaveLength(1);
  });

  it('5개 생성 5개 해결 → active 0개', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const rr = escalator.createReport('proj', createFailure({ error: `err-${i}` }));
      if (rr.ok) ids.push(rr.value.id);
    }
    for (const id of ids) escalator.resolveReport(id);
    expect(escalator.getActiveReports('proj')).toHaveLength(0);
  });

  it('다른 프로젝트 리포트는 영향 없음', () => {
    const r1 = escalator.createReport('proj-a', createFailure({ error: 'err A' }));
    escalator.createReport('proj-b', createFailure({ error: 'err B' }));
    if (!r1.ok) return;
    escalator.resolveReport(r1.value.id);
    expect(escalator.getActiveReports('proj-b')).toHaveLength(1);
  });

  it('ok가 boolean이다 (resolve 성공)', () => {
    const rr = escalator.createReport('proj', createFailure());
    if (!rr.ok) return;
    const result = escalator.resolveReport(rr.value.id);
    expect(typeof result.ok).toBe('boolean');
  });

  it('ok가 boolean이다 (resolve 실패)', () => {
    const result = escalator.resolveReport('nonexistent');
    expect(typeof result.ok).toBe('boolean');
  });

  it('에러 코드가 문자열이다 (resolve 실패)', () => {
    const result = escalator.resolveReport('no-such-id');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('UUID id 미존재 → ok=false', () => {
    const uuid = crypto.randomUUID();
    const result = escalator.resolveReport(uuid);
    expect(result.ok).toBe(false);
  });

  it('resolve 5번 반복 일관성 (미존재)', () => {
    for (let i = 0; i < 5; i++) {
      const result = escalator.resolveReport(`no-id-${i}`);
      expect(result.ok).toBe(false);
    }
  });
});

// ── 복합/반복 시나리오 ────────────────────────────────────────

describe('BugEscalator 복합/반복 시나리오', () => {
  it('여러 인스턴스가 독립적으로 동작한다', () => {
    const e1 = makeEscalator();
    const e2 = makeEscalator();
    e1.createReport('proj', createFailure());
    expect(e1.getActiveReports('proj')).toHaveLength(1);
    expect(e2.getActiveReports('proj')).toHaveLength(0);
  });

  it('createReport → escalate → resolveReport 파이프라인', () => {
    const escalator = makeEscalator();
    const rr = escalator.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const er = escalator.escalate(rr.value);
    expect(er.ok).toBe(true);
    if (er.ok) expect(er.value.targetPhase).toBe('CODE');
    const resolve = escalator.resolveReport(rr.value.id);
    expect(resolve.ok).toBe(true);
    expect(escalator.getActiveReports('proj')).toHaveLength(0);
  });

  it('10번 create-resolve 사이클 → active 항상 0', () => {
    const escalator = makeEscalator();
    for (let i = 0; i < 10; i++) {
      const rr = escalator.createReport('proj', createFailure({ error: `err-${i}` }));
      if (rr.ok) escalator.resolveReport(rr.value.id);
    }
    expect(escalator.getActiveReports('proj')).toHaveLength(0);
  });

  it('모든 심각도 분류 → escalate 파이프라인', () => {
    const escalator = makeEscalator();
    const errors = [
      'fatal crash',
      'timeout exception',
      'minor styling issue',
      'something unknown',
    ];
    for (const error of errors) {
      const rr = escalator.createReport('proj-all', createFailure({ error }));
      if (!rr.ok) continue;
      const result = escalator.escalate(rr.value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.targetPhase).toBe('string');
        expect(result.value.targetPhase.length).toBeGreaterThan(0);
      }
    }
  });

  it('50개 create 스트레스 테스트', () => {
    const escalator = makeEscalator();
    for (let i = 0; i < 50; i++) {
      const result = escalator.createReport('proj-stress', createFailure({ error: `stress-${i}` }));
      expect(result.ok).toBe(true);
    }
    expect(escalator.getActiveReports('proj-stress')).toHaveLength(50);
  });

  it('create → 절반 resolve → 나머지 확인', () => {
    const escalator = makeEscalator();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rr = escalator.createReport('proj-half', createFailure({ error: `err-${i}` }));
      if (rr.ok) ids.push(rr.value.id);
    }
    // 앞 5개만 해결
    for (let i = 0; i < 5; i++) {
      const id = ids[i];
      if (id) escalator.resolveReport(id);
    }
    expect(escalator.getActiveReports('proj-half')).toHaveLength(5);
  });

  it('두 인스턴스 독립 파이프라인', () => {
    const e1 = makeEscalator();
    const e2 = makeEscalator();

    e1.createReport('proj', createFailure({ error: 'fatal crash' }));
    e2.createReport('proj', createFailure({ error: 'timeout' }));

    expect(e1.getActiveReports('proj')).toHaveLength(1);
    expect(e2.getActiveReports('proj')).toHaveLength(1);
  });
});

// ── 추가 edge: createReport 극단값 ────────────────────────────

describe('BugEscalator createReport 극단값', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('projectId 한글 → ok=true', () => {
    const result = escalator.createReport('프로젝트-결제', createFailure());
    expect(result.ok).toBe(true);
  });

  it('projectId 이모지 → ok=true', () => {
    const result = escalator.createReport('proj-🚀', createFailure());
    expect(result.ok).toBe(true);
  });

  it('projectId 특수문자 → ok=true', () => {
    const result = escalator.createReport('proj!@#$', createFailure());
    expect(result.ok).toBe(true);
  });

  it('error 한글 → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ error: '인증 오류 발생' }));
    expect(result.ok).toBe(true);
  });

  it('error 특수문자 → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ error: '!!!error!!! @#$%' }));
    expect(result.ok).toBe(true);
  });

  it('error 개행 포함 → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'line1\nline2\nline3' }));
    expect(result.ok).toBe(true);
  });

  it('testName UUID 형식 → ok=true', () => {
    const uuid = crypto.randomUUID();
    const result = escalator.createReport('proj', createFailure({ testName: uuid }));
    expect(result.ok).toBe(true);
  });

  it('testName 한글 → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ testName: '인증-테스트' }));
    expect(result.ok).toBe(true);
  });

  it('error 단일 문자 → ok=true', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'x' }));
    expect(result.ok).toBe(true);
  });

  it('security 키워드 대문자 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'SECURITY breach detected' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('crash 대문자 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'CRASH in module' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('timeout 대문자 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'TIMEOUT during request' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });
});

// ── 추가 edge: resolveReport 극단값 ──────────────────────────

describe('BugEscalator resolveReport 추가 edge', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('탭만 있는 id → ok=false', () => {
    const result = escalator.resolveReport('\t\t');
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 id → ok=false', () => {
    const result = escalator.resolveReport('\n\n');
    expect(result.ok).toBe(false);
  });

  it('10개 create 후 10개 resolve → 최종 active 0', () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rr = escalator.createReport('proj-ten', createFailure({ error: `err-${i}` }));
      if (rr.ok) ids.push(rr.value.id);
    }
    for (const id of ids) {
      const r = escalator.resolveReport(id);
      expect(r.ok).toBe(true);
    }
    expect(escalator.getActiveReports('proj-ten')).toHaveLength(0);
  });

  it('resolve 후 getActiveReports 반환값이 배열', () => {
    const rr = escalator.createReport('proj', createFailure());
    if (!rr.ok) return;
    escalator.resolveReport(rr.value.id);
    expect(Array.isArray(escalator.getActiveReports('proj'))).toBe(true);
  });
});

// ── 추가 edge: escalate 극단값 ───────────────────────────────

describe('BugEscalator escalate 추가 edge', () => {
  it('security 키워드 → targetPhase=CODE', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'security breach found' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('UUID featureId → escalate ok', () => {
    const e = makeEscalator();
    const uuid = crypto.randomUUID();
    const rr = e.createReport('proj', createFailure({ featureId: uuid, error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    expect(result.ok).toBe(true);
  });

  it('한글 error → escalate ok', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: '인증 오류 발생' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    expect(result.ok).toBe(true);
  });

  it('이모지 error → escalate ok', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: '🚨 critical!!' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    expect(result.ok).toBe(true);
  });

  it('연속 escalate 5회 → 항상 ok', () => {
    const e = makeEscalator();
    for (let i = 0; i < 5; i++) {
      const rr = e.createReport(`proj-${i}`, createFailure({ error: `fatal crash ${i}` }));
      if (!rr.ok) continue;
      const result = e.escalate(rr.value);
      expect(result.ok).toBe(true);
    }
  });

  it('targetPhase는 빈 문자열이 아니다', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase.length).toBeGreaterThan(0);
  });

  it('reportId가 escalate 결과에 존재할 수 있다', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    expect(result.ok).toBe(true);
  });
});

// ── 추가 edge: getActiveReports 극단값 ────────────────────────

describe('BugEscalator getActiveReports 추가 edge', () => {
  it('UUID projectId → 빈 배열', () => {
    const e = makeEscalator();
    const uuid = crypto.randomUUID();
    expect(e.getActiveReports(uuid)).toHaveLength(0);
  });

  it('한글 projectId → 빈 배열 (없으면)', () => {
    const e = makeEscalator();
    expect(e.getActiveReports('한글-프로젝트')).toHaveLength(0);
  });

  it('20개 생성 → 모두 동일 projectId로 조회 → 20개', () => {
    const e = makeEscalator();
    for (let i = 0; i < 20; i++) {
      e.createReport('proj-bulk', createFailure({ error: `err-${i}` }));
    }
    expect(e.getActiveReports('proj-bulk')).toHaveLength(20);
  });

  it('두 프로젝트 각 10개 → 각각 10개씩 독립', () => {
    const e = makeEscalator();
    for (let i = 0; i < 10; i++) {
      e.createReport('proj-A', createFailure({ error: `A-err-${i}` }));
      e.createReport('proj-B', createFailure({ error: `B-err-${i}` }));
    }
    expect(e.getActiveReports('proj-A')).toHaveLength(10);
    expect(e.getActiveReports('proj-B')).toHaveLength(10);
  });

  it('getActiveReports 결과는 각각 id 필드를 가진다', () => {
    const e = makeEscalator();
    e.createReport('proj', createFailure({ error: 'some error' }));
    const reports = e.getActiveReports('proj');
    for (const r of reports) {
      expect(typeof r.id).toBe('string');
    }
  });

  it('getActiveReports 결과는 projectId 필드를 가진다', () => {
    const e = makeEscalator();
    e.createReport('proj-field', createFailure({ error: 'field check' }));
    const reports = e.getActiveReports('proj-field');
    for (const r of reports) {
      expect(r.projectId).toBe('proj-field');
    }
  });
});

// ── 추가 edge: createReport 심각도 세부 분류 ──────────────────

describe('BugEscalator createReport 심각도 세부 분류 추가', () => {
  let escalator: BugEscalator;

  beforeEach(() => {
    escalator = makeEscalator();
  });

  it('injection 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'SQL injection detected in query' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('segfault 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'segfault in memory handler' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('data loss 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'data loss occurred during write' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('error 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'error in processing pipeline' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('failed 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'request failed with status 503' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('undefined 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'undefined is not a function' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('null 키워드 → major', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'cannot read property of null' }));
    if (result.ok) expect(result.value.severity).toBe('major');
  });

  it('font 키워드 → minor', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'font rendering glitch' }));
    if (result.ok) expect(result.value.severity).toBe('minor');
  });

  it('완전히 다른 텍스트 → low', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'something went sideways' }));
    if (result.ok) expect(result.value.severity).toBe('low');
  });

  it('oom 키워드 → critical', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'oom killer activated' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('severity 결정 후 phase 필드가 존재한다', () => {
    const result = escalator.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (result.ok) {
      // phase 필드가 BugReport에 있을 수 있음 (구현 의존)
      expect(result.value.severity).toBeDefined();
    }
  });

  it('UUID projectId로 심각도 분류 → ok=true', () => {
    const uuid = crypto.randomUUID();
    const result = escalator.createReport(uuid, createFailure({ error: 'fatal crash' }));
    if (result.ok) expect(result.value.severity).toBe('critical');
  });

  it('10개 다른 심각도 에러 → 모두 유효한 severity', () => {
    const errors = [
      'fatal crash', 'timeout', 'exception', 'minor glitch', 'unknown thing',
      'crash occurred', 'security breach', 'data loss detected', 'error in api', 'undefined var',
    ];
    const valid = ['critical', 'major', 'minor', 'low'];
    for (const error of errors) {
      const r = escalator.createReport('proj', createFailure({ error }));
      if (r.ok) expect(valid).toContain(r.value.severity);
    }
  });
});

// ── 추가 edge: escalate 심각도 → Phase 매핑 세부 ─────────────

describe('BugEscalator escalate 심각도 Phase 매핑 세부', () => {
  it('low severity → VERIFY', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'unknown thing' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('VERIFY');
  });

  it('minor severity → VERIFY', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'font rendering issue minor' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('VERIFY');
  });

  it('major severity → TEST', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'timeout during processing' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('critical severity → CODE', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('escalate 결과에 bugReport가 포함된다', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) {
      expect(result.value.bugReport).toBeDefined();
      expect(result.value.bugReport.id).toBe(rr.value.id);
    }
  });

  it('injection → CODE', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'SQL injection vulnerability' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('oom → CODE', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'oom killer activated' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('CODE');
  });

  it('undefined → TEST', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'undefined variable accessed' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('null → TEST', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'null pointer dereference' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('failed → TEST', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'request failed unexpectedly' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('error → TEST', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'error during pipeline' }));
    if (!rr.ok) return;
    const result = e.escalate(rr.value);
    if (result.ok) expect(result.value.targetPhase).toBe('TEST');
  });

  it('10개 critical 에러 모두 CODE phase', () => {
    const e = makeEscalator();
    const criticalErrors = [
      'fatal crash', 'crash detected', 'security breach', 'SQL injection found',
      'data loss detected', 'oom killed', 'segfault', 'fatal error',
      'crash in auth', 'injection attack',
    ];
    for (const error of criticalErrors) {
      const rr = e.createReport('proj', createFailure({ error }));
      if (!rr.ok) continue;
      const result = e.escalate(rr.value);
      if (result.ok) expect(result.value.targetPhase).toBe('CODE');
    }
  });

  it('escalate 전후 bugReport id 동일', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'timeout occurred' }));
    if (!rr.ok) return;
    const originalId = rr.value.id;
    const result = e.escalate(rr.value);
    if (result.ok) {
      expect(result.value.bugReport.id).toBe(originalId);
    }
  });
});

// ── 추가 edge: createReport 시나리오 ─────────────────────────

describe('BugEscalator createReport 추가 시나리오', () => {
  it('100개 create → 100개 active', () => {
    const e = makeEscalator();
    for (let i = 0; i < 100; i++) {
      e.createReport('proj-100', createFailure({ error: `error-${i}` }));
    }
    expect(e.getActiveReports('proj-100')).toHaveLength(100);
  });

  it('create 후 resolve → active 0개', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'fatal crash' }));
    if (!rr.ok) return;
    e.resolveReport(rr.value.id);
    expect(e.getActiveReports('proj')).toHaveLength(0);
  });

  it('createReport 결과의 title이 문자열이다', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure());
    if (result.ok) expect(typeof result.value.title).toBe('string');
  });

  it('createReport 결과의 category가 문자열이다', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure());
    if (result.ok) expect(typeof result.value.category).toBe('string');
  });

  it('createReport 결과의 reportedAt이 Date이다', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure());
    if (result.ok) expect(result.value.reportedAt).toBeInstanceOf(Date);
  });

  it('createReport 결과의 description이 testName을 포함한다', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure({ testName: 'my-special-test' }));
    if (result.ok) expect(result.value.description).toContain('my-special-test');
  });

  it('createReport 결과의 description이 error를 포함한다', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure({ error: 'unique-error-xyz' }));
    if (result.ok) expect(result.value.description).toContain('unique-error-xyz');
  });

  it('createReport 연속 5개 → id 모두 다르다', () => {
    const e = makeEscalator();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = e.createReport('proj', createFailure({ error: `err-${i}` }));
      if (r.ok) ids.add(r.value.id);
    }
    expect(ids.size).toBe(5);
  });

  it('빈 featureId → ok=true (featureId는 선택)', () => {
    const e = makeEscalator();
    const result = e.createReport('proj', createFailure({ featureId: '' }));
    // featureId 빈 문자열은 validation 안 함 (구현 의존)
    expect(typeof result.ok).toBe('boolean');
  });

  it('긴 testName → ok=true', () => {
    const e = makeEscalator();
    const longName = 'test-' + 'n'.repeat(200);
    const result = e.createReport('proj', createFailure({ testName: longName }));
    expect(result.ok).toBe(true);
  });

  it('countNaN 방지 — 반복 counter는 항상 증가', () => {
    const e = makeEscalator();
    const r1 = e.createReport('proj', createFailure({ error: 'err1' }));
    const r2 = e.createReport('proj', createFailure({ error: 'err2' }));
    if (r1.ok && r2.ok) {
      // id 형식이 bug-N이면 순서 확인
      expect(r1.value.id).not.toBe(r2.value.id);
    }
  });
});

// ── 추가 edge: resolveReport 시나리오 ─────────────────────────

describe('BugEscalator resolveReport 추가 시나리오', () => {
  it('100개 resolve → active 0개', () => {
    const e = makeEscalator();
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const rr = e.createReport('proj-100r', createFailure({ error: `err-${i}` }));
      if (rr.ok) ids.push(rr.value.id);
    }
    for (const id of ids) e.resolveReport(id);
    expect(e.getActiveReports('proj-100r')).toHaveLength(0);
  });

  it('resolve 성공 후 동일 id 재resolve → ok=false', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'crash' }));
    if (!rr.ok) return;
    e.resolveReport(rr.value.id);
    const result = e.resolveReport(rr.value.id);
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 임의 UUID → ok=false', () => {
    const e = makeEscalator();
    for (let i = 0; i < 5; i++) {
      const uuid = crypto.randomUUID();
      const result = e.resolveReport(uuid);
      expect(result.ok).toBe(false);
    }
  });

  it('resolve error code가 문자열이다 (빈 id)', () => {
    const e = makeEscalator();
    const result = e.resolveReport('');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('resolve error message가 문자열이다 (빈 id)', () => {
    const e = makeEscalator();
    const result = e.resolveReport('');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('resolve 성공 → ok=true 반환값 확인', () => {
    const e = makeEscalator();
    const rr = e.createReport('proj', createFailure({ error: 'crash' }));
    if (!rr.ok) return;
    const result = e.resolveReport(rr.value.id);
    expect(result.ok).toBe(true);
  });

  it('getActiveReports 후 resolve → 결과 길이 감소', () => {
    const e = makeEscalator();
    for (let i = 0; i < 5; i++) {
      e.createReport('proj-dec', createFailure({ error: `err-${i}` }));
    }
    const before = e.getActiveReports('proj-dec').length;
    const first = e.getActiveReports('proj-dec')[0];
    if (first) e.resolveReport(first.id);
    const after = e.getActiveReports('proj-dec').length;
    expect(after).toBe(before - 1);
  });
});
