/**
 * 테스트 결과서 포맷터 / Test report formatter
 *
 * @description
 * KR: PI-014 — §8.6 테스트 결과서 상세 포맷팅.
 * EN: PI-014 — §8.6 detailed test report formatting.
 */

import type { TestReport } from 'layer2/user-checkpoint-types.js';

/**
 * 테스트 결과서를 상세 포맷팅한다 / Formats test report with detailed pass rates
 *
 * @param report - 테스트 보고서 / Test report
 * @returns 포맷팅된 문자열 / Formatted string
 */
export function formatTestReport(report: TestReport): string {
  const { integrationResults } = report;
  const lines: string[] = ['=== 통합 검증 결과 ==='];

  lines.push(`4중 검증: ${report.verificationSummary}`);
  lines.push('');

  // WHY: PI-014 — 통합 테스트 전체 통계 출력
  const totalTests = integrationResults.stepResults.reduce((sum, s) => sum + s.executedCount, 0);
  const totalFails = integrationResults.stepResults.reduce((sum, s) => sum + s.failCount, 0);
  const overallPassRate =
    totalTests > 0 ? (((totalTests - totalFails) / totalTests) * 100).toFixed(1) : 'N/A';
  lines.push(
    `통합 테스트: ${totalTests.toLocaleString()} 실행 / ${totalFails.toLocaleString()} 실패 / 전체 통과율 ${overallPassRate}%`,
  );

  if (integrationResults.stepResults.length === 0) {
    lines.push('  (테스트 결과 없음 — 통합 테스트 미실행)');
  } else {
    lines.push('');
    for (const step of integrationResults.stepResults) {
      const status = step.passed ? '✅ 통과' : '❌ 실패';
      const passRate =
        step.executedCount > 0
          ? `${(((step.executedCount - step.failCount) / step.executedCount) * 100).toFixed(1)}%`
          : 'N/A';
      lines.push(
        `  Step ${step.step} (${step.scope}): ${status} | 실행 ${step.executedCount.toLocaleString()}/${step.targetCount.toLocaleString()} | 통과율 ${passRate} | 실패 ${step.failCount.toLocaleString()}건`,
      );
    }

    if (integrationResults.failedAtStep !== undefined) {
      lines.push('');
      lines.push(`  ⚠️ Step ${integrationResults.failedAtStep}에서 중단됨`);
    }
  }

  // WHY: 생성된 파일 목록 출력
  if (report.generatedFiles.length > 0) {
    lines.push('');
    lines.push(`생성된 파일 (${report.generatedFiles.length}개):`);
    for (const file of report.generatedFiles) {
      lines.push(`  - ${file}`);
    }
  }

  return lines.join('\n');
}
