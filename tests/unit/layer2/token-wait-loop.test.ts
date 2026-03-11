/**
 * runTokenWaitLoop 단위 테스트 / runTokenWaitLoop unit tests
 *
 * @description
 * KR: 토큰 대기 루프의 흐름, 대기 로직, 복원 트리거, 타임아웃을 검증한다.
 *     비율: Normal 20%, Edge 40%, Error 40%
 * EN: Validates token wait loop flow, wait logic, restore trigger, and timeout.
 *     Ratio: Normal 20%, Edge 40%, Error 40%
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { AgentEvent } from 'layer2/agent-types.js';
import { RagError } from 'core/errors.js';
import {
  TOKEN_WAIT_CHECK_INTERVAL_MS,
  TOKEN_WAIT_MAX_DURATION_MS,
  runTokenWaitLoop,
  type TokenWaitLoopDeps,
} from 'layer2/token-wait-loop.js';
import type { SessionSnapshot } from 'layer2/session-types.js';
import type { Phase } from 'core/types.js';

// ── 헬퍼: 이벤트 수집 / Collect events helper ────────────────────

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of iterable) {
    events.push(ev);
  }
  return events;
}

// ── 세션 스냅샷 팩토리 / Session snapshot factory ─────────────────

function makeSessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
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
    ...overrides,
  };
}

// ── Mock Bun.sleep / Mock Bun.sleep ──────────────────────────────

// WHY: Bun.sleep를 mock하면 실제 타임아웃 없이 대기 루프를 빠르게 테스트 가능
const originalBunSleep = Bun.sleep.bind(Bun);
let sleepCallCount = 0;

function mockBunSleep(_ms: number): Promise<void> {
  sleepCallCount += 1;
  return Promise.resolve();
}

// ── TokenMonitor mock ────────────────────────────────────────────

function makeTokenMonitor(shouldPauseAllValues: boolean[]): {
  shouldPauseAll: ReturnType<typeof mock>;
  shouldThrottleSpawn: ReturnType<typeof mock>;
  getStatus: ReturnType<typeof mock>;
  updateFromResponse: ReturnType<typeof mock>;
} {
  let callIdx = 0;
  return {
    shouldPauseAll: mock(() => {
      const val = shouldPauseAllValues[callIdx] ?? false;
      callIdx += 1;
      return val;
    }),
    shouldThrottleSpawn: mock(() => false),
    getStatus: mock(() => ({
      requestsRemaining: 50,
      outputTokensRemaining: null,
      retryAfterSeconds: null,
      isLimitApproaching: false,
      lastUpdated: null,
    })),
    updateFromResponse: mock(() => ok(undefined)),
  };
}

// ── SessionManager mock ───────────────────────────────────────────

function makeSessionManager(sessions: SessionSnapshot[]) {
  return {
    listSessions: mock((_filter?: unknown) => sessions),
    pauseSession: mock((_sessionId: string) => ok(undefined)),
    resumeSession: mock((_sessionId: string) => ok(undefined)),
    createSession: mock(() => ok(makeSessionSnapshot())),
    getSession: mock((_sessionId: string) => null),
    updateSession: mock(() => ok(undefined)),
    completeSession: mock((_sessionId: string) => ok(undefined)),
    failSession: mock((_sessionId: string, _reason: string) => ok(undefined)),
  };
}

// ── SessionSnapshotStore mock ─────────────────────────────────────

function makeSnapshotStore(overrides: {
  save?: ReturnType<typeof mock>;
  loadByFeature?: ReturnType<typeof mock>;
} = {}) {
  return {
    save: overrides.save ?? mock(() => Promise.resolve(ok(undefined))),
    loadByFeature: overrides.loadByFeature ?? mock(() => Promise.resolve(ok([]))),
    loadByProject: mock(() => Promise.resolve(ok([]))),
    delete: mock(() => Promise.resolve(ok(undefined))),
    initialize: mock(() => Promise.resolve(ok(undefined))),
    close: mock(() => Promise.resolve()),
  };
}

// ── SessionRestoreOrchestrator mock ──────────────────────────────

function makeRestoreOrchestrator(events: AgentEvent[] = []) {
  return {
    restoreFeatureSessions: mock(async function* () {
      for (const ev of events) {
        yield ev;
      }
    }),
    restoreProjectSessions: mock(async function* () {}),
  };
}

// ── 공통 deps 빌더 / Common deps builder ─────────────────────────

function makeDeps(overrides: {
  shouldPauseAllValues?: boolean[];
  sessions?: SessionSnapshot[];
  restoreEvents?: AgentEvent[];
  saveMock?: ReturnType<typeof mock>;
} = {}): TokenWaitLoopDeps {
  const logger = new ConsoleLogger('error');

  return {
    tokenMonitor: makeTokenMonitor(overrides.shouldPauseAllValues ?? [false]) as unknown as TokenWaitLoopDeps['tokenMonitor'],
    sessionManager: makeSessionManager(overrides.sessions ?? [makeSessionSnapshot()]) as unknown as TokenWaitLoopDeps['sessionManager'],
    sessionSnapshotStore: makeSnapshotStore({
      save: overrides.saveMock,
    }) as unknown as TokenWaitLoopDeps['sessionSnapshotStore'],
    sessionRestoreOrchestrator: makeRestoreOrchestrator(overrides.restoreEvents ?? []) as unknown as TokenWaitLoopDeps['sessionRestoreOrchestrator'],
    logger,
  };
}

// ── Bun.sleep 교체 / Replace Bun.sleep ────────────────────────────

function withMockSleep<T>(fn: () => Promise<T>): Promise<T> {
  sleepCallCount = 0;
  // @ts-expect-error — Bun.sleep를 테스트용으로 일시 교체
  Bun.sleep = mockBunSleep;
  return fn().finally(() => {
    // @ts-expect-error — 원래 sleep 복원
    Bun.sleep = originalBunSleep;
  });
}

// ── 테스트 / Tests ─────────────────────────────────────────────────

// Normal (20%)

describe('runTokenWaitLoop — 정상 케이스', () => {
  it('첫 체크에서 shouldPauseAll=false → 즉시 복원', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    // WHY: 즉시 break → '토큰 한도 도달 — 세션 스냅샷 저장 완료' + '토큰 윈도우 리셋 — 세션 복원 시작' 포함
    const contents = events.map((e) => e.content);
    expect(contents).toContain('토큰 한도 도달 — 세션 스냅샷 저장 완료');
    expect(contents).toContain('토큰 윈도우 리셋 — 세션 복원 시작');
    // WHY: 첫 체크에서 false → 대기 중 메시지 없음
    expect(contents.filter((c) => c.includes('토큰 대기 중'))).toHaveLength(0);
  });

  it('활성 세션의 스냅샷이 저장됨', async () => {
    const saveMock = mock(() => Promise.resolve(ok(undefined)));
    const deps = makeDeps({ shouldPauseAllValues: [false], saveMock });

    await withMockSleep(() => collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')));

    // WHY: 활성 세션 1개 → save 1회 호출
    expect(saveMock).toHaveBeenCalledTimes(1);
    const savedArg = (saveMock.mock.calls[0] as unknown[])[0] as { state: string };
    expect(savedArg.state).toBe('paused');
  });
});

// Edge cases (40%)

describe('runTokenWaitLoop — 엣지 케이스', () => {
  it('shouldPauseAll: true→false → 대기 1회 후 복원', async () => {
    // WHY: [true] → 1번 체크, 대기 중 메시지 1개, [false] → break
    const deps = makeDeps({ shouldPauseAllValues: [true, false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const contents = events.map((e) => e.content);
    expect(contents.filter((c) => c.includes('토큰 대기 중'))).toHaveLength(1);
    expect(contents).toContain('토큰 윈도우 리셋 — 세션 복원 시작');
  });

  it('shouldPauseAll: true→true→false → 대기 2회', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [true, true, false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const waitMessages = events.filter((e) => e.content.includes('토큰 대기 중'));
    expect(waitMessages).toHaveLength(2);
  });

  it('활성 세션 없음 → save 미호출 + 정상 흐름', async () => {
    const saveMock = mock(() => Promise.resolve(ok(undefined)));
    const deps = makeDeps({ shouldPauseAllValues: [false], sessions: [], saveMock });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    expect(saveMock).not.toHaveBeenCalled();
    expect(events.some((e) => e.content.includes('세션 스냅샷 저장 완료'))).toBe(true);
  });

  it('복수 활성 세션 → 각각 pauseSession + save 호출', async () => {
    const saveMock = mock(() => Promise.resolve(ok(undefined)));
    const sessions = [
      makeSessionSnapshot({ sessionId: 'sess-1' }),
      makeSessionSnapshot({ sessionId: 'sess-2' }),
    ];

    const logger = new ConsoleLogger('error');
    const sessionManager = makeSessionManager(sessions);
    const snapshotStore = makeSnapshotStore({ save: saveMock });
    const restoreOrchestrator = makeRestoreOrchestrator();
    const tokenMonitor = makeTokenMonitor([false]);

    const deps: TokenWaitLoopDeps = {
      tokenMonitor: tokenMonitor as unknown as TokenWaitLoopDeps['tokenMonitor'],
      sessionManager: sessionManager as unknown as TokenWaitLoopDeps['sessionManager'],
      sessionSnapshotStore: snapshotStore as unknown as TokenWaitLoopDeps['sessionSnapshotStore'],
      sessionRestoreOrchestrator: restoreOrchestrator as unknown as TokenWaitLoopDeps['sessionRestoreOrchestrator'],
      logger,
    };

    await withMockSleep(() => collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')));

    expect(sessionManager.pauseSession).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('복원 오케스트레이터가 done 이벤트 yield → 최종 이벤트에 포함', async () => {
    const restoreEvents: AgentEvent[] = [
      { type: 'done', agentName: 'coder', content: 'restored', timestamp: new Date() },
    ];
    const deps = makeDeps({ shouldPauseAllValues: [false], restoreEvents });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('대기 메시지에 경과 시간(초) 포함', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [true, false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const waitMsg = events.find((e) => e.content.includes('토큰 대기 중'));
    expect(waitMsg).toBeDefined();
    // WHY: 1번 대기 후 TOKEN_WAIT_CHECK_INTERVAL_MS/1000초 경과
    const expectedSeconds = TOKEN_WAIT_CHECK_INTERVAL_MS / 1000;
    expect(waitMsg!.content).toContain(String(expectedSeconds));
  });

  it('저장 실패 시 경고만 — 대기 루프는 계속 진행', async () => {
    const ragErr = new RagError('rag_db_error', 'save failed');
    const saveMock = mock(() => Promise.resolve(err(ragErr)));
    const deps = makeDeps({ shouldPauseAllValues: [false], saveMock });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    // WHY: save 실패해도 error 이벤트 yield 없이 루프 계속
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.some((e) => e.content.includes('토큰 윈도우 리셋'))).toBe(true);
  });

  it('pauseSession 실패 시 continue — 다음 세션 처리', async () => {
    const sessions = [
      makeSessionSnapshot({ sessionId: 'sess-fail' }),
      makeSessionSnapshot({ sessionId: 'sess-ok' }),
    ];
    const saveMock = mock(() => Promise.resolve(ok(undefined)));
    const logger = new ConsoleLogger('error');

    let pauseCallCount = 0;
    const sessionManager = {
      listSessions: mock(() => sessions),
      pauseSession: mock((_sid: string) => {
        pauseCallCount += 1;
        // WHY: 첫 번째 세션은 pauseSession 실패
        if (pauseCallCount === 1) {
          return err({ message: 'pause failed', code: 'agent_session_not_found' });
        }
        return ok(undefined);
      }),
    };

    const snapshotStore = makeSnapshotStore({ save: saveMock });
    const restoreOrchestrator = makeRestoreOrchestrator();
    const tokenMonitor = makeTokenMonitor([false]);

    const deps: TokenWaitLoopDeps = {
      tokenMonitor: tokenMonitor as unknown as TokenWaitLoopDeps['tokenMonitor'],
      sessionManager: sessionManager as unknown as TokenWaitLoopDeps['sessionManager'],
      sessionSnapshotStore: snapshotStore as unknown as TokenWaitLoopDeps['sessionSnapshotStore'],
      sessionRestoreOrchestrator: restoreOrchestrator as unknown as TokenWaitLoopDeps['sessionRestoreOrchestrator'],
      logger,
    };

    await withMockSleep(() => collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')));

    // WHY: 첫 번째는 pause 실패로 save 안 됨, 두 번째는 save 됨
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

// Error cases (40%)

describe('runTokenWaitLoop — 에러/타임아웃 케이스', () => {
  it('최대 대기 시간 초과 → error 이벤트 + 복원 없음', async () => {
    // WHY: TOKEN_WAIT_MAX_DURATION_MS / TOKEN_WAIT_CHECK_INTERVAL_MS 횟수만큼 true 반환
    const maxIterations = TOKEN_WAIT_MAX_DURATION_MS / TOKEN_WAIT_CHECK_INTERVAL_MS;
    // maxIterations번 true + 마지막 shouldPauseAll() 체크용 true
    const shouldPauseAllValues = new Array(maxIterations + 1).fill(true) as boolean[];
    const deps = makeDeps({ shouldPauseAllValues });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]!.content).toContain('토큰 한도 대기 시간 초과');

    // WHY: 타임아웃 후 복원 시작 메시지 없음
    const contents = events.map((e) => e.content);
    expect(contents).not.toContain('토큰 윈도우 리셋 — 세션 복원 시작');
  });

  it('모든 이벤트는 agentName을 가짐', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    for (const ev of events) {
      expect(ev.agentName).toBeDefined();
      expect(typeof ev.agentName).toBe('string');
    }
  });

  it('모든 이벤트는 timestamp를 가짐', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [true, false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    for (const ev of events) {
      expect(ev.timestamp).toBeInstanceOf(Date);
    }
  });

  it('message 타입 이벤트는 type === "message"', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const messageEvents = events.filter((e) => e.type === 'message');
    expect(messageEvents.length).toBeGreaterThan(0);
  });

  it('error 이벤트 후에는 더 이상 이벤트 yield 없음 (타임아웃)', async () => {
    const maxIterations = TOKEN_WAIT_MAX_DURATION_MS / TOKEN_WAIT_CHECK_INTERVAL_MS;
    const shouldPauseAllValues = new Array(maxIterations + 1).fill(true) as boolean[];
    const deps = makeDeps({ shouldPauseAllValues });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    const errorIdx = events.findIndex((e) => e.type === 'error');
    expect(errorIdx).toBe(events.length - 1);
  });

  it('빈 featureId, projectId → 이벤트는 여전히 yield됨 (listSessions 반환 기준)', async () => {
    const deps = makeDeps({ shouldPauseAllValues: [false] });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, '', '')),
    );

    expect(events.length).toBeGreaterThan(0);
  });

  it('복원 오케스트레이터 error 이벤트 → 최종 이벤트에 포함', async () => {
    const restoreEvents: AgentEvent[] = [
      {
        type: 'error',
        agentName: 'coder',
        content: 'restore failed',
        timestamp: new Date(),
      },
    ];
    const deps = makeDeps({ shouldPauseAllValues: [false], restoreEvents });

    const events = await withMockSleep(() =>
      collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')),
    );

    expect(events.some((e) => e.type === 'error' && e.content === 'restore failed')).toBe(true);
  });

  it('Bun.sleep가 정확히 TOKEN_WAIT_CHECK_INTERVAL_MS 횟수만큼 호출됨', async () => {
    // WHY: [true, true, false] → loop는 sleep→check(true)→sleep→check(true)→sleep→check(false)→break
    //      sleep은 3번 호출됨 (check가 false가 되는 iteration의 sleep도 포함)
    const deps = makeDeps({ shouldPauseAllValues: [true, true, false] });

    sleepCallCount = 0;
    await withMockSleep(() => collectEvents(runTokenWaitLoop(deps, 'feat-1', 'proj-1')));

    expect(sleepCallCount).toBe(3);
  });
});
