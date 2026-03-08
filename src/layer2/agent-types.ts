/**
 * layer2 에이전트 설정/이벤트 타입 정의 / Layer 2 agent configuration and event type definitions
 *
 * @description
 * KR: 에이전트 스폰 설정, 실행 이벤트, 실행기 추상화 관련 타입.
 * EN: Types for agent spawn configuration, execution events, and executor abstraction.
 */

import type { AgentName, Phase } from 'core/types.js';

// ── 에이전트 설정 / Agent Configuration ─────────────────────────

/**
 * 에이전트 스폰 설정 / Agent spawn configuration
 *
 * @description
 * KR: 에이전트를 생성할 때 필요한 모든 설정을 담는다.
 * EN: Holds all configuration needed to spawn an agent.
 */
export interface AgentConfig {
  /** 에이전트 이름 / Agent name */
  readonly name: AgentName;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 현재 Phase / Current phase */
  readonly phase: Phase;
  /** 시스템 프롬프트 / System prompt */
  readonly systemPrompt: string;
  /** 실행 프롬프트 / Execution prompt */
  readonly prompt: string;
  /** 사용 가능한 도구 목록 / Available tool names */
  readonly tools: readonly string[];
  /** 최대 턴 수 (선택) / Max turns (optional) */
  readonly maxTurns?: number;
  /** 환경변수 오버라이드 (선택) / Environment variable overrides (optional) */
  readonly env?: Readonly<Record<string, string>>;
}

// ── 에이전트 이벤트 / Agent Events ──────────────────────────────

/**
 * 에이전트 이벤트 유형 / Agent event type
 *
 * @description
 * KR: 에이전트 실행 중 발생하는 이벤트의 종류.
 * EN: Types of events emitted during agent execution.
 */
export type AgentEventType = 'message' | 'tool_use' | 'tool_result' | 'error' | 'done';

/**
 * 에이전트 실행 이벤트 / Agent execution event (yielded from executor)
 *
 * @description
 * KR: 에이전트 실행기에서 yield되는 단일 이벤트.
 * EN: A single event yielded from the agent executor.
 */
export interface AgentEvent {
  /** 이벤트 유형 / Event type */
  readonly type: AgentEventType;
  /** 이벤트를 발생시킨 에이전트 / Agent that emitted this event */
  readonly agentName: AgentName;
  /** 이벤트 내용 / Event content */
  readonly content: string;
  /** 이벤트 타임스탬프 / Event timestamp */
  readonly timestamp: Date;
  /** 추가 메타데이터 (선택) / Additional metadata (optional) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── 에이전트 실행기 인터페이스 / Agent Executor Interface ────────

/**
 * 에이전트 실행기 추상화 / Agent executor abstraction (over Claude Agent SDK)
 *
 * @description
 * KR: Claude Agent SDK에 대한 추상화. 구현체는 SDK 설치 후 교체 가능.
 * EN: Abstraction over Claude Agent SDK. Implementations are swappable after SDK install.
 */
export interface AgentExecutor {
  /**
   * 에이전트를 실행한다 / Execute an agent
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;

  /**
   * 이전 세션을 재개한다 / Resume a previous session
   *
   * @param sessionId - 재개할 세션 ID / Session ID to resume
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  resume(sessionId: string): AsyncIterable<AgentEvent>;
}
