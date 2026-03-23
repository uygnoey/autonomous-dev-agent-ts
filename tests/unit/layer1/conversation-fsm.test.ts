/**
 * ConversationFsm 단위 테스트
 *
 * @description
 * KR: Phase FSM 상태 전환, 확정 키워드 감지, 시스템 프롬프트 생성 테스트.
 *     80%+ 경계값/에지 케이스 비율.
 * EN: Tests for phase FSM transitions, confirmation detection, system prompt generation.
 *     80%+ edge/boundary case ratio.
 */

import { describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ConversationFsm } from 'layer1/conversation-fsm.js';
import {
  CONFIRMATION_KEYWORDS,
  type ConversationPhase,
  PHASE_SYSTEM_PROMPTS,
  PHASE_TRANSITIONS,
} from 'layer1/conversation-types.js';

const logger = new ConsoleLogger('error');

// ── 생성자 / Constructor ────────────────────────────────────────

describe('ConversationFsm 생성자', () => {
  it('기본 Phase는 IDEA이다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.currentPhase).toBe('IDEA');
  });

  it('초기 Phase를 지정할 수 있다', () => {
    const fsm = new ConversationFsm(logger, 'PLANNING');
    expect(fsm.currentPhase).toBe('PLANNING');
  });

  it('모든 Phase로 초기화할 수 있다', () => {
    const phases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES', 'CONFIRMED', 'CONTRACT',
    ];
    for (const phase of phases) {
      const fsm = new ConversationFsm(logger, phase);
      expect(fsm.currentPhase).toBe(phase);
    }
  });
});

// ── getSystemPrompt ─────────────────────────────────────────────

describe('ConversationFsm getSystemPrompt', () => {
  it('각 Phase별 시스템 프롬프트를 반환한다', () => {
    const phases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES', 'CONFIRMED', 'CONTRACT',
    ];
    for (const phase of phases) {
      const fsm = new ConversationFsm(logger, phase);
      expect(fsm.getSystemPrompt()).toBe(PHASE_SYSTEM_PROMPTS[phase]);
    }
  });

  it('IDEA Phase 프롬프트에 "개발" 금지 관련 내용이 포함된다', () => {
    const fsm = new ConversationFsm(logger, 'IDEA');
    const prompt = fsm.getSystemPrompt();
    expect(prompt).toContain('개발');
    expect(prompt).toContain('절대');
  });

  it('PLANNING Phase 프롬프트에 기획 관련 내용이 포함된다', () => {
    const fsm = new ConversationFsm(logger, 'PLANNING');
    const prompt = fsm.getSystemPrompt();
    expect(prompt).toContain('기획');
  });

  it('시스템 프롬프트는 비어 있지 않다', () => {
    const phases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES', 'CONFIRMED', 'CONTRACT',
    ];
    for (const phase of phases) {
      const fsm = new ConversationFsm(logger, phase);
      expect(fsm.getSystemPrompt().length).toBeGreaterThan(0);
    }
  });
});

// ── detectConfirmation ──────────────────────────────────────────

describe('ConversationFsm detectConfirmation', () => {
  it('한국어 확정 키워드를 감지한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('이 방향으로 확정할게')).toBe(true);
    expect(fsm.detectConfirmation('확인했습니다')).toBe(true);
    expect(fsm.detectConfirmation('다음 단계로 진행해줘')).toBe(true);
    expect(fsm.detectConfirmation('좋아 이걸로 하자')).toBe(true);
  });

  it('영어 확정 키워드를 감지한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('confirm this')).toBe(true);
    expect(fsm.detectConfirmation('approved')).toBe(true);
    expect(fsm.detectConfirmation('next please')).toBe(true);
    expect(fsm.detectConfirmation('ok')).toBe(true);
    expect(fsm.detectConfirmation('LGTM')).toBe(true);
  });

  it('대소문자를 구분하지 않는다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('CONFIRM')).toBe(true);
    expect(fsm.detectConfirmation('Ok')).toBe(true);
    expect(fsm.detectConfirmation('LGTM')).toBe(true);
  });

  it('확정 키워드가 없으면 false를 반환한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('이 기능을 더 설명해줘')).toBe(false);
    expect(fsm.detectConfirmation('다른 방법은 없을까?')).toBe(false);
    expect(fsm.detectConfirmation('잘 모르겠어')).toBe(false);
  });

  it('빈 문자열에 대해 false를 반환한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('')).toBe(false);
  });

  it('공백만 있는 입력에 대해 false를 반환한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('   ')).toBe(false);
  });

  it('모든 등록된 키워드를 감지한다', () => {
    const fsm = new ConversationFsm(logger);
    for (const keyword of CONFIRMATION_KEYWORDS) {
      expect(fsm.detectConfirmation(keyword)).toBe(true);
    }
  });

  it('키워드가 문장 중간에 있어도 감지한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.detectConfirmation('네 좋아 이거로 가자')).toBe(true);
    expect(fsm.detectConfirmation('I think this is ok to go')).toBe(true);
  });
});

// ── advancePhase ────────────────────────────────────────────────

describe('ConversationFsm advancePhase', () => {
  it('IDEA에서 PLANNING으로 전환한다', () => {
    const fsm = new ConversationFsm(logger, 'IDEA');
    const result = fsm.advancePhase();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('PLANNING');
    }
    expect(fsm.currentPhase).toBe('PLANNING');
  });

  it('전체 Phase 체인을 순서대로 순회할 수 있다', () => {
    const fsm = new ConversationFsm(logger, 'IDEA');
    const expectedOrder: ConversationPhase[] = [
      'PLANNING', 'DESIGN', 'UI_DESIGN', 'STACK',
      'DOCS', 'TEST_TYPES', 'CONFIRMED', 'CONTRACT',
    ];

    for (const expected of expectedOrder) {
      const result = fsm.advancePhase();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expected);
      }
      expect(fsm.currentPhase).toBe(expected);
    }
  });

  it('CONTRACT(최종 상태)에서 더 이상 전환할 수 없다', () => {
    const fsm = new ConversationFsm(logger, 'CONTRACT');
    const result = fsm.advancePhase();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_fsm_terminal');
    }
  });

  it('CONTRACT에서 전환 실패해도 Phase가 변하지 않는다', () => {
    const fsm = new ConversationFsm(logger, 'CONTRACT');
    fsm.advancePhase();
    expect(fsm.currentPhase).toBe('CONTRACT');
  });

  it('각 Phase에서 다음 Phase가 PHASE_TRANSITIONS와 일치한다', () => {
    const phases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES', 'CONFIRMED',
    ];
    for (const phase of phases) {
      const fsm = new ConversationFsm(logger, phase);
      const result = fsm.advancePhase();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(PHASE_TRANSITIONS[phase]);
      }
    }
  });
});

// ── isConfirmed ─────────────────────────────────────────────────

describe('ConversationFsm isConfirmed', () => {
  it('CONFIRMED Phase에서 true를 반환한다', () => {
    const fsm = new ConversationFsm(logger, 'CONFIRMED');
    expect(fsm.isConfirmed()).toBe(true);
  });

  it('CONTRACT Phase에서 true를 반환한다', () => {
    const fsm = new ConversationFsm(logger, 'CONTRACT');
    expect(fsm.isConfirmed()).toBe(true);
  });

  it('IDEA Phase에서 false를 반환한다', () => {
    const fsm = new ConversationFsm(logger);
    expect(fsm.isConfirmed()).toBe(false);
  });

  it('CONFIRMED 이전의 모든 Phase에서 false를 반환한다', () => {
    const preConfirmPhases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES',
    ];
    for (const phase of preConfirmPhases) {
      const fsm = new ConversationFsm(logger, phase);
      expect(fsm.isConfirmed()).toBe(false);
    }
  });
});

// ── isContractPhase ─────────────────────────────────────────────

describe('ConversationFsm isContractPhase', () => {
  it('CONTRACT Phase에서 true를 반환한다', () => {
    const fsm = new ConversationFsm(logger, 'CONTRACT');
    expect(fsm.isContractPhase()).toBe(true);
  });

  it('CONFIRMED Phase에서 false를 반환한다', () => {
    const fsm = new ConversationFsm(logger, 'CONFIRMED');
    expect(fsm.isContractPhase()).toBe(false);
  });

  it('CONTRACT 외 모든 Phase에서 false를 반환한다', () => {
    const nonContractPhases: ConversationPhase[] = [
      'IDEA', 'PLANNING', 'DESIGN', 'UI_DESIGN',
      'STACK', 'DOCS', 'TEST_TYPES', 'CONFIRMED',
    ];
    for (const phase of nonContractPhases) {
      const fsm = new ConversationFsm(logger, phase);
      expect(fsm.isContractPhase()).toBe(false);
    }
  });
});

// ── setPhase ────────────────────────────────────────────────────

describe('ConversationFsm setPhase', () => {
  it('임의의 Phase로 직접 전환할 수 있다', () => {
    const fsm = new ConversationFsm(logger);
    fsm.setPhase('STACK');
    expect(fsm.currentPhase).toBe('STACK');
  });

  it('CONTRACT에서 IDEA로 되돌릴 수 있다', () => {
    const fsm = new ConversationFsm(logger, 'CONTRACT');
    fsm.setPhase('IDEA');
    expect(fsm.currentPhase).toBe('IDEA');
  });

  it('같은 Phase로 설정해도 에러가 발생하지 않는다', () => {
    const fsm = new ConversationFsm(logger, 'DESIGN');
    fsm.setPhase('DESIGN');
    expect(fsm.currentPhase).toBe('DESIGN');
  });
});

// ── 통합 시나리오 / Integration Scenarios ───────────────────────

describe('ConversationFsm 통합 시나리오', () => {
  it('유저 확정 후 Phase 전환하는 전체 흐름', () => {
    const fsm = new ConversationFsm(logger);

    // IDEA Phase: 확정 안 됨
    expect(fsm.detectConfirmation('더 많은 아이디어 줘')).toBe(false);
    expect(fsm.currentPhase).toBe('IDEA');

    // IDEA Phase: 확정
    expect(fsm.detectConfirmation('좋아 이걸로 확정')).toBe(true);
    const r1 = fsm.advancePhase();
    expect(r1.ok).toBe(true);
    expect(fsm.currentPhase).toBe('PLANNING');

    // PLANNING Phase: 확정
    expect(fsm.detectConfirmation('confirm')).toBe(true);
    fsm.advancePhase();
    expect(fsm.currentPhase).toBe('DESIGN');
  });

  it('Phase 전환 없이 여러 번 대화해도 Phase가 유지된다', () => {
    const fsm = new ConversationFsm(logger, 'PLANNING');
    fsm.detectConfirmation('이건 뭐야?');
    fsm.detectConfirmation('다른 건?');
    expect(fsm.currentPhase).toBe('PLANNING');
  });

  it('전체 흐름: IDEA → CONTRACT까지 순회 가능', () => {
    const fsm = new ConversationFsm(logger);
    let count = 0;
    while (fsm.currentPhase !== 'CONTRACT') {
      const result = fsm.advancePhase();
      expect(result.ok).toBe(true);
      count++;
    }
    // IDEA -> PLANNING -> DESIGN -> UI_DESIGN -> STACK -> DOCS -> TEST_TYPES -> CONFIRMED -> CONTRACT = 8 transitions
    expect(count).toBe(8);
    expect(fsm.isContractPhase()).toBe(true);
  });
});
