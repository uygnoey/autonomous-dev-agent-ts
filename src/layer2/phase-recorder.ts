/**
 * Phase 전환 시 DesignDecision/FailureRecord 자동 기록 / Auto-record design decisions and failures during phase transitions
 *
 * @description
 * KR: PhaseEngine의 'phase:changed' 이벤트를 구독하여 Phase 전환 시 자동으로
 *     DesignDecision (DESIGN→CODE 전환 시)과 FailureRecord (VERIFY→* 롤백 시)를 기록한다.
 * EN: Subscribes to PhaseEngine 'phase:changed' events to auto-record
 *     DesignDecision (on DESIGN→CODE) and FailureRecord (on VERIFY→* rollback).
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'core/logger.js';
import type { DesignDecision, FailureRecord, Phase, VectorRepository } from 'core/types.js';
import type { IPhaseEngine } from 'layer2/phase-engine.js';
import type { PhaseTransition } from 'layer2/types.js';

// ── PhaseRecorder 설정 / Configuration ──────────────────────────

/**
 * PhaseRecorder 생성자 옵션 / Constructor options for PhaseRecorder
 *
 * @param phaseEngine - Phase FSM 엔진 / Phase FSM engine
 * @param logger - 로거 인스턴스 / Logger instance
 * @param designDecisionRepo - 설계 결정 저장소 (선택) / Design decision repository (optional)
 * @param failureRepo - 실패 이력 저장소 (선택) / Failure record repository (optional)
 * @param projectId - 프로젝트 ID / Project ID
 * @param featureId - 기능 ID / Feature ID
 */
export interface PhaseRecorderOptions {
  readonly phaseEngine: IPhaseEngine;
  readonly logger: Logger;
  readonly designDecisionRepo?: VectorRepository<DesignDecision>;
  readonly failureRepo?: VectorRepository<FailureRecord>;
  readonly projectId: string;
  readonly featureId: string;
}

// ── PhaseRecorder ───────────────────────────────────────────────

/**
 * Phase 전환 자동 기록기 / Auto-recorder for phase transitions
 *
 * @description
 * KR: PhaseEngine 이벤트를 구독하여 DESIGN→CODE 시 설계 결정,
 *     VERIFY→* 롤백 시 실패 이력을 자동 기록한다.
 * EN: Subscribes to PhaseEngine events to auto-record design decisions
 *     on DESIGN→CODE and failure records on VERIFY→* rollback.
 *
 * @example
 * const recorder = new PhaseRecorder({
 *   phaseEngine, logger, designDecisionRepo, failureRepo, projectId, featureId,
 * });
 * recorder.attach(); // 이벤트 구독 시작
 */
export class PhaseRecorder {
  private readonly logger: Logger;
  private readonly phaseEngine: IPhaseEngine;
  private readonly designDecisionRepo?: VectorRepository<DesignDecision>;
  private readonly failureRepo?: VectorRepository<FailureRecord>;
  private readonly projectId: string;
  private readonly featureId: string;
  private attached = false;
  private readonly boundHandler: (transition: PhaseTransition) => void;

  constructor(options: PhaseRecorderOptions) {
    this.logger = options.logger.child({ module: 'phase-recorder' });
    this.phaseEngine = options.phaseEngine;
    this.designDecisionRepo = options.designDecisionRepo;
    this.failureRepo = options.failureRepo;
    this.projectId = options.projectId;
    this.featureId = options.featureId;
    this.boundHandler = (transition: PhaseTransition) => {
      void this.onPhaseChanged(transition);
    };
  }

  /**
   * PhaseEngine 이벤트 구독 시작 / Start subscribing to PhaseEngine events
   */
  attach(): void {
    if (this.attached) return;
    // WHY: EventEmitter 기반 — PhaseEngine.transition()이 emit하는 'phase:changed' 이벤트 구독
    (this.phaseEngine as unknown as { on(event: string, handler: (...args: unknown[]) => void): void }).on(
      'phase:changed',
      this.boundHandler as (...args: unknown[]) => void,
    );
    this.attached = true;
    this.logger.debug('PhaseRecorder 이벤트 구독 시작');
  }

  /**
   * PhaseEngine 이벤트 구독 해제 / Stop subscribing to PhaseEngine events
   */
  detach(): void {
    if (!this.attached) return;
    (this.phaseEngine as unknown as { off(event: string, handler: (...args: unknown[]) => void): void }).off(
      'phase:changed',
      this.boundHandler as (...args: unknown[]) => void,
    );
    this.attached = false;
    this.logger.debug('PhaseRecorder 이벤트 구독 해제');
  }

  /**
   * Phase 전환 시 자동 기록 핸들러 / Handler for auto-recording on phase transitions
   *
   * @param transition - Phase 전환 정보 / Phase transition info
   */
  private async onPhaseChanged(transition: PhaseTransition): Promise<void> {
    // WHY: DESIGN→CODE 전환 = 설계 완료 시점 → 설계 결정 기록
    if (transition.from === 'DESIGN' && transition.to === 'CODE') {
      await this.recordDesignDecision(transition);
    }

    // WHY: VERIFY→* 롤백 = 검증 실패 시점 → 실패 이력 기록
    if (transition.from === 'VERIFY' && transition.to !== 'VERIFY') {
      await this.recordFailure(transition);
    }
  }

  /**
   * 설계 결정 기록 / Record a design decision
   *
   * @param transition - Phase 전환 정보 / Phase transition info
   */
  private async recordDesignDecision(transition: PhaseTransition): Promise<void> {
    if (!this.designDecisionRepo) return;

    // WHY: 384차원 zero 벡터 — 임베딩은 별도 파이프라인에서 업데이트. 기록 시점에는 placeholder.
    const record: DesignDecision = {
      id: randomUUID(),
      projectId: this.projectId,
      featureId: this.featureId,
      decision: `DESIGN phase completed: ${transition.reason}`,
      rationale: transition.reason,
      alternatives: [],
      decidedBy: [transition.triggeredBy],
      embedding: new Float32Array(384),
      timestamp: transition.timestamp,
    };

    const result = await this.designDecisionRepo.insert(record);
    if (!result.ok) {
      this.logger.error('설계 결정 자동 기록 실패', { error: result.error.message });
    } else {
      this.logger.info('설계 결정 자동 기록 완료', { featureId: this.featureId });
    }
  }

  /**
   * 실패 이력 기록 / Record a failure record
   *
   * @param transition - Phase 전환 정보 / Phase transition info
   */
  private async recordFailure(transition: PhaseTransition): Promise<void> {
    if (!this.failureRepo) return;

    const record: FailureRecord = {
      id: randomUUID(),
      projectId: this.projectId,
      featureId: this.featureId,
      phase: transition.from as Phase,
      failureType: `rollback_to_${transition.to}`,
      rootCause: transition.reason,
      resolution: '',
      embedding: new Float32Array(384),
      timestamp: transition.timestamp,
    };

    const result = await this.failureRepo.insert(record);
    if (!result.ok) {
      this.logger.error('실패 이력 자동 기록 실패', { error: result.error.message });
    } else {
      this.logger.info('실패 이력 자동 기록 완료', {
        featureId: this.featureId,
        rollbackTo: transition.to,
      });
    }
  }
}
