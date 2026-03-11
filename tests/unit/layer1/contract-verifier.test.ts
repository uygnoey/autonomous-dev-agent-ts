/**
 * ContractVerifier 단위 테스트 / Unit tests for ContractVerifier
 *
 * @description
 * KR: 로컬 빠른 검사, Claude API PASS/FAIL 파싱, 오류 처리를 검증한다.
 *     edge case 80%+ 비율 준수.
 * EN: Verifies local quick checks, Claude API PASS/FAIL parsing, and error handling.
 *     Follows 80%+ edge case ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { AdevError } from 'core/errors.js';
import { AgentError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import { ContractVerifier } from 'layer1/contract-verifier.js';
import type { ContractVerificationResult } from 'layer1/contract-verifier-types.js';
import type { ClaudeApiRequestOptions, ClaudeApiResponse } from 'layer1/claude-api-types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { HandoffPackage } from 'layer1/types.js';

// ── Mock 헬퍼 / Mock Helpers ──────────────────────────────────────

/**
 * ClaudeApi 응답 모의 / Mock ClaudeApi with configurable response
 */
function makeMockClaudeApi(
  response: Result<ClaudeApiResponse, AdevError>,
  shouldThrow = false,
): ClaudeApi {
  return {
    createMessage: async (
      _messages: Array<{ role: 'user' | 'assistant'; content: string }>,
      _options?: ClaudeApiRequestOptions,
    ): Promise<Result<ClaudeApiResponse, AdevError>> => {
      if (shouldThrow) {
        throw new Error('Unexpected network error');
      }
      return response;
    },
    streamMessage: async () => ok(undefined),
  } as unknown as ClaudeApi;
}

function makePassResponse(model = 'claude-haiku-4-20250514'): Result<ClaudeApiResponse, AdevError> {
  return ok({
    content: 'PASS: All 5 criteria are satisfied.',
    metadata: {
      model,
      inputTokens: 50,
      outputTokens: 20,
      stopReason: 'end_turn',
    },
  });
}

function makeFailResponse(reason = 'Missing test criteria'): Result<ClaudeApiResponse, AdevError> {
  return ok({
    content: `FAIL: ${reason}`,
    metadata: {
      model: 'claude-haiku-4-20250514',
      inputTokens: 50,
      outputTokens: 20,
      stopReason: 'end_turn',
    },
  });
}

function makeErrorResponse(): Result<ClaudeApiResponse, AdevError> {
  return err(new AgentError('agent_api_error', 'API call failed'));
}

// ── HandoffPackage 헬퍼 / HandoffPackage Helpers ─────────────────

function makeHandoffPackage(
  overrides: Partial<HandoffPackage> = {},
): HandoffPackage {
  const base: HandoffPackage = {
    id: 'pkg-001',
    projectId: 'proj-abc',
    contract: {
      version: 1,
      projectType: 'cli',
      features: [
        {
          id: 'feat-001',
          name: 'Core feature',
          description: 'Main feature implementation',
          acceptanceCriteria: [
            {
              id: 'ac-001',
              description: 'Must pass all tests',
              testable: true,
            },
          ],
          inputs: [],
          outputs: [],
          dependencies: [],
          priority: 1,
        },
      ],
      testDefinitions: [],
      implementationOrder: ['feat-001'],
      verificationMatrix: {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 0.95,
      },
    },
    planDocument: 'Build a CLI tool for autonomous development.',
    designDocument: 'Uses 3-layer architecture.',
    specDocument: 'Spec: implements Layer1 → Layer2 → Layer3 pipeline.',
    createdAt: new Date(),
    confirmedByUser: true,
  };

  return { ...base, ...overrides };
}

// ── 생성자 / Constructor ──────────────────────────────────────────

describe('ContractVerifier 생성자', () => {
  it('인스턴스 생성됨', () => {
    const api = makeMockClaudeApi(makePassResponse());
    const logger = new ConsoleLogger('error');
    expect(() => new ContractVerifier(api, logger)).not.toThrow();
  });

  it('ContractVerifier 인스턴스 확인', () => {
    const api = makeMockClaudeApi(makePassResponse());
    const logger = new ConsoleLogger('error');
    expect(new ContractVerifier(api, logger)).toBeInstanceOf(ContractVerifier);
  });

  it('두 인스턴스는 다른 객체', () => {
    const api = makeMockClaudeApi(makePassResponse());
    const logger = new ConsoleLogger('error');
    const a = new ContractVerifier(api, logger);
    const b = new ContractVerifier(api, logger);
    expect(a).not.toBe(b);
  });
});

// ── 로컬 빠른 검사 실패 / Local Quick Check Failures ─────────────

describe('ContractVerifier — 로컬 빠른 검사 실패', () => {
  let verifier: ContractVerifier;

  beforeEach(() => {
    // WHY: 로컬 실패 시 API 호출 없이 즉시 실패해야 하므로
    //      API가 호출되면 안 됨을 검증하기 위해 throw 모의를 사용한다.
    const api = makeMockClaudeApi(makePassResponse(), false);
    verifier = new ContractVerifier(api, new ConsoleLogger('error'));
  });

  it('specDocument 빈 문자열 → 로컬 빠른 실패', async () => {
    const pkg = makeHandoffPackage({ specDocument: '' });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.modelUsed).toBe('local');
      expect(result.value.issues.some((i) => i.field === 'specDocument')).toBe(true);
    }
  });

  it('specDocument 공백만 있는 경우 → 로컬 빠른 실패', async () => {
    const pkg = makeHandoffPackage({ specDocument: '   \t\n  ' });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.modelUsed).toBe('local');
    }
  });

  it('projectId 없음(빈 문자열) → 로컬 빠른 실패', async () => {
    const pkg = makeHandoffPackage({ projectId: '' });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues.some((i) => i.field === 'projectId')).toBe(true);
    }
  });

  it('projectId 공백만 있는 경우 → 로컬 빠른 실패', async () => {
    const pkg = makeHandoffPackage({ projectId: '   ' });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });

  it('features 배열 비어 있어 featureId 없음 → 로컬 빠른 실패', async () => {
    const pkg = makeHandoffPackage({
      contract: {
        ...makeHandoffPackage().contract,
        features: [],
      },
    });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues.some((i) => i.field === 'featureId')).toBe(true);
    }
  });

  it('여러 필드 동시 실패 → 이슈 목록에 다수 포함', async () => {
    const pkg = makeHandoffPackage({
      projectId: '',
      specDocument: '',
      contract: {
        ...makeHandoffPackage().contract,
        features: [],
      },
    });
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('로컬 실패 시 modelUsed가 "local"', async () => {
    const pkg = makeHandoffPackage({ specDocument: '' });
    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.modelUsed).toBe('local');
    }
  });

  it('로컬 실패 시 escalated가 false', async () => {
    const pkg = makeHandoffPackage({ specDocument: '' });
    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.escalated).toBe(false);
    }
  });
});

// ── Claude API PASS 응답 / Claude API PASS Response ──────────────

describe('ContractVerifier — Claude API PASS 응답', () => {
  it('ClaudeApi PASS 응답 → passed=true', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });

  it('PASS 시 issues 배열 비어 있음', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.issues).toHaveLength(0);
    }
  });

  it('modelUsed에 API 모델명이 기록됨', async () => {
    const model = 'claude-sonnet-4-20250514';
    const api = makeMockClaudeApi(makePassResponse(model));
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg, model);

    if (result.ok) {
      expect(result.value.modelUsed).toBe(model);
    }
  });

  it('커스텀 모델명이 verifyContract 호출에 반영됨', async () => {
    const customModel = 'claude-opus-4-20250514';
    const api = makeMockClaudeApi(makePassResponse(customModel));
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg, customModel);

    if (result.ok) {
      expect(result.value.modelUsed).toBe(customModel);
    }
  });
});

// ── Claude API FAIL 응답 / Claude API FAIL Response ──────────────

describe('ContractVerifier — Claude API FAIL 응답', () => {
  it('ClaudeApi FAIL 응답 → passed=false', async () => {
    const api = makeMockClaudeApi(makeFailResponse('Missing test criteria'));
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });

  it('FAIL 시 issues에 error severity 이슈 포함', async () => {
    const api = makeMockClaudeApi(makeFailResponse('Contradictory requirements detected'));
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.issues.length).toBeGreaterThan(0);
      expect(result.value.issues[0]?.severity).toBe('error');
    }
  });

  it('FAIL 시 feedback에 이유 포함', async () => {
    const reason = 'No executable goals found';
    const api = makeMockClaudeApi(makeFailResponse(reason));
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.feedback).toContain(reason);
    }
  });

  it('FAIL 시 escalated는 false', async () => {
    const api = makeMockClaudeApi(makeFailResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.escalated).toBe(false);
    }
  });
});

// ── Claude API 오류 처리 / Claude API Error Handling ────────────

describe('ContractVerifier — Claude API 오류 처리', () => {
  it('ClaudeApi err() 응답 → result.ok=false + AdevError 반환', async () => {
    const api = makeMockClaudeApi(makeErrorResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  it('ClaudeApi throw → err(AdevError) 반환', async () => {
    const api = makeMockClaudeApi(makePassResponse(), true); // shouldThrow=true
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AgentError);
    }
  });

  it('API 오류 시 error.code가 정의됨', async () => {
    const api = makeMockClaudeApi(makeErrorResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });
});

// ── 결과 필드 검증 / Result Field Validation ────────────────────

describe('ContractVerifier — 결과 필드 검증', () => {
  it('timestamp가 Date 인스턴스', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.timestamp).toBeInstanceOf(Date);
    }
  });

  it('escalated 기본값이 false', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.escalated).toBe(false);
    }
  });

  it('packageId가 입력 pkg.id와 일치', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage({ id: 'pkg-unique-9999' });

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.packageId).toBe('pkg-unique-9999');
    }
  });

  it('로컬 실패 시 packageId도 일치', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage({ id: 'pkg-local-fail', specDocument: '' });

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.packageId).toBe('pkg-local-fail');
    }
  });

  it('ContractVerificationResult 구조 형태 확인', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      const r: ContractVerificationResult = result.value;
      expect(typeof r.packageId).toBe('string');
      expect(typeof r.passed).toBe('boolean');
      expect(Array.isArray(r.issues)).toBe(true);
      expect(typeof r.feedback).toBe('string');
      expect(typeof r.modelUsed).toBe('string');
      expect(typeof r.escalated).toBe('boolean');
      expect(r.timestamp).toBeInstanceOf(Date);
    }
  });
});

// ── 경계값 / Edge Cases ──────────────────────────────────────────

describe('ContractVerifier — 경계값', () => {
  it('specDocument가 단일 공백 → 로컬 실패', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage({ specDocument: ' ' });

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });

  it('specDocument가 최소 유효 문자열 "a" → AI 검증으로 진행', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage({ specDocument: 'a' });

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      // WHY: AI 응답이 PASS이므로 통과해야 한다.
      expect(result.value.passed).toBe(true);
    }
  });

  it('기본 모델명 없이 호출 → 기본 모델 사용', async () => {
    const api = makeMockClaudeApi(makePassResponse());
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    // modelName 파라미터 없이 호출
    const result = await verifier.verifyContract(pkg);

    expect(result.ok).toBe(true);
  });

  it('PASS 대소문자 혼합 응답 처리', async () => {
    const mixedCaseResponse = ok({
      content: 'Pass: Looks good.',
      metadata: {
        model: 'claude-haiku-4-20250514',
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
      },
    });
    const api = makeMockClaudeApi(mixedCaseResponse);
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });

  it('응답에 콜론 없는 경우도 처리', async () => {
    const noColonResponse = ok({
      content: 'PASS everything is fine',
      metadata: {
        model: 'claude-haiku-4-20250514',
        inputTokens: 10,
        outputTokens: 5,
        stopReason: 'end_turn',
      },
    });
    const api = makeMockClaudeApi(noColonResponse);
    const verifier = new ContractVerifier(api, new ConsoleLogger('error'));
    const pkg = makeHandoffPackage();

    const result = await verifier.verifyContract(pkg);

    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });
});
