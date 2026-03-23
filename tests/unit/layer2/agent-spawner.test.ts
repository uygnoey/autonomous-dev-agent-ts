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

// ── 에러 이벤트 추출 헬퍼 / Error event extraction helper ──────

/** 이벤트 스트림에서 마지막 에러 이벤트를 찾아 반환한다 */
async function collectErrorEvent(
  stream: AsyncIterable<AgentEvent>,
): Promise<AgentEvent | null> {
  let errorEvent: AgentEvent | null = null;
  for await (const event of stream) {
    if (event.type === 'error') {
      errorEvent = event;
    }
  }
  return errorEvent;
}

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

  it('executor 오류 → 에러 이벤트 yield', async () => {
    const errorExecutor = makeErrorExecutor('Agent execution failed');
    const errorSpawner = new AgentSpawner(errorExecutor, logger);
    const errorEvent = await collectErrorEvent(errorSpawner.spawn(makeAgentConfig()));
    expect(errorEvent).not.toBeNull();
    expect(errorEvent?.content).toContain('Agent execution failed');
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
    const errorEvent = await collectErrorEvent(errorSpawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content).toContain('Agent');
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

  it('세션 재개 오류 → 에러 이벤트 yield', async () => {
    const errorExecutor = makeErrorExecutor('Session resume failed');
    const spawner = new AgentSpawner(errorExecutor, logger);
    const errorEvent = await collectErrorEvent(spawner.resumeSession('invalid-session'));
    expect(errorEvent).not.toBeNull();
    expect(errorEvent?.content).toContain('Session resume failed');
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
    const errorEvent = await collectErrorEvent(errorSpawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content.length).toBeGreaterThan(0);
  });

  it('resume 에러 메시지 전파', async () => {
    const errorSpawner = new AgentSpawner(makeErrorExecutor('resume error msg'), logger);
    const errorEvent = await collectErrorEvent(errorSpawner.resumeSession('s'));
    expect(errorEvent?.content).toContain('resume error msg');
  });

  it('에러 executor에서 spawn → 에러 이벤트 yield', async () => {
    const errorSpawner = new AgentSpawner(makeErrorExecutor('err'), logger);
    const errorEvent = await collectErrorEvent(errorSpawner.spawn(makeAgentConfig()));
    expect(errorEvent).not.toBeNull();
    expect(errorEvent?.type).toBe('error');
  });

  it('5번 에러 spawn → 항상 에러 이벤트 yield', async () => {
    for (let i = 0; i < 5; i++) {
      const errorSpawner = new AgentSpawner(makeErrorExecutor(`err-${i}`), logger);
      const errorEvent = await collectErrorEvent(errorSpawner.spawn(makeAgentConfig()));
      expect(errorEvent).not.toBeNull();
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

  it('error executor spawn → 에러 이벤트의 type은 "error"', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor('test error'), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent?.type).toBe('error');
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

// ── 추가 경계값: 혼합 이벤트 타입 스트림 ───────────────────────

describe('AgentSpawner 혼합 이벤트 타입 스트림', () => {
  it('message→tool_use→tool_result→done 순서 스트림', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ type: 'message', content: 'start' }),
      makeAgentEvent({ type: 'tool_use', content: 'use tool' }),
      makeAgentEvent({ type: 'tool_result', content: 'result' }),
      makeAgentEvent({ type: 'done', content: 'end' }),
    ];
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received.length).toBe(4);
    expect(received[0]?.type).toBe('message');
    expect(received[1]?.type).toBe('tool_use');
    expect(received[2]?.type).toBe('tool_result');
    expect(received[3]?.type).toBe('done');
  });

  it('error 이벤트 포함 스트림 → 계속 진행', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ type: 'message' }),
      makeAgentEvent({ type: 'error', content: 'soft error' }),
      makeAgentEvent({ type: 'done' }),
    ];
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received.length).toBe(3);
    expect(received[1]?.type).toBe('error');
  });

  it('20개 혼합 타입 → 순서 보존', async () => {
    const types: AgentEvent['type'][] = ['message', 'tool_use', 'tool_result', 'done', 'error'];
    const events: AgentEvent[] = Array.from({ length: 20 }, (_, i) =>
      makeAgentEvent({ type: types[i % types.length], content: `content-${i}` }),
    );
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(received[i]?.content).toBe(`content-${i}`);
    }
  });

  it('같은 agentName 다른 content → 각각 올바르게 전달', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ agentName: 'coder', content: 'first' }),
      makeAgentEvent({ agentName: 'coder', content: 'second' }),
      makeAgentEvent({ agentName: 'coder', content: 'third' }),
    ];
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('first');
    expect(received[1]?.content).toBe('second');
    expect(received[2]?.content).toBe('third');
  });

  it('다른 agentName 이벤트 혼합 → 각각 보존', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ agentName: 'architect' }),
      makeAgentEvent({ agentName: 'coder' }),
      makeAgentEvent({ agentName: 'tester' }),
    ];
    const spawner = new AgentSpawner(makeSuccessExecutor(events), logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.agentName).toBe('architect');
    expect(received[1]?.agentName).toBe('coder');
    expect(received[2]?.agentName).toBe('tester');
  });
});

// ── 추가 경계값: AgentConfig 경계값 ──────────────────────────

describe('AgentSpawner AgentConfig 경계값', () => {
  it('name=architect, phase=DESIGN → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'architect', phase: 'DESIGN' }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it('name=tester, phase=TEST → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'tester', phase: 'TEST' }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it('name=reviewer, phase=CODE → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'reviewer', phase: 'CODE' }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it('name=documenter, phase=VERIFY → 정상 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'documenter', phase: 'VERIFY' }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it('featureId 길이 0 → 정상 처리', async () => {
    const executor = makeSuccessExecutor([]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ featureId: '' }))) received.push(e);
    expect(received.length).toBe(0);
  });

  it('featureId 100자 → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ featureId: 'f'.repeat(100) }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it('systemPrompt 길이 0 → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ systemPrompt: '' }))) received.push(e);
    expect(received.length).toBe(1);
  });

  it('prompt 한국어 → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ prompt: '기능을 구현하세요' }))) {
      received.push(e);
    }
    expect(received.length).toBe(1);
  });

  it("tools=['Bash'] 단일 도구 → 정상 처리", async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ tools: ['Bash'] }))) received.push(e);
    expect(received.length).toBe(1);
  });

  it('maxTurns=50 → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: 50 }))) received.push(e);
    expect(received.length).toBe(1);
  });
});

// ── 추가 경계값: resumeSession 다양한 시나리오 ──────────────────

describe('AgentSpawner resumeSession 추가 시나리오', () => {
  it('UUID 형식 세션 ID 재개 → 100개 이벤트', async () => {
    const events = Array.from({ length: 100 }, (_, i) => makeAgentEvent({ content: `e-${i}` }));
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('a1b2c3d4-e5f6-7890-abcd-ef1234567890')) {
      received.push(e);
    }
    expect(received.length).toBe(100);
  });

  it('매우 긴 세션 ID 재개 → 이벤트 정상 수신', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: 'resumed' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess-' + 'x'.repeat(1000))) received.push(e);
    expect(received[0]?.content).toBe('resumed');
  });

  it('빈 세션 ID 재개 → 이벤트 정상 수신', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('')) received.push(e);
    expect(received.length).toBe(1);
  });

  it('이모지 포함 세션 ID → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess-🚀-🎯')) received.push(e);
    expect(received.length).toBe(1);
  });

  it('숫자 세션 ID → 정상 처리', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('1234567890')) received.push(e);
    expect(received.length).toBe(1);
  });

  it('세션 재개 → done 이벤트 마지막', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ type: 'message', content: 'hello' }),
      makeAgentEvent({ type: 'done', content: 'finished' }),
    ];
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess-done')) received.push(e);
    expect(received[received.length - 1]?.type).toBe('done');
  });

  it('세션 재개 오류 → 에러 이벤트 content 존재', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor('resume failed message'), logger);
    const errorEvent = await collectErrorEvent(spawner.resumeSession('bad-session'));
    expect(errorEvent?.content).toBeDefined();
    expect(errorEvent!.content.length).toBeGreaterThan(0);
  });

  it('3번 연속 resumeSession → 각각 독립 결과', async () => {
    const makeExecutorWithContent = (content: string) =>
      makeSuccessExecutor([makeAgentEvent({ content })]);

    for (const content of ['first', 'second', 'third']) {
      const spawner = new AgentSpawner(makeExecutorWithContent(content), logger);
      const received: AgentEvent[] = [];
      for await (const e of spawner.resumeSession(`sess-${content}`)) received.push(e);
      expect(received[0]?.content).toBe(content);
    }
  });
});

// ── 추가 경계값: spawn vs resumeSession 행동 일관성 ─────────────

describe('AgentSpawner spawn/resumeSession 행동 일관성', () => {
  it('spawn과 resumeSession 모두 이벤트 0개 허용', async () => {
    const executor = makeSuccessExecutor([]);
    const spawner = new AgentSpawner(executor, logger);
    const spawnResult: AgentEvent[] = [];
    const resumeResult: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) spawnResult.push(e);
    for await (const e of spawner.resumeSession('sess')) resumeResult.push(e);
    expect(spawnResult.length).toBe(0);
    expect(resumeResult.length).toBe(0);
  });

  it('spawn과 resumeSession 모두 동일한 이벤트 전달', async () => {
    const event = makeAgentEvent({ content: 'same content' });
    const executor = makeSuccessExecutor([event]);
    const spawner = new AgentSpawner(executor, logger);

    const spawnResult: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) spawnResult.push(e);

    const resumeResult: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess')) resumeResult.push(e);

    expect(spawnResult[0]?.content).toBe(event.content);
    expect(resumeResult[0]?.content).toBe(event.content);
  });

  it('spawn 에러 → 에러 이벤트, resumeSession 에러 → 에러 이벤트', async () => {
    const executor = makeErrorExecutor('both fail');
    const spawner = new AgentSpawner(executor, logger);

    const spawnError = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    const resumeError = await collectErrorEvent(spawner.resumeSession('sess'));

    expect(spawnError).not.toBeNull();
    expect(resumeError).not.toBeNull();
  });

  it('10회 spawn → 각각 동일한 이벤트 수', async () => {
    const events = [makeAgentEvent(), makeAgentEvent(), makeAgentEvent()];
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    for (let i = 0; i < 10; i++) {
      const received: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
      expect(received.length).toBe(3);
    }
  });
});

// ── 이벤트 타입 다양성 검증 ──────────────────────────────────

describe('AgentSpawner 이벤트 타입 다양성', () => {
  it('message 타입 이벤트 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ type: 'message' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.type).toBe('message');
  });

  it('done 타입 이벤트 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ type: 'done' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.type).toBe('done');
  });

  it('error 타입 이벤트 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ type: 'error' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.type).toBe('error');
  });

  it('message→done 순서 이벤트 → 순서 보존', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ type: 'message', content: 'a' }),
      makeAgentEvent({ type: 'done', content: 'b' }),
    ];
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.type).toBe('message');
    expect(received[1]?.type).toBe('done');
  });

  it('error→message→done 순서 → 순서 보존', async () => {
    const events: AgentEvent[] = [
      makeAgentEvent({ type: 'error', content: 'err' }),
      makeAgentEvent({ type: 'message', content: 'msg' }),
      makeAgentEvent({ type: 'done', content: 'done' }),
    ];
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(3);
    expect(received[0]?.type).toBe('error');
    expect(received[1]?.type).toBe('message');
    expect(received[2]?.type).toBe('done');
  });

  it('이벤트 content가 undefined → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: undefined })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('이벤트 content가 빈 문자열 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: '' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('');
  });

  it('이벤트 content가 JSON 문자열 → 수신됨', async () => {
    const json = JSON.stringify({ key: 'value', num: 42 });
    const executor = makeSuccessExecutor([makeAgentEvent({ content: json })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(json);
  });

  it('이벤트 content가 멀티라인 → 수신됨', async () => {
    const multiline = 'line1\nline2\nline3';
    const executor = makeSuccessExecutor([makeAgentEvent({ content: multiline })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(multiline);
  });

  it('이벤트 content가 유니코드 → 수신됨', async () => {
    const unicode = '안녕하세요 世界 🌍';
    const executor = makeSuccessExecutor([makeAgentEvent({ content: unicode })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(unicode);
  });

  it('이벤트 content가 특수문자 → 수신됨', async () => {
    const special = '<script>alert("xss")</script>';
    const executor = makeSuccessExecutor([makeAgentEvent({ content: special })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe(special);
  });

  it('20개 혼합 타입 이벤트 → 모두 수신', async () => {
    const types: Array<AgentEvent['type']> = ['message', 'done', 'error'];
    const events: AgentEvent[] = Array.from({ length: 20 }, (_, i) =>
      makeAgentEvent({ type: types[i % 3] as AgentEvent['type'], content: `event-${i}` }),
    );
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(20);
  });
});

// ── AgentConfig 필드 경계값 상세 ────────────────────────────

describe('AgentSpawner AgentConfig 필드 경계값', () => {
  it('maxTurns = 0 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: 0 }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('maxTurns = 1 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: 1 }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('maxTurns = Number.MAX_SAFE_INTEGER → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ maxTurns: Number.MAX_SAFE_INTEGER }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('tools = [] → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ tools: [] }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('tools = 50개 도구 → 정상 실행', async () => {
    const tools = Array.from({ length: 50 }, (_, i) => `Tool${i}`);
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ tools }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('systemPrompt 빈 문자열 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ systemPrompt: '' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('prompt 빈 문자열 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ prompt: '' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('prompt = 10000자 → 정상 실행', async () => {
    const prompt = 'x'.repeat(10000);
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ prompt }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('name = architect → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'architect' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('name = tester → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'tester' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('name = reviewer → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ name: 'reviewer' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('phase = DESIGN → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ phase: 'DESIGN' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('phase = TEST → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ phase: 'TEST' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('phase = VERIFY → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ phase: 'VERIFY' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('projectId = UUID 형식 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }))) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('featureId = 긴 문자열 → 정상 실행', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig({ featureId: 'f'.repeat(200) }))) received.push(e);
    expect(received).toHaveLength(1);
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('AgentSpawner 복합 시나리오', () => {
  it('spawn 실행 후 resumeSession 실행 → 모두 이벤트 수신', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: 'ok' })]);
    const spawner = new AgentSpawner(executor, logger);

    const spawnEvents: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) spawnEvents.push(e);

    const resumeEvents: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('sess-1')) resumeEvents.push(e);

    expect(spawnEvents).toHaveLength(1);
    expect(resumeEvents).toHaveLength(1);
  });

  it('서로 다른 에이전트 이름으로 순차 spawn → 각각 성공', async () => {
    const names = ['coder', 'tester', 'reviewer', 'architect', 'qa', 'qc', 'documenter'] as const;
    for (const name of names) {
      const executor = makeSuccessExecutor([makeAgentEvent({ content: name })]);
      const spawner = new AgentSpawner(executor, logger);
      const received: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig({ name }))) received.push(e);
      expect(received[0]?.content).toBe(name);
    }
  });

  it('모든 phase로 spawn → 각각 성공', async () => {
    const phases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'] as const;
    for (const phase of phases) {
      const executor = makeSuccessExecutor([makeAgentEvent({ content: phase })]);
      const spawner = new AgentSpawner(executor, logger);
      const received: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig({ phase }))) received.push(e);
      expect(received[0]?.content).toBe(phase);
    }
  });

  it('이벤트 100개 → 모두 순서대로 수신', async () => {
    const events: AgentEvent[] = Array.from({ length: 100 }, (_, i) =>
      makeAgentEvent({ content: `event-${i}` }),
    );
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(100);
    for (let i = 0; i < 100; i++) {
      expect(received[i]?.content).toBe(`event-${i}`);
    }
  });

  it('에러 executor로 spawn → 에러 이벤트 yield', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor('test error'), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent).not.toBeNull();
    expect(errorEvent?.type).toBe('error');
  });

  it('에러 executor로 resumeSession → 에러 이벤트 yield', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor('resume error'), logger);
    const errorEvent = await collectErrorEvent(spawner.resumeSession('bad'));
    expect(errorEvent).not.toBeNull();
    expect(errorEvent?.type).toBe('error');
  });

  it('spawn과 resumeSession 교대로 5회 → 모두 성공', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: 'ok' })]);
    const spawner = new AgentSpawner(executor, logger);
    for (let i = 0; i < 5; i++) {
      const s: AgentEvent[] = [];
      const r: AgentEvent[] = [];
      for await (const e of spawner.spawn(makeAgentConfig())) s.push(e);
      for await (const e of spawner.resumeSession(`sess-${i}`)) r.push(e);
      expect(s).toHaveLength(1);
      expect(r).toHaveLength(1);
    }
  });

  it('서로 다른 에러 메시지 → 각각 독립 에러 이벤트', async () => {
    const messages = ['err1', 'err2', 'err3', 'err4', 'err5'];
    for (const msg of messages) {
      const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
      const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
      expect(errorEvent?.content).toBe(msg);
    }
  });

  it('이벤트가 1개만 있을 때 done 이벤트 → 배열 마지막 요소', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ type: 'done', content: 'finished' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[received.length - 1]?.type).toBe('done');
  });

  it('content가 숫자 문자열인 이벤트 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: '12345' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('12345');
  });

  it('content가 boolean 문자열인 이벤트 → 수신됨', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: 'true' })]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received[0]?.content).toBe('true');
  });
});

// ── spawn 신뢰성 추가 검증 ────────────────────────────────────

describe('AgentSpawner spawn 신뢰성 추가', () => {
  it('spawn 후 두 번째 spawn → 여전히 동작', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent({ content: 'first' })]);
    const spawner = new AgentSpawner(executor, logger);
    const first: AgentEvent[] = [];
    const second: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) first.push(e);
    for await (const e of spawner.spawn(makeAgentConfig())) second.push(e);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('빈 이벤트 목록 → 배열 길이 0', async () => {
    const executor = makeSuccessExecutor([]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(0);
  });

  it('이벤트 1개만 → 배열 길이 1', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('이벤트 2개 → 배열 길이 2', async () => {
    const executor = makeSuccessExecutor([makeAgentEvent(), makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(2);
  });

  it('이벤트 50개 → 배열 길이 50', async () => {
    const events = Array.from({ length: 50 }, () => makeAgentEvent());
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(50);
  });

  it('이벤트 content 배열로 수집 → 순서 일치', async () => {
    const contents = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const events = contents.map((c) => makeAgentEvent({ content: c }));
    const executor = makeSuccessExecutor(events);
    const spawner = new AgentSpawner(executor, logger);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received.map((e) => e.content)).toEqual(contents);
  });

  it('새 인스턴스마다 독립적인 executor → 각각 다른 이벤트', async () => {
    const spawn1 = new AgentSpawner(makeSuccessExecutor([makeAgentEvent({ content: 'A' })]), logger);
    const spawn2 = new AgentSpawner(makeSuccessExecutor([makeAgentEvent({ content: 'B' })]), logger);
    const r1: AgentEvent[] = [];
    const r2: AgentEvent[] = [];
    for await (const e of spawn1.spawn(makeAgentConfig())) r1.push(e);
    for await (const e of spawn2.spawn(makeAgentConfig())) r2.push(e);
    expect(r1[0]?.content).toBe('A');
    expect(r2[0]?.content).toBe('B');
  });

  it('AgentSpawner 인스턴스가 AgentSpawner 타입', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    expect(spawner).toBeInstanceOf(AgentSpawner);
  });

  it('AgentSpawner spawn 메서드 존재', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    expect(typeof spawner.spawn).toBe('function');
  });

  it('AgentSpawner resumeSession 메서드 존재', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    expect(typeof spawner.resumeSession).toBe('function');
  });

  it('spawn 결과 Symbol.asyncIterator 존재', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const result = spawner.spawn(makeAgentConfig());
    expect(typeof (result as AsyncIterable<AgentEvent>)[Symbol.asyncIterator]).toBe('function');
  });

  it('resumeSession 결과 Symbol.asyncIterator 존재', () => {
    const spawner = new AgentSpawner(makeSuccessExecutor([]), logger);
    const result = spawner.resumeSession('sess');
    expect(typeof (result as AsyncIterable<AgentEvent>)[Symbol.asyncIterator]).toBe('function');
  });
});

// ── 에러 메시지 형식 검증 ─────────────────────────────────────

describe('AgentSpawner 에러 메시지 형식', () => {
  it('에러 메시지 = 빈 문자열 → 에러 이벤트 yield', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor(''), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent).not.toBeNull();
  });

  it('에러 메시지 = 특수문자 → 그대로 전파', async () => {
    const msg = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content).toBe(msg);
  });

  it('에러 메시지 = 한국어 → 그대로 전파', async () => {
    const msg = '에이전트 실행 실패: 타임아웃 발생';
    const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content).toBe(msg);
  });

  it('에러 메시지 = JSON → 그대로 전파', async () => {
    const msg = '{"code": "TIMEOUT", "detail": "exceeded 30s"}';
    const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content).toBe(msg);
  });

  it('에러 메시지 = 매우 긴 문자열 → 전파됨', async () => {
    const msg = 'e'.repeat(5000);
    const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
    const errorEvent = await collectErrorEvent(spawner.spawn(makeAgentConfig()));
    expect(errorEvent?.content.length).toBe(5000);
  });

  it('resume 에러 메시지 = 빈 문자열 → 에러 이벤트 yield', async () => {
    const spawner = new AgentSpawner(makeErrorExecutor(''), logger);
    const errorEvent = await collectErrorEvent(spawner.resumeSession('s'));
    expect(errorEvent).not.toBeNull();
  });

  it('resume 에러 메시지 특수문자 → 그대로', async () => {
    const msg = '§±£€¥₩';
    const spawner = new AgentSpawner(makeErrorExecutor(msg), logger);
    const errorEvent = await collectErrorEvent(spawner.resumeSession('sess'));
    expect(errorEvent?.content).toBe(msg);
  });
});

// ── ConsoleLogger 레벨별 동작 ─────────────────────────────────

describe('AgentSpawner ConsoleLogger 레벨별', () => {
  it('error 레벨 logger → spawn 정상', async () => {
    const lg = new ConsoleLogger('error');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('warn 레벨 logger → spawn 정상', async () => {
    const lg = new ConsoleLogger('warn');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('info 레벨 logger → spawn 정상', async () => {
    const lg = new ConsoleLogger('info');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('debug 레벨 logger → spawn 정상', async () => {
    const lg = new ConsoleLogger('debug');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.spawn(makeAgentConfig())) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('error 레벨 logger → resumeSession 정상', async () => {
    const lg = new ConsoleLogger('error');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('s')) received.push(e);
    expect(received).toHaveLength(1);
  });

  it('info 레벨 logger → resumeSession 정상', async () => {
    const lg = new ConsoleLogger('info');
    const executor = makeSuccessExecutor([makeAgentEvent()]);
    const spawner = new AgentSpawner(executor, lg);
    const received: AgentEvent[] = [];
    for await (const e of spawner.resumeSession('s')) received.push(e);
    expect(received).toHaveLength(1);
  });
});
