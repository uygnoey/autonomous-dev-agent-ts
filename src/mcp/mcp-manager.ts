/**
 * MCP 서버 라이프사이클 매니저 / MCP server lifecycle manager
 *
 * @description
 * KR: MCP 서버를 실제 스폰하여 JSON-RPC 핸드셰이크를 수행하고 도구를 검색한다.
 *     프로세스 추적, 시작/정지, 건강 확인을 관리한다.
 * EN: Spawns real MCP server processes, performs JSON-RPC handshake, discovers tools.
 *     Manages process tracking, start/stop lifecycle, and health checks.
 */

import type { Subprocess } from 'bun';
import { McpError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpLoader } from 'mcp/loader.js';
import type { McpRegistry } from 'mcp/registry.js';
import type { McpServerInstance, McpServerStatus, McpTool } from 'mcp/types.js';

// ── 상수 / Constants ─────────────────────────────────────────────

/** MCP JSON-RPC 핸드셰이크 타임아웃 (ms) / Handshake timeout */
const HANDSHAKE_TIMEOUT_MS = 10_000;

/** MCP 프로토콜 버전 / MCP protocol version */
const MCP_PROTOCOL_VERSION = '2024-11-05';

// ── 내부 타입 / Internal types ───────────────────────────────────

/** Bun.spawn으로 생성된 파이프 프로세스 / Piped subprocess from Bun.spawn */
type PipedSubprocess = Subprocess<'pipe', 'pipe', 'ignore'>;

// ── McpManager ───────────────────────────────────────────────────

/**
 * MCP 서버 라이프사이클 매니저 / MCP server lifecycle manager
 *
 * @description
 * KR: McpRegistry와 McpLoader를 조합하여 서버 라이프사이클을 관리한다.
 *     startServer는 실제 프로세스를 스폰하고 JSON-RPC 핸드셰이크를 수행한다.
 * EN: Combines McpRegistry and McpLoader to manage server lifecycle.
 *     startServer spawns a real process and performs JSON-RPC handshake.
 *
 * @example
 * const manager = new McpManager(registry, loader, logger);
 * await manager.initialize('~/.adev/mcp', '/project/.adev/mcp');
 * const result = await manager.startServer('git');
 * if (result.ok) console.log('Tools:', result.value.tools);
 */
export class McpManager {
  private readonly instances = new Map<string, McpServerInstance>();
  private readonly processes = new Map<string, PipedSubprocess>();

  constructor(
    private readonly registry: McpRegistry,
    private readonly loader: McpLoader,
    private readonly logger: Logger,
  ) {}

  /**
   * 설정을 로드하고 모든 서버를 레지스트리에 등록한다 / Load configs and register all servers
   *
   * @param globalDir - 글로벌 설정 디렉토리 / Global config directory
   * @param projectDir - 프로젝트 설정 디렉토리 (선택) / Project config directory (optional)
   */
  async initialize(globalDir: string, projectDir?: string): Promise<Result<void>> {
    const loadResult = await this.loader.loadAndMerge(globalDir, projectDir);
    if (!loadResult.ok) return loadResult;

    this.registry.clear();
    this.instances.clear();

    for (const config of loadResult.value) {
      const registerResult = this.registry.register(config);
      if (!registerResult.ok) {
        this.logger.warn('서버 등록 실패, 건너뜀', {
          name: config.name,
          error: registerResult.error.message,
        });
      }
    }

    this.logger.info('MCP 매니저 초기화 완료', {
      serverCount: this.registry.listServers().length,
    });
    return ok(undefined);
  }

  /**
   * 서버를 시작한다 — 실제 프로세스 스폰 + JSON-RPC 핸드셰이크 / Start a server
   *
   * @description
   * KR: Bun.spawn으로 서버 프로세스를 실행하고 MCP JSON-RPC 핸드셰이크를 수행한다.
   *     initialize → notifications/initialized → tools/list 순서로 진행.
   *     핸드셰이크 실패 시 status를 'error'로 설정하고 err를 반환한다.
   * EN: Spawns server process via Bun.spawn and performs MCP JSON-RPC handshake.
   *     Progresses through initialize → notifications/initialized → tools/list.
   *     Sets status to 'error' and returns err on handshake failure.
   *
   * @param name - 시작할 서버 이름 / Server name to start
   */
  async startServer(name: string): Promise<Result<McpServerInstance>> {
    const config = this.registry.getServer(name);
    if (!config) {
      return err(
        new McpError('mcp_server_not_found', `서버를 찾을 수 없습니다 / Server not found: ${name}`),
      );
    }

    if (!config.enabled) {
      return err(
        new McpError('mcp_server_disabled', `비활성화된 서버입니다 / Server is disabled: ${name}`),
      );
    }

    const existing = this.instances.get(name);
    if (existing?.status === 'running') {
      return err(
        new McpError(
          'mcp_server_already_running',
          `이미 실행 중인 서버입니다 / Server is already running: ${name}`,
        ),
      );
    }

    // WHY: starting 상태로 먼저 등록하여 중복 시작 방지
    const instance: McpServerInstance = {
      config,
      status: 'starting',
      tools: [],
      startedAt: new Date(),
    };
    this.instances.set(name, instance);

    try {
      const proc = Bun.spawn([config.command, ...config.args], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'ignore',
        env: { ...process.env, ...config.env },
      });
      this.processes.set(name, proc);

      // WHY: JSON-RPC 핸드셰이크로 실제 도구 목록 검색
      const tools = await this.performHandshake(proc, name);
      for (const tool of tools) {
        // WHY: readonly 프로퍼티지만 배열 내용 변경(push)은 허용됨
        (instance.tools as McpTool[]).push(tool);
      }

      instance.status = 'running';
      this.logger.info('MCP 서버 시작 완료', { name, toolCount: tools.length });
      return ok(instance);
    } catch (error: unknown) {
      instance.status = 'error';
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('MCP 서버 시작 실패', { name, error: msg });
      return err(new McpError('mcp_server_start_failed', `MCP 서버 시작 실패: ${name} — ${msg}`));
    }
  }

  /**
   * 서버를 정지한다 / Stop a server
   *
   * @param name - 정지할 서버 이름 / Server name to stop
   */
  stopServer(name: string): Result<void> {
    const instance = this.instances.get(name);
    if (!instance) {
      return err(
        new McpError(
          'mcp_server_not_found',
          `실행 중인 서버를 찾을 수 없습니다 / Running server not found: ${name}`,
        ),
      );
    }

    if (instance.status === 'stopped') {
      return err(
        new McpError(
          'mcp_server_already_stopped',
          `이미 정지된 서버입니다 / Server is already stopped: ${name}`,
        ),
      );
    }

    this.killProcess(name);
    instance.status = 'stopped';
    this.logger.info('MCP 서버 정지', { name });
    return ok(undefined);
  }

  /**
   * 모든 서버를 정지한다 / Stop all running servers
   */
  stopAll(): Result<void> {
    for (const [name, instance] of this.instances) {
      if (instance.status !== 'stopped') {
        this.killProcess(name);
        instance.status = 'stopped';
        this.logger.debug('MCP 서버 정지', { name });
      }
    }

    this.logger.info('모든 MCP 서버 정지 완료');
    return ok(undefined);
  }

  /**
   * 서버 상태를 조회한다 / Get server status
   *
   * @param name - 조회할 서버 이름 / Server name to check
   */
  getStatus(name: string): McpServerStatus {
    const instance = this.instances.get(name);
    return instance?.status ?? 'stopped';
  }

  /**
   * 모든 서버의 상태를 확인한다 / Health check for all servers
   */
  healthCheck(): Result<Record<string, McpServerStatus>> {
    const statuses: Record<string, McpServerStatus> = {};

    for (const config of this.registry.listServers()) {
      statuses[config.name] = this.getStatus(config.name);
    }

    return ok(statuses);
  }

  /**
   * 실행 중인 모든 서버의 도구를 집계한다 / Aggregate tools from all running servers
   */
  listTools(): McpTool[] {
    const tools: McpTool[] = [];

    for (const instance of this.instances.values()) {
      if (instance.status === 'running') {
        tools.push(...instance.tools);
      }
    }

    return tools;
  }

  // ── 내부 메서드 / Private methods ────────────────────────────

  /** 프로세스를 종료하고 맵에서 제거한다 / Kill process and remove from map */
  private killProcess(name: string): void {
    const proc = this.processes.get(name);
    if (proc) {
      try {
        proc.kill();
      } catch {
        // WHY: 이미 종료된 프로세스 kill은 무시
      }
      this.processes.delete(name);
    }
  }

  /**
   * MCP JSON-RPC 핸드셰이크를 수행한다 / Perform MCP JSON-RPC handshake
   *
   * @description
   * KR: initialize → notifications/initialized → tools/list 순서로 핸드셰이크 진행.
   * EN: Handshake progresses through initialize → notifications/initialized → tools/list.
   */
  private async performHandshake(proc: PipedSubprocess, name: string): Promise<McpTool[]> {
    // WHY: Bun의 ReadableStream<Uint8Array>에서 ArrayBuffer 특정 리더 취득
    const reader = proc.stdout.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;

    // 1. initialize 요청 전송
    this.writeRpc(proc, {
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
    await this.readRpcLine(reader, HANDSHAKE_TIMEOUT_MS);

    // 3. initialized 알림 전송 (응답 없음)
    this.writeRpc(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

    // 4. tools/list 요청 전송
    this.writeRpc(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    // 5. tools/list 응답 수신 및 파싱
    const toolsRaw = await this.readRpcLine(reader, HANDSHAKE_TIMEOUT_MS);
    this.logger.debug('MCP 도구 목록 수신', { name, preview: toolsRaw.slice(0, 200) });
    return this.parseToolsResponse(toolsRaw);
  }

  /** JSON-RPC 메시지를 stdin에 작성한다 / Write JSON-RPC message to stdin */
  private writeRpc(proc: PipedSubprocess, message: unknown): void {
    // WHY: FileSink.write()는 newline 포함 문자열 직접 작성 지원
    proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /**
   * stdout에서 한 줄의 JSON-RPC 응답을 읽는다 / Read one JSON-RPC response line from stdout
   *
   * @param reader - ReadableStream 리더 / ReadableStream reader
   * @param timeoutMs - 타임아웃 (ms) / Timeout in milliseconds
   */
  private async readRpcLine(
    reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
    timeoutMs: number,
  ): Promise<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`MCP 응답 타임아웃: ${timeoutMs}ms 초과`)), timeoutMs),
    );

    const readLine = async (): Promise<string> => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) throw new Error('MCP 서버 스트림이 종료되었습니다 / Stream closed');
        buffer += decoder.decode(value, { stream: true });
        const newlineIdx = buffer.indexOf('\n');
        if (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (line) return line;
        }
      }
    };

    return Promise.race([readLine(), timeout]);
  }

  /**
   * tools/list 응답을 McpTool 배열로 파싱한다 / Parse tools/list response to McpTool array
   *
   * @param raw - 원시 JSON 문자열 / Raw JSON string
   */
  private parseToolsResponse(raw: string): McpTool[] {
    try {
      const parsed = JSON.parse(raw) as {
        result?: {
          tools?: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }>;
        };
      };
      return (parsed.result?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? {},
      }));
    } catch {
      this.logger.warn('MCP 도구 목록 파싱 실패, 빈 배열 반환');
      return [];
    }
  }
}
