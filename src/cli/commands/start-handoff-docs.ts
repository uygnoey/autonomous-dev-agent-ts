/**
 * Handoff document generator for Layer1 → Layer2 context injection
 *
 * @description
 * Creates development context files before Layer2 starts:
 *   - .adev/handoff-context.json  — full feature specs in JSON (machine-readable)
 *   - .claude/SPEC.md             — project spec in English (agent-readable)
 *   - .claude/CLAUDE.md           — agent coding guide in English
 *   - .claude/SKILL.md            — MCP tool search guide in English
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from '../../core/logger.js';
import type { HandoffPackage } from '../../layer1/types.js';

// ── MCP detection ──────────────────────────────────────────────────

/**
 * Detect relevant MCP tools based on project type.
 *
 * @param projectType - Project type string from contract
 * @returns Array of MCP recommendation strings
 */
function detectRelevantMcps(projectType: string): readonly string[] {
  const mcps: string[] = [
    '- `mcp__sequential__thinking` — complex multi-step design analysis (architect, qc)',
  ];

  if (/web|frontend|react|vue|angular|next|nuxt/i.test(projectType)) {
    mcps.push(
      '- `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs` — React/Vue/Angular official docs',
    );
    mcps.push('- `mcp__playwright__*` — browser E2E testing (tester)');
  }
  if (/api|rest|graphql|backend|server|express|fastify|hono/i.test(projectType)) {
    mcps.push(
      '- `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs` — backend framework official docs',
    );
  }
  if (/cli|terminal|command/i.test(projectType)) {
    mcps.push(
      '- `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs` — CLI library official docs',
    );
  }
  if (/typescript|ts|javascript|js|bun|node/i.test(projectType)) {
    mcps.push(
      '- `mcp__context7__resolve-library-id` → `mcp__context7__get-library-docs` — TypeScript/Bun SDK docs',
    );
  }

  return mcps;
}

// ── JSON builder ───────────────────────────────────────────────────

/**
 * Build detailed handoff context as a plain object (to be serialized as JSON).
 *
 * @param handoff - HandoffPackage from Layer1
 * @returns Plain object representing full handoff context
 */
function buildHandoffContextJson(handoff: HandoffPackage): Record<string, unknown> {
  const { contract } = handoff;
  const mcps = detectRelevantMcps(contract.projectType);

  const features = contract.features.map((f) => {
    const testDef = contract.testDefinitions.find((td) => td.featureId === f.id);
    return {
      id: f.id,
      name: f.name,
      description: f.description,
      dependencies: f.dependencies,
      inputs: f.inputs,
      outputs: f.outputs,
      acceptanceCriteria: f.acceptanceCriteria,
      testDefinition: testDef ?? null,
    };
  });

  return {
    version: '1.0',
    projectId: handoff.projectId,
    projectType: contract.projectType,
    createdAt: new Date().toISOString(),
    implementationOrder: contract.implementationOrder,
    features,
    verificationMatrix: contract.verificationMatrix,
    recommendedMcps: mcps,
    agentGuidance: {
      architect: 'Read handoff-context.json → design module structure → document decisions',
      qa: 'Verify spec completeness → check acceptance criteria coverage → report gaps',
      coder: 'Read handoff-context.json → implement per acceptance criteria → no test code',
      tester: 'Generate test cases from acceptanceCriteria → run → fail-fast on first failure',
      qc: 'Analyze test results → root-cause one failure at a time → pass/fail judgment',
      reviewer: 'Review code quality → SOLID principles → security basics → feedback only',
      documenter: 'Restore LanceDB context → write deliverable docs → user language output',
    },
  };
}

// ── Markdown builders ──────────────────────────────────────────────

/**
 * Build .claude/CLAUDE.md content (English, for agents).
 *
 * @param handoff - HandoffPackage
 * @returns Markdown string
 */
function buildClaudeMd(handoff: HandoffPackage): string {
  const { contract } = handoff;
  const order = contract.implementationOrder.map((id, i) => `${i + 1}. ${id}`).join('\n');

  return `# ${handoff.projectId} — Agent Guide

## CRITICAL: Read Before Starting
1. \`.adev/handoff-context.json\` — full feature specs, acceptance criteria, test definitions
2. \`.claude/SPEC.md\` — project specification
3. \`.claude/SKILL.md\` — MCP tool guide (search before implementing)
4. \`.claude/agents/{your-role}.md\` — your specific role instructions

## Project
- Type: ${contract.projectType}
- Project ID: ${handoff.projectId}
- Completeness score: ${(contract.verificationMatrix.completenessScore * 100).toFixed(0)}%

## Implementation Order
${order}

## Development Rules (NON-NEGOTIABLE)
- **English only**: all code, comments, variable names, log messages — no Korean/Japanese
- **Read handoff first**: never invent requirements — read \`.adev/handoff-context.json\`
- **Search before implement**: use WebSearch or Context7 MCP for any library/framework
- **Role boundaries**: strictly follow your agent role — no crossing into other roles
- **Result pattern**: use \`Result<T, E>\` — no raw throws except at boundaries
- **300-line limit**: split files when they exceed 300 lines

## Verification Checklist (before done)
- [ ] All acceptance criteria from handoff-context.json are met
- [ ] Code is in English
- [ ] No circular dependencies
- [ ] Tests pass (tester role)
- [ ] Docs generated (documenter role)
`;
}

/**
 * Build .claude/SPEC.md content (English, for agents).
 *
 * @param handoff - HandoffPackage
 * @returns Markdown string
 */
function buildSpecMd(handoff: HandoffPackage): string {
  const { contract } = handoff;
  const matrix = contract.verificationMatrix;
  const order = contract.implementationOrder.map((id, i) => `${i + 1}. ${id}`).join('\n');

  return `# Project Specification

${handoff.specDocument}

---

## Implementation Order
${order}

## Verification Matrix
- Completeness: ${(matrix.completenessScore * 100).toFixed(0)}%
- All features have criteria: ${matrix.allFeaturesHaveCriteria ? 'YES' : 'NO'}
- All I/O defined: ${matrix.allIODefined ? 'YES' : 'NO'}
- All criteria have tests: ${matrix.allCriteriaHaveTests ? 'YES' : 'NO'}
- No cyclic dependencies: ${matrix.noCyclicDependencies ? 'YES' : 'NO'}
`;
}

/**
 * Build .claude/SKILL.md content (English MCP guide, for agents).
 *
 * @param projectType - Project type from contract
 * @returns Markdown string
 */
function buildSkillMd(projectType: string): string {
  const mcps = detectRelevantMcps(projectType);
  const mcpList = mcps.join('\n');

  return `# MCP Tool & Search Guide

## MANDATORY: Search Before Implement
Before writing any code for a feature:
1. Run \`WebSearch\` to find official documentation for each library/framework used
2. If Context7 MCP is available, use the pattern:
   \`mcp__context7__resolve-library-id\` → \`mcp__context7__get-library-docs\`
3. Document what you found before writing code

## Recommended MCPs for This Project (${projectType})
${mcpList}

## General MCP Availability
- **WebSearch** — always available (all agents)
- **Context7** — \`mcp__context7__resolve-library-id\` + \`mcp__context7__get-library-docs\`
- **Sequential** — \`mcp__sequential__thinking\` for complex analysis
- **Playwright** — \`mcp__playwright__*\` for browser automation

## Search Strategy
- For libraries: \`{library} official documentation\` or \`{library} API reference\`
- For patterns: \`{pattern} TypeScript example\` or \`{tech-stack} best practices\`
- For errors: search the exact error message + tech stack

## When to Search (by role)
- **architect**: search architecture patterns, dependency management best practices
- **coder**: search API usage, implementation examples before writing code
- **tester**: search testing patterns, coverage strategies for the tech stack
- **reviewer**: search security advisories, known anti-patterns
`;
}

// ── Main export ────────────────────────────────────────────────────

/**
 * Generate all handoff context documents for Layer2 agent consumption.
 *
 * @description
 * Creates (best-effort, warns on failure):
 *   - .adev/handoff-context.json  — detailed JSON feature context
 *   - .claude/SPEC.md             — project spec (English, for agents)
 *   - .claude/CLAUDE.md           — agent coding guide (English)
 *   - .claude/SKILL.md            — MCP search guide (English)
 *
 * @param handoff - HandoffPackage from Layer1
 * @param projectPath - Target project root path
 * @param logger - Logger instance
 */
export async function generateHandoffDocs(
  handoff: HandoffPackage,
  projectPath: string,
  logger: Logger,
): Promise<void> {
  try {
    const adevDir = resolve(projectPath, '.adev');
    const claudeDir = resolve(projectPath, '.claude');
    await Promise.all([mkdir(adevDir, { recursive: true }), mkdir(claudeDir, { recursive: true })]);

    const contextJson = buildHandoffContextJson(handoff);
    const claudeMd = buildClaudeMd(handoff);
    const specMd = buildSpecMd(handoff);
    const skillMd = buildSkillMd(handoff.contract.projectType);

    await Promise.all([
      Bun.write(resolve(adevDir, 'handoff-context.json'), JSON.stringify(contextJson, null, 2)),
      Bun.write(resolve(claudeDir, 'CLAUDE.md'), claudeMd),
      Bun.write(resolve(claudeDir, 'SPEC.md'), specMd),
      Bun.write(resolve(claudeDir, 'SKILL.md'), skillMd),
    ]);

    logger.info('Handoff docs generated', {
      files: ['handoff-context.json', 'CLAUDE.md', 'SPEC.md', 'SKILL.md'],
      projectPath,
    });
  } catch (error: unknown) {
    logger.warn('Handoff docs generation failed — skipping', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
