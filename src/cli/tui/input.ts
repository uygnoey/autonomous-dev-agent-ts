/**
 * TUI 입력 처리기 / TUI input handler
 *
 * @description
 * readline 기반 안전한 입력 처리.
 * TTY/비TTY 환경 모두 지원, Ctrl+C 인터럽트 처리.
 */

import { createInterface } from 'node:readline';
import type { InputEvent } from 'cli/tui/types.js';

// ── 입력 처리기 / Input handler ───────────────────────────────────

/**
 * 입력 처리기 옵션 / Input handler options
 */
export interface InputHandlerOptions {
  /** 프롬프트 문자열 / Prompt string */
  readonly prompt?: string;
  /** 입력 스트림 / Input stream */
  readonly input?: NodeJS.ReadableStream;
  /** 출력 스트림 / Output stream */
  readonly output?: NodeJS.WritableStream;
}

/**
 * TUI 입력 처리기 / TUI input handler
 *
 * @description
 * 단일 입력 라인을 읽는 readline 래퍼.
 * TTY 환경에서 프롬프트 표시, 비TTY에서는 프롬프트 숨김.
 *
 * @example
 * const handler = createInputHandler();
 * const event = await handler.readLine('> ');
 * if (event.isInterrupt) process.exit(0);
 * console.log(event.text);
 */
export function createInputHandler(options: InputHandlerOptions = {}) {
  const inputStream = options.input ?? process.stdin;
  const outputStream = options.output ?? process.stdout;

  /**
   * 한 줄 읽기 / Read one line
   *
   * @param prompt - 인라인 프롬프트 (선택)
   * @returns 입력 이벤트
   */
  async function readLine(prompt = ''): Promise<InputEvent> {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: inputStream,
        output: outputStream,
        terminal: (outputStream as NodeJS.WriteStream).isTTY,
      });

      let resolved = false;

      const done = (event: InputEvent) => {
        if (resolved) return;
        resolved = true;
        rl.close();
        resolve(event);
      };

      // Ctrl+C 처리
      rl.on('SIGINT', () => {
        done({ text: '', isInterrupt: true, isEof: false });
      });

      // EOF 처리 (파이프 종료 등)
      rl.on('close', () => {
        if (!resolved) {
          done({ text: '', isInterrupt: false, isEof: true });
        }
      });

      rl.question(prompt, (answer) => {
        done({ text: answer, isInterrupt: false, isEof: false });
      });
    });
  }

  /**
   * 여러 줄 읽기 (빈 줄에서 종료) / Read multiple lines (stop on empty)
   *
   * @param prompt - 각 줄 프롬프트
   * @returns 입력 이벤트 배열
   */
  async function readLines(prompt = ''): Promise<InputEvent[]> {
    const events: InputEvent[] = [];
    while (true) {
      const event = await readLine(prompt);
      if (event.isInterrupt || event.isEof) {
        events.push(event);
        break;
      }
      if (event.text === '') break;
      events.push(event);
    }
    return events;
  }

  return { readLine, readLines };
}

export type InputHandler = ReturnType<typeof createInputHandler>;
