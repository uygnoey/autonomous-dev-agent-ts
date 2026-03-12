/**
 * 세션 복원 오케스트레이터 / Session Restore Orchestrator
 *
 * @description
 * KR: LanceDB에 저장된 paused 상태 세션 스냅샷을 sdkResumeSession으로 복원하여
 *     AgentEvent 스트림을 yield한다.
 * EN: Restores paused session snapshots from LanceDB via sdkResumeSession
 *     and yields AgentEvent streams.
 */

import type { AgentName } from 'core/types.js';
import type { AgentConfig, AgentEvent } from 'layer2/agent-types.js';
import {
  buildEnvFromAuthProvider,
  makeRestoreErrorEvent,
  saveActiveSessionsAsSnapshots,
} from 'layer2/session-restore-orchestrator-helpers.js';
import {
  DEFAULT_RESTORE_MODEL,
  RESET_POLL_INTERVAL_MS,
  type SessionRestoreOrchestratorDeps,
} from 'layer2/session-restore-orchestrator-types.js';
import { mapSdkEvent, sdkResumeSession } from 'layer2/v2-session-factory.js';

export type { SessionRestoreOrchestratorDeps } from 'layer2/session-restore-orchestrator-types.js';

/**
 * 세션 복원 오케스트레이터 / Session restore orchestrator
 *
 * @description
 * KR: paused 상태 세션 스냅샷을 순차적으로 복원하고 AgentEvent를 yield한다.
 * EN: Sequentially restores paused session snapshots and yields AgentEvents.
 *
 * @example
 * const orchestrator = new SessionRestoreOrchestrator({ sessionSnapshotStore, logger });
 * for await (const event of orchestrator.restoreFeatureSessions('feat-1')) {
 *   handleEvent(event);
 * }
 */
export class SessionRestoreOrchestrator {
  private readonly sessionSnapshotStore: SessionRestoreOrchestratorDeps['sessionSnapshotStore'];
  private readonly logger: SessionRestoreOrchestratorDeps['logger'];
  private readonly authProvider: SessionRestoreOrchestratorDeps['authProvider'];
  private readonly tokenMonitor: SessionRestoreOrchestratorDeps['tokenMonitor'];

  /** @param deps - 의존성 / Dependencies */
  constructor(deps: SessionRestoreOrchestratorDeps) {
    this.sessionSnapshotStore = deps.sessionSnapshotStore;
    this.logger = deps.logger.child({ module: 'session-restore-orchestrator' });
    this.authProvider = deps.authProvider;
    this.tokenMonitor = deps.tokenMonitor;
  }

  /**
   * 기능 ID의 paused 세션을 모두 복원한다 / Restore all paused sessions for a feature
   *
   * @param featureId - 기능 ID / Feature ID
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  async *restoreFeatureSessions(featureId: string): AsyncIterable<AgentEvent> {
    const result = await this.sessionSnapshotStore.loadByFeature(featureId);
    if (!result.ok) {
      this.logger.error('기능 스냅샷 조회 실패', { featureId, error: result.error.message });
      yield makeRestoreErrorEvent(`세션 스냅샷 조회 실패: ${result.error.message}`);
      return;
    }

    const snapshots = result.value.filter((s) => s.state === 'paused');
    if (snapshots.length === 0) {
      this.logger.info('복원할 paused 세션 없음', { featureId });
      return;
    }

    yield* this.restoreSnapshots(snapshots);
  }

  /**
   * 프로젝트 ID의 paused 세션을 모두 복원한다 / Restore all paused sessions for a project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  async *restoreProjectSessions(projectId: string): AsyncIterable<AgentEvent> {
    const result = await this.sessionSnapshotStore.loadByProject(projectId);
    if (!result.ok) {
      this.logger.error('프로젝트 스냅샷 조회 실패', { projectId, error: result.error.message });
      yield makeRestoreErrorEvent(`프로젝트 세션 스냅샷 조회 실패: ${result.error.message}`);
      return;
    }

    const snapshots = result.value.filter((s) => s.state === 'paused');
    if (snapshots.length === 0) {
      this.logger.info('복원할 paused 세션 없음', { projectId });
      return;
    }

    yield* this.restoreSnapshots(snapshots);
  }

  /**
   * 스냅샷 배열을 순차적으로 복원한다 / Restores an array of snapshots sequentially
   *
   * @param snapshots - 복원할 스냅샷 목록 / Snapshots to restore
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  private async *restoreSnapshots(
    snapshots: readonly { sessionId: string; agentName: AgentName }[],
  ): AsyncIterable<AgentEvent> {
    for (const snapshot of snapshots) {
      try {
        yield* this.restoreSession(snapshot.sessionId, snapshot.agentName);
      } catch (error: unknown) {
        this.logger.error('세션 복원 예외', {
          sessionId: snapshot.sessionId,
          error: String(error),
        });
        yield makeRestoreErrorEvent(
          `세션 복원 예외 [${snapshot.sessionId}]: ${String(error)}`,
          snapshot.agentName,
        );
      }
    }
  }

  /**
   * 단일 세션을 복원한다 / Restore a single session
   *
   * @param sessionId - 세션 ID / Session ID
   * @param agentName - 에이전트 이름 / Agent name
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  private async *restoreSession(
    sessionId: string,
    agentName: AgentName,
  ): AsyncIterable<AgentEvent> {
    this.logger.info('세션 복원 시작', { sessionId, agentName });

    let session: ReturnType<typeof sdkResumeSession> | null = null;
    try {
      // WHY: AuthProvider에서 인증 헤더를 추출하여 환경변수로 전달 — process.env 직접 접근 금지
      const env = buildEnvFromAuthProvider(this.authProvider);

      session = sdkResumeSession(sessionId, {
        model: DEFAULT_RESTORE_MODEL,
        permissionMode: 'bypassPermissions',
        executable: 'bun',
        env,
      });

      for await (const msg of session.stream()) {
        const event = mapSdkEvent(msg, agentName, (eventType) => {
          this.logger.warn('처리되지 않은 SDK 이벤트', { sessionId, eventType });
        });

        if (event === null) continue;
        yield event;

        // WHY: done 이벤트 수신 → 세션 종료 + 스냅샷 삭제 후 이 세션 처리 완료
        if (event.type === 'done') {
          session.close();
          session = null;
          const deleteResult = await this.sessionSnapshotStore.delete(sessionId);
          if (!deleteResult.ok) {
            this.logger.warn('세션 스냅샷 삭제 실패', {
              sessionId,
              error: deleteResult.error.message,
            });
          } else {
            this.logger.info('세션 복원 완료 및 스냅샷 삭제', { sessionId });
          }
          return;
        }

        // WHY: error 이벤트 수신 → yield하고 이 세션 처리 종료 (다음 세션으로 계속)
        if (event.type === 'error') {
          this.logger.warn('세션 복원 중 에러 이벤트', { sessionId, content: event.content });
          return;
        }
      }
    } catch (error: unknown) {
      this.logger.error('세션 복원 실패', { sessionId, error: String(error) });
      yield makeRestoreErrorEvent(`세션 복원 실패 [${sessionId}]: ${String(error)}`, agentName);
    } finally {
      // WHY: finally로 session.close() 보장 (done/error 이벤트에서 이미 닫았으면 무시)
      if (session !== null) {
        session.close();
      }
    }
  }

  /**
   * 토큰 한도 도달 시 세션을 스냅샷으로 저장하고, 리셋 후 복원한다
   * Save session snapshots on token limit, wait for reset, then restore all
   *
   * @param activeSessions - 현재 활성 세션 설정 목록 / Currently active session configs
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  async *handleTokenLimitAndRestore(
    activeSessions: readonly AgentConfig[],
  ): AsyncIterable<AgentEvent> {
    if (this.tokenMonitor === undefined) {
      this.logger.warn('tokenMonitor 미설정 — 토큰 한도 복원 불가');
      yield makeRestoreErrorEvent(
        'tokenMonitor가 설정되지 않아 토큰 한도 복원을 수행할 수 없습니다.',
      );
      return;
    }

    if (!this.tokenMonitor.shouldThrottleSpawn()) {
      this.logger.debug('토큰 스로틀 미감지 — 복원 불필요');
      return;
    }

    this.logger.warn('토큰 한도 감지 — 활성 세션 스냅샷 저장 시작', {
      sessionCount: activeSessions.length,
    });

    // WHY: 활성 세션을 모두 paused 상태로 스냅샷 저장
    yield* saveActiveSessionsAsSnapshots(activeSessions, this.sessionSnapshotStore, this.logger);

    // WHY: 토큰 리셋까지 대기 — 폴링 방식
    this.logger.info('토큰 리셋 대기 시작');
    await this.tokenMonitor.waitForReset(RESET_POLL_INTERVAL_MS);
    this.logger.info('토큰 리셋 완료 — 저장된 세션 복원 시작');

    // WHY: listSnapshots()으로 createdAt 순서대로 복원
    const listResult = await this.sessionSnapshotStore.listSnapshots();
    if (!listResult.ok) {
      this.logger.error('스냅샷 목록 조회 실패', { error: listResult.error.message });
      yield makeRestoreErrorEvent(`스냅샷 목록 조회 실패: ${listResult.error.message}`);
      return;
    }

    const pausedSnapshots = listResult.value.filter((s) => s.state === 'paused');
    if (pausedSnapshots.length === 0) {
      this.logger.info('복원할 paused 스냅샷 없음');
      return;
    }

    this.logger.info('paused 스냅샷 복원 시작', { count: pausedSnapshots.length });
    yield* this.restoreSnapshots(pausedSnapshots);
  }
}
