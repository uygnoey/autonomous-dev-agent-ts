/**
 * BiasDetector 단위 테스트 / BiasDetector unit tests
 *
 * @description
 * 확인 편향, 무한 루프, 교착 상태, 범위 이탈, getSeverity,
 * 에이전트 필터링, 복합 시나리오, 랜덤/경계값을 검증한다.
 *
 * 설계:
 * - CONFIRMATION_BIAS_THRESHOLD = 3 (count === 3 시 alert)
 * - INFINITE_LOOP_THRESHOLD = 3 (pattern 3회 반복)
 * - DEADLOCK_EVENT_THRESHOLD = 20 (연속 TeammateIdle >= 20)
 * - SCOPE_CREEP_THRESHOLD = 0.3 AND uniqueTools.size > 5
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { BiasDetector } from 'layer2/bias-detector.js';
import type { HookEvent } from 'layer2/types.js';
import type { AgentName } from 'core/types.js';
import type { BiasAlert } from 'layer2/types.js';

const ALL_AGENTS: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];

// ── 헬퍼 함수 ─────────────────────────────────────────────────

function makePreToolUse(
  agentName: AgentName,
  toolName: string,
  data: Record<string, unknown> = {},
  offset = 0,
): HookEvent {
  return {
    type: 'PreToolUse',
    agentName,
    toolName,
    data,
    timestamp: new Date(Date.now() + offset * 1000),
  };
}

function makeTeammateIdle(agentName: AgentName, offset = 0): HookEvent {
  return {
    type: 'TeammateIdle',
    agentName,
    data: {},
    timestamp: new Date(Date.now() + offset * 1000),
  };
}

function makePostToolUse(agentName: AgentName, toolName: string, offset = 0): HookEvent {
  return {
    type: 'PostToolUse',
    agentName,
    toolName,
    data: {},
    timestamp: new Date(Date.now() + offset * 1000),
  };
}

/** 같은 tool+data 이벤트를 n회 생성 */
function repeatPreToolUse(agent: AgentName, tool: string, data: Record<string, unknown>, n: number): HookEvent[] {
  return Array.from({ length: n }, (_, i) => makePreToolUse(agent, tool, data, i));
}

/** tool 배열로 구성된 시퀀스를 n회 반복 */
function repeatPattern(agent: AgentName, tools: string[], n: number): HookEvent[] {
  const events: HookEvent[] = [];
  for (let i = 0; i < n; i++) {
    for (const tool of tools) {
      events.push(makePreToolUse(agent, tool, {}, events.length));
    }
  }
  return events;
}

function makeAlert(
  type: BiasAlert['type'],
  severity: BiasAlert['severity'],
  agentName: AgentName = 'coder',
): BiasAlert {
  return {
    type,
    agentName,
    description: 'test',
    evidence: 'test',
    severity,
    timestamp: new Date(),
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('BiasDetector 생성자', () => {
  it('인스턴스 생성됨', () => {
    const logger = new ConsoleLogger('error');
    expect(() => new BiasDetector(logger)).not.toThrow();
  });

  it('BiasDetector 인스턴스', () => {
    const logger = new ConsoleLogger('error');
    expect(new BiasDetector(logger)).toBeInstanceOf(BiasDetector);
  });
});

// ── analyze() 기본 동작 ────────────────────────────────────────

describe('BiasDetector analyze() 기본 동작', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('빈 이벤트 → ok([]) 반환', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('빈 이벤트 → ok 결과', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
  });

  it('관련 없는 PostToolUse 이벤트만 → ok([]) 반환', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makePostToolUse('coder', 'Read', i),
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('1개 PreToolUse → alert 없음', () => {
    const result = detector.analyze([makePreToolUse('coder', 'Read', { path: '/a.ts' })], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('2개 동일 PreToolUse → confirmation_bias alert 없음', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/a.ts' }, 2);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const biasAlerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(biasAlerts).toHaveLength(0);
    }
  });
});

// ── 확인 편향 감지 ─────────────────────────────────────────────

describe('BiasDetector 확인 편향 감지', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('같은 쿼리 3회 반복 → 감지', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    }
  });

  it('같은 쿼리 4회 → alert는 1개 (3번째에서 생성)', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, 4);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('같은 쿼리 10회 → alert는 1개', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, 10);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('다른 data → 같은 tool이라도 confirmation_bias 미감지', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/a.ts' }),
      makePreToolUse('coder', 'Read', { path: '/b.ts' }),
      makePreToolUse('coder', 'Read', { path: '/c.ts' }),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it('다른 tool 같은 data → confirmation_bias 미감지', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/same.ts' }),
      makePreToolUse('coder', 'Write', { path: '/same.ts' }),
      makePreToolUse('coder', 'Edit', { path: '/same.ts' }),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it('두 개의 시그니처 각각 3회 반복 → alert 2개', () => {
    const events = [
      ...repeatPreToolUse('coder', 'Read', { path: '/a.ts' }, 3),
      ...repeatPreToolUse('coder', 'Write', { path: '/b.ts' }, 3),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(2);
    }
  });

  it('confirmation_bias alert의 agentName이 올바름', () => {
    const events = repeatPreToolUse('reviewer', 'Read', { path: '/x.ts' }, 3);
    const result = detector.analyze(events, 'reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(alerts[0]?.agentName).toBe('reviewer');
    }
  });

  it('confirmation_bias alert에 severity 포함', () => {
    const events = repeatPreToolUse('coder', 'Grep', { pattern: 'foo' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(['low', 'medium', 'high']).toContain(alerts[0]?.severity);
    }
  });

  it('빈 toolName도 시그니처에 포함됨 → 3회 반복 감지', () => {
    const events = Array.from({ length: 3 }, (_, i) => ({
      type: 'PreToolUse' as const,
      agentName: 'coder' as const,
      data: { key: 'same-value' },
      timestamp: new Date(Date.now() + i * 1000),
    }));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    }
  });

  it.each([1, 2])('같은 쿼리 %i회 → confirmation_bias 미감지', (n) => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, n);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it.each([3, 5, 10, 20])('같은 쿼리 %i회 → confirmation_bias alert 1개', (n) => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, n);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });
});

// ── 무한 루프 감지 ─────────────────────────────────────────────

describe('BiasDetector 무한 루프 감지', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('2-tool 패턴 3회 반복 → 감지', () => {
    const events = repeatPattern('coder', ['Read', 'Write'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });

  it('3-tool 패턴 3회 반복 → 감지', () => {
    const events = repeatPattern('coder', ['Read', 'Edit', 'Write'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });

  it('4-tool 패턴 3회 반복 → 감지', () => {
    const events = repeatPattern('coder', ['Glob', 'Grep', 'Read', 'Write'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });

  it('5-tool 패턴 3회 반복 → 감지', () => {
    const events = repeatPattern('coder', ['Glob', 'Grep', 'Read', 'Write', 'Edit'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });

  it('2-tool 패턴 2회만 반복 → 미감지', () => {
    const events = repeatPattern('coder', ['Read', 'Write'], 2);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('패턴 없는 다양한 tool 시퀀스 → 미감지', () => {
    const events = ['Glob', 'Grep', 'Read', 'Write', 'Edit', 'Bash', 'WebFetch'].map((tool, i) =>
      makePreToolUse('coder', tool, {}, i),
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('패턴 중간에 다른 tool → 미감지', () => {
    const events = [
      makePreToolUse('coder', 'Read', {}, 0),
      makePreToolUse('coder', 'Write', {}, 1),
      makePreToolUse('coder', 'Edit', {}, 2), // 다른 tool
      makePreToolUse('coder', 'Read', {}, 3),
      makePreToolUse('coder', 'Write', {}, 4),
      makePreToolUse('coder', 'Read', {}, 5),
      makePreToolUse('coder', 'Write', {}, 6),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('2-tool 패턴 4회 반복 → alert 1개 (3번째에서 감지)', () => {
    const events = repeatPattern('coder', ['Read', 'Write'], 4);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('infinite_loop alert의 agentName 올바름', () => {
    const events = repeatPattern('tester', ['Bash', 'Read'], 3);
    const result = detector.analyze(events, 'tester');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'infinite_loop');
      if (alerts.length > 0) {
        expect(alerts[0]?.agentName).toBe('tester');
      }
    }
  });

  it.each([2, 3, 4, 5])('%i-tool 패턴 3회 반복 → 감지', (len) => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5'].slice(0, len);
    const events = repeatPattern('coder', tools, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });
});

// ── 교착 상태 감지 ─────────────────────────────────────────────

describe('BiasDetector 교착 상태 감지', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('TeammateIdle 20회 연속 → 감지 (정확히 임계값)', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
    }
  });

  it('TeammateIdle 25회 연속 → 감지', () => {
    const events = Array.from({ length: 25 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
    }
  });

  it('TeammateIdle 19회 연속 → 미감지 (임계값 미만)', () => {
    const events = Array.from({ length: 19 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('TeammateIdle 1회 → 미감지', () => {
    const result = detector.analyze([makeTeammateIdle('coder')], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('활동 이벤트가 Idle 중간에 오면 카운터 리셋 → 미감지', () => {
    const events: HookEvent[] = [
      ...Array.from({ length: 10 }, (_, i) => makeTeammateIdle('coder', i)),
      makePreToolUse('coder', 'Read', {}, 10),
      ...Array.from({ length: 10 }, (_, i) => makeTeammateIdle('coder', i + 11)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('Idle 19개 + PreToolUse + Idle 1개 → 미감지', () => {
    const events: HookEvent[] = [
      ...Array.from({ length: 19 }, (_, i) => makeTeammateIdle('coder', i)),
      makePreToolUse('coder', 'Bash', {}, 19),
      makeTeammateIdle('coder', 20),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('deadlock alert의 severity는 high', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'deadlock');
      expect(alerts[0]?.severity).toBe('high');
    }
  });

  it('deadlock alert 1개만 생성 (임계값 초과 시 break)', () => {
    const events = Array.from({ length: 50 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(1);
    }
  });

  it('PostToolUse가 Idle 중간에 있으면 카운터 리셋', () => {
    const events: HookEvent[] = [
      ...Array.from({ length: 15 }, (_, i) => makeTeammateIdle('coder', i)),
      makePostToolUse('coder', 'Read', 15),
      ...Array.from({ length: 15 }, (_, i) => makeTeammateIdle('coder', i + 16)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it.each([0, 1, 5, 10, 19])('TeammateIdle %i회 → deadlock 미감지', (n) => {
    const events = Array.from({ length: n }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it.each([20, 25, 30, 50, 100])('TeammateIdle %i회 → deadlock 감지', (n) => {
    const events = Array.from({ length: n }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
    }
  });
});

// ── 범위 이탈 감지 ─────────────────────────────────────────────

describe('BiasDetector 범위 이탈 감지', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('6개 고유 tool, 6회 호출 (100% 다양성) → 감지', () => {
    const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
    const events = tools.map((tool, i) => makePreToolUse('coder', tool, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep').length).toBeGreaterThan(0);
    }
  });

  it('6개 고유 tool 중 diversity > 30% → 감지', () => {
    // 6 unique tools in 10 events: 6/10 = 0.6 > 0.3
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('coder', t, {}, i)),
      makePreToolUse('coder', 'T1', {}, 6),
      makePreToolUse('coder', 'T2', {}, 7),
      makePreToolUse('coder', 'T3', {}, 8),
      makePreToolUse('coder', 'T4', {}, 9),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep').length).toBeGreaterThan(0);
    }
  });

  it('5개 고유 tool → 미감지 (uniqueTools.size > 5 조건 미충족)', () => {
    const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];
    const events = tools.map((tool, i) => makePreToolUse('coder', tool, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('6개 고유 tool이지만 diversity <= 30% → 미감지', () => {
    // 6 unique tools in 20 events: 6/20 = 0.3 = NOT > 0.3
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('coder', t, {}, i)),
      ...Array.from({ length: 14 }, (_, i) => makePreToolUse('coder', 'T1', {}, i + 6)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('도구 이벤트 없음 → scope_creep 미감지', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('scope_creep alert의 severity는 low', () => {
    const tools = ['R', 'W', 'E', 'G', 'Gr', 'Ba'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'scope_creep');
      if (alerts.length > 0) {
        expect(alerts[0]?.severity).toBe('low');
      }
    }
  });

  it('scope_creep alert 최대 1개', () => {
    // 7 unique tools in 7 events: 7/7 = 1.0 > 0.3 and 7 > 5
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep').length).toBeLessThanOrEqual(1);
    }
  });

  it('TeammateIdle만 있으면 toolEvents 없음 → scope_creep 미감지', () => {
    const events = Array.from({ length: 10 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });
});

// ── getSeverity ─────────────────────────────────────────────────

describe('BiasDetector getSeverity', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('빈 배열 → none', () => {
    expect(detector.getSeverity([])).toBe('none');
  });

  it('high alert 1개 → high', () => {
    expect(detector.getSeverity([makeAlert('deadlock', 'high')])).toBe('high');
  });

  it('medium alert 1개 → medium', () => {
    expect(detector.getSeverity([makeAlert('infinite_loop', 'medium')])).toBe('medium');
  });

  it('low alert 1개 → low', () => {
    expect(detector.getSeverity([makeAlert('scope_creep', 'low')])).toBe('low');
  });

  it('high + medium → high', () => {
    const alerts = [makeAlert('deadlock', 'high'), makeAlert('infinite_loop', 'medium')];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('high + low → high', () => {
    const alerts = [makeAlert('deadlock', 'high'), makeAlert('scope_creep', 'low')];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('medium + low → medium', () => {
    const alerts = [makeAlert('infinite_loop', 'medium'), makeAlert('scope_creep', 'low')];
    expect(detector.getSeverity(alerts)).toBe('medium');
  });

  it('low + low → low', () => {
    const alerts = [makeAlert('scope_creep', 'low'), makeAlert('confirmation_bias', 'low')];
    expect(detector.getSeverity(alerts)).toBe('low');
  });

  it('medium + medium → medium', () => {
    const alerts = [makeAlert('infinite_loop', 'medium'), makeAlert('confirmation_bias', 'medium')];
    expect(detector.getSeverity(alerts)).toBe('medium');
  });

  it('high + medium + low → high', () => {
    const alerts = [
      makeAlert('deadlock', 'high'),
      makeAlert('infinite_loop', 'medium'),
      makeAlert('scope_creep', 'low'),
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it.each([
    [[], 'none'],
    [[makeAlert('deadlock', 'high')], 'high'],
    [[makeAlert('infinite_loop', 'medium')], 'medium'],
    [[makeAlert('scope_creep', 'low')], 'low'],
  ] as [BiasAlert[], string][])('getSeverity 파라미터 테스트 → %s', (alerts, expected) => {
    expect(detector.getSeverity(alerts)).toBe(expected);
  });
});

// ── 에이전트 필터링 ────────────────────────────────────────────

describe('BiasDetector 에이전트 필터링', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('다른 에이전트의 이벤트를 완전히 무시', () => {
    const events = repeatPreToolUse('architect', 'Read', { path: '/same.ts' }, 5);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('혼합 에이전트 이벤트 → 지정 에이전트만 분석', () => {
    const events: HookEvent[] = [
      ...repeatPreToolUse('architect', 'Read', { path: '/same.ts' }, 3),
      ...repeatPreToolUse('coder', 'Write', { path: '/other.ts' }, 3),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const biasAlerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(biasAlerts.length).toBeGreaterThan(0);
      for (const a of biasAlerts) {
        expect(a.agentName).toBe('coder');
      }
    }
  });

  it.each(ALL_AGENTS)('%s 에이전트 이벤트 → 다른 에이전트 분석 시 무시', (otherAgent) => {
    if (otherAgent === 'coder') return;
    const events = repeatPreToolUse(otherAgent, 'Read', { path: '/x.ts' }, 5);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it.each(ALL_AGENTS)('%s 에이전트 자신의 이벤트 분석 가능', (agent) => {
    const events = repeatPreToolUse(agent, 'Read', { path: '/x.ts' }, 3);
    const result = detector.analyze(events, agent);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('BiasDetector 복합 시나리오', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('confirmation_bias + deadlock 동시 → 두 alert 모두 감지', () => {
    const events: HookEvent[] = [
      ...repeatPreToolUse('coder', 'Read', { path: '/same.ts' }, 3),
      ...Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i + 3)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = result.value.map((a) => a.type);
      expect(types).toContain('confirmation_bias');
      expect(types).toContain('deadlock');
    }
  });

  it('infinite_loop + deadlock → 두 alert 모두 감지', () => {
    const events: HookEvent[] = [
      ...repeatPattern('coder', ['Read', 'Write'], 3),
      ...Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i + 6)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = result.value.map((a) => a.type);
      expect(types).toContain('infinite_loop');
      expect(types).toContain('deadlock');
    }
  });

  it('getSeverity와 analyze 결과 연동 → deadlock 감지 시 severity high', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const severity = detector.getSeverity(result.value);
      expect(severity).toBe('high');
    }
  });

  it('getSeverity와 analyze 연동 → 빈 이벤트 → none', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(detector.getSeverity(result.value)).toBe('none');
    }
  });

  it('여러 번 analyze 호출 → 각각 독립적인 결과', () => {
    const events1 = repeatPreToolUse('coder', 'Read', { path: '/a.ts' }, 3);
    const events2: HookEvent[] = [];
    const r1 = detector.analyze(events1, 'coder');
    const r2 = detector.analyze(events2, 'coder');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok) expect(r1.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    if (r2.ok) expect(r2.value).toHaveLength(0);
  });

  it('대량 이벤트 처리 → ok 결과 반환', () => {
    const events = Array.from({ length: 1000 }, (_, i) =>
      makePreToolUse('coder', `Tool${i % 10}`, { idx: i }, i),
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('BiasDetector 랜덤/경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    '랜덤 이벤트 수 %i → ok 반환',
    (n) => {
      const events = Array.from({ length: n }, (_, i) =>
        makePreToolUse('coder', `Tool${i % 5}`, { v: i }, i),
      );
      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
    },
  );

  it.each(ALL_AGENTS)('%s 에이전트 빈 이벤트 → ok([])', (agent) => {
    const result = detector.analyze([], agent);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it.each([19, 20, 21])('TeammateIdle %i회 → 경계값 검증', (n) => {
    const events = Array.from({ length: n }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const deadlockAlerts = result.value.filter((a) => a.type === 'deadlock');
      if (n >= 20) {
        expect(deadlockAlerts.length).toBeGreaterThan(0);
      } else {
        expect(deadlockAlerts).toHaveLength(0);
      }
    }
  });

  it('analyze 반환 타입은 항상 ok', () => {
    // analyze()는 Result.ok이며 err를 반환하지 않는다
    for (let i = 0; i < 20; i++) {
      const n = Math.floor(Math.random() * 30);
      const events = Array.from({ length: n }, (_, j) =>
        makePreToolUse('coder', `T${j % 7}`, { x: j }, j),
      );
      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
    }
  });

  it('모든 HookEventType 혼합 → ok 반환', () => {
    const events: HookEvent[] = [
      makePreToolUse('coder', 'Read', {}, 0),
      makePostToolUse('coder', 'Read', 1),
      makeTeammateIdle('coder', 2),
      makePreToolUse('coder', 'Write', {}, 3),
      makePostToolUse('coder', 'Write', 4),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
  });

  it.each([2, 3, 4])('confirmation_bias 임계값 경계: %i회 반복', (n) => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/x.ts' }, n);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const biasAlerts = result.value.filter((a) => a.type === 'confirmation_bias');
      if (n >= 3) {
        expect(biasAlerts.length).toBeGreaterThan(0);
      } else {
        expect(biasAlerts).toHaveLength(0);
      }
    }
  });
});
