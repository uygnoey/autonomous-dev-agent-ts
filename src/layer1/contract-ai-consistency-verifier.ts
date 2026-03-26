/**
 * Contract AI 정합성 검증기 / Contract AI Consistency Verifier
 *
 * @description
 * KR: architect + qa 에이전트를 활용하여 Contract의 정합성을 AI로 검증한다.
 *     §6.7에 따라 4가지 항목을 검증:
 *     1. 의존 기능 출력/입력 타입 호환
 *     2. 모든 인수 조건에 대응 테스트 카테고리 존재
 *     3. 모듈 책임 중복/누락
 *     4. 설계↔제약사항 모순
 * EN: Uses architect + qa agents to verify Contract consistency with AI.
 *     Verifies 4 items per §6.7:
 *     1. Dependency I/O type compatibility
 *     2. All acceptance criteria have matching test categories
 *     3. Module responsibility overlap/gaps
 *     4. Design vs constraint contradictions
 */

import { DEFAULT_VERIFIER_MODEL } from 'core/config-schema.js';
import type { AdevError } from 'core/errors.js';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type {
  ContractVerificationIssue,
  ContractVerificationResult,
} from 'layer1/contract-verifier-types.js';
import type { HandoffPackage } from 'layer1/types.js';

// ── 상수 / Constants ─────────────────────────────────────────────

/** 정합성 검증 모델 / Consistency verification model */
const CONSISTENCY_MODEL = DEFAULT_VERIFIER_MODEL;

/** architect 시스템 프롬프트 / Architect system prompt */
const ARCHITECT_SYSTEM_PROMPT = [
  'You are a strict architect verifier. Analyze the given Contract for consistency issues.',
  'Check these items:',
  '1. Dependency I/O compatibility: verify that dependent feature outputs match consuming feature inputs',
  '2. Module responsibility: check for overlap or gaps in module responsibilities',
  '3. Design vs constraints: detect contradictions between design decisions and stated constraints',
  '',
  'Respond with a JSON array of issues. Each issue: {"severity":"error"|"warning","field":"<area>","message":"<description>"}',
  'If no issues found, respond with an empty array: []',
].join('\n');

/** qa 시스템 프롬프트 / QA system prompt */
const QA_SYSTEM_PROMPT = [
  'You are a strict QA verifier. Analyze the given Contract for test coverage gaps.',
  'Check these items:',
  '1. All acceptance criteria must have at least one matching test category in testDefinitions',
  '2. Each test definition must map to a real acceptance criterion',
  '3. Test scope must cover all feature dependencies',
  '',
  'Respond with a JSON array of issues. Each issue: {"severity":"error"|"warning","field":"<area>","message":"<description>"}',
  'If no issues found, respond with an empty array: []',
].join('\n');

// ── 타입 / Types ────────────────────────────────────────────────

/**
 * AI 정합성 검증 의존성 / AI consistency verification dependencies
 */
export interface ContractAiConsistencyDeps {
  readonly claudeApi: ClaudeApi;
  readonly logger: Logger;
}

// ── 공개 클래스 / Public Class ────────────────────────────────────

/**
 * Contract AI 정합성 검증기 / Contract AI Consistency Verifier
 *
 * @description
 * KR: architect(구조/의존성/모듈)와 qa(테스트 커버리지) 두 AI 관점에서
 *     Contract의 정합성을 검증한다.
 * EN: Verifies Contract consistency from two AI perspectives:
 *     architect (structure/deps/modules) and qa (test coverage).
 *
 * @example
 * const verifier = new ContractAiConsistencyVerifier({ claudeApi, logger });
 * const result = await verifier.verify(handoffPackage);
 */
export class ContractAiConsistencyVerifier {
  private readonly claudeApi: ClaudeApi;
  private readonly logger: Logger;

  constructor(deps: ContractAiConsistencyDeps) {
    this.claudeApi = deps.claudeApi;
    this.logger = deps.logger.child({ module: 'contract-ai-consistency' });
  }

  /**
   * architect + qa AI 검증을 수행한다 / Runs architect + qa AI verification
   *
   * @param pkg - 검증할 HandoffPackage / HandoffPackage to verify
   * @param modelName - 사용할 모델 (선택) / Model to use (optional)
   * @returns 검증 결과 / Verification result
   */
  async verify(
    pkg: HandoffPackage,
    modelName: string = CONSISTENCY_MODEL,
  ): Promise<Result<ContractVerificationResult, AdevError>> {
    this.logger.info('Contract AI 정합성 검증 시작', { packageId: pkg.id });

    const contractSummary = buildContractSummary(pkg);

    // WHY: architect와 qa를 병렬로 실행하여 검증 시간 단축
    const [architectResult, qaResult] = await Promise.all([
      this.runAgentVerification('architect', ARCHITECT_SYSTEM_PROMPT, contractSummary, modelName),
      this.runAgentVerification('qa', QA_SYSTEM_PROMPT, contractSummary, modelName),
    ]);

    // WHY: 어느 한쪽이라도 API 에러 시 실패 반환
    if (!architectResult.ok) return architectResult;
    if (!qaResult.ok) return qaResult;

    const allIssues = [...architectResult.value, ...qaResult.value];
    const passed = allIssues.filter((i) => i.severity === 'error').length === 0;

    const feedback =
      allIssues.length > 0
        ? allIssues.map((i) => `[${i.severity}] ${i.field}: ${i.message}`).join('\n')
        : 'architect + qa AI 정합성 검증 통과';

    const result: ContractVerificationResult = {
      packageId: pkg.id,
      passed,
      issues: allIssues,
      feedback,
      modelUsed: modelName,
      escalated: false,
      timestamp: new Date(),
    };

    this.logger.info('Contract AI 정합성 검증 완료', {
      packageId: pkg.id,
      passed,
      issueCount: allIssues.length,
    });

    return ok(result);
  }

  /**
   * 단일 에이전트 관점의 검증을 실행한다 / Runs verification from single agent perspective
   *
   * @param agentRole - 에이전트 역할 / Agent role
   * @param systemPrompt - 시스템 프롬프트 / System prompt
   * @param contractSummary - 검증 대상 요약 / Contract summary for verification
   * @param modelName - 사용할 모델 / Model to use
   * @returns 이슈 목록 또는 에러 / Issue list or error
   */
  private async runAgentVerification(
    agentRole: 'architect' | 'qa',
    systemPrompt: string,
    contractSummary: string,
    modelName: string,
  ): Promise<Result<ContractVerificationIssue[], AdevError>> {
    this.logger.debug(`${agentRole} AI 정합성 검증 시작`);

    try {
      const apiResult = await this.claudeApi.createMessage(
        [{ role: 'user', content: contractSummary }],
        {
          model: modelName,
          system: systemPrompt,
          maxTokens: 2048,
        },
      );

      if (!apiResult.ok) {
        this.logger.error(`${agentRole} AI 검증 API 에러`, { code: apiResult.error.code });
        return err(apiResult.error);
      }

      const issues = parseIssuesFromResponse(apiResult.value.content, agentRole);
      this.logger.debug(`${agentRole} AI 정합성 검증 완료`, { issueCount: issues.length });

      return ok(issues);
    } catch (error: unknown) {
      const adevError = new AgentError(
        'agent_contract_consistency_error',
        `${agentRole} AI 정합성 검증 중 예외: ${String(error)}`,
        error,
      );
      this.logger.error(`${agentRole} AI 정합성 검증 예외`, { error: String(error) });
      return err(adevError);
    }
  }
}

// ── 내부 함수 / Internal Functions ────────────────────────────────

/**
 * Contract 요약을 빌드한다 / Builds contract summary for verification
 *
 * @param pkg - HandoffPackage
 * @returns 검증용 요약 문자열 / Summary string for verification
 */
function buildContractSummary(pkg: HandoffPackage): string {
  const features = pkg.contract.features.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    dependencies: f.dependencies,
    inputs: f.inputs,
    outputs: f.outputs,
    acceptanceCriteria: f.acceptanceCriteria,
  }));

  const testDefs = pkg.contract.testDefinitions.map((td) => ({
    featureId: td.featureId,
    categories: td.categories.map((c) => c.name),
    rules: td.rules,
  }));

  const summary = {
    projectId: pkg.projectId,
    features,
    testDefinitions: testDefs,
    implementationOrder: pkg.contract.implementationOrder,
    verificationMatrix: pkg.contract.verificationMatrix,
  };

  return [
    'Analyze the following Contract for consistency issues:',
    '',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

/**
 * AI 응답에서 이슈 목록을 파싱한다 / Parses issues from AI response
 *
 * @description
 * KR: JSON 배열 형식의 응답을 파싱한다. 파싱 실패 시 텍스트에서 FAIL/error 키워드를 탐색한다.
 * EN: Parses JSON array response. Falls back to keyword search on parse failure.
 *
 * @param content - AI 응답 텍스트 / AI response text
 * @param agentRole - 에이전트 역할 (이슈 field 접두사용) / Agent role for field prefix
 * @returns 파싱된 이슈 목록 / Parsed issue list
 */
function parseIssuesFromResponse(content: string, agentRole: string): ContractVerificationIssue[] {
  const trimmed = content.trim();

  // WHY: JSON 배열을 추출하기 위해 첫 번째 '[' ~ 마지막 ']' 범위를 파싱
  const startIdx = trimmed.indexOf('[');
  const endIdx = trimmed.lastIndexOf(']');

  if (startIdx >= 0 && endIdx > startIdx) {
    try {
      const jsonStr = trimmed.slice(startIdx, endIdx + 1);
      const parsed: unknown = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item): item is { severity: string; field: string; message: string } =>
              typeof item === 'object' &&
              item !== null &&
              'severity' in item &&
              'field' in item &&
              'message' in item,
          )
          .map((item) => ({
            severity: item.severity === 'error' ? ('error' as const) : ('warning' as const),
            field: `${agentRole}:${item.field}`,
            message: item.message,
          }));
      }
    } catch {
      // WHY: JSON 파싱 실패 시 텍스트 기반 폴백
    }
  }

  // WHY: JSON 파싱 실패 시 텍스트에서 문제 키워드를 탐색
  const upperContent = trimmed.toUpperCase();
  if (
    upperContent.includes('FAIL') ||
    upperContent.includes('ERROR') ||
    upperContent.includes('ISSUE')
  ) {
    return [
      {
        severity: 'warning',
        field: `${agentRole}:parse_fallback`,
        message: `AI 응답 JSON 파싱 실패. 원문: ${trimmed.slice(0, 200)}`,
      },
    ];
  }

  // WHY: 빈 배열도 아니고 문제 키워드도 없으면 이슈 없음으로 처리
  return [];
}
