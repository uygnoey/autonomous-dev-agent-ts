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
import { CircuitBreaker, CircuitBreakerOpenError } from 'core/circuit-breaker.js';
import type { CircuitBreakerConfig } from 'core/circuit-breaker.js';
import { getSafeEnvForSubprocess } from 'core/config.js';
import { McpError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { safeJsonParse } from 'core/safe-json.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpLoader } from 'mcp/loader.js';
import { MAX_MCP_MESSAGE_SIZE, performHandshake } from 'mcp/mcp-handshake.js';
import type { McpRegistry } from 'mcp/registry.js';
import type { McpServerInstance, McpServerStatus, McpTool } from 'mcp/types.js';

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
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly circuitBreakerConfig: Partial<CircuitBreakerConfig>;

  constructor(
    private readonly registry: McpRegistry,
    private readonly loader: McpLoader,
    private readonly logger: Logger,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
  ) {
    this.circuitBreakerConfig = circuitBreakerConfig ?? {};
  }

  /**
   * 서버별 circuit breaker를 가져오거나 생성한다 / Get or create per-server circuit breaker
   */
  private getCircuitBreaker(serverName: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(serverName);
    if (!cb) {
      cb = new CircuitBreaker(`mcp-${serverName}`, this.logger, this.circuitBreakerConfig);
      this.circuitBreakers.set(serverName, cb);
    }
    return cb;
  }

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

    // WHY: circuit breaker가 open이면 서버 시작을 차단하여 반복 실패 방지
    const cb = this.getCircuitBreaker(name);
    if (cb.getState() === 'open') {
      this.logger.warn('MCP 서버 circuit breaker open — 시작 차단', { server: name });
      return err(
        new McpError(
          'mcp_circuit_open',
          `MCP 서버 '${name}' circuit breaker가 열려 있습니다 — 시작이 차단되었습니다`,
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

    // WHY: PI-009 — builtin MCP 서버 프로세스 시작 검증. 실패 시 1회 재시도
    const MAX_START_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
      const spawnResult = await this.attemptSpawnAndHandshake(name, config, instance);
      if (spawnResult.ok) {
        return spawnResult;
      }

      if (attempt < MAX_START_ATTEMPTS) {
        this.logger.warn('MCP 서버 시작 실패, 재시도', {
          server: name,
          attempt,
          error: spawnResult.error.message,
        });
        // WHY: 프로세스 정리 후 재시도
        this.killProcess(name);
        await new Promise((r) => setTimeout(r, 500));
      } else {
        // WHY: 최종 실패 시 circuit breaker에 실패 기록
        try {
          await cb.execute(async () => {
            throw spawnResult.error;
          });
        } catch {
          // WHY: circuit breaker에 실패를 기록하기 위한 의도적 throw — 에러는 이미 처리됨
        }
        return spawnResult;
      }
    }

    // WHY: 타입 안전을 위한 unreachable 반환
    return err(new McpError('mcp_server_start_failed', `MCP 서버 시작 실패: ${name}`));
  }

  /**
   * 서버 프로세스 스폰 + 핸드셰이크 시도 / Attempts to spawn server process and perform handshake
   *
   * @param name - 서버 이름 / Server name
   * @param config - 서버 설정 / Server config
   * @param instance - 서버 인스턴스 / Server instance
   * @returns 성공 시 ok(instance) / ok(instance) on success
   */
  private async attemptSpawnAndHandshake(
    name: string,
    config: ReturnType<McpRegistry['getServer']> & object,
    instance: McpServerInstance,
  ): Promise<Result<McpServerInstance>> {
    try {
      const proc = Bun.spawn([config.command, ...config.args], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'ignore',
        env: { ...getSafeEnvForSubprocess(), ...config.env },
      });
      this.processes.set(name, proc);

      // WHY: JSON-RPC 핸드셰이크로 실제 도구 목록 검색
      const handshakeResult = await performHandshake(proc, name, this.logger);
      if (!handshakeResult.ok) {
        instance.status = 'error';
        return err(
          new McpError(
            'mcp_server_start_failed',
            `MCP 핸드셰이크 실패: ${name} — ${handshakeResult.error.message}`,
          ),
        );
      }

      for (const tool of handshakeResult.value) {
        // WHY: readonly 프로퍼티지만 배열 내용 변경(push)은 허용됨
        (instance.tools as McpTool[]).push(tool);
      }

      instance.status = 'running';
      this.logger.info('MCP 서버 시작 완료', { name, toolCount: handshakeResult.value.length });
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

  /**
   * MCP 도구를 직접 호출한다 / Call an MCP tool directly
   *
   * @description
   * KR: adev가 MCP 서버의 도구를 직접 호출한다 (tools/call JSON-RPC).
   *     서버가 실행 중이어야 하며, stdin/stdout 파이프를 통해 JSON-RPC 요청을 전송한다.
   * EN: adev calls an MCP server tool directly (tools/call JSON-RPC).
   *     Server must be running. Sends JSON-RPC request via stdin/stdout pipes.
   *
   * @param serverName - 서버 이름 / Server name
   * @param toolName - 호출할 도구 이름 / Tool name to call
   * @param args - 도구 인자 / Tool arguments
   * @returns 도구 호출 결과 / Tool call result
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Result<unknown>> {
    // WHY: circuit breaker가 open이면 해당 서버의 도구 호출을 즉시 차단
    const cb = this.getCircuitBreaker(serverName);
    if (cb.getState() === 'open') {
      this.logger.warn('MCP 도구 호출 circuit breaker open — 차단', {
        server: serverName,
        tool: toolName,
      });
      return err(
        new McpError(
          'mcp_circuit_open',
          `MCP 서버 '${serverName}' circuit breaker가 열려 있습니다 — 도구 호출 차단됨`,
        ),
      );
    }

    const instance = this.instances.get(serverName);
    if (!instance || instance.status !== 'running') {
      return err(
        new McpError(
          'mcp_server_not_found',
          `실행 중인 서버를 찾을 수 없습니다 / Running server not found: ${serverName}`,
        ),
      );
    }

    const proc = this.processes.get(serverName);
    if (!proc) {
      return err(
        new McpError(
          'mcp_server_not_found',
          `서버 프로세스를 찾을 수 없습니다 / Server process not found: ${serverName}`,
        ),
      );
    }

    // WHY: reader를 try 외부에서 선언하여 finally에서 확실히 releaseLock 수행
    const reader = proc.stdout.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;

    try {
      // WHY: PI-009 — JSON-RPC tools/call 요청을 stdin에 전송하고 stdout에서 응답을 읽는다
      const requestId = Date.now();
      const rpcMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      });

      proc.stdin.write(`${rpcMessage}\n`);

      const decoder = new TextDecoder();
      let buffer = '';
      const CALL_TIMEOUT_MS = 30_000;

      const readResponse = async (): Promise<Result<unknown>> => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            return err(new McpError('mcp_stream_closed', 'MCP 서버 스트림이 종료되었습니다'));
          }
          buffer += decoder.decode(value, { stream: true });

          // WHY: 버퍼 크기 제한으로 악의적 MCP 서버의 대량 응답을 차단
          if (buffer.length > MAX_MCP_MESSAGE_SIZE) {
            return err(
              new McpError(
                'mcp_message_too_large',
                `MCP 도구 응답 크기 초과: ${buffer.length} bytes > ${MAX_MCP_MESSAGE_SIZE} bytes`,
              ),
            );
          }

          const newlineIdx = buffer.indexOf('\n');
          if (newlineIdx !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (line) {
              // WHY: safeJsonParse로 크기/깊이 제한 적용 — 악의적 페이로드 차단
              const parseResult = safeJsonParse<{ result?: unknown; error?: { message: string } }>(
                line,
                { maxSize: MAX_MCP_MESSAGE_SIZE },
              );
              if (!parseResult.ok) {
                return err(
                  new McpError(
                    'mcp_tool_call_failed',
                    `MCP 응답 파싱 실패: ${parseResult.error.message}`,
                  ),
                );
              }
              const parsed = parseResult.value;
              if (parsed.error) {
                const errorMsg =
                  typeof parsed.error === 'object' &&
                  parsed.error !== null &&
                  typeof parsed.error.message === 'string'
                    ? parsed.error.message
                    : 'MCP 서버 에러 (상세 없음)';
                return err(new McpError('mcp_tool_call_failed', errorMsg));
              }
              return ok(parsed.result);
            }
          }
        }
      };

      const timeout = new Promise<Result<unknown>>((resolve) =>
        setTimeout(
          () =>
            resolve(
              err(
                new McpError(
                  'mcp_tool_call_timeout',
                  `도구 호출 타임아웃: ${CALL_TIMEOUT_MS}ms 초과`,
                ),
              ),
            ),
          CALL_TIMEOUT_MS,
        ),
      );

      const result = await Promise.race([readResponse(), timeout]);
      // WHY: 도구 호출 결과를 circuit breaker에 기록 — 실패 누적 시 open 전환
      if (!result.ok) {
        try {
          await cb.execute(async () => {
            throw result.error;
          });
        } catch {
          // WHY: circuit breaker에 실패를 기록하기 위한 의도적 throw
        }
      } else {
        try {
          await cb.execute(async () => result.value);
        } catch {
          // WHY: 성공 기록 — 실패하면 무시
        }
      }
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('MCP 도구 호출 실패', { serverName, toolName, error: msg });
      // WHY: 예외도 circuit breaker에 실패로 기록
      try {
        await cb.execute(async () => {
          throw error;
        });
      } catch {
        // WHY: circuit breaker에 실패를 기록하기 위한 의도적 throw
      }
      return err(
        new McpError(
          'mcp_tool_call_failed',
          `MCP 도구 호출 실패: ${serverName}/${toolName} — ${msg}`,
        ),
      );
    } finally {
      // WHY: 타임아웃/에러 시에도 reader lock을 반드시 해제하여 다음 callTool 호출 가능
      reader.releaseLock();
    }
  }

  // ── 내부 메서드 / Private methods ────────────────────────────

  /**
   * 서버별 circuit breaker 상태 스냅샷 반환 / Get per-server circuit breaker snapshots
   */
  getCircuitBreakerSnapshots(): Record<string, { state: string; failureCount: number }> {
    const snapshots: Record<string, { state: string; failureCount: number }> = {};
    for (const [name, cb] of this.circuitBreakers) {
      const snap = cb.getSnapshot();
      snapshots[name] = { state: snap.state, failureCount: snap.failureCount };
    }
    return snapshots;
  }

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
}
