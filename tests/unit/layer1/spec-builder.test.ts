import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { SpecBuilder } from '../../../src/layer1/spec-builder.js';
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

describe('SpecBuilder', () => {
  let builder: SpecBuilder;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    builder = new SpecBuilder(logger);
  });

  // ── buildSpec ───────────────────────────────────────────────

  describe('buildSpec', () => {
    it('기획 + 설계 + 기능으로 스펙 문서를 생성한다', () => {
      const plan = 'Plan content';
      const design = 'Design content';
      const features = [createFeature({ name: 'Auth', id: 'feat-auth' })];

      const result = builder.buildSpec(plan, design, features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Goals');
        expect(result.value).toContain('Features');
        expect(result.value).toContain('Design');
        expect(result.value).toContain('Plan');
        expect(result.value).toContain('Auth');
      }
    });

    it('빈 기획에 대해 에러를 반환한다', () => {
      const result = builder.buildSpec('', 'Design', [createFeature()]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_plan');
      }
    });

    it('빈 설계에 대해 에러를 반환한다', () => {
      const result = builder.buildSpec('Plan', '', [createFeature()]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_design');
      }
    });

    it('수락 기준이 스펙에 포함된다', () => {
      const features = [
        createFeature({
          acceptanceCriteria: [
            { id: 'ac-1', description: '로그인 가능', verifiable: true, testCategory: 'auth' },
          ],
        }),
      ];

      const result = builder.buildSpec('Plan', 'Design', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('로그인 가능');
      }
    });

    it('입출력 정보가 스펙에 포함된다', () => {
      const features = [
        createFeature({
          inputs: [
            { name: 'email', type: 'string', constraints: 'valid email', required: true },
          ],
          outputs: [
            { name: 'token', type: 'string', constraints: 'JWT format', required: true },
          ],
        }),
      ];

      const result = builder.buildSpec('Plan', 'Design', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('email');
        expect(result.value).toContain('token');
        expect(result.value).toContain('required');
      }
    });

    it('여러 기능이 모두 포함된다', () => {
      const features = [
        createFeature({ name: 'Feature A', id: 'feat-a' }),
        createFeature({ name: 'Feature B', id: 'feat-b' }),
        createFeature({ name: 'Feature C', id: 'feat-c' }),
      ];

      const result = builder.buildSpec('Plan', 'Design', features);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Feature A');
        expect(result.value).toContain('Feature B');
        expect(result.value).toContain('Feature C');
      }
    });
  });

  // ── validateSpec ────────────────────────────────────────────

  describe('validateSpec', () => {
    it('모든 필수 섹션이 있으면 통과한다', () => {
      const spec = '# Spec\n## Goals\n## Features\n## Design\n## Plan';

      const result = builder.validateSpec(spec);

      expect(result.ok).toBe(true);
    });

    it('빈 스펙에 대해 에러를 반환한다', () => {
      const result = builder.validateSpec('');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_spec');
      }
    });

    it('Goals 섹션이 누락되면 에러를 반환한다', () => {
      const spec = '## Features\n## Design\n## Plan';

      const result = builder.validateSpec(spec);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Goals');
      }
    });

    it('여러 섹션이 누락되면 모두 보고한다', () => {
      const spec = 'Only some content';

      const result = builder.validateSpec(spec);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Goals');
        expect(result.error.message).toContain('Features');
      }
    });

    it('공백만 있는 스펙에 대해 에러를 반환한다', () => {
      const result = builder.validateSpec('   \n\n   ');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer1_empty_spec');
      }
    });
  });
});
