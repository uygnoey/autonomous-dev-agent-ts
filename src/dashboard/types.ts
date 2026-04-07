/**
 * 대시보드 타입 정의 / Dashboard type definitions
 *
 * @description
 * KR: 실시간 모니터링 대시보드의 WebSocket 메시지, 상태 스냅샷, 설정 타입.
 * EN: WebSocket message types, state snapshots, and configuration for the real-time monitoring dashboard.
 */

import type { MetricsEvent } from 'core/metrics.js';
import type { AgentName, FeatureStatus, Phase } from 'core/types.js';

// ── 대시보드 설정 / Dashboard Configuration ───────────────────

/**
 * 대시보드 서버 설정 / Dashboard server configuration
 */
export interface DashboardConfig {
  /** HTTP 서버 포트 / HTTP server port */
  readonly port: number;
  /** 호스트 바인딩 주소 / Host binding address */
  readonly host: string;
}

/** 기본 대시보드 설정 / Default dashboard configuration */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  port: 3100,
  host: '127.0.0.1',
};

// ── WebSocket 메시지 타입 / WebSocket Message Types ───────────

/**
 * 서버→클라이언트 WebSocket 메시지 유형 / Server-to-client message types
 */
export type WsMessageType =
  | 'snapshot'
  | 'phase_change'
  | 'agent_update'
  | 'metric'
  | 'feature_update'
  | 'bias_alert';

/**
 * WebSocket 메시지 래퍼 / WebSocket message wrapper
 */
export interface WsMessage<T = unknown> {
  readonly type: WsMessageType;
  readonly timestamp: string;
  readonly data: T;
}

// ── 에이전트 상태 / Agent State ───────────────────────────────

/**
 * 에이전트 실행 상태 / Agent runtime state
 */
export type AgentState = 'idle' | 'running' | 'completed' | 'failed';

/**
 * 에이전트 상태 정보 / Agent status info
 */
export interface AgentStatus {
  readonly name: AgentName;
  readonly state: AgentState;
  readonly currentPhase: Phase | null;
  readonly lastActivity: string | null;
}

// ── 기능 진행 상태 / Feature Progress ─────────────────────────

/**
 * 기능 진행 요약 / Feature progress summary
 */
export interface FeatureProgressSummary {
  readonly featureId: string;
  readonly status: FeatureStatus;
  readonly currentPhase: Phase;
  readonly completedPhases: readonly Phase[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

// ── 전체 스냅샷 / Full Snapshot ───────────────────────────────

/**
 * 대시보드 전체 상태 스냅샷 / Full dashboard state snapshot
 *
 * @description
 * KR: 클라이언트 접속 시 전송되는 초기 상태. 이후 개별 업데이트 메시지로 갱신.
 * EN: Initial state sent on client connection. Subsequent updates sent as individual messages.
 */
export interface DashboardSnapshot {
  readonly currentPhase: Phase;
  readonly agents: readonly AgentStatus[];
  readonly features: readonly FeatureProgressSummary[];
  readonly recentMetrics: readonly MetricsEvent[];
  readonly phaseHistory: readonly PhaseHistoryEntry[];
  readonly tokenUsage: TokenUsageSummary;
}

/**
 * Phase 전환 히스토리 항목 / Phase transition history entry
 */
export interface PhaseHistoryEntry {
  readonly from: Phase;
  readonly to: Phase;
  readonly reason: string;
  readonly triggeredBy: AgentName | 'adev';
  readonly timestamp: string;
  readonly durationMs: number | null;
}

/**
 * 토큰 사용량 요약 / Token usage summary
 */
export interface TokenUsageSummary {
  readonly remainingPct: number;
  readonly isThrottled: boolean;
  readonly isPaused: boolean;
}
