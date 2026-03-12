/**
 * Git 쓰기 작업 / Git write operations
 *
 * @description
 * KR: Git add, commit, push, pull, checkout 등 쓰기 작업을 담당한다.
 * EN: Handles write Git operations like add, commit, push, pull, checkout.
 */

import type { McpTool } from 'mcp/types.js';

// ── 쓰기 도구 정의 / Write Tool Definitions ─────────────────

/**
 * Git 쓰기 MCP 도구 목록 / Git write MCP tools
 */
export const GIT_WRITE_TOOLS: readonly McpTool[] = [
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
