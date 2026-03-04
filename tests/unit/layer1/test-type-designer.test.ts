import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { TestTypeDesigner } from '../../../src/layer1/test-type-designer.js';
import type { FeatureSpec, TestTypeDefinition } from '../../../src/layer1/types.js';

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

describe('TestTypeDesigner', () => {
  let designer: TestTypeDesigner;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    designer = new TestTypeDesigner(logger);
  });

  // ── createDefinitions ───────────────────────────────────────

  describe('createDefinitions', () => {
    it('각 기능에 대해 테스트 정의를 생성한다', () => {
      const features = [
        createFeature({ id: 'feat-a' }),
        createFeature({ id: 'feat-b' }),
      ];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        expect(result.value[0]?.featureId).toBe('feat-a');
        expect(result.value[1]?.featureId).toBe('feat-b');
      }
    });

    it('빈 기능 목록에 대해 빈 배열을 반환한다', () => {
      const result = designer.createDefinitions([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('수락 기준을 테스트 카테고리에 매핑한다', () => {
      const features = [
        createFeature({
          id: 'feat-auth',
          acceptanceCriteria: [
            { id: 'ac-1', description: '로그인', verifiable: true, testCategory: 'authentication' },
            { id: 'ac-2', description: '로그아웃', verifiable: true, testCategory: 'authentication' },
            { id: 'ac-3', description: '권한 확인', verifiable: true, testCategory: 'authorization' },
          ],
        }),
      ];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const def = result.value[0];
        expect(def).toBeDefined();
        if (def) {
          expect(def.categories.length).toBe(2);
          const authCat = def.categories.find((c) => c.name === 'authentication');
          expect(authCat).toBeDefined();
          expect(authCat?.mappedCriteria).toContain('ac-1');
          expect(authCat?.mappedCriteria).toContain('ac-2');
        }
      }
    });

    it('수락 기준이 없으면 기본 카테고리를 생성한다', () => {
      const features = [createFeature({ id: 'feat-no-criteria' })];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const def = result.value[0];
        expect(def).toBeDefined();
        if (def) {
          expect(def.categories.length).toBe(1);
          expect(def.categories[0]?.name).toBe('general');
        }
      }
    });

    it('기본 테스트 비율이 포함된다', () => {
      const features = [createFeature()];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ratios = result.value[0]?.ratios;
        expect(ratios).toBeDefined();
        if (ratios) {
          expect(ratios.unit).toBe(0.6);
          expect(ratios.module).toBe(0.25);
          expect(ratios.e2e).toBe(0.15);
        }
      }
    });

    it('샘플 테스트가 카테고리별로 생성된다', () => {
      const features = [
        createFeature({
          acceptanceCriteria: [
            { id: 'ac-1', description: '입력 검증', verifiable: true, testCategory: 'validation' },
          ],
        }),
      ];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const def = result.value[0];
        expect(def).toBeDefined();
        if (def) {
          expect(def.sampleTests.length).toBeGreaterThanOrEqual(2);
          const categories = def.sampleTests.map((t) => t.category);
          expect(categories).toContain('validation');
        }
      }
    });

    it('테스트 규칙이 포함된다', () => {
      const features = [createFeature()];

      const result = designer.createDefinitions(features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const def = result.value[0];
        expect(def).toBeDefined();
        if (def) {
          expect(def.rules.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── validate ────────────────────────────────────────────────

  describe('validate', () => {
    it('완전한 매핑에 대해 빈 경고를 반환한다', () => {
      const features = [
        createFeature({
          id: 'feat-0',
          acceptanceCriteria: [
            { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'general' },
          ],
        }),
      ];
      const definitions: TestTypeDefinition[] = [
        {
          featureId: 'feat-0',
          categories: [{ name: 'general', description: 'General', mappedCriteria: ['ac-1'] }],
          rules: [],
          sampleTests: [],
          ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
        },
      ];

      const result = designer.validate(definitions, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('테스트 정의가 없는 기능을 경고한다', () => {
      const features = [createFeature({ id: 'feat-missing' })];
      const definitions: TestTypeDefinition[] = [];

      const result = designer.validate(definitions, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value.some((w) => w.includes('feat-missing'))).toBe(true);
      }
    });

    it('매핑되지 않은 수락 기준을 경고한다', () => {
      const features = [
        createFeature({
          id: 'feat-0',
          acceptanceCriteria: [
            { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'auth' },
            { id: 'ac-2', description: '기준 2', verifiable: true, testCategory: 'auth' },
          ],
        }),
      ];
      const definitions: TestTypeDefinition[] = [
        {
          featureId: 'feat-0',
          categories: [{ name: 'auth', description: 'Auth', mappedCriteria: ['ac-1'] }],
          rules: [],
          sampleTests: [],
          ratios: { unit: 0.6, module: 0.25, e2e: 0.15 },
        },
      ];

      const result = designer.validate(definitions, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasWarning = result.value.some((w) => w.includes('ac-2'));
        expect(hasWarning).toBe(true);
      }
    });

    it('빈 기능 목록에 대해 빈 경고를 반환한다', () => {
      const result = designer.validate([], []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
