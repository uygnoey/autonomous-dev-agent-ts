import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { ContractBuilder } from '../../../src/layer1/contract-builder.js';
import type {
  ContractSchema,
  FeatureSpec,
  TestTypeDefinition,
  VerificationMatrix,
} from '../../../src/layer1/types.js';

function createFeature(overrides: Partial<FeatureSpec> = {}): FeatureSpec {
  return {
    id: overrides.id ?? 'feat-0',
    name: overrides.name ?? 'Test Feature',
    description: overrides.description ?? 'A test feature',
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    dependencies: overrides.dependencies ?? [],
    inputs: overrides.inputs ?? [],
    outputs: overrides.outputs ?? [],
  };
}

function createTestDef(featureId: string, mappedCriteria: string[] = []): TestTypeDefinition {
  return {
    featureId,
    categories: [{ name: 'general', description: 'General', mappedCriteria }],
    rules: [],
    sampleTests: [],
    ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
  };
}

describe('ContractBuilder', () => {
  let builder: ContractBuilder;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    builder = new ContractBuilder(logger);
  });

  // ── buildContract ───────────────────────────────────────────

  describe('buildContract', () => {
    it('기능과 테스트 정의로 Contract를 생성한다', () => {
      const features = [createFeature({ id: 'feat-a' })];
      const testDefs = [createTestDef('feat-a')];

      const result = builder.buildContract(features, testDefs, 'Design doc');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.version).toBe(1);
        expect(result.value.features.length).toBe(1);
        expect(result.value.testDefinitions.length).toBe(1);
        expect(result.value.implementationOrder).toEqual(['feat-a']);
      }
    });

    it('기능이 없으면 에러를 반환한다', () => {
      const result = builder.buildContract([], [], 'Design');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_no_features');
      }
    });

    it('의존성 기반으로 구현 순서를 결정한다', () => {
      const features = [
        createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
        createFeature({ id: 'feat-a', dependencies: [] }),
      ];
      const testDefs = [createTestDef('feat-a'), createTestDef('feat-b')];

      const result = builder.buildContract(features, testDefs, 'Design');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value.implementationOrder;
        const indexA = order.indexOf('feat-a');
        const indexB = order.indexOf('feat-b');
        expect(indexA).toBeLessThan(indexB);
      }
    });

    it('순환 의존성을 탐지하면 에러를 반환한다', () => {
      const features = [
        createFeature({ id: 'feat-a', dependencies: ['feat-b'] }),
        createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
      ];

      const result = builder.buildContract(features, [], 'Design');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_cyclic_dependency');
      }
    });

    it('3개 노드 순환 의존성을 탐지한다', () => {
      const features = [
        createFeature({ id: 'feat-a', dependencies: ['feat-c'] }),
        createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
        createFeature({ id: 'feat-c', dependencies: ['feat-b'] }),
      ];

      const result = builder.buildContract(features, [], 'Design');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_cyclic_dependency');
      }
    });

    it('외부 의존성(존재하지 않는 ID)은 무시한다', () => {
      const features = [
        createFeature({ id: 'feat-a', dependencies: ['external-lib'] }),
      ];

      const result = builder.buildContract(features, [], 'Design');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.implementationOrder).toEqual(['feat-a']);
      }
    });

    it('rest-api 프로젝트 유형을 탐지한다', () => {
      const features = [createFeature()];

      const result = builder.buildContract(features, [], 'REST API endpoint design');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectType).toBe('rest-api');
      }
    });

    it('cli 프로젝트 유형을 탐지한다', () => {
      const features = [createFeature()];

      const result = builder.buildContract(features, [], 'CLI command line interface');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectType).toBe('cli');
      }
    });

    it('기본 프로젝트 유형은 generic이다', () => {
      const features = [createFeature()];

      const result = builder.buildContract(features, [], 'Some design');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectType).toBe('generic');
      }
    });

    it('VerificationMatrix를 올바르게 생성한다', () => {
      const features = [
        createFeature({
          id: 'feat-a',
          acceptanceCriteria: [
            { id: 'ac-1', description: 'Test', verifiable: true, testCategory: 'general' },
          ],
          inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
          outputs: [{ name: 'out', type: 'string', constraints: '', required: true }],
        }),
      ];
      const testDefs = [createTestDef('feat-a', ['ac-1'])];

      const result = builder.buildContract(features, testDefs, 'Design');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const matrix = result.value.verificationMatrix;
        expect(matrix.allFeaturesHaveCriteria).toBe(true);
        expect(matrix.allCriteriaHaveTests).toBe(true);
        expect(matrix.noCyclicDependencies).toBe(true);
        expect(matrix.allIODefined).toBe(true);
        expect(matrix.completenessScore).toBe(1.0);
      }
    });
  });

  // ── buildHandoffPackage ─────────────────────────────────────

  describe('buildHandoffPackage', () => {
    it('HandoffPackage를 생성한다', () => {
      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: {
          allFeaturesHaveCriteria: true,
          allCriteriaHaveTests: true,
          noCyclicDependencies: true,
          allIODefined: true,
          completenessScore: 1.0,
        },
      };

      const result = builder.buildHandoffPackage(
        'proj-test',
        contract,
        'Plan',
        'Design',
        'Spec',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-test');
        expect(result.value.planDocument).toBe('Plan');
        expect(result.value.designDocument).toBe('Design');
        expect(result.value.specDocument).toBe('Spec');
        expect(result.value.confirmedByUser).toBe(false);
        expect(result.value.id).toContain('handoff-proj-test');
      }
    });

    it('생성 시각이 현재 시각 근처이다', () => {
      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: {
          allFeaturesHaveCriteria: true,
          allCriteriaHaveTests: true,
          noCyclicDependencies: true,
          allIODefined: true,
          completenessScore: 1.0,
        },
      };

      const before = Date.now();
      const result = builder.buildHandoffPackage('proj', contract, 'P', 'D', 'S');
      const after = Date.now();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const createdMs = result.value.createdAt.getTime();
        expect(createdMs).toBeGreaterThanOrEqual(before);
        expect(createdMs).toBeLessThanOrEqual(after);
      }
    });
  });

  // ── validateContract ────────────────────────────────────────

  describe('validateContract', () => {
    it('5대 원칙을 모두 만족하면 빈 에러를 반환한다', () => {
      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: {
          allFeaturesHaveCriteria: true,
          allCriteriaHaveTests: true,
          noCyclicDependencies: true,
          allIODefined: true,
          completenessScore: 1.0,
        },
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('수락 기준 없는 기능이 있으면 원칙 1 위반을 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 0.75,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 1'))).toBe(true);
      }
    });

    it('테스트 매핑이 없으면 원칙 2 위반을 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: false,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 0.75,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 2'))).toBe(true);
      }
    });

    it('순환 의존성이 있으면 원칙 3 위반을 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: false,
        allIODefined: true,
        completenessScore: 0.75,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 3'))).toBe(true);
      }
    });

    it('입출력 미정의면 원칙 4 위반을 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: false,
        completenessScore: 0.75,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 4'))).toBe(true);
      }
    });

    it('완전성 점수가 1.0 미만이면 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        noCyclicDependencies: true,
        allIODefined: false,
        completenessScore: 0.25,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('완전성'))).toBe(true);
      }
    });

    it('모든 원칙 위반 시 5개 에러를 보고한다', () => {
      const matrix: VerificationMatrix = {
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        noCyclicDependencies: false,
        allIODefined: false,
        completenessScore: 0,
      };

      const contract: ContractSchema = {
        version: 1,
        projectType: 'generic',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: matrix,
      };

      const result = builder.validateContract(contract);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
      }
    });
  });
});
