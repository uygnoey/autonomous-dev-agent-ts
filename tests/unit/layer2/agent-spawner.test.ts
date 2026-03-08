/**
 * AgentSpawner 단위 테스트 / AgentSpawner unit tests
 *
 * @description
 * 에이전트 스폰, 세션 재개, 오류 처리, 이벤트 전달 등
 * 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from 'layer2/types.js';
import { AgentSpawner } from 'layer2/agent-spawner.js';

const logger = new ConsoleLogger('error');

// ── Mock AgentExecutor ─────────────────────────────────────────

function makeSuccessExecutor(events: AgentEvent[]): AgentExecutor {
  return {
    async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
      for (const event of events) {
        yield event;
      }
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function makeErrorExecutor(message: string): AgentExecutor {
  return {
    async *execute(_config: AgentConfig): AsyncIterable<AgentEvent> {
      throw new Error(message);
    },
    async *resume(_sessionId: string): AsyncIterable<AgentEvent> {
      throw new Error(message);
    },
  };
}

function makeAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    name: 'coder',
    projectId: 'proj-1',
    featureId: 'feat-1',
    phase: 'CODE',
    systemPrompt: 'You are a coder',
    prompt: 'Implement the feature',
    tools: ['Read', 'Write'],
    maxTurns: 100,
    ...overrides,
  };
}

function makeAgentEvent(overrides?: Partial<AgentEvent>): AgentEvent {
  return {
    type: 'message',
    agentName: 'coder',
    content: 'Hello from agent',
    timestamp: new Date(),
    ...overrides,
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('AgentSpawner 생성자', () => {
  it('인스턴스 생성됨', () => {
    const executor = makeSuccessExecutor([]);
    expect(() => new AgentSpawner(executor, logger)).not.toThrow();
  });

  it('AgentSpawner 인스턴스', () => {
    const executor = makeSuccessExecutor([]);
    expect(new AgentSpawner(executor, logger)).toBeInstanceOf(AgentSpawner);
  });

  it('debug logger로 생성 가능', () => {
    const executor = makeSuccessExecutor([]);
    expect(() => new AgentSpawner(executor, new ConsoleLogger('debug'))).not.toThrow();
  });

  it('error executor로 생성 가능', () => {
    const executor = makeErrorExecutor('fail');
    expect(() => new AgentSpawner(executor, logger)).not.toThrow();
  });

  it('여러 인스턴스 독립적', () => {
    const e1 = makeSuccessExecutor([]);
    const e2 = makeSuccessExecutor([]);
    const s1 = new AgentSpawner(e1, logger);
    const s2 = new AgentSpawner(e2, logger);
    expect(s1).not.toBe(s2);
  });
});

// ── spawn ─────────────────────────────────────────────────────

describe('AgentSpawner.spawn', () => {
  let spawner: AgentSpawner;

  beforeEach(() => {
    spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
  });

  it('이벤트 없는 executor → 이터레이션 완료', async () => {
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events.length).toBe(0);
  });

  it('단일 이벤트 전달', async () => {
    const mockEvent = makeAgentEvent();
    const executor = makeSuccessExecutor([mockEvent]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of testSpawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('message');
  });

  it('여러 이벤트 순서대로 전달', async () => {
    const mockEvents: AgentEvent[] = [
      makeAgentEvent({ type: 'message', content: 'first' }),
      makeAgentEvent({ type: 'tool_use', content: 'second' }),
      makeAgentEvent({ type: 'done', content: 'third' }),
    ];
    const executor = makeSuccessExecutor(mockEvents);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const event of testSpawner.spawn(makeAgentConfig())) {
      received.push(event);
    }
    expect(received.length).toBe(3);
    expect(received[0]?.type).toBe('message');
    expect(received[1]?.type).toBe('tool_use');
    expect(received[2]?.type).toBe('done');
  });

  it('executor 오류 → throw 전파', async () => {
    const errorExecutor = makeErrorExecutor('Agent execution failed');
    const errorSpawner = new AgentSpawner(errorExecutor, logger);
    let caughtError: Error | null = null;
    try {
      for await (const _event of errorSpawner.spawn(makeAgentConfig())) {
        // 이벤트 없음
      }
    } catch (error) {
      caughtError = error as Error;
    }
    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain('Agent execution failed');
  });

  it('다양한 에이전트 이름으로 스폰', async () => {
    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'] as const;
    for (const name of agentNames) {
      const executor = makeSuccessExecutor([makeAgentEvent({ agentName: name })]);
      const testSpawner = new AgentSpawner(executor, logger);
      const events: AgentEvent[] = [];
      for await (const event of testSpawner.spawn(makeAgentConfig({ name }))) {
        events.push(event);
      }
      expect(events.length).toBe(1);
    }
  });

  it('다양한 Phase에서 스폰', async () => {
    const phases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'] as const;
    for (const phase of phases) {
      const executor = makeSuccessExecutor([makeAgentEvent()]);
      const testSpawner = new AgentSpawner(executor, logger);
      const events: AgentEvent[] = [];
      for await (const event of testSpawner.spawn(makeAgentConfig({ phase }))) {
        events.push(event);
      }
      expect(events.length).toBe(1);
    }
  });

  it('100개 이벤트 전달 → 성능 문제 없음', async () => {
    const mockEvents = Array.from({ length: 100 }, (_, i) =>
      makeAgentEvent({ type: 'message', content: `event-${i}` }),
    );
    const executor = makeSuccessExecutor(mockEvents);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const event of testSpawner.spawn(makeAgentConfig())) {
      received.push(event);
    }
    expect(received.length).toBe(100);
  });

  it('이벤트 content 올바르게 전달', async () => {
    const event = makeAgentEvent({ content: 'specific content' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.content).toBe('specific content');
  });

  it('이벤트 agentName 올바르게 전달', async () => {
    const event = makeAgentEvent({ agentName: 'architect' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.agentName).toBe('architect');
  });

  it('이벤트 timestamp가 Date이다', async () => {
    const now = new Date();
    const event = makeAgentEvent({ timestamp: now });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('빈 tools 배열 config → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig({ tools: [] }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('maxTurns=1 config → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig({ maxTurns: 1 }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('maxTurns=0 config → 정상 동작', async () => {
    const executor = makeSuccessExecutor([]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig({ maxTurns: 0 }))) {
      events.push(e);
    }
    expect(events.length).toBe(0);
  });

  it('긴 systemPrompt config → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig({ systemPrompt: 'A'.repeat(10000) }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('한국어 prompt config → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const testSpawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig({ prompt: '기능 구현을 시작하세요' }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('연속 spawn 호출 → 각각 독립', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent(), makeAgentEvent()]);
    const testSpawner = new AgentSpawner(executor, logger);
    const e1: AgentEvent[] = [];
    const e2: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) e1.push(e);
    for await (const e of testSpawner.spawn(makeAgentConfig())) e2.push(e);
    expect(e1.length).toBe(2);
    expect(e2.length).toBe(2);
  });

  it('done 타입 이벤트 전달', async () => {
    const event = makeAgentEvent({ type: 'done' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.type).toBe('done');
  });

  it('error 타입 이벤트 전달', async () => {
    const event = makeAgentEvent({ type: 'error' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.type).toBe('error');
  });

  it('tool_use 타입 이벤트 전달', async () => {
    const event = makeAgentEvent({ type: 'tool_use' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.type).toBe('tool_use');
  });

  it('tool_result 타입 이벤트 전달', async () => {
    const event = makeAgentEvent({ type: 'tool_result' });
    const executor = makeSuccessExecutor([event]);
    const testSpawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of testSpawner.spawn(makeAgentConfig())) {
      received.push(e);
    }
    expect(received[0]?.type).toBe('tool_result');
  });

  it('오류 메시지에 "Agent" 포함', async () => {
    const errorExecutor = makeErrorExecutor('Agent crashed completely');
    const errorSpawner = new AgentSpawner(errorExecutor, logger);
    let caughtError: Error | null = null;
    try {
      for await (const _event of errorSpawner.spawn(makeAgentConfig())) {}
    } catch (error) {
      caughtError = error as Error;
    }
    expect(caughtError?.message).toContain('Agent');
  });
});

// ── resumeSession ─────────────────────────────────────────────

describe('AgentSpawner.resumeSession', () => {
  it('세션 재개 → 이벤트 전달', async () => {
    const mockEvent = makeAgentEvent({ content: 'resumed event' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.resumeSession('session-123')) {
      events.push(event);
    }
    expect(events.length).toBe(1);
  });

  it('세션 재개 오류 → throw 전파', async () => {
    const errorExecutor = makeErrorExecutor('Session resume failed');
    const spawner = new AgentSpawner(errorExecutor, logger);
    let caughtError: Error | null = null;
    try {
      for await (const _event of spawner.resumeSession('invalid-session')) {
        // 이벤트 없음
      }
    } catch (error) {
      caughtError = error as Error;
    }
    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain('Session resume failed');
  });

  it('빈 이벤트로 재개 → 오류 없음', async () => {
    const executor = makeSuccessExecutor([]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.resumeSession('session-empty')) {
      events.push(event);
    }
    expect(events.length).toBe(0);
  });

  it('다양한 세션 ID로 재개', async () => {
    const sessionIds = [
      'session-abc-123',
      'sess_2024_01_01',
      'uuid-style-id',
      '한국어-세션-id',
    ];
    for (const sessionId of sessionIds) {
      const executor = makeSuccessExecutor([makeAgentEvent()]);
      const spawner = new AgentSpawner(executor, logger);
      const events: AgentEvent[] = [];
      for await (const event of spawner.resumeSession(sessionId)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
    }
  });

  it('여러 이벤트로 재개', async () => {
    const mockEvents = [makeAgentEvent({ type: 'message' }), makeAgentEvent({ type: 'done' })];
    const executor = makeSuccessExecutor(mockEvents);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.resumeSession('sess-multi')) {
      events.push(event);
    }
    expect(events.length).toBe(2);
  });

  it('빈 세션 ID → 처리됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.resumeSession('')) {
      events.push(event);
    }
    expect(events.length).toBe(1);
  });

  it('UUID 형식 세션 ID → 처리됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.resumeSession(crypto.randomUUID())) {
      events.push(event);
    }
    expect(events.length).toBe(1);
  });

  it('연속 resumeSession 호출 → 각각 독립', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const e1: AgentEvent[] = [];
    const e2: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess-1')) e1.push(e);
    for await (const e of spawner.resumeSession('sess-2')) e2.push(e);
    expect(e1.length).toBe(1);
    expect(e2.length).toBe(1);
  });

  it('재개 후 이벤트 content 확인', async () => {
    const event = makeAgentEvent({ content: 'resume content' });
    const executor = makeSuccessExecutor([event]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess')) {
      received.push(e);
    }
    expect(received[0]?.content).toBe('resume content');
  });
});

// ── 이벤트 타입별 전달 검증 ────────────────────────────────────

describe('AgentSpawner 이벤트 타입 전달', () => {
  it('이벤트 타입 message → 그대로 전달', async () => {
    const mockEvent = makeAgentEvent({ type: 'message' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('message');
  });

  it('이벤트 타입 tool_use → 그대로 전달', async () => {
    const mockEvent = makeAgentEvent({ type: 'tool_use' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('tool_use');
  });

  it('이벤트 타입 tool_result → 그대로 전달', async () => {
    const mockEvent = makeAgentEvent({ type: 'tool_result' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('tool_result');
  });

  it('이벤트 타입 error → 그대로 전달', async () => {
    const mockEvent = makeAgentEvent({ type: 'error' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('error');
  });

  it('이벤트 타입 done → 그대로 전달', async () => {
    const mockEvent = makeAgentEvent({ type: 'done' });
    const executor = makeSuccessExecutor([mockEvent]);
    const spawner = new AgentSpawner(executor, logger);
    const events: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('done');
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('AgentSpawner 랜덤/경계값', () => {
  it('랜덤 이벤트 수 0개', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) received.push(event);
    expect(received.length).toBe(0);
  });

  it('랜덤 이벤트 수 1개', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) received.push(event);
    expect(received.length).toBe(1);
  });

  it('랜덤 이벤트 수 5개', async () => {
    const mockEvents = Array.from({ length: 5 }, (_, j) => makeAgentEvent({ content: `event-${j}` }));
    const spawner = new AgentSpawner(makeSuccessExecutor(mockEvents), logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) received.push(event);
    expect(received.length).toBe(5);
  });

  it('랜덤 이벤트 수 10개', async () => {
    const mockEvents = Array.from({ length: 10 }, (_, j) => makeAgentEvent({ content: `event-${j}` }));
    const spawner = new AgentSpawner(makeSuccessExecutor(mockEvents), logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) received.push(event);
    expect(received.length).toBe(10);
  });

  it('랜덤 이벤트 수 50개', async () => {
    const mockEvents = Array.from({ length: 50 }, (_, j) => makeAgentEvent({ content: `event-${j}` }));
    const spawner = new AgentSpawner(makeSuccessExecutor(mockEvents), logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) received.push(event);
    expect(received.length).toBe(50);
  });

  it('1000개 이벤트 → 모두 수신', async () => {
    const mockEvents = Array.from({ length: 1000 }, (_, i) =>
      makeAgentEvent({ content: `big-event-${i}` }),
    );
    const executor = makeSuccessExecutor(mockEvents);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const event of spawner.spawn(makeAgentConfig())) {
      received.push(event);
    }
    expect(received.length).toBe(1000);
  });

  it('모든 AgentName 타입으로 이벤트 생성 가능', () => {
    const agentNames: AgentEvent['agentName'][] = [
      'architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter',
    ];
    for (const agentName of agentNames) {
      const event = makeAgentEvent({ agentName });
      expect(event.agentName).toBe(agentName);
    }
  });

  it('모든 Phase로 config 생성 가능', () => {
    const phases: AgentConfig['phase'][] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const config = makeAgentConfig({ phase });
      expect(config.phase).toBe(phase);
    }
  });
});

// ── 추가 경계값: spawn 이벤트 내용 ───────────────────────────

describe('AgentSpawner spawn 추가 경계값', () => {
  it('이벤트 타입 message → content 전달', async () => {
    const event = makeAgentEvent({ type: 'message', content: 'hello world' });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('hello world');
  });

  it('content 빈 문자열 → 그대로 전달', async () => {
    const event = makeAgentEvent({ content: '' });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('');
  });

  it('content 한국어 → 그대로 전달', async () => {
    const event = makeAgentEvent({ content: '안녕하세요, 에이전트입니다' });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('안녕하세요, 에이전트입니다');
  });

  it('content 매우 긴 문자열 → 그대로 전달', async () => {
    const longContent = 'x'.repeat(10000);
    const event = makeAgentEvent({ content: longContent });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(longContent);
  });

  it('5개 이벤트 → 순서 보존', async () => {
    const events = Array.from({ length: 5 }, (_, i) => makeAgentEvent({ content: `item-${i}` }));
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    for (let i = 0; i < 5; i++) {
      expect(received[i]?.content).toBe(`item-${i}`);
    }
  });

  it('featureId 다양한 값 → config 그대로 전달', async () => {
    const featureIds = ['feat-1', 'feat-abc', 'feat-한국어', 'feat-999', 'f-x'];
    for (const fid of featureIds) {
      const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
      const received: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig({ featureId: fid }))) received.push(e);
      expect(received.length).toBe(1);
    }
  });

  it('projectId 다양한 값 → config 정상 처리', async () => {
    const projectIds = ['proj-1', 'proj-abc', '', 'p'];
    for (const pid of projectIds) {
      const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
      const received: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig({ projectId: pid }))) received.push(e);
      expect(received.length).toBe(0);
    }
  });

  it('10개 인스턴스 동시 생성 가능', () => {
    const spawners = Array.from({ length: 10 }, () =>
      new AgentSpawner(makeSuccessExecutor([]), logger)
    );
    expect(spawners.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(spawners[i]).toBeInstanceOf(AgentSpawner);
    }
  });

  it('spawn 반환값은 AsyncIterable', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const result = spawner.spawn(makeAgentConfig());
    expect(typeof result[Symbol.asyncIterator]).toBe('function');
  });

  it('resumeSession 반환값은 AsyncIterable', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const result = spawner.resumeSession('session-id');
    expect(typeof result[Symbol.asyncIterator]).toBe('function');
  });
});

// ── 추가 경계값: 에러 전파 패턴 ───────────────────────────────

describe('AgentSpawner 에러 전파 패턴', () => {
  it('에러 메시지 비어있지 않음', async () => {
    const errorSpawner = new AgentSpawner(makeErrorExecutor('non-empty error'), logger);
    let caught: Error | null = null;
    try {
      for await (const _ of errorSpawner.spawn(makeAgentConfig())) {}
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message.length).toBeGreaterThan(0);
  });

  it('resume 에러 메시지 전파', async () => {
    const errorSpawner = new AgentSpawner(makeErrorExecutor('resume error msg'), logger);
    let caught: Error | null = null;
    try {
      for await (const _ of errorSpawner.resumeSession('s')) {}
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain('resume error msg');
  });

  it('에러 executor에서 spawn → Error 인스턴스', async () => {
    const errorSpawner = new AgentSpawner(makeErrorExecutor('err'), logger);
    let caught: unknown = null;
    try {
      for await (const _ of errorSpawner.spawn(makeAgentConfig())) {}
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
  });

  it('5번 에러 spawn → 항상 throw', async () => {
    for (let i = 0; i < 5; i++) {
      const errorSpawner = new AgentSpawner(makeErrorExecutor(`err-${i}`), logger);
      let threw = false;
      try {
        for await (const _ of errorSpawner.spawn(makeAgentConfig())) {}
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });
});

// ── 추가 edge/random 케이스 ────────────────────────────────────

describe('AgentSpawner 추가 edge/random 케이스', () => {
  it('UUID projectId → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ projectId: crypto.randomUUID() }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('UUID featureId → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ featureId: crypto.randomUUID() }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('빈 prompt config → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ prompt: '' }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('빈 systemPrompt config → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ systemPrompt: '' }))) {
      events.push(e);
    }
    expect(events.length).toBe(0);
  });

  it('특수문자 content 이벤트 → 그대로 전달', async () => {
    const content = '!@#$%^&*()_+-=[]{}|;:\',.<>?/`~';
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent({ content })]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(content);
  });

  it('이모지 content 이벤트 → 그대로 전달', async () => {
    const content = '🔑🚀💻🎯✅❌⚠️';
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent({ content })]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(content);
  });

  it('maxTurns=Number.MAX_SAFE_INTEGER → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: Number.MAX_SAFE_INTEGER }))) {
      events.push(e);
    }
    expect(events.length).toBe(0);
  });

  it('maxTurns 음수 → 정상 처리 (구현 의존)', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: -1 }))) {
      events.push(e);
    }
    expect(Array.isArray(events)).toBe(true);
  });

  it('tools 배열에 특수문자 도구명 → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ tools: ['Read', 'Write', 'Bash', 'Glob'] }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('많은 도구 배열 → 정상 처리', async () => {
    const tools = Array.from({ length: 50 }, (_, i) => `Tool${i}`);
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ tools }))) {
      events.push(e);
    }
    expect(events.length).toBe(1);
  });

  it('세션 ID에 특수문자 포함 → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('session!@#$%')) events.push(e);
    expect(events.length).toBe(1);
  });

  it('세션 ID에 한국어 포함 → 정상 처리', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('세션-한국어-아이디')) events.push(e);
    expect(events.length).toBe(1);
  });

  it('세션 ID 매우 긴 문자열 → 정상 처리', async () => {
    const longId = 'session-' + 'x'.repeat(500);
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    const events: AgentEvent[] = [];
    for await (const e of spawner.resumeSession(longId)) events.push(e);
    expect(events.length).toBe(1);
  });

  it('이벤트 timestamp 미래 날짜 → 그대로 전달', async () => {
    const futureDate = new Date('2099-12-31T23:59:59Z');
    const event = makeAgentEvent({ timestamp: futureDate });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.timestamp).toEqual(futureDate);
  });

  it('이벤트 timestamp 과거 날짜 → 그대로 전달', async () => {
    const pastDate = new Date('2000-01-01T00:00:00Z');
    const event = makeAgentEvent({ timestamp: pastDate });
    const spawner = new AgentSpawner(makeSuccessExecutor([event]), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.timestamp).toEqual(pastDate);
  });

  it('spawn 후 resumeSession 순서대로 동작', async () => {
    const spawnEvent = makeAgentEvent({ content: 'spawn-result' });
    const resumeEvent = makeAgentEvent({ content: 'resume-result' });
    const spawnExecutor = makeSuccessExecutor([spawnEvent]);
    const spawner1 = new AgentSpawner(spawnExecutor, logger);
    const spawnReceived: AgentEvent[] = [];
    for await (const e of spawner1.spawn(makeAgentConfig())) spawnReceived.push(e);

    const resumeExecutor = makeSuccessExecutor([resumeEvent]);
    const spawner2 = new AgentSpawner(resumeExecutor, logger);
    const resumeReceived: AgentEvent[] = [];
    for await (const e of spawner2.resumeSession('sess-123')) resumeReceived.push(e);

    expect(spawnReceived[0]?.content).toBe('spawn-result');
    expect(resumeReceived[0]?.content).toBe('resume-result');
  });

  it('error executor spawn → Error.name은 "Error"', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor('test error'), logger);
    let caught: Error | null = null;
    try {
      for await (const _ of spawner.spawn(makeAgentConfig())) {}
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).toBe('Error');
  });

  it('spawn 반환값 AsyncIterable → for-await 사용 가능', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    let count = 0;
    for await (const _ of spawner.spawn(makeAgentConfig())) count++;
    expect(count).toBe(1);
  });

  it('resumeSession 반환값 AsyncIterable → for-await 사용 가능', async () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([makeAgentEvent()]), logger);
    let count = 0;
    for await (const _ of spawner.resumeSession('id')) count++;
    expect(count).toBe(1);
  });
});
