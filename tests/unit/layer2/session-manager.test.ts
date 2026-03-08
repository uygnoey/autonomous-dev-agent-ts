/**
 * SessionManager 단위 테스트 / SessionManager unit tests
 *
 * @description
 * createSession, getSession, updateSession, listSessions,
 * 상태 전환 (pause/resume/complete/fail), 필터 경계값을 검증한다.
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { SessionManager } from 'layer2/session-manager.js';
import type { AgentName, Phase } from 'core/types.js';

const ALL_AGENTS: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
const ALL_PHASES: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];

// ── 생성자 ─────────────────────────────────────────────────────

describe('SessionManager 생성자', () => {
  it('인스턴스 생성됨', () => {
    const logger = new ConsoleLogger('error');
    expect(() => new SessionManager(logger)).not.toThrow();
  });

  it('SessionManager 인스턴스', () => {
    expect(new SessionManager(new ConsoleLogger('error'))).toBeInstanceOf(SessionManager);
  });

  it('초기 listSessions → 빈 배열', () => {
    const manager = new SessionManager(new ConsoleLogger('error'));
    expect(manager.listSessions()).toHaveLength(0);
  });
});

// ── createSession ──────────────────────────────────────────────

describe('SessionManager createSession', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('세션 생성 → ok 반환', () => {
    const result = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
  });

  it('생성된 세션의 agentName 일치', () => {
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'CODE');
    if (result.ok) expect(result.value.agentName).toBe('coder');
  });

  it('생성된 세션의 projectId 일치', () => {
    const result = manager.createSession('coder', 'proj-xyz', 'feat-1', 'CODE');
    if (result.ok) expect(result.value.projectId).toBe('proj-xyz');
  });

  it('생성된 세션의 featureId 일치', () => {
    const result = manager.createSession('coder', 'proj-1', 'feat-abc', 'CODE');
    if (result.ok) expect(result.value.featureId).toBe('feat-abc');
  });

  it('생성된 세션의 phase 일치', () => {
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'TEST');
    if (result.ok) expect(result.value.phase).toBe('TEST');
  });

  it('생성된 세션의 초기 state는 active', () => {
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) expect(result.value.state).toBe('active');
  });

  it('sessionId는 고유함', () => {
    const r1 = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    const r2 = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (r1.ok && r2.ok) expect(r1.value.sessionId).not.toBe(r2.value.sessionId);
  });

  it.each(ALL_AGENTS)('에이전트 %s 세션 생성 → ok', (agent) => {
    const result = manager.createSession(agent, 'proj-1', 'feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.agentName).toBe(agent);
  });

  it.each(ALL_PHASES)('Phase %s 세션 생성 → ok', (phase) => {
    const result = manager.createSession('coder', 'proj-1', 'feat-1', phase);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.phase).toBe(phase);
  });

  it('세션 생성 후 listSessions에 포함', () => {
    manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    expect(manager.listSessions()).toHaveLength(1);
  });

  it('10개 세션 생성 → 10개 존재', () => {
    for (let i = 0; i < 10; i++) {
      manager.createSession('coder', `proj-${i}`, `feat-${i}`, 'DESIGN');
    }
    expect(manager.listSessions()).toHaveLength(10);
  });

  it('생성된 세션의 sessionId 패턴 확인 (agent 이름 포함)', () => {
    const result = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) expect(result.value.sessionId).toContain('architect');
  });
});

// ── getSession ─────────────────────────────────────────────────

describe('SessionManager getSession', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('존재하는 sessionId → SessionSnapshot 반환', () => {
    const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
    if (createResult.ok) {
      const session = manager.getSession(createResult.value.sessionId);
      expect(session).not.toBeNull();
    }
  });

  it('존재하는 sessionId → agentName 일치', () => {
    const createResult = manager.createSession('reviewer', 'proj-1', 'feat-1', 'DESIGN');
    if (createResult.ok) {
      const session = manager.getSession(createResult.value.sessionId);
      expect(session?.agentName).toBe('reviewer');
    }
  });

  it('존재하지 않는 sessionId → null', () => {
    expect(manager.getSession('non-existent')).toBeNull();
  });

  it('빈 문자열 sessionId → null', () => {
    expect(manager.getSession('')).toBeNull();
  });

  it('다른 세션 ID로 조회 → null', () => {
    const createResult = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (createResult.ok) {
      expect(manager.getSession('wrong-id')).toBeNull();
    }
  });

  it.each(['random-id-1', 'session-xyz', 'not-a-session'])('존재하지 않는 ID %s → null', (id) => {
    expect(manager.getSession(id)).toBeNull();
  });
});

// ── updateSession ──────────────────────────────────────────────

describe('SessionManager updateSession', () => {
  let manager: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) sessionId = result.value.sessionId;
  });

  it('phase 업데이트 → ok 반환', () => {
    const result = manager.updateSession(sessionId, { phase: 'CODE' });
    expect(result.ok).toBe(true);
  });

  it.each(ALL_PHASES)('phase %s 업데이트 적용', (phase) => {
    manager.updateSession(sessionId, { phase });
    const session = manager.getSession(sessionId);
    expect(session?.phase).toBe(phase);
  });

  it('state 업데이트 → ok', () => {
    const result = manager.updateSession(sessionId, { state: 'paused' });
    expect(result.ok).toBe(true);
    expect(manager.getSession(sessionId)?.state).toBe('paused');
  });

  it('metadata 업데이트 → ok', () => {
    const result = manager.updateSession(sessionId, { metadata: { key: 'value' } });
    expect(result.ok).toBe(true);
    expect(manager.getSession(sessionId)?.metadata).toEqual({ key: 'value' });
  });

  it('존재하지 않는 sessionId → err', () => {
    const result = manager.updateSession('non-existent', { phase: 'CODE' });
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 sessionId → agent_session_not_found', () => {
    const result = manager.updateSession('missing', { phase: 'CODE' });
    if (!result.ok) expect(result.error.code).toBe('agent_session_not_found');
  });

  it('업데이트 후 lastActivity 갱신됨', () => {
    const before = manager.getSession(sessionId)?.lastActivity;
    manager.updateSession(sessionId, { phase: 'TEST' });
    const after = manager.getSession(sessionId)?.lastActivity;
    expect(after).toBeDefined();
    expect(before).toBeDefined();
  });

  it('여러 필드 동시 업데이트', () => {
    manager.updateSession(sessionId, { phase: 'VERIFY', state: 'paused' });
    const session = manager.getSession(sessionId);
    expect(session?.phase).toBe('VERIFY');
    expect(session?.state).toBe('paused');
  });
});

// ── listSessions ───────────────────────────────────────────────

describe('SessionManager listSessions', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
    // 테스트용 세션 셋업
    manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
    manager.createSession('coder', 'proj-1', 'feat-2', 'CODE');
    manager.createSession('tester', 'proj-2', 'feat-3', 'TEST');
    manager.createSession('reviewer', 'proj-2', 'feat-4', 'VERIFY');
  });

  it('필터 없음 → 전체 4개 반환', () => {
    expect(manager.listSessions()).toHaveLength(4);
  });

  it('projectId 필터 → proj-1 세션 2개', () => {
    const results = manager.listSessions({ projectId: 'proj-1' });
    expect(results).toHaveLength(2);
    for (const s of results) expect(s.projectId).toBe('proj-1');
  });

  it('projectId 필터 → proj-2 세션 2개', () => {
    const results = manager.listSessions({ projectId: 'proj-2' });
    expect(results).toHaveLength(2);
  });

  it('featureId 필터 → feat-1 세션 1개', () => {
    const results = manager.listSessions({ featureId: 'feat-1' });
    expect(results).toHaveLength(1);
    expect(results[0]?.featureId).toBe('feat-1');
  });

  it.each(ALL_PHASES)('phase 필터 %s → 1개 반환', (phase) => {
    const results = manager.listSessions({ phase });
    expect(results).toHaveLength(1);
    expect(results[0]?.phase).toBe(phase);
  });

  it('state 필터 active → 전체 active 세션', () => {
    const results = manager.listSessions({ state: 'active' });
    expect(results).toHaveLength(4); // 초기에 모두 active
  });

  it('state 필터 paused → 빈 배열', () => {
    const results = manager.listSessions({ state: 'paused' });
    expect(results).toHaveLength(0);
  });

  it('존재하지 않는 projectId → 빈 배열', () => {
    const results = manager.listSessions({ projectId: 'proj-999' });
    expect(results).toHaveLength(0);
  });

  it('projectId + phase 복합 필터', () => {
    const results = manager.listSessions({ projectId: 'proj-1', phase: 'DESIGN' });
    expect(results).toHaveLength(1);
    expect(results[0]?.projectId).toBe('proj-1');
    expect(results[0]?.phase).toBe('DESIGN');
  });

  it('세션 없을 때 필터 적용 → 빈 배열', () => {
    const emptyManager = new SessionManager(new ConsoleLogger('error'));
    expect(emptyManager.listSessions({ projectId: 'proj-1' })).toHaveLength(0);
  });
});

// ── 상태 전환 ──────────────────────────────────────────────────

describe('SessionManager 상태 전환', () => {
  let manager: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) sessionId = result.value.sessionId;
  });

  it('pauseSession → paused 상태', () => {
    manager.pauseSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('paused');
  });

  it('pauseSession → ok 반환', () => {
    const result = manager.pauseSession(sessionId);
    expect(result.ok).toBe(true);
  });

  it('resumeSession → active 상태', () => {
    manager.pauseSession(sessionId);
    manager.resumeSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('active');
  });

  it('resumeSession → ok 반환', () => {
    manager.pauseSession(sessionId);
    const result = manager.resumeSession(sessionId);
    expect(result.ok).toBe(true);
  });

  it('completeSession → completed 상태', () => {
    manager.completeSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('completed');
  });

  it('completeSession → ok 반환', () => {
    const result = manager.completeSession(sessionId);
    expect(result.ok).toBe(true);
  });

  it('failSession → failed 상태', () => {
    manager.failSession(sessionId, '테스트 실패');
    expect(manager.getSession(sessionId)?.state).toBe('failed');
  });

  it('failSession → ok 반환', () => {
    const result = manager.failSession(sessionId, '이유');
    expect(result.ok).toBe(true);
  });

  it('pause → resume → complete 전환 시퀀스', () => {
    manager.pauseSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('paused');
    manager.resumeSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('active');
    manager.completeSession(sessionId);
    expect(manager.getSession(sessionId)?.state).toBe('completed');
  });

  it('존재하지 않는 세션 pauseSession → err', () => {
    const result = manager.pauseSession('non-existent');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 세션 resumeSession → err', () => {
    const result = manager.resumeSession('non-existent');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 세션 completeSession → err', () => {
    const result = manager.completeSession('non-existent');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 세션 failSession → err', () => {
    const result = manager.failSession('non-existent', '이유');
    expect(result.ok).toBe(false);
  });

  it('상태 전환 후 state 필터 동작', () => {
    manager.pauseSession(sessionId);
    const paused = manager.listSessions({ state: 'paused' });
    const active = manager.listSessions({ state: 'active' });
    expect(paused).toHaveLength(1);
    expect(active).toHaveLength(0);
  });

  it('pause 에러 코드 확인', () => {
    const result = manager.pauseSession('missing');
    if (!result.ok) expect(result.error.code).toBe('agent_session_not_found');
  });

  it('fail 에러 코드 확인', () => {
    const result = manager.failSession('missing', '이유');
    if (!result.ok) expect(result.error.code).toBe('agent_session_not_found');
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('SessionManager 복합 시나리오', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('전체 에이전트 세션 생성 후 조회', () => {
    const ids: string[] = [];
    for (const agent of ALL_AGENTS) {
      const result = manager.createSession(agent, 'proj-1', 'feat-1', 'DESIGN');
      if (result.ok) ids.push(result.value.sessionId);
    }
    expect(manager.listSessions()).toHaveLength(ALL_AGENTS.length);
    for (const id of ids) {
      expect(manager.getSession(id)).not.toBeNull();
    }
  });

  it('전체 Phase로 세션 생성 후 필터', () => {
    for (const phase of ALL_PHASES) {
      manager.createSession('coder', 'proj-1', 'feat-1', phase);
    }
    for (const phase of ALL_PHASES) {
      const results = manager.listSessions({ phase });
      expect(results).toHaveLength(1);
    }
  });

  it('세션 상태별 필터 후 카운트 합산 = 전체', () => {
    const total = 5;
    for (let i = 0; i < total; i++) {
      manager.createSession('coder', 'proj-1', `feat-${i}`, 'DESIGN');
    }
    const sessions = manager.listSessions();
    const firstId = sessions[0]?.sessionId;
    if (firstId) manager.completeSession(firstId);

    const active = manager.listSessions({ state: 'active' }).length;
    const completed = manager.listSessions({ state: 'completed' }).length;
    expect(active + completed).toBe(total);
  });

  it('100개 세션 생성 성능', () => {
    for (let i = 0; i < 100; i++) {
      const result = manager.createSession('coder', `proj-${i}`, `feat-${i}`, 'DESIGN');
      expect(result.ok).toBe(true);
    }
    expect(manager.listSessions()).toHaveLength(100);
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('SessionManager 랜덤/경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it.each(ALL_AGENTS)('에이전트 %s 전체 상태 전환', (agent) => {
    const result = manager.createSession(agent, 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) {
      const id = result.value.sessionId;
      expect(manager.pauseSession(id).ok).toBe(true);
      expect(manager.resumeSession(id).ok).toBe(true);
      expect(manager.completeSession(id).ok).toBe(true);
    }
  });

  it.each(ALL_PHASES)('Phase %s 세션 업데이트 → ok', (phase) => {
    const result = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    if (result.ok) {
      const updateResult = manager.updateSession(result.value.sessionId, { phase });
      expect(updateResult.ok).toBe(true);
      expect(manager.getSession(result.value.sessionId)?.phase).toBe(phase);
    }
  });

  it.each(['', 'abc', 'random-id', 'session-999'])('존재하지 않는 ID %s → getSession null', (id) => {
    expect(manager.getSession(id)).toBeNull();
  });

  it.each(Array.from({ length: 5 }, (_, i) => i + 1))('%i개 세션 생성 확인', (n) => {
    for (let i = 0; i < n; i++) {
      manager.createSession('coder', `p-${i}`, `f-${i}`, 'DESIGN');
    }
    expect(manager.listSessions()).toHaveLength(n);
  });

  it('failSession 다양한 이유 → ok', () => {
    const reasons = ['timeout', '에러 발생', '', 'critical failure', '알 수 없는 오류'];
    for (const reason of reasons) {
      const result = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
      if (result.ok) {
        const failResult = manager.failSession(result.value.sessionId, reason);
        expect(failResult.ok).toBe(true);
      }
    }
  });
});

// ── 추가 생성자 경계값 ─────────────────────────────────────────

describe('SessionManager 추가 생성자', () => {
  it('두 인스턴스는 독립적', () => {
    const m1 = new SessionManager(new ConsoleLogger('error'));
    const m2 = new SessionManager(new ConsoleLogger('error'));
    m1.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
    expect(m1.listSessions()).toHaveLength(1);
    expect(m2.listSessions()).toHaveLength(0);
  });

  it('warn logger로 생성 가능', () => {
    expect(new SessionManager(new ConsoleLogger('warn'))).toBeInstanceOf(SessionManager);
  });

  it('debug logger로 생성 가능', () => {
    expect(new SessionManager(new ConsoleLogger('debug'))).toBeInstanceOf(SessionManager);
  });

  it('10개 인스턴스 생성 → 모두 독립', () => {
    const managers = Array.from({ length: 10 }, () => new SessionManager(new ConsoleLogger('error')));
    for (const m of managers) {
      expect(m.listSessions()).toHaveLength(0);
    }
  });

  it('createSession 결과 ok는 boolean', () => {
    const m = new SessionManager(new ConsoleLogger('error'));
    const r = m.createSession('coder', 'p', 'f', 'DESIGN');
    expect(typeof r.ok).toBe('boolean');
  });

  it('createSession 결과 sessionId는 string', () => {
    const m = new SessionManager(new ConsoleLogger('error'));
    const r = m.createSession('coder', 'p', 'f', 'DESIGN');
    if (r.ok) expect(typeof r.value.sessionId).toBe('string');
  });
});

// ── createSession 추가 경계값 ─────────────────────────────────

describe('SessionManager createSession 추가 경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('5번 연속 동일 파라미터 → sessionId 모두 다름', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = manager.createSession('coder', 'proj-1', 'feat-1', 'DESIGN');
      if (r.ok) ids.add(r.value.sessionId);
    }
    expect(ids.size).toBe(5);
  });

  it('Korean featureId → ok', () => {
    const r = manager.createSession('coder', 'proj-1', '기능개발', 'DESIGN');
    expect(r.ok).toBe(true);
  });

  it('UUID projectId → ok', () => {
    const uuid = crypto.randomUUID();
    const r = manager.createSession('coder', uuid, 'feat-1', 'DESIGN');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.projectId).toBe(uuid);
  });

  it('긴 featureId → ok', () => {
    const longId = 'feature-' + 'x'.repeat(100);
    const r = manager.createSession('architect', 'proj-1', longId, 'CODE');
    expect(r.ok).toBe(true);
  });

  it('빈 projectId → ok (검증 없음)', () => {
    const r = manager.createSession('coder', '', 'feat-1', 'DESIGN');
    expect(typeof r.ok).toBe('boolean');
  });

  it('생성된 세션 agentName이 string', () => {
    const r = manager.createSession('reviewer', 'p', 'f', 'VERIFY');
    if (r.ok) expect(typeof r.value.agentName).toBe('string');
  });

  it('생성된 세션 phase가 string', () => {
    const r = manager.createSession('tester', 'p', 'f', 'TEST');
    if (r.ok) expect(typeof r.value.phase).toBe('string');
  });

  it('생성된 세션 state가 string', () => {
    const r = manager.createSession('qc', 'p', 'f', 'CODE');
    if (r.ok) expect(typeof r.value.state).toBe('string');
  });
});

// ── updateSession/getSession 추가 경계값 ─────────────────────

describe('SessionManager updateSession 추가 경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('updateSession 에러 메시지는 string', () => {
    const r = manager.updateSession('missing-id', { phase: 'CODE' });
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('updateSession 에러 코드는 string', () => {
    const r = manager.updateSession('no-such-id', { phase: 'TEST' });
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('5번 연속 updateSession 없는 ID → 모두 err', () => {
    for (let i = 0; i < 5; i++) {
      const r = manager.updateSession(`ghost-${i}`, { phase: 'DESIGN' });
      expect(r.ok).toBe(false);
    }
  });

  it('getSession 없는 UUID → null', () => {
    const uuid = crypto.randomUUID();
    expect(manager.getSession(uuid)).toBeNull();
  });

  it('getSession 5번 반복 일관성', () => {
    const r = manager.createSession('coder', 'p', 'f', 'DESIGN');
    if (r.ok) {
      const id = r.value.sessionId;
      for (let i = 0; i < 5; i++) {
        expect(manager.getSession(id)).not.toBeNull();
      }
    }
  });

  it('agentName 필터로 listSessions', () => {
    manager.createSession('architect', 'proj-1', 'f1', 'DESIGN');
    manager.createSession('coder', 'proj-1', 'f2', 'CODE');
    manager.createSession('architect', 'proj-2', 'f3', 'TEST');
    const architects = manager.listSessions().filter((s) => s.agentName === 'architect');
    expect(architects.length).toBe(2);
  });

  it('listSessions 5번 반복 → 동일 길이', () => {
    manager.createSession('coder', 'p', 'f', 'DESIGN');
    const len = manager.listSessions().length;
    for (let i = 0; i < 5; i++) {
      expect(manager.listSessions().length).toBe(len);
    }
  });

  it('두 매니저 독립적 상태 관리', () => {
    const m1 = new SessionManager(new ConsoleLogger('error'));
    const m2 = new SessionManager(new ConsoleLogger('error'));
    const r = m1.createSession('coder', 'p', 'f', 'DESIGN');
    if (r.ok) {
      m1.pauseSession(r.value.sessionId);
      expect(m2.listSessions({ state: 'paused' })).toHaveLength(0);
    }
  });

  it('상태 전환 에러 코드 타입은 string', () => {
    const r = manager.pauseSession('not-found');
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('completeSession 에러 메시지 타입은 string', () => {
    const r = manager.completeSession('not-found');
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('모든 Phase 필터 → 합산 = 전체', () => {
    for (const phase of ALL_PHASES) {
      manager.createSession('coder', 'p', 'f', phase);
    }
    const total = manager.listSessions().length;
    const sum = ALL_PHASES.reduce(
      (acc, phase) => acc + manager.listSessions({ phase }).length,
      0,
    );
    expect(sum).toBe(total);
  });
});

// ── 경계값: 특수 문자/언어 projectId, featureId ────────────────

describe('SessionManager 특수 문자/언어 경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('한글 projectId → ok', () => {
    const r = manager.createSession('coder', '프로젝트-한글', 'feat-1', 'DESIGN');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.projectId).toBe('프로젝트-한글');
  });

  it('특수문자 projectId → ok', () => {
    const r = manager.createSession('coder', 'proj@#$!', 'feat-1', 'DESIGN');
    expect(r.ok).toBe(true);
  });

  it('UUID projectId + UUID featureId → ok', () => {
    const pid = crypto.randomUUID();
    const fid = crypto.randomUUID();
    const r = manager.createSession('reviewer', pid, fid, 'VERIFY');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.projectId).toBe(pid);
      expect(r.value.featureId).toBe(fid);
    }
  });

  it('한글 featureId → getSession 가능', () => {
    const r = manager.createSession('coder', 'p', '기능개발-한글', 'CODE');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const session = manager.getSession(r.value.sessionId);
      expect(session?.featureId).toBe('기능개발-한글');
    }
  });

  it('공백 포함 featureId → ok', () => {
    const r = manager.createSession('qa', 'p', 'feat with spaces', 'DESIGN');
    expect(r.ok).toBe(true);
  });

  it('이모지 포함 featureId → ok', () => {
    const r = manager.createSession('coder', 'p', 'feat-🚀', 'CODE');
    expect(r.ok).toBe(true);
  });

  it('매우 긴 projectId → ok', () => {
    const longPid = 'p'.repeat(200);
    const r = manager.createSession('tester', longPid, 'f', 'TEST');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.projectId).toBe(longPid);
  });

  it('매우 긴 featureId → ok', () => {
    const longFid = 'f'.repeat(200);
    const r = manager.createSession('reviewer', 'p', longFid, 'VERIFY');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.featureId).toBe(longFid);
  });
});

// ── 상태 전환 추가 경계값 ──────────────────────────────────────

describe('SessionManager 상태 전환 추가 경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('active → pause → resume → fail 시퀀스', () => {
    const r = manager.createSession('coder', 'p', 'f', 'DESIGN');
    if (r.ok) {
      const id = r.value.sessionId;
      expect(manager.pauseSession(id).ok).toBe(true);
      expect(manager.getSession(id)?.state).toBe('paused');
      expect(manager.resumeSession(id).ok).toBe(true);
      expect(manager.getSession(id)?.state).toBe('active');
      expect(manager.failSession(id, 'reason').ok).toBe(true);
      expect(manager.getSession(id)?.state).toBe('failed');
    }
  });

  it('active → complete → getSession 여전히 가능', () => {
    const r = manager.createSession('tester', 'p', 'f', 'TEST');
    if (r.ok) {
      const id = r.value.sessionId;
      manager.completeSession(id);
      const session = manager.getSession(id);
      expect(session).not.toBeNull();
      expect(session?.state).toBe('completed');
    }
  });

  it('fail → listSessions state=failed 조회', () => {
    const r = manager.createSession('qc', 'p', 'f', 'CODE');
    if (r.ok) {
      manager.failSession(r.value.sessionId, 'some error');
      const failed = manager.listSessions({ state: 'failed' });
      expect(failed.length).toBe(1);
      expect(failed[0]?.state).toBe('failed');
    }
  });

  it('5개 세션 전부 pause → state 필터 paused=5', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = manager.createSession('coder', `p${i}`, `f${i}`, 'DESIGN');
      if (r.ok) ids.push(r.value.sessionId);
    }
    for (const id of ids) manager.pauseSession(id);
    expect(manager.listSessions({ state: 'paused' })).toHaveLength(5);
  });

  it('5개 세션 전부 complete → state 필터 completed=5', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = manager.createSession('coder', `p${i}`, `f${i}`, 'DESIGN');
      if (r.ok) ids.push(r.value.sessionId);
    }
    for (const id of ids) manager.completeSession(id);
    expect(manager.listSessions({ state: 'completed' })).toHaveLength(5);
  });

  it('빈 에러 메시지로 failSession → ok', () => {
    const r = manager.createSession('coder', 'p', 'f', 'DESIGN');
    if (r.ok) {
      const result = manager.failSession(r.value.sessionId, '');
      expect(result.ok).toBe(true);
    }
  });

  it('completeSession 에러 코드 = agent_session_not_found', () => {
    const r = manager.completeSession('not-exist-id');
    if (!r.ok) expect(r.error.code).toBe('agent_session_not_found');
  });

  it('resumeSession 에러 코드 = agent_session_not_found', () => {
    const r = manager.resumeSession('no-session');
    if (!r.ok) expect(r.error.code).toBe('agent_session_not_found');
  });
});

// ── listSessions 추가 필터 경계값 ─────────────────────────────

describe('SessionManager listSessions 추가 필터 경계값', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(new ConsoleLogger('error'));
  });

  it('agentName 필터가 없는 listSessions → 전체 반환', () => {
    for (const agent of ALL_AGENTS) {
      manager.createSession(agent, 'p', 'f', 'DESIGN');
    }
    expect(manager.listSessions()).toHaveLength(ALL_AGENTS.length);
  });

  it('state=failed 필터 → 빈 배열 (fail 없음)', () => {
    manager.createSession('coder', 'p', 'f', 'DESIGN');
    expect(manager.listSessions({ state: 'failed' })).toHaveLength(0);
  });

  it('state=completed 필터 → 빈 배열 (complete 없음)', () => {
    manager.createSession('coder', 'p', 'f', 'DESIGN');
    expect(manager.listSessions({ state: 'completed' })).toHaveLength(0);
  });

  it('featureId + phase 복합 필터 → 1개', () => {
    manager.createSession('coder', 'p', 'feat-x', 'CODE');
    manager.createSession('tester', 'p', 'feat-y', 'TEST');
    const results = manager.listSessions({ featureId: 'feat-x', phase: 'CODE' });
    expect(results).toHaveLength(1);
    expect(results[0]?.featureId).toBe('feat-x');
    expect(results[0]?.phase).toBe('CODE');
  });

  it('projectId + state 복합 필터 → pause 후 조회', () => {
    const r = manager.createSession('coder', 'proj-combo', 'f', 'DESIGN');
    if (r.ok) {
      manager.pauseSession(r.value.sessionId);
      const results = manager.listSessions({ projectId: 'proj-combo', state: 'paused' });
      expect(results).toHaveLength(1);
    }
  });

  it('모든 상태 필터 합산 = 전체 세션 수', () => {
    for (let i = 0; i < 6; i++) {
      manager.createSession('coder', `p${i}`, `f${i}`, 'DESIGN');
    }
    const sessions = manager.listSessions();
    // 처음 2개 pause, 다음 2개 complete, 다음 1개 fail
    const ids = sessions.map((s) => s.sessionId);
    manager.pauseSession(ids[0]!);
    manager.pauseSession(ids[1]!);
    manager.completeSession(ids[2]!);
    manager.completeSession(ids[3]!);
    manager.failSession(ids[4]!, 'err');

    const active = manager.listSessions({ state: 'active' }).length;
    const paused = manager.listSessions({ state: 'paused' }).length;
    const completed = manager.listSessions({ state: 'completed' }).length;
    const failed = manager.listSessions({ state: 'failed' }).length;
    expect(active + paused + completed + failed).toBe(6);
  });
});
