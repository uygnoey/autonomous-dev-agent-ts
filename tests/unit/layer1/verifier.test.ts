/**
 * Layer1Verifier 단위 테스트 / Layer1Verifier unit tests
 *
 * @description
 * verify(request) 검증: implementedCode, testResults, question 경계값.
 * 실패 패턴: 'fail', 'error', 'exception', 'not passed' (대소문자 무관).
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Layer1VerificationRequest } from 'layer1/types.js';
import { Layer1Verifier } from 'layer1/verifier.js';

function makeRequest(overrides: Partial<Layer1VerificationRequest> = {}): Layer1VerificationRequest {
  return {
    featureId: overrides.featureId ?? 'feat-test',
    implementedCode: overrides.implementedCode ?? 'function hello() { return "world"; }',
    testResults: overrides.testResults ?? 'All tests passed',
    question: overrides.question ?? '',
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('Layer1Verifier 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => new Layer1Verifier(new ConsoleLogger('error'))).not.toThrow();
  });

  it('Layer1Verifier 인스턴스', () => {
    expect(new Layer1Verifier(new ConsoleLogger('error'))).toBeInstanceOf(Layer1Verifier);
  });

  it('두 인스턴스는 다른 객체', () => {
    const a = new Layer1Verifier(new ConsoleLogger('error'));
    const b = new Layer1Verifier(new ConsoleLogger('error'));
    expect(a).not.toBe(b);
  });

  it('verify 메서드 존재', () => {
    const v = new Layer1Verifier(new ConsoleLogger('error'));
    expect(typeof v.verify).toBe('function');
  });
});

// ── verify() 기본 동작 ─────────────────────────────────────────

describe('Layer1Verifier verify() 기본 동작', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('유효한 요청 → ok 반환', () => {
    const result = verifier.verify(makeRequest());
    expect(result.ok).toBe(true);
  });

  it('유효한 요청 → passed=true', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('유효한 요청 → featureId 일치', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-abc' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-abc');
  });

  it('유효한 요청 → needsUserInput=false (질문 없음)', () => {
    const result = verifier.verify(makeRequest({ question: '' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('유효한 요청 → feedback에 통과 메시지 포함', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(result.value.feedback).toContain('통과');
  });

  it('verify()는 항상 ok 반환 (err 없음)', () => {
    // verify()는 Result.ok만 반환하는 설계
    const result = verifier.verify(makeRequest());
    expect(result.ok).toBe(true);
  });

  it('반환값에 ok 필드 있음', () => {
    const result = verifier.verify(makeRequest());
    expect('ok' in result).toBe(true);
  });

  it('passed는 boolean 타입', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(typeof result.value.passed).toBe('boolean');
  });

  it('needsUserInput은 boolean 타입', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(typeof result.value.needsUserInput).toBe('boolean');
  });

  it('feedback은 string 타입', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(typeof result.value.feedback).toBe('string');
  });

  it('featureId는 string 타입', () => {
    const result = verifier.verify(makeRequest({ featureId: 'test-id' }));
    if (result.ok) expect(typeof result.value.featureId).toBe('string');
  });

  it('feedback 비어 있지 않음', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(result.value.feedback.length).toBeGreaterThan(0);
  });
});

// ── 빈 코드 검증 ───────────────────────────────────────────────

describe('Layer1Verifier 빈 코드 검증', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('빈 코드 → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('빈 코드 → feedback에 비어 있음 포함', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '' }));
    if (result.ok) expect(result.value.feedback).toContain('비어');
  });

  it('공백만 있는 코드 → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '   \n\t  ' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('탭만 있는 코드 → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '\t\t\t' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('개행만 있는 코드 → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '\n\n\n' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('빈 코드 ""  → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('공백 "   " → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '   ' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('탭 "\\t" → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '\t' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('개행 "\\n" → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '\n' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('혼합 공백 "  \\t\\n  " → passed=false', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '  \t\n  ' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });
});

// ── 테스트 실패 패턴 감지 ─────────────────────────────────────

describe('Layer1Verifier 테스트 실패 패턴 감지', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('"fail" 포함 → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: '3 tests failed' }));
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.feedback).toContain('테스트 실패');
    }
  });

  it('"error" 포함 → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Error: unexpected token' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"exception" 포함 → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'RuntimeException thrown' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"not passed" 포함 → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Tests not passed' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('대문자 "FAIL" → 대소문자 무관하게 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'FAIL: test X' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('대문자 "ERROR" → 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'ERROR occurred' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('대문자 "EXCEPTION" → 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'EXCEPTION raised' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('실패 패턴 없음 → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: 'All 10 tests passed successfully' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('빈 testResults → passed=true (실패 패턴 없음)', () => {
    const result = verifier.verify(makeRequest({ testResults: '' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"3 tests failed" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: '3 tests failed' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"Error: something went wrong" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Error: something went wrong' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"RuntimeException thrown" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'RuntimeException thrown' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"Tests not passed" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Tests not passed' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"FAIL" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'FAIL' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"error in line 5" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'error in line 5' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"exception caught" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'exception caught' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"NOT PASSED" → 실패 패턴 감지', () => {
    const result = verifier.verify(makeRequest({ testResults: 'NOT PASSED' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"All tests passed" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'All tests passed' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"10 tests pass" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: '10 tests pass' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"Green" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Green' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"OK" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'OK' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"100% coverage" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: '100% coverage' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"Tests completed successfully" → 실패 패턴 없음 (passed=true)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Tests completed successfully' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"Failed" (대문자 F) → 감지됨', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Failed' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"failing" → 감지됨', () => {
    const result = verifier.verify(makeRequest({ testResults: 'Some tests are failing' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });
});

// ── needsUserInput / 질문 처리 ─────────────────────────────────

describe('Layer1Verifier needsUserInput', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('질문 있음 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '이 접근 방식이 맞나요?' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('빈 질문 → needsUserInput=false', () => {
    const result = verifier.verify(makeRequest({ question: '' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('공백만 있는 질문 → needsUserInput=false', () => {
    const result = verifier.verify(makeRequest({ question: '   ' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('질문이 있어도 코드/테스트 통과 시 passed=true', () => {
    const result = verifier.verify(makeRequest({ question: '질문이 있습니다' }));
    if (result.ok) {
      expect(result.value.needsUserInput).toBe(true);
      expect(result.value.passed).toBe(true);
    }
  });

  it('질문 + 빈 코드 → passed=false + needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '', question: '질문' }));
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.needsUserInput).toBe(true);
    }
  });

  it('짧은 질문 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '짧은 질문' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('긴 질문 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '이것은 올바른 접근법인가요?'.repeat(50) }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('영문 질문 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: 'Is this correct?' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('탭만 있는 질문 → needsUserInput=false', () => {
    const result = verifier.verify(makeRequest({ question: '\t\t' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('개행만 있는 질문 → needsUserInput=false', () => {
    const result = verifier.verify(makeRequest({ question: '\n\n' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('단일 문자 질문 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '?' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('Layer1Verifier 복합 시나리오', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('빈 코드 + 테스트 실패 → passed=false + 두 이슈 모두 피드백', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '', testResults: '1 test failed' }));
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.feedback).toContain('비어');
      expect(result.value.feedback).toContain('테스트 실패');
    }
  });

  it('featureId 특수 문자 포함 → 올바르게 전달', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-특수-123' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-특수-123');
  });

  it('긴 코드 → ok', () => {
    const longCode = 'function test() {\n' + '  return 1;\n'.repeat(100) + '}';
    const result = verifier.verify(makeRequest({ implementedCode: longCode }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('통과 결과 → feedback에 "모든 검증을 통과했습니다" 포함', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(result.value.feedback).toContain('통과');
  });

  it('실패 결과 → feedback에 이슈 목록 포함', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '' }));
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.feedback.length).toBeGreaterThan(0);
    }
  });

  it('featureId "feat-1" → 올바르게 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-1' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-1');
  });

  it('featureId "feat-abc" → 올바르게 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-abc' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-abc');
  });

  it('featureId "feature-x-y-z" → 올바르게 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feature-x-y-z' }));
    if (result.ok) expect(result.value.featureId).toBe('feature-x-y-z');
  });

  it('featureId "f-001" → 올바르게 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'f-001' }));
    if (result.ok) expect(result.value.featureId).toBe('f-001');
  });

  it('10번 verify 호출 → 모두 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = verifier.verify(makeRequest({ featureId: `feat-${i}` }));
      expect(result.ok).toBe(true);
    }
  });

  it('20번 연속 verify → 항상 일관된 결과', () => {
    for (let i = 0; i < 20; i++) {
      const result = verifier.verify(makeRequest());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.needsUserInput).toBe(false);
      }
    }
  });

  it('빈 코드 + 실패 패턴 + 질문 → 모두 반영', () => {
    const result = verifier.verify(
      makeRequest({
        implementedCode: '',
        testResults: 'FAIL: 3 tests',
        question: '어떻게 수정할까요?',
      }),
    );
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.needsUserInput).toBe(true);
    }
  });

  it('코드 있음 + 실패 패턴 → passed=false', () => {
    const result = verifier.verify(
      makeRequest({
        implementedCode: 'const x = 1;',
        testResults: 'error: undefined is not a function',
      }),
    );
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('코드 있음 + 성공 패턴 + 질문 없음 → passed=true, needsUserInput=false', () => {
    const result = verifier.verify(
      makeRequest({
        implementedCode: 'const x = 1;',
        testResults: 'All tests passed',
        question: '',
      }),
    );
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.needsUserInput).toBe(false);
    }
  });

  it('한국어 코드 주석 → passed=true', () => {
    const result = verifier.verify(
      makeRequest({
        implementedCode: '// 한국어 주석\nfunction hello() { return 1; }',
        testResults: '모든 테스트 통과',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('매우 짧은 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '1' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('featureId UUID 형식 → 그대로 반환', () => {
    const uuid = 'feat-550e8400-e29b-41d4';
    const result = verifier.verify(makeRequest({ featureId: uuid }));
    if (result.ok) expect(result.value.featureId).toBe(uuid);
  });
});

// ── 추가 경계값: 코드 내용 종류 ───────────────────────────────

describe('Layer1Verifier 코드 내용 경계값', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('한 줄짜리 export default 함수 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: 'export default function f() {}' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('타입스크립트 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: 'const x: number = 42;' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('import 문만 있는 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: "import { foo } from 'bar';" }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('클래스 정의 코드 → passed=true', () => {
    const code = 'class MyClass { constructor() {} }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('한국어 변수명 포함 코드 → passed=true', () => {
    const code = 'const 값 = 42;';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('특수문자 포함 코드 → passed=true', () => {
    const code = 'const re = /^[a-z]+$/;';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('코드 100줄 → passed=true', () => {
    const code = Array.from({ length: 100 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('단일 세미콜론 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: ';' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('주석만 있는 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '// just a comment' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('빈 함수 본문 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: 'function noop() {}' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });
});

// ── 추가 경계값: testResults 패턴 조합 ───────────────────────

describe('Layer1Verifier testResults 패턴 조합', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('숫자로 시작하는 성공 메시지 → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: '42 tests run, 0 issues' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"✓ all passed" → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: '✓ all passed' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('긴 성공 로그 → passed=true', () => {
    const log = 'Running test suite...\n' + 'Test 1: PASS\nTest 2: PASS\n'.repeat(50) + 'All done.';
    const result = verifier.verify(makeRequest({ testResults: log }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('"error-prone" 단어 → 실패 패턴 감지', () => {
    // "error"가 포함되어 있으므로 감지됨
    const result = verifier.verify(makeRequest({ testResults: 'error-prone test run' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('"testfail" → 실패 패턴 감지 (fail 포함)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'testfail' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('5번 다른 성공 메시지 → 모두 passed=true', () => {
    const successMessages = [
      'OK',
      'All tests passed',
      '100% coverage',
      'Green build',
      'Tests completed successfully',
    ];
    for (const msg of successMessages) {
      const result = verifier.verify(makeRequest({ testResults: msg }));
      if (result.ok) expect(result.value.passed).toBe(true);
    }
  });

  it('5번 다른 실패 메시지 → 모두 passed=false', () => {
    const failMessages = [
      'fail',
      'error',
      'exception',
      'not passed',
      'FAIL: critical',
    ];
    for (const msg of failMessages) {
      const result = verifier.verify(makeRequest({ testResults: msg }));
      if (result.ok) expect(result.value.passed).toBe(false);
    }
  });
});

// ── 반환값 구조 일관성 ─────────────────────────────────────────

describe('Layer1Verifier 반환값 구조 일관성', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('ok는 항상 true', () => {
    for (let i = 0; i < 5; i++) {
      expect(verifier.verify(makeRequest({ featureId: `feat-${i}` })).ok).toBe(true);
    }
  });

  it('passed는 boolean', () => {
    const result = verifier.verify(makeRequest({ implementedCode: '' }));
    if (result.ok) expect(typeof result.value.passed).toBe('boolean');
  });

  it('needsUserInput는 boolean', () => {
    const result = verifier.verify(makeRequest({ question: '질문' }));
    if (result.ok) expect(typeof result.value.needsUserInput).toBe('boolean');
  });

  it('featureId는 string', () => {
    const result = verifier.verify(makeRequest({ featureId: 'f-99' }));
    if (result.ok) expect(typeof result.value.featureId).toBe('string');
  });

  it('feedback는 string', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect(typeof result.value.feedback).toBe('string');
  });

  it('10개 다른 featureId → 각각 그대로 반환', () => {
    for (let i = 0; i < 10; i++) {
      const fid = `feat-border-${i}`;
      const result = verifier.verify(makeRequest({ featureId: fid }));
      if (result.ok) expect(result.value.featureId).toBe(fid);
    }
  });
});

// ── 추가 edge: featureId 극단값 ────────────────────────────────

describe('Layer1Verifier featureId 극단값', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('featureId 한글만 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: '인증기능' }));
    if (result.ok) expect(result.value.featureId).toBe('인증기능');
  });

  it('featureId 특수문자 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat!@#$%' }));
    if (result.ok) expect(result.value.featureId).toBe('feat!@#$%');
  });

  it('featureId 공백 포함 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat with spaces' }));
    if (result.ok) expect(result.value.featureId).toBe('feat with spaces');
  });

  it('featureId 매우 긴 문자열 → 그대로 반환', () => {
    const longId = 'feat-' + 'x'.repeat(500);
    const result = verifier.verify(makeRequest({ featureId: longId }));
    if (result.ok) expect(result.value.featureId).toBe(longId);
  });

  it('featureId 숫자만 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: '12345' }));
    if (result.ok) expect(result.value.featureId).toBe('12345');
  });

  it('featureId 이모지 포함 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-🚀-launch' }));
    if (result.ok) expect(result.value.featureId).toBe('feat-🚀-launch');
  });

  it('featureId 탭 포함 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat\tid' }));
    if (result.ok) expect(result.value.featureId).toBe('feat\tid');
  });

  it('featureId 개행 포함 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat\nid' }));
    if (result.ok) expect(result.value.featureId).toBe('feat\nid');
  });

  it('featureId UUID → 그대로 반환', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = verifier.verify(makeRequest({ featureId: uuid }));
    if (result.ok) expect(result.value.featureId).toBe(uuid);
  });

  it('featureId 단일 문자 → 그대로 반환', () => {
    const result = verifier.verify(makeRequest({ featureId: 'a' }));
    if (result.ok) expect(result.value.featureId).toBe('a');
  });
});

// ── 추가 edge: 다양한 testResults 경계값 ──────────────────────

describe('Layer1Verifier testResults 추가 경계값', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('testResults 한글만 → passed=true (패턴 없음)', () => {
    const result = verifier.verify(makeRequest({ testResults: '모든 테스트 통과했습니다' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('testResults 개행 포함 성공 → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: 'test 1: pass\ntest 2: pass\ntest 3: pass' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('testResults 개행 포함 실패 → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'test 1: pass\ntest 2: fail\ntest 3: pass' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('testResults 빈 줄 여러 개 → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: '\n\n\n' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('testResults "ErrorCode: 0" → passed=false (error 포함)', () => {
    const result = verifier.verify(makeRequest({ testResults: 'ErrorCode: 0' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('testResults 200자 성공 문자열 → passed=true', () => {
    const log = 'Test suite completed. All ' + 'a'.repeat(150) + ' scenarios passed.';
    const result = verifier.verify(makeRequest({ testResults: log }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('testResults "assertion failed" → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'assertion failed at line 42' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('testResults "exitCode: 1, fail" → passed=false', () => {
    const result = verifier.verify(makeRequest({ testResults: 'exitCode: 1, fail' }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('testResults 순수 숫자 → passed=true (패턴 없음)', () => {
    const result = verifier.verify(makeRequest({ testResults: '100' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('testResults 특수문자만 → passed=true', () => {
    const result = verifier.verify(makeRequest({ testResults: '!!!###$$$%%%' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });
});

// ── 추가 랜덤 edge: 다양한 코드 패턴 ─────────────────────────

describe('Layer1Verifier 추가 랜덤 edge - 코드 패턴', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('async/await 함수 코드 → passed=true', () => {
    const code = 'async function fetchData() { const res = await fetch("url"); return res.json(); }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('제너레이터 함수 코드 → passed=true', () => {
    const code = 'function* gen() { yield 1; yield 2; }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('화살표 함수 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: 'const add = (a: number, b: number) => a + b;' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('인터페이스 선언 코드 → passed=true', () => {
    const code = 'interface IUser { id: string; name: string; }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('타입 별칭 코드 → passed=true', () => {
    const result = verifier.verify(makeRequest({ implementedCode: 'type Result<T> = { ok: boolean; value?: T };' }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('enum 코드 → passed=true', () => {
    const code = 'enum Status { Active, Inactive, Pending }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('try-catch 코드 → passed=true', () => {
    const code = 'try { doSomething(); } catch (e) { handleError(e); }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('중첩 함수 코드 → passed=true', () => {
    const code = 'function outer() { function inner() { return 1; } return inner(); }';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('template literal 코드 → passed=true', () => {
    const code = 'const msg = `Hello, ${name}!`;';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });

  it('비구조화 할당 코드 → passed=true', () => {
    const code = 'const { a, b, ...rest } = obj;';
    const result = verifier.verify(makeRequest({ implementedCode: code }));
    if (result.ok) expect(result.value.passed).toBe(true);
  });
});

// ── 추가 랜덤 edge: question 다양한 패턴 ─────────────────────

describe('Layer1Verifier 추가 랜덤 edge - question 패턴', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('question이 특수문자만 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '???!!!' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question이 숫자만 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '12345' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question이 이모지만 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '🤔' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question이 여러 줄 → needsUserInput=true', () => {
    const q = '첫 번째 질문\n두 번째 질문\n세 번째 질문';
    const result = verifier.verify(makeRequest({ question: q }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question이 혼합 공백+내용 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '  질문이 있습니다  ' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question이 탭+내용 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: '\t질문\t' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('question=undefined 동등 (빈 문자열) → needsUserInput=false', () => {
    const result = verifier.verify(makeRequest({ question: '' }));
    if (result.ok) expect(result.value.needsUserInput).toBe(false);
  });

  it('question 50자 → needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({ question: 'a'.repeat(50) }));
    if (result.ok) expect(result.value.needsUserInput).toBe(true);
  });

  it('10번 다른 질문 → 모두 needsUserInput=true', () => {
    for (let i = 0; i < 10; i++) {
      const result = verifier.verify(makeRequest({ question: `질문 ${i}: 어떻게 하나요?` }));
      if (result.ok) expect(result.value.needsUserInput).toBe(true);
    }
  });

  it('10번 빈 질문 → 모두 needsUserInput=false', () => {
    for (let i = 0; i < 10; i++) {
      const result = verifier.verify(makeRequest({ question: '' }));
      if (result.ok) expect(result.value.needsUserInput).toBe(false);
    }
  });
});

// ── 추가 랜덤 edge: featureId + 코드 + 테스트 조합 ──────────

describe('Layer1Verifier 추가 랜덤 edge - 조합', () => {
  let verifier: Layer1Verifier;

  beforeEach(() => {
    verifier = new Layer1Verifier(new ConsoleLogger('error'));
  });

  it('UUID featureId + 긴 코드 + 성공 결과 → passed=true', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const code = Array.from({ length: 50 }, (_, i) => `const v${i} = ${i};`).join('\n');
    const result = verifier.verify(makeRequest({
      featureId: uuid,
      implementedCode: code,
      testResults: 'All 50 tests passed',
    }));
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.featureId).toBe(uuid);
    }
  });

  it('빈 코드 + 성공 결과 → passed=false (코드 없음이 우선)', () => {
    const result = verifier.verify(makeRequest({
      implementedCode: '',
      testResults: 'All tests passed',
    }));
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('유효 코드 + 실패 결과 + 질문 → passed=false, needsUserInput=true', () => {
    const result = verifier.verify(makeRequest({
      implementedCode: 'const x = 1;',
      testResults: '2 tests failed',
      question: '실패 원인이 뭔가요?',
    }));
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.needsUserInput).toBe(true);
    }
  });

  it('featureId 한글 + 유효 코드 + 성공 결과 → passed=true', () => {
    const result = verifier.verify(makeRequest({
      featureId: '인증-기능-001',
      implementedCode: 'function auth() { return true; }',
      testResults: '테스트 전부 통과',
    }));
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.featureId).toBe('인증-기능-001');
    }
  });

  it('5개 다른 조합 → 각각 올바른 passed 반환', () => {
    const cases = [
      { implementedCode: 'const a = 1;', testResults: 'pass', expected: true },
      { implementedCode: '', testResults: 'pass', expected: false },
      { implementedCode: 'const b = 2;', testResults: 'fail', expected: false },
      { implementedCode: '', testResults: 'fail', expected: false },
      { implementedCode: 'const c = 3;', testResults: 'OK', expected: true },
    ];
    for (const c of cases) {
      const result = verifier.verify(makeRequest({ implementedCode: c.implementedCode, testResults: c.testResults }));
      if (result.ok) expect(result.value.passed).toBe(c.expected);
    }
  });

  it('verify 결과에 featureId 키 존재', () => {
    const result = verifier.verify(makeRequest({ featureId: 'feat-key-check' }));
    if (result.ok) expect('featureId' in result.value).toBe(true);
  });

  it('verify 결과에 passed 키 존재', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect('passed' in result.value).toBe(true);
  });

  it('verify 결과에 needsUserInput 키 존재', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect('needsUserInput' in result.value).toBe(true);
  });

  it('verify 결과에 feedback 키 존재', () => {
    const result = verifier.verify(makeRequest());
    if (result.ok) expect('feedback' in result.value).toBe(true);
  });
});
