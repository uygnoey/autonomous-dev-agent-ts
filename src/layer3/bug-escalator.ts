/**
 * 버그 에스컬레이터 / Bug Escalator
 *
 * @description
 * KR: E2E 테스트 실패를 버그 리포트로 변환하고 layer2로 에스컬레이션한다.
 *     심각도 기반으로 복귀 대상 Phase를 결정한다.
 *     - critical → CODE (즉시 수정)
 *     - major → TEST (테스트 보강 후 수정)
 *     - minor → VERIFY (검증 단계에서 처리)
 * EN: Converts E2E test failures into bug reports and escalates to layer2.
 *     Determines target phase based on severity classification.
 *     - critical → CODE (immediate fix)
 *     - major → TEST (fix after test reinforcement)
 *     - minor → VERIFY (handle during verification)
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Phase, Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { BugReport, TestFailure } from './types.js';

/**
 * 심각도 분류 키워드 매핑 / Severity classification keyword mapping
 *
 * @description
 * KR: 에러 메시지 키워드로 심각도를 추론한다.
 * EN: Infers severity from keywords in error messages.
 */
const CRITICAL_KEYWORDS: readonly string[] = [
  'crash',
  'fatal',
  'segfault',
  'oom',
  'data loss',
  'security',
  'injection',
];

const MAJOR_KEYWORDS: readonly string[] = [
  'error',
  'exception',
  'failed',
  'timeout',
  'undefined',
  'null',
];

/**
 * 심각도별 에스컬레이션 대상 Phase / Escalation target phase by severity
 */
const SEVERITY_PHASE_MAP: Readonly<Record<BugReport['severity'], Phase>> = {
  critical: 'CODE',
  major: 'TEST',
  minor: 'VERIFY',
};

/**
 * 버그 에스컬레이터 / Bug Escalator
 *
 * @description
 * KR: E2E 테스트 실패를 버그 리포트로 변환하고 대상 Phase를 결정한다.
 * EN: Converts E2E test failures into bug reports and determines target phase.
 *
 * @example
 * const escalator = new BugEscalator(logger);
 * const report = escalator.createReport('proj-1', failure);
 */
export class BugEscalator {
  private reportCounter = 0;
  private readonly activeReports: Map<string, BugReport> = new Map();
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'bug-escalator' });
  }

  /**
   * 테스트 실패에서 버그 리포트를 생성한다 / Creates a bug report from a test failure
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param failure - 테스트 실패 정보 / Test failure information
   * @returns 버그 리포트 / Bug report
   */
  createReport(projectId: string, failure: TestFailure): Result<BugReport> {
    if (!projectId.trim()) {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어있습니다'));
    }

    if (!failure.error.trim()) {
      return err(new AgentError('agent_invalid_input', '실패 에러 메시지가 비어있습니다'));
    }

    const severity = this.classifySeverity(failure.error);

    this.reportCounter += 1;
    const report: BugReport = {
      id: `bug-${this.reportCounter}`,
      projectId,
      featureId: failure.featureId,
      severity,
      description: `[${failure.testName}] ${failure.error}`,
      stackTrace: failure.error,
      phase: SEVERITY_PHASE_MAP[severity],
      reproducible: true,
      timestamp: new Date(),
    };

    this.activeReports.set(report.id, report);

    this.logger.warn('버그 리포트 생성', {
      reportId: report.id,
      projectId,
      featureId: failure.featureId,
      severity,
      testName: failure.testName,
    });

    return ok(report);
  }

  /**
   * 버그 리포트를 에스컬레이션한다 / Escalates a bug report to the target phase
   *
   * @param report - 버그 리포트 / Bug report
   * @returns 에스컬레이션 대상 Phase / Escalation target phase
   */
  escalate(report: BugReport): Result<{ targetPhase: Phase }> {
    const targetPhase = SEVERITY_PHASE_MAP[report.severity];

    this.logger.info('버그 에스컬레이션', {
      reportId: report.id,
      severity: report.severity,
      targetPhase,
    });

    return ok({ targetPhase });
  }

  /**
   * 활성 버그 리포트 목록을 반환한다 / Returns active bug reports for a project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 활성 버그 리포트 목록 / Active bug report list
   */
  getActiveReports(projectId: string): BugReport[] {
    const reports: BugReport[] = [];
    for (const report of this.activeReports.values()) {
      if (report.projectId === projectId) {
        reports.push(report);
      }
    }
    return reports;
  }

  /**
   * 버그 리포트를 해결 처리한다 / Resolves a bug report
   *
   * @param reportId - 버그 리포트 ID / Bug report ID
   * @returns 성공 여부 / Success result
   */
  resolveReport(reportId: string): Result<void> {
    if (!this.activeReports.has(reportId)) {
      return err(
        new AgentError('agent_invalid_input', `버그 리포트를 찾을 수 없습니다: ${reportId}`),
      );
    }

    this.activeReports.delete(reportId);

    this.logger.info('버그 리포트 해결', { reportId });

    return ok(undefined);
  }

  /**
   * 에러 메시지에서 심각도를 분류한다 / Classifies severity from error message
   *
   * @param errorMessage - 에러 메시지 / Error message
   * @returns 심각도 / Severity level
   */
  private classifySeverity(errorMessage: string): BugReport['severity'] {
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

    return 'minor';
  }
}
