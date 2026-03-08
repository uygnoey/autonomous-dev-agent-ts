/**
 * V2 Session 팩토리 / V2 Session Factory
 *
 * @description
 * KR: Anthropic SDK 기반 V2Session 팩토리와 이벤트 추출 헬퍼를 제공한다.
 * EN: Provides Anthropic SDK-based V2Session factory and event extraction helpers.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentName } from 'core/types.js';
import type { AgentEvent } from 'layer2/types.js';
import type { V2PromptOptions, V2Session, V2SessionEvent, V2SessionFactory } from 'layer2/v2-session-executor-types.js';

/**
 * Anthropic SDK 스트림을 V2SessionEvent 스트림으로 변환한다.
 *
 * @description
 * KR: 에러를 throw하지 않고 error 이벤트로 yield한다. (Result 패턴 준수)
 * EN: Yields error events instead of throwing. (Result pattern compliance)
 */
export async function* anthropicMessageStream(
  client: Anthropic,
  prompt: string,
  options: V2PromptOptions,
): AsyncIterable<V2SessionEvent> {
  try {
    const stream = client.messages.stream({
      model: options.model ?? 'claude-opus-4-6',
      max_tokens: 8192,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield { type: 'message', content: chunk.delta.text };
      } else if (chunk.type === 'message_stop') {
        yield { type: 'message_stop', stop_reason: 'end_turn' };
      }
    }
  } catch (error: unknown) {
    yield { type: 'error', error, message: String(error) };
  }
}

/**
 * @anthropic-ai/sdk의 Messages API를 사용하는 V2Session 팩토리.
 *
 * @description
 * KR: Anthropic client를 생성하고 anthropicMessageStream으로 스트림을 제공한다.
 *     V2SessionFactory 기본값으로 사용된다.
 * EN: Creates Anthropic client and provides stream via anthropicMessageStream.
 *     Used as the default V2SessionFactory.
 */
export const anthropicSessionFactory: V2SessionFactory = (options) => {
  // WHY: environment에 API 키가 있으면 해당 값 우선, 없으면 process.env에서 읽음
  const apiKey = options.environment?.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });

  return {
    stream: (prompt: string) => anthropicMessageStream(client, prompt, options),
  };
};

/**
 * SDK 이벤트에서 메시지 내용을 추출한다 / Extract message content from SDK event
 *
 * @param event - SDK 이벤트 / SDK event
 * @returns 메시지 내용 / Message content
 */
export function extractContent(event: V2SessionEvent): string {
  if ('content' in event && typeof event.content === 'string') {
    return event.content;
  }
  if ('content' in event && Array.isArray(event.content)) {
    return event.content
      .filter((block: unknown): block is { type: string; text: string } => {
        return (
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          (block as { type: string }).type === 'text' &&
          'text' in block &&
          typeof (block as { text: unknown }).text === 'string'
        );
      })
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}

/**
 * tool_result 이벤트에서 결과 내용을 추출한다 / Extract tool result content
 *
 * @param event - SDK 이벤트 / SDK event
 * @returns 도구 결과 내용 / Tool result content
 */
export function extractToolResultContent(event: V2SessionEvent): string {
  if ('content' in event) {
    if (typeof event.content === 'string') {
      return event.content;
    }
    if (Array.isArray(event.content)) {
      return JSON.stringify(event.content);
    }
  }
  return 'Tool result received';
}

/**
 * error 이벤트에서 에러 메시지를 추출한다 / Extract error message from error event
 *
 * @param event - SDK 이벤트 / SDK event
 * @returns 에러 메시지 / Error message
 */
export function extractErrorContent(event: V2SessionEvent): string {
  if ('error' in event && typeof event.error === 'object' && event.error !== null) {
    const errorObj = event.error as { message?: string };
    return errorObj.message ?? 'Unknown error';
  }
  if ('message' in event && typeof event.message === 'string') {
    return event.message;
  }
  return 'Unknown error occurred';
}

/**
 * SDK 이벤트를 AgentEvent로 매핑한다 / Map SDK event to AgentEvent
 *
 * @param sdkEvent - SDK에서 수신한 이벤트 / Event from SDK
 * @param agentName - 이벤트를 발생시킨 에이전트 / Agent that emitted the event
 * @param logUnhandled - 미처리 이벤트 로깅 콜백 / Callback for logging unhandled events
 * @returns 매핑된 AgentEvent 또는 null / Mapped AgentEvent or null
 */
export function mapSdkEvent(
  sdkEvent: V2SessionEvent,
  agentName: AgentName,
  logUnhandled: (eventType: string | undefined) => void,
): AgentEvent | null {
  const timestamp = new Date();

  // WHY: SDK 이벤트 타입에 따라 AgentEvent 타입 결정
  switch (sdkEvent.type) {
    case 'message':
      return {
        type: 'message',
        agentName,
        content: extractContent(sdkEvent),
        timestamp,
        metadata: { sdkEvent },
      };

    case 'tool_use':
      return {
        type: 'tool_use',
        agentName,
        content: `Tool: ${sdkEvent.name || 'unknown'}`,
        timestamp,
        metadata: {
          toolName: sdkEvent.name,
          toolInput: sdkEvent.input,
        },
      };

    case 'tool_result':
      return {
        type: 'tool_result',
        agentName,
        content: extractToolResultContent(sdkEvent),
        timestamp,
        metadata: {
          toolName: sdkEvent.tool_use_id,
          isError: sdkEvent.is_error,
        },
      };

    case 'error':
      return {
        type: 'error',
        agentName,
        content: extractErrorContent(sdkEvent),
        timestamp,
        metadata: { sdkEvent },
      };

    case 'message_stop':
    case 'session_end':
      return {
        type: 'done',
        agentName,
        content: 'Agent execution completed',
        timestamp,
        metadata: { stopReason: sdkEvent.stop_reason },
      };

    default:
      // WHY: 매핑 불가능한 이벤트는 로그만 남기고 필터링
      logUnhandled((sdkEvent as { type?: string }).type);
      return null;
  }
}

/**
 * 에러 이벤트를 생성한다 / Create an error event
 *
 * @param agentName - 에이전트 이름 / Agent name
 * @param message - 에러 메시지 / Error message
 * @returns 에러 이벤트 / Error event
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
 * EN: Extracts agent name from session ID format.
 *     Returns 'architect' as default for invalid IDs.
 *
 * @param sessionId - 세션 ID / Session ID
 * @returns 에이전트 이름 / Agent name
 */
export function extractAgentNameFromSessionId(sessionId: string): AgentName {
  const parts = sessionId.split(':');
  if (parts.length === 4) {
    const agentName = parts[2];
    // WHY: 타입 가드로 유효한 AgentName 검증
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
 * KR: 프로젝트ID, 기능ID, 에이전트명, Phase를 조합하여 세션 ID 생성.
 * EN: Combines projectId, featureId, agentName, phase to generate session ID.
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param featureId - 기능 ID / Feature ID
 * @param name - 에이전트 이름 / Agent name
 * @param phase - Phase / Phase
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
