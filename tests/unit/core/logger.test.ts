import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ConsoleLogger, maskSensitiveData } from '../../../src/core/logger.js';
import type { Logger } from '../../../src/core/logger.js';

// ── maskSensitiveData ────────────────────────────────────────

describe('maskSensitiveData', () => {
  it('Anthropic API key를 마스킹한다', () => {
    const text = 'key: sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const masked = maskSensitiveData(text);

    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).toContain('***REDACTED***');
  });

  it('OAuth 토큰을 마스킹한다', () => {
    const text = 'token: sk-ant-oat01-abcdefghijklmnopqrstuvwxyz123456';
    const masked = maskSensitiveData(text);

    expect(masked).not.toContain('sk-ant-oat01');
    expect(masked).toContain('***REDACTED***');
  });

  it('ANTHROPIC_API_KEY= 패턴을 마스킹한다', () => {
    const text = 'export ANTHROPIC_API_KEY=sk-ant-some-key-value';
    const masked = maskSensitiveData(text);

    expect(masked).toContain('***REDACTED***');
  });

  it('CLAUDE_CODE_OAUTH_TOKEN= 패턴을 마스킹한다', () => {
    const text = 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-xyz';
    const masked = maskSensitiveData(text);

    expect(masked).toContain('***REDACTED***');
  });

  it('민감 정보가 없는 문자열은 변경하지 않는다', () => {
    const text = 'normal log message without any keys';
    const masked = maskSensitiveData(text);

    expect(masked).toBe(text);
  });

  it('빈 문자열을 처리한다', () => {
    expect(maskSensitiveData('')).toBe('');
  });

  it('여러 개의 민감 정보를 동시에 마스킹한다', () => {
    const text = 'key1=sk-ant-api01-aaabbbcccdddeeefffggg key2=sk-ant-oat01-xxxyyyzzz111222333';
    const masked = maskSensitiveData(text);

    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).not.toContain('sk-ant-oat01');
  });

  it('짧은 sk-ant 문자열은 마스킹하지 않는다', () => {
    const text = 'sk-ant-short';
    const masked = maskSensitiveData(text);

    // 20자 미만이면 패턴에 매칭되지 않음
    expect(masked).toBe(text);
  });
});

// ── ConsoleLogger 레벨 필터링 ────────────────────────────────

describe('ConsoleLogger 레벨 필터링', () => {
  let writeOutput: string[];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    writeOutput = [];
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      writeOutput.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('설정된 레벨 이상만 출력한다 (error 레벨)', () => {
    const logger = new ConsoleLogger('error');

    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    expect(writeOutput).toHaveLength(1);
    expect(writeOutput[0]).toContain('error msg');
  });

  it('warn 레벨 시 warn과 error만 출력한다', () => {
    const logger = new ConsoleLogger('warn');

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(writeOutput).toHaveLength(2);
  });

  it('info 레벨 시 info, warn, error를 출력한다', () => {
    const logger = new ConsoleLogger('info');

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(writeOutput).toHaveLength(3);
  });

  it('debug 레벨 시 모든 메시지를 출력한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(writeOutput).toHaveLength(4);
  });
});

// ── ConsoleLogger JSON 포맷 ──────────────────────────────────

describe('ConsoleLogger JSON 출력', () => {
  let writeOutput: string[];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    writeOutput = [];
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      writeOutput.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('JSON 형식으로 출력한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('test message');

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
  });

  it('context를 포함하여 출력한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('with context', { module: 'config', count: 42 });

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.module).toBe('config');
    expect(parsed.context.count).toBe(42);
  });

  it('context 없으면 context 필드를 생략한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('no context');

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context).toBeUndefined();
  });

  it('메시지 내 credential을 마스킹하여 출력한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('key: sk-ant-api01-abcdefghijklmnopqrstuvwxyz');

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.message).toContain('***REDACTED***');
    expect(parsed.message).not.toContain('sk-ant-api01');
  });

  it('context 내 credential을 마스킹하여 출력한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('auth check', { token: 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz123456' });

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.token).toContain('***REDACTED***');
  });

  it('중첩 context 내 credential을 마스킹한다', () => {
    const logger = new ConsoleLogger('debug');

    logger.info('nested', {
      auth: { key: 'sk-ant-api01-abcdefghijklmnopqrstuvwxyz' },
    });

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.auth.key).toContain('***REDACTED***');
  });
});

// ── child() ──────────────────────────────────────────────────

describe('ConsoleLogger.child()', () => {
  let writeOutput: string[];
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    writeOutput = [];
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      writeOutput.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('부모 컨텍스트를 상속한다', () => {
    const parent = new ConsoleLogger('debug', { service: 'adev' });
    const child = parent.child({ module: 'config' });

    child.info('test');

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.service).toBe('adev');
    expect(parsed.context.module).toBe('config');
  });

  it('호출 시 추가 컨텍스트를 병합한다', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ module: 'auth' });

    child.info('login', { userId: 'u-001' });

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.module).toBe('auth');
    expect(parsed.context.userId).toBe('u-001');
  });

  it('부모의 레벨 설정을 상속한다', () => {
    const parent = new ConsoleLogger('error');
    const child = parent.child({ module: 'test' });

    child.debug('should not appear');
    child.info('should not appear');
    child.error('should appear');

    expect(writeOutput).toHaveLength(1);
  });

  it('Logger 인터페이스를 구현한다', () => {
    const parent = new ConsoleLogger('debug');
    const child: Logger = parent.child({ module: 'test' });

    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.child).toBe('function');
  });
});
