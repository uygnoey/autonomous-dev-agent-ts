import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { Planner } from '../../../src/layer1/planner.js';
import type { ConversationMessage } from '../../../src/layer1/types.js';

function createMessage(role: 'user' | 'assistant', content: string): ConversationMessage {
  return {
    id: `msg-${crypto.randomUUID()}`,
    role,
    content,
    timestamp: new Date('2026-03-04T00:00:00Z'),
    projectId: 'proj-test',
  };
}

describe('Planner', () => {
  let planner: Planner;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    planner = new Planner(logger);
  });

  // ── createPlan ──────────────────────────────────────────────

  describe('createPlan', () => {
    it('대화로부터 기획 문서를 생성한다', () => {
      const conversations = [
        createMessage('user', '인증 시스템을 만들어 주세요'),
        createMessage('assistant', 'JWT 기반 인증을 제안합니다'),
      ];

      const result = planner.createPlan('proj-test', conversations);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('proj-test');
        expect(result.value).toContain('인증 시스템을 만들어 주세요');
      }
    });

    it('user 메시지만 Goals 섹션에 포함한다', () => {
      const conversations = [
        createMessage('user', '기능 A 구현'),
        createMessage('assistant', '분석 결과 B'),
        createMessage('user', '기능 C 추가'),
      ];

      const result = planner.createPlan('proj-test', conversations);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('기능 A 구현');
        expect(result.value).toContain('기능 C 추가');
      }
    });

    it('assistant 메시지는 Analysis 섹션에 포함한다', () => {
      const conversations = [
        createMessage('user', '요청'),
        createMessage('assistant', '분석 내용'),
      ];

      const result = planner.createPlan('proj-test', conversations);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Analysis');
        expect(result.value).toContain('분석 내용');
      }
    });

    it('대화가 없으면 에러를 반환한다', () => {
      const result = planner.createPlan('proj-test', []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_insufficient_data');
      }
    });

    it('단일 대화로도 기획을 생성한다', () => {
      const conversations = [createMessage('user', '단일 요청')];

      const result = planner.createPlan('proj-test', conversations);

      expect(result.ok).toBe(true);
    });
  });

  // ── extractFeatures ─────────────────────────────────────────

  describe('extractFeatures', () => {
    it('### 헤더에서 기능을 추출한다', () => {
      const plan = [
        '## Features',
        '',
        '### Login System',
        'Login feature description',
        '',
        '### User Profile',
        'Profile feature description',
      ].join('\n');

      const result = planner.extractFeatures(plan);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        expect(result.value[0]?.name).toBe('Login System');
        expect(result.value[1]?.name).toBe('User Profile');
      }
    });

    it('기능 헤더가 없으면 기본 기능 하나를 생성한다', () => {
      const plan = '일반 텍스트 기획 문서';

      const result = planner.extractFeatures(plan);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.name).toBe('Main Feature');
      }
    });

    it('빈 기획 문서에 대해 에러를 반환한다', () => {
      const result = planner.extractFeatures('');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_plan');
      }
    });

    it('공백만 있는 기획 문서에 대해 에러를 반환한다', () => {
      const result = planner.extractFeatures('   \n  \n  ');

      expect(result.ok).toBe(false);
    });

    it('추출된 기능에 고유 ID가 할당된다', () => {
      const plan = '### Feature A\n### Feature B\n### Feature C';

      const result = planner.extractFeatures(plan);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.value.map((f) => f.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });
  });
});
