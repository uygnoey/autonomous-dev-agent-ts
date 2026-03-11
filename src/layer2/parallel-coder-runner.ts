/**
 * 병렬 Coder 실행기 / Parallel Coder Runner
 *
 * @description
 * KR: 여러 Coder를 병렬로 실행하고 결과를 집계한다.
 *     CoderAllocator로 모듈별 Coder를 배정하고 Promise.all로 병렬 실행한다.
 *     각 Coder 결과는 절대 throw하지 않고 CoderRunResult에 담아 반환한다.
 * EN: Runs multiple coders in parallel and aggregates results.
 *     Uses CoderAllocator for per-module assignment and Promise.all for parallel execution.
 *     Never throws — wraps all errors in CoderRunResult.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import { createEvent } from 'layer2/team-leader-helpers.js';
import type { AgentEvent, CoderAllocation } from 'layer2/types.js';

// ── 공개 타입 / Public types ──────────────────────────────────────

/**
 * Coder 단일 실행 결과 / Single coder run result
 *
 * @description
 * KR: 한 Coder의 실행 결과. 성공/실패 여부와 수집된 이벤트를 담는다.
 * EN: Result of a single coder execution. Holds success/failure and collected events.
 */
export interface CoderRunResult {
  /** Coder ID / Coder ID */
  readonly coderId: string;
  /** Git 브랜치 이름 / Git branch name */
  readonly branchName: string;
  /** 성공 여부 / Whether succeeded */
  readonly succeeded: boolean;
  /** 수집된 이벤트 목록 / Collected events */
  readonly events: readonly AgentEvent[];
  /** 에러 (실패 시) / Error (on failure) */
  readonly error?: AgentError;
}

/**
 * ParallelCoderRunner 의존성 / ParallelCoderRunner dependencies
 */
export interface ParallelCoderRunnerDeps {
  readonly agentGenerator: AgentGenerator;
  readonly agentSpawner: AgentSpawner;
  readonly sessionManager: SessionManager;
  readonly streamMonitor: StreamMonitor;
  readonly coderAllocator: CoderAllocator;
  readonly logger: Logger;
}

// ── 구현 / Implementation ─────────────────────────────────────────

/**
 * 병렬 Coder 실행기 / Parallel Coder Runner
 *
 * @description
 * KR: 모듈별로 Coder를 배정하고, 모든 Coder를 병렬로 실행한다.
 *     일부가 실패해도 나머지는 중단되지 않는다.
 * EN: Assigns coders per module and runs all coders in parallel.
 *     Partial failures do not abort other coders.
 *
 * @example
 * const runner = new ParallelCoderRunner(deps);
 * for await (const event of runner.runParallel('feat-1', handoffPackage)) {
 *   logger.info('event', { type: event.type });
 * }
 */
export class ParallelCoderRunner {
  private readonly deps: ParallelCoderRunnerDeps;
  private readonly logger: Logger;

  /**
   * @param deps - 의존성 / Dependencies
   */
  constructor(deps: ParallelCoderRunnerDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ module: 'parallel-coder-runner' });
  }

  /**
   * 모든 Coder를 병렬로 실행한다 / Runs all coders in parallel
   *
   * @param featureId - 기능 ID / Feature ID
   * @param handoffPackage - Layer1→Layer2 인수 패키지 / Handoff package from layer1
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  async *runParallel(featureId: string, handoffPackage: HandoffPackage): AsyncIterable<AgentEvent> {
    const modules = this.extractModules(handoffPackage.specDocument);
    const allocResult = this.deps.coderAllocator.allocate(featureId, modules);

    if (!allocResult.ok) {
      this.logger.error('Coder 할당 실패', {
        featureId,
        error: allocResult.error.message,
      });
      yield createEvent('error', `Coder 할당 실패: ${allocResult.error.message}`);
      return;
    }

    const allocations = allocResult.value;
    this.logger.info('병렬 Coder 실행 시작', {
      featureId,
      coderCount: allocations.length,
    });

    // WHY: Promise.all로 병렬 실행 — 일부 실패해도 다른 Coder는 계속 진행
    const promises = allocations.map((allocation) => this.runOneCoder(allocation, handoffPackage));
    const results = await Promise.all(promises);

    // WHY: allocation 순서대로 이벤트를 yield하여 결과 일관성 보장
    for (const result of results) {
      for (const event of result.events) {
        yield event;
      }
    }

    const successCount = results.filter((r) => r.succeeded).length;
    const failCount = results.length - successCount;

    yield createEvent('message', `병렬 Coder 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // WHY: 전체 실패 시 error 이벤트를 추가로 발생시켜 상위에서 감지 가능하게 함
    if (successCount === 0) {
      yield createEvent('error', `모든 Coder 실패: featureId=${featureId}`);
    }
  }

  /**
   * 단일 Coder를 실행한다 / Runs a single coder
   *
   * @description
   * KR: 절대 throw하지 않는다. 모든 에러를 CoderRunResult.error에 담는다.
   * EN: Never throws. Wraps all errors in CoderRunResult.error.
   *
   * @param allocation - Coder 할당 정보 / Coder allocation info
   * @param handoffPackage - 인수 패키지 / Handoff package
   * @returns Coder 실행 결과 / Coder run result
   */
  private async runOneCoder(
    allocation: CoderAllocation,
    handoffPackage: HandoffPackage,
  ): Promise<CoderRunResult> {
    const events: AgentEvent[] = [];

    try {
      const configResult = this.deps.agentGenerator.generateAgentConfig(
        'coder',
        handoffPackage.specDocument,
        allocation.featureId,
      );

      if (!configResult.ok) {
        return {
          coderId: allocation.coderId,
          branchName: allocation.branchName,
          succeeded: false,
          events,
          error: new AgentError(
            'agent_config_error',
            `Coder 설정 생성 실패: ${configResult.error.message}`,
          ),
        };
      }

      const config = {
        ...configResult.value,
        projectId: handoffPackage.projectId,
        phase: 'CODE' as const,
      };

      // WHY: 세션 생성으로 진행 상태를 추적 가능하게 함
      this.deps.sessionManager.createSession(
        'coder',
        config.projectId,
        allocation.featureId,
        'CODE',
      );

      for await (const event of this.deps.agentSpawner.spawn(config)) {
        // WHY: 스트림 모니터에 이벤트를 전달해 이상 패턴 감지 활성화
        this.deps.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        events.push(event);
      }

      this.logger.info('Coder 실행 완료', {
        coderId: allocation.coderId,
        branchName: allocation.branchName,
        eventCount: events.length,
      });

      return {
        coderId: allocation.coderId,
        branchName: allocation.branchName,
        succeeded: true,
        events,
      };
    } catch (caught: unknown) {
      const agentError =
        caught instanceof AgentError
          ? caught
          : new AgentError(
              'agent_execution_error',
              caught instanceof Error ? caught.message : String(caught),
              caught,
            );

      this.logger.error('Coder 실행 오류', {
        coderId: allocation.coderId,
        error: agentError.message,
      });

      return {
        coderId: allocation.coderId,
        branchName: allocation.branchName,
        succeeded: false,
        events,
        error: agentError,
      };
    }
  }

  /**
   * 스펙에서 모듈 목록을 추출한다 / Extracts module list from spec
   *
   * @description
   * KR: 초기 구현. 항상 ['default']를 반환한다.
   *     추후 스펙 파싱 로직으로 교체 예정.
   * EN: Initial implementation. Always returns ['default'].
   *     To be replaced with spec parsing logic.
   *
   * @param _spec - 스펙 문서 / Spec document
   * @returns 모듈 목록 / Module list
   */
  private extractModules(_spec: string): string[] {
    return ['default'];
  }
}
