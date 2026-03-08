import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger, maskSensitiveData } from 'core/logger.js';
import type { Logger } from 'core/logger.js';

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

  it('반환값이 문자열이다', () => {
    expect(typeof maskSensitiveData('any text')).toBe('string');
  });

  it('반환값이 undefined가 아니다', () => {
    expect(maskSensitiveData('text')).not.toBeUndefined();
  });

  it('반환값이 null이 아니다', () => {
    expect(maskSensitiveData('text')).not.toBeNull();
  });

  it('마스킹 후 원본 API 키가 노출되지 않는다', () => {
    const apiKey = 'sk-ant-api01-realApiKeyValue1234567890';
    const masked = maskSensitiveData(`using key: ${apiKey}`);
    expect(masked).not.toContain(apiKey);
  });

  it('공백 문자열 처리', () => {
    const masked = maskSensitiveData('   ');
    expect(typeof masked).toBe('string');
  });

  it('특수문자 포함 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = 'hello!@#$%^&*()_+-=[]{}|;:,.<>?';
    const masked = maskSensitiveData(text);
    expect(masked).toBe(text);
  });

  it('숫자만 있는 문자열 → 변경 없음', () => {
    const text = '1234567890';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('반복 호출 → 동일 결과', () => {
    const text = 'key: sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const m1 = maskSensitiveData(text);
    const m2 = maskSensitiveData(text);
    expect(m1).toBe(m2);
  });

  it('이미 마스킹된 문자열 → 변경 없음', () => {
    const masked = 'using ***REDACTED*** token';
    const reMasked = maskSensitiveData(masked);
    expect(reMasked).toBe(masked);
  });

  it('한국어 포함 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = '사용자 인증 처리 중입니다';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('URL 포함 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = 'connecting to https://api.example.com/v1';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('긴 문자열 (1000자) → 처리됨', () => {
    const text = 'x'.repeat(1000);
    const masked = maskSensitiveData(text);
    expect(typeof masked).toBe('string');
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

  it('error 레벨 logger → debug 출력 없음', () => {
    const logger = new ConsoleLogger('error');
    logger.debug('should not appear');
    expect(writeOutput).toHaveLength(0);
  });

  it('error 레벨 logger → info 출력 없음', () => {
    logger_error_only: {
      const logger = new ConsoleLogger('error');
      logger.info('should not appear');
      expect(writeOutput).toHaveLength(0);
    }
  });

  it('error 레벨 logger → warn 출력 없음', () => {
    const logger = new ConsoleLogger('error');
    logger.warn('should not appear');
    expect(writeOutput).toHaveLength(0);
  });

  it('error 레벨 logger → error 출력됨', () => {
    const logger = new ConsoleLogger('error');
    logger.error('error message');
    expect(writeOutput).toHaveLength(1);
  });

  it('warn 레벨 logger → debug 출력 없음', () => {
    const logger = new ConsoleLogger('warn');
    logger.debug('no');
    expect(writeOutput).toHaveLength(0);
  });

  it('warn 레벨 logger → info 출력 없음', () => {
    const logger = new ConsoleLogger('warn');
    logger.info('no');
    expect(writeOutput).toHaveLength(0);
  });

  it('warn 레벨 logger → warn 출력됨', () => {
    const logger = new ConsoleLogger('warn');
    logger.warn('yes');
    expect(writeOutput).toHaveLength(1);
  });

  it('info 레벨 logger → debug 출력 없음', () => {
    const logger = new ConsoleLogger('info');
    logger.debug('no');
    expect(writeOutput).toHaveLength(0);
  });

  it('info 레벨 logger → info 출력됨', () => {
    const logger = new ConsoleLogger('info');
    logger.info('yes');
    expect(writeOutput).toHaveLength(1);
  });

  it('debug 레벨 logger → debug 출력됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.debug('yes');
    expect(writeOutput).toHaveLength(1);
  });

  it('여러 번 error 출력 → 각각 별도 라인', () => {
    const logger = new ConsoleLogger('error');
    logger.error('e1');
    logger.error('e2');
    logger.error('e3');
    expect(writeOutput).toHaveLength(3);
  });

  it('같은 메시지 여러 번 → 각각 출력됨', () => {
    const logger = new ConsoleLogger('info');
    logger.info('repeat');
    logger.info('repeat');
    logger.info('repeat');
    expect(writeOutput).toHaveLength(3);
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

  it('level 필드가 올바른 레벨로 출력된다 (debug)', () => {
    const logger = new ConsoleLogger('debug');
    logger.debug('d');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.level).toBe('debug');
  });

  it('level 필드가 올바른 레벨로 출력된다 (warn)', () => {
    const logger = new ConsoleLogger('debug');
    logger.warn('w');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.level).toBe('warn');
  });

  it('level 필드가 올바른 레벨로 출력된다 (error)', () => {
    const logger = new ConsoleLogger('debug');
    logger.error('e');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.level).toBe('error');
  });

  it('timestamp는 ISO 형식 문자열이다', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('ts');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(() => new Date(parsed.timestamp)).not.toThrow();
  });

  it('message 필드가 문자열이다', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('hello');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(typeof parsed.message).toBe('string');
  });

  it('빈 문자열 메시지 출력 가능', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.message).toBe('');
  });

  it('숫자 context → 올바르게 직렬화', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('num', { count: 42 });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.count).toBe(42);
  });

  it('boolean context → 올바르게 직렬화', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('bool', { flag: true });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.flag).toBe(true);
  });

  it('배열 context → 올바르게 직렬화', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('arr', { items: [1, 2, 3] });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.items).toEqual([1, 2, 3]);
  });

  it('한국어 메시지 → 올바르게 직렬화', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('사용자 인증 완료');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.message).toBe('사용자 인증 완료');
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

  it('child.child() 호환 → 손자 logger', () => {
    const parent = new ConsoleLogger('debug', { service: 'adev' });
    const child = parent.child({ module: 'auth' });
    const grandchild = child.child({ operation: 'login' });

    grandchild.info('grandchild msg');

    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.service).toBe('adev');
    expect(parsed.context.module).toBe('auth');
    expect(parsed.context.operation).toBe('login');
  });

  it('child는 ConsoleLogger 인스턴스이다', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ x: 1 });
    expect(child).toBeInstanceOf(ConsoleLogger);
  });

  it('child는 부모와 독립적이다', () => {
    const parent = new ConsoleLogger('debug', { service: 'parent' });
    const child = parent.child({ extra: 'child' });

    parent.info('parent msg');
    child.info('child msg');

    expect(writeOutput).toHaveLength(2);
    const parentParsed = JSON.parse(writeOutput[0]!);
    const childParsed = JSON.parse(writeOutput[1]!);
    expect(parentParsed.context.service).toBe('parent');
    expect(parentParsed.context.extra).toBeUndefined();
    expect(childParsed.context.service).toBe('parent');
    expect(childParsed.context.extra).toBe('child');
  });

  it('child warn 레벨 상속 → debug/info 출력 없음', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.debug('no');
    child.info('no');
    expect(writeOutput).toHaveLength(0);
  });

  it('child warn 레벨 상속 → warn 출력됨', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.warn('yes');
    expect(writeOutput).toHaveLength(1);
  });

  it('빈 context로 child 생성 가능', () => {
    const parent = new ConsoleLogger('debug');
    expect(() => parent.child({})).not.toThrow();
  });

  it('child 출력도 JSON 형식이다', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ mod: 'x' });
    child.info('msg');
    expect(() => JSON.parse(writeOutput[0]!)).not.toThrow();
  });
});

// ── ConsoleLogger 생성자 ──────────────────────────────────────

describe('ConsoleLogger 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new ConsoleLogger('error')).not.toThrow();
  });

  it('ConsoleLogger 인스턴스이다', () => {
    expect(new ConsoleLogger('error')).toBeInstanceOf(ConsoleLogger);
  });

  it('debug 레벨로 생성 가능', () => {
    expect(() => new ConsoleLogger('debug')).not.toThrow();
  });

  it('info 레벨로 생성 가능', () => {
    expect(() => new ConsoleLogger('info')).not.toThrow();
  });

  it('warn 레벨로 생성 가능', () => {
    expect(() => new ConsoleLogger('warn')).not.toThrow();
  });

  it('error 레벨로 생성 가능', () => {
    expect(() => new ConsoleLogger('error')).not.toThrow();
  });

  it('Logger 인터페이스의 메서드를 가진다', () => {
    const logger = new ConsoleLogger('debug');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('초기 context 없이 생성 가능', () => {
    expect(() => new ConsoleLogger('info')).not.toThrow();
  });

  it('초기 context 포함 생성 가능', () => {
    expect(() => new ConsoleLogger('info', { service: 'test' })).not.toThrow();
  });

  it('여러 인스턴스 독립적', () => {
    const l1 = new ConsoleLogger('error');
    const l2 = new ConsoleLogger('debug');
    expect(l1).not.toBe(l2);
  });
});
