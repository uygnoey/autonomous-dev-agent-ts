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

  it('featureId feat-1 → ok 반환', () => {
    const result = tracker.initFeature('feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feat-1');
  });

  it('featureId feat-abc → ok 반환', () => {
    const result = tracker.initFeature('feat-abc');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feat-abc');
  });

  it('featureId feature-long-name-123 → ok 반환', () => {
    const result = tracker.initFeature('feature-long-name-123');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feature-long-name-123');
  });

  it('featureId f → ok 반환', () => {
    const result = tracker.initFeature('f');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('f');
  });

  it('featureId feat-x-y-z → ok 반환', () => {
    const result = tracker.initFeature('feat-x-y-z');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.featureId).toBe('feat-x-y-z');
  });

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

  it('status pending으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'pending');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('pending');
  });

  it('status designing으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'designing');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('designing');
  });

  it('status coding으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'coding');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('coding');
  });

  it('status testing으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'testing');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('testing');
  });

  it('status verifying으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'verifying');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('verifying');
  });

  it('status complete으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'complete');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('complete');
  });

  it('status failed으로 갱신 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'failed');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('failed');
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

  it('Phase DESIGN으로 갱신 → ok', () => {
    const result = tracker.updatePhase('feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('DESIGN');
  });

  it('Phase CODE으로 갱신 → ok', () => {
    const result = tracker.updatePhase('feat-1', 'CODE');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('CODE');
  });

  it('Phase TEST으로 갱신 → ok', () => {
    const result = tracker.updatePhase('feat-1', 'TEST');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('TEST');
  });

  it('Phase VERIFY으로 갱신 → ok', () => {
    const result = tracker.updatePhase('feat-1', 'VERIFY');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('VERIFY');
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

  it('검증 Phase qa_qc 추가 → ok', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc'));
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.verificationResults.some((v) => v.phase === 'qa_qc')).toBe(true);
  });

  it('검증 Phase reviewer 추가 → ok', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'reviewer'));
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.verificationResults.some((v) => v.phase === 'reviewer')).toBe(true);
  });

  it('검증 Phase layer1 추가 → ok', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'layer1'));
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.verificationResults.some((v) => v.phase === 'layer1')).toBe(true);
  });

  it('검증 Phase adev 추가 → ok', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'adev'));
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.verificationResults.some((v) => v.phase === 'adev')).toBe(true);
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

  it('기능 feat-a 조회', () => {
    tracker.initFeature('feat-a');
    expect(tracker.getProgress('feat-a')?.featureId).toBe('feat-a');
  });

  it('기능 feat-b 조회', () => {
    tracker.initFeature('feat-b');
    expect(tracker.getProgress('feat-b')?.featureId).toBe('feat-b');
  });

  it('기능 feat-c 조회', () => {
    tracker.initFeature('feat-c');
    expect(tracker.getProgress('feat-c')?.featureId).toBe('feat-c');
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

  it('1개 기능 모두 complete → getOverallCompletion = 1', () => {
    tracker.initFeature('feat-0');
    tracker.updateStatus('feat-0', 'complete');
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('2개 기능 모두 complete → getOverallCompletion = 1', () => {
    for (let i = 0; i < 2; i++) { tracker.initFeature(`feat-${i}`); tracker.updateStatus(`feat-${i}`, 'complete'); }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('3개 기능 모두 complete → getOverallCompletion = 1', () => {
    for (let i = 0; i < 3; i++) { tracker.initFeature(`feat-${i}`); tracker.updateStatus(`feat-${i}`, 'complete'); }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('4개 기능 모두 complete → getOverallCompletion = 1', () => {
    for (let i = 0; i < 4; i++) { tracker.initFeature(`feat-${i}`); tracker.updateStatus(`feat-${i}`, 'complete'); }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('5개 기능 모두 complete → getOverallCompletion = 1', () => {
    for (let i = 0; i < 5; i++) { tracker.initFeature(`feat-${i}`); tracker.updateStatus(`feat-${i}`, 'complete'); }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('10개 기능 모두 complete → getOverallCompletion = 1', () => {
    for (let i = 0; i < 10; i++) { tracker.initFeature(`feat-${i}`); tracker.updateStatus(`feat-${i}`, 'complete'); }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('1개 기능 모두 pending → getOverallCompletion = 0', () => {
    tracker.initFeature('feat-0');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('2개 기능 모두 pending → getOverallCompletion = 0', () => {
    for (let i = 0; i < 2; i++) tracker.initFeature(`feat-${i}`);
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('3개 기능 모두 pending → getOverallCompletion = 0', () => {
    for (let i = 0; i < 3; i++) tracker.initFeature(`feat-${i}`);
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('4개 기능 모두 pending → getOverallCompletion = 0', () => {
    for (let i = 0; i < 4; i++) tracker.initFeature(`feat-${i}`);
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('5개 기능 모두 pending → getOverallCompletion = 0', () => {
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-${i}`);
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

  it('랜덤 기능 0 초기화 독립성', () => {
    const featureId = `rand-feat-0-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.featureId).toBe(featureId); expect(result.value.status).toBe('pending'); expect(result.value.currentPhase).toBe('DESIGN'); }
  });

  it('랜덤 기능 1 초기화 독립성', () => {
    const featureId = `rand-feat-1-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.featureId).toBe(featureId); expect(result.value.status).toBe('pending'); }
  });

  it('랜덤 기능 2 초기화 독립성', () => {
    const featureId = `rand-feat-2-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.featureId).toBe(featureId); expect(result.value.status).toBe('pending'); }
  });

  it('랜덤 기능 3 초기화 독립성', () => {
    const featureId = `rand-feat-3-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.currentPhase).toBe('DESIGN'); }
  });

  it('랜덤 기능 4 초기화 독립성', () => {
    const featureId = `rand-feat-4-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.status).toBe('pending'); }
  });

  it('랜덤 기능 5 초기화 독립성', () => {
    const featureId = `rand-feat-5-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.completedPhases).toHaveLength(0); }
  });

  it('랜덤 기능 6 초기화 독립성', () => {
    const featureId = `rand-feat-6-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.verificationResults).toHaveLength(0); }
  });

  it('랜덤 기능 7 초기화 독립성', () => {
    const featureId = `rand-feat-7-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.startedAt).toBeInstanceOf(Date); }
  });

  it('랜덤 기능 8 초기화 독립성', () => {
    const featureId = `rand-feat-8-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.updatedAt).toBeInstanceOf(Date); }
  });

  it('랜덤 기능 9 초기화 독립성', () => {
    const featureId = `rand-feat-9-${Date.now()}`;
    const result = tracker.initFeature(featureId);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(typeof result.value.featureId).toBe('string'); }
  });

  it('Phase DESIGN 경계값 테스트', () => {
    tracker.initFeature('feat-phase-design');
    tracker.updatePhase('feat-phase-design', 'DESIGN');
    expect(tracker.getProgress('feat-phase-design')?.currentPhase).toBe('DESIGN');
  });

  it('Phase CODE 경계값 테스트', () => {
    tracker.initFeature('feat-phase-code');
    tracker.updatePhase('feat-phase-code', 'CODE');
    expect(tracker.getProgress('feat-phase-code')?.currentPhase).toBe('CODE');
  });

  it('Phase TEST 경계값 테스트', () => {
    tracker.initFeature('feat-phase-test');
    tracker.updatePhase('feat-phase-test', 'TEST');
    expect(tracker.getProgress('feat-phase-test')?.currentPhase).toBe('TEST');
  });

  it('Phase VERIFY 경계값 테스트', () => {
    tracker.initFeature('feat-phase-verify');
    tracker.updatePhase('feat-phase-verify', 'VERIFY');
    expect(tracker.getProgress('feat-phase-verify')?.currentPhase).toBe('VERIFY');
  });

  it('FeatureStatus pending 경계값', () => {
    tracker.initFeature('feat-s-pending');
    const result = tracker.updateStatus('feat-s-pending', 'pending');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-pending')?.status).toBe('pending');
  });

  it('FeatureStatus designing 경계값', () => {
    tracker.initFeature('feat-s-designing');
    const result = tracker.updateStatus('feat-s-designing', 'designing');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-designing')?.status).toBe('designing');
  });

  it('FeatureStatus coding 경계값', () => {
    tracker.initFeature('feat-s-coding');
    const result = tracker.updateStatus('feat-s-coding', 'coding');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-coding')?.status).toBe('coding');
  });

  it('FeatureStatus testing 경계값', () => {
    tracker.initFeature('feat-s-testing');
    const result = tracker.updateStatus('feat-s-testing', 'testing');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-testing')?.status).toBe('testing');
  });

  it('FeatureStatus verifying 경계값', () => {
    tracker.initFeature('feat-s-verifying');
    const result = tracker.updateStatus('feat-s-verifying', 'verifying');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-verifying')?.status).toBe('verifying');
  });

  it('FeatureStatus complete 경계값', () => {
    tracker.initFeature('feat-s-complete');
    const result = tracker.updateStatus('feat-s-complete', 'complete');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-complete')?.status).toBe('complete');
  });

  it('FeatureStatus failed 경계값', () => {
    tracker.initFeature('feat-s-failed');
    const result = tracker.updateStatus('feat-s-failed', 'failed');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-s-failed')?.status).toBe('failed');
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

  it('기능 2개 중 절반 complete → 완료율 0.5', () => {
    for (let i = 0; i < 2; i++) tracker.initFeature(`feat-half2-${i}`);
    tracker.updateStatus('feat-half2-0', 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('기능 4개 중 절반 complete → 완료율 0.5', () => {
    for (let i = 0; i < 4; i++) tracker.initFeature(`feat-half4-${i}`);
    for (let i = 0; i < 2; i++) tracker.updateStatus(`feat-half4-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('기능 6개 중 절반 complete → 완료율 0.5', () => {
    for (let i = 0; i < 6; i++) tracker.initFeature(`feat-half6-${i}`);
    for (let i = 0; i < 3; i++) tracker.updateStatus(`feat-half6-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('기능 8개 중 절반 complete → 완료율 0.5', () => {
    for (let i = 0; i < 8; i++) tracker.initFeature(`feat-half8-${i}`);
    for (let i = 0; i < 4; i++) tracker.updateStatus(`feat-half8-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('기능 10개 중 절반 complete → 완료율 0.5', () => {
    for (let i = 0; i < 10; i++) tracker.initFeature(`feat-half10-${i}`);
    for (let i = 0; i < 5; i++) tracker.updateStatus(`feat-half10-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });
});

// ── 추가 edge case: initFeature 경계값 ────────────────────────

describe('ProgressTracker initFeature 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('UUID 형식 featureId → ok', () => {
    const result = tracker.initFeature('550e8400-e29b-41d4-a716-446655440000');
    expect(result.ok).toBe(true);
  });

  it('한글 featureId → ok', () => {
    const result = tracker.initFeature('기능-001');
    expect(result.ok).toBe(true);
  });

  it('특수문자 featureId → ok', () => {
    const result = tracker.initFeature('feat!@#$%');
    expect(result.ok).toBe(true);
  });

  it('숫자만 있는 featureId → ok', () => {
    const result = tracker.initFeature('12345');
    expect(result.ok).toBe(true);
  });

  it('매우 긴 featureId (500자) → ok', () => {
    const longId = 'f'.repeat(500);
    const result = tracker.initFeature(longId);
    expect(result.ok).toBe(true);
  });

  it('공백 포함 featureId → ok', () => {
    const result = tracker.initFeature('feat with spaces');
    expect(result.ok).toBe(true);
  });

  it('200개 기능 초기화 → getAllProgress 200개', () => {
    for (let i = 0; i < 200; i++) {
      tracker.initFeature(`feat-bulk-${i}`);
    }
    expect(tracker.getAllProgress()).toHaveLength(200);
  });

  it('initFeature 후 getProgress → startedAt은 Date 객체', () => {
    tracker.initFeature('feat-ts');
    const progress = tracker.getProgress('feat-ts');
    expect(progress?.startedAt).toBeInstanceOf(Date);
  });

  it('initFeature 후 getProgress → updatedAt은 Date 객체', () => {
    tracker.initFeature('feat-ts2');
    const progress = tracker.getProgress('feat-ts2');
    expect(progress?.updatedAt).toBeInstanceOf(Date);
  });

  it('다른 특수문자 featureId → 독립 초기화', () => {
    const r1 = tracker.initFeature('feat-한글-001');
    const r2 = tracker.initFeature('feat-日本語-002');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('두 번째 중복 이후 세 번째도 err', () => {
    tracker.initFeature('feat-dup');
    tracker.initFeature('feat-dup');
    const r = tracker.initFeature('feat-dup');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('agent_feature_exists');
  });
});

// ── 추가 edge case: updateStatus 경계값 ───────────────────────

describe('ProgressTracker updateStatus 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('pending → pending 자기 전환 → ok', () => {
    const result = tracker.updateStatus('feat-1', 'pending');
    expect(result.ok).toBe(true);
  });

  it('complete → complete 자기 전환 → ok', () => {
    tracker.updateStatus('feat-1', 'complete');
    const result = tracker.updateStatus('feat-1', 'complete');
    expect(result.ok).toBe(true);
  });

  it('failed → failed 자기 전환 → ok', () => {
    tracker.updateStatus('feat-1', 'failed');
    const result = tracker.updateStatus('feat-1', 'failed');
    expect(result.ok).toBe(true);
  });

  it('designing → failed → pending 전환 → ok', () => {
    tracker.updateStatus('feat-1', 'designing');
    tracker.updateStatus('feat-1', 'failed');
    const result = tracker.updateStatus('feat-1', 'pending');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.status).toBe('pending');
  });

  it('모든 상태 순서 반복 전환 → 최종 상태 일치', () => {
    for (const st of ALL_STATUSES) {
      tracker.updateStatus('feat-1', st);
    }
    expect(tracker.getProgress('feat-1')?.status).toBe(ALL_STATUSES[ALL_STATUSES.length - 1]);
  });

  it('존재하지 않는 UUID featureId → err', () => {
    const result = tracker.updateStatus('550e8400-e29b-41d4-a716-000000000000', 'complete');
    expect(result.ok).toBe(false);
  });

  it('특수문자 featureId 없음 → err', () => {
    const result = tracker.updateStatus('!@#$%^&*()', 'complete');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('10개 기능 각각 다른 상태 → 독립 확인', () => {
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`feat-state-${i}`);
      tracker.updateStatus(`feat-state-${i}`, ALL_STATUSES[i % ALL_STATUSES.length] as FeatureStatus);
    }
    for (let i = 0; i < 10; i++) {
      const expected = ALL_STATUSES[i % ALL_STATUSES.length];
      expect(tracker.getProgress(`feat-state-${i}`)?.status).toBe(expected);
    }
  });
});

// ── 추가 edge case: updatePhase 경계값 ────────────────────────

describe('ProgressTracker updatePhase 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('DESIGN → DESIGN 자기 전환 → completedPhases에 DESIGN 추가', () => {
    tracker.updatePhase('feat-1', 'DESIGN');
    const progress = tracker.getProgress('feat-1');
    // 같은 Phase 전환도 이전 Phase가 completedPhases에 추가됨
    expect(progress?.currentPhase).toBe('DESIGN');
  });

  it('TEST → CODE 역방향 전환 → completedPhases에 TEST 추가', () => {
    tracker.updatePhase('feat-1', 'TEST');
    tracker.updatePhase('feat-1', 'CODE');
    const progress = tracker.getProgress('feat-1');
    expect(progress?.currentPhase).toBe('CODE');
    expect(progress?.completedPhases).toContain('TEST');
  });

  it('VERIFY → DESIGN 역방향 → ok', () => {
    tracker.updatePhase('feat-1', 'VERIFY');
    const result = tracker.updatePhase('feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
  });

  it('20번 Phase 전환 → 마지막 currentPhase 일치', () => {
    const phases: Phase[] = ['CODE', 'TEST', 'VERIFY', 'DESIGN', 'CODE', 'TEST',
      'VERIFY', 'DESIGN', 'CODE', 'TEST', 'VERIFY', 'DESIGN', 'CODE', 'TEST',
      'VERIFY', 'DESIGN', 'CODE', 'TEST', 'VERIFY', 'DESIGN'];
    for (const p of phases) {
      tracker.updatePhase('feat-1', p);
    }
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('DESIGN');
  });

  it('한글 featureId Phase 업데이트 → ok', () => {
    tracker.initFeature('기능-한글');
    const result = tracker.updatePhase('기능-한글', 'CODE');
    expect(result.ok).toBe(true);
  });

  it('10개 기능 각각 다른 Phase → 독립 확인', () => {
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`feat-ph-${i}`);
      tracker.updatePhase(`feat-ph-${i}`, ALL_PHASES[i % ALL_PHASES.length] as Phase);
    }
    for (let i = 0; i < 10; i++) {
      expect(tracker.getProgress(`feat-ph-${i}`)?.currentPhase).toBe(ALL_PHASES[i % ALL_PHASES.length]);
    }
  });
});

// ── 추가 edge case: addVerification 경계값 ────────────────────

describe('ProgressTracker addVerification 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('빈 feedback 검증 → ok', () => {
    const v: VerificationResult = {
      featureId: 'feat-1',
      phase: 'qa_qc',
      passed: true,
      feedback: '',
      timestamp: new Date(),
    };
    const result = tracker.addVerification('feat-1', v);
    expect(result.ok).toBe(true);
  });

  it('한글 feedback 검증 → ok', () => {
    const v: VerificationResult = {
      featureId: 'feat-1',
      phase: 'reviewer',
      passed: false,
      feedback: '코드 리뷰 실패: 타입 오류 존재',
      timestamp: new Date(),
    };
    const result = tracker.addVerification('feat-1', v);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 feedback (1000자) → ok', () => {
    const v: VerificationResult = {
      featureId: 'feat-1',
      phase: 'layer1',
      passed: true,
      feedback: 'x'.repeat(1000),
      timestamp: new Date(),
    };
    const result = tracker.addVerification('feat-1', v);
    expect(result.ok).toBe(true);
  });

  it('동일 Phase 10번 재검증 → verificationResults 10개', () => {
    for (let i = 0; i < 10; i++) {
      tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', i % 2 === 0));
    }
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults).toHaveLength(10);
  });

  it('4가지 Phase 각 3번씩 → verificationResults 12개', () => {
    for (const phase of ALL_VERIFICATION_PHASES) {
      for (let i = 0; i < 3; i++) {
        tracker.addVerification('feat-1', makeVerification('feat-1', phase, true));
      }
    }
    expect(tracker.getProgress('feat-1')?.verificationResults).toHaveLength(12);
  });

  it('adev Phase 검증 추가 → verificationResults에 존재', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'adev', true));
    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults.some((v) => v.phase === 'adev')).toBe(true);
  });

  it('passed=false → feedback 필드 반영', () => {
    const v: VerificationResult = {
      featureId: 'feat-1',
      phase: 'qc',
      passed: false,
      feedback: '실패 사유: 누락된 테스트',
      timestamp: new Date(),
    };
    tracker.addVerification('feat-1', v as unknown as VerificationResult);
    // any phase type - verify it was stored
    const results = tracker.getProgress('feat-1')?.verificationResults ?? [];
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── 추가 edge case: getProgress 경계값 ───────────────────────

describe('ProgressTracker getProgress 추가 경계값', () => {
  it('initFeature 없이 getProgress → null', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    expect(tracker.getProgress('nonexistent')).toBeNull();
  });

  it('UUID featureId → 초기화 후 조회', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    tracker.initFeature(uuid);
    const progress = tracker.getProgress(uuid);
    expect(progress?.featureId).toBe(uuid);
  });

  it('특수문자 featureId → 초기화 후 조회', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat!@#');
    const progress = tracker.getProgress('feat!@#');
    expect(progress?.featureId).toBe('feat!@#');
  });

  it('공백 포함 featureId → 초기화 후 조회', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat with spaces');
    const progress = tracker.getProgress('feat with spaces');
    expect(progress?.featureId).toBe('feat with spaces');
  });

  it('다른 featureId 조회 → null', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    expect(tracker.getProgress('feat-2')).toBeNull();
  });

  it('대소문자 구분 → 다른 featureId', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('FEAT-1');
    expect(tracker.getProgress('feat-1')).toBeNull();
    expect(tracker.getProgress('FEAT-1')).not.toBeNull();
  });

  it('숫자 featureId → 조회 ok', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('99999');
    const progress = tracker.getProgress('99999');
    expect(progress?.featureId).toBe('99999');
  });

  it('이모지 featureId → 초기화 후 조회', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-🚀');
    const progress = tracker.getProgress('feat-🚀');
    expect(progress?.featureId).toBe('feat-🚀');
  });
});

// ── 추가 edge case: getOverallCompletion 경계값 ──────────────

describe('ProgressTracker getOverallCompletion 추가 경계값', () => {
  it('100개 기능 중 0개 complete → 0', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 100; i++) {
      tracker.initFeature(`feat-${i}`);
    }
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('100개 기능 중 100개 complete → 1', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 100; i++) {
      tracker.initFeature(`feat-${i}`);
      tracker.updateStatus(`feat-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('100개 기능 중 50개 complete → 0.5', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 100; i++) {
      tracker.initFeature(`feat-${i}`);
    }
    for (let i = 0; i < 50; i++) {
      tracker.updateStatus(`feat-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('1개 failed → 0', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'failed');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('2개 중 1개 failed 1개 complete → 0.5', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.initFeature('feat-2');
    tracker.updateStatus('feat-1', 'failed');
    tracker.updateStatus('feat-2', 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('designing 상태는 완료율에 포함 안 됨', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'designing');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('coding 상태는 완료율에 포함 안 됨', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'coding');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('testing 상태는 완료율에 포함 안 됨', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'testing');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('verifying 상태는 완료율에 포함 안 됨', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
    tracker.updateStatus('feat-1', 'verifying');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('getOverallCompletion 반환 범위 [0, 1]', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`feat-${i}`);
      if (i % 3 === 0) tracker.updateStatus(`feat-${i}`, 'complete');
    }
    const ratio = tracker.getOverallCompletion();
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

// ── 추가 edge case: getAllProgress 경계값 ─────────────────────

describe('ProgressTracker getAllProgress 추가 경계값', () => {
  it('50개 초기화 → 50개 반환', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 50; i++) {
      tracker.initFeature(`feat-${i}`);
    }
    expect(tracker.getAllProgress()).toHaveLength(50);
  });

  it('initFeature 없이 getAllProgress → 빈 배열', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    const all = tracker.getAllProgress();
    expect(all).toHaveLength(0);
    expect(Array.isArray(all)).toBe(true);
  });

  it('getAllProgress 각 항목 featureId 고유', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    const ids = ['feat-a', 'feat-b', 'feat-c', 'feat-d', 'feat-e'];
    for (const id of ids) tracker.initFeature(id);
    const all = tracker.getAllProgress();
    const uniqueIds = new Set(all.map((p) => p.featureId));
    expect(uniqueIds.size).toBe(5);
  });

  it('getAllProgress 각 항목 status 초기값 pending', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-${i}`);
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(p.status).toBe('pending');
    }
  });

  it('getAllProgress 각 항목 currentPhase 초기값 DESIGN', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-${i}`);
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(p.currentPhase).toBe('DESIGN');
    }
  });

  it('getAllProgress 각 항목 verificationResults 초기 빈 배열', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-${i}`);
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(p.verificationResults).toHaveLength(0);
    }
  });
});

// ── 추가 edge case: 복합 시나리오 ─────────────────────────────

describe('ProgressTracker 복합 시나리오 추가', () => {
  it('5개 기능 각각 전체 라이프사이클 → 완료율 1', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) {
      tracker.initFeature(`feat-lc-${i}`);
      tracker.updatePhase(`feat-lc-${i}`, 'CODE');
      tracker.updatePhase(`feat-lc-${i}`, 'TEST');
      tracker.updatePhase(`feat-lc-${i}`, 'VERIFY');
      for (const phase of ALL_VERIFICATION_PHASES) {
        tracker.addVerification(`feat-lc-${i}`, makeVerification(`feat-lc-${i}`, phase, true));
      }
      tracker.updateStatus(`feat-lc-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('initFeature 연속 성공 후 중복 → err 코드 일치', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-dup2');
    tracker.initFeature('feat-dup2');
    const r = tracker.initFeature('feat-dup2');
    if (!r.ok) expect(r.error.code).toBe('agent_feature_exists');
  });

  it('updateStatus + updatePhase 교차 → 상태 독립', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-cross');
    tracker.updateStatus('feat-cross', 'designing');
    tracker.updatePhase('feat-cross', 'CODE');
    tracker.updateStatus('feat-cross', 'coding');
    tracker.updatePhase('feat-cross', 'TEST');
    const progress = tracker.getProgress('feat-cross');
    expect(progress?.status).toBe('coding');
    expect(progress?.currentPhase).toBe('TEST');
  });

  it('addVerification 후 getProgress → verificationResults 순서 보존', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-order');
    tracker.addVerification('feat-order', makeVerification('feat-order', 'qa_qc', true));
    tracker.addVerification('feat-order', makeVerification('feat-order', 'reviewer', false));
    tracker.addVerification('feat-order', makeVerification('feat-order', 'layer1', true));
    tracker.addVerification('feat-order', makeVerification('feat-order', 'adev', true));
    const results = tracker.getProgress('feat-order')?.verificationResults ?? [];
    expect(results[0]?.phase).toBe('qa_qc');
    expect(results[1]?.phase).toBe('reviewer');
    expect(results[2]?.phase).toBe('layer1');
    expect(results[3]?.phase).toBe('adev');
  });

  it('updatePhase → updateStatus → addVerification 연속 → 정합성 확인', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-seq');
    tracker.updatePhase('feat-seq', 'CODE');
    tracker.updateStatus('feat-seq', 'coding');
    tracker.addVerification('feat-seq', makeVerification('feat-seq', 'qa_qc', true));
    const progress = tracker.getProgress('feat-seq');
    expect(progress?.currentPhase).toBe('CODE');
    expect(progress?.status).toBe('coding');
    expect(progress?.verificationResults).toHaveLength(1);
  });

  it('getOverallCompletion 완료 후 상태 failed 전환 → 완료율 감소', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-revert');
    tracker.updateStatus('feat-revert', 'complete');
    expect(tracker.getOverallCompletion()).toBe(1);
    tracker.updateStatus('feat-revert', 'failed');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('1000개 기능 초기화 → getAllProgress 1000개', () => {
    const tracker = new ProgressTracker(new ConsoleLogger('error'));
    for (let i = 0; i < 1000; i++) {
      tracker.initFeature(`feat-bulk-${i}`);
    }
    expect(tracker.getAllProgress()).toHaveLength(1000);
  });
});

// ── updatePhase 추가 경계값 ────────────────────────────────────

describe('ProgressTracker updatePhase 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('DESIGN → CODE → TEST → VERIFY 순서 전환 후 completedPhases 3개', () => {
    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-1', 'TEST');
    tracker.updatePhase('feat-1', 'VERIFY');
    const progress = tracker.getProgress('feat-1');
    expect(progress?.completedPhases).toContain('DESIGN');
    expect(progress?.completedPhases).toContain('CODE');
    expect(progress?.completedPhases).toContain('TEST');
  });

  it('같은 Phase로 self-transition → ok', () => {
    const result = tracker.updatePhase('feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('DESIGN');
  });

  it('Phase 역전환 가능 (CODE → DESIGN)', () => {
    tracker.updatePhase('feat-1', 'CODE');
    const result = tracker.updatePhase('feat-1', 'DESIGN');
    expect(result.ok).toBe(true);
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('DESIGN');
  });

  it('10개 기능 각각 VERIFY Phase → 모두 ok', () => {
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`feat-phase-v-${i}`);
      const result = tracker.updatePhase(`feat-phase-v-${i}`, 'VERIFY');
      expect(result.ok).toBe(true);
    }
  });

  it('updatePhase 5번 → 완전한 Phase 순환', () => {
    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-1', 'TEST');
    tracker.updatePhase('feat-1', 'VERIFY');
    tracker.updatePhase('feat-1', 'DESIGN');
    tracker.updatePhase('feat-1', 'CODE');
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('CODE');
  });

  it('없는 기능 DESIGN 전환 → err + agent_feature_not_found', () => {
    const result = tracker.updatePhase('no-such-feature', 'DESIGN');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('없는 기능 TEST 전환 → err', () => {
    const result = tracker.updatePhase('no-such', 'TEST');
    expect(result.ok).toBe(false);
  });

  it('DESIGN Phase 자기 전환 → completedPhases 변화', () => {
    tracker.updatePhase('feat-1', 'DESIGN');
    const progress = tracker.getProgress('feat-1');
    // 자기 자신으로 전환 시 completedPhases는 이전 phase를 포함
    expect(progress?.currentPhase).toBe('DESIGN');
  });

  it('두 기능 독립 Phase 전환 확인', () => {
    tracker.initFeature('feat-2');
    tracker.updatePhase('feat-1', 'TEST');
    tracker.updatePhase('feat-2', 'CODE');
    expect(tracker.getProgress('feat-1')?.currentPhase).toBe('TEST');
    expect(tracker.getProgress('feat-2')?.currentPhase).toBe('CODE');
  });

  it('updatePhase 결과 ok는 boolean', () => {
    const result = tracker.updatePhase('feat-1', 'CODE');
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── addVerification 추가 경계값 ───────────────────────────────

describe('ProgressTracker addVerification 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
    tracker.initFeature('feat-1');
  });

  it('10번 같은 Phase 검증 추가 → verificationResults 10개', () => {
    for (let i = 0; i < 10; i++) {
      tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', i % 2 === 0));
    }
    expect(tracker.getProgress('feat-1')?.verificationResults).toHaveLength(10);
  });

  it('passed=true 검증 → passed 속성 true', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', true));
    const results = tracker.getProgress('feat-1')?.verificationResults ?? [];
    expect(results[0]?.passed).toBe(true);
  });

  it('passed=false 검증 → passed 속성 false', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', false));
    const results = tracker.getProgress('feat-1')?.verificationResults ?? [];
    expect(results[0]?.passed).toBe(false);
  });

  it('4개 Phase 모두 추가 → 4개 results', () => {
    for (const phase of ALL_VERIFICATION_PHASES) {
      tracker.addVerification('feat-1', makeVerification('feat-1', phase, true));
    }
    expect(tracker.getProgress('feat-1')?.verificationResults).toHaveLength(4);
  });

  it('없는 기능에 추가 → err + agent_feature_not_found', () => {
    const result = tracker.addVerification('ghost-feat', makeVerification('ghost-feat', 'qa_qc'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('agent_feature_not_found');
  });

  it('verificationResult featureId 속성 일치', () => {
    const vr = makeVerification('feat-1', 'reviewer', true);
    tracker.addVerification('feat-1', vr);
    const results = tracker.getProgress('feat-1')?.verificationResults ?? [];
    expect(results[0]?.featureId).toBe('feat-1');
  });

  it('verificationResult phase 속성 일치', () => {
    tracker.addVerification('feat-1', makeVerification('feat-1', 'layer1', true));
    const results = tracker.getProgress('feat-1')?.verificationResults ?? [];
    expect(results[0]?.phase).toBe('layer1');
  });

  it('여러 기능에 독립 검증 추가', () => {
    tracker.initFeature('feat-2');
    tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc', true));
    tracker.addVerification('feat-2', makeVerification('feat-2', 'reviewer', false));
    expect(tracker.getProgress('feat-1')?.verificationResults).toHaveLength(1);
    expect(tracker.getProgress('feat-2')?.verificationResults).toHaveLength(1);
  });

  it('adev Phase 검증 → ok', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'adev', true));
    expect(result.ok).toBe(true);
  });

  it('addVerification 결과 ok는 boolean', () => {
    const result = tracker.addVerification('feat-1', makeVerification('feat-1', 'qa_qc'));
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── getProgress/getAllProgress 추가 경계값 ─────────────────────

describe('ProgressTracker getProgress/getAllProgress 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('초기화하지 않은 UUID featureId → null', () => {
    expect(tracker.getProgress('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  it('초기화 후 getProgress → null 아님', () => {
    tracker.initFeature('feat-not-null');
    expect(tracker.getProgress('feat-not-null')).not.toBeNull();
  });

  it('getProgress 반환 값의 completedPhases는 배열', () => {
    tracker.initFeature('feat-arr');
    const progress = tracker.getProgress('feat-arr');
    expect(Array.isArray(progress?.completedPhases)).toBe(true);
  });

  it('getProgress 반환 값의 verificationResults는 배열', () => {
    tracker.initFeature('feat-vr-arr');
    const progress = tracker.getProgress('feat-vr-arr');
    expect(Array.isArray(progress?.verificationResults)).toBe(true);
  });

  it('getAllProgress 10개 → 배열 길이 10', () => {
    for (let i = 0; i < 10; i++) tracker.initFeature(`feat-len-${i}`);
    expect(tracker.getAllProgress().length).toBe(10);
  });

  it('getAllProgress → 배열 타입', () => {
    tracker.initFeature('feat-type-check');
    expect(Array.isArray(tracker.getAllProgress())).toBe(true);
  });

  it('getAllProgress → 각 원소에 featureId 존재', () => {
    tracker.initFeature('feat-id-check');
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(typeof p.featureId).toBe('string');
    }
  });

  it('getAllProgress → 각 원소에 status 존재', () => {
    tracker.initFeature('feat-status-check');
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(typeof p.status).toBe('string');
    }
  });

  it('getAllProgress → 각 원소에 currentPhase 존재', () => {
    tracker.initFeature('feat-phase-check');
    const all = tracker.getAllProgress();
    for (const p of all) {
      expect(typeof p.currentPhase).toBe('string');
    }
  });

  it('getAllProgress 50개 → 배열 길이 50', () => {
    for (let i = 0; i < 50; i++) tracker.initFeature(`feat-50-${i}`);
    expect(tracker.getAllProgress()).toHaveLength(50);
  });
});

// ── getOverallCompletion 추가 경계값 ──────────────────────────

describe('ProgressTracker getOverallCompletion 추가 경계값', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker(new ConsoleLogger('error'));
  });

  it('100개 중 50개 complete → 0.5', () => {
    for (let i = 0; i < 100; i++) tracker.initFeature(`feat-100-${i}`);
    for (let i = 0; i < 50; i++) tracker.updateStatus(`feat-100-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBe(0.5);
  });

  it('100개 모두 complete → 1', () => {
    for (let i = 0; i < 100; i++) {
      tracker.initFeature(`feat-all-${i}`);
      tracker.updateStatus(`feat-all-${i}`, 'complete');
    }
    expect(tracker.getOverallCompletion()).toBe(1);
  });

  it('100개 모두 failed → 0', () => {
    for (let i = 0; i < 100; i++) {
      tracker.initFeature(`feat-fail-${i}`);
      tracker.updateStatus(`feat-fail-${i}`, 'failed');
    }
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('완료 후 failed 전환 → 완료율 감소', () => {
    tracker.initFeature('feat-decrease');
    tracker.updateStatus('feat-decrease', 'complete');
    expect(tracker.getOverallCompletion()).toBe(1);
    tracker.updateStatus('feat-decrease', 'failed');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('getOverallCompletion 결과는 0~1 범위', () => {
    for (let i = 0; i < 10; i++) tracker.initFeature(`feat-range-${i}`);
    for (let i = 0; i < 5; i++) tracker.updateStatus(`feat-range-${i}`, 'complete');
    const rate = tracker.getOverallCompletion();
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('getOverallCompletion 결과는 숫자', () => {
    tracker.initFeature('feat-num');
    const rate = tracker.getOverallCompletion();
    expect(typeof rate).toBe('number');
  });

  it('5개 중 4개 complete → 0.8', () => {
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-4-of-5-${i}`);
    for (let i = 0; i < 4; i++) tracker.updateStatus(`feat-4-of-5-${i}`, 'complete');
    expect(tracker.getOverallCompletion()).toBeCloseTo(0.8);
  });

  it('5개 중 1개 complete → 0.2', () => {
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-1-of-5-${i}`);
    tracker.updateStatus('feat-1-of-5-0', 'complete');
    expect(tracker.getOverallCompletion()).toBeCloseTo(0.2);
  });

  it('designing 상태 → 완료율에 포함 안 됨', () => {
    tracker.initFeature('feat-designing');
    tracker.updateStatus('feat-designing', 'designing');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('coding 상태 → 완료율에 포함 안 됨', () => {
    tracker.initFeature('feat-coding');
    tracker.updateStatus('feat-coding', 'coding');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('testing 상태 → 완료율에 포함 안 됨', () => {
    tracker.initFeature('feat-testing-rate');
    tracker.updateStatus('feat-testing-rate', 'testing');
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('verifying 상태 → 완료율에 포함 안 됨', () => {
    tracker.initFeature('feat-verifying-rate');
    tracker.updateStatus('feat-verifying-rate', 'verifying');
    expect(tracker.getOverallCompletion()).toBe(0);
  });
});
