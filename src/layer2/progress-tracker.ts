/**
 * 진행 상태 추적기 / Progress Tracker
 *
 * @description
 * KR: 기능별 진행 상태, 완료 Phase, 검증 결과를 추적한다.
 *     전체 완료율 계산 기능을 제공한다.
 * EN: Tracks per-feature progress, completed phases, and verification results.
 *     Provides overall completion rate calculation.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { FeatureStatus, Phase, Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { FeatureProgress, VerificationResult } from './types.js';

/**
 * 진행 상태 추적기 / Progress Tracker
 *
 * @description
 * KR: 기능 라이프사이클 전체를 추적한다.
 * EN: Tracks the entire feature lifecycle.
 *
 * @example
 * const tracker = new ProgressTracker(logger);
 * tracker.initFeature('feat-1');
 * tracker.updatePhase('feat-1', 'CODE');
 */
export class ProgressTracker {
  private readonly features: Map<string, FeatureProgress> = new Map();
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'progress-tracker' });
  }

  /**
   * 기능 추적을 초기화한다 / Initializes feature tracking
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 초기화된 진행 상태 / Initialized feature progress
   */
  initFeature(featureId: string): Result<FeatureProgress> {
    if (this.features.has(featureId)) {
      return err(new AgentError('agent_feature_exists', `이미 존재하는 기능입니다: ${featureId}`));
    }

    const now = new Date();
    const progress: FeatureProgress = {
      featureId,
      status: 'pending',
      currentPhase: 'DESIGN',
      completedPhases: [],
      verificationResults: [],
      startedAt: now,
      updatedAt: now,
    };

    this.features.set(featureId, progress);
    this.logger.info('기능 추적 초기화', { featureId });

    return ok(progress);
  }

  /**
   * 기능 상태를 갱신한다 / Updates feature status
   *
   * @param featureId - 기능 ID / Feature ID
   * @param status - 새 상태 / New status
   * @returns 성공 시 ok / ok on success
   */
  updateStatus(featureId: string, status: FeatureStatus): Result<void> {
    const progress = this.features.get(featureId);
    if (!progress) {
      return err(
        new AgentError('agent_feature_not_found', `기능을 찾을 수 없습니다: ${featureId}`),
      );
    }

    const updated: FeatureProgress = {
      ...progress,
      status,
      updatedAt: new Date(),
    };

    this.features.set(featureId, updated);
    this.logger.debug('기능 상태 갱신', { featureId, status });

    return ok(undefined);
  }

  /**
   * 기능의 현재 Phase를 갱신한다 / Updates the current phase of a feature
   *
   * @param featureId - 기능 ID / Feature ID
   * @param phase - 새 Phase / New phase
   * @returns 성공 시 ok / ok on success
   */
  updatePhase(featureId: string, phase: Phase): Result<void> {
    const progress = this.features.get(featureId);
    if (!progress) {
      return err(
        new AgentError('agent_feature_not_found', `기능을 찾을 수 없습니다: ${featureId}`),
      );
    }

    // WHY: 이전 Phase를 completedPhases에 추가 (중복 방지)
    const completedPhases = progress.completedPhases.includes(progress.currentPhase)
      ? progress.completedPhases
      : [...progress.completedPhases, progress.currentPhase];

    const updated: FeatureProgress = {
      ...progress,
      currentPhase: phase,
      completedPhases,
      updatedAt: new Date(),
    };

    this.features.set(featureId, updated);
    this.logger.info('기능 Phase 갱신', { featureId, phase });

    return ok(undefined);
  }

  /**
   * 검증 결과를 추가한다 / Adds a verification result
   *
   * @param featureId - 기능 ID / Feature ID
   * @param result - 검증 결과 / Verification result
   * @returns 성공 시 ok / ok on success
   */
  addVerification(featureId: string, result: VerificationResult): Result<void> {
    const progress = this.features.get(featureId);
    if (!progress) {
      return err(
        new AgentError('agent_feature_not_found', `기능을 찾을 수 없습니다: ${featureId}`),
      );
    }

    const updated: FeatureProgress = {
      ...progress,
      verificationResults: [...progress.verificationResults, result],
      updatedAt: new Date(),
    };

    this.features.set(featureId, updated);
    this.logger.debug('검증 결과 추가', {
      featureId,
      phase: result.phase,
      passed: result.passed,
    });

    return ok(undefined);
  }

  /**
   * 기능 진행 상태를 조회한다 / Gets feature progress
   *
   * @param featureId - 기능 ID / Feature ID
   * @returns 진행 상태 또는 null / Feature progress or null
   */
  getProgress(featureId: string): FeatureProgress | null {
    return this.features.get(featureId) ?? null;
  }

  /**
   * 모든 기능 진행 상태를 반환한다 / Returns all feature progress
   *
   * @returns 전체 기능 진행 상태 배열 / All feature progress entries
   */
  getAllProgress(): FeatureProgress[] {
    return [...this.features.values()];
  }

  /**
   * 전체 완료율을 계산한다 / Calculates overall completion rate
   *
   * @description
   * KR: 완료 상태인 기능 수 / 전체 기능 수 비율을 반환한다.
   * EN: Returns ratio of completed features to total features.
   *
   * @returns 완료율 (0~1). 기능이 없으면 0 / Completion rate (0~1). 0 if no features.
   */
  getOverallCompletion(): number {
    const all = [...this.features.values()];
    if (all.length === 0) return 0;

    const completed = all.filter((f) => f.status === 'complete').length;
    return completed / all.length;
  }
}
