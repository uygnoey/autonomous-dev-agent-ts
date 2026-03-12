/**
 * 파일 시스템 쓰기 도구 / Filesystem write tools
 *
 * @description
 * KR: 파일 쓰기, 삭제, 디렉토리 생성 등 쓰기 도구 정의.
 * EN: Write filesystem tool definitions: file write, delete, directory creation.
 */

import type { McpTool } from 'mcp/types.js';

/**
 * 파일 시스템 쓰기 MCP 도구 목록 / Filesystem write MCP tools
 */
export const FS_WRITE_TOOLS: readonly McpTool[] = [
  {
    name: 'fs_write_file',
    description: '파일 쓰기 (덮어쓰기) / Write file (overwrite)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 / File path' },
        content: { type: 'string', description: '파일 내용 / File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs_delete',
    description: '파일/디렉토리 삭제 / Delete file or directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '삭제할 경로 / Path to delete' },
        recursive: {
          type: 'boolean',
          description: '재귀 삭제 여부 / Recursive deletion',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_create_directory',
    description: '디렉토리 생성 / Create directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '생성할 디렉토리 경로 / Directory path' },
        recursive: {
          type: 'boolean',
          description: '부모 디렉토리도 생성 / Create parent directories',
        },
      },
      required: ['path'],
    },
  },
];
