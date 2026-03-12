/**
 * TUI 채팅 인터페이스 / TUI chat interface
 *
 * @description
 * KR: ChatUi 클래스 진입점. 입력(chat-input), 출력(chat-output), 타입(chat-types)을 조합한다.
 * EN: ChatUi class entry point. Composes input (chat-input), output (chat-output), and types (chat-types).
 */

import { ChatInputHandler } from 'cli/tui/chat-input.js';
import { ChatOutputHandler } from 'cli/tui/chat-output.js';
import type { ChatEvent, ChatUiOptions } from 'cli/tui/chat-types.js';
import type { ChatMessage } from 'cli/tui/types.js';

// ── re-export ───────────────────────────────────────────────────

export type { ChatEvent, ChatUiOptions } from 'cli/tui/chat-types.js';

// ── ChatUi (Facade) ─────────────────────────────────────────────

/**
 * TUI 채팅 인터페이스 / TUI chat interface
 *
 * @description
 * KR: Claude Code 스타일의 인터랙티브 채팅 루프.
 *     입력 처리(ChatInputHandler)와 출력 렌더링(ChatOutputHandler)을 조합한다.
 * EN: Interactive chat loop in Claude Code style.
 *     Composes ChatInputHandler (input) and ChatOutputHandler (output).
 *
 * @example
 * const chat = new ChatUi({ version: '0.0.1', model: 'claude-opus-4-6' });
 * chat.start();
 * chat.showMessage({ role: 'assistant', content: '안녕하세요!' });
 * const event = await chat.waitForInput();
 */
export class ChatUi {
  private readonly input: ChatInputHandler;
  private readonly output: ChatOutputHandler;
  private readonly options: ChatUiOptions;
  private started = false;

  constructor(options: ChatUiOptions = {}) {
    this.options = options;
    this.input = new ChatInputHandler();
    this.output = new ChatOutputHandler(options.tuiConfig);
  }

  /**
   * 채팅 UI 시작 (헤더 표시) / Start chat UI (show header)
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.output.renderHeader(this.options);
  }

  /**
   * 어시스턴트 메시지 표시 / Show assistant message
   *
   * @param message - 표시할 메시지 / Message to display
   */
  showMessage(message: ChatMessage): void {
    this.output.showMessage(message);
  }

  /**
   * 여러 메시지 한 번에 표시 / Show multiple messages
   *
   * @param messages - 메시지 목록 / Message list
   */
  showMessages(messages: ChatMessage[]): void {
    this.output.showMessages(messages);
  }

  /**
   * 스피너 시작 / Start spinner
   *
   * @param text - 스피너 텍스트 / Spinner text
   */
  startSpinner(text: string): void {
    this.output.startSpinner(text);
  }

  /**
   * 스피너 성공으로 종료 / Stop spinner with success
   *
   * @param text - 완료 텍스트 / Completion text
   */
  succeedSpinner(text?: string): void {
    this.output.succeedSpinner(text);
  }

  /**
   * 스피너 실패로 종료 / Stop spinner with failure
   *
   * @param text - 실패 텍스트 / Failure text
   */
  failSpinner(text?: string): void {
    this.output.failSpinner(text);
  }

  /**
   * 스피너 중단 / Stop spinner
   */
  stopSpinner(): void {
    this.output.stopSpinner();
  }

  /**
   * 성공 메시지 / Success message
   *
   * @param text - 텍스트
   */
  success(text: string): void {
    this.output.success(text);
  }

  /**
   * 에러 메시지 / Error message
   *
   * @param text - 텍스트
   */
  error(text: string): void {
    this.output.error(text);
  }

  /**
   * 시스템 메시지 / System message
   *
   * @param text - 텍스트
   */
  system(text: string): void {
    this.output.system(text);
  }

  /**
   * 사용자 입력 대기 / Wait for user input
   *
   * @returns 채팅 이벤트 / Chat event
   */
  async waitForInput(): Promise<ChatEvent> {
    return this.input.waitForInput();
  }

  /**
   * 도움말 표시 / Show help
   */
  showHelp(): void {
    this.output.showHelp();
  }

  /**
   * 종료 메시지 표시 / Show exit message
   */
  showExit(): void {
    this.output.showExit();
  }

  /**
   * Contract 생성 시작 알림 / Notify contract generation start
   */
  showContractStart(): void {
    this.output.showContractStart();
  }

  /**
   * Contract 생성 완료 알림 / Notify contract generation complete
   *
   * @param path - Contract 파일 경로 / Contract file path
   */
  showContractComplete(path: string): void {
    this.output.showContractComplete(path);
  }

  /**
   * 스트리밍 응답 시작 / Start streaming response
   *
   * @param timestamp - 시작 시각 (선택) / Start time (optional)
   */
  showStreamingStart(timestamp?: Date): void {
    this.output.showStreamingStart(timestamp);
  }

  /**
   * 스트리밍 텍스트 델타 출력 / Write streaming text delta
   *
   * @param text - 출력할 텍스트 조각 / Text chunk to output
   */
  showStreamingDelta(text: string): void {
    this.output.showStreamingDelta(text);
  }

  /**
   * 스트리밍 응답 종료 / End streaming response
   */
  showStreamingEnd(): void {
    this.output.showStreamingEnd();
  }

  /**
   * 인터럽트 종료 메시지 / Show interrupt exit
   */
  showInterrupt(): void {
    this.output.showInterrupt();
  }
}

/**
 * ChatUi 팩토리 함수 / ChatUi factory function
 *
 * @param options - 옵션 / Options
 * @returns 새 ChatUi 인스턴스 / New ChatUi instance
 */
export function createChatUi(options: ChatUiOptions = {}): ChatUi {
  return new ChatUi(options);
}
