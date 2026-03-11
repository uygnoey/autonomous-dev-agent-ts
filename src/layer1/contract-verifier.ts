/**
 * Contract AI 검증기 / Contract AI verifier
 *
 * @description
 * KR: ClaudeApi를 통해 HandoffPackage를 AI로 검증한다.
 *     로컬 빠른 검사(필수 필드)를 먼저 수행하고, 통과 시 Claude API를 호출한다.
 * EN: Uses ClaudeApi to verify a HandoffPackage with AI.
 *     Performs a quick local check (required fields) first,
 *     then calls the Claude API if it passes.
 */

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

/** 기본 검증 모델 / Default verification model */
const DEFAULT_VERIFY_MODEL = 'claude-haiku-4-20250514';

/** 검증 프롬프트 시스템 메시지 / Verification prompt system message */
const SYSTEM_PROMPT =
  'You are a strict contract verifier. Analyze the given HandoffPackage summary and respond with PASS or FAIL, followed by a colon and your reasoning. Format: "PASS: <reason>" or "FAIL: <reason>"';

// ── ContractVerifier ─────────────────────────────────────────────

/**
 * Contract AI 검증기 클래스 / Contract AI verifier class
 *
 * @description
 * KR: 로컬 빠른 검사 후 Claude API를 통해 HandoffPackage를 검증한다.
 * EN: Verifies HandoffPackage via local quick check then Claude API.
 *
 * @param claudeApi - Claude API 인스턴스 / Claude API instance
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const verifier = new ContractVerifier(claudeApi, logger);
 * const result = await verifier.verifyContract(pkg);
 */
export class ContractVerifier {
  private readonly claudeApi: ClaudeApi;
  private readonly logger: Logger;

  constructor(claudeApi: ClaudeApi, logger: Logger) {
    this.claudeApi = claudeApi;
    this.logger = logger.child({ module: 'contract-verifier' });
  }

  /**
   * HandoffPackage 검증 / Verify HandoffPackage
   *
   * @param pkg - 검증할 패키지 / Package to verify
   * @param modelName - 사용할 모델 (선택) / Model to use (optional)
   * @returns 검증 결과 또는 에러 / Verification result or error
   *
   * @example
   * const result = await verifier.verifyContract(pkg, 'claude-haiku-4-20250514');
   * if (result.ok) {
   *   console.log(result.value.passed);
   * }
   */
  async verifyContract(
    pkg: HandoffPackage,
    modelName: string = DEFAULT_VERIFY_MODEL,
  ): Promise<Result<ContractVerificationResult, AdevError>> {
    this.logger.debug('Contract 검증 시작 / Starting contract verification', { packageId: pkg.id });

    // WHY: 필수 필드 로컬 검사를 먼저 수행해 API 호출을 최소화한다.
    const localIssues = runLocalChecks(pkg);
    if (localIssues.length > 0) {
      const result: ContractVerificationResult = {
        packageId: pkg.id,
        passed: false,
        issues: localIssues,
        feedback: localIssues.map((i) => `[${i.field}] ${i.message}`).join('; '),
        modelUsed: 'local',
        escalated: false,
        timestamp: new Date(),
      };

      this.logger.warn('로컬 검사 실패 / Local check failed', {
        packageId: pkg.id,
        issueCount: localIssues.length,
      });

      return ok(result);
    }

    // WHY: 로컬 검사를 통과한 경우에만 Claude API를 호출한다.
    return this.runAiVerification(pkg, modelName);
  }

  /**
   * Claude API를 통한 AI 검증 / AI verification via Claude API
   *
   * @param pkg - 검증할 패키지 / Package to verify
   * @param modelName - 사용할 모델 / Model to use
   * @returns 검증 결과 또는 에러 / Verification result or error
   */
  private async runAiVerification(
    pkg: HandoffPackage,
    modelName: string,
  ): Promise<Result<ContractVerificationResult, AdevError>> {
    const prompt = buildVerificationPrompt(pkg);

    try {
      const apiResult = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
        model: modelName,
        system: SYSTEM_PROMPT,
        maxTokens: 1024,
      });

      if (!apiResult.ok) {
        this.logger.error('Claude API 오류 / Claude API error', { code: apiResult.error.code });
        return err(apiResult.error);
      }

      const { content, metadata } = apiResult.value;
      const parsed = parseAiResponse(content, pkg.id, metadata.model);

      this.logger.info('AI 검증 완료 / AI verification complete', {
        packageId: pkg.id,
        passed: parsed.passed,
        model: metadata.model,
      });

      return ok(parsed);
    } catch (error: unknown) {
      const adevError = new AgentError(
        'agent_contract_verify_error',
        `Contract 검증 중 예외 발생 / Exception during contract verification: ${String(error)}`,
        error,
      );
      this.logger.error('Contract 검증 예외 / Contract verification exception', {
        packageId: pkg.id,
        error: String(error),
      });
      return err(adevError);
    }
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 필수 필드 로컬 빠른 검사 / Quick local check of required fields
 *
 * @param pkg - 검사할 패키지 / Package to check
 * @returns 발견된 이슈 목록 / List of found issues
 */
function runLocalChecks(pkg: HandoffPackage): ContractVerificationIssue[] {
  const issues: ContractVerificationIssue[] = [];

  if (!pkg.projectId || pkg.projectId.trim().length === 0) {
    issues.push({
      severity: 'error',
      field: 'projectId',
      message: 'projectId가 없거나 비어 있습니다 / projectId is missing or empty',
    });
  }

  // WHY: HandoffPackage에 featureId가 없으므로 contract.features[0].id로 대체한다.
  const firstFeatureId = pkg.contract.features[0]?.id;
  if (!firstFeatureId || firstFeatureId.trim().length === 0) {
    issues.push({
      severity: 'error',
      field: 'featureId',
      message: 'contract.features[0].id가 없거나 비어 있습니다 / featureId is missing or empty',
    });
  }

  if (!pkg.specDocument || pkg.specDocument.trim().length === 0) {
    issues.push({
      severity: 'error',
      field: 'specDocument',
      message: 'specDocument가 없거나 비어 있습니다 / specDocument is missing or empty',
    });
  }

  return issues;
}

/**
 * AI 검증용 프롬프트 빌드 / Build AI verification prompt
 *
 * @param pkg - 검증할 패키지 / Package to verify
 * @returns 검증 프롬프트 / Verification prompt
 */
function buildVerificationPrompt(pkg: HandoffPackage): string {
  const summary = {
    packageId: pkg.id,
    projectId: pkg.projectId,
    featureCount: pkg.contract.features.length,
    specDocumentLength: pkg.specDocument.length,
    planDocumentLength: pkg.planDocument.length,
    confirmedByUser: pkg.confirmedByUser,
    verificationMatrix: pkg.contract.verificationMatrix,
  };

  return [
    'Please verify the following HandoffPackage summary against these 5 criteria:',
    '1. specDocument exists and is not empty',
    '2. projectId and featureId (from contract.features[0].id) and specDocument are present',
    '3. Executable implementation goals are clearly stated',
    '4. No contradictory requirements',
    '5. Test criteria are included',
    '',
    'Package Summary:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

/**
 * AI 응답 파싱 / Parse AI response
 *
 * @param content - AI 응답 텍스트 / AI response text
 * @param packageId - 패키지 ID / Package ID
 * @param modelUsed - 사용된 모델 / Model used
 * @returns 파싱된 검증 결과 / Parsed verification result
 */
function parseAiResponse(
  content: string,
  packageId: string,
  modelUsed: string,
): ContractVerificationResult {
  const trimmed = content.trim();
  const upperContent = trimmed.toUpperCase();

  const passed = upperContent.startsWith('PASS');

  // WHY: "PASS: reason" 또는 "FAIL: reason" 형식에서 reason을 추출한다.
  const colonIndex = trimmed.indexOf(':');
  const feedback = colonIndex >= 0 ? trimmed.slice(colonIndex + 1).trim() : trimmed;

  const issues: ContractVerificationIssue[] = passed
    ? []
    : [
        {
          severity: 'error',
          field: 'ai_verification',
          message: feedback,
        },
      ];

  return {
    packageId,
    passed,
    issues,
    feedback,
    modelUsed,
    escalated: false,
    timestamp: new Date(),
  };
}
