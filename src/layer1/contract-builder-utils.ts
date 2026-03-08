/**
 * Contract 빌더 유틸리티 / Contract builder utilities
 *
 * @description
 * KR: ContractBuilder에서 사용하는 위상 정렬, 검증 매트릭스 생성, 프로젝트 유형 감지 함수.
 * EN: Topological sort, verification matrix builder, and project type detection
 *     used by ContractBuilder.
 */

import { ContractError } from 'core/errors.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { VerificationMatrix } from 'layer1/contract-types.js';
import type { FeatureSpec, TestTypeDefinition } from 'layer1/feature-types.js';

/** 기본 프로젝트 유형 / Default project type */
const DEFAULT_PROJECT_TYPE = 'generic';

/**
 * 위상 정렬 (Kahn's algorithm) / Topological sort using Kahn's algorithm
 *
 * @description
 * KR: 기능 의존성 그래프의 순환 여부를 탐지하고, 구현 순서를 결정한다.
 * EN: Detects cycles in feature dependency graph and determines implementation order.
 *
 * @param features - 기능 명세 목록 / Feature specifications
 * @returns 구현 순서 (기능 ID 배열) 또는 순환 의존성 오류 / Implementation order or cycle error
 */
export function topologicalSort(features: readonly FeatureSpec[]): Result<string[], ContractError> {
  const featureIds = new Set(features.map((f) => f.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // WHY: 그래프 초기화 — 모든 노드의 진입 차수 0, 인접 리스트 빈 배열
  for (const id of featureIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // WHY: 의존성 에지 구성 — dep → feature (dep가 먼저 구현되어야 함)
  for (const feature of features) {
    for (const dep of feature.dependencies) {
      if (!featureIds.has(dep)) continue; // WHY: 외부 의존성은 무시
      const adj = adjacency.get(dep);
      if (adj) {
        adj.push(feature.id);
      }
      inDegree.set(feature.id, (inDegree.get(feature.id) ?? 0) + 1);
    }
  }

  // WHY: 진입 차수 0인 노드부터 시작 (BFS)
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    order.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // WHY: 모든 노드를 처리하지 못했으면 순환 의존성 존재
  if (order.length !== featureIds.size) {
    return err(
      new ContractError(
        'contract_cyclic_dependency',
        '순환 의존성이 탐지되었습니다 / Cyclic dependency detected',
      ),
    );
  }

  return ok(order);
}

/**
 * VerificationMatrix 생성 / Build verification matrix
 *
 * @param features - 기능 명세 목록 / Feature specifications
 * @param testDefinitions - 테스트 정의 목록 / Test definitions
 * @returns VerificationMatrix
 */
export function buildVerificationMatrix(
  features: readonly FeatureSpec[],
  testDefinitions: readonly TestTypeDefinition[],
): VerificationMatrix {
  const allFeaturesHaveCriteria = features.every((f) => f.acceptanceCriteria.length > 0);

  // WHY: 모든 수락 기준이 테스트 카테고리에 매핑되었는지 확인
  const allCriteriaIds = features.flatMap((f) => f.acceptanceCriteria.map((c) => c.id));
  const mappedCriteriaIds = new Set(
    testDefinitions.flatMap((d) => d.categories.flatMap((c) => c.mappedCriteria)),
  );
  const allCriteriaHaveTests =
    allCriteriaIds.length === 0 || allCriteriaIds.every((id) => mappedCriteriaIds.has(id));

  // WHY: 순환 의존성은 topologicalSort에서 이미 검증 — 여기선 간단히 재확인
  const sortResult = topologicalSort(features);
  const noCyclicDependencies = sortResult.ok;

  const allIODefined = features.every((f) => f.inputs.length > 0 || f.outputs.length > 0);

  // WHY: 4개 원칙 + IO 조건에서 만족 비율을 점수화
  const checks = [
    allFeaturesHaveCriteria,
    allCriteriaHaveTests,
    noCyclicDependencies,
    allIODefined,
  ];
  const passedCount = checks.filter(Boolean).length;
  const completenessScore = passedCount / checks.length;

  return {
    allFeaturesHaveCriteria,
    allCriteriaHaveTests,
    noCyclicDependencies,
    allIODefined,
    completenessScore,
  };
}

/**
 * 설계 문서에서 프로젝트 유형 탐지 / Detect project type from design document
 *
 * @param design - 설계 문서 내용 / Design document content
 * @returns 프로젝트 유형 문자열 / Project type string
 */
export function detectProjectType(design: string): string {
  const lower = design.toLowerCase();

  if (lower.includes('rest api') || lower.includes('endpoint')) return 'rest-api';
  if (lower.includes('cli') || lower.includes('command line')) return 'cli';
  if (lower.includes('library') || lower.includes('sdk')) return 'library';
  if (lower.includes('webapp') || lower.includes('web app')) return 'webapp';

  return DEFAULT_PROJECT_TYPE;
}
