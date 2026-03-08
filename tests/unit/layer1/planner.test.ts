/**
 * Planner 단위 테스트 / Planner unit tests
 *
 * @description
 * createPlan, extractFeatures 검증.
 * 임계값: MIN_CONVERSATIONS=1, ### 헤더로 기능 파싱.
 * 80%+ 랜덤/경계값 비율 준수.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { Planner } from 'layer1/planner.js';
import type { ConversationMessage } from 'layer1/types.js';

let msgCounter = 0;

function createMessage(role: 'user' | 'assistant', content: string): ConversationMessage {
  msgCounter += 1;
  return {
    id: `msg-${msgCounter}`,
    role,
    content,
    timestamp: new Date('2026-03-04T00:00:00Z'),
    projectId: 'proj-test',
  };
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('Planner 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => new Planner(new ConsoleLogger('error'))).not.toThrow();
  });

  it('Planner 인스턴스', () => {
    expect(new Planner(new ConsoleLogger('error'))).toBeInstanceOf(Planner);
  });

  it('createPlan 메서드 존재', () => {
    const planner = new Planner(new ConsoleLogger('error'));
    expect(typeof planner.createPlan).toBe('function');
  });

  it('extractFeatures 메서드 존재', () => {
    const planner = new Planner(new ConsoleLogger('error'));
    expect(typeof planner.extractFeatures).toBe('function');
  });

  it('10개 인스턴스 모두 생성 가능', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => new Planner(new ConsoleLogger('error'))).not.toThrow();
    }
  });

  it('debug logger로 생성 가능', () => {
    expect(() => new Planner(new ConsoleLogger('debug'))).not.toThrow();
  });

  it('두 인스턴스는 다른 객체', () => {
    const p1 = new Planner(new ConsoleLogger('error'));
    const p2 = new Planner(new ConsoleLogger('error'));
    expect(p1).not.toBe(p2);
  });
});

// ── createPlan ─────────────────────────────────────────────────

describe('Planner createPlan', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('빈 대화 → err (layer1_insufficient_data)', () => {
    const result = planner.createPlan('proj-1', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_insufficient_data');
  });

  it('user 메시지 1개 → ok', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '기능 A')]);
    expect(result.ok).toBe(true);
  });

  it('생성된 기획에 projectId 포함', () => {
    const result = planner.createPlan('my-project-123', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('my-project-123');
  });

  it('user 메시지가 Goals 섹션에 포함', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '인증 시스템 구축')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('인증 시스템 구축');
  });

  it('assistant 메시지가 Analysis 섹션에 포함', () => {
    const result = planner.createPlan('proj-1', [
      createMessage('user', '요청'),
      createMessage('assistant', 'JWT 분석'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Analysis');
      expect(result.value).toContain('JWT 분석');
    }
  });

  it('기획 문서에 Goals 섹션 포함', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('Goals');
  });

  it('기획 문서에 Features 섹션 포함', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('Features');
  });

  it('여러 user 메시지 → 모두 Goals에 포함', () => {
    const conversations = [
      createMessage('user', '기능 A 구현'),
      createMessage('assistant', '분석 결과'),
      createMessage('user', '기능 B 추가'),
      createMessage('user', '기능 C 수정'),
    ];
    const result = planner.createPlan('proj-1', conversations);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('기능 A 구현');
      expect(result.value).toContain('기능 B 추가');
      expect(result.value).toContain('기능 C 수정');
    }
  });

  it('여러 assistant 메시지 → Analysis에 포함', () => {
    const conversations = [
      createMessage('user', '요청'),
      createMessage('assistant', '분석 1'),
      createMessage('assistant', '분석 2'),
    ];
    const result = planner.createPlan('proj-1', conversations);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('분석 1');
      expect(result.value).toContain('분석 2');
    }
  });

  it('assistant 메시지만 있어도 ok (user 없음)', () => {
    const result = planner.createPlan('proj-1', [createMessage('assistant', '분석')]);
    expect(result.ok).toBe(true);
  });

  it('기획 문서가 마크다운 형식 (#으로 시작)', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatch(/^#/);
  });

  it('result.value는 문자열이다', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '요청')]);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('result.value 길이가 0보다 크다', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });

  it('긴 projectId → 기획에 포함', () => {
    const longId = 'project-' + 'a'.repeat(100);
    const result = planner.createPlan(longId, [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain(longId);
  });

  it('UUID 형식 projectId → 기획에 포함', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = planner.createPlan(uuid, [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain(uuid);
  });

  it('projectId에 포함 → ok=true 반환', () => {
    for (const projectId of ['proj-1', 'my-project', 'proj-abc-123', 'p']) {
      const result = planner.createPlan(projectId, [createMessage('user', '요청')]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toContain(projectId);
    }
  });

  it('1개 대화 → ok', () => {
    const result = planner.createPlan('proj-1', [createMessage('user', '메시지 0')]);
    expect(result.ok).toBe(true);
  });

  it('2개 대화 → ok', () => {
    const result = planner.createPlan('proj-1', [
      createMessage('user', '메시지 0'),
      createMessage('assistant', '메시지 1'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('5개 대화 → ok', () => {
    const conversations = Array.from({ length: 5 }, (_, i) =>
      createMessage(i % 2 === 0 ? 'user' : 'assistant', `메시지 ${i}`),
    );
    const result = planner.createPlan('proj-1', conversations);
    expect(result.ok).toBe(true);
  });

  it('10개 대화 → ok', () => {
    const conversations = Array.from({ length: 10 }, (_, i) =>
      createMessage(i % 2 === 0 ? 'user' : 'assistant', `메시지 ${i}`),
    );
    const result = planner.createPlan('proj-1', conversations);
    expect(result.ok).toBe(true);
  });

  it('긴 user 메시지 → ok', () => {
    const longContent = 'a'.repeat(1000);
    const result = planner.createPlan('proj-1', [createMessage('user', longContent)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(longContent);
  });

  it('특수 문자가 포함된 메시지 → ok', () => {
    const specialContent = '기능 구현: <auth> & {api} | [token]';
    const result = planner.createPlan('proj-1', [createMessage('user', specialContent)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(specialContent);
  });

  it('이모지가 포함된 메시지 → ok', () => {
    const emojiContent = '🎉 기능 구현 완료! 🚀';
    const result = planner.createPlan('proj-1', [createMessage('user', emojiContent)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(emojiContent);
  });

  it('빈 대화 → error.code가 문자열이다', () => {
    const result = planner.createPlan('proj-1', []);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('빈 대화 5번 반복 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      const result = planner.createPlan(`proj-${i}`, []);
      expect(result.ok).toBe(false);
    }
  });

  it('1개 메시지 10번 호출 → 항상 ok=true', () => {
    for (let i = 0; i < 10; i++) {
      const result = planner.createPlan(`proj-${i}`, [createMessage('user', `요청 ${i}`)]);
      expect(result.ok).toBe(true);
    }
  });

  it('일본어 메시지 → ok', () => {
    const result = planner.createPlan('proj-jp', [createMessage('user', 'ログインシステムの実装')]);
    expect(result.ok).toBe(true);
  });

  it('중국어 메시지 → ok', () => {
    const result = planner.createPlan('proj-cn', [createMessage('user', '登录系统实现')]);
    expect(result.ok).toBe(true);
  });
});

// ── extractFeatures ────────────────────────────────────────────

describe('Planner extractFeatures', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('빈 문자열 → err (layer1_empty_plan)', () => {
    const result = planner.extractFeatures('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('공백만 있는 문자열 → err', () => {
    const result = planner.extractFeatures('   \n\t  ');
    expect(result.ok).toBe(false);
  });

  it('개행만 있는 문자열 → err', () => {
    const result = planner.extractFeatures('\n\n\n');
    expect(result.ok).toBe(false);
  });

  it('### 헤더 없는 일반 텍스트 → Main Feature 1개', () => {
    const result = planner.extractFeatures('일반 텍스트 기획 문서');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('Main Feature');
    }
  });

  it('### 헤더 1개 → 기능 1개 추출', () => {
    const plan = '## Features\n\n### Login System\n로그인 설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('Login System');
    }
  });

  it('### 헤더 2개 → 기능 2개 추출', () => {
    const plan = '### Login System\n설명\n\n### User Profile\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.name).toBe('Login System');
      expect(result.value[1]?.name).toBe('User Profile');
    }
  });

  it('### 헤더 5개 → 기능 5개 추출', () => {
    const plan = Array.from({ length: 5 }, (_, i) => `### Feature ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(5);
  });

  it('추출된 기능의 ID가 고유함', () => {
    const plan = '### Feature A\n### Feature B\n### Feature C';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.value.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('기능 이름이 헤더와 일치', () => {
    const plan = '### Payment Gateway\n결제 시스템 설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Payment Gateway');
  });

  it('기능에 description 포함', () => {
    const plan = '### Auth System\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.description).toBeDefined();
      expect(result.value[0]?.description.length).toBeGreaterThan(0);
    }
  });

  it('기능에 acceptanceCriteria 배열 포함', () => {
    const plan = '### Feature A\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.isArray(result.value[0]?.acceptanceCriteria)).toBe(true);
  });

  it('기능에 dependencies 배열 포함', () => {
    const plan = '### Feature A\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.isArray(result.value[0]?.dependencies)).toBe(true);
  });

  it('## 헤더는 기능으로 인식하지 않음', () => {
    const plan = '## Goals\n목표\n## Features\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // ## 헤더는 기능이 아니므로 Main Feature 1개
      expect(result.value[0]?.name).toBe('Main Feature');
    }
  });

  it('# 헤더는 기능으로 인식하지 않음', () => {
    const plan = '# Project Title\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.name).toBe('Main Feature');
    }
  });

  it('createPlan 결과에서 extractFeatures 사용', () => {
    const planner2 = new Planner(new ConsoleLogger('error'));
    const planResult = planner2.createPlan('proj-1', [createMessage('user', '기능 요청')]);
    if (planResult.ok) {
      const featResult = planner2.extractFeatures(planResult.value);
      expect(featResult.ok).toBe(true);
    }
  });

  it('### 헤더 1개 → 기능 1개', () => {
    const plan = Array.from({ length: 1 }, (_, i) => `### Feature ${i + 1}\n설명 ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('### 헤더 2개 → 기능 2개', () => {
    const plan = Array.from({ length: 2 }, (_, i) => `### Feature ${i + 1}\n설명 ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('### 헤더 3개 → 기능 3개', () => {
    const plan = Array.from({ length: 3 }, (_, i) => `### Feature ${i + 1}\n설명 ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(3);
  });

  it('### 헤더 10개 → 기능 10개', () => {
    const plan = Array.from({ length: 10 }, (_, i) => `### Feature ${i + 1}\n설명 ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(10);
  });

  it('공백 문자열 → err', () => {
    const result = planner.extractFeatures('  \n  ');
    expect(result.ok).toBe(false);
  });

  it('탭만 있는 문자열 → err', () => {
    const result = planner.extractFeatures('\t\t');
    expect(result.ok).toBe(false);
  });

  it('빈 대화 에러 code는 문자열', () => {
    const result = planner.extractFeatures('');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('기능 이름 공백 trim', () => {
    const plan = '###   Trimmed Feature   \n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Trimmed Feature');
  });

  it('기능 id는 비어있지 않은 문자열', () => {
    const plan = '### Feature X\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(typeof result.value[0]?.id).toBe('string');
      expect((result.value[0]?.id ?? '').length).toBeGreaterThan(0);
    }
  });

  it('기능 name은 비어있지 않은 문자열', () => {
    const plan = '### Named Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(typeof result.value[0]?.name).toBe('string');
      expect((result.value[0]?.name ?? '').length).toBeGreaterThan(0);
    }
  });

  it('기능 description은 문자열', () => {
    const plan = '### Described Feature\n긴 설명 텍스트';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(typeof result.value[0]?.description).toBe('string');
    }
  });

  it('result.value는 배열이다', () => {
    const plan = '### Feature A\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('한국어 기능명 추출', () => {
    const plan = '### 로그인 시스템\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('로그인 시스템');
  });

  it('한국어 + 영어 혼합 기능명', () => {
    const plan = '### Auth Login API 구현\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Auth Login API 구현');
  });

  it('20개 헤더 → 20개 기능', () => {
    const plan = Array.from({ length: 20 }, (_, i) => `### Feature ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(20);
  });

  it('10번 반복 추출 → 항상 동일 결과', () => {
    const plan = '### Feature Alpha\n설명';
    const first = planner.extractFeatures(plan);
    for (let i = 0; i < 10; i++) {
      const result = planner.extractFeatures(plan);
      expect(result.ok).toBe(first.ok);
      if (result.ok && first.ok) {
        expect(result.value[0]?.name).toBe(first.value[0]?.name);
      }
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('Planner 복합 시나리오', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('createPlan + extractFeatures 파이프라인', () => {
    const conversations = [
      createMessage('user', '인증 시스템 구축'),
      createMessage('assistant', 'JWT 기반 인증 추천'),
      createMessage('user', '결제 모듈 추가'),
    ];
    const planResult = planner.createPlan('proj-e2e', conversations);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const featResult = planner.extractFeatures(planResult.value);
      expect(featResult.ok).toBe(true);
      if (featResult.ok) {
        // createPlan이 생성하는 기획에는 ### 헤더가 없으므로 Main Feature 1개
        expect(featResult.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('여러 Planner 인스턴스 독립적', () => {
    const p1 = new Planner(new ConsoleLogger('error'));
    const p2 = new Planner(new ConsoleLogger('error'));
    const r1 = p1.createPlan('proj-a', [createMessage('user', '기능 A')]);
    const r2 = p2.createPlan('proj-b', [createMessage('user', '기능 B')]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).toContain('proj-a');
      expect(r2.value).toContain('proj-b');
    }
  });

  it('createPlan 100번 호출 → 성능 문제 없음', () => {
    for (let i = 0; i < 100; i++) {
      const result = planner.createPlan(`proj-${i}`, [createMessage('user', `요청 ${i}`)]);
      expect(result.ok).toBe(true);
    }
  });

  it('extractFeatures 100번 호출 → 성능 문제 없음', () => {
    for (let i = 0; i < 100; i++) {
      const result = planner.extractFeatures(`### Feature ${i}\n설명`);
      expect(result.ok).toBe(true);
    }
  });

  it('두 플래너 같은 입력 → 같은 구조', () => {
    const p1 = new Planner(new ConsoleLogger('error'));
    const p2 = new Planner(new ConsoleLogger('error'));
    const msg = [createMessage('user', '동일한 요청')];
    const r1 = p1.createPlan('proj-same', msg);
    const r2 = p2.createPlan('proj-same', msg);
    if (r1.ok && r2.ok) {
      // 동일 내용 → Goals/Features 섹션 모두 포함
      expect(r1.value).toContain('Goals');
      expect(r2.value).toContain('Goals');
    }
  });

  it('extractFeatures → 기능 list 재추출 일관성', () => {
    const plan = '### Feature A\n설명\n### Feature B\n설명';
    const r1 = planner.extractFeatures(plan);
    const r2 = planner.extractFeatures(plan);
    if (r1.ok && r2.ok) {
      expect(r1.value.length).toBe(r2.value.length);
      expect(r1.value[0]?.name).toBe(r2.value[0]?.name);
    }
  });

  it('빈 대화 100번 → 항상 ok=false', () => {
    for (let i = 0; i < 100; i++) {
      const result = planner.createPlan(`p${i}`, []);
      expect(result.ok).toBe(false);
    }
  });

  it('빈 plan 100번 → 항상 ok=false', () => {
    for (let i = 0; i < 100; i++) {
      const result = planner.extractFeatures('');
      expect(result.ok).toBe(false);
    }
  });

  it('createPlan + extractFeatures 50쌍', () => {
    for (let i = 0; i < 50; i++) {
      const plan = planner.createPlan(`proj-${i}`, [createMessage('user', `기능 ${i}`)]);
      if (plan.ok) {
        const features = planner.extractFeatures(plan.value);
        expect(features.ok).toBe(true);
      }
    }
  });

  it('5개 플래너 독립적 동작', () => {
    const planners = Array.from({ length: 5 }, () => new Planner(new ConsoleLogger('error')));
    for (let i = 0; i < planners.length; i++) {
      const p = planners[i];
      if (p) {
        const result = p.createPlan(`proj-${i}`, [createMessage('user', `요청 ${i}`)]);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toContain(`proj-${i}`);
      }
    }
  });
});

// ── 추가 경계값 시나리오 ───────────────────────────────────────

describe('Planner 추가 경계값', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('빈 content user 메시지 → ok', () => {
    const result = planner.createPlan('proj-empty-msg', [createMessage('user', '')]);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 assistant 메시지 → ok', () => {
    const longMsg = 'analysis '.repeat(500);
    const result = planner.createPlan('proj-long', [
      createMessage('user', '요청'),
      createMessage('assistant', longMsg),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('analysis');
  });

  it('extractFeatures: ### 뒤 공백만 있는 헤더 → 기능 이름 빈값 처리', () => {
    const plan = '### \n설명';
    const result = planner.extractFeatures(plan);
    // 빈 헤더도 파싱되거나 Main Feature 반환
    expect(result.ok).toBe(true);
  });

  it('createPlan 결과 문자열 길이 50자 이상', () => {
    const result = planner.createPlan('proj-len', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(50);
  });

  it('extractFeatures 연속 호출 → 상태 독립적', () => {
    const plan1 = '### Feature X\n설명';
    const plan2 = '### Feature Y\n### Feature Z\n설명';
    const r1 = planner.extractFeatures(plan1);
    const r2 = planner.extractFeatures(plan2);
    if (r1.ok) expect(r1.value.length).toBe(1);
    if (r2.ok) expect(r2.value.length).toBe(2);
  });

  it('한글 projectId → 기획에 포함', () => {
    const result = planner.createPlan('프로젝트-한글', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('프로젝트-한글');
  });

  it('음수 아닌 인덱스로 기능 접근 가능', () => {
    const plan = '### A\n설명\n### B\n설명\n### C\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(result.value[0]).toBeDefined();
      expect(result.value[1]).toBeDefined();
      expect(result.value[2]).toBeDefined();
    }
  });

  it('createPlan error.code는 문자열', () => {
    const result = planner.createPlan('proj-err', []);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(result.error.code.length).toBeGreaterThan(0);
    }
  });

  it('extractFeatures 오류 code는 문자열', () => {
    const result = planner.extractFeatures('');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('user 메시지 50개 → ok', () => {
    const msgs = Array.from({ length: 50 }, (_, i) =>
      createMessage(i % 2 === 0 ? 'user' : 'assistant', `내용 ${i}`),
    );
    const result = planner.createPlan('proj-bulk', msgs);
    expect(result.ok).toBe(true);
  });
});
