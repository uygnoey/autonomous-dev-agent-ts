/**
 * 채팅 입력 처리 / Chat input processing
 *
 * @description
 * KR: 사용자 입력을 파싱하여 ChatEvent로 변환한다.
 * EN: Parses user input and converts it to ChatEvent.
 */

import { cyan } from 'cli/tui/ansi.js';
import type { ChatEvent } from 'cli/tui/chat-types.js';
import { createInputHandler } from 'cli/tui/input.js';

// ── 키워드 상수 / Keyword constants ─────────────────────────────

/** 종료 키워드 / Exit keywords */
const EXIT_KEYWORDS = new Set(['exit', 'quit', '종료', '나가기', '/exit', '/quit']);

/** 도움말 키워드 / Help keywords */
const HELP_KEYWORDS = new Set(['help', '도움말', '/help', '?']);

/** Contract 생성 키워드 / Contract keywords */
const CONTRACT_KEYWORDS = new Set(['확정', '완료', 'confirm', 'finalize', '/confirm']);

/** 대화 재시작 키워드 / Clear keywords */
const CLEAR_KEYWORDS = new Set(['clear', 'cls', '/clear', '초기화']);

/**
 * 채팅 입력 핸들러 / Chat input handler
 *
 * @description
 * KR: readline 기반 사용자 입력을 받아 ChatEvent로 분류한다.
 * EN: Reads user input via readline and classifies it as ChatEvent.
 */
export class ChatInputHandler {
  private readonly inputHandler: ReturnType<typeof createInputHandler>;

  constructor() {
    this.inputHandler = createInputHandler();
  }

  /**
   * 사용자 입력 대기 / Wait for user input
   *
   * @returns 채팅 이벤트 / Chat event
   */
  async waitForInput(): Promise<ChatEvent> {
    const prompt = `${cyan('❯')} `;
    const event = await this.inputHandler.readLine(prompt);

    if (event.isInterrupt) {
      return { type: 'interrupt' };
    }

    if (event.isEof) {
      return { type: 'eof' };
    }

    const text = event.text.trim();

    if (text === '') {
      // WHY: 빈 입력은 무시하고 다시 대기 -- 사용자가 실수로 엔터 누른 경우
      return this.waitForInput();
    }

    return this.classifyInput(text);
  }

  /**
   * 입력 텍스트를 ChatEvent로 분류 / Classify input text as ChatEvent
   *
   * @param text - 사용자 입력 텍스트 / User input text
   * @returns 분류된 채팅 이벤트 / Classified chat event
   */
  private classifyInput(text: string): ChatEvent {
    const lower = text.toLowerCase();

    if (EXIT_KEYWORDS.has(lower) || EXIT_KEYWORDS.has(text)) {
      return { type: 'exit' };
    }

    if (HELP_KEYWORDS.has(lower) || HELP_KEYWORDS.has(text)) {
      return { type: 'help' };
    }

    if (CLEAR_KEYWORDS.has(lower) || CLEAR_KEYWORDS.has(text)) {
      return { type: 'clear' };
    }

    if (
      CONTRACT_KEYWORDS.has(lower) ||
      CONTRACT_KEYWORDS.has(text) ||
      CONTRACT_KEYWORDS.has(lower.split(' ')[0] ?? '')
    ) {
      return { type: 'contract' };
    }

    return { type: 'message', text };
  }
}
