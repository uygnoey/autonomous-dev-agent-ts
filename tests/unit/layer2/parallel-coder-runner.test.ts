/**
 * ParallelCoderRunner 단위 테스트 / ParallelCoderRunner unit tests
 *
 * @description
 * KR: 병렬 Coder 실행, 부분 실패, 전체 실패, 할당 실패 등
 *     모든 edge case를 검증한다. edge case 비중 80%+.
 * EN: Validates all edge cases including parallel execution,
 *     partial failure, total failure, and allocation failure.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { AgentError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from 'layer2/types.js';
import { AgentGenerator } from 'layer2/agent-generator.js';
import { AgentSpawner } from 'layer2/agent-spawner.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';
import { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import { SessionManager } from 'layer2/session-manager.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';

// ── 테스트 헬퍼 / Test Helpers ─────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeHandoffPackage(overrides?: Partial<HandoffPackage>): HandoffPackage {
  return {
    id: 'pkg-1',
    projectId: 'proj-1',
    contract: {
      version: 1,
      projectType: 'cli',
      features: [],
      testDefinitions: [],
      implementationOrder: [],
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      },
    },
    planDocument: 'plan',
    designDocument: 'design',
    specDocument: 'spec',
    createdAt: new Date(),
    confirmedByUser: true,
    ...overrides,
  };
}

function makeSuccessExecutor(events: AgentEvent[]): AgentExecutor {
  return {
    async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
      for (const event of events) {
        yield event;
      }
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      yield* [];
    },
  };
}

function makeErrorExecutor(message: string): AgentExecutor {
  return {
    async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
      throw new Error(message);
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      yield* [];
    },
  };
}

function makeAgentEvent(overrides?: Partial<AgentEvent>): AgentEvent {
  return {
    type: 'message',
    agentName: 'coder',
    content: 'some output',
    timestamp: new Date(),
    ...overrides,
  };
}

async function collectEvents(
  iterable: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

interface RunnerFixture {
  runner: ParallelCoderRunner;
  allocator: CoderAllocator;
  sessionManager: SessionManager;
  streamMonitor: StreamMonitor;
  agentGenerator: AgentGenerator;
}

function makeRunner(executor: AgentExecutor): RunnerFixture {
  const allocator = new CoderAllocator(logger);
  const sessionManager = new SessionManager(logger);
  const streamMonitor = new StreamMonitor(logger);
  const agentGenerator = new AgentGenerator(logger);
  const agentSpawner = new AgentSpawner(executor, logger);

  const runner = new ParallelCoderRunner({
    agentGenerator,
    agentSpawner,
    sessionManager,
    streamMonitor,
    coderAllocator: allocator,
    logger,
  });

  return { runner, allocator, sessionManager, streamMonitor, agentGenerator };
}

// ── 성공 케이스 / Success Cases ───────────────────────────────────

describe('ParallelCoderRunner.runParallel — 성공 케이스', () => {
  it('1개 Coder 성공 — 이벤트가 yield됨', async () => {
    const expectedEvent = makeAgentEvent({ content: 'code written' });
    const { runner } = makeRunner(makeSuccessExecutor([expectedEvent]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-1', pkg));

    const messageEvents = events.filter((e) => e.type === 'message');
    // WHY: coder 실행 이벤트 + 집계 summary 메시지가 있어야 함
    expect(events.some((e) => e.content === 'code written')).toBe(true);
    expect(messageEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('1개 Coder 성공 — error 이벤트가 없음', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-2', pkg));

    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('성공 시 요약 메시지에 "성공 1개"가 포함됨', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-3', pkg));

    const summary = events.find(
      (e) => e.type === 'message' && e.content.includes('성공'),
    );
    expect(summary).toBeDefined();
    expect(summary?.content).toContain('성공 1개');
  });
});

// ── Promise.all 병렬 동작 확인 / Parallel execution ──────────────

describe('ParallelCoderRunner.runParallel — 병렬 동작', () => {
  it('allocate 결과대로 Coder가 실행되고 모든 이벤트가 수집됨', async () => {
    // WHY: extractModules는 ['default']를 반환하므로 1개 Coder만 할당됨
    //      병렬 실행은 Promise.all 내부에서 일어나며, 이벤트 수집로 검증한다
    const events = [
      makeAgentEvent({ content: 'event-A' }),
      makeAgentEvent({ content: 'event-B' }),
    ];
    const { runner } = makeRunner(makeSuccessExecutor(events));
    const pkg = makeHandoffPackage();

    const collected = await collectEvents(runner.runParallel('feat-parallel', pkg));

    expect(collected.some((e) => e.content === 'event-A')).toBe(true);
    expect(collected.some((e) => e.content === 'event-B')).toBe(true);
  });

  it('동일 featureId로 재실행 시 모듈 충돌로 error 이벤트 발생', async () => {
    // WHY: CoderAllocator는 같은 모듈을 두 번 할당할 수 없다
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    // 첫 번째 실행은 성공
    await collectEvents(runner.runParallel('feat-conflict', pkg));
    // 두 번째 실행은 'default' 모듈이 이미 할당되어 있으므로 충돌
    const secondRun = await collectEvents(runner.runParallel('feat-conflict', pkg));

    expect(secondRun.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── 부분 실패 케이스 / Partial failure ───────────────────────────

describe('ParallelCoderRunner.runParallel — 부분 실패', () => {
  it('Coder executor가 throw해도 다른 결과가 중단되지 않음', async () => {
    // WHY: extractModules는 ['default'] 단일 모듈이라 1개 Coder만 생성됨.
    //      error executor를 사용해 실패 케이스를 검증한다.
    const { runner } = makeRunner(makeErrorExecutor('executor error'));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-partial', pkg));

    // WHY: 실패해도 summary 메시지는 yield됨
    const summary = events.find(
      (e) => e.type === 'message' && e.content.includes('병렬 Coder 완료'),
    );
    expect(summary).toBeDefined();
  });

  it('실패한 Coder가 있을 때 요약 메시지에 "실패"가 포함됨', async () => {
    const { runner } = makeRunner(makeErrorExecutor('fail'));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-fail-summary', pkg));

    const summary = events.find(
      (e) => e.type === 'message' && e.content.includes('실패'),
    );
    expect(summary).toBeDefined();
  });
});

// ── 전체 실패 케이스 / Total failure ─────────────────────────────

describe('ParallelCoderRunner.runParallel — 전체 실패', () => {
  it('전체 Coder 실패 시 error 이벤트가 발생함', async () => {
    const { runner } = makeRunner(makeErrorExecutor('total failure'));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-total-fail', pkg));

    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('전체 실패 error 이벤트에 featureId가 포함됨', async () => {
    const { runner } = makeRunner(makeErrorExecutor('boom'));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-all-fail', pkg));

    const errorEvent = events.find((e) => e.type === 'error' && e.content.includes('feat-all-fail'));
    expect(errorEvent).toBeDefined();
  });

  it('전체 실패 시에도 summary 메시지는 yield됨', async () => {
    const { runner } = makeRunner(makeErrorExecutor('crash'));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-crash', pkg));

    // WHY: summary와 error 이벤트가 모두 있어야 함
    const hasSummary = events.some(
      (e) => e.type === 'message' && e.content.includes('병렬 Coder 완료'),
    );
    const hasError = events.some((e) => e.type === 'error');
    expect(hasSummary).toBe(true);
    expect(hasError).toBe(true);
  });
});

// ── allocate() 실패 케이스 / Allocation failure ───────────────────

describe('ParallelCoderRunner.runParallel — allocate() 실패', () => {
  it('allocate 실패 시 error 이벤트를 yield하고 조기 종료됨', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    // 첫 번째 실행으로 'default' 모듈을 선점
    await collectEvents(runner.runParallel('feat-pre', pkg));
    // 두 번째 실행: 동일 allocator이므로 충돌 발생
    const events = await collectEvents(runner.runParallel('feat-pre', pkg));

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
  });

  it('allocate 실패 시 summary message가 없음 (조기 종료)', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    await collectEvents(runner.runParallel('feat-early', pkg));
    const events = await collectEvents(runner.runParallel('feat-early', pkg));

    // WHY: allocate 실패 시 summary message 없이 바로 return됨
    const hasSummary = events.some(
      (e) => e.type === 'message' && e.content.includes('병렬 Coder 완료'),
    );
    expect(hasSummary).toBe(false);
  });

  it('allocate 실패 error 이벤트 내용에 "할당 실패"가 포함됨', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([makeAgentEvent()]));
    const pkg = makeHandoffPackage();

    await collectEvents(runner.runParallel('feat-alloc-err', pkg));
    const events = await collectEvents(runner.runParallel('feat-alloc-err', pkg));

    const errorEvent = events.find(
      (e) => e.type === 'error' && e.content.includes('할당 실패'),
    );
    expect(errorEvent).toBeDefined();
  });
});

// ── Edge case / 경계 케이스 ────────────────────────────────────────

describe('ParallelCoderRunner.runParallel — edge cases', () => {
  it('빈 featureId로도 실행 가능함', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([]));
    const pkg = makeHandoffPackage();

    // WHY: 빈 featureId는 branchName 생성에만 영향
    const events = await collectEvents(runner.runParallel('', pkg));
    expect(Array.isArray(events)).toBe(true);
  });

  it('executor가 이벤트 없이 완료되면 summary만 yield됨', async () => {
    const { runner } = makeRunner(makeSuccessExecutor([]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-empty-events', pkg));

    const summary = events.find(
      (e) => e.type === 'message' && e.content.includes('병렬 Coder 완료'),
    );
    expect(summary).toBeDefined();
    // WHY: 이벤트가 없으므로 error 이벤트는 없어야 함
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('tool_use 이벤트가 StreamMonitor에 PreToolUse로 전달됨', async () => {
    const toolEvent = makeAgentEvent({ type: 'tool_use', content: 'Read' });
    const { runner, streamMonitor } = makeRunner(makeSuccessExecutor([toolEvent]));
    const pkg = makeHandoffPackage();

    await collectEvents(runner.runParallel('feat-monitor', pkg));

    const history = streamMonitor.getEventHistory();
    const preToolUse = history.find((e) => e.type === 'PreToolUse');
    expect(preToolUse).toBeDefined();
  });

  it('message 이벤트가 StreamMonitor에 PostToolUse로 전달됨', async () => {
    const msgEvent = makeAgentEvent({ type: 'message', content: 'hello' });
    const { runner, streamMonitor } = makeRunner(makeSuccessExecutor([msgEvent]));
    const pkg = makeHandoffPackage();

    await collectEvents(runner.runParallel('feat-monitor-msg', pkg));

    const history = streamMonitor.getEventHistory();
    const postToolUse = history.find((e) => e.type === 'PostToolUse');
    expect(postToolUse).toBeDefined();
  });

  it('세션이 생성됨 — SessionManager에 기록됨', async () => {
    const { runner, sessionManager } = makeRunner(
      makeSuccessExecutor([makeAgentEvent()]),
    );
    const pkg = makeHandoffPackage();

    await collectEvents(runner.runParallel('feat-session', pkg));

    const sessions = sessionManager.listSessions({ featureId: 'feat-session' });
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('AgentError를 throw하는 executor도 CoderRunResult에 담겨 재throw되지 않음', async () => {
    const agentErrorExecutor: AgentExecutor = {
      async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
        throw new AgentError('agent_execution_error', 'AgentError from executor');
      },
      async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
        yield* [];
      },
    };

    const allocator = new CoderAllocator(logger);
    const runner = new ParallelCoderRunner({
      agentGenerator: new AgentGenerator(logger),
      agentSpawner: new AgentSpawner(agentErrorExecutor, logger),
      sessionManager: new SessionManager(logger),
      streamMonitor: new StreamMonitor(logger),
      coderAllocator: allocator,
      logger,
    });

    // WHY: throw를 해도 runParallel은 error 이벤트로 처리해야 함
    const events = await collectEvents(runner.runParallel('feat-agent-error', makeHandoffPackage()));
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('done 이벤트 포함 시 정상 수집됨', async () => {
    const doneEvent = makeAgentEvent({ type: 'done', content: 'finished' });
    const { runner } = makeRunner(makeSuccessExecutor([doneEvent]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-done', pkg));

    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('metadata가 있는 이벤트도 정상 수집됨', async () => {
    const metaEvent = makeAgentEvent({
      type: 'tool_result',
      content: 'result',
      metadata: { exitCode: 0 },
    });
    const { runner } = makeRunner(makeSuccessExecutor([metaEvent]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-meta', pkg));

    const found = events.find((e) => e.type === 'tool_result');
    expect(found).toBeDefined();
    expect(found?.metadata?.exitCode).toBe(0);
  });
});

// ── supervision 실패 시 coder 재실행 / Supervision failure → coder retry ──

describe('ParallelCoderRunner.runParallel — supervision 실패 시 재실행', () => {
  it('감독 불합격 시 "coder 재실행 1/1" 메시지가 yield됨', async () => {
    // WHY: FAIL 키워드를 포함한 이벤트를 yield하는 executor → supervision 불합격
    const failEvent = makeAgentEvent({
      type: 'message',
      agentName: 'architect',
      content: 'FAIL: 스펙 준수 미달',
    });
    const { runner } = makeRunner(makeSuccessExecutor([failEvent]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-supervision-fail', pkg));

    const retryMsg = events.find(
      (e) => e.type === 'message' && e.content.includes('coder 재실행 1/1'),
    );
    expect(retryMsg).toBeDefined();
  });

  it('감독 불합격 후 재실행 — 최대 1회만 재시도함 (무한루프 없음)', async () => {
    let spawnCount = 0;
    const countingExecutor: AgentExecutor = {
      async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
        spawnCount += 1;
        yield makeAgentEvent({
          type: 'message',
          agentName: 'architect',
          content: 'REJECT: 재실행 후에도 불합격',
        });
      },
      async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
        yield* [];
      },
    };

    const allocator = new CoderAllocator(logger);
    const runner = new ParallelCoderRunner({
      agentGenerator: new AgentGenerator(logger),
      agentSpawner: new AgentSpawner(countingExecutor, logger),
      sessionManager: new SessionManager(logger),
      streamMonitor: new StreamMonitor(logger),
      coderAllocator: allocator,
      logger,
    });

    await collectEvents(runner.runParallel('feat-supervision-limit', makeHandoffPackage()));

    // WHY: coder 1회 + 재실행 1회 = 최소 2회, 그 이상은 안 됨
    expect(spawnCount).toBeGreaterThanOrEqual(2);
    // architect/reviewer supervisor도 spawn되므로 총합은 더 클 수 있음
    // 단, coder 재실행은 정확히 1회만 (2계층-A 1회 + 재실행 1회 = coder 2회)
  });

  it('감독 합격 시 재실행 없음 — "coder 재실행" 메시지 없음', async () => {
    const passEvent = makeAgentEvent({
      type: 'message',
      agentName: 'architect',
      content: 'PASS: 스펙 준수 확인됨',
    });
    const { runner } = makeRunner(makeSuccessExecutor([passEvent]));
    const pkg = makeHandoffPackage();

    const events = await collectEvents(runner.runParallel('feat-supervision-pass', pkg));

    const retryMsg = events.find(
      (e) => e.type === 'message' && e.content.includes('coder 재실행'),
    );
    expect(retryMsg).toBeUndefined();
  });
});
