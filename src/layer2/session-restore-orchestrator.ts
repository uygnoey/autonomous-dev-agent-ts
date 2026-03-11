/**
 * 세션 복원 오케스트레이터 / Session Restore Orchestrator
 *
 * @description
 * KR: LanceDB에 저장된 paused 상태 세션 스냅샷을 sdkResumeSession으로 복원하여
 *     AgentEvent 스트림을 yield한다.
 * EN: Restores paused session snapshots from LanceDB via sdkResumeSession
 *     and yields AgentEvent streams.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import type { AgentEvent } from 'layer2/agent-types.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import { mapSdkEvent, sdkResumeSession } from 'layer2/v2-session-factory.js';

// ── 기본 상수 / Default constants ────────────────────────────────

/** 세션 복원 시 사용할 기본 모델명 / Default model name for session restore */
const DEFAULT_RESTORE_MODEL = 'claude-opus-4-6';

// ── 의존성 인터페이스 / Dependency Interface ─────────────────────

/**
 * SessionRestoreOrchestrator 의존성 / SessionRestoreOrchestrator dependencies
 */
export interface SessionRestoreOrchestratorDeps {
  /** 세션 스냅샷 저장소 / Session snapshot store */
  readonly sessionSnapshotStore: SessionSnapshotStore;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** 인증 공급자 (선택) / Authentication provider (optional) */
  readonly authProvider?: AuthProvider;
}

// ── SessionRestoreOrchestrator ────────────────────────────────────

/**
 * 세션 복원 오케스트레이터 / Session restore orchestrator
 *
 * @description
 * KR: paused 상태 세션 스냅샷을 순차적으로 복원하고 AgentEvent를 yield한다.
 *     복원 실패 시 error 이벤트를 yield하고 다음 세션 복원을 계속 시도한다.
 * EN: Sequentially restores paused session snapshots and yields AgentEvents.
 *     On restore failure, yields an error event and continues with the next session.
 *
 * @example
 * const orchestrator = new SessionRestoreOrchestrator({ sessionSnapshotStore, logger });
 * for await (const event of orchestrator.restoreFeatureSessions('feat-1')) {
 *   handleEvent(event);
 * }
 */
export class SessionRestoreOrchestrator {
  private readonly sessionSnapshotStore: SessionSnapshotStore;
  private readonly logger: Logger;
  private readonly authProvider: AuthProvider | undefined;

  /**
   * @param deps - 의존성 / Dependencies
   */
  constructor(deps: SessionRestoreOrchestratorDeps) {
    this.sessionSnapshotStore = deps.sessionSnapshotStore;
    this.logger = deps.logger.child({ module: 'session-restore-orchestrator' });
    this.authProvider = deps.authProvider;
  }

  /**
   * 기능 ID의 paused 세션을 모두 복원한다 / Restore all paused sessions for a feature
   *
   * @description
   * KR: featureId로 스냅샷을 조회하고, paused 상태인 것만 sdkResumeSession으로 복원한다.
   *     done 이벤트 수신 후 스냅샷을 삭제한다.
   * EN: Loads snapshots by featureId, restores only paused ones via sdkResumeSession.
   *     Deletes snapshot after receiving done event.
   *
   * @param featureId - 기능 ID / Feature ID
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  async *restoreFeatureSessions(featureId: string): AsyncIterable<AgentEvent> {
    const result = await this.sessionSnapshotStore.loadByFeature(featureId);
    if (!result.ok) {
      this.logger.error('기능 스냅샷 조회 실패', { featureId, error: result.error.message });
      yield this.makeErrorEvent(`세션 스냅샷 조회 실패: ${result.error.message}`);
      return;
    }

    const snapshots = result.value.filter((s) => s.state === 'paused');
    if (snapshots.length === 0) {
      this.logger.info('복원할 paused 세션 없음', { featureId });
      return;
    }

    for (const snapshot of snapshots) {
      try {
        yield* this.restoreSession(snapshot.sessionId, snapshot.agentName);
      } catch (error: unknown) {
        this.logger.error('세션 복원 예외', {
          sessionId: snapshot.sessionId,
          error: String(error),
        });
        yield this.makeErrorEvent(
          `세션 복원 예외 [${snapshot.sessionId}]: ${String(error)}`,
          snapshot.agentName,
        );
      }
    }
  }

  /**
   * 프로젝트 ID의 paused 세션을 모두 복원한다 / Restore all paused sessions for a project
   *
   * @description
   * KR: projectId로 스냅샷을 조회하고, paused 상태인 것만 복원한다.
   * EN: Loads snapshots by projectId, restores only paused ones.
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @yields AgentEvent 스트림 / AgentEvent stream
   */
  async *restoreProjectSessions(projectId: string): AsyncIterable<AgentEvent> {
    const result = await this.sessionSnapshotStore.loadByProject(projectId);
    if (!result.ok) {
      this.logger.error('프로젝트 스냅샷 조회 실패', { projectId, error: result.error.message });
      yield this.makeErrorEvent(`프로젝트 세션 스냅샷 조회 실패: ${result.error.message}`);
      return;
    }

    const snapshots = result.value.filter((s) => s.state === 'paused');
    if (snapshots.length === 0) {
      this.logger.info('복원할 paused 세션 없음', { projectId });
      return;
    }

    for (const snapshot of snapshots) {
      try {
        yield* this.restoreSession(snapshot.sessionId, snapshot.agentName);
      } catch (error: unknown) {
        this.logger.error('세션 복원 예외', {
          sessionId: snapshot.sessionId,
          error: String(error),
        });
        yield this.makeErrorEvent(
          `세션 복원 예외 [${snapshot.sessionId}]: ${String(error)}`,
          snapshot.agentName,
        );
      }
    }
  }

  /**
   * 단일 세션을 복원한다 / Restore a single session
   *
   * @description
   * KR: sdkResumeSession으로 세션을 재개하고 stream()으로 이벤트를 수신한다.
   *     done 이벤트 수신 시 세션 종료 + 스냅샷 삭제.
   *     에러 발생 시 error 이벤트 yield 후 continue.
   * EN: Resumes session via sdkResumeSession and receives events from stream().
   *     On done event: closes session + deletes snapshot.
   *     On error: yields error event and continues.
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
      const env: Record<string, string> = {};
      if (this.authProvider !== undefined) {
        const authHeader = this.authProvider.getAuthHeader();
        const apiKey = authHeader['x-api-key'] ?? '';
        const oauthToken = authHeader.authorization?.replace('Bearer ', '') ?? '';
        if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
        if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
      }

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
      yield this.makeErrorEvent(`세션 복원 실패 [${sessionId}]: ${String(error)}`, agentName);
    } finally {
      // WHY: finally로 session.close() 보장 (done/error 이벤트에서 이미 닫았으면 무시)
      if (session !== null) {
        session.close();
      }
    }
  }

  /**
   * 에러 AgentEvent를 생성한다 / Create an error AgentEvent
   *
   * @param message - 에러 메시지 / Error message
   * @param agentName - 에이전트 이름 (선택, 기본 'architect') / Agent name (optional, default 'architect')
   * @returns 에러 AgentEvent / Error AgentEvent
   */
  private makeErrorEvent(message: string, agentName: AgentName = 'architect'): AgentEvent {
    return {
      type: 'error',
      agentName,
      content: message,
      timestamp: new Date(),
    };
  }
}
