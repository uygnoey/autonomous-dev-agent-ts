/**
 * VERIFY Phase 실행 로직 / VERIFY Phase execution logic
 *
 * @description
 * KR: VERIFY Phase에서 qa, qc, reviewer 에이전트를 순차 실행하고
 *     4중 검증 결과를 VerificationGate에 등록한다.
 *     layer1 검증은 Layer1Verifier.verifyAsync()를 사용한다.
 * EN: Runs qa, qc, reviewer agents sequentially during VERIFY phase
 *     and registers 4-layer verification results in VerificationGate.
 *     layer1 verification uses Layer1Verifier.verifyAsync().
 */

import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { Layer1Verifier } from 'layer1/verifier.js';
import type { ModifiedFiles } from 'layer2/integration-tester-steps.js';
import type { IntegrationTester, StaircaseTestResult } from 'layer2/integration-tester.js';
import { createEvent, queryRagContext } from 'layer2/team-leader-helpers.js';
import type { ExecutePhaseDeps } from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';
import type { VerificationGate } from 'layer2/verification-gate.js';

/** executeVerifyPhase에 필요한 의존성 / Deps needed by executeVerifyPhase */
export interface ExecuteVerifyPhaseDeps extends ExecutePhaseDeps {
  readonly verificationGate: VerificationGate;
  readonly integrationTester: IntegrationTester;
  /** layer1 검증기 (선택) — 스펙 의도 검증에 사용 / Layer1 verifier (optional) for spec intent verification */
  readonly layer1Verifier?: Layer1Verifier;
  /** 프로젝트 경로 (선택) — 통합 테스트에 사용 / Project path (optional) for integration tests */
  readonly projectPath?: string;
  /** 수정된 파일 목록 (선택) — 통합 테스트에 사용 / Modified files (optional) for integration tests */
  readonly modifiedFiles?: ModifiedFiles;
}

/**
 * VERIFY Phase를 실행한다 / Executes the VERIFY phase
 *
 * @description
 * KR: qa, qc, reviewer 에이전트를 순차 실행하여 결과를 수집하고
 *     verificationGate에 4중 검증 결과(qa_qc → reviewer → layer1 → adev)를 등록한다.
 *     layer1은 Layer1Verifier.verifyAsync()로 실제 검증하며, adev는 자동 통과 처리.
 * EN: Runs qa, qc, reviewer agents sequentially, collects results,
 *     and registers 4-layer verification results in verificationGate.
 *     layer1 uses Layer1Verifier.verifyAsync() for real verification, adev is auto-pass.
 *
 * @param deps - VERIFY Phase 의존성 / VERIFY phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeVerifyPhase(
  deps: ExecuteVerifyPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  const participants = deps.phaseEngine.getParticipants('VERIFY');
  const allAgents = [...participants.lead, ...participants.active];

  // WHY: 에이전트별 결과를 수집한 뒤 VerificationPhase 단위로 합산
  const agentResults = new Map<string, { hasError: boolean; lastMessage: string }>();

  for (const agentName of allAgents) {
    if (deps.tokenMonitor.shouldThrottleSpawn()) {
      deps.logger.warn('스폰 스로틀링 적용', { agent: agentName });
      yield createEvent('message', `토큰 부족으로 ${agentName} 스폰 지연`);
      continue;
    }

    const ragContext = await queryRagContext(deps.ragSearcher, featureId, agentName);

    const configResult = deps.agentGenerator.generateAgentConfig(
      agentName,
      handoffPackage.specDocument,
      featureId,
      ragContext,
    );

    if (!configResult.ok) {
      deps.logger.error('에이전트 설정 생성 실패', {
        agent: agentName,
        error: configResult.error.message,
      });
      continue;
    }

    const config = {
      ...configResult.value,
      projectId: handoffPackage.projectId,
      phase: 'VERIFY' as Phase,
    };

    deps.sessionManager.createSession(agentName, config.projectId, featureId, 'VERIFY');

    let hasError = false;
    let lastMessage = '';

    for await (const event of deps.agentSpawner.spawn(config)) {
      deps.streamMonitor.onEvent({
        type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
        agentName: event.agentName,
        toolName: event.type === 'tool_use' ? event.content : undefined,
        data: event.metadata ?? {},
        timestamp: event.timestamp,
      });

      // WHY: error 이벤트 발생 여부로 pass/fail 판정
      if (event.type === 'error') {
        hasError = true;
      }

      // WHY: 마지막 message 이벤트를 feedback으로 사용
      if (event.type === 'message') {
        lastMessage = event.content;
      }

      yield event;
    }

    agentResults.set(agentName, { hasError, lastMessage });
  }

  // WHY: qa, qc 결과를 qa_qc phase로 합산 — 둘 다 error가 없어야 passed
  const qaResult = agentResults.get('qa');
  const qcResult = agentResults.get('qc');
  const qaQcPassed = !((qaResult?.hasError ?? false) || (qcResult?.hasError ?? false));
  const qaQcFeedback =
    [qaResult?.lastMessage, qcResult?.lastMessage].filter(Boolean).join('\n') || '';

  deps.verificationGate.addResult({
    featureId,
    phase: 'qa_qc',
    passed: qaQcPassed,
    feedback: qaQcFeedback,
    timestamp: new Date(),
  });

  deps.logger.info('qa_qc 검증 결과', { featureId, passed: qaQcPassed });

  // WHY: reviewer 결과 등록
  const reviewerResult = agentResults.get('reviewer');
  const reviewerPassed = !(reviewerResult?.hasError ?? false);
  const reviewerFeedback = reviewerResult?.lastMessage ?? '';

  deps.verificationGate.addResult({
    featureId,
    phase: 'reviewer',
    passed: reviewerPassed,
    feedback: reviewerFeedback,
    timestamp: new Date(),
  });

  deps.logger.info('reviewer 검증 결과', { featureId, passed: reviewerPassed });

  // WHY: layer1 검증 — Layer1Verifier가 있으면 verifyAsync() 호출, 없으면 auto-pass
  const layer1Result = await runLayer1Verification(deps, featureId, handoffPackage, agentResults);
  deps.verificationGate.addResult({
    featureId,
    phase: 'layer1',
    passed: layer1Result.passed,
    feedback: layer1Result.feedback,
    timestamp: new Date(),
  });

  deps.logger.info('layer1 검증 결과', { featureId, passed: layer1Result.passed });

  // WHY: PI-004 — 계단식 Fail-Fast 통합 테스트를 4중 검증의 일부로 실행
  const integrationResult = await runIntegrationTests(deps, featureId, handoffPackage);

  // WHY: PI-003 — adev 종합 판단 — qa_qc, reviewer, layer1, 통합 테스트 결과를 종합하여 최종 판정
  const adevPassed =
    qaQcPassed && reviewerPassed && layer1Result.passed && integrationResult.allPassed;
  const adevFeedbackParts: string[] = [];

  if (!qaQcPassed) adevFeedbackParts.push('qa_qc 검증 실패');
  if (!reviewerPassed) adevFeedbackParts.push('reviewer 검증 실패');
  if (!layer1Result.passed) adevFeedbackParts.push('layer1 검증 실패');
  if (!integrationResult.allPassed) {
    adevFeedbackParts.push(`통합 테스트 실패 (Step ${integrationResult.failedAtStep ?? '?'})`);
  }

  const adevFeedback = adevPassed
    ? 'adev 종합 판단: 전체 통과'
    : `adev 종합 판단: 실패 — ${adevFeedbackParts.join(', ')}`;

  // WHY: PI-002 — §8.4 'adev 확증편향 체크' — 전원 통과라도 편향 패턴 분석
  // WHY: optional chaining — mock/미지원 환경에서도 안전하게 처리
  const biasAlerts = deps.streamMonitor.detectAnomalies?.() ?? [];
  const confirmationBias = biasAlerts.filter((a) => a.type === 'confirmation_bias');
  let finalAdevFeedback = adevFeedback;
  if (confirmationBias.length > 0) {
    deps.logger.warn('VERIFY Phase 확증편향 감지 — 전원 통과에도 불구하고 편향 경고', {
      featureId,
      alertCount: confirmationBias.length,
    });
    const biasWarning = `[확증편향 경고] ${confirmationBias.map((a) => a.description).join('; ')}`;
    finalAdevFeedback = `${adevFeedback}\n${biasWarning}`;
  }

  deps.verificationGate.addResult({
    featureId,
    phase: 'adev',
    passed: adevPassed,
    feedback: finalAdevFeedback,
    timestamp: new Date(),
  });

  deps.logger.info('4중 검증 결과 등록 완료', {
    featureId,
    adevPassed,
    integrationAllPassed: integrationResult.allPassed,
    biasAlertCount: confirmationBias.length,
  });
}

/**
 * 계단식 Fail-Fast 통합 테스트를 실행한다 / Runs staircase Fail-Fast integration tests
 *
 * @description
 * KR: PI-004 — Step1(수정 E2E) → Step2(연관) → Step3(비연관) → Step4(전체).
 *     클린 환경에서 실행하며 1개 실패 시 즉시 중단한다.
 *     projectPath가 없으면 스킵(전체 통과 처리).
 * EN: PI-004 — Runs 4-step staircase tests in clean env with Fail-Fast.
 *
 * @param deps - VERIFY Phase 의존성 / VERIFY phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 통합 테스트 결과 / Integration test result
 */
async function runIntegrationTests(
  deps: ExecuteVerifyPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): Promise<StaircaseTestResult> {
  if (!deps.projectPath) {
    deps.logger.info('projectPath 미제공 — 통합 테스트 스킵', { featureId });
    return { stepResults: [], allPassed: true };
  }

  const modifiedFiles: ModifiedFiles = deps.modifiedFiles ?? { paths: [] };

  deps.logger.info('계단식 통합 테스트 시작', {
    featureId,
    projectPath: deps.projectPath,
    modifiedFileCount: modifiedFiles.paths.length,
  });

  const result = await deps.integrationTester.runStaircaseTests(
    handoffPackage.projectId,
    deps.projectPath,
    modifiedFiles,
  );

  if (!result.ok) {
    deps.logger.error('통합 테스트 실행 실패', {
      featureId,
      error: result.error.message,
    });
    // WHY: 실행 자체가 실패하면 전체 실패로 처리 — Step 1 실패로 기록
    return { stepResults: [], allPassed: false, failedAtStep: 1 };
  }

  deps.logger.info('계단식 통합 테스트 완료', {
    featureId,
    allPassed: result.value.allPassed,
    failedAtStep: result.value.failedAtStep,
  });

  return result.value;
}

/**
 * layer1 검증을 수행한다 / Runs layer1 verification
 *
 * @description
 * KR: Layer1Verifier.verifyAsync()를 호출하여 스펙 의도 충족 여부를 검증한다.
 *     Layer1Verifier가 미주입이면 auto-pass로 폴백한다.
 * EN: Calls Layer1Verifier.verifyAsync() to verify spec intent compliance.
 *     Falls back to auto-pass if Layer1Verifier is not injected.
 *
 * @param deps - VERIFY Phase 의존성 / VERIFY phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param agentResults - 에이전트별 결과 / Per-agent results
 * @returns 검증 결과 (passed, feedback) / Verification result
 */
async function runLayer1Verification(
  deps: ExecuteVerifyPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  agentResults: Map<string, { hasError: boolean; lastMessage: string }>,
): Promise<{ passed: boolean; feedback: string }> {
  if (!deps.layer1Verifier) {
    deps.logger.info('layer1Verifier 미주입 — auto-pass', { featureId });
    return { passed: true, feedback: 'layer1 auto-pass (verifier not configured)' };
  }

  // WHY: 상태(PASS/FAIL)만 포함 — lastMessage에 'error'/'fail' 단어가 포함될 경우
  //      hasTestFailures 오탐 방지. feedback은 별도 컨텍스트로 전달.
  const testResults = Array.from(agentResults.entries())
    .map(([agent, result]) => {
      const status = result.hasError ? 'FAIL' : 'PASS';
      return `[${agent}] ${status}`;
    })
    .join('\n');

  const verifyResult = await deps.layer1Verifier.verifyAsync({
    featureId,
    implementedCode: handoffPackage.specDocument,
    testResults,
    question: '',
    contractSnapshot: handoffPackage,
  });

  if (!verifyResult.ok) {
    deps.logger.error('layer1 verifyAsync 실패', {
      featureId,
      error: verifyResult.error.message,
    });
    return { passed: false, feedback: `layer1 검증 실패: ${verifyResult.error.message}` };
  }

  return {
    passed: verifyResult.value.passed,
    feedback: verifyResult.value.feedback,
  };
}
