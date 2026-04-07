/**
 * MCP JSON-RPC 핸드셰이크 헬퍼 / MCP JSON-RPC handshake helpers
 *
 * @description
 * KR: MCP 서버와의 JSON-RPC 핸드셰이크 절차를 수행하는 순수 함수 모음.
 *     initialize → notifications/initialized → tools/list 순서로 진행.
 * EN: Pure functions for performing the MCP JSON-RPC handshake sequence.
 *     Progresses through initialize → notifications/initialized → tools/list.
 */

import type { Subprocess } from 'bun';
import { McpError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { safeJsonParse } from 'core/safe-json.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';

// ── 상수 / Constants ─────────────────────────────────────────────

/** MCP JSON-RPC 핸드셰이크 타임아웃 (ms) / Handshake timeout */
export const HANDSHAKE_TIMEOUT_MS = 10_000;

/** MCP 프로토콜 버전 / MCP protocol version */
const MCP_PROTOCOL_VERSION = '2024-11-05';

/** MCP 메시지 최대 크기 (bytes) / Maximum MCP message size */
export const MAX_MCP_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ── 내부 타입 / Internal types ───────────────────────────────────

/** Bun.spawn으로 생성된 파이프 프로세스 / Piped subprocess from Bun.spawn */
type PipedSubprocess = Subprocess<'pipe', 'pipe', 'ignore'>;

// ── 핸드셰이크 / Handshake ────────────────────────────────────────

/**
 * MCP JSON-RPC 핸드셰이크를 수행한다 / Perform MCP JSON-RPC handshake
 *
 * @description
 * KR: initialize → notifications/initialized → tools/list 순서로 핸드셰이크 진행.
 * EN: Handshake progresses through initialize → notifications/initialized → tools/list.
 *
 * @param proc - Bun.spawn으로 생성된 프로세스 / Process from Bun.spawn
 * @param name - 서버 이름 (로깅용) / Server name for logging
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 검색된 MCP 도구 배열 / Array of discovered MCP tools
 */
export async function performHandshake(
  proc: PipedSubprocess,
  name: string,
  logger: Logger,
): Promise<Result<McpTool[]>> {
  // WHY: Bun의 ReadableStream<Uint8Array>에서 ArrayBuffer 특정 리더 취득
  const reader = proc.stdout.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;

  try {
    // 1. initialize 요청 전송
    writeRpc(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'adev', version: '1.0.0' },
      },
    });

    // 2. initialize 응답 수신
    const initResult = await readRpcLine(reader, HANDSHAKE_TIMEOUT_MS);
    if (!initResult.ok) return initResult;

    // 3. initialized 알림 전송 (응답 없음)
    writeRpc(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

    // 4. tools/list 요청 전송
    writeRpc(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    // 5. tools/list 응답 수신 및 파싱
    const toolsResult = await readRpcLine(reader, HANDSHAKE_TIMEOUT_MS);
    if (!toolsResult.ok) return toolsResult;

    const toolsRaw = toolsResult.value;
    logger.debug('MCP 도구 목록 수신', { name, preview: toolsRaw.slice(0, 200) });
    return ok(parseToolsResponse(toolsRaw, logger));
  } finally {
    // WHY: 핸드셰이크 완료/실패 후 reader lock 해제 — callTool에서 "Reader already locked" 방지
    reader.releaseLock();
  }
}

// ── 내부 헬퍼 / Internal helpers ─────────────────────────────────

/** JSON-RPC 메시지를 stdin에 작성한다 / Write JSON-RPC message to stdin */
function writeRpc(proc: PipedSubprocess, message: unknown): void {
  // WHY: FileSink.write()는 newline 포함 문자열 직접 작성 지원
  proc.stdin.write(`${JSON.stringify(message)}\n`);
}

/**
 * stdout에서 한 줄의 JSON-RPC 응답을 읽는다 / Read one JSON-RPC response line from stdout
 *
 * @param reader - ReadableStream 리더 / ReadableStream reader
 * @param timeoutMs - 타임아웃 (ms) / Timeout in milliseconds
 */
async function readRpcLine(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  timeoutMs: number,
): Promise<Result<string>> {
  const decoder = new TextDecoder();
  let buffer = '';

  const timeout = new Promise<Result<string>>((resolve) =>
    setTimeout(
      () =>
        resolve(
          err(new McpError('mcp_handshake_timeout', `MCP 응답 타임아웃: ${timeoutMs}ms 초과`)),
        ),
      timeoutMs,
    ),
  );

  const readLine = async (): Promise<Result<string>> => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return err(
          new McpError('mcp_stream_closed', 'MCP 서버 스트림이 종료되었습니다 / Stream closed'),
        );
      }
      buffer += decoder.decode(value, { stream: true });

      // WHY: 버퍼 크기 제한으로 메모리 폭발 방지 — 악의적 서버가 개행 없이 대량 데이터 전송 시 차단
      if (buffer.length > MAX_MCP_MESSAGE_SIZE) {
        return err(
          new McpError(
            'mcp_message_too_large',
            `MCP 메시지 크기 초과: ${buffer.length} bytes > ${MAX_MCP_MESSAGE_SIZE} bytes`,
          ),
        );
      }

      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line) return ok(line);
      }
    }
  };

  return Promise.race([readLine(), timeout]);
}

/**
 * tools/list 응답을 McpTool 배열로 파싱한다 / Parse tools/list response to McpTool array
 *
 * @param raw - 원시 JSON 문자열 / Raw JSON string
 * @param logger - 로거 인스턴스 / Logger instance
 */
function parseToolsResponse(raw: string, logger: Logger): McpTool[] {
  // WHY: 외부 MCP 서버 응답에 크기/깊이 제한을 적용하여 DoS 방지
  const parseResult = safeJsonParse<{
    result?: {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    };
  }>(raw, { maxSize: MAX_MCP_MESSAGE_SIZE });

  if (!parseResult.ok) {
    logger.warn('MCP 도구 목록 파싱 실패, 빈 배열 반환', {
      error: parseResult.error.message,
    });
    return [];
  }

  const parsed = parseResult.value;

  // WHY: JSON-RPC 2.0 응답 구조 검증 — result 필드가 객체인지 확인
  if (
    parsed.result !== undefined &&
    (typeof parsed.result !== 'object' || parsed.result === null)
  ) {
    logger.warn('MCP 응답 result 필드가 유효한 객체가 아닙니다');
    return [];
  }

  const tools = parsed.result?.tools;
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .filter(
      (t): t is { name: string; description?: string; inputSchema?: Record<string, unknown> } =>
        typeof t === 'object' && t !== null && typeof t.name === 'string' && t.name.length > 0,
    )
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
    }));
}
