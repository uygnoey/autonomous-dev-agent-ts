import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import type { Layer1VerificationRequest } from '../../../src/layer1/types.js';
import { Layer1Verifier } from '../../../src/layer1/verifier.js';

function createRequest(overrides: Partial<Layer1VerificationRequest> = {}): Layer1VerificationRequest {
  return {
    featureId: overrides.featureId ?? 'feat-0',
    implementedCode: overrides.implementedCode ?? 'function hello() { return "world"; }',
    testResults: overrides.testResults ?? 'All tests passed',
    question: overrides.question ?? '',
  };
}

describe('Layer1Verifier', () => {
  let verifier: Layer1Verifier;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    verifier = new Layer1Verifier(logger);
  });

  // ── verify ──────────────────────────────────────────────────

  describe('verify', () => {
    it('유효한 구현에 대해 통과를 반환한다', () => {
      const request = createRequest();

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.featureId).toBe('feat-0');
        expect(result.value.needsUserInput).toBe(false);
      }
    });

    it('빈 코드에 대해 실패를 반환한다', () => {
      const request = createRequest({ implementedCode: '' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.feedback).toContain('비어');
      }
    });

    it('공백만 있는 코드에 대해 실패를 반환한다', () => {
      const request = createRequest({ implementedCode: '   \n\t  ' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
      }
    });

    it('테스트 실패가 있으면 실패를 반환한다', () => {
      const request = createRequest({ testResults: '3 tests passed, 2 tests failed' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.feedback).toContain('테스트 실패');
      }
    });

    it('error 키워드가 있으면 실패를 반환한다', () => {
      const request = createRequest({ testResults: 'Error: unexpected token' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
      }
    });

    it('exception 키워드가 있으면 실패를 반환한다', () => {
      const request = createRequest({ testResults: 'RuntimeException thrown' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
      }
    });

    it('질문이 있으면 needsUserInput이 true이다', () => {
      const request = createRequest({ question: '이 접근 방식이 맞나요?' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.needsUserInput).toBe(true);
      }
    });

    it('빈 질문이면 needsUserInput이 false이다', () => {
      const request = createRequest({ question: '' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.needsUserInput).toBe(false);
      }
    });

    it('코드가 비어 있고 테스트도 실패하면 두 문제를 모두 피드백한다', () => {
      const request = createRequest({
        implementedCode: '',
        testResults: 'All tests failed',
      });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.feedback).toContain('비어');
        expect(result.value.feedback).toContain('테스트 실패');
      }
    });

    it('featureId가 결과에 올바르게 전달된다', () => {
      const request = createRequest({ featureId: 'feat-special' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.featureId).toBe('feat-special');
      }
    });

    it('통과 시 성공 메시지를 반환한다', () => {
      const request = createRequest({ testResults: 'All 10 tests passed' });

      const result = verifier.verify(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.feedback).toContain('통과');
      }
    });
  });
});
