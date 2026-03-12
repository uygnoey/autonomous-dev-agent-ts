/**
 * 채팅 UI 타입 정의 / Chat UI type definitions
 *
 * @description
 * KR: ChatUi에서 사용하는 공유 타입/인터페이스를 정의한다.
 * EN: Defines shared types/interfaces used by ChatUi.
 */

import type { TuiConfig } from 'cli/tui/types.js';

// ── 채팅 이벤트 타입 / Chat event types ─────────────────────────

/** 채팅 이벤트 / Chat event */
export type ChatEvent =
  | { type: 'message'; text: string }
  | { type: 'exit' }
  | { type: 'contract' }
  | { type: 'help' }
  | { type: 'clear' }
  | { type: 'interrupt' }
  | { type: 'eof' };

/**
 * 채팅 UI 옵션 / Chat UI options
 */
export interface ChatUiOptions {
  /** 버전 문자열 / Version string */
  readonly version?: string;
  /** 모델 이름 / Model name */
  readonly model?: string;
  /** 프로젝트 이름 / Project name */
  readonly projectName?: string;
  /** 현재 Phase / Current phase */
  readonly phase?: string;
  /** TUI 설정 / TUI config */
  readonly tuiConfig?: TuiConfig;
}
