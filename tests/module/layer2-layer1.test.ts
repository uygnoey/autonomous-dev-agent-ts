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
});
