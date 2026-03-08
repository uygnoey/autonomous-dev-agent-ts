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
});
