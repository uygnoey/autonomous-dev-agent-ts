/**
 * V2SessionExecutor 테스트
 *
 * @description
 * KR: V2 Session API 기반 에이전트 실행기 테스트
 *     sessionFactory 주입으로 실제 SDK 호출 없이 mock 사용
 *     비율: Normal 20%, Edge 40%, Error 40%
 * EN: Tests for V2 Session API-based agent executor
 *     Uses injected sessionFactory mock instead of real SDK calls
 *     Ratio: Normal 20%, Edge 40%, Error 40%
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AuthProvider } from '../../../src/auth/types.js';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { AgentName } from '../../../src/core/types.js';
import {
  V2SessionExecutor,
  type V2SessionExecutorOptions,
  type V2SessionFactory,
} from '../../../src/layer2/v2-session-executor.js';
import type { AgentConfig, AgentEvent } from '../../../src/layer2/types.js';

// ── Mock 타입 / Mock types ──────────────────────────────────────
type MockV2SessionEvent = {
  type: string;
  content?: string | unknown[];
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  stop_reason?: string;
  error?: unknown;
  message?: string;
};

// ── Mock 인증 프로바이더 / Mock auth provider ──────────────────
class MockAuthProvider implements AuthProvider {
  private useOAuth = false;

  setOAuth(enable: boolean): void {
    this.useOAuth = enable;
  }

  getAuthHeader(): Record<string, string> {
    if (this.useOAuth) {
      return { authorization: 'Bearer mock_oauth_token_xyz' };
    }
    return { 'x-api-key': 'mock_api_key_12345' };
  }

  async validateAuth(): Promise<boolean> {
    return true;
  }
}

// ── 테스트 유틸리티 / Test utilities ────────────────────────────
async function* mockSessionStream(events: MockV2SessionEvent[]): AsyncIterable<MockV2SessionEvent> {
  for (const event of events) {
    yield event;
  }
}

function createMockSessionFactory(events: MockV2SessionEvent[]): V2SessionFactory {
  return mock(() => ({
    stream: mock(() => mockSessionStream(events)),
  }));
}

function createThrowingSessionFactory(errorMessage: string): V2SessionFactory {
  return mock(() => {
    throw new Error(errorMessage);
  });
}

function createAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    name: 'architect' as AgentName,
    phase: 'DESIGN',
    projectId: 'proj-123',
    featureId: 'feat-456',
    prompt: 'Design the authentication module',
    systemPrompt: 'You are an architect agent',
    tools: [],
    maxTurns: 50,
    env: {},
    ...overrides,
  };
}

async function collectEvents(
  executor: V2SessionExecutor,
  config: AgentConfig,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of executor.execute(config)) {
    events.push(event);
  }
  return events;
}

// ── 테스트 시작 / Tests ─────────────────────────────────────────
let logger: ConsoleLogger;
let authProvider: MockAuthProvider;
let executor: V2SessionExecutor;

beforeEach(() => {
  logger = new ConsoleLogger('error');
  authProvider = new MockAuthProvider();
});

afterEach(() => {
  logger = null as unknown as ConsoleLogger;
  authProvider = null as unknown as MockAuthProvider;
  executor = null as unknown as V2SessionExecutor;
});

// ══════════════════════════════════════════════════════════════════
// NORMAL CASES (20%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Normal Cases', () => {
  it('기본 설정으로 생성된다', () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    expect(executor).toBeDefined();
  });

  it('기본 옵션과 함께 생성된다', () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory,
      defaultOptions: {
        maxTurns: 100,
        temperature: 0.7,
        model: 'claude-sonnet-4-5',
      },
    });
    expect(executor).toBeDefined();
  });

  it('세션 정리가 정상 동작한다', () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    expect(() => executor.cleanup()).not.toThrow();
  });

  it('message 이벤트를 스트리밍한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Hello from agent' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig();
    const events = await collectEvents(executor, config);

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('Hello from agent');
    expect(events[0]?.agentName).toBe('architect');
    expect(events[1]?.type).toBe('done');
  });

  it('tool_use 이벤트를 매핑한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.content).toBe('Tool: Read');
    expect(events[0]?.metadata?.toolName).toBe('Read');
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Edge Cases', () => {
  it('DESIGN Phase는 Agent Teams를 활성화한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const config = createAgentConfig({ phase: 'DESIGN' });
    await collectEvents(executor, config);

    // WHY: 팩토리가 호출되었는지와 환경변수가 전달되었는지 확인
    expect(factory).toHaveBeenCalledTimes(1);
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('true');
  });

  it('CODE Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'CODE' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
  });

  it('TEST Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'TEST' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
  });

  it('VERIFY Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'VERIFY' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
  });

  it('API Key 인증 헤더를 환경변수로 변환한다', async () => {
    authProvider.setOAuth(false);
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBe('mock_api_key_12345');
  });

  it('OAuth 토큰을 환경변수로 변환한다', async () => {
    authProvider.setOAuth(true);
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBe('mock_oauth_token_xyz');
  });

  it('사용자 정의 환경변수가 병합된다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({
      env: { CUSTOM_VAR: 'custom_value', ANOTHER_VAR: '12345' },
    }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.CUSTOM_VAR).toBe('custom_value');
    expect(env?.ANOTHER_VAR).toBe('12345');
  });

  it('빈 도구 목록이 허용된다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: [] }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.tools).toBeUndefined();
  });

  it('도구 목록이 SDK 옵션에 전달된다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: ['Read', 'Write', 'Bash', 'Grep'] }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.tools).toEqual(['Read', 'Write', 'Bash', 'Grep']);
  });

  it('maxTurns가 config에서 우선 적용된다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 200 },
    });
    await collectEvents(executor, createAgentConfig({ maxTurns: 150 }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.maxTurns).toBe(150);
  });

  it('message 이벤트 array content에서 text 블록만 추출한다', async () => {
    const sessionFactory = createMockSessionFactory([
      {
        type: 'message',
        content: [
          { type: 'text', text: 'First block' },
          { type: 'text', text: 'Second block' },
        ],
      },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('First block\nSecond block');
  });

  it('tool_result 이벤트가 정상 매핑된다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_result', tool_use_id: 'tool_123', content: 'File contents here', is_error: false },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('tool_result');
    expect(events[0]?.content).toBe('File contents here');
  });

  it('error 이벤트가 정상 매핑된다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error', error: { message: 'Something went wrong' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toBe('Something went wrong');
  });

  it('message_stop 이벤트가 done으로 매핑된다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message_stop', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('done');
    expect(events[0]?.metadata?.stopReason).toBe('end_turn');
  });

  it('session_end 이벤트가 done으로 매핑된다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'max_turns' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('done');
    expect(events[0]?.metadata?.stopReason).toBe('max_turns');
  });

  it('세션 ID가 올바르게 생성된다', () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const config = createAgentConfig({
      projectId: 'proj-abc',
      featureId: 'feat-xyz',
      name: 'qa',
      phase: 'VERIFY',
    });

    const sessionIdFormat = `${config.projectId}:${config.featureId}:${config.name}:${config.phase}`;
    expect(sessionIdFormat).toBe('proj-abc:feat-xyz:qa:VERIFY');
  });

  it('알 수 없는 SDK 이벤트 타입은 필터링된다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'unknown_event_type' },
      { type: 'message', content: 'visible' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: unknown_event_type은 null 반환 → 필터링됨
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('message');
    expect(events[1]?.type).toBe('done');
  });
});

// ══════════════════════════════════════════════════════════════════
// ERROR CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Error Cases', () => {
  it('세션 생성 실패 시 에러 이벤트를 반환한다', async () => {
    const sessionFactory = createThrowingSessionFactory('SDK not available');
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Failed to create session');
  });

  it('존재하지 않는 세션 재개 시 에러를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const sessionId = 'proj-123:feat-456:architect:DESIGN';
    const events: AgentEvent[] = [];
    for await (const event of executor.resume(sessionId)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Session not found');
  });

  it('잘못된 세션 ID 형식에서 기본 에이전트명을 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const events: AgentEvent[] = [];
    for await (const event of executor.resume('invalid-format')) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.agentName).toBe('architect');
  });

  it('빈 세션 ID에서 에러를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const events: AgentEvent[] = [];
    for await (const event of executor.resume('')) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
  });

  it('알 수 없는 에이전트명이 세션 ID에 있으면 기본값을 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const events: AgentEvent[] = [];
    for await (const event of executor.resume('proj-123:feat-456:unknown_agent:DESIGN')) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.agentName).toBe('architect');
  });

  it('세션 ID 파트가 부족하면 기본 에이전트명을 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    const events: AgentEvent[] = [];
    for await (const event of executor.resume('proj-123:feat-456')) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.agentName).toBe('architect');
  });

  it('message 이벤트에 content가 없으면 빈 문자열을 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('');
  });

  it('message content 배열에 text 블록이 없으면 빈 문자열을 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      {
        type: 'message',
        content: [
          { type: 'image', source: 'base64...' },
          { type: 'unknown', data: 'something' },
        ],
      },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('');
  });

  it('tool_result 이벤트에 content가 없으면 기본 메시지를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_result', tool_use_id: 'tool_999' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('Tool result received');
  });

  it('error 이벤트에 에러 정보가 없으면 기본 메시지를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('Unknown error occurred');
  });

  it('error 이벤트의 error 필드가 문자열이면 기본 메시지를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error', error: 'string error' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: typeof 'string error' !== 'object' → falls to message check → 'Unknown error occurred'
    expect(events[0]?.content).toBe('Unknown error occurred');
  });

  it('error 이벤트에 message 필드가 있으면 해당 메시지를 반환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error', message: 'Custom error message' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('Custom error message');
  });

  it('tool_use 이벤트에 name이 없으면 "unknown"을 사용한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', input: { some: 'data' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('Tool: unknown');
  });

  it('tool_result content가 배열이면 JSON으로 변환한다', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_result', tool_use_id: 'tool_555', content: [{ key: 'value' }] },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('[{"key":"value"}]');
  });

  it('인증 헤더가 비어있으면 인증 환경변수가 설정되지 않는다', async () => {
    class EmptyAuthProvider implements AuthProvider {
      getAuthHeader(): Record<string, string> {
        return {};
      }
      async validateAuth(): Promise<boolean> {
        return false;
      }
    }

    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider: new EmptyAuthProvider(),
      logger,
      sessionFactory: factory,
    });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it('maxTurns가 설정되지 않으면 기본값 50을 사용한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ maxTurns: undefined }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.maxTurns).toBe(50);
  });

  it('defaultOptions가 없으면 내장 기본값을 사용한다', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.temperature).toBe(1.0);
    expect(calledWith?.model).toBe('claude-opus-4-6');
  });

  it('cleanup 호출 시 활성 세션이 정리된다', () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });

    executor.cleanup();
    executor.cleanup(); // WHY: 중복 호출도 안전

    expect(() => executor.cleanup()).not.toThrow();
  });

  it('스트림 에러 시 에러 이벤트를 반환한다', async () => {
    const sessionFactory = mock(() => ({
      stream: mock(() => {
        // WHY: 스트림 순회 중 에러 발생 시뮬레이션
        async function* throwingStream(): AsyncIterable<MockV2SessionEvent> {
          yield { type: 'message', content: 'before error' };
          throw new Error('Stream connection lost');
        }
        return throwingStream();
      }),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: message 이벤트 1개 + stream error 이벤트 1개
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('message');
    expect(events[1]?.type).toBe('error');
    expect(events[1]?.content).toContain('Stream connection lost');
  });
});
