/**
 * MCP 서버 라이프사이클 매니저 / MCP server lifecycle manager
 *
 * @description
 * KR: MCP 서버의 초기화, 시작, 정지, 상태 확인을 관리한다.
 *     실제 프로세스 생성은 layer2가 담당하며, 이 모듈은 상태만 관리한다.
 * EN: Manages MCP server initialization, start, stop, and health checks.
 *     Actual process spawning is layer2's responsibility; this module manages state only.
 */

import { McpError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { McpLoader } from './loader.js';
import type { McpRegistry } from './registry.js';
import type { McpServerInstance, McpServerStatus, McpTool } from './types.js';

// ── McpManager ───────────────────────────────────────────────

/**
 * MCP 서버 라이프사이클 매니저 / MCP server lifecycle manager
 *
 * @description
 * KR: McpRegistry와 McpLoader를 조합하여 서버 라이프사이클을 관리한다.
 * EN: Combines McpRegistry and McpLoader to manage server lifecycle.
 *
 * @param registry - 서버 레지스트리 / Server registry
 * @param loader - 설정 로더 / Configuration loader
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const manager = new McpManager(registry, loader, logger);
 * await manager.initialize('~/.adev/mcp', '/project/.adev/mcp');
 * manager.startServer('git');
 */
export class McpManager {
  private readonly instances = new Map<string, McpServerInstance>();

  constructor(
    private readonly registry: McpRegistry,
    private readonly loader: McpLoader,
    private readonly logger: Logger,
  ) {}

  /**
   * 설정을 로드하고 모든 서버를 레지스트리에 등록한다 / Load configs and register all servers
   *
   * @param globalDir - 글로벌 설정 디렉토리 / Global config directory
   * @param projectDir - 프로젝트 설정 디렉토리 (선택) / Project config directory (optional)
   * @returns 성공 시 void / Result with void on success
   */
  async initialize(globalDir: string, projectDir?: string): Promise<Result<void>> {
    const loadResult = await this.loader.loadAndMerge(globalDir, projectDir);
    if (!loadResult.ok) return loadResult;

    this.registry.clear();
    this.instances.clear();

    for (const config of loadResult.value) {
      const registerResult = this.registry.register(config);
      if (!registerResult.ok) {
        this.logger.warn('서버 등록 실패, 건너뜀', {
          name: config.name,
          error: registerResult.error.message,
        });
      }
    }

    this.logger.info('MCP 매니저 초기화 완료', {
      serverCount: this.registry.listServers().length,
    });
    return ok(undefined);
  }

  /**
   * 서버를 시작한다 (상태만 관리) / Start a server (state management only)
   *
   * @description
   * KR: 서버 상태를 starting → running으로 전환한다. 실제 프로세스 생성은 하지 않는다.
   * EN: Transitions server status from starting to running. Does not spawn actual processes.
   *
   * @param name - 시작할 서버 이름 / Server name to start
   * @returns 서버 인스턴스 / Server instance
   */
  startServer(name: string): Result<McpServerInstance> {
    const config = this.registry.getServer(name);
    if (!config) {
      return err(
        new McpError('mcp_server_not_found', `서버를 찾을 수 없습니다 / Server not found: ${name}`),
      );
    }

    if (!config.enabled) {
      return err(
        new McpError('mcp_server_disabled', `비활성화된 서버입니다 / Server is disabled: ${name}`),
      );
    }

    const existing = this.instances.get(name);
    if (existing && existing.status === 'running') {
      return err(
        new McpError(
          'mcp_server_already_running',
          `이미 실행 중인 서버입니다 / Server is already running: ${name}`,
        ),
      );
    }

    const instance: McpServerInstance = {
      config,
      status: 'running',
      tools: [],
      startedAt: new Date(),
    };

    this.instances.set(name, instance);
    this.logger.info('MCP 서버 시작', { name });
    return ok(instance);
  }

  /**
   * 서버를 정지한다 / Stop a server
   *
   * @param name - 정지할 서버 이름 / Server name to stop
   * @returns 성공 시 void / Result with void on success
   */
  stopServer(name: string): Result<void> {
    const instance = this.instances.get(name);
    if (!instance) {
      return err(
        new McpError(
          'mcp_server_not_found',
          `실행 중인 서버를 찾을 수 없습니다 / Running server not found: ${name}`,
        ),
      );
    }

    if (instance.status === 'stopped') {
      return err(
        new McpError(
          'mcp_server_already_stopped',
          `이미 정지된 서버입니다 / Server is already stopped: ${name}`,
        ),
      );
    }

    instance.status = 'stopped';
    this.logger.info('MCP 서버 정지', { name });
    return ok(undefined);
  }

  /**
   * 모든 서버를 정지한다 / Stop all running servers
   *
   * @returns 성공 시 void / Result with void on success
   */
  stopAll(): Result<void> {
    for (const [name, instance] of this.instances) {
      if (instance.status !== 'stopped') {
        instance.status = 'stopped';
        this.logger.debug('MCP 서버 정지', { name });
      }
    }

    this.logger.info('모든 MCP 서버 정지 완료');
    return ok(undefined);
  }

  /**
   * 서버 상태를 조회한다 / Get server status
   *
   * @param name - 조회할 서버 이름 / Server name to check
   * @returns 서버 상태 / Server status
   */
  getStatus(name: string): McpServerStatus {
    const instance = this.instances.get(name);
    return instance?.status ?? 'stopped';
  }

  /**
   * 모든 서버의 상태를 확인한다 / Health check for all servers
   *
   * @returns 서버 이름별 상태 맵 / Map of server names to statuses
   */
  healthCheck(): Result<Record<string, McpServerStatus>> {
    const statuses: Record<string, McpServerStatus> = {};

    for (const config of this.registry.listServers()) {
      statuses[config.name] = this.getStatus(config.name);
    }

    return ok(statuses);
  }

  /**
   * 실행 중인 모든 서버의 도구를 집계한다 / Aggregate tools from all running servers
   *
   * @returns 사용 가능한 도구 목록 / List of available tools
   */
  listTools(): McpTool[] {
    const tools: McpTool[] = [];

    for (const instance of this.instances.values()) {
      if (instance.status === 'running') {
        tools.push(...instance.tools);
      }
    }

    return tools;
  }
}
