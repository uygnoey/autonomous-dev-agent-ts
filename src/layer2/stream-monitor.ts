/**
 * 스트림 모니터 / Stream Monitor
 *
 * @description
 * KR: 에이전트 스트림에서 발생하는 훅 이벤트(PreToolUse, PostToolUse, TeammateIdle)를
 *     수집하고, 이상 패턴을 탐지한다.
 * EN: Collects hook events (PreToolUse, PostToolUse, TeammateIdle) from agent streams
 *     and detects anomalous patterns.
 */

import type { Logger } from 'core/logger.js';
import type { AgentName, Result } from 'core/types.js';
import { ok } from 'core/types.js';
import type { BiasAlert, HookEvent } from 'layer2/types.js';

/**
 * 반복 도구 호출 임계값 / Repeated tool call threshold
 *
 * @description
 * KR: 같은 도구가 연속으로 이 횟수 이상 호출되면 이상으로 판단한다.
 * EN: If the same tool is called this many times consecutively, it's anomalous.
 */
const REPEATED_TOOL_THRESHOLD = 5;

/**
 * 유휴 시간 임계값 (밀리초) / Idle time threshold (milliseconds)
 *
 * @description
 * KR: TeammateIdle 이벤트가 이 시간 이상 지속되면 교착 상태로 의심한다.
 * EN: If TeammateIdle exceeds this duration, suspect deadlock.
 */
const IDLE_THRESHOLD_MS = 300_000;

/**
 * 스트림 모니터 / Stream Monitor
 *
 * @description
 * KR: 에이전트 훅 이벤트를 수집하고 이상 패턴을 감지한다.
 * EN: Collects agent hook events and detects anomalous patterns.
 *
 * @example
 * const monitor = new StreamMonitor(logger);
 * monitor.onEvent(hookEvent);
 * const alerts = monitor.detectAnomalies();
 */
export class StreamMonitor {
  /** 최대 이벤트 보관 수 / Maximum events to retain */
  private readonly MAX_EVENTS = 1000;
  private readonly events: HookEvent[] = [];
  private readonly logger: Logger;
  /** 실시간 모니터링 타이머 핸들 / Real-time monitoring timer handle */
  private monitorTimerId: ReturnType<typeof setInterval> | null = null;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'stream-monitor' });
  }

  /**
   * 훅 이벤트를 기록한다 / Records a hook event
   *
   * @param event - 훅 이벤트 / Hook event
   * @returns 항상 ok / Always ok
   */
  onEvent(event: HookEvent): Result<void> {
    this.events.push(event);
    // WHY: circular buffer — 오래된 이벤트를 제거하여 메모리 누수 방지
    if (this.events.length > this.MAX_EVENTS) {
      this.events.splice(0, this.events.length - this.MAX_EVENTS);
    }
    this.logger.debug('훅 이벤트 기록', {
      type: event.type,
      agent: event.agentName,
      tool: event.toolName,
    });
    return ok(undefined);
  }

  /**
   * 이상 패턴을 탐지한다 / Detects anomalous patterns
   *
   * @description
   * KR: 반복 도구 호출, 장기 유휴 상태를 감지한다.
   * EN: Detects repeated tool calls and prolonged idle states.
   *
   * @returns 감지된 편향 알림 배열 / Detected bias alerts
   */
  detectAnomalies(): BiasAlert[] {
    const alerts: BiasAlert[] = [];

    alerts.push(...this.detectRepeatedToolCalls());
    alerts.push(...this.detectLongIdle());

    if (alerts.length > 0) {
      this.logger.warn('이상 패턴 감지', { alertCount: alerts.length });
    }

    return alerts;
  }

  /**
   * 세션 스트림과 연결하여 실시간 모니터링을 시작한다
   *
   * @description
   * KR: 주기적으로 detectAnomalies()를 호출하고 이상 감지 시 AbortController로
   *     세션 중단 신호를 전송한다. stop()으로 모니터링을 중단할 수 있다.
   * EN: Periodically calls detectAnomalies() and aborts the session via AbortController
   *     when anomalies are detected. Call stop() to stop monitoring.
   *
   * @param controller - 이상 감지 시 abort 신호를 보낼 AbortController / AbortController for session abort
   * @param intervalMs - 감지 주기 (기본 5000ms) / Detection interval (default 5000ms)
   */
  startMonitoring(controller: AbortController, intervalMs = 5_000): void {
    if (this.monitorTimerId !== null) {
      this.logger.warn('StreamMonitor already monitoring — startMonitoring() ignored');
      return;
    }

    this.logger.info('StreamMonitor 실시간 모니터링 시작', { intervalMs });

    this.monitorTimerId = setInterval(() => {
      const alerts = this.detectAnomalies();
      const highAlerts = alerts.filter((a) => a.severity === 'high');

      if (highAlerts.length > 0) {
        this.logger.warn('HIGH 이상 패턴 감지 — 세션 중단 신호 전송', {
          alertCount: highAlerts.length,
          alerts: highAlerts.map((a) => ({
            type: a.type,
            agent: a.agentName,
            description: a.description,
          })),
        });
        controller.abort();
        this.stopMonitoring();
      }
    }, intervalMs);
  }

  /**
   * 실시간 모니터링을 중단한다 / Stops real-time monitoring
   */
  stopMonitoring(): void {
    if (this.monitorTimerId === null) return;
    clearInterval(this.monitorTimerId);
    this.monitorTimerId = null;
    this.logger.info('StreamMonitor 모니터링 중단');
  }

  /**
   * 모니터링이 실행 중인지 반환 / Whether monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitorTimerId !== null;
  }

  /**
   * 에이전트별 이벤트 이력을 반환한다 / Returns event history per agent
   *
   * @param agentName - 에이전트 이름 (선택. 없으면 전체) / Agent name (optional. All if omitted)
   * @returns 훅 이벤트 배열 / Hook event array
   */
  getEventHistory(agentName?: AgentName): HookEvent[] {
    if (agentName) {
      return this.events.filter((e) => e.agentName === agentName);
    }
    return [...this.events];
  }

  /**
   * 반복 도구 호출을 탐지한다 / Detects repeated tool calls
   *
   * @returns 반복 호출 관련 알림 배열 / Repeated call alerts
   */
  private detectRepeatedToolCalls(): BiasAlert[] {
    const alerts: BiasAlert[] = [];
    const toolEvents = this.events.filter((e) => e.type === 'PreToolUse' && e.toolName);

    // WHY: 에이전트별로 그룹화하여 분석한다
    const byAgent = new Map<AgentName, HookEvent[]>();
    for (const event of toolEvents) {
      const existing = byAgent.get(event.agentName) ?? [];
      existing.push(event);
      byAgent.set(event.agentName, existing);
    }

    for (const [agentName, agentEvents] of byAgent) {
      let consecutiveCount = 1;
      for (let i = 1; i < agentEvents.length; i++) {
        if (agentEvents[i]?.toolName === agentEvents[i - 1]?.toolName) {
          consecutiveCount += 1;
          if (consecutiveCount >= REPEATED_TOOL_THRESHOLD) {
            alerts.push({
              type: 'infinite_loop',
              agentName,
              description: `같은 도구 '${agentEvents[i]?.toolName}'가 ${consecutiveCount}회 연속 호출됨`,
              evidence: `도구: ${agentEvents[i]?.toolName}, 연속 ${consecutiveCount}회`,
              severity: consecutiveCount >= REPEATED_TOOL_THRESHOLD * 2 ? 'high' : 'medium',
              timestamp: new Date(),
            });
            break;
          }
        } else {
          consecutiveCount = 1;
        }
      }
    }

    return alerts;
  }

  /**
   * 장기 유휴 상태를 탐지한다 / Detects prolonged idle states
   *
   * @returns 유휴 관련 알림 배열 / Idle state alerts
   */
  private detectLongIdle(): BiasAlert[] {
    const alerts: BiasAlert[] = [];
    const idleEvents = this.events.filter((e) => e.type === 'TeammateIdle');

    for (const event of idleEvents) {
      const lastActivity = this.getLastActivityTime(event.agentName, event.timestamp);
      if (lastActivity) {
        const idleDuration = event.timestamp.getTime() - lastActivity.getTime();
        if (idleDuration >= IDLE_THRESHOLD_MS) {
          alerts.push({
            type: 'deadlock',
            agentName: event.agentName,
            description: `에이전트 '${event.agentName}'가 ${Math.round(idleDuration / 1000)}초 동안 유휴 상태`,
            evidence: `마지막 활동: ${lastActivity.toISOString()}, 유휴 시작: ${event.timestamp.toISOString()}`,
            severity: idleDuration >= IDLE_THRESHOLD_MS * 2 ? 'high' : 'medium',
            timestamp: new Date(),
          });
        }
      }
    }

    return alerts;
  }

  /**
   * 에이전트의 마지막 활동 시각을 조회한다 / Gets last activity time for an agent
   *
   * @param agentName - 에이전트 이름 / Agent name
   * @param beforeTimestamp - 이 시각 이전의 마지막 활동 / Last activity before this timestamp
   * @returns 마지막 활동 시각 또는 null / Last activity time or null
   */
  private getLastActivityTime(agentName: AgentName, beforeTimestamp: Date): Date | null {
    const agentEvents = this.events.filter(
      (e) =>
        e.agentName === agentName &&
        e.type !== 'TeammateIdle' &&
        e.timestamp.getTime() < beforeTimestamp.getTime(),
    );

    if (agentEvents.length === 0) return null;
    const lastEvent = agentEvents[agentEvents.length - 1];
    return lastEvent?.timestamp ?? null;
  }
}
