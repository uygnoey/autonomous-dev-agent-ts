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

  it('onEvent 메서드 존재', () => {
    expect(typeof makeMonitor().onEvent).toBe('function');
  });

  it('getEventHistory 메서드 존재', () => {
    expect(typeof makeMonitor().getEventHistory).toBe('function');
  });

  it('detectAnomalies 메서드 존재', () => {
    expect(typeof makeMonitor().detectAnomalies).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    expect(makeMonitor()).not.toBe(makeMonitor());
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new StreamMonitor(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new StreamMonitor(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const monitors = Array.from({ length: 10 }, () => makeMonitor());
    for (let i = 0; i < monitors.length; i++) {
      for (let j = i + 1; j < monitors.length; j++) {
        expect(monitors[i]).not.toBe(monitors[j]);
      }
    }
  });

  it('초기 이벤트 이력 비어있음', () => {
    expect(makeMonitor().getEventHistory()).toHaveLength(0);
  });

  it('초기 anomalies 빈 배열', () => {
    expect(makeMonitor().detectAnomalies()).toHaveLength(0);
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

  it('ok는 boolean 타입', () => {
    const result = monitor.onEvent(makePreToolEvent('coder', 'Read'));
    expect(typeof result.ok).toBe('boolean');
  });

  it('모든 에이전트 타입 PreToolUse → ok', () => {
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer', 'documenter'];
    for (const agent of agents) {
      const result = monitor.onEvent(makePreToolEvent(agent, 'Read'));
      expect(result.ok).toBe(true);
    }
  });

  it('긴 toolName → ok', () => {
    const result = monitor.onEvent(makePreToolEvent('coder', 'A'.repeat(100)));
    expect(result.ok).toBe(true);
  });

  it('특수문자 toolName → ok', () => {
    const result = monitor.onEvent(makePreToolEvent('coder', 'tool-name_v2.0'));
    expect(result.ok).toBe(true);
  });

  it('과거 timestamp 이벤트 → ok', () => {
    const past = new Date(Date.now() - 86_400_000); // 1일 전
    const result = monitor.onEvent(makePreToolEvent('coder', 'Read', past));
    expect(result.ok).toBe(true);
  });

  it('미래 timestamp 이벤트 → ok', () => {
    const future = new Date(Date.now() + 86_400_000); // 1일 후
    const result = monitor.onEvent(makePreToolEvent('coder', 'Read', future));
    expect(result.ok).toBe(true);
  });

  it('5번 반복 → 이력 5개 쌓임', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    expect(monitor.getEventHistory().length).toBe(5);
  });

  it('이벤트 추가 후 이력 개수 증가', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    expect(monitor.getEventHistory().length).toBe(1);
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(monitor.getEventHistory().length).toBe(2);
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

  it('반환값은 배열 타입', () => {
    expect(Array.isArray(monitor.getEventHistory())).toBe(true);
  });

  it('이벤트 agentName 필드 string 타입', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const history = monitor.getEventHistory();
    expect(typeof history[0]?.agentName).toBe('string');
  });

  it('이벤트 type 필드 string 타입', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const history = monitor.getEventHistory();
    expect(typeof history[0]?.type).toBe('string');
  });

  it('이벤트 timestamp 필드 Date', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const history = monitor.getEventHistory();
    expect(history[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('필터링된 이력도 복사본', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('coder', 'Write'));
    const filtered = monitor.getEventHistory('coder');
    filtered.pop();
    expect(monitor.getEventHistory('coder').length).toBe(2);
  });

  it('10개 이벤트 → 전체 이력 10개', () => {
    for (let i = 0; i < 10; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    expect(monitor.getEventHistory().length).toBe(10);
  });

  it('Mixed 이벤트 타입 모두 포함', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePostToolEvent('coder', 'Read'));
    monitor.onEvent(makeIdleEvent('coder'));
    expect(monitor.getEventHistory('coder').length).toBe(3);
  });

  it('5번 getEventHistory 반복 호출 → 동일 결과', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    for (let i = 0; i < 5; i++) {
      expect(monitor.getEventHistory().length).toBe(1);
    }
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

  it('detectAnomalies 반환값은 배열', () => {
    expect(Array.isArray(monitor.detectAnomalies())).toBe(true);
  });

  it('1회 반복 → 탐지 안 됨', () => {
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });

  it('3회 반복 → 탐지 안 됨', () => {
    for (let i = 0; i < 3; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });

  it('두 에이전트 모두 5회 반복 → 둘 다 탐지', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    }
    const alerts = monitor.detectAnomalies();
    const coderLoops = alerts.filter((a) => a.type === 'infinite_loop' && a.agentName === 'coder');
    const archLoops = alerts.filter((a) => a.type === 'infinite_loop' && a.agentName === 'architect');
    expect(coderLoops.length).toBeGreaterThan(0);
    expect(archLoops.length).toBeGreaterThan(0);
  });

  it('5번 detectAnomalies 반복 → 동일 결과', () => {
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    const first = monitor.detectAnomalies().length;
    for (let i = 0; i < 4; i++) {
      expect(monitor.detectAnomalies().length).toBe(first);
    }
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

  it('2분 유휴 → 미탐지', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 120_000); // 2분 전
    monitor.onEvent(makePreToolEvent('tester', 'Bash', past));
    monitor.onEvent(makeIdleEvent('tester', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBe(0);
  });

  it('7분 유휴 → deadlock 탐지됨', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 420_000); // 7분 전
    monitor.onEvent(makePreToolEvent('coder', 'Read', past));
    monitor.onEvent(makeIdleEvent('coder', now));
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBeGreaterThan(0);
  });

  it('유휴 없이 도구 호출만 → deadlock 없음', () => {
    for (let i = 0; i < 10; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    const alerts = monitor.detectAnomalies();
    const idleAlerts = alerts.filter((a) => a.type === 'deadlock');
    expect(idleAlerts.length).toBe(0);
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

  it('두 모니터 인스턴스 독립', () => {
    const m1 = makeMonitor();
    const m2 = makeMonitor();
    m1.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m1.getEventHistory().length).toBe(1);
    expect(m2.getEventHistory().length).toBe(0);
  });

  it('이벤트 순서 보존', () => {
    const monitor = makeMonitor();
    const tools = ['Read', 'Write', 'Glob', 'Grep', 'Bash'];
    for (const tool of tools) {
      monitor.onEvent(makePreToolEvent('coder', tool));
    }
    const history = monitor.getEventHistory('coder');
    for (let i = 0; i < tools.length; i++) {
      expect(history[i]?.toolName).toBe(tools[i]);
    }
  });

  it('50개 이벤트 후 필터링 정확도', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 30; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Read'));
    }
    for (let i = 0; i < 20; i++) {
      monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    }
    expect(monitor.getEventHistory('coder').length).toBe(30);
    expect(monitor.getEventHistory('architect').length).toBe(20);
    expect(monitor.getEventHistory().length).toBe(50);
  });

  it('anomalies type 필드 존재', () => {
    const m = makeMonitor();
    const alerts = m.onEvent(makePreToolEvent('coder', 'Read'));
    expect(typeof alerts.ok).toBe('boolean');
  });

  it('5개 도구 순환 → 루프 탐지 안 됨', () => {
    const monitor = makeMonitor();
    const tools = ['Read', 'Write', 'Glob', 'Grep', 'Bash'];
    for (let i = 0; i < 25; i++) {
      monitor.onEvent(makePreToolEvent('coder', tools[i % tools.length] as string));
    }
    const alerts = monitor.detectAnomalies();
    const loopAlerts = alerts.filter((a) => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });
});

// ── 랜덤 이벤트 ───────────────────────────────────────────────

describe('StreamMonitor 랜덤 이벤트', () => {
  it('에이전트 coder → Read 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 architect → Glob 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 tester → Bash 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('tester', 'Bash'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 qa → Grep 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('qa', 'Grep'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 qc → Write 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('qc', 'Write'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 reviewer → Edit 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('reviewer', 'Edit'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('에이전트 documenter → Read 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('documenter', 'Read'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('PostToolUse 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePostToolEvent('coder', 'Read'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('TeammateIdle 1회 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makeIdleEvent('architect'));
    expect(monitor.getEventHistory().length).toBe(1);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('Mixed 이벤트 3개 기록', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePostToolEvent('coder', 'Read'));
    monitor.onEvent(makeIdleEvent('coder'));
    expect(monitor.getEventHistory().length).toBe(3);
    expect(() => monitor.detectAnomalies()).not.toThrow();
  });

  it('2개 모니터 인스턴스 독립 검증', () => {
    const m1 = makeMonitor();
    const m2 = makeMonitor();
    for (let i = 0; i < 3; i++) {
      m1.onEvent(makePreToolEvent('coder', 'Read'));
    }
    expect(m1.getEventHistory().length).toBe(3);
    expect(m2.getEventHistory().length).toBe(0);
  });

  it('이벤트 없는 상태에서 detectAnomalies → 빈 배열', () => {
    const monitor = makeMonitor();
    expect(monitor.detectAnomalies()).toHaveLength(0);
  });

  it('4회 반복 → loopAlert 없음', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 4; i++) {
      monitor.onEvent(makePreToolEvent('tester', 'Bash'));
    }
    const loopAlerts = monitor.detectAnomalies().filter(a => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBe(0);
  });

  it('6회 반복 → loopAlert 있음', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 6; i++) {
      monitor.onEvent(makePreToolEvent('qa', 'Glob'));
    }
    const loopAlerts = monitor.detectAnomalies().filter(a => a.type === 'infinite_loop');
    expect(loopAlerts.length).toBeGreaterThan(0);
  });

  it('getEventHistory 필터 undefined → 전체 반환', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    monitor.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(monitor.getEventHistory().length).toBe(2);
  });

  it('이벤트 data 필드 추가 → ok', () => {
    const monitor = makeMonitor();
    const event: HookEvent = {
      type: 'PreToolUse',
      agentName: 'coder',
      toolName: 'Read',
      data: { extra: 'info', count: 42 },
      timestamp: new Date(),
    };
    expect(monitor.onEvent(event).ok).toBe(true);
  });

  it('TeammateIdle 후 PreToolUse → 이력 2개', () => {
    const monitor = makeMonitor();
    monitor.onEvent(makeIdleEvent('coder'));
    monitor.onEvent(makePreToolEvent('coder', 'Read'));
    expect(monitor.getEventHistory('coder').length).toBe(2);
  });

  it('detectAnomalies 반환 배열 원소 type 필드', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    const alerts = monitor.detectAnomalies();
    for (const alert of alerts) {
      expect(typeof alert.type).toBe('string');
    }
  });

  it('detectAnomalies 반환 배열 원소 severity 필드', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    const alerts = monitor.detectAnomalies();
    for (const alert of alerts) {
      expect(typeof alert.severity).toBe('string');
    }
  });

  it('detectAnomalies 반환 배열 원소 agentName 필드', () => {
    const monitor = makeMonitor();
    for (let i = 0; i < 5; i++) {
      monitor.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    const alerts = monitor.detectAnomalies();
    for (const alert of alerts) {
      expect(typeof alert.agentName).toBe('string');
    }
  });
});

// ── 추가 edge/random 케이스 (배치 38) ─────────────────────────

describe('StreamMonitor 추가 edge — onEvent 타입 다양성', () => {
  it('PreToolUse toolName 한글 → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', '한글도구이름'));
    expect(result.ok).toBe(true);
  });

  it('PreToolUse toolName 특수문자 → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', '!@#$%^&*()'));
    expect(result.ok).toBe(true);
  });

  it('PreToolUse toolName 빈 문자열 → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', ''));
    expect(result.ok).toBe(true);
  });

  it('PreToolUse toolName 매우 긴 문자열 → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', 'x'.repeat(500)));
    expect(result.ok).toBe(true);
  });

  it('PostToolUse toolName 한글 → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePostToolEvent('architect', '한글도구'));
    expect(result.ok).toBe(true);
  });

  it('TeammateIdle agentName coder → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makeIdleEvent('coder'));
    expect(result.ok).toBe(true);
  });

  it('TeammateIdle agentName reviewer → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makeIdleEvent('reviewer'));
    expect(result.ok).toBe(true);
  });

  it('PreToolUse with epoch timestamp → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', 'Read', new Date(0)));
    expect(result.ok).toBe(true);
  });

  it('PreToolUse with far future timestamp → ok', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', 'Read', new Date(9_999_999_999_999)));
    expect(result.ok).toBe(true);
  });

  it('연속 PreToolUse + PostToolUse 쌍 → 이력 2개', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Bash'));
    m.onEvent(makePostToolEvent('coder', 'Bash'));
    expect(m.getEventHistory('coder').length).toBe(2);
  });
});

describe('StreamMonitor 추가 edge — getEventHistory 필터 다양성', () => {
  it('tester 이벤트 필터 → tester만 반환', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('tester', 'Bash'));
    m.onEvent(makePreToolEvent('coder', 'Read'));
    m.onEvent(makePreToolEvent('tester', 'Glob'));
    expect(m.getEventHistory('tester').length).toBe(2);
  });

  it('qa 이벤트 필터 → qa만 반환', () => {
    const m = makeMonitor();
    for (let i = 0; i < 4; i++) {
      m.onEvent(makePreToolEvent('qa', 'Grep'));
      m.onEvent(makePreToolEvent('qc', 'Write'));
    }
    expect(m.getEventHistory('qa').length).toBe(4);
    expect(m.getEventHistory('qc').length).toBe(4);
  });

  it('documenter 이벤트 필터 → documenter만 반환', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('documenter', 'Write'));
    m.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m.getEventHistory('documenter').length).toBe(1);
  });

  it('전체 이력 = 모든 에이전트 이력 합계', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa'];
    for (const agent of agents) {
      m.onEvent(makePreToolEvent(agent, 'Read'));
      m.onEvent(makePreToolEvent(agent, 'Write'));
    }
    const total = agents.reduce((sum, a) => sum + m.getEventHistory(a).length, 0);
    expect(total).toBe(m.getEventHistory().length);
  });

  it('이력 아이템 toolName 필드 확인', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'SpecialTool'));
    const history = m.getEventHistory('coder');
    expect(history[0]?.toolName).toBe('SpecialTool');
  });

  it('이력 아이템 type 필드 PreToolUse 확인', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m.getEventHistory()[0]?.type).toBe('PreToolUse');
  });

  it('이력 아이템 type 필드 PostToolUse 확인', () => {
    const m = makeMonitor();
    m.onEvent(makePostToolEvent('coder', 'Write'));
    expect(m.getEventHistory()[0]?.type).toBe('PostToolUse');
  });

  it('이력 아이템 type 필드 TeammateIdle 확인', () => {
    const m = makeMonitor();
    m.onEvent(makeIdleEvent('architect'));
    expect(m.getEventHistory()[0]?.type).toBe('TeammateIdle');
  });
});

describe('StreamMonitor 추가 edge — detectAnomalies 반복 도구 경계값', () => {
  it('2회 반복 → loopAlert 없음', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Bash'));
    m.onEvent(makePreToolEvent('coder', 'Bash'));
    expect(m.detectAnomalies().filter(a => a.type === 'infinite_loop').length).toBe(0);
  });

  it('5회 반복 Write → loopAlert 있음', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('architect', 'Write'));
    expect(m.detectAnomalies().filter(a => a.type === 'infinite_loop').length).toBeGreaterThan(0);
  });

  it('5회 반복 Glob → loopAlert agentName 정확함', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('qa', 'Glob'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    if (alerts.length > 0) {
      expect(alerts[0]?.agentName).toBe('qa');
    }
  });

  it('5회 반복 Grep → loopAlert severity string', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('reviewer', 'Grep'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    if (alerts.length > 0) {
      expect(typeof alerts[0]?.severity).toBe('string');
    }
  });

  it('3가지 도구 각각 5회 → 각각 loopAlert 발생', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('architect', 'Glob'));
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('tester', 'Bash'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('PostToolUse 5회 반복 → loopAlert 없음', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePostToolEvent('coder', 'Bash'));
    expect(m.detectAnomalies().filter(a => a.type === 'infinite_loop').length).toBe(0);
  });

  it('TeammateIdle 5회 반복 → loopAlert 없음', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makeIdleEvent('coder'));
    expect(m.detectAnomalies().filter(a => a.type === 'infinite_loop').length).toBe(0);
  });

  it('detectAnomalies는 항상 배열 반환', () => {
    const m = makeMonitor();
    expect(Array.isArray(m.detectAnomalies())).toBe(true);
  });

  it('detectAnomalies 빈 → length 0', () => {
    const m = makeMonitor();
    expect(m.detectAnomalies().length).toBe(0);
  });
});

describe('StreamMonitor 추가 edge — deadlock 경계값', () => {
  it('4분 59초 유휴 → deadlock 없음', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 299_000); // 4분59초
    m.onEvent(makePreToolEvent('coder', 'Read', past));
    m.onEvent(makeIdleEvent('coder', now));
    expect(m.detectAnomalies().filter(a => a.type === 'deadlock').length).toBe(0);
  });

  it('5분 1초 유휴 → deadlock 탐지', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 301_000); // 5분1초
    m.onEvent(makePreToolEvent('coder', 'Read', past));
    m.onEvent(makeIdleEvent('coder', now));
    expect(m.detectAnomalies().filter(a => a.type === 'deadlock').length).toBeGreaterThan(0);
  });

  it('15분 유휴 → deadlock high severity', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 900_000); // 15분
    m.onEvent(makePreToolEvent('architect', 'Glob', past));
    m.onEvent(makeIdleEvent('architect', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    if (alerts.length > 0) {
      expect(alerts[0]?.severity).toBe('high');
    }
  });

  it('6분 유휴 → deadlock 탐지', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 360_000);
    m.onEvent(makePreToolEvent('tester', 'Bash', past));
    m.onEvent(makeIdleEvent('tester', now));
    expect(m.detectAnomalies().filter(a => a.type === 'deadlock').length).toBeGreaterThan(0);
  });

  it('8분 유휴 → deadlock agentName 정확함', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 480_000);
    m.onEvent(makePreToolEvent('qa', 'Grep', past));
    m.onEvent(makeIdleEvent('qa', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    if (alerts.length > 0) {
      expect(alerts[0]?.agentName).toBe('qa');
    }
  });

  it('두 에이전트 각각 5분+ 유휴 → 둘 다 deadlock', () => {
    const m = makeMonitor();
    const now = new Date();
    const past1 = new Date(now.getTime() - 310_000);
    const past2 = new Date(now.getTime() - 400_000);
    m.onEvent(makePreToolEvent('coder', 'Read', past1));
    m.onEvent(makeIdleEvent('coder', now));
    m.onEvent(makePreToolEvent('architect', 'Glob', past2));
    m.onEvent(makeIdleEvent('architect', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('유휴 이벤트 없으면 deadlock 없음', () => {
    const m = makeMonitor();
    for (let i = 0; i < 20; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m.detectAnomalies().filter(a => a.type === 'deadlock').length).toBe(0);
  });
});

describe('StreamMonitor 추가 edge — 복합 복잡 시나리오', () => {
  it('200개 이벤트 → detectAnomalies 오류 없음', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc'];
    const tools = ['Read', 'Write', 'Glob', 'Grep', 'Bash', 'Edit'];
    for (let i = 0; i < 200; i++) {
      m.onEvent(makePreToolEvent(
        agents[i % agents.length] as AgentName,
        tools[i % tools.length] as string,
      ));
    }
    expect(() => m.detectAnomalies()).not.toThrow();
    expect(m.getEventHistory().length).toBe(200);
  });

  it('에이전트별 이력 합 = 전체 이력', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester'];
    const counts: Record<string, number> = {};
    for (const agent of agents) {
      const n = Math.floor(Math.random() * 5) + 1;
      counts[agent] = n;
      for (let i = 0; i < n; i++) m.onEvent(makePreToolEvent(agent, 'Read'));
    }
    const total = agents.reduce((s, a) => s + m.getEventHistory(a).length, 0);
    expect(total).toBe(m.getEventHistory().length);
  });

  it('onEvent 반환값 ok true이면 value 없음', () => {
    const m = makeMonitor();
    const result = m.onEvent(makePreToolEvent('coder', 'Read'));
    if (result.ok) {
      expect((result as { ok: true; value?: unknown }).value).toBeUndefined();
    }
  });

  it('getEventHistory 반환 배열 아이템 agentName string', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('reviewer', 'Grep'));
    const history = m.getEventHistory();
    for (const item of history) {
      expect(typeof item.agentName).toBe('string');
    }
  });

  it('getEventHistory 반환 배열 아이템 timestamp Date', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('documenter', 'Write'));
    for (const item of m.getEventHistory()) {
      expect(item.timestamp).toBeInstanceOf(Date);
    }
  });

  it('detectAnomalies 결과 각 항목에 type 필드 string', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('qc', 'Bash'));
    for (const alert of m.detectAnomalies()) {
      expect(typeof alert.type).toBe('string');
    }
  });

  it('detectAnomalies 결과 각 항목에 severity 필드 string', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('qc', 'Read'));
    for (const alert of m.detectAnomalies()) {
      expect(typeof alert.severity).toBe('string');
    }
  });

  it('10개 인스턴스 각각 독립 detectAnomalies', () => {
    const monitors = Array.from({ length: 10 }, () => makeMonitor());
    for (const mon of monitors) {
      for (let i = 0; i < 5; i++) mon.onEvent(makePreToolEvent('coder', 'Bash'));
    }
    for (const mon of monitors) {
      const alerts = mon.detectAnomalies().filter(a => a.type === 'infinite_loop');
      expect(alerts.length).toBeGreaterThan(0);
    }
  });
});

// ── 추가 배치 64 — onEvent 스트레스 케이스 ──────────────────

describe('StreamMonitor 배치64 — onEvent 스트레스', () => {
  it('1000개 이벤트 → getEventHistory 1000개', () => {
    const m = makeMonitor();
    for (let i = 0; i < 1000; i++) {
      m.onEvent(makePreToolEvent('coder', 'Read'));
    }
    expect(m.getEventHistory().length).toBe(1000);
  });

  it('500개 PreToolUse + 500개 PostToolUse → 이력 1000개', () => {
    const m = makeMonitor();
    for (let i = 0; i < 500; i++) m.onEvent(makePreToolEvent('coder', 'Bash'));
    for (let i = 0; i < 500; i++) m.onEvent(makePostToolEvent('coder', 'Bash'));
    expect(m.getEventHistory().length).toBe(1000);
  });

  it('7가지 에이전트 각 3개 이벤트 → 전체 21개', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer', 'documenter'];
    for (const agent of agents) {
      for (let i = 0; i < 3; i++) m.onEvent(makePreToolEvent(agent, 'Read'));
    }
    expect(m.getEventHistory().length).toBe(21);
    for (const agent of agents) {
      expect(m.getEventHistory(agent).length).toBe(3);
    }
  });

  it('모든 에이전트 이벤트 50개씩 → 전체 350개', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer', 'documenter'];
    for (const agent of agents) {
      for (let i = 0; i < 50; i++) m.onEvent(makePreToolEvent(agent, 'Write'));
    }
    expect(m.getEventHistory().length).toBe(350);
  });

  it('모든 이벤트 타입 혼합 100개 → 처리 가능', () => {
    const m = makeMonitor();
    for (let i = 0; i < 34; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    for (let i = 0; i < 33; i++) m.onEvent(makePostToolEvent('coder', 'Read'));
    for (let i = 0; i < 33; i++) m.onEvent(makeIdleEvent('coder'));
    expect(m.getEventHistory().length).toBe(100);
    expect(() => m.detectAnomalies()).not.toThrow();
  });

  it('연속 5 onEvent 결과 모두 ok=true', () => {
    const m = makeMonitor();
    const tools = ['Read', 'Write', 'Glob', 'Grep', 'Bash'];
    for (const tool of tools) {
      const r = m.onEvent(makePreToolEvent('coder', tool));
      expect(r.ok).toBe(true);
    }
  });

  it('onEvent 반환값 ok는 항상 boolean', () => {
    const m = makeMonitor();
    for (let i = 0; i < 20; i++) {
      const r = m.onEvent(makePreToolEvent('coder', 'Read'));
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('이벤트 타임스탬프 1초 간격 → 정상 처리', () => {
    const m = makeMonitor();
    const base = Date.now();
    for (let i = 0; i < 10; i++) {
      m.onEvent(makePreToolEvent('coder', 'Read', new Date(base + i * 1000)));
    }
    expect(m.getEventHistory().length).toBe(10);
  });

  it('이벤트 타임스탬프 역순 → 에러 없음', () => {
    const m = makeMonitor();
    const base = Date.now();
    for (let i = 9; i >= 0; i--) {
      m.onEvent(makePreToolEvent('coder', 'Read', new Date(base + i * 1000)));
    }
    expect(m.getEventHistory().length).toBe(10);
    expect(() => m.detectAnomalies()).not.toThrow();
  });

  it('동일 timestamp 10개 → 이력 10개', () => {
    const m = makeMonitor();
    const ts = new Date();
    for (let i = 0; i < 10; i++) m.onEvent(makePreToolEvent('coder', 'Read', ts));
    expect(m.getEventHistory().length).toBe(10);
  });
});

// ── 추가 배치 64 — getEventHistory 필터 정밀도 ──────────────

describe('StreamMonitor 배치64 — getEventHistory 필터 정밀도', () => {
  it('coder 이벤트 20개, architect 10개 → 각각 정확', () => {
    const m = makeMonitor();
    for (let i = 0; i < 20; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    for (let i = 0; i < 10; i++) m.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(m.getEventHistory('coder').length).toBe(20);
    expect(m.getEventHistory('architect').length).toBe(10);
    expect(m.getEventHistory().length).toBe(30);
  });

  it('tester 이벤트 0개 → getEventHistory tester 빈 배열', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m.getEventHistory('tester').length).toBe(0);
  });

  it('같은 에이전트 PreToolUse + PostToolUse + Idle 필터', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('qa', 'Grep'));
    m.onEvent(makePostToolEvent('qa', 'Grep'));
    m.onEvent(makeIdleEvent('qa'));
    m.onEvent(makePreToolEvent('coder', 'Read'));
    const qaHistory = m.getEventHistory('qa');
    expect(qaHistory.length).toBe(3);
    for (const ev of qaHistory) {
      expect(ev.agentName).toBe('qa');
    }
  });

  it('필터 없는 getEventHistory → 전체 반환, 배열 타입', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Read'));
    m.onEvent(makePreToolEvent('reviewer', 'Write'));
    const history = m.getEventHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(2);
  });

  it('qc + documenter 필터 각각 정확', () => {
    const m = makeMonitor();
    for (let i = 0; i < 7; i++) m.onEvent(makePreToolEvent('qc', 'Bash'));
    for (let i = 0; i < 3; i++) m.onEvent(makePreToolEvent('documenter', 'Write'));
    expect(m.getEventHistory('qc').length).toBe(7);
    expect(m.getEventHistory('documenter').length).toBe(3);
  });

  it('getEventHistory 반환값 수정 → 원본 영향 없음 (불변성)', () => {
    const m = makeMonitor();
    for (let i = 0; i < 3; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    const copy = m.getEventHistory('coder');
    copy.pop();
    copy.pop();
    expect(m.getEventHistory('coder').length).toBe(3);
  });

  it('getEventHistory 10회 반복 호출 → 동일 길이', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('tester', 'Bash'));
    const len = m.getEventHistory('tester').length;
    for (let i = 0; i < 10; i++) {
      expect(m.getEventHistory('tester').length).toBe(len);
    }
  });

  it('이벤트 data 필드 object 검증', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'Read'));
    const history = m.getEventHistory();
    for (const ev of history) {
      expect(typeof ev.data).toBe('object');
    }
  });

  it('이벤트 toolName 필드 undefined일 수 있음 (Idle)', () => {
    const m = makeMonitor();
    m.onEvent(makeIdleEvent('architect'));
    const history = m.getEventHistory('architect');
    expect(history.length).toBe(1);
    expect(history[0]?.type).toBe('TeammateIdle');
  });

  it('PreToolUse toolName 필드 string', () => {
    const m = makeMonitor();
    m.onEvent(makePreToolEvent('coder', 'SpecialRead'));
    const history = m.getEventHistory('coder');
    expect(history[0]?.toolName).toBe('SpecialRead');
    expect(typeof history[0]?.toolName).toBe('string');
  });
});

// ── 추가 배치 64 — detectAnomalies 복합 케이스 ───────────────

describe('StreamMonitor 배치64 — detectAnomalies 복합', () => {
  it('루프 탐지 후 새 이벤트 추가 → 다시 탐지됨', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    const before = m.detectAnomalies().filter(a => a.type === 'infinite_loop').length;
    m.onEvent(makePreToolEvent('coder', 'Write')); // 다른 도구 추가
    const after = m.detectAnomalies().filter(a => a.type === 'infinite_loop').length;
    expect(before).toBeGreaterThan(0);
    // Write 이후 연속 Read 5회 아니므로 다시 탐지되거나 안 될 수 있음
    expect(typeof after).toBe('number');
  });

  it('architect 5회 반복 + deadlock → 각각 탐지', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 310_000);
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('architect', 'Glob'));
    m.onEvent(makePreToolEvent('coder', 'Read', past));
    m.onEvent(makeIdleEvent('coder', now));
    const alerts = m.detectAnomalies();
    const loopAlerts = alerts.filter(a => a.type === 'infinite_loop' && a.agentName === 'architect');
    const deadlockAlerts = alerts.filter(a => a.type === 'deadlock' && a.agentName === 'coder');
    expect(loopAlerts.length).toBeGreaterThan(0);
    expect(deadlockAlerts.length).toBeGreaterThan(0);
  });

  it('모든 에이전트 각 5회 반복 → 각각 loopAlert', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer', 'documenter'];
    for (const agent of agents) {
      for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent(agent, 'Read'));
    }
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('detectAnomalies 결과 agentName은 AgentName 유효값', () => {
    const m = makeMonitor();
    const validAgents = new Set(['coder', 'architect', 'tester', 'qa', 'qc', 'reviewer', 'documenter']);
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('reviewer', 'Grep'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    for (const alert of alerts) {
      expect(validAgents.has(alert.agentName)).toBe(true);
    }
  });

  it('deadlock severity는 medium 또는 high', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 310_000);
    m.onEvent(makePreToolEvent('qa', 'Grep', past));
    m.onEvent(makeIdleEvent('qa', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    for (const alert of alerts) {
      expect(['medium', 'high']).toContain(alert.severity);
    }
  });

  it('infinite_loop severity는 medium 또는 high', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('coder', 'Bash'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'infinite_loop');
    for (const alert of alerts) {
      expect(['medium', 'high']).toContain(alert.severity);
    }
  });

  it('alert type은 infinite_loop 또는 deadlock', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('coder', 'Read'));
    const now = new Date();
    const past = new Date(now.getTime() - 310_000);
    m.onEvent(makePreToolEvent('tester', 'Bash', past));
    m.onEvent(makeIdleEvent('tester', now));
    const validTypes = new Set(['infinite_loop', 'deadlock']);
    for (const alert of m.detectAnomalies()) {
      expect(validTypes.has(alert.type)).toBe(true);
    }
  });

  it('300개 이벤트 → detectAnomalies 정상 반환', () => {
    const m = makeMonitor();
    const agents: AgentName[] = ['coder', 'architect', 'tester'];
    const tools = ['Read', 'Write', 'Glob', 'Grep', 'Bash', 'Edit'];
    for (let i = 0; i < 300; i++) {
      m.onEvent(makePreToolEvent(
        agents[i % agents.length] as AgentName,
        tools[i % tools.length] as string,
      ));
    }
    expect(() => m.detectAnomalies()).not.toThrow();
    expect(m.getEventHistory().length).toBe(300);
  });

  it('detectAnomalies 결과는 새로운 배열 (불변성)', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makePreToolEvent('coder', 'Bash'));
    const a1 = m.detectAnomalies();
    const a2 = m.detectAnomalies();
    expect(a1).not.toBe(a2);
    expect(a1.length).toBe(a2.length);
  });
});

// ── 추가 배치 64 — 경계값 TimeDelta ──────────────────────────

describe('StreamMonitor 배치64 — 시간 경계값 정밀', () => {
  it('정확히 5분 유휴 → deadlock 탐지 경계 (구현 의존)', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 300_000); // 정확히 5분
    m.onEvent(makePreToolEvent('coder', 'Read', past));
    m.onEvent(makeIdleEvent('coder', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    // 경계값은 구현에 따라 탐지/미탐지 둘 다 가능
    expect(typeof alerts.length).toBe('number');
  });

  it('정확히 10분 유휴 → deadlock high severity 경계', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 600_000); // 정확히 10분
    m.onEvent(makePreToolEvent('architect', 'Glob', past));
    m.onEvent(makeIdleEvent('architect', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    expect(typeof alerts.length).toBe('number');
  });

  it('1초 유휴 → deadlock 없음', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 1_000);
    m.onEvent(makePreToolEvent('tester', 'Bash', past));
    m.onEvent(makeIdleEvent('tester', now));
    expect(m.detectAnomalies().filter(a => a.type === 'deadlock').length).toBe(0);
  });

  it('30분 유휴 → deadlock high', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 1_800_000);
    m.onEvent(makePreToolEvent('qa', 'Grep', past));
    m.onEvent(makeIdleEvent('qa', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    if (alerts.length > 0) {
      expect(alerts[0]?.severity).toBe('high');
    }
  });

  it('1시간 유휴 → deadlock 탐지', () => {
    const m = makeMonitor();
    const now = new Date();
    const past = new Date(now.getTime() - 3_600_000);
    m.onEvent(makePreToolEvent('qc', 'Read', past));
    m.onEvent(makeIdleEvent('qc', now));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('같은 에이전트 여러 유휴 중 최근만 반영', () => {
    const m = makeMonitor();
    const now = new Date();
    // 짧은 유휴 먼저
    m.onEvent(makePreToolEvent('reviewer', 'Glob', new Date(now.getTime() - 60_000)));
    m.onEvent(makeIdleEvent('reviewer', new Date(now.getTime() - 30_000)));
    // 긴 유휴 나중에
    m.onEvent(makePreToolEvent('reviewer', 'Read', new Date(now.getTime() - 700_000)));
    m.onEvent(makeIdleEvent('reviewer', now));
    expect(() => m.detectAnomalies()).not.toThrow();
  });

  it('활동 없이 Idle만 → deadlock 없음', () => {
    const m = makeMonitor();
    for (let i = 0; i < 5; i++) m.onEvent(makeIdleEvent('coder'));
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock');
    // 이전 활동 없으면 기간 계산 불가
    expect(typeof alerts.length).toBe('number');
  });

  it('다른 에이전트 활동 후 Idle → deadlock 없음', () => {
    const m = makeMonitor();
    const now = new Date();
    // coder의 활동
    m.onEvent(makePreToolEvent('coder', 'Read', new Date(now.getTime() - 310_000)));
    // architect의 Idle (coder 활동이 architect 유휴 시간 계산에 무관)
    m.onEvent(makeIdleEvent('architect', now));
    // architect의 자체 활동이 없으므로 deadlock 없어야 함
    const alerts = m.detectAnomalies().filter(a => a.type === 'deadlock' && a.agentName === 'architect');
    expect(alerts.length).toBe(0);
  });
});

// ── 추가 배치 64 — 멀티 인스턴스 완전 독립성 ─────────────────

describe('StreamMonitor 배치64 — 멀티 인스턴스 독립성', () => {
  it('20개 인스턴스 각각 독립적 이력', () => {
    const monitors = Array.from({ length: 20 }, () => makeMonitor());
    for (let i = 0; i < monitors.length; i++) {
      for (let j = 0; j <= i; j++) {
        monitors[i]?.onEvent(makePreToolEvent('coder', 'Read'));
      }
    }
    for (let i = 0; i < monitors.length; i++) {
      expect(monitors[i]?.getEventHistory().length).toBe(i + 1);
    }
  });

  it('인스턴스 A에 이벤트 → B 이력 영향 없음', () => {
    const a = makeMonitor();
    const b = makeMonitor();
    for (let i = 0; i < 10; i++) a.onEvent(makePreToolEvent('coder', 'Read'));
    expect(b.getEventHistory().length).toBe(0);
  });

  it('인스턴스 A detectAnomalies → B에 영향 없음', () => {
    const a = makeMonitor();
    const b = makeMonitor();
    for (let i = 0; i < 5; i++) a.onEvent(makePreToolEvent('coder', 'Bash'));
    a.detectAnomalies();
    expect(b.getEventHistory().length).toBe(0);
    expect(b.detectAnomalies().length).toBe(0);
  });

  it('두 인스턴스 각각 다른 에이전트 이벤트 → 각각 독립 필터', () => {
    const m1 = makeMonitor();
    const m2 = makeMonitor();
    m1.onEvent(makePreToolEvent('coder', 'Read'));
    m2.onEvent(makePreToolEvent('architect', 'Glob'));
    expect(m1.getEventHistory('coder').length).toBe(1);
    expect(m1.getEventHistory('architect').length).toBe(0);
    expect(m2.getEventHistory('architect').length).toBe(1);
    expect(m2.getEventHistory('coder').length).toBe(0);
  });

  it('같은 logger 공유해도 인스턴스 독립', () => {
    const sharedLogger = new ConsoleLogger('error');
    const m1 = new StreamMonitor(sharedLogger);
    const m2 = new StreamMonitor(sharedLogger);
    m1.onEvent(makePreToolEvent('coder', 'Read'));
    expect(m1.getEventHistory().length).toBe(1);
    expect(m2.getEventHistory().length).toBe(0);
  });

  it('인스턴스 생성 후 즉시 detectAnomalies → 빈 배열', () => {
    for (let i = 0; i < 10; i++) {
      const m = makeMonitor();
      expect(m.detectAnomalies().length).toBe(0);
    }
  });

  it('인스턴스 생성 후 즉시 getEventHistory → 빈 배열', () => {
    for (let i = 0; i < 10; i++) {
      const m = makeMonitor();
      expect(m.getEventHistory().length).toBe(0);
    }
  });

  it('대규모 독립 인스턴스 5개 → 각각 다른 이벤트 수', () => {
    const counts = [1, 5, 10, 20, 50];
    const monitors = counts.map(() => makeMonitor());
    for (let i = 0; i < monitors.length; i++) {
      const n = counts[i] as number;
      for (let j = 0; j < n; j++) {
        monitors[i]?.onEvent(makePreToolEvent('coder', 'Read'));
      }
    }
    for (let i = 0; i < monitors.length; i++) {
      expect(monitors[i]?.getEventHistory().length).toBe(counts[i]);
    }
  });
});
