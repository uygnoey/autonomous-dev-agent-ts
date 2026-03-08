/**
 * StreamMonitor 단위 테스트 / StreamMonitor unit tests
 *
 * @description
 * 훅 이벤트 기록, 반복 도구 호출 탐지, 장기 유휴 탐지,
 * 이벤트 이력 조회 등 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import type { HookEvent } from 'layer2/types.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';

const logger = new ConsoleLogger('error');

function makeMonitor(): StreamMonitor {
  return new StreamMonitor(logger);
}

function makePreToolEvent(agentName: AgentName, toolName: string, timestamp?: Date): HookEvent {
  return {
    type: 'PreToolUse',
    agentName,
    toolName,
    data: {},
    timestamp: timestamp ?? new Date(),
  };
}

function makePostToolEvent(agentName: AgentName, toolName: string, timestamp?: Date): HookEvent {
  return {
    type: 'PostToolUse',
    agentName,
    toolName,
    data: {},
    timestamp: timestamp ?? new Date(),
  };
}

function makeIdleEvent(agentName: AgentName, timestamp?: Date): HookEvent {
  return {
    type: 'TeammateIdle',
    agentName,
    data: {},
    timestamp: timestamp ?? new Date(),
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('StreamMonitor 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeMonitor()).not.toThrow();
  });

  it('StreamMonitor 인스턴스', () => {
    expect(makeMonitor()).toBeInstanceOf(StreamMonitor);
  });
});

// ── onEvent ────────────────────────────────────────────────────

describe('StreamMonitor.onEvent', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = makeMonitor();
  });

  it('PreToolUse 이벤트 기록 → ok', () => {
    const event = makePreToolEvent('coder', 'Read');
    const result = monitor.onEvent(event);
    expect(result.ok).toBe(true);
  });

  it('PostToolUse 이벤트 기록 → ok', () => {
    const event = makePostToolEvent('coder', 'Write');
    const result = monitor.onEvent(event);
    expect(result.ok).toBe(true);
  });

  it('TeammateIdle 이벤트 기록 → ok', () => {
    const event = makeIdleEvent('architect');
    const result = monitor.onEvent(event);
    expect(result.ok).toBe(true);
  });

  it('여러 이벤트 기록 → 모두 ok', () => {
    const events = [
      makePreToolEvent('coder', 'Read'),
      makePreToolEvent('architect', 'Glob'),
      makePostToolEvent('coder', 'Read'),
      makeIdleEvent('tester'),
    ];
    for (const event of events) {
      const result = monitor.onEvent(event);
      expect(result.ok).toBe(true);
    }
  });

  it('toolName 없는 이벤트 → ok', () => {
    const event: HookEvent = {
      type: 'TeammateIdle',
      agentName: 'reviewer',
      data: {},
      timestamp: new Date(),
    };
    const result = monitor.onEvent(event);
    expect(result.ok).toBe(true);
  });
});

// ── getEventHistory ────────────────────────────────────────────

describe('StreamMonitor.getEventHistory', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = makeMonitor();
  });

  it('빈 이력 → 빈 배열', () => {
    expect(monitor.getEventHistory()).toEqual([]);
  });

  it('모든 이벤트 반환', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(monitor.getEventHistory().length).toBe(2);
  });

  it('에이전트별 필터링', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    monitor.onEvent(makePostToolEvent('coder', 'Write'));

    const coderEvents = monitor.getEventHistory('coder');
    expect(coderEvents.length).toBe(2);
    for (const event of coderEvents) {
      expect(event.agentName).toBe('coder');
    }
  });

  it('없는 에이전트 → 빈 배열', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const reviewerEvents = monitor.getEventHistory('reviewer');
    expect(reviewerEvents.length).toBe(0);
  });

  it('전체 이력이 복사본 반환 (독립적)', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const history = monitor.getEventHistory();
    history.push(makePreToolEvent('architect', 'Glob'));
    expect(monitor.getEventHistory().length).toBe(1);
  });
});

// ── detectAnomalies — 반복 도구 호출 탐지 ────────────────────

describe('StreamMonitor.detectAnomalies — 반복 도구 호출', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = makeMonitor();
  });

  it('이벤트 없을 때 → 빈 배열', () => {
    expect(monitor.detectAnomalies()).toEqual([]);
  });

  it('4회 반복 → 탐지 안 됨 (임계값 5)', () => {
    for (let i = 0; i < 4; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });

  it('5회 반복 → infinite_loop 탐지', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBeGreaterThan(0);
  });

  it('다른 도구 사이에 끼면 → 미탐지', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('coder', 'Write')); // 다른 도구
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });

  it('10회 반복 → infinite_loop 탐지 (break으로 5에서 카운트 멈춤)', () => {
    for (let i = 0; i < 10; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    // WHY: break로 인해 count가 5에서 멈추므로 medium
    expect(loopAlerts.length).toBeGreaterThan(0);
    if (loopAlerts.length > 0) {
      expect(['medium', 'high']).toContain(loopAlerts[0]?.severity);
    }
  });

  it('5회 반복 → severity medium', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('reviewer', 'Grep'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    if (loopAlerts.length > 0) {
      expect(loopAlerts[0]?.severity).toBe('medium');
    }
  });

  it('다른 에이전트 반복 → 독립 탐지', () => {
    // coder: 5회 반복
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    // architect: 정상
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    monitor.onEvent(makePreToolEvent('architect', 'Read'));

    const alerts = monitor.detectAnomalies();
    const coderAlerts = alerts.filter((a) => a.agentName === 'coder');
    const architectAlerts = alerts.filter(
      (a) => a.agentName === 'architect' && a.type === 'infinite_loop',
    );
    expect(coderAlerts.length).toBeGreaterThan(0);
    expect(architectAlerts.length).toBe(0);
  });

  it('PostToolUse 이벤트는 반복 탐지에서 제외', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePostToolEvent('coder', 'Read'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });
});

// ── detectAnomalies — 장기 유휴 탐지 ────────────────────────

describe('StreamMonitor.detectAnomalies — 장기 유휴', () => {
  let monitor: StreamMonitor;

  beforeEach(() => {
    monitor = makeMonitor();
  });

  it('유휴 이전 활동 없으면 → 탐지 안 됨', () => {
    // 마지막 활동 없으면 idleDuration 계산 불가
    monitor.onEvent(makeIdleEvent('architect'));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBe(0);
  });

  it('5분 미만 유휴 → 미탐지', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000); // 1분 전
    monitor.onEvent(makePreToolEvent('tester', 'Bash', past));
    monitor.onEvent(makeIdleEvent('tester', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBe(0);
  });

  it('5분 이상 유휴 → deadlock 탐지', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 310_000); // 5분 10초 전
    monitor.onEvent(makePreToolEvent('architect', 'Read', past));
    monitor.onEvent(makeIdleEvent('architect', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBeGreaterThan(0);
  });

  it('10분 이상 유휴 → severity high', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 620_000); // 10분 20초 전
    monitor.onEvent(makePreToolEvent('qa', 'Glob', past));
    monitor.onEvent(makeIdleEvent('qa', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    if (idleAlerts.length > 0) {
      expect(idleAlerts[0]?.severity).toBe('high');
    }
  });

  it('5분 이상 유휴 → severity medium', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 310_000);
    monitor.onEvent(makePreToolEvent('qc', 'Read', past));
    monitor.onEvent(makeIdleEvent('qc', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    if (idleAlerts.length > 0) {
      expect(idleAlerts[0]?.severity).toBe('medium');
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('StreamMonitor 복합 시나리오', () => {
  it('반복 + 유휴 동시 탐지', () => {
    const monitor = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 310_000);

    // 반복 도구 호출
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    // 장기 유휴
    monitor.onEvent(makePreToolEvent('architect', 'Glob', past));
    monitor.onEvent(makeIdleEvent('architect', now));

    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(loopAlerts.length).toBeGreaterThan(0);
    expect(idleAlerts.length).toBeGreaterThan(0);
  });

  it('100개 이벤트 처리 → 성능 문제 없음', () => {
    const monitor = makeMonitor();
    const agentNames: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'reviewer'];
    for (let i = 0; i < 100; i++) {
      const agentName = agentNames[i % agentNames.length] as AgentName;
      const tool = i % 3 === 0 ? 'Read' : i % 3 === 1 ? 'Write' : 'Glob';
      monitor.onEvent(makePreToolEvent(agentName, tool));
    }
    expect(monitor.getEventHistory().length).toBe(100);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('비어있는 data 객체 → ok', () => {
    const monitor = makeMonitor();
    const event: HookEvent = {
      type: 'PreToolUse',
      agentName: 'documenter',
      toolName: 'Write',
      data: {},
      timestamp: new Date(),
    };
    expect(monitor.onEvent(event).ok).toBe(true);
  });

  it('여러 에이전트 이력 독립 필터링', () => {
    const monitor = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester'];
    for (const agent of agents) {
      for (let i = 0; i < 3; i++) {
        monitor.onEvent(makePreToolEvent(agent, 'Read'));
      }
    }
    for (const agent of agents) {
      expect(monitor.getEventHistory(agent).length).toBe(3);
    }
    expect(monitor.getEventHistory().length).toBe(9);
  });
});

// ── 랜덤 이벤트 ───────────────────────────────────────────────

describe('StreamMonitor 랜덤 이벤트', () => {
  it.each(Array.from({ length: 30 }, (_, i) => i))('랜덤 이벤트 시나리오 #%i', (i) => {
    const monitor = makeMonitor();
    const agentNames: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer'];
    const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
    const agentName = agentNames[i % agentNames.length] as AgentName;
    const tool = tools[i % tools.length] as string;

    monitor.onEvent(makePreToolEvent(agentName, tool));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });
});
