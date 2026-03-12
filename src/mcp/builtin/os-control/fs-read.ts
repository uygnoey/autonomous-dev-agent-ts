/**
 * 파일 시스템 읽기 도구 / Filesystem read tools
 *
 * @description
 * KR: 파일 읽기, 디렉토리 목록 조회 등 읽기 전용 도구 정의.
 * EN: Read-only filesystem tool definitions: file read, directory listing.
 */

import type { McpTool } from 'mcp/types.js';

/**
 * 파일 시스템 읽기 MCP 도구 목록 / Filesystem read MCP tools
 */
export const FS_READ_TOOLS: readonly McpTool[] = [
  {
    name: 'fs_read_file',
    description: '파일 내용 읽기 / Read file contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 / File path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_list_directory',
    description: '디렉토리 목록 조회 / List directory contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '디렉토리 경로 / Directory path' },
      },
      required: ['path'],
    },
  },
];
