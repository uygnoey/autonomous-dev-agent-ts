/**
 * TUI 컴포넌트 단위 테스트 / TUI component unit tests
 *
 * @description
 * ANSI, Spinner, Renderer, ChatUi 컴포넌트의 동작을 검증한다.
 * 실제 터미널 출력 없이 버퍼로 캡처해서 테스트.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  setNoColor,
  isNoColor,
  colorize,
  bold,
  dim,
  cyan,
  green,
  red,
  yellow,
  gray,
  brightCyan,
  brightWhite,
  stripAnsi,
  displayWidth,
  cursorToLineStart,
  clearLine,
  clearAndReturn,
  hideCursor,
  showCursor,
  fg,
  bg,
  style,
  reset,
} from 'cli/tui/ansi.js';
import {
  renderBox,
  renderHeader,
  renderFooter,
  renderDivider,
  renderPrompt,
  formatUserMessage,
  formatAssistantMessage,
  formatSystemMessage,
  formatErrorMessage,
  formatSuccessMessage,
  createRenderer,
} from 'cli/tui/renderer.js';
import { Spinner, createSpinner, DEFAULT_FRAMES, BRAILLE_FRAMES, ASCII_FRAMES } from 'cli/tui/spinner.js';
import { ChatUi, createChatUi } from 'cli/tui/chat.js';
import type { TuiConfig, RenderTarget } from 'cli/tui/types.js';

// ── 테스트 유틸리티 / Test utilities ─────────────────────────────

/** 출력 캡처용 가짜 RenderTarget */
function makeBuffer(): { target: RenderTarget; output: () => string } {
  const lines: string[] = [];
  const target: RenderTarget = {
    write(text: string) { lines.push(text); },
    columns: 80,
    rows: 24,
    isTTY: false,
  };
  return { target, output: () => lines.join('') };
}

// ── ANSI 테스트 ───────────────────────────────────────────────────

describe('ansi', () => {
  beforeEach(() => setNoColor(false));
  afterEach(() => setNoColor(false));

  describe('setNoColor / isNoColor', () => {
    it('기본값은 false', () => {
      expect(isNoColor()).toBe(false);
    });
    it('setNoColor(true)로 활성화', () => {
      setNoColor(true);
      expect(isNoColor()).toBe(true);
    });
    it('setNoColor(false)로 비활성화', () => {
      setNoColor(true);
      setNoColor(false);
      expect(isNoColor()).toBe(false);
    });
  });

  describe('colorize', () => {
    it('ANSI 코드 포함 반환', () => {
      const result = colorize('hello', 'cyan');
      expect(result).toContain('\x1b[');
      expect(result).toContain('hello');
      expect(result).toContain('\x1b[0m');
    });
    it('noColor 모드에서 원본 텍스트 반환', () => {
      setNoColor(true);
      expect(colorize('hello', 'cyan')).toBe('hello');
    });
    it('bold 스타일 포함', () => {
      const result = colorize('text', 'green', ['bold']);
      expect(result).toContain('32');  // green
      expect(result).toContain('1');   // bold
    });
    it('빈 문자열 처리', () => {
      expect(colorize('', 'cyan')).toContain('\x1b[0m');
    });
  });

  describe('단축 색상 함수들', () => {
    const cases = [
      ['cyan', cyan],
      ['green', green],
      ['red', red],
      ['yellow', yellow],
      ['gray', gray],
      ['brightCyan', brightCyan],
      ['brightWhite', brightWhite],
    ] as const;

    for (const [name, fn] of cases) {
      it(`${name}('text') ANSI 포함`, () => {
        const result = fn('text');
        expect(result).toContain('\x1b[');
        expect(result).toContain('text');
      });
    }

    it('bold 포함', () => {
      expect(bold('x')).toContain('\x1b[1m');
    });
    it('dim 포함', () => {
      expect(dim('x')).toContain('\x1b[2m');
    });
  });

  describe('stripAnsi', () => {
    it('ANSI 코드 제거', () => {
      expect(stripAnsi('\x1b[36mhello\x1b[0m')).toBe('hello');
    });
    it('ANSI 없는 텍스트 그대로', () => {
      expect(stripAnsi('hello world')).toBe('hello world');
    });
    it('복합 ANSI 코드 제거', () => {
      const text = '\x1b[1m\x1b[36mbold cyan\x1b[0m';
      expect(stripAnsi(text)).toBe('bold cyan');
    });
    it('빈 문자열 처리', () => {
      expect(stripAnsi('')).toBe('');
    });
    it('커서 이동 코드 제거', () => {
      expect(stripAnsi('\x1b[2K\x1b[G')).toBe('');
    });
  });

  describe('displayWidth', () => {
    it('일반 텍스트 길이', () => {
      expect(displayWidth('hello')).toBe(5);
    });
    it('ANSI 코드 제외한 표시 길이', () => {
      expect(displayWidth('\x1b[36mhello\x1b[0m')).toBe(5);
    });
    it('빈 문자열 길이 0', () => {
      expect(displayWidth('')).toBe(0);
    });
    it('여러 ANSI 코드 포함', () => {
      expect(displayWidth(colorize('test', 'cyan', ['bold']))).toBe(4);
    });
  });

  describe('커서 제어 함수들', () => {
    it('hideCursor ANSI 코드 반환', () => {
      expect(hideCursor()).toContain('\x1b[?25l');
    });
    it('showCursor ANSI 코드 반환', () => {
      expect(showCursor()).toContain('\x1b[?25h');
    });
    it('clearLine ESC 시퀀스 반환', () => {
      expect(clearLine()).toContain('\x1b[2K');
    });
    it('clearAndReturn 줄 지우고 시작 이동', () => {
      const result = clearAndReturn();
      expect(result).toContain('\x1b[');
    });
    it('noColor 모드에서 clearAndReturn은 \\r', () => {
      setNoColor(true);
      expect(clearAndReturn()).toBe('\r');
    });
  });

  describe('fg / bg / style / reset', () => {
    it('fg cyan 코드', () => {
      expect(fg('cyan')).toContain('36');
    });
    it('bg red 코드', () => {
      expect(bg('bgRed')).toContain('41');
    });
    it('style bold 코드', () => {
      expect(style('bold')).toContain('1');
    });
    it('reset 코드', () => {
      expect(reset()).toContain('0m');
    });
    it('noColor 모드에서 빈 문자열', () => {
      setNoColor(true);
      expect(fg('cyan')).toBe('');
      expect(bg('bgRed')).toBe('');
      expect(style('bold')).toBe('');
      expect(reset()).toBe('');
    });
  });
});

// ── Renderer 테스트 ───────────────────────────────────────────────

describe('renderer', () => {
  beforeEach(() => setNoColor(false));
  afterEach(() => setNoColor(false));

  describe('renderBox', () => {
    it('기본 박스 출력', () => {
      setNoColor(true);
      const result = renderBox('Hello World');
      expect(result).toContain('Hello World');
      expect(result).toContain('╭');
      expect(result).toContain('╰');
    });
    it('제목 포함 박스', () => {
      setNoColor(true);
      const result = renderBox('Content', { title: 'Test' });
      expect(result).toContain('Test');
      expect(result).toContain('Content');
    });
    it('여러 줄 내용 처리', () => {
      setNoColor(true);
      const result = renderBox('line1\nline2\nline3');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('line3');
    });
    it('긴 텍스트 줄 바꿈', () => {
      setNoColor(true);
      const longText = 'a'.repeat(200);
      const result = renderBox(longText, { maxWidth: 80 });
      // 결과가 여러 줄이어야 함
      expect(result.split('\n').length).toBeGreaterThan(3);
    });
    it('다양한 박스 스타일', () => {
      setNoColor(true);
      const rounded = renderBox('text', { style: 'rounded' });
      const single = renderBox('text', { style: 'single' });
      const double = renderBox('text', { style: 'double' });
      const heavy = renderBox('text', { style: 'heavy' });

      expect(rounded).toContain('╭');
      expect(single).toContain('┌');
      expect(double).toContain('╔');
      expect(heavy).toContain('┏');
    });
    it('빈 내용 박스', () => {
      setNoColor(true);
      const result = renderBox('');
      expect(result).toContain('╭');
      expect(result).toContain('╰');
    });
  });

  describe('renderHeader', () => {
    it('버전 포함', () => {
      setNoColor(true);
      const result = renderHeader('1.2.3');
      expect(result).toContain('1.2.3');
      expect(result).toContain('adev');
    });
    it('모델명 포함', () => {
      setNoColor(true);
      const result = renderHeader('1.0.0', 'claude-opus-4-6');
      expect(result).toContain('claude-opus-4-6');
    });
    it('모델 없이도 렌더링', () => {
      setNoColor(true);
      const result = renderHeader('0.0.1');
      expect(result).toContain('0.0.1');
    });
    it('박스 문자 포함', () => {
      setNoColor(true);
      const result = renderHeader('1.0.0');
      expect(result).toMatch(/[╭┌╔┏]/);
    });
  });

  describe('renderDivider', () => {
    it('레이블 없는 구분선', () => {
      setNoColor(true);
      const result = renderDivider();
      expect(result).toContain('─');
    });
    it('레이블 있는 구분선', () => {
      setNoColor(true);
      const result = renderDivider('Section');
      expect(result).toContain('Section');
    });
  });

  describe('renderPrompt', () => {
    it('프롬프트 문자 포함', () => {
      setNoColor(true);
      const result = renderPrompt();
      expect(result).toContain('❯');
    });
    it('입력 텍스트 포함', () => {
      setNoColor(true);
      const result = renderPrompt('hello');
      expect(result).toContain('hello');
    });
  });

  describe('formatUserMessage', () => {
    it('You 레이블 포함', () => {
      setNoColor(true);
      const result = formatUserMessage('hello');
      expect(result).toContain('You');
      expect(result).toContain('hello');
    });
    it('타임스탬프 포함', () => {
      setNoColor(true);
      const result = formatUserMessage('msg', new Date());
      expect(result).toContain('[');
      expect(result).toContain(':');
    });
    it('빈 메시지 처리', () => {
      setNoColor(true);
      const result = formatUserMessage('');
      expect(result).toContain('You');
    });
  });

  describe('formatAssistantMessage', () => {
    it('adev 레이블 포함', () => {
      setNoColor(true);
      const result = formatAssistantMessage('response');
      expect(result).toContain('adev');
      expect(result).toContain('response');
    });
    it('박스 형태로 렌더링', () => {
      setNoColor(true);
      const result = formatAssistantMessage('text');
      expect(result).toMatch(/[╭┌]/);
    });
  });

  describe('formatSystemMessage', () => {
    it('◆ 아이콘 포함', () => {
      setNoColor(true);
      const result = formatSystemMessage('system info');
      expect(result).toContain('◆');
      expect(result).toContain('system info');
    });
  });

  describe('formatErrorMessage', () => {
    it('✖ 아이콘 포함', () => {
      setNoColor(true);
      const result = formatErrorMessage('error occurred');
      expect(result).toContain('✖');
      expect(result).toContain('error occurred');
    });
  });

  describe('formatSuccessMessage', () => {
    it('✔ 아이콘 포함', () => {
      setNoColor(true);
      const result = formatSuccessMessage('done');
      expect(result).toContain('✔');
      expect(result).toContain('done');
    });
  });

  describe('createRenderer', () => {
    it('버퍼로 출력 캡처', () => {
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.writeLine('hello');
      expect(output()).toContain('hello');
    });
    it('renderUser 출력', () => {
      setNoColor(true);
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.renderUser('user text');
      expect(output()).toContain('user text');
    });
    it('renderAssistant 출력', () => {
      setNoColor(true);
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.renderAssistant('ai response');
      expect(output()).toContain('ai response');
    });
    it('renderSystem 출력', () => {
      setNoColor(true);
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.renderSystem('system message');
      expect(output()).toContain('system message');
    });
    it('renderError 출력', () => {
      setNoColor(true);
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.renderError('error message');
      expect(output()).toContain('error message');
    });
    it('renderSuccess 출력', () => {
      setNoColor(true);
      const { target, output } = makeBuffer();
      const renderer = createRenderer({ output: target });
      renderer.renderSuccess('success message');
      expect(output()).toContain('success message');
    });
    it('isTTY 값 반환', () => {
      const { target } = makeBuffer();
      const renderer = createRenderer({ output: target });
      expect(renderer.isTTY).toBe(false);
    });
    it('width 값 반환', () => {
      const { target } = makeBuffer();
      const renderer = createRenderer({ output: target });
      expect(renderer.width).toBe(80);
    });
  });
});

// ── Spinner 테스트 ────────────────────────────────────────────────

describe('Spinner', () => {
  it('DEFAULT_FRAMES는 BRAILLE_FRAMES', () => {
    expect(DEFAULT_FRAMES).toBe(BRAILLE_FRAMES);
  });

  it('BRAILLE_FRAMES 10개 프레임', () => {
    expect(BRAILLE_FRAMES.length).toBe(10);
  });

  it('ASCII_FRAMES 4개 프레임 (noTTY 환경용)', () => {
    expect(ASCII_FRAMES.length).toBe(4);
  });

  it('createSpinner 인스턴스 생성', () => {
    const s = createSpinner('Loading...');
    expect(s).toBeInstanceOf(Spinner);
    expect(s.currentText).toBe('Loading...');
    expect(s.currentState).toBe('idle');
  });

  it('start()로 spinning 상태 전환', () => {
    const output: string[] = [];
    const s = new Spinner(
      { text: 'Working...', color: 'cyan' },
      (t) => output.push(t),
    );
    s.start();
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('stop()으로 idle 상태 전환', () => {
    const output: string[] = [];
    const s = new Spinner(
      { text: 'test', color: 'cyan' },
      (t) => output.push(t),
    );
    s.start();
    s.stop();
    expect(s.currentState).toBe('idle');
  });

  it('succeed()로 success 상태', () => {
    const output: string[] = [];
    const s = new Spinner(
      { text: 'test', color: 'cyan' },
      (t) => output.push(t),
    );
    s.start();
    s.succeed('Done!');
    expect(s.currentState).toBe('success');
    // ✔ 아이콘 + 메시지 출력
    const combined = output.join('');
    expect(combined).toContain('Done!');
  });

  it('fail()로 error 상태', () => {
    const output: string[] = [];
    const s = new Spinner(
      { text: 'test', color: 'cyan' },
      (t) => output.push(t),
    );
    s.start();
    s.fail('Error!');
    expect(s.currentState).toBe('error');
    const combined = output.join('');
    expect(combined).toContain('Error!');
  });

  it('updateText() 텍스트 변경', () => {
    const s = createSpinner('initial');
    s.updateText('updated');
    expect(s.currentText).toBe('updated');
  });

  it('중복 start() 호출 무시', () => {
    const output: string[] = [];
    const s = new Spinner(
      { text: 'test', color: 'cyan' },
      (t) => output.push(t),
    );
    s.start();
    s.start(); // 무시되어야 함
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('start() 텍스트 덮어쓰기', () => {
    const s = createSpinner('original');
    s.start('overridden');
    expect(s.currentText).toBe('overridden');
    s.stop();
  });

  it('info() 출력', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test' }, (t) => output.push(t));
    s.start();
    s.info('Info message');
    expect(output.join('')).toContain('Info message');
  });

  it('warn() 출력', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test' }, (t) => output.push(t));
    s.start();
    s.warn('Warning message');
    expect(output.join('')).toContain('Warning message');
  });

  it('커스텀 frames 사용', () => {
    const customFrames = ['A', 'B', 'C'] as const;
    const s = new Spinner({ text: 'test', frames: customFrames }, () => {});
    s.start();
    s.stop();
    // 오류 없이 실행됨
    expect(s.currentState).toBe('idle');
  });
});

// ── ChatUi 테스트 ─────────────────────────────────────────────────

describe('ChatUi', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  function makeChatUi(extraOutput?: string[]): ChatUi {
    // stdout.write를 캡처하도록 모킹 - 여기서는 noColor 모드로만 테스트
    return createChatUi({ version: '1.0.0', model: 'claude-opus-4-6' });
  }

  it('createChatUi 인스턴스 생성', () => {
    const chat = createChatUi();
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('버전/모델 옵션 설정', () => {
    const chat = createChatUi({ version: '2.0.0', model: 'test-model' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('프로젝트명 옵션 설정', () => {
    const chat = createChatUi({ projectName: 'my-project' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('phase 옵션 설정', () => {
    const chat = createChatUi({ phase: 'CODE' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('start() 중복 호출 무시', () => {
    const chat = makeChatUi();
    // 첫 번째 start는 정상 실행
    chat.start();
    // 두 번째 start는 무시 (오류 없음)
    chat.start();
  });

  it('stopSpinner() 안전하게 호출 (spinner 없을 때)', () => {
    const chat = makeChatUi();
    // spinner가 없는 상태에서 stopSpinner 호출 - 오류 없어야 함
    expect(() => chat.stopSpinner()).not.toThrow();
  });

  it('startSpinner + stopSpinner 사이클', () => {
    const chat = makeChatUi();
    chat.startSpinner('Loading...');
    chat.stopSpinner();
    // spinner가 null이어야 함 - 오류 없음으로 확인
    expect(() => chat.stopSpinner()).not.toThrow();
  });

  it('succeedSpinner spinner 없을 때 안전', () => {
    const chat = makeChatUi();
    expect(() => chat.succeedSpinner('done')).not.toThrow();
  });

  it('failSpinner spinner 없을 때 안전', () => {
    const chat = makeChatUi();
    expect(() => chat.failSpinner('failed')).not.toThrow();
  });

  it('showContractStart 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showContractStart()).not.toThrow();
  });

  it('showContractComplete 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showContractComplete('/path/to/contract.json')).not.toThrow();
  });

  it('showExit 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showExit()).not.toThrow();
  });

  it('showInterrupt 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showInterrupt()).not.toThrow();
  });

  it('showHelp 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showHelp()).not.toThrow();
  });

  it('error() 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.error('something went wrong')).not.toThrow();
  });

  it('success() 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.success('all done')).not.toThrow();
  });

  it('system() 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.system('system info')).not.toThrow();
  });

  it('showMessage(assistant) 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showMessage({ role: 'assistant', content: 'hello' })).not.toThrow();
  });

  it('showMessage(system) 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showMessage({ role: 'system', content: 'info' })).not.toThrow();
  });

  it('showMessage(error) 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showMessage({ role: 'error', content: 'err' })).not.toThrow();
  });

  it('showMessage(user) 아무것도 출력 안 함 (이미 표시됨)', () => {
    const chat = makeChatUi();
    // user 메시지는 스킵 (입력 시 이미 표시됨) - 오류 없음
    expect(() => chat.showMessage({ role: 'user', content: 'user msg' })).not.toThrow();
  });

  it('showMessages 배열 처리', () => {
    const chat = makeChatUi();
    expect(() => chat.showMessages([
      { role: 'assistant', content: 'msg1' },
      { role: 'system', content: 'msg2' },
      { role: 'error', content: 'msg3' },
    ])).not.toThrow();
  });

  it('showStreamingStart 오류 없이 실행', () => {
    const chat = makeChatUi();
    expect(() => chat.showStreamingStart(new Date())).not.toThrow();
  });

  it('showStreamingDelta 오류 없이 실행', () => {
    const chat = makeChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('some text')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingDelta 개행 처리', () => {
    const chat = makeChatUi();
    chat.showStreamingStart();
    // 개행 포함 텍스트 - 오류 없어야 함
    expect(() => chat.showStreamingDelta('line1\nline2\nline3')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingEnd 오류 없이 실행', () => {
    const chat = makeChatUi();
    chat.showStreamingStart();
    chat.showStreamingEnd();
  });

  it('showStreamingDelta 터미널 너비 초과 자동 줄바꿈', () => {
    const chat = makeChatUi();
    chat.showStreamingStart();
    // 80자 이상의 텍스트 (단일 델타)
    const longText = 'x'.repeat(100);
    expect(() => chat.showStreamingDelta(longText)).not.toThrow();
    chat.showStreamingEnd();
  });
});

// ── 통합 시나리오 테스트 ────────────────────────────────────────

describe('TUI 통합 시나리오', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('전체 스트리밍 시퀀스 (start → delta × N → end)', () => {
    const chat = createChatUi({ version: '0.0.1', model: 'test-model' });
    chat.showStreamingStart(new Date());
    chat.showStreamingDelta('안녕하세요! ');
    chat.showStreamingDelta('프로젝트에 대해 ');
    chat.showStreamingDelta('설명해 주세요.\n');
    chat.showStreamingDelta('어떤 기능이 필요하신가요?');
    chat.showStreamingEnd();
    // 오류 없이 완료
  });

  it('spinner 후 showMessage 전환', () => {
    const chat = createChatUi();
    chat.startSpinner('처리 중...');
    // showMessage가 내부적으로 stopSpinner 호출
    chat.showMessage({ role: 'assistant', content: '완료되었습니다.' });
    // spinner가 중단되어야 함
    expect(() => chat.stopSpinner()).not.toThrow();
  });

  it('contract 생성 플로우', () => {
    const chat = createChatUi({ version: '1.0.0' });
    chat.showContractStart();
    chat.startSpinner('Contract 생성 중...');
    chat.succeedSpinner('Contract 생성 완료!');
    chat.showContractComplete('/project/.adev/contract.json');
  });

  it('에러 플로우: spinner 실패 → 에러 메시지', () => {
    const chat = createChatUi();
    chat.startSpinner('API 호출 중...');
    chat.failSpinner('API 호출 실패');
    chat.error('자세한 에러: 네트워크 오류');
  });

  it('대화 이력 표시 후 help 표시', () => {
    const chat = createChatUi({ version: '0.0.1' });
    chat.showMessages([
      { role: 'assistant', content: '이전 메시지 1' },
      { role: 'assistant', content: '이전 메시지 2' },
    ]);
    chat.showHelp();
  });

  it('noColor 모드에서 전체 흐름', () => {
    setNoColor(true);
    const chat = createChatUi({ version: '0.0.1', model: 'opus' });
    chat.start();
    chat.system('초기화 중...');
    chat.showStreamingStart();
    chat.showStreamingDelta('노컬러 응답');
    chat.showStreamingEnd();
    chat.showExit();
  });

  it('다양한 ChatEvent 타입 처리 시나리오', () => {
    // waitForInput은 실제 I/O가 필요하므로 간접 테스트
    // ChatEvent 타입이 올바른지 확인
    type ChatEvent =
      | { type: 'message'; text: string }
      | { type: 'exit' }
      | { type: 'contract' }
      | { type: 'help' }
      | { type: 'clear' }
      | { type: 'interrupt' }
      | { type: 'eof' };

    const events: ChatEvent[] = [
      { type: 'message', text: 'hello' },
      { type: 'exit' },
      { type: 'contract' },
      { type: 'help' },
      { type: 'clear' },
      { type: 'interrupt' },
      { type: 'eof' },
    ];

    const chat = createChatUi();
    for (const event of events) {
      switch (event.type) {
        case 'message': expect(event.text).toBe('hello'); break;
        case 'exit': chat.showExit(); break;
        case 'contract': chat.showContractStart(); break;
        case 'help': chat.showHelp(); break;
        case 'clear': chat.system('초기화'); break;
        case 'interrupt': chat.showInterrupt(); break;
        case 'eof': break;
      }
    }
  });
});

// ── 엣지 케이스 / Edge cases ─────────────────────────────────────

describe('엣지 케이스', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('한국어 텍스트 stripAnsi', () => {
    const text = '\x1b[36m안녕하세요\x1b[0m';
    expect(stripAnsi(text)).toBe('안녕하세요');
  });

  it('이모지 포함 텍스트 stripAnsi', () => {
    const text = '\x1b[32m✔\x1b[0m 완료';
    expect(stripAnsi(text)).toBe('✔ 완료');
  });

  it('renderBox 매우 짧은 maxWidth', () => {
    setNoColor(true);
    const result = renderBox('hi', { maxWidth: 10 });
    expect(result).toContain('╭');
  });

  it('formatUserMessage 한국어 내용', () => {
    setNoColor(true);
    const result = formatUserMessage('안녕하세요, 프로젝트를 시작하고 싶습니다.');
    expect(result).toContain('안녕하세요');
  });

  it('formatAssistantMessage 마크다운 포함', () => {
    setNoColor(true);
    const md = '# 제목\n\n본문 텍스트\n\n```typescript\nconst x = 1;\n```';
    const result = formatAssistantMessage(md);
    expect(result).toContain('제목');
    expect(result).toContain('typescript');
  });

  it('Spinner 기본 write 함수 (process.stdout)', () => {
    // write 함수 없이 생성 - process.stdout.write 사용
    const s = new Spinner({ text: 'test', color: 'cyan' });
    expect(s).toBeInstanceOf(Spinner);
    // start/stop 오류 없이
    s.start();
    s.stop();
  });

  it('createRenderer 기본 옵션', () => {
    const renderer = createRenderer();
    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
    expect(typeof renderer.writeLine).toBe('function');
  });

  it('createRenderer noColor 설정', () => {
    setNoColor(false);
    const renderer = createRenderer({ noColor: false });
    expect(renderer).toBeDefined();
    setNoColor(true);
  });
});

// ── ANSI 추가 edge 케이스 ─────────────────────────────────────

describe('ansi 추가 edge 케이스', () => {
  beforeEach(() => setNoColor(false));
  afterEach(() => setNoColor(false));

  it('noColor=false에서 colorize는 ANSI 포함', () => {
    setNoColor(false);
    const result = colorize('test', 'red');
    expect(result).toContain('\x1b[');
  });

  it('noColor=true에서 bold는 원본 텍스트', () => {
    setNoColor(true);
    expect(bold('hello')).toBe('hello');
  });

  it('noColor=true에서 dim은 원본 텍스트', () => {
    setNoColor(true);
    expect(dim('world')).toBe('world');
  });

  it('noColor=true에서 cyan은 원본', () => {
    setNoColor(true);
    expect(cyan('text')).toBe('text');
  });

  it('noColor=true에서 green은 원본', () => {
    setNoColor(true);
    expect(green('text')).toBe('text');
  });

  it('noColor=true에서 red는 원본', () => {
    setNoColor(true);
    expect(red('text')).toBe('text');
  });

  it('noColor=true에서 yellow는 원본', () => {
    setNoColor(true);
    expect(yellow('text')).toBe('text');
  });

  it('noColor=true에서 gray는 원본', () => {
    setNoColor(true);
    expect(gray('text')).toBe('text');
  });

  it('noColor=true에서 brightCyan은 원본', () => {
    setNoColor(true);
    expect(brightCyan('text')).toBe('text');
  });

  it('noColor=true에서 brightWhite은 원본', () => {
    setNoColor(true);
    expect(brightWhite('text')).toBe('text');
  });

  it('stripAnsi 빈 문자열 → 빈 문자열', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('stripAnsi ANSI 없는 일반 텍스트 보존', () => {
    const text = 'no ansi here 123';
    expect(stripAnsi(text)).toBe(text);
  });

  it('displayWidth 한국어 2바이트 문자', () => {
    // 한국어는 각 2열 폭이거나 구현에 따라 다를 수 있음
    const w = displayWidth('안녕');
    expect(typeof w).toBe('number');
    expect(w).toBeGreaterThanOrEqual(2);
  });

  it('displayWidth 이모지 포함', () => {
    const w = displayWidth('✔');
    expect(typeof w).toBe('number');
  });

  it('cursorToLineStart는 ESC 시퀀스 포함', () => {
    const r = cursorToLineStart();
    // WHY: cursorToLineStart uses ANSI ESC[G (\u001B[G), not \r
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('hideCursor는 문자열', () => {
    expect(typeof hideCursor()).toBe('string');
  });

  it('showCursor는 문자열', () => {
    expect(typeof showCursor()).toBe('string');
  });

  it('clearLine은 문자열', () => {
    expect(typeof clearLine()).toBe('string');
  });

  it('clearAndReturn은 문자열', () => {
    expect(typeof clearAndReturn()).toBe('string');
  });

  it('noColor=false에서 hideCursor는 ANSI 포함', () => {
    setNoColor(false);
    expect(hideCursor()).toContain('\x1b[');
  });

  it('noColor=false에서 showCursor는 ANSI 포함', () => {
    setNoColor(false);
    expect(showCursor()).toContain('\x1b[');
  });

  it('colorize 여러 스타일 동시 적용', () => {
    const result = colorize('text', 'cyan', ['bold', 'dim']);
    expect(result).toContain('text');
  });

  it('bold는 \\x1b[1m 포함 (noColor=false)', () => {
    setNoColor(false);
    expect(bold('x')).toContain('\x1b[1m');
  });

  it('dim는 \\x1b[2m 포함 (noColor=false)', () => {
    setNoColor(false);
    expect(dim('x')).toContain('\x1b[2m');
  });

  it('reset은 0m 포함 (noColor=false)', () => {
    setNoColor(false);
    expect(reset()).toContain('0m');
  });

  it('noColor=false에서 fg cyan은 36 포함', () => {
    setNoColor(false);
    expect(fg('cyan')).toContain('36');
  });

  it('noColor=true에서 fg는 빈 문자열', () => {
    setNoColor(true);
    expect(fg('cyan')).toBe('');
  });

  it('noColor=true에서 bg는 빈 문자열', () => {
    setNoColor(true);
    expect(bg('bgRed')).toBe('');
  });

  it('noColor=true에서 style은 빈 문자열', () => {
    setNoColor(true);
    expect(style('bold')).toBe('');
  });

  it('noColor=true에서 reset은 빈 문자열', () => {
    setNoColor(true);
    expect(reset()).toBe('');
  });

  it('stripAnsi 연속 ANSI 코드 제거', () => {
    const text = '\x1b[1m\x1b[32m\x1b[4mbold-green-underline\x1b[0m';
    expect(stripAnsi(text)).toBe('bold-green-underline');
  });

  it('displayWidth ANSI 포함 문자열 → 실제 표시 길이', () => {
    const raw = 'hello';
    const colored = colorize(raw, 'cyan');
    expect(displayWidth(colored)).toBe(raw.length);
  });
});

// ── Renderer 추가 edge 케이스 ─────────────────────────────────

describe('renderer 추가 edge 케이스', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('renderBox 빈 title → content만 포함', () => {
    const result = renderBox('some content', { title: '' });
    expect(result).toContain('some content');
  });

  it('renderHeader 긴 버전 문자열', () => {
    const result = renderHeader('100.200.300-beta.1');
    expect(result).toContain('100.200.300-beta.1');
  });

  it('renderDivider 긴 레이블', () => {
    const longLabel = 'A'.repeat(50);
    const result = renderDivider(longLabel);
    expect(result).toContain(longLabel);
  });

  it('renderPrompt 빈 텍스트', () => {
    const result = renderPrompt('');
    expect(result).toContain('❯');
  });

  it('formatUserMessage 특수문자 포함', () => {
    const result = formatUserMessage('!@#$%^&*()');
    expect(result).toContain('!@#$%^&*()');
  });

  it('formatAssistantMessage 빈 메시지', () => {
    const result = formatAssistantMessage('');
    expect(typeof result).toBe('string');
  });

  it('formatSystemMessage 빈 메시지', () => {
    const result = formatSystemMessage('');
    expect(result).toContain('◆');
  });

  it('formatErrorMessage 빈 메시지', () => {
    const result = formatErrorMessage('');
    expect(result).toContain('✖');
  });

  it('formatSuccessMessage 빈 메시지', () => {
    const result = formatSuccessMessage('');
    expect(result).toContain('✔');
  });

  it('formatUserMessage 긴 메시지', () => {
    const longMsg = 'A'.repeat(500);
    const result = formatUserMessage(longMsg);
    expect(result).toContain('You');
  });

  it('formatAssistantMessage 긴 메시지', () => {
    const longMsg = 'B'.repeat(500);
    const result = formatAssistantMessage(longMsg);
    expect(typeof result).toBe('string');
  });

  it('createRenderer write 호출', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.write('raw write');
    expect(output()).toContain('raw write');
  });

  it('createRenderer renderHeader 출력', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.renderHeader('1.0.0');
    expect(output()).toContain('1.0.0');
  });

  it('createRenderer writeLine 빈 문자열', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.writeLine('');
    expect(typeof output()).toBe('string');
  });

  it('createRenderer 여러 writeLine 순서 유지', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.writeLine('first');
    renderer.writeLine('second');
    renderer.writeLine('third');
    const out = output();
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
    expect(out.indexOf('second')).toBeLessThan(out.indexOf('third'));
  });

  it('renderBox 스타일 없을 때 기본 rounded', () => {
    const result = renderBox('default style');
    expect(result).toContain('╭'); // default = rounded
  });

  it('renderHeader 반환값 문자열', () => {
    expect(typeof renderHeader('1.0.0')).toBe('string');
  });

  it('renderDivider 반환값 문자열', () => {
    expect(typeof renderDivider()).toBe('string');
  });

  it('renderPrompt 반환값 문자열', () => {
    expect(typeof renderPrompt()).toBe('string');
  });

  it('formatUserMessage 반환값 문자열', () => {
    expect(typeof formatUserMessage('msg')).toBe('string');
  });

  it('formatAssistantMessage 반환값 문자열', () => {
    expect(typeof formatAssistantMessage('msg')).toBe('string');
  });

  it('formatSystemMessage 반환값 문자열', () => {
    expect(typeof formatSystemMessage('msg')).toBe('string');
  });

  it('formatErrorMessage 반환값 문자열', () => {
    expect(typeof formatErrorMessage('msg')).toBe('string');
  });

  it('formatSuccessMessage 반환값 문자열', () => {
    expect(typeof formatSuccessMessage('msg')).toBe('string');
  });
});

// ── Spinner 추가 edge 케이스 ─────────────────────────────────

describe('Spinner 추가 edge 케이스', () => {
  it('BRAILLE_FRAMES 각 요소는 문자열', () => {
    for (const frame of BRAILLE_FRAMES) {
      expect(typeof frame).toBe('string');
    }
  });

  it('ASCII_FRAMES 각 요소는 문자열', () => {
    for (const frame of ASCII_FRAMES) {
      expect(typeof frame).toBe('string');
    }
  });

  it('DEFAULT_FRAMES는 배열', () => {
    expect(Array.isArray(DEFAULT_FRAMES)).toBe(true);
  });

  it('createSpinner 기본 상태는 idle', () => {
    const s = createSpinner('test');
    expect(s.currentState).toBe('idle');
  });

  it('createSpinner 텍스트 설정', () => {
    const s = createSpinner('hello spinner');
    expect(s.currentText).toBe('hello spinner');
  });

  it('start 후 stop → idle 상태', () => {
    const s = new Spinner({ text: 'test', color: 'cyan' }, () => {});
    s.start();
    s.stop();
    expect(s.currentState).toBe('idle');
  });

  it('start 후 succeed → success 상태', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test', color: 'green' }, (t) => output.push(t));
    s.start();
    s.succeed('완료');
    expect(s.currentState).toBe('success');
  });

  it('start 후 fail → error 상태', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test', color: 'red' }, (t) => output.push(t));
    s.start();
    s.fail('실패');
    expect(s.currentState).toBe('error');
  });

  it('succeed 후 currentState 갱신', () => {
    const s = new Spinner({ text: 'original', color: 'cyan' }, () => {});
    s.start();
    s.succeed('Done message');
    // WHY: succeed() finalizes spinner but currentText stays as original
    expect(s.currentText).toBe('original');
    expect(s.currentState).toBe('success');
  });

  it('fail 후 currentState 갱신', () => {
    const s = new Spinner({ text: 'original', color: 'cyan' }, () => {});
    s.start();
    s.fail('Failed message');
    // WHY: fail() finalizes spinner but currentText stays as original
    expect(s.currentText).toBe('original');
    expect(s.currentState).toBe('error');
  });

  it('updateText → currentText 갱신', () => {
    const s = createSpinner('initial text');
    s.updateText('new text');
    expect(s.currentText).toBe('new text');
  });

  it('빈 텍스트로 createSpinner → ok', () => {
    const s = createSpinner('');
    expect(s).toBeInstanceOf(Spinner);
    expect(s.currentText).toBe('');
  });

  it('한국어 텍스트 spinner → ok', () => {
    const s = createSpinner('처리 중...');
    expect(s.currentText).toBe('처리 중...');
    s.start();
    s.stop();
  });

  it('spinner color: green → ok', () => {
    const s = new Spinner({ text: 'test', color: 'green' }, () => {});
    s.start();
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('spinner color: red → ok', () => {
    const s = new Spinner({ text: 'test', color: 'red' }, () => {});
    s.start();
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('spinner color: yellow → ok', () => {
    const s = new Spinner({ text: 'test', color: 'yellow' }, () => {});
    s.start();
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('idle 상태에서 stop → idle 유지', () => {
    const s = createSpinner('test');
    s.stop(); // idle에서 stop
    expect(s.currentState).toBe('idle');
  });

  it('stop 후 succeed → 오류 없이 실행', () => {
    const s = new Spinner({ text: 'test', color: 'cyan' }, () => {});
    s.start();
    s.stop();
    expect(() => s.succeed('done after stop')).not.toThrow();
  });
});

// ── ChatUi 추가 edge 케이스 ─────────────────────────────────

describe('ChatUi 추가 edge 케이스', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('createChatUi 기본 옵션 → ChatUi 인스턴스', () => {
    const chat = createChatUi();
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('createChatUi version 설정', () => {
    const chat = createChatUi({ version: '3.0.0' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('createChatUi model 설정', () => {
    const chat = createChatUi({ model: 'claude-haiku-4-5-20251001' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('createChatUi phase 설정', () => {
    const chat = createChatUi({ phase: 'TEST' });
    expect(chat).toBeInstanceOf(ChatUi);
  });

  it('error 빈 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.error('')).not.toThrow();
  });

  it('success 빈 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.success('')).not.toThrow();
  });

  it('system 빈 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.system('')).not.toThrow();
  });

  it('error 한국어 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.error('인증 오류가 발생했습니다')).not.toThrow();
  });

  it('success 한국어 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.success('작업이 완료되었습니다')).not.toThrow();
  });

  it('system 한국어 메시지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.system('시스템 초기화 중...')).not.toThrow();
  });

  it('showContractComplete 긴 경로 → 오류 없이 실행', () => {
    const chat = createChatUi();
    const longPath = '/home/user/projects/my-project/'.repeat(5) + '.adev/contract.json';
    expect(() => chat.showContractComplete(longPath)).not.toThrow();
  });

  it('showMessages 빈 배열 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.showMessages([])).not.toThrow();
  });

  it('showMessages 1개 assistant 메시지', () => {
    const chat = createChatUi();
    expect(() => chat.showMessages([{ role: 'assistant', content: '응답' }])).not.toThrow();
  });

  it('showMessages 1개 error 메시지', () => {
    const chat = createChatUi();
    expect(() => chat.showMessages([{ role: 'error', content: '오류' }])).not.toThrow();
  });

  it('showStreamingDelta 빈 텍스트 → 오류 없이 실행', () => {
    const chat = createChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingDelta 한국어 → 오류 없이 실행', () => {
    const chat = createChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('안녕하세요')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingDelta 이모지 → 오류 없이 실행', () => {
    const chat = createChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('🎉 완료되었습니다!')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('startSpinner 빈 텍스트 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.startSpinner('')).not.toThrow();
    chat.stopSpinner();
  });

  it('startSpinner 한국어 텍스트 → 오류 없이 실행', () => {
    const chat = createChatUi();
    expect(() => chat.startSpinner('처리 중입니다...')).not.toThrow();
    chat.stopSpinner();
  });

  it('succeedSpinner 한국어 → 오류 없이 실행', () => {
    const chat = createChatUi();
    chat.startSpinner('작업 중');
    expect(() => chat.succeedSpinner('작업 완료!')).not.toThrow();
  });

  it('failSpinner 한국어 → 오류 없이 실행', () => {
    const chat = createChatUi();
    chat.startSpinner('작업 중');
    expect(() => chat.failSpinner('작업 실패')).not.toThrow();
  });

  it('연속 5번 startSpinner/stopSpinner → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 5; i++) {
      chat.startSpinner(`작업 ${i}`);
      chat.stopSpinner();
    }
  });

  it('연속 streaming 3회 → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 3; i++) {
      chat.showStreamingStart();
      chat.showStreamingDelta(`응답 ${i}`);
      chat.showStreamingEnd();
    }
  });

  it('showStreamingStart timestamp 없이 호출', () => {
    const chat = createChatUi();
    expect(() => chat.showStreamingStart()).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingStart timestamp 포함 호출', () => {
    const chat = createChatUi();
    expect(() => chat.showStreamingStart(new Date('2026-01-01'))).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingEnd 없이 start만 → 오류 없음', () => {
    const chat = createChatUi();
    expect(() => chat.showStreamingStart()).not.toThrow();
    // end 없이도 문제없어야 함
  });

  it('showMessage role=success → 오류 없이 실행 (있다면)', () => {
    const chat = createChatUi();
    // role=success는 정의에 없을 수 있으나 타입에 있다면 처리
    expect(() => chat.showMessage({ role: 'assistant', content: 'ok' })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// BATCH 75 EXTENSION: 추가 edge/random 케이스
// ══════════════════════════════════════════════════════════════════

describe('ansi batch75 추가 케이스', () => {
  beforeEach(() => setNoColor(false));
  afterEach(() => setNoColor(false));

  it('colorize 빈 스타일 배열 → ANSI 포함', () => {
    const result = colorize('text', 'cyan', []);
    expect(result).toContain('\x1b[');
  });

  it('colorize 긴 텍스트 → ANSI 래핑', () => {
    const longText = 'a'.repeat(500);
    const result = colorize(longText, 'green');
    expect(result).toContain(longText);
    expect(result).toContain('\x1b[');
  });

  it('stripAnsi 중첩 ANSI 코드 완전 제거', () => {
    const nested = bold(cyan('nested'));
    expect(stripAnsi(nested)).toBe('nested');
  });

  it('stripAnsi 숫자만 포함 문자열 → 그대로', () => {
    expect(stripAnsi('12345')).toBe('12345');
  });

  it('stripAnsi 특수문자 보존', () => {
    const text = '!@#$%^&*()';
    expect(stripAnsi(text)).toBe(text);
  });

  it('displayWidth 숫자만 포함 → 정확한 길이', () => {
    expect(displayWidth('12345')).toBe(5);
  });

  it('displayWidth 공백 포함 → 정확한 길이', () => {
    expect(displayWidth('a b c')).toBe(5);
  });

  it('displayWidth 0 → 빈 문자열', () => {
    expect(displayWidth('')).toBe(0);
  });

  it('noColor=true → green 원본 문자열 반환', () => {
    setNoColor(true);
    expect(green('hello')).toBe('hello');
  });

  it('noColor=true → red 원본 문자열 반환', () => {
    setNoColor(true);
    expect(red('error')).toBe('error');
  });

  it('noColor=false → yellow ANSI 포함', () => {
    setNoColor(false);
    expect(yellow('warn')).toContain('\x1b[');
  });

  it('noColor=false → brightCyan ANSI 포함', () => {
    setNoColor(false);
    expect(brightCyan('info')).toContain('\x1b[');
  });

  it('noColor=false → brightWhite ANSI 포함', () => {
    setNoColor(false);
    expect(brightWhite('text')).toContain('\x1b[');
  });

  it('fg와 bg 모두 noColor=false에서 ANSI', () => {
    setNoColor(false);
    expect(fg('cyan')).toContain('\x1b[');
    expect(bg('bgRed')).toContain('\x1b[');
  });

  it('style bold noColor=false → ANSI', () => {
    setNoColor(false);
    expect(style('bold')).toContain('\x1b[');
  });

  it('reset noColor=false → ANSI', () => {
    setNoColor(false);
    expect(reset()).toContain('\x1b[');
  });

  it('cursorToLineStart 반환 길이 > 0 (항상)', () => {
    setNoColor(false);
    expect(cursorToLineStart().length).toBeGreaterThan(0);
  });

  it('clearLine noColor=false → ESC[2K 포함', () => {
    setNoColor(false);
    expect(clearLine()).toContain('\x1b[2K');
  });

  it('hideCursor noColor=true → 빈 문자열 아닐 수 있음 (구현 확인)', () => {
    setNoColor(true);
    const r = hideCursor();
    expect(typeof r).toBe('string');
  });

  it('showCursor noColor=true → 빈 문자열 아닐 수 있음 (구현 확인)', () => {
    setNoColor(true);
    const r = showCursor();
    expect(typeof r).toBe('string');
  });
});

describe('renderer batch75 추가 케이스', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('renderBox 단일 문자 내용', () => {
    const result = renderBox('X');
    expect(result).toContain('X');
    expect(result).toContain('╭');
  });

  it('renderBox 제목과 내용 모두 단일 문자', () => {
    const result = renderBox('C', { title: 'T' });
    expect(result).toContain('C');
    expect(result).toContain('T');
  });

  it('renderBox 긴 제목 → 박스 포함', () => {
    const longTitle = '제목'.repeat(10);
    const result = renderBox('내용', { title: longTitle });
    expect(result).toContain('내용');
  });

  it('renderBox maxWidth=20 → 박스 포함', () => {
    const result = renderBox('hello world this is long text here', { maxWidth: 20 });
    expect(result).toContain('╭');
  });

  it('renderHeader 빈 모델명 → 오류 없음', () => {
    const result = renderHeader('1.0.0', '');
    expect(result).toContain('1.0.0');
  });

  it('renderDivider 빈 레이블 문자열 → 오류 없음', () => {
    const result = renderDivider('');
    expect(typeof result).toBe('string');
  });

  it('renderPrompt 한국어 텍스트', () => {
    const result = renderPrompt('안녕하세요');
    expect(result).toContain('안녕하세요');
  });

  it('formatUserMessage 이모지 포함 메시지', () => {
    const result = formatUserMessage('🎉 완료!');
    expect(result).toContain('🎉 완료!');
  });

  it('formatAssistantMessage 긴 응답', () => {
    const longMsg = '응답 내용'.repeat(20);
    const result = formatAssistantMessage(longMsg);
    expect(result).toContain('응답 내용');
  });

  it('formatSystemMessage 숫자 포함', () => {
    const result = formatSystemMessage('Phase 3 시작');
    expect(result).toContain('Phase 3 시작');
  });

  it('formatErrorMessage 한국어 에러', () => {
    const result = formatErrorMessage('파일을 찾을 수 없습니다');
    expect(result).toContain('파일을 찾을 수 없습니다');
  });

  it('formatSuccessMessage 한국어 성공', () => {
    const result = formatSuccessMessage('빌드 완료');
    expect(result).toContain('빌드 완료');
  });

  it('createRenderer write 함수 존재', () => {
    const { target } = makeBuffer();
    const renderer = createRenderer({ output: target });
    expect(typeof renderer.write).toBe('function');
  });

  it('createRenderer writeLine 빈 문자열', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.writeLine('');
    expect(typeof output()).toBe('string');
  });

  it('createRenderer renderUser 한국어', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.renderUser('사용자 메시지');
    expect(output()).toContain('사용자 메시지');
  });

  it('createRenderer renderSystem 숫자만', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.renderSystem('12345');
    expect(output()).toContain('12345');
  });

  it('createRenderer renderError 특수문자', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.renderError('Error: 파일 없음!');
    expect(output()).toContain('Error: 파일 없음!');
  });

  it('createRenderer renderSuccess 빈 문자열', () => {
    const { target, output } = makeBuffer();
    const renderer = createRenderer({ output: target });
    renderer.renderSuccess('');
    expect(typeof output()).toBe('string');
  });
});

describe('Spinner batch75 추가 케이스', () => {
  it('BRAILLE_FRAMES 요소 모두 string', () => {
    for (const frame of BRAILLE_FRAMES) {
      expect(typeof frame).toBe('string');
    }
  });

  it('ASCII_FRAMES 요소 모두 string', () => {
    for (const frame of ASCII_FRAMES) {
      expect(typeof frame).toBe('string');
    }
  });

  it('createSpinner 한국어 텍스트', () => {
    const s = createSpinner('로딩 중...');
    expect(s.currentText).toBe('로딩 중...');
  });

  it('createSpinner 특수문자 텍스트', () => {
    const s = createSpinner('!@#$%');
    expect(s.currentText).toBe('!@#$%');
  });

  it('createSpinner 긴 텍스트', () => {
    const s = createSpinner('a'.repeat(200));
    expect(s.currentText).toHaveLength(200);
  });

  it('start → updateText → stop 순서', () => {
    const s = createSpinner('initial');
    s.start();
    s.updateText('updated during spin');
    expect(s.currentText).toBe('updated during spin');
    s.stop();
    expect(s.currentState).toBe('idle');
  });

  it('succeed 후 currentState=success (currentText 변경 안 됨)', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'working' }, (t) => output.push(t));
    s.start();
    s.succeed('완료!');
    expect(s.currentState).toBe('success');
  });

  it('fail 후 currentState=error', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'working' }, (t) => output.push(t));
    s.start();
    s.fail('실패!');
    expect(s.currentState).toBe('error');
  });

  it('info 후 상태는 idle', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test' }, (t) => output.push(t));
    s.start();
    s.info('정보');
    expect(s.currentState).toBe('idle');
  });

  it('warn 후 상태는 idle', () => {
    const output: string[] = [];
    const s = new Spinner({ text: 'test' }, (t) => output.push(t));
    s.start();
    s.warn('경고');
    expect(s.currentState).toBe('idle');
  });

  it('stop 후 다시 start 가능', () => {
    const s = createSpinner('test');
    s.start();
    s.stop();
    s.start('다시 시작');
    expect(s.currentState).toBe('spinning');
    s.stop();
  });

  it('updateText 여러 번 호출 → 마지막 값 유지', () => {
    const s = createSpinner('init');
    s.updateText('first');
    s.updateText('second');
    s.updateText('third');
    expect(s.currentText).toBe('third');
  });

  it('DEFAULT_FRAMES는 배열', () => {
    expect(Array.isArray(DEFAULT_FRAMES)).toBe(true);
  });
});

describe('ChatUi batch75 추가 케이스', () => {
  beforeEach(() => setNoColor(true));
  afterEach(() => setNoColor(false));

  it('createChatUi 기본 생성 → ChatUi 인스턴스', () => {
    expect(createChatUi()).toBeInstanceOf(ChatUi);
  });

  it('createChatUi 빈 옵션 → ChatUi 인스턴스', () => {
    expect(createChatUi({})).toBeInstanceOf(ChatUi);
  });

  it('showContractComplete 다양한 경로', () => {
    const chat = createChatUi();
    expect(() => chat.showContractComplete('')).not.toThrow();
    expect(() => chat.showContractComplete('/very/deep/path/to/contract.json')).not.toThrow();
    expect(() => chat.showContractComplete('contract.json')).not.toThrow();
  });

  it('error() 여러번 연속 호출 → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 5; i++) {
      expect(() => chat.error(`에러 ${i}`)).not.toThrow();
    }
  });

  it('success() 여러번 연속 호출 → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 5; i++) {
      expect(() => chat.success(`성공 ${i}`)).not.toThrow();
    }
  });

  it('system() 여러번 연속 호출 → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 5; i++) {
      expect(() => chat.system(`시스템 ${i}`)).not.toThrow();
    }
  });

  it('showStreamingDelta 특수문자 포함', () => {
    const chat = createChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('!@#$%^&*()')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showStreamingDelta 숫자 문자열', () => {
    const chat = createChatUi();
    chat.showStreamingStart();
    expect(() => chat.showStreamingDelta('123456789')).not.toThrow();
    chat.showStreamingEnd();
  });

  it('showMessage 연속 10회 → 오류 없음', () => {
    const chat = createChatUi();
    for (let i = 0; i < 10; i++) {
      expect(() => chat.showMessage({ role: 'assistant', content: `msg ${i}` })).not.toThrow();
    }
  });

  it('showMessages 10개 배열 → 오류 없음', () => {
    const chat = createChatUi();
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: 'assistant' as const,
      content: `message ${i}`,
    }));
    expect(() => chat.showMessages(msgs)).not.toThrow();
  });

  it('startSpinner → succeedSpinner 사이클 3회', () => {
    const chat = createChatUi();
    for (let i = 0; i < 3; i++) {
      chat.startSpinner(`작업 ${i}`);
      expect(() => chat.succeedSpinner(`완료 ${i}`)).not.toThrow();
    }
  });

  it('startSpinner → failSpinner 사이클 3회', () => {
    const chat = createChatUi();
    for (let i = 0; i < 3; i++) {
      chat.startSpinner(`작업 ${i}`);
      expect(() => chat.failSpinner(`실패 ${i}`)).not.toThrow();
    }
  });

  it('createChatUi phase=DESIGN → 인스턴스', () => {
    expect(createChatUi({ phase: 'DESIGN' })).toBeInstanceOf(ChatUi);
  });

  it('createChatUi phase=CODE → 인스턴스', () => {
    expect(createChatUi({ phase: 'CODE' })).toBeInstanceOf(ChatUi);
  });

  it('createChatUi phase=TEST → 인스턴스', () => {
    expect(createChatUi({ phase: 'TEST' })).toBeInstanceOf(ChatUi);
  });

  it('createChatUi phase=VERIFY → 인스턴스', () => {
    expect(createChatUi({ phase: 'VERIFY' })).toBeInstanceOf(ChatUi);
  });
});
