/**
 * 시스템 정보 조회 도구 / System information tools
 *
 * @description
 * KR: CPU, 메모리, 디스크 사용량 등 시스템 정보를 조회한다.
 * EN: Retrieves system information like CPU, memory, disk usage.
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import { err, ok } from '../../../core/types.js';
import type { Result } from '../../../core/types.js';
import type { McpTool } from '../../types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 시스템 정보 출력 / System info output
 */
export interface SystemInfoOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * 시스템 정보 MCP 도구 목록 / System info MCP tools
 */
export const SYSTEM_INFO_TOOLS: readonly McpTool[] = [
  {
    name: 'sys_info',
    description: '시스템 정보 조회 / Get system information',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sys_disk_usage',
    description: '디스크 사용량 조회 / Get disk usage',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '조회할 경로 (기본: /) / Path to check (default: /)',
        },
      },
    },
  },
  {
    name: 'sys_memory_usage',
    description: '메모리 사용량 조회 / Get memory usage',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sys_cpu_usage',
    description: 'CPU 사용률 조회 / Get CPU usage',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 시스템 정보 조회 실행기 / System info executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 시스템 정보 조회 명령을 실행한다.
 * EN: Executes system info commands using ProcessExecutor.
 */
export class SystemInfoExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'system-info-executor' });
  }

  /**
   * 시스템 정보 조회 / Get system info
   *
   * @description
   * KR: uname 명령으로 OS 정보를 조회한다.
   * EN: Retrieves OS information using uname command.
   */
  async getSystemInfo(): Promise<Result<Record<string, string>>> {
    this.logger.debug('시스템 정보 조회 시도');

    const result = await this.executor.execute('uname', ['-a']);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('sys_info_error', `시스템 정보 조회 실패: ${result.value.stderr}`));
    }

    return ok({
      platform: process.platform,
      arch: process.arch,
      uname: result.value.stdout.trim(),
    });
  }

  /**
   * 디스크 사용량 조회 / Get disk usage
   *
   * @description
   * KR: df 명령으로 디스크 사용량을 조회한다.
   * EN: Retrieves disk usage using df command.
   */
  async getDiskUsage(path = '/'): Promise<Result<string>> {
    this.logger.debug('디스크 사용량 조회', { path });

    const result = await this.executor.execute('df', ['-h', path]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError('disk_usage_error', `디스크 사용량 조회 실패: ${result.value.stderr}`),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * 메모리 사용량 조회 / Get memory usage
   *
   * @description
   * KR: free 명령 (Linux) 또는 vm_stat (macOS)로 메모리 사용량을 조회한다.
   * EN: Retrieves memory usage using free (Linux) or vm_stat (macOS).
   */
  async getMemoryUsage(): Promise<Result<string>> {
    this.logger.debug('메모리 사용량 조회');

    // WHY: macOS는 vm_stat, Linux는 free 사용
    const command = process.platform === 'darwin' ? 'vm_stat' : 'free';
    const args = process.platform === 'darwin' ? [] : ['-h'];

    const result = await this.executor.execute(command, args);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError('memory_usage_error', `메모리 사용량 조회 실패: ${result.value.stderr}`),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * CPU 사용률 조회 / Get CPU usage
   *
   * @description
   * KR: top 명령으로 CPU 사용률을 조회한다.
   * EN: Retrieves CPU usage using top command.
   */
  async getCpuUsage(): Promise<Result<string>> {
    this.logger.debug('CPU 사용률 조회');

    // WHY: top -l 1 (macOS) 또는 top -bn1 (Linux)로 1회 스냅샷
    const args = process.platform === 'darwin' ? ['-l', '1', '-n', '5'] : ['-bn1'];

    const result = await this.executor.execute('top', args, {
      timeoutMs: 5000, // WHY: top은 오래 걸릴 수 있으므로 5초 제한
    });
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('cpu_usage_error', `CPU 사용률 조회 실패: ${result.value.stderr}`));
    }

    return ok(result.value.stdout);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   *
   * @description
   * KR: MCP 프로토콜에 따라 도구를 실행하고 결과를 반환한다.
   * EN: Executes tool according to MCP protocol and returns result.
   */
  async executeTool(toolName: string, input: unknown): Promise<Result<SystemInfoOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    switch (toolName) {
      case 'sys_info': {
        const result = await this.getSystemInfo();
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '시스템 정보 조회 성공',
        });
      }

      case 'sys_disk_usage': {
        const diskInput =
          typeof input === 'object' && input !== null && 'path' in input
            ? (input as { path: string })
            : { path: '/' };
        const result = await this.getDiskUsage(diskInput.path);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '디스크 사용량 조회 성공',
        });
      }

      case 'sys_memory_usage': {
        const result = await this.getMemoryUsage();
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '메모리 사용량 조회 성공',
        });
      }

      case 'sys_cpu_usage': {
        const result = await this.getCpuUsage();
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: 'CPU 사용률 조회 성공',
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
