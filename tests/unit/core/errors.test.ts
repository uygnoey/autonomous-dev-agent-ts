import { describe, expect, it } from 'bun:test';
import {
  AdevError,
  AgentError,
  AuthError,
  ConfigError,
  ContractError,
  DEFAULT_RETRY_POLICY,
  McpError,
  PhaseError,
  RagError,
  isAdevError,
} from '../../../src/core/errors.js';

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

  it('빈 문자열 code를 허용한다', () => {
    const error = new AdevError('', '빈 코드');

    expect(error.code).toBe('');
  });

  it('특수문자 포함 code를 허용한다', () => {
    const error = new AdevError('err/특수!@#$%', 'special chars');

    expect(error.code).toBe('err/특수!@#$%');
  });

  it('매우 긴 message를 처리한다', () => {
    const longMsg = 'x'.repeat(10_000);
    const error = new AdevError('long', longMsg);

    expect(error.message).toBe(longMsg);
    expect(error.message.length).toBe(10_000);
  });

  it('cause로 null을 허용한다', () => {
    const error = new AdevError('null_cause', 'msg', null);

    expect(error.cause).toBeNull();
  });

  it('cause로 문자열을 허용한다', () => {
    const error = new AdevError('str_cause', 'msg', 'string cause');

    expect(error.cause).toBe('string cause');
  });

  it('cause로 중첩 AdevError를 허용한다', () => {
    const inner = new AdevError('inner', '내부 에러');
    const outer = new AdevError('outer', '외부 에러', inner);

    expect(outer.cause).toBe(inner);
    expect((outer.cause as AdevError).code).toBe('inner');
  });
});

describe('도메인별 서브클래스', () => {
  const subclasses = [
    { Class: ConfigError, name: 'ConfigError' },
    { Class: AuthError, name: 'AuthError' },
    { Class: RagError, name: 'RagError' },
    { Class: AgentError, name: 'AgentError' },
    { Class: PhaseError, name: 'PhaseError' },
    { Class: ContractError, name: 'ContractError' },
    { Class: McpError, name: 'McpError' },
  ] as const;

  for (const { Class, name } of subclasses) {
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
    });
  }
});

describe('isAdevError', () => {
  it('AdevError 인스턴스에 true를 반환한다', () => {
    expect(isAdevError(new AdevError('code', 'msg'))).toBe(true);
  });

  it('서브클래스 인스턴스에 true를 반환한다', () => {
    expect(isAdevError(new ConfigError('code', 'msg'))).toBe(true);
  });

  it('일반 Error에 false를 반환한다', () => {
    expect(isAdevError(new Error('plain'))).toBe(false);
  });

  it('문자열에 false를 반환한다', () => {
    expect(isAdevError('error string')).toBe(false);
  });

  it('null에 false를 반환한다', () => {
    expect(isAdevError(null)).toBe(false);
  });

  it('undefined에 false를 반환한다', () => {
    expect(isAdevError(undefined)).toBe(false);
  });

  it('숫자에 false를 반환한다', () => {
    expect(isAdevError(42)).toBe(false);
  });

  it('객체에 false를 반환한다', () => {
    expect(isAdevError({ code: 'fake', message: 'not an error' })).toBe(false);
  });
});

describe('DEFAULT_RETRY_POLICY', () => {
  it('올바른 기본값을 가진다', () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_POLICY.baseDelay).toBe(1_000);
    expect(DEFAULT_RETRY_POLICY.maxDelay).toBe(30_000);
    expect(DEFAULT_RETRY_POLICY.backoffFactor).toBe(2);
  });

  it('재시도 가능한 에러 코드 목록이 정확하다', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors).toEqual([
      'auth_rate_limited',
      'agent_timeout',
      'rag_db_error',
    ]);
  });

  it('retryableErrors가 3개이다', () => {
    expect(DEFAULT_RETRY_POLICY.retryableErrors.length).toBe(3);
  });
});
