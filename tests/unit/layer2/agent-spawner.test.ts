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
});

// ── 이벤트 타입별 전달 검증 ────────────────────────────────────

describe('AgentSpawner 이벤트 타입 전달', () => {
  it.each(['message', 'tool_use', 'tool_result', 'error', 'done'] as const)(
    '이벤트 타입 %s → 그대로 전달',
    async (eventType) => {
      const mockEvent = makeAgentEvent({ type: eventType });
      const executor = makeSuccessExecutor([mockEvent]);
      const spawner = new AgentSpawner(executor, logger);
      const events: AgentEvent[] = [];
      for await (const event of spawner.spawn(makeAgentConfig())) {
        events.push(event);
      }
      expect(events[0]?.type).toBe(eventType);
    },
  );
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('AgentSpawner 랜덤/경계값', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))(
    '랜덤 이벤트 수 #%i',
    async (count) => {
      const mockEvents = Array.from({ length: count }, (_, j) =>
        makeAgentEvent({ content: `event-${j}` }),
      );
      const executor = makeSuccessExecutor(mockEvents);
      const spawner = new AgentSpawner(executor, logger);
      const received: AgentEvent[] = [];
      for await (const event of spawner.spawn(makeAgentConfig())) {
        received.push(event);
      }
      expect(received.length).toBe(count);
    },
  );
});
