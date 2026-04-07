/**
 * AgentCoordinator 단위 테스트 / AgentCoordinator unit tests
 *
 * @description
 * 팀 생성/삭제/스폰, config 정리 콜백, race condition 완화를
 * 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { ok, err } from 'core/types.js';
import { AgentError } from 'core/errors.js';
import {
  AgentCoordinator,
  type AgentCoordinatorOptions,
  type TeamConfigCleanupFn,
} from 'layer2/agent-coordinator.js';

const logger = new ConsoleLogger('error');

describe('AgentCoordinator', () => {
  let coordinator: AgentCoordinator;

  beforeEach(() => {
    coordinator = new AgentCoordinator({ logger });
  });

  // ── createTeam ──────────────────────────────────────────────

  describe('createTeam', () => {
    it('새 팀을 성공적으로 생성한다', () => {
      const result = coordinator.createTeam('test-team', 'Test description');
      expect(result.ok).toBe(true);
      expect(coordinator.isTeamActive('test-team')).toBe(true);
      expect(coordinator.activeTeamCount).toBe(1);
    });

    it('이미 존재하는 팀 이름으로 생성하면 에러를 반환한다', () => {
      coordinator.createTeam('dup-team', 'First');
      const result = coordinator.createTeam('dup-team', 'Second');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_team_already_exists');
      }
    });

    it('빈 이름으로도 팀을 생성할 수 있다', () => {
      const result = coordinator.createTeam('', 'Empty name');
      expect(result.ok).toBe(true);
      expect(coordinator.isTeamActive('')).toBe(true);
    });

    it('여러 팀을 동시에 관리할 수 있다', () => {
      coordinator.createTeam('team-a', 'A');
      coordinator.createTeam('team-b', 'B');
      coordinator.createTeam('team-c', 'C');
      expect(coordinator.activeTeamCount).toBe(3);
    });
  });

  // ── spawnAgent ──────────────────────────────────────────────

  describe('spawnAgent', () => {
    it('팀에 에이전트를 스폰한다', () => {
      coordinator.createTeam('spawn-team', 'Spawn test');
      const result = coordinator.spawnAgent('spawn-team', 'architect', 'You are an architect');
      expect(result.ok).toBe(true);
    });

    it('존재하지 않는 팀에 스폰하면 에러를 반환한다', () => {
      const result = coordinator.spawnAgent('ghost-team', 'coder', 'prompt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_team_not_found');
      }
    });

    it('같은 팀에 여러 에이전트를 스폰할 수 있다', () => {
      coordinator.createTeam('multi-agent', 'Multiple agents');
      coordinator.spawnAgent('multi-agent', 'architect', 'arch prompt');
      coordinator.spawnAgent('multi-agent', 'coder', 'coder prompt');
      coordinator.spawnAgent('multi-agent', 'tester', 'tester prompt');
      expect(coordinator.isTeamActive('multi-agent')).toBe(true);
    });

    it('빈 프롬프트로도 스폰할 수 있다', () => {
      coordinator.createTeam('empty-prompt-team', 'test');
      const result = coordinator.spawnAgent('empty-prompt-team', 'agent', '');
      expect(result.ok).toBe(true);
    });
  });

  // ── deleteTeam ──────────────────────────────────────────────

  describe('deleteTeam', () => {
    it('팀을 삭제하면 in-memory에서 제거된다', async () => {
      coordinator.createTeam('del-team', 'To delete');
      const result = await coordinator.deleteTeam('del-team');
      expect(result.ok).toBe(true);
      expect(coordinator.isTeamActive('del-team')).toBe(false);
      expect(coordinator.activeTeamCount).toBe(0);
    });

    it('존재하지 않는 팀을 삭제하면 에러를 반환한다', async () => {
      const result = await coordinator.deleteTeam('no-such-team');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_team_not_found');
      }
    });

    it('삭제 후 같은 이름으로 팀을 재생성할 수 있다', async () => {
      coordinator.createTeam('reuse-team', 'V1');
      await coordinator.deleteTeam('reuse-team');
      const result = coordinator.createTeam('reuse-team', 'V2');
      expect(result.ok).toBe(true);
      expect(coordinator.isTeamActive('reuse-team')).toBe(true);
    });

    it('여러 팀 중 하나만 삭제해도 다른 팀에 영향 없다', async () => {
      coordinator.createTeam('keep-team', 'Keep');
      coordinator.createTeam('remove-team', 'Remove');
      await coordinator.deleteTeam('remove-team');
      expect(coordinator.isTeamActive('keep-team')).toBe(true);
      expect(coordinator.isTeamActive('remove-team')).toBe(false);
      expect(coordinator.activeTeamCount).toBe(1);
    });
  });

  // ── onTeamDeleted callback (PI-008 fix) ─────────────────────

  describe('onTeamDeleted callback', () => {
    it('팀 삭제 시 콜백이 호출되고 멤버 목록이 전달된다', async () => {
      let capturedTeam: string | undefined;
      let capturedMembers: readonly string[] | undefined;

      const cleanup: TeamConfigCleanupFn = async (teamName, members) => {
        capturedTeam = teamName;
        capturedMembers = members;
        return ok(undefined);
      };

      const coord = new AgentCoordinator({ logger, onTeamDeleted: cleanup });
      coord.createTeam('cb-team', 'Callback test');
      coord.spawnAgent('cb-team', 'architect', 'arch');
      coord.spawnAgent('cb-team', 'coder', 'code');

      await coord.deleteTeam('cb-team');

      expect(capturedTeam).toBe('cb-team');
      expect(capturedMembers).toEqual(['architect', 'coder']);
    });

    it('콜백 없이 생성하면 삭제 시 콜백이 호출되지 않는다', async () => {
      const coord = new AgentCoordinator({ logger });
      coord.createTeam('no-cb-team', 'No callback');
      const result = await coord.deleteTeam('no-cb-team');
      expect(result.ok).toBe(true);
    });

    it('콜백이 실패해도 in-memory 삭제는 유지된다', async () => {
      const failingCleanup: TeamConfigCleanupFn = async () => {
        return err(new AgentError('cleanup_failed', 'Config cleanup failed'));
      };

      const coord = new AgentCoordinator({ logger, onTeamDeleted: failingCleanup });
      coord.createTeam('fail-cb-team', 'Failing cleanup');
      coord.spawnAgent('fail-cb-team', 'agent1', 'p');

      const result = await coord.deleteTeam('fail-cb-team');

      // WHY: deleteTeam은 config 정리 실패와 무관하게 ok를 반환
      expect(result.ok).toBe(true);
      expect(coord.isTeamActive('fail-cb-team')).toBe(false);
    });

    it('멤버가 없는 팀을 삭제하면 빈 배열이 콜백에 전달된다', async () => {
      let capturedMembers: readonly string[] | undefined;

      const cleanup: TeamConfigCleanupFn = async (_teamName, members) => {
        capturedMembers = members;
        return ok(undefined);
      };

      const coord = new AgentCoordinator({ logger, onTeamDeleted: cleanup });
      coord.createTeam('empty-team', 'No members');
      await coord.deleteTeam('empty-team');

      expect(capturedMembers).toEqual([]);
    });

    it('콜백이 예외를 던지면 deleteTeam이 에러를 전파한다', async () => {
      const throwingCleanup: TeamConfigCleanupFn = async () => {
        throw new Error('Unexpected crash');
      };

      const coord = new AgentCoordinator({ logger, onTeamDeleted: throwingCleanup });
      coord.createTeam('throw-team', 'Throwing');

      await expect(coord.deleteTeam('throw-team')).rejects.toThrow('Unexpected crash');
      // WHY: 예외 시 in-memory는 이미 삭제됨 (콜백 전에 delete 호출)
      expect(coord.isTeamActive('throw-team')).toBe(false);
    });

    it('동일 팀을 연속 삭제하면 두 번째는 에러를 반환한다', async () => {
      const cleanup: TeamConfigCleanupFn = async () => ok(undefined);
      const coord = new AgentCoordinator({ logger, onTeamDeleted: cleanup });

      coord.createTeam('double-del', 'Double delete');
      const first = await coord.deleteTeam('double-del');
      expect(first.ok).toBe(true);

      const second = await coord.deleteTeam('double-del');
      expect(second.ok).toBe(false);
    });
  });

  // ── isTeamActive / activeTeamCount ──────────────────────────

  describe('isTeamActive / activeTeamCount', () => {
    it('생성 전에는 비활성이다', () => {
      expect(coordinator.isTeamActive('nonexistent')).toBe(false);
      expect(coordinator.activeTeamCount).toBe(0);
    });

    it('특수 문자가 포함된 팀 이름도 정상 동작한다', () => {
      coordinator.createTeam('team-with-특수/chars!', 'Special chars');
      expect(coordinator.isTeamActive('team-with-특수/chars!')).toBe(true);
    });
  });
});
