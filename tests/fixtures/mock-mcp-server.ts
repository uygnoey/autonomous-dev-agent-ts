/**
 * Mock MCP server for testing / 테스트용 Mock MCP 서버
 *
 * @description
 * KR: MCP JSON-RPC 핸드셰이크를 시뮬레이션하는 최소 서버.
 *     테스트 시 Bun.spawn의 command로 사용.
 * EN: Minimal server that simulates the MCP JSON-RPC handshake.
 *     Used as the command in Bun.spawn for tests.
 */

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line: string) => {
  try {
    const msg = JSON.parse(line) as { jsonrpc: string; id?: number; method: string };

    if (msg.method === 'initialize') {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'mock-mcp', version: '0.0.1' },
          },
        }) + '\n',
      );
    } else if (msg.method === 'notifications/initialized') {
      // WHY: notification에는 응답 없음
    } else if (msg.method === 'tools/list') {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            tools: [
              {
                name: 'mock_tool',
                description: 'A mock tool for testing',
                inputSchema: { type: 'object', properties: {} },
              },
              {
                name: 'another_tool',
                description: 'Another mock tool',
                inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
              },
            ],
          },
        }) + '\n',
      );
    }
  } catch {
    // WHY: 잘못된 JSON은 무시
  }
});

rl.on('close', () => {
  process.exit(0);
});
