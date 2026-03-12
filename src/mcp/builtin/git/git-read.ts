/**
 * Git 읽기 작업 / Git read operations
 *
 * @description
 * KR: Git 상태 조회, diff, log 등 읽기 전용 작업을 담당한다.
 * EN: Handles read-only Git operations like status, diff, log.
 */

import type { McpTool } from 'mcp/types.js';

// ── 읽기 도구 정의 / Read Tool Definitions ─────────────────

/**
 * Git 읽기 MCP 도구 목록 / Git read MCP tools
 */
export const GIT_READ_TOOLS: readonly McpTool[] = [
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
    name: 'git_log',
    description: '커밋 로그 조회 / Get commit log',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
    },
  },
];
