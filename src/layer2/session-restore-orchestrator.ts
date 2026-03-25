/**
 * 세션 복원 오케스트레이터 / Session Restore Orchestrator
 *
 * @description
 * KR: LanceDB에 저장된 paused 상태 세션 스냅샷을 sdkResumeSession으로 복원하여
 *     AgentEvent 스트림을 yield한다.
 * EN: Restores paused session snapshots from LanceDB via sdkResumeSession
 *     and yields AgentEvent streams.
 */

import type { AgentName, Phase } from 'core/types.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
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
import type { SDKSessionOptions } from 'layer2/v2-session-executor-types.js';
import { mapSdkEvent, sdkResumeSession } from 'layer2/v2-session-factory.js';
import type { RagSearcher } from 'rag/search.js';

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
  private readonly ragSearcher: RagSearcher | undefined;
  private readonly agentSpawner: AgentSpawner | undefined;

  /** @param deps - 의존성 / Dependencies */
  constructor(deps: SessionRestoreOrchestratorDeps) {
    this.sessionSnapshotStore = deps.sessionSnapshotStore;
    this.logger = deps.logger.child({ module: 'session-restore-orchestrator' });
    this.authProvider = deps.authProvider;
    this.tokenMonitor = deps.tokenMonitor;
    this.ragSearcher = deps.ragSearcher;
    this.agentSpawner = deps.agentSpawner;
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
        for await (const event of this.restoreSession(snapshot.sessionId, snapshot.agentName)) {
          yield event;

          // WHY: M-005 — RAG fallback 후 실제 새 세션 spawn
          if (event.metadata?.needsNewSession && this.agentSpawner) {
            const newConfig = this.buildFallbackSessionConfig(
              snapshot,
              String(event.metadata.ragContext ?? ''),
            );
            if (newConfig) {
              this.logger.info('RAG 컨텍스트로 새 세션 시작', {
                sessionId: snapshot.sessionId,
                agentName: snapshot.agentName,
              });
              yield* this.agentSpawner.spawn(newConfig);
            }
          }
        }
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

      // WHY: NI-001 — §13 SDK 스펙: settingSources: [] — 파일시스템 설정 의존 없음
      const resumeOptions = {
        model: DEFAULT_RESTORE_MODEL,
        permissionMode: 'bypassPermissions' as const,
        settingSources: [] as string[],
        executable: 'bun' as const,
        env,
      };
      session = sdkResumeSession(sessionId, resumeOptions as SDKSessionOptions);

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

      // WHY: PI-007 — sdkResumeSession 실패 시 RAG 컨텍스트로 새 세션 시작을 안내하는 fallback
      if (this.ragSearcher !== undefined) {
        yield* this.fallbackWithRagContext(sessionId, agentName);
      }
    } finally {
      // WHY: finally로 session.close() 보장 (done/error 이벤트에서 이미 닫았으면 무시)
      if (session !== null) {
        session.close();
      }
    }
  }

  /**
   * 세션 복원 실패 시 RAG 컨텍스트를 검색하여 fallback 이벤트를 yield한다
   * Searches RAG context on session restore failure and yields fallback events
   *
   * @param sessionId - 실패한 세션 ID / Failed session ID
   * @param agentName - 에이전트 이름 / Agent name
   * @yields RAG 컨텍스트가 포함된 fallback 메시지 이벤트 / Fallback message events with RAG context
   */
  private async *fallbackWithRagContext(
    sessionId: string,
    agentName: AgentName,
  ): AsyncIterable<AgentEvent> {
    if (this.ragSearcher === undefined) return;

    try {
      // WHY: 세션 ID에서 featureId를 추출하여 관련 코드를 RAG 검색한다
      //      세션 ID 형식: projectId:featureId:agentName:phase
      const parts = sessionId.split(':');
      const featureId = parts.length >= 2 ? parts[1] : sessionId;

      const searchResult = await this.ragSearcher.searchCode(`${featureId} ${agentName}`, 5);

      let ragContext = '';
      if (searchResult.ok && searchResult.value.length > 0) {
        ragContext = searchResult.value
          .map((r, i) => `[${i + 1}] ${r.record.filePath}\n${r.record.chunk}`)
          .join('\n\n');
      }

      this.logger.info('세션 복원 실패 — RAG 컨텍스트 fallback 생성', {
        sessionId,
        agentName,
        featureId,
        ragResultCount: searchResult.ok ? searchResult.value.length : 0,
      });

      yield {
        type: 'message',
        agentName,
        content: ragContext
          ? `[Fallback] 세션 재개 실패 — RAG 컨텍스트로 새 세션 시작 가능\n\n관련 코드:\n${ragContext}`
          : '[Fallback] 세션 재개 실패 — RAG 검색 결과 없음. 새 세션으로 재시작 필요',
        timestamp: new Date(),
        metadata: {
          restoreFallback: true,
          sessionId,
          featureId,
          ragContextAvailable: ragContext.length > 0,
          // WHY: M-005 — 상위 계층에 재시작 필요 신호를 metadata로 전달
          needsNewSession: true,
          ragContext: ragContext || '',
        },
      };
    } catch (ragError: unknown) {
      this.logger.warn('RAG fallback 검색 실패', {
        sessionId,
        error: String(ragError),
      });
      // WHY: RAG 검색 실패는 치명적이지 않으므로 경고만 yield
      yield {
        type: 'message',
        agentName,
        content: '[Fallback] 세션 재개 실패 + RAG 검색도 실패 — 새 세션으로 재시작 필요',
        timestamp: new Date(),
        // WHY: M-005 — RAG 검색 실패 시에도 needsNewSession 신호 전달
        metadata: {
          restoreFallback: true,
          sessionId,
          ragSearchFailed: true,
          needsNewSession: true,
        },
      };
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

  /**
   * RAG fallback용 새 세션 설정을 생성한다 / Builds agent config for RAG fallback new session
   *
   * @param snapshot - 실패한 세션 스냅샷 정보 / Failed session snapshot info
   * @param ragContext - RAG 검색 결과 컨텍스트 / RAG search result context
   * @returns AgentConfig 또는 null (spawn 불가 시) / AgentConfig or null if unable to build
   */
  private buildFallbackSessionConfig(
    snapshot: { sessionId: string; agentName: AgentName },
    ragContext: string,
  ): AgentConfig | null {
    // WHY: 세션 ID 형식 projectId:featureId:agentName:phase 에서 정보 추출
    const parts = snapshot.sessionId.split(':');
    if (parts.length < 4) {
      this.logger.warn('세션 ID 형식 불일치 — fallback 세션 생성 불가', {
        sessionId: snapshot.sessionId,
      });
      return null;
    }

    const projectId = parts[0] ?? '';
    const featureId = parts[1] ?? '';
    const phase = (parts[3] ?? 'CODE') as Phase;

    const ragPromptSection = ragContext ? `\n\n## 이전 세션 RAG 컨텍스트\n${ragContext}` : '';

    return {
      name: snapshot.agentName,
      projectId,
      featureId,
      phase,
      systemPrompt: `이전 세션 복원 실패로 새 세션을 시작합니다. 이전 작업 컨텍스트를 참고하여 작업을 계속하세요.${ragPromptSection}`,
      prompt: `이전 세션(${snapshot.sessionId})이 복원 실패하여 새로 시작합니다. 이전 작업을 이어서 진행해주세요.`,
      tools: [],
    };
  }
}
