/**
 * TUI 스피너 / TUI spinner
 *
 * @description
 * Claude Code 스타일 브라유 점자 스피너.
 * 비동기 작업 진행 중 시각적 피드백 제공.
 */

import { clearAndReturn, colorize, dim } from 'cli/tui/ansi.js';
import type { FgColor, SpinnerFrames, SpinnerOptions, SpinnerState } from 'cli/tui/types.js';

// ── 스피너 프레임 목록 / Spinner frame sets ───────────────────────

/** 브라유 점자 스피너 (Claude Code 스타일) */
export const BRAILLE_FRAMES: SpinnerFrames = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
] as const;

/** 점 스피너 */
export const DOTS_FRAMES: SpinnerFrames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'] as const;

/** 화살표 스피너 */
export const ARROW_FRAMES: SpinnerFrames = ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'] as const;

/** 기본 ASCII 스피너 (noColor 환경용) */
export const ASCII_FRAMES: SpinnerFrames = ['-', '\\', '|', '/'] as const;

/** 기본 스피너 프레임 */
export const DEFAULT_FRAMES = BRAILLE_FRAMES;

/** 기본 프레임 간격(ms) */
const DEFAULT_INTERVAL = 80;

// ── Spinner 클래스 ────────────────────────────────────────────────

/**
 * 애니메이션 스피너 / Animated spinner
 *
 * @description
 * start()로 시작, stop()/succeed()/fail()로 종료.
 * process.stdout에 직접 쓰거나 커스텀 write 함수 사용 가능.
 *
 * @example
 * const spinner = new Spinner({ text: 'Generating response...', color: 'cyan' });
 * spinner.start();
 * await doSomethingAsync();
 * spinner.succeed('Done!');
 */
export class Spinner {
  private text: string;
  private readonly color: FgColor;
  private readonly frames: SpinnerFrames;
  private readonly interval: number;
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: SpinnerState = 'idle';
  private readonly write: (text: string) => void;

  constructor(options: SpinnerOptions, write?: (text: string) => void) {
    this.text = options.text;
    this.color = options.color ?? 'cyan';
    this.frames = options.frames ?? DEFAULT_FRAMES;
    this.interval = options.interval ?? DEFAULT_INTERVAL;
    this.write = write ?? ((t) => process.stdout.write(t));
  }

  /**
   * 현재 상태 / Current state
   */
  get currentState(): SpinnerState {
    return this.state;
  }

  /**
   * 현재 텍스트 / Current text
   */
  get currentText(): string {
    return this.text;
  }

  /**
   * 스피너 시작 / Start spinner
   *
   * @param text - 표시할 텍스트 (선택: 생성자 텍스트 덮어쓰기)
   */
  start(text?: string): this {
    if (this.state === 'spinning') return this;

    if (text !== undefined) {
      this.text = text;
    }

    this.state = 'spinning';
    this.frameIndex = 0;

    this.timer = setInterval(() => {
      this.render();
    }, this.interval);

    // 첫 프레임 즉시 표시
    this.render();

    return this;
  }

  /**
   * 텍스트 업데이트 / Update text
   *
   * @param text - 새로운 텍스트
   */
  updateText(text: string): this {
    this.text = text;
    return this;
  }

  /**
   * 스피너 중단 (결과 없음) / Stop spinner without result
   */
  stop(): this {
    this.cleanup();
    this.state = 'idle';
    this.write(clearAndReturn());
    return this;
  }

  /**
   * 성공으로 완료 / Complete with success
   *
   * @param text - 성공 메시지 (선택)
   */
  succeed(text?: string): this {
    this.cleanup();
    this.state = 'success';
    const msg = text ?? this.text;
    this.write(`${clearAndReturn()}${colorize('✔', 'green')} ${msg}\n`);
    return this;
  }

  /**
   * 실패로 완료 / Complete with failure
   *
   * @param text - 실패 메시지 (선택)
   */
  fail(text?: string): this {
    this.cleanup();
    this.state = 'error';
    const msg = text ?? this.text;
    this.write(`${clearAndReturn()}${colorize('✖', 'red')} ${msg}\n`);
    return this;
  }

  /**
   * 정보 메시지로 완료 / Complete with info
   *
   * @param text - 정보 메시지 (선택)
   */
  info(text?: string): this {
    this.cleanup();
    this.state = 'idle';
    const msg = text ?? this.text;
    this.write(`${clearAndReturn()}${colorize('ℹ', 'cyan')} ${msg}\n`);
    return this;
  }

  /**
   * 경고 메시지로 완료 / Complete with warning
   *
   * @param text - 경고 메시지 (선택)
   */
  warn(text?: string): this {
    this.cleanup();
    this.state = 'idle';
    const msg = text ?? this.text;
    this.write(`${clearAndReturn()}${colorize('⚠', 'yellow')} ${msg}\n`);
    return this;
  }

  // ── private ───────────────────────────────────────────────────

  /**
   * 현재 프레임 렌더링 / Render current frame
   */
  private render(): void {
    const frame = this.frames[this.frameIndex % this.frames.length] ?? this.frames[0] ?? '?';
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;

    const spinner = colorize(frame, this.color);
    const text = dim(this.text);
    this.write(`${clearAndReturn()}${spinner} ${text}`);
  }

  /**
   * 타이머 정리 / Clean up timer
   */
  private cleanup(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * 스피너 팩토리 함수 / Spinner factory function
 *
 * @param text - 표시할 텍스트
 * @param options - 추가 옵션
 * @returns 새 Spinner 인스턴스
 *
 * @example
 * const s = createSpinner('Thinking...');
 * s.start();
 * await work();
 * s.succeed('Done');
 */
export function createSpinner(text: string, options: Partial<SpinnerOptions> = {}): Spinner {
  return new Spinner({ text, color: 'cyan', ...options });
}
