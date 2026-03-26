/**
 * Contract 변경 관리자 / Contract change manager
 *
 * @description
 * KR: HandoffPackage에 새 ContractSchema를 적용하고 버전·변경 이력을 누적한다.
 * EN: Applies a new ContractSchema to a HandoffPackage, accumulating version and change history.
 */

import { ContractError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { analyzeContractImpact } from 'layer1/contract-change-impact.js';
import type {
  ContractChangeRecord,
  ContractDiffEntry,
  ContractImpactAnalysis,
} from 'layer1/contract-change-types.js';
import type { ContractSchema, HandoffPackage } from 'layer1/contract-types.js';

/**
 * Contract 변경 관리자 / Contract change manager
 *
 * @example
 * const manager = new ContractChangeManager(logger);
 * const result = manager.applyChange(current, nextSchema, '사용자 요청', 'user');
 */
export class ContractChangeManager {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'contract-change-manager' });
  }

  /**
   * 새 Contract 스키마를 현재 HandoffPackage에 적용한다.
   * Apply a new ContractSchema to the current HandoffPackage.
   */
  applyChange(
    current: HandoffPackage,
    next: ContractSchema,
    reason: string,
    changedBy: 'user' | 'system',
  ): Result<HandoffPackage> {
    if (reason.trim().length === 0) {
      return err(
        new ContractError(
          'contract_change_empty_reason',
          '변경 사유는 비어있을 수 없습니다 / Change reason must not be empty',
        ),
      );
    }

    const previousVersion = current.version ?? 0;
    const newVersion = previousVersion + 1;

    this.logger.debug('Contract 변경 적용 시작', { previousVersion, newVersion, reason });

    const diffs = this.computeDiff(current.contract, next);
    const affectedFeatureIds = this.identifyAffectedFeatures(current.contract, diffs);
    const regressionTestRequired = diffs.length > 0;

    const changeRecord: ContractChangeRecord = {
      version: newVersion,
      previousVersion,
      changedAt: new Date(),
      reason,
      changedBy,
      diffs,
      affectedFeatureIds,
      regressionTestRequired,
    };

    const previousHistory = current.changeHistory ?? [];
    const updated: HandoffPackage = {
      ...current,
      contract: next,
      version: newVersion,
      changeHistory: [...previousHistory, changeRecord],
    };

    this.logger.info('Contract 변경 적용 완료', {
      newVersion,
      diffCount: diffs.length,
      regressionTestRequired,
    });

    return ok(updated);
  }

  /**
   * 두 ContractSchema 간 최상위 필드 diff를 계산한다.
   * Computes top-level field diffs between two ContractSchema objects.
   */
  computeDiff(previous: ContractSchema, next: ContractSchema): ContractDiffEntry[] {
    const diffs: ContractDiffEntry[] = [];

    // WHY: unknown 경유 캐스트로 strict 타입 검사 우회(ContractSchema에 인덱스 시그니처 없음)
    const prevRecord = previous as unknown as Record<string, unknown>;
    const nextRecord = next as unknown as Record<string, unknown>;

    const prevKeys = new Set(Object.keys(prevRecord));
    const nextKeys = new Set(Object.keys(nextRecord));

    for (const key of nextKeys) {
      if (!prevKeys.has(key)) {
        diffs.push({
          field: key,
          previousValue: undefined,
          currentValue: nextRecord[key],
          changeType: 'added',
        });
      }
    }

    for (const key of prevKeys) {
      if (!nextKeys.has(key)) {
        diffs.push({
          field: key,
          previousValue: prevRecord[key],
          currentValue: undefined,
          changeType: 'removed',
        });
      }
    }

    for (const key of prevKeys) {
      if (nextKeys.has(key)) {
        const prevValue = prevRecord[key];
        const nextValue = nextRecord[key];
        if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
          diffs.push({
            field: key,
            previousValue: prevValue,
            currentValue: nextValue,
            changeType: 'modified',
          });
        }
      }
    }

    return diffs;
  }

  /**
   * diff 항목에서 영향받는 기능 ID를 식별한다.
   * Identifies affected feature IDs from diff entries.
   */
  identifyAffectedFeatures(
    previous: ContractSchema,
    diffs: readonly ContractDiffEntry[],
  ): readonly string[] {
    const hasFeaturesChange = diffs.some((d) => d.field.includes('features'));

    if (!hasFeaturesChange) {
      return diffs.length > 0 ? ['*'] : [];
    }

    const ids = previous.features.map((f) => f.id);
    return ids.length > 0 ? ids : ['*'];
  }

  /**
   * Contract 변경 영향을 상세 분석한다.
   * Analyzes detailed impact of a Contract change.
   */
  analyzeImpact(previous: ContractSchema, next: ContractSchema): ContractImpactAnalysis {
    return analyzeContractImpact(previous, next, this.logger);
  }

  /**
   * Contract 변경을 적용하고 영향 분석 결과를 함께 반환한다.
   * Applies change and returns both updated package and impact analysis.
   */
  applyChangeWithImpact(
    current: HandoffPackage,
    next: ContractSchema,
    reason: string,
    changedBy: 'user' | 'system',
  ): Result<{ readonly pkg: HandoffPackage; readonly impact: ContractImpactAnalysis }> {
    const changeResult = this.applyChange(current, next, reason, changedBy);
    if (!changeResult.ok) {
      return changeResult;
    }

    const impact = this.analyzeImpact(current.contract, next);

    return ok({ pkg: changeResult.value, impact });
  }

  /**
   * 영향받는 기능들의 재검증을 트리거한다.
   * Triggers revalidation for affected features.
   */
  async triggerRevalidation(
    impact: ContractImpactAnalysis,
    onRevalidate: (featureIds: readonly string[]) => Promise<void>,
  ): Promise<Result<void>> {
    if (!impact.reverificationRequired) {
      this.logger.debug('재검증 불필요 — 변경 없음');
      return ok(undefined);
    }

    this.logger.info('Contract 변경 재검증 트리거', {
      testRerunFeatureIds: impact.testRerunFeatureIds,
      reverificationRequired: impact.reverificationRequired,
      userReconfirmRequired: impact.userReconfirmRequired,
    });

    try {
      await onRevalidate(impact.testRerunFeatureIds);

      this.logger.info('Contract 변경 재검증 완료', {
        featureCount: impact.testRerunFeatureIds.length,
      });

      return ok(undefined);
    } catch (error: unknown) {
      const contractError = new ContractError(
        'contract_revalidation_failed',
        `재검증 콜백 실행 실패 / Revalidation callback failed: ${String(error)}`,
        error,
      );
      this.logger.error('재검증 콜백 실패', { error: String(error) });
      return err(contractError);
    }
  }

  /**
   * HandoffPackage의 변경 이력을 반환한다.
   * Returns the change history of a HandoffPackage.
   */
  getChangeHistory(pkg: HandoffPackage): readonly ContractChangeRecord[] {
    return pkg.changeHistory ?? [];
  }
}
