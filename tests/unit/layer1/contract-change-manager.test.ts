import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { ContractChangeRecord, ContractDiffEntry } from 'layer1/contract-change-types.js';
import { ContractChangeManager } from 'layer1/contract-change-manager.js';
import type { ContractSchema, HandoffPackage } from 'layer1/types.js';

// ── 테스트 헬퍼 / Test helpers ────────────────────────────────────

function makeContract(overrides: Partial<ContractSchema> = {}): ContractSchema {
  return {
    version: 1,
    projectType: 'generic',
    features: overrides.features ?? [],
    testDefinitions: overrides.testDefinitions ?? [],
    implementationOrder: overrides.implementationOrder ?? [],
    verificationMatrix: overrides.verificationMatrix ?? {
      allFeaturesHaveCriteria: true,
      allCriteriaHaveTests: true,
      noCyclicDependencies: true,
      allIODefined: true,
      completenessScore: 1.0,
    },
    ...overrides,
  };
}

function makeFeature(id: string, deps: string[] = []) {
  return {
    id,
    name: `Feature ${id}`,
    description: `Description for ${id}`,
    acceptanceCriteria: [],
    dependencies: deps,
    inputs: [],
    outputs: [],
  };
}

function makeHandoffPackage(
  contractOverrides: Partial<ContractSchema> = {},
  pkgOverrides: Partial<HandoffPackage> = {},
): HandoffPackage {
  return {
    id: 'handoff-test-123',
    projectId: 'project-test',
    contract: makeContract(contractOverrides),
    planDocument: 'plan doc',
    designDocument: 'design doc',
    specDocument: 'spec doc',
    createdAt: new Date('2026-01-01'),
    confirmedByUser: false,
    ...pkgOverrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ContractChangeManager', () => {
  let manager: ContractChangeManager;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    manager = new ContractChangeManager(logger);
  });

  // ── computeDiff ──────────────────────────────────────────────

  describe('computeDiff()', () => {
    it('[edge] 동일한 Contract → diff 없음', () => {
      const schema = makeContract();
      const diffs = manager.computeDiff(schema, schema);
      expect(diffs).toHaveLength(0);
    });

    it('[edge] 필드 값이 동일한 다른 객체 인스턴스 → diff 없음', () => {
      const a = makeContract({ projectType: 'api' });
      const b = makeContract({ projectType: 'api' });
      const diffs = manager.computeDiff(a, b);
      expect(diffs).toHaveLength(0);
    });

    it('[edge] 필드 수정(projectType 변경) → changeType=modified', () => {
      const prev = makeContract({ projectType: 'api' });
      const next = makeContract({ projectType: 'cli' });
      const diffs = manager.computeDiff(prev, next);
      const entry = diffs.find((d) => d.field === 'projectType');
      expect(entry).toBeDefined();
      expect(entry?.changeType).toBe('modified');
      expect(entry?.previousValue).toBe('api');
      expect(entry?.currentValue).toBe('cli');
    });

    it('[edge] features 배열 변경 → changeType=modified, field=features', () => {
      const prev = makeContract({ features: [] });
      const next = makeContract({ features: [makeFeature('f1')] });
      const diffs = manager.computeDiff(prev, next);
      const entry = diffs.find((d) => d.field === 'features');
      expect(entry).toBeDefined();
      expect(entry?.changeType).toBe('modified');
    });

    it('[edge] 중첩 객체는 JSON.stringify 기준으로 비교한다', () => {
      const matrix1 = {
        allFeaturesHaveCriteria: true,
        allCriteriaHaveTests: true,
        noCyclicDependencies: true,
        allIODefined: true,
        completenessScore: 1.0,
      };
      const matrix2 = { ...matrix1, completenessScore: 0.8 };
      const prev = makeContract({ verificationMatrix: matrix1 });
      const next = makeContract({ verificationMatrix: matrix2 });
      const diffs = manager.computeDiff(prev, next);
      const entry = diffs.find((d) => d.field === 'verificationMatrix');
      expect(entry).toBeDefined();
      expect(entry?.changeType).toBe('modified');
    });

    it('[edge] implementationOrder 순서가 다르면 modified', () => {
      const prev = makeContract({ implementationOrder: ['f1', 'f2'] });
      const next = makeContract({ implementationOrder: ['f2', 'f1'] });
      const diffs = manager.computeDiff(prev, next);
      const entry = diffs.find((d) => d.field === 'implementationOrder');
      expect(entry?.changeType).toBe('modified');
    });

    it('[edge] 여러 필드가 동시에 변경되면 모두 diff에 포함된다', () => {
      const prev = makeContract({ projectType: 'api', features: [] });
      const next = makeContract({ projectType: 'cli', features: [makeFeature('f1')] });
      const diffs = manager.computeDiff(prev, next);
      const fields = diffs.map((d) => d.field);
      expect(fields).toContain('projectType');
      expect(fields).toContain('features');
    });

    it('[normal] 동일한 features 배열(참조 다름) → diff 없음', () => {
      const feature = makeFeature('f1');
      const prev = makeContract({ features: [feature] });
      const next = makeContract({ features: [{ ...feature }] });
      const diffs = manager.computeDiff(prev, next);
      expect(diffs.filter((d) => d.field === 'features')).toHaveLength(0);
    });
  });

  // ── identifyAffectedFeatures ─────────────────────────────────

  describe('identifyAffectedFeatures()', () => {
    it('[edge] features 필드 변경 → 이전 schema features의 ID 목록 반환', () => {
      const prev = makeContract({ features: [makeFeature('f1'), makeFeature('f2')] });
      const diffs: ContractDiffEntry[] = [
        { field: 'features', previousValue: prev.features, currentValue: [], changeType: 'modified' },
      ];
      const ids = manager.identifyAffectedFeatures(prev, diffs);
      expect(ids).toContain('f1');
      expect(ids).toContain('f2');
    });

    it('[edge] features 필드 변경이지만 이전 features 빈 배열 → ["*"] 반환', () => {
      const prev = makeContract({ features: [] });
      const diffs: ContractDiffEntry[] = [
        { field: 'features', previousValue: [], currentValue: [makeFeature('f1')], changeType: 'modified' },
      ];
      const ids = manager.identifyAffectedFeatures(prev, diffs);
      expect(ids).toEqual(['*']);
    });

    it('[edge] features 외 필드 변경 → ["*"] 반환', () => {
      const prev = makeContract({ features: [makeFeature('f1')] });
      const diffs: ContractDiffEntry[] = [
        { field: 'projectType', previousValue: 'api', currentValue: 'cli', changeType: 'modified' },
      ];
      const ids = manager.identifyAffectedFeatures(prev, diffs);
      expect(ids).toEqual(['*']);
    });

    it('[edge] diff 없음 → 빈 배열 반환', () => {
      const prev = makeContract();
      const ids = manager.identifyAffectedFeatures(prev, []);
      expect(ids).toHaveLength(0);
    });

    it('[edge] testDefinitions 변경(features 포함 안함) → ["*"] 반환', () => {
      const prev = makeContract({ features: [makeFeature('f1')] });
      const diffs: ContractDiffEntry[] = [
        { field: 'testDefinitions', previousValue: [], currentValue: [{}], changeType: 'modified' },
      ];
      const ids = manager.identifyAffectedFeatures(prev, diffs);
      expect(ids).toEqual(['*']);
    });
  });

  // ── applyChange ──────────────────────────────────────────────

  describe('applyChange()', () => {
    it('[edge] reason 빈 문자열 → 오류 반환', () => {
      const pkg = makeHandoffPackage();
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '', 'user');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_change_empty_reason');
      }
    });

    it('[edge] reason 공백만 → 오류 반환', () => {
      const pkg = makeHandoffPackage();
      const next = makeContract();
      const result = manager.applyChange(pkg, next, '   ', 'user');
      expect(result.ok).toBe(false);
    });

    it('[edge] version 없는 HandoffPackage(기존 데이터) → version=1로 시작', () => {
      const pkg = makeHandoffPackage({}, { version: undefined });
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '첫 변경', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.version).toBe(1);
      }
    });

    it('[edge] version=1에서 applyChange → version=2', () => {
      const pkg = makeHandoffPackage({}, { version: 1 });
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '업데이트', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.version).toBe(2);
      }
    });

    it('[edge] 동일한 Contract 적용 → diff 없음, regressionTestRequired=false', () => {
      const schema = makeContract();
      const pkg = makeHandoffPackage({}, { version: 1 });
      const result = manager.applyChange(pkg, schema, '변경 없음 확인', 'system');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const record = result.value.changeHistory?.[0];
        expect(record?.diffs).toHaveLength(0);
        expect(record?.regressionTestRequired).toBe(false);
      }
    });

    it('[edge] 필드 변경 있음 → regressionTestRequired=true', () => {
      const pkg = makeHandoffPackage({ projectType: 'api' }, { version: 1 });
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '프로젝트 타입 변경', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const record = result.value.changeHistory?.[0];
        expect(record?.regressionTestRequired).toBe(true);
      }
    });

    it('[edge] changeHistory 누적 → 이전 기록 유지', () => {
      const existingRecord: ContractChangeRecord = {
        version: 1,
        previousVersion: 0,
        changedAt: new Date('2026-01-01'),
        reason: '초기 설정',
        changedBy: 'system',
        diffs: [],
        affectedFeatureIds: [],
        regressionTestRequired: false,
      };
      const pkg = makeHandoffPackage(
        {},
        { version: 1, changeHistory: [existingRecord] },
      );
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '두 번째 변경', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.changeHistory).toHaveLength(2);
        expect(result.value.changeHistory?.[0]).toEqual(existingRecord);
        expect(result.value.changeHistory?.[1]?.version).toBe(2);
      }
    });

    it('[edge] changedBy=system 이 레코드에 기록된다', () => {
      const pkg = makeHandoffPackage({}, { version: 1 });
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '자동 업데이트', 'system');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.changeHistory?.[0]?.changedBy).toBe('system');
      }
    });

    it('[edge] changedAt이 Date 인스턴스', () => {
      const pkg = makeHandoffPackage({}, { version: 1 });
      const next = makeContract({ projectType: 'cli' });
      const result = manager.applyChange(pkg, next, '날짜 확인', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.changeHistory?.[0]?.changedAt).toBeInstanceOf(Date);
      }
    });

    it('[edge] features 필드 변경 → affectedFeatureIds 비어있지 않음', () => {
      const pkg = makeHandoffPackage(
        { features: [makeFeature('f1'), makeFeature('f2')] },
        { version: 1 },
      );
      const next = makeContract({ features: [makeFeature('f1')] });
      const result = manager.applyChange(pkg, next, '기능 제거', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.value.changeHistory?.[0]?.affectedFeatureIds ?? [];
        expect(ids.length).toBeGreaterThan(0);
        expect(ids).not.toEqual(['*']);
        expect(ids).toContain('f1');
        expect(ids).toContain('f2');
      }
    });

    it('[edge] features 외 필드 변경 → affectedFeatureIds=["*"]', () => {
      const pkg = makeHandoffPackage({ projectType: 'api' }, { version: 1 });
      const next = makeContract({ projectType: 'web' });
      const result = manager.applyChange(pkg, next, '타입 변경', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.changeHistory?.[0]?.affectedFeatureIds).toEqual(['*']);
      }
    });

    it('[normal] 반환된 HandoffPackage의 contract는 next와 동일', () => {
      const pkg = makeHandoffPackage({}, { version: 1 });
      const next = makeContract({ projectType: 'cli', implementationOrder: ['a', 'b'] });
      const result = manager.applyChange(pkg, next, '업데이트', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.contract).toEqual(next);
      }
    });
  });

  // ── getChangeHistory ─────────────────────────────────────────

  describe('getChangeHistory()', () => {
    it('[edge] changeHistory 없는 패키지 → 빈 배열', () => {
      const pkg = makeHandoffPackage({}, { changeHistory: undefined });
      const history = manager.getChangeHistory(pkg);
      expect(history).toEqual([]);
    });

    it('[edge] version 없는 패키지 → 빈 배열', () => {
      const pkg = makeHandoffPackage({}, { version: undefined, changeHistory: undefined });
      const history = manager.getChangeHistory(pkg);
      expect(history).toHaveLength(0);
    });

    it('[normal] 이력이 있는 패키지 → 이력 반환', () => {
      const record: ContractChangeRecord = {
        version: 1,
        previousVersion: 0,
        changedAt: new Date(),
        reason: '초기',
        changedBy: 'user',
        diffs: [],
        affectedFeatureIds: [],
        regressionTestRequired: false,
      };
      const pkg = makeHandoffPackage({}, { changeHistory: [record] });
      const history = manager.getChangeHistory(pkg);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('[edge] applyChange 후 getChangeHistory → 누적 이력 반환', () => {
      let pkg = makeHandoffPackage({}, { version: 0 });
      const next1 = makeContract({ projectType: 'api' });
      const res1 = manager.applyChange(pkg, next1, '1차 변경', 'user');
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        pkg = res1.value;
      }
      const next2 = makeContract({ projectType: 'cli' });
      const res2 = manager.applyChange(pkg, next2, '2차 변경', 'system');
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        const history = manager.getChangeHistory(res2.value);
        expect(history).toHaveLength(2);
        expect(history[0]?.changedBy).toBe('user');
        expect(history[1]?.changedBy).toBe('system');
      }
    });
  });

  // ── analyzeImpact ────────────────────────────────────────────

  describe('analyzeImpact()', () => {
    it('[edge] 동일한 Contract → 변경 없음', () => {
      const schema = makeContract({ features: [makeFeature('f1')] });
      const impact = manager.analyzeImpact(schema, schema);
      expect(impact.changedFeatureIds).toHaveLength(0);
      expect(impact.addedFeatureIds).toHaveLength(0);
      expect(impact.removedFeatureIds).toHaveLength(0);
      expect(impact.reverificationRequired).toBe(false);
      expect(impact.userReconfirmRequired).toBe(false);
    });

    it('[edge] 기능 추가 → addedFeatureIds에 포함', () => {
      const prev = makeContract({ features: [makeFeature('f1')] });
      const next = makeContract({ features: [makeFeature('f1'), makeFeature('f2')] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.addedFeatureIds).toContain('f2');
      expect(impact.changedFeatureIds).toHaveLength(0);
      expect(impact.reverificationRequired).toBe(true);
    });

    it('[edge] 기능 제거 → removedFeatureIds에 포함', () => {
      const prev = makeContract({ features: [makeFeature('f1'), makeFeature('f2')] });
      const next = makeContract({ features: [makeFeature('f1')] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.removedFeatureIds).toContain('f2');
      expect(impact.reverificationRequired).toBe(true);
    });

    it('[edge] 기능 내용 변경 → changedFeatureIds에 포함', () => {
      const f1v1 = makeFeature('f1');
      const f1v2 = { ...makeFeature('f1'), description: 'Updated description' };
      const prev = makeContract({ features: [f1v1] });
      const next = makeContract({ features: [f1v2] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.changedFeatureIds).toContain('f1');
    });

    it('[edge] 의존 체인 추적 — f2가 f1에 의존 + f1 변경 → f2가 dependencyAffectedIds에 포함', () => {
      const f1v1 = makeFeature('f1');
      const f1v2 = { ...makeFeature('f1'), description: 'Changed' };
      const f2 = makeFeature('f2', ['f1']);
      const prev = makeContract({ features: [f1v1, f2] });
      const next = makeContract({ features: [f1v2, f2] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.changedFeatureIds).toContain('f1');
      expect(impact.dependencyAffectedIds).toContain('f2');
    });

    it('[edge] 3단계 의존 체인 — f3→f2→f1, f1 변경 → f2, f3 모두 간접 영향', () => {
      const f1v1 = makeFeature('f1');
      const f1v2 = { ...makeFeature('f1'), description: 'v2' };
      const f2 = makeFeature('f2', ['f1']);
      const f3 = makeFeature('f3', ['f2']);
      const prev = makeContract({ features: [f1v1, f2, f3] });
      const next = makeContract({ features: [f1v2, f2, f3] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.dependencyAffectedIds).toContain('f2');
      expect(impact.dependencyAffectedIds).toContain('f3');
    });

    it('[edge] testRerunFeatureIds에 변경 + 간접 영향 기능 모두 포함', () => {
      const f1v1 = makeFeature('f1');
      const f1v2 = { ...makeFeature('f1'), description: 'v2' };
      const f2 = makeFeature('f2', ['f1']);
      const prev = makeContract({ features: [f1v1, f2] });
      const next = makeContract({ features: [f1v2, f2] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.testRerunFeatureIds).toContain('f1');
      expect(impact.testRerunFeatureIds).toContain('f2');
    });

    it('[edge] 기능 없는 Contract → 변경 없음', () => {
      const prev = makeContract({ features: [] });
      const next = makeContract({ features: [] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.reverificationRequired).toBe(false);
    });

    it('[edge] 추가된 기능의 테스트도 재실행 대상', () => {
      const prev = makeContract({ features: [] });
      const next = makeContract({ features: [makeFeature('f-new')] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.testRerunFeatureIds).toContain('f-new');
    });

    it('[normal] userReconfirmRequired는 변경 있을 때 true', () => {
      const prev = makeContract({ features: [makeFeature('f1')] });
      const next = makeContract({ features: [makeFeature('f1'), makeFeature('f2')] });
      const impact = manager.analyzeImpact(prev, next);
      expect(impact.userReconfirmRequired).toBe(true);
    });
  });

  // ── triggerRevalidation ─────────────────────────────────────

  describe('triggerRevalidation()', () => {
    it('[edge] reverificationRequired=false → 콜백 미호출, ok 반환', async () => {
      const impact: import('layer1/contract-change-types.js').ContractImpactAnalysis = {
        changedFeatureIds: [],
        addedFeatureIds: [],
        removedFeatureIds: [],
        dependencyAffectedIds: [],
        testRerunFeatureIds: [],
        reverificationRequired: false,
        userReconfirmRequired: false,
      };
      let called = false;
      const result = await manager.triggerRevalidation(impact, async () => {
        called = true;
      });
      expect(result.ok).toBe(true);
      expect(called).toBe(false);
    });

    it('[normal] reverificationRequired=true → 콜백에 testRerunFeatureIds 전달', async () => {
      const impact: import('layer1/contract-change-types.js').ContractImpactAnalysis = {
        changedFeatureIds: ['f1'],
        addedFeatureIds: [],
        removedFeatureIds: [],
        dependencyAffectedIds: ['f2'],
        testRerunFeatureIds: ['f1', 'f2'],
        reverificationRequired: true,
        userReconfirmRequired: true,
      };
      let receivedIds: readonly string[] = [];
      const result = await manager.triggerRevalidation(impact, async (ids) => {
        receivedIds = ids;
      });
      expect(result.ok).toBe(true);
      expect(receivedIds).toEqual(['f1', 'f2']);
    });

    it('[edge] 콜백이 throw → err 반환 (contract_revalidation_failed)', async () => {
      const impact: import('layer1/contract-change-types.js').ContractImpactAnalysis = {
        changedFeatureIds: ['f1'],
        addedFeatureIds: [],
        removedFeatureIds: [],
        dependencyAffectedIds: [],
        testRerunFeatureIds: ['f1'],
        reverificationRequired: true,
        userReconfirmRequired: false,
      };
      const result = await manager.triggerRevalidation(impact, async () => {
        throw new Error('콜백 실패');
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('contract_revalidation_failed');
      }
    });

    it('[edge] testRerunFeatureIds 빈 배열 + reverificationRequired=true → 콜백 호출됨', async () => {
      const impact: import('layer1/contract-change-types.js').ContractImpactAnalysis = {
        changedFeatureIds: [],
        addedFeatureIds: [],
        removedFeatureIds: [],
        dependencyAffectedIds: [],
        testRerunFeatureIds: [],
        reverificationRequired: true,
        userReconfirmRequired: false,
      };
      let called = false;
      const result = await manager.triggerRevalidation(impact, async () => {
        called = true;
      });
      expect(result.ok).toBe(true);
      expect(called).toBe(true);
    });
  });

  // ── applyChangeWithImpact ────────────────────────────────────

  describe('applyChangeWithImpact()', () => {
    it('[normal] 변경 적용 + 영향 분석 결과를 함께 반환', () => {
      const pkg = makeHandoffPackage(
        { features: [makeFeature('f1')] },
        { version: 1 },
      );
      const next = makeContract({ features: [makeFeature('f1'), makeFeature('f2')] });
      const result = manager.applyChangeWithImpact(pkg, next, '기능 추가', 'user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pkg.version).toBe(2);
        expect(result.value.impact.addedFeatureIds).toContain('f2');
        expect(result.value.impact.reverificationRequired).toBe(true);
      }
    });

    it('[edge] 빈 reason → 오류 반환', () => {
      const pkg = makeHandoffPackage({}, { version: 1 });
      const next = makeContract();
      const result = manager.applyChangeWithImpact(pkg, next, '', 'user');
      expect(result.ok).toBe(false);
    });

    it('[edge] 의존 체인이 impact에 포함', () => {
      const f1 = makeFeature('f1');
      const f2 = makeFeature('f2', ['f1']);
      const pkg = makeHandoffPackage({ features: [f1, f2] }, { version: 1 });
      const f1v2 = { ...makeFeature('f1'), description: 'Changed' };
      const next = makeContract({ features: [f1v2, f2] });
      const result = manager.applyChangeWithImpact(pkg, next, '기능 수정', 'system');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.impact.changedFeatureIds).toContain('f1');
        expect(result.value.impact.dependencyAffectedIds).toContain('f2');
        expect(result.value.impact.testRerunFeatureIds).toContain('f1');
        expect(result.value.impact.testRerunFeatureIds).toContain('f2');
      }
    });
  });
});
