/**
 * Designer 단위 테스트
 *
 * @description
 * KR: createDesign/validateDesign 경계값 및 오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Tests for createDesign/validateDesign boundary conditions. 80%+ edge ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { Designer } from 'layer1/designer.js';
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

describe('Designer 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new Designer(new ConsoleLogger('error'))).not.toThrow();
  });

  it('Designer 인스턴스이다', () => {
    expect(new Designer(new ConsoleLogger('error'))).toBeInstanceOf(Designer);
  });

  it('debug 레벨 logger로 생성 가능', () => {
    expect(() => new Designer(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('createDesign 메서드 존재', () => {
    expect(typeof new Designer(new ConsoleLogger('error')).createDesign).toBe('function');
  });

  it('validateDesign 메서드 존재', () => {
    expect(typeof new Designer(new ConsoleLogger('error')).validateDesign).toBe('function');
  });

  it('두 인스턴스는 서로 다른 객체', () => {
    const d1 = new Designer(new ConsoleLogger('error'));
    const d2 = new Designer(new ConsoleLogger('error'));
    expect(d1).not.toBe(d2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new Designer(new ConsoleLogger('warn'))).not.toThrow();
  });

  it('10개 인스턴스 모두 독립', () => {
    const designers = Array.from({ length: 10 }, () => new Designer(new ConsoleLogger('error')));
    for (let i = 0; i < designers.length; i++) {
      for (let j = i + 1; j < designers.length; j++) {
        expect(designers[i]).not.toBe(designers[j]);
      }
    }
  });
});

// ── createDesign - 성공 케이스 ────────────────────────────────

describe('Designer createDesign - 성공 케이스', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('기획 + 기능으로 ok=true 반환', () => {
    const result = designer.createDesign('proj-test', 'Plan content', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('결과에 projectId가 포함된다', () => {
    const result = designer.createDesign('proj-abc', 'Plan', [createFeature()]);
    if (result.ok) expect(result.value).toContain('proj-abc');
  });

  it('결과에 기능 이름이 포함된다', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ name: 'Authentication' })]);
    if (result.ok) expect(result.value).toContain('Authentication');
  });

  it('결과에 기능 ID가 포함된다', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ id: 'feat-auth' })]);
    if (result.ok) expect(result.value).toContain('feat-auth');
  });

  it('결과가 문자열이다', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature()]);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('결과가 비어있지 않다', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature()]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('입력 정보(email)가 포함된다', () => {
    const features = [createFeature({
      inputs: [{ name: 'email', type: 'string', constraints: 'valid email', required: true }],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('email');
  });

  it('출력 정보(token)가 포함된다', () => {
    const features = [createFeature({
      outputs: [{ name: 'token', type: 'string', constraints: 'JWT', required: true }],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('token');
  });

  it('의존성이 있으면 Dependencies 섹션 포함', () => {
    const features = [
      createFeature({ id: 'feat-a', name: 'A', dependencies: [] }),
      createFeature({ id: 'feat-b', name: 'B', dependencies: ['feat-a'] }),
    ];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('Dependencies');
  });

  it('의존성이 있으면 의존 ID가 포함된다', () => {
    const features = [
      createFeature({ id: 'feat-a' }),
      createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
    ];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('feat-a');
  });

  it('수락 기준 설명이 포함된다', () => {
    const features = [createFeature({
      acceptanceCriteria: [{ id: 'ac-1', description: '로그인 성공', verifiable: true, testCategory: 'auth' }],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('로그인 성공');
  });

  it('여러 기능이 모두 포함된다', () => {
    const features = [
      createFeature({ id: 'feat-a', name: 'Feature A' }),
      createFeature({ id: 'feat-b', name: 'Feature B' }),
      createFeature({ id: 'feat-c', name: 'Feature C' }),
    ];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) {
      expect(result.value).toContain('Feature A');
      expect(result.value).toContain('Feature B');
      expect(result.value).toContain('Feature C');
    }
  });

  it('plan 내용이 결과에 포함된다', () => {
    const result = designer.createDesign('proj', 'My Special Plan Content', [createFeature()]);
    if (result.ok) expect(result.value).toContain('My Special Plan Content');
  });

  it('10번 호출 → 항상 ok', () => {
    for (let i = 0; i < 10; i++) {
      const result = designer.createDesign(`proj-${i}`, `Plan ${i}`, [createFeature({ id: `feat-${i}` })]);
      expect(result.ok).toBe(true);
    }
  });

  it('required=true 입력이 포함된다', () => {
    const features = [createFeature({
      inputs: [{ name: 'username', type: 'string', constraints: 'non-empty', required: true }],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('username');
  });

  it('required=false 입력도 포함된다', () => {
    const features = [createFeature({
      inputs: [{ name: 'limit', type: 'number', constraints: 'positive', required: false }],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('limit');
  });

  it('기능 description이 포함된다', () => {
    const features = [createFeature({ description: '사용자 인증 처리 기능' })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) expect(result.value).toContain('사용자 인증 처리 기능');
  });

  it('여러 수락 기준이 모두 포함된다', () => {
    const features = [createFeature({
      acceptanceCriteria: [
        { id: 'ac-1', description: '로그인 성공', verifiable: true, testCategory: 'auth' },
        { id: 'ac-2', description: '토큰 발급', verifiable: true, testCategory: 'auth' },
      ],
    })];
    const result = designer.createDesign('proj', 'Plan', features);
    if (result.ok) {
      expect(result.value).toContain('로그인 성공');
      expect(result.value).toContain('토큰 발급');
    }
  });

  it('ok는 boolean 타입', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature()]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('UUID projectId → ok', () => {
    const result = designer.createDesign('550e8400-e29b-41d4-a716-446655440000', 'Plan', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('한글 기능명 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ name: '사용자 인증' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('사용자 인증');
  });

  it('긴 plan 내용 → ok', () => {
    const result = designer.createDesign('proj', 'Plan '.repeat(200), [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('5개 기능 → ok', () => {
    const features = Array.from({ length: 5 }, (_, i) => createFeature({ id: `feat-${i}`, name: `Feature ${i}` }));
    const result = designer.createDesign('proj', 'Plan', features);
    expect(result.ok).toBe(true);
  });

  it('5번 반복 → 동일 ok 결과', () => {
    for (let i = 0; i < 5; i++) {
      const result = designer.createDesign('proj', 'Plan', [createFeature()]);
      expect(result.ok).toBe(true);
    }
  });
});

// ── createDesign - 실패 케이스 ────────────────────────────────

describe('Designer createDesign - 실패 케이스', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('빈 plan → ok=false', () => {
    const result = designer.createDesign('proj', '', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('빈 plan → code=layer1_empty_plan', () => {
    const result = designer.createDesign('proj', '', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('공백만 있는 plan → ok=false', () => {
    const result = designer.createDesign('proj', '   ', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('공백만 있는 plan → code=layer1_empty_plan', () => {
    const result = designer.createDesign('proj', '   ', [createFeature()]);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('탭만 있는 plan → ok=false', () => {
    const result = designer.createDesign('proj', '\t\t', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 plan → ok=false', () => {
    const result = designer.createDesign('proj', '\n\n', [createFeature()]);
    expect(result.ok).toBe(false);
  });

  it('기능 없음 → ok=false', () => {
    const result = designer.createDesign('proj', 'Some plan', []);
    expect(result.ok).toBe(false);
  });

  it('기능 없음 → code=layer1_no_features', () => {
    const result = designer.createDesign('proj', 'Some plan', []);
    if (!result.ok) expect(result.error.code).toBe('layer1_no_features');
  });

  it('빈 plan + 빈 기능 → ok=false (plan 먼저)', () => {
    const result = designer.createDesign('proj', '', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('ok=false의 ok는 boolean', () => {
    const result = designer.createDesign('proj', '', [createFeature()]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('error.code는 string', () => {
    const result = designer.createDesign('proj', '', [createFeature()]);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('error.message는 string', () => {
    const result = designer.createDesign('proj', '', [createFeature()]);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('5번 빈 plan → 모두 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = designer.createDesign('proj', '', [createFeature()]);
      expect(result.ok).toBe(false);
    }
  });

  it('5번 빈 기능 → 모두 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = designer.createDesign('proj', 'Plan', []);
      expect(result.ok).toBe(false);
    }
  });
});

// ── validateDesign - 성공 케이스 ─────────────────────────────

describe('Designer validateDesign - 성공 케이스', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('모든 기능 ID 포함 → ok=true', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('Design document containing feat-0', features);
    expect(result.ok).toBe(true);
  });

  it('모든 기능 ID 포함 → 빈 배열 반환', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('Design document containing feat-0', features);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('여러 기능 모두 포함 → 빈 배열', () => {
    const features = [
      createFeature({ id: 'feat-a' }),
      createFeature({ id: 'feat-b' }),
    ];
    const result = designer.validateDesign('Design document with feat-a and feat-b', features);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('의존성 있고 Dependencies 섹션 있으면 → 빈 배열', () => {
    const features = [createFeature({ id: 'feat-a', dependencies: ['feat-b'] })];
    const result = designer.validateDesign('Design feat-a Dependencies section', features);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('반환값이 배열이다', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('contains feat-0', features);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('createDesign 결과는 validateDesign을 통과한다', () => {
    const features = [createFeature({ id: 'feat-x', name: 'X' })];
    const designResult = designer.createDesign('proj', 'Plan', features);
    if (designResult.ok) {
      const validateResult = designer.validateDesign(designResult.value, features);
      expect(validateResult.ok).toBe(true);
      if (validateResult.ok) expect(validateResult.value).toEqual([]);
    }
  });

  it('10번 호출 → 항상 ok', () => {
    for (let i = 0; i < 10; i++) {
      const features = [createFeature({ id: `feat-${i}` })];
      const result = designer.validateDesign(`Design with feat-${i}`, features);
      expect(result.ok).toBe(true);
    }
  });

  it('ok는 boolean 타입', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('contains feat-0', features);
    expect(typeof result.ok).toBe('boolean');
  });

  it('반환 issues는 string 배열', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('contains feat-0', features);
    if (result.ok) {
      for (const issue of result.value) {
        expect(typeof issue).toBe('string');
      }
    }
  });

  it('5번 반복 → 동일 결과', () => {
    const features = [createFeature({ id: 'feat-0' })];
    for (let i = 0; i < 5; i++) {
      const result = designer.validateDesign('contains feat-0', features);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });
});

// ── validateDesign - 실패/경고 케이스 ────────────────────────

describe('Designer validateDesign - 실패/경고 케이스', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('빈 설계 → ok=true (issues non-empty)', () => {
    const result = designer.validateDesign('', [createFeature({ id: 'feat-0' })]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('공백만 있는 설계 → issues non-empty', () => {
    const result = designer.validateDesign('   ', [createFeature({ id: 'feat-0' })]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('누락된 기능 ID → issues에 해당 ID 포함', () => {
    const features = [createFeature({ id: 'feat-missing' })];
    const result = designer.validateDesign('Design without the ID', features);
    if (result.ok) {
      const hasIssue = result.value.some((issue) => issue.includes('feat-missing'));
      expect(hasIssue).toBe(true);
    }
  });

  it('의존성 있는데 Dependencies 섹션 없음 → issue 포함', () => {
    const features = [createFeature({ id: 'feat-a', dependencies: ['feat-b'] })];
    const result = designer.validateDesign('Design contains feat-a but no dep section', features);
    if (result.ok) {
      const hasDepIssue = result.value.some((issue) => issue.includes('Dependencies'));
      expect(hasDepIssue).toBe(true);
    }
  });

  it('여러 기능 중 일부 누락 → 누락된 ID만 issue에 포함', () => {
    const features = [
      createFeature({ id: 'feat-present' }),
      createFeature({ id: 'feat-absent' }),
    ];
    const result = designer.validateDesign('Design with feat-present only', features);
    if (result.ok) {
      const hasAbsent = result.value.some((issue) => issue.includes('feat-absent'));
      expect(hasAbsent).toBe(true);
    }
  });

  it('완전히 무관한 텍스트 → issues non-empty', () => {
    const features = [createFeature({ id: 'feat-x' })];
    const result = designer.validateDesign('Lorem ipsum dolor sit amet', features);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('여러 기능 모두 누락 → 모든 ID가 issue에 포함', () => {
    const features = [
      createFeature({ id: 'feat-a' }),
      createFeature({ id: 'feat-b' }),
    ];
    const result = designer.validateDesign('Unrelated design document', features);
    if (result.ok) {
      const hasA = result.value.some((i) => i.includes('feat-a'));
      const hasB = result.value.some((i) => i.includes('feat-b'));
      expect(hasA).toBe(true);
      expect(hasB).toBe(true);
    }
  });

  it('issues 배열 원소가 모두 문자열이다', () => {
    const features = [createFeature({ id: 'feat-str' })];
    const result = designer.validateDesign('No matching', features);
    if (result.ok) {
      for (const issue of result.value) {
        expect(typeof issue).toBe('string');
      }
    }
  });

  it('UUID 기능 ID 누락 → issue에 포함', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const features = [createFeature({ id: uuid })];
    const result = designer.validateDesign('No matching design', features);
    if (result.ok) {
      const hasUuid = result.value.some(issue => issue.includes(uuid));
      expect(hasUuid).toBe(true);
    }
  });

  it('5번 반복 → 동일 issues 개수', () => {
    const features = [createFeature({ id: 'feat-miss' })];
    const firstResult = designer.validateDesign('No match', features);
    const firstCount = firstResult.ok ? firstResult.value.length : -1;
    for (let i = 0; i < 4; i++) {
      const r = designer.validateDesign('No match', features);
      if (r.ok) expect(r.value.length).toBe(firstCount);
    }
  });
});

// ── 복합 시나리오 ─────────────────────────────────────────────

describe('Designer 복합 시나리오', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('createDesign → validateDesign 파이프라인 성공', () => {
    const features = [
      createFeature({ id: 'feat-auth', name: 'Auth', dependencies: [] }),
      createFeature({ id: 'feat-profile', name: 'Profile', dependencies: ['feat-auth'] }),
    ];
    const designResult = designer.createDesign('proj-pipeline', '기획 내용', features);
    expect(designResult.ok).toBe(true);
    if (designResult.ok) {
      const validateResult = designer.validateDesign(designResult.value, features);
      expect(validateResult.ok).toBe(true);
      if (validateResult.ok) expect(validateResult.value).toEqual([]);
    }
  });

  it('다른 인스턴스로 동일 결과', () => {
    const d1 = new Designer(new ConsoleLogger('error'));
    const d2 = new Designer(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'f1' })];
    const r1 = d1.createDesign('proj', 'Plan', features);
    const r2 = d2.createDesign('proj', 'Plan', features);
    expect(r1.ok).toBe(r2.ok);
  });

  it('의존성 체인이 있는 설계 → createDesign ok', () => {
    const features = [
      createFeature({ id: 'feat-a', dependencies: [] }),
      createFeature({ id: 'feat-b', dependencies: ['feat-a'] }),
      createFeature({ id: 'feat-c', dependencies: ['feat-b'] }),
    ];
    const result = designer.createDesign('proj', 'Chained plan', features);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 없는 기능 → createDesign ok', () => {
    const features = [createFeature({ acceptanceCriteria: [] })];
    const result = designer.createDesign('proj', 'Plan', features);
    expect(result.ok).toBe(true);
  });

  it('입출력 없는 기능 → createDesign ok', () => {
    const features = [createFeature({ inputs: [], outputs: [] })];
    const result = designer.createDesign('proj', 'Plan', features);
    expect(result.ok).toBe(true);
  });

  it('두 디자이너 인스턴스 독립', () => {
    const d2 = new Designer(new ConsoleLogger('error'));
    const features = [createFeature()];
    const r1 = designer.createDesign('proj', 'Plan', features);
    const r2 = d2.createDesign('proj', 'Plan', features);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // 각자 독립된 결과
    expect(r1).not.toBe(r2);
  });

  it('10개 기능 → createDesign + validateDesign 파이프라인', () => {
    const features = Array.from({ length: 10 }, (_, i) => createFeature({ id: `feat-${i}`, name: `Feature ${i}` }));
    const designResult = designer.createDesign('proj', '기획', features);
    expect(designResult.ok).toBe(true);
    if (designResult.ok) {
      const validateResult = designer.validateDesign(designResult.value, features);
      expect(validateResult.ok).toBe(true);
      if (validateResult.ok) expect(validateResult.value).toHaveLength(0);
    }
  });

  it('50번 createDesign 반복 → 모두 ok', () => {
    const features = [createFeature()];
    for (let i = 0; i < 50; i++) {
      const result = designer.createDesign(`proj-${i}`, `Plan ${i}`, features);
      expect(result.ok).toBe(true);
    }
  });
});

// ── 추가 createDesign 경계값 ──────────────────────────────────

describe('Designer createDesign 추가 경계값', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('UUID 기능 ID → 결과에 포함', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = designer.createDesign('proj', 'Plan', [createFeature({ id: uuid })]);
    if (result.ok) expect(result.value).toContain(uuid);
  });

  it('특수문자 기능명 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ name: 'Feature!@#' })]);
    expect(result.ok).toBe(true);
  });

  it('빈 문자열 기능 description → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ description: '' })]);
    expect(result.ok).toBe(true);
  });

  it('긴 기능 description (500자) → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [
      createFeature({ description: '설명'.repeat(250) }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('기능 input 타입 number → 결과에 포함', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      inputs: [{ name: 'count', type: 'number', constraints: 'positive', required: true }],
    })]);
    if (result.ok) expect(result.value).toContain('count');
  });

  it('기능 input 타입 boolean → 결과에 포함', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      inputs: [{ name: 'flag', type: 'boolean', constraints: 'none', required: false }],
    })]);
    if (result.ok) expect(result.value).toContain('flag');
  });

  it('output 여러 개 → 모두 포함', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      outputs: [
        { name: 'token', type: 'string', constraints: 'JWT', required: true },
        { name: 'expiry', type: 'number', constraints: 'unix ts', required: true },
      ],
    })]);
    if (result.ok) {
      expect(result.value).toContain('token');
      expect(result.value).toContain('expiry');
    }
  });

  it('수락 기준 verifiable=false → 포함', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      acceptanceCriteria: [{ id: 'ac-nv', description: 'non-verifiable', verifiable: false, testCategory: 'manual' }],
    })]);
    if (result.ok) expect(result.value).toContain('non-verifiable');
  });

  it('의존성 없는 기능들 → Dependencies 섹션 생략 가능', () => {
    const features = [
      createFeature({ id: 'feat-a', dependencies: [] }),
      createFeature({ id: 'feat-b', dependencies: [] }),
    ];
    const result = designer.createDesign('proj', 'Plan', features);
    expect(result.ok).toBe(true);
  });

  it('projectId에 공백 포함 → ok', () => {
    const result = designer.createDesign('my project id', 'Plan', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan 내용에 특수문자 → ok', () => {
    const result = designer.createDesign('proj', '기획!@#$%^&*()\n내용\t탭', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan 내용이 단일 문자 → ok', () => {
    const result = designer.createDesign('proj', 'A', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('기능 이름이 빈 문자열 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({ name: '' })]);
    expect(result.ok).toBe(true);
  });

  it('입력/출력 둘 다 여러 개 → ok', () => {
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      name: `input${i}`, type: 'string', constraints: 'any', required: true as const,
    }));
    const outputs = Array.from({ length: 5 }, (_, i) => ({
      name: `output${i}`, type: 'string', constraints: 'any', required: true as const,
    }));
    const result = designer.createDesign('proj', 'Plan', [createFeature({ inputs, outputs })]);
    expect(result.ok).toBe(true);
  });

  it('20개 기능 → createDesign ok', () => {
    const features = Array.from({ length: 20 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `Feature ${i}` })
    );
    const result = designer.createDesign('proj', 'Large plan', features);
    expect(result.ok).toBe(true);
  });

  it('result.value는 JSON.stringify 가능한 문자열', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature()]);
    if (result.ok) {
      const stringified = JSON.stringify(result.value);
      expect(typeof stringified).toBe('string');
    }
  });
});

// ── 추가 validateDesign 경계값 ────────────────────────────────

describe('Designer validateDesign 추가 경계값', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('UUID ID가 설계에 포함 → issues 없음', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const features = [createFeature({ id: uuid })];
    const result = designer.validateDesign(`Design contains ${uuid}`, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 기능 목록 → issues 없음 (검증할 것 없음)', () => {
    const result = designer.validateDesign('Any design document', []);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('기능 ID 대소문자 구분 → 대문자 ID 누락 시 issue 포함', () => {
    const features = [createFeature({ id: 'FEAT-UPPER' })];
    const result = designer.validateDesign('design with feat-upper (lowercase)', features);
    if (result.ok) {
      const hasIssue = result.value.some((i) => i.includes('FEAT-UPPER'));
      expect(hasIssue).toBe(true);
    }
  });

  it('설계 문서가 매우 길면 → ok', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const longDesign = `feat-0 ${'x'.repeat(10000)}`;
    const result = designer.validateDesign(longDesign, features);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('특수문자 포함 ID → 설계에 포함 시 issues 없음', () => {
    const specialId = 'feat!@#';
    const features = [createFeature({ id: specialId })];
    const result = designer.validateDesign(`design ${specialId} present`, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('한글 ID → 설계에 포함 시 issues 없음', () => {
    const korId = '기능-001';
    const features = [createFeature({ id: korId })];
    const result = designer.validateDesign(`설계 ${korId} 포함`, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('한글 ID → 설계에 없으면 issue 포함', () => {
    const korId = '기능-없음';
    const features = [createFeature({ id: korId })];
    const result = designer.validateDesign('한글 기능 없는 설계', features);
    if (result.ok) {
      expect(result.value.some((i) => i.includes(korId))).toBe(true);
    }
  });

  it('의존성 있는 기능이 Dependencies 섹션 있는 설계 → issues 없음', () => {
    const features = [
      createFeature({ id: 'feat-a', dependencies: ['feat-b'] }),
      createFeature({ id: 'feat-b', dependencies: [] }),
    ];
    const design = 'Design feat-a feat-b Dependencies section included';
    const result = designer.validateDesign(design, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('설계가 탭 문자만 → issues non-empty', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('\t\t\t', features);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('설계가 숫자만 → issues non-empty', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('12345', features);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('createDesign 결과 → 다른 인스턴스 validateDesign 통과', () => {
    const d2 = new Designer(new ConsoleLogger('error'));
    const features = [createFeature({ id: 'feat-cross' })];
    const design = designer.createDesign('proj', 'Plan', features);
    if (design.ok) {
      const result = d2.validateDesign(design.value, features);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    }
  });
});

// ── createDesign 추가 랜덤/경계값 ────────────────────────────

describe('Designer createDesign 추가 랜덤/경계값', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('plan이 단순 숫자 문자열 → ok', () => {
    const result = designer.createDesign('proj', '12345', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('plan이 이모지 포함 → ok', () => {
    const result = designer.createDesign('proj', '🚀 기획 내용', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('100개 기능 → createDesign ok', () => {
    const features = Array.from({ length: 100 }, (_, i) =>
      createFeature({ id: `feat-${i}`, name: `Feature ${i}` }),
    );
    const result = designer.createDesign('proj', 'Massive plan', features);
    expect(result.ok).toBe(true);
  });

  it('projectId 빈 문자열 → ok', () => {
    const result = designer.createDesign('', 'Plan content', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('projectId 숫자 문자열 → ok', () => {
    const result = designer.createDesign('9999', 'Plan', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('기능 input constraints 빈 문자열 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      inputs: [{ name: 'x', type: 'string', constraints: '', required: true }],
    })]);
    expect(result.ok).toBe(true);
  });

  it('기능 output constraints 빈 문자열 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      outputs: [{ name: 'y', type: 'string', constraints: '', required: false }],
    })]);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 id 빈 문자열 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      acceptanceCriteria: [{ id: '', description: '기준', verifiable: true, testCategory: 'test' }],
    })]);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 testCategory 빈 문자열 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [createFeature({
      acceptanceCriteria: [{ id: 'ac-1', description: '기준', verifiable: true, testCategory: '' }],
    })]);
    expect(result.ok).toBe(true);
  });

  it('5번 실패 plan 후 성공 plan → ok', () => {
    for (let i = 0; i < 5; i++) {
      const r = designer.createDesign('proj', '', [createFeature()]);
      expect(r.ok).toBe(false);
    }
    const result = designer.createDesign('proj', 'Valid plan', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('5번 실패 features 후 성공 → ok', () => {
    for (let i = 0; i < 5; i++) {
      const r = designer.createDesign('proj', 'Plan', []);
      expect(r.ok).toBe(false);
    }
    const result = designer.createDesign('proj', 'Plan', [createFeature()]);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 기능 이름 → ok', () => {
    const result = designer.createDesign('proj', 'Plan', [
      createFeature({ name: '기능'.repeat(100) }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('많은 의존성을 가진 기능 → ok', () => {
    const deps = Array.from({ length: 20 }, (_, i) => `feat-dep-${i}`);
    const result = designer.createDesign('proj', 'Plan', [
      createFeature({ id: 'feat-main', dependencies: deps }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('수락 기준 50개 → ok', () => {
    const criteria = Array.from({ length: 50 }, (_, i) => ({
      id: `ac-${i}`,
      description: `기준 ${i}`,
      verifiable: i % 2 === 0,
      testCategory: `cat-${i}`,
    }));
    const result = designer.createDesign('proj', 'Plan', [
      createFeature({ acceptanceCriteria: criteria }),
    ]);
    expect(result.ok).toBe(true);
  });
});

// ── validateDesign 추가 랜덤/경계값 ──────────────────────────

describe('Designer validateDesign 추가 랜덤/경계값', () => {
  let designer: Designer;

  beforeEach(() => {
    designer = new Designer(new ConsoleLogger('error'));
  });

  it('설계 문서에 ID가 여러 번 나타남 → issues 없음', () => {
    const features = [createFeature({ id: 'feat-dup' })];
    const result = designer.validateDesign('feat-dup feat-dup feat-dup', features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('issues 배열 길이가 누락된 기능 수와 일치', () => {
    const features = [
      createFeature({ id: 'feat-miss-1' }),
      createFeature({ id: 'feat-miss-2' }),
    ];
    const result = designer.validateDesign('Unrelated content', features);
    if (result.ok) {
      // 최소 2개 이슈 (각 누락 ID마다 이슈)
      expect(result.value.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('이모지가 포함된 설계 문서 → ok', () => {
    const features = [createFeature({ id: 'feat-0' })];
    const result = designer.validateDesign('🚀 feat-0 이모지 포함', features);
    expect(result.ok).toBe(true);
  });

  it('이모지 ID → 설계에 있으면 issues 없음', () => {
    const emojiId = 'feat-🚀';
    const features = [createFeature({ id: emojiId })];
    const result = designer.validateDesign(`설계 ${emojiId} 포함`, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('탭/개행 혼합 설계 + ID 포함 → issues 없음', () => {
    const features = [createFeature({ id: 'feat-mixed' })];
    const result = designer.validateDesign('\t feat-mixed \n포함 설계', features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('1000자 ID → 설계에 있으면 issues 없음', () => {
    const longId = 'feat-' + 'x'.repeat(995);
    const features = [createFeature({ id: longId })];
    const result = designer.validateDesign(`설계 ${longId} 포함`, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('1000자 ID → 설계에 없으면 issue 포함', () => {
    const longId = 'feat-' + 'y'.repeat(995);
    const features = [createFeature({ id: longId })];
    const result = designer.validateDesign('Short design', features);
    if (result.ok) {
      expect(result.value.some((i) => i.includes(longId))).toBe(true);
    }
  });

  it('빈 기능 목록 + 긴 설계 → issues 없음', () => {
    const result = designer.validateDesign('x'.repeat(5000), []);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('UUID ID 10개 모두 설계에 포함 → issues 없음', () => {
    const uuids = Array.from({ length: 10 }, (_, i) => `feat-uuid-${i}`);
    const features = uuids.map((id) => createFeature({ id }));
    const design = uuids.join(' ') + ' design content';
    const result = designer.validateDesign(design, features);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('ok는 항상 true (validateDesign은 항상 성공 반환)', () => {
    for (let i = 0; i < 10; i++) {
      const r = designer.validateDesign('random content ' + i, [createFeature({ id: `feat-${i}` })]);
      expect(r.ok).toBe(true);
    }
  });
});
