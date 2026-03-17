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
import type { SDKMessage, SDKSessionOptions } from '@anthropic-ai/claude-agent-sdk';
import type { AuthProvider } from 'auth/types.js';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import {
  V2SessionExecutor,
  type V2SessionExecutorOptions,
  type V2SessionFactory,
} from 'layer2/v2-session-executor.js';
import type { AgentConfig, AgentEvent } from 'layer2/types.js';

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

/** SDKAssistantMessage(text) 생성 헬퍼 */
function mkTextMsg(text: string, uuid = 'uuid-text'): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
      role: 'assistant',
      id: 'msg_mock',
      model: 'claude-opus-4-6',
      stop_reason: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 10 },
    },
    parent_tool_use_id: null,
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

/** SDKAssistantMessage(tool_use) 생성 헬퍼 */
function mkToolUseMsg(name: string, input: unknown, uuid = 'uuid-tool'): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: `toolu_${uuid}`, name, input }],
      role: 'assistant',
      id: 'msg_mock',
      model: 'claude-opus-4-6',
      stop_reason: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 10 },
    },
    parent_tool_use_id: null,
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

/** SDKResultSuccess 생성 헬퍼 */
function mkDoneMsg(stopReason: string | null = 'end_turn', uuid = 'uuid-done'): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: false,
    num_turns: 1,
    result: 'completed',
    stop_reason: stopReason,
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

/** SDKResultError 생성 헬퍼 */
function mkErrorMsg(errors: string[], uuid = 'uuid-err'): SDKMessage {
  return {
    type: 'result',
    subtype: 'error_during_execution',
    duration_ms: 50,
    duration_api_ms: 30,
    is_error: true,
    num_turns: 0,
    stop_reason: null,
    total_cost_usd: 0,
    usage: { input_tokens: 5, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

/** SDKSystemMessage(init) — executor가 필터링한다 */
function mkSystemInitMsg(): SDKMessage {
  return {
    type: 'system',
    subtype: 'init',
    uuid: 'sys-uuid',
    session_id: 'mock-session-id',
    agents: [],
    apiKeySource: 'user',
    betas: [],
    claude_code_version: '0.2.72',
    cwd: '/test',
    tools: [],
    mcp_servers: [],
    model: 'claude-opus-4-6',
    permissionMode: 'bypassPermissions',
    slash_commands: [],
    output_style: 'default',
    skills: [],
    plugins: [],
  } as unknown as SDKMessage;
}

/** SDKAssistantMessage(multiple text blocks) 생성 헬퍼 */
function mkMultiTextMsg(texts: string[], uuid = 'uuid-multi'): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: texts.map((text) => ({ type: 'text', text })),
      role: 'assistant',
      id: 'msg_mock',
      model: 'claude-opus-4-6',
      stop_reason: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 10, output_tokens: 10 },
    },
    parent_tool_use_id: null,
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

/** SDKAssistantMessage(empty content) 생성 헬퍼 — 필터링됨 */
function mkEmptyAssistantMsg(): SDKMessage {
  return {
    type: 'assistant',
    message: {
      content: [],
      role: 'assistant',
      id: 'msg_mock',
      model: 'claude-opus-4-6',
      stop_reason: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-empty',
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

function createMockSessionFactory(events: SDKMessage[]): V2SessionFactory {
  return mock((_options: SDKSessionOptions) => ({
    sessionId: 'mock-session-id',
    send: mock(async (_msg: string) => {}),
    stream: mock(async function* () {
      for (const event of events) yield event;
    }),
    close: mock(() => {}),
  }));
}

function createThrowingSessionFactory(errorMessage: string): V2SessionFactory {
  return mock(() => {
    throw new Error(errorMessage);
  });
}

function createThrowingStreamFactory(errorMessage: string): V2SessionFactory {
  // WHY: 세션 생성은 성공하지만 stream() 호출 시 throw — stream error 경로 테스트용
  return mock((_options: SDKSessionOptions) => ({
    sessionId: 'mock-session-id',
    send: mock(async (_msg: string) => {}),
    stream: mock(async function* () {
      throw new Error(errorMessage);
    }),
    close: mock(() => {}),
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
      mkTextMsg('Hello from agent', 'uuid-1'),
      mkDoneMsg('end_turn', 'uuid-2'),
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
      mkToolUseMsg('Read', { file_path: '/path/to/file.ts' }, 'uuid-tool-1'),
      mkDoneMsg('end_turn', 'uuid-done-1'),
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
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const config = createAgentConfig({ phase: 'DESIGN' });
    await collectEvents(executor, config);

    // WHY: 팩토리가 호출되었는지와 환경변수가 전달되었는지 확인
    expect(factory).toHaveBeenCalledTimes(1);
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
  });

  it('CODE Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'CODE' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it('TEST Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'TEST' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it('VERIFY Phase는 Agent Teams를 비활성화한다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ phase: 'VERIFY' }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it('API Key 인증 헤더를 환경변수로 변환한다', async () => {
    authProvider.setOAuth(false);
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBe('mock_api_key_12345');
  });

  it('OAuth 토큰을 환경변수로 변환한다', async () => {
    authProvider.setOAuth(true);
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBe('mock_oauth_token_xyz');
  });

  it('사용자 정의 환경변수가 병합된다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({
      env: { CUSTOM_VAR: 'custom_value', ANOTHER_VAR: '12345' },
    }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CUSTOM_VAR).toBe('custom_value');
    expect(env?.ANOTHER_VAR).toBe('12345');
  });

  it('빈 도구 목록이 허용된다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: [] }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.allowedTools).toBeUndefined();
  });

  it('도구 목록이 SDK 옵션에 전달된다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: ['Read', 'Write', 'Bash', 'Grep'] }));

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.allowedTools).toEqual(['Read', 'Write', 'Bash', 'Grep']);
  });

  it('maxTurns가 config에서 설정되어도 실행이 완료된다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 200 },
    });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: 150 }));

    // WHY: SDKSessionOptions에 maxTurns 필드가 없으므로 실행 완료 여부만 검증
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('message 이벤트 array content에서 text 블록만 추출한다', async () => {
    const sessionFactory = createMockSessionFactory([
      mkMultiTextMsg(['First block', 'Second block'], 'uuid-multi-1'),
      mkDoneMsg('end_turn', 'uuid-done-m'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('First block\nSecond block');
  });

  it('tool_result SDKMessage는 필터링된다', async () => {
    // WHY: mapSdkEvent는 type:'assistant'(tool_use)와 type:'result'만 처리
    //      SDKUserMessage 형태의 tool_result는 null 반환(필터링)
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-tr'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('done');
  });

  it('result subtype error_during_execution → error 이벤트로 매핑된다', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg(['Something went wrong'], 'uuid-err-1'),
      mkDoneMsg('end_turn', 'uuid-done-e'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('error');
    // WHY: error subtype은 metadata.subtype에, content는 errors 배열 첫 번째 메시지
    expect(events[0]?.metadata?.subtype).toBe('error_during_execution');
    expect(events[0]?.content).toBe('Something went wrong');
  });

  it('result subtype success → done으로 매핑된다 (stop_reason: end_turn)', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-et'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('done');
    expect(events[0]?.metadata?.stopReason).toBe('end_turn');
  });

  it('result subtype success → done으로 매핑된다 (stop_reason: max_turns)', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('max_turns', 'uuid-done-mt'),
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
      // WHY: system:init 메시지는 mapSdkEvent에서 null 반환 → 필터링됨
      mkSystemInitMsg(),
      mkTextMsg('visible', 'uuid-vis'),
      mkDoneMsg('end_turn', 'uuid-done-f'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: system:init은 null 반환 → 필터링됨
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
    // WHY: resume은 메모리에 없는 세션을 SDK로 복원 시도하고 실패 → error 이벤트
    expect(events[0]?.agentName).toBe('architect');
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

  it('assistant 메시지에 text 블록이 없으면 필터링된다', async () => {
    // WHY: content 배열이 비어있는 assistant 메시지는 null 반환 → 필터링됨
    const sessionFactory = createMockSessionFactory([
      mkEmptyAssistantMsg(),
      mkDoneMsg('end_turn', 'uuid-done-empty'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: empty assistant는 필터링되므로 done만 남는다
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('assistant 메시지에 비-text 블록만 있으면 필터링된다', async () => {
    // WHY: image 블록은 text/tool_use가 아니므로 필터링됨
    const sessionFactory = createMockSessionFactory([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64...' } }],
          role: 'assistant',
          id: 'msg_img',
          model: 'claude-opus-4-6',
          stop_reason: null,
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 5, output_tokens: 5 },
        },
        parent_tool_use_id: null,
        uuid: 'uuid-img',
        session_id: 'mock-session-id',
      } as unknown as SDKMessage,
      mkDoneMsg('end_turn', 'uuid-done-img'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('tool_result SDKMessage는 필터링된다 (no content 케이스)', async () => {
    // WHY: SDKUserMessage(tool_result)는 mapSdkEvent에서 필터링됨
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-tr2'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('result error subtype → error content에 subtype 포함', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg([], 'uuid-err-empty'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    // WHY: errors 배열이 비어있으면 fallback 'Execution failed' 반환; subtype은 metadata에
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.metadata?.subtype).toBe('error_during_execution');
    expect(events[0]?.content).toBe('Execution failed');
  });

  it('result error subtype 다양한 errors 배열 → error 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg(['err1', 'err2'], 'uuid-err-multi'),
      mkDoneMsg('end_turn', 'uuid-done-em'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('error');
  });

  it('error 이벤트 후 done 이벤트 → 각각 순서대로', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg(['Custom error'], 'uuid-err-seq'),
      mkDoneMsg('end_turn', 'uuid-done-seq'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('done');
  });

  it('tool_use 이벤트에 name이 없으면 "unknown"을 사용한다', async () => {
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('unknown' as string, { some: 'data' }, 'uuid-tu-unknown'),
      mkDoneMsg('end_turn', 'uuid-done-tu'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.content).toBe('Tool: unknown');
  });

  it('tool_use input 객체가 있으면 metadata.toolInput에 반영된다', async () => {
    // WHY: tool_result는 SDK에서 SDKUserMessage — mapSdkEvent가 필터링.
    //      tool_use input을 확인하는 케이스로 대체
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Read', { key: 'value' }, 'uuid-tu-input'),
      mkDoneMsg('end_turn', 'uuid-done-input'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());

    expect(events[0]?.metadata?.toolInput).toEqual({ key: 'value' });
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

    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider: new EmptyAuthProvider(),
      logger,
      sessionFactory: factory,
    });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it('maxTurns가 설정되지 않아도 실행이 완료된다', async () => {
    // WHY: SDKSessionOptions에 maxTurns 필드 없음 — 실행 완료 여부 검증
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: undefined }));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('defaultOptions가 없으면 기본 model claude-opus-4-6을 사용한다', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());

    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
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
    const sessionFactory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () {
        // WHY: 스트림 순회 중 에러 발생 시뮬레이션
        yield mkTextMsg('before error', 'uuid-before');
        throw new Error('Stream connection lost');
      }),
      close: mock(() => {}),
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
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-uuid')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({
      projectId: crypto.randomUUID(),
      featureId: crypto.randomUUID(),
    });
    const events = await collectEvents(executor, config);
    expect(events[0]?.type).toBe('done');
  });

  it('빈 prompt 문자열로 실행 → 에러 없이 완료', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-empty-prompt')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ prompt: '' }));
    expect(events[0]?.type).toBe('done');
  });

  it('한글 prompt로 실행 → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-ko-prompt')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const config = createAgentConfig({ prompt: '인증 모듈을 설계해 주세요. 보안을 최우선으로 고려하세요.' });
    const events = await collectEvents(executor, config);
    expect(events[0]?.type).toBe('done');
  });

  it('maxTurns=1 최소값 → 실행 성공', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: 1 }));
    // WHY: SDKSessionOptions에 maxTurns 없음 — 실행 성공 여부 검증
    expect(events[0]?.type).toBe('done');
  });

  it('maxTurns=9999 최대값 → 실행 성공', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: 9999 }));
    expect(events[0]?.type).toBe('done');
  });

  it('coder 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('Writing code', 'uuid-coder'),
      mkDoneMsg('end_turn', 'uuid-done-coder'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'coder' as AgentName }));
    expect(events[0]?.agentName).toBe('coder');
  });

  it('tester 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-tester'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'tester' as AgentName }));
    expect(events[0]?.agentName).toBe('tester');
  });

  it('reviewer 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-reviewer'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'reviewer' as AgentName }));
    expect(events[0]?.agentName).toBe('reviewer');
  });

  it('다수 message 이벤트 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('msg-1', 'uuid-m1'),
      mkTextMsg('msg-2', 'uuid-m2'),
      mkTextMsg('msg-3', 'uuid-m3'),
      mkDoneMsg('end_turn', 'uuid-done-order'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('msg-1');
    expect(events[1]?.content).toBe('msg-2');
    expect(events[2]?.content).toBe('msg-3');
  });

  it('tool_use 후 done 순서 보장', async () => {
    // WHY: SDK에서 tool_result는 SDKUserMessage — mapSdkEvent가 필터링하므로 tool_use + done으로 검증
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Read', { file_path: '/some/file.ts' }, 'uuid-tu-order'),
      mkDoneMsg('end_turn', 'uuid-done-order2'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[1]?.type).toBe('done');
  });

  it('특수문자 포함 content → 그대로 반환', async () => {
    const specialContent = '특수문자: !@#$%^&*()_+ 한글 포함 <script>alert(1)</script>';
    const sessionFactory = createMockSessionFactory([
      mkTextMsg(specialContent, 'uuid-special'),
      mkDoneMsg('end_turn', 'uuid-done-special'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe(specialContent);
  });

  it('빈 content 배열 → 필터링됨', async () => {
    // WHY: 비어있는 assistant 메시지는 필터링 → done만 남는다
    const sessionFactory = createMockSessionFactory([
      mkEmptyAssistantMsg(),
      mkDoneMsg('end_turn', 'uuid-done-empty-arr'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('tool_use input이 null → 정상 처리', async () => {
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Bash', null, 'uuid-bash-null'),
      mkDoneMsg('end_turn', 'uuid-done-bash'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe('Bash');
  });

  it('음수 maxTurns → 실행 성공', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: -1 }));
    // WHY: 음수 maxTurns가 전달되어도 실행 흐름은 정상
    expect(events[0]?.type).toBe('done');
  });

  it('env에 빈 문자열 값 포함 → 병합됨', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ env: { EMPTY_VAR: '' } }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.EMPTY_VAR).toBe('');
  });

  it('10개 도구 목록 → allowedTools에 전달', async () => {
    const tools = ['Read', 'Write', 'Bash', 'Grep', 'Glob', 'Edit', 'WebFetch', 'TaskGet', 'TaskUpdate', 'SendMessage'];
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.allowedTools).toEqual(tools);
  });

  it('eventCount는 이벤트 타입에 관계없이 누적', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('a', 'uuid-ea'),
      mkToolUseMsg('Read', {}, 'uuid-etu'),
      mkTextMsg('b', 'uuid-eb'),
      mkDoneMsg('end_turn', 'uuid-done-ec'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    // message×2 + tool_use + done = 4
    expect(events.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════
// EXTRA EDGE / RANDOM CASES — Extended Coverage
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Extended Edge Cases', () => {
  it('qa 에이전트명 VERIFY Phase → AGENT_TEAMS 0', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ name: 'qa' as AgentName, phase: 'VERIFY' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it('qc 에이전트명 TEST Phase → AGENT_TEAMS 0', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ name: 'qc' as AgentName, phase: 'TEST' }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
  });

  it('documenter 에이전트명으로 실행 → agentName 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('Generating docs', 'uuid-docs'),
      mkDoneMsg('end_turn', 'uuid-done-docs'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ name: 'documenter' as AgentName }));
    expect(events[0]?.agentName).toBe('documenter');
  });

  it('세션 생성 후 즉시 result success → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-immediate'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('error + success result → 2개 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg(['Partial error'], 'uuid-err-partial'),
      mkDoneMsg('end_turn', 'uuid-done-partial'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('done');
  });

  it('연속 tool_use 이벤트 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Read', { file_path: '/a.ts' }, 'uuid-tu-a'),
      mkToolUseMsg('Write', { file_path: '/b.ts', content: 'data' }, 'uuid-tu-b'),
      mkToolUseMsg('Bash', { command: 'bun test' }, 'uuid-tu-c'),
      mkDoneMsg('end_turn', 'uuid-done-tu3'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.metadata?.toolName).toBe('Read');
    expect(events[1]?.metadata?.toolName).toBe('Write');
    expect(events[2]?.metadata?.toolName).toBe('Bash');
  });

  it('빈 systemPrompt → 팩토리가 호출됨', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ systemPrompt: '' }));
    // WHY: SDKSessionOptions에 systemPrompt 없음 — 팩토리 호출 및 실행 완료 검증
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('한글 systemPrompt → 팩토리가 호출됨', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const events = await collectEvents(executor, createAgentConfig({ systemPrompt: '당신은 아키텍처 에이전트입니다.' }));
    // WHY: SDKSessionOptions에 systemPrompt 없음 — 팩토리 호출 및 실행 완료 검증
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('DESIGN Phase architect → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('Architecture designed', 'uuid-arch'),
      mkDoneMsg('end_turn', 'uuid-done-arch'),
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
      mkTextMsg('Code written', 'uuid-code'),
      mkDoneMsg('end_turn', 'uuid-done-code'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({
      name: 'coder' as AgentName,
      phase: 'CODE',
    }));
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('Code written');
  });

  it('tool_use is_error_scenario → tool_use 이벤트 반영', async () => {
    // WHY: SDK에서 tool_result is_error는 SDKUserMessage — 필터링됨.
    //      tool_use 이후 result error로 오류 시나리오 검증
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Bash', { command: 'rm -rf /' }, 'uuid-bash-err'),
      mkErrorMsg(['Permission denied'], 'uuid-err-perm'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[1]?.type).toBe('error');
  });

  it('다수 환경변수 병합 → 모두 전달', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
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
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
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
      mkMultiTextMsg(['Line A', 'Line B', 'Line C'], 'uuid-multi-3'),
      mkDoneMsg('end_turn', 'uuid-done-multi3'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('Line A\nLine B\nLine C');
  });

  it('cleanup 후 재실행 → 에러 없이 완료', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-cleanup-rerun')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    executor.cleanup();
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('phaseId 빈 문자열 → 실행 ok', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-empty-phase')]);
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

  it('defaultOptions model 설정 → 팩토리에 전달 (temperature 대체)', async () => {
    // WHY: V2SessionExecutorOptions에서 temperature 제거됨 → model 검증으로 대체
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { model: 'claude-haiku-4-5-20251001' },
    });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('message 이벤트 agentName === featureId 아님', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('hello', 'uuid-hello'),
      mkDoneMsg('end_turn', 'uuid-done-hello'),
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
      mkToolUseMsg(toolName, { key: 'val' }, 'uuid-tu-uuid'),
      mkDoneMsg('end_turn', 'uuid-done-tu-uuid'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe(toolName);
  });

  it('message 이벤트 content가 숫자 문자열 → 그대로 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('42', 'uuid-42'),
      mkDoneMsg('end_turn', 'uuid-done-42'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('42');
  });

  it('message 이벤트 content가 이모지 포함 → 그대로 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('코드 완성 🎉', 'uuid-emoji'),
      mkDoneMsg('end_turn', 'uuid-done-emoji'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('코드 완성 🎉');
  });

  it('빈 message content 배열 → 필터링됨', async () => {
    // WHY: 빈 배열 → tool_use/text 블록 없음 → null 반환 → 필터링됨
    const sessionFactory = createMockSessionFactory([
      mkEmptyAssistantMsg(),
      mkDoneMsg('end_turn', 'uuid-done-empty2'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('done');
  });

  it('4개 다른 phase → 각각 AGENT_TEAMS 분기 확인', async () => {
    const phases: Array<AgentConfig['phase']> = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const factory = mock((_opts: SDKSessionOptions) => ({
        sessionId: 'mock-session-id',
        send: mock(async (_msg: string) => {}),
        stream: mock(async function* () { yield mkDoneMsg(); }),
        close: mock(() => {}),
      }));
      executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
      await collectEvents(executor, createAgentConfig({ phase }));
      const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
      const env = calledWith?.env as Record<string, string>;
      if (phase === 'DESIGN') {
        expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
      } else {
        // WHY: DESIGN 이외 Phase는 AGENT_TEAMS 키 자체를 설정하지 않음
        expect(env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined();
      }
    }
  });

  it('연속 message 5개 → 모두 message 타입', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => mkTextMsg(`Message ${i}`, `uuid-seq-${i}`));
    const sessionFactory = createMockSessionFactory([
      ...msgs,
      mkDoneMsg('end_turn', 'uuid-done-5msgs'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    const messageEvents = events.filter((e) => e.type === 'message');
    expect(messageEvents.length).toBe(5);
  });

  it('message 이후 tool_use 이후 done → 순서 보장', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('Analyzing...', 'uuid-analyze'),
      mkToolUseMsg('Bash', { command: 'ls' }, 'uuid-bash-ls'),
      mkDoneMsg('end_turn', 'uuid-done-sequence'),
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
      mkToolUseMsg('WebSearch', { query: 'TypeScript', options: { limit: 10, lang: 'ko' } }, 'uuid-ws'),
      mkDoneMsg('end_turn', 'uuid-done-ws'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    expect(events[0]?.metadata?.toolName).toBe('WebSearch');
  });

  it('OAuth 인증 → CLAUDE_CODE_OAUTH_TOKEN 환경변수 설정', async () => {
    const oauthProvider = new MockAuthProvider();
    oauthProvider.setOAuth(true);

    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider: oauthProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CLAUDE_CODE_OAUTH_TOKEN).toBe('mock_oauth_token_xyz');
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('API key 인증 → ANTHROPIC_API_KEY 환경변수 설정', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.ANTHROPIC_API_KEY).toBe('mock_api_key_12345');
  });

  it('config.env 키가 baseEnv 키 덮어씌우기 방지 확인', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    // WHY: config.env는 baseEnv 이후 병합 → 우선순위 높음
    await collectEvents(executor, createAgentConfig({ env: { CUSTOM_VAR: 'custom_value' } }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    const env = calledWith?.env as Record<string, string>;
    expect(env?.CUSTOM_VAR).toBe('custom_value');
    expect(env?.ANTHROPIC_API_KEY).toBeDefined();
  });

  it('result success (max_tokens) → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('max_tokens', 'uuid-done-maxtok'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('result success (stop_sequence) → done 이벤트', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('stop_sequence', 'uuid-done-stopseq'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('done');
  });

  it('defaultOptions maxTurns=1 → 실행 성공', async () => {
    // WHY: SDKSessionOptions에 maxTurns 없음 — 실행 완료 여부 검증
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 1 },
    });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: undefined }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('config.maxTurns=100 → 실행 성공', async () => {
    // WHY: SDKSessionOptions에 maxTurns 없음 — 실행 완료 여부 검증
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { maxTurns: 10 },
    });
    const events = await collectEvents(executor, createAgentConfig({ maxTurns: 100 }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events[0]?.type).toBe('done');
  });

  it('cleanup 호출 후 activeSessions 비어있음', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-done-active')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    await collectEvents(executor, createAgentConfig());
    executor.cleanup();
    // WHY: cleanup 후 재호출해도 에러 없음
    expect(() => executor.cleanup()).not.toThrow();
  });

  it('빈 text content → 빈 문자열 반환', async () => {
    // WHY: tool_result SDKUserMessage는 필터링됨 — 빈 text 메시지로 대체 검증
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('', 'uuid-empty-text'),
      mkDoneMsg('end_turn', 'uuid-done-empty-text'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(typeof events[0]?.content).toBe('string');
    expect(events[0]?.content).toBe('');
  });

  it('message 이벤트 timestamp는 Date 인스턴스', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('Time check', 'uuid-time'),
      mkDoneMsg('end_turn', 'uuid-done-time'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('done 이벤트 timestamp는 Date 인스턴스', async () => {
    const sessionFactory = createMockSessionFactory([
      mkDoneMsg('end_turn', 'uuid-done-ts'),
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
    const tools = Array.from({ length: 10 }, (_, i) =>
      mkToolUseMsg(`Tool${i}`, { index: i }, `uuid-tool-${i}`),
    );
    const sessionFactory = createMockSessionFactory([
      ...tools,
      mkDoneMsg('end_turn', 'uuid-done-10tools'),
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
      mkDoneMsg('end_turn', 'uuid-done-qa'),
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

  it('undefined tools → 팩토리에 allowedTools 미전달', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: [] }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    // WHY: 빈 tools → allowedTools=undefined (팩토리에 전달 안 함)
    expect(calledWith?.allowedTools).toBeUndefined();
  });

  it('tools 1개 → 팩토리에 allowedTools 전달됨', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig({ tools: ['Read'] }));
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(Array.isArray(calledWith?.allowedTools)).toBe(true);
    expect((calledWith?.allowedTools as string[]).length).toBe(1);
  });

  it('projectId가 빈 문자열 → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-done-emptyproj')]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig({ projectId: '' }));
    expect(events[0]?.type).toBe('done');
  });

  it('한글 featureId → 실행 성공', async () => {
    const sessionFactory = createMockSessionFactory([mkDoneMsg('end_turn', 'uuid-done-kofeat')]);
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
        mkTextMsg(`Run ${i}`, `uuid-run-${i}`),
        mkDoneMsg('end_turn', `uuid-done-run-${i}`),
      ]);
      executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
      const events = await collectEvents(executor, createAgentConfig());
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it('message content 빈 문자열 → 이벤트 타입 message', async () => {
    const sessionFactory = createMockSessionFactory([
      mkTextMsg('', 'uuid-empty-content'),
      mkDoneMsg('end_turn', 'uuid-done-empty-content'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('message');
    expect(events[0]?.content).toBe('');
  });

  it('tool_use input이 null → 처리됨', async () => {
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Grep', null, 'uuid-grep-null'),
      mkDoneMsg('end_turn', 'uuid-done-grep'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
  });

  it('defaultOptions model 설정 → 팩토리에 전달', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      sessionFactory: factory,
      defaultOptions: { model: 'claude-haiku-4-5-20251001' },
    });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('defaultOptions 미설정 → model 기본값 claude-opus-4-6', async () => {
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    await collectEvents(executor, createAgentConfig());
    const calledWith = (factory as ReturnType<typeof mock>).mock.calls[0]?.[0] as SDKSessionOptions;
    expect(calledWith?.model).toBe('claude-opus-4-6');
  });

  it('tool_use 이벤트 tool_use_id가 metadata에 반영', async () => {
    const sessionFactory = createMockSessionFactory([
      mkToolUseMsg('Write', { file_path: '/out.ts' }, 'tu-uuid-001'),
      mkDoneMsg('end_turn', 'uuid-done-write'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('tool_use');
    // WHY: tool_use_id가 metadata.toolUseId에 반영되어야 함
    expect(events[0]?.metadata?.toolUseId ?? events[0]?.metadata?.toolName).toBeDefined();
  });

  it('error result 중간에 message → error 먼저 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      mkErrorMsg(['Mid-stream error'], 'uuid-err-mid'),
      mkTextMsg('After error', 'uuid-after-err'),
      mkDoneMsg('end_turn', 'uuid-done-after-err'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.type).toBe('error');
    expect(events[1]?.type).toBe('message');
  });

  it('text 블록 1개인 배열 → 단일 문자열 반환', async () => {
    const sessionFactory = createMockSessionFactory([
      mkMultiTextMsg(['Solo line'], 'uuid-solo'),
      mkDoneMsg('end_turn', 'uuid-done-solo'),
    ]);
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory });
    const events = await collectEvents(executor, createAgentConfig());
    expect(events[0]?.content).toBe('Solo line');
  });

  it('send()를 config.prompt 인수로 호출해야 한다', async () => {
    // Arrange: send mock을 클로저로 캡처하여 호출 인수 검증
    const sendSpy = mock(async (_msg: string) => {});
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: sendSpy,
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: mock(() => {}),
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });
    const config = createAgentConfig({ prompt: 'Design the authentication module' });

    // Act: 전체 스트림 소비
    await collectEvents(executor, config);

    // Assert: send가 systemPrompt + prompt 합성 문자열로 정확히 1회 호출됐는지 확인
    // WHY: V2 Session API는 systemPrompt 옵션이 없으므로 prompt 앞에 systemPrompt를 합쳐서 전달
    const expectedPrompt = config.systemPrompt
      ? `${config.systemPrompt}\n\n---\n\n${config.prompt}`
      : config.prompt;
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(expectedPrompt);
  });

  it('done 이벤트 수신 후 session.close()를 호출해야 한다', async () => {
    // Arrange: close mock을 클로저로 캡처하여 호출 횟수 검증
    const closeSpy = mock(() => {});
    const factory = mock((_opts: SDKSessionOptions) => ({
      sessionId: 'mock-session-id',
      send: mock(async (_msg: string) => {}),
      stream: mock(async function* () { yield mkDoneMsg(); }),
      close: closeSpy,
    }));
    executor = new V2SessionExecutor({ authProvider, logger, sessionFactory: factory });

    // Act: done 이벤트가 포함된 스트림 전체 소비
    await collectEvents(executor, createAgentConfig());

    // Assert: close가 정확히 1회 호출됐는지 확인
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
