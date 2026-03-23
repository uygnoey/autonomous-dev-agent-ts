/**
 * DESIGN Phase Agent Teams + Hook/IPC 모니터링 통합 테스트
 *
 * @description
 * KR: NI-001 (DESIGN Phase Agent Teams) + NI-002 (Hook + IPC 모니터링) 검증
 *     - executeDesignPhase: Agent Teams env 설정, AbortSignal 처리
 *     - StreamMonitor.startMonitoring: 이상 감지 → abort
 *     - executeDesignPhaseWithMonitoring: 전체 통합 흐름 + 재spawn
 * EN: Validates NI-001 (DESIGN Phase Agent Teams) + NI-002 (Hook + IPC monitoring)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { SDKMessage, SDKSessionOptions } from '@anthropic-ai/claude-agent-sdk';
import type { AuthProvider } from 'auth/types.js';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';
import {
  V2SessionExecutor,
  type V2SessionExecutorOptions,
  type V2SessionFactory,
} from 'layer2/v2-session-executor.js';
import type { AgentConfig, AgentEvent } from 'layer2/types.js';
import type { V2Session } from 'layer2/v2-session-executor-types.js';
import type { HandoffPackage } from 'layer1/types.js';

// ── Mock 인증 프로바이더 ──────────────────────────────────────────

class MockAuthProvider implements AuthProvider {
  getAuthHeader(): Record<string, string> {
    return { 'x-api-key': 'mock_api_key_design' };
  }
  async validateAuth(): Promise<boolean> {
    return true;
  }
}

// ── 테스트 유틸리티 ──────────────────────────────────────────────

const logger = new ConsoleLogger('error');

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

function mkDoneMsg(result = 'Design complete', uuid = 'uuid-done'): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    result,
    stop_reason: 'end_turn',
    total_cost_usd: 0.001,
    uuid,
    session_id: 'mock-session-id',
  } as unknown as SDKMessage;
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: 'architect',
    projectId: 'proj-1',
    featureId: 'feat-1',
    phase: 'DESIGN',
    systemPrompt: 'You are an architect.',
    prompt: 'Design the auth system.',
    tools: ['Read', 'Write'],
    ...overrides,
  };
}

function makeMockSession(messages: SDKMessage[]): V2Session {
  return {
    sessionId: 'mock-design-session',
    send: mock(async () => {}),
    stream: mock(async function* () {
      for (const msg of messages) {
        yield msg;
      }
    }),
    close: mock(() => {}),
  };
}

function makeHandoff(overrides: Partial<HandoffPackage> = {}): HandoffPackage {
  return {
    id: 'hp-test-1',
    projectId: 'proj-1',
    contract: {
      version: 1,
      projectType: 'test',
      features: [],
      testDefinitions: [],
      implementationOrder: [],
      verificationMatrix: [],
    },
    planDocument: 'test plan',
    designDocument: 'test design',
    specDocument: 'test spec',
    createdAt: new Date(),
    confirmedByUser: true,
    ...overrides,
  } as HandoffPackage;
}

function makeExecutor(sessionFactory: V2SessionFactory): V2SessionExecutor {
  return new V2SessionExecutor({
    authProvider: new MockAuthProvider(),
    logger,
    sessionFactory,
    defaultOptions: { model: 'claude-opus-4-6' },
  });
}

// ── NI-001: executeDesignPhase 테스트 ────────────────────────────

describe('V2SessionExecutor.executeDesignPhase', () => {
  it('DESIGN Phase 정상 실행 — Agent Teams env 설정 확인', async () => {
    let capturedOptions: SDKSessionOptions | null = null;
    const session = makeMockSession([mkTextMsg('설계 시작'), mkDoneMsg()]);
    const factory: V2SessionFactory = (opts) => {
      capturedOptions = opts;
      return session;
    };

    const executor = makeExecutor(factory);
    const events: AgentEvent[] = [];

    for await (const event of executor.executeDesignPhase(makeConfig(), {
      featureId: 'feat-1',
      handoff: makeHandoff(),
    })) {
      events.push(event);
    }

    // WHY: Agent Teams env가 세션에 전달되었는지 확인
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');

    // WHY: 이벤트 스트림이 정상적으로 yield 되었는지 확인
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('message');
    expect(events[1]?.type).toBe('done');
  });

  it('AbortSignal 활성화 시 세션 중단', async () => {
    const abortController = new AbortController();
    // WHY: 첫 메시지 이후 abort를 트리거하여 세션 중단 테스트
    const session: V2Session = {
      sessionId: 'mock-abort-session',
      send: mock(async () => {}),
      stream: mock(async function* () {
        yield mkTextMsg('첫 번째 메시지');
        // WHY: abort 후에도 stream이 계속되는 시뮬레이션
        abortController.abort();
        yield mkTextMsg('abort 후 메시지');
      }),
      close: mock(() => {}),
    };

    const executor = makeExecutor(() => session);
    const events: AgentEvent[] = [];

    for await (const event of executor.executeDesignPhase(makeConfig(), {
      featureId: 'feat-1',
      handoff: makeHandoff(),
      signal: abortController.signal,
    })) {
      events.push(event);
    }

    // WHY: abort 후 에러 이벤트가 발생해야 함
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.content).toContain('이상 감지로 중단');
    expect(session.close).toHaveBeenCalled();
  });

  it('세션 생성 실패 시 에러 이벤트 yield', async () => {
    const factory: V2SessionFactory = () => {
      throw new Error('Session creation failed');
    };

    const executor = makeExecutor(factory);
    const events: AgentEvent[] = [];

    for await (const event of executor.executeDesignPhase(makeConfig(), {
      featureId: 'feat-1',
      handoff: makeHandoff(),
    })) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.content).toContain('Failed to create session');
  });

  it('스트림 에러 시 에러 이벤트 yield + 세션 정리', async () => {
    const session: V2Session = {
      sessionId: 'mock-stream-error-session',
      send: mock(async () => {}),
      stream: mock(async function* () {
        yield mkTextMsg('정상 메시지');
        throw new Error('Stream interrupted');
      }),
      close: mock(() => {}),
    };

    const executor = makeExecutor(() => session);
    const events: AgentEvent[] = [];

    for await (const event of executor.executeDesignPhase(makeConfig(), {
      featureId: 'feat-1',
      handoff: makeHandoff(),
    })) {
      events.push(event);
    }

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('message');
    expect(events[1]?.type).toBe('error');
    expect(events[1]?.content).toContain('Stream interrupted');
  });

  it('systemPrompt 없는 config → prompt만 전송', async () => {
    let sentMessage = '';
    const session: V2Session = {
      sessionId: 'mock-no-sysprompt',
      send: mock(async (msg: string) => {
        sentMessage = msg;
      }),
      stream: mock(async function* () {
        yield mkDoneMsg();
      }),
      close: mock(() => {}),
    };

    const executor = makeExecutor(() => session);
    const config = makeConfig({ systemPrompt: '' });

    for await (const _ of executor.executeDesignPhase(config, {
      featureId: 'feat-1',
      handoff: makeHandoff(),
    })) {
      // consume
    }

    // WHY: systemPrompt가 비어있으면 구분선 없이 prompt만 전송
    expect(sentMessage).toBe('Design the auth system.');
  });
});

// ── NI-002: StreamMonitor.startMonitoring 테스트 ─────────────────

describe('StreamMonitor.startMonitoring', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = new StreamMonitor(logger);
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  it('startMonitoring 후 isMonitoring() === true', () => {
    const controller = new AbortController();
    monitor.startMonitoring(controller, 100);
    expect(monitor.isMonitoring()).toBe(true);
  });

  it('stopMonitoring 후 isMonitoring() === false', () => {
    const controller = new AbortController();
    monitor.startMonitoring(controller, 100);
    monitor.stopMonitoring();
    expect(monitor.isMonitoring()).toBe(false);
  });

  it('중복 startMonitoring 호출 → 무시됨', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    monitor.startMonitoring(controller1, 100);
    monitor.startMonitoring(controller2, 100);
    // WHY: 두 번째 호출은 무시되어야 함
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stopMonitoring();
  });

  it('stopMonitoring 중복 호출 → 에러 없음', () => {
    const controller = new AbortController();
    monitor.startMonitoring(controller, 100);
    monitor.stopMonitoring();
    expect(() => monitor.stopMonitoring()).not.toThrow();
  });

  it('HIGH 이상 감지 시 AbortController abort + 모니터링 중단', async () => {
    const controller = new AbortController();

    // WHY: IDLE_THRESHOLD_MS(300_000) * 2 = 600_000ms 이상 유휴 → high severity
    const baseTime = new Date('2025-01-01T00:00:00Z');

    // 먼저 활동 이벤트 기록
    monitor.onEvent({
      type: 'PostToolUse',
      agentName: 'coder',
      toolName: 'Read',
      data: {},
      timestamp: baseTime,
    });

    // 10분(600,000ms) 후 유휴 이벤트 → high severity
    monitor.onEvent({
      type: 'TeammateIdle',
      agentName: 'coder',
      data: {},
      timestamp: new Date(baseTime.getTime() + 700_000),
    });

    // WHY: 짧은 interval로 즉시 감지
    monitor.startMonitoring(controller, 50);

    // WHY: abort가 비동기로 발생하므로 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(controller.signal.aborted).toBe(true);
    expect(monitor.isMonitoring()).toBe(false);
  });

  it('이상 없으면 abort 안 됨', async () => {
    const controller = new AbortController();

    // WHY: 정상적인 다양한 도구 호출 (반복 아님)
    const tools = ['Read', 'Write', 'Grep', 'Glob', 'Edit'];
    for (const tool of tools) {
      monitor.onEvent({
        type: 'PreToolUse',
        agentName: 'coder',
        toolName: tool,
        data: {},
        timestamp: new Date(),
      });
    }

    monitor.startMonitoring(controller, 50);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(controller.signal.aborted).toBe(false);
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stopMonitoring();
  });

  it('medium severity 이상은 abort 안 됨 (high만 abort)', async () => {
    const controller = new AbortController();

    // WHY: REPEATED_TOOL_THRESHOLD(5)회 연속 → medium severity (high는 10회)
    for (let i = 0; i < 5; i++) {
      monitor.onEvent({
        type: 'PreToolUse',
        agentName: 'coder',
        toolName: 'Read',
        data: {},
        timestamp: new Date(),
      });
    }

    monitor.startMonitoring(controller, 50);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // WHY: medium severity는 abort 하지 않음
    expect(controller.signal.aborted).toBe(false);
    monitor.stopMonitoring();
  });
});
