/**
 * Contract 변경 영향 분석 / Contract change impact analysis
 *
 * @description
 * KR: 기능 단위로 변경/추가/제거를 식별하고, 의존 체인을 통해 간접 영향 기능도 식별한다.
 * EN: Identifies changed/added/removed features at granular level, traces dependency chains.
 */

import type { Logger } from 'core/logger.js';
import type { ContractImpactAnalysis } from 'layer1/contract-change-types.js';
import type { ContractSchema } from 'layer1/contract-types.js';

/**
 * Contract 변경 영향을 상세 분석한다.
 * Analyzes detailed impact of a Contract change.
 *
 * @param previous - 이전 ContractSchema / Previous schema
 * @param next - 현재 ContractSchema / Next schema
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 영향 분석 결과 / Impact analysis result
 */
export function analyzeContractImpact(
  previous: ContractSchema,
  next: ContractSchema,
  logger: Logger,
): ContractImpactAnalysis {
  logger.debug('Contract 변경 영향 분석 시작');

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

  logger.info('Contract 변경 영향 분석 완료', {
    changed: changedFeatureIds.length,
    added: addedFeatureIds.length,
    removed: removedFeatureIds.length,
    dependencyAffected: dependencyAffectedIds.length,
    testRerun: testRerunFeatureIds.length,
  });

  return analysis;
}

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
export function traceDependencyChain(
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
      if (!(visited.has(dependent) || directlyAffected.has(dependent))) {
        visited.add(dependent);
        indirectlyAffected.push(dependent);
        queue.push(dependent);
      }
    }
  }

  return indirectlyAffected;
}
