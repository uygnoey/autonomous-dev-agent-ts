/**
 * 에이전트 드래프트 파일 로더 / Agent Draft File Loader
 *
 * @description
 * KR: 에이전트 역할별 .md 파일을 우선순위에 따라 로드한다.
 *     우선순위: projectAgentsDir > globalAgentsDir > builtin 폴백
 * EN: Loads per-role .md files following priority order.
 *     Priority: projectAgentsDir > globalAgentsDir > builtin fallback
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { AgentName, Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { AgentDraftContent, IAgentDraftLoader } from 'layer2/agent-draft-loader-types.js';

// ── 상수 / Constants ─────────────────────────────────────────────

/**
 * 7개 고정 에이전트 이름 목록 / All 7 fixed agent names
 */
const AGENT_NAMES: readonly AgentName[] = [
  'architect',
  'coder',
  'tester',
  'qc',
  'qa',
  'reviewer',
  'documenter',
] as const;

// ── 헬퍼 / Helpers ───────────────────────────────────────────────

/**
 * 파일 존재 여부를 확인한다 / Check if a file exists via Bun.file
 *
 * @param filePath - 확인할 파일 경로 / File path to check
 * @returns 존재하면 true / true if exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await Bun.file(filePath).exists();
  } catch {
    return false;
  }
}

/**
 * 파일 내용을 읽는다 / Read file content via Bun.file
 *
 * @param filePath - 읽을 파일 경로 / File path to read
 * @returns 파일 내용 Result / File content Result
 */
async function readFile(filePath: string): Promise<Result<string>> {
  try {
    const content = await Bun.file(filePath).text();
    return ok(content);
  } catch (caught) {
    return err(
      new AdevError(
        'agent_draft_load_failed',
        `에이전트 드래프트 파일 읽기 실패: ${filePath}`,
        caught,
      ),
    );
  }
}

// ── 구현 / Implementation ────────────────────────────────────────

/**
 * 에이전트 드래프트 파일 로더 구현체 / Agent draft file loader implementation
 *
 * @description
 * KR: Bun.file() API를 사용해 .md 파일을 읽는다.
 *     파일이 없으면 builtin 폴백을 반환한다 (에러 아님).
 * EN: Uses Bun.file() API to read .md files.
 *     Returns builtin fallback when no file found (not an error).
 *
 * @example
 * const loader = new AgentDraftLoader(logger);
 * const result = await loader.load('architect', '/project/.claude/agents');
 * if (result.ok) {
 *   const { content, source } = result.value;
 * }
 */
class AgentDraftLoader implements IAgentDraftLoader {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'agent-draft-loader' });
  }

  /**
   * 에이전트 역할에 맞는 .md 파일을 로드한다 / Load .md file for agent role
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectAgentsDir - 프로젝트 에이전트 디렉토리 (선택) / Project agents dir (optional)
   * @param globalAgentsDir - 글로벌 에이전트 디렉토리 (선택) / Global agents dir (optional)
   * @returns 드래프트 콘텐츠 Result / Draft content Result
   */
  async load(
    agentName: AgentName,
    projectAgentsDir?: string,
    globalAgentsDir?: string,
  ): Promise<Result<AgentDraftContent>> {
    // WHY: projectAgentsDir 우선 확인 — 프로젝트별 커스터마이징이 글로벌보다 우선
    if (projectAgentsDir) {
      const projectPath = `${projectAgentsDir}/${agentName}.md`;
      const exists = await fileExists(projectPath);
      if (exists) {
        const readResult = await readFile(projectPath);
        if (!readResult.ok) {
          this.logger.warn('프로젝트 드래프트 파일 읽기 실패, 다음 소스 시도', {
            agentName,
            path: projectPath,
          });
          return readResult;
        }
        this.logger.debug('프로젝트 드래프트 파일 로드됨', { agentName, path: projectPath });
        return ok({
          agentName,
          content: readResult.value,
          sourcePath: projectPath,
          source: 'project',
        });
      }
    }

    // WHY: globalAgentsDir 차순위 확인 — 사용자 글로벌 설정
    if (globalAgentsDir) {
      const globalPath = `${globalAgentsDir}/${agentName}.md`;
      const exists = await fileExists(globalPath);
      if (exists) {
        const readResult = await readFile(globalPath);
        if (!readResult.ok) {
          this.logger.warn('글로벌 드래프트 파일 읽기 실패, builtin 폴백 사용', {
            agentName,
            path: globalPath,
          });
          return readResult;
        }
        this.logger.debug('글로벌 드래프트 파일 로드됨', { agentName, path: globalPath });
        return ok({
          agentName,
          content: readResult.value,
          sourcePath: globalPath,
          source: 'global',
        });
      }
    }

    // WHY: 둘 다 없으면 builtin 폴백 — 에러가 아니라 정상 상태
    this.logger.debug('드래프트 파일 없음, builtin 폴백 사용', { agentName });
    return ok({
      agentName,
      content: '',
      sourcePath: '',
      source: 'builtin',
    });
  }

  /**
   * 모든 에이전트 .md를 병렬 로드한다 / Load all agent .md files in parallel
   *
   * @param projectAgentsDir - 프로젝트 에이전트 디렉토리 (선택) / Project agents dir (optional)
   * @param globalAgentsDir - 글로벌 에이전트 디렉토리 (선택) / Global agents dir (optional)
   * @returns 드래프트 콘텐츠 배열 Result / Array of draft content Result
   */
  async loadAll(
    projectAgentsDir?: string,
    globalAgentsDir?: string,
  ): Promise<Result<readonly AgentDraftContent[]>> {
    // WHY: Promise.all로 병렬 실행 — 7개 파일을 순차 읽기보다 빠르게 처리
    const results = await Promise.all(
      AGENT_NAMES.map((name) => this.load(name, projectAgentsDir, globalAgentsDir)),
    );

    const contents: AgentDraftContent[] = [];
    for (const result of results) {
      if (!result.ok) {
        // WHY: 개별 실패도 상위로 전파 — 일관성 보장을 위해
        return result;
      }
      contents.push(result.value);
    }

    this.logger.info('모든 에이전트 드래프트 로드 완료', { count: contents.length });
    return ok(contents);
  }
}
