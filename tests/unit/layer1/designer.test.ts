import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { Designer } from '../../../src/layer1/designer.js';
import type { FeatureSpec } from '../../../src/layer1/types.js';

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

describe('Designer', () => {
  let designer: Designer;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    designer = new Designer(logger);
  });

  // ── createDesign ────────────────────────────────────────────

  describe('createDesign', () => {
    it('기획과 기능으로 설계 문서를 생성한다', () => {
      const plan = '# Project Plan\nBuild authentication system';
      const features = [createFeature({ id: 'feat-auth', name: 'Authentication' })];

      const result = designer.createDesign('proj-test', plan, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('proj-test');
        expect(result.value).toContain('Authentication');
        expect(result.value).toContain('feat-auth');
      }
    });

    it('빈 기획 문서에 대해 에러를 반환한다', () => {
      const features = [createFeature()];

      const result = designer.createDesign('proj-test', '', features);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_plan');
      }
    });

    it('기능이 없으면 에러를 반환한다', () => {
      const result = designer.createDesign('proj-test', 'Some plan', []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_no_features');
      }
    });

    it('입출력 정보가 포함된 기능의 설계를 생성한다', () => {
      const features = [
        createFeature({
          name: 'Auth',
          inputs: [{ name: 'email', type: 'string', constraints: 'valid email', required: true }],
          outputs: [{ name: 'token', type: 'string', constraints: 'JWT', required: true }],
        }),
      ];

      const result = designer.createDesign('proj-test', 'Plan content', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('email');
        expect(result.value).toContain('token');
      }
    });

    it('의존성이 있으면 Dependencies 섹션을 포함한다', () => {
      const features = [
        createFeature({ id: 'feat-a', name: 'A', dependencies: [] }),
        createFeature({ id: 'feat-b', name: 'B', dependencies: ['feat-a'] }),
      ];

      const result = designer.createDesign('proj-test', 'Plan', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Dependencies');
        expect(result.value).toContain('feat-a');
      }
    });

    it('수락 기준이 있으면 설계에 포함한다', () => {
      const features = [
        createFeature({
          acceptanceCriteria: [
            {
              id: 'ac-1',
              description: '로그인 성공',
              verifiable: true,
              testCategory: 'auth',
            },
          ],
        }),
      ];

      const result = designer.createDesign('proj-test', 'Plan', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('로그인 성공');
      }
    });
  });

  // ── validateDesign ──────────────────────────────────────────

  describe('validateDesign', () => {
    it('유효한 설계에 대해 빈 배열을 반환한다', () => {
      const features = [createFeature({ id: 'feat-0' })];
      const design = 'Design document containing feat-0';

      const result = designer.validateDesign(design, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('빈 설계 문서에 대해 문제를 보고한다', () => {
      const features = [createFeature({ id: 'feat-0' })];

      const result = designer.validateDesign('', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('누락된 기능 ID를 감지한다', () => {
      const features = [
        createFeature({ id: 'feat-missing', name: 'Missing' }),
      ];
      const design = 'Design document without the feature ID';

      const result = designer.validateDesign(design, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasIssue = result.value.some((issue) => issue.includes('feat-missing'));
        expect(hasIssue).toBe(true);
      }
    });

    it('의존성이 있는데 Dependencies 섹션이 없으면 경고한다', () => {
      const features = [
        createFeature({ id: 'feat-a', dependencies: ['feat-b'] }),
      ];
      const design = 'Design document containing feat-a without dependency info';

      const result = designer.validateDesign(design, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasDepWarning = result.value.some((issue) => issue.includes('Dependencies'));
        expect(hasDepWarning).toBe(true);
      }
    });

    it('모든 기능이 포함되고 의존성 없으면 문제가 없다', () => {
      const features = [
        createFeature({ id: 'feat-a' }),
        createFeature({ id: 'feat-b' }),
      ];
      const design = 'Design document with feat-a and feat-b';

      const result = designer.validateDesign(design, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
