/**
 * 파일 시스템 조작 도구 / Filesystem manipulation tools
 *
 * @description
 * KR: 파일 읽기, 쓰기, 삭제, 목록 조회 등 파일 시스템 작업을 수행한다.
 *     도구 정의는 fs-read.ts (읽기)와 fs-write.ts (쓰기)에 분리.
 * EN: Performs filesystem operations like read, write, delete, list files.
 *     Tool definitions split into fs-read.ts (read) and fs-write.ts (write).
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';

// ── re-export 분할 파일 / Re-export split files ──────────────

export { FS_READ_TOOLS } from 'mcp/builtin/os-control/fs-read.js';
export { FS_WRITE_TOOLS } from 'mcp/builtin/os-control/fs-write.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 파일 시스템 도구 입력 / Filesystem tool input
 */
export interface FilesystemInput {
  readonly path: string;
  readonly content?: string;
  readonly recursive?: boolean;
}

/**
 * 파일 시스템 도구 출력 / Filesystem tool output
 */
export interface FilesystemOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 통합 도구 목록 / Combined tool list ───────────────────────

// WHY: 기존 FILESYSTEM_TOOLS를 사용하는 코드 호환성 유지
import { FS_READ_TOOLS } from 'mcp/builtin/os-control/fs-read.js';
import { FS_WRITE_TOOLS } from 'mcp/builtin/os-control/fs-write.js';

/**
 * 파일 시스템 MCP 도구 목록 (읽기 + 쓰기 통합) / Filesystem MCP tools (read + write combined)
 */
export const FILESYSTEM_TOOLS: readonly McpTool[] = [...FS_READ_TOOLS, ...FS_WRITE_TOOLS];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 파일 시스템 도구 실행기 / Filesystem tool executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 파일 시스템 명령을 실행한다.
 * EN: Executes filesystem commands using ProcessExecutor.
 */
export class FilesystemExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'filesystem-executor' });
  }

  /**
   * 파일 읽기 / Read file
   */
  async readFile(path: string): Promise<Result<string>> {
    this.logger.debug('파일 읽기 시도', { path });

    const result = await this.executor.execute('cat', [path]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fs_read_error', `파일 읽기 실패: ${result.value.stderr}`));
    }

    return ok(result.value.stdout);
  }

  /**
   * 파일 쓰기 / Write file
   */
  async writeFile(path: string, content: string): Promise<Result<void>> {
    this.logger.debug('파일 쓰기 시도', { path, contentLength: content.length });

    // WHY: echo를 사용하여 content를 파일에 쓰기 (stdin 활용)
    const result = await this.executor.execute('tee', [path], { stdin: content });
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fs_write_error', `파일 쓰기 실패: ${result.value.stderr}`));
    }

    return ok(undefined);
  }

  /**
   * 디렉토리 목록 조회 / List directory
   */
  async listDirectory(path: string): Promise<Result<string[]>> {
    this.logger.debug('디렉토리 목록 조회', { path });

    const result = await this.executor.execute('ls', ['-1', path]);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fs_list_error', `디렉토리 목록 조회 실패: ${result.value.stderr}`));
    }

    // WHY: ls -1 출력을 줄 단위로 분리
    const files = result.value.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return ok(files);
  }

  /**
   * 파일/디렉토리 삭제 / Delete file or directory
   */
  async delete(path: string, recursive = false): Promise<Result<void>> {
    this.logger.debug('파일/디렉토리 삭제', { path, recursive });

    const args = recursive ? ['-rf', path] : ['-f', path];
    const result = await this.executor.execute('rm', args);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fs_delete_error', `삭제 실패: ${result.value.stderr}`));
    }

    return ok(undefined);
  }

  /**
   * 디렉토리 생성 / Create directory
   */
  async createDirectory(path: string, recursive = false): Promise<Result<void>> {
    this.logger.debug('디렉토리 생성', { path, recursive });

    const args = recursive ? ['-p', path] : [path];
    const result = await this.executor.execute('mkdir', args);
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(new AdevError('fs_mkdir_error', `디렉토리 생성 실패: ${result.value.stderr}`));
    }

    return ok(undefined);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(toolName: string, input: FilesystemInput): Promise<Result<FilesystemOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    switch (toolName) {
      case 'fs_read_file': {
        const result = await this.readFile(input.path);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '파일 읽기 성공',
        });
      }

      case 'fs_write_file': {
        if (!input.content) {
          return ok({
            success: false,
            message: 'content 필드 필수',
          });
        }
        const result = await this.writeFile(input.path, input.content);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          message: '파일 쓰기 성공',
        });
      }

      case 'fs_list_directory': {
        const result = await this.listDirectory(input.path);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          data: result.value,
          message: '디렉토리 목록 조회 성공',
        });
      }

      case 'fs_delete': {
        const result = await this.delete(input.path, input.recursive);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          message: '삭제 성공',
        });
      }

      case 'fs_create_directory': {
        const result = await this.createDirectory(input.path, input.recursive);
        if (!result.ok) {
          return ok({
            success: false,
            message: result.error.message,
          });
        }
        return ok({
          success: true,
          message: '디렉토리 생성 성공',
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
