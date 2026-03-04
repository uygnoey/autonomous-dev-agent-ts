/**
 * Git 작업 MCP 서버 / Git operations MCP server
 *
 * @description
 * KR: Git 명령을 래핑하는 내장 MCP 서버.
 *     ProcessExecutor 기반으로 구현되어 외부 의존성이 없다.
 * EN: Built-in MCP server wrapping Git commands.
 *     Implemented with ProcessExecutor, no external dependencies.
 */

import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import type { Result } from '../../../core/types.js';
import type { McpServerConfig, McpTool } from '../../types.js';
import { GIT_TOOLS, GitExecutor, type GitInput, type GitOutput } from './git-operations.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * Git MCP 서버 설정 / Git server configuration
 *
 * @description
 * KR: ProcessExecutor 기반 자체 구현. npx 외부 패키지 불필요.
 * EN: Self-implemented using ProcessExecutor. No external npx packages needed.
 *
 * @example
 * import { GIT_SERVER } from './git/index.js';
 * registry.register(GIT_SERVER);
 */
export const GIT_SERVER: McpServerConfig = {
  name: 'git',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * Git MCP 서버 실행기 / Git MCP server executor
 *
 * @description
 * KR: Git 명령을 MCP 도구로 제공한다.
 * EN: Provides Git commands as MCP tools.
 *
 * @example
 * const server = new GitServer(executor, logger);
 * const result = await server.executeTool('git_status', { cwd: '/project' });
 */
export class GitServer {
  private readonly gitExecutor: GitExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.gitExecutor = new GitExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return GIT_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @description
   * KR: Git 도구를 실행하고 결과를 반환한다.
   * EN: Executes Git tool and returns result.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   *
   * @example
   * const result = await server.executeTool('git_commit', {
   *   message: 'feat: add new feature',
   *   cwd: '/project'
   * });
   */
  async executeTool(toolName: string, input: GitInput): Promise<Result<GitOutput>> {
    return this.gitExecutor.executeTool(toolName, input);
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  GitExecutor,
  GIT_TOOLS,
  type GitInput,
  type GitOutput,
} from './git-operations.js';
