/**
 * 버그 리포트 팩토리 / Bug Report factory and severity helpers
 *
 * @description
 * KR: BugReport 생성, 심각도 분류, 대상 Phase 결정 로직.
 *     BugEscalator에서 분리된 순수 함수들.
 * EN: BugReport creation, severity classification, and target phase
 *     determination logic. Pure functions extracted from BugEscalator.
 */

import { AgentError } from 'core/errors.js';
import type { Phase, Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { ContinuousE2EResult } from 'layer3/bug-escalator-types.js';
import type { BugReport, BugSeverity, TestFailure } from 'layer3/types.js';

// ── 심각도 분류 키워드 / Severity classification keywords ────────

/** critical 심각도 키워드 / Critical severity keywords */
export const CRITICAL_KEYWORDS: readonly string[] = [
  'crash',
  'fatal',
  'segfault',
  'oom',
  'data loss',
  'security',
  'injection',
];

/** major 심각도 키워드 / Major severity keywords */
export const MAJOR_KEYWORDS: readonly string[] = [
  'error',
  'exception',
  'failed',
  'timeout',
  'undefined',
  'null',
];

/** WHY: UI 관련 특정 키워드는 minor로 분류 (low보다 한 단계 위) */
export const MINOR_KEYWORDS: readonly string[] = ['font', 'minor'];

// ── 순수 함수 / Pure functions ────────────────────────────────────

/**
 * 에러 메시지에서 심각도를 분류한다 / Classify severity from error message
 *
 * @param errorMessage - 에러 메시지 / Error message
 * @returns 심각도 / Severity level
 */
export function classifySeverity(errorMessage: string): BugSeverity {
  const lowerMessage = errorMessage.toLowerCase();

  for (const keyword of CRITICAL_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return 'critical';
    }
  }

  for (const keyword of MAJOR_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return 'major';
    }
  }

  for (const keyword of MINOR_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return 'minor';
    }
  }

  return 'low';
}

/**
 * FailureType을 BugSeverity로 매핑한다 / Map FailureType to BugSeverity
 *
 * @param failureType - 실패 유형 / Failure type from FailureHandler
 * @returns 버그 심각도 / Bug severity
 */
export function mapFailureTypeToBugSeverity(failureType: string): BugSeverity {
  switch (failureType) {
    case 'design_flaw':
      return 'critical';
    case 'implementation_bug':
      return 'high';
    case 'test_gap':
      return 'medium';
    case 'spec_ambiguity':
      return 'medium';
    case 'infrastructure':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * 심각도에 따라 대상 Phase를 결정한다 / Determine target phase based on severity
 *
 * @param severity - 심각도 / Severity level
 * @returns 대상 Phase / Target phase
 */
export function determineTargetPhase(severity: BugSeverity): Phase {
  switch (severity) {
    case 'critical':
      return 'CODE';
    case 'major':
    case 'high':
      return 'TEST';
    case 'medium':
      return 'TEST';
    case 'minor':
    case 'low':
      return 'VERIFY';
  }
}

/**
 * 변경 사항을 요약한다 / Summarize changes from a bug report
 *
 * @param bugReport - 버그 리포트 / Bug report
 * @returns 변경 사항 요약 / Changes summary
 */
export function summarizeChanges(bugReport: BugReport): string {
  return `버그 수정: ${bugReport.description}\n심각도: ${bugReport.severity}\n카테고리: ${bugReport.category}`;
}

/**
 * ContinuousE2EResult에서 BugReport를 생성한다 / Create a BugReport from a ContinuousE2EResult
 *
 * @param failedTest - 실패한 E2E 테스트 결과
 * @param severity - 미리 결정된 심각도
 * @param rootCause - 미리 결정된 근본 원인
 * @param counter - 리포트 카운터 (고유 ID용)
 * @returns 생성된 버그 리포트
 */
export function buildBugReportFromE2E(
  failedTest: ContinuousE2EResult,
  severity: BugSeverity,
  rootCause: string,
  counter: number,
): BugReport {
  return {
    id: `bug-${counter}`,
    projectId: failedTest.projectId,
    featureId: failedTest.featureId,
    title: `E2E 테스트 실패: ${failedTest.failedTest}`,
    description: `[${failedTest.failedTest}] ${rootCause}`,
    reproductionSteps: [
      'E2E 테스트 실행',
      `테스트 파일: ${failedTest.failedTest}`,
      `에러 발생: ${failedTest.errorMessage}`,
    ],
    expectedBehavior: '테스트 통과',
    actualBehavior: `테스트 실패: ${failedTest.errorMessage}`,
    severity,
    category: 'implementation-bug',
    rootCause,
    reportedAt: new Date(),
  };
}

/**
 * TestFailure에서 BugReport를 생성한다 / Create a BugReport from a TestFailure
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param testFailure - 테스트 실패 정보 / Test failure information
 * @param counter - 리포트 카운터 / Report counter (for unique ID)
 * @returns 생성된 버그 리포트 / Created bug report
 */
export function buildBugReport(
  projectId: string,
  testFailure: TestFailure,
  counter: number,
): Result<BugReport> {
  if (!projectId || projectId.trim() === '') {
    return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
  }

  if (!testFailure.error || testFailure.error.trim() === '') {
    return err(new AgentError('agent_invalid_input', '에러 메시지가 비어 있습니다'));
  }

  const severity = classifySeverity(testFailure.error);
  const phase = determineTargetPhase(severity);
  const rootCause = `근본 원인 분석 필요: ${testFailure.error}`;

  const bugReport: BugReport = {
    id: `bug-${counter}`,
    projectId,
    featureId: testFailure.featureId,
    title: `테스트 실패: ${testFailure.testName}`,
    description: `[${testFailure.testName}] ${rootCause}`,
    reproductionSteps: [
      '테스트 실행',
      `테스트 파일: ${testFailure.testName}`,
      `에러 발생: ${testFailure.error}`,
    ],
    expectedBehavior: '테스트 통과',
    actualBehavior: `테스트 실패: ${testFailure.error}`,
    severity,
    category: 'implementation-bug',
    rootCause,
    reportedAt: new Date(),
    phase,
  };

  return ok(bugReport);
}
