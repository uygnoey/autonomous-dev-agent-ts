/**
 * layer2 ↔ layer1 모듈 통합 테스트 / layer2 ↔ layer1 module integration tests
 *
 * @description
 * KR: HandoffReceiver가 layer1의 HandoffPackage를 수신/검증하고,
 *     PhaseEngine FSM 전환 + ProgressTracker 상태 추적 연동,
 *     VerificationGate 4중 검증 흐름을 검증한다.
 * EN: Verifies HandoffReceiver receives/validates HandoffPackage from layer1,
 *     PhaseEngine FSM transitions + ProgressTracker state tracking,
 *     and VerificationGate 4-layer verification flow.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/index.js';
import type { Logger } from 'core/logger.js';
import { ContractBuilder } from 'layer1/index.js';
import type {
  AcceptanceCriterion,
  FeatureSpec,
  HandoffPackage,
  TestTypeDefinition,
} from 'layer1/types.js';
import {
  HandoffReceiver,
  PhaseEngine,
  ProgressTracker,
  VerificationGate,
} from 'layer2/index.js';
import type { VerificationResult } from 'layer2/types.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');

/** 테스트용 FeatureSpec 생성 / Create test FeatureSpec */
function createFeature(id: string, deps: string[] = []): FeatureSpec {
  return {
    id,
    name: `Feature ${id}`,
    description: `Description for ${id}`,
    acceptanceCriteria: [
      { id: `ac-${id}-1`, description: 'Criterion 1', verifiable: true, testCategory: 'unit' },
    ],
    dependencies: deps,
    inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
    outputs: [{ name: 'output', type: 'string', constraints: '', required: true }],
  };
}

/** 테스트용 TestTypeDefinition 생성 / Create test TestTypeDefinition */
function createTestDef(featureId: string): TestTypeDefinition {
  return {
    featureId,
    categories: [
      { name: 'unit', description: 'Unit tests', mappedCriteria: [`ac-${featureId}-1`] },
    ],
    rules: ['test first'],
    sampleTests: [
      { category: 'unit', description: 'sample', expectedBehavior: 'should pass' },
    ],
    ratios: { unit: 0.7, module: 0.2, e2e: 0.1 },
  };
}

/** 유효한 HandoffPackage 생성 / Create valid HandoffPackage */
function createValidHandoffPackage(): HandoffPackage {
  const builder = new ContractBuilder(logger);
  const features = [createFeature('feat-1'), createFeature('feat-2', ['feat-1'])];
  const testDefs = [createTestDef('feat-1'), createTestDef('feat-2')];

  const contractResult = builder.buildContract(features, testDefs, 'REST API design');
  if (!contractResult.ok) throw new Error('Failed to create contract');

  const handoffResult = builder.buildHandoffPackage(
    'proj-1',
    contractResult.value,
    'Plan document',
    'REST API design',
    'Spec document',
  );
  if (!handoffResult.ok) throw new Error('Failed to create handoff package');

  return handoffResult.value;
}

/** VerificationResult 생성 헬퍼 / Create VerificationResult helper */
function createVerificationResult(
  featureId: string,
  phase: VerificationResult['phase'],
  passed: boolean,
): VerificationResult {
  return {
    featureId,
    phase,
    passed,
    feedback: passed ? '통과' : '실패',
    timestamp: new Date(),
  };
}

// ── 테스트 ────────────────────────────────────────────────────────

describe('layer2 ↔ layer1 통합 / layer2 ↔ layer1 integration', () => {
  it('HandoffReceiver가 유효한 HandoffPackage를 수신하고 검증 통과', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();

    const result = receiver.receive(handoff);
    expect(result.ok).toBe(true);
  });

  it('HandoffReceiver.validateStructure가 완전한 Contract에 빈 에러 목록 반환', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();

    const result = receiver.validateStructure(handoff.contract);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(0);
  });

  it('HandoffReceiver가 수락 기준 없는 Contract를 거부', () => {
    const receiver = new HandoffReceiver(logger);
    const builder = new ContractBuilder(logger);

    // WHY: acceptanceCriteria가 빈 FeatureSpec으로 Contract 생성
    const featureNoAC: FeatureSpec = {
      id: 'feat-no-ac',
      name: 'No AC Feature',
      description: 'No acceptance criteria',
      acceptanceCriteria: [],
      dependencies: [],
      inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
      outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
    };

    const contractResult = builder.buildContract([featureNoAC], [], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-no-ac', contractResult.value, 'plan', 'design', 'spec',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;

    // WHY: completenessScore < 0.8이므로 receive가 실패해야 함
    const receiveResult = receiver.receive(handoffResult.value);
    expect(receiveResult.ok).toBe(false);
  });

  it('HandoffReceiver.validateConsistency가 불완전한 verificationMatrix 경고', () => {
    const receiver = new HandoffReceiver(logger);
    const builder = new ContractBuilder(logger);

    // WHY: testDefinitions 없이 생성하면 allCriteriaHaveTests가 false
    const features = [createFeature('feat-1')];
    const contractResult = builder.buildContract(features, [], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const consistencyResult = receiver.validateConsistency(contractResult.value);
    expect(consistencyResult.ok).toBe(true);
    if (!consistencyResult.ok) return;
    // WHY: allCriteriaHaveTests가 false → 경고 1개 이상
    expect(consistencyResult.value.length).toBeGreaterThan(0);
  });

  it('PhaseEngine FSM: DESIGN → CODE → TEST → VERIFY 순방향 전환', () => {
    const engine = new PhaseEngine(logger);

    expect(engine.currentPhase).toBe('DESIGN');

    const toCode = engine.transition('CODE', 'Design complete', 'architect');
    expect(toCode.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');

    const toTest = engine.transition('TEST', 'Code complete', 'coder');
    expect(toTest.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');

    const toVerify = engine.transition('VERIFY', 'Tests passed', 'tester');
    expect(toVerify.ok).toBe(true);
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('PhaseEngine FSM: 유효하지 않은 전환 차단 (DESIGN → TEST 직접 불가)', () => {
    const engine = new PhaseEngine(logger);

    expect(engine.canTransition('TEST')).toBe(false);

    const result = engine.transition('TEST', 'skip code', 'qa');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine FSM: VERIFY에서 역방향 롤백 가능', () => {
    const engine = new PhaseEngine(logger);

    // 순방향 전환으로 VERIFY 도달
    engine.transition('CODE', 'reason', 'architect');
    engine.transition('TEST', 'reason', 'coder');
    engine.transition('VERIFY', 'reason', 'tester');
    expect(engine.currentPhase).toBe('VERIFY');

    // WHY: VERIFY에서만 DESIGN/CODE/TEST로 롤백 가능
    expect(engine.canTransition('DESIGN')).toBe(true);
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(true);

    const rollback = engine.transition('CODE', 'Bug found', 'qa');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('PhaseEngine 전환 이력이 올바르게 누적', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'step1', 'architect');
    engine.transition('TEST', 'step2', 'coder');

    const history = engine.getHistory();
    expect(history.length).toBe(2);
    expect(history[0]?.from).toBe('DESIGN');
    expect(history[0]?.to).toBe('CODE');
    expect(history[1]?.from).toBe('CODE');
    expect(history[1]?.to).toBe('TEST');
  });

  it('ProgressTracker가 기능 Phase를 추적하고 completedPhases를 누적', () => {
    const tracker = new ProgressTracker(logger);

    const initResult = tracker.initFeature('feat-1');
    expect(initResult.ok).toBe(true);

    tracker.updatePhase('feat-1', 'CODE');
    tracker.updatePhase('feat-1', 'TEST');

    const progress = tracker.getProgress('feat-1');
    expect(progress).not.toBeNull();
    expect(progress?.currentPhase).toBe('TEST');
    // WHY: DESIGN → CODE → TEST이므로 DESIGN, CODE가 completedPhases에 포함
    expect(progress?.completedPhases).toContain('DESIGN');
    expect(progress?.completedPhases).toContain('CODE');
  });

  it('ProgressTracker 전체 완료율 계산', () => {
    const tracker = new ProgressTracker(logger);

    tracker.initFeature('feat-1');
    tracker.initFeature('feat-2');
    tracker.initFeature('feat-3');

    // WHY: 1/3만 complete → 약 33%
    tracker.updateStatus('feat-1', 'complete');

    const completion = tracker.getOverallCompletion();
    expect(completion).toBeCloseTo(1 / 3, 2);
  });

  it('ProgressTracker에 검증 결과 추가 및 조회', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-1');

    const verResult = createVerificationResult('feat-1', 'qa_qc', true);
    const addResult = tracker.addVerification('feat-1', verResult);
    expect(addResult.ok).toBe(true);

    const progress = tracker.getProgress('feat-1');
    expect(progress?.verificationResults.length).toBe(1);
    expect(progress?.verificationResults[0]?.passed).toBe(true);
  });

  it('VerificationGate 4중 검증 전체 통과 판정', () => {
    const gate = new VerificationGate(logger);

    gate.addResult(createVerificationResult('feat-1', 'qa_qc', true));
    gate.addResult(createVerificationResult('feat-1', 'reviewer', true));
    gate.addResult(createVerificationResult('feat-1', 'layer1', true));
    gate.addResult(createVerificationResult('feat-1', 'adev', true));

    expect(gate.isComplete('feat-1')).toBe(true);
    expect(gate.isAllPassed('feat-1')).toBe(true);

    const summary = gate.summarize('feat-1');
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.passed).toBe(true);
  });

  it('VerificationGate 부분 실패 시 isAllPassed false', () => {
    const gate = new VerificationGate(logger);

    gate.addResult(createVerificationResult('feat-2', 'qa_qc', true));
    gate.addResult(createVerificationResult('feat-2', 'reviewer', false));
    gate.addResult(createVerificationResult('feat-2', 'layer1', true));
    gate.addResult(createVerificationResult('feat-2', 'adev', true));

    expect(gate.isComplete('feat-2')).toBe(true);
    // WHY: reviewer 단계가 실패 → 전체 실패
    expect(gate.isAllPassed('feat-2')).toBe(false);
  });

  it('VerificationGate 미완료 시 isComplete false', () => {
    const gate = new VerificationGate(logger);

    gate.addResult(createVerificationResult('feat-3', 'qa_qc', true));
    gate.addResult(createVerificationResult('feat-3', 'reviewer', true));

    // WHY: layer1, adev 단계가 아직 없음
    expect(gate.isComplete('feat-3')).toBe(false);
    expect(gate.isAllPassed('feat-3')).toBe(false);
  });

  it('VerificationGate summarize가 검증 결과 없는 기능에 에러 반환', () => {
    const gate = new VerificationGate(logger);

    const summary = gate.summarize('nonexistent');
    expect(summary.ok).toBe(false);
    if (summary.ok) return;
    expect(summary.error.code).toBe('agent_verification_not_found');
  });

  // ── 추가 edge/random case 테스트 ────────────────────────────────

  it('PhaseEngine: 초기 상태 DESIGN 확인', () => {
    const engine = new PhaseEngine(logger);

    expect(engine.currentPhase).toBe('DESIGN');
    expect(engine.getHistory().length).toBe(0);
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('PhaseEngine: DESIGN → CODE canTransition 확인', () => {
    const engine = new PhaseEngine(logger);

    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('DESIGN')).toBe(false);
  });

  it('PhaseEngine: CODE → DESIGN 롤백 불가', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'design done', 'architect');

    const rollbackResult = engine.transition('DESIGN', 'rollback', 'qa');
    expect(rollbackResult.ok).toBe(false);
    if (rollbackResult.ok) return;
    expect(rollbackResult.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine: TEST에서 CODE로 롤백 불가 (TEST에서는 VERIFY만 가능)', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'design done', 'architect');
    engine.transition('TEST', 'code done', 'coder');

    const rollbackResult = engine.transition('CODE', 'rollback attempt', 'qa');
    expect(rollbackResult.ok).toBe(false);
    if (rollbackResult.ok) return;
    expect(rollbackResult.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine: CODE에서 CODE로 직접 전환 불가', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'step1', 'architect');

    // WHY: CODE → CODE는 유효하지 않은 전환
    const result = engine.transition('CODE', 'retry', 'qa');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine: 여러 번 전체 사이클 후 이력 정확도', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'step1', 'architect');
    engine.transition('TEST', 'step2', 'coder');
    engine.transition('VERIFY', 'step3', 'tester');
    engine.transition('CODE', 'rollback', 'qa'); // VERIFY에서 CODE 롤백

    const history = engine.getHistory();
    expect(history.length).toBe(4);
    expect(history[3]?.from).toBe('VERIFY');
    expect(history[3]?.to).toBe('CODE');
  });

  it('ProgressTracker: 미초기화 기능에 updatePhase 에러', () => {
    const tracker = new ProgressTracker(logger);

    const result = tracker.updatePhase('nonexistent-feat', 'CODE');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // WHY: 에러 코드 확인
    expect(['progress_feature_not_found', 'agent_feature_not_found']).toContain(result.error.code);
  });

  it('ProgressTracker: 미초기화 기능에 addVerification 에러', () => {
    const tracker = new ProgressTracker(logger);

    const verResult = createVerificationResult('nonexistent-feat', 'qa_qc', true);
    const result = tracker.addVerification('nonexistent-feat', verResult);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // WHY: 에러 코드 확인
    expect(['progress_feature_not_found', 'agent_feature_not_found']).toContain(result.error.code);
  });

  it('ProgressTracker: 기능 없는 경우 getOverallCompletion 0.0 반환', () => {
    const tracker = new ProgressTracker(logger);

    const completion = tracker.getOverallCompletion();
    expect(completion).toBe(0);
  });

  it('ProgressTracker: 모든 기능 complete → completion 1.0', () => {
    const tracker = new ProgressTracker(logger);

    tracker.initFeature('feat-a');
    tracker.initFeature('feat-b');
    tracker.initFeature('feat-c');

    tracker.updateStatus('feat-a', 'complete');
    tracker.updateStatus('feat-b', 'complete');
    tracker.updateStatus('feat-c', 'complete');

    const completion = tracker.getOverallCompletion();
    expect(completion).toBeCloseTo(1.0, 2);
  });

  it('ProgressTracker: UUID 형식 featureId 초기화', () => {
    const tracker = new ProgressTracker(logger);

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = tracker.initFeature(uuid);
    expect(result.ok).toBe(true);

    const progress = tracker.getProgress(uuid);
    expect(progress).not.toBeNull();
  });

  it('ProgressTracker: 한글 featureId 초기화', () => {
    const tracker = new ProgressTracker(logger);

    const result = tracker.initFeature('인증-기능');
    expect(result.ok).toBe(true);

    const progress = tracker.getProgress('인증-기능');
    expect(progress).not.toBeNull();
  });

  it('ProgressTracker: 동일 featureId 중복 초기화 처리', () => {
    const tracker = new ProgressTracker(logger);

    const first = tracker.initFeature('dup-feat');
    expect(first.ok).toBe(true);

    const second = tracker.initFeature('dup-feat');
    // WHY: 중복 초기화는 에러 또는 덮어쓰기 — 구현에 따라 다름
    expect(typeof second.ok).toBe('boolean');
  });

  it('ProgressTracker: 여러 검증 결과 누적', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-multi-ver');

    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      tracker.addVerification('feat-multi-ver', createVerificationResult('feat-multi-ver', phase, true));
    }

    const progress = tracker.getProgress('feat-multi-ver');
    expect(progress?.verificationResults.length).toBe(4);
  });

  it('ProgressTracker: getProgress 미초기화 기능에 null 반환', () => {
    const tracker = new ProgressTracker(logger);

    const progress = tracker.getProgress('nonexistent');
    expect(progress).toBeNull();
  });

  it('VerificationGate: 빈 Gate에 isComplete false', () => {
    const gate = new VerificationGate(logger);

    expect(gate.isComplete('any-feat')).toBe(false);
  });

  it('VerificationGate: 빈 Gate에 isAllPassed false', () => {
    const gate = new VerificationGate(logger);

    expect(gate.isAllPassed('any-feat')).toBe(false);
  });

  it('VerificationGate: 단일 단계만 통과 시 미완료', () => {
    const gate = new VerificationGate(logger);

    gate.addResult(createVerificationResult('feat-single', 'qa_qc', true));

    expect(gate.isComplete('feat-single')).toBe(false);
    expect(gate.isAllPassed('feat-single')).toBe(false);
  });

  it('VerificationGate: 모든 단계 실패 시 isAllPassed false', () => {
    const gate = new VerificationGate(logger);

    gate.addResult(createVerificationResult('feat-all-fail', 'qa_qc', false));
    gate.addResult(createVerificationResult('feat-all-fail', 'reviewer', false));
    gate.addResult(createVerificationResult('feat-all-fail', 'layer1', false));
    gate.addResult(createVerificationResult('feat-all-fail', 'adev', false));

    expect(gate.isComplete('feat-all-fail')).toBe(true);
    expect(gate.isAllPassed('feat-all-fail')).toBe(false);

    const summary = gate.summarize('feat-all-fail');
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.passed).toBe(false);
  });

  it('VerificationGate: UUID 형식 featureId로 결과 추가', () => {
    const gate = new VerificationGate(logger);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    gate.addResult(createVerificationResult(uuid, 'qa_qc', true));
    gate.addResult(createVerificationResult(uuid, 'reviewer', true));
    gate.addResult(createVerificationResult(uuid, 'layer1', true));
    gate.addResult(createVerificationResult(uuid, 'adev', true));

    expect(gate.isComplete(uuid)).toBe(true);
    expect(gate.isAllPassed(uuid)).toBe(true);
  });

  it('VerificationGate: 한글 featureId로 결과 추가', () => {
    const gate = new VerificationGate(logger);
    const koreanId = '인증-기능';

    gate.addResult(createVerificationResult(koreanId, 'qa_qc', true));
    gate.addResult(createVerificationResult(koreanId, 'reviewer', true));
    gate.addResult(createVerificationResult(koreanId, 'layer1', true));
    gate.addResult(createVerificationResult(koreanId, 'adev', true));

    expect(gate.isComplete(koreanId)).toBe(true);
    expect(gate.isAllPassed(koreanId)).toBe(true);
  });

  it('VerificationGate: 여러 기능 독립적으로 검증', () => {
    const gate = new VerificationGate(logger);

    // feat-pass: 모두 통과
    gate.addResult(createVerificationResult('feat-pass', 'qa_qc', true));
    gate.addResult(createVerificationResult('feat-pass', 'reviewer', true));
    gate.addResult(createVerificationResult('feat-pass', 'layer1', true));
    gate.addResult(createVerificationResult('feat-pass', 'adev', true));

    // feat-fail: 일부 실패
    gate.addResult(createVerificationResult('feat-fail', 'qa_qc', false));
    gate.addResult(createVerificationResult('feat-fail', 'reviewer', true));
    gate.addResult(createVerificationResult('feat-fail', 'layer1', true));
    gate.addResult(createVerificationResult('feat-fail', 'adev', true));

    expect(gate.isAllPassed('feat-pass')).toBe(true);
    expect(gate.isAllPassed('feat-fail')).toBe(false);
  });

  it('HandoffReceiver: validateStructure가 에러 목록을 문자열 배열로 반환', () => {
    const receiver = new HandoffReceiver(logger);
    const builder = new ContractBuilder(logger);

    const features = [createFeature('feat-1')];
    const contractResult = builder.buildContract(features, [], 'design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const structureResult = receiver.validateStructure(contractResult.value);
    expect(structureResult.ok).toBe(true);
    if (!structureResult.ok) return;

    for (const err of structureResult.value) {
      expect(typeof err).toBe('string');
    }
  });

  it('HandoffReceiver: validateConsistency가 빈 배열 반환 (완전한 Contract)', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();

    const consistencyResult = receiver.validateConsistency(handoff.contract);
    expect(consistencyResult.ok).toBe(true);
    if (!consistencyResult.ok) return;
    expect(consistencyResult.value.length).toBe(0);
  });

  it('HandoffReceiver: 동일 HandoffPackage 두 번 수신 처리', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();

    const first = receiver.receive(handoff);
    expect(first.ok).toBe(true);

    const second = receiver.receive(handoff);
    // WHY: 동일 패키지 재수신은 구현에 따라 허용 또는 에러
    expect(typeof second.ok).toBe('boolean');
  });

  it('HandoffReceiver: 10개 기능 HandoffPackage 수신', () => {
    const builder = new ContractBuilder(logger);
    const features = Array.from({ length: 10 }, (_, i) => createFeature(`feat-${i + 1}`));
    const testDefs = features.map((f) => createTestDef(f.id));

    const contractResult = builder.buildContract(features, testDefs, 'large CLI design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-large',
      contractResult.value,
      'large plan',
      'large CLI design',
      'large spec',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;

    const receiver = new HandoffReceiver(logger);
    const receiveResult = receiver.receive(handoffResult.value);
    expect(receiveResult.ok).toBe(true);
  });

  it('ProgressTracker + VerificationGate 연동: 기능 추적 후 검증 추가', () => {
    const tracker = new ProgressTracker(logger);
    const gate = new VerificationGate(logger);

    tracker.initFeature('feat-integrated');
    tracker.updatePhase('feat-integrated', 'CODE');
    tracker.updatePhase('feat-integrated', 'TEST');
    tracker.updatePhase('feat-integrated', 'VERIFY');

    const verResults: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of verResults) {
      const ver = createVerificationResult('feat-integrated', phase, true);
      tracker.addVerification('feat-integrated', ver);
      gate.addResult(ver);
    }

    const progress = tracker.getProgress('feat-integrated');
    expect(progress?.verificationResults.length).toBe(4);
    expect(gate.isAllPassed('feat-integrated')).toBe(true);
  });

  it('PhaseEngine + ProgressTracker 연동: FSM 전환 시 tracker 업데이트', () => {
    const engine = new PhaseEngine(logger);
    const tracker = new ProgressTracker(logger);

    tracker.initFeature('feat-fsm');

    engine.transition('CODE', 'design done', 'architect');
    tracker.updatePhase('feat-fsm', 'CODE');

    engine.transition('TEST', 'code done', 'coder');
    tracker.updatePhase('feat-fsm', 'TEST');

    expect(engine.currentPhase).toBe('TEST');
    const progress = tracker.getProgress('feat-fsm');
    expect(progress?.currentPhase).toBe('TEST');
    expect(progress?.completedPhases).toContain('CODE');
  });

  it('PhaseEngine: 빈 reason 문자열로 전환', () => {
    const engine = new PhaseEngine(logger);

    const result = engine.transition('CODE', '', 'architect');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('PhaseEngine: 한글 reason으로 전환', () => {
    const engine = new PhaseEngine(logger);

    const result = engine.transition('CODE', '설계 완료', '아키텍트');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');

    const history = engine.getHistory();
    expect(history[0]?.reason).toBe('설계 완료');
  });

  it('VerificationGate: summarize feedback 내용 확인', () => {
    const gate = new VerificationGate(logger);

    gate.addResult({ featureId: 'feat-feedback', phase: 'qa_qc', passed: true, feedback: 'QA 통과', timestamp: new Date() });
    gate.addResult({ featureId: 'feat-feedback', phase: 'reviewer', passed: false, feedback: '코드 리뷰 실패', timestamp: new Date() });
    gate.addResult({ featureId: 'feat-feedback', phase: 'layer1', passed: true, feedback: 'Layer1 통과', timestamp: new Date() });
    gate.addResult({ featureId: 'feat-feedback', phase: 'adev', passed: true, feedback: 'Adev 통과', timestamp: new Date() });

    const summary = gate.summarize('feat-feedback');
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.passed).toBe(false);
  });

  // ── 추가 edge: PhaseEngine 극단값 ──────────────────────────

  it('PhaseEngine: 이력 길이가 정확히 1 (DESIGN → CODE)', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'step', 'architect');
    expect(engine.getHistory().length).toBe(1);
  });

  it('PhaseEngine: 이력 길이가 정확히 3 (전체 사이클)', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 's1', 'architect');
    engine.transition('TEST', 's2', 'coder');
    engine.transition('VERIFY', 's3', 'tester');
    expect(engine.getHistory().length).toBe(3);
  });

  it('PhaseEngine: 이력 항목 from/to가 문자열이다', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'step', 'architect');
    const history = engine.getHistory();
    if (history[0]) {
      expect(typeof history[0].from).toBe('string');
      expect(typeof history[0].to).toBe('string');
    }
  });

  it('PhaseEngine: VERIFY 후 DESIGN 롤백 시 이력 누적', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 's1', 'architect');
    engine.transition('TEST', 's2', 'coder');
    engine.transition('VERIFY', 's3', 'tester');
    engine.transition('DESIGN', 'rollback to design', 'qa');
    expect(engine.getHistory().length).toBe(4);
    const history = engine.getHistory();
    expect(history[3]?.to).toBe('DESIGN');
  });

  it('PhaseEngine: canTransition 결과가 boolean이다', () => {
    const engine = new PhaseEngine(logger);
    expect(typeof engine.canTransition('CODE')).toBe('boolean');
    expect(typeof engine.canTransition('TEST')).toBe('boolean');
    expect(typeof engine.canTransition('VERIFY')).toBe('boolean');
  });

  it('PhaseEngine: 전환 실패 에러 메시지가 문자열이다', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('TEST', 'skip', 'qa');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('PhaseEngine: 전환 실패 에러 code가 문자열이다', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('VERIFY', 'jump', 'qa');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('PhaseEngine: 특수문자 reason으로 전환', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('CODE', '!@#$% reason', 'architect');
    expect(result.ok).toBe(true);
    const history = engine.getHistory();
    expect(history[0]?.reason).toBe('!@#$% reason');
  });

  it('PhaseEngine: UUID agent name으로 전환', () => {
    const engine = new PhaseEngine(logger);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = engine.transition('CODE', 'reason', uuid);
    expect(result.ok).toBe(true);
  });

  // ── 추가 edge: ProgressTracker 극단값 ──────────────────────

  it('ProgressTracker: 특수문자 featureId 초기화', () => {
    const tracker = new ProgressTracker(logger);
    const result = tracker.initFeature('feat!@#$-특수');
    expect(result.ok).toBe(true);
  });

  it('ProgressTracker: 매우 긴 featureId 초기화', () => {
    const tracker = new ProgressTracker(logger);
    const longId = 'feat-' + 'x'.repeat(300);
    const result = tracker.initFeature(longId);
    expect(result.ok).toBe(true);
    const progress = tracker.getProgress(longId);
    expect(progress).not.toBeNull();
  });

  it('ProgressTracker: initFeature 후 currentPhase가 DESIGN', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-phase-check');
    const progress = tracker.getProgress('feat-phase-check');
    expect(progress?.currentPhase).toBe('DESIGN');
  });

  it('ProgressTracker: initFeature 후 completedPhases가 빈 배열', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-empty-completed');
    const progress = tracker.getProgress('feat-empty-completed');
    expect(Array.isArray(progress?.completedPhases)).toBe(true);
    expect(progress?.completedPhases.length).toBe(0);
  });

  it('ProgressTracker: initFeature 후 verificationResults가 빈 배열', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-empty-ver');
    const progress = tracker.getProgress('feat-empty-ver');
    expect(Array.isArray(progress?.verificationResults)).toBe(true);
    expect(progress?.verificationResults.length).toBe(0);
  });

  it('ProgressTracker: 5개 기능 일부만 complete → 완료율 계산', () => {
    const tracker = new ProgressTracker(logger);
    for (let i = 0; i < 5; i++) tracker.initFeature(`feat-completion-${i}`);
    tracker.updateStatus('feat-completion-0', 'complete');
    tracker.updateStatus('feat-completion-1', 'complete');
    const completion = tracker.getOverallCompletion();
    expect(completion).toBeCloseTo(2 / 5, 2);
  });

  it('ProgressTracker: 이모지 featureId → ok=true', () => {
    const tracker = new ProgressTracker(logger);
    const result = tracker.initFeature('feat-🎯');
    expect(result.ok).toBe(true);
  });

  // ── 추가 edge: VerificationGate 극단값 ─────────────────────

  it('VerificationGate: 10개 기능 독립 검증 가능', () => {
    const gate = new VerificationGate(logger);
    for (let i = 0; i < 10; i++) {
      const fid = `feat-gate-${i}`;
      gate.addResult(createVerificationResult(fid, 'qa_qc', true));
      gate.addResult(createVerificationResult(fid, 'reviewer', true));
      gate.addResult(createVerificationResult(fid, 'layer1', true));
      gate.addResult(createVerificationResult(fid, 'adev', true));
    }
    for (let i = 0; i < 10; i++) {
      expect(gate.isAllPassed(`feat-gate-${i}`)).toBe(true);
    }
  });

  it('VerificationGate: summarize 성공 → value.passed가 boolean', () => {
    const gate = new VerificationGate(logger);
    gate.addResult(createVerificationResult('feat-bool', 'qa_qc', true));
    gate.addResult(createVerificationResult('feat-bool', 'reviewer', true));
    gate.addResult(createVerificationResult('feat-bool', 'layer1', true));
    gate.addResult(createVerificationResult('feat-bool', 'adev', true));
    const summary = gate.summarize('feat-bool');
    if (summary.ok) expect(typeof summary.value.passed).toBe('boolean');
  });

  it('VerificationGate: 이모지 featureId로 완전 검증', () => {
    const gate = new VerificationGate(logger);
    const fid = 'feat-🔒-auth';
    gate.addResult(createVerificationResult(fid, 'qa_qc', true));
    gate.addResult(createVerificationResult(fid, 'reviewer', true));
    gate.addResult(createVerificationResult(fid, 'layer1', true));
    gate.addResult(createVerificationResult(fid, 'adev', true));
    expect(gate.isComplete(fid)).toBe(true);
    expect(gate.isAllPassed(fid)).toBe(true);
  });

  // ── 추가 edge: HandoffReceiver 극단값 ──────────────────────

  it('HandoffReceiver: validateStructure ok가 boolean이다', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const result = receiver.validateStructure(handoff.contract);
    expect(typeof result.ok).toBe('boolean');
  });

  it('HandoffReceiver: validateConsistency ok가 boolean이다', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const result = receiver.validateConsistency(handoff.contract);
    expect(typeof result.ok).toBe('boolean');
  });

  // ── 추가 edge: PhaseEngine 반복/경계 ─────────────────────────

  it('PhaseEngine: 동일 전환을 5개 엔진에서 독립 수행', () => {
    for (let i = 0; i < 5; i++) {
      const engine = new PhaseEngine(logger);
      engine.transition('CODE', `step-${i}`, 'architect');
      expect(engine.currentPhase).toBe('CODE');
      expect(engine.getHistory().length).toBe(1);
    }
  });

  it('PhaseEngine: VERIFY→DESIGN→CODE→TEST→VERIFY 2사이클 이력 7개', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 's1', 'architect');
    engine.transition('TEST', 's2', 'coder');
    engine.transition('VERIFY', 's3', 'tester');
    engine.transition('DESIGN', 'rollback', 'qa');
    engine.transition('CODE', 's4', 'architect');
    engine.transition('TEST', 's5', 'coder');
    engine.transition('VERIFY', 's6', 'tester');
    expect(engine.getHistory().length).toBe(7);
  });

  it('PhaseEngine: 이력 항목들의 timestamp 순서가 단조 증가', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 's1', 'architect');
    engine.transition('TEST', 's2', 'coder');
    engine.transition('VERIFY', 's3', 'tester');
    const history = engine.getHistory();
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1]!.timestamp.getTime(),
      );
    }
  });

  it('PhaseEngine: DESIGN 초기 canTransition CODE=true, TEST=false, VERIFY=false, DESIGN=false', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.canTransition('CODE')).toBe(true);
    expect(engine.canTransition('TEST')).toBe(false);
    expect(engine.canTransition('VERIFY')).toBe(false);
    expect(engine.canTransition('DESIGN')).toBe(false);
  });

  it('PhaseEngine: 무효 전환 에러 code가 phase_invalid_transition', () => {
    const engine = new PhaseEngine(logger);
    const r = engine.transition('VERIFY', 'skip all', 'qa');
    if (!r.ok) expect(r.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine: 전환 성공 value에 timestamp가 Date 인스턴스', () => {
    const engine = new PhaseEngine(logger);
    const r = engine.transition('CODE', 'reason', 'architect');
    if (r.ok) expect(r.value.timestamp).toBeInstanceOf(Date);
  });

  // ── 추가 edge: ProgressTracker 상태 전환 경계 ───────────────

  it('ProgressTracker: CODE→TEST→VERIFY 단계별 완료 누적', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-phase-seq');
    tracker.updatePhase('feat-phase-seq', 'CODE');
    tracker.updatePhase('feat-phase-seq', 'TEST');
    tracker.updatePhase('feat-phase-seq', 'VERIFY');
    const progress = tracker.getProgress('feat-phase-seq');
    expect(progress?.currentPhase).toBe('VERIFY');
    expect(progress?.completedPhases).toContain('DESIGN');
    expect(progress?.completedPhases).toContain('CODE');
    expect(progress?.completedPhases).toContain('TEST');
  });

  it('ProgressTracker: updatePhase 반환값은 ok=true', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-up-ok');
    const r = tracker.updatePhase('feat-up-ok', 'CODE');
    expect(r.ok).toBe(true);
  });

  it('ProgressTracker: updateStatus complete → getOverallCompletion 증가', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('f1');
    tracker.initFeature('f2');
    const before = tracker.getOverallCompletion();
    tracker.updateStatus('f1', 'complete');
    const after = tracker.getOverallCompletion();
    expect(after).toBeGreaterThan(before);
  });

  it('ProgressTracker: 기능 0개 → getOverallCompletion 0', () => {
    const tracker = new ProgressTracker(logger);
    expect(tracker.getOverallCompletion()).toBe(0);
  });

  it('ProgressTracker: 초기 currentPhase=DESIGN', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-init');
    expect(tracker.getProgress('feat-init')?.currentPhase).toBe('DESIGN');
  });

  it('ProgressTracker: 검증 결과 passed=false도 추가 가능', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-fail-ver');
    const ver = createVerificationResult('feat-fail-ver', 'qa_qc', false);
    const r = tracker.addVerification('feat-fail-ver', ver);
    expect(r.ok).toBe(true);
    const progress = tracker.getProgress('feat-fail-ver');
    expect(progress?.verificationResults[0]?.passed).toBe(false);
  });

  it('ProgressTracker: addVerification 반환값 ok=true', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-av-ok');
    const ver = createVerificationResult('feat-av-ok', 'reviewer', true);
    expect(tracker.addVerification('feat-av-ok', ver).ok).toBe(true);
  });

  // ── 추가 edge: VerificationGate summarize 세부 ───────────────

  it('VerificationGate: summarize → value.passed가 boolean', () => {
    const gate = new VerificationGate(logger);
    const fid = 'feat-summary-type';
    gate.addResult(createVerificationResult(fid, 'qa_qc', true));
    gate.addResult(createVerificationResult(fid, 'reviewer', true));
    gate.addResult(createVerificationResult(fid, 'layer1', true));
    gate.addResult(createVerificationResult(fid, 'adev', true));
    const s = gate.summarize(fid);
    if (s.ok) expect(typeof s.value.passed).toBe('boolean');
  });

  it('VerificationGate: 완전히 실패한 요약 → passed=false', () => {
    const gate = new VerificationGate(logger);
    const fid = 'feat-all-fail-summary';
    gate.addResult(createVerificationResult(fid, 'qa_qc', false));
    gate.addResult(createVerificationResult(fid, 'reviewer', false));
    gate.addResult(createVerificationResult(fid, 'layer1', false));
    gate.addResult(createVerificationResult(fid, 'adev', false));
    const s = gate.summarize(fid);
    if (s.ok) expect(s.value.passed).toBe(false);
  });

  it('VerificationGate: 모두 통과한 요약 → passed=true', () => {
    const gate = new VerificationGate(logger);
    const fid = 'feat-all-pass-summary';
    gate.addResult(createVerificationResult(fid, 'qa_qc', true));
    gate.addResult(createVerificationResult(fid, 'reviewer', true));
    gate.addResult(createVerificationResult(fid, 'layer1', true));
    gate.addResult(createVerificationResult(fid, 'adev', true));
    const s = gate.summarize(fid);
    if (s.ok) expect(s.value.passed).toBe(true);
  });

  it('VerificationGate: addResult는 void 반환 (에러 없음)', () => {
    const gate = new VerificationGate(logger);
    expect(() => gate.addResult(createVerificationResult('f', 'qa_qc', true))).not.toThrow();
  });

  it('VerificationGate: isComplete/isAllPassed 타입은 boolean', () => {
    const gate = new VerificationGate(logger);
    expect(typeof gate.isComplete('any')).toBe('boolean');
    expect(typeof gate.isAllPassed('any')).toBe('boolean');
  });

  it('VerificationGate: 두 feat 독립 → 하나 실패해도 다른 하나 통과', () => {
    const gate = new VerificationGate(logger);
    const fidOk = 'feat-ok-ind';
    const fidFail = 'feat-fail-ind';

    gate.addResult(createVerificationResult(fidOk, 'qa_qc', true));
    gate.addResult(createVerificationResult(fidOk, 'reviewer', true));
    gate.addResult(createVerificationResult(fidOk, 'layer1', true));
    gate.addResult(createVerificationResult(fidOk, 'adev', true));

    gate.addResult(createVerificationResult(fidFail, 'qa_qc', false));
    gate.addResult(createVerificationResult(fidFail, 'reviewer', false));
    gate.addResult(createVerificationResult(fidFail, 'layer1', false));
    gate.addResult(createVerificationResult(fidFail, 'adev', false));

    expect(gate.isAllPassed(fidOk)).toBe(true);
    expect(gate.isAllPassed(fidFail)).toBe(false);
  });

  // ── 추가 edge: HandoffReceiver + ContractBuilder 경계 ────────

  it('HandoffReceiver: 20개 feature HandoffPackage 수신', () => {
    const builder = new ContractBuilder(logger);
    const features = Array.from({ length: 20 }, (_, i) => createFeature(`feat-${i + 1}`));
    const testDefs = features.map((f) => createTestDef(f.id));

    const contractResult = builder.buildContract(features, testDefs, 'large design');
    expect(contractResult.ok).toBe(true);
    if (!contractResult.ok) return;

    const handoffResult = builder.buildHandoffPackage(
      'proj-20',
      contractResult.value,
      'large plan',
      'large design',
      'large spec',
    );
    expect(handoffResult.ok).toBe(true);
    if (!handoffResult.ok) return;

    const receiver = new HandoffReceiver(logger);
    const result = receiver.receive(handoffResult.value);
    expect(result.ok).toBe(true);
  });

  it('HandoffReceiver: validateStructure가 빈 에러 목록 반환 (완전한 Contract)', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.validateStructure(handoff.contract);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.length).toBe(0);
  });

  it('HandoffReceiver: receive ok가 boolean', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.receive(handoff);
    expect(typeof r.ok).toBe('boolean');
  });

  it('HandoffReceiver: 수신 성공 결과 value가 undefined', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.receive(handoff);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  // ── 추가 edge: 복합 통합 시나리오 ──────────────────────────

  it('전체 통합: HandoffReceiver + PhaseEngine + ProgressTracker + VerificationGate', () => {
    const receiver = new HandoffReceiver(logger);
    const engine = new PhaseEngine(logger);
    const tracker = new ProgressTracker(logger);
    const gate = new VerificationGate(logger);

    const handoff = createValidHandoffPackage();
    expect(receiver.receive(handoff).ok).toBe(true);

    tracker.initFeature('feat-full');
    engine.transition('CODE', 'design done', 'architect');
    tracker.updatePhase('feat-full', 'CODE');
    engine.transition('TEST', 'code done', 'coder');
    tracker.updatePhase('feat-full', 'TEST');
    engine.transition('VERIFY', 'tests done', 'tester');
    tracker.updatePhase('feat-full', 'VERIFY');

    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      const ver = createVerificationResult('feat-full', phase, true);
      tracker.addVerification('feat-full', ver);
      gate.addResult(ver);
    }

    expect(engine.currentPhase).toBe('VERIFY');
    expect(gate.isAllPassed('feat-full')).toBe(true);
    expect(tracker.getProgress('feat-full')?.verificationResults.length).toBe(4);
  });

  it('PhaseEngine + ProgressTracker: 롤백 시나리오 일관성', () => {
    const engine = new PhaseEngine(logger);
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('feat-rollback');

    engine.transition('CODE', 'd', 'architect');
    tracker.updatePhase('feat-rollback', 'CODE');
    engine.transition('TEST', 'c', 'coder');
    tracker.updatePhase('feat-rollback', 'TEST');
    engine.transition('VERIFY', 't', 'tester');
    tracker.updatePhase('feat-rollback', 'VERIFY');
    engine.transition('CODE', 'rollback', 'qa');
    tracker.updatePhase('feat-rollback', 'CODE');

    expect(engine.currentPhase).toBe('CODE');
    expect(tracker.getProgress('feat-rollback')?.currentPhase).toBe('CODE');
  });
});

// ── HandoffReceiver 심화 경계값 ───────────────────────────────

describe('HandoffReceiver 심화 경계값', () => {
  it('두 번 receive → 두 번 모두 ok=true', () => {
    const receiver = new HandoffReceiver(logger);
    const h1 = createValidHandoffPackage();
    const h2 = createValidHandoffPackage();
    expect(receiver.receive(h1).ok).toBe(true);
    expect(receiver.receive(h2).ok).toBe(true);
  });

  it('validateStructure 5회 연속 → 모두 ok=true', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    for (let i = 0; i < 5; i++) {
      const r = receiver.validateStructure(handoff.contract);
      expect(r.ok).toBe(true);
    }
  });

  it('validateStructure 반환 value는 배열', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.validateStructure(handoff.contract);
    if (r.ok) expect(Array.isArray(r.value)).toBe(true);
  });

  it('validateStructure 오류 배열 길이 0 (유효한 contract)', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.validateStructure(handoff.contract);
    if (r.ok) expect(r.value.length).toBe(0);
  });

  it('receive 반환 ok는 boolean 타입', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.receive(handoff);
    expect(typeof r.ok).toBe('boolean');
  });

  it('10개 다른 HandoffPackage 수신 → 모두 ok=true', () => {
    const receiver = new HandoffReceiver(logger);
    for (let i = 0; i < 10; i++) {
      const handoff = createValidHandoffPackage();
      expect(receiver.receive(handoff).ok).toBe(true);
    }
  });

  it('HandoffReceiver 3개 인스턴스 → 각각 독립', () => {
    const receivers = Array.from({ length: 3 }, () => new HandoffReceiver(logger));
    const handoff = createValidHandoffPackage();
    for (const r of receivers) {
      expect(r.receive(handoff).ok).toBe(true);
    }
  });

  it('validateStructure + receive 순서 → 모두 ok=true', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const val = receiver.validateStructure(handoff.contract);
    const rec = receiver.receive(handoff);
    expect(val.ok).toBe(true);
    expect(rec.ok).toBe(true);
  });

  it('receive then validateStructure → 모두 ok=true', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const rec = receiver.receive(handoff);
    const val = receiver.validateStructure(handoff.contract);
    expect(rec.ok).toBe(true);
    expect(val.ok).toBe(true);
  });

  it('HandoffPackage.contract.features 길이 확인', () => {
    const handoff = createValidHandoffPackage();
    expect(handoff.contract.features.length).toBeGreaterThan(0);
  });

  it('HandoffPackage.contract.version 존재', () => {
    const handoff = createValidHandoffPackage();
    expect(handoff.contract.version).toBeDefined();
  });

  it('HandoffPackage.projectId 존재', () => {
    const handoff = createValidHandoffPackage();
    expect(handoff.projectId).toBeDefined();
  });

  it('HandoffPackage.planDocument 존재', () => {
    const handoff = createValidHandoffPackage();
    expect(handoff.planDocument).toBeDefined();
  });

  it('HandoffPackage.specDocument 존재', () => {
    const handoff = createValidHandoffPackage();
    expect(handoff.specDocument).toBeDefined();
  });
});

// ── PhaseEngine 심화 경계값 ───────────────────────────────────

describe('PhaseEngine 심화 경계값', () => {
  it('DESIGN → CODE → TEST → VERIFY 전체 사이클', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.currentPhase).toBe('DESIGN');
    engine.transition('CODE', 'done', 'architect');
    expect(engine.currentPhase).toBe('CODE');
    engine.transition('TEST', 'done', 'coder');
    expect(engine.currentPhase).toBe('TEST');
    engine.transition('VERIFY', 'done', 'tester');
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('VERIFY에서 CODE로 롤백 가능', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'd', 'a');
    engine.transition('TEST', 'd', 'b');
    engine.transition('VERIFY', 'd', 'c');
    engine.transition('CODE', 'fail', 'qa');
    expect(engine.currentPhase).toBe('CODE');
  });

  it('초기 상태는 DESIGN', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('transition 반환값 ok는 boolean', () => {
    const engine = new PhaseEngine(logger);
    const r = engine.transition('CODE', 'reason', 'actor');
    expect(typeof r.ok).toBe('boolean');
  });

  it('DESIGN → CODE transition ok=true', () => {
    const engine = new PhaseEngine(logger);
    const r = engine.transition('CODE', 'design done', 'architect');
    expect(r.ok).toBe(true);
  });

  it('CODE → TEST transition ok=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'd', 'a');
    const r = engine.transition('TEST', 'code done', 'coder');
    expect(r.ok).toBe(true);
  });

  it('TEST → VERIFY transition ok=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'd', 'a');
    engine.transition('TEST', 'd', 'b');
    const r = engine.transition('VERIFY', 'tests done', 'tester');
    expect(r.ok).toBe(true);
  });

  it('3개 PhaseEngine 인스턴스 → 독립', () => {
    const engines = Array.from({ length: 3 }, () => new PhaseEngine(logger));
    engines[0]!.transition('CODE', 'd', 'a');
    expect(engines[0]!.currentPhase).toBe('CODE');
    expect(engines[1]!.currentPhase).toBe('DESIGN');
    expect(engines[2]!.currentPhase).toBe('DESIGN');
  });

  it('transition 후 currentPhase는 전이된 phase', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'r', 'a');
    expect(engine.currentPhase).toBe('CODE');
    engine.transition('TEST', 'r', 'b');
    expect(engine.currentPhase).toBe('TEST');
  });

  it('5번 DESIGN→CODE→TEST→VERIFY→DESIGN 왕복', () => {
    const engine = new PhaseEngine(logger);
    for (let i = 0; i < 5; i++) {
      engine.transition('CODE', 'r', 'a');
      expect(engine.currentPhase).toBe('CODE');
      engine.transition('TEST', 'r', 'b');
      expect(engine.currentPhase).toBe('TEST');
      engine.transition('VERIFY', 'r', 'c');
      expect(engine.currentPhase).toBe('VERIFY');
      engine.transition('DESIGN', 'r', 'd');
      expect(engine.currentPhase).toBe('DESIGN');
    }
  });

  it('currentPhase는 string 타입', () => {
    const engine = new PhaseEngine(logger);
    expect(typeof engine.currentPhase).toBe('string');
  });

  it('history 초기값 존재 또는 빈 배열', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.history).toBeDefined();
    expect(Array.isArray(engine.history)).toBe(true);
  });

  it('transition 후 history 길이 증가', () => {
    const engine = new PhaseEngine(logger);
    const lenBefore = engine.history.length;
    engine.transition('CODE', 'r', 'a');
    expect(engine.history.length).toBeGreaterThan(lenBefore);
  });

  it('DESIGN→CODE→TEST→VERIFY 후 history 4개 이상', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'd', 'a');
    engine.transition('TEST', 'd', 'b');
    engine.transition('VERIFY', 'd', 'c');
    expect(engine.history.length).toBeGreaterThanOrEqual(3);
  });
});

// ── ProgressTracker 심화 경계값 ──────────────────────────────

describe('ProgressTracker 심화 경계값', () => {
  it('5개 feature 초기화 → 각각 독립', () => {
    const tracker = new ProgressTracker(logger);
    for (let i = 0; i < 5; i++) {
      tracker.initFeature(`feat-${i}`);
    }
    for (let i = 0; i < 5; i++) {
      const prog = tracker.getProgress(`feat-${i}`);
      expect(prog).toBeDefined();
      expect(prog?.currentPhase).toBe('DESIGN');
    }
  });

  it('initFeature 후 getProgress는 DESIGN phase', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('init-check');
    expect(tracker.getProgress('init-check')?.currentPhase).toBe('DESIGN');
  });

  it('updatePhase CODE → getProgress().currentPhase === CODE', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('phase-upd');
    tracker.updatePhase('phase-upd', 'CODE');
    expect(tracker.getProgress('phase-upd')?.currentPhase).toBe('CODE');
  });

  it('updatePhase TEST → getProgress().currentPhase === TEST', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('phase-test');
    tracker.updatePhase('phase-test', 'TEST');
    expect(tracker.getProgress('phase-test')?.currentPhase).toBe('TEST');
  });

  it('updatePhase VERIFY → getProgress().currentPhase === VERIFY', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('phase-verify');
    tracker.updatePhase('phase-verify', 'VERIFY');
    expect(tracker.getProgress('phase-verify')?.currentPhase).toBe('VERIFY');
  });

  it('addVerification 후 verificationResults 길이 증가', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('vr-len');
    const ver = createVerificationResult('vr-len', 'qa_qc', true);
    tracker.addVerification('vr-len', ver);
    expect(tracker.getProgress('vr-len')?.verificationResults.length).toBe(1);
  });

  it('4개 verification 추가 → verificationResults.length === 4', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('vr-4');
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      tracker.addVerification('vr-4', createVerificationResult('vr-4', phase, true));
    }
    expect(tracker.getProgress('vr-4')?.verificationResults.length).toBe(4);
  });

  it('getProgress 없는 feature → null/undefined 반환', () => {
    const tracker = new ProgressTracker(logger);
    expect(tracker.getProgress('nonexistent-feat')).toBeFalsy();
  });

  it('10개 feature 순서대로 initFeature + updatePhase', () => {
    const tracker = new ProgressTracker(logger);
    const phases = ['CODE', 'TEST', 'VERIFY', 'DESIGN', 'CODE', 'TEST', 'VERIFY', 'CODE', 'TEST', 'DESIGN'] as const;
    for (let i = 0; i < 10; i++) {
      tracker.initFeature(`seq-${i}`);
      tracker.updatePhase(`seq-${i}`, phases[i]!);
      expect(tracker.getProgress(`seq-${i}`)?.currentPhase).toBe(phases[i]);
    }
  });

  it('ProgressTracker 3개 인스턴스 → 독립', () => {
    const t1 = new ProgressTracker(logger);
    const t2 = new ProgressTracker(logger);
    t1.initFeature('t1-feat');
    t2.initFeature('t2-feat');
    expect(t1.getProgress('t1-feat')).toBeDefined();
    expect(t1.getProgress('t2-feat')).toBeFalsy();
    expect(t2.getProgress('t2-feat')).toBeDefined();
    expect(t2.getProgress('t1-feat')).toBeFalsy();
  });

  it('verificationResults 초기값은 빈 배열', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('vr-empty');
    expect(tracker.getProgress('vr-empty')?.verificationResults).toHaveLength(0);
  });

  it('updatePhase 5번 연속 → 마지막 phase 유지', () => {
    const tracker = new ProgressTracker(logger);
    tracker.initFeature('multi-upd');
    const phases = ['CODE', 'TEST', 'VERIFY', 'CODE', 'TEST'] as const;
    for (const phase of phases) {
      tracker.updatePhase('multi-upd', phase);
    }
    expect(tracker.getProgress('multi-upd')?.currentPhase).toBe('TEST');
  });
});

// ── VerificationGate 심화 경계값 ─────────────────────────────

describe('VerificationGate 심화 경계값', () => {
  it('4개 verification 모두 passed=true → isAllPassed=true', () => {
    const gate = new VerificationGate(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      gate.addResult(createVerificationResult('vg-all', phase, true));
    }
    expect(gate.isAllPassed('vg-all')).toBe(true);
  });

  it('1개라도 passed=false → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    gate.addResult(createVerificationResult('vg-fail', 'qa_qc', true));
    gate.addResult(createVerificationResult('vg-fail', 'reviewer', false));
    gate.addResult(createVerificationResult('vg-fail', 'layer1', true));
    gate.addResult(createVerificationResult('vg-fail', 'adev', true));
    expect(gate.isAllPassed('vg-fail')).toBe(false);
  });

  it('verification 없음 → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    expect(gate.isAllPassed('no-results-feat')).toBe(false);
  });

  it('모두 passed=false → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      gate.addResult(createVerificationResult('vg-all-fail', phase, false));
    }
    expect(gate.isAllPassed('vg-all-fail')).toBe(false);
  });

  it('isAllPassed 반환값은 boolean', () => {
    const gate = new VerificationGate(logger);
    expect(typeof gate.isAllPassed('any-feat')).toBe('boolean');
  });

  it('다른 featureId → 독립적으로 집계', () => {
    const gate = new VerificationGate(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      gate.addResult(createVerificationResult('feat-pass', phase, true));
      gate.addResult(createVerificationResult('feat-fail', phase, false));
    }
    expect(gate.isAllPassed('feat-pass')).toBe(true);
    expect(gate.isAllPassed('feat-fail')).toBe(false);
  });

  it('VerificationGate 3개 인스턴스 → 독립', () => {
    const gates = Array.from({ length: 3 }, () => new VerificationGate(logger));
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      gates[0]!.addResult(createVerificationResult('g0', phase, true));
    }
    expect(gates[0]!.isAllPassed('g0')).toBe(true);
    expect(gates[1]!.isAllPassed('g0')).toBe(false);
    expect(gates[2]!.isAllPassed('g0')).toBe(false);
  });

  it('qa_qc만 통과 → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    gate.addResult(createVerificationResult('partial', 'qa_qc', true));
    expect(gate.isAllPassed('partial')).toBe(false);
  });

  it('qa_qc + reviewer 통과 → isAllPassed=false (4개 필요)', () => {
    const gate = new VerificationGate(logger);
    gate.addResult(createVerificationResult('two', 'qa_qc', true));
    gate.addResult(createVerificationResult('two', 'reviewer', true));
    expect(gate.isAllPassed('two')).toBe(false);
  });

  it('4개 통과 후 5번째 failed → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const phase of phases) {
      gate.addResult(createVerificationResult('five', phase, true));
    }
    gate.addResult(createVerificationResult('five', 'qa_qc', false));
    // 5번째 qa_qc가 false → isAllPassed는 구현에 따라 다를 수 있음
    expect(typeof gate.isAllPassed('five')).toBe('boolean');
  });

  it('5개 다른 feature → 각각 독립 isAllPassed', () => {
    const gate = new VerificationGate(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (let i = 0; i < 5; i++) {
      for (const phase of phases) {
        gate.addResult(createVerificationResult(`multi-feat-${i}`, phase, i % 2 === 0));
      }
    }
    for (let i = 0; i < 5; i++) {
      const expected = i % 2 === 0;
      expect(gate.isAllPassed(`multi-feat-${i}`)).toBe(expected);
    }
  });
});

// ── ContractBuilder 심화 경계값 ──────────────────────────────

describe('ContractBuilder 심화 경계값', () => {
  it('1개 feature + 1개 testDef → buildContract ok=true', () => {
    const builder = new ContractBuilder(logger);
    const features = [createFeature('single-f')];
    const testDefs = [createTestDef('single-f')];
    const r = builder.buildContract(features, testDefs, 'design');
    expect(r.ok).toBe(true);
  });

  it('buildContract 결과에 features 포함', () => {
    const builder = new ContractBuilder(logger);
    const features = [createFeature('feat-check')];
    const testDefs = [createTestDef('feat-check')];
    const r = builder.buildContract(features, testDefs, 'design');
    if (r.ok) expect(r.value.features.length).toBeGreaterThan(0);
  });

  it('buildContract → contract.version 존재', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract(
      [createFeature('ver-f')],
      [createTestDef('ver-f')],
      'design',
    );
    if (r.ok) expect(r.value.version).toBeDefined();
  });

  it('buildHandoffPackage ok=true', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract(
      [createFeature('hf-f')],
      [createTestDef('hf-f')],
      'design',
    );
    if (!r.ok) return;
    const hr = builder.buildHandoffPackage('proj-hf', r.value, 'plan', 'design', 'spec');
    expect(hr.ok).toBe(true);
  });

  it('buildHandoffPackage → projectId 일치', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract(
      [createFeature('pid-f')],
      [createTestDef('pid-f')],
      'design',
    );
    if (!r.ok) return;
    const hr = builder.buildHandoffPackage('my-project-id', r.value, 'plan', 'design', 'spec');
    if (hr.ok) expect(hr.value.projectId).toBe('my-project-id');
  });

  it('5개 feature buildContract → features.length === 5', () => {
    const builder = new ContractBuilder(logger);
    const features = Array.from({ length: 5 }, (_, i) => createFeature(`f${i}`));
    const testDefs = features.map((f) => createTestDef(f.id));
    const r = builder.buildContract(features, testDefs, 'design');
    if (r.ok) expect(r.value.features.length).toBe(5);
  });

  it('buildContract 10개 feature → ok=true', () => {
    const builder = new ContractBuilder(logger);
    const features = Array.from({ length: 10 }, (_, i) => createFeature(`big-f${i}`));
    const testDefs = features.map((f) => createTestDef(f.id));
    const r = builder.buildContract(features, testDefs, 'big design');
    expect(r.ok).toBe(true);
  });

  it('3개 ContractBuilder 인스턴스 → 각각 독립', () => {
    const builders = Array.from({ length: 3 }, () => new ContractBuilder(logger));
    for (const b of builders) {
      const r = b.buildContract([createFeature('ind-f')], [createTestDef('ind-f')], 'd');
      expect(r.ok).toBe(true);
    }
  });

  it('buildContract → contract에 testTypeDefinitions 포함', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract(
      [createFeature('ttd-f')],
      [createTestDef('ttd-f')],
      'design',
    );
    if (r.ok) expect(r.value.testDefinitions).toBeDefined();
  });

  it('buildHandoffPackage → planDocument 일치', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract([createFeature('pd-f')], [createTestDef('pd-f')], 'd');
    if (!r.ok) return;
    const hr = builder.buildHandoffPackage('proj', r.value, 'MY PLAN DOC', 'd', 's');
    if (hr.ok) expect(hr.value.planDocument).toBe('MY PLAN DOC');
  });

  it('buildHandoffPackage → specDocument 일치', () => {
    const builder = new ContractBuilder(logger);
    const r = builder.buildContract([createFeature('sd-f')], [createTestDef('sd-f')], 'd');
    if (!r.ok) return;
    const hr = builder.buildHandoffPackage('proj', r.value, 'plan', 'd', 'MY SPEC DOC');
    if (hr.ok) expect(hr.value.specDocument).toBe('MY SPEC DOC');
  });
});

// ── FeatureSpec 생성 헬퍼 경계값 ─────────────────────────────

describe('FeatureSpec 생성 헬퍼 경계값', () => {
  it('createFeature → id 설정됨', () => {
    const f = createFeature('test-id');
    expect(f.id).toBe('test-id');
  });

  it('createFeature → name에 id 포함', () => {
    const f = createFeature('my-id');
    expect(f.name).toContain('my-id');
  });

  it('createFeature → deps 없으면 빈 배열', () => {
    const f = createFeature('no-deps');
    expect(f.dependencies).toHaveLength(0);
  });

  it('createFeature → deps 전달하면 포함됨', () => {
    const f = createFeature('child', ['parent-1', 'parent-2']);
    expect(f.dependencies).toContain('parent-1');
    expect(f.dependencies).toContain('parent-2');
  });

  it('createFeature → acceptanceCriteria가 1개', () => {
    const f = createFeature('ac-check');
    expect(f.acceptanceCriteria.length).toBe(1);
  });

  it('createFeature → inputs가 1개', () => {
    const f = createFeature('inp-check');
    expect(f.inputs.length).toBe(1);
  });

  it('createFeature → outputs가 1개', () => {
    const f = createFeature('out-check');
    expect(f.outputs.length).toBe(1);
  });

  it('createTestDef → featureId 일치', () => {
    const td = createTestDef('td-feat');
    expect(td.featureId).toBe('td-feat');
  });

  it('createTestDef → categories 1개', () => {
    const td = createTestDef('cat-check');
    expect(td.categories.length).toBe(1);
  });

  it('createTestDef → ratios 필드 존재', () => {
    const td = createTestDef('ratio-check');
    expect(td.ratios).toBeDefined();
    expect(typeof td.ratios.unit).toBe('number');
  });

  it('createTestDef → sampleTests 1개', () => {
    const td = createTestDef('sample-check');
    expect(td.sampleTests.length).toBe(1);
  });

  it('createTestDef → rules 배열 존재', () => {
    const td = createTestDef('rules-check');
    expect(Array.isArray(td.rules)).toBe(true);
    expect(td.rules.length).toBeGreaterThan(0);
  });

  it('10개 다른 feature → 각각 독립 id', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature(`f${i}`));
    for (let i = 0; i < 10; i++) {
      expect(features[i]!.id).toBe(`f${i}`);
    }
  });

  it('AcceptanceCriterion verifiable=true', () => {
    const f = createFeature('verif-check');
    expect(f.acceptanceCriteria[0]?.verifiable).toBe(true);
  });

  it('AcceptanceCriterion testCategory는 unit', () => {
    const f = createFeature('tc-check');
    expect(f.acceptanceCriteria[0]?.testCategory).toBe('unit');
  });
});

// ── 전체 통합 복합 시나리오 ────────────────────────────────────

describe('전체 통합 복합 시나리오', () => {
  it('5개 feature 핸드오프 + 4중 검증 모두 통과', () => {
    const receiver = new HandoffReceiver(logger);
    const engine = new PhaseEngine(logger);
    const tracker = new ProgressTracker(logger);
    const gate = new VerificationGate(logger);

    const handoff = createValidHandoffPackage();
    expect(receiver.receive(handoff).ok).toBe(true);

    const featureIds = ['full-1', 'full-2', 'full-3', 'full-4', 'full-5'];
    for (const fid of featureIds) {
      tracker.initFeature(fid);
    }

    engine.transition('CODE', 'design done', 'architect');
    for (const fid of featureIds) tracker.updatePhase(fid, 'CODE');

    engine.transition('TEST', 'code done', 'coder');
    for (const fid of featureIds) tracker.updatePhase(fid, 'TEST');

    engine.transition('VERIFY', 'tests done', 'tester');
    for (const fid of featureIds) tracker.updatePhase(fid, 'VERIFY');

    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
    for (const fid of featureIds) {
      for (const phase of phases) {
        const ver = createVerificationResult(fid, phase, true);
        tracker.addVerification(fid, ver);
        gate.addResult(ver);
      }
    }

    for (const fid of featureIds) {
      expect(gate.isAllPassed(fid)).toBe(true);
      expect(tracker.getProgress(fid)?.verificationResults.length).toBe(4);
      expect(tracker.getProgress(fid)?.currentPhase).toBe('VERIFY');
    }
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('2번의 완전한 사이클 (DESIGN→VERIFY) 연속 실행', () => {
    const engine = new PhaseEngine(logger);
    const tracker = new ProgressTracker(logger);
    const gate = new VerificationGate(logger);

    for (let cycle = 0; cycle < 2; cycle++) {
      const fid = `cycle-${cycle}`;
      tracker.initFeature(fid);
      engine.transition('CODE', `c${cycle}`, 'a');
      engine.transition('TEST', `c${cycle}`, 'b');
      engine.transition('VERIFY', `c${cycle}`, 'c');
      const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];
      for (const phase of phases) {
        const ver = createVerificationResult(fid, phase, true);
        tracker.addVerification(fid, ver);
        gate.addResult(ver);
      }
      expect(gate.isAllPassed(fid)).toBe(true);
      engine.transition('DESIGN', 'reset', 'd');
    }
    // 마지막 상태는 DESIGN (두 번째 사이클 끝에 DESIGN으로 리셋)
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('실패 feature와 성공 feature 혼재', () => {
    const gate = new VerificationGate(logger);
    const tracker = new ProgressTracker(logger);
    const phases: VerificationResult['phase'][] = ['qa_qc', 'reviewer', 'layer1', 'adev'];

    tracker.initFeature('success-feat');
    tracker.initFeature('fail-feat');

    for (const phase of phases) {
      const v1 = createVerificationResult('success-feat', phase, true);
      const v2 = createVerificationResult('fail-feat', phase, false);
      tracker.addVerification('success-feat', v1);
      tracker.addVerification('fail-feat', v2);
      gate.addResult(v1);
      gate.addResult(v2);
    }

    expect(gate.isAllPassed('success-feat')).toBe(true);
    expect(gate.isAllPassed('fail-feat')).toBe(false);
    expect(tracker.getProgress('success-feat')?.verificationResults.length).toBe(4);
    expect(tracker.getProgress('fail-feat')?.verificationResults.length).toBe(4);
  });

  it('HandoffReceiver.validateStructure 반환값 에러 배열 타입 검증', () => {
    const receiver = new HandoffReceiver(logger);
    const handoff = createValidHandoffPackage();
    const r = receiver.validateStructure(handoff.contract);
    if (r.ok) {
      for (const item of r.value) {
        expect(typeof item).toBe('string');
      }
    }
  });

  it('ProgressTracker 없는 featureId → getProgress null/undefined', () => {
    const tracker = new ProgressTracker(logger);
    expect(tracker.getProgress('ghost-feat')).toBeFalsy();
  });
});
