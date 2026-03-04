/**
 * Contract 빌더 / Contract builder
 *
 * @description
 * KR: 기능 명세 + 테스트 정의 + 설계를 결합하여 ContractSchema를 생성하고,
 *     5대 검증 원칙을 적용한 VerificationMatrix를 구축한다.
 *     순환 의존성 탐지에 위상 정렬(Kahn's algorithm)을 사용한다.
 * EN: Combines feature specs + test definitions + design into a ContractSchema,
 *     builds a VerificationMatrix applying the 5 verification principles.
 *     Uses topological sort (Kahn's algorithm) for cyclic dependency detection.
 */

import { ContractError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import type {
  ContractSchema,
  FeatureSpec,
  HandoffPackage,
  TestTypeDefinition,
  VerificationMatrix,
} from './types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Contract 스키마 현재 버전 / Current contract schema version */
const CURRENT_SCHEMA_VERSION = 1;

/** 기본 프로젝트 유형 / Default project type */
const DEFAULT_PROJECT_TYPE = 'generic';

// ── ContractBuilder ─────────────────────────────────────────────

/**
 * Contract 빌더 / Contract builder
 *
 * @description
 * KR: 5대 검증 원칙을 만족하는 ContractSchema와 HandoffPackage를 생성한다.
 *     1) 모든 기능에 수락 기준이 있는가
 *     2) 모든 기준에 테스트가 있는가
 *     3) 순환 의존성이 없는가
 *     4) 모든 입출력이 정의되었는가
 *     5) 완전성 점수가 충분한가
 * EN: Creates ContractSchema and HandoffPackage satisfying 5 verification principles.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const builder = new ContractBuilder(logger);
 * const contract = builder.buildContract(features, testDefs, design);
 */
export class ContractBuilder {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'contract-builder' });
  }

  /**
   * ContractSchema 생성 / Build a ContractSchema
   *
   * @param features - 기능 명세 목록 / Feature specification list
   * @param testDefinitions - 테스트 정의 목록 / Test definitions
   * @param design - 설계 문서 / Design document
   * @returns ContractSchema / Contract schema
   */
  buildContract(
    features: readonly FeatureSpec[],
    testDefinitions: readonly TestTypeDefinition[],
    design: string,
  ): Result<ContractSchema> {
    this.logger.debug('Contract 생성 시작', { featureCount: features.length });

    if (features.length === 0) {
      return err(new ContractError('contract_no_features', 'Contract에 기능이 하나도 없습니다'));
    }

    // WHY: 순환 의존성 탐지 + 구현 순서 결정을 동시에 수행
    const orderResult = topologicalSort(features);
    if (!orderResult.ok) {
      return err(orderResult.error);
    }

    const verificationMatrix = buildVerificationMatrix(features, testDefinitions);

    const contract: ContractSchema = {
      version: CURRENT_SCHEMA_VERSION,
      projectType: detectProjectType(design),
      features: [...features],
      testDefinitions: [...testDefinitions],
      implementationOrder: orderResult.value,
      verificationMatrix,
    };

    this.logger.info('Contract 생성 완료', {
      featureCount: features.length,
      completenessScore: verificationMatrix.completenessScore,
    });

    return ok(contract);
  }

  /**
   * HandoffPackage 생성 / Build a HandoffPackage
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param contract - Contract 스키마 / Contract schema
   * @param plan - 기획 문서 / Plan document
   * @param design - 설계 문서 / Design document
   * @param spec - 스펙 문서 / Spec document
   * @returns HandoffPackage
   */
  buildHandoffPackage(
    projectId: string,
    contract: ContractSchema,
    plan: string,
    design: string,
    spec: string,
  ): Result<HandoffPackage> {
    this.logger.debug('HandoffPackage 생성 시작', { projectId });

    const handoff: HandoffPackage = {
      id: `handoff-${projectId}-${Date.now()}`,
      projectId,
      contract,
      planDocument: plan,
      designDocument: design,
      specDocument: spec,
      createdAt: new Date(),
      confirmedByUser: false,
    };

    this.logger.info('HandoffPackage 생성 완료', { packageId: handoff.id });
    return ok(handoff);
  }

  /**
   * Contract 5대 원칙 검증 / Validate contract against 5 principles
   *
   * @param contract - 검증할 Contract / Contract to validate
   * @returns 검증 오류 목록 (빈 배열이면 정상) / Validation errors (empty = valid)
   */
  validateContract(contract: ContractSchema): Result<string[]> {
    this.logger.debug('Contract 검증 시작');

    const errors: string[] = [];
    const matrix = contract.verificationMatrix;

    if (!matrix.allFeaturesHaveCriteria) {
      errors.push(
        '원칙 1 위반: 수락 기준이 없는 기능이 있습니다 / ' +
          'Principle 1 violation: Some features lack acceptance criteria',
      );
    }

    if (!matrix.allCriteriaHaveTests) {
      errors.push(
        '원칙 2 위반: 테스트에 매핑되지 않은 수락 기준이 있습니다 / ' +
          'Principle 2 violation: Some criteria are not mapped to tests',
      );
    }

    if (!matrix.noCyclicDependencies) {
      errors.push(
        '원칙 3 위반: 순환 의존성이 탐지되었습니다 / ' +
          'Principle 3 violation: Cyclic dependencies detected',
      );
    }

    if (!matrix.allIODefined) {
      errors.push(
        '원칙 4 위반: 입출력이 정의되지 않은 기능이 있습니다 / ' +
          'Principle 4 violation: Some features have undefined I/O',
      );
    }

    if (matrix.completenessScore < 1.0) {
      errors.push(
        `완전성 점수가 1.0 미만입니다: ${matrix.completenessScore} / ` +
          `Completeness score below 1.0: ${matrix.completenessScore}`,
      );
    }

    this.logger.info('Contract 검증 완료', { errorCount: errors.length });
    return ok(errors);
  }
}

// ── 내부 함수 / Internal Functions ──────────────────────────────

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
function topologicalSort(features: readonly FeatureSpec[]): Result<string[], ContractError> {
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
 */
function buildVerificationMatrix(
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
 */
function detectProjectType(design: string): string {
  const lower = design.toLowerCase();

  if (lower.includes('rest api') || lower.includes('endpoint')) return 'rest-api';
  if (lower.includes('cli') || lower.includes('command line')) return 'cli';
  if (lower.includes('library') || lower.includes('sdk')) return 'library';
  if (lower.includes('webapp') || lower.includes('web app')) return 'webapp';

  return DEFAULT_PROJECT_TYPE;
}
