/**
 * Claude API 타입 정의 / Claude API type definitions
 *
 * @description
 * KR: ClaudeApi에서 사용하는 요청/응답 타입과 콜백을 정의한다.
 * EN: Defines request/response types and callbacks used by ClaudeApi.
 */

/**
 * Claude API 요청 옵션 / Claude API request options
 *
 * @description
 * KR: Claude Messages API 호출 시 필요한 옵션을 정의한다.
 * EN: Defines options for Claude Messages API calls.
 */
export interface ClaudeApiRequestOptions {
  /** 사용할 모델 / Model to use */
  readonly model?: string;
  /** 최대 출력 토큰 수 / Maximum output tokens */
  readonly maxTokens?: number;
  /** 온도 (0~1) / Temperature (0~1) */
  readonly temperature?: number;
  /** 타임아웃 (밀리초) / Timeout (milliseconds) */
  readonly timeoutMs?: number;
  /** 시스템 프롬프트 / System prompt */
  readonly system?: string;
}

/**
 * Claude API 응답 메타데이터 / Claude API response metadata
 *
 * @description
 * KR: 토큰 사용량, 모델, 중단 이유 등을 포함한다.
 * EN: Includes token usage, model, and stop reason.
 */
export interface ClaudeApiResponseMetadata {
  /** 사용된 모델 / Model used */
  readonly model: string;
  /** 입력 토큰 수 / Input tokens */
  readonly inputTokens: number;
  /** 출력 토큰 수 / Output tokens */
  readonly outputTokens: number;
  /** 중단 이유 / Stop reason */
  readonly stopReason: string;
}

/**
 * Claude API 비스트리밍 응답 / Claude API non-streaming response
 *
 * @description
 * KR: 전체 응답 텍스트와 메타데이터를 반환한다.
 * EN: Returns complete response text and metadata.
 */
export interface ClaudeApiResponse {
  /** 응답 텍스트 / Response text */
  readonly content: string;
  /** 응답 메타데이터 / Response metadata */
  readonly metadata: ClaudeApiResponseMetadata;
}

/**
 * Claude API 스트리밍 이벤트 / Claude API streaming event
 *
 * @description
 * KR: 스트리밍 중 발생하는 이벤트 타입을 정의한다.
 * EN: Defines event types during streaming.
 */
export type ClaudeStreamEvent =
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'content_stop' }
  | { type: 'message_complete'; metadata: ClaudeApiResponseMetadata };

/**
 * 스트리밍 콜백 / Streaming callback
 *
 * @description
 * KR: 스트리밍 중 발생하는 이벤트를 처리하는 콜백 함수.
 * EN: Callback function to handle events during streaming.
 */
export type StreamCallback = (event: ClaudeStreamEvent) => void;
