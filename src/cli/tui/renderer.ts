/**
 * TUI 렌더러 / TUI renderer
 *
 * @description
 * Renderer 팩토리 및 공개 API 진입점.
 * 박스 프리미티브: renderer-box.ts
 * 메시지 포맷터: renderer-formatters.ts
 *
 * Factory and public API entry point for the TUI renderer.
 * Box primitives: renderer-box.ts
 * Message formatters: renderer-formatters.ts
 */

import { DEFAULT_WIDTH } from 'cli/tui/renderer-box.js';
import {
  formatAssistantMessage,
  formatErrorMessage,
  formatSuccessMessage,
  formatSystemMessage,
  formatUserMessage,
  renderDivider,
  renderHeader,
} from 'cli/tui/renderer-formatters.js';
import type { TuiConfig } from 'cli/tui/types.js';

// Re-export 모든 공개 API / Re-export all public API
export { renderBox } from 'cli/tui/renderer-box.js';
export {
  formatAssistantMessage,
  formatErrorMessage,
  formatOAuthExpiryWarning,
  formatSuccessMessage,
  formatSystemMessage,
  formatUserMessage,
  renderDivider,
  renderFooter,
  renderHeader,
  renderPrompt,
} from 'cli/tui/renderer-formatters.js';

// ── Renderer 팩토리 / Renderer factory ───────────────────────────

/**
 * 렌더러 인스턴스 생성 / Create renderer instance
 *
 * @param config - TUI 설정
 * @returns 렌더러 객체
 */
export function createRenderer(config: TuiConfig = {}) {
  const out = config.output ?? {
    write: (text: string) => process.stdout.write(text),
    get columns() {
      return config.width ?? process.stdout.columns ?? DEFAULT_WIDTH;
    },
    get rows() {
      return process.stdout.rows ?? 24;
    },
    get isTTY() {
      return process.stdout.isTTY ?? false;
    },
  };

  return {
    /** 텍스트 출력 */
    write(text: string): void {
      out.write(text);
    },
    /** 줄 출력 */
    writeLine(text = ''): void {
      out.write(`${text}\n`);
    },
    /** 사용자 메시지 출력 */
    renderUser(content: string, timestamp?: Date): void {
      out.write(formatUserMessage(content, timestamp));
    },
    /** 어시스턴트 메시지 출력 */
    renderAssistant(content: string, timestamp?: Date): void {
      out.write(formatAssistantMessage(content, timestamp));
    },
    /** 시스템 메시지 출력 */
    renderSystem(content: string): void {
      out.write(formatSystemMessage(content));
    },
    /** 에러 메시지 출력 */
    renderError(content: string): void {
      out.write(formatErrorMessage(content));
    },
    /** 성공 메시지 출력 */
    renderSuccess(content: string): void {
      out.write(formatSuccessMessage(content));
    },
    /** 헤더 출력 */
    renderHeader(version: string, model?: string): void {
      out.write(renderHeader(version, model));
    },
    /** 구분선 출력 */
    renderDivider(label?: string): void {
      out.write(`${renderDivider(label)}\n`);
    },
    /** TTY 여부 */
    get isTTY(): boolean {
      return out.isTTY;
    },
    /** 터미널 너비 */
    get width(): number {
      return out.columns;
    },
  };
}

export type Renderer = ReturnType<typeof createRenderer>;
