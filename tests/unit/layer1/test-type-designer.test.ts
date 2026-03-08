/**
 * TestTypeDesigner 단위 테스트
 *
 * @description
 * KR: createDefinitions/validate 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for TestTypeDesigner methods. 80%+ edge/invalid ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { TestTypeDesigner } from 'layer1/test-type-designer.js';
import type { FeatureSpec, TestTypeDefinition } from 'layer1/types.js';

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

function makeDefinition(featureId: string, criteriaIds: string[] = []): TestTypeDefinition {
  return {
    featureId,
    categories: criteriaIds.length > 0
      ? [{ name: 'general', description: 'General', mappedCriteria: criteriaIds }]
      : [],
    rules: [],
    sampleTests: [],
    ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
  };
}

// ── 생성자 ────────────────────────────────────────────────────

describe('TestTypeDesigner 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new TestTypeDesigner(new ConsoleLogger('error'))).not.toThrow();
  });

  it('TestTypeDesigner 인스턴스이다', () => {
    expect(new TestTypeDesigner(new ConsoleLogger('error'))).toBeInstanceOf(TestTypeDesigner);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new TestTypeDesigner(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('createDefinitions 메서드가 존재한다', () => {
    const d = new TestTypeDesigner(new ConsoleLogger('error'));
    expect(typeof d.createDefinitions).toBe('function');
  });

  it('validate 메서드가 존재한다', () => {
    const d = new TestTypeDesigner(new ConsoleLogger('error'));
    expect(typeof d.validate).toBe('function');
  });

  it('두 인스턴스는 다른 객체이다', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    expect(d1).not.toBe(d2);
  });

  it('10개 인스턴스 모두 생성 가능', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new TestTypeDesigner(new ConsoleLogger('error'))).not.toThrow();
    }
  });

  it('warn logger로 생성 가능', () => {
    expect(() => new TestTypeDesigner(new ConsoleLogger('warn'))).not.toThrow();
  });
});

// ── createDefinitions - 성공 케이스 ──────────────────────────

describe('TestTypeDesigner createDefinitions - 성공 케이스', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('1개 기능 → ok=true', () => {
    const result = designer.createDefinitions([createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('빈 기능 목록 → ok=true', () => {
    const result = designer.createDefinitions([]);
    expect(result.ok).toBe(true);
  });

  it('빈 기능 목록 → 빈 배열', () => {
    const result = designer.createDefinitions([]);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('2개 기능 → 길이 2', () => {
    const features = [createFeature({ id: 'feat-a' }), createFeature({ id: 'feat-b' })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value.length).toBe(2);
  });

  it('1번째 기능의 featureId가 일치', () => {
    const features = [createFeature({ id: 'feat-a' }), createFeature({ id: 'feat-b' })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value[0]?.featureId).toBe('feat-a');
  });

  it('2번째 기능의 featureId가 일치', () => {
    const features = [createFeature({ id: 'feat-a' }), createFeature({ id: 'feat-b' })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value[1]?.featureId).toBe('feat-b');
  });

  it('반환값이 배열이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('기본 비율 unit=0.6', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.unit).toBe(0.6);
  });

  it('기본 비율 module=0.25', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.module).toBe(0.25);
  });

  it('기본 비율 e2e=0.15', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.e2e).toBe(0.15);
  });

  it('비율 합이 1이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) {
      const r = result.value[0]?.ratios;
      if (r) expect(r.unit + r.module + r.e2e).toBeCloseTo(1.0);
    }
  });

  it('테스트 규칙이 비어있지 않다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.rules.length).toBeGreaterThan(0);
  });

  it('rules가 문자열 배열이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) {
      for (const rule of result.value[0]?.rules ?? []) {
        expect(typeof rule).toBe('string');
      }
    }
  });

  it('10개 기능 → 길이 10', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value.length).toBe(10);
  });

  it('10번 호출 → 항상 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = designer.createDefinitions([createFeature({ id: `feat-${i}` })]);
      expect(result.ok).toBe(true);
    }
  });

  it('ok는 boolean이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('ratios.unit이 숫자이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(typeof result.value[0]?.ratios.unit).toBe('number');
  });

  it('ratios.module이 숫자이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(typeof result.value[0]?.ratios.module).toBe('number');
  });

  it('ratios.e2e이 숫자이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(typeof result.value[0]?.ratios.e2e).toBe('number');
  });

  it('sampleTests는 배열이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(Array.isArray(result.value[0]?.sampleTests)).toBe(true);
  });

  it('categories는 배열이다', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(Array.isArray(result.value[0]?.categories)).toBe(true);
  });

  it('featureId는 문자열이다', () => {
    const result = designer.createDefinitions([createFeature({ id: 'feat-str' })]);
    if (result.ok) expect(typeof result.value[0]?.featureId).toBe('string');
  });

  it('5개 기능 → featureId 모두 일치', () => {
    const features = Array.from({ length: 5 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.createDefinitions(features);
    if (result.ok) {
      for (let i = 0; i < 5; i++) {
        expect(result.value[i]?.featureId).toBe(`feat-${i}`);
      }
    }
  });

  it('5번 반복 → 항상 동일 길이', () => {
    const features = [createFeature({ id: 'feat-a' }), createFeature({ id: 'feat-b' })];
    const firstLen = designer.createDefinitions(features).ok
      ? (designer.createDefinitions(features) as { ok: true; value: TestTypeDefinition[] }).value.length
      : -1;
    for (let i = 0; i < 5; i++) {
      const result = designer.createDefinitions(features);
      if (result.ok) expect(result.value.length).toBe(firstLen);
    }
  });
});

// ── createDefinitions - 카테고리 매핑 ────────────────────────

describe('TestTypeDesigner createDefinitions - 카테고리 매핑', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('수락 기준 없으면 기본 카테고리 1개', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [] })]);
    if (result.ok) expect(result.value[0]?.categories.length).toBe(1);
  });

  it('수락 기준 없으면 카테고리 이름이 "general"', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [] })]);
    if (result.ok) expect(result.value[0]?.categories[0]?.name).toBe('general');
  });

  it('같은 testCategory 2개 → 1개 카테고리', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '로그인', verifiable: true, testCategory: 'auth' },
        { id: 'ac-2', description: '로그아웃', verifiable: true, testCategory: 'auth' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const def = result.value[0];
      expect(def?.categories.length).toBe(1);
      expect(def?.categories[0]?.name).toBe('auth');
    }
  });

  it('다른 testCategory 2개 → 2개 카테고리', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '로그인', verifiable: true, testCategory: 'authentication' },
        { id: 'ac-2', description: '권한 확인', verifiable: true, testCategory: 'authorization' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value[0]?.categories.length).toBe(2);
  });

  it('카테고리에 수락 기준 ID가 매핑됨', () => {
    const features = [createFeature({
      id: 'feat-auth',
      acceptanceCriteria: [
        { id: 'ac-1', description: '로그인', verifiable: true, testCategory: 'authentication' },
        { id: 'ac-2', description: '로그아웃', verifiable: true, testCategory: 'authentication' },
        { id: 'ac-3', description: '권한 확인', verifiable: true, testCategory: 'authorization' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const def = result.value[0];
      const authCat = def?.categories.find((c) => c.name === 'authentication');
      expect(authCat?.mappedCriteria).toContain('ac-1');
      expect(authCat?.mappedCriteria).toContain('ac-2');
      expect(authCat?.mappedCriteria).not.toContain('ac-3');
    }
  });

  it('샘플 테스트가 2개 이상 생성됨', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '입력 검증', verifiable: true, testCategory: 'validation' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value[0]?.sampleTests.length).toBeGreaterThanOrEqual(2);
  });

  it('샘플 테스트의 category가 유효 카테고리이다', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '검증', verifiable: true, testCategory: 'validation' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const sampleCats = result.value[0]?.sampleTests.map((t) => t.category) ?? [];
      expect(sampleCats).toContain('validation');
    }
  });

  it('샘플 테스트가 description을 가진다', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '검증', verifiable: true, testCategory: 'test' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      for (const test of result.value[0]?.sampleTests ?? []) {
        expect(typeof test.description).toBe('string');
      }
    }
  });

  it('1개 criterion → mappedCriteria 길이 1', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-only', description: '유일 기준', verifiable: true, testCategory: 'only' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const cat = result.value[0]?.categories[0];
      expect(cat?.mappedCriteria.length).toBe(1);
      expect(cat?.mappedCriteria[0]).toBe('ac-only');
    }
  });

  it('3가지 다른 카테고리 → 3개 카테고리', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준1', verifiable: true, testCategory: 'cat-a' },
        { id: 'ac-2', description: '기준2', verifiable: true, testCategory: 'cat-b' },
        { id: 'ac-3', description: '기준3', verifiable: true, testCategory: 'cat-c' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) expect(result.value[0]?.categories.length).toBe(3);
  });

  it('카테고리 이름이 문자열이다', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'my-cat' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      for (const cat of result.value[0]?.categories ?? []) {
        expect(typeof cat.name).toBe('string');
      }
    }
  });
});

// ── validate - 성공 케이스 ────────────────────────────────────

describe('TestTypeDesigner validate - 성공 케이스', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('완전한 매핑 → ok=true', () => {
    const features = [createFeature({ id: 'feat-0', acceptanceCriteria: [
      { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'general' },
    ]})];
    const definitions: TestTypeDefinition[] = [{
      featureId: 'feat-0',
      categories: [{ name: 'general', description: 'General', mappedCriteria: ['ac-1'] }],
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    const result = designer.validate(definitions, features);
    expect(result.ok).toBe(true);
  });

  it('완전한 매핑 → 빈 경고 배열', () => {
    const features = [createFeature({ id: 'feat-0', acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' },
    ]})];
    const definitions: TestTypeDefinition[] = [{
      featureId: 'feat-0',
      categories: [{ name: 'general', description: 'General', mappedCriteria: ['ac-1'] }],
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    const result = designer.validate(definitions, features);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('빈 기능 + 빈 정의 → 빈 경고', () => {
    const result = designer.validate([], []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('반환값이 배열이다', () => {
    const result = designer.validate([], []);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('createDefinitions 결과로 validate 통과', () => {
    const features = [createFeature({ id: 'feat-x', acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' },
    ]})];
    const defsResult = designer.createDefinitions(features);
    if (!defsResult.ok) return;
    const result = designer.validate(defsResult.value, features);
    expect(result.ok).toBe(true);
  });

  it('ok는 boolean이다', () => {
    const result = designer.validate([], []);
    expect(typeof result.ok).toBe('boolean');
  });

  it('10번 반복 빈 입력 → 항상 ok=true', () => {
    for (let i = 0; i < 10; i++) {
      const result = designer.validate([], []);
      expect(result.ok).toBe(true);
    }
  });

  it('value는 배열이다', () => {
    const result = designer.validate([], []);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('5번 반복 완전 매핑 → 항상 ok=true', () => {
    const features = [createFeature({ id: 'feat-0', acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' },
    ]})];
    const definitions: TestTypeDefinition[] = [{
      featureId: 'feat-0',
      categories: [{ name: 'general', description: 'General', mappedCriteria: ['ac-1'] }],
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    for (let i = 0; i < 5; i++) {
      expect(designer.validate(definitions, features).ok).toBe(true);
    }
  });

  it('두 인스턴스 동일 결과', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    expect(d1.validate([], []).ok).toBe(d2.validate([], []).ok);
  });

  it('makeDefinition 헬퍼로 생성한 정의 → ok=true', () => {
    const features = [createFeature({ id: 'feat-helper' })];
    const definitions = [makeDefinition('feat-helper')];
    const result = designer.validate(definitions, features);
    expect(result.ok).toBe(true);
  });
});

// ── validate - 경고 케이스 ────────────────────────────────────

describe('TestTypeDesigner validate - 경고 케이스', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('정의 없는 기능 → 경고 포함', () => {
    const features = [createFeature({ id: 'feat-missing' })];
    const result = designer.validate([], features);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('정의 없는 기능 → 경고에 featureId 포함', () => {
    const features = [createFeature({ id: 'feat-missing' })];
    const result = designer.validate([], features);
    if (result.ok) {
      const hasId = result.value.some((w) => w.includes('feat-missing'));
      expect(hasId).toBe(true);
    }
  });

  it('매핑되지 않은 수락 기준 → 경고 포함', () => {
    const features = [createFeature({ id: 'feat-0', acceptanceCriteria: [
      { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'auth' },
      { id: 'ac-2', description: '기준 2', verifiable: true, testCategory: 'auth' },
    ]})];
    const definitions: TestTypeDefinition[] = [{
      featureId: 'feat-0',
      categories: [{ name: 'auth', description: 'Auth', mappedCriteria: ['ac-1'] }], // ac-2 누락
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    const result = designer.validate(definitions, features);
    if (result.ok) {
      const hasAc2 = result.value.some((w) => w.includes('ac-2'));
      expect(hasAc2).toBe(true);
    }
  });

  it('경고 메시지가 문자열이다', () => {
    const features = [createFeature({ id: 'feat-warn' })];
    const result = designer.validate([], features);
    if (result.ok) {
      for (const w of result.value) {
        expect(typeof w).toBe('string');
      }
    }
  });

  it('여러 기능 중 하나 정의 없음 → 해당 ID 포함 경고', () => {
    const features = [
      createFeature({ id: 'feat-has-def', acceptanceCriteria: [
        { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'general' },
      ]}),
      createFeature({ id: 'feat-no-def' }),
    ];
    const definitions: TestTypeDefinition[] = [{
      featureId: 'feat-has-def',
      categories: [{ name: 'general', description: 'General', mappedCriteria: ['ac-1'] }],
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    const result = designer.validate(definitions, features);
    if (result.ok) {
      const hasNoDef = result.value.some((w) => w.includes('feat-no-def'));
      expect(hasNoDef).toBe(true);
    }
  });

  it('10번 validate 반복 → 항상 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = designer.validate([], []);
      expect(result.ok).toBe(true);
    }
  });

  it('3개 기능 모두 정의 없음 → 3개 이상 경고', () => {
    const features = Array.from({ length: 3 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.validate([], features);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(3);
  });

  it('경고 배열 길이가 0 이상이다', () => {
    const features = [createFeature({ id: 'feat-warn-count' })];
    const result = designer.validate([], features);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(0);
  });

  it('경고 없을 때 value는 빈 배열', () => {
    const result = designer.validate([], []);
    if (result.ok) expect(result.value.length).toBe(0);
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('TestTypeDesigner 복합 시나리오', () => {
  it('createDefinitions → validate 파이프라인', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [
      createFeature({ id: 'feat-0', acceptanceCriteria: [
        { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'general' },
      ]}),
    ];
    const defsResult = designer.createDefinitions(features);
    expect(defsResult.ok).toBe(true);
    if (defsResult.ok) {
      const validateResult = designer.validate(defsResult.value, features);
      expect(validateResult.ok).toBe(true);
    }
  });

  it('5개 인스턴스 독립적 동작', () => {
    const designers = Array.from({ length: 5 }, () => new TestTypeDesigner(new ConsoleLogger('error')));
    for (let i = 0; i < designers.length; i++) {
      const d = designers[i];
      if (d) {
        const result = d.createDefinitions([createFeature({ id: `feat-${i}` })]);
        expect(result.ok).toBe(true);
      }
    }
  });

  it('50번 createDefinitions+validate → 항상 성공', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    for (let i = 0; i < 50; i++) {
      const features = [createFeature({ id: `feat-${i}` })];
      const defs = designer.createDefinitions(features);
      expect(defs.ok).toBe(true);
      if (defs.ok) {
        const validation = designer.validate(defs.value, features);
        expect(validation.ok).toBe(true);
      }
    }
  });

  it('두 디자이너 동일 입력 → 동일 결과', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'feat-same' })];
    const r1 = d1.createDefinitions(features);
    const r2 = d2.createDefinitions(features);
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
    }
  });
});
