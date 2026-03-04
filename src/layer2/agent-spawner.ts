/**
 * 에이전트 스포너 / Agent Spawner
 *
 * @description
 * KR: AgentExecutor 인터페이스를 통해 에이전트를 생성하고 세션을 재개한다.
 *     스폰/완료 이벤트를 로깅한다.
 * EN: Spawns agents and resumes sessions via the AgentExecutor interface.
 *     Logs spawn and completion events.
 */

import type { Logger } from '../core/logger.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from './types.js';

/**
 * 에이전트 스포너 / Agent Spawner
 *
 * @description
 * KR: AgentExecutor에 위임하여 에이전트를 실행하고, 이벤트를 전달한다.
 * EN: Delegates to AgentExecutor for agent execution and forwards events.
 *
 * @example
 * const spawner = new AgentSpawner(executor, logger);
 * for await (const event of spawner.spawn(config)) {
 *   // 이벤트 처리 / handle event
 * }
 */
export class AgentSpawner {
  private readonly logger: Logger;
  private readonly executor: AgentExecutor;

  /**
   * @param executor - 에이전트 실행기 / Agent executor
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(executor: AgentExecutor, logger: Logger) {
    this.executor = executor;
    this.logger = logger.child({ module: 'agent-spawner' });
  }

  /**
   * 에이전트를 스폰한다 / Spawns an agent
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   *
   * @example
   * for await (const event of spawner.spawn(agentConfig)) {
   *   logger.info('event', { type: event.type, agent: event.agentName });
   * }
   */
  async *spawn(config: AgentConfig): AsyncIterable<AgentEvent> {
    this.logger.info('에이전트 스폰 시작', {
      agent: config.name,
      phase: config.phase,
      featureId: config.featureId,
    });

    try {
      for await (const event of this.executor.execute(config)) {
        yield event;
      }

      this.logger.info('에이전트 실행 완료', {
        agent: config.name,
        phase: config.phase,
        featureId: config.featureId,
      });
    } catch (error: unknown) {
      this.logger.error('에이전트 실행 실패', {
        agent: config.name,
        phase: config.phase,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 이전 세션을 재개한다 / Resumes a previous session
   *
   * @param sessionId - 재개할 세션 ID / Session ID to resume
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  async *resumeSession(sessionId: string): AsyncIterable<AgentEvent> {
    this.logger.info('세션 재개 시작', { sessionId });

    try {
      for await (const event of this.executor.resume(sessionId)) {
        yield event;
      }

      this.logger.info('세션 재개 완료', { sessionId });
    } catch (error: unknown) {
      this.logger.error('세션 재개 실패', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
