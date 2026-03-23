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
import type { V2Session } from 'layer2/v2-session-executor-types.js';
export type {
  V2SessionFactory,
  V2SessionExecutorOptions,
} from 'layer2/v2-session-executor-types.js';
import { buildSessionEnvironment } from 'layer2/v2-session-env-builder.js';
import type {
  SDKSessionOptions,
  V2SessionExecutorOptions,
  V2SessionFactory,
} from 'layer2/v2-session-executor-types.js';
import type { HandoffPackage } from 'layer1/types.js';
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
  private readonly hooks: V2SessionExecutorOptions['hooks'];

  constructor(options: V2SessionExecutorOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger.child({ module: 'V2SessionExecutor' });
    this.defaultOptions = options.defaultOptions;
    this.activeSessions = new Map();
    // WHY: 테스트 시 mock 팩토리 주입, 프로덕션은 claude-agent-sdk 기반 팩토리 사용
    this.sessionFactory = options.sessionFactory ?? sdkSessionFactory;
    // WHY: SDK 훅 콜백을 세션에 전달하여 StreamMonitor 연동 가능
    this.hooks = options.hooks;
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

    try {
      const sessionEnv = buildSessionEnvironment(config, this.authProvider);
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
        this.logger.info('Session send 시작', {
          agentName: config.name,
          promptLen: fullPrompt.length,
        });
        await session.send(fullPrompt);
        this.logger.info('Session send 완료, stream 시작', { agentName: config.name });
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
        const errMsg =
          streamError instanceof Error
            ? `${streamError.message}\n${streamError.stack ?? ''}`
            : String(streamError);
        this.logger.error('Session stream error', { agentName: config.name, errorMsg: errMsg });
        yield createErrorEvent(config.name, errMsg || 'Unknown stream error');
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
        // WHY: hooks가 있으면 SDK에 전달하여 PreToolUse/PostToolUse 등 이벤트를 StreamMonitor로 연결
        ...(this.hooks ? { hooks: this.hooks } : {}),
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
   * DESIGN Phase 전용 실행 — session.stream() + Agent Teams env
   *
   * @description
   * KR: DESIGN Phase에서 architect/qa/coder/reviewer가 teammate로 실시간 토론한다.
   *     Agent Teams 환경변수(CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)를 활성화하고,
   *     AbortSignal로 이상 감지 시 세션을 중단할 수 있다.
   * EN: Enables real-time discussion among architect/qa/coder/reviewer as teammates in DESIGN Phase.
   *     Activates Agent Teams env var, supports AbortSignal for anomaly-based session termination.
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @param options - DESIGN Phase 옵션 / DESIGN phase options
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  async *executeDesignPhase(
    config: AgentConfig,
    options: {
      readonly featureId: string;
      readonly handoff: HandoffPackage;
      readonly signal?: AbortSignal;
    },
  ): AsyncGenerator<AgentEvent> {
    this.logger.info('DESIGN Phase 실행 시작 (Agent Teams)', {
      agentName: config.name,
      featureId: options.featureId,
    });

    // WHY: DESIGN Phase는 반드시 Agent Teams 활성화 필요
    const designConfig: AgentConfig = {
      ...config,
      phase: 'DESIGN',
      env: {
        ...(config.env ?? {}),
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      },
    };

    try {
      const sessionEnv = buildSessionEnvironment(designConfig, this.authProvider);
      const sessionResult = await this.createSession(designConfig, sessionEnv);
      if (!sessionResult.ok) {
        yield createErrorEvent(config.name, sessionResult.error.message);
        return;
      }

      const { session, options: sessionOptions } = sessionResult.value;
      const sessionId = generateSessionId(
        config.projectId,
        options.featureId,
        config.name,
        'DESIGN',
      );
      this.activeSessions.set(sessionId, { session, options: sessionOptions });

      try {
        const fullPrompt = config.systemPrompt
          ? `${config.systemPrompt}\n\n---\n\n${config.prompt}`
          : config.prompt;

        this.logger.info('DESIGN Phase session send 시작', {
          agentName: config.name,
          promptLen: fullPrompt.length,
        });
        await session.send(fullPrompt);

        for await (const sdkEvent of session.stream()) {
          // WHY: AbortSignal이 발생하면 세션을 즉시 종료
          if (options.signal?.aborted) {
            this.logger.warn('DESIGN Phase 세션 abort 신호 수신 — 세션 종료', {
              agentName: config.name,
              featureId: options.featureId,
            });
            session.close();
            this.activeSessions.delete(sessionId);
            yield createErrorEvent(config.name, 'DESIGN Phase 세션이 이상 감지로 중단됨');
            return;
          }

          const mappedEvent = mapSdkEvent(sdkEvent, config.name, (eventType) => {
            this.logger.debug('Unhandled SDK event type', { eventType });
          });
          if (mappedEvent) {
            yield mappedEvent;
          }

          if (mappedEvent?.type === 'done') {
            this.logger.info('DESIGN Phase 완료', { agentName: config.name });
            session.close();
            this.activeSessions.delete(sessionId);
          }
        }
      } catch (streamError) {
        const errMsg =
          streamError instanceof Error
            ? `${streamError.message}\n${streamError.stack ?? ''}`
            : String(streamError);
        this.logger.error('DESIGN Phase stream error', { agentName: config.name, errorMsg: errMsg });
        yield createErrorEvent(config.name, errMsg || 'Unknown DESIGN stream error');
        this.activeSessions.delete(sessionId);
      }
    } catch (error) {
      this.logger.error('DESIGN Phase 실행 실패', { agentName: config.name, error });
      yield createErrorEvent(
        config.name,
        error instanceof Error ? error.message : 'Unknown DESIGN execution error',
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
