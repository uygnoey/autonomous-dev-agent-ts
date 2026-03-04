/**
 * FailureHandler 단위 테스트 / FailureHandler unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { FailureHandler } from '../../../src/layer2/failure-handler.js';

describe('FailureHandler', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    handler = new FailureHandler(logger);
  });

  describe('classify / 실패 분류', () => {
    it('설계 관련 에러를 design_flaw로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'architecture 설계 결함 발견');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('design_flaw');
        expect(result.value.suggestedAction).toBe('rollback_phase');
        expect(result.value.targetPhase).toBe('DESIGN');
      }
    });

    it('구현 버그를 implementation_bug로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'undefined is not a function bug');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('implementation_bug');
        expect(result.value.targetPhase).toBe('CODE');
      }
    });

    it('테스트 관련 에러를 test_gap으로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'test coverage 부족');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('test_gap');
        expect(result.value.targetPhase).toBe('TEST');
      }
    });

    it('스펙 모호성을 spec_ambiguity로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '요구사항이 unclear하고 ambiguous함');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('spec_ambiguity');
        expect(result.value.suggestedAction).toBe('escalate_user');
      }
    });

    it('인프라 에러를 infrastructure로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'timeout connection 실패');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('infrastructure');
        expect(result.value.suggestedAction).toBe('retry');
      }
    });

    it('분류 불가 에러를 unknown으로 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '알 수 없는 문제');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('unknown');
        expect(result.value.suggestedAction).toBe('retry');
      }
    });

    it('빈 에러 메시지는 에러를 반환한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '');
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 에러 메시지는 에러를 반환한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '   ');
      expect(result.ok).toBe(false);
    });

    it('고유한 보고서 ID를 생성한다', () => {
      const r1 = handler.classify('feat-1', 'VERIFY', 'error 1');
      const r2 = handler.classify('feat-1', 'VERIFY', 'error 2');
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  describe('getRecoveryPhase / 복구 Phase', () => {
    it('보고서의 targetPhase를 반환한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', 'design architecture 결함');
      if (result.ok) {
        expect(handler.getRecoveryPhase(result.value)).toBe('DESIGN');
      }
    });

    it('implementation_bug → CODE Phase', () => {
      const result = handler.classify('feat-1', 'CODE', 'crash error 발생');
      if (result.ok) {
        expect(handler.getRecoveryPhase(result.value)).toBe('CODE');
      }
    });

    it('test_gap → TEST Phase', () => {
      const result = handler.classify('feat-1', 'TEST', 'test coverage 부족');
      if (result.ok) {
        expect(handler.getRecoveryPhase(result.value)).toBe('TEST');
      }
    });
  });

  describe('한국어 키워드 매칭 / Korean keyword matching', () => {
    it('한국어 에러 메시지도 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '설계 구조가 잘못되었습니다');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('design_flaw');
      }
    });

    it('한국어 테스트 키워드도 분류한다', () => {
      const result = handler.classify('feat-1', 'VERIFY', '테스트 커버리지 미달');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('test_gap');
      }
    });
  });
});
