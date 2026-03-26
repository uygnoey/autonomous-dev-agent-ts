/**
 * SKILL.md 자동 생성기 / SKILL.md auto-generator
 *
 * @description
 * KR: NI-002 — §7.4 기반. 프로젝트 스펙을 분석하여 필요한 Skill 목록을 추출하고
 *     각 Skill의 SKILL.md 초안을 Claude API로 생성한다.
 *     AgentMdGenerator와 동일한 흐름 (생성 → 유저 검토 → 확정)의 Step 1 & 3을 담당.
 * EN: NI-002 — Based on §7.4. Analyzes project spec to extract needed skills,
 *     then generates SKILL.md drafts for each skill via Claude API.
 *     Handles Step 1 & 3 of the draft→review→confirm flow (same as AgentMdGenerator).
 */

import { join } from 'node:path';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Skill 추출용 짧은 응답 토큰 한도 / Short response token limit for skill extraction */
const SKILL_MD_MAX_TOKENS_SHORT = 1024;

/** Skill MD 초안 생성용 전체 토큰 한도 / Full token limit for skill MD draft generation */
const SKILL_MD_MAX_TOKENS_FULL = 4096;

// ── 설정 타입 / Config type ─────────────────────────────────────

/**
 * SkillMdGenerator 설정 / SkillMdGenerator configuration
 *
 * @description
 * KR: SKILL.md 초안 생성에 필요한 프로젝트 메타 정보.
 * EN: Project metadata needed to generate SKILL.md drafts.
 */
export interface SkillMdGeneratorConfig {
  /** 프로젝트 경로 (.adev/skills/ 저장 위치) / Project path (for .adev/skills/ storage) */
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

// ── SkillMdGenerator 클래스 ─────────────────────────────────────

/**
 * SKILL.md 자동 생성기 / SKILL.md auto-generator
 *
 * @description
 * KR: Claude API를 이용해 프로젝트 스펙에서 필요한 Skill을 추출하고,
 *     각 Skill의 SKILL.md 초안을 생성하여 .adev/skills/{skillName}/SKILL.md에 저장한다.
 * EN: Uses Claude API to extract needed skills from project spec,
 *     generate SKILL.md drafts, and save to .adev/skills/{skillName}/SKILL.md.
 *
 * @param claudeApi - Claude Messages API 래퍼 / Claude Messages API wrapper
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const generator = new SkillMdGenerator(claudeApi, logger);
 * const result = await generator.generate(config, specDocument);
 * if (result.ok) {
 *   await generator.save(result.value, config.projectPath);
 * }
 */
export class SkillMdGenerator {
  private readonly logger: Logger;

  constructor(
    private readonly claudeApi: ClaudeApi,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'skill-md-generator' });
  }

  /**
   * 프로젝트 스펙에서 필요한 Skill 목록을 추출하고 SKILL.md 초안을 생성한다
   * Extracts needed skills from project spec and generates SKILL.md drafts
   *
   * @param config - 생성 설정 / Generation config
   * @param specDocument - 프로젝트 스펙 문서 / Project spec document
   * @returns skillName → SKILL.md 내용 맵 / skillName → SKILL.md content map
   */
  async generate(
    config: SkillMdGeneratorConfig,
    specDocument: string,
  ): Promise<Result<Map<string, string>>> {
    this.logger.info('SKILL.md 초안 생성 시작 / Starting SKILL.md draft generation', {
      projectName: config.projectName,
      projectType: config.projectType,
    });

    // Step 1: 스펙에서 필요한 Skill 키워드 추출 / Extract skill keywords from spec
    const extractResult = await this.extractSkillNames(config, specDocument);
    if (!extractResult.ok) {
      return err(extractResult.error);
    }

    const skillNames = extractResult.value;
    if (skillNames.length === 0) {
      this.logger.info('추출된 Skill 없음 — 빈 맵 반환 / No skills extracted');
      return ok(new Map());
    }

    this.logger.info('Skill 키워드 추출 완료 / Skill keywords extracted', {
      count: skillNames.length,
      skills: skillNames,
    });

    // Step 2: 각 Skill별 SKILL.md 초안 병렬 생성 / Generate SKILL.md drafts in parallel
    const entries = await Promise.all(
      skillNames.map(async (skillName) => {
        const result = await this.generateOne(skillName, config, specDocument);
        return { skillName, result } as const;
      }),
    );

    const drafts = new Map<string, string>();
    for (const { skillName, result } of entries) {
      if (!result.ok) {
        this.logger.error(
          `SKILL.md 초안 생성 실패 / SKILL.md draft generation failed: ${skillName}`,
          {
            errorCode: result.error.code,
          },
        );
        return err(result.error);
      }
      drafts.set(skillName, result.value);
    }

    this.logger.info('SKILL.md 초안 생성 완료 / All SKILL.md drafts generated', {
      count: drafts.size,
    });

    return ok(drafts);
  }

  /**
   * 생성된 SKILL.md 초안을 .adev/skills/{skillName}/SKILL.md에 저장한다
   * Saves generated SKILL.md drafts to .adev/skills/{skillName}/SKILL.md
   *
   * @param skills - skillName → 내용 맵 / skillName → content map
   * @param projectPath - 프로젝트 루트 경로 / Project root path
   * @returns ok(void) on success, err on first write failure
   */
  async save(skills: Map<string, string>, projectPath: string): Promise<Result<void>> {
    const skillsDir = join(projectPath, '.adev', 'skills');

    this.logger.info('SKILL.md 초안 저장 시작 / Saving SKILL.md drafts', {
      skillsDir,
      count: skills.size,
    });

    for (const [skillName, content] of skills) {
      const filePath = join(skillsDir, skillName, 'SKILL.md');

      try {
        await Bun.write(filePath, content);
        this.logger.debug(`SKILL.md 저장 완료 / SKILL.md saved: ${skillName}`, { filePath });
      } catch (error: unknown) {
        return err(
          new AdevError(
            'skill_md_save_write_error',
            `SKILL.md 파일 저장 실패 / Failed to write SKILL.md: ${filePath}`,
            error,
          ),
        );
      }
    }

    this.logger.info('SKILL.md 초안 저장 완료 / All SKILL.md drafts saved', { skillsDir });
    return ok(undefined);
  }

  /**
   * 스펙에서 필요한 Skill 이름 목록을 추출한다 / Extract skill names from spec via AI
   *
   * @param config - 생성 설정 / Generation config
   * @param specDocument - 프로젝트 스펙 문서 / Project spec document
   * @returns Skill 이름 배열 / Array of skill names
   */
  private async extractSkillNames(
    config: SkillMdGeneratorConfig,
    specDocument: string,
  ): Promise<Result<readonly string[]>> {
    const prompt = `프로젝트 스펙을 분석하여 Claude Code Skills로 정의할 기술/도메인 키워드 목록을 추출하세요.

프로젝트 정보:
- 이름: ${config.projectName}
- 유형: ${config.projectType}
- 기술 스택: ${config.techStack}

스펙 문서:
${specDocument}

규칙:
- 각 Skill은 kebab-case 이름 (예: code-quality, testing-strategy, api-design)
- 프로젝트에 실제 필요한 Skill만 추출 (최소 3개, 최대 10개)
- JSON 배열로만 응답하세요. 다른 텍스트 없이.

예시 응답:
["code-quality", "testing-strategy", "api-design", "error-handling"]`;

    const result = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
      maxTokens: SKILL_MD_MAX_TOKENS_SHORT,
      timeoutMs: 60_000,
    });

    if (!result.ok) {
      return err(
        new AdevError(
          'skill_md_extract_api_error',
          `Skill 추출 API 호출 실패 / Skill extraction API call failed: ${result.error.message}`,
          result.error,
        ),
      );
    }

    const raw = result.value.content.trim();

    try {
      // WHY: AI 응답이 코드 블록으로 감싸져 있을 수 있으므로 JSON 부분만 추출
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return err(
          new AdevError(
            'skill_md_extract_parse_error',
            'Skill 추출 응답에서 JSON 배열을 찾을 수 없음 / No JSON array found in response',
          ),
        );
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!(Array.isArray(parsed) && parsed.every((item) => typeof item === 'string'))) {
        return err(
          new AdevError(
            'skill_md_extract_parse_error',
            'Skill 추출 응답이 string[] 형태가 아님 / Response is not a string array',
          ),
        );
      }

      return ok(parsed as readonly string[]);
    } catch (parseError: unknown) {
      return err(
        new AdevError(
          'skill_md_extract_parse_error',
          'Skill 추출 응답 JSON 파싱 실패 / Failed to parse skill extraction response',
          parseError,
        ),
      );
    }
  }

  /**
   * 단일 Skill의 SKILL.md 초안을 AI로 생성한다 / Generate a single SKILL.md draft via AI
   *
   * @param skillName - Skill 이름 / Skill name
   * @param config - 생성 설정 / Generation config
   * @param specDocument - 프로젝트 스펙 문서 / Project spec document
   * @returns SKILL.md 내용 문자열 / SKILL.md content string
   */
  private async generateOne(
    skillName: string,
    config: SkillMdGeneratorConfig,
    specDocument: string,
  ): Promise<Result<string>> {
    const prompt = `프로젝트 스펙을 기반으로 "${skillName}" Skill의 SKILL.md 문서를 생성하세요.

프로젝트 정보:
- 이름: ${config.projectName}
- 유형: ${config.projectType}
- 기술 스택: ${config.techStack}
- 코딩 컨벤션: ${config.conventions}

스펙 문서 (참고용):
${specDocument}

SKILL.md 작성 규칙:
- Claude Code Skill 형식
- 프로젝트에 맞춤화된 구체적 지침
- 핵심 원칙, 규칙, 예시 포함
- ${config.language}로 작성

⚠️ 이 문서는 초안입니다. 유저가 검토 후 최종 확정합니다.`;

    this.logger.debug(`SKILL.md 초안 생성 중 / Generating SKILL.md draft: ${skillName}`);

    const result = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
      maxTokens: SKILL_MD_MAX_TOKENS_FULL,
      timeoutMs: 120_000,
    });

    if (!result.ok) {
      return err(
        new AdevError(
          'skill_md_generate_api_error',
          `SKILL.md 초안 API 호출 실패 / SKILL.md draft API call failed: ${skillName} — ${result.error.message}`,
          result.error,
        ),
      );
    }

    const content = result.value.content.trim();

    if (content.length === 0) {
      return err(
        new AdevError(
          'skill_md_generate_empty_response',
          `SKILL.md 초안 빈 응답 / Empty response for SKILL.md draft: ${skillName}`,
        ),
      );
    }

    this.logger.debug(`SKILL.md 초안 생성 완료 / SKILL.md draft generated: ${skillName}`, {
      contentLength: content.length,
    });

    return ok(content);
  }
}
