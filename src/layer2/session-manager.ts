/**
 * 세션 관리자 / Session Manager
 *
 * @description
 * KR: 에이전트 세션의 생성, 조회, 상태 전환, 일시 중지, 재개, 완료, 실패를 관리한다.
 *     인메모리 저장소로 운영되며, 추후 영속화 계층 교체 가능.
 * EN: Manages agent session CRUD and state transitions.
 *     In-memory storage, replaceable with persistence layer.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { AgentName, Phase, Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { SessionFilter, SessionSnapshot, SessionState } from './types.js';

/**
 * 세션 관리자 / Session Manager
 *
 * @description
 * KR: 에이전트 세션 라이프사이클을 관리한다.
 * EN: Manages the lifecycle of agent sessions.
 *
 * @example
 * const manager = new SessionManager(logger);
 * const result = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
 */
export class SessionManager {
  private readonly sessions: Map<string, SessionSnapshot> = new Map();
  private readonly logger: Logger;
  private counter = 0;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'session-manager' });
  }

  /**
   * 새 세션을 생성한다 / Creates a new session
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectId - 프로젝트 ID / Project ID
   * @param featureId - 기능 ID / Feature ID
   * @param phase - 현재 Phase / Current phase
   * @returns 생성된 세션 스냅샷 / Created session snapshot
   */
  createSession(
    agentName: AgentName,
    projectId: string,
    featureId: string,
    phase: Phase,
  ): Result<SessionSnapshot> {
    this.counter += 1;
    const sessionId = `session-${agentName}-${this.counter}`;
    const now = new Date();

    const snapshot: SessionSnapshot = {
      sessionId,
      agentName,
      projectId,
      featureId,
      phase,
      state: 'active',
      createdAt: now,
      lastActivity: now,
      metadata: {},
    };

    this.sessions.set(sessionId, snapshot);
    this.logger.info('세션 생성', { sessionId, agentName, phase });

    return ok(snapshot);
  }

  /**
   * 세션을 ID로 조회한다 / Gets a session by ID
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 세션 스냅샷 또는 null / Session snapshot or null
   */
  getSession(sessionId: string): SessionSnapshot | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * 세션을 부분 업데이트한다 / Partially updates a session
   *
   * @param sessionId - 세션 ID / Session ID
   * @param updates - 업데이트할 필드 / Fields to update
   * @returns 성공 시 ok, 세션 없으면 err / ok on success, err if session not found
   */
  updateSession(
    sessionId: string,
    updates: Partial<Pick<SessionSnapshot, 'phase' | 'state' | 'metadata'>>,
  ): Result<void> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return err(
        new AgentError('agent_session_not_found', `세션을 찾을 수 없습니다: ${sessionId}`),
      );
    }

    const updated: SessionSnapshot = {
      ...existing,
      ...updates,
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, updated);
    this.logger.debug('세션 업데이트', { sessionId, updates });

    return ok(undefined);
  }

  /**
   * 필터 조건에 맞는 세션 목록을 반환한다 / Lists sessions matching filter
   *
   * @param filter - 필터 조건 (선택) / Filter conditions (optional)
   * @returns 매칭된 세션 목록 / Matched sessions
   */
  listSessions(filter?: SessionFilter): SessionSnapshot[] {
    let results = [...this.sessions.values()];

    if (filter?.projectId) {
      results = results.filter((s) => s.projectId === filter.projectId);
    }
    if (filter?.featureId) {
      results = results.filter((s) => s.featureId === filter.featureId);
    }
    if (filter?.phase) {
      results = results.filter((s) => s.phase === filter.phase);
    }
    if (filter?.state) {
      results = results.filter((s) => s.state === filter.state);
    }

    return results;
  }

  /**
   * 세션을 일시 중지한다 / Pauses a session
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 시 ok / ok on success
   */
  pauseSession(sessionId: string): Result<void> {
    return this.transitionState(sessionId, 'paused');
  }

  /**
   * 세션을 재개한다 / Resumes a session
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 시 ok / ok on success
   */
  resumeSession(sessionId: string): Result<void> {
    return this.transitionState(sessionId, 'active');
  }

  /**
   * 세션을 완료 처리한다 / Marks a session as completed
   *
   * @param sessionId - 세션 ID / Session ID
   * @returns 성공 시 ok / ok on success
   */
  completeSession(sessionId: string): Result<void> {
    return this.transitionState(sessionId, 'completed');
  }

  /**
   * 세션을 실패 처리한다 / Marks a session as failed
   *
   * @param sessionId - 세션 ID / Session ID
   * @param reason - 실패 사유 / Failure reason
   * @returns 성공 시 ok / ok on success
   */
  failSession(sessionId: string, reason: string): Result<void> {
    this.logger.warn('세션 실패', { sessionId, reason });
    return this.transitionState(sessionId, 'failed');
  }

  /**
   * 세션 상태를 전환한다 / Transitions session state
   *
   * @param sessionId - 세션 ID / Session ID
   * @param newState - 새 상태 / New state
   * @returns 성공 시 ok / ok on success
   */
  private transitionState(sessionId: string, newState: SessionState): Result<void> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return err(
        new AgentError('agent_session_not_found', `세션을 찾을 수 없습니다: ${sessionId}`),
      );
    }

    const updated: SessionSnapshot = {
      ...existing,
      state: newState,
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, updated);
    this.logger.info('세션 상태 전환', {
      sessionId,
      from: existing.state,
      to: newState,
    });

    return ok(undefined);
  }
}
