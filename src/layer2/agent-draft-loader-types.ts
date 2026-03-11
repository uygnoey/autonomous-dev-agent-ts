/**
 * AgentDraftLoader 타입 정의 / AgentDraftLoader type definitions
 *
 * @description
 * KR: 에이전트 역할별 .md 드래프트 파일 로드에 사용하는 인터페이스와 타입.
 * EN: Interfaces and types used for loading per-role .md draft files.
 */

import type { AgentName, Result } from 'core/types.js';

// ── 드래프트 콘텐츠 / Draft Content ──────────────────────────────

/**
 * 로드된 에이전트 드래프트 파일의 내용 / Loaded agent draft file content
 *
 * @description
 * KR: 에이전트별 .md 파일을 로드한 결과. 어느 소스에서 왔는지 추적한다.
 * EN: Result of loading an agent's .md file. Tracks which source it came from.
 */
export interface AgentDraftContent {
  /** 에이전트 이름 / Agent name */
  readonly agentName: AgentName;
  /** 파일 내용 (빈 문자열 가능) / File content (may be empty string) */
  readonly content: string;
  /** 소스 파일 경로 / Source file path */
  readonly sourcePath: string;
  /**
   * 소스 종류 / Source type
   * - 'project': 프로젝트 .claude/agents/ 디렉토리
   * - 'global': 글로벌 ~/.claude/agents/ 디렉토리
   * - 'builtin': 둘 다 없을 때 빈 콘텐츠 폴백
   */
  readonly source: 'project' | 'global' | 'builtin';
}

// ── 인터페이스 / Interface ────────────────────────────────────────

/**
 * 에이전트 드래프트 파일 로더 인터페이스 / Agent draft file loader interface
 *
 * @description
 * KR: 에이전트 역할에 맞는 .md 파일을 우선순위에 따라 로드한다.
 *     우선순위: projectAgentsDir > globalAgentsDir > builtin 폴백
 * EN: Loads .md files matching the agent role following priority order.
 *     Priority: projectAgentsDir > globalAgentsDir > builtin fallback
 */
export interface IAgentDraftLoader {
  /**
   * 에이전트 역할에 맞는 .md 파일을 로드한다 / Load .md file for agent role
   *
   * @description
   * KR: 우선순위: projectAgentsDir > globalAgentsDir > builtin 폴백.
   *     파일이 존재하지 않으면 빈 content의 builtin 반환 (에러 아님).
   * EN: Priority: projectAgentsDir > globalAgentsDir > builtin fallback.
   *     If no file exists, returns builtin with empty content (not an error).
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectAgentsDir - 프로젝트 에이전트 디렉토리 경로 (선택) / Project agents dir path (optional)
   * @param globalAgentsDir - 글로벌 에이전트 디렉토리 경로 (선택) / Global agents dir path (optional)
   * @returns 드래프트 콘텐츠 Result / Draft content Result
   */
  load(
    agentName: AgentName,
    projectAgentsDir?: string,
    globalAgentsDir?: string,
  ): Promise<Result<AgentDraftContent>>;

  /**
   * 모든 에이전트 .md를 병렬 로드한다 / Load all agent .md files in parallel
   *
   * @description
   * KR: 7개 에이전트 모두를 Promise.all로 병렬 로드한다.
   *     일부 파일이 없어도 builtin 폴백으로 채워 반환한다.
   * EN: Loads all 7 agents via Promise.all in parallel.
   *     Missing files are filled with builtin fallback, not an error.
   *
   * @param projectAgentsDir - 프로젝트 에이전트 디렉토리 경로 (선택) / Project agents dir path (optional)
   * @param globalAgentsDir - 글로벌 에이전트 디렉토리 경로 (선택) / Global agents dir path (optional)
   * @returns 드래프트 콘텐츠 배열 Result / Array of draft content Result
   */
  loadAll(
    projectAgentsDir?: string,
    globalAgentsDir?: string,
  ): Promise<Result<readonly AgentDraftContent[]>>;
}
