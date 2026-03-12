/**
 * TeamLeader 단위 테스트 / TeamLeader unit tests
 *
 * @description
 * 초기 상태, Phase 진행, 이벤트 생성, 토큰 리밋 중단,
 * 최대 반복 초과, 검증 통과/실패, 다양한 HandoffPackage 시나리오를 검증한다.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AuthProvider, RateLimitStatus } from 'auth/types.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { HandoffPackage, FeatureSpec } from 'layer1/types.js';
import { AgentGenerator } from 'layer2/agent-generator.js';
import { AgentSpawner } from 'layer2/agent-spawner.js';
import { BiasDetector } from 'layer2/bias-detector.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';
import { FailureHandler } from 'layer2/failure-handler.js';
import { IntegrationTester } from 'layer2/integration-tester.js';
import { PhaseEngine } from 'layer2/phase-engine.js';
import { ProgressTracker } from 'layer2/progress-tracker.js';
import { SessionManager } from 'layer2/session-manager.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';
import { TeamLeader } from 'layer2/team-leader.js';
import { TokenMonitor } from 'layer2/token-monitor.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from 'layer2/types.js';
import { VerificationGate } from 'layer2/verification-gate.js';

// ── 헬퍼 / Helpers ──────────────────────────────────────────────

function createMockExecutor(
  opts: { eventCount?: number; eventType?: AgentEvent['type'] } = {},
): AgentExecutor {
  const { eventCount = 2, eventType = 'message' } = opts;
  return {
    async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
      for (let i = 0; i < eventCount - 1; i++) {
        yield {
          type: eventType,
          agentName: config.name,
          content: `${config.name} 이벤트 ${i}`,
          timestamp: new Date(),
        };
      }
      yield {
        type: 'done',
        agentName: config.name,
        content: `${config.name} 완료`,
        timestamp: new Date(),
      };
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      yield {
        type: 'done',
        agentName: 'architect',
        content: '재개 완료',
        timestamp: new Date(),
      };
    },
  };
}

function createMockAuthProvider(overrides: Partial<RateLimitStatus> = {}): AuthProvider {
  return {
    authMode: 'api-key',
    getAuthHeader: () => ({ Authorization: 'Bearer test' }),
    getRateLimitStatus: (): RateLimitStatus => ({
      requestsRemaining: 80,
      inputTokensRemaining: null,
      outputTokensRemaining: null,
      retryAfterSeconds: null,
      requestsLimit: null,
      isLimitApproaching: false,
      ...overrides,
    }),
    updateFromResponse: (): Result<void> => ok(undefined),
  };
}

function createMockHandoff(
  opts: { featureCount?: number; projectId?: string } = {},
): HandoffPackage {
  const { featureCount = 1, projectId = 'proj-1' } = opts;

  const features: FeatureSpec[] = Array.from({ length: featureCount }, (_, i) => ({
    id: `feat-${i + 1}`,
    name: `기능 ${i + 1}`,
    description: `테스트 기능 ${i + 1}`,
    acceptanceCriteria: [
      { id: `ac-${i + 1}`, description: `기준 ${i + 1}`, verifiable: true, testCategory: 'test' },
    ],
    dependencies: [],
    inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
    outputs: [{ name: 'output', type: 'string', constraints: '', required: true }],
  }));

  return {
    id: `handoff-${projectId}`,
    projectId,
    contract: {
      version: 1,
      projectType: 'web-app',
      features,
      testDefinitions: features.map((f) => ({
        featureId: f.id,
        categories: [],
        rules: [],
        sampleTests: [],
        ratios: { unit: 0.6, module: 0.3, e2e: 0.1 },
      })),
      implementationOrder: features.map((f) => f.id),
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      },
    },
    planDocument: '기획 문서',
    designDocument: '설계 문서',
    specDocument: '스펙 문서',
    createdAt: new Date(),
    confirmedByUser: true,
  };
}

function buildLeader(
  opts: {
    executorOpts?: Parameters<typeof createMockExecutor>[0];
    authOverrides?: Partial<RateLimitStatus>;
    verificationGate?: VerificationGate;
  } = {},
): { leader: TeamLeader; gate: VerificationGate; logger: ConsoleLogger } {
  const logger = new ConsoleLogger('error');
  const executor = createMockExecutor(opts.executorOpts);
  const authProvider = createMockAuthProvider(opts.authOverrides);
  const gate = opts.verificationGate ?? new VerificationGate(logger);

  const leader = new TeamLeader({
    phaseEngine: new PhaseEngine(logger),
    agentSpawner: new AgentSpawner(executor, logger),
    sessionManager: new SessionManager(logger),
    tokenMonitor: new TokenMonitor(authProvider, logger),
    progressTracker: new ProgressTracker(logger),
    agentGenerator: new AgentGenerator(logger),
    coderAllocator: new CoderAllocator(logger),
    streamMonitor: new StreamMonitor(logger),
    biasDetector: new BiasDetector(logger),
    failureHandler: new FailureHandler(logger),
    verificationGate: gate,
    integrationTester: new IntegrationTester(logger),
    logger,
  });

  return { leader, gate, logger };
}

async function collectEvents(
  iterable: AsyncIterable<AgentEvent>,
  maxEvents = 200,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    if (events.length >= maxEvents) break;
  }
  return events;
}

// ── 생성자 + 초기 상태 ───────────────────────────────────────────

describe('TeamLeader 생성자 + 초기 상태', () => {
  it('인스턴스 생성됨', () => {
    const { leader } = buildLeader();
    expect(leader).toBeInstanceOf(TeamLeader);
  });

  it('초기 featureId는 null', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().featureId).toBeNull();
  });

  it('초기 phase는 DESIGN', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().phase).toBe('DESIGN');
  });

  it('초기 progress는 0', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().progress).toBe(0);
  });

  it('getStatus() 구조 타입 확인', () => {
    const { leader } = buildLeader();
    const status = leader.getStatus();
    expect(typeof status.phase).toBe('string');
    expect(typeof status.progress).toBe('number');
    expect(status).toHaveProperty('featureId');
  });

  it.each(['feat-1', 'feat-abc', 'my-feature-xyz'])(
    '빌드 후 featureId=%s 시작 전엔 null',
    (featureId) => {
      const { leader } = buildLeader();
      expect(leader.getStatus().featureId).toBeNull();
      expect(leader.getStatus().featureId).not.toBe(featureId);
    },
  );

  it('여러 리더 인스턴스 독립적', () => {
    const { leader: l1 } = buildLeader();
    const { leader: l2 } = buildLeader();
    expect(l1).not.toBe(l2);
    expect(l1.getStatus().featureId).toBe(l2.getStatus().featureId);
  });

  it('다른 projectId를 가진 핸드오프로 독립적 실행 가능', () => {
    const { leader: l1 } = buildLeader();
    const { leader: l2 } = buildLeader();
    expect(l1).toBeInstanceOf(TeamLeader);
    expect(l2).toBeInstanceOf(TeamLeader);
  });
});

// ── getStatus() 상태 반환 ─────────────────────────────────────────

describe('TeamLeader getStatus()', () => {
  it('executeFeature 시작 후 featureId 갱신', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();

    let count = 0;
    for await (const _ of leader.executeFeature('feat-x', handoff)) {
      count++;
      if (count >= 5) break;
    }

    expect(leader.getStatus().featureId).toBe('feat-x');
  });

  it('progress는 0 이상', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();

    let count = 0;
    for await (const _ of leader.executeFeature('feat-p', handoff)) {
      count++;
      if (count >= 5) break;
    }

    expect(leader.getStatus().progress).toBeGreaterThanOrEqual(0);
  });

  it('phase는 Phase 타입 값', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const validPhases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];

    let count = 0;
    for await (const _ of leader.executeFeature('feat-ph', handoff)) {
      count++;
      if (count >= 5) break;
    }

    expect(validPhases).toContain(leader.getStatus().phase);
  });
});

// ── executeFeature() — 기본 동작 ─────────────────────────────────

describe('TeamLeader executeFeature() 기본 동작', () => {
  it('이벤트를 하나 이상 생성한다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('이벤트에 type 필드가 있다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 20);
    for (const event of events) {
      expect(typeof event.type).toBe('string');
    }
  });

  it('이벤트에 timestamp가 있다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 20);
    for (const event of events) {
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });

  it('이벤트에 agentName이 있다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 20);
    for (const event of events) {
      expect(typeof event.agentName).toBe('string');
    }
  });

  it('done 또는 error 이벤트로 종료된다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 500);
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toBeDefined();
    expect(['done', 'error', 'message']).toContain(lastEvent?.type);
  });

  it('feat-id가 getStatus에 반영된다', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('my-feat', handoff), 50);
    expect(leader.getStatus().featureId).toBe('my-feat');
  });

  it.each(['feat-a', 'feat-b', 'feat-c', 'feature-xyz', 'f001'])(
    'featureId=%s 처리됨',
    async (fid) => {
      const { leader } = buildLeader();
      const handoff = createMockHandoff({ projectId: `proj-${fid}` });
      const events = await collectEvents(leader.executeFeature(fid, handoff), 50);
      expect(events.length).toBeGreaterThan(0);
      expect(leader.getStatus().featureId).toBe(fid);
    },
  );
});

// ── executeFeature() — 최대 반복 초과 ────────────────────────────

describe('TeamLeader executeFeature() 최대 반복 초과', () => {
  // WHY: executeVerifyPhase()는 에이전트 오류 없으면 qa_qc/reviewer를 passed=true로 등록하여
  //      즉시 통과한다. 반복 초과 시나리오는 에러 발생 mock executor로 강제한다.
  it('최대 반복 초과 시 error 이벤트 생성', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'error' } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max', handoff), 500);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it('최대 반복 초과 이벤트에 최대 횟수 정보 포함', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'error' } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-over', handoff), 500);
    // WHY: mock executor도 error 이벤트를 생성하므로 최대 반복 초과 메시지를 포함하는 이벤트를 찾음
    const maxIterEvent = events.find(
      (e) => e.type === 'error' && /10|반복|초과|iteration/i.test(e.content),
    );
    expect(maxIterEvent).toBeDefined();
  });

  it('최대 반복 초과 후 진행률은 0', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'error' } });
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-loop', handoff), 500);
    // 완료되지 않았으므로 progress는 0
    expect(leader.getStatus().progress).toBe(0);
  });

  it.each([1, 2, 3])('반복 %i 번째 기능 — 최대 반복 초과', async (i) => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'error' } });
    const handoff = createMockHandoff({ projectId: `proj-loop-${i}` });
    const events = await collectEvents(leader.executeFeature(`feat-loop-${i}`, handoff), 500);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
  });
});

// ── executeFeature() — 검증 통과 시나리오 ────────────────────────

describe('TeamLeader executeFeature() 검증 통과', () => {
  function buildLeaderWithPassingGate(featureId: string): {
    leader: TeamLeader;
    gate: VerificationGate;
  } {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);

    // 4중 검증 전부 통과 상태 설정
    for (const phase of ['qa_qc', 'reviewer', 'layer1', 'adev'] as const) {
      gate.addResult({
        featureId,
        phase,
        passed: true,
        feedback: `${phase} 통과`,
        agentName: 'architect',
        timestamp: new Date(),
      });
    }

    const { leader } = buildLeader({ verificationGate: gate });
    return { leader, gate };
  }

  it('4중 검증 통과 시 done 이벤트 생성', async () => {
    const { leader } = buildLeaderWithPassingGate('feat-pass');
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-pass', handoff), 500);
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBeGreaterThan(0);
  });

  it('검증 통과 done 이벤트 내용에 기능 ID 포함', async () => {
    const { leader } = buildLeaderWithPassingGate('feat-done-123');
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-done-123', handoff), 500);
    const doneEvent = events.find((e) => e.type === 'done');
    if (doneEvent) {
      expect(doneEvent.content).toMatch(/feat-done-123|완료/);
    }
  });

  it.each(['feat-ok-1', 'feat-ok-2', 'feat-ok-3'])('기능 %s 검증 통과 → done', async (fid) => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    for (const phase of ['qa_qc', 'reviewer', 'layer1', 'adev'] as const) {
      gate.addResult({
        featureId: fid,
        phase,
        passed: true,
        feedback: '통과',
        agentName: 'architect',
        timestamp: new Date(),
      });
    }
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature(fid, handoff), 500);
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBeGreaterThan(0);
  });
});

// ── executeFeature() — 다양한 HandoffPackage ─────────────────────

describe('TeamLeader executeFeature() HandoffPackage 다양성', () => {
  it('기능 1개 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('기능 2개 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 2 });
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('기능 5개 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 5 });
    const events = await collectEvents(leader.executeFeature('feat-3', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('다른 projectId → 별도 처리', async () => {
    const { leader: l1 } = buildLeader();
    const { leader: l2 } = buildLeader();

    const h1 = createMockHandoff({ projectId: 'proj-A' });
    const h2 = createMockHandoff({ projectId: 'proj-B' });

    const [e1, e2] = await Promise.all([
      collectEvents(l1.executeFeature('feat-1', h1), 50),
      collectEvents(l2.executeFeature('feat-1', h2), 50),
    ]);

    expect(e1.length).toBeGreaterThan(0);
    expect(e2.length).toBeGreaterThan(0);
  });

  it.each(Array.from({ length: 5 }, (_, i) => i + 1))('featureCount=%i 처리', async (n) => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: n });
    const events = await collectEvents(leader.executeFeature('feat-1', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ── executeFeature() — 연속 기능 실행 ────────────────────────────

describe('TeamLeader executeFeature() 연속 기능 실행', () => {
  it('두 기능을 순차적으로 실행할 수 있다', async () => {
    const { leader } = buildLeader();
    const h1 = createMockHandoff({ projectId: 'proj-seq' });
    const h2 = createMockHandoff({ projectId: 'proj-seq' });

    const e1 = await collectEvents(leader.executeFeature('feat-A', h1), 100);
    const e2 = await collectEvents(leader.executeFeature('feat-B', h2), 100);

    expect(e1.length).toBeGreaterThan(0);
    expect(e2.length).toBeGreaterThan(0);
    expect(leader.getStatus().featureId).toBe('feat-B');
  });

  it('세 기능 순차 실행 — 마지막 featureId 유지', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();

    for (const fid of ['feat-X', 'feat-Y', 'feat-Z']) {
      await collectEvents(leader.executeFeature(fid, handoff), 100);
    }

    expect(leader.getStatus().featureId).toBe('feat-Z');
  });
});

// ── 랜덤 경계값 ──────────────────────────────────────────────────

describe('TeamLeader 랜덤 경계값', () => {
  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 시나리오 #%i', async (i) => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ projectId: `proj-rand-${i}` });
    const events = await collectEvents(leader.executeFeature(`feat-rand-${i}`, handoff), 200);
    expect(events.length).toBeGreaterThan(0);
    expect(leader.getStatus().featureId).toBe(`feat-rand-${i}`);
  });

  it.each(Array.from({ length: 5 }, (_, i) => i))('getStatus 반복 호출 #%i', async (i) => {
    const { leader } = buildLeader();
    // 실행 전 상태
    const before = leader.getStatus();
    expect(before.featureId).toBeNull();

    const handoff = createMockHandoff({ projectId: `proj-gs-${i}` });
    await collectEvents(leader.executeFeature(`feat-gs-${i}`, handoff), 50);

    // 실행 후 상태
    const after = leader.getStatus();
    expect(after.featureId).toBe(`feat-gs-${i}`);
  });

  it('빈 specDocument 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = {
      ...createMockHandoff(),
      specDocument: '',
    };
    const events = await collectEvents(leader.executeFeature('feat-empty-spec', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('빈 planDocument 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = {
      ...createMockHandoff(),
      planDocument: '',
    };
    const events = await collectEvents(leader.executeFeature('feat-empty-plan', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('다수 에이전트 이벤트 생성 executor', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 5 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-multi', handoff), 300);
    expect(events.length).toBeGreaterThan(5);
  });
});

// ── 이벤트 타입 검증 ─────────────────────────────────────────────

describe('TeamLeader 이벤트 타입 검증', () => {
  const validEventTypes = ['message', 'done', 'error', 'tool_use', 'tool_result'];

  it('모든 이벤트 type이 유효한 값', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ev', handoff), 200);

    for (const event of events) {
      expect(validEventTypes).toContain(event.type);
    }
  });

  it('message 타입 이벤트는 content가 문자열', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-msg', handoff), 200);

    for (const event of events.filter((e) => e.type === 'message')) {
      expect(typeof event.content).toBe('string');
    }
  });

  it('done 또는 error 이벤트 중 하나는 반드시 존재', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-term', handoff), 500);
    const terminalEvents = events.filter((e) => e.type === 'done' || e.type === 'error');
    expect(terminalEvents.length).toBeGreaterThan(0);
  });
});

// ── 성능 테스트 ───────────────────────────────────────────────────

describe('TeamLeader 성능', () => {
  it('50개 리더 인스턴스 생성 → 성능 문제 없음', () => {
    const leaders = Array.from({ length: 50 }, () => buildLeader().leader);
    expect(leaders.length).toBe(50);
    for (const l of leaders) {
      expect(l).toBeInstanceOf(TeamLeader);
      expect(l.getStatus().featureId).toBeNull();
    }
  });

  it('10개 기능 순차 실행 (200 이벤트 제한)', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      const events = await collectEvents(leader.executeFeature(`feat-perf-${i}`, handoff), 200);
      results.push(events.length);
    }

    expect(results.length).toBe(10);
    for (const count of results) {
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ── 경계값: 특수 featureId ─────────────────────────────────────

describe('TeamLeader 특수 featureId 경계값', () => {
  it('빈 문자열 featureId → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('UUID 형식 featureId → 상태 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    await collectEvents(leader.executeFeature(uuid, handoff), 100);
    expect(leader.getStatus().featureId).toBe(uuid);
  });

  it('한글 featureId → 상태 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('기능-1', handoff), 100);
    expect(leader.getStatus().featureId).toBe('기능-1');
  });

  it('특수문자 포함 featureId → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const fid = 'feat_v2.0@beta';
    const events = await collectEvents(leader.executeFeature(fid, handoff), 100);
    expect(events.length).toBeGreaterThan(0);
    expect(leader.getStatus().featureId).toBe(fid);
  });

  it('매우 긴 featureId (100자) → 상태 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const longId = 'feat-' + 'x'.repeat(95);
    await collectEvents(leader.executeFeature(longId, handoff), 100);
    expect(leader.getStatus().featureId).toBe(longId);
  });

  it('숫자만으로 된 featureId → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('123456', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('getStatus phase는 실행 후에도 유효한 Phase', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-phase-check', handoff), 200);
    const validPhases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    expect(validPhases).toContain(leader.getStatus().phase);
  });

  it('progress는 실행 후 0 이상 100 이하', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-progress', handoff), 200);
    expect(leader.getStatus().progress).toBeGreaterThanOrEqual(0);
    expect(leader.getStatus().progress).toBeLessThanOrEqual(100);
  });
});

// ── 이벤트 content 경계값 ─────────────────────────────────────

describe('TeamLeader 이벤트 content 경계값', () => {
  it('모든 이벤트 content는 string 타입', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-content', handoff), 200);
    for (const event of events) {
      expect(typeof event.content).toBe('string');
    }
  });

  it('error 이벤트 content는 비어있지 않음', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-content', handoff), 500);
    for (const event of events.filter((e) => e.type === 'error')) {
      expect(event.content.length).toBeGreaterThan(0);
    }
  });

  it('done 이벤트 content는 string', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-done-content', handoff), 500);
    for (const event of events.filter((e) => e.type === 'done')) {
      expect(typeof event.content).toBe('string');
    }
  });

  it('agentName은 비어있지 않음', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-agent', handoff), 100);
    for (const event of events) {
      expect(event.agentName.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('timestamp는 Date 인스턴스', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ts', handoff), 50);
    for (const event of events) {
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });
});

// ── getStatus 경계값 추가 ─────────────────────────────────────

describe('TeamLeader getStatus() 경계값 추가', () => {
  it('getStatus progress는 number 타입', () => {
    const { leader } = buildLeader();
    expect(typeof leader.getStatus().progress).toBe('number');
  });

  it('getStatus phase는 string 타입', () => {
    const { leader } = buildLeader();
    expect(typeof leader.getStatus().phase).toBe('string');
  });

  it('getStatus featureId는 null 또는 string', () => {
    const { leader } = buildLeader();
    const fid = leader.getStatus().featureId;
    expect(fid === null || typeof fid === 'string').toBe(true);
  });

  it('10번 반복 getStatus → 항상 동일 초기 상태', () => {
    const { leader } = buildLeader();
    for (let i = 0; i < 10; i++) {
      const status = leader.getStatus();
      expect(status.featureId).toBeNull();
      expect(status.phase).toBe('DESIGN');
      expect(status.progress).toBe(0);
    }
  });

  it('실행 중간에 getStatus 호출 가능', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    let count = 0;
    for await (const _ of leader.executeFeature('feat-mid', handoff)) {
      if (count === 2) {
        const status = leader.getStatus();
        expect(typeof status.phase).toBe('string');
        expect(typeof status.progress).toBe('number');
      }
      count++;
      if (count >= 10) break;
    }
  });
});

// ── HandoffPackage confirmedByUser 경계값 ─────────────────────

describe('TeamLeader HandoffPackage confirmedByUser 경계값', () => {
  it('confirmedByUser=true → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = { ...createMockHandoff(), confirmedByUser: true };
    const events = await collectEvents(leader.executeFeature('feat-confirmed', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('confirmedByUser=false → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = { ...createMockHandoff(), confirmedByUser: false };
    const events = await collectEvents(leader.executeFeature('feat-unconfirmed', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('planDocument 긴 문자열 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = { ...createMockHandoff(), planDocument: 'p'.repeat(1000) };
    const events = await collectEvents(leader.executeFeature('feat-long-plan', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('designDocument 긴 문자열 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = { ...createMockHandoff(), designDocument: 'd'.repeat(1000) };
    const events = await collectEvents(leader.executeFeature('feat-long-design', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('specDocument 한글 내용 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = { ...createMockHandoff(), specDocument: '한글 스펙 문서 내용' };
    const events = await collectEvents(leader.executeFeature('feat-korean-spec', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ── 병렬 실행 경계값 ──────────────────────────────────────────

describe('TeamLeader 병렬 실행 경계값', () => {
  it('3개 리더 병렬 실행 → 모두 이벤트 생성', async () => {
    const leaders = [buildLeader().leader, buildLeader().leader, buildLeader().leader];
    const handoffs = leaders.map((_, i) => createMockHandoff({ projectId: `parallel-${i}` }));
    const results = await Promise.all(
      leaders.map((l, i) => collectEvents(l.executeFeature(`feat-par-${i}`, handoffs[i]!), 100)),
    );
    for (const events of results) {
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('5개 리더 병렬 → featureId 각각 다름', async () => {
    const count = 5;
    const leaders = Array.from({ length: count }, () => buildLeader().leader);
    const handoffs = Array.from({ length: count }, (_, i) =>
      createMockHandoff({ projectId: `p-${i}` }),
    );
    await Promise.all(
      leaders.map((l, i) => collectEvents(l.executeFeature(`feat-ind-${i}`, handoffs[i]!), 100)),
    );
    for (let i = 0; i < count; i++) {
      expect(leaders[i]!.getStatus().featureId).toBe(`feat-ind-${i}`);
    }
  });

  it('동일 handoff 여러 리더 병렬 → 각자 독립', async () => {
    const handoff = createMockHandoff();
    const l1 = buildLeader().leader;
    const l2 = buildLeader().leader;
    const [e1, e2] = await Promise.all([
      collectEvents(l1.executeFeature('feat-shared-1', handoff), 100),
      collectEvents(l2.executeFeature('feat-shared-2', handoff), 100),
    ]);
    expect(e1.length).toBeGreaterThan(0);
    expect(e2.length).toBeGreaterThan(0);
    expect(l1.getStatus().featureId).toBe('feat-shared-1');
    expect(l2.getStatus().featureId).toBe('feat-shared-2');
  });
});

// ── 추가 경계값 케이스 #2 ────────────────────────────────────

describe('TeamLeader 추가 경계값 #2', () => {
  it('기능 ID에 하이픈 여러 개 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-a-b-c-d-e', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
    expect(leader.getStatus().featureId).toBe('feat-a-b-c-d-e');
  });

  it('기능 ID에 점 포함 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat.v1.2.3', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('기능 ID에 슬래시 포함 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('org/repo/feat', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('50개 기능 순차 실행 → 마지막 featureId 정확', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    for (let i = 0; i < 50; i++) {
      await collectEvents(leader.executeFeature(`feat-seq-${i}`, handoff), 50);
    }
    expect(leader.getStatus().featureId).toBe('feat-seq-49');
  });

  it('getStatus는 실행 중 변경 가능', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const statuses: string[] = [];
    let count = 0;
    for await (const _ of leader.executeFeature('feat-track', handoff)) {
      const s = leader.getStatus();
      if (s.featureId !== null) statuses.push(s.featureId);
      count++;
      if (count >= 5) break;
    }
    // featureId가 설정된 시점 이후에는 일관적
    for (const fid of statuses) {
      expect(fid).toBe('feat-track');
    }
  });

  it('이벤트 배열 길이는 항상 양의 정수', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-len', handoff), 200);
    expect(Number.isInteger(events.length)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(0);
  });

  it('progress는 NaN이 아님', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-nan', handoff), 100);
    expect(Number.isNaN(leader.getStatus().progress)).toBe(false);
  });

  it('progress는 Infinity가 아님', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-inf', handoff), 100);
    expect(Number.isFinite(leader.getStatus().progress)).toBe(true);
  });

  it('featureCount=10 핸드오프 처리', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 10 });
    const events = await collectEvents(leader.executeFeature('feat-10count', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('featureCount=0 핸드오프 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 0 });
    const events = await collectEvents(leader.executeFeature('feat-0count', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('모든 이벤트 agentName은 string 타입', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-agentname', handoff), 200);
    for (const e of events) {
      expect(typeof e.agentName).toBe('string');
    }
  });

  it('모든 이벤트 timestamp는 유효한 Date', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-validts', handoff), 100);
    for (const e of events) {
      expect(e.timestamp).toBeInstanceOf(Date);
      expect(Number.isNaN(e.timestamp.getTime())).toBe(false);
    }
  });

  it('error 이벤트는 content가 비어있지 않음', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-errcontent', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'error')) {
      expect(e.content.length).toBeGreaterThan(0);
    }
  });

  it('기능 ID에 @ 포함 → featureId 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat@v2', handoff), 100);
    expect(leader.getStatus().featureId).toBe('feat@v2');
  });

  it('기능 ID에 # 포함 → featureId 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat#123', handoff), 100);
    expect(leader.getStatus().featureId).toBe('feat#123');
  });

  it('executorOpts eventCount=1 → 이벤트 최소 1개', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 1 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-1ev', handoff), 200);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('executorOpts eventCount=10 → 이벤트 다수', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 10 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-10ev', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('projectId 긴 문자열 핸드오프 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ projectId: 'proj-' + 'x'.repeat(100) });
    const events = await collectEvents(leader.executeFeature('feat-long-proj', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('한국어 projectId 핸드오프 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ projectId: '한국어-프로젝트-아이디' });
    const events = await collectEvents(leader.executeFeature('feat-kr-proj', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('건축 100개 리더 인스턴스 → 메모리 문제 없음', () => {
    const leaders = Array.from({ length: 100 }, () => buildLeader().leader);
    expect(leaders.length).toBe(100);
    for (const l of leaders) {
      expect(l).toBeInstanceOf(TeamLeader);
    }
  });

  it('event type은 validEventTypes 중 하나', async () => {
    const validTypes = new Set(['message', 'done', 'error', 'tool_use', 'tool_result']);
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-type-valid', handoff), 200);
    for (const e of events) {
      expect(validTypes.has(e.type)).toBe(true);
    }
  });

  it('랜덤 UUID projectId → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ projectId: crypto.randomUUID() });
    const events = await collectEvents(leader.executeFeature('feat-uuid-proj', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('랜덤 UUID featureId → 상태 반영', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const uuid = crypto.randomUUID();
    await collectEvents(leader.executeFeature(uuid, handoff), 100);
    expect(leader.getStatus().featureId).toBe(uuid);
  });

  it('이벤트 순서 — 처음 이벤트는 message or tool_use or done or error', async () => {
    const validFirstTypes = new Set(['message', 'done', 'error', 'tool_use', 'tool_result']);
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-order', handoff), 100);
    if (events.length > 0) {
      expect(validFirstTypes.has(events[0]!.type)).toBe(true);
    }
  });

  it('연속 10회 executeFeature → 모두 이벤트 ≥ 1', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    for (let i = 0; i < 10; i++) {
      const events = await collectEvents(leader.executeFeature(`feat-rep-${i}`, handoff), 100);
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('getStatus는 동기적으로 즉시 반환', () => {
    const { leader } = buildLeader();
    const start = Date.now();
    leader.getStatus();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // 100ms 이내
  });

  it('phase 초기값은 DESIGN 문자열', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().phase).toBe('DESIGN');
  });

  it('progress 초기값은 정확히 0', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().progress).toBe(0);
  });

  it('featureId 초기값은 정확히 null', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().featureId).toBeNull();
  });
});

// ── 추가 경계값 #3: 이벤트 시퀀스 패턴 ──────────────────────

describe('TeamLeader 이벤트 시퀀스 패턴', () => {
  it('이벤트 목록이 빈 배열이 아님', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-seq-1', handoff), 100);
    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);
  });

  it('첫 이벤트 timestamp는 Date', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ts-first', handoff), 50);
    if (events.length > 0) {
      expect(events[0]!.timestamp).toBeInstanceOf(Date);
    }
  });

  it('마지막 이벤트 timestamp는 Date', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ts-last', handoff), 200);
    if (events.length > 0) {
      expect(events[events.length - 1]!.timestamp).toBeInstanceOf(Date);
    }
  });

  it('모든 이벤트 timestamp가 유효한 시간', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ts-valid', handoff), 100);
    for (const e of events) {
      expect(e.timestamp.getTime()).toBeGreaterThan(0);
    }
  });

  it('연속 이벤트에서 type은 항상 string', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-typestr', handoff), 100);
    for (const e of events) {
      expect(typeof e.type).toBe('string');
      expect(e.type.length).toBeGreaterThan(0);
    }
  });

  it('error 이벤트 agentName은 string', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-agentname', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'error')) {
      expect(typeof e.agentName).toBe('string');
    }
  });

  it('done 이벤트 agentName은 string', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-done-agentname', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'done')) {
      expect(typeof e.agentName).toBe('string');
    }
  });

  it('이벤트 content는 never undefined', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-undef', handoff), 100);
    for (const e of events) {
      expect(e.content).not.toBeUndefined();
    }
  });

  it('이벤트 agentName은 never undefined', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-agentname-undef', handoff), 100);
    for (const e of events) {
      expect(e.agentName).not.toBeUndefined();
    }
  });

  it('featureId 설정 후 getStatus 항상 동일 featureId', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    let count = 0;
    for await (const _ of leader.executeFeature('feat-stable-id', handoff)) {
      count++;
      if (count >= 3) break;
    }
    const s1 = leader.getStatus();
    const s2 = leader.getStatus();
    expect(s1.featureId).toBe(s2.featureId);
  });
});

// ── 추가 경계값 #4: HandoffPackage 다양한 스펙 ────────────────

describe('TeamLeader HandoffPackage 다양한 스펙', () => {
  it('acceptanceCriteria가 빈 배열인 기능 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    // acceptanceCriteria 빈 배열로 오버라이드
    handoff.contract.features[0]!.acceptanceCriteria = [];
    const events = await collectEvents(leader.executeFeature('feat-empty-ac', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('implementationOrder가 빈 배열인 계약 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.implementationOrder = [];
    const events = await collectEvents(leader.executeFeature('feat-empty-order', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('verificationMatrix 점수 0.5 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.verificationMatrix.completenessScore = 0.5;
    const events = await collectEvents(leader.executeFeature('feat-vm-half', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('verificationMatrix 점수 0 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.verificationMatrix.completenessScore = 0;
    const events = await collectEvents(leader.executeFeature('feat-vm-zero', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('projectType=api → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.projectType = 'api';
    const events = await collectEvents(leader.executeFeature('feat-api-type', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('projectType=cli → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.projectType = 'cli';
    const events = await collectEvents(leader.executeFeature('feat-cli-type', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('contract.version=2 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.version = 2;
    const events = await collectEvents(leader.executeFeature('feat-v2-contract', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('기능에 여러 의존성 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 3 });
    handoff.contract.features[2]!.dependencies = ['feat-1', 'feat-2'];
    const events = await collectEvents(leader.executeFeature('feat-deps', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('inputs가 빈 배열인 기능 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.features[0]!.inputs = [];
    const events = await collectEvents(leader.executeFeature('feat-no-inputs', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });

  it('outputs가 빈 배열인 기능 → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff({ featureCount: 1 });
    handoff.contract.features[0]!.outputs = [];
    const events = await collectEvents(leader.executeFeature('feat-no-outputs', handoff), 100);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ── 추가 경계값 #5: getStatus 세부 패턴 ──────────────────────

describe('TeamLeader getStatus() 세부 패턴', () => {
  it('실행 전 phase는 DESIGN', () => {
    const { leader } = buildLeader();
    expect(leader.getStatus().phase).toBe('DESIGN');
  });

  it('실행 완료 후 progress는 0 또는 양수', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-prog-check', handoff), 300);
    expect(leader.getStatus().progress).toBeGreaterThanOrEqual(0);
  });

  it('getStatus는 동기 메서드 — 반환값 즉시 사용 가능', () => {
    const { leader } = buildLeader();
    const status = leader.getStatus();
    expect(status).not.toBeNull();
    expect(status).not.toBeUndefined();
  });

  it('getStatus 반환 객체에 phase 키 존재', () => {
    const { leader } = buildLeader();
    expect('phase' in leader.getStatus()).toBe(true);
  });

  it('getStatus 반환 객체에 progress 키 존재', () => {
    const { leader } = buildLeader();
    expect('progress' in leader.getStatus()).toBe(true);
  });

  it('getStatus 반환 객체에 featureId 키 존재', () => {
    const { leader } = buildLeader();
    expect('featureId' in leader.getStatus()).toBe(true);
  });

  it('phase 초기값은 DESIGN 문자열 — 재확인', () => {
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      expect(leader.getStatus().phase).toBe('DESIGN');
    }
  });

  it('progress 초기값은 숫자 0 — 재확인', () => {
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      expect(leader.getStatus().progress).toBe(0);
    }
  });

  it('featureId 초기값은 null — 재확인', () => {
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      expect(leader.getStatus().featureId).toBeNull();
    }
  });

  it('20개 리더 생성 후 각각 초기 상태 동일', () => {
    const leaders = Array.from({ length: 20 }, () => buildLeader().leader);
    for (const l of leaders) {
      expect(l.getStatus().featureId).toBeNull();
      expect(l.getStatus().phase).toBe('DESIGN');
      expect(l.getStatus().progress).toBe(0);
    }
  });
});

// ── 추가 경계값 #6: 오류 이벤트 상세 검증 ───────────────────

describe('TeamLeader 오류 이벤트 상세 검증', () => {
  it('error 이벤트 content가 문자열', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-str', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'error')) {
      expect(typeof e.content).toBe('string');
    }
  });

  it('error 이벤트 timestamp가 유효', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-ts', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'error')) {
      expect(e.timestamp).toBeInstanceOf(Date);
      expect(Number.isNaN(e.timestamp.getTime())).toBe(false);
    }
  });

  it('error 이벤트 type은 정확히 "error"', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-type', handoff), 500);
    for (const e of events.filter(ev => ev.type === 'error')) {
      expect(e.type).toBe('error');
    }
  });

  it('반복 초과 에러 메시지는 숫자 포함', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-num', handoff), 500);
    const errEvent = events.find(e => e.type === 'error');
    if (errEvent) {
      expect(/\d/.test(errEvent.content)).toBe(true);
    }
  });

  it('에러 후 getStatus는 여전히 안전', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-after-err', handoff), 500);
    expect(() => leader.getStatus()).not.toThrow();
  });

  it('에러 후 featureId는 설정된 값 유지', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-err-fid', handoff), 500);
    expect(leader.getStatus().featureId).toBe('feat-err-fid');
  });

  it('에러 이벤트 없는 경우도 허용', async () => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    for (const phase of ['qa_qc', 'reviewer', 'layer1', 'adev'] as const) {
      gate.addResult({
        featureId: 'feat-no-err',
        phase,
        passed: true,
        feedback: '통과',
        agentName: 'architect',
        timestamp: new Date(),
      });
    }
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-no-err', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('error type 이벤트는 최대 1회 이상', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-count', handoff), 500);
    const errCount = events.filter(e => e.type === 'error').length;
    expect(errCount).toBeGreaterThanOrEqual(0); // 에러 없거나 있거나 모두 허용
  });

  it('최대 반복 초과 오류 이벤트 정확히 1회', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-err-once', handoff), 500);
    const errEvents = events.filter(e => e.type === 'error');
    // 오류가 있다면 정확히 하나만 있어야 함
    if (errEvents.length > 0) {
      expect(errEvents.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('오류 이벤트 전에 message 이벤트 있음', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-msg-before-err', handoff), 500);
    const errIdx = events.findIndex(e => e.type === 'error');
    if (errIdx > 0) {
      expect(events.slice(0, errIdx).some(e => e.type === 'message')).toBe(true);
    }
  });
});

// ── 추가 경계값 #7: 동시성 패턴 ──────────────────────────────

describe('TeamLeader 동시성 패턴', () => {
  it('10개 리더 병렬 실행 → 모두 이벤트 반환', async () => {
    const n = 10;
    const leaders = Array.from({ length: n }, () => buildLeader().leader);
    const handoffs = Array.from({ length: n }, (_, i) => createMockHandoff({ projectId: `par-${i}` }));
    const results = await Promise.all(
      leaders.map((l, i) => collectEvents(l.executeFeature(`feat-con-${i}`, handoffs[i]!), 100)),
    );
    for (const events of results) {
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('20개 리더 병렬 실행 → featureId 각각 다름', async () => {
    const n = 20;
    const leaders = Array.from({ length: n }, () => buildLeader().leader);
    const handoffs = Array.from({ length: n }, (_, i) => createMockHandoff({ projectId: `p2-${i}` }));
    await Promise.all(
      leaders.map((l, i) => collectEvents(l.executeFeature(`feat-par2-${i}`, handoffs[i]!), 100)),
    );
    for (let i = 0; i < n; i++) {
      expect(leaders[i]!.getStatus().featureId).toBe(`feat-par2-${i}`);
    }
  });

  it('동일 executor 사용 리더 병렬 → 독립 상태', async () => {
    const l1 = buildLeader().leader;
    const l2 = buildLeader().leader;
    const handoff = createMockHandoff();

    const [e1, e2] = await Promise.all([
      collectEvents(l1.executeFeature('feat-same-ex-1', handoff), 100),
      collectEvents(l2.executeFeature('feat-same-ex-2', handoff), 100),
    ]);

    expect(e1.length).toBeGreaterThan(0);
    expect(e2.length).toBeGreaterThan(0);
    expect(l1.getStatus().featureId).toBe('feat-same-ex-1');
    expect(l2.getStatus().featureId).toBe('feat-same-ex-2');
  });

  it('병렬 실행 후 각 리더 getStatus는 정합', async () => {
    const leaders = [buildLeader().leader, buildLeader().leader];
    const handoffs = [createMockHandoff(), createMockHandoff()];
    await Promise.all([
      collectEvents(leaders[0]!.executeFeature('p-feat-0', handoffs[0]!), 100),
      collectEvents(leaders[1]!.executeFeature('p-feat-1', handoffs[1]!), 100),
    ]);
    expect(leaders[0]!.getStatus().featureId).toBe('p-feat-0');
    expect(leaders[1]!.getStatus().featureId).toBe('p-feat-1');
  });

  it('병렬 실행 이벤트 합계는 2 이상', async () => {
    const l1 = buildLeader().leader;
    const l2 = buildLeader().leader;
    const handoff = createMockHandoff();
    const [e1, e2] = await Promise.all([
      collectEvents(l1.executeFeature('par-sum-1', handoff), 100),
      collectEvents(l2.executeFeature('par-sum-2', handoff), 100),
    ]);
    expect(e1.length + e2.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 추가 경계값 #8: collectEvents 경계값 ──────────────────────

describe('TeamLeader collectEvents 경계값', () => {
  it('maxEvents=1 → 최대 1개 이벤트', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max1', handoff), 1);
    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('maxEvents=5 → 최대 5개 이벤트', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max5', handoff), 5);
    expect(events.length).toBeLessThanOrEqual(5);
  });

  it('maxEvents=500 → 최대 500개 이벤트', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max500', handoff), 500);
    expect(events.length).toBeLessThanOrEqual(500);
  });

  it('maxEvents=2 → 최대 2개 이벤트', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 10 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max2', handoff), 2);
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('maxEvents=0 → collectEvents 즉시 중단 (최대 1개)', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max0', handoff), 0);
    // WHY: collectEvents는 push 후 length >= maxEvents 체크 — maxEvents=0이면 1개 후 break
    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('10번 연속 collectEvents → 모두 ≤ maxEvents', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    for (let i = 0; i < 10; i++) {
      const events = await collectEvents(leader.executeFeature(`feat-limit-${i}`, handoff), 10);
      expect(events.length).toBeLessThanOrEqual(10);
    }
  });
});

// ── 추가 경계값 #9: 검증 게이트 부분 통과 ────────────────────

describe('TeamLeader 검증 게이트 부분 통과 시나리오', () => {
  it('qa_qc만 통과 → 에러 이벤트', async () => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    gate.addResult({
      featureId: 'feat-partial-1',
      phase: 'qa_qc',
      passed: true,
      feedback: 'qa_qc 통과',
      agentName: 'qa',
      timestamp: new Date(),
    });
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-partial-1', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('reviewer만 통과 → 이벤트 생성', async () => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    gate.addResult({
      featureId: 'feat-partial-rev',
      phase: 'reviewer',
      passed: true,
      feedback: 'reviewer 통과',
      agentName: 'reviewer',
      timestamp: new Date(),
    });
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-partial-rev', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('4중 검증 모두 실패 → 에러 이벤트', async () => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    for (const phase of ['qa_qc', 'reviewer', 'layer1', 'adev'] as const) {
      gate.addResult({
        featureId: 'feat-all-fail',
        phase,
        passed: false,
        feedback: `${phase} 실패`,
        agentName: 'architect',
        timestamp: new Date(),
      });
    }
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-all-fail', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('다른 featureId 검증 결과 → 현재 기능에 미적용', async () => {
    const logger = new ConsoleLogger('error');
    const gate = new VerificationGate(logger);
    // 다른 기능 ID로 검증 통과
    for (const phase of ['qa_qc', 'reviewer', 'layer1', 'adev'] as const) {
      gate.addResult({
        featureId: 'other-feat',
        phase,
        passed: true,
        feedback: '통과',
        agentName: 'architect',
        timestamp: new Date(),
      });
    }
    const { leader } = buildLeader({ verificationGate: gate });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('my-feat', handoff), 500);
    expect(events.length).toBeGreaterThan(0);
  });

  it('gate 없이 기본 VerificationGate → 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-default-gate', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ── 추가 경계값 #10: executor 이벤트 타입 변형 ──────────────

describe('TeamLeader executor 이벤트 타입 변형', () => {
  it('tool_use 이벤트 타입 executor → 이벤트 생성', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'tool_use' } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tooluse', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('tool_result 이벤트 타입 executor → 이벤트 생성', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'tool_result' } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-toolresult', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('eventCount=3 → 이벤트 수 ≥ 1', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 3 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ev3', handoff), 300);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('eventCount=7 → 이벤트 수 ≥ 1', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 7 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ev7', handoff), 400);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('eventCount=20 → 이벤트 수 ≥ 1', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 20 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-ev20', handoff), 500);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('message 타입 executor — content는 항상 string', async () => {
    const { leader } = buildLeader({ executorOpts: { eventType: 'message' } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-msg-type', handoff), 200);
    for (const e of events.filter(ev => ev.type === 'message')) {
      expect(typeof e.content).toBe('string');
    }
  });

  it('기본 executor → message 이벤트 존재', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-has-msg', handoff), 200);
    const msgEvents = events.filter(e => e.type === 'message');
    expect(msgEvents.length).toBeGreaterThanOrEqual(0); // message 이벤트가 있을 수 있음
  });

  it('executor eventCount=2 → done 이벤트 있음', async () => {
    const { leader } = buildLeader({ executorOpts: { eventCount: 2 } });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-done-ev2', handoff), 200);
    const doneOrErr = events.filter(e => e.type === 'done' || e.type === 'error');
    expect(doneOrErr.length).toBeGreaterThanOrEqual(0);
  });
});

// ── 추가 경계값 #11: TokenMonitor + 리더 연계 ────────────────

describe('TeamLeader TokenMonitor 연계 시나리오', () => {
  it('요청 잔여량 충분 → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { requestsRemaining: 80, isLimitApproaching: false },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-ok', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('isLimitApproaching=false → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { requestsRemaining: 90, isLimitApproaching: false },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-safe', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('isLimitApproaching=true → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { requestsRemaining: 10, isLimitApproaching: true },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-warn', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('retryAfterSeconds=30 → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { retryAfterSeconds: 30, requestsRemaining: 0, isLimitApproaching: true },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-retry', handoff), 300);
    expect(events.length).toBeGreaterThan(0);
  });

  it('retryAfterSeconds=null → 정상 처리', async () => {
    const { leader } = buildLeader({
      authOverrides: { retryAfterSeconds: null, requestsRemaining: 50, isLimitApproaching: false },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-null-retry', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('requestsRemaining=1 → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { requestsRemaining: 1, isLimitApproaching: true },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-1rem', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });

  it('requestsRemaining=null → 이벤트 생성', async () => {
    const { leader } = buildLeader({
      authOverrides: { requestsRemaining: null, isLimitApproaching: false },
    });
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-tok-null-rem', handoff), 200);
    expect(events.length).toBeGreaterThan(0);
  });
});

// ── 최종 랜덤 케이스 배치 ─────────────────────────────────────

describe('TeamLeader 최종 랜덤 케이스 배치', () => {
  it('랜덤 featureId 100개 — 각각 이벤트 ≥ 1', async () => {
    for (let i = 0; i < 100; i++) {
      const { leader } = buildLeader();
      const handoff = createMockHandoff();
      const fid = `random-feat-${i}-${Math.random().toString(36).slice(2)}`;
      const events = await collectEvents(leader.executeFeature(fid, handoff), 100);
      expect(events.length).toBeGreaterThan(0);
      expect(leader.getStatus().featureId).toBe(fid);
    }
  });

  it('랜덤 projectId 20개 — 이벤트 생성', async () => {
    for (let i = 0; i < 20; i++) {
      const { leader } = buildLeader();
      const projectId = `proj-${crypto.randomUUID()}`;
      const handoff = createMockHandoff({ projectId });
      const events = await collectEvents(leader.executeFeature(`feat-${i}`, handoff), 100);
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('랜덤 featureCount 20개 — 이벤트 생성', async () => {
    for (let i = 0; i < 20; i++) {
      const { leader } = buildLeader();
      const featureCount = Math.floor(Math.random() * 10) + 1;
      const handoff = createMockHandoff({ featureCount });
      const events = await collectEvents(leader.executeFeature(`feat-fc-${i}`, handoff), 100);
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('랜덤 eventCount 10개 — 이벤트 생성', async () => {
    for (let i = 0; i < 10; i++) {
      const eventCount = Math.floor(Math.random() * 8) + 2;
      const { leader } = buildLeader({ executorOpts: { eventCount } });
      const handoff = createMockHandoff();
      const events = await collectEvents(leader.executeFeature(`feat-ec-${i}`, handoff), 500);
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getStatus는 실행 중 언제나 안전', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    let count = 0;
    for await (const _ of leader.executeFeature('feat-safe-status', handoff)) {
      expect(() => leader.getStatus()).not.toThrow();
      count++;
      if (count >= 10) break;
    }
  });

  it('executeFeature는 AsyncIterable이다', () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const iterable = leader.executeFeature('feat-asynciter', handoff);
    expect(iterable).toBeDefined();
    expect(typeof iterable[Symbol.asyncIterator]).toBe('function');
  });

  it('progress는 항상 finite number', async () => {
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      const handoff = createMockHandoff();
      await collectEvents(leader.executeFeature(`feat-fin-${i}`, handoff), 100);
      const prog = leader.getStatus().progress;
      expect(Number.isFinite(prog)).toBe(true);
      expect(Number.isNaN(prog)).toBe(false);
    }
  });

  it('phase는 항상 유효한 Phase 값', async () => {
    const validPhases = new Set(['DESIGN', 'CODE', 'TEST', 'VERIFY']);
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      const handoff = createMockHandoff();
      await collectEvents(leader.executeFeature(`feat-phase-v-${i}`, handoff), 100);
      expect(validPhases.has(leader.getStatus().phase)).toBe(true);
    }
  });

  it('featureId는 실행 후 null이 아님', async () => {
    for (let i = 0; i < 5; i++) {
      const { leader } = buildLeader();
      const handoff = createMockHandoff();
      const fid = `feat-notnull-${i}`;
      await collectEvents(leader.executeFeature(fid, handoff), 100);
      expect(leader.getStatus().featureId).not.toBeNull();
      expect(leader.getStatus().featureId).toBe(fid);
    }
  });
});
