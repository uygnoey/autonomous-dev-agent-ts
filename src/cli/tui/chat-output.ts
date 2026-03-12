/**
 * 채팅 출력 렌더링 / Chat output rendering
 *
 * KR: 메시지 표시, 스피너 관리, 스트리밍 위임을 담당한다.
 * EN: Handles message display, spinner management, and streaming delegation.
 */

import { bold, brightCyan, colorize, cyan, dim, yellow } from 'cli/tui/ansi.js';
import { ChatStreamingHandler } from 'cli/tui/chat-streaming.js';
import type { ChatUiOptions } from 'cli/tui/chat-types.js';
import { createRenderer } from 'cli/tui/renderer.js';
import { DEFAULT_FRAMES, Spinner } from 'cli/tui/spinner.js';
import type { ChatMessage, TuiConfig } from 'cli/tui/types.js';

/**
 * 채팅 출력 핸들러 / Chat output handler
 *
 * @description
 * KR: 메시지 렌더링, 스트리밍 출력, 스피너 제어를 담당한다.
 * EN: Manages message rendering, streaming output, and spinner control.
 */
export class ChatOutputHandler {
  private readonly renderer: ReturnType<typeof createRenderer>;
  private readonly streaming: ChatStreamingHandler;
  private spinner: Spinner | null = null;

  constructor(tuiConfig?: TuiConfig) {
    this.renderer = createRenderer(tuiConfig);
    this.streaming = new ChatStreamingHandler();
  }

  /**
   * 채팅 헤더 표시 / Render chat header
   *
   * @param options - 채팅 UI 옵션 / Chat UI options
   */
  renderHeader(options: ChatUiOptions): void {
    const version = options.version ?? '0.0.1';
    const model = options.model;
    const projectName = options.projectName;
    const phase = options.phase ?? 'DESIGN';
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
   * @param message - 표시할 메시지 / Message to display
   */
  showMessage(message: ChatMessage): void {
    this.stopSpinner();

    switch (message.role) {
      case 'assistant':
        this.renderer.renderAssistant(message.content, message.timestamp);
        break;
      case 'user':
        // WHY: 사용자 메시지는 입력 시 이미 표시됨 -- 재표시 스킵
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
   * @param messages - 메시지 목록 / Message list
   */
  showMessages(messages: ChatMessage[]): void {
    for (const msg of messages) {
      this.showMessage(msg);
    }
  }

  // ── 스피너 / Spinner ────────────────────────────────────────────
  /**
   * 스피너 시작 / Start spinner
   *
   * @param text - 스피너 텍스트 / Spinner text
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
   * @param text - 완료 텍스트 / Completion text
   */
  succeedSpinner(text?: string): void {
    this.spinner?.succeed(text);
    this.spinner = null;
  }

  /**
   * 스피너 실패로 종료 / Stop spinner with failure
   *
   * @param text - 실패 텍스트 / Failure text
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

  // ── 단축 메시지 메서드 / Shortcut message methods ───────────────
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

  // ── 도움말 · 종료 메시지 / Help & Exit messages ─────────────────

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
   * @param path - Contract 파일 경로 / Contract file path
   */
  showContractComplete(path: string): void {
    this.renderer.renderSuccess('Contract 생성 완료!');
    this.renderer.writeLine(`  ${dim('출력:')} ${cyan(path)}`);
    this.renderer.writeLine('');
  }

  /**
   * 인터럽트 종료 메시지 / Show interrupt exit
   */
  showInterrupt(): void {
    this.stopSpinner();
    process.stdout.write('\n');
    this.renderer.writeLine(yellow('인터럽트(Ctrl+C) 감지. 종료합니다.'));
  }

  // ── 스트리밍 (ChatStreamingHandler에 위임) / Streaming (delegated) ──

  /**
   * 스트리밍 응답 시작 / Start streaming response
   *
   * @param timestamp - 시작 시각 (선택) / Start time (optional)
   */
  showStreamingStart(timestamp?: Date): void {
    this.stopSpinner();
    this.streaming.showStreamingStart(timestamp);
  }

  /**
   * 스트리밍 텍스트 델타 출력 / Write streaming text delta
   *
   * @param text - 출력할 텍스트 조각 / Text chunk to output
   */
  showStreamingDelta(text: string): void {
    this.streaming.showStreamingDelta(text);
  }

  /**
   * 스트리밍 응답 종료 / End streaming response
   */
  showStreamingEnd(): void {
    this.streaming.showStreamingEnd();
  }
}
