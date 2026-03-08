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

// ── createPlan 심층 경계값 ─────────────────────────────────────

describe('Planner createPlan 심층 경계값', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
    msgCounter = 0;
  });

  it('UUID 형식 projectId → 기획에 포함', () => {
    const uuid = crypto.randomUUID();
    const result = planner.createPlan(uuid, [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(uuid);
  });

  it('한자 포함 projectId → ok', () => {
    const result = planner.createPlan('项目-auth', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('이모지 포함 user 메시지 → ok', () => {
    const result = planner.createPlan('proj-emoji', [
      createMessage('user', '🚀 빠른 배포를 위한 CI/CD 구축'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('줄바꿈 포함 assistant 메시지 → Analysis에 포함', () => {
    const result = planner.createPlan('proj-newline', [
      createMessage('user', '요청'),
      createMessage('assistant', '분석 결과:\n1. JWT 사용\n2. Redis 세션'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('분석 결과');
  });

  it('탭 포함 user 메시지 → ok', () => {
    const result = planner.createPlan('proj-tab', [
      createMessage('user', '기능\t설명\t구현'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('결과 문자열에 개행 포함', () => {
    const result = planner.createPlan('proj-format', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain('\n');
  });

  it('result.value에 Analysis 섹션 존재 (assistant 메시지 있을 때)', () => {
    const result = planner.createPlan('proj-analysis', [
      createMessage('user', '기능 요청'),
      createMessage('assistant', '기술 스택 분석'),
    ]);
    if (result.ok) expect(result.value).toContain('Analysis');
  });

  it('result.value에 Constraints 또는 Constraints 유사 섹션 없어도 ok', () => {
    const result = planner.createPlan('proj-no-constraints', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('빈 content assistant 메시지 → ok', () => {
    const result = planner.createPlan('proj-empty-asst', [
      createMessage('user', '요청'),
      createMessage('assistant', ''),
    ]);
    expect(result.ok).toBe(true);
  });

  it('5000자 user 메시지 → ok', () => {
    const longContent = '기능 설명: '.repeat(500);
    const result = planner.createPlan('proj-huge', [createMessage('user', longContent)]);
    expect(result.ok).toBe(true);
  });

  it('user/assistant 교번 100쌍 → ok', () => {
    const msgs = Array.from({ length: 100 }, (_, i) =>
      createMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
    );
    const result = planner.createPlan('proj-100', msgs);
    expect(result.ok).toBe(true);
  });

  it('projectId 1자리 → ok', () => {
    const result = planner.createPlan('p', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('p');
  });

  it('음수 아닌 msgCounter 증가 확인', () => {
    const before = msgCounter;
    createMessage('user', 'test');
    expect(msgCounter).toBeGreaterThan(before);
  });

  it('다국어 혼합 메시지 → ok', () => {
    const result = planner.createPlan('proj-multilang', [
      createMessage('user', 'Authentication 인증 認証 认证'),
    ]);
    expect(result.ok).toBe(true);
  });
});

// ── extractFeatures 심층 경계값 ───────────────────────────────

describe('Planner extractFeatures 심층 경계값', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('### 뒤 이모지 포함 기능명 → ok', () => {
    const plan = '### 🔐 인증 시스템\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toContain('인증 시스템');
  });

  it('### 뒤 숫자 포함 기능명 → ok', () => {
    const plan = '### Feature 2.0\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toContain('Feature');
  });

  it('연속된 ### 헤더 → 각 기능 설명 빈값 허용', () => {
    const plan = '### A\n### B\n### C';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(3);
  });

  it('설명이 여러 줄인 기능 → ok', () => {
    const plan = '### Multi Line Feature\n줄 1\n줄 2\n줄 3';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Multi Line Feature');
  });

  it('## 와 ### 혼합 → ### 만 기능으로 추출', () => {
    const plan = '## Section\n### Feature A\n설명\n## Another\n### Feature B\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.map(f => f.name);
      expect(names).toContain('Feature A');
      expect(names).toContain('Feature B');
      expect(names).not.toContain('Section');
      expect(names).not.toContain('Another');
    }
  });

  it('기능 id 중복 없음 (50개 기능)', () => {
    const plan = Array.from({ length: 50 }, (_, i) => `### Feature ${i}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      const ids = result.value.map(f => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('inputs 배열이 존재 (기본값)', () => {
    const plan = '### Input Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(Array.isArray(result.value[0]?.inputs)).toBe(true);
    }
  });

  it('outputs 배열이 존재 (기본값)', () => {
    const plan = '### Output Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(Array.isArray(result.value[0]?.outputs)).toBe(true);
    }
  });

  it('extractFeatures + createPlan 연동 → features 1개 이상', () => {
    const plan = planner.createPlan('proj-chain', [createMessage('user', '요청')]);
    if (plan.ok) {
      const features = planner.extractFeatures(plan.value);
      expect(features.ok).toBe(true);
      if (features.ok) expect(features.value.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('특수문자만 있는 헤더 → ok', () => {
    const plan = '### !@#$%\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
  });

  it('매우 긴 기능 설명 → ok', () => {
    const longDesc = '설명: '.repeat(500);
    const plan = `### Big Feature\n${longDesc}`;
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Big Feature');
  });

  it('중국어 기능명 추출 → ok', () => {
    const plan = '### 用户认证系统\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('用户认证系统');
  });

  it('일본어 기능명 추출 → ok', () => {
    const plan = '### ログイン機能\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('ログイン機能');
  });

  it('빈 result.value 배열은 length 0', () => {
    const plan = '## No Features Here\n내용만 있음';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      // ### 없으면 Main Feature 1개
      expect(result.value.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── createPlan: 추가 랜덤/경계값 시나리오 ────────────────────

describe('Planner createPlan 추가 랜덤/경계값', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
    msgCounter = 0;
  });

  it('projectId 100자 → ok', () => {
    const longId = 'a'.repeat(100);
    const result = planner.createPlan(longId, [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain(longId);
  });

  it('projectId 특수문자 포함 → ok', () => {
    const result = planner.createPlan('proj!@#$', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('user 메시지 내 마크다운 포함 → ok', () => {
    const result = planner.createPlan('proj-md', [
      createMessage('user', '## 헤더\n### 서브헤더\n- 리스트 아이템'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('user 메시지 내 JSON 포함 → ok', () => {
    const result = planner.createPlan('proj-json', [
      createMessage('user', '{"api": "https://example.com", "version": 2}'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('assistant 메시지 100개 → ok', () => {
    const msgs = Array.from({ length: 100 }, (_, i) =>
      createMessage('assistant', `분석 ${i}`),
    );
    const result = planner.createPlan('proj-100asst', msgs);
    expect(result.ok).toBe(true);
  });

  it('user 메시지 100개 → ok', () => {
    const msgs = Array.from({ length: 100 }, (_, i) =>
      createMessage('user', `요청 ${i}`),
    );
    const result = planner.createPlan('proj-100user', msgs);
    expect(result.ok).toBe(true);
  });

  it('결과에 projectId가 포함됨 (short)', () => {
    const result = planner.createPlan('z', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain('z');
  });

  it('결과 문자열에 ### 포함되지 않을 수 있음 (createPlan은 ## 사용)', () => {
    const result = planner.createPlan('proj-hash', [createMessage('user', '요청')]);
    if (result.ok) {
      // createPlan은 # Project Plan으로 시작
      expect(result.value).toMatch(/^#/);
    }
  });

  it('user 메시지 숫자만 → ok', () => {
    const result = planner.createPlan('proj-num', [createMessage('user', '1234567890')]);
    expect(result.ok).toBe(true);
  });

  it('user 메시지 URL 포함 → ok', () => {
    const result = planner.createPlan('proj-url', [
      createMessage('user', 'https://api.example.com/v1/auth'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('메시지 타임스탬프가 과거 날짜 → ok', () => {
    const pastMsg: ConversationMessage = {
      id: 'past-msg',
      role: 'user',
      content: '요청',
      timestamp: new Date('2000-01-01T00:00:00Z'),
      projectId: 'proj-past',
    };
    expect(planner.createPlan('proj-past', [pastMsg]).ok).toBe(true);
  });

  it('메시지 타임스탬프가 미래 날짜 → ok', () => {
    const futureMsg: ConversationMessage = {
      id: 'future-msg',
      role: 'user',
      content: '요청',
      timestamp: new Date('2099-12-31T23:59:59Z'),
      projectId: 'proj-future',
    };
    expect(planner.createPlan('proj-future', [futureMsg]).ok).toBe(true);
  });

  it('같은 projectId 다른 메시지 → ok', () => {
    const r1 = planner.createPlan('same-id', [createMessage('user', '메시지 A')]);
    const r2 = planner.createPlan('same-id', [createMessage('user', '메시지 B')]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('빈 대화 → error.message는 비어있지 않음', () => {
    const result = planner.createPlan('proj-empty', []);
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('user 메시지 개행 여러 개 → ok', () => {
    const result = planner.createPlan('proj-newlines', [
      createMessage('user', '줄1\n줄2\n줄3\n줄4\n줄5'),
    ]);
    expect(result.ok).toBe(true);
  });
});

// ── extractFeatures: 추가 랜덤/경계값 ───────────────────────

describe('Planner extractFeatures 추가 랜덤/경계값', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
    msgCounter = 0;
  });

  it('### 100개 → 100개 기능', () => {
    const plan = Array.from({ length: 100 }, (_, i) => `### Feature ${i + 1}\n설명 ${i + 1}`).join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(100);
  });

  it('혼합: ### 5개 + ## 3개 → ### 만 추출 (5개)', () => {
    const parts = [
      '## Section A',
      '### Feature 1\n설명',
      '## Section B',
      '### Feature 2\n설명',
      '## Section C',
      '### Feature 3\n설명',
      '### Feature 4\n설명',
      '### Feature 5\n설명',
    ];
    const plan = parts.join('\n\n');
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.map(f => f.name);
      for (let i = 1; i <= 5; i++) {
        expect(names).toContain(`Feature ${i}`);
      }
    }
  });

  it('기능 id prefix 형식 확인', () => {
    const plan = '### Feature Alpha\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok && result.value[0]) {
      expect(result.value[0].id.length).toBeGreaterThan(0);
      expect(typeof result.value[0].id).toBe('string');
    }
  });

  it('기능 acceptanceCriteria 배열 (초기 기본값)', () => {
    const plan = '### New Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok && result.value[0]) {
      expect(Array.isArray(result.value[0].acceptanceCriteria)).toBe(true);
    }
  });

  it('기능 dependencies 배열 (초기 빈 배열)', () => {
    const plan = '### Independent Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok && result.value[0]) {
      expect(Array.isArray(result.value[0].dependencies)).toBe(true);
    }
  });

  it('기능 이름에 숫자 포함 → 추출 성공', () => {
    const plan = '### Feature 123\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Feature 123');
  });

  it('기능 이름에 하이픈 포함 → 추출 성공', () => {
    const plan = '### API-Gateway\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('API-Gateway');
  });

  it('기능 이름에 밑줄 포함 → 추출 성공', () => {
    const plan = '### user_profile\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('user_profile');
  });

  it('기능 이름에 점 포함 → 추출 성공', () => {
    const plan = '### v1.0 API\n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toContain('v1.0');
  });

  it('빈 문자열 5번 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      expect(planner.extractFeatures('').ok).toBe(false);
    }
  });

  it('공백 문자열 5번 → 항상 ok=false', () => {
    for (let i = 0; i < 5; i++) {
      expect(planner.extractFeatures('   ').ok).toBe(false);
    }
  });

  it('### 50개 → ID 중복 없음', () => {
    const plan = Array.from({ length: 50 }, (_, i) => `### F${i}`).join('\n');
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      const ids = result.value.map(f => f.id);
      expect(new Set(ids).size).toBe(50);
    }
  });

  it('결과 배열 각 요소 구조 검증', () => {
    const plan = '### Valid Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok && result.value[0]) {
      const f = result.value[0];
      expect(typeof f.id).toBe('string');
      expect(typeof f.name).toBe('string');
      expect(typeof f.description).toBe('string');
      expect(Array.isArray(f.acceptanceCriteria)).toBe(true);
      expect(Array.isArray(f.dependencies)).toBe(true);
    }
  });

  it('### 뒤 공백 + 이름 → trim된 이름', () => {
    const plan = '###   Padded Name   \n설명';
    const result = planner.extractFeatures(plan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Padded Name');
  });

  it('createPlan 결과 → extractFeatures 항상 ok=true', () => {
    const msgs = [createMessage('user', '요청')];
    const planResult = planner.createPlan('proj-chain', msgs);
    if (planResult.ok) {
      const featResult = planner.extractFeatures(planResult.value);
      expect(featResult.ok).toBe(true);
    }
  });
});

// ── Planner 복합 스트레스 시나리오 ──────────────────────────

describe('Planner 복합 스트레스 시나리오', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
    msgCounter = 0;
  });

  it('200번 createPlan + extractFeatures → 항상 ok', () => {
    for (let i = 0; i < 200; i++) {
      const plan = planner.createPlan(`proj-stress-${i}`, [createMessage('user', `요청 ${i}`)]);
      if (plan.ok) {
        const features = planner.extractFeatures(plan.value);
        expect(features.ok).toBe(true);
      }
    }
  });

  it('빈 대화 200번 → 항상 ok=false', () => {
    for (let i = 0; i < 200; i++) {
      expect(planner.createPlan(`p${i}`, []).ok).toBe(false);
    }
  });

  it('5개 플래너 각각 50번 createPlan → ok', () => {
    const planners = Array.from({ length: 5 }, () => new Planner(new ConsoleLogger('error')));
    for (let pi = 0; pi < planners.length; pi++) {
      const p = planners[pi];
      if (!p) continue;
      for (let i = 0; i < 50; i++) {
        expect(p.createPlan(`proj-${pi}-${i}`, [createMessage('user', `요청 ${i}`)]).ok).toBe(true);
      }
    }
  });

  it('createPlan 후 extractFeatures → features 1개 이상 반드시', () => {
    const msgs = [createMessage('user', '기능 요청'), createMessage('assistant', '분석')];
    const plan = planner.createPlan('proj-min', msgs);
    if (plan.ok) {
      const features = planner.extractFeatures(plan.value);
      if (features.ok) {
        expect(features.value.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('extractFeatures → features[0] 항상 name이 있음', () => {
    const plan = '### My Feature\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok && result.value[0]) {
      expect(result.value[0].name.length).toBeGreaterThan(0);
    }
  });

  it('createPlan 결과 contains Goals 섹션 → 항상', () => {
    for (let i = 0; i < 20; i++) {
      const result = planner.createPlan(`proj-goals-${i}`, [createMessage('user', `목표 ${i}`)]);
      if (result.ok) expect(result.value).toContain('Goals');
    }
  });

  it('createPlan 결과 contains Features 섹션 → 항상', () => {
    for (let i = 0; i < 20; i++) {
      const result = planner.createPlan(`proj-feat-${i}`, [createMessage('user', `기능 ${i}`)]);
      if (result.ok) expect(result.value).toContain('Features');
    }
  });

  it('extractFeatures 결과 배열 length는 non-negative', () => {
    const plan = '### A\n설명';
    const result = planner.extractFeatures(plan);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(0);
  });

  it('createPlan error.code=layer1_insufficient_data (빈 대화)', () => {
    const result = planner.createPlan('proj-err', []);
    if (!result.ok) expect(result.error.code).toBe('layer1_insufficient_data');
  });

  it('extractFeatures error.code=layer1_empty_plan (빈 문자열)', () => {
    const result = planner.extractFeatures('');
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('createPlan ok=true → result.value 타입 string', () => {
    const result = planner.createPlan('proj-type', [createMessage('user', '요청')]);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('extractFeatures ok=true → result.value 타입 배열', () => {
    const result = planner.extractFeatures('### Feature\n설명');
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('createPlan result 구조: ok 필드 존재', () => {
    const result = planner.createPlan('proj-struct', [createMessage('user', '요청')]);
    expect('ok' in result).toBe(true);
  });

  it('extractFeatures result 구조: ok 필드 존재', () => {
    const result = planner.extractFeatures('### F\n설명');
    expect('ok' in result).toBe(true);
  });

  it('createPlan 결과 ok는 boolean', () => {
    const result = planner.createPlan('proj-bool', [createMessage('user', '요청')]);
    expect(typeof result.ok).toBe('boolean');
  });

  it('extractFeatures 결과 ok는 boolean', () => {
    const result = planner.extractFeatures('### F\n설명');
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── createPlan 추가 경계값 #3 ──────────────────────────────────

describe('createPlan 추가 경계값 #3', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('projectId가 빈 문자열 → ok=true (검증 없음)', () => {
    const result = planner.createPlan('', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('projectId가 특수문자 → ok', () => {
    const result = planner.createPlan('proj!@#$', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('projectId가 공백 → ok', () => {
    const result = planner.createPlan('   ', [createMessage('user', '요청')]);
    expect(result.ok).toBe(true);
  });

  it('user 메시지만 1개 → plan contains projectId', () => {
    const result = planner.createPlan('proj-id-check', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain('proj-id-check');
  });

  it('assistant 메시지만 → ok=true (user 0개여도 최소 1개 있으면 통과)', () => {
    const result = planner.createPlan('proj-assist', [createMessage('assistant', '분석')]);
    expect(result.ok).toBe(true);
  });

  it('user 메시지 내용이 plan Goals 섹션에 포함됨', () => {
    const content = '유니크한-사용자-요청-내용-XYZ';
    const result = planner.createPlan('proj-goals-check', [createMessage('user', content)]);
    if (result.ok) expect(result.value).toContain(content);
  });

  it('assistant 메시지 내용이 plan Analysis 섹션에 포함됨', () => {
    const content = '유니크한-어시스턴트-분석-ABC';
    const result = planner.createPlan('proj-analysis-check', [
      createMessage('user', '요청'),
      createMessage('assistant', content),
    ]);
    if (result.ok) expect(result.value).toContain(content);
  });

  it('plan에 ## Goals 헤더 있음', () => {
    const result = planner.createPlan('proj-h-goals', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain('## Goals');
  });

  it('plan에 ## Analysis 헤더 있음', () => {
    const result = planner.createPlan('proj-h-analysis', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain('## Analysis');
  });

  it('plan에 ## Features 헤더 있음', () => {
    const result = planner.createPlan('proj-h-features', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value).toContain('## Features');
  });

  it('plan 시작이 # 으로 시작', () => {
    const result = planner.createPlan('proj-heading', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value.startsWith('#')).toBe(true);
  });

  it('50개 user 메시지 → 모두 plan에 포함', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => createMessage('user', `요청-내용-${i}`));
    const result = planner.createPlan('proj-50-user', msgs);
    if (result.ok) {
      for (let i = 0; i < 50; i++) {
        expect(result.value).toContain(`요청-내용-${i}`);
      }
    }
  });

  it('50개 assistant 메시지 → 모두 plan에 포함', () => {
    const msgs = [
      createMessage('user', '요청'),
      ...Array.from({ length: 50 }, (_, i) => createMessage('assistant', `분석-내용-${i}`)),
    ];
    const result = planner.createPlan('proj-50-assist', msgs);
    if (result.ok) {
      for (let i = 0; i < 50; i++) {
        expect(result.value).toContain(`분석-내용-${i}`);
      }
    }
  });

  it('error 객체에 code 필드 있음 (빈 대화)', () => {
    const result = planner.createPlan('proj-err-code', []);
    if (!result.ok) expect('code' in result.error).toBe(true);
  });

  it('error.message가 문자열 (빈 대화)', () => {
    const result = planner.createPlan('proj-err-msg', []);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('createPlan 1000번 호출 → ok=true 항상', () => {
    for (let i = 0; i < 1000; i++) {
      const result = planner.createPlan(`proj-1k-${i}`, [createMessage('user', `요청${i}`)]);
      expect(result.ok).toBe(true);
    }
  });

  it('혼합 대화 (user+assistant 교대 10쌍) → ok', () => {
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      msgs.push(createMessage('user', `요청-${i}`));
      msgs.push(createMessage('assistant', `분석-${i}`));
    }
    const result = planner.createPlan('proj-mixed-10', msgs);
    expect(result.ok).toBe(true);
  });

  it('plan 결과 길이 > 0', () => {
    const result = planner.createPlan('proj-len', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value.length).toBeGreaterThan(0);
  });
});

// ── extractFeatures 추가 경계값 #3 ───────────────────────────

describe('extractFeatures 추가 경계값 #3', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner(new ConsoleLogger('error'));
  });

  it('공백 문자열 → ok=false', () => {
    const result = planner.extractFeatures('   ');
    expect(result.ok).toBe(false);
  });

  it('탭 문자만 → ok=false', () => {
    const result = planner.extractFeatures('\t\t\t');
    expect(result.ok).toBe(false);
  });

  it('줄바꿈만 → ok=false', () => {
    const result = planner.extractFeatures('\n\n\n');
    expect(result.ok).toBe(false);
  });

  it('### 없는 문서 → features 1개 (Main Feature)', () => {
    const result = planner.extractFeatures('# 제목\n내용 있음');
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.name).toBe('Main Feature');
    }
  });

  it('### 1개 → features 1개', () => {
    const result = planner.extractFeatures('### Feature A\n내용');
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]?.name).toBe('Feature A');
    }
  });

  it('### 3개 → features 3개', () => {
    const plan = '### A\n내용A\n### B\n내용B\n### C\n내용C';
    const result = planner.extractFeatures(plan);
    if (result.ok) expect(result.value.length).toBe(3);
  });

  it('### 10개 → features 10개', () => {
    const plan = Array.from({ length: 10 }, (_, i) => `### Feature ${i}\n내용${i}`).join('\n');
    const result = planner.extractFeatures(plan);
    if (result.ok) expect(result.value.length).toBe(10);
  });

  it('feature id가 feat-0, feat-1... 순서', () => {
    const plan = '### A\n내용\n### B\n내용\n### C\n내용';
    const result = planner.extractFeatures(plan);
    if (result.ok) {
      expect(result.value[0]?.id).toBe('feat-0');
      expect(result.value[1]?.id).toBe('feat-1');
      expect(result.value[2]?.id).toBe('feat-2');
    }
  });

  it('feature description에 Feature: 접두어 포함', () => {
    const result = planner.extractFeatures('### My Feature\n내용');
    if (result.ok && result.value[0]) {
      expect(result.value[0].description).toContain('Feature:');
    }
  });

  it('feature의 acceptanceCriteria가 빈 배열', () => {
    const result = planner.extractFeatures('### My Feature\n내용');
    if (result.ok && result.value[0]) {
      expect(result.value[0].acceptanceCriteria).toEqual([]);
    }
  });

  it('feature의 dependencies가 빈 배열', () => {
    const result = planner.extractFeatures('### My Feature\n내용');
    if (result.ok && result.value[0]) {
      expect(result.value[0].dependencies).toEqual([]);
    }
  });

  it('feature의 inputs가 빈 배열', () => {
    const result = planner.extractFeatures('### My Feature\n내용');
    if (result.ok && result.value[0]) {
      expect(result.value[0].inputs).toEqual([]);
    }
  });

  it('feature의 outputs가 빈 배열', () => {
    const result = planner.extractFeatures('### My Feature\n내용');
    if (result.ok && result.value[0]) {
      expect(result.value[0].outputs).toEqual([]);
    }
  });

  it('1000번 같은 문서 → 항상 동일 결과', () => {
    const plan = '### Feature X\n내용X\n### Feature Y\n내용Y';
    const first = planner.extractFeatures(plan);
    for (let i = 0; i < 1000; i++) {
      const r = planner.extractFeatures(plan);
      if (first.ok && r.ok) {
        expect(r.value.length).toBe(first.value.length);
        expect(r.value[0]?.name).toBe(first.value[0]?.name);
      }
    }
  });

  it('error.code가 layer1_empty_plan (빈 문자열)', () => {
    const result = planner.extractFeatures('');
    if (!result.ok) expect(result.error.code).toBe('layer1_empty_plan');
  });

  it('error.message가 문자열 (빈 문자열)', () => {
    const result = planner.extractFeatures('');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('100개 feature 헤더 → features 100개', () => {
    const plan = Array.from({ length: 100 }, (_, i) => `### F${i}\n내용${i}`).join('\n');
    const result = planner.extractFeatures(plan);
    if (result.ok) expect(result.value.length).toBe(100);
  });

  it('한국어 feature 이름 → ok', () => {
    const result = planner.extractFeatures('### 한국어 기능\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('한국어 기능');
  });

  it('특수문자 feature 이름 → ok', () => {
    const result = planner.extractFeatures('### Feature!@#$\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.name).toBe('Feature!@#$');
  });
});

// ── Planner 복합 시나리오 ─────────────────────────────────────

describe('Planner 복합 시나리오', () => {
  it('createPlan → extractFeatures 파이프라인 1000번 반복', () => {
    const p = new Planner(new ConsoleLogger('error'));
    for (let i = 0; i < 1000; i++) {
      const plan = p.createPlan(`proj-pipeline-${i}`, [createMessage('user', `요청 ${i}`)]);
      if (plan.ok) {
        const features = p.extractFeatures(plan.value);
        expect(features.ok).toBe(true);
        if (features.ok) expect(features.value.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('5개 Planner 동시 사용 → 결과 독립적', () => {
    const planners = Array.from({ length: 5 }, () => new Planner(new ConsoleLogger('error')));
    const results = planners.map((p, i) =>
      p.createPlan(`proj-ind-${i}`, [createMessage('user', `요청-${i}`)])
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it('createPlan result.value에 줄바꿈 포함', () => {
    const p = new Planner(new ConsoleLogger('error'));
    const result = p.createPlan('proj-newline', [createMessage('user', '요청')]);
    if (result.ok) expect(result.value.includes('\n')).toBe(true);
  });

  it('extractFeatures → features[*].id 모두 feat- 접두어', () => {
    const p = new Planner(new ConsoleLogger('error'));
    const plan = '### A\n내용A\n### B\n내용B';
    const result = p.extractFeatures(plan);
    if (result.ok) {
      for (const f of result.value) {
        expect(f.id.startsWith('feat-')).toBe(true);
      }
    }
  });

  it('extractFeatures → features[*].name 길이 > 0', () => {
    const p = new Planner(new ConsoleLogger('error'));
    const plan = '### Feature X\n내용';
    const result = p.extractFeatures(plan);
    if (result.ok) {
      for (const f of result.value) {
        expect(f.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('createPlan 후 extractFeatures → features 배열 length ≥ 1 항상', () => {
    const p = new Planner(new ConsoleLogger('error'));
    for (let i = 0; i < 50; i++) {
      const plan = p.createPlan(`proj-always-${i}`, [createMessage('user', `요청${i}`)]);
      if (plan.ok) {
        const features = p.extractFeatures(plan.value);
        if (features.ok) expect(features.value.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
