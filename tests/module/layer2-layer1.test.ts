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
import { ConsoleLogger } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import { ContractBuilder } from '../../src/layer1/index.js';
import type {
  AcceptanceCriterion,
  FeatureSpec,
  HandoffPackage,
  TestTypeDefinition,
} from '../../src/layer1/types.js';
import {
  HandoffReceiver,
  PhaseEngine,
  ProgressTracker,
  VerificationGate,
} from '../../src/layer2/index.js';
import type { VerificationResult } from '../../src/layer2/types.js';

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
});
