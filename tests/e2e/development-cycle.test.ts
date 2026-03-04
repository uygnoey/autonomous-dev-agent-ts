/**
 * E2E: 개발 사이클 (Phase FSM) / Development Cycle
 *
 * @description
 * KR: PhaseEngine 초기화 → AgentGenerator → Phase 전환 → CoderAllocator →
 *     IntegrationTester → VerificationGate 4중 검증 → FailureHandler 롤백 시나리오.
 * EN: Full layer2 phase cycle from DESIGN through VERIFY with rollback scenarios.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../src/core/logger.js';
import { PhaseEngine } from '../../src/layer2/phase-engine.js';
import { AgentGenerator } from '../../src/layer2/agent-generator.js';
import { CoderAllocator } from '../../src/layer2/coder-allocator.js';
import { IntegrationTester } from '../../src/layer2/integration-tester.js';
import { VerificationGate } from '../../src/layer2/verification-gate.js';
import { FailureHandler } from '../../src/layer2/failure-handler.js';
import type { AgentName } from '../../src/core/types.js';
import type { VerificationResult } from '../../src/layer2/types.js';

const logger = new ConsoleLogger('error');

describe('개발 사이클 E2E / Development Cycle E2E', () => {
  it('PhaseEngine: 초기 상태는 DESIGN', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('PhaseEngine: DESIGN → CODE → TEST → VERIFY 순방향 전환', () => {
    const engine = new PhaseEngine(logger);

    const toCode = engine.transition('CODE', 'DESIGN 완료', 'architect');
    expect(toCode.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');

    const toTest = engine.transition('TEST', 'CODE 완료', 'coder');
    expect(toTest.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');

    const toVerify = engine.transition('VERIFY', 'TEST 완료', 'tester');
    expect(toVerify.ok).toBe(true);
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('PhaseEngine: 잘못된 전환 거부 (DESIGN → TEST 직접 불가)', () => {
    const engine = new PhaseEngine(logger);

    const result = engine.transition('TEST', '건너뛰기', 'adev');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('phase_invalid_transition');
    }
  });

  it('PhaseEngine: VERIFY → DESIGN 롤백 가능', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');

    const rollback = engine.transition('DESIGN', '검증 실패 — 설계 재검토', 'adev');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('PhaseEngine: 전환 이력 추적', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'r1', 'architect');
    engine.transition('TEST', 'r2', 'coder');

    const history = engine.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.from).toBe('DESIGN');
    expect(history[0]?.to).toBe('CODE');
    expect(history[1]?.from).toBe('CODE');
    expect(history[1]?.to).toBe('TEST');
  });

  it('AgentGenerator: 7개 에이전트 설정 생성', () => {
    const generator = new AgentGenerator(logger);
    const agentNames: AgentName[] = [
      'architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter',
    ];

    for (const name of agentNames) {
      const result = generator.generateAgentConfig(name, 'Test spec', 'feat-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe(name);
        expect(result.value.tools.length).toBeGreaterThan(0);
        expect(result.value.systemPrompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('AgentGenerator: coder만 Write/Edit/Bash 도구 보유', () => {
    const generator = new AgentGenerator(logger);

    const coderResult = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    expect(coderResult.ok).toBe(true);
    if (coderResult.ok) {
      expect(coderResult.value.tools).toContain('Write');
      expect(coderResult.value.tools).toContain('Edit');
      expect(coderResult.value.tools).toContain('Bash');
    }

    const qaResult = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    expect(qaResult.ok).toBe(true);
    if (qaResult.ok) {
      expect(qaResult.value.tools).not.toContain('Write');
      expect(qaResult.value.tools).not.toContain('Edit');
    }
  });

  it('CoderAllocator: 모듈 분배 + 브랜치 이름 생성', () => {
    const allocator = new CoderAllocator(logger);

    const result = allocator.allocate('feat-1', ['auth', 'user', 'db']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
      for (const alloc of result.value) {
        expect(alloc.branchName).toContain('feature/feat-1');
        expect(alloc.status).toBe('assigned');
      }
    }
  });

  it('CoderAllocator: 모듈 충돌 방지', () => {
    const allocator = new CoderAllocator(logger);

    allocator.allocate('feat-1', ['auth']);
    const result = allocator.allocate('feat-2', ['auth']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_conflict');
    }
  });

  it('IntegrationTester: Step 1→4 순차 실행', () => {
    const tester = new IntegrationTester(logger);

    const s1 = tester.runStep(1, 'feat-1');
    expect(s1.ok).toBe(true);
    if (s1.ok) expect(s1.value.passed).toBe(true);

    const s2 = tester.runStep(2, 'feat-1');
    expect(s2.ok).toBe(true);

    const s3 = tester.runStep(3, 'feat-1');
    expect(s3.ok).toBe(true);

    const s4 = tester.runStep(4, 'feat-1');
    expect(s4.ok).toBe(true);

    expect(tester.getResults()).toHaveLength(4);
    expect(tester.getCurrentStep()).toBe(4);
  });

  it('IntegrationTester: 단계 건너뛰기 에러', () => {
    const tester = new IntegrationTester(logger);

    const result = tester.runStep(3, 'feat-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_step_order');
    }
  });

  it('VerificationGate: 4중 검증 통과', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-1';
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;

    for (const phase of phases) {
      const result: VerificationResult = {
        featureId,
        phase,
        passed: true,
        feedback: `${phase} 통과`,
        timestamp: new Date(),
      };
      gate.addResult(result);
    }

    expect(gate.isComplete(featureId)).toBe(true);
    expect(gate.isAllPassed(featureId)).toBe(true);

    const summary = gate.summarize(featureId);
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.passed).toBe(true);
    }
  });

  it('VerificationGate: 부분 실패 시 isAllPassed = false', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-2';

    gate.addResult({ featureId, phase: 'qa_qc', passed: true, feedback: 'ok', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'reviewer', passed: false, feedback: '코드 품질 부족', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'layer1', passed: true, feedback: 'ok', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'adev', passed: true, feedback: 'ok', timestamp: new Date() });

    expect(gate.isComplete(featureId)).toBe(true);
    expect(gate.isAllPassed(featureId)).toBe(false);

    const summary = gate.summarize(featureId);
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.passed).toBe(false);
      expect(summary.value.summary).toContain('실패');
    }
  });

  it('FailureHandler: 실패 분류 + 복구 Phase 결정', () => {
    const handler = new FailureHandler(logger);

    const designResult = handler.classify('feat-1', 'VERIFY', 'architecture 결함 발견');
    expect(designResult.ok).toBe(true);
    if (designResult.ok) {
      expect(designResult.value.type).toBe('design_flaw');
      expect(handler.getRecoveryPhase(designResult.value)).toBe('DESIGN');
    }

    const bugResult = handler.classify('feat-1', 'VERIFY', 'undefined is not a function');
    expect(bugResult.ok).toBe(true);
    if (bugResult.ok) {
      expect(bugResult.value.type).toBe('implementation_bug');
      expect(handler.getRecoveryPhase(bugResult.value)).toBe('CODE');
    }

    const testResult = handler.classify('feat-1', 'VERIFY', 'test coverage 부족');
    expect(testResult.ok).toBe(true);
    if (testResult.ok) {
      expect(testResult.value.type).toBe('test_gap');
      expect(handler.getRecoveryPhase(testResult.value)).toBe('TEST');
    }
  });

  it('PhaseEngine + FailureHandler: 검증 실패 → Phase 롤백 시나리오', () => {
    const engine = new PhaseEngine(logger);
    const handler = new FailureHandler(logger);

    // DESIGN → CODE → TEST → VERIFY
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');
    expect(engine.currentPhase).toBe('VERIFY');

    // WHY: 검증 실패 → 실패 분류 → 롤백
    const failureReport = handler.classify('feat-1', 'VERIFY', 'bug in error handling');
    expect(failureReport.ok).toBe(true);
    if (!failureReport.ok) return;

    const recoveryPhase = handler.getRecoveryPhase(failureReport.value);
    const rollback = engine.transition(recoveryPhase, '검증 실패 롤백', 'adev');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe(recoveryPhase);

    const history = engine.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(4);
  });

  it('PhaseEngine: getParticipants 에이전트 매핑 확인', () => {
    const engine = new PhaseEngine(logger);

    const designParticipants = engine.getParticipants('DESIGN');
    expect(designParticipants.lead).toContain('architect');

    const codeParticipants = engine.getParticipants('CODE');
    expect(codeParticipants.lead).toContain('coder');

    const testParticipants = engine.getParticipants('TEST');
    expect(testParticipants.lead).toContain('tester');
  });
});
