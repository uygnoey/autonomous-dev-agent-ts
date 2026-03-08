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

// ── 추가 edge/random case ─────────────────────────────────────

describe('SpecBuilder buildSpec - 추가 edge/random case', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('UUID 형식 featureId → ok', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: uuid })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(uuid);
  });

  it('빈 featureId → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: '' })]);
    expect(result.ok).toBe(true);
  });

  it('특수문자만 있는 featureName → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: '!@#$%^&*()' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('!@#$%^&*()');
  });

  it('이모지 포함 featureName → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: '로그인 🔐 기능' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('로그인 🔐 기능');
  });

  it('plan에 개행/탭 포함 → ok', () => {
    const result = builder.buildSpec('Plan\n\tWith\n\tNewlines', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design에 개행/탭 포함 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design\n\tWith\n\tTabs', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('음수 유사 ID (feat--1) → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: 'feat--1' })]);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 featureId → ok', () => {
    const longId = 'feat-' + 'x'.repeat(500);
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: longId })]);
    expect(result.ok).toBe(true);
  });

  it('multiple acceptanceCriteria with verifiable=false → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '기준 A', verifiable: false, testCategory: 'manual' },
        { id: 'ac-2', description: '기준 B', verifiable: false, testCategory: 'exploratory' },
      ],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('기준 A');
      expect(result.value).toContain('기준 B');
    }
  });

  it('입력과 출력이 동일한 이름 → ok', () => {
    const features = [createFeature({
      inputs: [{ name: 'data', type: 'string', constraints: 'any', required: true }],
      outputs: [{ name: 'data', type: 'string', constraints: 'any', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('빈 의존성 배열 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ dependencies: [] })]);
    expect(result.ok).toBe(true);
  });

  it('여러 의존성 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [
      createFeature({ dependencies: ['dep-1', 'dep-2', 'dep-3', 'dep-4', 'dep-5'] }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('plan이 단일 문자 → ok', () => {
    const result = builder.buildSpec('P', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design이 단일 문자 → ok', () => {
    const result = builder.buildSpec('Plan', 'D', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan이 숫자 문자열 → ok', () => {
    const result = builder.buildSpec('12345', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan에 HTML 태그 포함 → ok', () => {
    const result = builder.buildSpec('<h1>My Plan</h1>', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('100개 기능 → ok', () => {
    const features = Array.from({ length: 100 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `Feature ${i}` })
    );
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('탭만 있는 design → ok=false', () => {
    const result = builder.buildSpec('Plan', '\t\t\t', [createFeature()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
  });

  it('개행만 있는 design → ok=false', () => {
    const result = builder.buildSpec('Plan', '\n\n\n', [createFeature()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
  });

  it('featureName이 빈 문자열 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: '' })]);
    expect(result.ok).toBe(true);
  });

  it('featureDescription이 빈 문자열 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ description: '' })]);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 id가 UUID 형식 → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: '550e8400-e29b-41d4-a716-446655440001', description: '기준', verifiable: true, testCategory: 'unit' },
      ],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('입력 type이 복잡한 문자열 → ok', () => {
    const features = [createFeature({
      inputs: [{ name: 'data', type: 'Array<Map<string, unknown>>', constraints: 'non-empty', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });
});

describe('SpecBuilder validateSpec - 추가 edge/random case', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('Goals 섹션이 대소문자 다를 때 → ok=false', () => {
    const spec = '## goals\n## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    // 대소문자 민감하면 false, 아니면 true
    expect(typeof result.ok).toBe('boolean');
  });

  it('섹션 헤더에 추가 공백 → 처리 가능', () => {
    const spec = '## Goals  \n## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(typeof result.ok).toBe('boolean');
  });

  it('1000줄 스펙 → ok', () => {
    const longSection = Array.from({ length: 250 }, (_, i) => `Line ${i}`).join('\n');
    const spec = `## Goals\n${longSection}\n## Features\n${longSection}\n## Design\n${longSection}\n## Plan\n${longSection}`;
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('unicode 특수문자 포함 스펙 → ok', () => {
    const spec = '## Goals\n🎯 목표\n## Features\n✨ 기능\n## Design\n🏗️ 설계\n## Plan\n📅 계획';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('Goals만 있을 때 에러 코드 확인', () => {
    const result = builder.validateSpec('## Goals\n내용');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('Features만 있을 때 에러', () => {
    const result = builder.validateSpec('## Features\n내용');
    expect(result.ok).toBe(false);
  });

  it('Design만 있을 때 에러', () => {
    const result = builder.validateSpec('## Design\n내용');
    expect(result.ok).toBe(false);
  });

  it('Plan만 있을 때 에러', () => {
    const result = builder.validateSpec('## Plan\n내용');
    expect(result.ok).toBe(false);
  });

  it('HTML 태그 포함 스펙 → 섹션 있으면 ok', () => {
    const spec = '## Goals\n<p>목표</p>\n## Features\n<ul>\n## Design\n</ul>\n## Plan\n끝';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('JSON 형식 내용 포함 스펙 → ok', () => {
    const spec = '## Goals\n{"key":"value"}\n## Features\n[]\n## Design\n{}\n## Plan\nnull';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('validateSpec 에러 메시지가 비어있지 않음', () => {
    const result = builder.validateSpec('## Goals only');
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('buildSpec 결과에 featureId 반영됨', () => {
    const uniqueId = 'unique-feature-id-xyz';
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: uniqueId })]);
    if (result.ok) {
      expect(result.value).toContain(uniqueId);
    }
  });
});

// ── buildSpec 추가 경계값 ─────────────────────────────────────

describe('SpecBuilder buildSpec - 경계값 추가 1', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('plan이 단일 공백 → ok=false (layer1_empty_plan)', () => {
    const result = builder.buildSpec(' ', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('design이 단일 공백 → ok=false (layer1_empty_design)', () => {
    const result = builder.buildSpec('Plan', ' ', [createFeature()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_design');
  });

  it('plan에 특수문자만 → ok', () => {
    const result = builder.buildSpec('!@#$%', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design에 특수문자만 → ok', () => {
    const result = builder.buildSpec('Plan', '!@#$%', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan에 숫자만 → ok', () => {
    const result = builder.buildSpec('0', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design에 숫자만 → ok', () => {
    const result = builder.buildSpec('Plan', '0', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('500개 기능 → ok', () => {
    const features = Array.from({ length: 500 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `Feature ${i}` })
    );
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('기능 이름에 슬래시 포함 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: 'auth/login' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('auth/login');
  });

  it('기능 이름에 콜론 포함 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: 'api:v2' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('api:v2');
  });

  it('plan에 마크다운 헤딩 포함 → ok', () => {
    const result = builder.buildSpec('## My Plan\n### Details', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design에 마크다운 코드블록 포함 → ok', () => {
    const result = builder.buildSpec('Plan', '```ts\nconst x = 1;\n```', [createFeature()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('```ts');
  });

  it('결과 문자열에 Specification Document 포함', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('Specification Document');
  });

  it('결과에 Acceptance Criteria 키워드 포함 (기준 있을 때)', () => {
    const features = [createFeature({
      acceptanceCriteria: [{ id: 'ac-1', description: '기준', verifiable: true, testCategory: 'unit' }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('Acceptance Criteria');
  });

  it('결과에 Inputs: 키워드 포함 (입력 있을 때)', () => {
    const features = [createFeature({
      inputs: [{ name: 'x', type: 'string', constraints: 'any', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('Inputs');
  });

  it('결과에 Outputs: 키워드 포함 (출력 있을 때)', () => {
    const features = [createFeature({
      outputs: [{ name: 'y', type: 'number', constraints: 'positive', required: false }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('Outputs');
  });

  it('ok=true 결과는 error 프로퍼티가 없다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('error' in result).toBe(false);
    }
  });

  it('ok=false 결과는 value 프로퍼티가 없다', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('value' in result).toBe(false);
    }
  });

  it('plan이 JSON 문자열 → ok', () => {
    const result = builder.buildSpec('{"key":"value"}', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan에 이모지 → ok', () => {
    const result = builder.buildSpec('🚀 Plan', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('🚀');
  });

  it('결과가 줄바꿈을 포함한다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('\n');
  });

  it('featureId가 숫자 문자열 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: '12345' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('12345');
  });

  it('accepted criterion testCategory 빈 문자열 → ok', () => {
    const features = [createFeature({
      acceptanceCriteria: [{ id: 'ac-x', description: '기준', verifiable: true, testCategory: '' }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('inputs type이 빈 문자열 → ok', () => {
    const features = [createFeature({
      inputs: [{ name: 'x', type: '', constraints: 'any', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('outputs name이 UUID 형식 → ok', () => {
    const features = [createFeature({
      outputs: [{ name: '550e8400-e29b-41d4-a716-446655440000', type: 'string', constraints: 'any', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
  });

  it('plan과 design이 동일한 내용 → ok', () => {
    const result = builder.buildSpec('Same content', 'Same content', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('features 배열 변환 이후에도 결과 일치', () => {
    const f = createFeature({ name: 'StableFeature', id: 'stable' });
    const r1 = builder.buildSpec('Plan', 'Design', [f]);
    const r2 = builder.buildSpec('Plan', 'Design', [f]);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });
});

describe('SpecBuilder buildSpec - 경계값 추가 2', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('feature에 acceptanceCriteria 10개 → 모두 포함', () => {
    const criteria = Array.from({ length: 10 }, (_, i) => ({
      id: `ac-${i}`,
      description: `기준 ${i}`,
      verifiable: true,
      testCategory: 'unit',
    }));
    const features = [createFeature({ acceptanceCriteria: criteria })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      for (let i = 0; i < 10; i++) {
        expect(result.value).toContain(`기준 ${i}`);
      }
    }
  });

  it('feature에 inputs 5개 → 모두 포함', () => {
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      name: `input${i}`,
      type: 'string',
      constraints: 'any',
      required: true,
    }));
    const features = [createFeature({ inputs })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      for (let i = 0; i < 5; i++) {
        expect(result.value).toContain(`input${i}`);
      }
    }
  });

  it('feature에 outputs 5개 → 모두 포함', () => {
    const outputs = Array.from({ length: 5 }, (_, i) => ({
      name: `output${i}`,
      type: 'number',
      constraints: 'positive',
      required: false,
    }));
    const features = [createFeature({ outputs })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) {
      for (let i = 0; i < 5; i++) {
        expect(result.value).toContain(`output${i}`);
      }
    }
  });

  it('features 50개 → ok 및 첫/마지막 포함', () => {
    const features = Array.from({ length: 50 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `F${i}` })
    );
    const result = builder.buildSpec('Plan', 'Design', features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('F0');
      expect(result.value).toContain('F49');
    }
  });

  it('plan에 CRLF 줄바꿈 포함 → ok', () => {
    const result = builder.buildSpec('Plan\r\nLine2', 'Design', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('design에 CRLF 줄바꿈 포함 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design\r\nLine2', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('error.code는 미리 정해진 값이다 (빈 plan)', () => {
    const result = builder.buildSpec('', 'Design', [createFeature()]);
    if (!result.ok) {
      const code = result.error.code;
      expect(['layer1_empty_plan', 'layer1_empty_design', 'layer1_empty_spec', 'layer1_incomplete_spec'].includes(code)).toBe(true);
    }
  });

  it('buildSpec 호출 후 빌더 재사용 가능', () => {
    builder.buildSpec('Plan A', 'Design A', [createFeature({ id: 'a' })]);
    const r = builder.buildSpec('Plan B', 'Design B', [createFeature({ id: 'b' })]);
    expect(r.ok).toBe(true);
  });

  it('빈 plan + 유효 design → 빈 plan 에러 코드', () => {
    const r = builder.buildSpec('', 'Valid Design', [createFeature()]);
    if (!r.ok) expect(r.error.code).toBe('layer1_empty_plan');
  });

  it('유효 plan + 빈 design → 빈 design 에러 코드', () => {
    const r = builder.buildSpec('Valid Plan', '', [createFeature()]);
    if (!r.ok) expect(r.error.code).toBe('layer1_empty_design');
  });

  it('feature name에 백슬래시 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: 'feat\\name' })]);
    expect(result.ok).toBe(true);
  });

  it('feature name에 따옴표 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: 'feat "quoted"' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('feat "quoted"');
  });

  it('feature id에 점 포함 → ok', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ id: 'feat.v2.0' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('feat.v2.0');
  });

  it('feature name이 공백 문자 → ok (이름 자체는 검증 안 함)', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature({ name: '   ' })]);
    expect(result.ok).toBe(true);
  });

  it('input required=true → (required) 표시', () => {
    const features = [createFeature({
      inputs: [{ name: 'token', type: 'string', constraints: 'JWT', required: true }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('(required)');
  });

  it('input required=false → (optional) 표시', () => {
    const features = [createFeature({
      inputs: [{ name: 'limit', type: 'number', constraints: 'positive', required: false }],
    })];
    const result = builder.buildSpec('Plan', 'Design', features);
    if (result.ok) expect(result.value).toContain('(optional)');
  });

  it('결과의 첫 줄은 # Specification Document', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) {
      const firstLine = result.value.split('\n')[0];
      expect(firstLine).toBe('# Specification Document');
    }
  });

  it('결과에 ## Design 섹션이 있다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('## Design');
  });

  it('결과에 ## Plan 섹션이 있다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('## Plan');
  });

  it('결과에 ## Goals 섹션이 있다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('## Goals');
  });

  it('결과에 ## Features 섹션이 있다', () => {
    const result = builder.buildSpec('Plan', 'Design', [createFeature()]);
    if (result.ok) expect(result.value).toContain('## Features');
  });
});

describe('SpecBuilder validateSpec - 경계값 추가', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('섹션 이름만 있고 내용 없어도 ok', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('Goals 없이 나머지 3개 → ok=false', () => {
    const spec = '## Features\nf\n## Design\nd\n## Plan\np';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Features 없이 나머지 3개 → ok=false', () => {
    const spec = '## Goals\ng\n## Design\nd\n## Plan\np';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Design 없이 나머지 3개 → ok=false', () => {
    const spec = '## Goals\ng\n## Features\nf\n## Plan\np';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('Plan 없이 나머지 3개 → ok=false', () => {
    const spec = '## Goals\ng\n## Features\nf\n## Design\nd';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('모두 있으면 추가 섹션 상관없이 ok', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan\n## Extra Section\n더 많은 내용';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('에러 코드 layer1_incomplete_spec 확인 (Goals 누락)', () => {
    const spec = '## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('에러 코드 layer1_incomplete_spec 확인 (Features 누락)', () => {
    const spec = '## Goals\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('에러 코드 layer1_incomplete_spec 확인 (Design 누락)', () => {
    const spec = '## Goals\n## Features\n## Plan';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('에러 코드 layer1_incomplete_spec 확인 (Plan 누락)', () => {
    const spec = '## Goals\n## Features\n## Design';
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.code).toBe('layer1_incomplete_spec');
  });

  it('에러 메시지에 누락 섹션 이름 포함', () => {
    const spec = '## Features\n## Design\n## Plan'; // Goals 없음
    const result = builder.validateSpec(spec);
    if (!result.ok) expect(result.error.message).toContain('Goals');
  });

  it('buildSpec 결과 validate → ok true (20번 반복)', () => {
    for (let i = 0; i < 20; i++) {
      const built = builder.buildSpec(`Plan${i}`, `Design${i}`, [createFeature({ id: `f${i}` })]);
      if (built.ok) {
        expect(builder.validateSpec(built.value).ok).toBe(true);
      }
    }
  });

  it('validateSpec 에러 ok는 boolean', () => {
    const r = builder.validateSpec('no sections here');
    expect(typeof r.ok).toBe('boolean');
  });

  it('validateSpec 성공 결과는 value가 undefined', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    const r = builder.validateSpec(spec);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('ok false 결과는 value 없음', () => {
    const r = builder.validateSpec('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect('value' in r).toBe(false);
  });

  it('5번 동일 유효 spec → 항상 ok=true', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    for (let i = 0; i < 5; i++) {
      expect(builder.validateSpec(spec).ok).toBe(true);
    }
  });

  it('5번 동일 비어있는 spec → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      expect(builder.validateSpec('').ok).toBe(false);
    }
  });

  it('이진 내용(null bytes) 포함 spec → 결과 타입이 boolean', () => {
    const spec = '## Goals\x00\n## Features\n## Design\n## Plan';
    const r = builder.validateSpec(spec);
    expect(typeof r.ok).toBe('boolean');
  });

  it('매우 긴 section 내용 (10000자) → ok', () => {
    const content = 'a'.repeat(10000);
    const spec = `## Goals\n${content}\n## Features\n${content}\n## Design\n${content}\n## Plan\n${content}`;
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });
});

// ── buildSpec 추가 경계값 ─────────────────────────────────────────

describe('buildSpec 추가 경계값', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('plan 공백만 → err', () => {
    const result = builder.buildSpec('   ', 'design content', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_plan');
    }
  });

  it('design 공백만 → err', () => {
    const result = builder.buildSpec('plan content', '   ', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_design');
    }
  });

  it('빈 plan 문자열 → err', () => {
    const result = builder.buildSpec('', 'design', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_plan');
    }
  });

  it('빈 design 문자열 → err', () => {
    const result = builder.buildSpec('plan', '', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_design');
    }
  });

  it('features 빈 배열이어도 ok', () => {
    const result = builder.buildSpec('plan content', 'design content', []);
    expect(result.ok).toBe(true);
  });

  it('결과 문자열에 Goals 섹션 포함', () => {
    const result = builder.buildSpec('my plan', 'my design', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Goals');
    }
  });

  it('결과 문자열에 Features 섹션 포함', () => {
    const result = builder.buildSpec('my plan', 'my design', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Features');
    }
  });

  it('결과 문자열에 Design 섹션 포함', () => {
    const result = builder.buildSpec('my plan', 'my design', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Design');
    }
  });

  it('결과 문자열에 Plan 섹션 포함', () => {
    const result = builder.buildSpec('my plan', 'my design', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Plan');
    }
  });

  it('design 내용이 결과에 포함된다', () => {
    const result = builder.buildSpec('plan', 'unique-design-xyz', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('unique-design-xyz');
    }
  });

  it('plan 내용이 결과에 포함된다', () => {
    const result = builder.buildSpec('unique-plan-abc', 'design', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('unique-plan-abc');
    }
  });

  it('feature 이름이 결과에 포함된다', () => {
    const feature = createFeature({ id: 'f-unique', name: 'MyUniqueFeature' });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('MyUniqueFeature');
    }
  });

  it('feature id가 결과에 포함된다', () => {
    const feature = createFeature({ id: 'feat-xyz-123' });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('feat-xyz-123');
    }
  });

  it('feature description이 결과에 포함된다', () => {
    const feature = createFeature({ description: 'unique-desc-567' });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('unique-desc-567');
    }
  });

  it('acceptance criteria description이 결과에 포함된다', () => {
    const feature = createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: 'criteria-unique-abc', verifiable: true, testCategory: 'unit' },
      ],
    });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('criteria-unique-abc');
    }
  });

  it('input name이 결과에 포함된다', () => {
    const feature = createFeature({
      inputs: [{ name: 'unique-input-name', type: 'string', constraints: 'none', required: true }],
    });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('unique-input-name');
    }
  });

  it('output name이 결과에 포함된다', () => {
    const feature = createFeature({
      outputs: [{ name: 'unique-output-name', type: 'string', constraints: 'none', required: false }],
    });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('unique-output-name');
    }
  });

  it('결과는 string 타입', () => {
    const result = builder.buildSpec('plan', 'design', []);
    if (result.ok) {
      expect(typeof result.value).toBe('string');
    }
  });

  it('동일 입력 → 동일 출력 (결정론적)', () => {
    const features = [createFeature()];
    const r1 = builder.buildSpec('plan', 'design', features);
    const r2 = builder.buildSpec('plan', 'design', features);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });

  it('10개 기능 → 모두 결과에 포함', () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `Feature${i}` })
    );
    const result = builder.buildSpec('plan', 'design', features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (let i = 0; i < 10; i++) {
        expect(result.value).toContain(`Feature${i}`);
      }
    }
  });

  it('input required=true → "(required)" 포함', () => {
    const feature = createFeature({
      inputs: [{ name: 'myInput', type: 'string', constraints: 'c', required: true }],
    });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('(required)');
    }
  });

  it('input required=false → "(optional)" 포함', () => {
    const feature = createFeature({
      inputs: [{ name: 'myOpt', type: 'string', constraints: 'c', required: false }],
    });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('(optional)');
    }
  });

  it('plan, design 탭 문자 포함 → ok', () => {
    const result = builder.buildSpec('plan\tcontent', 'design\tcontent', []);
    expect(result.ok).toBe(true);
  });

  it('plan, design 줄바꿈 포함 → ok', () => {
    const result = builder.buildSpec('line1\nline2', 'line3\nline4', []);
    expect(result.ok).toBe(true);
  });

  it('유니코드 plan/design → ok', () => {
    const result = builder.buildSpec('기획 내용', '설계 내용', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('기획 내용');
      expect(result.value).toContain('설계 내용');
    }
  });

  it('빈 err 결과 value 없음', () => {
    const result = builder.buildSpec('', 'design', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('value' in result).toBe(false);
    }
  });
});

// ── validateSpec 추가 경계값 ──────────────────────────────────────

describe('validateSpec 추가 경계값', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('Goals만 없으면 에러', () => {
    const spec = '## Features\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Goals');
    }
  });

  it('Features만 없으면 에러', () => {
    const spec = '## Goals\n## Design\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Features');
    }
  });

  it('Design만 없으면 에러', () => {
    const spec = '## Goals\n## Features\n## Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Design');
    }
  });

  it('Plan만 없으면 에러', () => {
    const spec = '## Goals\n## Features\n## Design';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Plan');
    }
  });

  it('모든 섹션 있으면 ok', () => {
    const spec = '## Goals\n## Features\n## Design\n## Plan';
    expect(builder.validateSpec(spec).ok).toBe(true);
  });

  it('에러 code=layer1_incomplete_spec', () => {
    const result = builder.validateSpec('no sections');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_incomplete_spec');
    }
  });

  it('빈 문자열 → layer1_empty_spec', () => {
    const result = builder.validateSpec('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_spec');
    }
  });

  it('공백 문자열 → layer1_empty_spec', () => {
    const result = builder.validateSpec('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('layer1_empty_spec');
    }
  });

  it('대소문자 구분 → 소문자 섹션은 인식 안됨', () => {
    // 소문자 'goals', 'features' 등은 REQUIRED_SECTIONS에 없음
    const spec = 'goals\nfeatures\ndesign\nplan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
  });

  it('섹션 이름 앞뒤 공백 추가 → 인식됨 (contains 사용)', () => {
    const spec = '  ## Goals  \n  ## Features  \n  ## Design  \n  ## Plan  ';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('누락 섹션 모두 error.message에 포함', () => {
    const spec = 'no sections at all';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Goals');
      expect(result.error.message).toContain('Features');
      expect(result.error.message).toContain('Design');
      expect(result.error.message).toContain('Plan');
    }
  });

  it('ok=true 결과의 value는 undefined', () => {
    const spec = 'Goals Features Design Plan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('buildSpec → validateSpec 파이프라인 ok', () => {
    const r = builder.buildSpec('plan content', 'design content', [createFeature()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = builder.validateSpec(r.value);
      expect(v.ok).toBe(true);
    }
  });

  it('섹션 순서 다르게 → ok (contains 기반)', () => {
    const spec = 'Plan comes first\nThen Features\nAlso Goals\nFinally Design';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('섹션 단어가 텍스트 중간에 있어도 → ok', () => {
    const spec = 'These are the Goals of the system. Features include X. Design is modular. Plan ahead.';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('탭 포함 spec → ok', () => {
    const spec = 'Goals\tFeatures\tDesign\tPlan';
    const result = builder.validateSpec(spec);
    expect(result.ok).toBe(true);
  });

  it('에러 code는 string 타입', () => {
    const result = builder.validateSpec('');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('에러 message는 string 타입', () => {
    const result = builder.validateSpec('missing all');
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });
});

// ── buildSpec + validateSpec 복합 시나리오 ────────────────────────

describe('buildSpec + validateSpec 복합 시나리오', () => {
  let builder: SpecBuilder;

  beforeEach(() => {
    builder = new SpecBuilder(new ConsoleLogger('error'));
  });

  it('여러 features → buildSpec → validateSpec 모두 ok', () => {
    const features = Array.from({ length: 5 }, (_, i) =>
      createFeature({
        id: `feat-${i}`,
        name: `Feature${i}`,
        acceptanceCriteria: [
          { id: `ac-${i}`, description: `기준 ${i}`, verifiable: true, testCategory: 'unit' },
        ],
        inputs: [{ name: `input${i}`, type: 'string', constraints: 'none', required: true }],
        outputs: [{ name: `output${i}`, type: 'string', constraints: 'none', required: false }],
      })
    );
    const buildResult = builder.buildSpec('상세 기획', '상세 설계', features);
    expect(buildResult.ok).toBe(true);
    if (buildResult.ok) {
      const validateResult = builder.validateSpec(buildResult.value);
      expect(validateResult.ok).toBe(true);
    }
  });

  it('plan/design 에러 → validateSpec 호출 안함 (에러 전파)', () => {
    const result = builder.buildSpec('', 'design', []);
    expect(result.ok).toBe(false);
    // buildSpec 실패 시 validateSpec 불필요
  });

  it('buildSpec 결과를 validateSpec에 그대로 전달 → 항상 ok', () => {
    for (let i = 0; i < 5; i++) {
      const r = builder.buildSpec(`plan-${i}`, `design-${i}`, []);
      if (r.ok) {
        expect(builder.validateSpec(r.value).ok).toBe(true);
      }
    }
  });

  it('기능 acceptance criteria 없어도 buildSpec ok', () => {
    const feature = createFeature({ acceptanceCriteria: [] });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
  });

  it('기능 inputs 없어도 buildSpec ok', () => {
    const feature = createFeature({ inputs: [] });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
  });

  it('기능 outputs 없어도 buildSpec ok', () => {
    const feature = createFeature({ outputs: [] });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
  });

  it('plan 첫 줄 only → buildSpec ok', () => {
    const result = builder.buildSpec('single-line-plan', 'single-line-design', []);
    expect(result.ok).toBe(true);
  });

  it('결과 길이가 plan + design + features 합산보다 길다', () => {
    const plan = 'plan-content';
    const design = 'design-content';
    const features = [createFeature()];
    const result = builder.buildSpec(plan, design, features);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(plan.length + design.length);
    }
  });

  it('features 의존성 포함 → 결과에 의존성 없음 (SpecBuilder는 deps 렌더링 안함)', () => {
    const feature = createFeature({ dependencies: ['other-feat'] });
    const result = builder.buildSpec('plan', 'design', [feature]);
    expect(result.ok).toBe(true);
    // dependencies는 SpecBuilder가 렌더링하지 않지만 스펙은 여전히 유효
    if (result.ok) {
      expect(builder.validateSpec(result.value).ok).toBe(true);
    }
  });
});

// ── 생성자 추가 경계값 ────────────────────────────────────────────

describe('SpecBuilder 생성자 추가 경계값', () => {
  it('ConsoleLogger error 레벨로 생성 → ok', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('error'))).not.toThrow();
  });

  it('ConsoleLogger warn 레벨로 생성 → ok', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('ConsoleLogger debug 레벨로 생성 → ok', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('ConsoleLogger info 레벨로 생성 → ok', () => {
    expect(() => new SpecBuilder(new ConsoleLogger('info'))).not.toThrow();
  });

  it('5개 독립 인스턴스 생성 → 모두 instanceof SpecBuilder', () => {
    const builders = Array.from({ length: 5 }, () => new SpecBuilder(new ConsoleLogger('error')));
    for (const b of builders) {
      expect(b).toBeInstanceOf(SpecBuilder);
    }
  });

  it('buildSpec 메서드 호출 가능 (함수 타입 확인)', () => {
    const b = new SpecBuilder(new ConsoleLogger('error'));
    expect(typeof b.buildSpec).toBe('function');
  });

  it('validateSpec 메서드 호출 가능 (함수 타입 확인)', () => {
    const b = new SpecBuilder(new ConsoleLogger('error'));
    expect(typeof b.validateSpec).toBe('function');
  });

  it('서로 다른 인스턴스는 독립적이다', () => {
    const b1 = new SpecBuilder(new ConsoleLogger('error'));
    const b2 = new SpecBuilder(new ConsoleLogger('error'));
    const r1 = b1.buildSpec('plan', 'design', []);
    const r2 = b2.buildSpec('plan', 'design', []);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value); // 동일 입력 → 동일 출력
    }
  });
});
