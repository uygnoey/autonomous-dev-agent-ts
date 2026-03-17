/**
 * 지속 E2E 세션 단일 실행 헬퍼 / Continuous E2E session single-execution helper
 *
 * @description
 * KR: ProductionTester에서 분리된 세션 단일 실행(executeOnce) 로직을 제공한다.
 * EN: Provides single-execution (executeOnce) logic extracted from ProductionTester.
 */

import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { ContinuousE2ESession } from 'layer3/production-tester-types.js';

/**
 * 세션 단일 E2E 실행을 수행한다 / Execute a single E2E run for the given session.
 *
 * @description
 * KR: 세션 상태를 갱신하고, integrationTester로 테스트를 실행한다. Fail-Fast 적용.
 * EN: Updates session state and runs tests via integrationTester. Applies Fail-Fast.
 *
 * @param sessionId - 세션 ID / Session ID
 * @param sessions - 세션 맵 참조 / Session map reference
 * @param timers - 타이머 맵 참조 / Timer map reference
 * @param integrationTester - Layer2 통합 테스터 / Layer2 integration tester
 * @param logger - 로거 / Logger
 * @param stopSession - 세션 중지 함수 / Session stop function
 */
export async function executeOnce(
  sessionId: string,
  sessions: Map<string, ContinuousE2ESession>,
  timers: Map<string, Timer>,
  integrationTester: IntegrationTester,
  logger: Logger,
  stopSession: (sessionId: string) => Promise<void>,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'running') return;

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
        logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
        await stopSession(sessionId);
      }
      return;
    }

    const allPassed = result.value.every((r) => r.passed);
    if (allPassed) {
      session.successCount += 1;
      logger.info('E2E 테스트 성공', { sessionId, execution: session.totalExecutions });
    } else {
      session.failureCount += 1;
      logger.warn('E2E 테스트 실패', {
        sessionId,
        execution: session.totalExecutions,
        failedSteps: result.value.filter((r) => !r.passed).map((r) => r.step),
      });
      if (session.config.failFast) {
        logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
        await stopSession(sessionId);
      }
    }
  } catch (error) {
    session.failureCount += 1;
    logger.error('E2E 테스트 실행 중 예외 발생', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (session.config.failFast) {
      logger.error('Fail-Fast 활성화 - 세션 중지', { sessionId });
      await stopSession(sessionId);
    }
  }
}
