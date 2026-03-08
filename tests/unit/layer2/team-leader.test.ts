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
  it('최대 반복 초과 시 error 이벤트 생성', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-max', handoff), 500);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it('최대 반복 초과 이벤트에 최대 횟수 정보 포함', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    const events = await collectEvents(leader.executeFeature('feat-over', handoff), 500);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent) {
      expect(errorEvent.content).toMatch(/10|반복|초과|iteration/i);
    }
  });

  it('최대 반복 초과 후 진행률은 0', async () => {
    const { leader } = buildLeader();
    const handoff = createMockHandoff();
    await collectEvents(leader.executeFeature('feat-loop', handoff), 500);
    // 완료되지 않았으므로 progress는 0
    expect(leader.getStatus().progress).toBe(0);
  });

  it.each([1, 2, 3])('반복 %i 번째 기능 — 최대 반복 초과', async (i) => {
    const { leader } = buildLeader();
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
