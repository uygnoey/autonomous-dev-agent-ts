/**
 * V2 Session 팩토리 / V2 Session Factory
 *
 * @description
 * KR: @anthropic-ai/claude-agent-sdk 기반 V2Session 팩토리와 이벤트 매핑 헬퍼를 제공한다.
 * EN: Provides @anthropic-ai/claude-agent-sdk-based V2Session factory and event mapping helpers.
 */

import {
  unstable_v2_createSession,
  unstable_v2_prompt,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKSessionOptions } from '@anthropic-ai/claude-agent-sdk';
import type {
  BetaTextBlock,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import { AgentError } from 'core/errors.js';
import { type Result, err, ok } from 'core/types.js';
import type { AgentName } from 'core/types.js';
import type { AgentEvent } from 'layer2/types.js';
import type { V2Session, V2SessionFactory } from 'layer2/v2-session-executor-types.js';

// Re-export SDK types consumed by executor
export type { SDKMessage, SDKSessionOptions };

// ── SDK 팩토리 함수 / SDK Factory Functions ──────────────────────

/**
 * @anthropic-ai/claude-agent-sdk의 unstable_v2_createSession을 래핑한 팩토리.
 *
 * @description
 * KR: SDKSessionOptions를 받아 V2Session(SDKSession 호환)을 반환한다.
 *     기본 sessionFactory로 사용된다.
 * EN: Wraps unstable_v2_createSession; returns a V2Session (SDKSession-compatible).
 *     Used as the default sessionFactory.
 *
 * @param options - SDK 세션 옵션 / SDK session options
 * @returns V2Session 인스턴스 / V2Session instance
 */
export const sdkSessionFactory: V2SessionFactory = (options: SDKSessionOptions) => {
  return unstable_v2_createSession(options) as unknown as V2Session;
};

/**
 * 단발성 프롬프트를 실행한다 / Execute a one-shot prompt
 *
 * @description
 * KR: unstable_v2_prompt를 래핑하여 Result 패턴으로 결과를 반환한다.
 * EN: Wraps unstable_v2_prompt and returns the result string via Result pattern.
 *
 * @param message - 전송할 메시지 / Message to send
 * @param options - SDK 세션 옵션 / SDK session options
 * @returns 결과 문자열 Result / Result with output string or AgentError
 */
export async function executeOneShot(
  message: string,
  options: SDKSessionOptions,
): Promise<Result<string, AgentError>> {
  try {
    const result = await unstable_v2_prompt(message, options);
    if (result.subtype === 'success') {
      return ok(result.result);
    }
    // WHY: error subtype들은 errors[] 배열에 메시지를 담을 수 있음
    const errResult = result as { errors?: string[] };
    return err(
      new AgentError('agent_execution_failed', errResult.errors?.[0] ?? 'Execution failed'),
    );
  } catch (error) {
    return err(new AgentError('agent_execution_failed', String(error), error));
  }
}

/**
 * 기존 세션을 재개한다 / Resume an existing session
 *
 * @description
 * KR: unstable_v2_resumeSession을 래핑하여 V2Session을 반환한다.
 * EN: Wraps unstable_v2_resumeSession and returns a V2Session.
 *
 * @param sessionId - 재개할 세션 ID / Session ID to resume
 * @param options - SDK 세션 옵션 / SDK session options
 * @returns V2Session 인스턴스 / V2Session instance
 */
export function sdkResumeSession(sessionId: string, options: SDKSessionOptions): V2Session {
  return unstable_v2_resumeSession(sessionId, options) as unknown as V2Session;
}

// ── 이벤트 매핑 / Event Mapping ───────────────────────────────────

/**
 * SDKMessage를 AgentEvent로 매핑한다 / Map SDKMessage to AgentEvent
 *
 * @description
 * KR: SDK에서 수신한 SDKMessage 타입에 따라 AgentEvent를 생성한다.
 *     - assistant + tool_use block → 'tool_use' 이벤트
 *     - assistant + text block → 'message' 이벤트
 *     - result subtype 'success' → 'done' 이벤트 (content = result 문자열)
 *     - result subtype != 'success' → 'error' 이벤트
 *     - 그 외 → null (필터링)
 * EN: Creates AgentEvent based on received SDKMessage type.
 *     - assistant + tool_use block → 'tool_use' event
 *     - assistant + text block → 'message' event
 *     - result subtype 'success' → 'done' event (content = result string)
 *     - result subtype != 'success' → 'error' event
 *     - otherwise → null (filtered)
 *
 * @param msg - SDK에서 수신한 메시지 / Message received from SDK
 * @param agentName - 이벤트를 발생시킨 에이전트 이름 / Agent name that emitted the event
 * @param logUnhandled - 미처리 이벤트 로깅 콜백 / Callback for logging unhandled event types
 * @returns 매핑된 AgentEvent 또는 null / Mapped AgentEvent or null
 */
export function mapSdkEvent(
  msg: SDKMessage,
  agentName: AgentName,
  logUnhandled: (eventType: string | undefined) => void,
): AgentEvent | null {
  const timestamp = new Date();

  switch (msg.type) {
    case 'assistant': {
      const blocks = msg.message.content;

      // WHY: tool_use 블록이 있으면 message보다 우선 처리
      const toolBlock = blocks.find((b): b is BetaToolUseBlock => b.type === 'tool_use');
      if (toolBlock) {
        return {
          type: 'tool_use',
          agentName,
          content: `Tool: ${toolBlock.name}`,
          timestamp,
          metadata: { toolName: toolBlock.name, toolInput: toolBlock.input },
        };
      }

      // WHY: text 블록을 모아 하나의 content로 합침 (줄바꿈으로 구분)
      const textBlocks = blocks.filter((b): b is BetaTextBlock => b.type === 'text');
      if (textBlocks.length > 0) {
        const text = textBlocks.map((b) => b.text).join('\n');
        return { type: 'message', agentName, content: text, timestamp };
      }

      // WHY: text/tool_use 블록이 없는 assistant 메시지는 필터링
      logUnhandled('assistant:empty');
      return null;
    }

    case 'result': {
      if (msg.subtype === 'success') {
        return {
          type: 'done',
          agentName,
          content: msg.result,
          timestamp,
          metadata: { stopReason: msg.stop_reason, cost: msg.total_cost_usd },
        };
      }
      // WHY: error_during_execution, error_max_turns 등 비성공 subtypes
      const errResult = msg as { errors?: string[] };
      return {
        type: 'error',
        agentName,
        content: errResult.errors?.[0] ?? 'Execution failed',
        timestamp,
        metadata: { subtype: msg.subtype },
      };
    }

    default:
      // WHY: 매핑 불가능한 이벤트 (system, stream_event 등)는 로그만 남기고 필터링
      logUnhandled((msg as { type?: string }).type);
      return null;
  }
}

// ── 유틸리티 / Utilities ──────────────────────────────────────────

/**
 * 에러 이벤트를 생성한다 / Create an error event
 *
 * @param agentName - 에이전트 이름 / Agent name
 * @param message - 에러 메시지 / Error message
 * @returns 에러 AgentEvent / Error AgentEvent
 */
export function createErrorEvent(agentName: AgentName, message: string): AgentEvent {
  return {
    type: 'error',
    agentName,
    content: message,
    timestamp: new Date(),
  };
}

/**
 * 세션 ID에서 에이전트명을 추출한다 / Extract agent name from session ID
 *
 * @description
 * KR: 세션 ID 형식 (projectId:featureId:agentName:phase)에서 에이전트명 추출.
 *     유효하지 않은 ID는 'architect' 기본값 반환.
 * EN: Extracts agent name from session ID format (projectId:featureId:agentName:phase).
 *     Returns 'architect' as default for invalid IDs.
 *
 * @param sessionId - 세션 ID / Session ID
 * @returns 에이전트 이름 / Agent name
 */
export function extractAgentNameFromSessionId(sessionId: string): AgentName {
  const parts = sessionId.split(':');
  if (parts.length === 4) {
    const agentName = parts[2];
    // WHY: 타입 가드로 유효한 AgentName만 허용
    const validAgents: AgentName[] = [
      'architect',
      'qa',
      'coder',
      'tester',
      'qc',
      'reviewer',
      'documenter',
    ];
    if (validAgents.includes(agentName as AgentName)) {
      return agentName as AgentName;
    }
  }
  // WHY: 기본값 반환 (최초 설계 담당)
  return 'architect';
}

/**
 * 세션 ID를 생성한다 / Generate session ID
 *
 * @description
 * KR: 프로젝트ID, 기능ID, 에이전트명, Phase를 조합하여 고유 세션 ID 생성.
 * EN: Combines projectId, featureId, agentName, phase into a unique session ID.
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param featureId - 기능 ID / Feature ID
 * @param name - 에이전트 이름 / Agent name
 * @param phase - 실행 Phase / Execution phase
 * @returns 세션 ID / Session ID
 */
export function generateSessionId(
  projectId: string,
  featureId: string,
  name: AgentName,
  phase: string,
): string {
  return `${projectId}:${featureId}:${name}:${phase}`;
}

export type { V2Session };
