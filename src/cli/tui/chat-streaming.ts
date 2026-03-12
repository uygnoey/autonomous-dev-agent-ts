/**
 * 스트리밍 출력 핸들러 / Streaming output handler
 *
 * @description
 * KR: Claude API 스트리밍 응답을 박스 프레임 안에 실시간 렌더링한다.
 * EN: Renders Claude API streaming response in real-time within a box frame.
 */

import { brightCyan, dim, gray, stripAnsi } from 'cli/tui/ansi.js';

/**
 * 스트리밍 출력 핸들러 / Streaming output handler
 *
 * @description
 * KR: 스트리밍 시작/델타/종료 메서드를 제공하고,
 *     터미널 너비에 맞춰 박스 프레임 안에 텍스트를 줄 바꿈한다.
 * EN: Provides streaming start/delta/end methods,
 *     wrapping text within a box frame at terminal width.
 */
export class ChatStreamingHandler {
  /** 스트리밍 중 누적 텍스트 (줄 바꿈 추적용) / Accumulated stream text for line tracking */
  private streamBuffer = '';
  /** 스트리밍 중 현재 줄의 표시 너비 / Current line display width during streaming */
  private streamLineWidth = 0;

  /**
   * 스트리밍 응답 시작 / Start streaming response
   *
   * @param timestamp - 시작 시각 (선택) / Start time (optional)
   */
  showStreamingStart(timestamp?: Date): void {
    this.streamBuffer = '';
    this.streamLineWidth = 0;

    const termWidth = process.stdout.columns || 80;
    const ts = timestamp ? gray(` [${this.formatTime(timestamp)}]`) : '';
    const label = brightCyan('adev') + ts;
    const labelRaw = `adev${timestamp ? ` [${this.formatTime(timestamp)}]` : ''}`;
    const rightLen = Math.max(0, termWidth - 4 - labelRaw.length);

    process.stdout.write('\n');
    process.stdout.write(`${dim('╭─ ')}${label}${dim(` ${'─'.repeat(rightLen)}╮`)}\n`);
    process.stdout.write(`${dim('│')} `);
  }

  /**
   * 스트리밍 텍스트 델타 출력 / Write streaming text delta
   *
   * @param text - 출력할 텍스트 조각 / Text chunk to output
   */
  showStreamingDelta(text: string): void {
    const termWidth = process.stdout.columns || 80;
    // WHY: 내용 너비 = 터미널 너비 - 박스 테두리(2) - 공백(2)
    const innerWidth = termWidth - 4;

    for (const ch of text) {
      if (ch === '\n') {
        const pad = ' '.repeat(Math.max(0, innerWidth - this.streamLineWidth));
        process.stdout.write(`${pad}${dim(' │')}\n${dim('│')} `);
        this.streamLineWidth = 0;
      } else {
        process.stdout.write(ch);
        this.streamLineWidth += stripAnsi(ch).length;

        if (this.streamLineWidth >= innerWidth) {
          process.stdout.write(`${dim(' │')}\n${dim('│')} `);
          this.streamLineWidth = 0;
        }
      }
    }

    this.streamBuffer += text;
  }

  /**
   * 스트리밍 응답 종료 / End streaming response
   */
  showStreamingEnd(): void {
    const termWidth = process.stdout.columns || 80;
    const innerWidth = termWidth - 4;
    const pad = ' '.repeat(Math.max(0, innerWidth - this.streamLineWidth));
    process.stdout.write(`${pad}${dim(' │')}\n`);
    process.stdout.write(`${dim(`╰${'─'.repeat(termWidth - 2)}╯`)}\n\n`);
    this.streamBuffer = '';
    this.streamLineWidth = 0;
  }

  // ── private helpers ────────────────────────────────────────────

  /** HH:MM:SS 포맷 / HH:MM:SS format */
  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}
