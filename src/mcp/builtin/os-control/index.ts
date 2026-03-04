/**
 * OS 제어 MCP 서버 / OS control MCP server
 *
 * @description
 * KR: 파일 시스템, 프로세스, 시스템 정보를 관리하는 내장 MCP 서버.
 *     ProcessExecutor 기반으로 구현되어 외부 의존성이 없다.
 * EN: Built-in MCP server for filesystem, process, and system info management.
 *     Implemented with ProcessExecutor, no external dependencies.
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import type { Result } from '../../../core/types.js';
import { err, ok } from '../../../core/types.js';
import type { McpServerConfig, McpTool } from '../../types.js';
import {
  FILESYSTEM_TOOLS,
  FilesystemExecutor,
  type FilesystemInput,
  type FilesystemOutput,
} from './filesystem.js';
import { PROCESS_TOOLS, ProcessManager, type ProcessOutput } from './process.js';
import { SYSTEM_INFO_TOOLS, SystemInfoExecutor, type SystemInfoOutput } from './system-info.js';

// ── 서버 설정 / Server Configuration ───────────────────────

/**
 * OS 제어 MCP 서버 설정 / OS control server configuration
 *
 * @description
 * KR: ProcessExecutor 기반 자체 구현. npx 외부 패키지 불필요.
 * EN: Self-implemented using ProcessExecutor. No external npx packages needed.
 *
 * @example
 * import { OS_CONTROL_SERVER } from './os-control/index.js';
 * registry.register(OS_CONTROL_SERVER);
 */
export const OS_CONTROL_SERVER: McpServerConfig = {
  name: 'os-control',
  command: 'builtin', // WHY: 내장 구현, 외부 프로세스 불필요
  args: [],
  enabled: true,
};

// ── 도구 목록 / Tools ──────────────────────────────────────

/**
 * OS 제어 서버의 모든 도구 목록 / All tools for OS control server
 */
export const OS_CONTROL_TOOLS: readonly McpTool[] = [
  ...FILESYSTEM_TOOLS,
  ...PROCESS_TOOLS,
  ...SYSTEM_INFO_TOOLS,
];

// ── 서버 인스턴스 / Server Instance ────────────────────────

/**
 * OS 제어 MCP 서버 실행기 / OS control MCP server executor
 *
 * @description
 * KR: 파일 시스템, 프로세스, 시스템 정보 도구를 통합 관리한다.
 * EN: Manages filesystem, process, and system info tools.
 *
 * @example
 * const server = new OsControlServer(executor, logger);
 * const result = await server.executeTool('fs_read_file', { path: '/tmp/test.txt' });
 */
export class OsControlServer {
  private readonly filesystemExecutor: FilesystemExecutor;
  private readonly processManager: ProcessManager;
  private readonly systemInfoExecutor: SystemInfoExecutor;

  constructor(executor: ProcessExecutor, logger: Logger) {
    this.filesystemExecutor = new FilesystemExecutor(executor, logger);
    this.processManager = new ProcessManager(executor, logger);
    this.systemInfoExecutor = new SystemInfoExecutor(executor, logger);
  }

  /**
   * 사용 가능한 도구 목록 반환 / Get available tools
   */
  getTools(): readonly McpTool[] {
    return OS_CONTROL_TOOLS;
  }

  /**
   * MCP 도구 실행 / Execute MCP tool
   *
   * @description
   * KR: 도구 이름에 따라 적절한 실행기로 라우팅한다.
   * EN: Routes to appropriate executor based on tool name.
   *
   * @param toolName - 도구 이름 / Tool name
   * @param input - 도구 입력 / Tool input
   * @returns 실행 결과 / Execution result
   *
   * @example
   * const result = await server.executeTool('fs_read_file', {
   *   path: '/tmp/test.txt'
   * });
   */
  async executeTool(
    toolName: string,
    // biome-ignore lint/suspicious/noExplicitAny: MCP input은 동적이므로 any 허용
    input: any,
  ): Promise<Result<FilesystemOutput | ProcessOutput | SystemInfoOutput>> {
    // WHY: 도구 이름 접두사로 실행기 선택
    if (toolName.startsWith('fs_')) {
      return this.filesystemExecutor.executeTool(toolName, input as FilesystemInput);
    }

    if (toolName.startsWith('proc_')) {
      return this.processManager.executeTool(toolName, input);
    }

    if (toolName.startsWith('sys_')) {
      return this.systemInfoExecutor.executeTool(toolName, input);
    }

    return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
  }
}

// ── Public API ─────────────────────────────────────────────

export {
  FilesystemExecutor,
  FILESYSTEM_TOOLS,
  type FilesystemInput,
  type FilesystemOutput,
} from './filesystem.js';

export {
  ProcessManager,
  PROCESS_TOOLS,
  type ProcessInput,
  type ProcessOutput,
} from './process.js';

export {
  SystemInfoExecutor,
  SYSTEM_INFO_TOOLS,
  type SystemInfoOutput,
} from './system-info.js';
