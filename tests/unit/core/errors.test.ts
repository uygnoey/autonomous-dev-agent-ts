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
