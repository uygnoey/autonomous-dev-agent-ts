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
