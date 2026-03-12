/**
 * 세션 복원 오케스트레이터 헬퍼 / Session Restore Orchestrator Helpers
 *
 * @description
 * KR: SessionRestoreOrchestrator에서 사용하는 순수 헬퍼 함수들을 정의한다.
 * EN: Defines pure helper functions used by SessionRestoreOrchestrator.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import type { AgentConfig, AgentEvent } from 'layer2/agent-types.js';
import type { PersistableSessionSnapshot } from 'layer2/session-snapshot-store-types.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';

/**
 * 에러 AgentEvent를 생성한다 / Create an error AgentEvent
 *
 * @param message - 에러 메시지 / Error message
 * @param agentName - 에이전트 이름 (선택, 기본 'architect') / Agent name (optional, default 'architect')
 * @returns 에러 AgentEvent / Error AgentEvent
 */
export function makeRestoreErrorEvent(
  message: string,
  agentName: AgentName = 'architect',
): AgentEvent {
  return {
    type: 'error',
    agentName,
    content: message,
    timestamp: new Date(),
  };
}

/**
 * AuthProvider에서 환경변수 맵을 추출한다 / Extract env map from AuthProvider
 *
 * @param authProvider - 인증 공급자 (optional) / Auth provider (optional)
 * @returns 환경변수 맵 / Environment variable map
 */
export function buildEnvFromAuthProvider(
  authProvider: AuthProvider | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (authProvider === undefined) return env;

  const authHeader = authProvider.getAuthHeader();
  const apiKey = authHeader['x-api-key'] ?? '';
  const oauthToken = authHeader.authorization?.replace('Bearer ', '') ?? '';

  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

  return env;
}

/**
 * 활성 세션 설정 목록을 paused 스냅샷으로 일괄 저장한다 / Saves active session configs as paused snapshots
 *
 * @param activeSessions - 현재 활성 세션 설정 목록 / Currently active session configs
 * @param store - 세션 스냅샷 저장소 / Session snapshot store
 * @param logger - 로거 / Logger
 * @yields 저장 실패 시 error AgentEvent / Error AgentEvent on save failure
 */
export async function* saveActiveSessionsAsSnapshots(
  activeSessions: readonly AgentConfig[],
  store: SessionSnapshotStore,
  logger: Logger,
): AsyncIterable<AgentEvent> {
  for (const config of activeSessions) {
    const snapshot: PersistableSessionSnapshot = {
      sessionId: `${config.projectId}:${config.featureId}:${config.name}:${config.phase}`,
      agentName: config.name,
      projectId: config.projectId,
      featureId: config.featureId,
      phase: config.phase,
      state: 'paused',
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: {},
    };

    const saveResult = await store.save(snapshot);
    if (!saveResult.ok) {
      logger.error('세션 스냅샷 저장 실패', {
        sessionId: snapshot.sessionId,
        error: saveResult.error.message,
      });
      yield makeRestoreErrorEvent(
        `세션 스냅샷 저장 실패 [${snapshot.sessionId}]: ${saveResult.error.message}`,
        config.name,
      );
    } else {
      logger.info('세션 스냅샷 저장 완료', { sessionId: snapshot.sessionId });
    }
  }
}
