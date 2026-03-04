/**
 * 핸드오프 수신기 / Handoff Receiver
 *
 * @description
 * KR: layer1에서 전달받은 HandoffPackage를 수신하고 검증한다.
 *     Contract의 5대 검증 원칙을 확인한다:
 *     1. 모든 기능에 수락 기준이 있는지
 *     2. 모든 기준에 테스트가 있는지
 *     3. 순환 의존성이 없는지
 *     4. 모든 입출력이 정의되었는지
 *     5. 완전성 점수가 충분한지
 * EN: Receives and validates HandoffPackage from layer1.
 *     Checks 5 Contract verification principles.
 */

import { ContractError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { ContractSchema, HandoffPackage } from '../layer1/types.js';

/**
 * 최소 완전성 점수 / Minimum completeness score
 */
const MIN_COMPLETENESS_SCORE = 0.8;

/**
 * 핸드오프 수신기 / Handoff Receiver
 *
 * @description
 * KR: layer1 → layer2 인수 패키지를 검증한다.
 * EN: Validates the layer1 → layer2 handoff package.
 *
 * @example
 * const receiver = new HandoffReceiver(logger);
 * const result = receiver.receive(handoffPackage);
 * if (!result.ok) logger.error('검증 실패', { error: result.error });
 */
export class HandoffReceiver {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'handoff-receiver' });
  }

  /**
   * 핸드오프 패키지를 수신하고 검증한다 / Receives and validates a handoff package
   *
   * @param handoffPackage - layer1 인수 패키지 / Handoff package from layer1
   * @returns 성공 시 ok, 검증 실패 시 ContractError / ok on success, ContractError on failure
   */
  receive(handoffPackage: HandoffPackage): Result<void> {
    this.logger.info('핸드오프 패키지 수신', {
      packageId: handoffPackage.id,
      projectId: handoffPackage.projectId,
      featureCount: handoffPackage.contract.features.length,
    });

    const structureErrors = this.validateStructureInternal(handoffPackage.contract);
    if (structureErrors.length > 0) {
      return err(
        new ContractError(
          'contract_structure_invalid',
          `Contract 구조 검증 실패: ${structureErrors.join(', ')}`,
        ),
      );
    }

    const consistencyWarnings = this.validateConsistencyInternal(handoffPackage.contract);
    if (consistencyWarnings.length > 0) {
      this.logger.warn('Contract 일관성 경고', { warnings: consistencyWarnings });
    }

    this.logger.info('핸드오프 패키지 검증 완료', { packageId: handoffPackage.id });
    return ok(undefined);
  }

  /**
   * Contract 구조 검증 / Validates contract structure (5 principles)
   *
   * @param contract - Contract 스키마 / Contract schema
   * @returns 에러 목록 (빈 배열이면 통과) / Error list (empty means pass)
   */
  validateStructure(contract: ContractSchema): Result<string[]> {
    return ok(this.validateStructureInternal(contract));
  }

  /**
   * Contract 일관성 검증 / Validates contract consistency
   *
   * @param contract - Contract 스키마 / Contract schema
   * @returns 경고 목록 (빈 배열이면 통과) / Warning list (empty means pass)
   */
  validateConsistency(contract: ContractSchema): Result<string[]> {
    return ok(this.validateConsistencyInternal(contract));
  }

  /**
   * 구조 검증 내부 구현 / Internal structure validation
   *
   * @param contract - Contract 스키마 / Contract schema
   * @returns 에러 메시지 배열 / Error message array
   */
  private validateStructureInternal(contract: ContractSchema): string[] {
    const errors: string[] = [];

    // 원칙 1: 모든 기능에 수락 기준이 있는지 / Principle 1: All features have criteria
    for (const feature of contract.features) {
      if (feature.acceptanceCriteria.length === 0) {
        errors.push(`기능 '${feature.id}'에 수락 기준이 없습니다`);
      }
    }

    // 원칙 2: 모든 기준에 테스트가 있는지 / Principle 2: All criteria have tests
    const testedFeatureIds = new Set(contract.testDefinitions.map((td) => td.featureId));
    for (const feature of contract.features) {
      if (!testedFeatureIds.has(feature.id)) {
        errors.push(`기능 '${feature.id}'에 테스트 정의가 없습니다`);
      }
    }

    // 원칙 3: 순환 의존성이 없는지 / Principle 3: No cyclic dependencies
    if (this.hasCyclicDependencies(contract)) {
      errors.push('기능 간 순환 의존성이 감지되었습니다');
    }

    // 원칙 4: 모든 입출력이 정의되었는지 / Principle 4: All I/O defined
    for (const feature of contract.features) {
      if (feature.inputs.length === 0 && feature.outputs.length === 0) {
        errors.push(`기능 '${feature.id}'에 입출력 정의가 없습니다`);
      }
    }

    // 원칙 5: 완전성 점수 / Principle 5: Completeness score
    if (contract.verificationMatrix.completenessScore < MIN_COMPLETENESS_SCORE) {
      errors.push(
        `완전성 점수가 부족합니다: ${contract.verificationMatrix.completenessScore} < ${MIN_COMPLETENESS_SCORE}`,
      );
    }

    return errors;
  }

  /**
   * 일관성 검증 내부 구현 / Internal consistency validation
   *
   * @param contract - Contract 스키마 / Contract schema
   * @returns 경고 메시지 배열 / Warning message array
   */
  private validateConsistencyInternal(contract: ContractSchema): string[] {
    const warnings: string[] = [];

    // 구현 순서에 없는 기능이 있는지 / Features missing from implementation order
    const orderedIds = new Set(contract.implementationOrder);
    for (const feature of contract.features) {
      if (!orderedIds.has(feature.id)) {
        warnings.push(`기능 '${feature.id}'가 구현 순서에 포함되지 않았습니다`);
      }
    }

    // 검증 매트릭스 불일치 / Verification matrix inconsistency
    if (
      !(
        contract.verificationMatrix.allFeaturesHaveCriteria &&
        contract.verificationMatrix.allCriteriaHaveTests &&
        contract.verificationMatrix.noCyclicDependencies &&
        contract.verificationMatrix.allIODefined
      )
    ) {
      warnings.push('검증 매트릭스에 미충족 항목이 있습니다');
    }

    return warnings;
  }

  /**
   * 순환 의존성을 탐지한다 / Detects cyclic dependencies
   *
   * @description
   * KR: DFS 기반 순환 탐지. 방문 중(gray) 노드를 재방문하면 순환.
   * EN: DFS-based cycle detection. Revisiting a gray node means a cycle.
   *
   * @param contract - Contract 스키마 / Contract schema
   * @returns 순환 의존성 존재 여부 / Whether cyclic dependencies exist
   */
  private hasCyclicDependencies(contract: ContractSchema): boolean {
    const adjacency = new Map<string, readonly string[]>();
    for (const feature of contract.features) {
      adjacency.set(feature.id, feature.dependencies);
    }

    const white = new Set(contract.features.map((f) => f.id));
    const gray = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      white.delete(nodeId);
      gray.add(nodeId);

      const deps = adjacency.get(nodeId) ?? [];
      for (const dep of deps) {
        if (gray.has(dep)) return true;
        if (white.has(dep) && dfs(dep)) return true;
      }

      gray.delete(nodeId);
      return false;
    };

    for (const featureId of [...white]) {
      if (white.has(featureId) && dfs(featureId)) {
        return true;
      }
    }

    return false;
  }
}
