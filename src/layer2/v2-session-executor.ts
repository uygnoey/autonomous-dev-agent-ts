/**
 * V2 Session API Executor / Claude Agent SDK V2 Session 기반 에이전트 실행기
 *
 * @description
 * KR: @anthropic-ai/sdk의 Messages API를 사용하여 AgentExecutor 인터페이스를 구현한다.
 *     Agent Teams 환경변수 설정, 세션 스트림 관리, 이벤트 매핑을 담당한다.
 * EN: Implements AgentExecutor using @anthropic-ai/sdk Messages API.
 *     Handles Agent Teams environment setup, session stream management, and event mapping.
 */

import type { AuthProvider } from 'auth/types.js';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type AgentName, type Result, err, ok } from 'core/types.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from 'layer2/types.js';
import type { SDKSessionOptions, V2Session } from 'layer2/v2-session-executor-types.js';
export type {
  V2SessionFactory,
  V2SessionExecutorOptions,
} from 'layer2/v2-session-executor-types.js';
import type {
  V2SessionExecutorOptions,
  V2SessionFactory,
} from 'layer2/v2-session-executor-types.js';
import {
  createErrorEvent,
  extractAgentNameFromSessionId,
  generateSessionId,
  mapSdkEvent,
  sdkResumeSession,
  sdkSessionFactory,
} from 'layer2/v2-session-factory.js';

/**
 * V2 Session 기반 에이전트 실행기 / V2 Session-based agent executor
 *
 * @description
 * KR: @anthropic-ai/sdk Messages API를 사용하여 에이전트를 실행한다.
 *     - Agent Teams 환경변수 설정 (DESIGN Phase)
 *     - session.stream() 호출 및 이벤트 매핑
 *     - SDK 이벤트 → AgentEvent 변환
 *     - 에러 처리 및 Result 패턴 적용
 * EN: Executes agents using @anthropic-ai/sdk Messages API.
 *     - Sets Agent Teams environment variables (DESIGN Phase)
 *     - Calls session.stream() and maps events
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
  private readonly activeSessions: Map<string, { session: V2Session; options: SDKSessionOptions }>;
  private readonly sessionFactory: V2SessionFactory;

  constructor(options: V2SessionExecutorOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger.child({ module: 'V2SessionExecutor' });
    this.defaultOptions = options.defaultOptions;
    this.activeSessions = new Map();
    // WHY: 테스트 시 mock 팩토리 주입, 프로덕션은 claude-agent-sdk 기반 팩토리 사용
    this.sessionFactory = options.sessionFactory ?? sdkSessionFactory;
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
      const sessionEnv = this.buildSessionEnvironment(config, enableAgentTeams);
      const sessionResult = await this.createSession(config, sessionEnv);
      if (!sessionResult.ok) {
        yield createErrorEvent(config.name, sessionResult.error.message);
        return;
      }

      const { session, options: sessionOptions } = sessionResult.value;
      const sessionId = generateSessionId(
        config.projectId,
        config.featureId,
        config.name,
        config.phase,
      );
      this.activeSessions.set(sessionId, { session, options: sessionOptions });

      try {
        // WHY: V2 Session API는 systemPrompt 옵션이 없으므로 send()에 역할을 앞에 붙여서 전달.
        //      SDKSessionOptions에 systemPrompt/maxTurns가 없어 프롬프트 엔지니어링으로 대체.
        const fullPrompt = config.systemPrompt
          ? `${config.systemPrompt}\n\n---\n\n${config.prompt}`
          : config.prompt;
        await session.send(fullPrompt);
        for await (const sdkEvent of session.stream()) {
          const mappedEvent = mapSdkEvent(sdkEvent, config.name, (eventType) => {
            this.logger.debug('Unhandled SDK event type', { eventType });
          });
          if (mappedEvent) {
            yield mappedEvent;
          }

          // WHY: done 이벤트 수신 시 세션 정리
          if (mappedEvent?.type === 'done') {
            this.logger.info('Agent execution completed', { agentName: config.name });
            session.close();
            this.activeSessions.delete(sessionId);
          }
        }
      } catch (streamError) {
        this.logger.error('Session stream error', { agentName: config.name, error: streamError });
        yield createErrorEvent(
          config.name,
          streamError instanceof Error ? streamError.message : 'Unknown stream error',
        );
        this.activeSessions.delete(sessionId);
      }
    } catch (error) {
      this.logger.error('Agent execution failed', { agentName: config.name, error });
      yield createErrorEvent(
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

    const agentName = extractAgentNameFromSessionId(sessionId);
    const stored = this.activeSessions.get(sessionId);

    // WHY: 메모리에 없으면 sdkResumeSession으로 세션 복원 (기본 옵션 사용)
    const session: V2Session = stored
      ? stored.session
      : sdkResumeSession(sessionId, {
          model: this.defaultOptions?.model ?? 'claude-opus-4-6',
        });

    try {
      // WHY: resume은 이미 대화 컨텍스트가 있으므로 send 없이 stream만 수신
      for await (const sdkEvent of session.stream()) {
        const mappedEvent = mapSdkEvent(sdkEvent, agentName, (eventType) => {
          this.logger.debug('Unhandled SDK event type', { eventType });
        });
        if (mappedEvent) {
          yield mappedEvent;
        }

        if (mappedEvent?.type === 'done') {
          this.activeSessions.delete(sessionId);
        }
      }
    } catch (error) {
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
   */
  private buildSessionEnvironment(
    config: AgentConfig,
    enableAgentTeams: boolean,
  ): Record<string, string> {
    const authHeader = this.authProvider.getAuthHeader();
    const baseEnv: Record<string, string> = {};

    // WHY: API Key는 항상 전달 (Layer1 필수 인증)
    if ('x-api-key' in authHeader) {
      baseEnv.ANTHROPIC_API_KEY = authHeader['x-api-key'] as string;
    }

    // WHY: OAuth Token도 있으면 함께 전달 (agent-sdk가 OAuth 인증에 활용)
    if ('authorization' in authHeader) {
      const token = (authHeader.authorization as string).replace('Bearer ', '');
      baseEnv.CLAUDE_CODE_OAUTH_TOKEN = token;
    }

    if (enableAgentTeams) {
      // WHY: Agent Teams는 '1'로 설정 시 활성화, 미설정 시 비활성화 (키 자체를 설정하지 않음)
      baseEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      this.logger.debug('Agent Teams enabled', { phase: config.phase });
    }

    return { ...baseEnv, ...(config.env ?? {}) };
  }

  /**
   * V2 Session을 생성한다 / Create a V2 Session
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @param env - 환경변수 / Environment variables
   * @returns 세션 생성 결과 / Session creation result
   */
  private async createSession(
    config: AgentConfig,
    env: Record<string, string>,
  ): Promise<Result<{ session: V2Session; options: SDKSessionOptions }, AgentError>> {
    try {
      const sessionOptions: SDKSessionOptions = {
        model: this.defaultOptions?.model ?? 'claude-opus-4-6',
        permissionMode: 'bypassPermissions',
        executable: 'bun',
        env,
        allowedTools: config.tools.length > 0 ? [...config.tools] : undefined,
      };

      const session = this.sessionFactory(sessionOptions);
      this.logger.debug('Session created', { agentName: config.name, phase: config.phase });

      return ok({ session, options: sessionOptions });
    } catch (error) {
      this.logger.error('Session creation failed', { agentName: config.name, error });

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
