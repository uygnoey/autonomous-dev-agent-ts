/**
 * V2 Session Executor 타입 정의 / V2 Session Executor type definitions
 *
 * @description
 * KR: @anthropic-ai/claude-agent-sdk의 V2 Session API 기반 타입과 공개 인터페이스를 정의한다.
 *     SDKSession과 구조적으로 동일하게 유지하여 실제 SDK와 호환성을 보장한다.
 * EN: Defines types and public interfaces based on @anthropic-ai/claude-agent-sdk V2 Session API.
 *     Structurally identical to SDKSession for full SDK compatibility.
 */

import type {
  HookCallbackMatcher,
  HookEvent as SDKHookEvent,
  SDKMessage,
  SDKSessionOptions,
} from '@anthropic-ai/claude-agent-sdk';
import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';

// Re-export SDK types for use in executor and factory modules
export type { SDKMessage, SDKSessionOptions };

// ── V2 Session 인터페이스 / V2 Session Interface ─────────────────

/**
 * V2 Session 인터페이스 — @anthropic-ai/claude-agent-sdk SDKSession과 구조적으로 동일
 *
 * @description
 * KR: 실제 SDK의 SDKSession 인터페이스와 완전히 호환되어 교체 없이 사용 가능.
 *     테스트 시 동일 인터페이스를 구현한 mock으로 교체 가능.
 * EN: Fully compatible with SDK's SDKSession interface without any wrapping.
 *     Can be replaced with a mock implementing the same interface for testing.
 *
 * @example
 * // Production: sdkSessionFactory가 SDKSession을 직접 반환
 * // Test: mock이 이 인터페이스를 구현
 */
export type V2Session = {
  /** 세션 ID — 첫 메시지 수신 후 사용 가능 / Session ID — available after first message */
  readonly sessionId: string;
  /**
   * 에이전트에 메시지를 전송한다 / Send a message to the agent
   *
   * @param message - 전송할 메시지 / Message to send
   */
  send(message: string): Promise<void>;
  /**
   * 에이전트 이벤트 스트림을 반환한다 / Stream agent events
   *
   * @returns SDKMessage 이벤트 AsyncGenerator / SDKMessage event AsyncGenerator
   */
  stream(): AsyncGenerator<SDKMessage, void>;
  /** 세션을 종료한다 / Close the session */
  close(): void;
};

// ── V2 Session 팩토리 / V2 Session Factory ───────────────────────

/**
 * V2 Session 생성 팩토리 타입 / Session factory type for dependency injection
 *
 * @description
 * KR: SDKSessionOptions를 받아 V2Session을 반환한다.
 *     프로덕션: unstable_v2_createSession 사용
 *     테스트: mock 세션 반환
 * EN: Takes SDKSessionOptions and returns a V2Session.
 *     Production: Uses unstable_v2_createSession from @anthropic-ai/claude-agent-sdk
 *     Tests: Returns a mock session implementing V2Session interface
 */
export type V2SessionFactory = (options: SDKSessionOptions) => V2Session;

// ── V2 Session Executor 옵션 / V2 Session Executor Options ───────

/**
 * V2 Session Executor 구성 옵션 / Configuration options for V2SessionExecutor
 *
 * @description
 * KR: 세션 생성에 필요한 의존성과 기본 옵션을 담는다.
 * EN: Holds dependencies and default options needed for session creation.
 */
export interface V2SessionExecutorOptions {
  /** 인증 공급자 / Authentication provider */
  readonly authProvider: AuthProvider;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** SDK 기본 옵션 / SDK default options */
  readonly defaultOptions?: {
    /** 최대 턴 수 (기본 50) / Max turns (default 50) */
    readonly maxTurns?: number;
    /** 사용 모델 ID / Model ID to use */
    readonly model?: string;
  };
  /**
   * 세션 팩토리 (선택, 테스트 시 주입) / Session factory (optional, injected for testing)
   *
   * @description
   * KR: 미지정 시 sdkSessionFactory(unstable_v2_createSession 기반) 사용.
   * EN: Defaults to sdkSessionFactory (based on unstable_v2_createSession) when not specified.
   */
  readonly sessionFactory?: V2SessionFactory;
  /**
   * SDK 훅 콜백 (선택) / SDK hook callbacks (optional)
   *
   * @description
   * KR: PreToolUse, PostToolUse 등 SDK 훅 이벤트 콜백. StreamMonitor 연동에 사용.
   * EN: Hook event callbacks for PreToolUse, PostToolUse, etc. Used to connect StreamMonitor.
   */
  readonly hooks?: Partial<Record<SDKHookEvent, HookCallbackMatcher[]>>;
}
