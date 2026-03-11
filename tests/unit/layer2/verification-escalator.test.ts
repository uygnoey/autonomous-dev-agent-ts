/**
 * VerificationEscalator 단위 테스트 / VerificationEscalator unit tests
 *
 * @description
 * KR: haiku → sonnet → opus 에스컬레이션 체인 검증.
 *     에지 케이스 80%+ 비율 준수.
 *     - 각 단계별 성공/실패
 *     - opus 단독 모드
 *     - opusEscalationOnFailure 플래그 동작
 *     - stepFn throw 처리
 *     - attempts 배열 기록 정확도
 *     - feedback 전달 정확도
 * EN: Tests for haiku → sonnet → opus escalation chain.
 *     80%+ edge case ratio as per testing rules.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { AdevError } from 'core/errors.js';
import { VerificationEscalator } from 'layer2/verification-escalator.js';
import type { EscalationStepFn } from 'layer2/verification-escalator-types.js';
import type { VerificationConfig } from 'core/config.js';

// ── 헬퍼 ────────────────────────────────────────────────────

function makeConfig(
  layer1Model: 'opus' | 'sonnet',
  opusEscalationOnFailure: boolean,
): VerificationConfig {
  return { layer1Model, adevModel: 'sonnet', opusEscalationOnFailure };
}

/** 항상 통과하는 stepFn */
function alwaysPass(feedback = '통과'): EscalationStepFn {
  return async (_modelId: string) => ({ passed: true, feedback });
}

/** 항상 실패하는 stepFn */
function alwaysFail(feedback = '실패'): EscalationStepFn {
  return async (_modelId: string) => ({ passed: false, feedback });
}

/** N번 실패 후 통과하는 stepFn */
function failNThenPass(n: number, failFeedback = '실패', passFeedback = '통과'): EscalationStepFn {
  let callCount = 0;
  return async (_modelId: string) => {
    callCount += 1;
    if (callCount <= n) {
      return { passed: false, feedback: failFeedback };
    }
    return { passed: true, feedback: passFeedback };
  };
}

/** throw를 발생시키는 stepFn */
function throwingStep(message = '예외 발생'): EscalationStepFn {
  return async (_modelId: string) => {
    throw new Error(message);
  };
}

const logger = new ConsoleLogger('error');
let escalator: VerificationEscalator;

beforeEach(() => {
  escalator = new VerificationEscalator(logger);
});

// ── 기본 동작 ────────────────────────────────────────────────

describe('VerificationEscalator 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => new VerificationEscalator(logger)).not.toThrow();
  });
});

// ── 정상 케이스 (20%) ────────────────────────────────────────

describe('haiku 첫 시도 성공', () => {
  it('즉시 반환, attempts 1개', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(alwaysPass('haiku 통과'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(true);
    expect(result.value.attempts).toHaveLength(1);
    expect(result.value.attempts[0]?.model).toBe('haiku');
    expect(result.value.attempts[0]?.passed).toBe(true);
    expect(result.value.feedback).toBe('haiku 통과');
    expect(result.value.modelUsed).toBe('claude-haiku-4-5-20251001');
  });
});

// ── 에지 케이스 (80%+) ───────────────────────────────────────

describe('haiku 실패 → sonnet 성공', () => {
  it('attempts 2개, sonnet 모델 기록', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(failNThenPass(1, 'haiku 실패', 'sonnet 통과'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(true);
    expect(result.value.attempts).toHaveLength(2);
    expect(result.value.attempts[0]?.model).toBe('haiku');
    expect(result.value.attempts[0]?.passed).toBe(false);
    expect(result.value.attempts[1]?.model).toBe('sonnet');
    expect(result.value.attempts[1]?.passed).toBe(true);
    expect(result.value.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.value.feedback).toBe('sonnet 통과');
  });
});

describe('haiku + sonnet 실패 → opus 성공 (opusEscalationOnFailure=true)', () => {
  it('attempts 3개, opus 모델 기록', async () => {
    const config = makeConfig('sonnet', true);
    const result = await escalator.escalate(failNThenPass(2, '실패', 'opus 통과'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passed).toBe(true);
    expect(result.value.attempts).toHaveLength(3);
    expect(result.value.attempts[0]?.model).toBe('haiku');
    expect(result.value.attempts[1]?.model).toBe('sonnet');
    expect(result.value.attempts[2]?.model).toBe('opus');
    expect(result.value.attempts[2]?.passed).toBe(true);
    expect(result.value.modelUsed).toBe('claude-opus-4-6');
    expect(result.value.feedback).toBe('opus 통과');
  });
});

describe('모든 단계 실패 → err(AdevError)', () => {
  it('opusEscalationOnFailure=true 일 때 3단계 모두 실패 → err', async () => {
    const config = makeConfig('sonnet', true);
    const result = await escalator.escalate(alwaysFail('전부 실패'), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AdevError);
    expect(result.error.code).toBe('verification_escalation_failed');
  });

  it('opusEscalationOnFailure=false 일 때 2단계 실패 → err', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(alwaysFail(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AdevError);
    expect(result.error.code).toBe('verification_escalation_failed');
  });
});

describe('layer1Model=opus → opus 단일 시도', () => {
  it('haiku/sonnet 건너뜀, attempts 1개', async () => {
    const config = makeConfig('opus', true);
    const callLog: string[] = [];

    const stepFn: EscalationStepFn = async (modelId: string) => {
      callLog.push(modelId);
      return { passed: true, feedback: 'opus 통과' };
    };

    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(callLog).toHaveLength(1);
    expect(callLog[0]).toBe('claude-opus-4-6');
    expect(result.value.attempts).toHaveLength(1);
    expect(result.value.attempts[0]?.model).toBe('opus');
    expect(result.value.modelUsed).toBe('claude-opus-4-6');
  });

  it('opus 실패 시 더 이상 에스컬레이션 없이 err 반환', async () => {
    const config = makeConfig('opus', true);
    const result = await escalator.escalate(alwaysFail('opus 실패'), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('verification_escalation_failed');
  });
});

describe('opusEscalationOnFailure=false → haiku→sonnet만 시도 (opus 미시도)', () => {
  it('opus 모델 ID가 callLog에 없음', async () => {
    const config = makeConfig('sonnet', false);
    const callLog: string[] = [];

    const stepFn: EscalationStepFn = async (modelId: string) => {
      callLog.push(modelId);
      return { passed: false, feedback: '실패' };
    };

    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(false);
    expect(callLog).not.toContain('claude-opus-4-6');
    expect(callLog).toContain('claude-haiku-4-5-20251001');
    expect(callLog).toContain('claude-sonnet-4-6');
    expect(callLog).toHaveLength(2);
  });
});

describe('stepFn throw → err 반환 (throw 전파 안 함)', () => {
  it('err(AdevError) 반환, throw 전파되지 않음', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(throwingStep('의도적 예외'), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AdevError);
    expect(result.error.code).toBe('verification_escalation_failed');
    expect(result.error.message).toContain('의도적 예외');
  });

  it('opus 단독 모드에서 throw → err', async () => {
    const config = makeConfig('opus', true);
    const result = await escalator.escalate(throwingStep('opus 예외'), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('verification_escalation_failed');
  });
});

describe('최종 passed 시 modelUsed 정확히 기록', () => {
  it('sonnet 통과 → modelUsed = claude-sonnet-4-6', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(failNThenPass(1), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modelUsed).toBe('claude-sonnet-4-6');
  });

  it('opus 통과 → modelUsed = claude-opus-4-6', async () => {
    const config = makeConfig('sonnet', true);
    const result = await escalator.escalate(failNThenPass(2), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modelUsed).toBe('claude-opus-4-6');
  });
});

describe('attempts 배열에 모든 시도 기록 (성공 포함)', () => {
  it('haiku 성공 시에도 attempts[0] 기록됨', async () => {
    const config = makeConfig('sonnet', true);
    const result = await escalator.escalate(alwaysPass('통과'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attempts).toHaveLength(1);
    expect(result.value.attempts[0]?.passed).toBe(true);
    expect(result.value.attempts[0]?.model).toBe('haiku');
  });

  it('3단계 모두 실패 시 attempts 3개 기록됨', async () => {
    const config = makeConfig('sonnet', true);
    const result = await escalator.escalate(alwaysFail(), config);

    expect(result.ok).toBe(false);
    // attempts는 err 반환 전에 기록됨 — AdevError 메시지로 확인
    if (result.ok) return;
    expect(result.error.message).toContain('haiku');
    expect(result.error.message).toContain('sonnet');
    expect(result.error.message).toContain('opus');
  });
});

describe('feedback이 최종 성공 단계 피드백과 일치', () => {
  it('haiku 성공 → feedback = haiku 피드백', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(alwaysPass('haiku 특별 피드백'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feedback).toBe('haiku 특별 피드백');
  });

  it('sonnet 성공 → feedback = sonnet 피드백', async () => {
    const config = makeConfig('sonnet', false);
    const result = await escalator.escalate(failNThenPass(1, '실패', 'sonnet 특별 피드백'), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feedback).toBe('sonnet 특별 피드백');
  });
});

describe('빈 feedback 처리 (빈 문자열 방어)', () => {
  it('stepFn이 빈 feedback 반환 시 빈 문자열로 기록', async () => {
    const config = makeConfig('sonnet', false);
    const stepFn: EscalationStepFn = async (_modelId: string) => ({ passed: true, feedback: '' });
    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feedback).toBe('');
  });

  it('실패 시 빈 feedback → failureReason 빈 문자열', async () => {
    const config = makeConfig('sonnet', false);
    const stepFn: EscalationStepFn = async (_modelId: string) => ({
      passed: false,
      feedback: '',
    });
    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(false);
    // 빈 feedback도 에러 없이 처리됨
    if (result.ok) return;
    expect(result.error.code).toBe('verification_escalation_failed');
  });
});

describe('VerificationConfig.layer1Model 미지정 동작 방어', () => {
  it('layer1Model=sonnet, opusEscalationOnFailure=true 기본 체인 haiku→sonnet→opus', async () => {
    const config = makeConfig('sonnet', true);
    const callLog: string[] = [];

    // 마지막(opus)에서 통과
    const stepFn: EscalationStepFn = async (modelId: string) => {
      callLog.push(modelId);
      const isOpus = modelId === 'claude-opus-4-6';
      return { passed: isOpus, feedback: isOpus ? '통과' : '실패' };
    };

    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(true);
    expect(callLog).toEqual([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
    ]);
  });

  it('failureReason은 실패한 단계 피드백을 담는다', async () => {
    const config = makeConfig('sonnet', false);
    const callLog: { modelId: string; feedback: string }[] = [];

    const stepFn: EscalationStepFn = async (modelId: string) => {
      const feedback = `${modelId} 실패 이유`;
      callLog.push({ modelId, feedback });
      return { passed: false, feedback };
    };

    const result = await escalator.escalate(stepFn, config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // AdevError 메시지에 실패 이유가 포함됨
    expect(result.error.message).toContain('claude-haiku-4-5-20251001 실패 이유');
  });
});
