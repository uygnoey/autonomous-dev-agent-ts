/**
 * TUI 렌더러 / TUI renderer
 *
 * @description
 * Claude Code 스타일 박스 그리기, 메시지 포맷팅, 레이아웃 컴포넌트.
 * ╭─╮/╰─╯ 둥근 모서리 박스, 색상별 메시지 역할 구분.
 */

import {
  bold,
  brightCyan,
  colorize,
  cyan,
  dim,
  displayWidth,
  gray,
  green,
  red,
  stripAnsi,
  yellow,
} from 'cli/tui/ansi.js';
import type { BoxOptions, BoxStyle, FgColor, TuiConfig } from 'cli/tui/types.js';

// ── 박스 문자 / Box drawing characters ───────────────────────────

/** 박스 스타일별 문자 셋 */
const BOX_CHARS: Record<
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
const DEFAULT_WIDTH = 80;

/**
 * 현재 터미널 너비 반환 / Return current terminal width
 */
function getTerminalWidth(): number {
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
function wrapText(text: string, width: number): string[] {
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

// ── 메시지 포맷터 / Message formatter ────────────────────────────

/**
 * 사용자 메시지 포맷팅 / Format user message
 *
 * @param content - 메시지 내용
 * @param timestamp - 타임스탬프 (선택)
 * @returns 포맷된 문자열
 */
export function formatUserMessage(content: string, timestamp?: Date): string {
  const prefix = bold('You');
  const ts = timestamp ? gray(` [${formatTime(timestamp)}]`) : '';
  const header = `${prefix}${ts}`;

  const termWidth = getTerminalWidth();
  const innerWidth = termWidth - 4; // indent
  const lines = wrapText(content, innerWidth);

  return `\n${header}\n${lines.map((l) => `  ${l}`).join('\n')}\n`;
}

/**
 * 어시스턴트 메시지 포맷팅 / Format assistant message
 *
 * @param content - 메시지 내용
 * @param timestamp - 타임스탬프 (선택)
 * @returns 포맷된 문자열
 */
export function formatAssistantMessage(content: string, timestamp?: Date): string {
  const termWidth = getTerminalWidth();
  const maxW = Math.min(termWidth - 2, 100);

  const ts = timestamp ? gray(` [${formatTime(timestamp)}]`) : '';
  const title = `adev${ts}`;

  return `\n${renderBox(content, {
    title,
    maxWidth: maxW,
    style: 'rounded',
    color: 'cyan',
    titleColor: 'brightCyan',
  })}\n`;
}

/**
 * 시스템 메시지 포맷팅 / Format system message
 *
 * @param content - 메시지 내용
 * @returns 포맷된 문자열
 */
export function formatSystemMessage(content: string): string {
  return `\n${yellow('  ◆')} ${dim(content)}\n`;
}

/**
 * 에러 메시지 포맷팅 / Format error message
 *
 * @param content - 에러 내용
 * @returns 포맷된 문자열
 */
export function formatErrorMessage(content: string): string {
  return `\n${red('  ✖')} ${red(content)}\n`;
}

/**
 * 성공 메시지 포맷팅 / Format success message
 *
 * @param content - 성공 내용
 * @returns 포맷된 문자열
 */
export function formatSuccessMessage(content: string): string {
  return `\n${green('  ✔')} ${green(content)}\n`;
}

// ── 헤더 / Header ─────────────────────────────────────────────────

/**
 * TUI 헤더 렌더링 / Render TUI header
 *
 * @description
 * Claude Code 스타일의 상단 헤더 박스.
 * ╭─ adev v0.0.1 ─ claude-opus-4-6 ──────────────────╮
 *
 * @param version - 버전 문자열
 * @param model - 모델 이름
 * @returns 렌더링된 헤더
 */
export function renderHeader(version: string, model?: string): string {
  const termWidth = getTerminalWidth();
  const chars = BOX_CHARS.rounded;

  // 레이블 구성: adev v{version} [─ model]
  const versionLabel = `adev ${dim(`v${version}`)}`;
  const modelLabel = model ? `  ${dim('─')}  ${cyan(model)}` : '';

  // 표시 너비 계산 (ANSI 제외)
  const rawLabel = `adev v${version}${model ? `  ─  ${model}` : ''}`;
  // ╭─  {label}  ─...─╮ : 좌우 테두리(2) + 공백(2) + 레이블 + 공백(1)
  const prefixLen = 3; // "╭─ "
  const suffixLen = 1; // "╮"
  const rightDashLen = Math.max(0, termWidth - prefixLen - rawLabel.length - 2 - suffixLen);

  const top =
    dim(`${chars.tl}${chars.h} `) +
    versionLabel +
    modelLabel +
    dim(` ${'─'.repeat(rightDashLen)}${chars.tr}`);

  return `\n${top}\n`;
}

/**
 * 푸터 렌더링 / Render footer
 *
 * @param shortcuts - 키보드 단축키 목록
 * @returns 렌더링된 푸터
 */
export function renderFooter(shortcuts: Array<[string, string]>): string {
  const parts = shortcuts.map(([key, desc]) => `${cyan(key)} ${dim(desc)}`);
  return `\n${dim(`  ${parts.join('  ·  ')}`)}\n`;
}

// ── 구분선 / Divider ──────────────────────────────────────────────

/**
 * 구분선 렌더링 / Render divider
 *
 * @param label - 선택적 레이블
 * @returns 구분선 문자열
 */
export function renderDivider(label?: string): string {
  const termWidth = getTerminalWidth();
  if (label) {
    const labelStr = ` ${label} `;
    const halfLen = Math.floor((termWidth - labelStr.length) / 2);
    const leftDash = dim('─'.repeat(Math.max(0, halfLen)));
    const rightDash = dim('─'.repeat(Math.max(0, termWidth - halfLen - labelStr.length)));
    return `${leftDash}${dim(labelStr)}${rightDash}`;
  }
  return dim('─'.repeat(termWidth));
}

// ── 입력 프롬프트 / Input prompt ──────────────────────────────────

/**
 * 입력 프롬프트 렌더링 / Render input prompt
 *
 * @param text - 현재 입력 텍스트
 * @returns 프롬프트 문자열
 */
export function renderPrompt(text = ''): string {
  return `${cyan('❯')} ${text}`;
}

// ── 유틸리티 / Utilities ──────────────────────────────────────────

/**
 * 시간 포맷팅 / Format time
 *
 * @param date - 날짜
 * @returns HH:MM:SS 형식 문자열
 */
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * 렌더러 인스턴스 생성 / Create renderer instance
 *
 * @param config - TUI 설정
 * @returns 렌더러 객체
 */
export function createRenderer(config: TuiConfig = {}) {
  // noColor 설정 적용은 ansi 모듈에서 전역으로 처리됨
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
