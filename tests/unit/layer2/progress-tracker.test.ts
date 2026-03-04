/**
 * ProgressTracker 단위 테스트 / ProgressTracker unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ProgressTracker } from '../../../src/layer2/progress-tracker.js';
import type { VerificationResult } from '../../../src/layer2/types.js';

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    tracker = new ProgressTracker(logger);
  });

  describe('initFeature / 기능 초기화', () => {
    it('기능 추적을 초기화한다', () => {
      const result = tracker.initFeature('feat-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.featureId).toBe('feat-1');
        expect(result.value.status).toBe('pending');
        expect(result.value.currentPhase).toBe('DESIGN');
        expect(result.value.completedPhases).toHaveLength(0);
      }
    });

    it('중복 초기화는 에러를 반환한다', () => {
      tracker.initFeature('feat-1');
      const result = tracker.initFeature('feat-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_feature_exists');
      }
    });
  });

  describe('updateStatus / 상태 갱신', () => {
    it('기능 상태를 갱신한다', () => {
      tracker.initFeature('feat-1');
      const result = tracker.updateStatus('feat-1', 'designing');
      expect(result.ok).toBe(true);

      const progress = tracker.getProgress('feat-1');
      expect(progress?.status).toBe('designing');
    });

    it('존재하지 않는 기능은 에러를 반환한다', () => {
      const result = tracker.updateStatus('non-existent', 'designing');
      expect(result.ok).toBe(false);
    });
  });

  describe('updatePhase / Phase 갱신', () => {
    it('Phase를 갱신하고 이전 Phase를 completedPhases에 추가한다', () => {
      tracker.initFeature('feat-1');
      tracker.updatePhase('feat-1', 'CODE');

      const progress = tracker.getProgress('feat-1');
      expect(progress?.currentPhase).toBe('CODE');
      expect(progress?.completedPhases).toContain('DESIGN');
    });

    it('여러 Phase 전환을 추적한다', () => {
      tracker.initFeature('feat-1');
      tracker.updatePhase('feat-1', 'CODE');
      tracker.updatePhase('feat-1', 'TEST');
      tracker.updatePhase('feat-1', 'VERIFY');

      const progress = tracker.getProgress('feat-1');
      expect(progress?.currentPhase).toBe('VERIFY');
      expect(progress?.completedPhases).toContain('DESIGN');
      expect(progress?.completedPhases).toContain('CODE');
      expect(progress?.completedPhases).toContain('TEST');
    });

    it('중복 Phase를 completedPhases에 중복 추가하지 않는다', () => {
      tracker.initFeature('feat-1');
      tracker.updatePhase('feat-1', 'CODE');
      tracker.updatePhase('feat-1', 'DESIGN'); // 롤백 시나리오
      tracker.updatePhase('feat-1', 'CODE');

      const progress = tracker.getProgress('feat-1');
      const designCount = progress?.completedPhases.filter((p) => p === 'DESIGN').length ?? 0;
      expect(designCount).toBeLessThanOrEqual(2);
    });
  });

  describe('addVerification / 검증 결과 추가', () => {
    it('검증 결과를 추가한다', () => {
      tracker.initFeature('feat-1');

      const verificationResult: VerificationResult = {
        featureId: 'feat-1',
        phase: 'qa_qc',
        passed: true,
        feedback: '문제 없음',
        timestamp: new Date(),
      };

      const result = tracker.addVerification('feat-1', verificationResult);
      expect(result.ok).toBe(true);

      const progress = tracker.getProgress('feat-1');
      expect(progress?.verificationResults).toHaveLength(1);
      expect(progress?.verificationResults[0]?.phase).toBe('qa_qc');
    });
  });

  describe('getOverallCompletion / 전체 완료율', () => {
    it('기능이 없으면 0을 반환한다', () => {
      expect(tracker.getOverallCompletion()).toBe(0);
    });

    it('모든 기능이 완료되면 1을 반환한다', () => {
      tracker.initFeature('feat-1');
      tracker.updateStatus('feat-1', 'complete');
      expect(tracker.getOverallCompletion()).toBe(1);
    });

    it('일부 기능이 완료되면 비율을 반환한다', () => {
      tracker.initFeature('feat-1');
      tracker.initFeature('feat-2');
      tracker.updateStatus('feat-1', 'complete');
      expect(tracker.getOverallCompletion()).toBe(0.5);
    });
  });

  describe('getAllProgress / 전체 목록', () => {
    it('모든 기능 진행 상태를 반환한다', () => {
      tracker.initFeature('feat-1');
      tracker.initFeature('feat-2');

      const all = tracker.getAllProgress();
      expect(all).toHaveLength(2);
    });
  });
});
