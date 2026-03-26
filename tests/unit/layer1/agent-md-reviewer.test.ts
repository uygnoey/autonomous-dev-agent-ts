/**
 * AgentMdReviewer 단위 테스트 / AgentMdReviewer unit tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Logger } from '../../../src/core/logger.js';
import type { AgentName } from '../../../src/core/types.js';
import { ALL_AGENT_NAMES } from '../../../src/layer1/agent-md-generator-instructions.js';
import { AgentMdReviewer } from '../../../src/layer1/agent-md-reviewer.js';
import type { AgentMdReviewInput } from '../../../src/layer1/agent-md-reviewer.js';

// ── 테스트 헬퍼 / Test helpers ──────────────────────────────

function createMockLogger(): Logger {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => createMockLogger(),
  } as unknown as Logger;
}

function createDrafts(): Record<AgentName, string> {
  const drafts: Partial<Record<AgentName, string>> = {};
  for (const name of ALL_AGENT_NAMES) {
    drafts[name] = `# ${name} agent guide\n\nThis is the draft for ${name}.`;
  }
  return drafts as Record<AgentName, string>;
}

/**
 * 응답 큐 기반 mock input / Queue-based mock input
 *
 * @description
 * KR: 순서대로 응답을 반환하는 mock 입력 제공자
 * EN: Mock input provider that returns responses in order
 */
function createMockInput(responses: Array<{ type: string; text?: string }>): AgentMdReviewInput & {
  messages: string[];
  successMessages: string[];
} {
  let responseIndex = 0;
  const messages: string[] = [];
  const successMessages: string[] = [];

  return {
    messages,
    successMessages,
    system(msg: string) {
      messages.push(msg);
    },
    success(msg: string) {
      successMessages.push(msg);
    },
    async waitForInput() {
      if (responseIndex >= responses.length) {
        return { type: 'interrupt' };
      }
      const response = responses[responseIndex]!;
      responseIndex += 1;
      return response;
    },
  };
}

// ── 테스트 ────────────────────────────────────────────────────

describe('AgentMdReviewer', () => {
  let reviewer: AgentMdReviewer;
  let drafts: Record<AgentName, string>;

  beforeEach(() => {
    reviewer = new AgentMdReviewer(createMockLogger());
    drafts = createDrafts();
  });

  describe('reviewAll', () => {
    it('모든 에이전트를 순서대로 approve하면 원본 그대로 반환', async () => {
      // WHY: 7개 에이전트 각각 approve 응답
      const responses = ALL_AGENT_NAMES.map(() => ({ type: 'message', text: 'approve' }));
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      for (const name of ALL_AGENT_NAMES) {
        expect(result[name]).toBe(drafts[name]);
      }
    });

    it('approve_all 입력 시 현재 + 나머지 모두 원본 그대로 반환', async () => {
      // WHY: 첫 번째 에이전트에서 approve_all → 나머지 6개 자동 승인
      const responses = [{ type: 'message', text: 'approve_all' }];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      for (const name of ALL_AGENT_NAMES) {
        expect(result[name]).toBe(drafts[name]);
      }
      // WHY: 나머지 6개는 자동 승인 메시지가 출력되어야 함
      const autoApproveMessages = input.successMessages.filter((m) => m.includes('자동 승인'));
      expect(autoApproveMessages.length).toBe(ALL_AGENT_NAMES.length - 1);
    });

    it('한국어 일괄승인 키워드도 동작', async () => {
      const responses = [{ type: 'message', text: '일괄승인' }];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      for (const name of ALL_AGENT_NAMES) {
        expect(result[name]).toBe(drafts[name]);
      }
    });

    it('전체승인 키워드도 동작', async () => {
      const responses = [{ type: 'message', text: '전체승인' }];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      for (const name of ALL_AGENT_NAMES) {
        expect(result[name]).toBe(drafts[name]);
      }
    });

    it('skip 시 원본 유지', async () => {
      // WHY: 첫 번째 skip, 나머지 approve_all
      const responses = [
        { type: 'message', text: 'skip' },
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      // WHY: skip해도 원본이 유지됨
      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('한국어 승인 키워드 동작', async () => {
      const responses = ALL_AGENT_NAMES.map(() => ({ type: 'message', text: '승인' }));
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      for (const name of ALL_AGENT_NAMES) {
        expect(result[name]).toBe(drafts[name]);
      }
    });

    it('edit 시 수정된 내용으로 교체', async () => {
      const editedContent = '# 수정된 architect 문서\n\n이것은 수정본입니다.';
      const responses = [
        { type: 'message', text: 'edit' },
        { type: 'message', text: '# 수정된 architect 문서' },
        { type: 'message', text: '' },  // 빈 줄 = 입력 종료
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe('# 수정된 architect 문서');
    });

    it('edit 후 cancel 시 원본 유지', async () => {
      const responses = [
        { type: 'message', text: 'edit' },
        { type: 'message', text: 'cancel' },
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('edit 후 빈 입력만 있으면 원본 유지', async () => {
      const responses = [
        { type: 'message', text: 'edit' },
        { type: 'message', text: '' },  // 즉시 빈 줄 = 수정 없음
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      // WHY: 수정 내용 없으면 skip으로 처리되어 원본 유지
      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('interrupt 시 현재 초안 승인으로 처리', async () => {
      const responses = [{ type: 'interrupt' }];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      // WHY: 인터럽트 → 나머지는 더 이상 응답 없으므로 전부 interrupt → approve
      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('eof 시 현재 초안 승인으로 처리', async () => {
      const responses = [{ type: 'eof' }];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('잘못된 입력 후 올바른 입력으로 진행', async () => {
      const responses = [
        { type: 'message', text: 'invalid_command' },
        { type: 'message', text: 'approve' },
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      // WHY: 잘못된 입력 후 approve → approve_all 로 모두 승인
      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
      // WHY: '잘못된 입력' 메시지가 출력되어야 함
      const errorMessages = input.messages.filter((m) => m.includes('잘못된 입력'));
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('edit에서 여러 줄 입력 시 줄바꿈으로 결합', async () => {
      const responses = [
        { type: 'message', text: 'edit' },
        { type: 'message', text: '줄1' },
        { type: 'message', text: '줄2' },
        { type: 'message', text: '줄3' },
        { type: 'message', text: '' },  // 종료
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe('줄1\n줄2\n줄3');
    });

    it('50줄 초과 초안은 미리보기 잘림 메시지 표시', async () => {
      // WHY: 긴 초안 생성
      const longDraft = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
      drafts[ALL_AGENT_NAMES[0]!] = longDraft;

      const responses = [{ type: 'message', text: 'approve_all' }];
      const input = createMockInput(responses);

      await reviewer.reviewAll(drafts, input);

      // WHY: '줄 더 있음' 메시지가 출력되어야 함
      const truncMessages = input.messages.filter((m) => m.includes('줄 더 있음'));
      expect(truncMessages.length).toBe(1);
    });

    it('한국어 수정/취소 키워드 동작', async () => {
      const responses = [
        { type: 'message', text: '수정' },
        { type: 'message', text: '취소' },
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });

    it('한국어 건너뜀/스킵 키워드 동작', async () => {
      const responses = [
        { type: 'message', text: '건너뜀' },
        { type: 'message', text: '스킵' },
        { type: 'message', text: 'approve_all' },
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
      expect(result[ALL_AGENT_NAMES[1]!]).toBe(drafts[ALL_AGENT_NAMES[1]!]);
    });

    it('edit 중 interrupt 시 원본 유지', async () => {
      const responses = [
        { type: 'message', text: 'edit' },
        { type: 'message', text: '일부 수정 중...' },
        { type: 'interrupt' },
        // WHY: interrupt 후 나머지는 전부 interrupt로 approve됨
      ];
      const input = createMockInput(responses);

      const result = await reviewer.reviewAll(drafts, input);

      // WHY: edit 중 interrupt → 원본 유지 (skip)
      expect(result[ALL_AGENT_NAMES[0]!]).toBe(drafts[ALL_AGENT_NAMES[0]!]);
    });
  });
});
