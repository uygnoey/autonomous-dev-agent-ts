/**
 * 에이전트 설정 생성기 / Agent Configuration Generator
 *
 * @description
 * KR: 에이전트 역할(AGENT-ROLES.md)에 따라 적절한 AgentConfig를 생성한다.
 *     역할별 시스템 프롬프트, 도구 목록, 최대 턴 수를 결정한다.
 * EN: Generates appropriate AgentConfig based on agent roles (AGENT-ROLES.md).
 *     Determines system prompt, tool list, and max turns per role.
 */

import type { Logger } from 'core/logger.js';
import type { AgentName, Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { IAgentDraftLoader } from 'layer2/agent-draft-loader-types.js';
import type { AgentConfig } from 'layer2/types.js';
import type { McpTool } from 'mcp/types.js';

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

// ── MCP 도구 역할 매핑 / Per-role MCP tool pattern mapping ──────

/**
 * 역할별 MCP 도구 이름 패턴 / MCP tool name patterns per agent role
 *
 * @description
 * KR: 에이전트 역할에 따라 허용할 MCP 도구 이름 패턴(prefix)을 정의한다.
 *     실제 도구 목록은 McpManager.listTools()에서 런타임에 제공받는다.
 * EN: Defines MCP tool name patterns (prefixes) allowed per agent role.
 *     Actual tool list is provided at runtime from McpManager.listTools().
 */
const MCP_TOOL_PATTERNS: Readonly<Record<AgentName, readonly string[]>> = {
  architect: ['mcp__context7__', 'mcp__sequential__'],
  qa: ['mcp__context7__'],
  coder: ['mcp__context7__', 'mcp__morphllm__'],
  tester: ['mcp__playwright__'],
  qc: ['mcp__sequential__'],
  reviewer: ['mcp__context7__', 'mcp__sequential__'],
  documenter: ['mcp__context7__'],
};

/**
 * 사용 가능한 MCP 도구 중 에이전트 역할에 해당하는 도구만 필터링한다 /
 * Filter available MCP tools for a specific agent role
 *
 * @param agentName - 에이전트 이름 / Agent name
 * @param availableMcpTools - 현재 실행 중인 MCP 서버에서 제공하는 도구 목록 / Available MCP tools from running servers
 * @returns 에이전트에 허용된 MCP 도구 이름 배열 / Array of allowed MCP tool names for the agent
 *
 * @example
 * const mcpTools = getMcpToolsForAgent('coder', mcpManager.listTools());
 * // ['mcp__context7__get-library-docs', 'mcp__morphllm__apply-pattern', ...]
 */
function getMcpToolsForAgent(
  agentName: AgentName,
  availableMcpTools: readonly McpTool[],
): string[] {
  const patterns = MCP_TOOL_PATTERNS[agentName];
  return availableMcpTools
    .filter((tool) => patterns.some((prefix) => tool.name.startsWith(prefix)))
    .map((tool) => tool.name);
}

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
 * // 비동기 버전 (draftLoader 활용)
 * const asyncResult = await generator.generateAgentConfigAsync('architect', 'spec...', 'feat-1');
 */
export class AgentGenerator {
  private readonly logger: Logger;
  private readonly draftLoader?: IAgentDraftLoader;
  private readonly mcpTools: readonly McpTool[];

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   * @param draftLoader - 에이전트 드래프트 로더 (선택) / Agent draft loader (optional)
   * @param mcpTools - MCP 서버에서 제공하는 도구 목록 (선택) / Available MCP tools (optional)
   */
  constructor(logger: Logger, draftLoader?: IAgentDraftLoader, mcpTools?: readonly McpTool[]) {
    this.logger = logger.child({ module: 'agent-generator' });
    this.draftLoader = draftLoader;
    this.mcpTools = mcpTools ?? [];
  }

  /**
   * 에이전트 설정을 생성한다 / Generates agent configuration
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectSpec - 프로젝트 스펙 / Project specification
   * @param featureId - 기능 ID / Feature ID
   * @param ragContext - RAG 검색 결과 컨텍스트 (선택) / RAG search context (optional)
   * @returns 생성된 AgentConfig / Generated AgentConfig
   */
  generateAgentConfig(
    agentName: AgentName,
    projectSpec: string,
    featureId: string,
    ragContext?: string,
  ): Result<AgentConfig> {
    const systemPrompt = this.buildSystemPrompt(agentName, projectSpec, ragContext);
    const prompt = this.buildPrompt(agentName, featureId);
    const baseTools = AGENT_TOOLS[agentName];
    // WHY: MCP 도구를 역할별 패턴에 따라 자동 포함 — 스펙 §5 allowedTools 자동 구성
    const mcpToolNames = getMcpToolsForAgent(agentName, this.mcpTools);
    const tools = [...baseTools, ...mcpToolNames];
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

    this.logger.info('에이전트 설정 생성', {
      agentName,
      featureId,
      toolCount: tools.length,
      mcpToolCount: mcpToolNames.length,
    });
    return ok(config);
  }

  /**
   * 에이전트 설정을 비동기로 생성한다 (draftLoader 활용) / Async agent config generation with draft loader
   *
   * @description
   * KR: draftLoader가 주입된 경우 에이전트 .md 드래프트를 시스템 프롬프트 첫 부분에 주입한다.
   *     draftLoader가 없거나 드래프트 내용이 비어있으면 기존 하드코딩 폴백을 사용한다.
   * EN: If draftLoader is injected, prepends agent .md draft to system prompt.
   *     Falls back to hardcoded prompt when loader is absent or draft content is empty.
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectSpec - 프로젝트 스펙 / Project specification
   * @param featureId - 기능 ID / Feature ID
   * @param projectAgentsDir - 프로젝트 에이전트 디렉토리 (선택) / Project agents dir (optional)
   * @param globalAgentsDir - 글로벌 에이전트 디렉토리 (선택) / Global agents dir (optional)
   * @param ragContext - RAG 검색 결과 컨텍스트 (선택) / RAG search context (optional)
   * @returns 생성된 AgentConfig / Generated AgentConfig
   */
  async generateAgentConfigAsync(
    agentName: AgentName,
    projectSpec: string,
    featureId: string,
    projectAgentsDir?: string,
    globalAgentsDir?: string,
    ragContext?: string,
  ): Promise<Result<AgentConfig>> {
    let draftPrefix = '';

    // WHY: draftLoader가 있을 때만 .md 파일 로드 — 선택 주입이므로 없으면 건너뜀
    if (this.draftLoader) {
      const draftResult = await this.draftLoader.load(agentName, projectAgentsDir, globalAgentsDir);
      if (
        draftResult.ok &&
        draftResult.value.content.trim() &&
        draftResult.value.source !== 'builtin'
      ) {
        draftPrefix = `${draftResult.value.content.trim()}\n\n`;
        this.logger.debug('드래프트 파일 시스템 프롬프트에 주입', {
          agentName,
          source: draftResult.value.source,
        });
      }
    }

    const baseSystemPrompt = this.buildSystemPrompt(agentName, projectSpec, ragContext);
    const systemPrompt = draftPrefix ? `${draftPrefix}${baseSystemPrompt}` : baseSystemPrompt;
    const prompt = this.buildPrompt(agentName, featureId);
    const baseTools = AGENT_TOOLS[agentName];
    // WHY: MCP 도구를 역할별 패턴에 따라 자동 포함 — 스펙 §5 allowedTools 자동 구성
    const mcpToolNames = getMcpToolsForAgent(agentName, this.mcpTools);
    const tools = [...baseTools, ...mcpToolNames];
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

    this.logger.info('에이전트 설정 생성 (비동기)', {
      agentName,
      featureId,
      toolCount: tools.length,
      mcpToolCount: mcpToolNames.length,
      hasDraft: draftPrefix.length > 0,
    });
    return ok(config);
  }

  /**
   * 역할별 시스템 프롬프트를 생성한다 / Builds system prompt per role
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param projectSpec - 프로젝트 스펙 / Project specification
   * @param ragContext - RAG 검색 결과 컨텍스트 (선택) / RAG search context (optional)
   * @returns 시스템 프롬프트 / System prompt
   */
  private buildSystemPrompt(
    agentName: AgentName,
    projectSpec: string,
    ragContext?: string,
  ): string {
    const roleDescriptions: Readonly<Record<AgentName, string>> = {
      architect:
        'You are a technical architect. Do NOT write code directly — focus on structure, module decomposition, and design decisions.',
      qa: 'You are a preventive QA gate. Verify spec completeness and design quality BEFORE coding starts. Do NOT write or modify code.',
      coder:
        'You are the sole code implementer. Only you may create or modify source files. Implement strictly per acceptance criteria. Do NOT write test code.',
      tester:
        'You are the tester. Write test cases derived from acceptance criteria and run them. Fail-fast: stop at the first failure. Do NOT modify source code.',
      qc: 'You are the QC inspector. Analyze test results, identify root causes one at a time, and pass/fail judgment. Do NOT modify code.',
      reviewer:
        'You are the code reviewer. Review for quality, SOLID principles, and security basics. Provide feedback only — do NOT modify code.',
      documenter:
        "You are the documenter. Triggered at phase boundaries to generate documentation. Output in the user's language (not English).",
    };

    // WHY: Agents need explicit MCP/search guidance so they search before implementing.
    const mcpGuide = `
## Tool Usage — Search Before Implement (REQUIRED)
1. Read \`.adev/handoff-context.json\` FIRST — it contains full feature specs and acceptance criteria
2. Read \`.claude/SKILL.md\` for recommended MCP tools for this project
3. Before implementing, use \`WebSearch\` to find official documentation for each library
4. If Context7 MCP is available: \`mcp__context7__resolve-library-id\` → \`mcp__context7__get-library-docs\`
5. All code and comments must be in English

## Key Files
- \`.adev/handoff-context.json\` — feature specs, acceptance criteria, test definitions (JSON)
- \`.adev/contract.json\` — contract schema (JSON)
- \`.claude/SPEC.md\` — project specification (English)
- \`.claude/SKILL.md\` — MCP tool guide (English)
- \`.claude/agents/${agentName}.md\` — your role-specific guide`;

    let prompt = `${roleDescriptions[agentName]}${mcpGuide}\n\n## Project Spec\n${projectSpec}`;

    // WHY: Inject RAG context so agents can reuse past decisions and failure history.
    if (ragContext?.trim()) {
      prompt += `\n\n## Past Context (RAG)\n${ragContext}`;
    }

    return prompt;
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
      architect: `Perform technical design for feature '${featureId}'. Read .adev/handoff-context.json first.`,
      qa: `Verify design completeness for feature '${featureId}' against the spec and acceptance criteria.`,
      coder: `Implement feature '${featureId}' per the acceptance criteria in .adev/handoff-context.json. Search for library docs before coding.`,
      tester: `Generate and run tests for feature '${featureId}'. Derive cases from acceptanceCriteria in handoff-context.json. Fail-fast.`,
      qc: `Analyze test results for feature '${featureId}'. Root-cause failures one at a time. Pass/fail judgment only.`,
      reviewer: `Review code for feature '${featureId}'. Check quality, SOLID, security. Feedback only — no code changes.`,
      documenter: `Generate documentation for feature '${featureId}'. Output in the user's language (not English).`,
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
