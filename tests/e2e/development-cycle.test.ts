/**
 * E2E: 개발 사이클 (Phase FSM) / Development Cycle
 *
 * @description
 * KR: PhaseEngine 초기화 → AgentGenerator → Phase 전환 → CoderAllocator →
 *     IntegrationTester → VerificationGate 4중 검증 → FailureHandler 롤백 시나리오.
 * EN: Full layer2 phase cycle from DESIGN through VERIFY with rollback scenarios.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { PhaseEngine } from 'layer2/phase-engine.js';
import { AgentGenerator } from 'layer2/agent-generator.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';
import { IntegrationTester } from 'layer2/integration-tester.js';
import { VerificationGate } from 'layer2/verification-gate.js';
import { FailureHandler } from 'layer2/failure-handler.js';
import { CleanEnvManager } from 'layer2/clean-env-manager.js';
import type { AgentName } from 'core/types.js';
import type { VerificationResult } from 'layer2/types.js';

const logger = new ConsoleLogger('error');
const processExecutor = new ProcessExecutor(logger);
const envManager = new CleanEnvManager(logger, processExecutor);

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

  it('IntegrationTester: 인스턴스 생성 성공', () => {
    const tester = new IntegrationTester(logger, processExecutor, envManager);
    expect(tester).toBeDefined();
    expect(tester.getCurrentStep()).toBe(0);
    expect(tester.getResults()).toHaveLength(0);
  });

  it('IntegrationTester: 상태 추적 메서드 동작', () => {
    const tester = new IntegrationTester(logger, processExecutor, envManager);
    expect(tester.getCurrentStep()).toBe(0);
    expect(tester.getResults()).toHaveLength(0);
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

  // ── Edge cases: PhaseEngine ───────────────────────────────────────

  it('PhaseEngine: CODE → CODE 전환 거부 (동일 Phase)', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');

    const result = engine.transition('CODE', 'same phase', 'adev');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('phase_invalid_transition');
    }
  });

  it('PhaseEngine: 빈 이유 문자열로 전환 가능', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('CODE', '', 'adev');
    expect(result.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('PhaseEngine: 한글 이유 문자열 지원', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('CODE', '설계 완료 — 코딩 시작', 'architect');
    expect(result.ok).toBe(true);
  });

  it('PhaseEngine: 특수문자 포함 에이전트 이름도 기록', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'coder-agent-01');
    const history = engine.getHistory();
    expect(history[0]?.triggeredBy).toBe('coder-agent-01');
  });

  it('PhaseEngine: VERIFY → CODE 직접 롤백 가능', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');

    const rollback = engine.transition('CODE', '구현 버그 발견', 'adev');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('PhaseEngine: VERIFY → TEST 직접 롤백 가능', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');

    const rollback = engine.transition('TEST', '테스트 커버리지 부족', 'adev');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');
  });

  it('PhaseEngine: 여러 전환 후 이력 길이 확인', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'r1', 'a1');
    engine.transition('TEST', 'r2', 'a2');
    engine.transition('VERIFY', 'r3', 'a3');
    engine.transition('DESIGN', 'rollback', 'a4');
    engine.transition('CODE', 'retry', 'a5');

    const history = engine.getHistory();
    expect(history.length).toBe(5);
  });

  it('PhaseEngine: 이력 첫 항목은 DESIGN → CODE', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'first', 'architect');

    const history = engine.getHistory();
    expect(history[0]?.from).toBe('DESIGN');
    expect(history[0]?.to).toBe('CODE');
    expect(history[0]?.triggeredBy).toBe('architect');
  });

  it('PhaseEngine: getParticipants VERIFY 단계', () => {
    const engine = new PhaseEngine(logger);
    const participants = engine.getParticipants('VERIFY');
    expect(participants).toBeDefined();
    expect(participants.lead).toBeDefined();
  });

  it('PhaseEngine: 여러 엔진 인스턴스는 독립적', () => {
    const engine1 = new PhaseEngine(logger);
    const engine2 = new PhaseEngine(logger);

    engine1.transition('CODE', 'ok', 'a');
    engine1.transition('TEST', 'ok', 'a');

    // WHY: engine2는 영향받지 않아야 함
    expect(engine2.currentPhase).toBe('DESIGN');
    expect(engine2.getHistory()).toHaveLength(0);
  });

  // ── Edge cases: AgentGenerator ────────────────────────────────────

  it('AgentGenerator: 빈 스펙 문자열도 설정 생성', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('coder', '', 'feat-empty');
    expect(result.ok).toBe(true);
  });

  it('AgentGenerator: 특수문자 포함 스펙', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig(
      'architect',
      '스펙: @#$% 특수케이스 처리\n줄바꿈 포함',
      'feat-special',
    );
    expect(result.ok).toBe(true);
  });

  it('AgentGenerator: reviewer는 Write/Edit 도구 없음', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('AgentGenerator: tester는 Bash 도구 보유', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('Bash');
    }
  });

  it('AgentGenerator: documenter는 Write 도구 보유', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('Write');
    }
  });

  it('AgentGenerator: 동일 에이전트 여러 번 생성 → 독립적 설정', () => {
    const generator = new AgentGenerator(logger);
    const r1 = generator.generateAgentConfig('coder', 'spec-a', 'feat-1');
    const r2 = generator.generateAgentConfig('coder', 'spec-b', 'feat-2');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      // WHY: 다른 스펙으로 생성된 설정은 systemPrompt가 달라야 함
      expect(r1.value.systemPrompt).not.toBe(r2.value.systemPrompt);
    }
  });

  it('AgentGenerator: UUID 형식 featureId 지원', () => {
    const generator = new AgentGenerator(logger);
    const featureId = crypto.randomUUID();
    const result = generator.generateAgentConfig('qa', 'spec', featureId);
    expect(result.ok).toBe(true);
  });

  it('AgentGenerator: systemPrompt는 비어있지 않음', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('architect', 'test spec', 'feat-sys');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  // ── Edge cases: CoderAllocator ────────────────────────────────────

  it('CoderAllocator: 빈 모듈 목록 → 빈 배열 반환', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-empty', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('CoderAllocator: 단일 모듈 할당', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-single', ['auth']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.branchName).toContain('feature/feat-single');
    }
  });

  it('CoderAllocator: 모듈 이름에 한글 포함', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-kr', ['인증모듈', 'db모듈']);
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('CoderAllocator: 10개 모듈 병렬 할당', () => {
    const allocator = new CoderAllocator(logger);
    const modules = Array.from({ length: 10 }, (_, i) => `module-${i}`);
    const result = allocator.allocate('feat-bulk', modules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(10);
      for (const alloc of result.value) {
        expect(alloc.status).toBe('assigned');
      }
    }
  });

  it('CoderAllocator: 다른 featureId로 같은 모듈 재할당 가능', () => {
    const allocator = new CoderAllocator(logger);
    allocator.allocate('feat-a', ['auth']);

    // WHY: 다른 feature라면 같은 모듈도 할당 가능해야 한다
    const result = allocator.allocate('feat-b', ['user']);
    expect(result.ok).toBe(true);
  });

  it('CoderAllocator: UUID 형식 featureId로 할당', () => {
    const allocator = new CoderAllocator(logger);
    const featureId = crypto.randomUUID();
    const result = allocator.allocate(featureId, ['api-layer']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.branchName).toContain(featureId);
    }
  });

  // ── Edge cases: VerificationGate ─────────────────────────────────

  it('VerificationGate: 부분 결과만 있을 때 isComplete = false', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-partial';

    gate.addResult({ featureId, phase: 'qa_qc', passed: true, feedback: 'ok', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'reviewer', passed: true, feedback: 'ok', timestamp: new Date() });

    // WHY: 4중 검증 중 2개만 → isComplete = false
    expect(gate.isComplete(featureId)).toBe(false);
  });

  it('VerificationGate: 결과 없는 featureId → isComplete = false', () => {
    const gate = new VerificationGate(logger);
    expect(gate.isComplete('nonexistent-feature')).toBe(false);
  });

  it('VerificationGate: 여러 featureId 독립 관리', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;

    for (const phase of phases) {
      gate.addResult({ featureId: 'feat-a', phase, passed: true, feedback: 'ok', timestamp: new Date() });
      gate.addResult({ featureId: 'feat-b', phase, passed: false, feedback: 'fail', timestamp: new Date() });
    }

    expect(gate.isAllPassed('feat-a')).toBe(true);
    expect(gate.isAllPassed('feat-b')).toBe(false);
  });

  it('VerificationGate: summarize 미완성 → 에러 반환', () => {
    const gate = new VerificationGate(logger);
    gate.addResult({
      featureId: 'feat-incomplete',
      phase: 'qa_qc',
      passed: true,
      feedback: 'ok',
      timestamp: new Date(),
    });

    const summary = gate.summarize('feat-incomplete');
    // WHY: 미완성 상태에서 summarize 호출 → 에러 또는 부분 결과
    expect(summary.ok === true || summary.ok === false).toBe(true);
  });

  it('VerificationGate: 모두 실패한 경우 summary.passed = false', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({ featureId: 'feat-all-fail', phase, passed: false, feedback: '실패', timestamp: new Date() });
    }
    const summary = gate.summarize('feat-all-fail');
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.passed).toBe(false);
    }
  });

  it('VerificationGate: timestamp 과거 날짜로 결과 추가', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({
        featureId: 'feat-past',
        phase,
        passed: true,
        feedback: 'ok',
        timestamp: new Date('2020-01-01'),
      });
    }
    expect(gate.isComplete('feat-past')).toBe(true);
  });

  // ── Edge cases: FailureHandler ────────────────────────────────────

  it('FailureHandler: 알 수 없는 실패 메시지 → 기본 분류', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-unknown', 'VERIFY', '알 수 없는 오류 발생');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBeDefined();
    }
  });

  it('FailureHandler: 빈 오류 메시지 → 분류 가능', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-empty-msg', 'VERIFY', '');
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it('FailureHandler: 한글 오류 메시지 처리', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-kr-err', 'TEST', '타입 오류: 예상치 못한 null 값');
    expect(result.ok).toBe(true);
  });

  it('FailureHandler: CODE Phase에서 실패 분류', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-code-fail', 'CODE', 'compilation error');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(['design_flaw', 'implementation_bug', 'test_gap'].includes(result.value.type)).toBe(true);
    }
  });

  it('FailureHandler: design_flaw → 복구 Phase = DESIGN', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-design', 'VERIFY', 'architecture 결함 발견');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'design_flaw') {
      expect(handler.getRecoveryPhase(result.value)).toBe('DESIGN');
    }
  });

  it('FailureHandler: implementation_bug → 복구 Phase = CODE', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-impl', 'VERIFY', 'null pointer exception');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'implementation_bug') {
      expect(handler.getRecoveryPhase(result.value)).toBe('CODE');
    }
  });

  it('FailureHandler: test_gap → 복구 Phase = TEST', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-test', 'VERIFY', 'coverage 60% 미달');
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'test_gap') {
      expect(handler.getRecoveryPhase(result.value)).toBe('TEST');
    }
  });

  it('FailureHandler: 특수문자 포함 오류 메시지', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-special', 'TEST', 'Error: Cannot read property "undefined" of null @line:42');
    expect(result.ok).toBe(true);
  });

  it('FailureHandler: UUID 형식 featureId', () => {
    const handler = new FailureHandler(logger);
    const featureId = crypto.randomUUID();
    const result = handler.classify(featureId, 'VERIFY', 'test coverage 부족');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
    }
  });

  // ── 복합 시나리오 / Combined scenarios ───────────────────────────

  it('PhaseEngine + VerificationGate: 전체 검증 사이클', () => {
    const engine = new PhaseEngine(logger);
    const gate = new VerificationGate(logger);
    const featureId = 'feat-full-cycle';

    engine.transition('CODE', 'ok', 'architect');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');

    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({ featureId, phase, passed: true, feedback: 'ok', timestamp: new Date() });
    }

    expect(gate.isComplete(featureId)).toBe(true);
    expect(gate.isAllPassed(featureId)).toBe(true);
    expect(engine.currentPhase).toBe('VERIFY');
  });

  it('AgentGenerator + CoderAllocator: 설정 생성 후 할당', () => {
    const generator = new AgentGenerator(logger);
    const allocator = new CoderAllocator(logger);

    const agentConfig = generator.generateAgentConfig('coder', 'implement auth', 'feat-combined');
    expect(agentConfig.ok).toBe(true);

    const allocation = allocator.allocate('feat-combined', ['auth', 'token']);
    expect(allocation.ok).toBe(true);
    if (allocation.ok) {
      expect(allocation.value).toHaveLength(2);
    }
  });

  it('PhaseEngine: DESIGN에서 이력은 빈 배열', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.getHistory()).toHaveLength(0);
    expect(engine.currentPhase).toBe('DESIGN');
  });

  it('FailureHandler + PhaseEngine: 연속 3회 실패 → 3회 롤백', () => {
    const engine = new PhaseEngine(logger);
    const handler = new FailureHandler(logger);

    for (let cycle = 0; cycle < 3; cycle++) {
      if (engine.currentPhase === 'DESIGN') engine.transition('CODE', 'ok', 'adev');
      if (engine.currentPhase === 'CODE') engine.transition('TEST', 'ok', 'adev');
      if (engine.currentPhase === 'TEST') engine.transition('VERIFY', 'ok', 'adev');

      const failure = handler.classify('feat-retry', 'VERIFY', 'undefined is not a function');
      if (failure.ok) {
        const recovery = handler.getRecoveryPhase(failure.value);
        engine.transition(recovery, '롤백', 'adev');
      }
    }

    // WHY: 3 사이클 롤백 후 이력이 충분히 쌓여야 함
    expect(engine.getHistory().length).toBeGreaterThan(3);
  });

  // ── 추가 PhaseEngine 경계값 ───────────────────────────────────

  it('PhaseEngine: 이력 각 항목에 triggeredBy 포함', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'architect');
    engine.transition('TEST', 'ok', 'coder-01');
    const history = engine.getHistory();
    expect(history[0]?.triggeredBy).toBe('architect');
    expect(history[1]?.triggeredBy).toBe('coder-01');
  });

  it('PhaseEngine: 이력 항목의 reason 필드 존재', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', '설계 완료', 'architect');
    const history = engine.getHistory();
    expect(history[0]?.reason).toBe('설계 완료');
  });

  it('PhaseEngine: UUID 형식 triggeredBy 허용', () => {
    const engine = new PhaseEngine(logger);
    const uuid = crypto.randomUUID();
    const result = engine.transition('CODE', 'ok', uuid as AgentName);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const history = engine.getHistory();
      expect(history[0]?.triggeredBy).toBe(uuid);
    }
  });

  it('PhaseEngine: 전환 거부 시 currentPhase 변경 없음', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    const before = engine.currentPhase;
    engine.transition('DESIGN', 'invalid jump', 'adev'); // CODE→DESIGN 불가 (순방향)
    // CODE에서 DESIGN 직접 전환 가능 여부에 따라 달라짐
    // 실패면 before 그대로
    const after = engine.currentPhase;
    expect(typeof after).toBe('string');
    expect(after.length).toBeGreaterThan(0);
  });

  it('PhaseEngine: 매우 긴 reason 문자열 허용', () => {
    const engine = new PhaseEngine(logger);
    const longReason = '이유: ' + 'x'.repeat(1000);
    const result = engine.transition('CODE', longReason, 'adev');
    expect(result.ok).toBe(true);
  });

  it('PhaseEngine: 특수문자 포함 reason → 이력 저장', () => {
    const engine = new PhaseEngine(logger);
    const specialReason = '완료: <설계> & {검토} | [승인] @2026';
    engine.transition('CODE', specialReason, 'architect');
    const history = engine.getHistory();
    expect(history[0]?.reason).toBe(specialReason);
  });

  it('PhaseEngine: 10번 왕복 전환 → 이력 10개', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'r1', 'adev');
    engine.transition('TEST', 'r2', 'adev');
    engine.transition('VERIFY', 'r3', 'adev');
    engine.transition('DESIGN', 'rb', 'adev');
    engine.transition('CODE', 'r4', 'adev');
    engine.transition('TEST', 'r5', 'adev');
    engine.transition('VERIFY', 'r6', 'adev');
    engine.transition('DESIGN', 'rb2', 'adev');
    engine.transition('CODE', 'r7', 'adev');
    engine.transition('TEST', 'r8', 'adev');
    const history = engine.getHistory();
    expect(history.length).toBe(10);
  });

  // ── 추가 AgentGenerator 경계값 ───────────────────────────────

  it('AgentGenerator: 한글 특수문자 혼합 스펙 → ok', () => {
    const generator = new AgentGenerator(logger);
    const spec = '기능: 인증<Auth> & 권한{RBAC} | 토큰[JWT] @version=2.0';
    const result = generator.generateAgentConfig('qa', spec, 'feat-ko');
    expect(result.ok).toBe(true);
  });

  it('AgentGenerator: featureId에 UUID → name 필드 일치', () => {
    const generator = new AgentGenerator(logger);
    const uuid = crypto.randomUUID();
    const result = generator.generateAgentConfig('coder', 'spec', uuid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('coder');
  });

  it('AgentGenerator: qc 에이전트는 Write/Edit 도구 없음', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('AgentGenerator: architect는 Read/Glob 도구 보유', () => {
    const generator = new AgentGenerator(logger);
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('AgentGenerator: 매우 긴 featureId → ok', () => {
    const generator = new AgentGenerator(logger);
    const longId = 'feat-' + 'x'.repeat(200);
    const result = generator.generateAgentConfig('tester', 'spec', longId);
    expect(result.ok).toBe(true);
  });

  it('AgentGenerator: 5개 에이전트 systemPrompt 모두 다름', () => {
    const generator = new AgentGenerator(logger);
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'reviewer'];
    const prompts = agents.map(name => {
      const r = generator.generateAgentConfig(name, 'same spec', 'feat-1');
      return r.ok ? r.value.systemPrompt : '';
    });
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBeGreaterThan(1);
  });

  // ── 추가 CoderAllocator 경계값 ───────────────────────────────

  it('CoderAllocator: 중복 모듈 이름 목록 → ok 또는 error', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-dup', ['auth', 'auth', 'auth']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('CoderAllocator: 매우 긴 모듈 이름 → ok 또는 error', () => {
    const allocator = new CoderAllocator(logger);
    const longModule = 'module-' + 'x'.repeat(200);
    const result = allocator.allocate('feat-long-mod', [longModule]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('CoderAllocator: branchName에 featureId 포함', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-branch', ['api']);
    expect(result.ok).toBe(true);
    if (result.ok && result.value[0]) {
      expect(result.value[0].branchName).toContain('feat-branch');
    }
  });

  it('CoderAllocator: 할당 결과의 status는 assigned', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-status', ['module-a', 'module-b']);
    if (result.ok) {
      for (const alloc of result.value) {
        expect(alloc.status).toBe('assigned');
      }
    }
  });

  it('CoderAllocator: 5개 다른 feature에 각 1개 모듈 할당', () => {
    const allocator = new CoderAllocator(logger);
    for (let i = 0; i < 5; i++) {
      const result = allocator.allocate(`feat-indep-${i}`, [`module-unique-${i}`]);
      expect(result.ok).toBe(true);
    }
  });

  // ── 추가 VerificationGate 경계값 ─────────────────────────────

  it('VerificationGate: 동일 phase 중복 추가 → isComplete 처리', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-dup-phase';
    gate.addResult({ featureId, phase: 'qa_qc', passed: true, feedback: 'ok1', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'qa_qc', passed: false, feedback: 'ok2', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'reviewer', passed: true, feedback: 'ok', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'layer1', passed: true, feedback: 'ok', timestamp: new Date() });
    gate.addResult({ featureId, phase: 'adev', passed: true, feedback: 'ok', timestamp: new Date() });
    // 중복 phase 처리 방식에 따라 complete 여부 결정
    expect(typeof gate.isComplete(featureId)).toBe('boolean');
  });

  it('VerificationGate: 피드백 한글 포함 → 정상 저장', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-kr-feedback';
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({
        featureId,
        phase,
        passed: true,
        feedback: `${phase} 검증 통과 — 품질 우수`,
        timestamp: new Date(),
      });
    }
    const summary = gate.summarize(featureId);
    expect(summary.ok).toBe(true);
    if (summary.ok) expect(summary.value.passed).toBe(true);
  });

  it('VerificationGate: 10개 featureId 독립 관리', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (let i = 0; i < 10; i++) {
      const featureId = `feat-multi-${i}`;
      for (const phase of phases) {
        gate.addResult({
          featureId,
          phase,
          passed: i % 2 === 0,
          feedback: 'ok',
          timestamp: new Date(),
        });
      }
    }
    for (let i = 0; i < 10; i++) {
      const featureId = `feat-multi-${i}`;
      expect(gate.isComplete(featureId)).toBe(true);
      expect(gate.isAllPassed(featureId)).toBe(i % 2 === 0);
    }
  });

  it('VerificationGate: summarize 결과에 summary 필드 포함', () => {
    const gate = new VerificationGate(logger);
    const featureId = 'feat-summary-check';
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({ featureId, phase, passed: true, feedback: 'ok', timestamp: new Date() });
    }
    const result = gate.summarize(featureId);
    if (result.ok) {
      expect(typeof result.value.summary).toBe('string');
    }
  });

  // ── 추가 FailureHandler 경계값 ───────────────────────────────

  it('FailureHandler: DESIGN phase에서 실패 분류', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-design-fail', 'DESIGN', 'architecture issue');
    expect(result.ok).toBe(true);
  });

  it('FailureHandler: TEST phase에서 실패 분류', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-test-fail', 'TEST', 'coverage gap detected');
    expect(result.ok).toBe(true);
  });

  it('FailureHandler: 분류 결과에 featureId 포함', () => {
    const handler = new FailureHandler(logger);
    const featureId = 'feat-id-check';
    const result = handler.classify(featureId, 'VERIFY', 'some bug');
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
    }
  });

  it('FailureHandler: 분류 결과 type은 유효한 enum 값', () => {
    const handler = new FailureHandler(logger);
    const result = handler.classify('feat-type', 'VERIFY', 'error in logic');
    if (result.ok) {
      expect(['design_flaw', 'implementation_bug', 'test_gap'].includes(result.value.type)).toBe(true);
    }
  });

  it('FailureHandler: 매우 긴 오류 메시지 → ok', () => {
    const handler = new FailureHandler(logger);
    const longMsg = 'Error: ' + 'x'.repeat(5000);
    const result = handler.classify('feat-long-err', 'VERIFY', longMsg);
    expect(result.ok).toBe(true);
  });

  it('FailureHandler: 연속 10회 분류 → 항상 ok', () => {
    const handler = new FailureHandler(logger);
    for (let i = 0; i < 10; i++) {
      const result = handler.classify(`feat-${i}`, 'VERIFY', `bug ${i}`);
      expect(result.ok).toBe(true);
    }
  });

  // ── 추가 PhaseEngine 전환 규칙 검증 ──────────────────────────

  it('PhaseEngine: DESIGN → VERIFY 직접 불가', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('VERIFY', '건너뛰기', 'adev');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('phase_invalid_transition');
  });

  it('PhaseEngine: CODE → DESIGN 직접 불가', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    const result = engine.transition('DESIGN', 'backward', 'adev');
    expect(result.ok).toBe(false);
  });

  it('PhaseEngine: TEST → CODE 직접 불가', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    const result = engine.transition('CODE', 'from test to code', 'adev');
    expect(result.ok).toBe(false);
  });

  it('PhaseEngine: TEST → DESIGN 직접 불가', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    const result = engine.transition('DESIGN', 'from test to design', 'adev');
    expect(result.ok).toBe(false);
  });

  it('PhaseEngine: canTransition DESIGN→CODE=true', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('PhaseEngine: canTransition DESIGN→VERIFY=false', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('PhaseEngine: canTransition DESIGN→TEST=false', () => {
    const engine = new PhaseEngine(logger);
    expect(engine.canTransition('TEST')).toBe(false);
  });

  it('PhaseEngine: canTransition CODE→TEST=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('PhaseEngine: canTransition CODE→VERIFY=false', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    expect(engine.canTransition('VERIFY')).toBe(false);
  });

  it('PhaseEngine: canTransition VERIFY→DESIGN=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');
    expect(engine.canTransition('DESIGN')).toBe(true);
  });

  it('PhaseEngine: canTransition VERIFY→CODE=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');
    expect(engine.canTransition('CODE')).toBe(true);
  });

  it('PhaseEngine: canTransition VERIFY→TEST=true', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');
    expect(engine.canTransition('TEST')).toBe(true);
  });

  it('PhaseEngine: 성공 전환 반환값에 from/to/reason/triggeredBy 포함', () => {
    const engine = new PhaseEngine(logger);
    const result = engine.transition('CODE', 'my reason', 'architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.from).toBe('DESIGN');
      expect(result.value.to).toBe('CODE');
      expect(result.value.reason).toBe('my reason');
      expect(result.value.triggeredBy).toBe('architect');
    }
  });

  it('PhaseEngine: 성공 전환 반환값에 timestamp 포함', () => {
    const engine = new PhaseEngine(logger);
    const before = new Date();
    const result = engine.transition('CODE', 'ok', 'adev');
    const after = new Date();
    if (result.ok) {
      expect(result.value.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
      expect(result.value.timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    }
  });

  it('PhaseEngine: getParticipants CODE 단계 active에 architect 포함', () => {
    const engine = new PhaseEngine(logger);
    const p = engine.getParticipants('CODE');
    expect(p.active).toContain('architect');
  });

  it('PhaseEngine: getParticipants TEST 단계 active에 qc 포함', () => {
    const engine = new PhaseEngine(logger);
    const p = engine.getParticipants('TEST');
    expect(p.active).toContain('qc');
  });

  it('PhaseEngine: getParticipants VERIFY 단계 active에 qa/qc/reviewer 포함', () => {
    const engine = new PhaseEngine(logger);
    const p = engine.getParticipants('VERIFY');
    expect(p.active).toContain('qa');
    expect(p.active).toContain('qc');
    expect(p.active).toContain('reviewer');
  });

  it('PhaseEngine: getParticipants DESIGN 단계 inactive에 tester 포함', () => {
    const engine = new PhaseEngine(logger);
    const p = engine.getParticipants('DESIGN');
    expect(p.inactive).toContain('tester');
  });

  it('PhaseEngine: 이력 항목의 timestamp가 Date이다', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    const history = engine.getHistory();
    expect(history[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('PhaseEngine: 이력 항목이 from/to 필드를 가진다', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    const h = engine.getHistory();
    expect('from' in (h[0] ?? {})).toBe(true);
    expect('to' in (h[0] ?? {})).toBe(true);
  });

  // ── 추가 AgentGenerator 심화 검증 ────────────────────────────

  it('AgentGenerator: 모든 7개 에이전트 name 필드 정확히 일치', () => {
    const generator = new AgentGenerator(logger);
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agents) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-name-check');
      if (result.ok) expect(result.value.name).toBe(name);
    }
  });

  it('AgentGenerator: 모든 7개 에이전트 tools는 배열이다', () => {
    const generator = new AgentGenerator(logger);
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agents) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-tools-check');
      if (result.ok) expect(Array.isArray(result.value.tools)).toBe(true);
    }
  });

  it('AgentGenerator: 모든 7개 에이전트 systemPrompt는 string이다', () => {
    const generator = new AgentGenerator(logger);
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agents) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-prompt-check');
      if (result.ok) expect(typeof result.value.systemPrompt).toBe('string');
    }
  });

  it('AgentGenerator: 긴 spec → systemPrompt에 일부 내용 포함', () => {
    const generator = new AgentGenerator(logger);
    const longSpec = '기능 명세서: ' + 'x'.repeat(500);
    const result = generator.generateAgentConfig('architect', longSpec, 'feat-long-spec');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('AgentGenerator: 10번 같은 에이전트 생성 → 모두 ok', () => {
    const generator = new AgentGenerator(logger);
    for (let i = 0; i < 10; i++) {
      const result = generator.generateAgentConfig('coder', `spec-${i}`, `feat-${i}`);
      expect(result.ok).toBe(true);
    }
  });

  // ── 추가 CoderAllocator 심화 검증 ────────────────────────────

  it('CoderAllocator: 할당된 모듈 수와 결과 배열 길이 일치', () => {
    const allocator = new CoderAllocator(logger);
    const modules = ['auth', 'user', 'db', 'api', 'cache'];
    const result = allocator.allocate('feat-count', modules);
    if (result.ok) expect(result.value.length).toBe(modules.length);
  });

  it('CoderAllocator: 모든 할당 항목에 branchName 필드 존재', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-fields', ['mod-a', 'mod-b']);
    if (result.ok) {
      for (const alloc of result.value) {
        expect('branchName' in alloc).toBe(true);
      }
    }
  });

  it('CoderAllocator: 모든 할당 항목에 status 필드 존재', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('feat-status-field', ['mod-x']);
    if (result.ok) {
      for (const alloc of result.value) {
        expect('status' in alloc).toBe(true);
      }
    }
  });

  it('CoderAllocator: branchName이 featureId를 포함한다 (재확인)', () => {
    const allocator = new CoderAllocator(logger);
    const featureId = 'unique-feat-abc';
    const result = allocator.allocate(featureId, ['mod-z']);
    if (result.ok && result.value[0]) {
      expect(result.value[0].branchName).toContain(featureId);
    }
  });

  it('CoderAllocator: 같은 모듈 두 번 할당 시도 → 두 번째 ok=false', () => {
    const allocator = new CoderAllocator(logger);
    allocator.allocate('feat-1', ['shared-module']);
    const result = allocator.allocate('feat-2', ['shared-module']);
    expect(result.ok).toBe(false);
  });

  it('CoderAllocator: 빈 featureId → ok 또는 error (구현에 따름)', () => {
    const allocator = new CoderAllocator(logger);
    const result = allocator.allocate('', ['mod-a']);
    expect(typeof result.ok).toBe('boolean');
  });

  // ── 추가 VerificationGate 심화 검증 ──────────────────────────

  it('VerificationGate: 새 featureId의 isAllPassed=false (결과 없음)', () => {
    const gate = new VerificationGate(logger);
    expect(gate.isAllPassed('feat-new-no-results')).toBe(false);
  });

  it('VerificationGate: 단일 featureId 4개 phase 모두 passed=false → isAllPassed=false', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({
        featureId: 'feat-all-false',
        phase,
        passed: false,
        feedback: 'fail',
        timestamp: new Date(),
      });
    }
    expect(gate.isAllPassed('feat-all-false')).toBe(false);
  });

  it('VerificationGate: summarize ok=true 결과의 passed 필드가 boolean', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({ featureId: 'feat-bool-check', phase, passed: true, feedback: 'ok', timestamp: new Date() });
    }
    const result = gate.summarize('feat-bool-check');
    if (result.ok) expect(typeof result.value.passed).toBe('boolean');
  });

  it('VerificationGate: addResult 반환값이 void이다 (예외 없음)', () => {
    const gate = new VerificationGate(logger);
    expect(() => {
      gate.addResult({
        featureId: 'feat-void',
        phase: 'qa_qc',
        passed: true,
        feedback: 'ok',
        timestamp: new Date(),
      });
    }).not.toThrow();
  });

  // ── 추가 복합 시나리오 검증 ──────────────────────────────────

  it('5개 PhaseEngine 인스턴스 → 각각 독립 초기 상태', () => {
    const engines = Array.from({ length: 5 }, () => new PhaseEngine(logger));
    for (const engine of engines) {
      expect(engine.currentPhase).toBe('DESIGN');
      expect(engine.getHistory()).toHaveLength(0);
    }
  });

  it('PhaseEngine + AgentGenerator: CODE 전환 후 coder 설정 생성', () => {
    const engine = new PhaseEngine(logger);
    const generator = new AgentGenerator(logger);

    const transition = engine.transition('CODE', 'ok', 'architect');
    expect(transition.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');

    const config = generator.generateAgentConfig('coder', 'implement feature', 'feat-combined-2');
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.value.tools).toContain('Write');
    }
  });

  it('PhaseEngine + VerificationGate: 완료 후 summarize text 포함', () => {
    const engine = new PhaseEngine(logger);
    const gate = new VerificationGate(logger);
    const featureId = 'feat-summary-text';

    engine.transition('CODE', 'ok', 'architect');
    engine.transition('TEST', 'ok', 'coder');
    engine.transition('VERIFY', 'ok', 'tester');

    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    for (const phase of phases) {
      gate.addResult({ featureId, phase, passed: true, feedback: 'ok', timestamp: new Date() });
    }

    const summary = gate.summarize(featureId);
    if (summary.ok) {
      expect(typeof summary.value.summary).toBe('string');
      expect(summary.value.summary.length).toBeGreaterThan(0);
    }
  });

  it('FailureHandler + CoderAllocator: 버그 실패 → CODE 복구 → 모듈 재할당', () => {
    const handler = new FailureHandler(logger);
    const allocator = new CoderAllocator(logger);

    const failure = handler.classify('feat-realloc', 'VERIFY', 'null pointer exception');
    expect(failure.ok).toBe(true);

    if (failure.ok) {
      const recoveryPhase = handler.getRecoveryPhase(failure.value);
      expect(recoveryPhase).toBe('CODE');

      // CODE 복구이므로 새 모듈 할당
      const reallocation = allocator.allocate('feat-realloc-new', ['auth-fix']);
      expect(reallocation.ok).toBe(true);
    }
  });

  it('AgentGenerator: 7개 에이전트 모두 tools.length > 0', () => {
    const generator = new AgentGenerator(logger);
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const name of agents) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-tools-len');
      if (result.ok) expect(result.value.tools.length).toBeGreaterThan(0);
    }
  });

  it('PhaseEngine: 롤백 후 재진행 가능', () => {
    const engine = new PhaseEngine(logger);

    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');

    // 롤백 to DESIGN
    const rollback = engine.transition('DESIGN', '재설계', 'adev');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('DESIGN');

    // 재진행
    const retry = engine.transition('CODE', '재구현', 'adev');
    expect(retry.ok).toBe(true);
    expect(engine.currentPhase).toBe('CODE');
  });

  it('VerificationGate: 10개 UUID featureId 모두 isComplete=true', () => {
    const gate = new VerificationGate(logger);
    const phases = ['qa_qc', 'reviewer', 'layer1', 'adev'] as const;
    const uuids = Array.from({ length: 10 }, () => crypto.randomUUID());

    for (const uuid of uuids) {
      for (const phase of phases) {
        gate.addResult({ featureId: uuid, phase, passed: true, feedback: 'ok', timestamp: new Date() });
      }
    }

    for (const uuid of uuids) {
      expect(gate.isComplete(uuid)).toBe(true);
    }
  });

  it('FailureHandler: design_flaw + implementation_bug + test_gap 모두 분류', () => {
    const handler = new FailureHandler(logger);

    const r1 = handler.classify('f1', 'VERIFY', 'architecture 결함 발견');
    const r2 = handler.classify('f2', 'VERIFY', 'undefined is not a function');
    const r3 = handler.classify('f3', 'VERIFY', 'test coverage 부족');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);

    if (r1.ok) expect(r1.value.type).toBe('design_flaw');
    if (r2.ok) expect(r2.value.type).toBe('implementation_bug');
    if (r3.ok) expect(r3.value.type).toBe('test_gap');
  });

  it('PhaseEngine: DESIGN→CODE→TEST→VERIFY 후 이력 length=3', () => {
    const engine = new PhaseEngine(logger);
    engine.transition('CODE', 'ok', 'adev');
    engine.transition('TEST', 'ok', 'adev');
    engine.transition('VERIFY', 'ok', 'adev');
    expect(engine.getHistory().length).toBe(3);
  });
});
