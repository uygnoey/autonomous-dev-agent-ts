/**
 * 병렬 Coder 감독 실행기 / Parallel Coder Supervision Runner
 *
 * @description
 * KR: coder 병렬 실행 완료 후 architect(스펙 준수 검토)와 reviewer(코드 품질 검토)를
 *     순차 실행한다. 설정 생성 실패 시 경고만 남기고 해당 에이전트를 건너뛴다.
 * EN: After parallel coder execution, runs architect (spec compliance) and reviewer
 *     (code quality) sequentially. Skips agent on config failure with warning.
 */

import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { ParallelCoderRunnerDeps } from 'layer2/parallel-coder-runner-types.js';
import { createEvent } from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';

/**
 * architect/reviewer 감독 세션을 실행한다 / Runs architect/reviewer supervision session
 *
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param deps - 의존성 / Dependencies
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* runSupervisionPhase(
  featureId: string,
  handoffPackage: HandoffPackage,
  deps: ParallelCoderRunnerDeps,
  logger: Logger,
): AsyncIterable<AgentEvent> {
  // WHY: architect → 스펙 준수 확인, reviewer → 코드 품질 확인 순서로 감독
  const supervisors: readonly ('architect' | 'reviewer')[] = ['architect', 'reviewer'];

  for (const agentName of supervisors) {
    const configResult = deps.agentGenerator.generateAgentConfig(
      agentName,
      handoffPackage.specDocument,
      featureId,
    );

    if (!configResult.ok) {
      logger.warn('감독 에이전트 설정 생성 실패 — 감독 생략', {
        agent: agentName,
        featureId,
        error: configResult.error.message,
      });
      yield createEvent('message', `${agentName} 감독 설정 생성 실패 — 생략`);
      continue;
    }

    const config = {
      ...configResult.value,
      projectId: handoffPackage.projectId,
      phase: 'CODE' as const,
    };

    deps.sessionManager.createSession(agentName, config.projectId, featureId, 'CODE');

    logger.info('CODE Phase 감독 세션 시작', { agent: agentName, featureId });
    yield createEvent('message', `CODE Phase ${agentName} 감독 세션 시작`);

    for await (const event of deps.agentSpawner.spawn(config)) {
      // WHY: 스트림 모니터에 이벤트를 전달해 이상 패턴 감지 활성화
      deps.streamMonitor.onEvent({
        type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
        agentName: event.agentName,
        toolName: event.type === 'tool_use' ? event.content : undefined,
        data: event.metadata ?? {},
        timestamp: event.timestamp,
      });

      yield event;
    }

    logger.info('CODE Phase 감독 세션 완료', { agent: agentName, featureId });
    yield createEvent('message', `CODE Phase ${agentName} 감독 세션 완료`);
  }
}
