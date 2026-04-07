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

/** TeamDelete 안정화 설정 / TeamDelete settle configuration */
const SETTLE_BASE_DELAY_MS = 200;
const SETTLE_MAX_ATTEMPTS = 5;
const SETTLE_BACKOFF_FACTOR = 1.5;

/**
 * 팀 삭제 후 config 정리 콜백 / Callback to clean up config after team deletion
 *
 * @param teamName - 삭제된 팀 이름 / Deleted team name
 * @param memberNames - 팀에 속한 에이전트 이름 목록 / Agent names that belonged to the team
 * @returns 정리 성공 여부 / Whether cleanup succeeded
 */
export type TeamConfigCleanupFn = (
  teamName: string,
  memberNames: readonly string[],
) => Promise<Result<void>>;

/**
 * AgentCoordinator 생성 옵션 / AgentCoordinator constructor options
 */
export interface AgentCoordinatorOptions {
  readonly logger: Logger;
  /** 팀 삭제 시 config 정리 콜백 (선택) / Optional config cleanup callback on team deletion */
  readonly onTeamDeleted?: TeamConfigCleanupFn;
}

/**
 * Agent Teams 라이프사이클 코디네이터 / Agent Teams lifecycle coordinator
 *
 * @description
 * KR: 팀 생성/삭제, 에이전트 스폰, 팀 상태 추적을 담당한다.
 *     Layer2Bootstrap에서 이 클래스를 생성하여 팀 관리 로직을 위임받는다.
 *     PI-008 — 팀 삭제 시 config.json 멤버 목록 정리를 onTeamDeleted 콜백으로 처리한다.
 * EN: Handles team creation/deletion, agent spawning, and team state tracking.
 *     Created by Layer2Bootstrap to delegate team management logic.
 *     PI-008 — Config member cleanup on team deletion is handled via onTeamDeleted callback.
 *
 * @example
 * const coordinator = new AgentCoordinator({ logger });
 * coordinator.createTeam('design-team', 'DESIGN Phase 팀');
 * coordinator.spawnAgent('design-team', 'architect', 'You are an architect...');
 */
export class AgentCoordinator {
  // WHY: 활성 팀 상태 추적 — 중복 생성/삭제 방지
  private readonly activeTeams = new Map<string, { description: string; agents: string[] }>();
  private readonly logger: Logger;
  private readonly onTeamDeleted: TeamConfigCleanupFn | undefined;

  constructor(options: AgentCoordinatorOptions) {
    this.logger = options.logger;
    this.onTeamDeleted = options.onTeamDeleted;
  }

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
   * KR: PI-008 — TeamDelete race condition 완화를 위해 지수 백오프 대기 후
   *     config.json 멤버 목록을 정리한다.
   * EN: PI-008 — Mitigates TeamDelete race condition with exponential backoff
   *     followed by config.json member cleanup.
   *
   * @param teamName - 팀 이름 / Team name
   * @returns 성공 시 ok / ok on success
   */
  async deleteTeam(teamName: string): Promise<Result<void>> {
    const team = this.activeTeams.get(teamName);
    if (!team) {
      return err(
        new AgentError(
          'agent_team_not_found',
          `팀을 찾을 수 없습니다 / Team not found: ${teamName}`,
        ),
      );
    }

    // WHY: PI-008 — 삭제 전 멤버 목록 캡처 (config 정리에 필요)
    const memberNames = [...team.agents];

    // WHY: PI-008 — 지수 백오프로 SDK 내부 상태 안정화 대기
    let delay = SETTLE_BASE_DELAY_MS;
    for (let i = 0; i < SETTLE_MAX_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      this.logger.debug('TeamDelete 안정화 대기', {
        teamName,
        attempt: i + 1,
        maxAttempts: SETTLE_MAX_ATTEMPTS,
        delayMs: delay,
      });
      delay = Math.round(delay * SETTLE_BACKOFF_FACTOR);
    }

    // WHY: PI-008 — in-memory 상태 먼저 정리
    this.activeTeams.delete(teamName);

    // WHY: PI-008 — config.json 멤버 목록 정리 (콜백이 설정된 경우)
    if (this.onTeamDeleted) {
      const cleanupResult = await this.onTeamDeleted(teamName, memberNames);
      if (!cleanupResult.ok) {
        this.logger.warn('팀 삭제 후 config 정리 실패 — 수동 정리 필요', {
          teamName,
          memberNames,
          error: cleanupResult.error.message,
        });
        // WHY: config 정리 실패해도 in-memory 삭제는 유지 — 다음 팀 생성은 허용
      } else {
        this.logger.info('팀 삭제 및 config 정리 완료', { teamName, memberNames });
      }
    } else {
      this.logger.info('팀 삭제 완료 (config 정리 콜백 없음)', { teamName });
    }

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
