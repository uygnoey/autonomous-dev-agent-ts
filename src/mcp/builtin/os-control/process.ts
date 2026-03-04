/**
 * 프로세스 관리 도구 / Process management tools
 *
 * @description
 * KR: 외부 프로세스 실행, 목록 조회, 종료 등 프로세스 관리 작업을 수행한다.
 * EN: Performs process management operations like execute, list, kill.
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import { err, ok } from '../../../core/types.js';
import type { Result } from '../../../core/types.js';
import type { McpTool } from '../../types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 프로세스 실행 입력 / Process execution input
 */
export interface ProcessInput {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly stdin?: string;
}

/**
 * 프로세스 도구 출력 / Process tool output
 */
export interface ProcessOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * 프로세스 MCP 도구 목록 / Process MCP tools
 */
export const PROCESS_TOOLS: readonly McpTool[] = [
  {
    name: 'proc_execute',
    description: '명령 실행 / Execute command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '실행할 명령 / Command' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: '명령 인자 / Command arguments',
        },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        env: {
          type: 'object',
          description: '환경 변수 / Environment variables',
        },
        timeoutMs: {
          type: 'number',
          description: '타임아웃 (밀리초) / Timeout in milliseconds',
        },
        stdin: { type: 'string', description: '표준 입력 / Standard input' },
      },
      required: ['command'],
    },
  },
  {
    name: 'proc_list',
    description: '프로세스 목록 조회 / List running processes',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: '필터 문자열 (grep) / Filter string (grep)',
        },
      },
    },
  },
  {
    name: 'proc_kill',
    description: '프로세스 종료 / Kill process',
    inputSchema: {
      type: 'object',
      properties: {
        pid: {
          type: 'number',
          description: '프로세스 ID / Process ID',
        },
        signal: {
          type: 'string',
          description: '시그널 (SIGTERM, SIGKILL 등) / Signal (SIGTERM, SIGKILL, etc.)',
        },
      },
      required: ['pid'],
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 프로세스 관리 도구 실행기 / Process management tool executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 프로세스 관리 명령을 실행한다.
 * EN: Executes process management commands using ProcessExecutor.
 */
export class ProcessManager {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'process-manager' });
  }

  /**
   * 명령 실행 / Execute command
   *
   * @description
   * KR: 외부 명령을 실행하고 결과를 반환한다.
   * EN: Executes external command and returns result.
   */
  async executeCommand(input: ProcessInput): Promise<
    Result<{
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
    }>
  > {
    this.logger.debug('명령 실행 시도', {
      command: input.command,
      args: input.args,
    });

    const result = await this.executor.execute(input.command, input.args ?? [], {
      cwd: input.cwd,
      env: input.env,
      timeoutMs: input.timeoutMs,
      stdin: input.stdin,
    });

    if (!result.ok) {
      return err(result.error);
    }

    return ok(result.value);
  }

  /**
   * 프로세스 목록 조회 / List processes
   *
   * @description
   * KR: ps 명령으로 실행 중인 프로세스 목록을 조회한다.
   * EN: Lists running processes using ps command.
   */
  async listProcesses(filter?: string): Promise<Result<string[]>> {
    this.logger.debug('프로세스 목록 조회', { filter });

    // WHY: ps aux로 모든 프로세스 조회
    const result = await this.executor.execute('ps', ['aux']);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError('proc_list_error', `프로세스 목록 조회 실패: ${result.value.stderr}`),
      );
    }

    let lines = result.value.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // WHY: 필터가 있으면 grep 적용
    if (filter) {
      lines = lines.filter((line) => line.toLowerCase().includes(filter.toLowerCase()));
    }

    return ok(lines);
  }

  /**
   * 프로세스 종료 / Kill process
   *
   * @description
   * KR: 지정된 PID의 프로세스를 시그널로 종료한다.
   * EN: Terminates process with specified PID using signal.
   */
  async killProcess(pid: number, signal = 'SIGTERM'): Promise<Result<void>> {
    this.logger.debug('프로세스 종료 시도', { pid, signal });

    const result = await this.executor.execute('kill', [`-${signal}`, String(pid)]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('proc_kill_error', `프로세스 종료 실패: ${result.value.stderr}`));
    }

    return ok(undefined);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   *
   * @description
   * KR: MCP 프로토콜에 따라 도구를 실행하고 결과를 반환한다.
   * EN: Executes tool according to MCP protocol and returns result.
   */
  async executeTool(toolName: string, input: unknown): Promise<Result<ProcessOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    // WHY: MCP input은 unknown이므로 객체 여부를 먼저 확인 후 안전 접근
    if (typeof input !== 'object' || input === null) {
      return err(new AdevError('invalid_input', '입력이 객체가 아닙니다'));
    }
    const inputObj = input as Record<string, unknown>;

    switch (toolName) {
      case 'proc_execute': {
        const procInput: ProcessInput = {
          command: typeof inputObj.command === 'string' ? inputObj.command : '',
          args: Array.isArray(inputObj.args) ? (inputObj.args as string[]) : undefined,
          cwd: typeof inputObj.cwd === 'string' ? inputObj.cwd : undefined,
          env:
            typeof inputObj.env === 'object' && inputObj.env !== null
              ? (inputObj.env as Record<string, string>)
              : undefined,
          timeoutMs: typeof inputObj.timeoutMs === 'number' ? inputObj.timeoutMs : undefined,
          stdin: typeof inputObj.stdin === 'string' ? inputObj.stdin : undefined,
        };
        const result = await this.executeCommand(procInput);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '명령 실행 성공',
        });
      }

      case 'proc_list': {
        const result = await this.listProcesses(inputObj.filter as string | undefined);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '프로세스 목록 조회 성공',
        });
      }

      case 'proc_kill': {
        if (typeof inputObj.pid !== 'number') {
          return ok({
            success: false,
            message: 'pid는 숫자여야 합니다',
          });
        }
        const result = await this.killProcess(inputObj.pid, inputObj.signal as string | undefined);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          message: '프로세스 종료 성공',
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
