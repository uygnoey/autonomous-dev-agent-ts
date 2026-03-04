/**
 * V2 Session API Executor / Claude Agent SDK V2 Session 기반 에이전트 실행기
 *
 * @description
 * KR: @anthropic-ai/claude-code의 unstable_v2_createSession, unstable_v2_prompt를 사용하여
 *     AgentExecutor 인터페이스를 구현한다. Agent Teams 환경변수 설정, 세션 스트림 관리,
 *     이벤트 매핑을 담당한다.
 * EN: Implements AgentExecutor using unstable_v2_createSession and unstable_v2_prompt.
 *     Handles Agent Teams environment setup, session stream management, and event mapping.
 */

// WHY: @anthropic-ai/claude-code (v0.2.x)는 CLI 전용 패키지로 programmatic API를 노출하지 않는다.
//      package.json에 main/module/exports 필드가 없고 bin만 존재한다.
//      향후 SDK가 programmatic API (unstable_v2_createSession 등)를 export하면
//      아래 타입 스텁을 실제 import로 교체한다.
//
// 교체 시:
// import {
//   unstable_v2_createSession,
//   unstable_v2_prompt,
//   type V2Session,
//   type V2SessionEvent,
//   type V2PromptOptions,
// } from '@anthropic-ai/claude-code';

/** V2 Session 타입 스텁 — SDK가 programmatic API를 export할 때까지 사용 */
type V2Session = {
  stream(prompt: string): AsyncIterable<V2SessionEvent>;
};

/** SDK 이벤트 타입 스텁 */
type V2SessionEvent = {
  type: string;
  content?: string | unknown[];
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  stop_reason?: string;
  error?: unknown;
  message?: string;
};

/** SDK 프롬프트 옵션 타입 스텁 */
type V2PromptOptions = {
  systemPrompt: string;
  maxTurns?: number;
  temperature?: number;
  model?: string;
  tools?: string[];
  environment?: Record<string, string>;
};
import type { AuthProvider } from '../auth/types.js';
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { type AgentName, type Result, err, ok } from '../core/types.js';
import type { AgentConfig, AgentEvent, AgentEventType, AgentExecutor } from './types.js';

// WHY: SDK가 programmatic API를 export하지 않으므로 스텁 함수로 대체.
//      SDK가 unstable_v2_createSession을 export하면 이 스텁을 제거하고 import로 교체한다.
const unstable_v2_createSession = (_options: V2PromptOptions): V2Session => {
  throw new Error(
    '@anthropic-ai/claude-code does not export programmatic API. ' +
      'V2 Session API requires a future SDK version with unstable_v2_createSession export.',
  );
};

const unstable_v2_prompt = async (
  _prompt: string,
  _options: V2PromptOptions,
): Promise<V2Session> => {
  throw new Error(
    '@anthropic-ai/claude-code does not export programmatic API. ' +
      'V2 Session API requires a future SDK version with unstable_v2_prompt export.',
  );
};

/**
 * V2 Session Executor 구성 옵션 / Configuration for V2SessionExecutor
 *
 * @description
 * KR: 세션 생성에 필요한 의존성과 옵션을 담는다.
 * EN: Holds dependencies and options needed for session creation.
 */
/** V2 Session 생성 팩토리 타입 / Session factory type for dependency injection */
export type V2SessionFactory = (options: {
  readonly systemPrompt: string;
  readonly maxTurns?: number;
  readonly temperature?: number;
  readonly model?: string;
  readonly tools?: string[];
  readonly environment?: Record<string, string>;
}) => V2Session;

export interface V2SessionExecutorOptions {
  /** 인증 공급자 / Authentication provider */
  readonly authProvider: AuthProvider;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** SDK 기본 옵션 (선택) / SDK default options (optional) */
  readonly defaultOptions?: {
    readonly maxTurns?: number;
    readonly temperature?: number;
    readonly model?: string;
  };
  /** 세션 팩토리 (선택, 테스트 시 주입) / Session factory (optional, for testing) */
  readonly sessionFactory?: V2SessionFactory;
}

/**
 * V2 Session 기반 에이전트 실행기 / V2 Session-based agent executor
 *
 * @description
 * KR: Claude Agent SDK V2 Session API를 사용하여 에이전트를 실행한다.
 *     - Agent Teams 환경변수 설정 (DESIGN Phase)
 *     - session.stream() 호출 및 이벤트 매핑
 *     - unstable_v2_prompt() 호출 (CODE/TEST/VERIFY Phase)
 *     - SDK 이벤트 → AgentEvent 변환
 *     - 에러 처리 및 Result 패턴 적용
 * EN: Executes agents using Claude Agent SDK V2 Session API.
 *     - Sets Agent Teams environment variables (DESIGN Phase)
 *     - Calls session.stream() and maps events
 *     - Calls unstable_v2_prompt() (CODE/TEST/VERIFY Phase)
 *     - Converts SDK events to AgentEvent
 *     - Handles errors with Result pattern
 *
 * @example
 * const executor = new V2SessionExecutor({ authProvider, logger });
 * for await (const event of executor.execute(config)) {
 *   if (event.type === 'error') {
 *     logger.error('Agent error', { content: event.content });
 *   }
 * }
 */
export class V2SessionExecutor implements AgentExecutor {
  private readonly authProvider: AuthProvider;
  private readonly logger: Logger;
  private readonly defaultOptions: V2SessionExecutorOptions['defaultOptions'];
  private readonly activeSessions: Map<string, V2Session>;
  private readonly sessionFactory: V2SessionFactory;

  constructor(options: V2SessionExecutorOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger.child({ module: 'V2SessionExecutor' });
    this.defaultOptions = options.defaultOptions;
    this.activeSessions = new Map();
    // WHY: 테스트 시 mock 팩토리 주입, 프로덕션은 SDK 스텁 사용
    this.sessionFactory = options.sessionFactory ?? unstable_v2_createSession;
  }

  /**
   * 에이전트를 실행한다 / Execute an agent
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   *
   * @description
   * KR: - DESIGN Phase: Agent Teams 활성화 (SendMessage 가능)
   *     - 기타 Phase: Agent Teams 비활성화 (독립 실행)
   *     - 환경변수 설정 후 세션 생성 및 스트림 시작
   * EN: - DESIGN Phase: Enable Agent Teams (SendMessage enabled)
   *     - Other Phases: Disable Agent Teams (independent execution)
   *     - Set environment variables, create session, start stream
   */
  async *execute(config: AgentConfig): AsyncIterable<AgentEvent> {
    this.logger.info('Executing agent', {
      agentName: config.name,
      phase: config.phase,
      featureId: config.featureId,
    });

    // WHY: DESIGN Phase는 Agent Teams 활성화 (팀 토론), 나머지는 비활성화
    const enableAgentTeams = config.phase === 'DESIGN';

    try {
      // Step 1: 환경변수 설정 (Agent Teams, 인증)
      const sessionEnv = this.buildSessionEnvironment(config, enableAgentTeams);

      // Step 2: 세션 생성
      const sessionResult = await this.createSession(config, sessionEnv);
      if (!sessionResult.ok) {
        yield this.createErrorEvent(config.name, sessionResult.error.message);
        return;
      }

      const session = sessionResult.value;
      const sessionId = this.generateSessionId(config);
      this.activeSessions.set(sessionId, session);

      // Step 3: 세션 스트림 시작 및 이벤트 매핑
      try {
        for await (const sdkEvent of session.stream(config.prompt)) {
          const mappedEvent = this.mapSdkEvent(sdkEvent, config.name);
          if (mappedEvent) {
            yield mappedEvent;
          }

          // WHY: done 이벤트 수신 시 세션 정리
          if (mappedEvent?.type === 'done') {
            this.logger.info('Agent execution completed', { agentName: config.name });
            this.activeSessions.delete(sessionId);
          }
        }
      } catch (streamError) {
        this.logger.error('Session stream error', {
          agentName: config.name,
          error: streamError,
        });
        yield this.createErrorEvent(
          config.name,
          streamError instanceof Error ? streamError.message : 'Unknown stream error',
        );
        this.activeSessions.delete(sessionId);
      }
    } catch (error) {
      this.logger.error('Agent execution failed', {
        agentName: config.name,
        error,
      });
      yield this.createErrorEvent(
        config.name,
        error instanceof Error ? error.message : 'Unknown execution error',
      );
    }
  }

  /**
   * 이전 세션을 재개한다 / Resume a previous session
   *
   * @param sessionId - 재개할 세션 ID / Session ID to resume
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   *
   * @description
   * KR: 저장된 세션 ID로 이전 세션을 재개한다. (현재는 메모리 기반, 추후 영속화 지원)
   * EN: Resumes a previous session by stored session ID. (Currently in-memory, persistence TBD)
   */
  async *resume(sessionId: string): AsyncIterable<AgentEvent> {
    this.logger.info('Resuming session', { sessionId });

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      // WHY: 세션 ID에서 에이전트명 추출 (형식: projectId:featureId:agentName:phase)
      const agentName = this.extractAgentNameFromSessionId(sessionId);
      yield {
        type: 'error',
        agentName,
        content: `Session not found: ${sessionId}`,
        timestamp: new Date(),
      };
      return;
    }

    try {
      const agentName = this.extractAgentNameFromSessionId(sessionId);

      // WHY: 세션 재개는 추가 프롬프트 없이 스트림 계속 수신
      for await (const sdkEvent of session.stream('')) {
        const mappedEvent = this.mapSdkEvent(sdkEvent, agentName);
        if (mappedEvent) {
          yield mappedEvent;
        }

        if (mappedEvent?.type === 'done') {
          this.activeSessions.delete(sessionId);
        }
      }
    } catch (error) {
      const agentName = this.extractAgentNameFromSessionId(sessionId);
      this.logger.error('Session resume failed', { sessionId, error });
      yield {
        type: 'error',
        agentName,
        content: error instanceof Error ? error.message : 'Unknown resume error',
        timestamp: new Date(),
      };
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * 세션 환경변수를 구성한다 / Build session environment variables
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @param enableAgentTeams - Agent Teams 활성화 여부 / Whether to enable Agent Teams
   * @returns 환경변수 객체 / Environment variable object
   *
   * @description
   * KR: - ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN 설정
   *     - Agent Teams 활성화 시 관련 환경변수 추가
   *     - 사용자 정의 환경변수 병합
   * EN: - Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN
   *     - Add Agent Teams environment variables if enabled
   *     - Merge user-defined environment variables
   */
  private buildSessionEnvironment(
    config: AgentConfig,
    enableAgentTeams: boolean,
  ): Record<string, string> {
    const authHeader = this.authProvider.getAuthHeader();
    const baseEnv: Record<string, string> = {};

    // Step 1: 인증 헤더를 환경변수로 변환
    if ('x-api-key' in authHeader) {
      baseEnv.ANTHROPIC_API_KEY = authHeader['x-api-key'] as string;
    } else if ('authorization' in authHeader) {
      const token = (authHeader.authorization as string).replace('Bearer ', '');
      baseEnv.CLAUDE_CODE_OAUTH_TOKEN = token;
    }

    // Step 2: Agent Teams 환경변수 (DESIGN Phase만 활성화)
    if (enableAgentTeams) {
      baseEnv.AGENT_TEAMS_ENABLED = 'true';
      this.logger.debug('Agent Teams enabled', { phase: config.phase });
    } else {
      baseEnv.AGENT_TEAMS_ENABLED = 'false';
      this.logger.debug('Agent Teams disabled', { phase: config.phase });
    }

    // Step 3: 사용자 정의 환경변수 병합
    return { ...baseEnv, ...(config.env ?? {}) };
  }

  /**
   * V2 Session을 생성한다 / Create a V2 Session
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @param env - 환경변수 / Environment variables
   * @returns 세션 생성 결과 / Session creation result
   *
   * @description
   * KR: SDK의 unstable_v2_createSession을 호출하여 세션을 생성한다.
   *     실패 시 AgentError를 Result로 래핑하여 반환한다.
   * EN: Calls SDK's unstable_v2_createSession to create a session.
   *     Wraps errors in AgentError and returns as Result.
   */
  private async createSession(
    config: AgentConfig,
    env: Record<string, string>,
  ): Promise<Result<V2Session, AgentError>> {
    try {
      const sessionOptions: V2PromptOptions = {
        systemPrompt: config.systemPrompt,
        maxTurns: config.maxTurns ?? this.defaultOptions?.maxTurns ?? 50,
        temperature: this.defaultOptions?.temperature ?? 1.0,
        model: this.defaultOptions?.model ?? 'claude-opus-4-6',
        tools: config.tools.length > 0 ? [...config.tools] : undefined,
        environment: env,
      };

      const session = this.sessionFactory(sessionOptions);
      this.logger.debug('Session created', {
        agentName: config.name,
        phase: config.phase,
      });

      return ok(session);
    } catch (error) {
      this.logger.error('Session creation failed', {
        agentName: config.name,
        error,
      });

      return err(
        new AgentError(
          'agent_session_creation_failed',
          `Failed to create session for agent ${config.name}`,
          error,
        ),
      );
    }
  }

  /**
   * SDK 이벤트를 AgentEvent로 매핑한다 / Map SDK event to AgentEvent
   *
   * @param sdkEvent - SDK에서 수신한 이벤트 / Event from SDK
   * @param agentName - 이벤트를 발생시킨 에이전트 / Agent that emitted the event
   * @returns 매핑된 AgentEvent 또는 null / Mapped AgentEvent or null
   *
   * @description
   * KR: SDK의 V2SessionEvent를 adev의 AgentEvent 형식으로 변환한다.
   *     매핑 불가능한 이벤트는 null 반환 (필터링).
   * EN: Converts SDK's V2SessionEvent to adev's AgentEvent format.
   *     Returns null for unmappable events (filtered out).
   */
  private mapSdkEvent(sdkEvent: V2SessionEvent, agentName: AgentName): AgentEvent | null {
    const timestamp = new Date();

    // WHY: SDK 이벤트 타입에 따라 AgentEvent 타입 결정
    switch (sdkEvent.type) {
      case 'message':
        return {
          type: 'message',
          agentName,
          content: this.extractContent(sdkEvent),
          timestamp,
          metadata: { sdkEvent },
        };

      case 'tool_use':
        return {
          type: 'tool_use',
          agentName,
          content: `Tool: ${sdkEvent.name || 'unknown'}`,
          timestamp,
          metadata: {
            toolName: sdkEvent.name,
            toolInput: sdkEvent.input,
          },
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          agentName,
          content: this.extractToolResultContent(sdkEvent),
          timestamp,
          metadata: {
            toolName: sdkEvent.tool_use_id,
            isError: sdkEvent.is_error,
          },
        };

      case 'error':
        return {
          type: 'error',
          agentName,
          content: this.extractErrorContent(sdkEvent),
          timestamp,
          metadata: { sdkEvent },
        };

      case 'message_stop':
      case 'session_end':
        return {
          type: 'done',
          agentName,
          content: 'Agent execution completed',
          timestamp,
          metadata: { stopReason: sdkEvent.stop_reason },
        };

      default:
        // WHY: 매핑 불가능한 이벤트는 로그만 남기고 필터링
        this.logger.debug('Unhandled SDK event type', {
          eventType: (sdkEvent as { type?: string }).type,
        });
        return null;
    }
  }

  /**
   * SDK 이벤트에서 메시지 내용을 추출한다 / Extract message content from SDK event
   */
  private extractContent(event: V2SessionEvent): string {
    if ('content' in event && typeof event.content === 'string') {
      return event.content;
    }
    if ('content' in event && Array.isArray(event.content)) {
      return event.content
        .filter((block: unknown): block is { type: string; text: string } => {
          return (
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            (block as { type: string }).type === 'text' &&
            'text' in block &&
            typeof (block as { text: unknown }).text === 'string'
          );
        })
        .map((block) => block.text)
        .join('\n');
    }
    return '';
  }

  /**
   * tool_result 이벤트에서 결과 내용을 추출한다 / Extract tool result content
   */
  private extractToolResultContent(event: V2SessionEvent): string {
    if ('content' in event) {
      if (typeof event.content === 'string') {
        return event.content;
      }
      if (Array.isArray(event.content)) {
        return JSON.stringify(event.content);
      }
    }
    return 'Tool result received';
  }

  /**
   * error 이벤트에서 에러 메시지를 추출한다 / Extract error message from error event
   */
  private extractErrorContent(event: V2SessionEvent): string {
    if ('error' in event && typeof event.error === 'object' && event.error !== null) {
      const errorObj = event.error as { message?: string };
      return errorObj.message ?? 'Unknown error';
    }
    if ('message' in event && typeof event.message === 'string') {
      return event.message;
    }
    return 'Unknown error occurred';
  }

  /**
   * 에러 이벤트를 생성한다 / Create an error event
   */
  private createErrorEvent(agentName: AgentName, message: string): AgentEvent {
    return {
      type: 'error',
      agentName,
      content: message,
      timestamp: new Date(),
    };
  }

  /**
   * 세션 ID를 생성한다 / Generate session ID
   *
   * @description
   * KR: 프로젝트ID, 기능ID, 에이전트명, Phase를 조합하여 세션 ID 생성.
   *     추후 영속화 시 LanceDB 키로 사용 가능.
   * EN: Combines projectId, featureId, agentName, phase to generate session ID.
   *     Can be used as LanceDB key for persistence.
   */
  private generateSessionId(config: AgentConfig): string {
    return `${config.projectId}:${config.featureId}:${config.name}:${config.phase}`;
  }

  /**
   * 세션 ID에서 에이전트명을 추출한다 / Extract agent name from session ID
   *
   * @description
   * KR: 세션 ID 형식 (projectId:featureId:agentName:phase)에서 에이전트명 추출.
   *     유효하지 않은 ID는 'architect' 기본값 반환.
   * EN: Extracts agent name from session ID format.
   *     Returns 'architect' as default for invalid IDs.
   */
  private extractAgentNameFromSessionId(sessionId: string): AgentName {
    const parts = sessionId.split(':');
    if (parts.length === 4) {
      const agentName = parts[2];
      // WHY: 타입 가드로 유효한 AgentName 검증
      const validAgents: AgentName[] = [
        'architect',
        'qa',
        'coder',
        'tester',
        'qc',
        'reviewer',
        'documenter',
      ];
      if (validAgents.includes(agentName as AgentName)) {
        return agentName as AgentName;
      }
    }
    // WHY: 기본값 반환 (최초 설계 담당)
    return 'architect';
  }

  /**
   * 활성 세션을 정리한다 / Clean up active sessions
   *
   * @description
   * KR: 프로세스 종료 시 모든 활성 세션을 정리한다.
   * EN: Cleans up all active sessions on process exit.
   */
  public cleanup(): void {
    this.logger.info('Cleaning up active sessions', {
      activeCount: this.activeSessions.size,
    });
    this.activeSessions.clear();
  }
}
