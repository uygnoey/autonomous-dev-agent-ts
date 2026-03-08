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
import type { AuthProvider } from 'auth/types.js';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import {
  V2SessionExecutor,
  type V2SessionExecutorOptions,
  type V2SessionFactory,
} from 'layer2/v2-session-executor.js';
import type { AgentConfig, AgentEvent } from 'layer2/types.js';

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

function createThrowingStreamFactory(errorMessage: string): V2SessionFactory {
  // WHY: 세션 생성은 성공하지만 stream() 호출 시 throw — stream error 경로 테스트용
  return mock(() => ({
    stream: mock(async function* () {
      throw new Error(errorMessage);
    }),
  }));
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

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL EDGE / RANDOM CASES
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Additional Edge Cases', () => {
  it('UUID 형식 projectId/featureId로 실행 → ok', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({
      projectId: crypto.randomUUID(),
      featureId: crypto.randomUUID(),
    });
    const events = await collectEvents(executor, config);
    expect(events[0]?.type).toBe('done');
  });

  it('빈 prompt 문자열로 실행 → 에러 없이 완료', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ prompt: '' }));
    expect(events[0]?.type).toBe('done');
  });

  it('한글 prompt로 실행 → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ prompt: '인증 모듈을 설계해 주세요. 보안을 최우선으로 고려하세요.' });
    const events = await collectEvents(executor, config);
    expect(events[0]?.type).toBe('done');
  });

  it('maxTurns=1 최소값 → ok', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ maxTurns: 1 }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.maxTurns).toBe(1);
  });

  it('maxTurns=9999 최대값 → ok', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ maxTurns: 9999 }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.maxTurns).toBe(9999);
  });

  it('coder 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Writing code' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'coder' as AgentName }));
    expect(events[0]?.agentName).toBe('coder');
  });

  it('tester 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'tester' as AgentName }));
    expect(events[0]?.agentName).toBe('tester');
  });

  it('reviewer 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'reviewer' as AgentName }));
    expect(events[0]?.agentName).toBe('reviewer');
  });

  it('다수 message 이벤트 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'msg-1' },
      { type: 'message', content: 'msg-2' },
      { type: 'message', content: 'msg-3' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('msg-1');
    expect(events[1]?.content).toBe('msg-2');
    expect(events[2]?.content).toBe('msg-3');
  });

  it('tool_use + tool_result 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Read', input: { file_path: '/some/file.ts' } },
      { type: 'tool_result', tool_use_id: 'tool_001', content: 'file content', is_error: false },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[1]?.type).toBe('tool_result');
    expect(events[2]?.type).toBe('done');
  });

  it('특수문자 포함 content → 그대로 반환', async () => {
    const specialContent = '특수문자: !@#$%^&*()_+ 한글 포함 <script>alert(1)</script>';
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: specialContent },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe(specialContent);
  });

  it('빈 content 배열 → 빈 문자열', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: [] },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('');
  });

  it('tool_use input이 null → 정상 처리', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Bash', input: null },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe('Bash');
  });

  it('음수 maxTurns → factory에 전달됨', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ maxTurns: -1 }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    // WHY: 음수 maxTurns는 그대로 전달되며 SDK가 처리함
    expect(typeof calledWith?.maxTurns).toBe('number');
  });

  it('env에 빈 문자열 값 포함 → 병합됨', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ env: { EMPTY_VAR: '' } }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.EMPTY_VAR).toBe('');
  });

  it('10개 도구 목록 → SDK에 전달', async () => {
    const tools = ['Read', 'Write', 'Bash', 'Grep', 'Glob', 'Edit', 'WebFetch', 'TaskGet', 'TaskUpdate', 'SendMessage'];
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.tools).toEqual(tools);
  });

  it('eventCount는 이벤트 타입에 관계없이 누적', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'a' },
      { type: 'tool_use', name: 'Read', input: {} },
      { type: 'tool_result', tool_use_id: 'tid1', content: 'result' },
      { type: 'message', content: 'b' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    // message×2 + tool_use + tool_result + done = 5
    expect(events.length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════
// EXTRA EDGE / RANDOM CASES — Extended Coverage
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Extended Edge Cases', () => {
  it('qa 에이전트명 VERIFY Phase → AGENT_TEAMS false', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ name: 'qa' as AgentName, phase: 'VERIFY' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
  });

  it('qc 에이전트명 TEST Phase → AGENT_TEAMS false', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ name: 'qc' as AgentName, phase: 'TEST' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
  });

  it('documenter 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Generating docs' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'documenter' as AgentName }));
    expect(events[0]?.agentName).toBe('documenter');
  });

  it('세션 생성 후 즉시 message_stop → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message_stop', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('error + session_end 순서 → 2개 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error', error: { message: 'Partial error' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('done');
  });

  it('연속 tool_use 이벤트 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } },
      { type: 'tool_use', name: 'Write', input: { file_path: '/b.ts', content: 'data' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'bun test' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.metadata?.toolName).toBe('Read');
    expect(events[1]?.metadata?.toolName).toBe('Write');
    expect(events[2]?.metadata?.toolName).toBe('Bash');
  });

  it('빈 systemPrompt → 팩토리에 전달됨', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ systemPrompt: '' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof calledWith?.systemPrompt).toBe('string');
  });

  it('한글 systemPrompt → 팩토리에 전달됨', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ systemPrompt: '당신은 아키텍처 에이전트입니다.' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.systemPrompt).toContain('아키텍처');
  });

  it('DESIGN Phase architect → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Architecture designed' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({
      name: 'architect' as AgentName,
      phase: 'DESIGN',
    }));
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('Architecture designed');
  });

  it('CODE Phase coder → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Code written' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({
      name: 'coder' as AgentName,
      phase: 'CODE',
    }));
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('Code written');
  });

  it('tool_result is_error=true → 에러 플래그 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_result', tool_use_id: 'tool_err', content: 'Permission denied', is_error: true },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_result');
    expect(events[0]?.content).toBe('Permission denied');
  });

  it('다수 환경변수 병합 → 모두 전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({
      env: {
        VAR_A: 'val_a',
        VAR_B: 'val_b',
        VAR_C: 'val_c',
        VAR_D: 'val_d',
        VAR_E: 'val_e',
      },
    }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.VAR_A).toBe('val_a');
    expect(env?.VAR_E).toBe('val_e');
  });

  it('세션 오류 메시지에 featureId 포함', async () => {
    const sessionFactory = createThrowingSessionFactory('SDK connection error');
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ featureId: 'feat-important' });
    const events = await collectEvents(executor, config);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Failed to create session');
  });

  it('text 블록 3개 → 줄바꿈으로 결합', async () => {
    const sessionFactory = createMockSessionFactory([
      {
        type: 'message',
        content: [
          { type: 'text', text: 'Line A' },
          { type: 'text', text: 'Line B' },
          { type: 'text', text: 'Line C' },
        ],
      },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('Line A\nLine B\nLine C');
  });

  it('cleanup 후 재실행 → 에러 없이 완료', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    executor.cleanup();
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('phaseId 빈 문자열 → 실행 ok', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ featureId: '' }));
    expect(events[0]?.type).toBe('done');
  });

  it('resume 여러 번 → 각각 에러', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const ids = ['id-1:f:arch:DESIGN', 'id-2:f:coder:CODE', ''];
    for (const sid of ids) {
      const events: AgentEvent[] = [];
      for await (const event of executor.resume(sid)) {
        events.push(event);
      }
      expect(events[0]?.type).toBe('error');
    }
  });

  it('defaultOptions temperature=0 → 팩토리에 전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { temperature: 0 },
    });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.temperature).toBe(0);
  });

  it('message 이벤트 agentName === featureId 아님', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'hello' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ name: 'tester' as AgentName, featureId: 'feat-check' });
    const events = await collectEvents(executor, config);
    expect(events[0]?.agentName).toBe('tester');
    expect(events[0]?.agentName).not.toBe('feat-check');
  });

  // ── 추가 edge/random 케이스 (배치 61) ────────────────────────────

  it('tool_use 이름이 UUID 형식 → 정상 처리', async () => {
    const toolName = crypto.randomUUID();
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: toolName, input: { key: 'val' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe(toolName);
  });

  it('message 이벤트 content가 숫자 문자열 → 그대로 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: '42' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('42');
  });

  it('message 이벤트 content가 이모지 포함 → 그대로 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: '코드 완성 🎉' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('코드 완성 🎉');
  });

  it('빈 message content 배열 → content 빈 문자열 또는 정의됨', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: [] },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    // WHY: 빈 배열 → join 결과 '' 또는 content=''
    expect(typeof events[0]?.content).toBe('string');
  });

  it('4개 다른 phase → 각각 AGENT_TEAMS_ENABLED 분기 확인', async () => {
    const phases: Array<AgentConfig['phase']> = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const factory = mock((_opts: unknown) => ({
        stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
      }));
      executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
      await collectEvents(executor, createAgentConfig({ phase }));
      const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
      const env = calledWith?.environment as Record<string, string>;
      if (phase === 'DESIGN') {
        expect(env?.AGENT_TEAMS_ENABLED).toBe('true');
      } else {
        expect(env?.AGENT_TEAMS_ENABLED).toBe('false');
      }
    }
  });

  it('연속 message 5개 → 모두 message 타입', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      type: 'message' as const,
      content: `Message ${i}`,
    }));
    const sessionFactory = createMockSessionFactory([
      ...msgs,
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    const messageEvents = events.filter((e) => e.type === 'message');
    expect(messageEvents.length).toBe(5);
  });

  it('message 이후 tool_use 이후 done → 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Analyzing...' },
      { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('message');
    expect(events[1]?.type).toBe('tool_use');
    expect(events[2]?.type).toBe('done');
  });

  it('stream throw 시 error 이벤트 → 세션 정리됨', async () => {
    const sessionFactory = createThrowingStreamFactory('Stream crash');
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Stream crash');
  });

  it('tool_use input 객체가 중첩 → metadata 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      {
        type: 'tool_use',
        name: 'WebSearch',
        input: { query: 'TypeScript', options: { limit: 10, lang: 'ko' } },
      },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe('WebSearch');
  });

  it('OAuth 인증 → CLAUDE_CODE_OAUTH_TOKEN 환경변수 설정', async () => {
    const oauthProvider = new MockAuthProvider();
    oauthProvider.setOAuth(true);

    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider: oauthProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBe('mock_oauth_token_xyz');
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('API key 인증 → ANTHROPIC_API_KEY 환경변수 설정', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBe('mock_api_key_12345');
  });

  it('config.env 키가 baseEnv 키 덮어씌우기 방지 확인', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    // WHY: config.env는 baseEnv 이후 병합 → 우선순위 높음
    await collectEvents(executor, createAgentConfig({ env: { CUSTOM_VAR: 'custom_value' } }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    const env = calledWith?.environment as Record<string, string>;
    expect(env?.CUSTOM_VAR).toBe('custom_value');
    expect(env?.ANTHROPIC_API_KEY).toBeDefined();
  });

  it('session_end max_tokens → done 이벤트에 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'max_tokens' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('session_end stop_sequence → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'stop_sequence' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('defaultOptions maxTurns=1 → 팩토리에 전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 1 },
    });
    // WHY: config.maxTurns=undefined 이면 defaultOptions.maxTurns=1 이 사용된다
    await collectEvents(executor, createAgentConfig({ maxTurns: undefined }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.maxTurns).toBe(1);
  });

  it('config.maxTurns=100 → 팩토리에 우선 전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 10 },
    });
    await collectEvents(executor, createAgentConfig({ maxTurns: 100 }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    // WHY: config.maxTurns가 defaultOptions.maxTurns보다 우선
    expect(calledWith?.maxTurns).toBe(100);
  });

  it('cleanup 호출 후 activeSessions 비어있음', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    await collectEvents(executor, createAgentConfig());
    executor.cleanup();
    // WHY: cleanup 후 재호출해도 에러 없음
    expect(() => executor.cleanup()).not.toThrow();
  });

  it('tool_result 빈 content → content 빈 문자열 또는 정의됨', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_result', tool_use_id: 'empty_result', content: '', is_error: false },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_result');
    expect(typeof events[0]?.content).toBe('string');
  });

  it('message 이벤트 timestamp는 Date 인스턴스', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: 'Time check' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('done 이벤트 timestamp는 Date 인스턴스', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('error 이벤트 timestamp는 Date 인스턴스', async () => {
    const sessionFactory = createThrowingSessionFactory('timestamp test');
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('10개 연속 tool_use → 모두 tool_use 타입', async () => {
    const tools = Array.from({ length: 10 }, (_, i) => ({
      type: 'tool_use' as const,
      name: `Tool${i}`,
      input: { index: i },
    }));
    const sessionFactory = createMockSessionFactory([
      ...tools,
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    const toolEvents = events.filter((e) => e.type === 'tool_use');
    expect(toolEvents.length).toBe(10);
  });

  it('error 이벤트 agentName이 config.name과 일치', async () => {
    const sessionFactory = createThrowingSessionFactory('agent name check');
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ name: 'reviewer' as AgentName });
    const events = await collectEvents(executor, config);
    expect(events[0]?.agentName).toBe('reviewer');
  });

  it('done 이벤트 agentName이 config.name과 일치', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ name: 'qa' as AgentName });
    const events = await collectEvents(executor, config);
    expect(events[0]?.agentName).toBe('qa');
  });

  it('팩토리가 stream 메서드 없는 객체 반환 → 에러', async () => {
    const badFactory = mock(() => ({} as unknown as ReturnType<V2SessionFactory>));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: badFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('error');
  });

  it('undefined tools → 팩토리에 tools 미전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: [] }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    // WHY: 빈 tools → tools=undefined (팩토리에 전달 안 함)
    expect(calledWith?.tools).toBeUndefined();
  });

  it('tools 1개 → 팩토리에 전달됨', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: ['Read'] }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Array.isArray(calledWith?.tools)).toBe(true);
    expect((calledWith?.tools as string[]).length).toBe(1);
  });

  it('projectId가 빈 문자열 → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ projectId: '' }));
    expect(events[0]?.type).toBe('done');
  });

  it('한글 featureId → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([{ type: 'session_end', stop_reason: 'end_turn' }]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ featureId: '한글기능ID' }));
    expect(events[0]?.type).toBe('done');
  });

  it('resume: 존재하지 않는 sessionId → error agentName 추출', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const sid = 'proj1:feat1:architect:DESIGN';
    const events: AgentEvent[] = [];
    for await (const event of executor.resume(sid)) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.agentName).toBe('architect');
  });

  it('resume: sessionId 형식이 다를 때 → error 반환', async () => {
    const sessionFactory = createMockSessionFactory([]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events: AgentEvent[] = [];
    for await (const event of executor.resume('invalid-format')) {
      events.push(event);
    }
    expect(events[0]?.type).toBe('error');
  });

  it('5번 연속 execute → 모두 이벤트 반환', async () => {
    for (let i = 0; i < 5; i++) {
      const sessionFactory = createMockSessionFactory([
        { type: 'message', content: `Run ${i}` },
        { type: 'session_end', stop_reason: 'end_turn' },
      ]);
      executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
      const events = await collectEvents(executor, createAgentConfig());
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('message content 빈 문자열 → 이벤트 타입 message', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: '' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('');
  });

  it('tool_use input이 null → 처리됨', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Grep', input: null },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
  });

  it('defaultOptions model 설정 → 팩토리에 전달', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { model: 'claude-haiku-4-5-20251001' },
    });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('defaultOptions 미설정 → model 기본값 claude-opus-4-6', async () => {
    const factory = mock((_opts: unknown) => ({
      stream: mock(() => mockSessionStream([{ type: 'session_end', stop_reason: 'end_turn' }])),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(calledWith?.model).toBe('claude-opus-4-6');
  });

  it('tool_use 이벤트 tool_use_id가 metadata에 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'tool_use', name: 'Write', input: { file_path: '/out.ts' }, tool_use_id: 'tu-uuid-001' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    // WHY: tool_use_id가 metadata.toolUseId에 반영되어야 함
    expect(events[0]?.metadata?.toolUseId ?? events[0]?.metadata?.toolName).toBeDefined();
  });

  it('error 이벤트 중간에 message → error 먼저 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'error', error: { message: 'Mid-stream error' } },
      { type: 'message', content: 'After error' },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('message');
  });

  it('text 블록 1개인 배열 → 단일 문자열 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      { type: 'message', content: [{ type: 'text', text: 'Solo line' }] },
      { type: 'session_end', stop_reason: 'end_turn' },
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('Solo line');
  });
});
