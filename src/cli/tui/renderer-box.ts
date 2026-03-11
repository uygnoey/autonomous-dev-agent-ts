/**
 * TUI 박스 프리미티브 / TUI Box Primitives
 *
 * @description
 * 박스 문자 상수, 터미널 너비 감지, 텍스트 래핑, 박스 렌더링 순수 함수.
 * Pure functions for box drawing: constants, terminal width, text wrap, box render.
 */

import { colorize, displayWidth, stripAnsi } from 'cli/tui/ansi.js';
import type { BoxOptions, BoxStyle } from 'cli/tui/types.js';

// ── 박스 문자 / Box drawing characters ───────────────────────────

/** 박스 스타일별 문자 셋 */
export const BOX_CHARS: Record<
  BoxStyle,
  {
    tl: string;
    tr: string;
    bl: string;
    br: string;
    h: string;
    v: string;
  }
> = {
  rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
};

// ── 터미널 너비 / Terminal width ──────────────────────────────────

/** 기본 터미널 너비 */
export const DEFAULT_WIDTH = 80;

/**
 * 현재 터미널 너비 반환 / Return current terminal width
 */
export function getTerminalWidth(): number {
  try {
    return process.stdout.columns || DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

// ── 텍스트 랩 / Text wrap ─────────────────────────────────────────

/**
 * 텍스트를 주어진 너비로 줄 바꿈 / Wrap text to given width
 *
 * @param text - 원본 텍스트 (ANSI 코드 포함 가능)
 * @param width - 최대 표시 너비
 * @returns 줄 바꿈된 줄 목록
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];

  const lines: string[] = [];

  // 먼저 개행 문자로 분리
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    // ANSI 코드를 무시하고 표시 길이 기준으로 분리
    const plain = stripAnsi(paragraph);
    if (displayWidth(plain) <= width) {
      lines.push(paragraph);
      continue;
    }

    // 단어 단위로 래핑
    const words = paragraph.split(' ');
    let currentLine = '';
    let currentWidth = 0;

    for (const word of words) {
      const wordWidth = displayWidth(word);

      if (currentWidth === 0) {
        if (wordWidth <= width) {
          currentLine = word;
          currentWidth = wordWidth;
        } else {
          // WHY: 단일 단어가 너비를 초과하면 문자 단위로 강제 줄 바꿈
          const chars = Array.from(word);
          for (const ch of chars) {
            const chWidth = displayWidth(ch);
            if (currentWidth + chWidth > width) {
              lines.push(currentLine);
              currentLine = ch;
              currentWidth = chWidth;
            } else {
              currentLine += ch;
              currentWidth += chWidth;
            }
          }
        }
      } else if (currentWidth + 1 + wordWidth <= width) {
        currentLine += ` ${word}`;
        currentWidth += 1 + wordWidth;
      } else {
        lines.push(currentLine);
        if (wordWidth <= width) {
          currentLine = word;
          currentWidth = wordWidth;
        } else {
          // 단어가 너비 초과 → 문자 단위 래핑
          currentLine = '';
          currentWidth = 0;
          const chars = Array.from(word);
          for (const ch of chars) {
            const chWidth = displayWidth(ch);
            if (currentWidth + chWidth > width) {
              lines.push(currentLine);
              currentLine = ch;
              currentWidth = chWidth;
            } else {
              currentLine += ch;
              currentWidth += chWidth;
            }
          }
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ── 박스 렌더링 / Box rendering ───────────────────────────────────

/**
 * 텍스트 박스 렌더링 / Render text box
 *
 * @description
 * Claude Code 스타일의 둥근 모서리 박스를 렌더링한다.
 *
 * @param content - 박스 안의 내용
 * @param options - 박스 옵션
 * @returns 렌더링된 박스 문자열
 *
 * @example
 * renderBox('Hello World', { title: 'Assistant', color: 'cyan' })
 * // ╭─ Assistant ─────────╮
 * // │ Hello World         │
 * // ╰────────────────────╯
 */
export function renderBox(content: string, options: BoxOptions = {}): string {
  const {
    title,
    maxWidth,
    padding = 1,
    style = 'rounded',
    color = 'default',
    titleColor = 'brightCyan',
  } = options;

  const termWidth = getTerminalWidth();
  const boxWidth = Math.min(maxWidth ?? termWidth - 2, termWidth - 2);
  const innerWidth = boxWidth - 2 - padding * 2; // border + padding

  const chars = BOX_CHARS[style];
  const borderColor = color !== 'default' ? (t: string) => colorize(t, color) : (t: string) => t;

  // 내용 줄 목록
  const contentLines = wrapText(content, innerWidth);

  // 패딩 문자
  const pad = ' '.repeat(padding);

  const lines: string[] = [];

  // 상단 테두리
  if (title) {
    const titleStr = colorize(` ${title} `, titleColor, ['bold']);
    const titleRaw = ` ${title} `;
    const titleLen = titleRaw.length;
    const remainWidth = boxWidth - 2 - titleLen;
    const rightDashes = remainWidth > 0 ? chars.h.repeat(remainWidth) : '';
    lines.push(
      borderColor(`${chars.tl}${chars.h}`) + titleStr + borderColor(rightDashes + chars.tr),
    );
  } else {
    lines.push(borderColor(`${chars.tl}${chars.h.repeat(boxWidth - 2)}${chars.tr}`));
  }

  // 내용 줄
  for (const line of contentLines) {
    const lineWidth = displayWidth(line);
    const rightPad = ' '.repeat(Math.max(0, innerWidth - lineWidth));
    lines.push(borderColor(chars.v) + pad + line + rightPad + pad + borderColor(chars.v));
  }

  // 하단 테두리
  lines.push(borderColor(`${chars.bl}${chars.h.repeat(boxWidth - 2)}${chars.br}`));

  return lines.join('\n');
}
