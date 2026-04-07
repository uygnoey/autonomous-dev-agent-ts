/**
 * 에이전트 스포너 / Agent Spawner
 *
 * @description
 * KR: AgentExecutor 인터페이스를 통해 에이전트를 생성하고 세션을 재개한다.
 *     스폰/완료 이벤트를 로깅한다.
 * EN: Spawns agents and resumes sessions via the AgentExecutor interface.
 *     Logs spawn and completion events.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { MetricsCollector } from 'core/metrics.js';
import { createMetricsEvent } from 'core/metrics.js';
import { PerfTracker } from 'core/perf.js';
import type { AgentConfig, AgentEvent, AgentExecutor } from 'layer2/types.js';

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
  private readonly perf: PerfTracker;
  private readonly metrics: MetricsCollector | null;

  /**
   * @param executor - 에이전트 실행기 / Agent executor
   * @param logger - 로거 인스턴스 / Logger instance
   * @param metrics - 메트릭스 수집기 (선택) / Metrics collector (optional)
   */
  constructor(executor: AgentExecutor, logger: Logger, metrics?: MetricsCollector) {
    this.executor = executor;
    this.logger = logger.child({ module: 'agent-spawner' });
    this.perf = new PerfTracker(this.logger);
    this.metrics = metrics ?? null;
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

    const spawnStart = performance.now();

    this.metrics?.emit(
      createMetricsEvent('agent_spawn', 1, {
        agent_name: config.name,
        phase: config.phase,
      }),
    );

    try {
      let firstEventRecorded = false;

      for await (const event of this.executor.execute(config)) {
        if (!firstEventRecorded) {
          const ttfe = Math.round((performance.now() - spawnStart) * 100) / 100;
          this.logger.info('에이전트 cold-start 측정 (spawn→첫 이벤트)', {
            agent: config.name,
            timeToFirstEventMs: ttfe,
          });
          firstEventRecorded = true;
        }
        yield event;
      }

      const totalMs = Math.round((performance.now() - spawnStart) * 100) / 100;
      this.logger.info('에이전트 실행 완료', {
        agent: config.name,
        phase: config.phase,
        featureId: config.featureId,
        totalMs,
      });

      this.metrics?.emit(
        createMetricsEvent('agent_complete', totalMs, {
          agent_name: config.name,
          exit_code: 0,
        }),
      );
    } catch (error: unknown) {
      const totalMs = Math.round((performance.now() - spawnStart) * 100) / 100;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('에이전트 실행 실패', {
        agent: config.name,
        phase: config.phase,
        error: message,
      });

      this.metrics?.emit(
        createMetricsEvent('agent_complete', totalMs, {
          agent_name: config.name,
          exit_code: 1,
        }),
      );
      // WHY: async generator에서 throw 대신 에러 이벤트를 yield하여 Result 패턴 철학 준수
      yield {
        type: 'error' as const,
        agentName: config.name,
        content: message,
        timestamp: new Date(),
        metadata: {
          error:
            error instanceof AgentError
              ? error
              : new AgentError('agent_execution_error', `에이전트 실행 실패: ${message}`, error),
        },
      };
    }
  }

  /**
   * 성능 측정 결과 반환 / Get performance profiling entries
   */
  getPerfEntries() {
    return this.perf.getEntries();
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('세션 재개 실패', {
        sessionId,
        error: message,
      });
      // WHY: async generator에서 throw 대신 에러 이벤트를 yield하여 Result 패턴 철학 준수
      yield {
        type: 'error' as const,
        agentName: 'coder' as const,
        content: message,
        timestamp: new Date(),
        metadata: {
          error:
            error instanceof AgentError
              ? error
              : new AgentError('agent_session_resume_error', `세션 재개 실패: ${message}`, error),
          sessionId,
        },
      };
    }
  }
}
