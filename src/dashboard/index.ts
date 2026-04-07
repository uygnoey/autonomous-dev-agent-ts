/**
 * 대시보드 모듈 공개 API / Dashboard module public API
 *
 * @description
 * KR: 대시보드 서버, 메트릭스 브리지, 타입을 re-export한다.
 * EN: Re-exports dashboard server, metrics bridge, and types.
 */

export { DashboardServer } from './server.js';
export { MetricsBridge } from './metrics-bridge.js';
export type { MetricsListener } from './metrics-bridge.js';
export type {
  DashboardConfig,
  DashboardSnapshot,
  WsMessage,
  WsMessageType,
  AgentState,
  AgentStatus,
  FeatureProgressSummary,
  PhaseHistoryEntry,
  TokenUsageSummary,
} from './types.js';
export { DEFAULT_DASHBOARD_CONFIG } from './types.js';
