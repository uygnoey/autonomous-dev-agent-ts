import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { ContractBuilder } from 'layer1/contract-builder.js';
import type {
  ContractSchema,
  FeatureSpec,
  TestTypeDefinition,
  VerificationMatrix,
} from 'layer1/types.js';

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

function makeContract(matrixOverrides: Partial<VerificationMatrix> = {}): ContractSchema {
  return {
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
      ...matrixOverrides,
    },
  };
}

describe('ContractBuilder', () => {
  let builder: ContractBuilder;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    builder = new ContractBuilder(logger);
  });

  // ── 생성자 ────────────────────────────────────────────────

  describe('ContractBuilder 생성자', () => {
    it('인스턴스가 생성된다', () => {
      expect(() => new ContractBuilder(logger)).not.toThrow();
    });

    it('ContractBuilder 인스턴스이다', () => {
      expect(new ContractBuilder(logger)).toBeInstanceOf(ContractBuilder);
    });

    it('buildContract 메서드 존재', () => {
      expect(typeof new ContractBuilder(logger).buildContract).toBe('function');
    });

    it('buildHandoffPackage 메서드 존재', () => {
      expect(typeof new ContractBuilder(logger).buildHandoffPackage).toBe('function');
    });

    it('validateContract 메서드 존재', () => {
      expect(typeof new ContractBuilder(logger).validateContract).toBe('function');
    });

    it('두 인스턴스는 서로 다른 객체', () => {
      const b1 = new ContractBuilder(logger);
      const b2 = new ContractBuilder(logger);
      expect(b1).not.toBe(b2);
    });

    it('warn 로거로 생성 가능', () => {
      expect(() => new ContractBuilder(new ConsoleLogger('warn'))).not.toThrow();
    });

    it('debug 로거로 생성 가능', () => {
      expect(() => new ContractBuilder(new ConsoleLogger('debug'))).not.toThrow();
    });

    it('10개 인스턴스 모두 독립', () => {
      const builders = Array.from({ length: 10 }, () => new ContractBuilder(logger));
      for (let i = 0; i < builders.length; i++) {
        for (let j = i + 1; j < builders.length; j++) {
          expect(builders[i]).not.toBe(builders[j]);
        }
      }
    });
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

    it('ok는 boolean 타입', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      expect(typeof result.ok).toBe('boolean');
    });

    it('5번 반복 → 동일 ok 결과', () => {
      for (let i = 0; i < 5; i++) {
        const result = builder.buildContract([createFeature({ id: `feat-${i}` })], [], 'Design');
        expect(result.ok).toBe(true);
      }
    });

    it('5개 기능 → ok', () => {
      const features = Array.from({ length: 5 }, (_, i) => createFeature({ id: `feat-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('10개 기능 → ok', () => {
      const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `feat-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('결과 version은 1', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      if (result.ok) expect(result.value.version).toBe(1);
    });

    it('결과 features는 배열', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      if (result.ok) expect(Array.isArray(result.value.features)).toBe(true);
    });

    it('결과 implementationOrder는 배열', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      if (result.ok) expect(Array.isArray(result.value.implementationOrder)).toBe(true);
    });

    it('결과 testDefinitions는 배열', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      if (result.ok) expect(Array.isArray(result.value.testDefinitions)).toBe(true);
    });

    it('기능 없음 → error code string', () => {
      const result = builder.buildContract([], [], 'Design');
      if (!result.ok) expect(typeof result.error.code).toBe('string');
    });

    it('기능 없음 → error message string', () => {
      const result = builder.buildContract([], [], 'Design');
      if (!result.ok) expect(typeof result.error.message).toBe('string');
    });

    it('3개 노드 선형 의존성 → 올바른 순서', () => {
      const features = [
        createFeature({ id: 'feat-c', dependencies: ['feat-b'] }),
        createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
        createFeature({ id: 'feat-a', dependencies: [] }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value.implementationOrder;
        expect(order.indexOf('feat-a')).toBeLessThan(order.indexOf('feat-b'));
        expect(order.indexOf('feat-b')).toBeLessThan(order.indexOf('feat-c'));
      }
    });
  });

  // ── buildHandoffPackage ─────────────────────────────────────

  describe('buildHandoffPackage', () => {
    it('HandoffPackage를 생성한다', () => {
      const contract = makeContract();

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
      const contract = makeContract();

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

    it('ok는 boolean 타입', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      expect(typeof result.ok).toBe('boolean');
    });

    it('confirmedByUser는 false로 초기화', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (result.ok) expect(result.value.confirmedByUser).toBe(false);
    });

    it('id는 string 타입', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (result.ok) expect(typeof result.value.id).toBe('string');
    });

    it('createdAt은 Date 타입', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (result.ok) expect(result.value.createdAt).toBeInstanceOf(Date);
    });

    it('projectId는 string 타입', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (result.ok) expect(typeof result.value.projectId).toBe('string');
    });

    it('5번 반복 → 모두 ok', () => {
      for (let i = 0; i < 5; i++) {
        const result = builder.buildHandoffPackage(`proj-${i}`, makeContract(), 'P', 'D', 'S');
        expect(result.ok).toBe(true);
      }
    });

    it('다른 projectId → id도 달라짐', () => {
      const r1 = builder.buildHandoffPackage('proj-1', makeContract(), 'P', 'D', 'S');
      const r2 = builder.buildHandoffPackage('proj-2', makeContract(), 'P', 'D', 'S');
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  // ── validateContract ────────────────────────────────────────

  describe('validateContract', () => {
    it('5대 원칙을 모두 만족하면 빈 에러를 반환한다', () => {
      const result = builder.validateContract(makeContract());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('수락 기준 없는 기능이 있으면 원칙 1 위반을 보고한다', () => {
      const result = builder.validateContract(makeContract({ allFeaturesHaveCriteria: false, completenessScore: 0.75 }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 1'))).toBe(true);
      }
    });

    it('테스트 매핑이 없으면 원칙 2 위반을 보고한다', () => {
      const result = builder.validateContract(makeContract({ allCriteriaHaveTests: false, completenessScore: 0.75 }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 2'))).toBe(true);
      }
    });

    it('순환 의존성이 있으면 원칙 3 위반을 보고한다', () => {
      const result = builder.validateContract(makeContract({ noCyclicDependencies: false, completenessScore: 0.75 }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 3'))).toBe(true);
      }
    });

    it('입출력 미정의면 원칙 4 위반을 보고한다', () => {
      const result = builder.validateContract(makeContract({ allIODefined: false, completenessScore: 0.75 }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('원칙 4'))).toBe(true);
      }
    });

    it('완전성 점수가 1.0 미만이면 보고한다', () => {
      const result = builder.validateContract(makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        allIODefined: false,
        completenessScore: 0.25,
      }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.some((e) => e.includes('완전성'))).toBe(true);
      }
    });

    it('모든 원칙 위반 시 5개 에러를 보고한다', () => {
      const result = builder.validateContract(makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        noCyclicDependencies: false,
        allIODefined: false,
        completenessScore: 0,
      }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(5);
      }
    });

    it('ok는 boolean 타입', () => {
      expect(typeof builder.validateContract(makeContract()).ok).toBe('boolean');
    });

    it('issues는 배열 타입', () => {
      const result = builder.validateContract(makeContract());
      if (result.ok) expect(Array.isArray(result.value)).toBe(true);
    });

    it('issues 원소는 string 타입', () => {
      const result = builder.validateContract(makeContract({ allFeaturesHaveCriteria: false }));
      if (result.ok) {
        for (const issue of result.value) {
          expect(typeof issue).toBe('string');
        }
      }
    });

    it('5번 반복 → 동일 issues 개수', () => {
      const contract = makeContract();
      const firstResult = builder.validateContract(contract);
      const firstLen = firstResult.ok ? firstResult.value.length : -1;
      for (let i = 0; i < 4; i++) {
        const r = builder.validateContract(contract);
        if (r.ok) expect(r.value.length).toBe(firstLen);
      }
    });

    it('원칙 1+2 위반 → 2개 이상 에러', () => {
      const result = builder.validateContract(makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        completenessScore: 0.5,
      }));
      if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(2);
    });

    it('원칙 1 위반 에러는 string이다', () => {
      const result = builder.validateContract(makeContract({ allFeaturesHaveCriteria: false }));
      if (result.ok) {
        const p1err = result.value.find(e => e.includes('원칙 1'));
        if (p1err) expect(typeof p1err).toBe('string');
      }
    });
  });
});
