/**
 * MCP Types 단위 테스트 / MCP types unit tests
 *
 * @description
 * KR: MCP 모듈 타입 인터페이스의 구조적 검증 (타입 가드 패턴).
 * EN: Structural validation of MCP module type interfaces.
 */

import { describe, expect, it } from 'bun:test';
import type {
  McpManifest,
  McpServerConfig,
  McpServerInstance,
  McpServerStatus,
  McpTool,
} from 'mcp/types.js';

describe('McpServerConfig 구조 검증', () => {
  it('유효한 config 객체가 타입에 부합한다', () => {
    const config: McpServerConfig = {
      name: 'test-server',
      command: 'node',
      args: ['server.js'],
      enabled: true,
    };
    expect(config.name).toBe('test-server');
    expect(config.command).toBe('node');
    expect(config.args).toEqual(['server.js']);
    expect(config.enabled).toBe(true);
  });

  it('env가 선택적이다', () => {
    const config: McpServerConfig = {
      name: 'test',
      command: 'node',
      args: [],
      enabled: false,
    };
    expect(config.env).toBeUndefined();
  });

  it('env 포함 config가 유효하다', () => {
    const config: McpServerConfig = {
      name: 'test',
      command: 'node',
      args: [],
      env: { NODE_ENV: 'test' },
      enabled: true,
    };
    expect(config.env?.NODE_ENV).toBe('test');
  });

  it('빈 args 배열이 유효하다', () => {
    const config: McpServerConfig = {
      name: 'test',
      command: 'echo',
      args: [],
      enabled: true,
    };
    expect(config.args).toHaveLength(0);
  });
});

describe('McpTool 구조 검증', () => {
  it('유효한 tool 객체가 타입에 부합한다', () => {
    const tool: McpTool = {
      name: 'read_file',
      description: 'Reads a file',
      inputSchema: { type: 'object' },
    };
    expect(tool.name).toBe('read_file');
    expect(tool.description).toBe('Reads a file');
  });

  it('빈 inputSchema가 유효하다', () => {
    const tool: McpTool = {
      name: 'test',
      description: '',
      inputSchema: {},
    };
    expect(Object.keys(tool.inputSchema)).toHaveLength(0);
  });
});

describe('McpManifest 구조 검증', () => {
  it('빈 servers 배열이 유효하다', () => {
    const manifest: McpManifest = { servers: [] };
    expect(manifest.servers).toHaveLength(0);
  });

  it('servers 배열에 config를 포함할 수 있다', () => {
    const manifest: McpManifest = {
      servers: [{ name: 'git', command: 'npx', args: ['-y', '@mcp/git'], enabled: true }],
    };
    expect(manifest.servers).toHaveLength(1);
  });
});

describe('McpServerStatus 값 검증', () => {
  it('유효한 상태값들을 사용할 수 있다', () => {
    const statuses: McpServerStatus[] = ['stopped', 'starting', 'running', 'error'];
    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('stopped');
    expect(statuses).toContain('starting');
    expect(statuses).toContain('running');
    expect(statuses).toContain('error');
  });
});

describe('McpServerInstance 구조 검증', () => {
  it('유효한 instance 객체가 타입에 부합한다', () => {
    const instance: McpServerInstance = {
      config: { name: 'test', command: 'node', args: [], enabled: true },
      status: 'stopped',
      tools: [],
      startedAt: null,
    };
    expect(instance.status).toBe('stopped');
    expect(instance.startedAt).toBeNull();
    expect(instance.tools).toHaveLength(0);
  });

  it('running 상태에서 startedAt이 Date다', () => {
    const now = new Date();
    const instance: McpServerInstance = {
      config: { name: 'test', command: 'node', args: [], enabled: true },
      status: 'running',
      tools: [{ name: 'tool1', description: 'desc', inputSchema: {} }],
      startedAt: now,
    };
    expect(instance.startedAt).toBe(now);
    expect(instance.tools).toHaveLength(1);
  });
});
