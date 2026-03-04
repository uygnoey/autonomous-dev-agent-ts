/**
 * MCP 모듈 타입 정의 / MCP module type definitions
 *
 * @description
 * KR: MCP 서버 구성, 도구, 매니페스트, 런타임 상태를 정의한다.
 * EN: Defines MCP server configuration, tools, manifests, and runtime state.
 */

// ── MCP 서버 구성 ────────────────────────────────────────────

/**
 * MCP 서버 설정 / MCP server configuration
 *
 * @param name - 서버 고유 이름 / Unique server name
 * @param command - 실행할 명령어 / Command to execute
 * @param args - 명령어 인자 목록 / Command arguments
 * @param env - 환경 변수 / Environment variables
 * @param enabled - 활성화 여부 / Whether the server is enabled
 */
export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

// ── MCP 도구 정의 ────────────────────────────────────────────

/**
 * MCP 도구 정의 / MCP tool definition
 *
 * @param name - 도구 이름 / Tool name
 * @param description - 도구 설명 / Tool description
 * @param inputSchema - 입력 스키마 / Input JSON schema
 */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

// ── MCP 매니페스트 ───────────────────────────────────────────

/**
 * MCP 매니페스트 (mcp.json) / MCP manifest file structure
 *
 * @description
 * KR: ~/.adev/mcp/ 또는 /project/.adev/mcp/ 에 위치하는 설정 파일 구조.
 * EN: Configuration file structure located at ~/.adev/mcp/ or /project/.adev/mcp/.
 *
 * @param servers - MCP 서버 구성 목록 / List of MCP server configurations
 */
export interface McpManifest {
  readonly servers: readonly McpServerConfig[];
}

// ── MCP 서버 상태 ────────────────────────────────────────────

/**
 * MCP 서버 상태 / MCP server lifecycle status
 *
 * - stopped: 정지 / Server is not running
 * - starting: 시작 중 / Server is initializing
 * - running: 실행 중 / Server is active and ready
 * - error: 에러 / Server encountered an error
 */
export type McpServerStatus = 'stopped' | 'starting' | 'running' | 'error';

// ── MCP 서버 인스턴스 ────────────────────────────────────────

/**
 * MCP 서버 런타임 인스턴스 / MCP server runtime instance
 *
 * @description
 * KR: 등록된 서버의 런타임 상태를 추적한다. 실제 프로세스 생성은 layer2 담당.
 * EN: Tracks runtime state of a registered server. Actual process spawning is layer2's job.
 *
 * @param config - 서버 설정 / Server configuration
 * @param status - 현재 상태 / Current lifecycle status
 * @param tools - 사용 가능한 도구 목록 / Available tools
 * @param startedAt - 시작 시각 / When the server was started
 */
export interface McpServerInstance {
  readonly config: McpServerConfig;
  status: McpServerStatus;
  readonly tools: McpTool[];
  readonly startedAt: Date | null;
}
