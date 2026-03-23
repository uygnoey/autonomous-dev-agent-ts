/**
 * BugReport 팩토리 및 심각도 분류 테스트 / Bug report factory and severity tests
 *
 * @description
 * KR: classifySeverity, mapFailureTypeToBugSeverity, determineTargetPhase,
 *     buildBugReport, buildBugReportFromE2E, summarizeChanges 테스트. 80%+ edge case.
 * EN: Tests for bug report pure functions. 80%+ edge/error ratio.
 */

import { describe, expect, it } from 'bun:test';
import {
  CRITICAL_KEYWORDS,
  MAJOR_KEYWORDS,
  MINOR_KEYWORDS,
  buildBugReport,
  buildBugReportFromE2E,
  classifySeverity,
  determineTargetPhase,
  mapFailureTypeToBugSeverity,
  summarizeChanges,
} from 'layer3/bug-report.js';
import type { ContinuousE2EResult } from 'layer3/bug-escalator-types.js';
import type { BugReport, TestFailure } from 'layer3/types.js';

// ── classifySeverity ──────────────────────────────────────────

describe('classifySeverity', () => {
  it('crash 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('Application crash on startup')).toBe('critical');
  });

  it('fatal 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('Fatal error occurred')).toBe('critical');
  });

  it('segfault 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('segfault at address 0x0')).toBe('critical');
  });

  it('oom 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('OOM killer invoked')).toBe('critical');
  });

  it('data loss 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('Potential data loss detected')).toBe('critical');
  });

  it('security 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('Security vulnerability found')).toBe('critical');
  });

  it('injection 키워드는 critical을 반환한다', () => {
    expect(classifySeverity('SQL injection detected')).toBe('critical');
  });

  it('error 키워드는 major를 반환한다', () => {
    expect(classifySeverity('Unexpected error in handler')).toBe('major');
  });

  it('exception 키워드는 major를 반환한다', () => {
    expect(classifySeverity('Unhandled exception thrown')).toBe('major');
  });

  it('failed 키워드는 major를 반환한다', () => {
    expect(classifySeverity('Assertion failed')).toBe('major');
  });

  it('timeout 키워드는 major를 반환한다', () => {
    expect(classifySeverity('Request timeout exceeded')).toBe('major');
  });

  it('null 키워드는 major를 반환한다', () => {
    expect(classifySeverity('null reference access')).toBe('major');
  });

  it('font 키워드는 minor를 반환한다', () => {
    expect(classifySeverity('Font rendering issue')).toBe('minor');
  });

  it('minor 키워드는 minor를 반환한다', () => {
    expect(classifySeverity('Minor visual glitch')).toBe('minor');
  });

  it('매칭 키워드 없으면 low를 반환한다', () => {
    expect(classifySeverity('Some random message')).toBe('low');
  });

  it('빈 문자열은 low를 반환한다', () => {
    expect(classifySeverity('')).toBe('low');
  });

  it('대소문자 구분 없이 매칭한다', () => {
    expect(classifySeverity('CRASH happened')).toBe('critical');
  });

  it('critical이 major보다 우선순위가 높다', () => {
    // WHY: 'crash' + 'error' 동시 포함 시 critical 우선
    expect(classifySeverity('crash error')).toBe('critical');
  });
});

// ── mapFailureTypeToBugSeverity ──────────────────────────────

describe('mapFailureTypeToBugSeverity', () => {
  it('design_flaw는 critical을 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('design_flaw')).toBe('critical');
  });

  it('implementation_bug는 high를 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('implementation_bug')).toBe('high');
  });

  it('test_gap는 medium을 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('test_gap')).toBe('medium');
  });

  it('spec_ambiguity는 medium을 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('spec_ambiguity')).toBe('medium');
  });

  it('infrastructure는 low를 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('infrastructure')).toBe('low');
  });

  it('알 수 없는 타입은 medium을 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('unknown_type')).toBe('medium');
  });

  it('빈 문자열은 medium을 반환한다', () => {
    expect(mapFailureTypeToBugSeverity('')).toBe('medium');
  });
});

// ── determineTargetPhase ─────────────────────────────────────

describe('determineTargetPhase', () => {
  it('critical은 CODE를 반환한다', () => {
    expect(determineTargetPhase('critical')).toBe('CODE');
  });

  it('major는 TEST를 반환한다', () => {
    expect(determineTargetPhase('major')).toBe('TEST');
  });

  it('high는 TEST를 반환한다', () => {
    expect(determineTargetPhase('high')).toBe('TEST');
  });

  it('medium은 TEST를 반환한다', () => {
    expect(determineTargetPhase('medium')).toBe('TEST');
  });

  it('minor는 VERIFY를 반환한다', () => {
    expect(determineTargetPhase('minor')).toBe('VERIFY');
  });

  it('low는 VERIFY를 반환한다', () => {
    expect(determineTargetPhase('low')).toBe('VERIFY');
  });
});

// ── buildBugReport ───────────────────────────────────────────

describe('buildBugReport', () => {
  function makeFailure(overrides?: Partial<TestFailure>): TestFailure {
    return {
      testName: 'test-auth',
      error: 'assertion failed',
      featureId: 'feat-1',
      ...overrides,
    };
  }

  it('유효한 입력 시 ok를 반환한다', () => {
    const result = buildBugReport('proj-1', makeFailure(), 1);
    expect(result.ok).toBe(true);
  });

  it('반환된 report의 id가 bug-{counter} 형식이다', () => {
    const result = buildBugReport('proj-1', makeFailure(), 42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('bug-42');
  });

  it('반환된 report의 projectId가 입력과 일치한다', () => {
    const result = buildBugReport('my-proj', makeFailure(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectId).toBe('my-proj');
  });

  it('빈 projectId 시 err를 반환한다', () => {
    const result = buildBugReport('', makeFailure(), 1);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 projectId 시 err를 반환한다', () => {
    const result = buildBugReport('   ', makeFailure(), 1);
    expect(result.ok).toBe(false);
  });

  it('빈 에러 메시지 시 err를 반환한다', () => {
    const result = buildBugReport('proj-1', makeFailure({ error: '' }), 1);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 에러 메시지 시 err를 반환한다', () => {
    const result = buildBugReport('proj-1', makeFailure({ error: '   ' }), 1);
    expect(result.ok).toBe(false);
  });

  it('crash 에러 메시지 시 severity가 critical이다', () => {
    const result = buildBugReport('proj-1', makeFailure({ error: 'crash detected' }), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.severity).toBe('critical');
  });

  it('reproductionSteps에 에러 메시지가 포함된다', () => {
    const result = buildBugReport('proj-1', makeFailure({ error: 'some error' }), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reproductionSteps.some((s) => s.includes('some error'))).toBe(true);
  });

  it('reportedAt가 Date 인스턴스다', () => {
    const result = buildBugReport('proj-1', makeFailure(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reportedAt).toBeInstanceOf(Date);
  });

  it('category가 implementation-bug이다', () => {
    const result = buildBugReport('proj-1', makeFailure(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('implementation-bug');
  });
});

// ── buildBugReportFromE2E ────────────────────────────────────

describe('buildBugReportFromE2E', () => {
  function makeE2EResult(): ContinuousE2EResult {
    return {
      id: 'e2e-1',
      projectId: 'proj-1',
      executedAt: new Date(),
      passed: false,
      failedTest: 'login.test.ts',
      errorMessage: 'Connection refused',
      featureId: 'feat-auth',
    };
  }

  it('유효한 입력 시 BugReport를 반환한다', () => {
    const report = buildBugReportFromE2E(makeE2EResult(), 'critical', 'DB down', 1);
    expect(report.id).toBe('bug-1');
    expect(report.projectId).toBe('proj-1');
  });

  it('severity가 전달된 값과 일치한다', () => {
    const report = buildBugReportFromE2E(makeE2EResult(), 'major', 'root cause', 2);
    expect(report.severity).toBe('major');
  });

  it('title에 실패 테스트명이 포함된다', () => {
    const report = buildBugReportFromE2E(makeE2EResult(), 'low', 'unknown', 3);
    expect(report.title).toContain('login.test.ts');
  });

  it('reproductionSteps에 에러 메시지가 포함된다', () => {
    const report = buildBugReportFromE2E(makeE2EResult(), 'low', 'unknown', 4);
    expect(report.reproductionSteps.some((s) => s.includes('Connection refused'))).toBe(true);
  });
});

// ── summarizeChanges ─────────────────────────────────────────

describe('summarizeChanges', () => {
  it('버그 설명, 심각도, 카테고리를 포함한다', () => {
    const report: BugReport = {
      id: 'bug-1',
      projectId: 'proj-1',
      title: 'Test bug',
      description: 'Login fails',
      reproductionSteps: ['step 1'],
      expectedBehavior: 'pass',
      actualBehavior: 'fail',
      severity: 'major',
      category: 'implementation-bug',
      reportedAt: new Date(),
    };
    const summary = summarizeChanges(report);
    expect(summary).toContain('Login fails');
    expect(summary).toContain('major');
    expect(summary).toContain('implementation-bug');
  });
});

// ── 상수 검증 ─────────────────────────────────────────────────

describe('키워드 상수', () => {
  it('CRITICAL_KEYWORDS가 비어 있지 않다', () => {
    expect(CRITICAL_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('MAJOR_KEYWORDS가 비어 있지 않다', () => {
    expect(MAJOR_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('MINOR_KEYWORDS가 비어 있지 않다', () => {
    expect(MINOR_KEYWORDS.length).toBeGreaterThan(0);
  });
});
