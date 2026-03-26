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
import type {
  ContractChangeRecord,
  ContractDiffEntry,
  ContractImpactAnalysis,
} from 'layer1/contract-change-types.js';
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
   *
   * @description
   * KR: 기능 단위로 변경/추가/제거를 식별하고, 의존 체인을 통해 간접 영향 기능도 식별한다.
   *     재실행 필요한 테스트의 기능 ID와 재검증/재컨펌 필요 여부를 판단한다.
   * EN: Identifies changed/added/removed features at granular level, traces dependency chains
   *     for indirectly affected features, and determines test rerun/reverification/reconfirm needs.
   *
   * @param previous - 이전 ContractSchema / Previous schema
   * @param next - 현재 ContractSchema / Next schema
   * @returns 영향 분석 결과 / Impact analysis result
   */
  analyzeImpact(previous: ContractSchema, next: ContractSchema): ContractImpactAnalysis {
    this.logger.debug('Contract 변경 영향 분석 시작');

    const prevFeatureMap = new Map(previous.features.map((f) => [f.id, f]));
    const nextFeatureMap = new Map(next.features.map((f) => [f.id, f]));

    const addedFeatureIds: string[] = [];
    const removedFeatureIds: string[] = [];
    const changedFeatureIds: string[] = [];

    // WHY: 이전에 없던 기능 → 추가
    for (const id of nextFeatureMap.keys()) {
      if (!prevFeatureMap.has(id)) {
        addedFeatureIds.push(id);
      }
    }

    // WHY: 현재에 없는 기능 → 제거
    for (const id of prevFeatureMap.keys()) {
      if (!nextFeatureMap.has(id)) {
        removedFeatureIds.push(id);
      }
    }

    // WHY: 양쪽에 존재하지만 내용이 다른 기능 → 변경
    for (const [id, prevFeature] of prevFeatureMap) {
      const nextFeature = nextFeatureMap.get(id);
      if (nextFeature && JSON.stringify(prevFeature) !== JSON.stringify(nextFeature)) {
        changedFeatureIds.push(id);
      }
    }

    // WHY: 변경/추가된 기능에 의존하는 기능을 의존 체인으로 추적
    const directlyAffected = new Set([
      ...changedFeatureIds,
      ...addedFeatureIds,
      ...removedFeatureIds,
    ]);
    const dependencyAffectedIds = traceDependencyChain(next.features, directlyAffected);

    // WHY: 변경된 기능 + 간접 영향 기능 모두 테스트 재실행 대상
    const testRerunFeatureIds = [
      ...new Set([...changedFeatureIds, ...addedFeatureIds, ...dependencyAffectedIds]),
    ];

    const hasAnyChange =
      changedFeatureIds.length > 0 || addedFeatureIds.length > 0 || removedFeatureIds.length > 0;

    const analysis: ContractImpactAnalysis = {
      changedFeatureIds,
      addedFeatureIds,
      removedFeatureIds,
      dependencyAffectedIds,
      testRerunFeatureIds,
      reverificationRequired: hasAnyChange,
      userReconfirmRequired: hasAnyChange,
    };

    this.logger.info('Contract 변경 영향 분석 완료', {
      changed: changedFeatureIds.length,
      added: addedFeatureIds.length,
      removed: removedFeatureIds.length,
      dependencyAffected: dependencyAffectedIds.length,
      testRerun: testRerunFeatureIds.length,
    });

    return analysis;
  }

  /**
   * Contract 변경을 적용하고 영향 분석 결과를 함께 반환한다.
   * Applies change and returns both updated package and impact analysis.
   *
   * @description
   * KR: applyChange()와 analyzeImpact()를 결합하여 변경 적용 + 영향 분석을 한 번에 수행한다.
   * EN: Combines applyChange() and analyzeImpact() into a single operation.
   *
   * @param current - 현재 HandoffPackage / Current package
   * @param next - 적용할 새 ContractSchema / New schema
   * @param reason - 변경 사유 / Reason
   * @param changedBy - 변경 주체 / Who changed
   * @returns 업데이트된 패키지 + 영향 분석 / Updated package + impact analysis
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
   *
   * @description
   * KR: 영향 분석 결과를 기반으로 영향받는 기능을 재개발 대상으로 표시하고
   *     2계층 재실행 콜백을 호출한다.
   * EN: Marks affected features for re-development based on impact analysis
   *     and invokes the layer2 re-execution callback.
   *
   * @param impact - 영향 분석 결과 / Impact analysis result
   * @param onRevalidate - 2계층 재실행 콜백 / Layer2 re-execution callback
   * @returns 재검증 트리거 성공 여부 / Whether revalidation trigger succeeded
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
   *
   * @param pkg - HandoffPackage / Handoff package
   * @returns 변경 이력 목록 (없으면 빈 배열) / Change history (empty array if none)
   */
  getChangeHistory(pkg: HandoffPackage): readonly ContractChangeRecord[] {
    return pkg.changeHistory ?? [];
  }
}

// ── 내부 함수 / Internal Functions ────────────────────────────────

/**
 * 의존 체인을 추적하여 간접 영향 기능을 식별한다.
 * Traces dependency chain to find indirectly affected features.
 *
 * @description
 * KR: 직접 변경된 기능에 의존하는 기능을 BFS로 탐색한다.
 * EN: BFS traversal to find features depending on directly changed features.
 *
 * @param features - 현재 기능 목록 / Current feature list
 * @param directlyAffected - 직접 영향받은 기능 ID 집합 / Directly affected feature ID set
 * @returns 간접 영향 기능 ID 목록 / Indirectly affected feature IDs
 */
function traceDependencyChain(
  features: readonly { readonly id: string; readonly dependencies: readonly string[] }[],
  directlyAffected: ReadonlySet<string>,
): readonly string[] {
  // WHY: 역방향 의존성 맵 구축 (A가 B에 의존 → B 변경 시 A도 영향)
  const reverseDeps = new Map<string, string[]>();
  for (const feature of features) {
    for (const dep of feature.dependencies) {
      const dependents = reverseDeps.get(dep) ?? [];
      dependents.push(feature.id);
      reverseDeps.set(dep, dependents);
    }
  }

  const visited = new Set<string>();
  const queue = [...directlyAffected];
  const indirectlyAffected: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const dependents = reverseDeps.get(current) ?? [];
    for (const dependent of dependents) {
      if (!visited.has(dependent) && !directlyAffected.has(dependent)) {
        visited.add(dependent);
        indirectlyAffected.push(dependent);
        queue.push(dependent);
      }
    }
  }

  return indirectlyAffected;
}
