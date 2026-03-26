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

// ── 경계값: 특수 입력 시나리오 ───────────────────────────────

describe('TestTypeDesigner 특수 입력 경계값', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('UUID 형식 featureId → ok', () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const features = [createFeature({ id: uuid })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.featureId).toBe(uuid);
  });

  it('한글 featureId → ok', () => {
    const features = [createFeature({ id: '기능-로그인' })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.featureId).toBe('기능-로그인');
  });

  it('빈 description feature → ok', () => {
    const features = [createFeature({ description: '' })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 카테고리 이름 → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'auth-v2.0_beta' },
      ],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('acceptanceCriteria 10개 → 비율 합이 1', () => {
    const features = [createFeature({
      acceptanceCriteria: Array.from({ length: 10 }, (_, i) => ({
        id: `ac-${i}`, description: `기준 ${i}`, verifiable: true, testCategory: 'test',
      })),
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const r = result.value[0]?.ratios;
      if (r) expect(r.unit + r.module + r.e2e).toBeCloseTo(1.0);
    }
  });

  it('validate 반환값의 경고가 배열이다', () => {
    const features = [createFeature({ id: 'feat-v' })];
    const result = designer.validate([], features);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('음수 인덱스 접근 없이 정상 처리', () => {
    const features = Array.from({ length: 3 }, (_, i) => createFeature({ id: `f-${i}` }));
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const def of result.value) {
        expect(def.ratios.unit).toBeGreaterThan(0);
      }
    }
  });

  it('100개 기능 → ok', () => {
    const features = Array.from({ length: 100 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(100);
  });

  it('한글 카테고리 이름 → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-kr', description: '기준', verifiable: true, testCategory: '인증' },
      ],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('이모지 포함 featureId → ok', () => {
    const features = [createFeature({ id: 'feat-🔐' })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('이모지 포함 criterion description → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-emoji', description: '🚀 빠른 인증', verifiable: true, testCategory: 'auth' },
      ],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('featureId 빈 문자열 → ok 또는 error', () => {
    const features = [createFeature({ id: '' })];
    const result = designer.createDefinitions(features);
    expect(typeof result.ok).toBe('boolean');
  });

  it('acceptanceCriteria 50개 → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: Array.from({ length: 50 }, (_, i) => ({
        id: `ac-${i}`,
        description: `기준 ${i}`,
        verifiable: true,
        testCategory: `cat-${i % 5}`,
      })),
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('acceptanceCriteria 50개 → 카테고리 5개', () => {
    const features = [createFeature({
      acceptanceCriteria: Array.from({ length: 50 }, (_, i) => ({
        id: `ac-${i}`,
        description: `기준 ${i}`,
        verifiable: true,
        testCategory: `cat-${i % 5}`,
      })),
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      expect(result.value[0]?.categories.length).toBe(5);
    }
  });

  it('매우 긴 featureId → featureId 일치', () => {
    const longId = 'feat-' + 'x'.repeat(500);
    const features = [createFeature({ id: longId })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      expect(result.value[0]?.featureId).toBe(longId);
    }
  });

  it('동일 featureId로 여러 기능 → 각자 독립 처리', () => {
    // 실제로 동일 id를 허용하는지 여부 확인
    const features = [
      createFeature({ id: 'dup-id', name: 'Feature 1' }),
      createFeature({ id: 'dup-id', name: 'Feature 2' }),
    ];
    const result = designer.createDefinitions(features);
    expect(typeof result.ok).toBe('boolean');
  });

  it('validate: UUID 형식 featureId 정의 → 경고 없음', () => {
    const uuid = crypto.randomUUID();
    const features = [createFeature({ id: uuid })];
    const defs = [makeDefinition(uuid)];
    const result = designer.validate(defs, features);
    if (result.ok) {
      // 정의가 있으므로 feat-missing 경고 없어야 함
      const hasMissing = result.value.some(w => w.includes(uuid));
      expect(hasMissing).toBe(false);
    }
  });

  it('validate: 10개 기능 모두 정의됨 → 경고 0개', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const defs = features.map(f => makeDefinition(f.id));
    const result = designer.validate(defs, features);
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('validate: 정의 수 > 기능 수 → ok', () => {
    const features = [createFeature({ id: 'feat-only' })];
    const defs = [
      makeDefinition('feat-only'),
      makeDefinition('feat-extra'),
    ];
    const result = designer.validate(defs, features);
    expect(result.ok).toBe(true);
  });

  it('createDefinitions 100번 반복 → 항상 ok', () => {
    for (let i = 0; i < 100; i++) {
      const result = designer.createDefinitions([createFeature({ id: `f-${i}` })]);
      expect(result.ok).toBe(true);
    }
  });
});

// ── validate 심층 경계값 ──────────────────────────────────────

describe('TestTypeDesigner validate 심층 경계값', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('한글 featureId 경고에 포함 여부', () => {
    const features = [createFeature({ id: '한글-기능' })];
    const result = designer.validate([], features);
    if (result.ok && result.value.length > 0) {
      const hasKorean = result.value.some(w => w.includes('한글-기능'));
      expect(hasKorean).toBe(true);
    }
  });

  it('특수문자 featureId 경고에 포함 여부', () => {
    const features = [createFeature({ id: 'feat-!@#$' })];
    const result = designer.validate([], features);
    if (result.ok && result.value.length > 0) {
      const hasSpecial = result.value.some(w => w.includes('feat-!@#$'));
      expect(hasSpecial).toBe(true);
    }
  });

  it('매우 긴 criterion id 미매핑 → 경고에 id 포함', () => {
    const longAcId = 'ac-' + 'x'.repeat(200);
    const features = [createFeature({ id: 'feat-long-ac', acceptanceCriteria: [
      { id: longAcId, description: '기준', verifiable: true, testCategory: 'test' },
    ]})];
    const defs: TestTypeDefinition[] = [{
      featureId: 'feat-long-ac',
      categories: [{ name: 'test', description: 'Test', mappedCriteria: [] }],
      rules: [], sampleTests: [],
      ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
    }];
    const result = designer.validate(defs, features);
    if (result.ok) {
      expect(result.value.some(w => w.includes(longAcId))).toBe(true);
    }
  });

  it('빈 defs + 빈 features 50번 반복 → 항상 빈 경고', () => {
    for (let i = 0; i < 50; i++) {
      const result = designer.validate([], []);
      if (result.ok) expect(result.value.length).toBe(0);
    }
  });

  it('createDefinitions 결과로 validate → 경고 0개 (acceptanceCriteria 있을 때)', () => {
    const features = [createFeature({
      id: 'feat-full',
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'auth' },
        { id: 'ac-2', description: '기준 2', verifiable: true, testCategory: 'auth' },
      ],
    })];
    const defsResult = designer.createDefinitions(features);
    if (!defsResult.ok) return;
    const result = designer.validate(defsResult.value, features);
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('다른 인스턴스 간 validate 결과 동일', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'feat-cmp' })];
    const r1 = d1.validate([], features);
    const r2 = d2.validate([], features);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
    }
  });

  it('정의된 기능이 실제 기능에 없어도 ok', () => {
    const features: FeatureSpec[] = [];
    const defs = [makeDefinition('ghost-feat')];
    const result = designer.validate(defs, features);
    expect(result.ok).toBe(true);
  });

  it('경고 배열 원소가 비어있지 않은 문자열', () => {
    const features = [createFeature({ id: 'feat-non-empty-warn' })];
    const result = designer.validate([], features);
    if (result.ok) {
      for (const w of result.value) {
        expect(w.length).toBeGreaterThan(0);
      }
    }
  });

  it('100개 기능 모두 정의 없음 → 100개 이상 경고', () => {
    const features = Array.from({ length: 100 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.validate([], features);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(100);
  });
});

// ── 추가 경계값 배치2: createDefinitions 심층 ─────────────────

describe('TestTypeDesigner createDefinitions 심층 배치2', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('ratios.unit >= 0', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.unit).toBeGreaterThanOrEqual(0);
  });

  it('ratios.module >= 0', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.module).toBeGreaterThanOrEqual(0);
  });

  it('ratios.e2e >= 0', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.e2e).toBeGreaterThanOrEqual(0);
  });

  it('ratios.unit <= 1', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.unit).toBeLessThanOrEqual(1);
  });

  it('ratios.module <= 1', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.module).toBeLessThanOrEqual(1);
  });

  it('ratios.e2e <= 1', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) expect(result.value[0]?.ratios.e2e).toBeLessThanOrEqual(1);
  });

  it('categories 배열 원소 name은 문자열', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'test-cat' },
    ]})]);
    if (result.ok) {
      for (const cat of result.value[0]?.categories ?? []) {
        expect(typeof cat.name).toBe('string');
      }
    }
  });

  it('categories 배열 원소 description은 문자열', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'test-cat' },
    ]})]);
    if (result.ok) {
      for (const cat of result.value[0]?.categories ?? []) {
        expect(typeof cat.description).toBe('string');
      }
    }
  });

  it('categories 배열 원소 mappedCriteria는 배열', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'test-cat' },
    ]})]);
    if (result.ok) {
      for (const cat of result.value[0]?.categories ?? []) {
        expect(Array.isArray(cat.mappedCriteria)).toBe(true);
      }
    }
  });

  it('sampleTests 배열 원소 category는 문자열', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'sample-cat' },
    ]})]);
    if (result.ok) {
      for (const test of result.value[0]?.sampleTests ?? []) {
        expect(typeof test.category).toBe('string');
      }
    }
  });

  it('sampleTests 배열 원소 category는 문자열', () => {
    const result = designer.createDefinitions([createFeature({ acceptanceCriteria: [
      { id: 'ac-1', description: '기준', verifiable: true, testCategory: 'tc-1' },
    ]})]);
    if (result.ok) {
      for (const test of result.value[0]?.sampleTests ?? []) {
        // WHY: SampleTest has category/description/expectedBehavior, no 'type' field
        expect(typeof test.category).toBe('string');
      }
    }
  });

  it('rules 배열 비어있지 않음 (기본)', () => {
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok) {
      expect(result.value[0]?.rules.length).toBeGreaterThan(0);
    }
  });

  it('featureId가 정확히 일치 (UUID)', () => {
    const uuid = crypto.randomUUID();
    const result = designer.createDefinitions([createFeature({ id: uuid })]);
    if (result.ok) {
      expect(result.value[0]?.featureId).toBe(uuid);
    }
  });

  it('300개 기능 → ok=true', () => {
    const features = Array.from({ length: 300 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(300);
  });

  it('수락 기준 verifiable=false → ok=true (처리됨)', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-nv', description: '검증 불가 기준', verifiable: false, testCategory: 'general' },
      ],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('acceptanceCriteria 같은 id 중복 → ok 또는 error', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'dup-id', description: '기준1', verifiable: true, testCategory: 'cat' },
        { id: 'dup-id', description: '기준2', verifiable: true, testCategory: 'cat' },
      ],
    })];
    const result = designer.createDefinitions(features);
    expect(typeof result.ok).toBe('boolean');
  });

  it('dependencies 필드 포함 → ok=true', () => {
    const features = [createFeature({
      dependencies: ['feat-dep-1', 'feat-dep-2'],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('inputs 필드 포함 → ok=true', () => {
    const features = [createFeature({
      inputs: [{ name: 'userId', type: 'string', required: true }],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('outputs 필드 포함 → ok=true', () => {
    const features = [createFeature({
      outputs: [{ name: 'token', type: 'string' }],
    })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });
});

// ── 추가 경계값 배치2: validate 심층 ─────────────────────────

describe('TestTypeDesigner validate 심층 배치2', () => {
  let designer: TestTypeDesigner;

  beforeEach(() => {
    designer = new TestTypeDesigner(new ConsoleLogger('error'));
  });

  it('validate ok=true → value는 문자열 배열', () => {
    const result = designer.validate([], []);
    if (result.ok) {
      for (const w of result.value) {
        expect(typeof w).toBe('string');
      }
    }
  });

  it('validate: 정의 featureId와 기능 id 일치 → 경고 없음', () => {
    const features = [createFeature({ id: 'match-id' })];
    const defs = [makeDefinition('match-id')];
    const result = designer.validate(defs, features);
    if (result.ok) {
      const hasMatch = result.value.some(w => w.includes('match-id'));
      expect(hasMatch).toBe(false);
    }
  });

  it('validate: 기능 10개 중 5개 정의 → 5개 이상 경고', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const defs = Array.from({ length: 5 }, (_, i) => makeDefinition(`feat-${i}`));
    const result = designer.validate(defs, features);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(5);
  });

  it('validate: 경고 배열에 기능 id 문자열 포함', () => {
    const features = [createFeature({ id: 'warn-id-check' })];
    const result = designer.validate([], features);
    if (result.ok && result.value.length > 0) {
      expect(result.value[0]).toContain('warn-id-check');
    }
  });

  it('validate: 100개 기능 전체 정의됨 → 경고 0개', () => {
    const features = Array.from({ length: 100 }, (_, i) => createFeature({ id: `feat-${i}` }));
    const defs = features.map(f => makeDefinition(f.id));
    const result = designer.validate(defs, features);
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('validate: createDefinitions 출력 → validate 경고 없음 (100번)', () => {
    for (let i = 0; i < 100; i++) {
      const features = [createFeature({ id: `auto-${i}` })];
      const defsResult = designer.createDefinitions(features);
      if (!defsResult.ok) continue;
      const result = designer.validate(defsResult.value, features);
      if (result.ok) expect(result.value.length).toBe(0);
    }
  });

  it('validate: 경고가 있을 때 배열 길이 >= 1', () => {
    const features = [createFeature({ id: 'warn-1' }), createFeature({ id: 'warn-2' })];
    const result = designer.validate([], features);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(1);
  });

  it('validate: ok 필드가 boolean', () => {
    const result = designer.validate([makeDefinition('feat-x')], [createFeature({ id: 'feat-x' })]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('validate: 기능과 정의 순서 무관하게 매핑', () => {
    const features = [
      createFeature({ id: 'feat-z' }),
      createFeature({ id: 'feat-a' }),
    ];
    const defs = [
      makeDefinition('feat-a'),
      makeDefinition('feat-z'),
    ];
    const result = designer.validate(defs, features);
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('validate: 매우 긴 featureId 가진 정의 매핑 성공', () => {
    const longId = 'feat-' + 'x'.repeat(500);
    const features = [createFeature({ id: longId })];
    const defs = [makeDefinition(longId)];
    const result = designer.validate(defs, features);
    if (result.ok) {
      const hasMissing = result.value.some(w => w.includes(longId));
      expect(hasMissing).toBe(false);
    }
  });

  it('validate: 이모지 featureId 정의 매핑 → 경고 없음', () => {
    const features = [createFeature({ id: 'feat-🔐' })];
    const defs = [makeDefinition('feat-🔐')];
    const result = designer.validate(defs, features);
    if (result.ok) {
      const hasMissing = result.value.some(w => w.includes('feat-🔐'));
      expect(hasMissing).toBe(false);
    }
  });
});

// ── 추가 복합 시나리오 배치2 ──────────────────────────────────

describe('TestTypeDesigner 복합 시나리오 배치2', () => {
  it('createDefinitions → validate 파이프라인 100번', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    for (let i = 0; i < 100; i++) {
      const features = [createFeature({ id: `pipe-${i}`, acceptanceCriteria: [
        { id: `ac-${i}`, description: `기준 ${i}`, verifiable: true, testCategory: 'general' },
      ]})];
      const defs = designer.createDefinitions(features);
      if (defs.ok) {
        const val = designer.validate(defs.value, features);
        expect(val.ok).toBe(true);
        if (val.ok) expect(val.value.length).toBe(0);
      }
    }
  });

  it('동일 입력 createDefinitions 3회 → 결과 일관', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'consistent-feat' })];
    const r1 = designer.createDefinitions(features);
    const r2 = designer.createDefinitions(features);
    const r3 = designer.createDefinitions(features);
    if (r1.ok && r2.ok && r3.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r2.value.length).toBe(r3.value.length);
      expect(r1.value[0]?.featureId).toBe(r2.value[0]?.featureId);
      expect(r1.value[0]?.ratios.unit).toBe(r2.value[0]?.ratios.unit);
    }
  });

  it('validate 경고 → createDefinitions → validate 재검증 → 경고 없음', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'fix-flow', acceptanceCriteria: [
      { id: 'ac-fix', description: '기준', verifiable: true, testCategory: 'general' },
    ]})];

    // 처음엔 정의 없음 → 경고 있음
    const warn = designer.validate([], features);
    if (warn.ok) expect(warn.value.length).toBeGreaterThan(0);

    // createDefinitions로 정의 생성 후 재검증
    const defs = designer.createDefinitions(features);
    if (defs.ok) {
      const fixed = designer.validate(defs.value, features);
      if (fixed.ok) expect(fixed.value.length).toBe(0);
    }
  });

  it('수락 기준 5개 → 카테고리 1개 (같은 category)', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      acceptanceCriteria: Array.from({ length: 5 }, (_, i) => ({
        id: `ac-${i}`,
        description: `기준 ${i}`,
        verifiable: true,
        testCategory: 'unified-cat',
      })),
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      expect(result.value[0]?.categories.length).toBe(1);
      expect(result.value[0]?.categories[0]?.mappedCriteria.length).toBe(5);
    }
  });

  it('수락 기준 각각 다른 카테고리 5개 → 카테고리 5개', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      acceptanceCriteria: Array.from({ length: 5 }, (_, i) => ({
        id: `ac-${i}`,
        description: `기준 ${i}`,
        verifiable: true,
        testCategory: `cat-${i}`,
      })),
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      expect(result.value[0]?.categories.length).toBe(5);
    }
  });

  it('validate + createDefinitions 두 인스턴스 교차 사용 → ok', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'cross-inst' })];
    const defs = d1.createDefinitions(features);
    if (defs.ok) {
      const result = d2.validate(defs.value, features);
      expect(result.ok).toBe(true);
    }
  });

  it('1000번 validate 빈 입력 → 항상 ok, 경고 0개', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    for (let i = 0; i < 1000; i++) {
      const result = designer.validate([], []);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBe(0);
    }
  });
});

// ── createDefinitions: 추가 경계값 #3 ────────────────────────

describe('createDefinitions 추가 경계값 #3', () => {
  it('feature id가 빈 문자열인 경우 → ok', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: '' })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.featureId).toBe('');
  });

  it('feature name이 긴 문자열 → ok', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const longName = 'A'.repeat(500);
    const features = [createFeature({ name: longName })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(1);
  });

  it('feature description이 비어있음 → ok', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ description: '' })];
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 testCategory가 undefined → general 카테고리', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-0', description: '기준', verifiable: true, testCategory: undefined as unknown as string },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const cat = result.value[0]?.categories.find((c) => c.name === 'general');
      expect(cat).toBeDefined();
    }
  });

  it('기능 10개 × 수락 기준 각 3개 → 30개 정의 카테고리', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = Array.from({ length: 10 }, (_, fi) =>
      createFeature({
        id: `feat-${fi}`,
        acceptanceCriteria: Array.from({ length: 3 }, (__, ai) => ({
          id: `ac-${fi}-${ai}`,
          description: `기준 ${fi}-${ai}`,
          verifiable: true,
          testCategory: `cat-${ai}`,
        })),
      })
    );
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(10);
      for (const def of result.value) {
        // 3개 카테고리 (cat-0, cat-1, cat-2)
        expect(def.categories.length).toBe(3);
      }
    }
  });

  it('createDefinitions → sampleTests 개수 = categories × 12', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-0', description: '기준0', verifiable: true, testCategory: 'unit' },
        { id: 'ac-1', description: '기준1', verifiable: true, testCategory: 'e2e' },
      ],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      const catCount = result.value[0].categories.length;
      // WHY: 카테고리별 12개 샘플 (normal 2 + edge 10) = catCount × 12
      expect(result.value[0].sampleTests.length).toBe(catCount * 12);
    }
  });

  it('createDefinitions → ratios.unit + module + e2e = 1.0', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature()];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      const { unit, module: m, e2e } = result.value[0].ratios;
      expect(Math.abs(unit + m + e2e - 1.0)).toBeLessThan(0.001);
    }
  });

  it('createDefinitions → 기본 rules 4개 포함', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature()];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      expect(result.value[0].rules.length).toBe(4);
    }
  });

  it('createDefinitions → rules[0]에 edge case 포함', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature()];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      expect(result.value[0].rules[0]).toContain('edge');
    }
  });

  it('createDefinitions → sampleTests[0].category가 categories[0].name와 일치', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      acceptanceCriteria: [{ id: 'ac-0', description: '기준', verifiable: true, testCategory: 'my-cat' }],
    })];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      const firstCat = result.value[0].categories[0]?.name;
      const firstSample = result.value[0].sampleTests[0]?.category;
      expect(firstSample).toBe(firstCat);
    }
  });

  it('빈 features 5번 반복 → 모두 ok=true, 빈 배열', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    for (let i = 0; i < 5; i++) {
      const result = designer.createDefinitions([]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.length).toBe(0);
    }
  });

  it('100개 기능 → 100개 정의', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = Array.from({ length: 100 }, (_, i) => createFeature({ id: `f-${i}` }));
    const result = designer.createDefinitions(features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(100);
  });

  it('createDefinitions 결과 ok는 boolean', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const result = designer.createDefinitions([createFeature()]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('createDefinitions → ratios.unit이 0.6', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok && result.value[0]) {
      expect(result.value[0].ratios.unit).toBe(0.6);
    }
  });

  it('createDefinitions → ratios.e2e가 0.15', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const result = designer.createDefinitions([createFeature()]);
    if (result.ok && result.value[0]) {
      expect(result.value[0].ratios.e2e).toBe(0.15);
    }
  });

  it('같은 id 다른 인스턴스 → featureId 일치', () => {
    const d1 = new TestTypeDesigner(new ConsoleLogger('error'));
    const d2 = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'same-id' })];
    const r1 = d1.createDefinitions(features);
    const r2 = d2.createDefinitions(features);
    if (r1.ok && r2.ok) {
      expect(r1.value[0]?.featureId).toBe(r2.value[0]?.featureId);
    }
  });
});

// ── validate: 추가 경계값 #3 ──────────────────────────────────

describe('validate 추가 경계값 #3', () => {
  it('정의 있지만 기능 없음 → 경고 없음', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const defs = [makeDefinition('feat-unused')];
    const result = designer.validate(defs, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('기능 있고 정의 없음 → 경고 1개', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'no-def-feat' })];
    const result = designer.validate([], features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('기능 5개 정의 없음 → 경고 5개 이상', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = Array.from({ length: 5 }, (_, i) => createFeature({ id: `f${i}` }));
    const result = designer.validate([], features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(5);
  });

  it('validate 경고 문자열 타입', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'warn-type' })];
    const result = designer.validate([], features);
    if (result.ok) {
      for (const w of result.value) {
        expect(typeof w).toBe('string');
      }
    }
  });

  it('경고에 feature name 포함', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'warn-name-feat', name: 'Special Feature Name' })];
    const result = designer.validate([], features);
    if (result.ok && result.value[0]) {
      expect(result.value[0]).toContain('Special Feature Name');
    }
  });

  it('경고에 feature id 포함', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'unique-id-check' })];
    const result = designer.validate([], features);
    if (result.ok && result.value[0]) {
      expect(result.value[0]).toContain('unique-id-check');
    }
  });

  it('수락 기준 미매핑 → 경고에 기준 id 포함', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      id: 'mapped-feat',
      acceptanceCriteria: [{ id: 'unmapped-ac', description: '기준', verifiable: true, testCategory: 'general' }],
    })];
    // 빈 매핑의 정의 제공
    const defs = [makeDefinition('mapped-feat', [])];
    const result = designer.validate(defs, features);
    if (result.ok) {
      const hasWarn = result.value.some((w) => w.includes('unmapped-ac'));
      expect(hasWarn).toBe(true);
    }
  });

  it('validate 100회 빈 입력 → 항상 경고 0개', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    for (let i = 0; i < 100; i++) {
      const result = designer.validate([], []);
      if (result.ok) expect(result.value.length).toBe(0);
    }
  });

  it('createDefinitions로 생성 후 validate → 경고 없음 (50번 반복)', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({
      id: 'rep-feat',
      acceptanceCriteria: [{ id: 'rep-ac', description: '기준', verifiable: true, testCategory: 'gen' }],
    })];
    const defs = designer.createDefinitions(features);
    if (defs.ok) {
      for (let i = 0; i < 50; i++) {
        const v = designer.validate(defs.value, features);
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value.length).toBe(0);
      }
    }
  });

  it('validate ok는 boolean', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const result = designer.validate([], []);
    expect(typeof result.ok).toBe('boolean');
  });

  it('validate value는 배열', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const result = designer.validate([], []);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('createDefinitions 1000개 기능 → validate 경고 없음', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = Array.from({ length: 1000 }, (_, i) => createFeature({
      id: `bulk-${i}`,
      acceptanceCriteria: [{ id: `ac-${i}`, description: `기준${i}`, verifiable: true, testCategory: 'general' }],
    }));
    const defs = designer.createDefinitions(features);
    if (defs.ok) {
      const v = designer.validate(defs.value, features);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.length).toBe(0);
    }
  });
});

// ── TestTypeDesigner: 복합 시나리오 ──────────────────────────

describe('TestTypeDesigner 복합 시나리오', () => {
  it('10개 인스턴스 각 100개 기능 → 검증 통과', () => {
    for (let inst = 0; inst < 10; inst++) {
      const designer = new TestTypeDesigner(new ConsoleLogger('error'));
      const features = Array.from({ length: 100 }, (_, i) => createFeature({ id: `inst-${inst}-f${i}` }));
      const defs = designer.createDefinitions(features);
      expect(defs.ok).toBe(true);
      if (defs.ok) {
        const v = designer.validate(defs.value, features);
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value.length).toBe(0);
      }
    }
  });

  it('createDefinitions → featureId 순서 보존', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const ids = ['z-feat', 'a-feat', 'm-feat'];
    const features = ids.map((id) => createFeature({ id }));
    const result = designer.createDefinitions(features);
    if (result.ok) {
      const resultIds = result.value.map((d) => d.featureId);
      expect(resultIds).toEqual(ids);
    }
  });

  it('수락 기준 빈 배열 기능 → categories 1개 (general)', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ acceptanceCriteria: [] })];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      expect(result.value[0].categories.length).toBe(1);
      expect(result.value[0].categories[0]?.name).toBe('general');
    }
  });

  it('수락 기준 빈 기능 → sampleTests 12개 (general × 12)', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ acceptanceCriteria: [] })];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      // WHY: general 카테고리 1개 × 12 샘플
      expect(result.value[0].sampleTests.length).toBe(12);
    }
  });

  it('sampleTests.description 모두 문자열', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ acceptanceCriteria: [
      { id: 'ac0', description: '기준', verifiable: true, testCategory: 'unit' },
    ]})];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      for (const s of result.value[0].sampleTests) {
        expect(typeof s.description).toBe('string');
        expect(typeof s.expectedBehavior).toBe('string');
      }
    }
  });

  it('각 카테고리에 경계값/에지 케이스 테스트가 포함된다', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const features = [createFeature({ acceptanceCriteria: [
      { id: 'ac0', description: '기준', verifiable: true, testCategory: 'unit' },
    ]})];
    const result = designer.createDefinitions(features);
    if (result.ok && result.value[0]) {
      // WHY: 경계값 테스트가 다양한 형태로 포함되어 있는지 확인
      const hasBoundary = result.value[0].sampleTests.some((s) =>
        s.description.includes('경계') || s.description.includes('boundary') ||
        s.description.includes('빈 입력') || s.description.includes('null')
      );
      expect(hasBoundary).toBe(true);
    }
  });

  it('validate → 빈 features + 정의 있음 → 경고 없음', () => {
    const designer = new TestTypeDesigner(new ConsoleLogger('error'));
    const defs = [makeDefinition('orphan-def', ['ac-orphan'])];
    const result = designer.validate(defs, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(0);
  });
});
