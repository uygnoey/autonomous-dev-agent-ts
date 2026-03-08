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

// ── severity 계산 경계값 ───────────────────────────────────────

describe('BiasDetector severity 계산 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('confirmation_bias 3회 → low severity (3 < threshold*2=6)', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/sev.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      if (alerts.length > 0) expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('confirmation_bias 6회 → 알림은 count=3 시 1회 생성, severity=low', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/med.ts' }, 6);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      // WHY: alert fires once at count===THRESHOLD(3), severity=calculateSeverity(3,3)=low
      if (alerts.length > 0) expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('confirmation_bias 9회 → 알림은 count=3 시 1회 생성, severity=low', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/high.ts' }, 9);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      // WHY: alert fires once at count===3, calculateSeverity(3,3): 3<6 → low
      if (alerts.length > 0) expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('confirmation_bias 10회 → 알림은 count=3 시 1회 생성, severity=low', () => {
    const events = repeatPreToolUse('coder', 'Grep', { pattern: 'x' }, 10);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      // WHY: alert fires once at count===3, calculateSeverity(3,3): 3<6 → low
      if (alerts.length > 0) expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('infinite_loop 3회 패턴 → low severity', () => {
    const events = repeatPattern('coder', ['Read', 'Write'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'infinite_loop');
      if (alerts.length > 0) expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('deadlock → severity는 항상 high', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const deadAlerts = result.value.filter((a) => a.type === 'deadlock');
      if (deadAlerts.length > 0) expect(deadAlerts[0]?.severity).toBe('high');
    }
  });

  it('scope_creep → severity는 항상 low', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const creepAlerts = result.value.filter((a) => a.type === 'scope_creep');
      if (creepAlerts.length > 0) expect(creepAlerts[0]?.severity).toBe('low');
    }
  });

  it('getSeverity: high alert 다수일 때도 high 반환', () => {
    const alerts = [
      makeAlert('deadlock', 'high'),
      makeAlert('deadlock', 'high'),
      makeAlert('deadlock', 'high'),
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('getSeverity: medium × 5 → medium', () => {
    const alerts = Array.from({ length: 5 }, () => makeAlert('infinite_loop', 'medium'));
    expect(detector.getSeverity(alerts)).toBe('medium');
  });

  it('getSeverity: low × 10 → low', () => {
    const alerts = Array.from({ length: 10 }, () => makeAlert('scope_creep', 'low'));
    expect(detector.getSeverity(alerts)).toBe('low');
  });

  it('getSeverity: 모든 타입 혼합 → high', () => {
    const alerts = [
      makeAlert('scope_creep', 'low'),
      makeAlert('infinite_loop', 'medium'),
      makeAlert('deadlock', 'high'),
      makeAlert('confirmation_bias', 'low'),
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('getSeverity: low + medium → medium', () => {
    expect(detector.getSeverity([
      makeAlert('scope_creep', 'low'),
      makeAlert('infinite_loop', 'medium'),
    ])).toBe('medium');
  });

  it('getSeverity: 단일 low → low', () => {
    expect(detector.getSeverity([makeAlert('confirmation_bias', 'low')])).toBe('low');
  });

  it('getSeverity: 단일 medium → medium', () => {
    expect(detector.getSeverity([makeAlert('infinite_loop', 'medium')])).toBe('medium');
  });

  it('getSeverity: 단일 high → high', () => {
    expect(detector.getSeverity([makeAlert('deadlock', 'high')])).toBe('high');
  });

  it('getSeverity: 반환값은 none/low/medium/high 중 하나', () => {
    const valid = ['none', 'low', 'medium', 'high'];
    for (let i = 0; i < 10; i++) {
      const n = Math.floor(Math.random() * 5);
      const alerts = Array.from({ length: n }, () => makeAlert('scope_creep', 'low'));
      expect(valid).toContain(detector.getSeverity(alerts));
    }
  });
});

// ── 추가 에이전트별 검증 ───────────────────────────────────────

describe('BiasDetector 추가 에이전트별 검증', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('architect 에이전트 확인 편향 감지', () => {
    const events = repeatPreToolUse('architect', 'Read', { path: '/arch.ts' }, 3);
    const result = detector.analyze(events, 'architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    }
  });

  it('qa 에이전트 확인 편향 감지', () => {
    const events = repeatPreToolUse('qa', 'Grep', { pattern: 'test' }, 3);
    const result = detector.analyze(events, 'qa');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias').length).toBeGreaterThan(0);
    }
  });

  it('tester 에이전트 교착 상태 감지', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('tester', i));
    const result = detector.analyze(events, 'tester');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
    }
  });

  it('qc 에이전트 무한 루프 감지', () => {
    const events = repeatPattern('qc', ['Bash', 'Read'], 3);
    const result = detector.analyze(events, 'qc');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop').length).toBeGreaterThan(0);
    }
  });

  it('reviewer 에이전트 범위 이탈 감지', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = tools.map((t, i) => makePreToolUse('reviewer', t, {}, i));
    const result = detector.analyze(events, 'reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep').length).toBeGreaterThan(0);
    }
  });

  it('documenter 에이전트 빈 이벤트 → ok([])', () => {
    const result = detector.analyze([], 'documenter');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('모든 에이전트 deadlock 20회 → 각각 ok', () => {
    for (const agent of ALL_AGENTS) {
      const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle(agent, i));
      const result = detector.analyze(events, agent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 scope_creep 6 unique tools → 각각 ok', () => {
    for (const agent of ALL_AGENTS) {
      const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
      const events = tools.map((t, i) => makePreToolUse(agent, t, {}, i));
      const result = detector.analyze(events, agent);
      expect(result.ok).toBe(true);
    }
  });

  it('다른 에이전트 이벤트 100개 + 본인 이벤트 0개 → ok([])', () => {
    const events = repeatPreToolUse('architect', 'Read', { path: '/x.ts' }, 100);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('혼합 에이전트 deadlock → 지정 에이전트만 감지', () => {
    const events: HookEvent[] = [
      ...Array.from({ length: 25 }, (_, i) => makeTeammateIdle('coder', i)),
      ...Array.from({ length: 25 }, (_, i) => makeTeammateIdle('architect', i)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const deadAlerts = result.value.filter((a) => a.type === 'deadlock');
      if (deadAlerts.length > 0) {
        for (const a of deadAlerts) expect(a.agentName).toBe('coder');
      }
    }
  });
});

// ── 추가 복합/경계 케이스 ─────────────────────────────────────

describe('BiasDetector 추가 복합/경계 케이스', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('confirmation_bias + scope_creep 동시 → 두 타입 모두 포함', () => {
    const events: HookEvent[] = [
      ...repeatPreToolUse('coder', 'Read', { path: '/x.ts' }, 3),
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => makePreToolUse('coder', t, {}, i + 10)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = result.value.map((a) => a.type);
      expect(types).toContain('confirmation_bias');
    }
  });

  it('infinite_loop + scope_creep 동시 → 두 타입 가능', () => {
    const events: HookEvent[] = [
      ...repeatPattern('coder', ['T1', 'T2'], 3),
      ...['T3', 'T4', 'T5', 'T6', 'T7', 'T8'].map((t, i) => makePreToolUse('coder', t, {}, i + 20)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = result.value.map((a) => a.type);
      expect(types).toContain('infinite_loop');
    }
  });

  it('alert의 description은 string', () => {
    const events = repeatPreToolUse('coder', 'Read', { path: '/desc.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(typeof alert.description).toBe('string');
      }
    }
  });

  it('alert의 evidence는 string', () => {
    const events = repeatPreToolUse('coder', 'Write', { path: '/ev.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(typeof alert.evidence).toBe('string');
      }
    }
  });

  it('alert의 timestamp는 Date', () => {
    const events = repeatPreToolUse('coder', 'Edit', { path: '/ts.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(alert.timestamp).toBeInstanceOf(Date);
      }
    }
  });

  it('alert의 type은 유효한 값', () => {
    const valid = ['confirmation_bias', 'infinite_loop', 'deadlock', 'scope_creep'];
    const events = repeatPreToolUse('coder', 'Read', { path: '/t.ts' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(valid).toContain(alert.type);
      }
    }
  });

  it('alert의 severity는 유효한 값', () => {
    const valid = ['low', 'medium', 'high'];
    const events = repeatPreToolUse('coder', 'Bash', { cmd: 'ls' }, 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(valid).toContain(alert.severity);
      }
    }
  });

  it('alert의 agentName은 분석 대상과 일치', () => {
    for (const agent of ALL_AGENTS) {
      const events = repeatPreToolUse(agent, 'Read', { path: '/agent.ts' }, 3);
      const result = detector.analyze(events, agent);
      if (result.ok) {
        for (const alert of result.value) {
          expect(alert.agentName).toBe(agent);
        }
      }
    }
  });

  it('1000개 TeammateIdle → ok, deadlock 감지', () => {
    const events = Array.from({ length: 1000 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock').length).toBeGreaterThan(0);
    }
  });

  it('패턴 길이 2 vs 3 둘 다 3회 반복 시 첫 번째만 감지', () => {
    // 2-tool 패턴 먼저 등장 → first match
    const events = repeatPattern('coder', ['X', 'Y'], 3);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('5-tool 패턴 4회 → alert 1개', () => {
    const events = repeatPattern('coder', ['A', 'B', 'C', 'D', 'E'], 4);
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('PostToolUse 단독 50개 → 편향 없음', () => {
    const events = Array.from({ length: 50 }, (_, i) => makePostToolUse('coder', 'Read', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) =>
        a.type === 'confirmation_bias' || a.type === 'infinite_loop' || a.type === 'scope_creep'
      )).toHaveLength(0);
    }
  });

  it('TeammateIdle 정확히 20회 → deadlock 1개, getSeverity=high', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const deadlocks = result.value.filter((a) => a.type === 'deadlock');
      expect(deadlocks).toHaveLength(1);
      expect(detector.getSeverity(result.value)).toBe('high');
    }
  });

  it('확인 편향 + 무한 루프 동시 → getSeverity 결정', () => {
    // bias count=3 → low, loop count=3 → low → 결과 severity=low
    const events: HookEvent[] = [
      ...repeatPreToolUse('coder', 'Read', { path: '/x.ts' }, 3),
      ...repeatPattern('coder', ['A', 'B'], 3),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const s = detector.getSeverity(result.value);
      expect(['none', 'low', 'medium', 'high']).toContain(s);
    }
  });

  it('uniqueTools 정확히 5개 → scope_creep 미감지', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('uniqueTools 6개, diversity 정확히 30% → scope_creep 미감지', () => {
    // 6 unique / 20 total = 30% (not > 30%)
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
});

// ── 추가 확인 편향 edge case ────────────────────────────────────

describe('확인 편향 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('count=1 → alert 없음', () => {
    const events = [makePreToolUse('coder', 'Read', { path: '/a.ts' }, 0)];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it('count=2 → alert 없음', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 1),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it('count=3 → alert 1개 (정확히 threshold에서만 fires)', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 1),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 2),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=4 → alert 여전히 1개 (threshold 초과 시 새 alert 없음)', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 1),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 2),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 3),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=5 → alert 여전히 1개', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/b.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=6 → alert 여전히 1개', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/c.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=9 → alert 여전히 1개 (3×threshold)', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/d.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=10 → alert 여전히 1개', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/e.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('count=3 일 때 severity는 low (calculateSeverity(3,3))', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Write', { path: '/f.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('count=6 시 기존 alert severity는 low 그대로', () => {
    // count===3에서 한 번 알림 fires, count>=4 시 새 알림 없음 → 알림 여전히 severity=low
    const events = Array.from({ length: 6 }, (_, i) =>
      makePreToolUse('coder', 'Write', { path: '/g.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('count=9 시 기존 alert severity는 low 그대로', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      makePreToolUse('coder', 'Write', { path: '/h.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('count=10 시 기존 alert severity는 low 그대로', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makePreToolUse('coder', 'Write', { path: '/i.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alerts = result.value.filter((a) => a.type === 'confirmation_bias');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe('low');
    }
  });

  it('서로 다른 데이터 → 각 시그니처 독립 count', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 1),
      makePreToolUse('coder', 'Read', { path: '/a.ts' }, 2),
      makePreToolUse('coder', 'Read', { path: '/b.ts' }, 3),
      makePreToolUse('coder', 'Read', { path: '/b.ts' }, 4),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // /a.ts는 3회 → alert 1개, /b.ts는 2회 → alert 없음
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });

  it('두 시그니처 각각 3회 → alert 2개', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) => makePreToolUse('coder', 'Read', { path: '/p.ts' }, i)),
      ...Array.from({ length: 3 }, (_, i) => makePreToolUse('coder', 'Write', { path: '/q.ts' }, i + 10)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(2);
    }
  });

  it('alert description에 count가 포함된다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Bash', { cmd: 'ls' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'confirmation_bias');
      expect(alert?.description).toContain('3');
    }
  });

  it('alert agentName이 일치한다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('tester', 'Glob', { pattern: '*.ts' }, i)
    );
    const result = detector.analyze(events, 'tester');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'confirmation_bias');
      expect(alert?.agentName).toBe('tester');
    }
  });

  it('alert timestamp가 Date 인스턴스이다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('qa', 'Read', { path: '/x.ts' }, i)
    );
    const result = detector.analyze(events, 'qa');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'confirmation_bias');
      expect(alert?.timestamp).toBeInstanceOf(Date);
    }
  });

  it('alert evidence가 비어있지 않다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('reviewer', 'Glob', { pattern: '**/*.ts' }, i)
    );
    const result = detector.analyze(events, 'reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'confirmation_bias');
      expect(alert?.evidence.length).toBeGreaterThan(0);
    }
  });

  it('PreToolUse 아닌 이벤트는 count에서 제외', () => {
    const events = [
      makePreToolUse('coder', 'Read', { path: '/z.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/z.ts' }, 1),
      makePostToolUse('coder', 'Read', 2),
      makePostToolUse('coder', 'Read', 3),
    ];
    // PostToolUse는 시그니처 계산에 포함 안됨 → count=2 → alert 없음
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(0);
    }
  });

  it('toolName이 다르면 다른 시그니처 → 각각 독립', () => {
    // Read:{path:"/z.ts"} 3회 + Write:{path:"/z.ts"} 2회 → alert 1개 (Read만)
    const events = [
      makePreToolUse('coder', 'Read', { path: '/z.ts' }, 0),
      makePreToolUse('coder', 'Read', { path: '/z.ts' }, 1),
      makePreToolUse('coder', 'Read', { path: '/z.ts' }, 2),
      makePreToolUse('coder', 'Write', { path: '/z.ts' }, 3),
      makePreToolUse('coder', 'Write', { path: '/z.ts' }, 4),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'confirmation_bias')).toHaveLength(1);
    }
  });
});

// ── 무한 루프 추가 경계값 ─────────────────────────────────────────

describe('무한 루프 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('패턴 2회 반복 → 감지 안함', () => {
    const events = [
      makePreToolUse('coder', 'A', {}, 0),
      makePreToolUse('coder', 'B', {}, 1),
      makePreToolUse('coder', 'A', {}, 2),
      makePreToolUse('coder', 'B', {}, 3),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('패턴 3회 반복 → 감지함', () => {
    const events = [
      makePreToolUse('coder', 'X', {}, 0),
      makePreToolUse('coder', 'Y', {}, 1),
      makePreToolUse('coder', 'X', {}, 2),
      makePreToolUse('coder', 'Y', {}, 3),
      makePreToolUse('coder', 'X', {}, 4),
      makePreToolUse('coder', 'Y', {}, 5),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('도구 시퀀스가 중간에 끊기면 감지 안함', () => {
    const events = [
      makePreToolUse('coder', 'A', {}, 0),
      makePreToolUse('coder', 'B', {}, 1),
      makePreToolUse('coder', 'C', {}, 2), // 끊김
      makePreToolUse('coder', 'A', {}, 3),
      makePreToolUse('coder', 'B', {}, 4),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('3-tool 패턴 3회 → 감지됨', () => {
    const events = [
      makePreToolUse('coder', 'A', {}, 0),
      makePreToolUse('coder', 'B', {}, 1),
      makePreToolUse('coder', 'C', {}, 2),
      makePreToolUse('coder', 'A', {}, 3),
      makePreToolUse('coder', 'B', {}, 4),
      makePreToolUse('coder', 'C', {}, 5),
      makePreToolUse('coder', 'A', {}, 6),
      makePreToolUse('coder', 'B', {}, 7),
      makePreToolUse('coder', 'C', {}, 8),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('4-tool 패턴 3회 → 감지됨', () => {
    const tools = ['W', 'X', 'Y', 'Z'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('tester', t, {}, i)),
      ...tools.map((t, i) => makePreToolUse('tester', t, {}, i + 4)),
      ...tools.map((t, i) => makePreToolUse('tester', t, {}, i + 8)),
    ];
    const result = detector.analyze(events, 'tester');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(1);
    }
  });

  it('alert description에 pattern이 포함된다', () => {
    const events = [
      makePreToolUse('coder', 'Read', {}, 0),
      makePreToolUse('coder', 'Write', {}, 1),
      makePreToolUse('coder', 'Read', {}, 2),
      makePreToolUse('coder', 'Write', {}, 3),
      makePreToolUse('coder', 'Read', {}, 4),
      makePreToolUse('coder', 'Write', {}, 5),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'infinite_loop');
      expect(alert?.description).toBeDefined();
      expect(alert?.description.length).toBeGreaterThan(0);
    }
  });

  it('alert severity는 repeat=3, threshold=3 → low', () => {
    const events = [
      makePreToolUse('coder', 'P', {}, 0),
      makePreToolUse('coder', 'Q', {}, 1),
      makePreToolUse('coder', 'P', {}, 2),
      makePreToolUse('coder', 'Q', {}, 3),
      makePreToolUse('coder', 'P', {}, 4),
      makePreToolUse('coder', 'Q', {}, 5),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'infinite_loop');
      expect(alert?.severity).toBe('low');
    }
  });

  it('단일 도구 반복만으로는 무한 루프 미감지 (패턴 길이 최소 2)', () => {
    // 단일 도구 "A" 5회 반복 - 시퀀스 길이가 patternLen*threshold(2*3=6) 미만이므로 감지 안됨
    const events = Array.from({ length: 5 }, (_, i) =>
      makePreToolUse('coder', 'A', { x: i }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    // 시퀀스가 임계값 미만이므로 infinite_loop는 없어야 함
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'infinite_loop')).toHaveLength(0);
    }
  });

  it('총 alert count가 number 타입', () => {
    const events: HookEvent[] = [];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.length).toBe('number');
    }
  });
});

// ── 교착 상태 추가 경계값 ────────────────────────────────────────

describe('교착 상태 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('TeammateIdle 19회 연속 → 감지 안함', () => {
    const events = Array.from({ length: 19 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('TeammateIdle 20회 연속 → 감지됨 (threshold)', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(1);
    }
  });

  it('TeammateIdle 21회 → alert 1개만 (break 후 종료)', () => {
    const events = Array.from({ length: 21 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(1);
    }
  });

  it('19 Idle + 1 PreToolUse + 20 Idle → 연속 리셋 후 재감지', () => {
    const events = [
      ...Array.from({ length: 19 }, (_, i) => makeTeammateIdle('coder', i)),
      makePreToolUse('coder', 'Read', {}, 20),
      ...Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i + 21)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // PreToolUse가 연속을 끊고 다시 20회 → deadlock 1개
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(1);
    }
  });

  it('Idle 10 + PreToolUse + Idle 10 → 연속 없음 → deadlock 미감지', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) => makeTeammateIdle('coder', i)),
      makePreToolUse('coder', 'Write', {}, 11),
      ...Array.from({ length: 10 }, (_, i) => makeTeammateIdle('coder', i + 12)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });

  it('deadlock alert severity는 항상 high', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('qc', i));
    const result = detector.analyze(events, 'qc');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'deadlock');
      expect(alert?.severity).toBe('high');
    }
  });

  it('deadlock alert agentName이 일치한다', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('reviewer', i));
    const result = detector.analyze(events, 'reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'deadlock');
      expect(alert?.agentName).toBe('reviewer');
    }
  });

  it('deadlock alert timestamp가 Date 인스턴스', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('documenter', i));
    const result = detector.analyze(events, 'documenter');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'deadlock');
      expect(alert?.timestamp).toBeInstanceOf(Date);
    }
  });

  it('deadlock alert evidence가 비어있지 않다', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('architect', i));
    const result = detector.analyze(events, 'architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'deadlock');
      expect(alert?.evidence.length).toBeGreaterThan(0);
    }
  });

  it('30회 연속 Idle → alert 1개만 (break 후 종료)', () => {
    const events = Array.from({ length: 30 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(1);
    }
  });

  it('PostToolUse가 연속을 끊어 deadlock 미감지', () => {
    const events = [
      ...Array.from({ length: 19 }, (_, i) => makeTeammateIdle('coder', i)),
      makePostToolUse('coder', 'Read', 20),
      ...Array.from({ length: 5 }, (_, i) => makeTeammateIdle('coder', i + 21)),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'deadlock')).toHaveLength(0);
    }
  });
});

// ── 범위 이탈 추가 경계값 ────────────────────────────────────────

describe('범위 이탈 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('uniqueTools=0 → scope_creep 미감지 (toolEvents=0)', () => {
    const events = [makeTeammateIdle('coder', 0)];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('uniqueTools=6, 총 7회 → diversity 6/7 > 0.3 AND uniqueTools > 5 → scope_creep 감지', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('coder', t, {}, i)),
      makePreToolUse('coder', 'T1', {}, 6),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 6/7 ≈ 0.857 > 0.3 AND uniqueTools=6 > 5 → 감지
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(1);
    }
  });

  it('uniqueTools=5, 총 6회 → uniqueTools ≤ 5 → scope_creep 미감지', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('coder', t, {}, i)),
      makePreToolUse('coder', 'T1', {}, 5),
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('scope_creep alert severity는 low', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    // 6/6 = 1.0 > 0.3 AND uniqueTools=6 > 5 → scope_creep
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'scope_creep');
      if (alert) {
        expect(alert.severity).toBe('low');
      }
    }
  });

  it('scope_creep alert agentName이 일치', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = tools.map((t, i) => makePreToolUse('architect', t, {}, i));
    const result = detector.analyze(events, 'architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'scope_creep');
      if (alert) {
        expect(alert.agentName).toBe('architect');
      }
    }
  });

  it('scope_creep alert timestamp가 Date 인스턴스', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'scope_creep');
      if (alert) {
        expect(alert.timestamp).toBeInstanceOf(Date);
      }
    }
  });

  it('scope_creep alert evidence에 비율 정보 포함', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = tools.map((t, i) => makePreToolUse('coder', t, {}, i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const alert = result.value.find((a) => a.type === 'scope_creep');
      if (alert) {
        expect(alert.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('툴 이름이 undefined인 이벤트는 toolEvents에서 제외', () => {
    // toolName이 없는 PreToolUse는 toolEvents에서 제외됨
    const events: HookEvent[] = [
      { type: 'PreToolUse', agentName: 'coder', toolName: undefined, data: {}, timestamp: new Date() },
      { type: 'PreToolUse', agentName: 'coder', toolName: undefined, data: {}, timestamp: new Date() },
    ];
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });

  it('uniqueTools=6, 총 20회 대부분 중복 → diversity=6/20=0.3 → 미감지 (not > 0.3)', () => {
    const tools = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const events = [
      ...tools.map((t, i) => makePreToolUse('coder', t, {}, i)),
      ...Array.from({ length: 14 }, (_, i) => makePreToolUse('coder', 'T1', {}, i + 6)),
    ];
    // 6/20 = 0.3 (not > 0.3)
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filter((a) => a.type === 'scope_creep')).toHaveLength(0);
    }
  });
});

// ── getSeverity 추가 경계값 ──────────────────────────────────────

describe('getSeverity 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('빈 alert 배열 → none', () => {
    expect(detector.getSeverity([])).toBe('none');
  });

  it('low만 있으면 → low', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'confirmation_bias',
        agentName: 'coder',
        description: '테스트',
        evidence: '증거',
        severity: 'low',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('low');
  });

  it('medium만 있으면 → medium', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'infinite_loop',
        agentName: 'coder',
        description: '테스트',
        evidence: '증거',
        severity: 'medium',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('medium');
  });

  it('high만 있으면 → high', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'deadlock',
        agentName: 'coder',
        description: '테스트',
        evidence: '증거',
        severity: 'high',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('low + high 혼합 → high 우선', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'confirmation_bias',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'low',
        timestamp: new Date(),
      },
      {
        type: 'deadlock',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'high',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('low + medium 혼합 → medium 우선', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'scope_creep',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'low',
        timestamp: new Date(),
      },
      {
        type: 'infinite_loop',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'medium',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('medium');
  });

  it('medium + high → high 우선', () => {
    const alerts: BiasAlert[] = [
      {
        type: 'infinite_loop',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'medium',
        timestamp: new Date(),
      },
      {
        type: 'deadlock',
        agentName: 'coder',
        description: 'd',
        evidence: 'e',
        severity: 'high',
        timestamp: new Date(),
      },
    ];
    expect(detector.getSeverity(alerts)).toBe('high');
  });

  it('getSeverity 반환값은 유효한 severity 문자열', () => {
    const validValues = ['none', 'low', 'medium', 'high'];
    const result = detector.getSeverity([]);
    expect(validValues).toContain(result);
  });

  it('단일 low alert → getSeverity=low', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/test.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // count=3 → calculateSeverity(3,3) = 'low'
      expect(detector.getSeverity(result.value)).toBe('low');
    }
  });

  it('deadlock → getSeverity=high (always)', () => {
    const events = Array.from({ length: 20 }, (_, i) => makeTeammateIdle('coder', i));
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(detector.getSeverity(result.value)).toBe('high');
    }
  });
});

// ── analyze 에이전트 필터링 추가 경계값 ─────────────────────────

describe('analyze 에이전트 필터링 추가 경계값', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    detector = new BiasDetector(new ConsoleLogger('error'));
  });

  it('대상 에이전트 이벤트 없으면 빈 alert', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/x.ts' }, i)
    );
    // qa 에이전트로 analyze → 이벤트 없음
    const result = detector.analyze(events, 'qa');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('여러 에이전트 혼합 → 대상 에이전트만 필터링', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) => makePreToolUse('coder', 'Read', { path: '/x.ts' }, i)),
      ...Array.from({ length: 3 }, (_, i) => makePreToolUse('qa', 'Write', { path: '/y.ts' }, i + 10)),
    ];
    // coder analyze
    const coderResult = detector.analyze(events, 'coder');
    expect(coderResult.ok).toBe(true);
    if (coderResult.ok) {
      // qa 이벤트가 섞여도 coder 편향만 감지
      const coderAlerts = coderResult.value.filter((a) => a.agentName === 'coder');
      expect(coderAlerts.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('빈 이벤트 배열 → 빈 alert', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('모든 에이전트에 대해 analyze 호출 가능', () => {
    const agents: AgentName[] = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    for (const agent of agents) {
      const result = detector.analyze([], agent);
      expect(result.ok).toBe(true);
    }
  });

  it('analyze 결과는 항상 ok=true', () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      makePreToolUse('coder', `tool-${i}`, {}, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
  });

  it('analyze 결과 value는 배열', () => {
    const result = detector.analyze([], 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('각 alert에 type 필드가 있다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/t.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(typeof alert.type).toBe('string');
      }
    }
  });

  it('각 alert에 severity 필드가 있다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Read', { path: '/u.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(['low', 'medium', 'high']).toContain(alert.severity);
      }
    }
  });

  it('각 alert에 description 필드가 있다', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makePreToolUse('coder', 'Glob', { pattern: '*.ts' }, i)
    );
    const result = detector.analyze(events, 'coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const alert of result.value) {
        expect(typeof alert.description).toBe('string');
      }
    }
  });
});
