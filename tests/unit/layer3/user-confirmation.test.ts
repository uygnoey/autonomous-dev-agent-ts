/**
 * UserConfirmation 단위 테스트 / User confirmation helper tests
 *
 * @description
 * KR: requestUserConfirmation 함수 테스트. TTY 없는 환경에서 자동 승인 로직 검증.
 * EN: Tests for requestUserConfirmation. Validates auto-approval in non-TTY env.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { requestUserConfirmation } from 'layer3/user-confirmation.js';
import type { BugReport } from 'layer3/types.js';

const logger = new ConsoleLogger('error');

function makeBugReport(overrides?: Partial<BugReport>): BugReport {
  return {
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
    ...overrides,
  };
}

describe('requestUserConfirmation', () => {
  // WHY: CI/테스트 환경에서는 stdin.isTTY가 false이므로 자동 승인

  it('TTY 없는 환경에서 자동 승인(true)을 반환한다', async () => {
    const result = await requestUserConfirmation(makeBugReport(), 'Fix auth', logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('Result.ok가 항상 true다 (에러 없음)', async () => {
    const result = await requestUserConfirmation(makeBugReport(), '', logger);
    expect(result.ok).toBe(true);
  });

  it('빈 changes 문자열에서도 정상 동작한다', async () => {
    const result = await requestUserConfirmation(makeBugReport(), '', logger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('다양한 bugReport id에서도 정상 동작한다', async () => {
    const result = await requestUserConfirmation(
      makeBugReport({ id: 'bug-999' }),
      'patch applied',
      logger,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('긴 changes 문자열에서도 정상 동작한다', async () => {
    const longChanges = 'x'.repeat(10_000);
    const result = await requestUserConfirmation(makeBugReport(), longChanges, logger);
    expect(result.ok).toBe(true);
  });
});
