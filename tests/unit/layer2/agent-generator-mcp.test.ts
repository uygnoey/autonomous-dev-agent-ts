/**
 * AgentGenerator MCP 도구 자동 포함 테스트 / Tests for MCP tool auto-inclusion in AgentGenerator
 *
 * @description
 * KR: PI-013 — getMcpToolsForAgent 함수와 AgentGenerator의 MCP 도구 통합 검증.
 *     엣지 케이스 비중 80% 이상 준수.
 * EN: Validates getMcpToolsForAgent function and MCP tool integration in AgentGenerator.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { AgentGenerator, getMcpToolsForAgent } from 'layer2/agent-generator.js';
import type { McpTool } from 'mcp/types.js';

const logger = new ConsoleLogger('error');

// ── 테스트 픽스처 / Test fixtures ────────────────────────────────

/** MCP 도구 목록 스텁 / Stub MCP tool list */
const MOCK_MCP_TOOLS: McpTool[] = [
  { name: 'mcp__context7__resolve-library-id', description: 'Resolve library', inputSchema: {} },
  { name: 'mcp__context7__get-library-docs', description: 'Get docs', inputSchema: {} },
  { name: 'mcp__sequential__create-thinking', description: 'Sequential thinking', inputSchema: {} },
  { name: 'mcp__morphllm__apply-pattern', description: 'Apply pattern', inputSchema: {} },
  { name: 'mcp__playwright__navigate', description: 'Navigate', inputSchema: {} },
  { name: 'mcp__playwright__screenshot', description: 'Screenshot', inputSchema: {} },
  { name: 'mcp__unknown__some-tool', description: 'Unknown server', inputSchema: {} },
];

// ── getMcpToolsForAgent ─────────────────────────────────────────

describe('getMcpToolsForAgent', () => {
  // ── 정상 케이스 / Normal cases (20%) ─────────────────────────

  it('architect에 context7, sequential 도구를 반환한다', () => {
    const tools = getMcpToolsForAgent('architect', MOCK_MCP_TOOLS);
    expect(tools).toContain('mcp__context7__resolve-library-id');
    expect(tools).toContain('mcp__context7__get-library-docs');
    expect(tools).toContain('mcp__sequential__create-thinking');
  });

  it('coder에 context7, morphllm 도구를 반환한다', () => {
    const tools = getMcpToolsForAgent('coder', MOCK_MCP_TOOLS);
    expect(tools).toContain('mcp__context7__resolve-library-id');
    expect(tools).toContain('mcp__morphllm__apply-pattern');
  });

  it('tester에 playwright 도구만 반환한다', () => {
    const tools = getMcpToolsForAgent('tester', MOCK_MCP_TOOLS);
    expect(tools).toContain('mcp__playwright__navigate');
    expect(tools).toContain('mcp__playwright__screenshot');
    expect(tools.length).toBe(2);
  });

  // ── 엣지 케이스 / Edge cases (80%) ───────────────────────────

  it('빈 MCP 도구 목록이면 빈 배열을 반환한다', () => {
    const tools = getMcpToolsForAgent('architect', []);
    expect(tools).toEqual([]);
  });

  it('역할에 해당하지 않는 도구는 제외한다', () => {
    const tools = getMcpToolsForAgent('architect', MOCK_MCP_TOOLS);
    // WHY: architect는 morphllm, playwright 접근 불가
    expect(tools).not.toContain('mcp__morphllm__apply-pattern');
    expect(tools).not.toContain('mcp__playwright__navigate');
    expect(tools).not.toContain('mcp__unknown__some-tool');
  });

  it('coder는 playwright에 접근 불가하다', () => {
    const tools = getMcpToolsForAgent('coder', MOCK_MCP_TOOLS);
    expect(tools).not.toContain('mcp__playwright__navigate');
  });

  it('qa에 context7 도구만 반환한다', () => {
    const tools = getMcpToolsForAgent('qa', MOCK_MCP_TOOLS);
    expect(tools.every((t) => t.startsWith('mcp__context7__'))).toBe(true);
  });

  it('qc에 sequential 도구만 반환한다', () => {
    const tools = getMcpToolsForAgent('qc', MOCK_MCP_TOOLS);
    expect(tools.every((t) => t.startsWith('mcp__sequential__'))).toBe(true);
  });

  it('reviewer에 context7, sequential 도구를 반환한다', () => {
    const tools = getMcpToolsForAgent('reviewer', MOCK_MCP_TOOLS);
    const hasContext7 = tools.some((t) => t.startsWith('mcp__context7__'));
    const hasSequential = tools.some((t) => t.startsWith('mcp__sequential__'));
    expect(hasContext7).toBe(true);
    expect(hasSequential).toBe(true);
  });

  it('documenter에 context7 도구만 반환한다', () => {
    const tools = getMcpToolsForAgent('documenter', MOCK_MCP_TOOLS);
    expect(tools.every((t) => t.startsWith('mcp__context7__'))).toBe(true);
  });

  it('알 수 없는 prefix의 도구는 어떤 역할에도 포함되지 않는다', () => {
    const allRoles: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const role of allRoles) {
      const tools = getMcpToolsForAgent(role, MOCK_MCP_TOOLS);
      expect(tools).not.toContain('mcp__unknown__some-tool');
    }
  });

  it('모든 7개 역할에 대해 에러 없이 동작한다', () => {
    const allRoles: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const role of allRoles) {
      expect(() => getMcpToolsForAgent(role, MOCK_MCP_TOOLS)).not.toThrow();
    }
  });
});

// ── AgentGenerator MCP 통합 ─────────────────────────────────────

describe('AgentGenerator MCP 도구 통합', () => {
  it('mcpTools 인자로 생성한 AgentGenerator가 MCP 도구를 포함한다', () => {
    const gen = new AgentGenerator(logger, undefined, MOCK_MCP_TOOLS);
    const result = gen.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('mcp__context7__resolve-library-id');
    }
  });

  it('mcpTools 없이 생성한 AgentGenerator는 기본 도구만 포함한다', () => {
    const gen = new AgentGenerator(logger);
    const result = gen.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).not.toContain('mcp__context7__resolve-library-id');
      // WHY: 기본 도구(Read, Glob, Grep, WebSearch)는 여전히 포함
      expect(result.value.tools).toContain('Read');
    }
  });

  it('coder 역할의 기본 도구와 MCP 도구가 모두 포함된다', () => {
    const gen = new AgentGenerator(logger, undefined, MOCK_MCP_TOOLS);
    const result = gen.generateAgentConfig('coder', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 기본 도구
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Write');
      expect(result.value.tools).toContain('Bash');
      // MCP 도구
      expect(result.value.tools).toContain('mcp__context7__resolve-library-id');
      expect(result.value.tools).toContain('mcp__morphllm__apply-pattern');
    }
  });

  it('tester 역할의 MCP 도구는 playwright만 포함된다', () => {
    const gen = new AgentGenerator(logger, undefined, MOCK_MCP_TOOLS);
    const result = gen.generateAgentConfig('tester', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const mcpTools = result.value.tools.filter((t: string) => t.startsWith('mcp__'));
      expect(mcpTools.every((t: string) => t.startsWith('mcp__playwright__'))).toBe(true);
    }
  });

  it('빈 MCP 도구 목록으로 생성해도 기본 도구는 유지된다', () => {
    const gen = new AgentGenerator(logger, undefined, []);
    const result = gen.generateAgentConfig('coder', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Write');
    }
  });

  it('generateAgentConfigAsync에서도 MCP 도구가 포함된다', async () => {
    const gen = new AgentGenerator(logger, undefined, MOCK_MCP_TOOLS);
    const result = await gen.generateAgentConfigAsync('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tools).toContain('mcp__context7__resolve-library-id');
    }
  });

  it('MCP 도구 중복은 발생하지 않는다', () => {
    const gen = new AgentGenerator(logger, undefined, MOCK_MCP_TOOLS);
    const result = gen.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const toolSet = new Set(result.value.tools);
      expect(toolSet.size).toBe(result.value.tools.length);
    }
  });
});
