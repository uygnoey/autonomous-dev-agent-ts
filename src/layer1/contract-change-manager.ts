/**
 * Contract 변경 관리자 / Contract change manager
 *
 * @description
 * KR: HandoffPackage에 새 ContractSchema를 적용하고 버전·변경 이력을 누적한다.
 *     두 ContractSchema 간 최상위 필드 레벨 diff를 계산하고,
 *     영향받는 기능 ID를 식별한다.
 * EN: Applies a new ContractSchema to a HandoffPackage, accumulating version
 *     and change history. Computes top-level field diffs between two schemas
 *     and identifies affected feature IDs.
 */

import { ContractError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { ContractChangeRecord, ContractDiffEntry } from 'layer1/contract-change-types.js';
import type { ContractSchema, HandoffPackage } from 'layer1/contract-types.js';

// ── ContractChangeManager ────────────────────────────────────────

/**
 * Contract 변경 관리자 / Contract change manager
 *
 * @description
 * KR: HandoffPackage 버전 관리 + 변경 이력 추적 담당.
 *     applyChange()로 새 ContractSchema 적용 → 버전 증가 + 이력 누적.
 * EN: Manages HandoffPackage versioning and change history tracking.
 *     applyChange() applies a new schema → increments version + accumulates history.
 *
 * @param logger - 로거 인스턴스 / Logger instance
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
   * 변경 이력이 추가된 새 HandoffPackage를 반환한다.
   * Apply a new ContractSchema to the current HandoffPackage.
   * Returns a new HandoffPackage with the change record appended.
   *
   * @param current - 현재 HandoffPackage / Current handoff package
   * @param next - 적용할 새 ContractSchema / New contract schema to apply
   * @param reason - 변경 사유 / Reason for the change
   * @param changedBy - 변경 주체 / Who triggered the change
   * @returns 업데이트된 HandoffPackage / Updated HandoffPackage
   *
   * @example
   * const result = manager.applyChange(pkg, newSchema, '기능 추가', 'user');
   * if (result.ok) {
   *   const updatedPkg = result.value;
   * }
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
   *
   * @param previous - 이전 ContractSchema / Previous schema
   * @param next - 현재 ContractSchema / Next schema
   * @returns 변경 항목 목록 / List of diff entries
   *
   * @example
   * const diffs = manager.computeDiff(schemaV1, schemaV2);
   */
  computeDiff(previous: ContractSchema, next: ContractSchema): ContractDiffEntry[] {
    const diffs: ContractDiffEntry[] = [];

    // WHY: unknown 경유 캐스트로 strict 타입 검사 우회(ContractSchema에 인덱스 시그니처 없음)
    const prevRecord = previous as unknown as Record<string, unknown>;
    const nextRecord = next as unknown as Record<string, unknown>;

    const prevKeys = new Set(Object.keys(prevRecord));
    const nextKeys = new Set(Object.keys(nextRecord));

    // 이전에 없고 현재에 있는 키 → added
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

    // 이전에 있고 현재에 없는 키 → removed
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

    // 양쪽에 모두 있는 키 → JSON.stringify 비교
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
   *
   * @description
   * KR: 'features' 문자열을 포함하는 필드가 변경된 경우 이전 features에서 featureId를 추출.
   *     관련 필드 변경이 없거나 featureId 목록이 비어있으면 ['*'] 반환(전체 영향).
   * EN: Extracts featureIds from previous features if a 'features'-related field changed.
   *     Returns ['*'] when no features field changed or the list is empty (global impact).
   *
   * @param previous - 이전 ContractSchema / Previous schema
   * @param diffs - 변경 항목 목록 / Diff entries
   * @returns 영향받는 기능 ID 목록 / Affected feature IDs
   *
   * @example
   * const ids = manager.identifyAffectedFeatures(schema, diffs);
   */
  identifyAffectedFeatures(
    previous: ContractSchema,
    diffs: readonly ContractDiffEntry[],
  ): readonly string[] {
    const hasFeaturesChange = diffs.some((d) => d.field.includes('features'));

    if (!hasFeaturesChange) {
      // 기능 필드와 무관한 변경 → 전체 영향
      return diffs.length > 0 ? ['*'] : [];
    }

    const ids = previous.features.map((f) => f.id);

    // 추출된 ID가 없으면 전체 영향 표시
    return ids.length > 0 ? ids : ['*'];
  }

  /**
   * HandoffPackage의 변경 이력을 반환한다.
   * Returns the change history of a HandoffPackage.
   *
   * @param pkg - HandoffPackage / Handoff package
   * @returns 변경 이력 목록 (없으면 빈 배열) / Change history (empty array if none)
   *
   * @example
   * const history = manager.getChangeHistory(pkg);
   */
  getChangeHistory(pkg: HandoffPackage): readonly ContractChangeRecord[] {
    return pkg.changeHistory ?? [];
  }
}
