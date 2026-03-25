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

/** API Key 모드: 토큰 대기 확인 주기 (1분) / API Key mode: check interval (1 minute) */
export const TOKEN_WAIT_CHECK_INTERVAL_MS = 60_000;

/** Subscription 모드: 5시간 윈도우 확인 주기 (5분) / Subscription mode: 5h window check interval (5 min) */
export const TOKEN_WAIT_SUBSCRIPTION_INTERVAL_MS = 300_000;

/** API Key 모드: 최대 대기 시간 (1시간) / API Key mode: max wait (1 hour) */
export const TOKEN_WAIT_MAX_DURATION_MS = 3_600_000;

/** Subscription 모드: 최대 대기 시간 (5시간 + 10분 마진) / Subscription mode: max wait (5h + 10min margin) */
export const TOKEN_WAIT_SUBSCRIPTION_MAX_DURATION_MS = 5 * 3_600_000 + 600_000;

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
  /**
   * 5시간 윈도우 시작 시각 제공자 (선택) / Window start time provider (optional)
   *
   * @description
   * KR: PI-016 — SubscriptionAuth.getWindowStartTime()을 주입하여 정밀 대기 활성화.
   * EN: PI-016 — Inject SubscriptionAuth.getWindowStartTime() for precise wait.
   *
   * @returns 윈도우 시작 시각 (밀리초) 또는 null / Window start time (ms) or null
   */
  readonly getWindowStartTime?: () => number | null;
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

  // 4. 인증 방식별 대기 타이밍 결정 / Determine wait timing based on auth mode
  // WHY: API Key 모드는 retry-after 기반 정확한 대기, Subscription 모드는 5시간 윈도우 기반 리셋 타이머
  const isSubscription = deps.tokenMonitor.authMode === 'oauth-token';
  const checkInterval = isSubscription
    ? TOKEN_WAIT_SUBSCRIPTION_INTERVAL_MS
    : TOKEN_WAIT_CHECK_INTERVAL_MS;
  const maxDuration = isSubscription
    ? TOKEN_WAIT_SUBSCRIPTION_MAX_DURATION_MS
    : TOKEN_WAIT_MAX_DURATION_MS;

  // WHY: API Key 모드에서 retryAfterSeconds가 있으면 해당 시간만큼 먼저 대기
  const status = deps.tokenMonitor.getStatus();
  if (!isSubscription && status.retryAfterSeconds !== null && status.retryAfterSeconds > 0) {
    const retryWaitMs = status.retryAfterSeconds * 1000;
    logger.info('API Key 모드 — retry-after 기반 대기', { retryAfterMs: retryWaitMs });
    yield makeMessageEvent(`429 응답 — retry-after ${status.retryAfterSeconds}초 대기`);
    await Bun.sleep(retryWaitMs);
  }

  // WHY: PI-016 — Subscription 모드에서 5시간 윈도우 시작 시각 기반 정밀 대기
  //      windowStart + 5h = 리셋 예상 시각, 남은 시간만 대기하여 불필요한 폴링 방지
  const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000;
  if (isSubscription && deps.getWindowStartTime) {
    const windowStart = deps.getWindowStartTime();
    if (windowStart !== null) {
      const resetAt = windowStart + WINDOW_DURATION_MS;
      const waitMs = Math.max(0, resetAt - Date.now());
      if (waitMs > 0) {
        const waitMin = Math.ceil(waitMs / 60_000);
        logger.info('5시간 윈도우 기반 정밀 대기', {
          windowStartMs: windowStart,
          resetAtMs: resetAt,
          waitMs,
          waitMin,
        });
        yield makeMessageEvent(`5시간 윈도우 리셋까지 약 ${waitMin}분 대기`);
        await Bun.sleep(waitMs);

        // WHY: 정밀 대기 후 즉시 리셋 확인 — shouldPauseAll()이 false면 복원으로 진행
        if (!deps.tokenMonitor.shouldPauseAll()) {
          yield makeMessageEvent('토큰 윈도우 리셋 — 세션 복원 시작');
          logger.info('5시간 윈도우 정밀 대기 완료 — 세션 복원 시작', { featureId });
          yield* deps.sessionRestoreOrchestrator.restoreFeatureSessions(featureId);
          return;
        }
      }
    }
  }

  logger.info('토큰 대기 루프 시작', {
    authMode: deps.tokenMonitor.authMode,
    checkIntervalMs: checkInterval,
    maxDurationMs: maxDuration,
  });

  // 5. 토큰 대기 루프 / Token wait loop
  let waited = 0;

  while (waited < maxDuration) {
    await Bun.sleep(checkInterval);
    waited += checkInterval;

    // WHY: shouldPauseAll()이 false면 토큰 윈도우 리셋됨 → 복원 시작
    if (!deps.tokenMonitor.shouldPauseAll()) {
      break;
    }

    yield makeMessageEvent(
      `토큰 대기 중 (${Math.floor(waited / 1000)}초 경과, ${isSubscription ? 'Subscription' : 'API Key'} 모드)`,
    );
  }

  // 6. 최대 대기 시간 초과 확인 / Check max wait exceeded
  if (waited >= maxDuration && deps.tokenMonitor.shouldPauseAll()) {
    logger.error('토큰 한도 대기 시간 초과', {
      waitedMs: waited,
      maxDurationMs: maxDuration,
      authMode: deps.tokenMonitor.authMode,
    });
    yield makeErrorEvent(
      `토큰 한도 대기 시간 초과 (${isSubscription ? '5시간 윈도우' : '1시간'} 초과)`,
    );
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
