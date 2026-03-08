/**
 * TUI 모듈 public API / TUI module public API
 */

export {
  setNoColor,
  isNoColor,
  colorize,
  bold,
  dim,
  italic,
  cyan,
  green,
  yellow,
  red,
  white,
  brightWhite,
  gray,
  brightCyan,
  stripAnsi,
  displayWidth,
  cursorToLineStart,
  clearLine,
  clearAndReturn,
  hideCursor,
  showCursor,
  fg,
  bg,
  style,
  reset,
} from 'cli/tui/ansi.js';

export {
  renderBox,
  renderHeader,
  renderFooter,
  renderDivider,
  renderPrompt,
  formatUserMessage,
  formatAssistantMessage,
  formatSystemMessage,
  formatErrorMessage,
  formatSuccessMessage,
  createRenderer,
} from 'cli/tui/renderer.js';
export type { Renderer } from 'cli/tui/renderer.js';

export {
  Spinner,
  createSpinner,
  DEFAULT_FRAMES,
  BRAILLE_FRAMES,
  DOTS_FRAMES,
  ARROW_FRAMES,
  ASCII_FRAMES,
} from 'cli/tui/spinner.js';

export { createInputHandler } from 'cli/tui/input.js';
export type { InputHandler, InputHandlerOptions } from 'cli/tui/input.js';

export { ChatUi, createChatUi } from 'cli/tui/chat.js';
export type { ChatUiOptions, ChatEvent } from 'cli/tui/chat.js';

export type {
  FgColor,
  BgColor,
  TextStyle,
  ChatMessage,
  ChatRole,
  BoxOptions,
  BoxStyle,
  SpinnerOptions,
  SpinnerState,
  SpinnerFrames,
  InputEvent,
  RenderTarget,
  TuiConfig,
} from 'cli/tui/types.js';
