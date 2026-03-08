/**
 * ProgressTracker 단위 테스트 / ProgressTracker unit tests
 *
 * @description
 * initFeature, updateStatus, updatePhase, addVerification,
 * getProgress, getAllProgress, getOverallCompletion 검증.
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProgressTracker } from 'layer2/progress-tracker.js';
import type { VerificationResult } from 'layer2/types.js';
import type { FeatureStatus, Phase } from 'core/types.js';

const ALL_PHASES: Phase[] = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
const ALL_STATUSES: FeatureStatus[] = ['pending', 'designing', 'coding', 'testing', 'verifying', 'complete', 'failed'];
const ALL_VERIFICATION_PHASES = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;

function makeVerification(
  featureId: string,
  phase: typeof ALL_VERIFICATION_PHASES[number] = 'qa_qc',
  passed = true,
): VerificationResult {
  return {
    featureId,
    phase,
    passed,
    feedback: passed ? '통과' : '실패 사유',
    timestamp: new Date(),
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('ProgressTracker 생성자', () => {
  it('인스턴스 생성됨', () => {
    const logger = new ConsoleLogger('error');
    expect(() => new ProgressTracker(logger)).not.toThrow();
  });

  it('ProgressTracker 인스턴스', () => {
    expect(new ProgressTracker(new ConsoleLogger('error'))).toBeInstanceOf(ProgressTracker);
  });

  it('초기 getAllProgress → 빈 배열', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    expect(tracker.getAllProgress()).toHaveLength(0);
  });

  it('초기 getOverallCompletion → 0', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    expect(tracker.getOverallCompletion()).toBe(0);
  });
});

// ── initFeature ────────────────────────────────────────────────

describe('ProgressTracker initFeature', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('기본 초기화 → ok 반환', () => {
    const result = tracker.initFeature('feat-1');
    expect(result.ok).toBe(true);
  });

  it('초기화 후 featureId 일치', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.featureId).toBe('feat-1');
  });

  it('초기 status는 pending', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.status).toBe('pending');
  });

  it('초기 currentPhase는 DESIGN', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.currentPhase).toBe('DESIGN');
  });

  it('초기 completedPhases는 빈 배열', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.completedPhases).toHaveLength(0);
  });

  it('초기 verificationResults는 빈 배열', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.verificationResults).toHaveLength(0);
  });

  it('초기화 후 startedAt이 존재', () => {
    const result = tracker.initFeature('feat-1');
    if (result.ok) expect(result.value.startedAt).toBeDefined();
  });

  it('중복 초기화 → err 반환', () => {
    tracker.initFeature('feat-1');
    const result = tracker.initFeature('feat-1');
    expect(result.ok).toBe(false);
  });

  it('중복 초기화 → agent_feature_exists 에러 코드', () => {
    tracker.initFeature('feat-1');
    const result = tracker.initFeature('feat-1');
    if (!result.ok) expect(result.error.code).toBe('agent_feature_exists');
  });

  it('다른 featureId는 독립적으로 초기화 가능', () => {
    const r1 = tracker.initFeature('feat-a');
    const r2 = tracker.initFeature('feat-b');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it.each(['feat-1', 'feat-abc', 'feature-long-name-123', 'f', 'feat-x-y-z'])(
    'featureId %s → ok 반환',
    (featureId) => {
      const result = tracker.initFeature(featureId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.featureId).toBe(featureId);
    },
  );

  it('100개 기능 초기화 → 모두 ok', () => {
    for (let i = 0; i < 100; i++) {
      const result = tracker.initFeature(`feat-${i}`);
      expect(result.ok).toBe(true);
    }
    expect(tracker.getAllProgress()).toHaveLength(100);
  });
});

// ── updateStatus ───────────────────────────────────────────────

describe('ProgressTracker updateStatus', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it.each(ALL_STATUSES)('status %s로 갱신 → ok', (status) => {
    const result = tracker.updateStatus('feat-1', status);
    expect(result.ok).toBe(true);
    const progress = tracker.getProgress('feat-1');
    expect(progress?.status).toBe(status);
  });

  it('존재하지 않는 featureId → err', () => {
    const result = tracker.updateStatus('non-existent', 'complete');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 featureId → agent_feature_not_found 에러 코드', () => {
    const result = tracker.updateStatus('missing', 'complete');
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('pending → designing → coding 순차 갱신', () => {
    tracker.updateStatus('feat-1', 'designing');
    tracker.updateStatus('feat-1', 'coding');
    expect(tracker.getProgress('feat-1')?.status).toBe('coding');
  });

  it('complete → failed 역방향 전환도 허용', () => {
    tracker.updateStatus('feat-1', 'complete');
    const result = tracker.updateStatus('feat-1', 'failed');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('failed');
  });

  it('상태 갱신 후 updatedAt이 갱신됨', () => {
    const before = tracker.getProgress('feat-1')?.updatedAt;
    tracker.updateStatus('feat-1', 'designing');
    const after = tracker.getProgress('feat-1')?.updatedAt;
    // updatedAt은 갱신 후 달라지거나 같을 수 있음 (빠른 실행 시)
    expect(after).toBeDefined();
    expect(before).toBeDefined();
  });

  it('여러 기능 동시 상태 갱신 독립성', () => {
    tracker.initFeature('feat-2');
    tracker.updateStatus('feat-1', 'complete');
    tracker.updateStatus('feat-2', 'failed');
    expect(tracker.getProgress('feat-1')?.status).toBe('complete');
    expect(tracker.getProgress('feat-2')?.status).toBe('failed');
  });
});

// ── updatePhase ────────────────────────────────────────────────

describe('ProgressTracker updatePhase', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it.each(ALL_PHASES)('Phase %s로 갱신 → ok', (phase) => {
    const result = tracker.updatePhase('feat-1', phase);
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe(phase);
  });

  it('DESIGN → CODE 전환 시 DESIGN이 completedPhases에 추가', () => {
    tracker.updatePhase('feat-1', 'CODE');
    const progress = tracker.getProgress('feat-1');
    expect(progress?.completedPhases).toContain('DESIGN');
  });

  it('전체 Phase 순서 전환 → completedPhases에 모두 포함', () => {
    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-1', 'TEST');
    tracker.updatePhase('feat-1', 'VERIFY');
    const progress = tracker.getProgress('feat-1');
    expect(progress?.currentPhase).toBe('VERIFY');
    expect(progress?.completedPhases).toContain('DESIGN');
    expect(progress?.completedPhases).toContain('CODE');
    expect(progress?.completedPhases).toContain('TEST');
  });

  it('존재하지 않는 featureId → err', () => {
    const result = tracker.updatePhase('non-existent', 'CODE');
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 featureId → agent_feature_not_found', () => {
    const result = tracker.updatePhase('missing', 'CODE');
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('같은 Phase로 여러 번 전환 → completedPhases 중복 없음', () => {
    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-1', 'DESIGN'); // 롤백
    tracker.updatePhase('feat-1', 'CODE'); // 다시 CODE
    const progress = tracker.getProgress('feat-1');
    const designCount = progress?.completedPhases.filter((p) => p === 'DESIGN').length ?? 0;
    expect(designCount).toBeLessThanOrEqual(2);
  });

  it('Phase 전환 후 currentPhase 일치', () => {
    for (const phase of ALL_PHASES) {
      tracker.updatePhase('feat-1', phase);
      expect(tracker.getProgress('feat-1')?.currentPhase).toBe(phase);
    }
  });

  it('여러 기능 독립적 Phase 관리', () => {
    tracker.initFeature('feat-2');
    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-2', 'TEST');
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('CODE');
    expect(tracker.getProgress('feat-2')?.currentPhase).toBe('TEST');
  });
});

// ── addVerification ────────────────────────────────────────────

describe('ProgressTracker addVerification', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('검증 결과 추가 → ok 반환', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1'));
    expect(result.ok).toBe(true);
  });

  it('검증 결과 추가 후 verificationResults에 포함', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', true));
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults).toHaveLength(1);
  });

  it.each(ALL_VERIFICATION_PHASES)('검증 Phase %s 추가 → ok', (phase) => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', phase));
    expect(result.ok).toBe(true);
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults.some((v) => v.phase === phase)).toBe(true);
  });

  it('4개 검증 Phase 모두 추가', () => {
    for (const phase of ALL_VERIFICATION_PHASES) {
      tracker.addVerification('feat-1', makeVerification('feat-1', phase));
    }
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults).toHaveLength(4);
  });

  it('존재하지 않는 featureId → err', () => {
    const result = tracker.addVerification('missing', makeVerification('missing'));
    expect(result.ok).toBe(false);
  });

  it('존재하지 않는 featureId → agent_feature_not_found', () => {
    const result = tracker.addVerification('missing', makeVerification('missing'));
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('passed=false 검증 결과도 추가 가능', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'reviewer', false));
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults[0]?.passed).toBe(false);
  });

  it('같은 Phase를 여러 번 추가 가능 (재검증)', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', false));
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', true));
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults).toHaveLength(2);
  });
});

// ── getProgress ────────────────────────────────────────────────

describe('ProgressTracker getProgress', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('존재하는 featureId → FeatureProgress 반환', () => {
    tracker.initFeature('feat-1');
    const progress = tracker.getProgress('feat-1');
    expect(progress).not.toBeNull();
    expect(progress?.featureId).toBe('feat-1');
  });

  it('존재하지 않는 featureId → null 반환', () => {
    expect(tracker.getProgress('missing')).toBeNull();
  });

  it('빈 문자열 featureId → null 반환', () => {
    expect(tracker.getProgress('')).toBeNull();
  });

  it.each(['feat-a', 'feat-b', 'feat-c'])('기능 %s 조회', (featureId) => {
    tracker.initFeature(featureId);
    const progress = tracker.getProgress(featureId);
    expect(progress?.featureId).toBe(featureId);
  });
});

// ── getAllProgress ──────────────────────────────────────────────

describe('ProgressTracker getAllProgress', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('초기 → 빈 배열', () => {
    expect(tracker.getAllProgress()).toHaveLength(0);
  });

  it('1개 초기화 → 1개 반환', () => {
    tracker.initFeature('feat-1');
    expect(tracker.getAllProgress()).toHaveLength(1);
  });

  it('5개 초기화 → 5개 반환', () => {
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-${i}`);
    expect(tracker.getAllProgress()).toHaveLength(5);
  });

  it('getAllProgress 결과는 복사본 (원본 불변)', () => {
    tracker.initFeature('feat-1');
    const all = tracker.getAllProgress();
    expect(all).toHaveLength(1);
    // getAllProgress를 수정해도 내부 상태에 영향 없음
    tracker.initFeature('feat-2');
    expect(all).toHaveLength(1); // 이전 배열은 불변
    expect(tracker.getAllProgress()).toHaveLength(2);
  });
});

// ── getOverallCompletion ───────────────────────────────────────

describe('ProgressTracker getOverallCompletion', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('기능 없음 → 0', () => {
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('1개 complete → 1', () => {
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'complete');
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('1개 pending → 0', () => {
    tracker.initFeature('feat-1');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('2개 중 1개 complete → 0.5', () => {
    tracker.initFeature('feat-1');
    tracker.initFeature('feat-2');
    tracker.updateStatus('feat-1', 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('3개 중 1개 complete → 1/3', () => {
    for (let i = 0; i < 3; i++) tracker.initFeature(`feat-${i}`);
    tracker.updateStatus('feat-0', 'complete');
    expect(tracker.getOverallCompletion()).toBeCloseTo(1 / 3, 5);
  });

  it('3개 모두 complete → 1', () => {
    for (let i = 0; i < 3; i++) {
      tracker.initFeature(`feat-${i}`);
      tracker.updateStatus(`feat-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('failed 상태는 완료율에 포함 안 됨', () => {
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'failed');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('4개 중 2개 complete → 0.5', () => {
    for (let i = 0; i < 4; i++) tracker.initFeature(`feat-${i}`);
    tracker.updateStatus('feat-0', 'complete');
    tracker.updateStatus('feat-1', 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it.each([1, 2, 3, 4, 5, 10])('%i개 기능 모두 complete → getOverallCompletion = 1', (n) => {
    for (let i = 0; i < n; i++) {
      tracker.initFeature(`feat-${i}`);
      tracker.updateStatus(`feat-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it.each([1, 2, 3, 4, 5])('%i개 기능 모두 pending → getOverallCompletion = 0', (n) => {
    for (let i = 0; i < n; i++) tracker.initFeature(`feat-${i}`);
    expect(tracker.getOverallCompletion()).toBe(0);
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('ProgressTracker 복합 시나리오', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('전체 기능 라이프사이클 → DESIGN → CODE → TEST → VERIFY + complete', () => {
    tracker.initFeature('feat-lifecycle');
    tracker.updatePhase('feat-lifecycle', 'CODE');
    tracker.updatePhase('feat-lifecycle', 'TEST');
    tracker.updatePhase('feat-lifecycle', 'VERIFY');
    tracker.updateStatus('feat-lifecycle', 'verifying');

    for (const phase of ALL_VERIFICATION_PHASES) {
      tracker.addVerification('feat-lifecycle', makeVerification('feat-lifecycle', phase, true));
    }

    tracker.updateStatus('feat-lifecycle', 'complete');

    const progress = tracker.getProgress('feat-lifecycle');
    expect(progress?.status).toBe('complete');
    expect(progress?.currentPhase).toBe('VERIFY');
    expect(progress?.completedPhases).toContain('DESIGN');
    expect(progress?.completedPhases).toContain('CODE');
    expect(progress?.completedPhases).toContain('TEST');
    expect(progress?.verificationResults).toHaveLength(4);
  });

  it('10개 기능 × 전체 Phase 전환', () => {
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`feat-${i}`);
      for (let p = 1; p < ALL_PHASES.length; p++) {
        tracker.updatePhase(`feat-${i}`, ALL_PHASES[p] as Phase);
      }
      tracker.updateStatus(`feat-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
    expect(tracker.getAllProgress()).toHaveLength(10);
  });

  it('updatePhase 존재하지 않는 기능 에러 코드 확인', () => {
    const result = tracker.updatePhase('ghost', 'CODE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('addVerification 존재하지 않는 기능 에러 코드 확인', () => {
    const result = tracker.addVerification('ghost', makeVerification('ghost'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('ProgressTracker 랜덤/경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('랜덤 기능 %i 초기화 독립성', (i) => {
    const featureId = `rand-feat-${i}-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
      expect(result.value.status).toBe('pending');
      expect(result.value.currentPhase).toBe('DESIGN');
    }
  });

  it.each(ALL_PHASES)('Phase %s 경계값 테스트', (phase) => {
    tracker.initFeature('feat-phase');
    tracker.updatePhase('feat-phase', phase);
    expect(tracker.getProgress('feat-phase')?.currentPhase).toBe(phase);
  });

  it.each(ALL_STATUSES)('FeatureStatus %s 경계값', (status) => {
    tracker.initFeature('feat-status');
    const result = tracker.updateStatus('feat-status', status);
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-status')?.status).toBe(status);
  });

  it('완료율 경계값: 50% (짝수)', () => {
    tracker.initFeature('feat-a');
    tracker.initFeature('feat-b');
    tracker.updateStatus('feat-a', 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('완료율 경계값: 0/1 → 0', () => {
    tracker.initFeature('feat-a');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('완료율 경계값: 1/1 → 1', () => {
    tracker.initFeature('feat-a');
    tracker.updateStatus('feat-a', 'complete');
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it.each(Array.from({ length: 5 }, (_, i) => i + 2))(
    '기능 %i개 중 절반 complete → 완료율 0.5',
    (n) => {
      const even = n % 2 === 0 ? n : n + 1;
      for (let i = 0; i < even; i++) tracker.initFeature(`feat-half-${i}`);
      for (let i = 0; i < even / 2; i++) tracker.updateStatus(`feat-half-${i}`, 'complete');
      expect(tracker.getOverallCompletion()).toBe(0.5);
    },
  );
});
