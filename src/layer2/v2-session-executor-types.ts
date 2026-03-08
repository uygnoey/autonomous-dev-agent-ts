/**
 * V2 Session Executor 타입 정의 / V2 Session Executor type definitions
 *
 * @description
 * KR: V2SessionExecutor에서 사용하는 내부 타입과 공개 인터페이스를 정의한다.
 * EN: Defines internal types and public interfaces used by V2SessionExecutor.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';

// ── 내부 타입 정의 / Internal type definitions ───────────────────

/** V2 Session 인터페이스 — stream() 기반 이벤트 스트림 */
export type V2Session = {
  stream(prompt: string): AsyncIterable<V2SessionEvent>;
};

/** SDK 이벤트 타입 */
export type V2SessionEvent = {
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

/** SDK 프롬프트 옵션 */
export type V2PromptOptions = {
  systemPrompt: string;
  maxTurns?: number;
  temperature?: number;
  model?: string;
  tools?: string[];
  environment?: Record<string, string>;
};

// ── 공개 타입 / Public types ─────────────────────────────────────

/** V2 Session 생성 팩토리 타입 / Session factory type for dependency injection */
export type V2SessionFactory = (options: {
  readonly systemPrompt: string;
  readonly maxTurns?: number;
  readonly temperature?: number;
  readonly model?: string;
  readonly tools?: string[];
  readonly environment?: Record<string, string>;
}) => V2Session;

/**
 * V2 Session Executor 구성 옵션 / Configuration for V2SessionExecutor
 *
 * @description
 * KR: 세션 생성에 필요한 의존성과 옵션을 담는다.
 * EN: Holds dependencies and options needed for session creation.
 */
export interface V2SessionExecutorOptions {
  /** 인증 공급자 / Authentication provider */
  readonly authProvider: AuthProvider;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** SDK 기본 옵션 (선택) / SDK default options (optional) */
  readonly defaultOptions?: {
    readonly maxTurns?: number;
    readonly temperature?: number;
    readonly model?: string;
  };
  /** 세션 팩토리 (선택, 테스트 시 주입) / Session factory (optional, for testing) */
  readonly sessionFactory?: V2SessionFactory;
}
