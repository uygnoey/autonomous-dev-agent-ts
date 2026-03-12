/**
 * 토큰 대기 루프 / Token Wait Loop
 *
 * @description
 * KR: 토큰 한도 도달 시 활성 세션을 일시 중지하고 스냅샷을 저장한 뒤
 *     토큰 윈도우 리셋을 대기하여 세션을 복원한다.
 * EN: On token limit hit, pauses active sessions, saves snapshots,
 *     waits for token window reset, then restores sessions.
 */

import type { Logger } from 'core/logger.js';
import type { AgentEvent } from 'layer2/agent-types.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { SessionRestoreOrchestrator } from 'layer2/session-restore-orchestrator.js';
import type { PersistableSessionSnapshot } from 'layer2/session-snapshot-store-types.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';

// ── 상수 / Constants ──────────────────────────────────────────────

/** 토큰 대기 확인 주기 (1분) / Token wait check interval (1 minute) */
export const TOKEN_WAIT_CHECK_INTERVAL_MS = 60_000;

/** 토큰 대기 최대 시간 (1시간) / Max token wait duration (1 hour) */
export const TOKEN_WAIT_MAX_DURATION_MS = 3_600_000;

// ── 의존성 인터페이스 / Dependency Interface ─────────────────────

/**
 * runTokenWaitLoop 의존성 / Dependencies for runTokenWaitLoop
 */
export interface TokenWaitLoopDeps {
  /** 토큰 모니터 / Token monitor */
  readonly tokenMonitor: TokenMonitor;
  /** 세션 관리자 / Session manager */
  readonly sessionManager: SessionManager;
  /** 세션 스냅샷 저장소 / Session snapshot store */
  readonly sessionSnapshotStore: SessionSnapshotStore;
  /** 세션 복원 오케스트레이터 / Session restore orchestrator */
  readonly sessionRestoreOrchestrator: SessionRestoreOrchestrator;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
}

// ── runTokenWaitLoop ──────────────────────────────────────────────

/**
 * 토큰 대기 루프를 실행한다 / Run token wait loop
 *
 * @description
 * KR: 활성 세션을 모두 일시 중지하고 스냅샷을 저장한 뒤,
 *     shouldPauseAll()이 false가 될 때까지 대기하여 세션을 복원한다.
 *     최대 대기 시간(1시간) 초과 시 error 이벤트를 yield하고 종료한다.
 * EN: Pauses all active sessions and saves snapshots, then waits until
 *     shouldPauseAll() returns false and restores sessions.
 *     Yields an error event and returns on max wait timeout (1 hour).
 *
 * @param deps - 의존성 / Dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param projectId - 프로젝트 ID / Project ID
 * @yields AgentEvent 스트림 (message, error) / AgentEvent stream (message, error)
 *
 * @example
 * for await (const event of runTokenWaitLoop(deps, 'feat-1', 'proj-1')) {
 *   handleEvent(event);
 * }
 */
export async function* runTokenWaitLoop(
  deps: TokenWaitLoopDeps,
  featureId: string,
  projectId: string,
): AsyncIterable<AgentEvent> {
  const logger = deps.logger.child({ module: 'token-wait-loop', featureId, projectId });

  // 1. 활성 세션 조회 / List active sessions
  const activeSessions = deps.sessionManager.listSessions({ featureId, state: 'active' });
  logger.info('활성 세션 일시 중지 시작', { count: activeSessions.length });

  // 2. 각 활성 세션 일시 중지 + 스냅샷 저장 / Pause and save snapshots
  for (const session of activeSessions) {
    const pauseResult = deps.sessionManager.pauseSession(session.sessionId);
    if (!pauseResult.ok) {
      logger.warn('세션 일시 중지 실패', {
        sessionId: session.sessionId,
        error: pauseResult.error.message,
      });
      continue;
    }

    const snapshot: PersistableSessionSnapshot = {
      sessionId: session.sessionId,
      agentName: session.agentName,
      projectId: session.projectId,
      featureId: session.featureId,
      phase: session.phase,
      state: 'paused',
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      metadata: session.metadata,
      // WHY: SessionSnapshot에 대화 이력이 있으면 사용, 없으면 빈 배열 — 복원 시 컨텍스트 유지
      conversationHistory: session.conversationHistory ?? [],
    };

    const saveResult = await deps.sessionSnapshotStore.save(snapshot);
    if (!saveResult.ok) {
      logger.warn('세션 스냅샷 저장 실패', {
        sessionId: session.sessionId,
        error: saveResult.error.message,
      });
    }
  }

  // 3. 스냅샷 저장 완료 메시지 / Snapshot save complete message
  yield makeMessageEvent('토큰 한도 도달 — 세션 스냅샷 저장 완료');

  // 4. 토큰 대기 루프 / Token wait loop
  let waited = 0;

  while (waited < TOKEN_WAIT_MAX_DURATION_MS) {
    await Bun.sleep(TOKEN_WAIT_CHECK_INTERVAL_MS);
    waited += TOKEN_WAIT_CHECK_INTERVAL_MS;

    // WHY: shouldPauseAll()이 false면 토큰 윈도우 리셋됨 → 복원 시작
    if (!deps.tokenMonitor.shouldPauseAll()) {
      break;
    }

    yield makeMessageEvent(`토큰 대기 중 (${waited / 1000}초 경과)`);
  }

  // 5. 최대 대기 시간 초과 확인 / Check max wait exceeded
  if (waited >= TOKEN_WAIT_MAX_DURATION_MS && deps.tokenMonitor.shouldPauseAll()) {
    logger.error('토큰 한도 대기 시간 초과', { waitedMs: waited });
    yield makeErrorEvent('토큰 한도 대기 시간 초과');
    return;
  }

  // 6. 복원 시작 / Start restore
  yield makeMessageEvent('토큰 윈도우 리셋 — 세션 복원 시작');
  logger.info('토큰 윈도우 리셋 감지 — 세션 복원 시작', { featureId });

  yield* deps.sessionRestoreOrchestrator.restoreFeatureSessions(featureId);
}

// ── 헬퍼 / Helpers ────────────────────────────────────────────────

/**
 * message 타입 AgentEvent를 생성한다 / Create a message AgentEvent
 *
 * @param content - 메시지 내용 / Message content
 * @returns message AgentEvent
 */
function makeMessageEvent(content: string): AgentEvent {
  return {
    type: 'message',
    agentName: 'architect',
    content,
    timestamp: new Date(),
  };
}

/**
 * error 타입 AgentEvent를 생성한다 / Create an error AgentEvent
 *
 * @param content - 에러 내용 / Error content
 * @returns error AgentEvent
 */
function makeErrorEvent(content: string): AgentEvent {
  return {
    type: 'error',
    agentName: 'architect',
    content,
    timestamp: new Date(),
  };
}
