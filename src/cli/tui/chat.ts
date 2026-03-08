/**
 * TUI 채팅 인터페이스 / TUI chat interface
 *
 * @description
 * Claude Code 스타일의 채팅 REPL.
 * start 명령어에서 사용하는 메인 인터랙티브 UI.
 */

import {
  bold,
  brightCyan,
  colorize,
  cyan,
  dim,
  gray,
  green,
  red,
  stripAnsi,
  white,
  yellow,
} from 'cli/tui/ansi.js';
import { createInputHandler } from 'cli/tui/input.js';
import { createRenderer } from 'cli/tui/renderer.js';
import { DEFAULT_FRAMES, Spinner } from 'cli/tui/spinner.js';
import type { ChatMessage, ChatRole, TuiConfig } from 'cli/tui/types.js';

// ── 상수 / Constants ──────────────────────────────────────────────

/** 종료 키워드 */
const EXIT_KEYWORDS = new Set(['exit', 'quit', '종료', '나가기', '/exit', '/quit']);

/** 도움말 키워드 */
const HELP_KEYWORDS = new Set(['help', '도움말', '/help', '?']);

/** Contract 생성 키워드 */
const CONTRACT_KEYWORDS = new Set(['확정', '완료', 'confirm', 'finalize', '/confirm']);

/** 대화 재시작 키워드 */
const CLEAR_KEYWORDS = new Set(['clear', 'cls', '/clear', '초기화']);

// ── 채팅 이벤트 타입 / Chat event types ─────────────────────────

/** 채팅 이벤트 / Chat event */
export type ChatEvent =
  | { type: 'message'; text: string }
  | { type: 'exit' }
  | { type: 'contract' }
  | { type: 'help' }
  | { type: 'clear' }
  | { type: 'interrupt' }
  | { type: 'eof' };

// ── 채팅 UI / Chat UI ─────────────────────────────────────────────

/**
 * 채팅 UI 옵션 / Chat UI options
 */
export interface ChatUiOptions {
  /** 버전 문자열 / Version string */
  readonly version?: string;
  /** 모델 이름 / Model name */
  readonly model?: string;
  /** 프로젝트 이름 / Project name */
  readonly projectName?: string;
  /** 현재 Phase / Current phase */
  readonly phase?: string;
  /** TUI 설정 / TUI config */
  readonly tuiConfig?: TuiConfig;
}

/**
 * TUI 채팅 인터페이스 / TUI chat interface
 *
 * @description
 * Claude Code 스타일의 인터랙티브 채팅 루프.
 * 메시지 표시, 사용자 입력, 스피너, 키보드 단축키를 제공한다.
 *
 * @example
 * const chat = new ChatUi({ version: '0.0.1', model: 'claude-opus-4-6' });
 * chat.start();
 * chat.showMessage({ role: 'assistant', content: '안녕하세요!' });
 * const event = await chat.waitForInput();
 * if (event.type === 'message') {
 *   // 처리
 * }
 */
export class ChatUi {
  private readonly renderer: ReturnType<typeof createRenderer>;
  private readonly inputHandler: ReturnType<typeof createInputHandler>;
  private readonly options: ChatUiOptions;
  private spinner: Spinner | null = null;
  private started = false;
  /** 스트리밍 중 누적 텍스트 (줄 바꿈 추적용) */
  private streamBuffer = '';
  /** 스트리밍 중 현재 줄의 표시 너비 */
  private streamLineWidth = 0;

  constructor(options: ChatUiOptions = {}) {
    this.options = options;
    this.renderer = createRenderer(options.tuiConfig);
    this.inputHandler = createInputHandler();
  }

  /**
   * 채팅 UI 시작 (헤더 표시) / Start chat UI (show header)
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    const version = this.options.version ?? '0.0.1';
    const model = this.options.model;
    const projectName = this.options.projectName;
    const phase = this.options.phase ?? 'DESIGN';
    const termWidth = process.stdout.columns || 80;

    // ── 상단 헤더 (Claude Code 스타일) ────────────────────────────
    this.renderer.renderHeader(version, model);

    // ── 프로젝트 + Phase 정보 줄 ─────────────────────────────────
    const projectStr = projectName ? `${dim('◈')} ${brightCyan(projectName)}` : '';
    const phaseStr = `${dim('Phase:')} ${colorize(phase, 'brightCyan', ['bold'])}`;
    const infoLine = [projectStr, phaseStr].filter(Boolean).join(`  ${dim('│')}  `);
    if (infoLine) {
      this.renderer.writeLine(`  ${infoLine}`);
    }

    // ── 구분선 ────────────────────────────────────────────────────
    this.renderer.writeLine(`  ${dim('─'.repeat(Math.max(0, termWidth - 4)))}`);

    // ── 환영 메시지 ───────────────────────────────────────────────
    this.renderer.writeLine('');
    this.renderer.writeLine(`  ${dim('›')} 프로젝트 아이디어를 자유롭게 설명해 주세요.`);
    this.renderer.writeLine(
      `  ${dim('›')} 기획이 완성되면 ${cyan('확정')} 또는 ${cyan('confirm')} 을 입력하세요.`,
    );
    this.renderer.writeLine('');

    // ── 키보드 단축키 힌트 ────────────────────────────────────────
    this.renderer.writeLine(
      `  ${dim('확정')}/${dim('confirm')} ${dim('Contract 생성')}  ` +
        `${dim('·')}  ${dim('clear')} ${dim('대화 초기화')}  ` +
        `${dim('·')}  ${dim('help')} ${dim('도움말')}  ` +
        `${dim('·')}  ${dim('Ctrl+C')} ${dim('종료')}`,
    );
    this.renderer.writeLine('');
  }

  /**
   * 어시스턴트 메시지 표시 / Show assistant message
   *
   * @param message - 표시할 메시지
   */
  showMessage(message: ChatMessage): void {
    this.stopSpinner();

    switch (message.role) {
      case 'assistant':
        this.renderer.renderAssistant(message.content, message.timestamp);
        break;
      case 'user':
        // 사용자 메시지는 입력 시 이미 표시됨, 재표시 스킵 가능
        break;
      case 'system':
        this.renderer.renderSystem(message.content);
        break;
      case 'error':
        this.renderer.renderError(message.content);
        break;
    }
  }

  /**
   * 여러 메시지 한 번에 표시 / Show multiple messages
   *
   * @param messages - 메시지 목록
   */
  showMessages(messages: ChatMessage[]): void {
    for (const msg of messages) {
      this.showMessage(msg);
    }
  }

  /**
   * 스피너 시작 / Start spinner
   *
   * @param text - 스피너 텍스트
   */
  startSpinner(text: string): void {
    this.stopSpinner();
    this.spinner = new Spinner({ text, color: 'cyan', frames: DEFAULT_FRAMES }, (t) =>
      process.stdout.write(t),
    );
    this.spinner.start();
  }

  /**
   * 스피너 성공으로 종료 / Stop spinner with success
   *
   * @param text - 완료 텍스트
   */
  succeedSpinner(text?: string): void {
    this.spinner?.succeed(text);
    this.spinner = null;
  }

  /**
   * 스피너 실패로 종료 / Stop spinner with failure
   *
   * @param text - 실패 텍스트
   */
  failSpinner(text?: string): void {
    this.spinner?.fail(text);
    this.spinner = null;
  }

  /**
   * 스피너 중단 / Stop spinner
   */
  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * 성공 메시지 / Success message
   *
   * @param text - 텍스트
   */
  success(text: string): void {
    this.stopSpinner();
    this.renderer.renderSuccess(text);
  }

  /**
   * 에러 메시지 / Error message
   *
   * @param text - 텍스트
   */
  error(text: string): void {
    this.stopSpinner();
    this.renderer.renderError(text);
  }

  /**
   * 시스템 메시지 / System message
   *
   * @param text - 텍스트
   */
  system(text: string): void {
    this.stopSpinner();
    this.renderer.renderSystem(text);
  }

  /**
   * 사용자 입력 대기 / Wait for user input
   *
   * @returns 채팅 이벤트
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
      // 빈 입력은 무시하고 다시 대기
      return this.waitForInput();
    }

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

  /**
   * 도움말 표시 / Show help
   */
  showHelp(): void {
    this.stopSpinner();
    const termWidth = process.stdout.columns || 80;
    this.renderer.writeLine('');
    this.renderer.writeLine(`  ${dim('─'.repeat(Math.max(0, termWidth - 4)))}`);
    this.renderer.writeLine(`  ${brightCyan(bold('adev'))} ${dim('도움말')}`);
    this.renderer.writeLine(`  ${dim('─'.repeat(Math.max(0, termWidth - 4)))}`);
    this.renderer.writeLine('');
    this.renderer.writeLine(`  ${dim('명령어:')}`);
    this.renderer.writeLine(
      `    ${cyan('확정')} ${dim('/')} ${cyan('완료')} ${dim('/')} ${cyan('confirm')}  ${dim('→')} Contract 생성 후 Layer2 자율 개발 시작`,
    );
    this.renderer.writeLine(
      `    ${cyan('clear')} ${dim('/')} ${cyan('초기화')}             ${dim('→')} 현재 대화 내역 초기화`,
    );
    this.renderer.writeLine(
      `    ${cyan('help')} ${dim('/')} ${cyan('?')}                   ${dim('→')} 이 도움말 표시`,
    );
    this.renderer.writeLine(
      `    ${cyan('exit')} ${dim('/')} ${cyan('종료')}               ${dim('→')} 대화 종료`,
    );
    this.renderer.writeLine(`    ${dim('Ctrl+C')}                     ${dim('→')} 즉시 종료`);
    this.renderer.writeLine('');
    this.renderer.writeLine(`  ${dim('대화 팁:')}`);
    this.renderer.writeLine(`    ${dim('›')} 프로젝트 목적, 핵심 기능, 기술 스택을 설명해 주세요`);
    this.renderer.writeLine(
      `    ${dim('›')} 질문에 구체적으로 답할수록 더 좋은 Contract가 생성됩니다`,
    );
    this.renderer.writeLine(
      `    ${dim('›')} 기획이 완료되면 '확정'을 입력하면 자율 개발이 시작됩니다`,
    );
    this.renderer.writeLine('');
    this.renderer.writeLine(`  ${dim('─'.repeat(Math.max(0, termWidth - 4)))}`);
    this.renderer.writeLine('');
  }

  /**
   * 종료 메시지 표시 / Show exit message
   */
  showExit(): void {
    this.stopSpinner();
    this.renderer.writeLine('');
    this.renderer.writeLine(dim('대화를 종료합니다. 다음에 만나요!'));
    this.renderer.writeLine('');
  }

  /**
   * Contract 생성 시작 알림 / Notify contract generation start
   */
  showContractStart(): void {
    this.stopSpinner();
    this.renderer.writeLine('');
    this.renderer.renderSystem('Contract 생성 중...');
  }

  /**
   * Contract 생성 완료 알림 / Notify contract generation complete
   *
   * @param path - Contract 파일 경로
   */
  showContractComplete(path: string): void {
    this.renderer.renderSuccess('Contract 생성 완료!');
    this.renderer.writeLine(`  ${dim('출력:')} ${cyan(path)}`);
    this.renderer.writeLine('');
  }

  /**
   * 스트리밍 응답 시작 / Start streaming response
   *
   * @description 스피너를 멈추고 어시스턴트 헤더를 출력한다.
   * @param timestamp - 시작 시각 (선택)
   */
  showStreamingStart(timestamp?: Date): void {
    this.stopSpinner();
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
   * @param text - 출력할 텍스트 조각
   */
  showStreamingDelta(text: string): void {
    const termWidth = process.stdout.columns || 80;
    // 내용 너비: 박스 테두리(2) + 공백(2) 제외
    const innerWidth = termWidth - 4;

    for (const ch of text) {
      if (ch === '\n') {
        // 줄 끝 패딩 + 오른쪽 테두리
        const pad = ' '.repeat(Math.max(0, innerWidth - this.streamLineWidth));
        process.stdout.write(`${pad}${dim(' │')}\n${dim('│')} `);
        this.streamLineWidth = 0;
      } else {
        process.stdout.write(ch);
        this.streamLineWidth += stripAnsi(ch).length;

        // 터미널 너비 초과 시 자동 줄 바꿈
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

  /**
   * 인터럽트 종료 메시지 / Show interrupt exit
   */
  showInterrupt(): void {
    this.stopSpinner();
    process.stdout.write('\n');
    this.renderer.writeLine(yellow('인터럽트(Ctrl+C) 감지. 종료합니다.'));
  }

  // ── private helpers ────────────────────────────────────────────

  /** HH:MM:SS 포맷 */
  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}

/**
 * ChatUi 팩토리 함수 / ChatUi factory function
 *
 * @param options - 옵션
 * @returns 새 ChatUi 인스턴스
 */
export function createChatUi(options: ChatUiOptions = {}): ChatUi {
  return new ChatUi(options);
}
