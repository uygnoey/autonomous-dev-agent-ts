/**
 * Agent Teams 라이프사이클 관리 / Agent Teams lifecycle management
 *
 * @description
 * KR: PI-010 — §16 TeamCreate + Agent + SendMessage + TeamDelete 전용 모듈.
 *     Agent Teams의 생성, 에이전트 스폰, 삭제를 중앙에서 관리한다.
 * EN: PI-010 — §16 Dedicated module for TeamCreate + Agent + SendMessage + TeamDelete.
 *     Centrally manages Agent Teams creation, agent spawning, and deletion.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

/**
 * Agent Teams 라이프사이클 코디네이터 / Agent Teams lifecycle coordinator
 *
 * @description
 * KR: 팀 생성/삭제, 에이전트 스폰, 팀 상태 추적을 담당한다.
 *     Layer2Bootstrap에서 이 클래스를 생성하여 팀 관리 로직을 위임받는다.
 * EN: Handles team creation/deletion, agent spawning, and team state tracking.
 *     Created by Layer2Bootstrap to delegate team management logic.
 *
 * @example
 * const coordinator = new AgentCoordinator(logger);
 * coordinator.createTeam('design-team', 'DESIGN Phase 팀');
 * coordinator.spawnAgent('design-team', 'architect', 'You are an architect...');
 */
export class AgentCoordinator {
  // WHY: 활성 팀 상태 추적 — 중복 생성/삭제 방지
  private readonly activeTeams = new Map<string, { description: string; agents: string[] }>();

  constructor(private readonly logger: Logger) {}

  /**
   * 팀을 생성한다 / Creates a team
   *
   * @param teamName - 팀 이름 / Team name
   * @param description - 팀 설명 / Team description
   * @returns 성공 시 ok / ok on success
   */
  createTeam(teamName: string, description: string): Result<void> {
    if (this.activeTeams.has(teamName)) {
      return err(
        new AgentError(
          'agent_team_already_exists',
          `이미 존재하는 팀입니다 / Team already exists: ${teamName}`,
        ),
      );
    }

    this.activeTeams.set(teamName, { description, agents: [] });
    this.logger.info('팀 생성', { teamName, description });
    return ok(undefined);
  }

  /**
   * 팀에 에이전트를 스폰한다 / Spawns an agent in a team
   *
   * @param teamName - 팀 이름 / Team name
   * @param name - 에이전트 이름 / Agent name
   * @param prompt - 에이전트 시스템 프롬프트 / Agent system prompt
   * @returns 성공 시 ok / ok on success
   */
  spawnAgent(teamName: string, name: string, prompt: string): Result<void> {
    const team = this.activeTeams.get(teamName);
    if (!team) {
      return err(
        new AgentError(
          'agent_team_not_found',
          `팀을 찾을 수 없습니다 / Team not found: ${teamName}`,
        ),
      );
    }

    team.agents.push(name);
    this.logger.info('에이전트 스폰', { teamName, name, promptLength: prompt.length });
    return ok(undefined);
  }

  /**
   * 팀을 삭제한다 / Deletes a team
   *
   * @description
   * KR: PI-008 — TeamDelete race condition 완화를 위해 비동기로 처리한다.
   * EN: PI-008 — Async to mitigate TeamDelete race condition.
   *
   * @param teamName - 팀 이름 / Team name
   * @returns 성공 시 ok / ok on success
   */
  async deleteTeam(teamName: string): Promise<Result<void>> {
    if (!this.activeTeams.has(teamName)) {
      return err(
        new AgentError(
          'agent_team_not_found',
          `팀을 찾을 수 없습니다 / Team not found: ${teamName}`,
        ),
      );
    }

    // WHY: PI-008 — race condition 완화를 위한 대기
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      this.logger.debug('TeamDelete race condition 대기', {
        teamName,
        attempt: i + 1,
        maxAttempts: 3,
      });
    }

    this.activeTeams.delete(teamName);
    this.logger.info('팀 삭제', { teamName });
    return ok(undefined);
  }

  /**
   * 팀이 활성 상태인지 확인한다 / Checks whether a team is active
   *
   * @param teamName - 팀 이름 / Team name
   * @returns 활성 시 true / true if active
   */
  isTeamActive(teamName: string): boolean {
    return this.activeTeams.has(teamName);
  }

  /**
   * 활성 팀 수를 반환한다 / Returns the number of active teams
   *
   * @returns 활성 팀 수 / Active team count
   */
  get activeTeamCount(): number {
    return this.activeTeams.size;
  }
}
