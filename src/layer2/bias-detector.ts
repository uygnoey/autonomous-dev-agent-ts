/**
 * 편향 감지기 / Bias Detector
 *
 * @description
 * KR: 에이전트 동작에서 확인 편향, 무한 루프, 교착 상태, 범위 이탈을 감지한다.
 * EN: Detects confirmation bias, infinite loops, deadlocks, and scope creep in agent behavior.
 */

import type { Logger } from '../core/logger.js';
import type { AgentName, Result } from '../core/types.js';
import { ok } from '../core/types.js';
import type { BiasAlert, BiasSeverity, HookEvent } from './types.js';

/**
 * 확인 편향 임계값: 같은 쿼리 반복 횟수 / Confirmation bias threshold: same query repetition count
 */
const CONFIRMATION_BIAS_THRESHOLD = 3;

/**
 * 무한 루프 임계값: 같은 도구 시퀀스 반복 횟수 / Infinite loop threshold: same tool sequence repetition
 */
const INFINITE_LOOP_THRESHOLD = 3;

/**
 * 교착 상태 임계값: 진행 없는 이벤트 수 / Deadlock threshold: events without progress
 */
const DEADLOCK_EVENT_THRESHOLD = 20;

/**
 * 범위 이탈 임계값: 예상 밖 도구 사용 비율 / Scope creep threshold: unexpected tool usage ratio
 */
const SCOPE_CREEP_THRESHOLD = 0.3;

/**
 * 편향 감지기 / Bias Detector
 *
 * @description
 * KR: 훅 이벤트 스트림을 분석하여 에이전트의 비정상 동작 패턴을 감지한다.
 * EN: Analyzes hook event streams to detect anomalous agent behavior patterns.
 *
 * @example
 * const detector = new BiasDetector(logger);
 * const result = detector.analyze(events, 'coder');
 */
export class BiasDetector {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'bias-detector' });
  }

  /**
   * 이벤트 스트림을 분석하여 편향을 감지한다 / Analyzes event stream for biases
   *
   * @param events - 훅 이벤트 배열 / Hook event array
   * @param agentName - 분석 대상 에이전트 / Target agent to analyze
   * @returns 감지된 편향 알림 배열 / Detected bias alerts
   */
  analyze(events: HookEvent[], agentName: AgentName): Result<BiasAlert[]> {
    const agentEvents = events.filter((e) => e.agentName === agentName);
    const alerts: BiasAlert[] = [];

    alerts.push(...this.detectConfirmationBias(agentEvents, agentName));
    alerts.push(...this.detectInfiniteLoop(agentEvents, agentName));
    alerts.push(...this.detectDeadlock(agentEvents, agentName));
    alerts.push(...this.detectScopeCreep(agentEvents, agentName));

    if (alerts.length > 0) {
      this.logger.warn('편향 감지 완료', { agentName, alertCount: alerts.length });
    }

    return ok(alerts);
  }

  /**
   * 알림 목록의 전체 심각도를 평가한다 / Evaluates overall severity of alerts
   *
   * @param alerts - 편향 알림 배열 / Bias alert array
   * @returns 전체 심각도 / Overall severity
   */
  getSeverity(alerts: BiasAlert[]): 'none' | 'low' | 'medium' | 'high' {
    if (alerts.length === 0) return 'none';
    if (alerts.some((a) => a.severity === 'high')) return 'high';
    if (alerts.some((a) => a.severity === 'medium')) return 'medium';
    return 'low';
  }

  /**
   * 확인 편향을 감지한다 / Detects confirmation bias
   *
   * @description
   * KR: 같은 도구를 같은 데이터로 반복 호출하는 패턴을 감지한다.
   * EN: Detects pattern of calling the same tool with the same data repeatedly.
   *
   * @param events - 에이전트 이벤트 배열 / Agent events
   * @param agentName - 에이전트 이름 / Agent name
   * @returns 확인 편향 알림 배열 / Confirmation bias alerts
   */
  private detectConfirmationBias(events: HookEvent[], agentName: AgentName): BiasAlert[] {
    const alerts: BiasAlert[] = [];
    const querySignatures = new Map<string, number>();

    for (const event of events) {
      if (event.type === 'PreToolUse') {
        const signature = `${event.toolName ?? ''}:${JSON.stringify(event.data)}`;
        const count = (querySignatures.get(signature) ?? 0) + 1;
        querySignatures.set(signature, count);

        if (count === CONFIRMATION_BIAS_THRESHOLD) {
          alerts.push({
            type: 'confirmation_bias',
            agentName,
            description: `같은 쿼리가 ${count}회 반복됨`,
            evidence: `시그니처: ${signature.slice(0, 100)}`,
            severity: this.calculateSeverity(count, CONFIRMATION_BIAS_THRESHOLD),
            timestamp: new Date(),
          });
        }
      }
    }

    return alerts;
  }

  /**
   * 무한 루프를 감지한다 / Detects infinite loops
   *
   * @description
   * KR: 같은 도구 호출 시퀀스가 반복되는 패턴을 감지한다.
   * EN: Detects repeating tool call sequence patterns.
   *
   * @param events - 에이전트 이벤트 배열 / Agent events
   * @param agentName - 에이전트 이름 / Agent name
   * @returns 무한 루프 알림 배열 / Infinite loop alerts
   */
  private detectInfiniteLoop(events: HookEvent[], agentName: AgentName): BiasAlert[] {
    const alerts: BiasAlert[] = [];
    const toolSequence = events
      .filter((e) => e.type === 'PreToolUse')
      .map((e) => e.toolName ?? 'unknown');

    // WHY: 길이 2~5의 패턴을 검색하여 반복되는 시퀀스를 찾는다
    for (let patternLen = 2; patternLen <= 5; patternLen++) {
      if (toolSequence.length < patternLen * INFINITE_LOOP_THRESHOLD) continue;

      for (let i = 0; i <= toolSequence.length - patternLen * INFINITE_LOOP_THRESHOLD; i++) {
        const pattern = toolSequence.slice(i, i + patternLen).join(',');
        let repeatCount = 1;

        for (let j = i + patternLen; j <= toolSequence.length - patternLen; j += patternLen) {
          const segment = toolSequence.slice(j, j + patternLen).join(',');
          if (segment === pattern) {
            repeatCount += 1;
          } else {
            break;
          }
        }

        if (repeatCount >= INFINITE_LOOP_THRESHOLD) {
          alerts.push({
            type: 'infinite_loop',
            agentName,
            description: `도구 시퀀스 [${pattern}]가 ${repeatCount}회 반복됨`,
            evidence: `패턴 길이: ${patternLen}, 반복: ${repeatCount}회`,
            severity: this.calculateSeverity(repeatCount, INFINITE_LOOP_THRESHOLD),
            timestamp: new Date(),
          });
          return alerts;
        }
      }
    }

    return alerts;
  }

  /**
   * 교착 상태를 감지한다 / Detects deadlock
   *
   * @description
   * KR: 도구 결과 없이 도구 호출만 반복되는 패턴을 감지한다.
   * EN: Detects pattern of tool calls without results (no progress).
   *
   * @param events - 에이전트 이벤트 배열 / Agent events
   * @param agentName - 에이전트 이름 / Agent name
   * @returns 교착 상태 알림 배열 / Deadlock alerts
   */
  private detectDeadlock(events: HookEvent[], agentName: AgentName): BiasAlert[] {
    const alerts: BiasAlert[] = [];

    // WHY: TeammateIdle이 연속으로 여러 번 발생하면 교착 상태로 의심
    let consecutiveIdle = 0;
    for (const event of events) {
      if (event.type === 'TeammateIdle') {
        consecutiveIdle += 1;
      } else {
        consecutiveIdle = 0;
      }

      if (consecutiveIdle >= DEADLOCK_EVENT_THRESHOLD) {
        alerts.push({
          type: 'deadlock',
          agentName,
          description: `TeammateIdle이 ${consecutiveIdle}회 연속 발생`,
          evidence: `연속 유휴: ${consecutiveIdle}회`,
          severity: 'high',
          timestamp: new Date(),
        });
        break;
      }
    }

    return alerts;
  }

  /**
   * 범위 이탈을 감지한다 / Detects scope creep
   *
   * @description
   * KR: 에이전트 역할과 관련 없는 도구 사용 비율이 높으면 범위 이탈로 판단한다.
   * EN: High ratio of tool usage unrelated to agent role indicates scope creep.
   *
   * @param events - 에이전트 이벤트 배열 / Agent events
   * @param agentName - 에이전트 이름 / Agent name
   * @returns 범위 이탈 알림 배열 / Scope creep alerts
   */
  private detectScopeCreep(events: HookEvent[], agentName: AgentName): BiasAlert[] {
    const alerts: BiasAlert[] = [];
    const toolEvents = events.filter((e) => e.type === 'PreToolUse' && e.toolName);

    if (toolEvents.length === 0) return alerts;

    const uniqueTools = new Set(toolEvents.map((e) => e.toolName));

    // WHY: 다양한 도구를 지나치게 많이 사용하면 범위 이탈로 판단
    const toolDiversity = uniqueTools.size / toolEvents.length;
    if (toolDiversity > SCOPE_CREEP_THRESHOLD && uniqueTools.size > 5) {
      alerts.push({
        type: 'scope_creep',
        agentName,
        description: `도구 다양성이 높음: ${uniqueTools.size}개 도구 / ${toolEvents.length}회 호출`,
        evidence: `도구 다양성: ${(toolDiversity * 100).toFixed(1)}%`,
        severity: 'low',
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  /**
   * 반복 횟수 기반 심각도를 계산한다 / Calculates severity based on repetition count
   *
   * @param count - 실제 반복 횟수 / Actual count
   * @param threshold - 임계값 / Threshold
   * @returns 심각도 / Severity
   */
  private calculateSeverity(count: number, threshold: number): BiasSeverity {
    if (count >= threshold * 3) return 'high';
    if (count >= threshold * 2) return 'medium';
    return 'low';
  }
}
