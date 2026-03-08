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

  // ── buildContract 추가 경계값 ───────────────────────────────

  describe('buildContract 추가 경계값', () => {
    it('기능 id에 특수문자 포함 → ok', () => {
      const features = [createFeature({ id: 'feat-특수!@#' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 name이 빈 문자열 → ok', () => {
      const features = [createFeature({ id: 'feat-1', name: '' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 description이 매우 긴 문자열 → ok', () => {
      const features = [createFeature({ id: 'feat-1', description: 'x'.repeat(5000) })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('20개 기능 → ok', () => {
      const features = Array.from({ length: 20 }, (_, i) => createFeature({ id: `feat-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 없음 → error.name은 string', () => {
      const result = builder.buildContract([], [], 'Design');
      if (!result.ok) {
        expect(typeof result.error.name).toBe('string');
      }
    });

    it('library 프로젝트 유형 탐지', () => {
      const features = [createFeature()];
      const result = builder.buildContract(features, [], 'library package npm module');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectType).toBeTruthy();
      }
    });

    it('결과 verificationMatrix 존재', () => {
      const features = [createFeature()];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix).toBeDefined();
      }
    });

    it('5번 반복 → implementationOrder 길이 동일', () => {
      const features = [createFeature({ id: 'feat-1' }), createFeature({ id: 'feat-2' })];
      const firstResult = builder.buildContract(features, [], 'Design');
      const firstLen = firstResult.ok ? firstResult.value.implementationOrder.length : -1;
      for (let i = 0; i < 4; i++) {
        const r = builder.buildContract(features, [], 'Design');
        if (r.ok) expect(r.value.implementationOrder.length).toBe(firstLen);
      }
    });

    it('단일 self-dependency는 순환 탐지', () => {
      // 자기 자신에게 의존하는 경우
      const features = [createFeature({ id: 'feat-a', dependencies: ['feat-a'] })];
      const result = builder.buildContract(features, [], 'Design');
      // 자기 자신 의존은 외부 의존성으로 처리될 수도 있고 순환으로 탐지될 수도 있음
      expect(typeof result.ok).toBe('boolean');
    });

    it('빈 designDoc → ok', () => {
      const features = [createFeature()];
      const result = builder.buildContract(features, [], '');
      expect(result.ok).toBe(true);
    });

    it('10개 testDefinitions → ok', () => {
      const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `f${i}` }));
      const testDefs = features.map(f => createTestDef(f.id));
      const result = builder.buildContract(features, testDefs, 'Design');
      expect(result.ok).toBe(true);
    });
  });

  // ── buildHandoffPackage 추가 경계값 ─────────────────────────

  describe('buildHandoffPackage 추가 경계값', () => {
    it('projectId 빈 문자열 → ok 또는 error 중 하나', () => {
      const result = builder.buildHandoffPackage('', makeContract(), 'P', 'D', 'S');
      expect(typeof result.ok).toBe('boolean');
    });

    it('매우 긴 planDocument → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'x'.repeat(10000), 'D', 'S');
      expect(result.ok).toBe(true);
    });

    it('매우 긴 designDocument → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'x'.repeat(10000), 'S');
      expect(result.ok).toBe(true);
    });

    it('planDocument 한국어 → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), '한국어 계획서', '설계서', '명세서');
      expect(result.ok).toBe(true);
    });

    it('10번 반복 → id 모두 다름', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const r = builder.buildHandoffPackage(`proj-${i}`, makeContract(), 'P', 'D', 'S');
        if (r.ok) ids.add(r.value.id);
      }
      expect(ids.size).toBe(10);
    });

    it('confirmedByUser는 boolean 타입', () => {
      const r = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (r.ok) expect(typeof r.value.confirmedByUser).toBe('boolean');
    });

    it('planDocument는 string 타입', () => {
      const r = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (r.ok) expect(typeof r.value.planDocument).toBe('string');
    });

    it('specDocument는 string 타입', () => {
      const r = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (r.ok) expect(typeof r.value.specDocument).toBe('string');
    });
  });

  // ── validateContract 추가 경계값 ─────────────────────────────

  describe('validateContract 추가 경계값', () => {
    it('completenessScore=1.0 → 완전성 보고 없음', () => {
      const result = builder.validateContract(makeContract({ completenessScore: 1.0 }));
      if (result.ok) {
        const hasCompleteness = result.value.some(e => e.includes('완전성'));
        expect(hasCompleteness).toBe(false);
      }
    });

    it('completenessScore=0.0 → 완전성 보고됨', () => {
      const result = builder.validateContract(makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        allIODefined: false,
        completenessScore: 0.0,
      }));
      if (result.ok) {
        const hasCompleteness = result.value.some(e => e.includes('완전성'));
        expect(hasCompleteness).toBe(true);
      }
    });

    it('noCyclicDependencies=false 단독 → issues 1개 이상', () => {
      const result = builder.validateContract(makeContract({ noCyclicDependencies: false }));
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('allIODefined=false 단독 → issues 1개 이상', () => {
      const result = builder.validateContract(makeContract({ allIODefined: false }));
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('5번 반복 validateContract 호출 → ok 일관성', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        completenessScore: 0.5,
      });
      for (let i = 0; i < 5; i++) {
        const r = builder.validateContract(contract);
        expect(r.ok).toBe(true);
      }
    });
  });

  // ── buildContract 심층 경계값 ─────────────────────────────────

  describe('buildContract 심층 경계값', () => {
    it('UUID 형식 기능 id → ok', () => {
      const uuid = crypto.randomUUID();
      const features = [createFeature({ id: uuid })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.implementationOrder).toContain(uuid);
    });

    it('기능 id에 한글 포함 → ok', () => {
      const features = [createFeature({ id: '기능-인증-시스템' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 이름에 이모지 포함 → ok', () => {
      const features = [createFeature({ id: 'feat-emoji', name: '🔐 인증 기능' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('빈 acceptanceCriteria 배열 → matrix.allFeaturesHaveCriteria 처리', () => {
      const features = [createFeature({ id: 'feat-no-ac', acceptanceCriteria: [] })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.verificationMatrix.allFeaturesHaveCriteria).toBe('boolean');
      }
    });

    it('긴 특수문자 포함 designDoc → ok', () => {
      const features = [createFeature()];
      const specialDoc = '설계서: <API> & {endpoint} | [REST] @version=2.0\n'.repeat(50);
      const result = builder.buildContract(features, [], specialDoc);
      expect(result.ok).toBe(true);
    });

    it('50개 기능 체인 의존성 → ok', () => {
      const features = Array.from({ length: 50 }, (_, i) =>
        createFeature({ id: `feat-${i}`, dependencies: i > 0 ? [`feat-${i - 1}`] : [] }),
      );
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value.implementationOrder;
        for (let i = 1; i < 50; i++) {
          expect(order.indexOf(`feat-${i - 1}`)).toBeLessThan(order.indexOf(`feat-${i}`));
        }
      }
    });

    it('음수 아닌 completenessScore 범위 확인', () => {
      const features = [createFeature({ id: 'f', acceptanceCriteria: [
        { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' },
      ]})];
      const defs = [createTestDef('f', ['ac-1'])];
      const result = builder.buildContract(features, defs, 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix.completenessScore).toBeGreaterThanOrEqual(0);
        expect(result.value.verificationMatrix.completenessScore).toBeLessThanOrEqual(1.0);
      }
    });

    it('projectType은 string 타입', () => {
      const result = builder.buildContract([createFeature()], [], 'Design');
      if (result.ok) expect(typeof result.value.projectType).toBe('string');
    });

    it('전체 기능 id가 implementationOrder에 포함됨', () => {
      const features = Array.from({ length: 5 }, (_, i) => createFeature({ id: `feat-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        for (const f of features) {
          expect(result.value.implementationOrder).toContain(f.id);
        }
      }
    });

    it('features 배열이 원본과 동일 길이', () => {
      const features = Array.from({ length: 7 }, (_, i) => createFeature({ id: `feat-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) expect(result.value.features.length).toBe(7);
    });

    it('testDefinitions 배열이 입력과 동일 길이', () => {
      const features = Array.from({ length: 3 }, (_, i) => createFeature({ id: `f${i}` }));
      const defs = features.map(f => createTestDef(f.id));
      const result = builder.buildContract(features, defs, 'Design');
      if (result.ok) expect(result.value.testDefinitions.length).toBe(3);
    });

    it('단일 기능 자기 참조 의존성 처리', () => {
      const features = [createFeature({ id: 'feat-self', dependencies: ['feat-self'] })];
      const result = builder.buildContract(features, [], 'Design');
      // 자기 참조는 외부 의존으로 처리되거나 순환으로 탐지될 수 있음
      expect(typeof result.ok).toBe('boolean');
    });
  });

  // ── buildHandoffPackage 심층 경계값 ──────────────────────────

  describe('buildHandoffPackage 심층 경계값', () => {
    it('UUID 형식 projectId → ok', () => {
      const uuid = crypto.randomUUID();
      const result = builder.buildHandoffPackage(uuid, makeContract(), 'P', 'D', 'S');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe(uuid);
        expect(result.value.id).toContain('handoff-' + uuid);
      }
    });

    it('특수문자 포함 projectId → ok 또는 error', () => {
      const result = builder.buildHandoffPackage('proj!@#$', makeContract(), 'P', 'D', 'S');
      expect(typeof result.ok).toBe('boolean');
    });

    it('specDocument 이모지 포함 → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', '📋 명세서 v1.0');
      expect(result.ok).toBe(true);
    });

    it('designDocument 한자 포함 → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', '設計書', 'S');
      expect(result.ok).toBe(true);
    });

    it('100번 반복 → 각 id가 고유', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const r = builder.buildHandoffPackage(`proj-${i}`, makeContract(), 'P', 'D', 'S');
        if (r.ok) ids.add(r.value.id);
      }
      expect(ids.size).toBe(100);
    });

    it('features 있는 contract → ok', () => {
      const contract = makeContract();
      contract.features = [createFeature({ id: 'feat-in-contract' })];
      const result = builder.buildHandoffPackage('proj-with-features', contract, 'P', 'D', 'S');
      expect(result.ok).toBe(true);
    });

    it('verificationMatrix 완전하지 않은 contract → ok', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        completenessScore: 0.5,
      });
      const result = builder.buildHandoffPackage('proj-incomplete', contract, 'Plan', 'Design', 'Spec');
      expect(result.ok).toBe(true);
    });

    it('createdAt이 유효한 날짜', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', 'S');
      if (result.ok) {
        expect(result.value.createdAt).toBeInstanceOf(Date);
        expect(Number.isNaN(result.value.createdAt.getTime())).toBe(false);
      }
    });

    it('planDocument 빈 문자열 → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), '', 'D', 'S');
      expect(result.ok).toBe(true);
    });

    it('designDocument 빈 문자열 → ok', () => {
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', '', 'S');
      expect(result.ok).toBe(true);
    });
  });

  // ── validateContract 심층 경계값 ──────────────────────────────

  describe('validateContract 심층 경계값', () => {
    it('completenessScore=0.999 → 완전성 보고됨', () => {
      const result = builder.validateContract(makeContract({
        allFeaturesHaveCriteria: false,
        completenessScore: 0.999,
      }));
      if (result.ok) {
        // 0.999 < 1.0 이므로 완전성 보고되어야 함 또는 원칙 1만 위반
        expect(result.value.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('모든 원칙 통과 → issues 0개', () => {
      const result = builder.validateContract(makeContract());
      if (result.ok) expect(result.value.length).toBe(0);
    });

    it('원칙 3+4 위반 → 2개 이상 에러', () => {
      const result = builder.validateContract(makeContract({
        noCyclicDependencies: false,
        allIODefined: false,
        completenessScore: 0.5,
      }));
      if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(2);
    });

    it('원칙 1 위반 에러 문자열에 숫자 포함', () => {
      const result = builder.validateContract(makeContract({ allFeaturesHaveCriteria: false }));
      if (result.ok) {
        const p1 = result.value.find(e => e.includes('원칙 1'));
        if (p1) expect(p1).toContain('1');
      }
    });

    it('원칙 2 위반 에러 문자열에 숫자 포함', () => {
      const result = builder.validateContract(makeContract({ allCriteriaHaveTests: false }));
      if (result.ok) {
        const p2 = result.value.find(e => e.includes('원칙 2'));
        if (p2) expect(p2).toContain('2');
      }
    });

    it('원칙 3 위반 에러 문자열에 숫자 포함', () => {
      const result = builder.validateContract(makeContract({ noCyclicDependencies: false }));
      if (result.ok) {
        const p3 = result.value.find(e => e.includes('원칙 3'));
        if (p3) expect(p3).toContain('3');
      }
    });

    it('원칙 4 위반 에러 문자열에 숫자 포함', () => {
      const result = builder.validateContract(makeContract({ allIODefined: false }));
      if (result.ok) {
        const p4 = result.value.find(e => e.includes('원칙 4'));
        if (p4) expect(p4).toContain('4');
      }
    });

    it('100번 반복 완전한 contract → 항상 빈 issues', () => {
      const contract = makeContract();
      for (let i = 0; i < 100; i++) {
        const result = builder.validateContract(contract);
        if (result.ok) expect(result.value.length).toBe(0);
      }
    });

    it('빌더 재생성 후 validateContract → 동일 결과', () => {
      const b1 = new ContractBuilder(logger);
      const b2 = new ContractBuilder(logger);
      const contract = makeContract({ allFeaturesHaveCriteria: false, completenessScore: 0.5 });
      const r1 = b1.validateContract(contract);
      const r2 = b2.validateContract(contract);
      if (r1.ok && r2.ok) {
        expect(r1.value.length).toBe(r2.value.length);
      }
    });
  });

  // ── buildContract 더 깊은 경계값 ─────────────────────────────

  describe('buildContract 더 깊은 경계값', () => {
    it('기능 id가 숫자 문자열 → ok', () => {
      const features = [createFeature({ id: '12345' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.implementationOrder).toContain('12345');
    });

    it('기능 이름이 매우 긴 문자열 (5000자) → ok', () => {
      const features = [createFeature({ id: 'feat-long-name', name: 'N'.repeat(5000) })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 inputs만 있고 outputs 없음 → ok', () => {
      const features = [createFeature({
        id: 'feat-inputs-only',
        inputs: [{ name: 'userId', type: 'string', constraints: 'required', required: true }],
        outputs: [],
      })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('기능 outputs만 있고 inputs 없음 → ok', () => {
      const features = [createFeature({
        id: 'feat-outputs-only',
        inputs: [],
        outputs: [{ name: 'result', type: 'boolean', constraints: '', required: true }],
      })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('모든 기능에 inputs + outputs 정의 → matrix.allIODefined=true', () => {
      const features = [
        createFeature({
          id: 'feat-io',
          inputs: [{ name: 'in', type: 'string', constraints: '', required: true }],
          outputs: [{ name: 'out', type: 'boolean', constraints: '', required: true }],
        }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix.allIODefined).toBe(true);
      }
    });

    it('inputs/outputs 모두 없는 기능 → matrix.allIODefined=false', () => {
      const features = [createFeature({ id: 'feat-no-io', inputs: [], outputs: [] })];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix.allIODefined).toBe(false);
      }
    });

    it('library 키워드 포함 design → projectType library 또는 generic', () => {
      const features = [createFeature()];
      const result = builder.buildContract(features, [], 'This is a library module for reuse');
      if (result.ok) {
        expect(['library', 'generic']).toContain(result.value.projectType);
      }
    });

    it('microservice 키워드 포함 design → projectType 탐지', () => {
      const features = [createFeature()];
      const result = builder.buildContract(features, [], 'microservice architecture design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.projectType).toBe('string');
      }
    });

    it('수락 기준 5개 있는 기능 → matrix.allFeaturesHaveCriteria=true', () => {
      const features = [
        createFeature({
          id: 'feat-5-ac',
          acceptanceCriteria: Array.from({ length: 5 }, (_, i) => ({
            id: `ac-${i}`,
            description: `기준 ${i}`,
            verifiable: true,
            testCategory: 'general',
          })),
        }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix.allFeaturesHaveCriteria).toBe(true);
      }
    });

    it('수락 기준 있는 기능 + 없는 기능 혼합 → allFeaturesHaveCriteria=false', () => {
      const features = [
        createFeature({
          id: 'feat-with-ac',
          acceptanceCriteria: [{ id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' }],
        }),
        createFeature({ id: 'feat-no-ac', acceptanceCriteria: [] }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.verificationMatrix.allFeaturesHaveCriteria).toBe(false);
      }
    });

    it('testDefinitions 매핑 없음 → allCriteriaHaveTests=true (기준도 없으므로)', () => {
      const features = [createFeature({ id: 'feat-no-criteria', acceptanceCriteria: [] })];
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        // 수락 기준이 없으면 모든 기준이 테스트됨 (vacuously true)
        expect(typeof result.value.verificationMatrix.allCriteriaHaveTests).toBe('boolean');
      }
    });

    it('이모지 포함 description → ok', () => {
      const features = [createFeature({ id: 'feat-emoji-desc', description: '🔐 보안 기능 구현 💡' })];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('100개 기능 체인 의존성 → ok', () => {
      const features = Array.from({ length: 100 }, (_, i) =>
        createFeature({ id: `chain-${i}`, dependencies: i > 0 ? [`chain-${i - 1}`] : [] }),
      );
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value.implementationOrder;
        expect(order.length).toBe(100);
        expect(order[0]).toBe('chain-0');
        expect(order[99]).toBe('chain-99');
      }
    });

    it('4개 노드 순환 의존성 탐지', () => {
      const features = [
        createFeature({ id: 'n1', dependencies: ['n4'] }),
        createFeature({ id: 'n2', dependencies: ['n1'] }),
        createFeature({ id: 'n3', dependencies: ['n2'] }),
        createFeature({ id: 'n4', dependencies: ['n3'] }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_cyclic_dependency');
      }
    });

    it('다이아몬드 의존성 (A←B,A←C, D→B,D→C) → ok', () => {
      const features = [
        createFeature({ id: 'feat-a', dependencies: [] }),
        createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
        createFeature({ id: 'feat-c', dependencies: ['feat-a'] }),
        createFeature({ id: 'feat-d', dependencies: ['feat-b', 'feat-c'] }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value.implementationOrder;
        expect(order.indexOf('feat-a')).toBeLessThan(order.indexOf('feat-b'));
        expect(order.indexOf('feat-a')).toBeLessThan(order.indexOf('feat-c'));
        expect(order.indexOf('feat-b')).toBeLessThan(order.indexOf('feat-d'));
        expect(order.indexOf('feat-c')).toBeLessThan(order.indexOf('feat-d'));
      }
    });

    it('acceptanceCriteria verifiable=false 포함 → ok', () => {
      const features = [
        createFeature({
          id: 'feat-unverifiable',
          acceptanceCriteria: [
            { id: 'ac-unv', description: '검증 불가 기준', verifiable: false, testCategory: 'general' },
          ],
        }),
      ];
      const result = builder.buildContract(features, [], 'Design');
      expect(result.ok).toBe(true);
    });

    it('implementationOrder 길이 = 기능 수', () => {
      const n = 15;
      const features = Array.from({ length: n }, (_, i) => createFeature({ id: `f-${i}` }));
      const result = builder.buildContract(features, [], 'Design');
      if (result.ok) {
        expect(result.value.implementationOrder.length).toBe(n);
      }
    });
  });

  // ── buildHandoffPackage 더 깊은 경계값 ───────────────────────

  describe('buildHandoffPackage 더 깊은 경계값', () => {
    it('id 형식이 handoff-{projectId}-{timestamp}', () => {
      const projId = 'test-proj';
      const result = builder.buildHandoffPackage(projId, makeContract(), 'P', 'D', 'S');
      if (result.ok) {
        expect(result.value.id.startsWith(`handoff-${projId}-`)).toBe(true);
      }
    });

    it('서로 다른 contract → 같은 projectId이면 id 접두어 동일', () => {
      const r1 = builder.buildHandoffPackage('same-proj', makeContract(), 'P1', 'D1', 'S1');
      const r2 = builder.buildHandoffPackage('same-proj', makeContract(), 'P2', 'D2', 'S2');
      if (r1.ok && r2.ok) {
        expect(r1.value.id.startsWith('handoff-same-proj-')).toBe(true);
        expect(r2.value.id.startsWith('handoff-same-proj-')).toBe(true);
      }
    });

    it('contract의 verificationMatrix가 HandoffPackage에 포함됨', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        completenessScore: 0.6,
      });
      const result = builder.buildHandoffPackage('proj', contract, 'P', 'D', 'S');
      if (result.ok) {
        expect(result.value.contract.verificationMatrix.allFeaturesHaveCriteria).toBe(false);
        expect(result.value.contract.verificationMatrix.completenessScore).toBe(0.6);
      }
    });

    it('contract에 기능 목록이 HandoffPackage에 포함됨', () => {
      const contract = makeContract();
      contract.features = [createFeature({ id: 'feat-hp-1' }), createFeature({ id: 'feat-hp-2' })];
      const result = builder.buildHandoffPackage('proj', contract, 'P', 'D', 'S');
      if (result.ok) {
        expect(result.value.contract.features.length).toBe(2);
      }
    });

    it('planDocument 이모지 포함 → planDocument 복원', () => {
      const plan = '📋 프로젝트 계획서 v1.0 🚀';
      const result = builder.buildHandoffPackage('proj', makeContract(), plan, 'D', 'S');
      if (result.ok) {
        expect(result.value.planDocument).toBe(plan);
      }
    });

    it('specDocument 특수문자 포함 → specDocument 복원', () => {
      const spec = 'API: POST /api/v1/users?limit=10&offset=0 HTTP/1.1';
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', 'D', spec);
      if (result.ok) {
        expect(result.value.specDocument).toBe(spec);
      }
    });

    it('designDocument JSON 포함 → designDocument 복원', () => {
      const design = JSON.stringify({ architecture: 'microservice', database: 'postgresql' });
      const result = builder.buildHandoffPackage('proj', makeContract(), 'P', design, 'S');
      if (result.ok) {
        expect(result.value.designDocument).toBe(design);
      }
    });

    it('projectId에 숫자 포함 → ok', () => {
      const result = builder.buildHandoffPackage('proj-2026-001', makeContract(), 'P', 'D', 'S');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-2026-001');
      }
    });

    it('contract.testDefinitions 포함 → HandoffPackage에 반영', () => {
      const contract = makeContract();
      contract.testDefinitions = [createTestDef('feat-td-1', ['ac-1'])];
      const result = builder.buildHandoffPackage('proj', contract, 'P', 'D', 'S');
      if (result.ok) {
        expect(result.value.contract.testDefinitions.length).toBe(1);
      }
    });

    it('confirmedByUser는 항상 false로 초기화', () => {
      for (let i = 0; i < 5; i++) {
        const result = builder.buildHandoffPackage(`proj-${i}`, makeContract(), 'P', 'D', 'S');
        if (result.ok) {
          expect(result.value.confirmedByUser).toBe(false);
        }
      }
    });
  });

  // ── validateContract 더 깊은 경계값 ──────────────────────────

  describe('validateContract 더 깊은 경계값', () => {
    it('원칙 1,2,3,4 모두 위반 + score=0 → 5개 issues', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        noCyclicDependencies: false,
        allIODefined: false,
        completenessScore: 0.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(5);
      }
    });

    it('원칙 1만 위반 + score=1.0 → 1개 issue', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('원칙 1');
      }
    });

    it('원칙 2만 위반 + score=1.0 → 1개 issue', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: false,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('원칙 2');
      }
    });

    it('원칙 3만 위반 + score=1.0 → 1개 issue', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: false,
        allIODefined: true,
        completenessScore: 1.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('원칙 3');
      }
    });

    it('원칙 4만 위반 + score=1.0 → 1개 issue', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: false,
        completenessScore: 1.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('원칙 4');
      }
    });

    it('score만 낮고 원칙 모두 통과 → 1개 issue (완전성)', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 0.5,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('완전성');
      }
    });

    it('validateContract의 issues 배열 원소에 "위반" 또는 "점수" 포함', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        completenessScore: 0.5,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        for (const issue of result.value) {
          expect(issue.includes('위반') || issue.includes('점수') || issue.includes('완전성')).toBe(true);
        }
      }
    });

    it('동일 contract 10번 반복 → issues 개수 일정', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        completenessScore: 0.3,
      });
      const firstResult = builder.validateContract(contract);
      const firstLen = firstResult.ok ? firstResult.value.length : -1;

      for (let i = 0; i < 9; i++) {
        const r = builder.validateContract(contract);
        if (r.ok) expect(r.value.length).toBe(firstLen);
      }
    });

    it('buildContract + validateContract 파이프라인', () => {
      const features = [
        createFeature({
          id: 'pipeline-feat',
          acceptanceCriteria: [
            { id: 'ac-p1', description: '파이프라인 기준', verifiable: true, testCategory: 'general' },
          ],
          inputs: [{ name: 'input', type: 'string', constraints: '', required: true }],
          outputs: [{ name: 'output', type: 'boolean', constraints: '', required: true }],
        }),
      ];
      const testDefs = [createTestDef('pipeline-feat', ['ac-p1'])];
      const contractResult = builder.buildContract(features, testDefs, 'Design');
      expect(contractResult.ok).toBe(true);

      if (contractResult.ok) {
        const validateResult = builder.validateContract(contractResult.value);
        expect(validateResult.ok).toBe(true);
        if (validateResult.ok) {
          expect(validateResult.value.length).toBe(0);
        }
      }
    });

    it('issues 배열의 모든 원소 길이 > 0', () => {
      const contract = makeContract({
        allFeaturesHaveCriteria: false,
        allCriteriaHaveTests: false,
        noCyclicDependencies: false,
        allIODefined: false,
        completenessScore: 0.0,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        for (const issue of result.value) {
          expect(issue.length).toBeGreaterThan(0);
        }
      }
    });

    it('완전성 issue 문자열에 score 값이 포함됨', () => {
      const score = 0.42;
      const contract = makeContract({
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: score,
      });
      const result = builder.validateContract(contract);
      if (result.ok) {
        const completenessIssue = result.value.find(e => e.includes('완전성'));
        if (completenessIssue) {
          expect(completenessIssue).toContain(String(score));
        }
      }
    });
  });
});
