/**
 * MCP 서버 레지스트리 / MCP server registry
 *
 * @description
 * KR: MCP 서버 설정을 등록·조회·삭제하는 인메모리 레지스트리.
 * EN: In-memory registry for registering, querying, and removing MCP server configs.
 */

import { McpError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type { McpServerConfig } from './types.js';

// ── McpRegistry ──────────────────────────────────────────────

/**
 * MCP 서버 레지스트리 / MCP server config registry
 *
 * @description
 * KR: 서버 이름 기반으로 McpServerConfig를 관리한다. 중복 이름 등록을 방지한다.
 * EN: Manages McpServerConfig entries by name. Prevents duplicate name registration.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const registry = new McpRegistry(logger);
 * registry.register({ name: 'git', command: 'npx', args: ['-y', '@anthropic/mcp-git'], enabled: true });
 * const server = registry.getServer('git');
 */
export class McpRegistry {
  private readonly servers = new Map<string, McpServerConfig>();

  constructor(private readonly logger: Logger) {}

  /**
   * 서버 설정을 등록한다 / Register a server configuration
   *
   * @param config - 등록할 서버 설정 / Server config to register
   * @returns 성공 시 void, 실패 시 McpError / Result with void or McpError
   *
   * @throws McpError - 빈 이름, 빈 command, 중복 이름 / Empty name, empty command, duplicate name
   */
  register(config: McpServerConfig): Result<void> {
    if (config.name.trim().length === 0) {
      return err(
        new McpError('mcp_invalid_config', '서버 이름이 비어 있습니다 / Server name is empty'),
      );
    }

    if (config.command.trim().length === 0) {
      return err(
        new McpError(
          'mcp_invalid_config',
          '서버 command가 비어 있습니다 / Server command is empty',
        ),
      );
    }

    if (this.servers.has(config.name)) {
      return err(
        new McpError(
          'mcp_duplicate_server',
          `이미 등록된 서버 이름입니다 / Server name already registered: ${config.name}`,
        ),
      );
    }

    this.servers.set(config.name, config);
    this.logger.debug('MCP 서버 등록 완료', { name: config.name });
    return ok(undefined);
  }

  /**
   * 서버 설정을 등록 해제한다 / Unregister a server configuration
   *
   * @param name - 해제할 서버 이름 / Server name to unregister
   * @returns 성공 시 void, 존재하지 않으면 McpError / Result with void or McpError
   */
  unregister(name: string): Result<void> {
    if (!this.servers.has(name)) {
      return err(
        new McpError(
          'mcp_server_not_found',
          `등록되지 않은 서버입니다 / Server not found: ${name}`,
        ),
      );
    }

    this.servers.delete(name);
    this.logger.debug('MCP 서버 등록 해제', { name });
    return ok(undefined);
  }

  /**
   * 이름으로 서버 설정을 조회한다 / Get server config by name
   *
   * @param name - 조회할 서버 이름 / Server name to look up
   * @returns 서버 설정 또는 null / Server config or null if not found
   */
  getServer(name: string): McpServerConfig | null {
    return this.servers.get(name) ?? null;
  }

  /**
   * 등록된 모든 서버 설정 목록을 반환한다 / List all registered server configs
   *
   * @returns 서버 설정 배열 / Array of server configs
   */
  listServers(): McpServerConfig[] {
    return [...this.servers.values()];
  }

  /**
   * 레지스트리를 초기화한다 / Clear all registered servers
   */
  clear(): void {
    this.servers.clear();
    this.logger.debug('MCP 레지스트리 초기화 완료');
  }
}
