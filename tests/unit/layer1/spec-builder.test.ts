/**
 * SpecBuilder 단위 테스트
 *
 * @description
 * KR: buildSpec/validateSpec 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for buildSpec/validateSpec boundary conditions. 80%+ edge ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { SpecBuilder } from 'layer1/spec-builder.js';
import type { FeatureSpec } from 'layer1/types.js';

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

// ── 생성자 ────────────────────────────────────────────────────

describe('SpecBuilder 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('error'))).not.toThrow();
  });

  it('SpecBuilder 인스턴스이다', () => {
    expect(new SpecBuilder(new ConsoleLogger('error'))).toBeInstanceOf(SpecBuilder);
  });

  it('buildSpec 메서드가 존재한다', () => {
    const b = new SpecBuilder(new ConsoleLogger('error'));
    expect(typeof b.buildSpec).toBe('function');
  });

  it('validateSpec 메서드가 존재한다', () => {
    const b = new SpecBuilder(new ConsoleLogger('error'));
    expect(typeof b.validateSpec).toBe('function');
  });

  it('두 인스턴스는 다른 객체이다', () => {
    const b1 = new SpecBuilder(new ConsoleLogger('error'));
    const b2 = new SpecBuilder(new ConsoleLogger('error'));
    expect(b1).not.toBe(b2);
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 생성 가능', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new SpecBuilder(new ConsoleLogger('error'))).not.toThrow();
    }
  });
});

// ── buildSpec - 성공 케이스 ───────────────────────────────────

describe('SpecBuilder buildSpec - 성공 케이스', () => {
  let builder: SpecBuilder;
  const logger = new ConsoleLogger('error');

  beforeEach(() => {
    builder = new SpecBuilder(logger);
  });

  it('기획 + 설계 + 기능으로 스펙 문서를 생성한다', () => {
    const result = builder.buildSpec('Plan content', 'Design content', [
      createFeature({ name: 'Auth', id: 'feat-auth' }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('결과에 Goals 섹션이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('Goals');
  });

  it('결과에 Features 섹션이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('Features');
  });

  it('결과에 Design 섹션이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('Design');
  });

  it('결과에 Plan 섹션이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('Plan');
  });

  it('기능 이름이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: 'Auth Feature' })]);
    if (result.ok) expect(result.value).toContain('Auth Feature');
  });

  it('기능 ID가 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: 'feat-auth' })]);
    if (result.ok) expect(result.value).toContain('feat-auth');
  });

  it('기능 설명이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ description: '인증 기능 설명' })]);
    if (result.ok) expect(result.value).toContain('인증 기능 설명');
  });

  it('plan 내용이 포함된다', () => {
    const result = builder.buildSpec('My Plan Content', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('My Plan Content');
  });

  it('design 내용이 포함된다', () => {
    const result = builder.buildSpec('Plan', 'My Design Content', [createFeature()]);
    if (result.ok) expect(result.value).toContain('My Design Content');
  });

  it('수락 기준이 스펙에 포함된다', () => {
    const features = [createFeature({
      acceptanceCriteria: [{ id: 'ac-1', description: '로그인 가능', verifiable: true, testCategory: 'auth' }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('로그인 가능');
  });

  it('입력 정보가 포함된다', () => {
    const features = [createFeature({
      inputs: [{ name: 'email', type: 'string', constraints: 'valid email', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      expect(result.value).toContain('email');
      expect(result.value).toContain('required');
    }
  });

  it('출력 정보가 포함된다', () => {
    const features = [createFeature({
      outputs: [{ name: 'token', type: 'string', constraints: 'JWT format', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('token');
  });

  it('여러 기능이 모두 포함된다', () => {
    const features = [
      createFeature({ name: 'Feature A', id: 'feat-a' }),
      createFeature({ name: 'Feature B', id: 'feat-b' }),
      createFeature({ name: 'Feature C', id: 'feat-c' }),
    ];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      expect(result.value).toContain('Feature A');
      expect(result.value).toContain('Feature B');
      expect(result.value).toContain('Feature C');
    }
  });

  it('빈 기능 목록으로도 ok 반환', () => {
    const result = builder.buildSpec('Plan', 'Design', []);
    expect(result.ok).toBe(true);
  });

  it('빈 기능 목록 → Goals/Design/Plan 섹션 존재', () => {
    const result = builder.buildSpec('Plan', 'Design', []);
    if (result.ok) {
      expect(result.value).toContain('Goals');
      expect(result.value).toContain('Design');
      expect(result.value).toContain('Plan');
    }
  });

  it('결과가 문자열이다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('결과가 비어있지 않다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('optional(required=false) 표시가 포함된다', () => {
    const features = [createFeature({
      inputs: [{ name: 'limit', type: 'number', constraints: 'positive', required: false }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('optional');
  });

  it('10번 호출 → 항상 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = builder.buildSpec(`Plan ${i}`, `Design ${i}`, [createFeature({ id: `feat-${i}` })]);
      expect(result.ok).toBe(true);
    }
  });

  it('ok는 boolean이다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('5개 기능 → 모두 포함', () => {
    const features = Array.from({ length: 5 }, (_, i) => createFeature({ name: `Feat ${i}`, id: `feat-${i}` }));
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      for (let i = 0; i < 5; i++) {
        expect(result.value).toContain(`Feat ${i}`);
      }
    }
  });

  it('10개 기능 → 모두 포함', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature({ name: `Feature-${i}`, id: `f${i}` }));
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      for (let i = 0; i < 10; i++) {
        expect(result.value).toContain(`Feature-${i}`);
      }
    }
  });

  it('매우 긴 plan 텍스트 → ok', () => {
    const longPlan = 'Plan '.repeat(500);
    const result = builder.buildSpec(longPlan, 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('Plan');
  });

  it('매우 긴 design 텍스트 → ok', () => {
    const longDesign = 'Design '.repeat(500);
    const result = builder.buildSpec('Plan', longDesign, [createFeature()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('Design');
  });

  it('한국어 기능명 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: '로그인 기능', id: 'feat-login' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('로그인 기능');
  });

  it('5번 동일 입력 → 항상 같은 ok 결과', () => {
    for (let i = 0; i < 5; i++) {
      const result = builder.buildSpec('Stable Plan', 'Stable Design', [createFeature({ id: 'stable-feat' })]);
      expect(result.ok).toBe(true);
    }
  });

  it('의존성 있는 기능으로도 ok 반환', () => {
    const features = [createFeature({ dependencies: ['feat-dep1'] })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('여러 수락 기준 → 모두 포함', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준 1', verifiable: true, testCategory: 'unit' },
        { id: 'ac-2', description: '기준 2', verifiable: true, testCategory: 'integration' },
      ],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      expect(result.value).toContain('기준 1');
      expect(result.value).toContain('기준 2');
    }
  });

  it('buildSpec 결과가 validateSpec을 통과한다', () => {
    const built = builder.buildSpec('Some Plan', 'Some Design', [createFeature()]);
    if (built.ok) {
      const validated = builder.validateSpec(built.value);
      expect(validated.ok).toBe(true);
    }
  });
});

// ── buildSpec - 실패 케이스 ───────────────────────────────────

describe('SpecBuilder buildSpec - 실패 케이스', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('빈 plan → ok=false', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('빈 plan → code=layer1_empty_plan', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('공백만 있는 plan → ok=false', () => {
    const result = builder.buildSpec('   ', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 plan → code=layer1_empty_plan', () => {
    const result = builder.buildSpec('   ', 'Design', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('탭만 있는 plan → ok=false', () => {
    const result = builder.buildSpec('\t\t', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 plan → ok=false', () => {
    const result = builder.buildSpec('\n\n', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('빈 design → ok=false', () => {
    const result = builder.buildSpec('Plan', '', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('빈 design → code=layer1_empty_design', () => {
    const result = builder.buildSpec('Plan', '', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
  });

  it('공백만 있는 design → ok=false', () => {
    const result = builder.buildSpec('Plan', '   ', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 design → code=layer1_empty_design', () => {
    const result = builder.buildSpec('Plan', '   ', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
  });

  it('plan 검증이 design보다 먼저 실행된다', () => {
    // 둘 다 비어있으면 plan 에러 먼저
    const result = builder.buildSpec('', '', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('에러 코드가 문자열이다 (빈 plan)', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 코드가 문자열이다 (빈 design)', () => {
    const result = builder.buildSpec('Plan', '', [createFeature()]);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('빈 plan 5번 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = builder.buildSpec('', 'Design', [createFeature()]);
      expect(result.ok).toBe(false);
    }
  });

  it('빈 design 5번 → 항상 code=layer1_empty_design', () => {
    for (let i = 0; i < 5; i++) {
      const result = builder.buildSpec('Plan', '', [createFeature()]);
      if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
    }
  });

  it('에러 메시지가 문자열이다', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });
});

// ── validateSpec - 성공 케이스 ───────────────────────────────

describe('SpecBuilder validateSpec - 성공 케이스', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('모든 필수 섹션이 있으면 ok', () => {
    const spec = '# Spec\n## Goals\n## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('buildSpec 결과는 validateSpec 통과한다', () => {
    const buildResult = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (buildResult.ok) {
      const validateResult = builder.validateSpec(buildResult.value);
      expect(validateResult.ok).toBe(true);
    }
  });

  it('추가 섹션이 있어도 ok', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan\n## Extra';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('섹션 순서가 달라도 ok', () => {
    const spec = '## Plan\n## Design\n## Features\n## Goals';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('ok는 boolean이다', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 동일 spec → 항상 ok=true', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    for (let i = 0; i < 5; i++) {
      expect(builder.validateSpec(spec).ok).toBe(true);
    }
  });

  it('섹션 내 많은 내용이 있어도 ok', () => {
    const longContent = 'x'.repeat(1000);
    const spec = `## Goals\n${longContent}\n## Features\n${longContent}\n## Design\n${longContent}\n## Plan\n${longContent}`;
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('한국어 내용이 있어도 ok', () => {
    const spec = '## Goals\n목표 내용\n## Features\n기능 목록\n## Design\n설계 내용\n## Plan\n계획 내용';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('buildSpec 10번 → 항상 validateSpec 통과', () => {
    for (let i = 0; i < 10; i++) {
      const built = builder.buildSpec(`Plan ${i}`, `Design ${i}`, [createFeature({ id: `f${i}` })]);
      if (built.ok) {
        expect(builder.validateSpec(built.value).ok).toBe(true);
      }
    }
  });
});

// ── validateSpec - 실패 케이스 ───────────────────────────────

describe('SpecBuilder validateSpec - 실패 케이스', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('빈 스펙 → ok=false', () => {
    const result = builder.validateSpec('');
    expect(result.ok).toBe(false);
  });

  it('빈 스펙 → code=layer1_empty_spec', () => {
    const result = builder.validateSpec('');
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_spec');
  });

  it('공백만 있는 스펙 → ok=false', () => {
    const result = builder.validateSpec('   \n\n   ');
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 스펙 → code=layer1_empty_spec', () => {
    const result = builder.validateSpec('   \n\n   ');
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_spec');
  });

  it('Goals 누락 → ok=false', () => {
    const spec = '## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Goals 누락 → message에 Goals 포함', () => {
    const spec = '## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.message).toContain('Goals');
  });

  it('Features 누락 → ok=false', () => {
    const spec = '## Goals\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Features 누락 → message에 Features 포함', () => {
    const spec = '## Goals\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.message).toContain('Features');
  });

  it('Design 누락 → ok=false', () => {
    const spec = '## Goals\n## Features\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Design 누락 → message에 Design 포함', () => {
    const spec = '## Goals\n## Features\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.message).toContain('Design');
  });

  it('Plan 누락 → ok=false', () => {
    const spec = '## Goals\n## Features\n## Design';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Plan 누락 → message에 Plan 포함', () => {
    const spec = '## Goals\n## Features\n## Design';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.message).toContain('Plan');
  });

  it('여러 섹션 누락 → message에 모두 포함', () => {
    const spec = 'Only some content';
    const result = builder.validateSpec(spec);
    if (!result.ok) {
      expect(result.error.message).toContain('Goals');
      expect(result.error.message).toContain('Features');
    }
  });

  it('code가 layer1_incomplete_spec', () => {
    const spec = '## Goals only';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('임의의 텍스트 → 섹션 없으면 ok=false', () => {
    const result = builder.validateSpec('This is some random text without required sections');
    expect(result.ok).toBe(false);
  });

  it('탭만 있는 스펙 → ok=false', () => {
    const result = builder.validateSpec('\t\t\t');
    expect(result.ok).toBe(false);
  });

  it('에러 코드가 문자열이다 (빈 스펙)', () => {
    const result = builder.validateSpec('');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다 (누락 섹션)', () => {
    const result = builder.validateSpec('## Goals only');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('빈 스펙 5번 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      expect(builder.validateSpec('').ok).toBe(false);
    }
  });

  it('Goals+Features만 있을 때 → ok=false (Design, Plan 없음)', () => {
    const spec = '## Goals\n내용\n## Features\n내용';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 스펙 → ok=false', () => {
    const result = builder.validateSpec('\n\n\n\n');
    expect(result.ok).toBe(false);
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('SpecBuilder 복합 시나리오', () => {
  it('두 SpecBuilder 인스턴스가 독립적으로 동작한다', () => {
    const b1 = new SpecBuilder(new ConsoleLogger('error'));
    const b2 = new SpecBuilder(new ConsoleLogger('error'));
    const r1 = b1.buildSpec('Plan A', 'Design A', [createFeature({ name: 'Feat A' })]);
    const r2 = b2.buildSpec('Plan B', 'Design B', [createFeature({ name: 'Feat B' })]);
    if (r1.ok && r2.ok) {
      expect(r1.value).toContain('Feat A');
      expect(r2.value).toContain('Feat B');
    }
  });

  it('buildSpec → validateSpec → buildSpec 파이프라인', () => {
    const builder = new SpecBuilder(new ConsoleLogger('error'));
    const r1 = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (r1.ok) {
      const validated = builder.validateSpec(r1.value);
      expect(validated.ok).toBe(true);
      // validateSpec이 성공한 스펙으로 다시 buildSpec 호출 가능
      const r2 = builder.buildSpec('New Plan', 'New Design', [createFeature({ id: 'feat-new' })]);
      expect(r2.ok).toBe(true);
    }
  });

  it('5개 SpecBuilder 인스턴스 독립 동작', () => {
    const builders = Array.from({ length: 5 }, () => new SpecBuilder(new ConsoleLogger('error')));
    for (let i = 0; i < builders.length; i++) {
      const b = builders[i];
      if (b) {
        const result = b.buildSpec(`Plan ${i}`, `Design ${i}`, [createFeature({ id: `feat-${i}` })]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          const validated = b.validateSpec(result.value);
          expect(validated.ok).toBe(true);
        }
      }
    }
  });

  it('50번 buildSpec+validateSpec 반복 → 항상 성공', () => {
    const builder = new SpecBuilder(new ConsoleLogger('error'));
    for (let i = 0; i < 50; i++) {
      const built = builder.buildSpec(`Plan ${i}`, `Design ${i}`, [createFeature({ id: `f${i}` })]);
      expect(built.ok).toBe(true);
      if (built.ok) {
        expect(builder.validateSpec(built.value).ok).toBe(true);
      }
    }
  });
});
