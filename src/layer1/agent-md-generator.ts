/**
 * Agent .md 초안 AI 생성기 / AI-based agent .md draft generator
 *
 * @description
 * KR: SPEC.md §7.4 기반. 프로젝트 스펙을 입력받아 7개 에이전트 .md 초안을
 *     Claude API로 생성하고 .adev/agents/ 에 저장한다.
 *     초안 생성 → 유저 검토/수정 → 확정 흐름의 Step 1 & 3을 담당.
 * EN: Based on SPEC.md §7.4. Takes project spec and uses Claude API to generate
 *     7 agent .md drafts, then saves them to .adev/agents/.
 *     Handles Step 1 & 3 of the draft→review→confirm flow.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { AgentName } from 'core/types.js';
import {
  AGENT_SPECIFIC_INSTRUCTIONS,
  ALL_AGENT_NAMES,
} from 'layer1/agent-md-generator-instructions.js';
import type { ClaudeApi } from 'layer1/claude-api.js';

// ── 설정 타입 / Config type ─────────────────────────────────────

/**
 * AgentMdGenerator 설정 / AgentMdGenerator configuration
 *
 * @description
 * KR: 에이전트 .md 초안 생성에 필요한 프로젝트 메타 정보.
 * EN: Project metadata needed to generate agent .md drafts.
 */
export interface AgentMdGeneratorConfig {
  /** 프로젝트 경로 (.adev/agents/ 저장 위치) / Project path (for .adev/agents/ storage) */
  readonly projectPath: string;
  /** 프로젝트 이름 / Project name */
  readonly projectName: string;
  /** 프로젝트 유형 / Project type (e.g. 'rest-api', 'cli', 'library', 'web-app') */
  readonly projectType: string;
  /** 기술 스택 / Technology stack (e.g. 'TypeScript, Bun, LanceDB') */
  readonly techStack: string;
  /** 코딩 컨벤션 요약 / Coding convention summary */
  readonly conventions: string;
  /** 작성 언어 / Output language ('Korean' | 'English') */
  readonly language: string;
}

// ── AgentMdGenerator 클래스 ─────────────────────────────────────

/**
 * 에이전트 .md 초안 AI 생성기 / Agent .md draft AI generator
 *
 * @description
 * KR: Claude API를 이용해 프로젝트 스펙 기반으로 7개 에이전트 역할 문서 초안을
 *     병렬 생성하고, 지정 경로에 저장한다.
 * EN: Uses Claude API to generate 7 agent role document drafts in parallel
 *     based on the project spec, then saves them to the specified path.
 *
 * @param claudeApi - Claude Messages API 래퍼 / Claude Messages API wrapper
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const generator = new AgentMdGenerator(claudeApi, logger);
 * const result = await generator.generate(config);
 * if (result.ok) {
 *   await generator.saveDrafts(config.projectPath, result.value);
 * }
 */
export class AgentMdGenerator {
  private readonly logger: Logger;

  constructor(
    private readonly claudeApi: ClaudeApi,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'agent-md-generator' });
  }

  /**
   * 7개 에이전트 .md 초안을 AI로 병렬 생성한다 / Generate all 7 agent .md drafts in parallel via AI
   *
   * @description
   * KR: Promise.all을 사용해 7개 에이전트 초안을 병렬 생성한다.
   *     한 에이전트라도 실패하면 전체 실패로 처리한다.
   * EN: Uses Promise.all to generate all 7 agent drafts in parallel.
   *     If any single agent fails, the whole operation fails.
   *
   * @param config - 생성 설정 / Generation config
   * @returns 에이전트 이름 → 초안 내용 맵 / AgentName → draft content map
   */
  async generate(config: AgentMdGeneratorConfig): Promise<Result<Record<AgentName, string>>> {
    this.logger.info(
      '7개 에이전트 .md 초안 생성 시작 / Starting all 7 agent .md draft generation',
      {
        projectName: config.projectName,
        projectType: config.projectType,
      },
    );

    const entries = await Promise.all(
      ALL_AGENT_NAMES.map(async (agentName) => {
        const result = await this.generateOne(agentName, config);
        return { agentName, result } as const;
      }),
    );

    const drafts: Partial<Record<AgentName, string>> = {};

    for (const { agentName, result } of entries) {
      if (!result.ok) {
        this.logger.error(`에이전트 초안 생성 실패 / Agent draft generation failed: ${agentName}`, {
          errorCode: result.error.code,
        });
        return err(result.error);
      }
      drafts[agentName] = result.value;
    }

    this.logger.info('7개 에이전트 .md 초안 생성 완료 / All 7 agent .md drafts generated', {
      projectName: config.projectName,
    });

    return ok(drafts as Record<AgentName, string>);
  }

  /**
   * 단일 에이전트 .md 초안을 AI로 생성한다 / Generate a single agent .md draft via AI
   *
   * @description
   * KR: SPEC.md §7.4 공통 프롬프트 구조에 agentSpecificInstructions를 주입하여 호출.
   *     빈 응답 수신 시 에러 반환.
   * EN: Injects agentSpecificInstructions into the §7.4 common prompt structure and calls AI.
   *     Returns error on empty response.
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param config - 생성 설정 / Generation config
   * @returns 초안 내용 문자열 / Draft content string
   */
  async generateOne(agentName: AgentName, config: AgentMdGeneratorConfig): Promise<Result<string>> {
    const prompt = buildPrompt(agentName, config);

    this.logger.debug(`에이전트 초안 생성 중 / Generating agent draft: ${agentName}`);

    const result = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
      maxTokens: 4096,
    });

    if (!result.ok) {
      return err(
        new AdevError(
          'agent_md_generate_api_error',
          `에이전트 초안 API 호출 실패 / Agent draft API call failed: ${agentName} — ${result.error.message}`,
          result.error,
        ),
      );
    }

    const content = result.value.content.trim();

    if (content.length === 0) {
      return err(
        new AdevError(
          'agent_md_generate_empty_response',
          `에이전트 초안 빈 응답 / Empty response for agent draft: ${agentName}`,
        ),
      );
    }

    this.logger.debug(`에이전트 초안 생성 완료 / Agent draft generated: ${agentName}`, {
      contentLength: content.length,
    });

    return ok(content);
  }

  /**
   * 생성된 초안을 projectPath/.adev/agents/ 에 저장한다 / Save generated drafts to projectPath/.adev/agents/
   *
   * @description
   * KR: 각 에이전트 .md 파일을 {projectPath}/.adev/agents/{agentName}.md 경로에 저장한다.
   *     Bun.write()를 사용하며 디렉토리가 없으면 자동 생성한다.
   * EN: Saves each agent .md file to {projectPath}/.adev/agents/{agentName}.md.
   *     Uses Bun.write(); creates the directory if it does not exist.
   *
   * @param projectPath - 프로젝트 루트 경로 / Project root path
   * @param drafts - 에이전트 이름 → 초안 내용 맵 / AgentName → draft content map
   * @returns ok(void) on success, err on first write failure
   */
  async saveDrafts(projectPath: string, drafts: Record<AgentName, string>): Promise<Result<void>> {
    const agentsDir = `${projectPath}/.adev/agents`;

    this.logger.info('에이전트 초안 저장 시작 / Saving agent drafts', {
      agentsDir,
      count: Object.keys(drafts).length,
    });

    for (const agentName of ALL_AGENT_NAMES) {
      const draft = drafts[agentName];

      // WHY: ALL_AGENT_NAMES와 drafts 키가 일치해야 하지만 방어적으로 검사
      if (draft === undefined) {
        return err(
          new AdevError(
            'agent_md_save_missing_draft',
            `저장할 초안 없음 / Missing draft for agent: ${agentName}`,
          ),
        );
      }

      const filePath = `${agentsDir}/${agentName}.md`;

      try {
        await Bun.write(filePath, draft);
        this.logger.debug(`에이전트 초안 저장 완료 / Agent draft saved: ${agentName}`, {
          filePath,
        });
      } catch (error: unknown) {
        return err(
          new AdevError(
            'agent_md_save_write_error',
            `에이전트 초안 파일 저장 실패 / Failed to write agent draft file: ${filePath}`,
            error,
          ),
        );
      }
    }

    this.logger.info('에이전트 초안 저장 완료 / All agent drafts saved', { agentsDir });

    return ok(undefined);
  }
}

// ── 내부 헬퍼 / Internal helper ──────────────────────────────────

/**
 * SPEC.md §7.4 공통 프롬프트를 구성한다 / Build the §7.4 common prompt
 *
 * @param agentName - 에이전트 이름 / Agent name
 * @param config - 생성 설정 / Generation config
 * @returns 완성된 프롬프트 문자열 / Complete prompt string
 */
function buildPrompt(agentName: AgentName, config: AgentMdGeneratorConfig): string {
  const instructions = AGENT_SPECIFIC_INSTRUCTIONS[agentName];

  return `아래 프로젝트 스펙을 기반으로 ${agentName} 에이전트의 가이드 문서 초안을 생성하세요.

프로젝트 정보:
- 이름: ${config.projectName}
- 유형: ${config.projectType}
- 기술 스택: ${config.techStack}
- 코딩 컨벤션: ${config.conventions}

${instructions}

작성 규칙:
- Claude 가이드 형식 (CLAUDE.md 스타일)
- 프로젝트 스펙에 맞춤화된 구체적 지침
- 예시 포함
- ${config.language}로 작성

⚠️ 이 문서는 초안입니다. 유저가 검토 후 최종 확정합니다.`;
}
