/**
 * 에이전트 설정 생성기 / Agent Configuration Generator
 *
 * @description
 * KR: 에이전트 역할(AGENT-ROLES.md)에 따라 적절한 AgentConfig를 생성한다.
 *     역할별 시스템 프롬프트, 도구 목록, 최대 턴 수를 결정한다.
 * EN: Generates appropriate AgentConfig based on agent roles (AGENT-ROLES.md).
 *     Determines system prompt, tool list, and max turns per role.
 */

import type { Logger } from '../core/logger.js';
import type { AgentName, Result } from '../core/types.js';
import { ok } from '../core/types.js';
import type { AgentConfig } from './types.js';

// ── 역할별 도구 정의 / Per-role tool definitions ─────────────────

/**
 * 역할별 도구 매핑 / Tool mapping per agent role
 *
 * @description
 * KR: AGENT-ROLES.md에 따라 각 에이전트가 사용할 수 있는 도구를 정의한다.
 *     coder만 코드 수정 도구를 가진다.
 * EN: Defines tools available to each agent per AGENT-ROLES.md.
 *     Only coder has code modification tools.
 */
const AGENT_TOOLS: Readonly<Record<AgentName, readonly string[]>> = {
  architect: ['Read', 'Glob', 'Grep', 'WebSearch'],
  qa: ['Read', 'Glob', 'Grep'],
  coder: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
  tester: ['Read', 'Glob', 'Grep', 'Bash'],
  qc: ['Read', 'Glob', 'Grep'],
  reviewer: ['Read', 'Glob', 'Grep'],
  documenter: ['Read', 'Write', 'Glob', 'Grep'],
};

/**
 * 역할별 최대 턴 수 / Max turns per agent role
 */
const AGENT_MAX_TURNS: Readonly<Record<AgentName, number>> = {
  architect: 50,
  qa: 30,
  coder: 100,
  tester: 80,
  qc: 30,
  reviewer: 30,
  documenter: 40,
};

/**
 * 에이전트 설정 생성기 / Agent Configuration Generator
 *
 * @description
 * KR: 에이전트 역할과 프로젝트 스펙을 기반으로 AgentConfig를 생성한다.
 * EN: Generates AgentConfig based on agent role and project specification.
 *
 * @example
 * const generator = new AgentGenerator(logger);
 * const result = generator.generateAgentConfig('architect', 'spec...', 'feat-1');
 */
export class AgentGenerator {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'agent-generator' });
  }

  /**
   * 에이전트 설정을 생성한다 / Generates agent configuration
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectSpec - 프로젝트 스펙 / Project specification
   * @param featureId - 기능 ID / Feature ID
   * @returns 생성된 AgentConfig / Generated AgentConfig
   */
  generateAgentConfig(
    agentName: AgentName,
    projectSpec: string,
    featureId: string,
  ): Result<AgentConfig> {
    const systemPrompt = this.buildSystemPrompt(agentName, projectSpec);
    const prompt = this.buildPrompt(agentName, featureId);
    const tools = AGENT_TOOLS[agentName];
    const maxTurns = AGENT_MAX_TURNS[agentName];

    const config: AgentConfig = {
      name: agentName,
      projectId: '',
      featureId,
      phase: this.getDefaultPhase(agentName),
      systemPrompt,
      prompt,
      tools,
      maxTurns,
    };

    this.logger.info('에이전트 설정 생성', { agentName, featureId, toolCount: tools.length });
    return ok(config);
  }

  /**
   * 역할별 시스템 프롬프트를 생성한다 / Builds system prompt per role
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectSpec - 프로젝트 스펙 / Project specification
   * @returns 시스템 프롬프트 / System prompt
   */
  private buildSystemPrompt(agentName: AgentName, projectSpec: string): string {
    const roleDescriptions: Readonly<Record<AgentName, string>> = {
      architect: '당신은 기술 설계자입니다. 코드를 직접 작성하지 않고, 구조와 설계를 결정합니다.',
      qa: '당신은 QA 예방 Gate입니다. 코딩 전 스펙 대비 설계 완성도를 검증합니다.',
      coder:
        '당신은 코드 구현자입니다. 유일하게 코드 수정 권한이 있습니다. 설계에 따라 구현합니다.',
      tester: '당신은 테스터입니다. 테스트를 생성하고 실행합니다.',
      qc: '당신은 QC 검출자입니다. 코딩 후 테스트 결과를 기반으로 합격/불합격을 판정합니다.',
      reviewer: '당신은 코드 리뷰어입니다. 코드 품질을 판정하고 개선점을 제안합니다.',
      documenter: '당신은 문서 생성자입니다. Phase 경계에서 트리거되어 문서를 생성합니다.',
    };

    return `${roleDescriptions[agentName]}\n\n프로젝트 스펙:\n${projectSpec}`;
  }

  /**
   * 역할별 실행 프롬프트를 생성한다 / Builds execution prompt per role
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param featureId - 기능 ID / Feature ID
   * @returns 실행 프롬프트 / Execution prompt
   */
  private buildPrompt(agentName: AgentName, featureId: string): string {
    const prompts: Readonly<Record<AgentName, string>> = {
      architect: `기능 '${featureId}'의 기술 설계를 수행하세요.`,
      qa: `기능 '${featureId}'의 설계를 스펙 대비 검증하세요.`,
      coder: `기능 '${featureId}'를 설계에 따라 구현하세요.`,
      tester: `기능 '${featureId}'의 테스트를 생성하고 실행하세요.`,
      qc: `기능 '${featureId}'의 테스트 결과를 분석하고 합격/불합격을 판정하세요.`,
      reviewer: `기능 '${featureId}'의 코드를 리뷰하세요.`,
      documenter: `기능 '${featureId}'의 문서를 생성하세요.`,
    };

    return prompts[agentName];
  }

  /**
   * 에이전트의 기본 Phase를 반환한다 / Returns default phase for an agent
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @returns 기본 Phase / Default phase
   */
  private getDefaultPhase(agentName: AgentName): AgentConfig['phase'] {
    const phaseMapping: Readonly<Record<AgentName, AgentConfig['phase']>> = {
      architect: 'DESIGN',
      qa: 'DESIGN',
      coder: 'CODE',
      tester: 'TEST',
      qc: 'TEST',
      reviewer: 'CODE',
      documenter: 'DESIGN',
    };

    return phaseMapping[agentName];
  }
}
