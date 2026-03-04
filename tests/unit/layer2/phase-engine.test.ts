/**
 * PhaseEngine 단위 테스트 / PhaseEngine unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { PhaseEngine } from '../../../src/layer2/phase-engine.js';

describe('PhaseEngine', () => {
  let engine: PhaseEngine;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    engine = new PhaseEngine(logger);
  });

  describe('초기 상태 / Initial state', () => {
    it('DESIGN Phase에서 시작한다', () => {
      expect(engine.currentPhase).toBe('DESIGN');
    });

    it('이력이 비어있다', () => {
      expect(engine.getHistory()).toHaveLength(0);
    });
  });

  describe('순방향 전환 / Forward transitions', () => {
    it('DESIGN → CODE 전환이 성공한다', () => {
      const result = engine.transition('CODE', 'qa Gate 통과', 'qa');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.from).toBe('DESIGN');
        expect(result.value.to).toBe('CODE');
        expect(result.value.reason).toBe('qa Gate 통과');
        expect(result.value.triggeredBy).toBe('qa');
      }
      expect(engine.currentPhase).toBe('CODE');
    });

    it('CODE → TEST 전환이 성공한다', () => {
      engine.transition('CODE', 'qa Gate 통과', 'qa');
      const result = engine.transition('TEST', '구현 완료', 'architect');
      expect(result.ok).toBe(true);
      expect(engine.currentPhase).toBe('TEST');
    });

    it('TEST → VERIFY 전환이 성공한다', () => {
      engine.transition('CODE', 'qa Gate 통과', 'qa');
      engine.transition('TEST', '구현 완료', 'architect');
      const result = engine.transition('VERIFY', '테스트 전체 통과', 'qc');
      expect(result.ok).toBe(true);
      expect(engine.currentPhase).toBe('VERIFY');
    });

    it('전환 이력에 기록된다', () => {
      engine.transition('CODE', 'reason1', 'qa');
      engine.transition('TEST', 'reason2', 'architect');
      const history = engine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.from).toBe('DESIGN');
      expect(history[0]?.to).toBe('CODE');
      expect(history[1]?.from).toBe('CODE');
      expect(history[1]?.to).toBe('TEST');
    });
  });

  describe('무효한 전환 / Invalid transitions', () => {
    it('DESIGN → TEST 직접 전환이 실패한다', () => {
      const result = engine.transition('TEST', '건너뛰기 시도', 'adev');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('phase_invalid_transition');
      }
      expect(engine.currentPhase).toBe('DESIGN');
    });

    it('DESIGN → VERIFY 직접 전환이 실패한다', () => {
      const result = engine.transition('VERIFY', '건너뛰기 시도', 'adev');
      expect(result.ok).toBe(false);
      expect(engine.currentPhase).toBe('DESIGN');
    });

    it('CODE → DESIGN 역방향 전환이 실패한다', () => {
      engine.transition('CODE', 'qa Gate 통과', 'qa');
      const result = engine.transition('DESIGN', '롤백 시도', 'adev');
      expect(result.ok).toBe(false);
      expect(engine.currentPhase).toBe('CODE');
    });

    it('같은 Phase로 전환이 실패한다', () => {
      const result = engine.transition('DESIGN', '같은 Phase', 'adev');
      expect(result.ok).toBe(false);
    });
  });

  describe('VERIFY 역방향 전환 / VERIFY backward transitions', () => {
    beforeEach(() => {
      engine.transition('CODE', 'reason', 'qa');
      engine.transition('TEST', 'reason', 'architect');
      engine.transition('VERIFY', 'reason', 'qc');
    });

    it('VERIFY → DESIGN 롤백이 성공한다', () => {
      const result = engine.transition('DESIGN', '설계 결함', 'adev');
      expect(result.ok).toBe(true);
      expect(engine.currentPhase).toBe('DESIGN');
    });

    it('VERIFY → CODE 롤백이 성공한다', () => {
      const result = engine.transition('CODE', '구현 결함', 'adev');
      expect(result.ok).toBe(true);
      expect(engine.currentPhase).toBe('CODE');
    });

    it('VERIFY → TEST 롤백이 성공한다', () => {
      const result = engine.transition('TEST', '테스트 미달', 'adev');
      expect(result.ok).toBe(true);
      expect(engine.currentPhase).toBe('TEST');
    });
  });

  describe('canTransition / 전환 가능 여부', () => {
    it('DESIGN에서 CODE로 전환 가능하다', () => {
      expect(engine.canTransition('CODE')).toBe(true);
    });

    it('DESIGN에서 TEST로 전환 불가능하다', () => {
      expect(engine.canTransition('TEST')).toBe(false);
    });

    it('DESIGN에서 VERIFY로 전환 불가능하다', () => {
      expect(engine.canTransition('VERIFY')).toBe(false);
    });
  });

  describe('getParticipants / 참여 에이전트', () => {
    it('DESIGN Phase 참여자가 올바르다', () => {
      const p = engine.getParticipants('DESIGN');
      expect(p.lead).toContain('architect');
      expect(p.active).toContain('qa');
      expect(p.active).toContain('coder');
      expect(p.active).toContain('reviewer');
      expect(p.inactive).toContain('tester');
      expect(p.inactive).toContain('qc');
    });

    it('CODE Phase에서 coder가 주도한다', () => {
      const p = engine.getParticipants('CODE');
      expect(p.lead).toContain('coder');
    });

    it('TEST Phase에서 tester가 주도한다', () => {
      const p = engine.getParticipants('TEST');
      expect(p.lead).toContain('tester');
      expect(p.active).toContain('qc');
    });

    it('VERIFY Phase에서 qa, qc, reviewer가 참여한다', () => {
      const p = engine.getParticipants('VERIFY');
      expect(p.active).toContain('qa');
      expect(p.active).toContain('qc');
      expect(p.active).toContain('reviewer');
    });
  });
});
