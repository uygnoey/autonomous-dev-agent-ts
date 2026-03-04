/**
 * BiasDetector 단위 테스트 / BiasDetector unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { BiasDetector } from '../../../src/layer2/bias-detector.js';
import type { HookEvent } from '../../../src/layer2/types.js';

describe('BiasDetector', () => {
  let detector: BiasDetector;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    detector = new BiasDetector(logger);
  });

  describe('확인 편향 감지 / Confirmation bias detection', () => {
    it('같은 쿼리가 3회 반복되면 감지한다', () => {
      const events: HookEvent[] = Array.from({ length: 3 }, (_, i) => ({
        type: 'PreToolUse' as const,
        agentName: 'coder' as const,
        toolName: 'Read',
        data: { path: '/same/file.ts' },
        timestamp: new Date(Date.now() + i * 1000),
      }));

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const biasAlerts = result.value.filter((a) => a.type === 'confirmation_bias');
        expect(biasAlerts.length).toBeGreaterThan(0);
      }
    });

    it('다른 쿼리는 감지하지 않는다', () => {
      const events: HookEvent[] = [
        {
          type: 'PreToolUse',
          agentName: 'coder',
          toolName: 'Read',
          data: { path: '/file1.ts' },
          timestamp: new Date(),
        },
        {
          type: 'PreToolUse',
          agentName: 'coder',
          toolName: 'Read',
          data: { path: '/file2.ts' },
          timestamp: new Date(),
        },
        {
          type: 'PreToolUse',
          agentName: 'coder',
          toolName: 'Write',
          data: { path: '/file3.ts' },
          timestamp: new Date(),
        },
      ];

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const biasAlerts = result.value.filter((a) => a.type === 'confirmation_bias');
        expect(biasAlerts).toHaveLength(0);
      }
    });
  });

  describe('무한 루프 감지 / Infinite loop detection', () => {
    it('같은 도구 시퀀스가 3회 반복되면 감지한다', () => {
      const pattern = ['Read', 'Write'];
      const events: HookEvent[] = [];

      // 패턴을 3회 반복
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const tool of pattern) {
          events.push({
            type: 'PreToolUse',
            agentName: 'coder',
            toolName: tool,
            data: {},
            timestamp: new Date(Date.now() + events.length * 1000),
          });
        }
      }

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const loopAlerts = result.value.filter((a) => a.type === 'infinite_loop');
        expect(loopAlerts.length).toBeGreaterThan(0);
      }
    });
  });

  describe('교착 상태 감지 / Deadlock detection', () => {
    it('연속 TeammateIdle이 임계값을 초과하면 감지한다', () => {
      const events: HookEvent[] = Array.from({ length: 25 }, (_, i) => ({
        type: 'TeammateIdle' as const,
        agentName: 'coder' as const,
        data: {},
        timestamp: new Date(Date.now() + i * 1000),
      }));

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const deadlockAlerts = result.value.filter((a) => a.type === 'deadlock');
        expect(deadlockAlerts.length).toBeGreaterThan(0);
      }
    });

    it('활동 중간에 Idle이 있으면 감지하지 않는다', () => {
      const events: HookEvent[] = [
        {
          type: 'TeammateIdle',
          agentName: 'coder',
          data: {},
          timestamp: new Date(),
        },
        {
          type: 'PreToolUse',
          agentName: 'coder',
          toolName: 'Read',
          data: {},
          timestamp: new Date(),
        },
        {
          type: 'TeammateIdle',
          agentName: 'coder',
          data: {},
          timestamp: new Date(),
        },
      ];

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const deadlockAlerts = result.value.filter((a) => a.type === 'deadlock');
        expect(deadlockAlerts).toHaveLength(0);
      }
    });
  });

  describe('getSeverity / 심각도 평가', () => {
    it('알림이 없으면 none을 반환한다', () => {
      expect(detector.getSeverity([])).toBe('none');
    });

    it('high 알림이 있으면 high를 반환한다', () => {
      const alerts = [
        {
          type: 'deadlock' as const,
          agentName: 'coder' as const,
          description: '교착 상태',
          evidence: '증거',
          severity: 'high' as const,
          timestamp: new Date(),
        },
      ];
      expect(detector.getSeverity(alerts)).toBe('high');
    });

    it('medium 알림만 있으면 medium을 반환한다', () => {
      const alerts = [
        {
          type: 'infinite_loop' as const,
          agentName: 'coder' as const,
          description: '무한 루프',
          evidence: '증거',
          severity: 'medium' as const,
          timestamp: new Date(),
        },
      ];
      expect(detector.getSeverity(alerts)).toBe('medium');
    });

    it('low 알림만 있으면 low를 반환한다', () => {
      const alerts = [
        {
          type: 'scope_creep' as const,
          agentName: 'coder' as const,
          description: '범위 이탈',
          evidence: '증거',
          severity: 'low' as const,
          timestamp: new Date(),
        },
      ];
      expect(detector.getSeverity(alerts)).toBe('low');
    });
  });

  describe('다른 에이전트 이벤트 무시 / Ignores other agent events', () => {
    it('분석 대상이 아닌 에이전트의 이벤트를 무시한다', () => {
      const events: HookEvent[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'PreToolUse' as const,
        agentName: 'architect' as const,
        toolName: 'Read',
        data: { path: '/same.ts' },
        timestamp: new Date(Date.now() + i * 1000),
      }));

      const result = detector.analyze(events, 'coder');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
