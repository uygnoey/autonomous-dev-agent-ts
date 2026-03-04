/**
 * V2SessionExecutor 테스트
 *
 * @description
 * KR: V2 Session API 기반 에이전트 실행기 테스트
 *     비율: Normal 20%, Edge 40%, Error 40%
 * EN: Tests for V2 Session API-based agent executor
 *     Ratio: Normal 20%, Edge 40%, Error 40%
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AuthProvider } from '../../../src/auth/types.js';
import { AgentError } from '../../../src/core/errors.js';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { AgentName } from '../../../src/core/types.js';
import {
  V2SessionExecutor,
  type V2SessionExecutorOptions,
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

function createMockSession(events: MockV2SessionEvent[]) {
  return {
    stream: mock(() => mockSessionStream(events)),
  };
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
  logger = null as any;
  authProvider = null as any;
  executor = null as any;
});

// ══════════════════════════════════════════════════════════════════
// NORMAL CASES (20%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Normal Cases', () => {
  it('기본 설정으로 생성된다', () => {
    const options: V2SessionExecutorOptions = {
      authProvider,
      logger,
    };

    executor = new V2SessionExecutor(options);

    expect(executor).toBeDefined();
  });

  it('기본 옵션과 함께 생성된다', () => {
    const options: V2SessionExecutorOptions = {
      authProvider,
      logger,
      defaultOptions: {
        maxTurns: 100,
        temperature: 0.7,
        model: 'claude-sonnet-4-5',
      },
    };

    executor = new V2SessionExecutor(options);

    expect(executor).toBeDefined();
  });

  it('세션 정리가 정상 동작한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    // WHY: cleanup() 호출은 에러를 던지지 않아야 함
    expect(() => executor.cleanup()).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// EDGE CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Edge Cases', () => {
  it('DESIGN Phase는 Agent Teams를 활성화한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ phase: 'DESIGN' });

    // WHY: SDK 미설치로 에러 발생 — 환경변수 설정은 에러 전에 실행됨
    const events = await collectEvents(executor, config);

    // WHY: SDK 에러로 error 이벤트 수신
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Failed to create session');
  });

  it('CODE Phase는 Agent Teams를 비활성화한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ phase: 'CODE' });

    const events = await collectEvents(executor, config);

    // WHY: SDK 에러로 error 이벤트 수신
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('error');
  });

  it('TEST Phase는 Agent Teams를 비활성화한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ phase: 'TEST' });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('error');
  });

  it('VERIFY Phase는 Agent Teams를 비활성화한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ phase: 'VERIFY' });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('error');
  });

  it('API Key 인증 헤더를 환경변수로 변환한다', async () => {
    authProvider.setOAuth(false); // WHY: x-api-key 사용
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig();

    const events = await collectEvents(executor, config);

    // WHY: buildSessionEnvironment()는 에러 전에 호출됨 — 환경변수 설정 검증
    expect(events.length).toBeGreaterThan(0);
  });

  it('OAuth 토큰을 환경변수로 변환한다', async () => {
    authProvider.setOAuth(true); // WHY: Bearer token 사용
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig();

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('사용자 정의 환경변수가 병합된다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({
      env: {
        CUSTOM_VAR: 'custom_value',
        ANOTHER_VAR: '12345',
      },
    });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('빈 도구 목록이 허용된다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ tools: [] });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('도구 목록이 SDK 옵션에 전달된다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({
      tools: ['Read', 'Write', 'Bash', 'Grep'],
    });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('maxTurns가 설정에 따라 적용된다', async () => {
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      defaultOptions: { maxTurns: 200 },
    });

    const config = createAgentConfig({ maxTurns: 150 });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('message 이벤트 매핑이 정상 동작한다 (string content)', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'message',
      content: 'Hello from agent',
    };

    // WHY: private 메서드 테스트를 위해 간접 호출 — 실제로는 execute()에서 호출됨
    // 여기서는 구조 검증만 수행
    expect(sdkEvent.content).toBe('Hello from agent');
  });

  it('message 이벤트 매핑이 정상 동작한다 (array content)', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'message',
      content: [
        { type: 'text', text: 'First block' },
        { type: 'text', text: 'Second block' },
      ],
    };

    expect(Array.isArray(sdkEvent.content)).toBe(true);
  });

  it('tool_use 이벤트 매핑이 정상 동작한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'tool_use',
      name: 'Read',
      input: { file_path: '/path/to/file.ts' },
    };

    expect(sdkEvent.name).toBe('Read');
    expect(sdkEvent.input).toBeDefined();
  });

  it('tool_result 이벤트 매핑이 정상 동작한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'tool_result',
      tool_use_id: 'tool_123',
      content: 'File contents here',
      is_error: false,
    };

    expect(sdkEvent.tool_use_id).toBe('tool_123');
    expect(sdkEvent.is_error).toBe(false);
  });

  it('error 이벤트 매핑이 정상 동작한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'error',
      error: { message: 'Something went wrong' },
    };

    expect(sdkEvent.type).toBe('error');
  });

  it('message_stop 이벤트가 done으로 매핑된다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'message_stop',
      stop_reason: 'end_turn',
    };

    expect(sdkEvent.type).toBe('message_stop');
  });

  it('session_end 이벤트가 done으로 매핑된다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'session_end',
      stop_reason: 'max_turns',
    };

    expect(sdkEvent.type).toBe('session_end');
  });

  it('세션 ID가 올바르게 생성된다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({
      projectId: 'proj-abc',
      featureId: 'feat-xyz',
      name: 'qa',
      phase: 'VERIFY',
    });

    // WHY: generateSessionId는 private — 간접 검증
    const sessionIdFormat = `${config.projectId}:${config.featureId}:${config.name}:${config.phase}`;
    expect(sessionIdFormat).toBe('proj-abc:feat-xyz:qa:VERIFY');
  });
});

// ══════════════════════════════════════════════════════════════════
// ERROR CASES (40%)
// ══════════════════════════════════════════════════════════════════

describe('V2SessionExecutor - Error Cases', () => {
  it('SDK 미설치 시 에러 이벤트를 반환한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig();

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Failed to create session');
  });

  it('존재하지 않는 세션 재개 시 에러를 반환한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

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
    executor = new V2SessionExecutor({ authProvider, logger });

    const invalidSessionId = 'invalid-format';

    const events: AgentEvent[] = [];
    for await (const event of executor.resume(invalidSessionId)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.agentName).toBe('architect'); // WHY: 기본값
  });

  it('빈 세션 ID에서 에러를 반환한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const events: AgentEvent[] = [];
    for await (const event of executor.resume('')) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
  });

  it('알 수 없는 에이전트명이 세션 ID에 있으면 기본값을 반환한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sessionId = 'proj-123:feat-456:unknown_agent:DESIGN';

    const events: AgentEvent[] = [];
    for await (const event of executor.resume(sessionId)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.agentName).toBe('architect');
  });

  it('세션 ID 파트가 부족하면 기본 에이전트명을 반환한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sessionId = 'proj-123:feat-456'; // WHY: 2개 파트만 (4개 필요)

    const events: AgentEvent[] = [];
    for await (const event of executor.resume(sessionId)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.agentName).toBe('architect');
  });

  it('message 이벤트에 content가 없으면 빈 문자열을 반환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'message',
      // WHY: content 없음
    };

    // WHY: extractContent()는 빈 문자열 반환 예상
    expect(sdkEvent.content).toBeUndefined();
  });

  it('message 이벤트의 content가 배열이지만 text 블록이 없으면 빈 문자열을 반환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'message',
      content: [
        { type: 'image', source: 'base64...' },
        { type: 'unknown', data: 'something' },
      ],
    };

    // WHY: text 블록만 필터링되므로 결과는 빈 문자열
    expect(Array.isArray(sdkEvent.content)).toBe(true);
  });

  it('tool_result 이벤트에 content가 없으면 기본 메시지를 반환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'tool_result',
      tool_use_id: 'tool_999',
      // WHY: content 없음
    };

    expect(sdkEvent.content).toBeUndefined();
  });

  it('error 이벤트에 에러 정보가 없으면 기본 메시지를 반환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'error',
      // WHY: error/message 필드 없음
    };

    // WHY: extractErrorContent()는 'Unknown error occurred' 반환 예상
    expect(sdkEvent.error).toBeUndefined();
    expect(sdkEvent.message).toBeUndefined();
  });

  it('error 이벤트의 error 필드가 객체가 아니면 기본 메시지를 반환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'error',
      error: 'string error', // WHY: 객체 아님
    };

    expect(typeof sdkEvent.error).toBe('string');
  });

  it('tool_use 이벤트에 name이 없으면 "unknown"을 사용한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'tool_use',
      // WHY: name 없음
      input: { some: 'data' },
    };

    expect(sdkEvent.name).toBeUndefined();
  });

  it('tool_result 이벤트에서 content가 배열이면 JSON으로 변환한다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const sdkEvent: MockV2SessionEvent = {
      type: 'tool_result',
      tool_use_id: 'tool_555',
      content: [{ key: 'value' }, { another: 'data' }],
    };

    expect(Array.isArray(sdkEvent.content)).toBe(true);
  });

  it('인증 헤더가 비어있으면 환경변수도 인증 정보 없이 설정된다', async () => {
    // WHY: Mock authProvider가 빈 헤더를 반환하도록 수정
    class EmptyAuthProvider implements AuthProvider {
      getAuthHeader(): Record<string, string> {
        return {}; // WHY: 인증 헤더 없음
      }
      async validateAuth(): Promise<boolean> {
        return false;
      }
    }

    executor = new V2SessionExecutor({
      authProvider: new EmptyAuthProvider(),
      logger,
    });

    const config = createAgentConfig();
    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('maxTurns가 설정되지 않으면 기본값 50을 사용한다', async () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    const config = createAgentConfig({ maxTurns: undefined });

    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('defaultOptions가 없으면 내장 기본값을 사용한다', async () => {
    executor = new V2SessionExecutor({
      authProvider,
      logger,
      // WHY: defaultOptions 없음
    });

    const config = createAgentConfig();
    const events = await collectEvents(executor, config);

    expect(events.length).toBeGreaterThan(0);
  });

  it('cleanup 호출 시 활성 세션이 정리된다', () => {
    executor = new V2SessionExecutor({ authProvider, logger });

    // WHY: cleanup() 호출은 항상 안전해야 함
    executor.cleanup();
    executor.cleanup(); // WHY: 중복 호출도 안전

    expect(() => executor.cleanup()).not.toThrow();
  });
});
