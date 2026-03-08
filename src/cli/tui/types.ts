/**
 * TUI 타입 정의 / TUI type definitions
 *
 * @description
 * Claude Code 스타일 TUI 컴포넌트의 공통 타입.
 */

// ── 색상 / Colors ────────────────────────────────────────────────

/** ANSI 전경색 / ANSI foreground colors */
export type FgColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'
  | 'default';

/** ANSI 배경색 / ANSI background colors */
export type BgColor =
  | 'bgBlack'
  | 'bgRed'
  | 'bgGreen'
  | 'bgYellow'
  | 'bgBlue'
  | 'bgMagenta'
  | 'bgCyan'
  | 'bgWhite'
  | 'bgDefault';

/** 텍스트 스타일 / Text style */
export type TextStyle = 'bold' | 'dim' | 'italic' | 'underline' | 'inverse' | 'reset';

// ── 메시지 / Messages ────────────────────────────────────────────

/** 채팅 메시지 역할 / Chat message role */
export type ChatRole = 'user' | 'assistant' | 'system' | 'error';

/** 채팅 메시지 / Chat message */
export interface ChatMessage {
  /** 메시지 역할 / Message role */
  readonly role: ChatRole;
  /** 메시지 내용 / Message content */
  readonly content: string;
  /** 타임스탬프 / Timestamp */
  readonly timestamp?: Date;
}

// ── 박스 / Box ───────────────────────────────────────────────────

/** 박스 스타일 / Box style */
export type BoxStyle = 'single' | 'double' | 'rounded' | 'heavy';

/** 박스 옵션 / Box options */
export interface BoxOptions {
  /** 제목 / Title */
  readonly title?: string;
  /** 최대 너비 / Max width */
  readonly maxWidth?: number;
  /** 패딩 / Padding */
  readonly padding?: number;
  /** 박스 스타일 / Box style */
  readonly style?: BoxStyle;
  /** 전경색 / Foreground color */
  readonly color?: FgColor;
  /** 제목 색상 / Title color */
  readonly titleColor?: FgColor;
}

// ── 스피너 / Spinner ─────────────────────────────────────────────

/** 스피너 상태 / Spinner state */
export type SpinnerState = 'idle' | 'spinning' | 'success' | 'error';

/** 스피너 프레임 목록 / Spinner frame list */
export type SpinnerFrames = readonly string[];

/** 스피너 옵션 / Spinner options */
export interface SpinnerOptions {
  /** 표시할 텍스트 / Display text */
  readonly text: string;
  /** 색상 / Color */
  readonly color?: FgColor;
  /** 커스텀 프레임 / Custom frames */
  readonly frames?: SpinnerFrames;
  /** 프레임 간격(ms) / Frame interval (ms) */
  readonly interval?: number;
}

// ── 입력 / Input ─────────────────────────────────────────────────

/** 입력 이벤트 / Input event */
export interface InputEvent {
  /** 입력된 텍스트 / Input text */
  readonly text: string;
  /** Ctrl+C 여부 / Whether Ctrl+C was pressed */
  readonly isInterrupt: boolean;
  /** EOF 여부 / Whether EOF was received */
  readonly isEof: boolean;
}

// ── 렌더러 / Renderer ────────────────────────────────────────────

/** 렌더 대상 스트림 / Render target stream */
export interface RenderTarget {
  write(text: string): void;
  columns: number;
  rows: number;
  isTTY: boolean;
}

/** TUI 설정 / TUI configuration */
export interface TuiConfig {
  /** 색상 비활성화 여부 / Whether to disable colors */
  readonly noColor?: boolean;
  /** 출력 스트림 / Output stream */
  readonly output?: RenderTarget;
  /** 터미널 너비 / Terminal width */
  readonly width?: number;
}
