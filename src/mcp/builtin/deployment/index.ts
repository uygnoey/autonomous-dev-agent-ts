/**
 * 배포 MCP 서버 / Deployment MCP server
 *
 * @description
 * KR: Docker 컨테이너 관리, CI/CD 배포 트리거, 롤백을 제공하는 내장 MCP 서버.
 * EN: Built-in MCP server for Docker container management, CI/CD deploy triggers, and rollback.
 */

import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import {
  DEPLOYMENT_TOOLS,
  type DeployInput,
  type DeployOutput,
  DeploymentExecutor,
} from 'mcp/builtin/deployment/deploy-operations.js';
import type { McpServerConfig, McpTool } from 'mcp/types.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * 배포 MCP 서버 설정 / Deployment server configuration
 *
 * @description
 * KR: ProcessExecutor + Docker CLI 기반 자체 구현.
 * EN: Self-implemented using ProcessExecutor + Docker CLI.
 *
 * @example
 * import { DEPLOYMENT_SERVER } from 'mcp/builtin/deployment/index.js';
 * registry.register(DEPLOYMENT_SERVER);
 */
export const DEPLOYMENT_SERVER: McpServerConfig = {
  name: 'deployment',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * 배포 MCP 서버 실행기 / Deployment MCP server executor
 *
 * @description
 * KR: 배포 관련 도구를 MCP 프로토콜로 제공한다.
 * EN: Provides deployment tools via MCP protocol.
 *
 * @example
 * const server = new DeploymentServer(executor, logger);
 * const result = await server.executeTool('deploy_container_status', {});
 */
export class DeploymentServer {
  private readonly deployExecutor: DeploymentExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.deployExecutor = new DeploymentExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return DEPLOYMENT_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   */
  async executeTool(toolName: string, input: DeployInput): Promise<Result<DeployOutput>> {
    return this.deployExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  DeploymentExecutor,
  DEPLOYMENT_TOOLS,
  type DeployInput,
  type DeployOutput,
} from 'mcp/builtin/deployment/deploy-operations.js';
