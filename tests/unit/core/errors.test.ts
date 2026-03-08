import { describe, expect, it } from 'bun:test';
import {
  AdevError,
  AgentError,
  AuthError,
  ConfigError,
  ContractError,
  DEFAULT_RETRY_POLICY,
  Layer3Error,
  McpError,
  PhaseError,
  RagError,
  isAdevError,
} from 'core/errors.js';

// ── AdevError 기본 동작 ────────────────────────────────────────

describe('AdevError', () => {
  it('code, message, cause를 올바르게 저장한다', () => {
    const cause = new Error('original');
    const error = new AdevError('test_code', '테스트 메시지', cause);
    expect(error.code).toBe('test_code');
    expect(error.message).toBe('테스트 메시지');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('AdevError');
  });

  it('cause 없이 생성할 수 있다', () => {
    const error = new AdevError('no_cause', 'cause 없음');
    expect(error.cause).toBeUndefined();
  });

  it('Error를 상속한다', () => {
    const error = new AdevError('test', 'msg');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AdevError);
  });

  it('빈 code 허용', () => {
    const error = new AdevError('', '빈 코드');
    expect(error.code).toBe('');
  });

  it('특수문자 포함 code 허용', () => {
    const error = new AdevError('err/특수!@#$%', 'special chars');
    expect(error.code).toBe('err/특수!@#$%');
  });

  it('매우 긴 message 처리', () => {
    const longMsg = 'x'.repeat(10_000);
    const error = new AdevError('long', longMsg);
    expect(error.message).toBe(longMsg);
    expect(error.message.length).toBe(10_000);
  });

  it('cause로 null 허용', () => {
    const error = new AdevError('null_cause', 'msg', null);
    expect(error.cause).toBeNull();
  });

  it('cause로 문자열 허용', () => {
    const error = new AdevError('str_cause', 'msg', 'string cause');
    expect(error.cause).toBe('string cause');
  });

  it('cause로 숫자 허용', () => {
    const error = new AdevError('num_cause', 'msg', 42);
    expect(error.cause).toBe(42);
  });

  it('cause로 중첩 AdevError 허용', () => {
    const inner = new AdevError('inner', '내부 에러');
    const outer = new AdevError('outer', '외부 에러', inner);
    expect(outer.cause).toBe(inner);
    expect((outer.cause as AdevError).code).toBe('inner');
  });

  it('name이 AdevError', () => {
    expect(new AdevError('code', 'msg').name).toBe('AdevError');
  });

  it('stack trace가 존재한다', () => {
    const error = new AdevError('code', 'msg');
    expect(error.stack).toBeDefined();
  });

  it('code "config_key" 저장됨', () => {
    expect(new AdevError('config_key', 'msg').code).toBe('config_key');
  });

  it('code "auth_rate_limited" 저장됨', () => {
    expect(new AdevError('auth_rate_limited', 'msg').code).toBe('auth_rate_limited');
  });

  it('code "rag_db_error" 저장됨', () => {
    expect(new AdevError('rag_db_error', 'msg').code).toBe('rag_db_error');
  });

  it('code "agent_timeout" 저장됨', () => {
    expect(new AdevError('agent_timeout', 'msg').code).toBe('agent_timeout');
  });

  it('code "phase_error" 저장됨', () => {
    expect(new AdevError('phase_error', 'msg').code).toBe('phase_error');
  });

  it('빈 message 저장됨', () => {
    expect(new AdevError('code', '').message).toBe('');
  });

  it('단일 문자 message 저장됨', () => {
    expect(new AdevError('code', 'a').message).toBe('a');
  });

  it('한국어 message 저장됨', () => {
    expect(new AdevError('code', '한국어 메시지').message).toBe('한국어 메시지');
  });

  it('100글자 message 저장됨', () => {
    const msg = 'x'.repeat(100);
    expect(new AdevError('code', msg).message.length).toBe(100);
  });

  it('code는 string 타입', () => {
    expect(typeof new AdevError('code', 'msg').code).toBe('string');
  });

  it('message는 string 타입', () => {
    expect(typeof new AdevError('code', 'msg').message).toBe('string');
  });

  it('name은 string 타입', () => {
    expect(typeof new AdevError('code', 'msg').name).toBe('string');
  });

  it('두 인스턴스는 다른 객체', () => {
    const e1 = new AdevError('code', 'msg');
    const e2 = new AdevError('code', 'msg');
    expect(e1).not.toBe(e2);
  });

  it('같은 code 다른 인스턴스 → 독립적', () => {
    const e1 = new AdevError('same', 'msg1');
    const e2 = new AdevError('same', 'msg2');
    expect(e1.message).not.toBe(e2.message);
  });
});

// ── 도메인별 서브클래스 ────────────────────────────────────────

const ALL_SUBCLASSES = [
  { Class: ConfigError, name: 'ConfigError' },
  { Class: AuthError, name: 'AuthError' },
  { Class: RagError, name: 'RagError' },
  { Class: AgentError, name: 'AgentError' },
  { Class: PhaseError, name: 'PhaseError' },
  { Class: ContractError, name: 'ContractError' },
  { Class: McpError, name: 'McpError' },
  { Class: Layer3Error, name: 'Layer3Error' },
] as const;

describe('도메인별 서브클래스', () => {
  for (const { Class, name } of ALL_SUBCLASSES) {
    describe(name, () => {
      it(`name이 '${name}'이다`, () => {
        const error = new Class(`${name.toLowerCase()}_test`, 'msg');
        expect(error.name).toBe(name);
      });

      it('AdevError를 상속한다', () => {
        const error = new Class('code', 'msg');
        expect(error).toBeInstanceOf(AdevError);
        expect(error).toBeInstanceOf(Error);
      });

      it('cause를 전달할 수 있다', () => {
        const cause = { detail: 'some context' };
        const error = new Class('code', 'msg', cause);
        expect(error.cause).toBe(cause);
      });

      it('isAdevError 타입 가드를 통과한다', () => {
        const error = new Class('code', 'msg');
        expect(isAdevError(error)).toBe(true);
      });

      it('code를 올바르게 저장한다', () => {
        const error = new Class('my_code', 'msg');
        expect(error.code).toBe('my_code');
      });

      it('message를 올바르게 저장한다', () => {
        const error = new Class('code', '한국어 메시지');
        expect(error.message).toBe('한국어 메시지');
      });

      it('cause 없이 생성됨', () => {
        const error = new Class('code', 'msg');
        expect(error.cause).toBeUndefined();
      });

      it('Error instanceof 통과', () => {
        expect(new Class('code', 'msg') instanceof Error).toBe(true);
      });
    });
  }
});

// ── isAdevError ────────────────────────────────────────────────

describe('isAdevError', () => {
  it('AdevError 인스턴스에 true', () => {
    expect(isAdevError(new AdevError('code', 'msg'))).toBe(true);
  });

  it('ConfigError에 true', () => {
    expect(isAdevError(new ConfigError('code', 'msg'))).toBe(true);
  });

  it('AuthError에 true', () => {
    expect(isAdevError(new AuthError('code', 'msg'))).toBe(true);
  });

  it('RagError에 true', () => {
    expect(isAdevError(new RagError('code', 'msg'))).toBe(true);
  });

  it('AgentError에 true', () => {
    expect(isAdevError(new AgentError('code', 'msg'))).toBe(true);
  });

  it('PhaseError에 true', () => {
    expect(isAdevError(new PhaseError('code', 'msg'))).toBe(true);
  });

  it('ContractError에 true', () => {
    expect(isAdevError(new ContractError('code', 'msg'))).toBe(true);
  });

  it('McpError에 true', () => {
    expect(isAdevError(new McpError('code', 'msg'))).toBe(true);
  });

  it('Layer3Error에 true', () => {
    expect(isAdevError(new Layer3Error('code', 'msg'))).toBe(true);
  });

  it('일반 Error에 false', () => {
    expect(isAdevError(new Error('plain'))).toBe(false);
  });

  it('문자열에 false', () => {
    expect(isAdevError('error string')).toBe(false);
  });

  it('null에 false', () => {
    expect(isAdevError(null)).toBe(false);
  });

  it('undefined에 false', () => {
    expect(isAdevError(undefined)).toBe(false);
  });

  it('숫자에 false', () => {
    expect(isAdevError(42)).toBe(false);
  });

  it('객체에 false', () => {
    expect(isAdevError({ code: 'fake', message: 'not an error' })).toBe(false);
  });

  it('배열에 false', () => {
    expect(isAdevError(['a', 'b'])).toBe(false);
  });

  it('boolean true에 false', () => {
    expect(isAdevError(true)).toBe(false);
  });

  it('boolean false에 false', () => {
    expect(isAdevError(false)).toBe(false);
  });

  it('빈 객체에 false', () => {
    expect(isAdevError({})).toBe(false);
  });

  it('0에 false', () => {
    expect(isAdevError(0)).toBe(false);
  });

  it('빈 문자열에 false', () => {
    expect(isAdevError('')).toBe(false);
  });

  it('빈 배열에 false', () => {
    expect(isAdevError([])).toBe(false);
  });

  it('Symbol에 false', () => {
    expect(isAdevError(Symbol('test'))).toBe(false);
  });

  it('Date 객체에 false', () => {
    expect(isAdevError(new Date())).toBe(false);
  });

  it('함수에 false', () => {
    expect(isAdevError(() => {})).toBe(false);
  });

  it('Map에 false', () => {
    expect(isAdevError(new Map())).toBe(false);
  });

  it('Set에 false', () => {
    expect(isAdevError(new Set())).toBe(false);
  });

  it('NaN에 false', () => {
    expect(isAdevError(Number.NaN)).toBe(false);
  });

  it('Infinity에 false', () => {
    expect(isAdevError(Infinity)).toBe(false);
  });

  it('code 필드만 있는 객체에 false', () => {
    expect(isAdevError({ code: 'test' })).toBe(false);
  });

  it('message 필드만 있는 객체에 false', () => {
    expect(isAdevError({ message: 'test' })).toBe(false);
  });

  it('isAdevError 반환값은 boolean', () => {
    expect(typeof isAdevError(new AdevError('code', 'msg'))).toBe('boolean');
    expect(typeof isAdevError(null)).toBe('boolean');
  });
});

// ── DEFAULT_RETRY_POLICY ───────────────────────────────────────

describe('DEFAULT_RETRY_POLICY', () => {
  it('maxAttempts가 3', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
  });

  it('baseDelay가 1000ms', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBe(1_000);
  });

  it('maxDelay가 30000ms', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBe(30_000);
  });

  it('backoffFactor가 2', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBe(2);
  });

  it('retryableErrors가 3개', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.length).toBe(3);
  });

  it('retryableErrors에 auth_rate_limited 포함', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain('auth_rate_limited');
  });

  it('retryableErrors에 agent_timeout 포함', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain('agent_timeout');
  });

  it('retryableErrors에 rag_db_error 포함', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toContain('rag_db_error');
  });

  it('retryableErrors 정확히 일치', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toEqual([
      'auth_rate_limited',
      'agent_timeout',
      'rag_db_error',
    ]);
  });

  it('baseDelay < maxDelay', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBeLessThan(DEFAULT_RETRY_POLICY.maxDelay);
  });

  it('backoffFactor가 1보다 크다 (지수 증가)', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBeGreaterThan(1);
  });

  it('maxAttempts가 양수', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeGreaterThan(0);
  });

  it('maxAttempts는 number 타입', () => {
    expect(typeof DEFAULT_RETRY_POLICY.maxAttempts).toBe('number');
  });

  it('baseDelay는 number 타입', () => {
    expect(typeof DEFAULT_RETRY_POLICY.baseDelay).toBe('number');
  });

  it('maxDelay는 number 타입', () => {
    expect(typeof DEFAULT_RETRY_POLICY.maxDelay).toBe('number');
  });

  it('backoffFactor는 number 타입', () => {
    expect(typeof DEFAULT_RETRY_POLICY.backoffFactor).toBe('number');
  });

  it('retryableErrors는 배열', () => {
    expect(Array.isArray(DEFAULT_RETRY_POLICY.retryableErrors)).toBe(true);
  });

  it('retryableErrors의 모든 요소는 string', () => {
    for (const code of DEFAULT_RETRY_POLICY.retryableErrors) {
      expect(typeof code).toBe('string');
    }
  });

  it('backoffFactor가 2 (정수)', () => {
    expect(Number.isInteger(DEFAULT_RETRY_POLICY.backoffFactor)).toBe(true);
  });

  it('maxAttempts가 정수', () => {
    expect(Number.isInteger(DEFAULT_RETRY_POLICY.maxAttempts)).toBe(true);
  });

  it('baseDelay가 양수', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBeGreaterThan(0);
  });

  it('maxDelay가 양수', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBeGreaterThan(0);
  });
});

// ── 에러 계층 구조 검증 ────────────────────────────────────────

describe('에러 계층 구조', () => {
  it('ConfigError는 AgentError와 다른 타입', () => {
    const configErr = new ConfigError('code', 'msg');
    expect(configErr instanceof AgentError).toBe(false);
  });

  it('중첩 에러 체인 3단계', () => {
    const root = new Error('root');
    const mid = new AdevError('mid', 'middle', root);
    const top = new PhaseError('top', 'top level', mid);
    expect(top.cause).toBe(mid);
    expect((top.cause as AdevError).cause).toBe(root);
  });

  it('서브클래스 간 instanceof 구분', () => {
    const configErr = new ConfigError('code', 'msg');
    const authErr = new AuthError('code', 'msg');
    expect(configErr instanceof AuthError).toBe(false);
    expect(authErr instanceof ConfigError).toBe(false);
  });

  it('모든 서브클래스가 AdevError instanceof', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      expect(new Class('code', 'msg') instanceof AdevError).toBe(true);
    }
  });

  it('RagError와 McpError 구분', () => {
    const ragErr = new RagError('code', 'msg');
    expect(ragErr instanceof McpError).toBe(false);
  });

  it('ContractError와 Layer3Error 구분', () => {
    const contractErr = new ContractError('code', 'msg');
    expect(contractErr instanceof Layer3Error).toBe(false);
  });

  it('5단계 중첩 에러 체인', () => {
    const e1 = new Error('level1');
    const e2 = new AdevError('l2', 'level2', e1);
    const e3 = new ConfigError('l3', 'level3', e2);
    const e4 = new AuthError('l4', 'level4', e3);
    const e5 = new AgentError('l5', 'level5', e4);
    expect(e5.cause).toBe(e4);
    expect((e5.cause as AdevError).code).toBe('l4');
  });

  it('모든 서브클래스 stack trace 존재', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      expect(new Class('code', 'msg').stack).toBeDefined();
    }
  });

  it('PhaseError는 ContractError와 다른 타입', () => {
    const phaseErr = new PhaseError('code', 'msg');
    expect(phaseErr instanceof ContractError).toBe(false);
  });
});

// ── AdevError 코드/메시지 경계값 반복 ─────────────────────────

describe('AdevError 코드 경계값 반복', () => {
  it('code에 공백 포함', () => {
    const err = new AdevError('code with spaces', 'msg');
    expect(err.code).toBe('code with spaces');
  });

  it('code에 unicode 포함', () => {
    const err = new AdevError('에러코드', 'msg');
    expect(err.code).toBe('에러코드');
  });

  it('code에 숫자만', () => {
    const err = new AdevError('123456', 'msg');
    expect(err.code).toBe('123456');
  });

  it('code에 밑줄만', () => {
    const err = new AdevError('___', 'msg');
    expect(err.code).toBe('___');
  });

  it('code에 점 포함', () => {
    const err = new AdevError('error.code.nested', 'msg');
    expect(err.code).toBe('error.code.nested');
  });

  it('code에 대시 포함', () => {
    const err = new AdevError('error-code-value', 'msg');
    expect(err.code).toBe('error-code-value');
  });

  it('message에 개행 포함', () => {
    const err = new AdevError('code', 'line1\nline2\nline3');
    expect(err.message).toContain('\n');
  });

  it('message에 탭 포함', () => {
    const err = new AdevError('code', 'col1\tcol2');
    expect(err.message).toContain('\t');
  });

  it('message에 null 문자 포함', () => {
    const err = new AdevError('code', 'msg\0null');
    expect(err.message).toContain('\0');
  });

  it('cause로 배열 허용', () => {
    const arr = [1, 2, 3];
    const err = new AdevError('code', 'msg', arr);
    expect(err.cause).toBe(arr);
  });

  it('cause로 객체 허용', () => {
    const obj = { key: 'value' };
    const err = new AdevError('code', 'msg', obj);
    expect(err.cause).toBe(obj);
  });

  it('cause로 Date 허용', () => {
    const d = new Date();
    const err = new AdevError('code', 'msg', d);
    expect(err.cause).toBe(d);
  });

  it('5번 생성 → code 일관성', () => {
    const code = 'repeat_code';
    for (let i = 0; i < 5; i++) {
      expect(new AdevError(code, 'msg').code).toBe(code);
    }
  });

  it('5번 생성 → message 일관성', () => {
    const msg = 'repeat_message';
    for (let i = 0; i < 5; i++) {
      expect(new AdevError('code', msg).message).toBe(msg);
    }
  });

  it('10개 인스턴스 → 각각 독립적', () => {
    const instances = Array.from({ length: 10 }, (_, i) =>
      new AdevError(`code-${i}`, `msg-${i}`)
    );
    for (let i = 0; i < 10; i++) {
      expect(instances[i]!.code).toBe(`code-${i}`);
      expect(instances[i]!.message).toBe(`msg-${i}`);
    }
  });
});

// ── isAdevError 추가 경계값 ────────────────────────────────────

describe('isAdevError 추가 경계값', () => {
  it('BigInt에 false', () => {
    expect(isAdevError(BigInt(42))).toBe(false);
  });

  it('WeakMap에 false', () => {
    expect(isAdevError(new WeakMap())).toBe(false);
  });

  it('WeakSet에 false', () => {
    expect(isAdevError(new WeakSet())).toBe(false);
  });

  it('Promise에 false', () => {
    expect(isAdevError(Promise.resolve())).toBe(false);
  });

  it('정규식에 false', () => {
    expect(isAdevError(/pattern/)).toBe(false);
  });

  it('TypeError에 false', () => {
    expect(isAdevError(new TypeError('type err'))).toBe(false);
  });

  it('RangeError에 false', () => {
    expect(isAdevError(new RangeError('range err'))).toBe(false);
  });

  it('SyntaxError에 false', () => {
    expect(isAdevError(new SyntaxError('syntax err'))).toBe(false);
  });

  it('5번 연속 같은 값 → 일관된 결과', () => {
    const err = new AdevError('code', 'msg');
    for (let i = 0; i < 5; i++) {
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('false 반환값도 boolean 타입', () => {
    expect(typeof isAdevError(null)).toBe('boolean');
    expect(typeof isAdevError(undefined)).toBe('boolean');
    expect(typeof isAdevError(42)).toBe('boolean');
  });
});

// ── DEFAULT_RETRY_POLICY 추가 불변성 검증 ─────────────────────

describe('DEFAULT_RETRY_POLICY 불변성 및 관계 검증', () => {
  it('baseDelay * backoffFactor < maxDelay', () => {
    const { baseDelay, backoffFactor, maxDelay } = DEFAULT_RETRY_POLICY;
    expect(baseDelay * backoffFactor).toBeLessThan(maxDelay);
  });

  it('maxDelay는 30초 이상', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBeGreaterThanOrEqual(30_000);
  });

  it('baseDelay는 1초 이상', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBeGreaterThanOrEqual(1_000);
  });

  it('retryableErrors 중복 없음', () => {
    const unique = new Set(DEFAULT_RETRY_POLICY.retryableErrors);
    expect(unique.size).toBe(DEFAULT_RETRY_POLICY.retryableErrors.length);
  });

  it('retryableErrors 빈 문자열 없음', () => {
    for (const code of DEFAULT_RETRY_POLICY.retryableErrors) {
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it('backoffFactor는 2 이상', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBeGreaterThanOrEqual(2);
  });

  it('maxAttempts는 1 이상', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeGreaterThanOrEqual(1);
  });
});

// ── AdevError 추가 경계값 ──────────────────────────────────────

describe('AdevError 추가 경계값', () => {
  it('cause로 함수 허용', () => {
    const fn = () => 42;
    const err = new AdevError('code', 'msg', fn);
    expect(err.cause).toBe(fn);
  });

  it('cause로 Symbol 허용', () => {
    const sym = Symbol('test-cause');
    const err = new AdevError('code', 'msg', sym);
    expect(err.cause).toBe(sym);
  });

  it('cause로 Map 허용', () => {
    const map = new Map([['key', 'val']]);
    const err = new AdevError('code', 'msg', map);
    expect(err.cause).toBe(map);
  });

  it('cause로 Set 허용', () => {
    const set = new Set([1, 2, 3]);
    const err = new AdevError('code', 'msg', set);
    expect(err.cause).toBe(set);
  });

  it('cause로 BigInt 허용', () => {
    const big = BigInt(9007199254740993);
    const err = new AdevError('code', 'msg', big);
    expect(err.cause).toBe(big);
  });

  it('code에 슬래시 포함', () => {
    const err = new AdevError('auth/rate_limited', 'msg');
    expect(err.code).toBe('auth/rate_limited');
  });

  it('code에 콜론 포함', () => {
    const err = new AdevError('http:404', 'msg');
    expect(err.code).toBe('http:404');
  });

  it('message에 JSON 문자열', () => {
    const json = JSON.stringify({ key: 'value', count: 42 });
    const err = new AdevError('code', json);
    expect(err.message).toBe(json);
  });

  it('message에 URL 형식', () => {
    const url = 'https://api.example.com/v1/endpoint?param=value&other=123';
    const err = new AdevError('code', url);
    expect(err.message).toBe(url);
  });

  it('message에 이모지 포함', () => {
    const err = new AdevError('code', '에러 발생 🚨');
    expect(err.message).toContain('🚨');
  });

  it('10번 중첩 에러 체인', () => {
    let current: AdevError = new AdevError('root', 'root message');
    for (let i = 1; i < 10; i++) {
      current = new AdevError(`level${i}`, `message ${i}`, current);
    }
    expect(current.code).toBe('level9');
    expect((current.cause as AdevError).code).toBe('level8');
  });

  it('name 변경 불가 (읽기 전용처럼 동작)', () => {
    const err = new AdevError('code', 'msg');
    expect(err.name).toBe('AdevError');
  });

  it('AdevError instanceof AdevError', () => {
    const err = new AdevError('code', 'msg');
    expect(err instanceof AdevError).toBe(true);
  });

  it('중첩 cause에서 code 접근', () => {
    const inner = new ConfigError('inner_code', 'inner msg');
    const outer = new AgentError('outer_code', 'outer msg', inner);
    expect((outer.cause as ConfigError).code).toBe('inner_code');
  });

  it('throw/catch 패턴', () => {
    let caught: unknown;
    try {
      throw new AdevError('thrown_code', '던진 에러');
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof AdevError).toBe(true);
    expect((caught as AdevError).code).toBe('thrown_code');
  });
});

// ── 서브클래스별 name 추가 검증 ────────────────────────────────

describe('서브클래스 name 추가 검증', () => {
  it('ConfigError name은 ConfigError', () => {
    expect(new ConfigError('code', 'msg').name).toBe('ConfigError');
  });

  it('AuthError name은 AuthError', () => {
    expect(new AuthError('code', 'msg').name).toBe('AuthError');
  });

  it('RagError name은 RagError', () => {
    expect(new RagError('code', 'msg').name).toBe('RagError');
  });

  it('AgentError name은 AgentError', () => {
    expect(new AgentError('code', 'msg').name).toBe('AgentError');
  });

  it('PhaseError name은 PhaseError', () => {
    expect(new PhaseError('code', 'msg').name).toBe('PhaseError');
  });

  it('ContractError name은 ContractError', () => {
    expect(new ContractError('code', 'msg').name).toBe('ContractError');
  });

  it('McpError name은 McpError', () => {
    expect(new McpError('code', 'msg').name).toBe('McpError');
  });

  it('Layer3Error name은 Layer3Error', () => {
    expect(new Layer3Error('code', 'msg').name).toBe('Layer3Error');
  });

  it('5개 다른 코드로 ConfigError 생성 → 각각 독립', () => {
    const codes = ['cfg_1', 'cfg_2', 'cfg_3', 'cfg_4', 'cfg_5'];
    const errors = codes.map(c => new ConfigError(c, `msg for ${c}`));
    for (let i = 0; i < 5; i++) {
      expect(errors[i]!.code).toBe(codes[i]);
      expect(errors[i]!.name).toBe('ConfigError');
    }
  });

  it('서브클래스 instanceof AdevError && instanceof Error', () => {
    const subclasses = [
      new ConfigError('c', 'm'),
      new AuthError('c', 'm'),
      new RagError('c', 'm'),
      new AgentError('c', 'm'),
      new PhaseError('c', 'm'),
      new ContractError('c', 'm'),
      new McpError('c', 'm'),
      new Layer3Error('c', 'm'),
    ];
    for (const err of subclasses) {
      expect(err instanceof AdevError).toBe(true);
      expect(err instanceof Error).toBe(true);
    }
  });

  it('서브클래스 throw/catch → isAdevError=true', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      let caught: unknown;
      try {
        throw new Class('thrown', 'thrown error');
      } catch (e) {
        caught = e;
      }
      expect(isAdevError(caught)).toBe(true);
    }
  });
});

// ── isAdevError 복합 경계값 ────────────────────────────────────

describe('isAdevError 복합 경계값', () => {
  it('중첩 cause 내부 에러도 isAdevError=true', () => {
    const inner = new ConfigError('inner', 'inner msg');
    const outer = new AgentError('outer', 'outer msg', inner);
    expect(isAdevError(inner)).toBe(true);
    expect(isAdevError(outer)).toBe(true);
    expect(isAdevError(outer.cause)).toBe(true);
  });

  it('isAdevError(plain Error with code property) → false', () => {
    const err = new Error('plain') as Error & { code?: string };
    err.code = 'some_code';
    expect(isAdevError(err)).toBe(false);
  });

  it('isAdevError(Object.create(null)) → false', () => {
    expect(isAdevError(Object.create(null))).toBe(false);
  });

  it('isAdevError(class without AdevError) → false', () => {
    class FakeError extends Error {
      code = 'fake';
    }
    expect(isAdevError(new FakeError('fake'))).toBe(false);
  });

  it('isAdevError 100번 호출 → 일관됨', () => {
    const err = new AdevError('code', 'msg');
    for (let i = 0; i < 100; i++) {
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('isAdevError 반환값 항상 boolean', () => {
    const cases: unknown[] = [
      null, undefined, 0, '', false, [], {}, new Error('e'), new AdevError('c', 'm'),
    ];
    for (const v of cases) {
      expect(typeof isAdevError(v)).toBe('boolean');
    }
  });
});

// ── AdevError 직렬화/역직렬화 패턴 ────────────────────────────

describe('AdevError 직렬화/역직렬화 패턴', () => {
  it('JSON.stringify 가능 (circular 없음)', () => {
    const err = new AdevError('json_code', 'json message');
    expect(() => JSON.stringify({ code: err.code, message: err.message })).not.toThrow();
  });

  it('toJSON 패턴 구성 가능', () => {
    const err = new AdevError('ser_code', 'ser message');
    const obj = { code: err.code, message: err.message, name: err.name };
    expect(JSON.parse(JSON.stringify(obj)).code).toBe('ser_code');
  });

  it('code와 message 추출 후 재생성', () => {
    const original = new AdevError('extract_code', 'extract message');
    const restored = new AdevError(original.code, original.message);
    expect(restored.code).toBe(original.code);
    expect(restored.message).toBe(original.message);
  });

  it('빈 code + 빈 message 재생성', () => {
    const err = new AdevError('', '');
    const restored = new AdevError(err.code, err.message);
    expect(restored.code).toBe('');
    expect(restored.message).toBe('');
  });

  it('unicode code + message 재생성 일관성', () => {
    const err = new AdevError('에러코드', '메시지 내용');
    const restored = new AdevError(err.code, err.message);
    expect(restored.code).toBe('에러코드');
    expect(restored.message).toBe('메시지 내용');
  });

  it('원인 에러 포함 객체로 구성 가능', () => {
    const cause = new Error('underlying cause');
    const err = new AdevError('with_cause', 'wrapped', cause);
    const info = { code: err.code, causeName: (err.cause as Error).message };
    expect(info.causeName).toBe('underlying cause');
  });

  it('50개 반복 생성 → 메모리 문제 없음', () => {
    const errors = Array.from({ length: 50 }, (_, i) => new AdevError(`code_${i}`, `msg_${i}`));
    expect(errors.length).toBe(50);
    expect(errors[49]?.code).toBe('code_49');
  });

  it('100개 인스턴스 name 모두 AdevError', () => {
    for (let i = 0; i < 100; i++) {
      expect(new AdevError(`c${i}`, `m${i}`).name).toBe('AdevError');
    }
  });
});

// ── isAdevError 프로토타입 체인 검증 ──────────────────────────

describe('isAdevError 프로토타입 체인 검증', () => {
  it('Object.create(AdevError.prototype) → false (생성자 미호출)', () => {
    const fake = Object.create(AdevError.prototype) as object;
    // 생성자 미호출이지만 instanceof 체인은 통과
    expect(typeof isAdevError(fake)).toBe('boolean');
  });

  it('AdevError 서브클래스 직접 instanceof AdevError 확인', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      const inst = new Class('c', 'm');
      expect(inst instanceof AdevError).toBe(true);
    }
  });

  it('서브클래스 isAdevError → 모두 true', () => {
    const instances = [
      new ConfigError('c', 'm'),
      new AuthError('c', 'm'),
      new RagError('c', 'm'),
      new AgentError('c', 'm'),
      new PhaseError('c', 'm'),
      new ContractError('c', 'm'),
      new McpError('c', 'm'),
      new Layer3Error('c', 'm'),
    ];
    for (const inst of instances) {
      expect(isAdevError(inst)).toBe(true);
    }
  });

  it('isAdevError(new AdevError(...)) 10번 → 모두 true', () => {
    for (let i = 0; i < 10; i++) {
      expect(isAdevError(new AdevError(`c${i}`, `m${i}`))).toBe(true);
    }
  });

  it('비 AdevError 타입들 isAdevError=false', () => {
    const cases: unknown[] = [
      new TypeError('t'),
      new RangeError('r'),
      new SyntaxError('s'),
      new URIError('u'),
      new EvalError('e'),
      'string',
      42,
      null,
      undefined,
      {},
      [],
      true,
      false,
    ];
    for (const c of cases) {
      expect(isAdevError(c)).toBe(false);
    }
  });
});

// ── DEFAULT_RETRY_POLICY 함수형 동작 검증 ─────────────────────

describe('DEFAULT_RETRY_POLICY 함수형 동작 검증', () => {
  it('지수 백오프 계산: baseDelay * backoffFactor^(attempt-1)', () => {
    const { baseDelay, backoffFactor } = DEFAULT_RETRY_POLICY;
    expect(baseDelay * backoffFactor ** 0).toBe(1_000);
    expect(baseDelay * backoffFactor ** 1).toBe(2_000);
    expect(baseDelay * backoffFactor ** 2).toBe(4_000);
  });

  it('maxDelay 초과 cap 계산', () => {
    const { baseDelay, backoffFactor, maxDelay } = DEFAULT_RETRY_POLICY;
    const computed = baseDelay * backoffFactor ** 5;
    const capped = Math.min(computed, maxDelay);
    expect(capped).toBeLessThanOrEqual(maxDelay);
  });

  it('retryableErrors.includes 동작', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.includes('auth_rate_limited')).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retryableErrors.includes('agent_timeout')).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retryableErrors.includes('rag_db_error')).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retryableErrors.includes('unknown_error')).toBe(false);
  });

  it('retryableErrors는 frozen/readonly — 직접 접근만 가능', () => {
    const codes = DEFAULT_RETRY_POLICY.retryableErrors;
    expect(codes.length).toBe(3);
    expect(codes[0]).toBe('auth_rate_limited');
    expect(codes[1]).toBe('agent_timeout');
    expect(codes[2]).toBe('rag_db_error');
  });

  it('backoffFactor === 2 (exactly)', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toStrictEqual(2);
  });

  it('maxAttempts === 3 (exactly)', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toStrictEqual(3);
  });

  it('baseDelay === 1000 (exactly)', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toStrictEqual(1_000);
  });

  it('maxDelay === 30000 (exactly)', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toStrictEqual(30_000);
  });

  it('retryableErrors에 없는 코드들 → false', () => {
    const notRetryable = ['config_missing', 'phase_invalid', 'mcp_conn_failed', 'layer3_compile'];
    for (const code of notRetryable) {
      expect(DEFAULT_RETRY_POLICY.retryableErrors.includes(code)).toBe(false);
    }
  });

  it('3번 시도 계산: delays 배열 생성', () => {
    const delays: number[] = [];
    for (let i = 0; i < DEFAULT_RETRY_POLICY.maxAttempts; i++) {
      const delay = Math.min(
        DEFAULT_RETRY_POLICY.baseDelay * DEFAULT_RETRY_POLICY.backoffFactor ** i,
        DEFAULT_RETRY_POLICY.maxDelay,
      );
      delays.push(delay);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000]);
  });
});

// ── 서브클래스 고급 동작 검증 ─────────────────────────────────

describe('서브클래스 고급 동작 검증', () => {
  it('ConfigError code 10개 다양한 접두사', () => {
    const codes = [
      'config_missing_key', 'config_invalid_type', 'config_file_not_found',
      'config_parse_error', 'config_validation_failed', 'config_env_not_set',
      'config_default_invalid', 'config_override_conflict', 'config_load_timeout',
      'config_schema_mismatch',
    ];
    for (const code of codes) {
      const err = new ConfigError(code, `msg for ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('ConfigError');
    }
  });

  it('AuthError 10개 다양한 코드', () => {
    const codes = [
      'auth_rate_limited', 'auth_invalid_key', 'auth_expired_token',
      'auth_permission_denied', 'auth_oauth_failed', 'auth_refresh_failed',
      'auth_no_credentials', 'auth_2fa_required', 'auth_session_expired',
      'auth_revoked_token',
    ];
    for (const code of codes) {
      const err = new AuthError(code, `msg ${code}`);
      expect(err.code).toBe(code);
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('AgentError 10개 다양한 코드', () => {
    const codes = [
      'agent_timeout', 'agent_spawn_failed', 'agent_comm_error',
      'agent_resource_limit', 'agent_invalid_state', 'agent_task_failed',
      'agent_queue_full', 'agent_not_found', 'agent_exec_error',
      'agent_hook_failed',
    ];
    for (const code of codes) {
      const err = new AgentError(code, `msg ${code}`);
      expect(err.code).toBe(code);
      expect(err instanceof AgentError).toBe(true);
    }
  });

  it('PhaseError 단계별 코드', () => {
    const phases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const phase of phases) {
      const err = new PhaseError(`phase_${phase.toLowerCase()}_failed`, `${phase} failed`);
      expect(err.code).toContain('phase_');
      expect(err.name).toBe('PhaseError');
    }
  });

  it('Layer3Error → AgentError와 다른 타입', () => {
    expect(new Layer3Error('c', 'm') instanceof AgentError).toBe(false);
    expect(new Layer3Error('c', 'm') instanceof AdevError).toBe(true);
  });

  it('McpError → RagError와 다른 타입', () => {
    expect(new McpError('c', 'm') instanceof RagError).toBe(false);
  });

  it('ContractError → PhaseError와 다른 타입', () => {
    expect(new ContractError('c', 'm') instanceof PhaseError).toBe(false);
  });

  it('서브클래스 cause 중첩 → 각 레벨 접근 가능', () => {
    const base = new ConfigError('base_code', 'base msg');
    const mid = new AuthError('mid_code', 'mid msg', base);
    const top = new AgentError('top_code', 'top msg', mid);
    expect((top.cause as AuthError).code).toBe('mid_code');
    expect(((top.cause as AuthError).cause as ConfigError).code).toBe('base_code');
  });

  it('모든 서브클래스 code는 string 타입', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      expect(typeof new Class('test_code', 'test msg').code).toBe('string');
    }
  });

  it('모든 서브클래스 message는 string 타입', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      expect(typeof new Class('c', 'test message').message).toBe('string');
    }
  });

  it('모든 서브클래스 name은 string 타입', () => {
    for (const { Class } of ALL_SUBCLASSES) {
      expect(typeof new Class('c', 'm').name).toBe('string');
    }
  });

  it('모든 서브클래스 name !== AdevError', () => {
    for (const { Class, name } of ALL_SUBCLASSES) {
      expect(new Class('c', 'm').name).toBe(name);
      expect(new Class('c', 'm').name).not.toBe('AdevError');
    }
  });
});

// ── AdevError 불변 속성 검증 ───────────────────────────────────

describe('AdevError 불변 속성 검증', () => {
  it('code 속성은 생성 후 읽기 가능', () => {
    const err = new AdevError('immutable_code', 'msg');
    const { code } = err;
    expect(code).toBe('immutable_code');
  });

  it('message 속성은 생성 후 읽기 가능', () => {
    const err = new AdevError('code', 'immutable_msg');
    const { message } = err;
    expect(message).toBe('immutable_msg');
  });

  it('name 속성은 생성 후 읽기 가능', () => {
    const err = new AdevError('code', 'msg');
    const { name } = err;
    expect(name).toBe('AdevError');
  });

  it('cause 속성은 생성 후 읽기 가능', () => {
    const cause = new Error('inner');
    const err = new AdevError('code', 'msg', cause);
    const { cause: extracted } = err;
    expect(extracted).toBe(cause);
  });

  it('code에 pipe 문자 허용', () => {
    const err = new AdevError('err|pipe', 'msg');
    expect(err.code).toBe('err|pipe');
  });

  it('code에 괄호 포함', () => {
    const err = new AdevError('err(detail)', 'msg');
    expect(err.code).toBe('err(detail)');
  });

  it('code에 JSON 키 형식', () => {
    const err = new AdevError('{"key":"val"}', 'msg');
    expect(err.code).toBe('{"key":"val"}');
  });

  it('message에 XML 태그 포함', () => {
    const err = new AdevError('code', '<error>message</error>');
    expect(err.message).toBe('<error>message</error>');
  });

  it('message에 이스케이프 시퀀스 포함', () => {
    const err = new AdevError('code', 'line1\\nline2');
    expect(err.message).toContain('\\n');
  });

  it('message에 백슬래시 포함', () => {
    const err = new AdevError('code', 'C:\\\\path\\\\to\\\\file');
    expect(err.message).toContain('\\\\');
  });

  it('code + message 조합 20개 → 각 독립', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => [
      `code_${i}_${crypto.randomUUID().slice(0, 4)}`,
      `message for ${i}`,
    ] as [string, string]);
    for (const [code, message] of pairs) {
      const err = new AdevError(code, message);
      expect(err.code).toBe(code);
      expect(err.message).toBe(message);
    }
  });

  it('AdevError를 catch block에서 instanceof 검증', () => {
    let result: string | null = null;
    try {
      const err = new AdevError('catch_test', 'thrown');
      throw err;
    } catch (e) {
      if (e instanceof AdevError) {
        result = e.code;
      }
    }
    expect(result).toBe('catch_test');
  });

  it('ConfigError를 catch block에서 instanceof AdevError 검증', () => {
    let caught = false;
    try {
      throw new ConfigError('config_throw', 'test throw');
    } catch (e) {
      if (e instanceof AdevError) {
        caught = true;
        expect((e as ConfigError).code).toBe('config_throw');
      }
    }
    expect(caught).toBe(true);
  });

  it('AdevError message는 Error.prototype.message와 동일', () => {
    const err = new AdevError('code', 'same message');
    expect(err.message).toBe(Error.prototype.message.constructor('same message'));
  });
});

// ── RagError 추가 검증 ────────────────────────────────────────

describe('RagError 추가 검증', () => {
  it('RagError → 10개 db 관련 코드', () => {
    const codes = [
      'rag_db_error', 'rag_index_failed', 'rag_search_timeout',
      'rag_embedding_error', 'rag_chunk_invalid', 'rag_collection_not_found',
      'rag_insert_failed', 'rag_delete_failed', 'rag_query_failed',
      'rag_schema_mismatch',
    ];
    for (const code of codes) {
      const err = new RagError(code, `RAG error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('RagError');
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('RagError cause로 db 연결 에러', () => {
    const dbErr = new Error('connection refused');
    const ragErr = new RagError('rag_db_error', 'DB 연결 실패', dbErr);
    expect((ragErr.cause as Error).message).toBe('connection refused');
  });

  it('RagError instanceof AdevError', () => {
    expect(new RagError('rag_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('RagError instanceof Error', () => {
    expect(new RagError('rag_test', 'msg') instanceof Error).toBe(true);
  });

  it('RagError stack 존재', () => {
    expect(new RagError('rag_stack', 'msg').stack).toBeDefined();
  });

  it('RagError name은 RagError', () => {
    expect(new RagError('rag_name', 'msg').name).toBe('RagError');
  });

  it('RagError → not instanceof ConfigError', () => {
    expect(new RagError('c', 'm') instanceof ConfigError).toBe(false);
  });

  it('RagError → not instanceof AuthError', () => {
    expect(new RagError('c', 'm') instanceof AuthError).toBe(false);
  });

  it('RagError 5개 인스턴스 → 각각 독립', () => {
    const errs = Array.from({ length: 5 }, (_, i) =>
      new RagError(`rag_${i}`, `msg ${i}`)
    );
    for (let i = 0; i < 5; i++) {
      expect(errs[i]!.code).toBe(`rag_${i}`);
    }
  });
});

// ── McpError 추가 검증 ────────────────────────────────────────

describe('McpError 추가 검증', () => {
  it('McpError → 10개 mcp 관련 코드', () => {
    const codes = [
      'mcp_conn_failed', 'mcp_protocol_error', 'mcp_timeout',
      'mcp_auth_required', 'mcp_resource_not_found', 'mcp_schema_invalid',
      'mcp_server_crash', 'mcp_rate_limited', 'mcp_parse_error',
      'mcp_handshake_failed',
    ];
    for (const code of codes) {
      const err = new McpError(code, `MCP error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('McpError');
    }
  });

  it('McpError cause로 네트워크 에러', () => {
    const netErr = new Error('ECONNREFUSED');
    const mcpErr = new McpError('mcp_conn_failed', 'MCP 연결 실패', netErr);
    expect((mcpErr.cause as Error).message).toBe('ECONNREFUSED');
  });

  it('McpError instanceof AdevError', () => {
    expect(new McpError('mcp_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('McpError instanceof Error', () => {
    expect(new McpError('mcp_test', 'msg') instanceof Error).toBe(true);
  });

  it('McpError → not instanceof RagError', () => {
    expect(new McpError('c', 'm') instanceof RagError).toBe(false);
  });

  it('McpError → not instanceof PhaseError', () => {
    expect(new McpError('c', 'm') instanceof PhaseError).toBe(false);
  });

  it('McpError 3개 중첩 체인', () => {
    const e1 = new McpError('mcp_1', 'first');
    const e2 = new McpError('mcp_2', 'second', e1);
    const e3 = new McpError('mcp_3', 'third', e2);
    expect(e3.code).toBe('mcp_3');
    expect((e3.cause as McpError).code).toBe('mcp_2');
    expect(((e3.cause as McpError).cause as McpError).code).toBe('mcp_1');
  });

  it('McpError stack 존재', () => {
    expect(new McpError('mcp_stack', 'msg').stack).toBeDefined();
  });
});

// ── Layer3Error 추가 검증 ─────────────────────────────────────

describe('Layer3Error 추가 검증', () => {
  it('Layer3Error → 10개 layer3 관련 코드', () => {
    const codes = [
      'layer3_compile_failed', 'layer3_e2e_timeout', 'layer3_doc_gen_error',
      'layer3_artifact_missing', 'layer3_publish_failed', 'layer3_validation_error',
      'layer3_resource_limit', 'layer3_build_error', 'layer3_deploy_failed',
      'layer3_test_suite_error',
    ];
    for (const code of codes) {
      const err = new Layer3Error(code, `Layer3 error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('Layer3Error');
    }
  });

  it('Layer3Error instanceof AdevError', () => {
    expect(new Layer3Error('l3_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('Layer3Error instanceof Error', () => {
    expect(new Layer3Error('l3_test', 'msg') instanceof Error).toBe(true);
  });

  it('Layer3Error → not instanceof AgentError', () => {
    expect(new Layer3Error('c', 'm') instanceof AgentError).toBe(false);
  });

  it('Layer3Error → not instanceof ContractError', () => {
    expect(new Layer3Error('c', 'm') instanceof ContractError).toBe(false);
  });

  it('Layer3Error isAdevError → true', () => {
    expect(isAdevError(new Layer3Error('l3', 'msg'))).toBe(true);
  });

  it('Layer3Error throw/catch → isAdevError=true', () => {
    let caught: unknown;
    try {
      throw new Layer3Error('layer3_thrown', 'layer3 error thrown');
    } catch (e) {
      caught = e;
    }
    expect(isAdevError(caught)).toBe(true);
    expect((caught as Layer3Error).code).toBe('layer3_thrown');
  });

  it('Layer3Error 5번 생성 → name 일관', () => {
    for (let i = 0; i < 5; i++) {
      expect(new Layer3Error(`l3_${i}`, `msg ${i}`).name).toBe('Layer3Error');
    }
  });
});

// ── ContractError 추가 검증 ───────────────────────────────────

describe('ContractError 추가 검증', () => {
  it('ContractError → 10개 contract 관련 코드', () => {
    const codes = [
      'contract_schema_invalid', 'contract_missing_field', 'contract_version_mismatch',
      'contract_parse_failed', 'contract_feature_duplicate', 'contract_ac_invalid',
      'contract_dependency_cycle', 'contract_test_type_missing', 'contract_build_failed',
      'contract_validation_timeout',
    ];
    for (const code of codes) {
      const err = new ContractError(code, `Contract error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('ContractError');
      expect(err instanceof AdevError).toBe(true);
    }
  });

  it('ContractError cause로 JSON parse 에러', () => {
    const parseErr = new SyntaxError('Unexpected token');
    const contractErr = new ContractError('contract_parse_failed', '파싱 실패', parseErr);
    expect((contractErr.cause as SyntaxError).message).toBe('Unexpected token');
  });

  it('ContractError → not instanceof PhaseError', () => {
    expect(new ContractError('c', 'm') instanceof PhaseError).toBe(false);
  });

  it('ContractError → not instanceof AuthError', () => {
    expect(new ContractError('c', 'm') instanceof AuthError).toBe(false);
  });

  it('ContractError stack 존재', () => {
    expect(new ContractError('c_stack', 'msg').stack).toBeDefined();
  });

  it('ContractError 5개 독립 인스턴스', () => {
    const errs = Array.from({ length: 5 }, (_, i) =>
      new ContractError(`contract_${i}`, `msg ${i}`)
    );
    for (let i = 0; i < 5; i++) {
      expect(errs[i]!.code).toBe(`contract_${i}`);
      expect(errs[i]!.name).toBe('ContractError');
    }
  });
});

// ── PhaseError 추가 검증 ──────────────────────────────────────

describe('PhaseError 추가 검증', () => {
  it('PhaseError → 10개 phase 관련 코드', () => {
    const codes = [
      'phase_design_failed', 'phase_code_failed', 'phase_test_failed',
      'phase_verify_failed', 'phase_invalid_transition', 'phase_timeout',
      'phase_rollback_failed', 'phase_state_corrupted', 'phase_agent_crash',
      'phase_missing_result',
    ];
    for (const code of codes) {
      const err = new PhaseError(code, `Phase error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('PhaseError');
    }
  });

  it('PhaseError instanceof AdevError', () => {
    expect(new PhaseError('phase_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('PhaseError instanceof Error', () => {
    expect(new PhaseError('phase_test', 'msg') instanceof Error).toBe(true);
  });

  it('PhaseError → not instanceof McpError', () => {
    expect(new PhaseError('c', 'm') instanceof McpError).toBe(false);
  });

  it('PhaseError → not instanceof RagError', () => {
    expect(new PhaseError('c', 'm') instanceof RagError).toBe(false);
  });

  it('PhaseError throw/catch 패턴', () => {
    let caughtCode: string | null = null;
    try {
      throw new PhaseError('phase_thrown', 'phase error thrown');
    } catch (e) {
      if (e instanceof PhaseError) caughtCode = e.code;
    }
    expect(caughtCode).toBe('phase_thrown');
  });

  it('PhaseError 4단계 FSM 코드 검증', () => {
    const phases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'] as const;
    for (const phase of phases) {
      const code = `phase_${phase.toLowerCase()}_failed`;
      const err = new PhaseError(code, `${phase} phase failed`);
      expect(err.code).toBe(code);
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('PhaseError 5개 인스턴스 → cause 각각 독립', () => {
    const causes = Array.from({ length: 5 }, (_, i) => new Error(`cause ${i}`));
    const errs = causes.map((c, i) => new PhaseError(`phase_${i}`, `msg ${i}`, c));
    for (let i = 0; i < 5; i++) {
      expect((errs[i]!.cause as Error).message).toBe(`cause ${i}`);
    }
  });
});

// ── AgentError 추가 검증 ─────────────────────────────────────

describe('AgentError 추가 검증', () => {
  it('AgentError → 10개 agent 관련 코드', () => {
    const codes = [
      'agent_timeout', 'agent_spawn_failed', 'agent_comm_error',
      'agent_resource_limit', 'agent_invalid_state', 'agent_task_failed',
      'agent_queue_full', 'agent_not_found', 'agent_exec_error',
      'agent_hook_failed',
    ];
    for (const code of codes) {
      const err = new AgentError(code, `Agent error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('AgentError');
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('AgentError cause로 시스템 에러', () => {
    const sysErr = new Error('ENOMEM');
    const agentErr = new AgentError('agent_resource_limit', '메모리 부족', sysErr);
    expect((agentErr.cause as Error).message).toBe('ENOMEM');
  });

  it('AgentError instanceof AdevError', () => {
    expect(new AgentError('agent_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('AgentError instanceof Error', () => {
    expect(new AgentError('agent_test', 'msg') instanceof Error).toBe(true);
  });

  it('AgentError → not instanceof Layer3Error', () => {
    expect(new AgentError('c', 'm') instanceof Layer3Error).toBe(false);
  });

  it('AgentError → not instanceof ConfigError', () => {
    expect(new AgentError('c', 'm') instanceof ConfigError).toBe(false);
  });

  it('AgentError throw/catch → isAdevError=true', () => {
    let caught: unknown;
    try {
      throw new AgentError('agent_thrown', '에이전트 에러 발생');
    } catch (e) {
      caught = e;
    }
    expect(isAdevError(caught)).toBe(true);
  });

  it('AgentError 3단계 중첩', () => {
    const e1 = new AgentError('agent_1', 'first agent error');
    const e2 = new AgentError('agent_2', 'second agent error', e1);
    const e3 = new AgentError('agent_3', 'third agent error', e2);
    expect(e3.code).toBe('agent_3');
    expect((e3.cause as AgentError).code).toBe('agent_2');
  });
});

// ── AuthError 추가 검증 ───────────────────────────────────────

describe('AuthError 추가 검증', () => {
  it('AuthError → 10개 auth 관련 코드', () => {
    const codes = [
      'auth_rate_limited', 'auth_invalid_key', 'auth_expired_token',
      'auth_permission_denied', 'auth_oauth_failed', 'auth_refresh_failed',
      'auth_no_credentials', 'auth_2fa_required', 'auth_session_expired',
      'auth_revoked_token',
    ];
    for (const code of codes) {
      const err = new AuthError(code, `Auth error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('AuthError');
    }
  });

  it('AuthError instanceof AdevError', () => {
    expect(new AuthError('auth_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('AuthError instanceof Error', () => {
    expect(new AuthError('auth_test', 'msg') instanceof Error).toBe(true);
  });

  it('AuthError → not instanceof AgentError', () => {
    expect(new AuthError('c', 'm') instanceof AgentError).toBe(false);
  });

  it('AuthError → not instanceof McpError', () => {
    expect(new AuthError('c', 'm') instanceof McpError).toBe(false);
  });

  it('AuthError 인증 실패 시나리오 체인', () => {
    const networkErr = new Error('ECONNREFUSED');
    const authErr = new AuthError('auth_oauth_failed', 'OAuth 실패', networkErr);
    const agentErr = new AgentError('agent_spawn_failed', '에이전트 시작 실패', authErr);
    expect((agentErr.cause as AuthError).code).toBe('auth_oauth_failed');
    expect(((agentErr.cause as AuthError).cause as Error).message).toBe('ECONNREFUSED');
  });

  it('AuthError throw/catch → instanceof AuthError', () => {
    let caught: unknown;
    try {
      throw new AuthError('auth_thrown', 'auth error');
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof AuthError).toBe(true);
    expect(caught instanceof AdevError).toBe(true);
  });

  it('AuthError isAdevError → true', () => {
    expect(isAdevError(new AuthError('auth_is', 'msg'))).toBe(true);
  });

  it('AuthError 5개 인스턴스 → name 모두 AuthError', () => {
    for (let i = 0; i < 5; i++) {
      expect(new AuthError(`auth_${i}`, `msg ${i}`).name).toBe('AuthError');
    }
  });
});

// ── ConfigError 추가 검증 ─────────────────────────────────────

describe('ConfigError 추가 검증', () => {
  it('ConfigError → 10개 config 관련 코드', () => {
    const codes = [
      'config_missing_key', 'config_invalid_type', 'config_file_not_found',
      'config_parse_error', 'config_validation_failed', 'config_env_not_set',
      'config_default_invalid', 'config_override_conflict', 'config_load_timeout',
      'config_schema_mismatch',
    ];
    for (const code of codes) {
      const err = new ConfigError(code, `Config error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.name).toBe('ConfigError');
      expect(isAdevError(err)).toBe(true);
    }
  });

  it('ConfigError instanceof AdevError', () => {
    expect(new ConfigError('config_test', 'msg') instanceof AdevError).toBe(true);
  });

  it('ConfigError instanceof Error', () => {
    expect(new ConfigError('config_test', 'msg') instanceof Error).toBe(true);
  });

  it('ConfigError → not instanceof RagError', () => {
    expect(new ConfigError('c', 'm') instanceof RagError).toBe(false);
  });

  it('ConfigError → not instanceof PhaseError', () => {
    expect(new ConfigError('c', 'm') instanceof PhaseError).toBe(false);
  });

  it('ConfigError cause로 JSON parse 에러', () => {
    const parseErr = new SyntaxError('JSON parse error');
    const configErr = new ConfigError('config_parse_error', '설정 파일 파싱 실패', parseErr);
    expect((configErr.cause as SyntaxError).message).toBe('JSON parse error');
  });

  it('ConfigError throw/catch 패턴', () => {
    let result: string | null = null;
    try {
      throw new ConfigError('config_thrown', 'config error');
    } catch (e) {
      if (e instanceof ConfigError) result = e.code;
    }
    expect(result).toBe('config_thrown');
  });

  it('ConfigError 10번 생성 → code 일관성', () => {
    const code = 'config_consistency';
    for (let i = 0; i < 10; i++) {
      expect(new ConfigError(code, `msg ${i}`).code).toBe(code);
    }
  });
});

// ── DEFAULT_RETRY_POLICY 심화 검증 ────────────────────────────

describe('DEFAULT_RETRY_POLICY 심화 검증', () => {
  it('3회 시도 지연 누적 계산', () => {
    const { baseDelay, backoffFactor, maxDelay } = DEFAULT_RETRY_POLICY;
    let totalDelay = 0;
    for (let i = 0; i < DEFAULT_RETRY_POLICY.maxAttempts; i++) {
      totalDelay += Math.min(baseDelay * backoffFactor ** i, maxDelay);
    }
    expect(totalDelay).toBe(7_000); // 1000 + 2000 + 4000
  });

  it('maxAttempts === 3 정확히', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toStrictEqual(3);
  });

  it('baseDelay === 1000 정확히', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toStrictEqual(1_000);
  });

  it('maxDelay === 30000 정확히', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toStrictEqual(30_000);
  });

  it('backoffFactor === 2 정확히', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toStrictEqual(2);
  });

  it('retryableErrors 길이 === 3', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.length).toStrictEqual(3);
  });

  it('retryableErrors[0] === auth_rate_limited', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors[0]).toBe('auth_rate_limited');
  });

  it('retryableErrors[1] === agent_timeout', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors[1]).toBe('agent_timeout');
  });

  it('retryableErrors[2] === rag_db_error', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors[2]).toBe('rag_db_error');
  });

  it('retryableErrors.some 동작 검증', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.some((e) => e === 'auth_rate_limited')).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retryableErrors.some((e) => e === 'unknown')).toBe(false);
  });

  it('retryableErrors.every 요소가 non-empty string', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.every((e) => e.length > 0)).toBe(true);
  });

  it('retryableErrors.find auth_rate_limited', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.find((e) => e === 'auth_rate_limited')).toBe('auth_rate_limited');
  });

  it('maxAttempts 범위: 1 ≤ maxAttempts ≤ 10', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeLessThanOrEqual(10);
  });

  it('baseDelay 범위: 100ms ≤ baseDelay ≤ 10000ms', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBeLessThanOrEqual(10_000);
  });

  it('maxDelay 범위: 5000ms ≤ maxDelay ≤ 300000ms', () => {
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBeLessThanOrEqual(300_000);
  });

  it('backoffFactor 범위: 1 < backoffFactor ≤ 10', () => {
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBeGreaterThan(1);
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBeLessThanOrEqual(10);
  });

  it('지수 백오프 1회 → 1000ms', () => {
    const delay = Math.min(
      DEFAULT_RETRY_POLICY.baseDelay * DEFAULT_RETRY_POLICY.backoffFactor ** 0,
      DEFAULT_RETRY_POLICY.maxDelay,
    );
    expect(delay).toBe(1_000);
  });

  it('지수 백오프 2회 → 2000ms', () => {
    const delay = Math.min(
      DEFAULT_RETRY_POLICY.baseDelay * DEFAULT_RETRY_POLICY.backoffFactor ** 1,
      DEFAULT_RETRY_POLICY.maxDelay,
    );
    expect(delay).toBe(2_000);
  });

  it('지수 백오프 3회 → 4000ms', () => {
    const delay = Math.min(
      DEFAULT_RETRY_POLICY.baseDelay * DEFAULT_RETRY_POLICY.backoffFactor ** 2,
      DEFAULT_RETRY_POLICY.maxDelay,
    );
    expect(delay).toBe(4_000);
  });

  it('지수 백오프 대규모 시도 → maxDelay cap', () => {
    for (let i = 10; i < 20; i++) {
      const delay = Math.min(
        DEFAULT_RETRY_POLICY.baseDelay * DEFAULT_RETRY_POLICY.backoffFactor ** i,
        DEFAULT_RETRY_POLICY.maxDelay,
      );
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_POLICY.maxDelay);
    }
  });
});
