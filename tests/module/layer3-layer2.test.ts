/**
 * layer3 ↔ layer2 모듈 통합 테스트 / layer3 ↔ layer2 module integration tests
 *
 * @description
 * KR: BugEscalator가 FailureHandler와 연동하여 Phase 결정하고,
 *     DocIntegrator가 layer2 Phase별 문서 조각을 통합하고,
 *     ProductionTester 결과에서 BugReport 생성 → 에스컬레이션 흐름을 검증한다.
 * EN: Verifies BugEscalator + FailureHandler phase determination,
 *     DocIntegrator merging layer2 phase documents,
 *     and ProductionTester → BugReport → escalation flow.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../src/core/index.js';
import type { Logger } from '../../src/core/logger.js';
import { FailureHandler, PhaseEngine } from '../../src/layer2/index.js';
import { BugEscalator, DocIntegrator, ProductionTester } from '../../src/layer3/index.js';
import type { DocumentTemplate, TestFailure } from '../../src/layer3/types.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

const logger: Logger = new ConsoleLogger('error');

/** 테스트용 DocumentTemplate 생성 / Create test DocumentTemplate */
function createTemplate(title: string, sectionCount = 3): DocumentTemplate {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    heading: `Section ${i + 1}`,
    content: `Content for section ${i + 1}`,
    order: i + 1,
    required: i === 0,
  }));

  return {
    type: 'architecture' as const,
    title,
    sections,
    language: 'bilingual' as const,
  };
}

/** 테스트용 TestFailure 생성 / Create test TestFailure */
function createTestFailure(
  testName: string,
  error: string,
  featureId = 'feat-1',
): TestFailure {
  return { testName, error, featureId };
}

// ── 테스트 ────────────────────────────────────────────────────────

describe('layer3 ↔ layer2 통합 / layer3 ↔ layer2 integration', () => {
  it('BugEscalator + FailureHandler: critical 에러 → CODE Phase로 동일 결정', () => {
    const escalator = new BugEscalator(logger);
    const handler = new FailureHandler(logger);

    // WHY: 'crash' 키워드가 포함되면 critical 심각도
    const failure = createTestFailure('auth-test', 'Application crash on login', 'feat-auth');

    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    // BugEscalator: critical → CODE
    const escalateResult = escalator.escalate(reportResult.value);
    expect(escalateResult.ok).toBe(true);
    if (!escalateResult.ok) return;
    expect(escalateResult.value.targetPhase).toBe('CODE');

    // FailureHandler: 'crash' → implementation_bug → CODE
    const classifyResult = handler.classify('feat-auth', 'TEST', 'Application crash on login');
    expect(classifyResult.ok).toBe(true);
    if (!classifyResult.ok) return;
    expect(handler.getRecoveryPhase(classifyResult.value)).toBe('CODE');
  });

  it('BugEscalator + FailureHandler: major 에러 → TEST Phase로 에스컬레이션', () => {
    const escalator = new BugEscalator(logger);
    const handler = new FailureHandler(logger);

    // WHY: 'timeout' 키워드가 포함되면 major 심각도
    const failure = createTestFailure('api-test', 'Request timeout after 30s', 'feat-api');

    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    const escalateResult = escalator.escalate(reportResult.value);
    expect(escalateResult.ok).toBe(true);
    if (!escalateResult.ok) return;
    // WHY: BugEscalator에서 major → TEST
    expect(escalateResult.value.targetPhase).toBe('TEST');

    // FailureHandler: 'timeout' → infrastructure → CODE (다른 로직)
    const classifyResult = handler.classify('feat-api', 'CODE', 'Request timeout after 30s');
    expect(classifyResult.ok).toBe(true);
    if (!classifyResult.ok) return;
    expect(classifyResult.value.suggestedAction).toBe('retry');
  });

  it('BugEscalator + FailureHandler: minor 에러 → VERIFY Phase', () => {
    const escalator = new BugEscalator(logger);

    // WHY: critical/major 키워드가 없으면 minor
    const failure = createTestFailure('style-test', 'Formatting mismatch in output', 'feat-ui');

    const reportResult = escalator.createReport('proj-1', failure);
    expect(reportResult.ok).toBe(true);
    if (!reportResult.ok) return;

    expect(reportResult.value.severity).toBe('minor');

    const escalateResult = escalator.escalate(reportResult.value);
    expect(escalateResult.ok).toBe(true);
    if (!escalateResult.ok) return;
    expect(escalateResult.value.targetPhase).toBe('VERIFY');
  });

  it('BugEscalator: 활성 리포트 관리 (생성 → 조회 → 해결)', () => {
    const escalator = new BugEscalator(logger);

    escalator.createReport('proj-1', createTestFailure('test-a', 'error occurred', 'feat-1'));
    escalator.createReport('proj-1', createTestFailure('test-b', 'crash detected', 'feat-2'));
    escalator.createReport('proj-2', createTestFailure('test-c', 'null reference', 'feat-3'));

    const proj1Reports = escalator.getActiveReports('proj-1');
    expect(proj1Reports.length).toBe(2);

    // WHY: 리포트 해결 후 활성 목록에서 제거
    const resolveResult = escalator.resolveReport(proj1Reports[0]!.id);
    expect(resolveResult.ok).toBe(true);

    const afterResolve = escalator.getActiveReports('proj-1');
    expect(afterResolve.length).toBe(1);
  });

  it('FailureHandler: design_flaw → DESIGN Phase 롤백', () => {
    const handler = new FailureHandler(logger);

    // WHY: 'architecture' 키워드 → design_flaw 유형
    const result = handler.classify('feat-1', 'CODE', 'Architecture incompatibility found');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.type).toBe('design_flaw');
    expect(result.value.suggestedAction).toBe('rollback_phase');
    expect(handler.getRecoveryPhase(result.value)).toBe('DESIGN');
  });

  it('FailureHandler: spec_ambiguity → escalate_user 동작', () => {
    const handler = new FailureHandler(logger);

    // WHY: 'unclear' 키워드 → spec_ambiguity
    const result = handler.classify('feat-2', 'DESIGN', 'Requirement unclear for auth module');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.type).toBe('spec_ambiguity');
    expect(result.value.suggestedAction).toBe('escalate_user');
  });

  it('DocIntegrator: Phase별 문서 조각 통합', () => {
    const integrator = new DocIntegrator(logger);

    const template = createTemplate('Project Architecture Document');
    const fragments = ['design-doc-1', 'code-review-2', 'test-report-3'];

    const result = integrator.integrate(fragments, template, 'proj-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.projectId).toBe('proj-1');
    expect(result.value.sourceFragments.length).toBe(3);
    expect(result.value.content).toContain('Project Architecture Document');
    expect(result.value.version).toBe(1);
  });

  it('DocIntegrator: 문서 업데이트 → 버전 증가', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('API Reference');

    const createResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const updateResult = integrator.updateDocument(createResult.value, ['frag-2', 'frag-3']);
    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) return;

    expect(updateResult.value.version).toBe(2);
    expect(updateResult.value.sourceFragments.length).toBe(3);
    expect(updateResult.value.content).toContain('업데이트 부록');
  });

  it('DocIntegrator: exportAsMarkdown로 frontmatter 포함 출력', () => {
    const integrator = new DocIntegrator(logger);
    const template = createTemplate('Test Report');

    const createResult = integrator.integrate(['frag-1'], template, 'proj-1');
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const mdResult = integrator.exportAsMarkdown(createResult.value);
    expect(mdResult.ok).toBe(true);
    if (!mdResult.ok) return;

    expect(mdResult.value).toContain('title: Test Report');
    expect(mdResult.value).toContain('version: 1');
    expect(mdResult.value).toContain('language: bilingual');
  });

  it('ProductionTester → BugReport → 에스컬레이션 전체 파이프라인', () => {
    const tester = new ProductionTester(logger);
    const escalator = new BugEscalator(logger);

    // 1. E2E 테스트 실행 / Run E2E tests
    const runResult = tester.runE2E('proj-1', ['bun test e2e', 'bun test integration']);
    expect(runResult.ok).toBe(true);
    if (!runResult.ok) return;

    // WHY: 유효한 명령어이므로 모두 통과
    expect(runResult.value.passedTests).toBe(2);
    expect(runResult.value.failedTests).toBe(0);

    // 2. 빈 명령어로 실패 시뮬레이션
    const failResult = tester.runE2E('proj-1', ['bun test', '']);
    expect(failResult.ok).toBe(true);
    if (!failResult.ok) return;
    expect(failResult.value.failedTests).toBeGreaterThan(0);

    // 3. 실패 결과에서 BugReport 생성 / Create BugReport from failure
    if (failResult.value.failures.length > 0) {
      const bugFailure = failResult.value.failures[0]!;
      const reportResult = escalator.createReport('proj-1', {
        testName: bugFailure.testName,
        error: bugFailure.error || 'Empty test command error',
        featureId: bugFailure.featureId,
      });
      expect(reportResult.ok).toBe(true);
    }
  });

  it('ProductionTester isHealthy: 통과율 80% 이상이면 건강', () => {
    const tester = new ProductionTester(logger);

    const run1 = tester.runE2E('proj-1', ['test1', 'test2', 'test3', 'test4', 'test5']);
    expect(run1.ok).toBe(true);
    if (!run1.ok) return;

    // WHY: 모든 테스트 통과 → 100% → healthy
    expect(tester.isHealthy([run1.value])).toBe(true);
  });

  it('ProductionTester getFailureRate 계산', () => {
    const tester = new ProductionTester(logger);

    const run1 = tester.runE2E('proj-1', ['test1', 'test2']);
    expect(run1.ok).toBe(true);
    if (!run1.ok) return;

    // WHY: 유효한 명령어만 실행 → 실패율 0
    expect(tester.getFailureRate([run1.value])).toBe(0);

    // WHY: 빈 runs → 실패율 0
    expect(tester.getFailureRate([])).toBe(0);
  });

  it('PhaseEngine 롤백 → FailureHandler 결정 연동', () => {
    const engine = new PhaseEngine(logger);
    const handler = new FailureHandler(logger);

    // 순방향으로 VERIFY까지 진행
    engine.transition('CODE', 'design done', 'architect');
    engine.transition('TEST', 'code done', 'coder');
    engine.transition('VERIFY', 'tests done', 'tester');

    // 검증 중 test_gap 발견
    const failResult = handler.classify('feat-1', 'VERIFY', 'Test coverage insufficient');
    expect(failResult.ok).toBe(true);
    if (!failResult.ok) return;

    const recoveryPhase = handler.getRecoveryPhase(failResult.value);
    expect(recoveryPhase).toBe('TEST');

    // WHY: VERIFY에서 TEST로 롤백 가능
    expect(engine.canTransition(recoveryPhase)).toBe(true);
    const rollback = engine.transition(recoveryPhase, 'Test gap found', 'qa');
    expect(rollback.ok).toBe(true);
    expect(engine.currentPhase).toBe('TEST');
  });
});
