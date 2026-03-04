/**
 * Git 작업 도구 / Git operation tools
 *
 * @description
 * KR: Git 명령을 래핑하여 MCP 도구로 제공한다.
 * EN: Wraps Git commands and provides them as MCP tools.
 */

import { AdevError } from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ProcessExecutor } from '../../../core/process-executor.js';
import { err, ok } from '../../../core/types.js';
import type { Result } from '../../../core/types.js';
import type { McpTool } from '../../types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * Git 도구 입력 / Git tool input
 */
export interface GitInput {
  readonly cwd?: string;
  readonly branch?: string;
  readonly message?: string;
  readonly remote?: string;
  readonly files?: readonly string[];
  readonly command?: string;
  readonly args?: readonly string[];
}

/**
 * Git 도구 출력 / Git tool output
 */
export interface GitOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ───────────────────────────

/**
 * Git MCP 도구 목록 / Git MCP tools
 */
export const GIT_TOOLS: readonly McpTool[] = [
  {
    name: 'git_status',
    description: 'Git 상태 조회 / Get Git status',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
    },
  },
  {
    name: 'git_diff',
    description: 'Git diff 조회 / Get Git diff',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '특정 파일만 diff / Specific files to diff',
        },
      },
    },
  },
  {
    name: 'git_add',
    description: '파일 스테이징 / Stage files',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '스테이징할 파일 목록 / Files to stage',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'git_commit',
    description: '커밋 생성 / Create commit',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        message: { type: 'string', description: '커밋 메시지 / Commit message' },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_push',
    description: '원격 저장소 푸시 / Push to remote',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        remote: { type: 'string', description: '원격 저장소 이름 / Remote name' },
        branch: { type: 'string', description: '브랜치 이름 / Branch name' },
      },
    },
  },
  {
    name: 'git_pull',
    description: '원격 저장소 풀 / Pull from remote',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        remote: { type: 'string', description: '원격 저장소 이름 / Remote name' },
        branch: { type: 'string', description: '브랜치 이름 / Branch name' },
      },
    },
  },
  {
    name: 'git_branch',
    description: '브랜치 목록 조회 / List branches',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
    },
  },
  {
    name: 'git_checkout',
    description: '브랜치 체크아웃 / Checkout branch',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        branch: { type: 'string', description: '브랜치 이름 / Branch name' },
      },
      required: ['branch'],
    },
  },
  {
    name: 'git_log',
    description: '커밋 로그 조회 / Get commit log',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
    },
  },
  {
    name: 'git_exec',
    description: '임의의 Git 명령 실행 / Execute arbitrary Git command',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
        command: { type: 'string', description: 'Git 서브 명령 / Git subcommand' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: '명령 인자 / Command arguments',
        },
      },
      required: ['command'],
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * Git 작업 실행기 / Git operations executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 Git 명령을 실행한다.
 * EN: Executes Git commands using ProcessExecutor.
 */
export class GitExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'git-executor' });
  }

  /**
   * Git 명령 실행 헬퍼 / Helper to execute Git commands
   */
  private async executeGit(args: readonly string[], cwd?: string): Promise<Result<string>> {
    const result = await this.executor.execute('git', args, { cwd });
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError(
          'git_command_error',
          `Git 명령 실패: ${result.value.stderr || result.value.stdout}`,
        ),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * Git 상태 조회 / Get Git status
   */
  async status(cwd?: string): Promise<Result<string>> {
    this.logger.debug('Git 상태 조회', { cwd });
    return this.executeGit(['status'], cwd);
  }

  /**
   * Git diff 조회 / Get Git diff
   */
  async diff(cwd?: string, files?: readonly string[]): Promise<Result<string>> {
    this.logger.debug('Git diff 조회', { cwd, files });
    const args = ['diff', ...(files ?? [])];
    return this.executeGit(args, cwd);
  }

  /**
   * 파일 스테이징 / Stage files
   */
  async add(files: readonly string[], cwd?: string): Promise<Result<void>> {
    this.logger.debug('파일 스테이징', { files, cwd });
    const result = await this.executeGit(['add', ...files], cwd);
    if (!result.ok) {
      return err(result.error);
    }
    return ok(undefined);
  }

  /**
   * 커밋 생성 / Create commit
   */
  async commit(message: string, cwd?: string): Promise<Result<string>> {
    this.logger.debug('커밋 생성', { message, cwd });
    return this.executeGit(['commit', '-m', message], cwd);
  }

  /**
   * 원격 저장소 푸시 / Push to remote
   */
  async push(cwd?: string, remote = 'origin', branch?: string): Promise<Result<string>> {
    this.logger.debug('원격 저장소 푸시', { cwd, remote, branch });
    const args = branch ? ['push', remote, branch] : ['push'];
    return this.executeGit(args, cwd);
  }

  /**
   * 원격 저장소 풀 / Pull from remote
   */
  async pull(cwd?: string, remote = 'origin', branch?: string): Promise<Result<string>> {
    this.logger.debug('원격 저장소 풀', { cwd, remote, branch });
    const args = branch ? ['pull', remote, branch] : ['pull'];
    return this.executeGit(args, cwd);
  }

  /**
   * 브랜치 목록 조회 / List branches
   */
  async branch(cwd?: string): Promise<Result<string>> {
    this.logger.debug('브랜치 목록 조회', { cwd });
    return this.executeGit(['branch', '-a'], cwd);
  }

  /**
   * 브랜치 체크아웃 / Checkout branch
   */
  async checkout(branch: string, cwd?: string): Promise<Result<string>> {
    this.logger.debug('브랜치 체크아웃', { branch, cwd });
    return this.executeGit(['checkout', branch], cwd);
  }

  /**
   * 커밋 로그 조회 / Get commit log
   */
  async log(cwd?: string): Promise<Result<string>> {
    this.logger.debug('커밋 로그 조회', { cwd });
    return this.executeGit(['log', '--oneline', '-10'], cwd);
  }

  /**
   * 임의의 Git 명령 실행 / Execute arbitrary Git command
   */
  async exec(command: string, args: readonly string[] = [], cwd?: string): Promise<Result<string>> {
    this.logger.debug('Git 명령 실행', { command, args, cwd });
    return this.executeGit([command, ...args], cwd);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(toolName: string, input: GitInput): Promise<Result<GitOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName, input });

    switch (toolName) {
      case 'git_status': {
        const result = await this.status(input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: 'Git 상태 조회 성공' });
      }

      case 'git_diff': {
        const result = await this.diff(input.cwd, input.files);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: 'Git diff 조회 성공' });
      }

      case 'git_add': {
        if (!input.files || input.files.length === 0) {
          return ok({ success: false, message: 'files 필드 필수' });
        }
        const result = await this.add(input.files, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, message: '파일 스테이징 성공' });
      }

      case 'git_commit': {
        if (!input.message) {
          return ok({ success: false, message: 'message 필드 필수' });
        }
        const result = await this.commit(input.message, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '커밋 생성 성공' });
      }

      case 'git_push': {
        const result = await this.push(input.cwd, input.remote, input.branch);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '푸시 성공' });
      }

      case 'git_pull': {
        const result = await this.pull(input.cwd, input.remote, input.branch);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '풀 성공' });
      }

      case 'git_branch': {
        const result = await this.branch(input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '브랜치 목록 조회 성공' });
      }

      case 'git_checkout': {
        if (!input.branch) {
          return ok({ success: false, message: 'branch 필드 필수' });
        }
        const result = await this.checkout(input.branch, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '체크아웃 성공' });
      }

      case 'git_log': {
        const result = await this.log(input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '커밋 로그 조회 성공' });
      }

      case 'git_exec': {
        if (!input.command) {
          return ok({ success: false, message: 'command 필드 필수' });
        }
        const result = await this.exec(input.command, input.args, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: 'Git 명령 실행 성공' });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
