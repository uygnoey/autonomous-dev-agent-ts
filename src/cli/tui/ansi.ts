/**
 * ANSI 이스케이프 코드 / ANSI escape codes
 *
 * @description
 * 터미널 색상, 커서 제어, 텍스트 스타일을 위한 ANSI 이스케이프 시퀀스.
 * noColor 플래그로 전체 비활성화 가능.
 */

import type { BgColor, FgColor, TextStyle } from 'cli/tui/types.js';

// ── ESC 코드 상수 / ESC code constant ────────────────────────────

/** ANSI ESC 문자 */
const ESC = '\x1b';
/** CSI (Control Sequence Introducer) */
const CSI = `${ESC}[`;

// ── 전경색 코드 / Foreground color codes ─────────────────────────

const FG_CODES: Record<FgColor, string> = {
  black: '30',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  white: '37',
  brightBlack: '90',
  brightRed: '91',
  brightGreen: '92',
  brightYellow: '93',
  brightBlue: '94',
  brightMagenta: '95',
  brightCyan: '96',
  brightWhite: '97',
  default: '39',
};

// ── 배경색 코드 / Background color codes ─────────────────────────

const BG_CODES: Record<BgColor, string> = {
  bgBlack: '40',
  bgRed: '41',
  bgGreen: '42',
  bgYellow: '43',
  bgBlue: '44',
  bgMagenta: '45',
  bgCyan: '46',
  bgWhite: '47',
  bgDefault: '49',
};

// ── 스타일 코드 / Style codes ─────────────────────────────────────

const STYLE_CODES: Record<TextStyle, string> = {
  bold: '1',
  dim: '2',
  italic: '3',
  underline: '4',
  inverse: '7',
  reset: '0',
};

// ── 색상 비활성화 여부 / Color disable flag ───────────────────────

let _noColor = false;

/**
 * 색상 비활성화 설정 / Set no-color mode
 *
 * @param disabled - true면 모든 ANSI 코드가 빈 문자열 반환
 */
export function setNoColor(disabled: boolean): void {
  _noColor = disabled;
}

/**
 * 현재 색상 비활성화 여부 / Get current no-color state
 */
export function isNoColor(): boolean {
  return _noColor;
}

// ── 핵심 함수 / Core functions ────────────────────────────────────

/**
 * ANSI 이스케이프 시퀀스 생성 / Generate ANSI escape sequence
 *
 * @param code - SGR 파라미터 코드
 * @returns ANSI 시퀀스 문자열 (noColor 시 빈 문자열)
 */
function seq(code: string): string {
  if (_noColor) return '';
  return `${CSI}${code}m`;
}

/**
 * 전경색 ANSI 코드 반환 / Return foreground color ANSI code
 *
 * @param color - 색상 이름
 */
export function fg(color: FgColor): string {
  return seq(FG_CODES[color] ?? '39');
}

/**
 * 배경색 ANSI 코드 반환 / Return background color ANSI code
 *
 * @param color - 배경색 이름
 */
export function bg(color: BgColor): string {
  return seq(BG_CODES[color] ?? '49');
}

/**
 * 스타일 ANSI 코드 반환 / Return style ANSI code
 *
 * @param style - 스타일 이름
 */
export function style(s: TextStyle): string {
  return seq(STYLE_CODES[s] ?? '0');
}

/** 모든 ANSI 스타일 리셋 / Reset all ANSI styles */
export const reset = (): string => seq('0');

// ── 편의 함수 / Convenience functions ────────────────────────────

/**
 * 텍스트에 색상 + 스타일 적용 / Apply color and style to text
 *
 * @param text - 대상 텍스트
 * @param color - 전경색
 * @param styles - 적용할 스타일 목록
 * @returns 스타일이 적용된 텍스트 (항상 reset으로 끝남)
 *
 * @example
 * colorize('Hello', 'cyan', ['bold'])
 * // "\x1b[36m\x1b[1mHello\x1b[0m"
 */
export function colorize(text: string, color: FgColor, styles: TextStyle[] = []): string {
  if (_noColor) return text;
  const codes = [FG_CODES[color] ?? '39', ...styles.map((s) => STYLE_CODES[s] ?? '0')].join(';');
  return `${CSI}${codes}m${text}${seq('0')}`;
}

/**
 * 볼드 텍스트 / Bold text
 *
 * @param text - 대상 텍스트
 */
export function bold(text: string): string {
  if (_noColor) return text;
  return `${seq('1')}${text}${seq('0')}`;
}

/**
 * 흐린 텍스트 / Dim text
 *
 * @param text - 대상 텍스트
 */
export function dim(text: string): string {
  if (_noColor) return text;
  return `${seq('2')}${text}${seq('0')}`;
}

/**
 * 이탤릭 텍스트 / Italic text
 *
 * @param text - 대상 텍스트
 */
export function italic(text: string): string {
  if (_noColor) return text;
  return `${seq('3')}${text}${seq('0')}`;
}

// ── 커서 제어 / Cursor control ────────────────────────────────────

/** 커서를 줄 시작으로 이동 / Move cursor to start of line */
export const cursorToLineStart = (): string => (_noColor ? '' : `${CSI}G`);

/** 현재 줄 지우기 / Clear current line */
export const clearLine = (): string => (_noColor ? '' : `${CSI}2K`);

/** 줄 시작부터 커서까지 지우기 / Clear from line start to cursor */
export const clearToLineStart = (): string => (_noColor ? '' : `${CSI}1K`);

/** 커서부터 줄 끝까지 지우기 / Clear from cursor to end of line */
export const clearToLineEnd = (): string => (_noColor ? '' : `${CSI}0K`);

/** 커서 N줄 위로 이동 / Move cursor N lines up */
export const cursorUp = (n = 1): string => (_noColor ? '' : `${CSI}${n}A`);

/** 커서 N줄 아래로 이동 / Move cursor N lines down */
export const cursorDown = (n = 1): string => (_noColor ? '' : `${CSI}${n}B`);

/** 커서 숨기기 / Hide cursor */
export const hideCursor = (): string => (_noColor ? '' : `${ESC}[?25l`);

/** 커서 보이기 / Show cursor */
export const showCursor = (): string => (_noColor ? '' : `${ESC}[?25h`);

/** 화면 지우기 / Clear screen */
export const clearScreen = (): string => (_noColor ? '' : `${CSI}2J${CSI}H`);

/** 현재 줄 지우고 커서를 줄 시작으로 이동 / Clear line and move to start */
export const clearAndReturn = (): string =>
  _noColor ? '\r' : `${clearLine()}${cursorToLineStart()}`;

// ── 특수 색상 / Preset colors ─────────────────────────────────────

/** 시안 텍스트 (어시스턴트 메시지) / Cyan text (assistant messages) */
export const cyan = (text: string): string => colorize(text, 'cyan');

/** 초록 텍스트 (성공) / Green text (success) */
export const green = (text: string): string => colorize(text, 'green');

/** 노랑 텍스트 (경고/시스템) / Yellow text (warning/system) */
export const yellow = (text: string): string => colorize(text, 'yellow');

/** 빨강 텍스트 (오류) / Red text (error) */
export const red = (text: string): string => colorize(text, 'red');

/** 흰색 텍스트 / White text */
export const white = (text: string): string => colorize(text, 'white');

/** 밝은 흰색 텍스트 (사용자 입력) / Bright white text (user input) */
export const brightWhite = (text: string): string => colorize(text, 'brightWhite');

/** 어두운 회색 (타임스탬프 등) / Dark gray (timestamps etc.) */
export const gray = (text: string): string => colorize(text, 'brightBlack');

/** 밝은 시안 (헤더) / Bright cyan (header) */
export const brightCyan = (text: string): string => colorize(text, 'brightCyan');

// ── 스트립 / Strip ────────────────────────────────────────────────

/** ANSI 이스케이프 코드 제거 정규식 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence regex requires control chars
const ANSI_STRIP_REGEX = /\x1b\[[0-9;]*m|\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * 문자열에서 ANSI 코드 제거 / Strip ANSI codes from string
 *
 * @param text - ANSI 코드가 포함된 문자열
 * @returns 순수 텍스트
 *
 * @example
 * stripAnsi('\x1b[36mHello\x1b[0m') // 'Hello'
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_STRIP_REGEX, '');
}

/**
 * ANSI 코드를 무시하고 표시 너비 계산 / Calculate display width ignoring ANSI codes
 *
 * @param text - 텍스트
 * @returns 표시 너비
 */
export function displayWidth(text: string): number {
  return stripAnsi(text).length;
}
