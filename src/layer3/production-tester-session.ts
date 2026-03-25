/**
 * 지속 E2E 세션 단일 실행 헬퍼 / Continuous E2E session single-execution helper
 *
 * @description
 * KR: ProductionTester에서 분리된 세션 단일 실행(executeOnce) 로직을 제공한다.
 *     Fail-Fast 시 onFailure 콜백으로 2계층 재실행 에스컬레이션을 트리거한다.
 * EN: Provides single-execution (executeOnce) logic extracted from ProductionTester.
 *     On Fail-Fast, triggers Layer 2 re-execution escalation via onFailure callback.
 */

import { randomUUID } from 'node:crypto';
import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { ContinuousE2EResult } from 'layer3/bug-escalator-types.js';
import type { ContinuousE2ESession } from 'layer3/production-tester-types.js';

/**
 * E2E 실패 시 호출되는 콜백 타입 / Callback type invoked on E2E failure
 *
 * @description
 * KR: 지속 E2E 실패 시 BugEscalator를 통해 2계층 재실행을 트리거하기 위한 콜백.
 *     스펙 §9.3: "1개 실패 → 즉시 중단 → 2계층 전체 루프 재실행 (architect부터)"
 * EN: Callback to trigger Layer 2 re-execution via BugEscalator on continuous E2E failure.
 *     Spec §9.3: "1 failure → immediate stop → Layer 2 full loop re-execution (from architect)"
 */
export type OnE2EFailureCallback = (failedResult: ContinuousE2EResult) => Promise<void>;

/**
 * 세션 단일 E2E 실행을 수행한다 / Execute a single E2E run for the given session.
 *
 * @description
 * KR: 세션 상태를 갱신하고, integrationTester로 테스트를 실행한다. Fail-Fast 적용.
 *     실패 시 onFailure 콜백으로 2계층 에스컬레이션을 트리거한다.
 * EN: Updates session state and runs tests via integrationTester. Applies Fail-Fast.
 *     On failure, triggers Layer 2 escalation via onFailure callback.
 *
 * @param sessionId - 세션 ID / Session ID
 * @param sessions - 세션 맵 참조 / Session map reference
 * @param timers - 타이머 맵 참조 / Timer map reference
 * @param integrationTester - Layer2 통합 테스터 / Layer2 integration tester
 * @param logger - 로거 / Logger
 * @param stopSession - 세션 중지 함수 / Session stop function
 * @param onFailure - 실패 시 에스컬레이션 콜백 (선택) / Escalation callback on failure (optional)
 */
export async function executeOnce(
  sessionId: string,
  sessions: Map<string, ContinuousE2ESession>,
  timers: Map<string, Timer>,
  integrationTester: IntegrationTester | null,
  logger: Logger,
  stopSession: (sessionId: string) => Promise<void>,
  onFailure?: OnE2EFailureCallback,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'running') return;

  // WHY: 간단 API (logger만 전달) 사용 시 integrationTester가 null — 실행 불가
  if (!integrationTester) {
    logger.warn('integrationTester가 없어 E2E 실행을 건너뜁니다', { sessionId });
    return;
  }

  logger.debug('E2E 테스트 실행 시작', {
    sessionId,
    execution: session.totalExecutions + 1,
  });
  session.totalExecutions += 1;
  session.lastExecutedAt = new Date();

  try {
    // WHY: projectPath = 프로젝트 루트 디렉토리 (cwd for bun test)
    //      session.config.testPath는 테스트 파일 경로 — 혼동 금지
    const result = await integrationTester.runIntegrationTests(
      session.projectId,
      session.projectPath,
    );

    if (!result.ok) {
      const errorResult = result as { readonly ok: false; readonly error: AdevError };
      session.failureCount += 1;
      logger.error('E2E 테스트 실행 실패', {
        sessionId,
        errorCode: errorResult.error.code,
        errorMessage: errorResult.error.message,
      });
      if (session.config.failFast) {
        logger.error('Fail-Fast 활성화 - 세션 중지 + 2계층 에스컬레이션', { sessionId });
        await stopSession(sessionId);
        // WHY: §9.3 — 실패 시 2계층 전체 루프 재실행 트리거
        await triggerEscalation(onFailure, session, errorResult.error.message, logger);
      }
      return;
    }

    const allPassed = result.value.every((r) => r.passed);
    if (allPassed) {
      session.successCount += 1;
      logger.info('E2E 테스트 성공', { sessionId, execution: session.totalExecutions });
    } else {
      session.failureCount += 1;
      const failedSteps = result.value.filter((r) => !r.passed).map((r) => r.step);
      logger.warn('E2E 테스트 실패', {
        sessionId,
        execution: session.totalExecutions,
        failedSteps,
      });
      if (session.config.failFast) {
        logger.error('Fail-Fast 활성화 - 세션 중지 + 2계층 에스컬레이션', { sessionId });
        await stopSession(sessionId);
        // WHY: §9.3 — 실패 시 2계층 전체 루프 재실행 트리거
        const errorMsg = `E2E 테스트 실패 (Steps: ${failedSteps.join(', ')})`;
        await triggerEscalation(onFailure, session, errorMsg, logger);
      }
    }
  } catch (error) {
    session.failureCount += 1;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('E2E 테스트 실행 중 예외 발생', { sessionId, error: errorMsg });
    if (session.config.failFast) {
      logger.error('Fail-Fast 활성화 - 세션 중지 + 2계층 에스컬레이션', { sessionId });
      await stopSession(sessionId);
      // WHY: §9.3 — 실패 시 2계층 전체 루프 재실행 트리거
      await triggerEscalation(onFailure, session, `예외 발생: ${errorMsg}`, logger);
    }
  }
}

/**
 * 2계층 에스컬레이션을 트리거한다 / Trigger Layer 2 escalation
 *
 * @description
 * KR: onFailure 콜백이 있으면 ContinuousE2EResult를 생성하여 전달한다.
 *     스펙 §9.4: "버그 발견 → qc 근본 원인 분석 → 2계층 전체 루프 재실행"
 * EN: Creates ContinuousE2EResult and passes to onFailure callback if present.
 *     Spec §9.4: "Bug found → qc root cause analysis → Layer 2 full loop re-execution"
 *
 * @param onFailure - 콜백 / Callback
 * @param session - 세션 / Session
 * @param errorMessage - 에러 메시지 / Error message
 * @param logger - 로거 / Logger
 */
async function triggerEscalation(
  onFailure: OnE2EFailureCallback | undefined,
  session: ContinuousE2ESession,
  errorMessage: string,
  logger: Logger,
): Promise<void> {
  if (!onFailure) return;

  const failedResult: ContinuousE2EResult = {
    id: randomUUID(),
    projectId: session.projectId,
    executedAt: session.lastExecutedAt ?? new Date(),
    passed: false,
    failedTest: session.config.testPath,
    errorMessage,
    featureId: 'unknown',
  };

  try {
    logger.info('2계층 에스컬레이션 트리거', {
      sessionId: session.id,
      projectId: session.projectId,
      errorMessage,
    });
    await onFailure(failedResult);
    logger.info('2계층 에스컬레이션 완료', { sessionId: session.id });
  } catch (escalationError) {
    // WHY: 에스컬레이션 실패가 세션 실행 흐름을 중단시키면 안 됨
    logger.error('2계층 에스컬레이션 실패', {
      sessionId: session.id,
      error: escalationError instanceof Error ? escalationError.message : String(escalationError),
    });
  }
}
