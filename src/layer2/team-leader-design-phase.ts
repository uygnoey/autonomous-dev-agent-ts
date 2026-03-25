/**
 * DESIGN Phase 전용 실행 / DESIGN Phase Execution
 *
 * @description
 * KR: TeamLeader의 DESIGN Phase를 Agent Teams + Hook/IPC 모니터링과 함께 실행한다.
 * EN: Executes TeamLeader's DESIGN Phase with Agent Teams + Hook/IPC monitoring.
 */

import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { IpcPoller } from 'layer2/ipc-poller.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { AgentEvent } from 'layer2/types.js';
import type { V2SessionExecutor } from 'layer2/v2-session-executor.js';
import type { RagSearcher } from 'rag/search.js';
import { createEvent, queryRagContext } from 'layer2/team-leader-helpers.js';

/** TeamDelete 안정화 대기 횟수 / TeamDelete settle attempts */
const TEAM_DELETE_SETTLE_ATTEMPTS = 3;
/** TeamDelete 안정화 대기 간격 (ms) / TeamDelete settle interval */
const TEAM_DELETE_SETTLE_INTERVAL_MS = 300;
/** 파일 시스템 동기화 추가 대기 (ms) / FS sync delay */
const FS_SYNC_DELAY_MS = 200;

/** executeDesignPhaseWithMonitoring에 필요한 의존성 */
export interface ExecuteDesignPhaseDeps {
  readonly sessionExecutor: V2SessionExecutor;
  readonly streamMonitor: StreamMonitor;
  readonly ipcPoller: IpcPoller;
  readonly agentGenerator: AgentGenerator;
  readonly logger: Logger;
  readonly ragSearcher?: RagSearcher;
  /** 모니터링 감지 주기 (ms, 기본 5000) / Monitoring detection interval */
  readonly monitorIntervalMs?: number;
}

/**
 * DESIGN Phase를 Agent Teams + Hook/IPC 모니터링과 함께 실행한다
 *
 * @description
 * KR: session.stream() 1개 + Agent Teams env로 architect/qa/coder/reviewer가 teammate로 실시간 토론한다.
 *     StreamMonitor + IpcPoller로 이상 감지 시 AbortController로 세션 중단 후 재spawn한다.
 * EN: Runs a single session.stream() with Agent Teams env for real-time discussion among
 *     architect/qa/coder/reviewer. StreamMonitor + IpcPoller detect anomalies and abort+respawn.
 *
 * @param deps - DESIGN Phase 의존성 / DESIGN phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param maxRetries - 이상 감지 시 재시도 횟수 (기본 2) / Max retries on anomaly (default 2)
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeDesignPhaseWithMonitoring(
  deps: ExecuteDesignPhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  maxRetries = 2,
): AsyncGenerator<AgentEvent> {
  const ragContext = await queryRagContext(deps.ragSearcher, featureId, 'architect');

  const configResult = deps.agentGenerator.generateAgentConfig(
    'architect',
    handoffPackage.specDocument,
    featureId,
    ragContext,
  );

  if (!configResult.ok) {
    deps.logger.error('DESIGN Phase 에이전트 설정 생성 실패', {
      error: configResult.error.message,
    });
    yield createEvent('error', `DESIGN Phase 설정 생성 실패: ${configResult.error.message}`);
    return;
  }

  const config = {
    ...configResult.value,
    projectId: handoffPackage.projectId,
    phase: 'DESIGN' as const,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const abortController = new AbortController();

    // WHY: StreamMonitor가 주기적으로 이상 감지 → abort 신호 전송
    deps.streamMonitor.startMonitoring(abortController, deps.monitorIntervalMs);

    // WHY: IpcPoller로 디스크 IPC 폴링 — 팀 메시지/태스크 상태 변경 감시
    deps.ipcPoller.start((event) => {
      deps.logger.debug('DESIGN Phase IPC 이벤트 수신', {
        type: event.type,
        featureId,
      });
    });

    try {
      let aborted = false;

      for await (const event of deps.sessionExecutor.executeDesignPhase(config, {
        featureId,
        handoff: handoffPackage,
        signal: abortController.signal,
      })) {
        // WHY: 스트림 모니터에 이벤트 전달
        deps.streamMonitor.onEvent({
          type: event.type === 'tool_use' ? 'PreToolUse' : 'PostToolUse',
          agentName: event.agentName,
          toolName: event.type === 'tool_use' ? event.content : undefined,
          data: event.metadata ?? {},
          timestamp: event.timestamp,
        });

        yield event;

        // WHY: abort로 인한 에러 이벤트는 재spawn 시도
        if (event.type === 'error' && abortController.signal.aborted) {
          aborted = true;
          break;
        }
      }

      if (!aborted) {
        // WHY: 정상 완료 시 루프 탈출
        return;
      }

      // WHY: 이상 감지로 abort된 경우 재시도 전 경고
      if (attempt < maxRetries) {
        deps.logger.warn('DESIGN Phase 이상 감지 — 재spawn', {
          featureId,
          attempt: attempt + 1,
          maxRetries,
        });
        yield createEvent('message', `DESIGN Phase 이상 감지. 재시도 ${attempt + 1}/${maxRetries}`);
      }
    } finally {
      deps.streamMonitor.stopMonitoring();
      deps.ipcPoller.stop();
      // WHY: PI-008 — §16 TeamDelete race condition 완화 — N회 대기로 멤버 상태 안정화
      for (let i = 0; i < TEAM_DELETE_SETTLE_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, TEAM_DELETE_SETTLE_INTERVAL_MS));
        deps.logger.debug('TeamDelete race condition 대기', {
          attempt: i + 1,
          maxAttempts: TEAM_DELETE_SETTLE_ATTEMPTS,
        });
      }
      // WHY: PI-006 — 파일시스템 변경이 반영될 시간 추가 (race condition 완화)
      await new Promise((resolve) => setTimeout(resolve, FS_SYNC_DELAY_MS));
    }
  }

  // WHY: Agent Teams 비활성화 fallback — 재spawn 반복 실패 시 독립 세션으로 전환
  deps.logger.warn(
    'DESIGN Phase 재시도 횟수 초과 — Agent Teams 비활성화 후 독립 세션으로 fallback',
    {
      featureId,
      maxRetries,
    },
  );

  // WHY: Agent Teams 환경변수를 제거하여 독립 실행 전환
  const fallbackConfig = {
    ...config,
    phase: 'DESIGN' as const,
    environment: {},
  };

  try {
    for await (const event of deps.sessionExecutor.executeDesignPhase(fallbackConfig, {
      featureId,
      handoff: handoffPackage,
    })) {
      yield event;
    }
    // WHY: fallback 성공 시 에러 없이 종료
    return;
  } catch {
    // WHY: fallback도 실패하면 최종 에러 yield
    deps.logger.error('DESIGN Phase 독립 세션 fallback도 실패', { featureId, maxRetries });
  }

  // WHY: 모든 재시도 + fallback 실패 시 에러 이벤트
  deps.logger.error('DESIGN Phase 재시도 횟수 초과', { featureId, maxRetries });
  yield createEvent('error', `DESIGN Phase ${maxRetries}회 재시도 후에도 실패`);
}
