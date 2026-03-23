/**
 * 병렬 Coder 감독 실행기 / Parallel Coder Supervision Runner
 *
 * @description
 * KR: coder 병렬 실행 완료 후 architect(스펙 준수 검토)와 reviewer(코드 품질 검토)를
 *     별도 세션으로 순차 실행한다. 감독 결과를 분석하여 합격/불합격을 판정하고,
 *     불합격 시 피드백과 함께 결과를 반환한다.
 * EN: After parallel coder execution, runs architect (spec compliance) and reviewer
 *     (code quality) in separate sessions sequentially. Analyzes supervision results
 *     for pass/fail and returns feedback on failure.
 */

import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { ParallelCoderRunnerDeps } from 'layer2/parallel-coder-runner-types.js';
import { createEvent } from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';

// ── 감독 결과 타입 / Supervision Result Type ──────────────────────

/**
 * 감독 판정 결과 / Supervision verdict
 *
 * @description
 * KR: architect/reviewer의 감독 세션에서 생성된 판정 결과.
 * EN: Verdict produced by architect/reviewer supervision session.
 */
export interface SupervisionVerdict {
  /** 감독 에이전트 이름 / Supervisor agent name */
  readonly agentName: 'architect' | 'reviewer';
  /** 합격 여부 / Whether passed */
  readonly passed: boolean;
  /** 피드백 내용 / Feedback content */
  readonly feedback: string;
  /** 수집된 이벤트 / Collected events */
  readonly events: readonly AgentEvent[];
}

/**
 * 전체 감독 결과 / Overall supervision result
 *
 * @description
 * KR: architect + reviewer 감독 결과를 집계한 최종 결과.
 * EN: Aggregated result from architect + reviewer supervision.
 */
export interface SupervisionResult {
  /** 전체 합격 여부 (architect + reviewer 모두 통과해야 합격) / Overall pass */
  readonly passed: boolean;
  /** 개별 판정 결과 / Individual verdicts */
  readonly verdicts: readonly SupervisionVerdict[];
}

// ── 감독 결과 키워드 / Verdict Keywords ───────────────────────────

/** 불합격 키워드 / Failure keywords */
const FAIL_KEYWORDS = ['FAIL', 'REJECT', '불합격', '거부', '재작업', 'REWORK'] as const;

/** 합격 키워드 / Pass keywords */
const PASS_KEYWORDS = ['PASS', 'APPROVE', '합격', '승인', 'LGTM'] as const;

// ── 공개 함수 / Public Functions ────────────────────────────────

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
  const result = await runSupervisionWithVerdict(featureId, handoffPackage, deps, logger);

  // WHY: 수집된 이벤트를 상위로 전달
  for (const verdict of result.verdicts) {
    for (const event of verdict.events) {
      yield event;
    }
  }

  if (!result.passed) {
    const failedNames = result.verdicts
      .filter((v) => !v.passed)
      .map((v) => v.agentName)
      .join(', ');

    const feedbacks = result.verdicts
      .filter((v) => !v.passed)
      .map((v) => `[${v.agentName}] ${v.feedback}`)
      .join('\n');

    logger.warn('CODE Phase 감독 불합격', { featureId, failedNames });
    yield createEvent('message', `CODE Phase 감독 불합격 (${failedNames})\n${feedbacks}`);
  } else {
    logger.info('CODE Phase 감독 합격', { featureId });
    yield createEvent('message', 'CODE Phase architect/reviewer 감독 모두 합격');
  }
}

/**
 * 감독 세션을 실행하고 판정 결과를 반환한다 / Runs supervision and returns verdict
 *
 * @description
 * KR: architect(스펙 준수 확인) → reviewer(코드 품질 확인) 순서로 별도 세션을 실행하고,
 *     각 에이전트의 출력을 분석하여 합격/불합격 판정을 내린다.
 * EN: Runs architect (spec compliance) → reviewer (code quality) in separate sessions,
 *     analyzes each agent's output to determine pass/fail verdict.
 *
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param deps - 의존성 / Dependencies
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 감독 결과 / Supervision result
 */
export async function runSupervisionWithVerdict(
  featureId: string,
  handoffPackage: HandoffPackage,
  deps: ParallelCoderRunnerDeps,
  logger: Logger,
): Promise<SupervisionResult> {
  const supervisors: readonly ('architect' | 'reviewer')[] = ['architect', 'reviewer'];
  const verdicts: SupervisionVerdict[] = [];

  for (const agentName of supervisors) {
    const verdict = await runSingleSupervision(
      agentName,
      featureId,
      handoffPackage,
      deps,
      logger,
    );
    verdicts.push(verdict);
  }

  return {
    passed: verdicts.every((v) => v.passed),
    verdicts,
  };
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

/**
 * 단일 감독 에이전트를 실행하고 판정 결과를 반환한다 / Runs a single supervisor
 *
 * @param agentName - 감독 에이전트 이름 / Supervisor agent name
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param deps - 의존성 / Dependencies
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 감독 판정 결과 / Supervision verdict
 */
async function runSingleSupervision(
  agentName: 'architect' | 'reviewer',
  featureId: string,
  handoffPackage: HandoffPackage,
  deps: ParallelCoderRunnerDeps,
  logger: Logger,
): Promise<SupervisionVerdict> {
  const configResult = deps.agentGenerator.generateAgentConfig(
    agentName,
    handoffPackage.specDocument,
    featureId,
  );

  if (!configResult.ok) {
    logger.warn('감독 에이전트 설정 생성 실패 — 감독 생략 (합격 처리)', {
      agent: agentName,
      featureId,
      error: configResult.error.message,
    });
    return {
      agentName,
      passed: true,
      feedback: `${agentName} 설정 생성 실패로 감독 생략`,
      events: [createEvent('message', `${agentName} 감독 설정 생성 실패 — 생략`)],
    };
  }

  const config = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'CODE' as const,
  };

  deps.sessionManager.createSession(agentName, config.projectId, featureId, 'CODE');

  logger.info('CODE Phase 감독 세션 시작', { agent: agentName, featureId });

  const events: AgentEvent[] = [
    createEvent('message', `CODE Phase ${agentName} 감독 세션 시작`),
  ];

  for await (const event of deps.agentSpawner.spawn(config)) {
    // WHY: 스트림 모니터에 이벤트를 전달해 이상 패턴 감지 활성화
    deps.streamMonitor.onEvent({
      type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
      agentName: event.agentName,
      toolName: event.type === 'tool_use' ? event.content : undefined,
      data: event.metadata ?? {},
      timestamp: event.timestamp,
    });

    events.push(event);
  }

  events.push(createEvent('message', `CODE Phase ${agentName} 감독 세션 완료`));
  logger.info('CODE Phase 감독 세션 완료', { agent: agentName, featureId });

  // WHY: 에이전트 출력에서 합격/불합격 판정을 추출
  const verdict = analyzeSupervisionOutput(agentName, events);
  logger.info('감독 판정 결과', {
    agent: agentName,
    featureId,
    passed: verdict.passed,
  });

  return verdict;
}

/**
 * 감독 에이전트 출력을 분석하여 합격/불합격을 판정한다 / Analyzes supervisor output for verdict
 *
 * @description
 * KR: 에이전트의 message 이벤트에서 합격/불합격 키워드를 탐색한다.
 *     불합격 키워드가 발견되면 불합격, 합격 키워드가 발견되면 합격.
 *     어떤 키워드도 없으면 기본 합격으로 처리한다 (감독은 명시적 거부가 핵심).
 * EN: Searches message events for pass/fail keywords.
 *     Fail keywords → fail, Pass keywords → pass.
 *     No keywords → default pass (supervision focuses on explicit rejection).
 *
 * @param agentName - 감독 에이전트 이름 / Supervisor agent name
 * @param events - 수집된 이벤트 / Collected events
 * @returns 감독 판정 결과 / Supervision verdict
 */
export function analyzeSupervisionOutput(
  agentName: 'architect' | 'reviewer',
  events: readonly AgentEvent[],
): SupervisionVerdict {
  const messageEvents = events.filter(
    (e) => e.type === 'message' || e.type === 'done',
  );
  const allText = messageEvents.map((e) => e.content).join('\n');
  const upperText = allText.toUpperCase();

  // WHY: 불합격 키워드를 먼저 확인 — 명시적 거부가 합격보다 우선
  const hasFailKeyword = FAIL_KEYWORDS.some((kw) => upperText.includes(kw));
  const hasPassKeyword = PASS_KEYWORDS.some((kw) => upperText.includes(kw));

  if (hasFailKeyword) {
    // WHY: 불합격 시 마지막 message 이벤트를 피드백으로 사용
    const lastMessage = messageEvents.findLast(
      (e) => e.type === 'message' && e.agentName === agentName,
    );
    return {
      agentName,
      passed: false,
      feedback: lastMessage?.content ?? '감독 불합격 (상세 피드백 없음)',
      events,
    };
  }

  if (hasPassKeyword) {
    return {
      agentName,
      passed: true,
      feedback: `${agentName} 감독 합격`,
      events,
    };
  }

  // WHY: 명시적 판정 키워드 없으면 기본 합격 — 감독 에이전트가 문제를 발견하지 못한 것으로 간주
  return {
    agentName,
    passed: true,
    feedback: `${agentName} 감독 완료 (명시적 판정 없음 → 합격 처리)`,
    events,
  };
}
