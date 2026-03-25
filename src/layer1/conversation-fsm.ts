/**
 * 대화 Phase FSM / Conversation Phase Finite State Machine
 *
 * @description
 * KR: 1계층 대화 흐름의 Phase 상태 전환을 관리한다.
 *     아이디어 도출 -> 기획 -> 설계 -> 디자인 -> 스택 -> 문서 -> 테스트 -> 확정 -> Contract
 *     유저가 "확정" 키워드를 명시적으로 말하기 전까지 다음 Phase로 전환하지 않는다.
 * EN: Manages phase state transitions for layer 1 conversation flow.
 *     Does not advance to next phase until user explicitly uses confirmation keywords.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import {
  CONFIRMATION_KEYWORDS,
  type ConversationPhase,
  PHASE_SYSTEM_PROMPTS,
  PHASE_TRANSITIONS,
} from 'layer1/conversation-types.js';

// ── PI-008: 단순 긍정 키워드 / Simple affirmative keywords ──────

/** 단순 긍정 키워드 (추가 제안 필요 패턴) / Simple affirmative keywords requiring further proposals */
const SIMPLE_AFFIRMATIVE = ['ok', 'good', 'yes', '응', '네', '좋아', '알겠어'];

/**
 * 제안 유도 Phase 목록 / Phases that trigger proposal prompts
 *
 * WHY: PI-008 — IDEA/PLANNING/DESIGN Phase에서만 무한 제안 루프를 적용한다.
 *      STACK 이후 Phase는 확정적 선택이 필요하므로 제외.
 */
const PROPOSAL_PHASES: ReadonlySet<ConversationPhase> = new Set(['IDEA', 'PLANNING', 'DESIGN']);

// ── ConversationFsm ─────────────────────────────────────────────

/**
 * 대화 Phase FSM / Conversation Phase FSM
 *
 * @description
 * KR: 대화의 현재 Phase를 추적하고, 유저 확정 감지 및 Phase 전환을 처리한다.
 * EN: Tracks current conversation phase, detects user confirmation, and handles transitions.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const fsm = new ConversationFsm(logger);
 * fsm.currentPhase; // 'IDEA'
 * fsm.detectConfirmation('좋아 확정할게'); // true
 * fsm.advancePhase(); // ok('PLANNING')
 */
export class ConversationFsm {
  private readonly logger: Logger;
  private phase: ConversationPhase;

  constructor(logger: Logger, initialPhase: ConversationPhase = 'IDEA') {
    this.logger = logger.child({ module: 'conversation-fsm' });
    this.phase = initialPhase;
    this.logger.debug('FSM 초기화', { phase: this.phase });
  }

  /**
   * 현재 Phase 반환 / Get current phase
   */
  get currentPhase(): ConversationPhase {
    return this.phase;
  }

  /**
   * 현재 Phase의 시스템 프롬프트 반환 / Get system prompt for current phase
   *
   * @returns Phase에 맞는 시스템 프롬프트 / System prompt for the phase
   */
  getSystemPrompt(): string {
    return PHASE_SYSTEM_PROMPTS[this.phase];
  }

  /**
   * 유저 입력에서 확정 키워드 감지 / Detect confirmation keywords in user input
   *
   * @param userInput - 유저 입력 텍스트 / User input text
   * @returns 확정 키워드가 포함되었는지 여부 / Whether confirmation keywords are present
   */
  detectConfirmation(userInput: string): boolean {
    const normalized = userInput.toLowerCase().trim();

    for (const keyword of CONFIRMATION_KEYWORDS) {
      if (normalized.includes(keyword.toLowerCase())) {
        this.logger.debug('확정 키워드 감지', { keyword, phase: this.phase });
        return true;
      }
    }

    return false;
  }

  /**
   * 다음 Phase로 전환 / Advance to next phase
   *
   * @returns 성공 시 새로운 Phase, 실패 시 에러 / New phase on success, error on failure
   */
  advancePhase(): Result<ConversationPhase> {
    const nextPhase = PHASE_TRANSITIONS[this.phase];

    if (nextPhase === null) {
      return err(
        new AdevError(
          'layer1_fsm_terminal',
          `현재 Phase '${this.phase}'는 최종 상태입니다. 더 이상 전환할 수 없습니다.`,
        ),
      );
    }

    const previousPhase = this.phase;
    this.phase = nextPhase;

    this.logger.info('Phase 전환', { from: previousPhase, to: nextPhase });

    return ok(nextPhase);
  }

  /**
   * CONFIRMED 상태 여부 반환 / Check if phase is CONFIRMED or beyond
   *
   * @returns CONFIRMED 이상인지 여부 / Whether in CONFIRMED or later phase
   */
  isConfirmed(): boolean {
    return this.phase === 'CONFIRMED' || this.phase === 'CONTRACT';
  }

  /**
   * CONTRACT 상태 여부 반환 / Check if in CONTRACT phase
   *
   * @returns CONTRACT Phase 여부 / Whether in CONTRACT phase
   */
  isContractPhase(): boolean {
    return this.phase === 'CONTRACT';
  }

  /**
   * 유저 응답이 단순 긍정인지 확인한다 / Checks if user response is simple affirmative
   *
   * @description
   * KR: PI-008 — 유저가 "ok", "네" 등 단순 긍정만 했을 때 추가 제안을 유도하기 위한 판별.
   * EN: PI-008 — Detects simple affirmative to trigger further proposal prompts.
   *
   * @param text - 유저 입력 텍스트 / User input text
   * @returns 단순 긍정 여부 / Whether input is simple affirmative
   */
  isSimpleAffirmative(text: string): boolean {
    const lower = text.trim().toLowerCase();
    return SIMPLE_AFFIRMATIVE.some((kw) => lower === kw || lower === `${kw}.`);
  }

  /**
   * Phase 유지 상태에서 추가 제안 프롬프트를 반환한다 / Get proposal prompt for current phase
   *
   * @description
   * KR: PI-008 — 유저가 단순 긍정만 할 때 더 깊은 탐색을 유도하는 프롬프트 생성.
   *     IDEA/PLANNING/DESIGN Phase에서만 동작한다.
   * EN: PI-008 — Generates a prompt for deeper exploration when user gives simple affirmative.
   *     Only active in IDEA/PLANNING/DESIGN phases.
   *
   * @param phase - 현재 Phase / Current phase
   * @returns 추가 제안 프롬프트 또는 null (해당 Phase가 아닐 때) / Proposal prompt or null
   */
  getProposalPrompt(phase: ConversationPhase): string | null {
    if (!PROPOSAL_PHASES.has(phase)) {
      return null;
    }

    // WHY: PI-008 — 유저가 단순 긍정만 할 때 더 깊은 탐색을 유도
    return (
      `현재 ${phase} 단계에서 더 탐색할 수 있는 관점:\n` +
      '1. 대안 방식이 있는가?\n2. 놓친 요구사항은 없는가?\n3. 엣지 케이스를 고려했는가?'
    );
  }

  /**
   * 특정 Phase로 직접 전환 (테스트/복구 용도) / Set phase directly (for testing/recovery)
   *
   * @param phase - 전환할 Phase / Target phase
   */
  setPhase(phase: ConversationPhase): void {
    this.logger.debug('Phase 직접 설정', { from: this.phase, to: phase });
    this.phase = phase;
  }
}
