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
   * 특정 Phase로 직접 전환 (테스트/복구 용도) / Set phase directly (for testing/recovery)
   *
   * @param phase - 전환할 Phase / Target phase
   */
  setPhase(phase: ConversationPhase): void {
    this.logger.debug('Phase 직접 설정', { from: this.phase, to: phase });
    this.phase = phase;
  }
}
