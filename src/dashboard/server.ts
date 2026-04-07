/**
 * 대시보드 서버 / Dashboard Server
 *
 * @description
 * KR: Bun HTTP + WebSocket 서버. 정적 대시보드 UI를 제공하고
 *     실시간 메트릭스/상태를 WebSocket으로 브로드캐스트한다.
 * EN: Bun HTTP + WebSocket server. Serves static dashboard UI
 *     and broadcasts real-time metrics/state via WebSocket.
 */

import type { ServerWebSocket } from 'bun';
import type { Logger } from 'core/logger.js';
import type { MetricsEvent } from 'core/metrics.js';
import type { AgentName, Phase } from 'core/types.js';
import type { MetricsBridge } from './metrics-bridge.js';
import type {
  AgentStatus,
  DashboardConfig,
  DashboardSnapshot,
  FeatureProgressSummary,
  PhaseHistoryEntry,
  TokenUsageSummary,
  WsMessage,
} from './types.js';
import { getDashboardHtml } from './ui.js';

/** WebSocket 클라이언트 데이터 / Client data attached to each WebSocket */
interface WsClientData {
  readonly connectedAt: string;
}

/**
 * 대시보드 서버 / Dashboard server
 *
 * @description
 * KR: Bun.serve()로 HTTP + WebSocket 서버를 운영한다.
 *     MetricsBridge에서 이벤트를 구독하여 연결된 모든 클라이언트에 브로드캐스트한다.
 * EN: Runs a Bun.serve() HTTP + WebSocket server.
 *     Subscribes to MetricsBridge events and broadcasts to all connected clients.
 */
export class DashboardServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private readonly clients: Set<ServerWebSocket<WsClientData>> = new Set();
  private readonly logger: Logger;
  private unsubscribeMetrics: (() => void) | null = null;

  // WHY: 대시보드 상태를 서버 측에서 유지하여 신규 클라이언트에 스냅샷 전송
  private currentPhase: Phase = 'DESIGN';
  private readonly agents: Map<AgentName, AgentStatus> = new Map();
  private readonly features: Map<string, FeatureProgressSummary> = new Map();
  private readonly phaseHistory: PhaseHistoryEntry[] = [];
  private tokenUsage: TokenUsageSummary = {
    remainingPct: 100,
    isThrottled: false,
    isPaused: false,
  };

  /**
   * @param config - 서버 설정 / Server configuration
   * @param metricsBridge - 메트릭스 브리지 / Metrics bridge for event subscription
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(
    private readonly config: DashboardConfig,
    private readonly metricsBridge: MetricsBridge,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: 'dashboard-server' });
  }

  /**
   * 서버를 시작한다 / Start the dashboard server
   *
   * @returns 서버 URL / Server URL
   */
  start(): string {
    const dashboardHtml = getDashboardHtml();

    this.server = Bun.serve<WsClientData>({
      port: this.config.port,
      hostname: this.config.host,

      fetch: (req, server) => {
        const url = new URL(req.url);

        // WHY: WebSocket 업그레이드 요청 처리
        if (url.pathname === '/ws') {
          const upgraded = server.upgrade(req, {
            data: { connectedAt: new Date().toISOString() },
          });
          if (upgraded) return undefined;
          return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // WHY: /api/snapshot으로 REST 폴백 제공
        if (url.pathname === '/api/snapshot') {
          return Response.json(this.buildSnapshot());
        }

        // WHY: 정적 HTML 대시보드 제공
        return new Response(dashboardHtml, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },

      websocket: {
        open: (ws) => {
          this.clients.add(ws);
          this.logger.info('WebSocket 클라이언트 연결', {
            clientCount: this.clients.size,
          });

          // WHY: 연결 즉시 전체 스냅샷 전송
          const snapshot: WsMessage<DashboardSnapshot> = {
            type: 'snapshot',
            timestamp: new Date().toISOString(),
            data: this.buildSnapshot(),
          };
          ws.sendText(JSON.stringify(snapshot));
        },

        close: (ws) => {
          this.clients.delete(ws);
          this.logger.debug('WebSocket 클라이언트 연결 해제', {
            clientCount: this.clients.size,
          });
        },

        message: (_ws, _message) => {
          // WHY: 클라이언트→서버 메시지는 현재 사용하지 않음 (단방향 브로드캐스트)
        },
      },
    });

    // WHY: MetricsBridge에서 이벤트를 구독하여 상태 갱신 + 클라이언트 브로드캐스트
    this.unsubscribeMetrics = this.metricsBridge.subscribe((message) => {
      this.handleMetricsEvent(message.data);
      this.broadcast(message);
    });

    const url = `http://${this.config.host}:${this.config.port}`;
    this.logger.info('대시보드 서버 시작', { url });
    return url;
  }

  /**
   * 서버를 중지한다 / Stop the dashboard server
   */
  stop(): void {
    if (this.unsubscribeMetrics) {
      this.unsubscribeMetrics();
      this.unsubscribeMetrics = null;
    }

    for (const client of this.clients) {
      client.close(1000, 'Server shutting down');
    }
    this.clients.clear();

    if (this.server) {
      this.server.stop();
      this.server = null;
    }

    this.logger.info('대시보드 서버 중지');
  }

  /**
   * Phase 변경을 수동으로 알린다 / Manually notify a phase change
   *
   * @param entry - Phase 히스토리 항목 / Phase history entry
   */
  notifyPhaseChange(entry: PhaseHistoryEntry): void {
    this.currentPhase = entry.to;
    this.phaseHistory.push(entry);

    this.broadcast({
      type: 'phase_change',
      timestamp: entry.timestamp,
      data: entry,
    });
  }

  /**
   * 에이전트 상태를 수동으로 갱신한다 / Manually update agent status
   *
   * @param status - 에이전트 상태 / Agent status
   */
  notifyAgentUpdate(status: AgentStatus): void {
    this.agents.set(status.name, status);

    this.broadcast({
      type: 'agent_update',
      timestamp: new Date().toISOString(),
      data: status,
    });
  }

  /**
   * 기능 진행 상태를 수동으로 갱신한다 / Manually update feature progress
   *
   * @param feature - 기능 진행 요약 / Feature progress summary
   */
  notifyFeatureUpdate(feature: FeatureProgressSummary): void {
    this.features.set(feature.featureId, feature);

    this.broadcast({
      type: 'feature_update',
      timestamp: feature.updatedAt,
      data: feature,
    });
  }

  /**
   * 전체 상태 스냅샷을 구성한다 / Build full state snapshot
   */
  private buildSnapshot(): DashboardSnapshot {
    return {
      currentPhase: this.currentPhase,
      agents: [...this.agents.values()],
      features: [...this.features.values()],
      recentMetrics: this.metricsBridge.getRecentMetrics(),
      phaseHistory: [...this.phaseHistory],
      tokenUsage: this.tokenUsage,
    };
  }

  /**
   * 메트릭스 이벤트로 내부 상태를 갱신한다 / Update internal state from metrics event
   */
  private handleMetricsEvent(event: MetricsEvent): void {
    switch (event.name) {
      case 'phase_transition': {
        const to = event.labels.to;
        if (typeof to === 'string') {
          this.currentPhase = to as Phase;
        }
        break;
      }
      case 'token_throttle': {
        const remainingPct = event.value;
        this.tokenUsage = {
          remainingPct,
          isThrottled: remainingPct <= 20,
          isPaused: remainingPct <= 5,
        };
        break;
      }
      case 'agent_spawn': {
        const agentName = event.labels.agent_name;
        if (typeof agentName === 'string') {
          this.agents.set(agentName as AgentName, {
            name: agentName as AgentName,
            state: 'running',
            currentPhase: this.currentPhase,
            lastActivity: event.timestamp,
          });
        }
        break;
      }
      case 'agent_complete': {
        const name = event.labels.agent_name;
        const exitCode = event.labels.exit_code;
        if (typeof name === 'string') {
          this.agents.set(name as AgentName, {
            name: name as AgentName,
            state: exitCode === 0 ? 'completed' : 'failed',
            currentPhase: this.currentPhase,
            lastActivity: event.timestamp,
          });
        }
        break;
      }
    }
  }

  /**
   * 모든 연결된 클라이언트에 메시지를 브로드캐스트한다 / Broadcast message to all clients
   */
  private broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.sendText(payload);
      } catch {
        // WHY: 전송 실패한 클라이언트는 close 이벤트에서 정리됨
        this.clients.delete(client);
      }
    }
  }
}
