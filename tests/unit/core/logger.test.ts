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

// ── 추가 maskSensitiveData 경계값 ─────────────────────────────

describe('maskSensitiveData 추가 경계값', () => {
  it('탭 문자만 있는 문자열 → 변경 없음', () => {
    const text = '\t\t\t';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('개행 문자만 있는 문자열 → 변경 없음', () => {
    const text = '\n\n\n';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('JSON 형식 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = '{"key":"value","count":42}';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('API 키가 JSON 값으로 포함 → 마스킹됨', () => {
    const text = '{"api_key":"sk-ant-api01-abcdefghijklmnopqrstuvwxyz"}';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).toContain('***REDACTED***');
  });

  it('여러 줄 문자열에서 마스킹', () => {
    const text = 'line1\nkey=sk-ant-api01-abcdefghijklmnopqrstuvwxyz\nline3';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
  });

  it('API 키 바로 앞뒤에 특수문자 → 마스킹됨', () => {
    const text = '"sk-ant-api01-abcdefghijklmnopqrstuvwxyz"';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
  });

  it('UTF-8 이모지 포함 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = '완료됨 ✅ 오류 없음 🎉';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('긴 문자열 중간에 API 키 → 마스킹됨', () => {
    const prefix = 'a'.repeat(100);
    const text = `${prefix}sk-ant-api01-abcdefghijklmnopqrstuvwxyz suffix`;
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).toContain(prefix);
    expect(masked).toContain('***REDACTED***');
  });

  it('이미 REDACTED 포함 + 추가 API 키 → 추가 키만 마스킹', () => {
    const text = '***REDACTED*** and sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('***REDACTED***');
    expect(masked).not.toContain('sk-ant-api01');
  });
});

// ── 추가 ConsoleLogger 레벨 필터링 경계값 ─────────────────────

describe('ConsoleLogger 레벨 필터링 추가 경계값', () => {
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

  it('error 레벨 logger → 빈 메시지 error → 출력됨', () => {
    const logger = new ConsoleLogger('error');
    logger.error('');
    expect(writeOutput).toHaveLength(1);
  });

  it('debug 레벨 → 100번 debug 호출 → 100번 출력', () => {
    const logger = new ConsoleLogger('debug');
    for (let i = 0; i < 100; i++) {
      logger.debug(`msg-${i}`);
    }
    expect(writeOutput).toHaveLength(100);
  });

  it('warn 레벨 → error 10번 → 10번 출력', () => {
    const logger = new ConsoleLogger('warn');
    for (let i = 0; i < 10; i++) {
      logger.error(`err-${i}`);
    }
    expect(writeOutput).toHaveLength(10);
  });

  it('info 레벨 → warn, error만 출력 (2회)', () => {
    const logger = new ConsoleLogger('info');
    logger.warn('w');
    logger.error('e');
    expect(writeOutput).toHaveLength(2);
  });

  it('한글 메시지 → 출력됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('한국어 로그 메시지');
    expect(writeOutput).toHaveLength(1);
    expect(writeOutput[0]).toContain('한국어 로그 메시지');
  });

  it('특수문자 메시지 → 출력됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('!@#$%^&*()_+-=[]{}|;:,./<>?');
    expect(writeOutput).toHaveLength(1);
  });

  it('출력 내용에 레벨 문자열 포함', () => {
    const logger = new ConsoleLogger('debug');
    logger.warn('check level');
    expect(writeOutput[0]).toContain('warn');
  });

  it('출력 내용에 타임스탬프 포함', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('ts check');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('연속 호출로 메시지 순서 보장', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('first');
    logger.info('second');
    logger.info('third');
    const p1 = JSON.parse(writeOutput[0]!);
    const p2 = JSON.parse(writeOutput[1]!);
    const p3 = JSON.parse(writeOutput[2]!);
    expect(p1.message).toBe('first');
    expect(p2.message).toBe('second');
    expect(p3.message).toBe('third');
  });
});

// ── 추가 ConsoleLogger JSON 출력 경계값 ───────────────────────

describe('ConsoleLogger JSON 출력 추가 경계값', () => {
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

  it('null context 값 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('null val', { key: null });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.key).toBeNull();
  });

  it('중첩 빈 객체 context → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('nested empty', { nested: {} });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.nested).toEqual({});
  });

  it('context 문자열 값 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('str ctx', { name: 'adev' });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.name).toBe('adev');
  });

  it('UUID 메시지 → 올바르게 출력', () => {
    const logger = new ConsoleLogger('debug');
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    logger.info(uuid);
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.message).toBe(uuid);
  });

  it('음수 context 값 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('negative', { count: -42 });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.count).toBe(-42);
  });

  it('0 context 값 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('zero', { count: 0 });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.count).toBe(0);
  });

  it('빈 배열 context → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('empty arr', { items: [] });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.items).toEqual([]);
  });

  it('긴 문자열 context → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug');
    const longStr = 'x'.repeat(500);
    logger.info('long', { data: longStr });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.data).toBe(longStr);
  });

  it('여러 context 필드 → 모두 포함', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('multi', { a: 1, b: 'two', c: true, d: null });
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.a).toBe(1);
    expect(parsed.context.b).toBe('two');
    expect(parsed.context.c).toBe(true);
    expect(parsed.context.d).toBeNull();
  });

  it('JSON 특수문자 포함 메시지 → 올바르게 직렬화', () => {
    const logger = new ConsoleLogger('debug');
    logger.info('{"key":"val"}');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.message).toBe('{"key":"val"}');
  });
});

// ── maskSensitiveData 추가 랜덤/경계값 ───────────────────────

describe('maskSensitiveData 랜덤/경계값 추가', () => {
  it('UUID 형식 문자열 (민감정보 없음) → 변경 없음', () => {
    const text = '550e8400-e29b-41d4-a716-446655440000';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('여러 줄 문자열 + 여러 API 키 → 모두 마스킹', () => {
    const text = [
      'line1 sk-ant-api01-aaaaaaaaaaaaaaaaaaaaa',
      'line2 sk-ant-oat01-bbbbbbbbbbbbbbbbbbbbb',
      'line3 ok',
    ].join('\n');
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).not.toContain('sk-ant-oat01');
    expect(masked).toContain('line3 ok');
  });

  it('API 키 앞뒤로 공백 있음 → 마스킹됨', () => {
    const text = '   sk-ant-api01-zzzzzzzzzzzzzzzzzzzzzz   ';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
  });

  it('ANTHROPIC_API_KEY 값이 짧음 → 패턴 미매칭 가능', () => {
    const text = 'ANTHROPIC_API_KEY=short';
    const masked = maskSensitiveData(text);
    expect(typeof masked).toBe('string');
  });

  it('반환 문자열 길이가 달라질 수 있음 (마스킹 시)', () => {
    const text = 'sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const masked = maskSensitiveData(text);
    expect(masked).not.toBe(text);
  });

  it('마스킹 후 ***REDACTED*** 문자열 포함됨', () => {
    const text = 'key=sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('***REDACTED***');
  });

  it('동일 API 키 연속 두 번 → 두 번 마스킹됨', () => {
    const key = 'sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const text = `${key} and ${key}`;
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
  });

  it('이모지 + API 키 → API 키만 마스킹', () => {
    const text = '🔑 sk-ant-api01-aaaaaaaaaaaaaaaaaaaaaa key';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
    expect(masked).toContain('🔑');
  });

  it('숫자로만 구성된 20자 → 마스킹 안됨', () => {
    const text = '12345678901234567890';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('영소문자로만 구성된 30자 → 마스킹 안됨', () => {
    const text = 'abcdefghijklmnopqrstuvwxyzabcd';
    expect(maskSensitiveData(text)).toBe(text);
  });

  it('CLAUDE_CODE_OAUTH_TOKEN 패턴 긴 값 → 마스킹됨', () => {
    const text = 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-xxxxxxxxxxxxxxxxxxxx';
    const masked = maskSensitiveData(text);
    expect(masked).toContain('***REDACTED***');
  });

  it('API 키가 쿼리스트링처럼 포함 → 마스킹됨', () => {
    const text = 'url?token=sk-ant-api01-abcdefghijklmnopqrstuvwxyz&foo=bar';
    const masked = maskSensitiveData(text);
    expect(masked).not.toContain('sk-ant-api01');
  });

  it('반환 타입은 string', () => {
    const result = maskSensitiveData('some text');
    expect(typeof result).toBe('string');
  });

  it('호출에 부작용 없음 (원본 문자열 변경 없음)', () => {
    const original = 'sk-ant-api01-abcdefghijklmnopqrstuvwxyz';
    const ref = original;
    maskSensitiveData(original);
    expect(original).toBe(ref);
  });
});

// ── ConsoleLogger child() 추가 경계값 ─────────────────────────

describe('ConsoleLogger child() 추가 경계값', () => {
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

  it('child context 키가 숫자 값 → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ count: 100 });
    child.info('count test');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.count).toBe(100);
  });

  it('child context 키가 boolean 값 → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ enabled: false });
    child.info('flag test');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.enabled).toBe(false);
  });

  it('child context 키가 null 값 → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ key: null });
    child.info('null ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.key).toBeNull();
  });

  it('child context 키가 배열 → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ list: ['a', 'b', 'c'] });
    child.info('array ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.list).toEqual(['a', 'b', 'c']);
  });

  it('child context 키가 중첩 객체 → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ meta: { level: 'deep', num: 42 } });
    child.info('nested ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.meta.level).toBe('deep');
    expect(parsed.context.meta.num).toBe(42);
  });

  it('child info → 출력 내용에 child context 포함', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ module: 'router' });
    child.info('request');
    expect(writeOutput[0]).toContain('router');
  });

  it('child debug → 부모 warn 레벨 상속 → 출력 없음', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.debug('debug msg');
    expect(writeOutput).toHaveLength(0);
  });

  it('child info → 부모 warn 레벨 상속 → 출력 없음', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.info('info msg');
    expect(writeOutput).toHaveLength(0);
  });

  it('child warn → 부모 warn 레벨 상속 → 출력됨', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.warn('warn msg');
    expect(writeOutput).toHaveLength(1);
  });

  it('child error → 부모 warn 레벨 상속 → 출력됨', () => {
    const parent = new ConsoleLogger('warn');
    const child = parent.child({ x: 1 });
    child.error('error msg');
    expect(writeOutput).toHaveLength(1);
  });

  it('child.child() → 3레벨 context 병합', () => {
    const root = new ConsoleLogger('debug', { app: 'adev' });
    const mid = root.child({ layer: 'layer2' });
    const leaf = mid.child({ phase: 'CODE' });
    leaf.info('leaf msg');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.app).toBe('adev');
    expect(parsed.context.layer).toBe('layer2');
    expect(parsed.context.phase).toBe('CODE');
  });

  it('child 호출에 UUID context → 직렬화됨', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ requestId: uuid });
    child.info('uuid ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.requestId).toBe(uuid);
  });

  it('child 호출에 한글 context → 직렬화됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ 모듈: '인증' });
    child.info('korean ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context['모듈']).toBe('인증');
  });

  it('child API 키 context → 마스킹됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ apiKey: 'sk-ant-api01-abcdefghijklmnopqrstuvwxyz' });
    child.info('masked ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.apiKey).toContain('***REDACTED***');
  });

  it('child 연속 호출 10번 → 10번 출력됨', () => {
    const parent = new ConsoleLogger('debug');
    const child = parent.child({ x: 1 });
    for (let i = 0; i < 10; i++) {
      child.info(`msg-${i}`);
    }
    expect(writeOutput).toHaveLength(10);
  });
});

// ── ConsoleLogger 생성자 추가 경계값 ─────────────────────────

describe('ConsoleLogger 생성자 추가 경계값', () => {
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

  it('초기 context null 값 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { key: null });
    logger.info('ctx null');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.key).toBeNull();
  });

  it('초기 context 빈 배열 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { items: [] });
    logger.info('empty arr');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.items).toEqual([]);
  });

  it('초기 context 숫자 0 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { count: 0 });
    logger.info('zero');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.count).toBe(0);
  });

  it('초기 context 음수 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { delta: -1 });
    logger.info('neg');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.delta).toBe(-1);
  });

  it('초기 context true → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { flag: true });
    logger.info('bool');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.flag).toBe(true);
  });

  it('초기 context false → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { flag: false });
    logger.info('bool-false');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.flag).toBe(false);
  });

  it('초기 context 긴 문자열 → 직렬화됨', () => {
    const longStr = 'z'.repeat(500);
    const logger = new ConsoleLogger('debug', { data: longStr });
    logger.info('long-ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.data).toBe(longStr);
  });

  it('초기 context UUID → 직렬화됨', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const logger = new ConsoleLogger('debug', { requestId: uuid });
    logger.info('uuid-ctx');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context.requestId).toBe(uuid);
  });

  it('초기 context 한글 키 → 직렬화됨', () => {
    const logger = new ConsoleLogger('debug', { 서비스: 'adev' });
    logger.info('korean-key');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.context['서비스']).toBe('adev');
  });

  it('여러 인스턴스 각각 독립 레벨 설정', () => {
    const l1 = new ConsoleLogger('debug');
    const l2 = new ConsoleLogger('error');
    l1.info('visible');
    l2.info('hidden');
    expect(writeOutput).toHaveLength(1);
    expect(writeOutput[0]).toContain('visible');
  });

  it('error 레벨 logger info 출력 없음 → writeOutput 비어있음', () => {
    const logger = new ConsoleLogger('error');
    logger.info('nope');
    expect(writeOutput).toHaveLength(0);
  });

  it('debug 레벨 logger 4개 레벨 모두 출력 → 4개', () => {
    const logger = new ConsoleLogger('debug');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(writeOutput).toHaveLength(4);
  });

  it('각 레벨 별 출력 내용에 레벨 문자열 포함', () => {
    const logger = new ConsoleLogger('debug');
    logger.debug('test');
    const parsed = JSON.parse(writeOutput[0]!);
    expect(parsed.level).toBe('debug');
  });

  it('warn 레벨 logger → debug/info 출력 없음, warn/error 출력됨', () => {
    const logger = new ConsoleLogger('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(writeOutput).toHaveLength(2);
  });
});
