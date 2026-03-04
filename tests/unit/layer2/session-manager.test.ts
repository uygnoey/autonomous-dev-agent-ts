/**
 * SessionManager 단위 테스트 / SessionManager unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { SessionManager } from '../../../src/layer2/session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    manager = new SessionManager(logger);
  });

  describe('createSession / 세션 생성', () => {
    it('세션을 생성하고 반환한다', () => {
      const result = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentName).toBe('architect');
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.featureId).toBe('feat-1');
        expect(result.value.phase).toBe('DESIGN');
        expect(result.value.state).toBe('active');
      }
    });

    it('고유한 세션 ID를 생성한다', () => {
      const r1 = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      const r2 = manager.createSession('coder', 'proj-1', 'feat-1', 'CODE');
      if (r1.ok && r2.ok) {
        expect(r1.value.sessionId).not.toBe(r2.value.sessionId);
      }
    });
  });

  describe('getSession / 세션 조회', () => {
    it('존재하는 세션을 반환한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        const session = manager.getSession(createResult.value.sessionId);
        expect(session).not.toBeNull();
        expect(session?.agentName).toBe('architect');
      }
    });

    it('존재하지 않는 세션은 null을 반환한다', () => {
      const session = manager.getSession('non-existent');
      expect(session).toBeNull();
    });
  });

  describe('updateSession / 세션 업데이트', () => {
    it('세션 상태를 갱신한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        const updateResult = manager.updateSession(createResult.value.sessionId, {
          phase: 'CODE',
        });
        expect(updateResult.ok).toBe(true);

        const session = manager.getSession(createResult.value.sessionId);
        expect(session?.phase).toBe('CODE');
      }
    });

    it('존재하지 않는 세션 업데이트는 에러를 반환한다', () => {
      const result = manager.updateSession('non-existent', { phase: 'CODE' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_session_not_found');
      }
    });
  });

  describe('listSessions / 세션 목록', () => {
    it('모든 세션을 반환한다', () => {
      manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      manager.createSession('coder', 'proj-1', 'feat-1', 'CODE');
      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('필터로 세션을 검색한다', () => {
      manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      manager.createSession('coder', 'proj-2', 'feat-2', 'CODE');

      const filtered = manager.listSessions({ projectId: 'proj-1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.projectId).toBe('proj-1');
    });

    it('Phase 필터가 동작한다', () => {
      manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      manager.createSession('coder', 'proj-1', 'feat-1', 'CODE');

      const filtered = manager.listSessions({ phase: 'CODE' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.phase).toBe('CODE');
    });
  });

  describe('상태 전환 / State transitions', () => {
    it('pauseSession이 세션을 paused로 변경한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        manager.pauseSession(createResult.value.sessionId);
        const session = manager.getSession(createResult.value.sessionId);
        expect(session?.state).toBe('paused');
      }
    });

    it('resumeSession이 세션을 active로 변경한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        manager.pauseSession(createResult.value.sessionId);
        manager.resumeSession(createResult.value.sessionId);
        const session = manager.getSession(createResult.value.sessionId);
        expect(session?.state).toBe('active');
      }
    });

    it('completeSession이 세션을 completed로 변경한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        manager.completeSession(createResult.value.sessionId);
        const session = manager.getSession(createResult.value.sessionId);
        expect(session?.state).toBe('completed');
      }
    });

    it('failSession이 세션을 failed로 변경한다', () => {
      const createResult = manager.createSession('architect', 'proj-1', 'feat-1', 'DESIGN');
      if (createResult.ok) {
        manager.failSession(createResult.value.sessionId, '에러 발생');
        const session = manager.getSession(createResult.value.sessionId);
        expect(session?.state).toBe('failed');
      }
    });

    it('존재하지 않는 세션 상태 전환은 에러를 반환한다', () => {
      const result = manager.pauseSession('non-existent');
      expect(result.ok).toBe(false);
    });
  });
});
