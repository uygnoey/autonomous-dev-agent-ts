/**
 * UserCheckpoint.requestConfirmation 단위 테스트 / UserCheckpoint.requestConfirmation unit tests
 *
 * @description
 * KR: PI-010 유저 확인 CLI 인터랙션 테스트.
 *     approve/revise/revise_integration 각 분기와 잘못된 입력 재시도를 검증한다.
 * EN: Tests for PI-010 user confirmation CLI interaction.
 *     Verifies approve/revise/revise_integration branches and invalid input retry.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { TestReport, UserInputProvider } from 'layer2/user-checkpoint.js';
import { UserCheckpoint } from 'layer2/user-checkpoint.js';

const logger = new ConsoleLogger('error');

// ── Mock UserInputProvider ──────────────────────────────────────

class MockUserInputProvider implements UserInputProvider {
  private responses: Array<{ type: string; text?: string }> = [];
  readonly systemMessages: string[] = [];
  readonly successMessages: string[] = [];
  private responseIndex = 0;

  addResponse(type: string, text?: string): void {
    this.responses.push({ type, text });
  }

  system(message: string): void {
    this.systemMessages.push(message);
  }

  success(message: string): void {
    this.successMessages.push(message);
  }

  async waitForInput(): Promise<{ type: string; text?: string }> {
    const response = this.responses[this.responseIndex];
    this.responseIndex += 1;
    return response ?? { type: 'interrupt' };
  }
}

function makeTestReport(overrides?: Partial<TestReport>): TestReport {
  return {
    verificationSummary: 'qa_qc: 통과 → reviewer: 통과 → layer1: 통과 → adev: 통과',
    integrationResults: {
      allPassed: true,
      stepResults: [
        { step: 1, scope: 'modified', targetCount: 100_000, executedCount: 50, passed: true, failCount: 0 },
        { step: 2, scope: 'related', targetCount: 10_000, executedCount: 20, passed: true, failCount: 0 },
      ],
    },
    generatedFiles: ['src/feature.ts', 'tests/unit/feature.test.ts'],
    ...overrides,
  };
}

// ── approve 분기 / approve branch ───────────────────────────────

describe('requestConfirmation — approve', () => {
  let checkpoint: UserCheckpoint;
  let provider: MockUserInputProvider;

  beforeEach(() => {
    checkpoint = new UserCheckpoint(logger);
    provider = new MockUserInputProvider();
  });

  it('approve 입력 시 approve 반환', async () => {
    provider.addResponse('message', 'approve');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
    expect(result.feedback).toBeUndefined();
  });

  it('승인 입력 시 approve 반환', async () => {
    provider.addResponse('message', '승인');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
  });

  it('interrupt 이벤트 시 approve 반환', async () => {
    provider.addResponse('interrupt');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
  });

  it('eof 이벤트 시 approve 반환', async () => {
    provider.addResponse('eof');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
  });
});

// ── revise 분기 / revise branch ─────────────────────────────────

describe('requestConfirmation — revise', () => {
  let checkpoint: UserCheckpoint;
  let provider: MockUserInputProvider;

  beforeEach(() => {
    checkpoint = new UserCheckpoint(logger);
    provider = new MockUserInputProvider();
  });

  it('revise 입력 + 피드백 시 revise + feedback 반환', async () => {
    provider.addResponse('message', 'revise');
    provider.addResponse('message', '에러 처리 추가 필요');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('revise');
    expect(result.feedback).toBe('에러 처리 추가 필요');
  });

  it('수정 입력 시 revise 반환', async () => {
    provider.addResponse('message', '수정');
    provider.addResponse('message', '');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('revise');
    expect(result.feedback).toBeUndefined();
  });

  it('revise 후 빈 피드백 시 feedback undefined', async () => {
    provider.addResponse('message', 'revise');
    provider.addResponse('message', '  ');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('revise');
    expect(result.feedback).toBeUndefined();
  });
});

// ── revise_integration 분기 ─────────────────────────────────────

describe('requestConfirmation — revise_integration', () => {
  let checkpoint: UserCheckpoint;
  let provider: MockUserInputProvider;

  beforeEach(() => {
    checkpoint = new UserCheckpoint(logger);
    provider = new MockUserInputProvider();
  });

  it('revise_integration 입력 시 반환', async () => {
    provider.addResponse('message', 'revise_integration');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('revise_integration');
    expect(result.feedback).toBeUndefined();
  });

  it('재검증 입력 시 revise_integration 반환', async () => {
    provider.addResponse('message', '재검증');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('revise_integration');
  });
});

// ── 잘못된 입력 재시도 / invalid input retry ─────────────────────

describe('requestConfirmation — 잘못된 입력 재시도', () => {
  let checkpoint: UserCheckpoint;
  let provider: MockUserInputProvider;

  beforeEach(() => {
    checkpoint = new UserCheckpoint(logger);
    provider = new MockUserInputProvider();
  });

  it('잘못된 입력 후 올바른 입력으로 성공', async () => {
    provider.addResponse('message', 'invalid');
    provider.addResponse('message', 'approve');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
    // WHY: 잘못된 입력에 대한 안내 메시지 출력 확인
    expect(provider.systemMessages.some((m) => m.includes('잘못된 입력'))).toBe(true);
  });

  it('빈 text의 message 이벤트 시 재시도', async () => {
    provider.addResponse('message', '');
    provider.addResponse('message', 'approve');
    const result = await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(result.decision).toBe('approve');
  });
});

// ── 출력 검증 / output verification ──────────────────────────────

describe('requestConfirmation — 출력 형식', () => {
  let checkpoint: UserCheckpoint;
  let provider: MockUserInputProvider;

  beforeEach(() => {
    checkpoint = new UserCheckpoint(logger);
    provider = new MockUserInputProvider();
  });

  it('검증 결과 요약이 출력된다', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(provider.systemMessages.some((m) => m.includes('통합 검증 결과'))).toBe(true);
    expect(provider.systemMessages.some((m) => m.includes('4중 검증'))).toBe(true);
  });

  it('통합 테스트 실행/실패 수가 출력된다', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(provider.systemMessages.some((m) => m.includes('70 실행'))).toBe(true);
    expect(provider.systemMessages.some((m) => m.includes('0 실패'))).toBe(true);
  });

  it('단계별 결과가 출력된다', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(provider.systemMessages.some((m) => m.includes('Step 1'))).toBe(true);
    expect(provider.systemMessages.some((m) => m.includes('Step 2'))).toBe(true);
  });

  it('생성된 파일 목록이 출력된다', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(provider.systemMessages.some((m) => m.includes('src/feature.ts'))).toBe(true);
  });

  it('입력 안내 메시지가 출력된다', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(makeTestReport(), provider);
    expect(provider.systemMessages.some((m) => m.includes('approve'))).toBe(true);
    expect(provider.systemMessages.some((m) => m.includes('revise'))).toBe(true);
  });

  it('생성된 파일이 없으면 파일 목록 미출력', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(
      makeTestReport({ generatedFiles: [] }),
      provider,
    );
    expect(provider.systemMessages.some((m) => m.includes('생성된 파일'))).toBe(false);
  });

  it('실패한 통합 테스트 결과 표시', async () => {
    provider.addResponse('message', 'approve');
    await checkpoint.requestConfirmation(
      makeTestReport({
        integrationResults: {
          allPassed: false,
          failedAtStep: 2,
          stepResults: [
            { step: 1, scope: 'modified', targetCount: 100_000, executedCount: 50, passed: true, failCount: 0 },
            { step: 2, scope: 'related', targetCount: 10_000, executedCount: 20, passed: false, failCount: 3 },
          ],
        },
      }),
      provider,
    );
    expect(provider.systemMessages.some((m) => m.includes('실패') && m.includes('Step 2'))).toBe(true);
  });
});
