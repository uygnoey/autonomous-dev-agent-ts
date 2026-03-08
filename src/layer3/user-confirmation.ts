/**
 * 유저 확인 헬퍼 / User confirmation helper
 *
 * @description TTY 환경에서 유저 입력을 받거나 CI 환경에서 자동 승인한다.
 */

import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { BugReport } from 'layer3/types.js';

/**
 * 유저에게 버그 수정 사항 승인을 요청한다 / Request user approval for bug fixes.
 *
 * @param bugReport - 버그 리포트
 * @param changes - 변경 사항 요약
 * @param logger - 로거 인스턴스
 * @returns 유저 승인 여부
 */
export async function requestUserConfirmation(
  bugReport: BugReport,
  changes: string,
  logger: Logger,
): Promise<Result<boolean>> {
  logger.info('유저 재확인 요청', { bugId: bugReport.id, changes });

  // WHY: TTY가 있으면 실제 유저 입력을 대기, 없으면 자동 승인 (CI/테스트 환경)
  let userApproved = true;
  if (process.stdin.isTTY) {
    try {
      const readline = await import('node:readline/promises');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      logger.info('버그 수정 요약', { changes });
      const answer = await rl.question(
        `\n[버그 ${bugReport.id}] 수정 사항을 승인하시겠습니까? (y/n): `,
      );
      rl.close();
      userApproved = answer.trim().toLowerCase() === 'y';
    } catch (inputError) {
      logger.warn('유저 입력 실패 — 자동 승인', { error: String(inputError) });
      userApproved = true;
    }
  } else {
    logger.debug('TTY 없음 — 자동 승인 (CI/테스트 환경)');
  }

  logger.info('유저 재확인 완료', { approved: userApproved });
  return ok(userApproved);
}
