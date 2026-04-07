/**
 * LLM Provider 인터페이스 / LLM Provider abstraction interface
 *
 * @description
 * KR: 다중 LLM 제공자(Claude, OpenAI 등)를 추상화하는 공통 인터페이스.
 *     chat(), stream(), getCapabilities(), estimateCost()를 정의한다.
 * EN: Common interface abstracting multiple LLM providers (Claude, OpenAI, etc.).
 *     Defines chat(), stream(), getCapabilities(), estimateCost().
 */

import type { Result } from 'core/types.js';

// ── LLM 메시지 타입 / LLM Message Types ─────────────────────────

/** LLM 메시지 역할 / LLM message role */
export type LlmRole = 'user' | 'assistant' | 'system';

/**
 * LLM 요청 메시지 / LLM request message
 *
 * @description
 * KR: 대화 이력 또는 단일 프롬프트를 표현하는 메시지 단위.
 * EN: A single message unit representing conversation history or a prompt.
 */
export interface LlmMessage {
  /** 메시지 역할 / Message role */
  readonly role: LlmRole;
  /** 메시지 내용 / Message content */
  readonly content: string;
}

// ── LLM 응답 타입 / LLM Response Types ──────────────────────────

/**
 * LLM 채팅 응답 / LLM chat response
 *
 * @description
 * KR: LLM의 동기식 응답 결과. 텍스트, 토큰 사용량, 종료 사유를 포함.
 * EN: Synchronous LLM response. Includes text, token usage, and stop reason.
 */
export interface LlmChatResponse {
  /** 응답 텍스트 / Response text */
  readonly content: string;
  /** 사용 모델 ID / Model ID used */
  readonly model: string;
  /** 토큰 사용량 / Token usage */
  readonly usage: LlmTokenUsage;
  /** 응답 종료 사유 / Stop reason */
  readonly stopReason: string | null;
}

/**
 * 토큰 사용량 / Token usage information
 */
export interface LlmTokenUsage {
  /** 입력 토큰 수 / Input token count */
  readonly inputTokens: number;
  /** 출력 토큰 수 / Output token count */
  readonly outputTokens: number;
}

// ── 스트림 이벤트 타입 / Stream Event Types ──────────────────────

/** 스트림 이벤트 종류 / Stream event type */
export type LlmStreamEventType = 'text_delta' | 'tool_use' | 'done' | 'error';

/**
 * LLM 스트림 이벤트 / LLM stream event
 *
 * @description
 * KR: LLM 스트리밍 응답에서 yield되는 단일 이벤트.
 * EN: A single event yielded from an LLM streaming response.
 */
export interface LlmStreamEvent {
  /** 이벤트 유형 / Event type */
  readonly type: LlmStreamEventType;
  /** 이벤트 데이터 / Event data (text delta, tool call info, or error message) */
  readonly data: string;
  /** 추가 메타데이터 (선택) / Additional metadata (optional) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Provider 기능 / Provider Capabilities ────────────────────────

/**
 * LLM 제공자 기능 정보 / LLM provider capability descriptor
 *
 * @description
 * KR: 제공자가 지원하는 기능, 제한, 모델 정보를 나타낸다.
 * EN: Describes capabilities, limits, and model info supported by a provider.
 */
export interface LlmCapabilities {
  /** 제공자 이름 / Provider name (e.g., 'claude', 'openai') */
  readonly providerName: string;
  /** 기본 모델 ID / Default model ID */
  readonly defaultModel: string;
  /** 지원 모델 목록 / Supported model list */
  readonly supportedModels: readonly string[];
  /** 스트리밍 지원 여부 / Streaming support */
  readonly supportsStreaming: boolean;
  /** Agent Teams (멀티 에이전트) 지원 여부 / Agent Teams support */
  readonly supportsAgentTeams: boolean;
  /** 최대 컨텍스트 토큰 수 / Max context tokens */
  readonly maxContextTokens: number;
  /** 최대 출력 토큰 수 / Max output tokens */
  readonly maxOutputTokens: number;
}

// ── 비용 추정 / Cost Estimation ──────────────────────────────────

/**
 * LLM 비용 추정 결과 / LLM cost estimation result
 */
export interface LlmCostEstimate {
  /** 추정 입력 토큰 비용 (USD) / Estimated input token cost (USD) */
  readonly inputCostUsd: number;
  /** 추정 출력 토큰 비용 (USD) / Estimated output token cost (USD) */
  readonly outputCostUsd: number;
  /** 추정 총 비용 (USD) / Estimated total cost (USD) */
  readonly totalCostUsd: number;
  /** 사용 모델 ID / Model used for estimation */
  readonly model: string;
}

// ── 채팅 옵션 / Chat Options ─────────────────────────────────────

/**
 * LLM 채팅/스트림 호출 옵션 / Options for chat/stream calls
 */
export interface LlmCallOptions {
  /** 사용 모델 ID (미지정 시 기본 모델) / Model ID (defaults to provider default) */
  readonly model?: string;
  /** 최대 출력 토큰 수 / Max output tokens */
  readonly maxTokens?: number;
  /** 온도 (0.0 ~ 1.0) / Temperature (0.0 ~ 1.0) */
  readonly temperature?: number;
  /** 시스템 프롬프트 / System prompt */
  readonly systemPrompt?: string;
  /** 사용 가능한 도구 목록 / Available tools */
  readonly tools?: readonly string[];
}

// ── LLM Provider 인터페이스 / LLM Provider Interface ─────────────

/**
 * LLM 제공자 추상화 인터페이스 / LLM Provider abstraction interface
 *
 * @description
 * KR: 다중 LLM 제공자를 교체 가능하게 추상화한다.
 *     ClaudeProvider, OpenAiProvider 등이 이 인터페이스를 구현한다.
 * EN: Abstraction for swappable LLM providers.
 *     ClaudeProvider, OpenAiProvider, etc. implement this interface.
 */
export interface LlmProvider {
  /** 제공자 식별 이름 / Provider identifier name */
  readonly name: string;

  /**
   * 동기식 채팅 요청 / Synchronous chat request
   *
   * @param messages - 대화 메시지 배열 / Array of conversation messages
   * @param options - 호출 옵션 (선택) / Call options (optional)
   * @returns 채팅 응답 Result / Chat response Result
   */
  chat(messages: readonly LlmMessage[], options?: LlmCallOptions): Promise<Result<LlmChatResponse>>;

  /**
   * 스트리밍 채팅 요청 / Streaming chat request
   *
   * @param messages - 대화 메시지 배열 / Array of conversation messages
   * @param options - 호출 옵션 (선택) / Call options (optional)
   * @returns 스트림 이벤트 AsyncGenerator / Stream event AsyncGenerator
   */
  stream(
    messages: readonly LlmMessage[],
    options?: LlmCallOptions,
  ): AsyncGenerator<LlmStreamEvent, void>;

  /**
   * 제공자 기능 정보를 반환한다 / Returns provider capabilities
   *
   * @returns 기능 정보 객체 / Capabilities descriptor
   */
  getCapabilities(): LlmCapabilities;

  /**
   * 요청 비용을 추정한다 / Estimates request cost
   *
   * @param inputTokens - 예상 입력 토큰 수 / Estimated input tokens
   * @param outputTokens - 예상 출력 토큰 수 / Estimated output tokens
   * @param model - 사용 모델 ID (선택) / Model ID (optional)
   * @returns 비용 추정 결과 / Cost estimation result
   */
  estimateCost(inputTokens: number, outputTokens: number, model?: string): LlmCostEstimate;
}
