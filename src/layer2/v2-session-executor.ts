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
import type { HandoffPackage } from 'layer1/types.js';
import { buildSessionEnvironment } from 'layer2/v2-session-env-builder.js';
import { executeDesignPhase as executeDesignPhaseImpl } from 'layer2/v2-session-executor-design.js';
import type {
  SDKSessionOptions,
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
    this.sessionFactory = options.sessionFactory ?? sdkSessionFactory;
    this.hooks = options.hooks;
  }

  /**
   * 에이전트를 실행한다 / Execute an agent
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
   */
  async *resume(sessionId: string): AsyncIterable<AgentEvent> {
    this.logger.info('Resuming session', { sessionId });

    const agentName = extractAgentNameFromSessionId(sessionId);
    const stored = this.activeSessions.get(sessionId);

    const session: V2Session = stored
      ? stored.session
      : sdkResumeSession(sessionId, {
          model: this.defaultOptions?.model ?? 'claude-opus-4-6',
        });

    try {
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
   */
  private async createSession(
    config: AgentConfig,
    env: Record<string, string>,
  ): Promise<Result<{ session: V2Session; options: SDKSessionOptions }, AgentError>> {
    try {
      const sessionOptions: SDKSessionOptions & { settingSources: string[] } = {
        model: this.defaultOptions?.model ?? 'claude-opus-4-6',
        permissionMode: 'bypassPermissions',
        settingSources: [],
        executable: 'bun',
        env,
        allowedTools: config.tools.length > 0 ? [...config.tools] : undefined,
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
   */
  async *executeDesignPhase(
    config: AgentConfig,
    options: {
      readonly featureId: string;
      readonly handoff: HandoffPackage;
      readonly signal?: AbortSignal;
    },
  ): AsyncGenerator<AgentEvent> {
    yield* executeDesignPhaseImpl(config, options, {
      authProvider: this.authProvider,
      logger: this.logger,
      sessionFactory: this.sessionFactory,
      defaultOptions: this.defaultOptions,
      activeSessions: this.activeSessions,
      hooks: this.hooks as Record<string, unknown> | undefined,
      createSession: this.createSession.bind(this),
    });
  }

  /**
   * 활성 세션을 정리한다 / Clean up active sessions
   */
  public cleanup(): void {
    this.logger.info('Cleaning up active sessions', {
      activeCount: this.activeSessions.size,
    });
    this.activeSessions.clear();
  }
}
