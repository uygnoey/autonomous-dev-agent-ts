/**
 * 4-Phase FSM 엔진 / 4-Phase Finite State Machine Engine
 *
 * @description
 * KR: DESIGN → CODE → TEST → VERIFY 4단계 Phase 전환을 관리한다.
 *     전환 규칙 검증, 참여 에이전트 매핑, 전환 이력 추적을 수행한다.
 * EN: Manages DESIGN → CODE → TEST → VERIFY 4-phase transitions.
 *     Validates transition rules, maps participating agents, and tracks transition history.
 */

import { EventEmitter } from 'node:events';
import { PhaseError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { AgentName, Phase, Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { PhaseTransition } from 'layer2/types.js';

// ── PhaseEngine 이벤트 타입 / PhaseEngine event types ─────────

/**
 * PhaseEngine이 발행하는 이벤트 맵 / Events emitted by PhaseEngine
 */
export interface PhaseEngineEvents {
  /** Phase 전환 완료 시 발행 / Emitted on successful phase transition */
  'phase:changed': [transition: PhaseTransition];
  /** Phase 초기화 시 발행 / Emitted on phase reset */
  phaseReset: [previousPhase: Phase];
}

// ── Phase 참여 에이전트 매핑 / Phase participant mapping ────────

/**
 * Phase별 에이전트 역할 / Agent roles per phase
 */
export interface PhaseParticipants {
  /** 주도 에이전트 / Lead agents */
  readonly lead: readonly AgentName[];
  /** 참여 에이전트 / Active agents */
  readonly active: readonly AgentName[];
  /** 비참여 에이전트 / Inactive agents */
  readonly inactive: readonly AgentName[];
}

/**
 * Phase별 참여 에이전트 정의 / Phase participant definitions
 *
 * @description
 * KR: PHASE-ENGINE.md의 Phase별 참여 에이전트 표를 코드로 매핑한다.
 * EN: Maps the per-phase agent participation table from PHASE-ENGINE.md.
 */
const PHASE_PARTICIPANTS: Readonly<Record<Phase, PhaseParticipants>> = {
  DESIGN: {
    lead: ['architect'],
    active: ['qa', 'coder', 'reviewer'],
    inactive: ['tester', 'qc', 'documenter'],
  },
  CODE: {
    lead: ['coder'],
    active: ['architect', 'reviewer'],
    inactive: ['qa', 'tester', 'qc', 'documenter'],
  },
  TEST: {
    lead: ['tester'],
    active: ['qc'],
    inactive: ['architect', 'qa', 'coder', 'reviewer', 'documenter'],
  },
  VERIFY: {
    lead: [],
    active: ['qa', 'qc', 'reviewer'],
    inactive: ['architect', 'coder', 'tester', 'documenter'],
  },
};

// ── 전환 규칙 / Transition Rules ────────────────────────────────

/**
 * 유효한 Phase 전환 정의 / Valid phase transition definitions
 *
 * @description
 * KR: - 순방향: DESIGN→CODE→TEST→VERIFY (순서대로만)
 *     - 역방향: VERIFY에서만 DESIGN/CODE/TEST로 롤백 가능
 * EN: - Forward: DESIGN→CODE→TEST→VERIFY (sequential only)
 *     - Backward: Rollback only from VERIFY to DESIGN/CODE/TEST
 */
const VALID_TRANSITIONS: ReadonlyMap<Phase, readonly Phase[]> = new Map([
  ['DESIGN', ['CODE']],
  ['CODE', ['TEST']],
  ['TEST', ['VERIFY']],
  ['VERIFY', ['DESIGN', 'CODE', 'TEST']],
]);

/**
 * PhaseEngine 인터페이스 / PhaseEngine interface
 *
 * @description
 * KR: Phase 전환 규칙 관리 및 유효성 검증을 위한 인터페이스.
 * EN: Interface for managing phase transition rules and validation.
 */
export interface IPhaseEngine {
  /** 현재 Phase를 반환한다 / Returns the current phase */
  readonly currentPhase: Phase;

  /**
   * Phase 전환을 시도한다 / Attempts a phase transition
   *
   * @param to - 전환 대상 Phase / Target phase
   * @param reason - 전환 사유 / Transition reason
   * @param triggeredBy - 전환 트리거 주체 / Triggered by agent or 'adev'
   * @returns 성공 시 PhaseTransition, 실패 시 PhaseError
   */
  transition(
    to: Phase,
    reason: string,
    triggeredBy: AgentName | 'adev',
  ): Result<PhaseTransition, PhaseError>;

  /**
   * 특정 Phase로 전환 가능 여부를 반환한다 / Checks if transition is valid
   *
   * @param to - 전환 대상 Phase / Target phase
   * @returns 전환 가능 여부 / Whether transition is valid
   */
  canTransition(to: Phase): boolean;

  /**
   * Phase별 참여 에이전트 목록을 반환한다 / Returns agent participants for a phase
   *
   * @param phase - 조회할 Phase / Phase to query
   * @returns 주도/참여/비참여 에이전트 목록 / Lead, active, inactive agents
   */
  getParticipants(phase: Phase): PhaseParticipants;

  /**
   * Phase 상태를 DESIGN으로 초기화한다 / Resets phase state to DESIGN
   */
  reset(): void;

  /**
   * Phase 전환 이력을 반환한다 / Returns phase transition history
   *
   * @returns 전환 이력 배열 (읽기 전용) / Transition history array (readonly)
   */
  getHistory(): readonly PhaseTransition[];
}

/**
 * 4-Phase FSM 엔진 / 4-Phase Finite State Machine Engine
 *
 * @description
 * KR: Phase 전환 규칙을 관리하고 유효성을 검증한다.
 * EN: Manages phase transition rules and validates transitions.
 *
 * @example
 * const engine = new PhaseEngine(logger);
 * const result = engine.transition('CODE', 'qa Gate 통과', 'qa');
 */
export class PhaseEngine extends EventEmitter<PhaseEngineEvents> implements IPhaseEngine {
  private current: Phase = 'DESIGN';
  private readonly history: PhaseTransition[] = [];
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    super();
    this.logger = logger.child({ module: 'phase-engine' });
  }

  /**
   * 현재 Phase를 반환한다 / Returns the current phase
   *
   * @returns 현재 Phase / Current phase
   */
  get currentPhase(): Phase {
    return this.current;
  }

  /**
   * Phase 전환을 시도한다 / Attempts a phase transition
   *
   * @param to - 전환 대상 Phase / Target phase
   * @param reason - 전환 사유 / Transition reason
   * @param triggeredBy - 전환 트리거 주체 / Triggered by agent or 'adev'
   * @returns 성공 시 PhaseTransition, 실패 시 PhaseError
   *
   * @example
   * const result = engine.transition('CODE', 'qa Gate passed', 'qa');
   * if (result.ok) logger.info('전환 완료', { transition: result.value });
   */
  transition(
    to: Phase,
    reason: string,
    triggeredBy: AgentName | 'adev',
  ): Result<PhaseTransition, PhaseError> {
    if (!this.canTransition(to)) {
      return err(
        new PhaseError(
          'phase_invalid_transition',
          `유효하지 않은 Phase 전환: ${this.current} → ${to}`,
        ),
      );
    }

    const transition: PhaseTransition = {
      from: this.current,
      to,
      reason,
      triggeredBy,
      timestamp: new Date(),
    };

    this.logger.info('Phase 전환 실행', {
      from: this.current,
      to,
      reason,
      triggeredBy,
    });

    this.current = to;
    this.history.push(transition);

    // WHY: Phase 전환을 외부 리스너에 통지하여 이벤트 기반 연동을 지원 (스펙 §: 'phase:changed')
    this.emit('phase:changed', transition);

    return ok(transition);
  }

  /**
   * 특정 Phase로 전환 가능 여부를 반환한다 / Checks if transition is valid
   *
   * @param to - 전환 대상 Phase / Target phase
   * @returns 전환 가능 여부 / Whether transition is valid
   */
  canTransition(to: Phase): boolean {
    const validTargets = VALID_TRANSITIONS.get(this.current);
    if (!validTargets) return false;
    return validTargets.includes(to);
  }

  /**
   * Phase별 참여 에이전트 목록을 반환한다 / Returns agent participants for a phase
   *
   * @param phase - 조회할 Phase / Phase to query
   * @returns 주도/참여/비참여 에이전트 목록 / Lead, active, inactive agents
   */
  getParticipants(phase: Phase): PhaseParticipants {
    return PHASE_PARTICIPANTS[phase];
  }

  /**
   * Phase 상태를 DESIGN으로 초기화한다 / Resets phase state to DESIGN
   *
   * @description
   * KR: 새로운 feature 실행 전 호출하여 이전 feature의 Phase 상태가 잔류하지 않도록 한다.
   *     history도 초기화하여 새로운 feature의 전환 이력을 깨끗하게 시작한다.
   * EN: Call before each new feature execution so previous feature's phase state does not linger.
   *     Also clears history so the new feature starts with a clean transition record.
   */
  reset(): void {
    const previousPhase = this.current;
    this.logger.debug('Phase 상태 초기화', { from: previousPhase, to: 'DESIGN' });
    this.current = 'DESIGN';
    this.history.length = 0;

    // WHY: 리셋 이벤트를 통지하여 외부에서 상태 변경을 감지할 수 있게 함
    this.emit('phaseReset', previousPhase);
  }

  /**
   * Phase 전환 이력을 반환한다 / Returns phase transition history
   *
   * @returns 전환 이력 배열 (읽기 전용) / Transition history array (readonly)
   */
  getHistory(): readonly PhaseTransition[] {
    return this.history.map((t) => ({ ...t }));
  }
}
