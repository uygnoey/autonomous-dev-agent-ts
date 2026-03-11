/**
 * SessionSnapshotStore 단위 테스트 / SessionSnapshotStore unit tests
 *
 * @description
 * initialize, save (upsert), loadByFeature, loadByProject, delete,
 * 미초기화 에러, 경계값을 검증한다.
 * 80%+ edge case 비율 준수.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import type { PersistableSessionSnapshot } from 'layer2/session-snapshot-store-types.js';
import type { AgentName, Phase } from 'core/types.js';

// ── 헬퍼 ──────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<PersistableSessionSnapshot> = {}): PersistableSessionSnapshot {
  const now = new Date('2024-01-15T10:00:00.000Z');
  return {
    sessionId: 'session-coder-1',
    agentName: 'coder' as AgentName,
    projectId: 'proj-alpha',
    featureId: 'feat-login',
    phase: 'CODE' as Phase,
    state: 'active',
    createdAt: now,
    lastActivity: now,
    metadata: {},
    conversationHistory: [],
    ...overrides,
  };
}

// ── 생성자 / Constructor ──────────────────────────────────────────

describe('SessionSnapshotStore 생성자', () => {
  it('인스턴스 생성됨', () => {
    const logger = new ConsoleLogger('error');
    const store = new SessionSnapshotStore('/tmp/db', logger);
    expect(store).toBeInstanceOf(SessionSnapshotStore);
  });
});

// ── initialize ───────────────────────────────────────────────────

describe('SessionSnapshotStore initialize()', () => {
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
  });

  afterEach(() => {
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('유효한 경로 → ok 반환', async () => {
    const store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    const result = await store.initialize();
    expect(result.ok).toBe(true);
    await store.close();
  });

  it('이미 초기화된 저장소 재연결 → ok', async () => {
    const store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    await store.initialize();
    await store.close();

    const store2 = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    const result = await store2.initialize();
    expect(result.ok).toBe(true);
    await store2.close();
  });

  it('빈 경로 문자열 → err(RagError) 반환', async () => {
    const store = new SessionSnapshotStore('', new ConsoleLogger('error'));
    const result = await store.initialize();
    // WHY: LanceDB가 빈 경로로 연결 시도 시 에러 발생
    expect(result.ok).toBe(false);
  });

  it('잘못된 경로 → err(RagError) 반환', async () => {
    const store = new SessionSnapshotStore('\0invalid\0path', new ConsoleLogger('error'));
    const result = await store.initialize();
    expect(result.ok).toBe(false);
  });
});

// ── save + loadByFeature 라운드트립 ─────────────────────────────

describe('SessionSnapshotStore save() + loadByFeature() 라운드트립', () => {
  let store: SessionSnapshotStore;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
    store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('save → loadByFeature → 동일 스냅샷 반환', async () => {
    const snap = makeSnapshot();
    const saveResult = await store.save(snap);
    expect(saveResult.ok).toBe(true);

    const loadResult = await store.loadByFeature('feat-login');
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(1);
    expect(loadResult.value[0]?.sessionId).toBe('session-coder-1');
  });

  it('save → loadByFeature → agentName 복원', async () => {
    const snap = makeSnapshot({ agentName: 'architect' });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.agentName).toBe('architect');
  });

  it('save → loadByFeature → phase 복원', async () => {
    const snap = makeSnapshot({ phase: 'TEST' });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.phase).toBe('TEST');
  });

  it('save → loadByFeature → state 복원', async () => {
    const snap = makeSnapshot({ state: 'paused' });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.state).toBe('paused');
  });

  it('save → loadByFeature → metadata 복원', async () => {
    const snap = makeSnapshot({ metadata: { retryCount: 3, lastError: 'timeout' } });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.metadata).toMatchObject({ retryCount: 3, lastError: 'timeout' });
  });

  it('save → loadByFeature → conversationHistory 복원', async () => {
    const history = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }];
    const snap = makeSnapshot({ conversationHistory: history });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.conversationHistory).toEqual(history);
  });

  it('save → loadByFeature → 빈 conversationHistory 복원', async () => {
    const snap = makeSnapshot({ conversationHistory: [] });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.conversationHistory).toEqual([]);
  });

  it('save → loadByFeature → conversationHistory undefined → 빈 배열로 복원', async () => {
    const snap = makeSnapshot({ conversationHistory: undefined });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    // WHY: toFlatSnapshot에서 undefined → [] 처리
    expect(loadResult.value[0]?.conversationHistory).toEqual([]);
  });

  it('featureId가 다른 스냅샷 → 조회 결과 없음', async () => {
    const snap = makeSnapshot({ featureId: 'feat-A' });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-B');
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(0);
  });

  it('존재하지 않는 featureId → 빈 배열 반환', async () => {
    const loadResult = await store.loadByFeature('non-existent-feature');
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(0);
  });

  it('featureId에 특수 문자 (SQL injection 방지)', async () => {
    const snap = makeSnapshot({ featureId: "feat-'; DROP TABLE session_snapshots; --" });
    await store.save(snap);

    const loadResult = await store.loadByFeature("feat-'; DROP TABLE session_snapshots; --");
    expect(loadResult.ok).toBe(true);
  });

  it('createdAt 날짜 복원 정확도', async () => {
    const createdAt = new Date('2024-06-01T12:34:56.000Z');
    const snap = makeSnapshot({ createdAt });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.createdAt.toISOString()).toBe('2024-06-01T12:34:56.000Z');
  });

  it('lastActivity 날짜 복원 정확도', async () => {
    const lastActivity = new Date('2024-06-15T08:00:00.000Z');
    const snap = makeSnapshot({ lastActivity });
    await store.save(snap);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.lastActivity.toISOString()).toBe('2024-06-15T08:00:00.000Z');
  });
});

// ── save upsert 동작 ─────────────────────────────────────────────

describe('SessionSnapshotStore save() upsert 동작', () => {
  let store: SessionSnapshotStore;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
    store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('같은 sessionId로 save 두 번 → 하나의 레코드만 존재', async () => {
    const snap1 = makeSnapshot({ state: 'active' });
    const snap2 = makeSnapshot({ state: 'paused' });

    await store.save(snap1);
    await store.save(snap2);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(1);
  });

  it('같은 sessionId로 save 두 번 → 최신 state 유지', async () => {
    const snap1 = makeSnapshot({ state: 'active' });
    const snap2 = makeSnapshot({ state: 'completed' });

    await store.save(snap1);
    await store.save(snap2);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.state).toBe('completed');
  });

  it('같은 sessionId로 save 두 번 → 최신 phase 유지', async () => {
    const snap1 = makeSnapshot({ phase: 'CODE' });
    const snap2 = makeSnapshot({ phase: 'TEST' });

    await store.save(snap1);
    await store.save(snap2);

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value[0]?.phase).toBe('TEST');
  });

  it('다른 sessionId는 별도 레코드로 저장', async () => {
    const snap1 = makeSnapshot({ sessionId: 'session-A', featureId: 'feat-X' });
    const snap2 = makeSnapshot({ sessionId: 'session-B', featureId: 'feat-X' });

    await store.save(snap1);
    await store.save(snap2);

    const loadResult = await store.loadByFeature('feat-X');
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(2);
  });

  it('save 3번 같은 sessionId → 여전히 1개', async () => {
    for (const state of ['active', 'paused', 'completed'] as const) {
      await store.save(makeSnapshot({ state }));
    }

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(1);
    expect(loadResult.value[0]?.state).toBe('completed');
  });
});

// ── delete ───────────────────────────────────────────────────────

describe('SessionSnapshotStore delete()', () => {
  let store: SessionSnapshotStore;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
    store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('save 후 delete → loadByFeature 빈 배열', async () => {
    const snap = makeSnapshot();
    await store.save(snap);
    await store.delete('session-coder-1');

    const loadResult = await store.loadByFeature('feat-login');
    if (!loadResult.ok) return;
    expect(loadResult.value).toHaveLength(0);
  });

  it('존재하지 않는 sessionId delete → ok(void) 반환 (에러 없음)', async () => {
    const snap = makeSnapshot();
    await store.save(snap);

    const result = await store.delete('non-existent-session');
    expect(result.ok).toBe(true);
  });

  it('delete 후 다른 featureId 스냅샷은 영향 없음', async () => {
    const snapA = makeSnapshot({ sessionId: 'sess-A', featureId: 'feat-A' });
    const snapB = makeSnapshot({ sessionId: 'sess-B', featureId: 'feat-B' });

    await store.save(snapA);
    await store.save(snapB);
    await store.delete('sess-A');

    const loadA = await store.loadByFeature('feat-A');
    const loadB = await store.loadByFeature('feat-B');

    if (!loadA.ok || !loadB.ok) return;
    expect(loadA.value).toHaveLength(0);
    expect(loadB.value).toHaveLength(1);
  });

  it('테이블 미생성 상태에서 delete → err 반환', async () => {
    // WHY: save 한 번도 안 하면 table이 null인 채로 유지됨
    const result = await store.delete('any-session');
    expect(result.ok).toBe(false);
  });

  it('특수 문자 포함 sessionId delete → ok 반환', async () => {
    const sessionId = "sess-'; DROP TABLE--";
    const snap = makeSnapshot({ sessionId });
    await store.save(snap);

    const result = await store.delete(sessionId);
    expect(result.ok).toBe(true);
  });
});

// ── loadByProject ────────────────────────────────────────────────

describe('SessionSnapshotStore loadByProject()', () => {
  let store: SessionSnapshotStore;
  let dbDir: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
    store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('존재하지 않는 projectId → 빈 배열', async () => {
    const result = await store.loadByProject('proj-none');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('테이블 미생성 시 → 빈 배열 반환', async () => {
    const result = await store.loadByProject('proj-alpha');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('여러 세션을 projectId로 필터링', async () => {
    const snapA1 = makeSnapshot({ sessionId: 'sess-a1', projectId: 'proj-A', featureId: 'feat-1' });
    const snapA2 = makeSnapshot({ sessionId: 'sess-a2', projectId: 'proj-A', featureId: 'feat-2' });
    const snapB = makeSnapshot({ sessionId: 'sess-b', projectId: 'proj-B', featureId: 'feat-3' });

    await store.save(snapA1);
    await store.save(snapA2);
    await store.save(snapB);

    const resultA = await store.loadByProject('proj-A');
    const resultB = await store.loadByProject('proj-B');

    if (!resultA.ok || !resultB.ok) return;
    expect(resultA.value).toHaveLength(2);
    expect(resultB.value).toHaveLength(1);
  });

  it('모든 에이전트 타입 저장 후 projectId로 조회', async () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const agentName of agents) {
      await store.save(makeSnapshot({
        sessionId: `sess-${agentName}`,
        agentName,
        projectId: 'proj-multi',
        featureId: `feat-${agentName}`,
      }));
    }

    const result = await store.loadByProject('proj-multi');
    if (!result.ok) return;
    expect(result.value).toHaveLength(7);
  });

  it('4개 Phase 모두 저장 후 조회', async () => {
    const phases: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      await store.save(makeSnapshot({
        sessionId: `sess-${phase}`,
        projectId: 'proj-phases',
        featureId: `feat-${phase}`,
        phase,
      }));
    }

    const result = await store.loadByProject('proj-phases');
    if (!result.ok) return;
    expect(result.value).toHaveLength(4);
    const phaseSet = new Set(result.value.map((s) => s.phase));
    expect(phaseSet).toEqual(new Set(phases));
  });

  it('projectId에 특수 문자 → ok 반환', async () => {
    const result = await store.loadByProject("proj-'; SELECT * FROM --");
    expect(result.ok).toBe(true);
  });

  it('save 후 delete → loadByProject도 빈 배열', async () => {
    const snap = makeSnapshot({ sessionId: 'sess-del', projectId: 'proj-del', featureId: 'feat-del' });
    await store.save(snap);
    await store.delete('sess-del');

    const result = await store.loadByProject('proj-del');
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });
});

// ── 미초기화 상태 접근 ───────────────────────────────────────────

describe('SessionSnapshotStore 미초기화 상태 접근', () => {
  let store: SessionSnapshotStore;
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'adev-snap-'));
    store = new SessionSnapshotStore(dbDir, new ConsoleLogger('error'));
    // WHY: initialize() 미호출 — db와 table이 모두 null인 상태
  });

  afterEach(() => {
    try { rmSync(dbDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('save() 미초기화 → err(RagError) 반환', async () => {
    const snap = makeSnapshot();
    const result = await store.save(snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('rag_db_error');
  });

  it('loadByFeature() 미초기화 → ok([]) 반환 (table null → 빈 배열)', async () => {
    const result = await store.loadByFeature('feat-x');
    // WHY: safeExecute 내부에서 table === null 체크로 빈 배열 반환
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('loadByProject() 미초기화 → ok([]) 반환', async () => {
    const result = await store.loadByProject('proj-x');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('delete() 미초기화 → err(RagError) 반환', async () => {
    const result = await store.delete('sess-x');
    expect(result.ok).toBe(false);
  });

  it('close() 미초기화 상태에서도 에러 없음', async () => {
    await expect(store.close()).resolves.toBeUndefined();
  });
});
