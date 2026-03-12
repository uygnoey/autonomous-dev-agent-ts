/**
 * Contract 검증 리포트 저장기 / Contract Verification Reporter
 *
 * @description
 * KR: ContractVerificationResult를 {projectPath}/docs/reports/handoff-verification-{timestamp}.md 에 저장한다.
 *     스펙 §6.7 — 심각도별 CLI 출력(✅/⚠️/❌)과 상세 리포트 파일 저장.
 * EN: Saves ContractVerificationResult to {projectPath}/docs/reports/handoff-verification-{timestamp}.md.
 *     Spec §6.7 — severity-based CLI output (✅/⚠️/❌) and detailed report file.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { ContractVerificationResult } from 'layer1/contract-verifier-types.js';
import type { HandoffPackage } from 'layer1/types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** 리포트 디렉토리 / Report output directory */
const REPORT_DIR = 'docs/reports';

// ── 공개 함수 / Public Functions ────────────────────────────────

/**
 * ContractVerificationResult를 CLI 출력 문자열로 포맷한다 / Format result as CLI summary string
 *
 * @description
 * KR: 스펙 §6.7의 CLI 출력 형식을 준수한다:
 *     ✅ 구조 검증: 통과 (기능 N개, 인수 조건 M개)
 *     ⚠️ 정합성 검증: 이슈 K건 [error/warning 목록]
 * EN: Produces CLI summary matching spec §6.7 format.
 *
 * @param result - 검증 결과 / Verification result
 * @param pkg - HandoffPackage / HandoffPackage
 * @returns CLI 출력 문자열 / CLI output string
 */
export function formatVerificationOutput(
  result: ContractVerificationResult,
  pkg: HandoffPackage,
): string {
  const featureCount = pkg.contract.features.length;
  // WHY: verificationMatrix는 boolean 플래그 객체 — 인수 조건 수는 features에서 집계
  const criteriaCount = pkg.contract.features.reduce(
    (sum, f) => sum + f.acceptanceCriteria.length,
    0,
  );
  const lines: string[] = [];

  if (result.passed) {
    lines.push(`✅ 구조 검증: 통과 (기능 ${featureCount}개, 인수 조건 ${criteriaCount}개)`);
    lines.push('✅ 정합성 검증: 이슈 없음');
  } else {
    const errors = result.issues.filter((i) => i.severity === 'error');
    const warnings = result.issues.filter((i) => i.severity === 'warning');

    if (errors.length > 0) {
      lines.push(`❌ 구조 검증: 실패 (error ${errors.length}건, warning ${warnings.length}건)`);
    } else {
      lines.push(`✅ 구조 검증: 통과 (기능 ${featureCount}개)`);
      lines.push(`⚠️ 정합성 검증: 이슈 ${warnings.length}건`);
    }

    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '  - [error]' : '  - [warning]';
      lines.push(`${icon} ${issue.field}: ${issue.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * 검증 리포트를 디스크에 저장한다 / Save verification report to disk
 *
 * @description
 * KR: {projectPath}/docs/reports/handoff-verification-{timestamp}.md 에 저장한다.
 * EN: Saves to {projectPath}/docs/reports/handoff-verification-{timestamp}.md.
 *
 * @param projectPath - 프로젝트 루트 경로 / Project root path
 * @param result - 검증 결과 / Verification result
 * @param pkg - HandoffPackage / HandoffPackage
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 저장된 파일 경로 / Saved file path
 */
export async function saveVerificationReport(
  projectPath: string,
  result: ContractVerificationResult,
  pkg: HandoffPackage,
  logger: Logger,
): Promise<Result<string>> {
  const reportDir = join(projectPath, REPORT_DIR);
  const timestamp = result.timestamp.toISOString().replace(/[:.]/g, '-');
  const filename = `handoff-verification-${timestamp}.md`;
  const filePath = join(reportDir, filename);

  try {
    await mkdir(reportDir, { recursive: true });

    const content = buildReportMarkdown(result, pkg);
    await Bun.write(filePath, content);

    logger.info('Contract 검증 리포트 저장', { filePath });
    return ok(filePath);
  } catch (cause) {
    const error = new Layer3Error(
      'layer3_deliverable_write_failed',
      `검증 리포트 저장 실패: ${filePath}`,
      cause,
    );
    logger.warn('Contract 검증 리포트 저장 실패', { filePath, error: error.message });
    return err(error);
  }
}

// ── 내부 함수 / Internal Functions ────────────────────────────────

/**
 * 리포트 마크다운 본문 생성 / Build report markdown content
 */
function buildReportMarkdown(result: ContractVerificationResult, pkg: HandoffPackage): string {
  const statusIcon = result.passed ? '✅' : '❌';
  const featureCount = pkg.contract.features.length;
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');

  const lines: string[] = [
    '# HandoffPackage 검증 리포트',
    '',
    '| 항목 | 값 |',
    '|------|-----|',
    `| 패키지 ID | \`${result.packageId}\` |`,
    `| 프로젝트 ID | \`${pkg.projectId}\` |`,
    `| 결과 | ${statusIcon} ${result.passed ? '통과' : '실패'} |`,
    `| 검증 모델 | \`${result.modelUsed}\` |`,
    `| 검증 시각 | ${result.timestamp.toISOString()} |`,
    `| 기능 수 | ${featureCount}개 |`,
    `| error | ${errors.length}건 |`,
    `| warning | ${warnings.length}건 |`,
    '',
  ];

  if (result.issues.length > 0) {
    lines.push('## 발견된 이슈');
    lines.push('');
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      lines.push(`- ${icon} **[${issue.severity}]** \`${issue.field}\`: ${issue.message}`);
    }
    lines.push('');
  }

  if (result.feedback) {
    lines.push('## AI 피드백');
    lines.push('');
    lines.push(result.feedback);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by adev — ${result.timestamp.toISOString()}*`);

  return lines.join('\n');
}
