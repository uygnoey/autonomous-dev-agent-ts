/**
 * 병렬 Coder 실행기 / Parallel Coder Runner
 *
 * @description
 * KR: 여러 Coder를 병렬로 실행하고 결과를 집계한다.
 *     CoderAllocator로 모듈별 Coder를 배정하고 Promise.all로 병렬 실행한다.
 *     각 Coder 결과는 절대 throw하지 않고 CoderRunResult에 담아 반환한다.
 *     감독 세션(architect/reviewer)은 parallel-coder-supervision.ts에 분리.
 * EN: Runs multiple coders in parallel and aggregates results.
 *     Uses CoderAllocator for per-module assignment and Promise.all for parallel execution.
 *     Never throws — wraps all errors in CoderRunResult.
 *     Supervision sessions (architect/reviewer) are in parallel-coder-supervision.ts.
 */

import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import { extractModulesFromSpec } from 'layer2/parallel-coder-runner-helpers.js';
import { runSupervisionPhase } from 'layer2/parallel-coder-supervision.js';
import { createEvent } from 'layer2/team-leader-helpers.js';
import type { AgentEvent, CoderAllocation } from 'layer2/types.js';

export type {
  CoderRunResult,
  ParallelCoderRunnerDeps,
} from 'layer2/parallel-coder-runner-types.js';

import type {
  CoderRunResult,
  ParallelCoderRunnerDeps,
} from 'layer2/parallel-coder-runner-types.js';

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
    const modules = extractModulesFromSpec(handoffPackage.specDocument);
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

    // WHY: maxWorkers로 배치 크기 제한 — 무한 병렬 실행 방지 (스펙 §8.4)
    const results = await this.runInBatches(allocations, handoffPackage);

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
      return;
    }

    // WHY: coder 완료 후 architect(스펙 준수) → reviewer(코드 품질) 순서로 감독 세션 실행
    yield* runSupervisionPhase(featureId, handoffPackage, this.deps, this.logger);
  }

  /**
   * 배치 단위로 Coder를 병렬 실행한다 / Runs coders in parallel batches
   *
   * @description
   * KR: maxWorkers 크기 배치로 나눠 순차 처리. 배치 내에서는 Promise.all 병렬 실행.
   * EN: Splits into batches of maxWorkers, processes batches sequentially,
   *     runs within each batch in parallel via Promise.all.
   *
   * @param allocations - Coder 할당 목록 / Coder allocations
   * @param handoffPackage - 인수 패키지 / Handoff package
   * @returns 전체 실행 결과 / All coder run results
   */
  private async runInBatches(
    allocations: readonly CoderAllocation[],
    handoffPackage: HandoffPackage,
  ): Promise<CoderRunResult[]> {
    const maxWorkers = this.deps.maxWorkers ?? allocations.length;
    const results: CoderRunResult[] = [];

    for (let i = 0; i < allocations.length; i += maxWorkers) {
      const batch = allocations.slice(i, i + maxWorkers);
      // WHY: 배치 내 Promise.all — 일부 실패해도 다른 Coder는 계속 진행
      const batchResults = await Promise.all(
        batch.map((allocation) => this.runOneCoder(allocation, handoffPackage)),
      );
      results.push(...batchResults);
    }

    return results;
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
}
