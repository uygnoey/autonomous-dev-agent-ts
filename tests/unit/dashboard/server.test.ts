import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DashboardServer } from 'dashboard/server.js';
import { MetricsBridge } from 'dashboard/metrics-bridge.js';
import { NoOpMetricsCollector, createMetricsEvent } from 'core/metrics.js';
import { ConsoleLogger } from 'core/logger.js';
import type { DashboardConfig } from 'dashboard/types.js';

const logger = new ConsoleLogger('error');

// WHY: 테스트마다 고유 포트 사용하여 포트 충돌 방지
// WHY: 랜덤 포트 범위 사용하여 다른 프로세스와 충돌 방지
let portCounter = 40000 + Math.floor(Math.random() * 10000);

function nextConfig(): DashboardConfig {
  return { port: portCounter++, host: '127.0.0.1' };
}

describe('DashboardServer', () => {
  let server: DashboardServer;
  let bridge: MetricsBridge;
  let config: DashboardConfig;

  beforeEach(() => {
    config = nextConfig();
    bridge = new MetricsBridge(new NoOpMetricsCollector(), logger);
    server = new DashboardServer(config, bridge, logger);
  });

  afterEach(() => {
    server.stop();
  });

  it('should start and return a URL', () => {
    const url = server.start();
    expect(url).toBe(`http://127.0.0.1:${config.port}`);
  });

  it('should serve HTML on GET /', async () => {
    server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('adev Dashboard');
  });

  it('should serve snapshot JSON on GET /api/snapshot', async () => {
    server.start();
    const res = await fetch(`http://127.0.0.1:${config.port}/api/snapshot`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('currentPhase');
    expect(data).toHaveProperty('agents');
    expect(data).toHaveProperty('features');
    expect(data).toHaveProperty('recentMetrics');
    expect(data).toHaveProperty('phaseHistory');
    expect(data).toHaveProperty('tokenUsage');
  });

  it('should accept WebSocket connections', async () => {
    server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${config.port}/ws`);

    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (ev) => resolve(typeof ev.data === 'string' ? ev.data : '');
      ws.onerror = () => reject(new Error('ws error'));
      setTimeout(() => reject(new Error('ws timeout')), 3000);
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe('snapshot');
    expect(parsed.data).toHaveProperty('currentPhase');

    ws.close();
  });

  it('should broadcast metrics to WebSocket clients', async () => {
    server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${config.port}/ws`);

    // WHY: 첫 메시지는 스냅샷, 두 번째가 메트릭스
    const messages: string[] = [];
    const secondMessage = new Promise<string>((resolve, reject) => {
      ws.onmessage = (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : '';
        messages.push(data);
        if (messages.length === 2) resolve(data);
      };
      ws.onerror = () => reject(new Error('ws error'));
      setTimeout(() => reject(new Error('ws timeout')), 3000);
    });

    // WHY: WebSocket 연결 후 잠시 대기 후 메트릭스 발행
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    bridge.emit(createMetricsEvent('test_broadcast', 99));

    const raw = await secondMessage;
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe('metric');
    expect(parsed.data.name).toBe('test_broadcast');
    expect(parsed.data.value).toBe(99);

    ws.close();
  });

  it('should update phase on notifyPhaseChange', async () => {
    server.start();

    server.notifyPhaseChange({
      from: 'DESIGN',
      to: 'CODE',
      reason: 'design complete',
      triggeredBy: 'architect',
      timestamp: new Date().toISOString(),
      durationMs: 5000,
    });

    const res = await fetch(`http://127.0.0.1:${config.port}/api/snapshot`);
    const data = await res.json();
    expect(data.currentPhase).toBe('CODE');
    expect(data.phaseHistory).toHaveLength(1);
    expect(data.phaseHistory[0].from).toBe('DESIGN');
    expect(data.phaseHistory[0].to).toBe('CODE');
  });

  it('should update agents on notifyAgentUpdate', async () => {
    server.start();

    server.notifyAgentUpdate({
      name: 'coder',
      state: 'running',
      currentPhase: 'CODE',
      lastActivity: new Date().toISOString(),
    });

    const res = await fetch(`http://127.0.0.1:${config.port}/api/snapshot`);
    const data = await res.json();
    expect(data.agents).toHaveLength(1);
    expect(data.agents[0].name).toBe('coder');
    expect(data.agents[0].state).toBe('running');
  });

  it('should stop cleanly', () => {
    server.start();
    server.stop();
    // WHY: 중복 stop 호출도 에러 없이 처리
    server.stop();
  });
});
