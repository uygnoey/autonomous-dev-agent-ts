/**
 * TEST Phase 3단계 실행 / TEST Phase 3-stage execution
 *
 * @description
 * KR: Unit → Module → E2E 3단계 순차 실행과 실패 시 qc/coder 재시도 로직을 제공한다.
 * EN: Provides Unit → Module → E2E 3-stage sequential execution with qc/coder retry on failure.
 */

import type { Logger } from 'core/logger.js';
import type { Phase } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { AgentEvent } from 'layer2/types.js';
import type { RagSearcher } from 'rag/search.js';
import { createEvent, queryRagContext, spawnDocumenter } from 'layer2/team-leader-helpers.js';

/** executeTestPhase에 필요한 의존성 / Deps needed by executeTestPhase */
export interface ExecuteTestPhaseDeps {
  readonly phaseEngine: PhaseEngine;
  readonly tokenMonitor: TokenMonitor;
  readonly agentGenerator: AgentGenerator;
  readonly sessionManager: SessionManager;
  readonly agentSpawner: AgentSpawner;
  readonly streamMonitor: StreamMonitor;
  readonly logger: Logger;
  readonly ragSearcher?: RagSearcher;
  readonly failureHandler?: {
    classify(
      featureId: string,
      phase: string,
      reason: string,
    ): { ok: true; value: { type: string } } | { ok: false };
    getRecoveryPhase(report: { type: string }): Phase;
  };
}

/**
 * TEST Phase 3단계 실행 (Unit → Module → E2E) / Executes TEST phase in 3 stages
 *
 * @description
 * KR: PI-002 — adev가 Unit → Module → E2E 3단계를 순차 실행한다.
 *     각 단계의 tester 에이전트 프롬프트에 테스트 범위를 명시적으로 주입한다.
 *     1개 단계라도 실패하면 즉시 중단하고 qc 분석 + error 이벤트를 yield한다.
 * EN: PI-002 — adev runs Unit → Module → E2E in sequence.
 *     Each stage injects explicit test scope into tester agent prompt.
 *     On any stage failure, immediately stops and yields qc analysis + error event.
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeTestPhase(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  // WHY: PI-002 — 3단계 순차 실행. 각 단계가 독립 tester spawn이므로 실패 감지가 즉각적이다.
  const TEST_STAGES: readonly { readonly scope: string; readonly dir: string }[] = [
    { scope: 'unit', dir: 'tests/unit/' },
    { scope: 'module', dir: 'tests/module/' },
    { scope: 'e2e', dir: 'tests/e2e/' },
  ];

  // WHY: PI-002 — 전체 통과할 때까지 재시도. 무한 루프 방지 안전장치로 전체 최대 10회.
  const MAX_TEST_GLOBAL_RETRIES = 10;
  let globalRetryCount = 0;

  for (const stage of TEST_STAGES) {
    let stageResolved = false;

    while (!stageResolved && globalRetryCount < MAX_TEST_GLOBAL_RETRIES) {
      const isRetry = globalRetryCount > 0 && !stageResolved;
      deps.logger.info('TEST Phase 단계 시작', { featureId, scope: stage.scope, globalRetryCount });
      yield createEvent(
        'message',
        `[TEST] ${stage.scope} 테스트 실행 시작${isRetry ? ` (재시도 ${globalRetryCount}/${MAX_TEST_GLOBAL_RETRIES})` : ''}`,
      );

      let stageFailed = false;
      const stageEvents: AgentEvent[] = [];

      // WHY: tester 에이전트에게 테스트 범위를 명시적으로 지정하여 spawn
      const ragContext = await queryRagContext(deps.ragSearcher, featureId, 'tester');
      const scopePrompt = [
        `[TEST 범위 지정] scope=${stage.scope}, dir=${stage.dir}`,
        `featureId=${featureId}`,
        `이 단계에서는 ${stage.dir} 경로의 ${stage.scope} 테스트만 실행하라.`,
        '1개라도 실패 시 즉시 중단하고 실패 내역을 보고하라.',
      ].join('\n');

      const configResult = deps.agentGenerator.generateAgentConfig(
        'tester',
        `${handoffPackage.specDocument}\n\n${scopePrompt}`,
        featureId,
        ragContext,
      );

      if (!configResult.ok) {
        deps.logger.error('tester 에이전트 설정 생성 실패', {
          scope: stage.scope,
          error: configResult.error.message,
        });
        yield createEvent(
          'error',
          `tester(${stage.scope}) 설정 생성 실패: ${configResult.error.message}`,
        );
        return;
      }

      const config = {
        ...configResult.value,
        projectId: handoffPackage.projectId,
        phase: 'TEST' as const,
      };

      deps.sessionManager.createSession('tester', config.projectId, featureId, 'TEST');

      for await (const event of deps.agentSpawner.spawn(config)) {
        deps.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        yield event;
        stageEvents.push(event);

        // WHY: PI-002 — tester에서 error 이벤트 발생 시 해당 단계 실패로 판정
        if (event.type === 'error') {
          stageFailed = true;
        }
      }

      if (!stageFailed) {
        // WHY: PI-004 — §8.4 random/edge case 80%+ 강제 검증
        const ratio = estimateEdgeCaseRatio(stageEvents);
        if (ratio < 0.5) {
          yield createEvent(
            'message',
            `[경고] edge case 비율 낮음 (추정 ${Math.round(ratio * 100)}%) — 80%+ 권장`,
          );
        }

        // WHY: 단계 통과 — 재시도 루프 탈출
        stageResolved = true;
        break;
      }

      globalRetryCount++;

      deps.logger.warn('TEST Phase 단계 실패', {
        featureId,
        scope: stage.scope,
        globalRetryCount,
        maxRetries: MAX_TEST_GLOBAL_RETRIES,
      });

      // WHY: PI-004 — 실패 시 qc 에이전트 spawn하여 원인 분석
      yield* spawnQcForTestFailure(deps, featureId, handoffPackage, stage.scope);

      if (globalRetryCount < MAX_TEST_GLOBAL_RETRIES) {
        // WHY: PI-002 — qc 분석 후 coder 에이전트에게 수정 요청, 전체 통과할 때까지 반복
        yield createEvent(
          'message',
          `[TEST] ${stage.scope} 실패 — qc 분석 후 coder 수정 재시도 (${globalRetryCount}/${MAX_TEST_GLOBAL_RETRIES})`,
        );
        yield* spawnCoderForTestFix(deps, featureId, handoffPackage, stage.scope);
      }
    }

    if (!stageResolved) {
      yield createEvent(
        'error',
        `[TEST] ${stage.scope} 테스트 실패 — 전체 재시도 ${MAX_TEST_GLOBAL_RETRIES}회 초과. CODE Phase로 롤백 필요`,
      );
      return;
    }

    deps.logger.info('TEST Phase 단계 완료', { featureId, scope: stage.scope });
    yield createEvent('message', `[TEST] ${stage.scope} 테스트 통과`);
  }

  // WHY: 3단계 모두 통과 시 documenter에게 테스트 결과 문서화 요청
  yield* spawnDocumenter(
    deps.agentGenerator,
    deps.agentSpawner,
    deps.logger,
    featureId,
    handoffPackage,
    { trigger: 'test_executed', context: { stages: 'unit,module,e2e', result: 'all_passed' } },
  );
}

/**
 * tester 실행 결과에서 edge case 비율을 추정한다 / Estimates edge case ratio from tester output
 *
 * @description
 * KR: PI-004 — §8.4 random/edge case 80%+ 강제 검증.
 *     tester 이벤트 메시지에서 edge/boundary 키워드와 normal/happy path 키워드 비율을 추정한다.
 * EN: PI-004 — §8.4 enforce 80%+ random/edge case ratio.
 *
 * @param events - tester 에이전트 이벤트 목록 / Tester agent events
 * @returns 추정 edge case 비율 (0~1) / Estimated edge case ratio (0~1)
 */
function estimateEdgeCaseRatio(events: readonly AgentEvent[]): number {
  const messages = events
    .filter((e) => e.type === 'message')
    .map((e) => e.content)
    .join('\n');
  const edgeCount = (
    messages.match(/edge|boundary|error|invalid|null|empty|overflow|corner/gi) ?? []
  ).length;
  const normalCount = (messages.match(/normal|happy path|기본|정상/gi) ?? []).length;
  const total = edgeCount + normalCount;
  // WHY: 키워드가 없으면 판별 불가 — 기본값 80%로 경고 생략
  return total > 0 ? edgeCount / total : 0.8;
}

/**
 * 테스트 실패 시 qc 에이전트를 spawn하여 원인을 분석한다 / Spawns qc agent to analyze test failure
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param scope - 실패한 테스트 범위 / Failed test scope
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnQcForTestFailure(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  scope: string,
): AsyncIterable<AgentEvent> {
  const qcRagContext = await queryRagContext(deps.ragSearcher, featureId, 'qc');
  const qcConfigResult = deps.agentGenerator.generateAgentConfig(
    'qc',
    `${handoffPackage.specDocument}\n\n[QC 분석 요청] ${scope} 테스트 실패. 근본 원인을 분석하라.`,
    featureId,
    qcRagContext,
  );

  if (!qcConfigResult.ok) {
    deps.logger.warn('qc 에이전트 설정 생성 실패', { scope, error: qcConfigResult.error.message });
    return;
  }

  const qcConfig = {
    ...qcConfigResult.value,
    projectId: handoffPackage.projectId,
    phase: 'TEST' as const,
  };
  deps.sessionManager.createSession('qc', qcConfig.projectId, featureId, 'TEST');
  for await (const qcEvent of deps.agentSpawner.spawn(qcConfig)) {
    yield qcEvent;
  }
}

/**
 * 테스트 실패 후 coder 에이전트를 spawn하여 수정을 요청한다 / Spawns coder agent to fix test failure
 *
 * @param deps - TEST Phase 의존성 / TEST phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param scope - 실패한 테스트 범위 / Failed test scope
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnCoderForTestFix(
  deps: ExecuteTestPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  scope: string,
): AsyncIterable<AgentEvent> {
  const coderRagContext = await queryRagContext(deps.ragSearcher, featureId, 'coder');
  const fixPrompt = [
    `[CODER 수정 요청] ${scope} 테스트 실패에 대한 코드 수정`,
    `featureId=${featureId}`,
    'qc 분석 결과를 참고하여 테스트가 통과하도록 코드를 수정하라.',
    '수정 범위를 최소화하고, 테스트 실패의 근본 원인만 해결하라.',
  ].join('\n');

  const configResult = deps.agentGenerator.generateAgentConfig(
    'coder',
    `${handoffPackage.specDocument}\n\n${fixPrompt}`,
    featureId,
    coderRagContext,
  );

  if (!configResult.ok) {
    deps.logger.warn('coder 에이전트 설정 생성 실패 (테스트 수정)', {
      scope,
      error: configResult.error.message,
    });
    return;
  }

  const coderConfig = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'TEST' as const,
  };
  deps.sessionManager.createSession('coder', coderConfig.projectId, featureId, 'TEST');
  for await (const coderEvent of deps.agentSpawner.spawn(coderConfig)) {
    yield coderEvent;
  }
}
