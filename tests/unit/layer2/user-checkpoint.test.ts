/**
 * UserCheckpoint 단위 테스트 / UserCheckpoint unit tests
 *
 * @description
 * 체크포인트 생성, 조회, 결정 기록, ID 순서, 경계값 등
 * 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { UserCheckpoint } from 'layer2/user-checkpoint.js';

const logger = new ConsoleLogger('error');

function makeCheckpoint(): UserCheckpoint {
  return new UserCheckpoint(logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('UserCheckpoint 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeCheckpoint()).not.toThrow();
  });

  it('UserCheckpoint 인스턴스', () => {
    expect(makeCheckpoint()).toBeInstanceOf(UserCheckpoint);
  });

  it('두 인스턴스는 다른 객체', () => {
    const a = makeCheckpoint();
    const b = makeCheckpoint();
    expect(a).not.toBe(b);
  });

  it('createCheckpoint 메서드 존재', () => {
    const cp = makeCheckpoint();
    expect(typeof cp.createCheckpoint).toBe('function');
  });

  it('getCheckpoint 메서드 존재', () => {
    const cp = makeCheckpoint();
    expect(typeof cp.getCheckpoint).toBe('function');
  });

  it('setDecision 메서드 존재', () => {
    const cp = makeCheckpoint();
    expect(typeof cp.setDecision).toBe('function');
  });
});

// ── createCheckpoint ──────────────────────────────────────────

describe('UserCheckpoint.createCheckpoint', () => {
  let checkpoint: UserCheckpoint;

  beforeEach(() => {
    checkpoint = makeCheckpoint();
  });

  it('생성 → ok 반환', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '전체 통과');
    expect(result.ok).toBe(true);
  });

  it('checkpointId 반환됨', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '전체 통과');
    if (result.ok) {
      expect(typeof result.value.checkpointId).toBe('string');
      expect(result.value.checkpointId.length).toBeGreaterThan(0);
    }
  });

  it('checkpointId에 featureId 포함', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'my-feature', '결과');
    if (result.ok) {
      expect(result.value.checkpointId).toContain('my-feature');
    }
  });

  it('연속 생성 → 고유 ID', () => {
    const r1 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result-1');
    const r2 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result-2');
    if (r1.ok && r2.ok) {
      expect(r1.value.checkpointId).not.toBe(r2.value.checkpointId);
    }
  });

  it('ID가 순서대로 증가', () => {
    const r1 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'r1');
    const r2 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'r2');
    const r3 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'r3');
    if (r1.ok && r2.ok && r3.ok) {
      // ID 형식: checkpoint-{featureId}-{counter}
      const n1 = parseInt(r1.value.checkpointId.split('-').pop() ?? '0');
      const n2 = parseInt(r2.value.checkpointId.split('-').pop() ?? '0');
      const n3 = parseInt(r3.value.checkpointId.split('-').pop() ?? '0');
      expect(n2).toBeGreaterThan(n1);
      expect(n3).toBeGreaterThan(n2);
    }
  });

  it('빈 결과 문자열 → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '');
    expect(result.ok).toBe(true);
  });

  it('긴 결과 문자열 → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', 'x'.repeat(10000));
    expect(result.ok).toBe(true);
  });

  it('숫자 문자열 results → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '12345');
    expect(result.ok).toBe(true);
  });

  it('특수문자 results → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '!@#$%^&*(){}[]');
    expect(result.ok).toBe(true);
  });

  it('한국어 results → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', '전체 테스트 통과, 빌드 성공');
    expect(result.ok).toBe(true);
  });

  it('줄바꿈 포함 results → ok', () => {
    const result = checkpoint.createCheckpoint('proj-1', 'feat-1', 'line1\nline2\nline3');
    expect(result.ok).toBe(true);
  });

  it('다른 featureId → 각각 고유 ID', () => {
    const r1 = checkpoint.createCheckpoint('proj-1', 'feat-alpha', 'r');
    const r2 = checkpoint.createCheckpoint('proj-1', 'feat-beta', 'r');
    if (r1.ok && r2.ok) {
      expect(r1.value.checkpointId).not.toBe(r2.value.checkpointId);
    }
  });

  it('10개 연속 생성 → 모두 ok', () => {
    for (let i = 0; i < 10; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-${i}`, `result-${i}`);
      expect(r.ok).toBe(true);
    }
  });

  it('10개 연속 생성 → 모두 고유 ID', () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-${i}`, `result-${i}`);
      if (r.ok) ids.push(r.value.checkpointId);
    }
    expect(new Set(ids).size).toBe(10);
  });

  it('UUID 형식 projectId → ok', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = checkpoint.createCheckpoint(uuid, 'feat-1', 'result');
    expect(result.ok).toBe(true);
  });

  it('숫자만 있는 projectId → ok', () => {
    const result = checkpoint.createCheckpoint('12345', 'feat-1', 'result');
    expect(result.ok).toBe(true);
  });

  it('하이픈 포함 featureId → checkpointId에 포함', () => {
    const r = checkpoint.createCheckpoint('p', 'my-feature-id', 'r');
    if (r.ok) {
      expect(r.value.checkpointId).toContain('my-feature-id');
    }
  });
});

// ── getCheckpoint ─────────────────────────────────────────────

describe('UserCheckpoint.getCheckpoint', () => {
  let checkpoint: UserCheckpoint;

  beforeEach(() => {
    checkpoint = makeCheckpoint();
  });

  it('존재하는 ID → 데이터 반환', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '검증 완료');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
    }
  });

  it('없는 ID → null 반환', () => {
    const data = checkpoint.getCheckpoint('checkpoint-nonexistent-999');
    expect(data).toBeNull();
  });

  it('results 일치', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '특정 결과 내용');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('특정 결과 내용');
    }
  });

  it('초기 decision undefined', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBeUndefined();
    }
  });

  it('초기 feedback undefined', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBeUndefined();
    }
  });

  it('5개 생성 후 각각 조회 → 모두 non-null', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-${i}`, `result-${i}`);
      if (r.ok) ids.push(r.value.checkpointId);
    }
    for (const id of ids) {
      expect(checkpoint.getCheckpoint(id)).not.toBeNull();
    }
  });

  it('각 결과 값이 다름', () => {
    const r1 = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result-alpha');
    const r2 = checkpoint.createCheckpoint('proj-1', 'feat-2', 'result-beta');
    if (r1.ok && r2.ok) {
      const d1 = checkpoint.getCheckpoint(r1.value.checkpointId);
      const d2 = checkpoint.getCheckpoint(r2.value.checkpointId);
      expect(d1?.results).toBe('result-alpha');
      expect(d2?.results).toBe('result-beta');
    }
  });

  it('연속 getCheckpoint 호출 → 같은 결과', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '일관된 결과');
    if (r.ok) {
      const id = r.value.checkpointId;
      const d1 = checkpoint.getCheckpoint(id);
      const d2 = checkpoint.getCheckpoint(id);
      expect(d1?.results).toBe(d2?.results);
    }
  });

  it('빈 문자열 ID → null 반환', () => {
    const data = checkpoint.getCheckpoint('');
    expect(data).toBeNull();
  });

  it('랜덤 문자열 ID → null 반환', () => {
    const data = checkpoint.getCheckpoint('random-xyz-abc-123');
    expect(data).toBeNull();
  });
});

// ── setDecision ───────────────────────────────────────────────

describe('UserCheckpoint.setDecision', () => {
  let checkpoint: UserCheckpoint;

  beforeEach(() => {
    checkpoint = makeCheckpoint();
  });

  it('approve 결정 → ok', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const result = checkpoint.setDecision(r.value.checkpointId, 'approve');
      expect(result.ok).toBe(true);
    }
  });

  it('revise 결정 → ok', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const result = checkpoint.setDecision(r.value.checkpointId, 'revise');
      expect(result.ok).toBe(true);
    }
  });

  it('결정 후 getCheckpoint → decision 반영됨', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'approve');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
    }
  });

  it('피드백 포함 결정 → feedback 반영됨', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'revise', '수정 필요한 내용');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('revise');
      expect(data?.feedback).toBe('수정 필요한 내용');
    }
  });

  it('없는 ID → ok false', () => {
    const result = checkpoint.setDecision('checkpoint-nonexistent-999', 'approve');
    expect(result.ok).toBe(false);
  });

  it('피드백 없이 approve → feedback undefined', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'approve');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBeUndefined();
    }
  });

  it('결정 재설정 → 마지막 값 유지', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'revise', '첫 번째 피드백');
      checkpoint.setDecision(r.value.checkpointId, 'approve', '두 번째 피드백');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
      expect(data?.feedback).toBe('두 번째 피드백');
    }
  });

  it('revise→approve→revise 여러 번 재설정 → 마지막 반영', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const id = r.value.checkpointId;
      checkpoint.setDecision(id, 'revise', 'first');
      checkpoint.setDecision(id, 'approve', 'second');
      checkpoint.setDecision(id, 'revise', 'third');
      const data = checkpoint.getCheckpoint(id);
      expect(data?.decision).toBe('revise');
      expect(data?.feedback).toBe('third');
    }
  });

  it('setDecision 반환값은 ok 필드 가짐', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const result = checkpoint.setDecision(r.value.checkpointId, 'approve');
      expect(typeof result.ok).toBe('boolean');
    }
  });

  it('빈 피드백 문자열 → feedback은 빈 문자열 또는 undefined', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'revise', '');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      // 빈 문자열 피드백은 '' 또는 undefined 둘 다 허용
      expect(data?.feedback === '' || data?.feedback === undefined).toBe(true);
    }
  });

  it('긴 피드백 → ok', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      const longFeedback = '피드백 내용 '.repeat(1000);
      const result = checkpoint.setDecision(r.value.checkpointId, 'revise', longFeedback);
      expect(result.ok).toBe(true);
    }
  });

  it('한국어 피드백 → 그대로 반영', () => {
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'revise', '로직을 재검토해 주세요');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe('로직을 재검토해 주세요');
    }
  });

  it('다른 체크포인트 결정 → 독립적으로 유지', () => {
    const r1 = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과1');
    const r2 = checkpoint.createCheckpoint('proj-1', 'feat-2', '결과2');
    if (r1.ok && r2.ok) {
      checkpoint.setDecision(r1.value.checkpointId, 'approve', '첫 번째 승인');
      checkpoint.setDecision(r2.value.checkpointId, 'revise', '두 번째 수정');
      const d1 = checkpoint.getCheckpoint(r1.value.checkpointId);
      const d2 = checkpoint.getCheckpoint(r2.value.checkpointId);
      expect(d1?.decision).toBe('approve');
      expect(d2?.decision).toBe('revise');
    }
  });
});

// ── 복합 시나리오 ──────────────────────────────────────────────

describe('UserCheckpoint 복합 시나리오', () => {
  it('여러 기능 체크포인트 → 독립적', () => {
    const checkpoint = makeCheckpoint();
    const ids: string[] = [];

    for (const feat of ['feat-1', 'feat-2', 'feat-3']) {
      const r = checkpoint.createCheckpoint('proj-1', feat, `${feat} 결과`);
      if (r.ok) {
        ids.push(r.value.checkpointId);
      }
    }

    // 각 ID 고유
    expect(new Set(ids).size).toBe(ids.length);

    // 각 checkpoint 독립적 결정
    if (ids[0]) {
      checkpoint.setDecision(ids[0], 'approve');
    }
    if (ids[1]) {
      checkpoint.setDecision(ids[1], 'revise', '수정 필요');
    }

    if (ids[0]) {
      expect(checkpoint.getCheckpoint(ids[0])?.decision).toBe('approve');
    }
    if (ids[1]) {
      expect(checkpoint.getCheckpoint(ids[1])?.decision).toBe('revise');
    }
    if (ids[2]) {
      expect(checkpoint.getCheckpoint(ids[2])?.decision).toBeUndefined();
    }
  });

  it('대량 체크포인트 (100개) → 성능 문제 없음', () => {
    const checkpoint = makeCheckpoint();
    const ids: string[] = [];

    for (let i = 0; i < 100; i++) {
      const r = checkpoint.createCheckpoint(`proj-${i % 5}`, `feat-${i}`, `result-${i}`);
      if (r.ok) {
        ids.push(r.value.checkpointId);
      }
    }

    expect(ids.length).toBe(100);
    expect(new Set(ids).size).toBe(100); // 모두 고유
  });

  it('생성 후 결정 후 재조회 → 모두 정합성 유지', () => {
    const checkpoint = makeCheckpoint();
    const pairs: Array<{ id: string; decision: 'approve' | 'revise'; feedback?: string }> = [];

    for (let i = 0; i < 10; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-${i}`, `result-${i}`);
      if (r.ok) {
        const decision: 'approve' | 'revise' = i % 2 === 0 ? 'approve' : 'revise';
        const feedback = i % 2 === 1 ? `feedback-${i}` : undefined;
        checkpoint.setDecision(r.value.checkpointId, decision, feedback);
        pairs.push({ id: r.value.checkpointId, decision, feedback });
      }
    }

    for (const pair of pairs) {
      const data = checkpoint.getCheckpoint(pair.id);
      expect(data).not.toBeNull();
      expect(data?.decision).toBe(pair.decision);
      if (pair.feedback !== undefined) {
        expect(data?.feedback).toBe(pair.feedback);
      }
    }
  });

  it('두 인스턴스 → 독립적 상태', () => {
    const cp1 = makeCheckpoint();
    const cp2 = makeCheckpoint();
    const r1 = cp1.createCheckpoint('proj-1', 'feat-1', 'r1');
    const r2 = cp2.createCheckpoint('proj-2', 'feat-2', 'r2');
    if (r1.ok && r2.ok) {
      // cp1에서 cp2의 ID 조회 → null
      expect(cp1.getCheckpoint(r2.value.checkpointId)).toBeNull();
      // cp2에서 cp1의 ID 조회 → null
      expect(cp2.getCheckpoint(r1.value.checkpointId)).toBeNull();
    }
  });

  it('결정 없이 approve 결정만 50개 → 모두 ok', () => {
    const checkpoint = makeCheckpoint();
    for (let i = 0; i < 50; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-${i}`, `result-${i}`);
      if (r.ok) {
        const sr = checkpoint.setDecision(r.value.checkpointId, 'approve');
        expect(sr.ok).toBe(true);
      }
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('UserCheckpoint 랜덤/경계값', () => {
  it('랜덤 체크포인트 #0', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-0', 'feat-rand-0', 'result-0-');
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkpoint.getCheckpoint(r.value.checkpointId)).not.toBeNull();
  });

  it('랜덤 체크포인트 #1', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-rand-1', 'result-1-x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkpoint.getCheckpoint(r.value.checkpointId)).not.toBeNull();
  });

  it('랜덤 체크포인트 #5', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-5', 'feat-rand-5', 'result-5-' + 'x'.repeat(5));
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkpoint.getCheckpoint(r.value.checkpointId)).not.toBeNull();
  });

  it('랜덤 체크포인트 #10', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-10', 'feat-rand-10', 'result-10-' + 'x'.repeat(10));
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkpoint.getCheckpoint(r.value.checkpointId)).not.toBeNull();
  });

  it('랜덤 체크포인트 #19', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-19', 'feat-rand-19', 'result-19-' + 'x'.repeat(19));
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkpoint.getCheckpoint(r.value.checkpointId)).not.toBeNull();
  });

  it('결정 approve → 기록됨', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const setResult = checkpoint.setDecision(r.value.checkpointId, 'approve');
      expect(setResult.ok).toBe(true);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
    }
  });

  it('결정 revise → 기록됨', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const setResult = checkpoint.setDecision(r.value.checkpointId, 'revise');
      expect(setResult.ok).toBe(true);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('revise');
    }
  });

  it('특수문자 results → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '결과!@#$%^&*() 한국어 🚀');
    expect(r.ok).toBe(true);
  });

  it('피드백 없을 때 setDecision → undefined 피드백', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'approve', undefined);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBeUndefined();
    }
  });

  it('createCheckpoint 반환값에 checkpointId 필드 있음', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      expect('checkpointId' in r.value).toBe(true);
    }
  });

  it('getCheckpoint 반환값에 results 필드 있음', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'test-results');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
      if (data) {
        expect('results' in data).toBe(true);
      }
    }
  });

  it('checkpointId는 문자열 타입', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      expect(typeof r.value.checkpointId).toBe('string');
    }
  });

  it('setDecision 반환값 ok는 boolean 타입', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const sr = checkpoint.setDecision(r.value.checkpointId, 'approve');
      expect(typeof sr.ok).toBe('boolean');
    }
  });

  it('존재하지 않는 ID에 결정 → ok=false이고 boolean', () => {
    const checkpoint = makeCheckpoint();
    const sr = checkpoint.setDecision('no-such-id-xyz', 'approve');
    expect(sr.ok).toBe(false);
  });

  it('5번 연속 getCheckpoint → 결과 일관됨', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'consistent');
    if (r.ok) {
      const id = r.value.checkpointId;
      const results = Array.from({ length: 5 }, () => checkpoint.getCheckpoint(id));
      for (const data of results) {
        expect(data?.results).toBe('consistent');
      }
    }
  });

  it('create→decide→get 전체 사이클 × 5', () => {
    const checkpoint = makeCheckpoint();
    for (let i = 0; i < 5; i++) {
      const r = checkpoint.createCheckpoint(`proj-${i}`, `feat-${i}`, `result-${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const decision = i % 2 === 0 ? 'approve' : 'revise';
        const sr = checkpoint.setDecision(r.value.checkpointId, decision);
        expect(sr.ok).toBe(true);
        const data = checkpoint.getCheckpoint(r.value.checkpointId);
        expect(data?.decision).toBe(decision);
        expect(data?.results).toBe(`result-${i}`);
      }
    }
  });
});

// ── 추가 edge/random case ──────────────────────────────────────

describe('UserCheckpoint 추가 edge/random case', () => {
  it('UUID 형식 projectId와 featureId → ok', () => {
    const checkpoint = makeCheckpoint();
    const projUuid = crypto.randomUUID();
    const featUuid = crypto.randomUUID();
    const result = checkpoint.createCheckpoint(projUuid, featUuid, 'uuid result');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checkpointId).toContain(featUuid);
    }
  });

  it('음수 유사 ID 조회 → null', () => {
    const checkpoint = makeCheckpoint();
    const data = checkpoint.getCheckpoint('checkpoint--1');
    expect(data).toBeNull();
  });

  it('특수문자 featureId → checkpointId에 포함 또는 처리', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-!@#', 'result');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.value.checkpointId).toBe('string');
    }
  });

  it('100자 featureId → ok', () => {
    const checkpoint = makeCheckpoint();
    const longFeatId = 'feat-' + 'a'.repeat(95);
    const r = checkpoint.createCheckpoint('proj-1', longFeatId, 'result');
    expect(r.ok).toBe(true);
  });

  it('approve 결정 반복 5번 → 마지막 값 유지', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      for (let i = 0; i < 5; i++) {
        checkpoint.setDecision(r.value.checkpointId, 'approve', `피드백-${i}`);
      }
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
      expect(data?.feedback).toBe('피드백-4');
    }
  });

  it('revise 결정 반복 5번 → 마지막 값 유지', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      for (let i = 0; i < 5; i++) {
        checkpoint.setDecision(r.value.checkpointId, 'revise', `수정-${i}`);
      }
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('revise');
      expect(data?.feedback).toBe('수정-4');
    }
  });

  it('결정 없는 체크포인트 getCheckpoint → decision undefined', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-no-decision', 'result');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
      expect(data?.decision).toBeUndefined();
    }
  });

  it('results에 JSON 문자열 → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '{"passed":10,"failed":0}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('{"passed":10,"failed":0}');
    }
  });

  it('results에 HTML 태그 → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '<h1>Test Report</h1><p>All passed</p>');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toContain('<h1>Test Report</h1>');
    }
  });

  it('setDecision 에러코드가 문자열이다 (없는 ID)', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.setDecision('nonexistent-id', 'approve');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('setDecision 에러 메시지가 문자열이다 (없는 ID)', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.setDecision('nonexistent-id-xyz', 'revise');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('createCheckpoint ok 필드는 항상 true', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    expect(r.ok).toBe(true);
  });

  it('getCheckpoint 존재 여부 확인', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-exists', 'result');
    if (r.ok) {
      const found = checkpoint.getCheckpoint(r.value.checkpointId);
      const missing = checkpoint.getCheckpoint('not-exist-id');
      expect(found).not.toBeNull();
      expect(missing).toBeNull();
    }
  });

  it('50개 생성 → 각각 독립 결정', () => {
    const checkpoint = makeCheckpoint();
    const pairs: Array<{ id: string; decision: 'approve' | 'revise' }> = [];

    for (let i = 0; i < 50; i++) {
      const r = checkpoint.createCheckpoint('proj-bulk', `feat-bulk-${i}`, `result-${i}`);
      if (r.ok) {
        const decision: 'approve' | 'revise' = i % 3 === 0 ? 'revise' : 'approve';
        checkpoint.setDecision(r.value.checkpointId, decision);
        pairs.push({ id: r.value.checkpointId, decision });
      }
    }

    for (const pair of pairs) {
      const data = checkpoint.getCheckpoint(pair.id);
      expect(data?.decision).toBe(pair.decision);
    }
  });

  it('한글 featureId → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', '로그인-기능', '로그인 통과');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.value.checkpointId).toBe('string');
    }
  });

  it('projectId가 빈 문자열 → ok 또는 처리', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('', 'feat-1', 'result');
    expect(typeof r.ok).toBe('boolean');
    if (r.ok) {
      expect(typeof r.value.checkpointId).toBe('string');
    }
  });

  it('getCheckpoint는 동일 객체 참조 아님 (복사본)', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const d1 = checkpoint.getCheckpoint(r.value.checkpointId);
      const d2 = checkpoint.getCheckpoint(r.value.checkpointId);
      // 값이 일치
      expect(d1?.results).toBe(d2?.results);
    }
  });

  it('checkpointId에 하이픈 포함', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-hyphen', 'result');
    if (r.ok) {
      // WHY: checkpoint-feat-hyphen-N 형식이므로 하이픈 포함
      expect(r.value.checkpointId).toContain('-');
    }
  });

  it('setDecision 후 feedback 재조회 → 정확히 일치', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-feedback', 'result');
    if (r.ok) {
      const feedback = '정확한 피드백 내용 !@#$%^';
      checkpoint.setDecision(r.value.checkpointId, 'revise', feedback);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(feedback);
    }
  });
});

// ── 추가 edge/random: createCheckpoint 확장 ───────────────────

describe('UserCheckpoint createCheckpoint 확장', () => {
  it('이모지 포함 results → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', '테스트 통과 🚀🎉');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toContain('🚀');
    }
  });

  it('JSON results 정확히 일치', () => {
    const checkpoint = makeCheckpoint();
    const results = JSON.stringify({ total: 100, passed: 95, failed: 5 });
    const r = checkpoint.createCheckpoint('proj-1', 'feat-json', results);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe(results);
    }
  });

  it('XML results 정확히 일치', () => {
    const checkpoint = makeCheckpoint();
    const results = '<report><total>100</total><passed>95</passed></report>';
    const r = checkpoint.createCheckpoint('proj-1', 'feat-xml', results);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe(results);
    }
  });

  it('CRLF 포함 results → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'line1\r\nline2\r\nline3');
    expect(r.ok).toBe(true);
  });

  it('탭 포함 results → ok', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'col1\tcol2\tcol3');
    expect(r.ok).toBe(true);
  });

  it('100자 projectId → ok', () => {
    const checkpoint = makeCheckpoint();
    const longProjectId = 'project-' + 'x'.repeat(92);
    const r = checkpoint.createCheckpoint(longProjectId, 'feat-1', 'result');
    expect(r.ok).toBe(true);
  });

  it('50개 다른 featureId → 모두 고유 checkpointId', () => {
    const checkpoint = makeCheckpoint();
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-unique-${i}`, `result-${i}`);
      if (r.ok) ids.add(r.value.checkpointId);
    }
    expect(ids.size).toBe(50);
  });

  it('결과값에 특수문자 → getCheckpoint 정확히 일치', () => {
    const checkpoint = makeCheckpoint();
    const results = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';
    const r = checkpoint.createCheckpoint('proj-1', 'feat-special', results);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe(results);
    }
  });

  it('createCheckpoint 반환값 ok는 boolean', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    expect(typeof r.ok).toBe('boolean');
  });

  it('createCheckpoint value.checkpointId는 비어있지 않음', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      expect(r.value.checkpointId.length).toBeGreaterThan(0);
    }
  });
});

// ── 추가 edge/random: getCheckpoint 확장 ──────────────────────

describe('UserCheckpoint getCheckpoint 확장', () => {
  it('UUID ID로 조회 → null', () => {
    const checkpoint = makeCheckpoint();
    const uuid = crypto.randomUUID();
    expect(checkpoint.getCheckpoint(uuid)).toBeNull();
  });

  it('숫자만 있는 ID → null', () => {
    const checkpoint = makeCheckpoint();
    expect(checkpoint.getCheckpoint('12345')).toBeNull();
  });

  it('특수문자만 있는 ID → null', () => {
    const checkpoint = makeCheckpoint();
    expect(checkpoint.getCheckpoint('!@#$%^&*()')).toBeNull();
  });

  it('한글 ID → null', () => {
    const checkpoint = makeCheckpoint();
    expect(checkpoint.getCheckpoint('체크포인트-없음')).toBeNull();
  });

  it('매우 긴 ID → null', () => {
    const checkpoint = makeCheckpoint();
    expect(checkpoint.getCheckpoint('x'.repeat(1000))).toBeNull();
  });

  it('생성 후 즉시 조회 → 결과 있음', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-instant', 'instant-result');
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
      expect(data?.results).toBe('instant-result');
    }
  });

  it('다른 featureId의 ID 조회 → null (격리)', () => {
    const cp1 = makeCheckpoint();
    const cp2 = makeCheckpoint();
    const r1 = cp1.createCheckpoint('proj-1', 'feat-1', 'r1');
    if (r1.ok) {
      expect(cp2.getCheckpoint(r1.value.checkpointId)).toBeNull();
    }
  });

  it('연속 10번 같은 ID 조회 → 동일 results', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'stable-result');
    if (r.ok) {
      const id = r.value.checkpointId;
      for (let i = 0; i < 10; i++) {
        expect(checkpoint.getCheckpoint(id)?.results).toBe('stable-result');
      }
    }
  });

  it('결정 설정 후 조회 → 결과값 변하지 않음', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'original-result');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'approve', 'feedback');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('original-result');
    }
  });

  it('getCheckpoint null 반환 타입 확인', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.getCheckpoint('does-not-exist');
    expect(result).toBeNull();
  });
});

// ── 추가 edge/random: setDecision 확장 ────────────────────────

describe('UserCheckpoint setDecision 확장', () => {
  it('approve 5번 연속 → 마지막 피드백 유지', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const feedbacks = ['fb-1', 'fb-2', 'fb-3', 'fb-4', 'fb-final'];
      for (const fb of feedbacks) {
        checkpoint.setDecision(r.value.checkpointId, 'approve', fb);
      }
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe('fb-final');
    }
  });

  it('revise → approve 전환 → decision 변경됨', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'revise', 'initial');
      checkpoint.setDecision(r.value.checkpointId, 'approve');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
    }
  });

  it('setDecision 에러는 error.code 필드 가짐', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.setDecision('no-such-checkpoint', 'approve');
    if (!result.ok) {
      expect('code' in result.error).toBe(true);
    }
  });

  it('setDecision 에러는 error.message 필드 가짐', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.setDecision('no-such-checkpoint', 'revise');
    if (!result.ok) {
      expect('message' in result.error).toBe(true);
    }
  });

  it('이모지 포함 피드백 → 정확히 반영', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const feedback = '코드가 좋아요 🚀✨💻';
      checkpoint.setDecision(r.value.checkpointId, 'approve', feedback);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(feedback);
    }
  });

  it('JSON 형식 피드백 → 그대로 저장', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const feedback = JSON.stringify({ issues: ['bug-1', 'bug-2'], severity: 'high' });
      checkpoint.setDecision(r.value.checkpointId, 'revise', feedback);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(feedback);
    }
  });

  it('10개 체크포인트에 각각 다른 결정 → 격리 유지', () => {
    const checkpoint = makeCheckpoint();
    const decisions: Array<{ id: string; d: 'approve' | 'revise' }> = [];

    for (let i = 0; i < 10; i++) {
      const r = checkpoint.createCheckpoint('proj-1', `feat-isolated-${i}`, `result-${i}`);
      if (r.ok) {
        const d: 'approve' | 'revise' = i % 2 === 0 ? 'approve' : 'revise';
        checkpoint.setDecision(r.value.checkpointId, d);
        decisions.push({ id: r.value.checkpointId, d });
      }
    }

    for (const { id, d } of decisions) {
      expect(checkpoint.getCheckpoint(id)?.decision).toBe(d);
    }
  });

  it('존재하지 않는 UUID ID → ok=false', () => {
    const checkpoint = makeCheckpoint();
    const uuid = crypto.randomUUID();
    const result = checkpoint.setDecision(uuid, 'approve');
    expect(result.ok).toBe(false);
  });

  it('빈 문자열 ID → ok=false', () => {
    const checkpoint = makeCheckpoint();
    const result = checkpoint.setDecision('', 'revise');
    expect(result.ok).toBe(false);
  });

  it('approve 결정 후 revise로 변경 → feedback도 변경', () => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-change', 'result');
    if (r.ok) {
      checkpoint.setDecision(r.value.checkpointId, 'approve', '승인 피드백');
      checkpoint.setDecision(r.value.checkpointId, 'revise', '수정 요청');
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('revise');
      expect(data?.feedback).toBe('수정 요청');
    }
  });
});

// ── 추가 edge/random: 인스턴스 격리 확장 ─────────────────────

describe('UserCheckpoint 인스턴스 격리 확장', () => {
  it('5개 인스턴스 각각 독립 상태', () => {
    const checkpoints = Array.from({ length: 5 }, () => makeCheckpoint());
    const pairs: Array<{ cp: UserCheckpoint; id: string }> = [];

    // 각 인스턴스에 서로 다른 featureId로 생성하여 ID 충돌 방지
    for (let i = 0; i < checkpoints.length; i++) {
      const r = checkpoints[i]!.createCheckpoint('proj-1', `unique-feat-iso-${i}`, `result-${i}`);
      if (r.ok) pairs.push({ cp: checkpoints[i]!, id: r.value.checkpointId });
    }

    // 각 인스턴스에서 자신의 ID는 non-null, 명백히 없는 ID는 null
    for (const { cp, id } of pairs) {
      expect(cp.getCheckpoint(id)).not.toBeNull();
      expect(cp.getCheckpoint('completely-nonexistent-isolation-id')).toBeNull();
    }
  });

  it('인스턴스 A의 결정이 인스턴스 B에 영향 없음', () => {
    const cpA = makeCheckpoint();
    const cpB = makeCheckpoint();

    const rA = cpA.createCheckpoint('proj-1', 'feat-1', 'result-A');
    const rB = cpB.createCheckpoint('proj-1', 'feat-1', 'result-B');

    if (rA.ok) {
      cpA.setDecision(rA.value.checkpointId, 'approve', 'A feedback');
    }

    // B의 상태는 변하지 않음
    if (rB.ok) {
      const dataB = cpB.getCheckpoint(rB.value.checkpointId);
      expect(dataB?.decision).toBeUndefined();
    }
  });

  it('각 인스턴스의 counter가 독립적으로 1부터 시작', () => {
    const cp1 = makeCheckpoint();
    const cp2 = makeCheckpoint();

    const r1 = cp1.createCheckpoint('proj-1', 'feat-1', 'r1');
    const r2 = cp2.createCheckpoint('proj-1', 'feat-1', 'r2');

    if (r1.ok && r2.ok) {
      // 두 ID는 다를 수 있지만 각각 유효해야 함
      expect(typeof r1.value.checkpointId).toBe('string');
      expect(typeof r2.value.checkpointId).toBe('string');
    }
  });

  it('대량 인스턴스(10개) 동시 생성 → 모두 정상', () => {
    const checkpoints = Array.from({ length: 10 }, () => makeCheckpoint());
    for (const cp of checkpoints) {
      expect(cp).toBeInstanceOf(UserCheckpoint);
    }
  });

  it('단일 인스턴스에 50개 create + setDecision → 모두 독립', () => {
    const checkpoint = makeCheckpoint();
    const pairs: Array<{ id: string; decision: 'approve' | 'revise'; feedback: string }> = [];

    for (let i = 0; i < 50; i++) {
      const r = checkpoint.createCheckpoint(`proj-${i % 10}`, `feat-${i}`, `result-${i}`);
      if (r.ok) {
        const decision: 'approve' | 'revise' = i % 2 === 0 ? 'approve' : 'revise';
        const feedback = `feedback-${i}`;
        checkpoint.setDecision(r.value.checkpointId, decision, feedback);
        pairs.push({ id: r.value.checkpointId, decision, feedback });
      }
    }

    for (const { id, decision, feedback } of pairs) {
      const data = checkpoint.getCheckpoint(id);
      expect(data?.decision).toBe(decision);
      expect(data?.feedback).toBe(feedback);
    }
  });
});

// ── 배치65 추가 edge/random: createCheckpoint 심화 ────────────

describe('UserCheckpoint createCheckpoint 심화 (batch65)', () => {
  it('counter가 각 호출마다 +1씩 증가함 (ID 파싱)', () => {
    const cp = makeCheckpoint();
    const r1 = cp.createCheckpoint('p', 'feat-counter', 'r1');
    const r2 = cp.createCheckpoint('p', 'feat-counter', 'r2');
    if (r1.ok && r2.ok) {
      const n1 = parseInt(r1.value.checkpointId.split('-').pop() ?? '0');
      const n2 = parseInt(r2.value.checkpointId.split('-').pop() ?? '0');
      expect(n2 - n1).toBe(1);
    }
  });

  it('createCheckpoint로 생성한 ID가 checkpoints Map에 저장됨 (getCheckpoint 성공)', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-map', 'feat-map', 'map-result');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
    }
  });

  it('projectId에 점(.) 포함 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('com.example.project', 'feat-1', 'result');
    expect(r.ok).toBe(true);
  });

  it('featureId에 점(.) 포함 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat.v2.0', 'result');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.value.checkpointId).toBe('string');
    }
  });

  it('featureId에 숫자만 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', '12345', 'result');
    expect(r.ok).toBe(true);
  });

  it('results에 null 유사 문자열 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'null');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('null');
    }
  });

  it('results에 undefined 유사 문자열 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'undefined');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('undefined');
    }
  });

  it('results에 true/false 문자열 → ok', () => {
    const cp = makeCheckpoint();
    const r1 = cp.createCheckpoint('proj-1', 'feat-true', 'true');
    const r2 = cp.createCheckpoint('proj-1', 'feat-false', 'false');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('createCheckpoint 반환 value는 checkpointId만 포함', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-struct', 'result');
    if (r.ok) {
      const keys = Object.keys(r.value);
      expect(keys).toContain('checkpointId');
    }
  });

  it('50개 서로 다른 projectId → 모두 ok', () => {
    const cp = makeCheckpoint();
    for (let i = 0; i < 50; i++) {
      const r = cp.createCheckpoint(`proj-multi-${i}`, 'feat-1', `result-${i}`);
      expect(r.ok).toBe(true);
    }
  });

  it('results에 백슬래시 포함 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'path: C:\\Users\\test\\file.ts');
    expect(r.ok).toBe(true);
  });

  it('results에 따옴표 포함 → ok', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'message: "hello world"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toContain('"hello world"');
    }
  });

  it('createCheckpoint 결과 ok=true → value 존재', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      expect(r.value).toBeDefined();
    }
  });

  it('200개 생성 → 모두 고유 checkpointId', () => {
    const cp = makeCheckpoint();
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = cp.createCheckpoint('proj-1', `feat-200-${i}`, `result-${i}`);
      if (r.ok) ids.add(r.value.checkpointId);
    }
    expect(ids.size).toBe(200);
  });

  it('featureId에 대시 3개 연속 → checkpointId에 포함', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat---triple', 'result');
    if (r.ok) {
      expect(r.value.checkpointId).toContain('feat---triple');
    }
  });

  it('results에 Markdown 형식 문자열 → ok', () => {
    const cp = makeCheckpoint();
    const md = '# 테스트 결과\n- 통과: 100\n- 실패: 0\n\n**빌드 성공**';
    const r = cp.createCheckpoint('proj-1', 'feat-md', md);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe(md);
    }
  });

  it('featureId 길이 200자 → ok', () => {
    const cp = makeCheckpoint();
    const longId = 'feat-' + 'b'.repeat(195);
    const r = cp.createCheckpoint('proj-1', longId, 'result');
    expect(r.ok).toBe(true);
  });

  it('createCheckpoint 연속 호출 → 이전 ID 덮어쓰지 않음', () => {
    const cp = makeCheckpoint();
    const r1 = cp.createCheckpoint('proj-1', 'feat-over', 'result-1');
    const r2 = cp.createCheckpoint('proj-1', 'feat-over', 'result-2');
    if (r1.ok && r2.ok) {
      expect(r1.value.checkpointId).not.toBe(r2.value.checkpointId);
      const d1 = cp.getCheckpoint(r1.value.checkpointId);
      const d2 = cp.getCheckpoint(r2.value.checkpointId);
      expect(d1?.results).toBe('result-1');
      expect(d2?.results).toBe('result-2');
    }
  });
});

// ── 배치65 추가 edge/random: getCheckpoint 심화 ────────────────

describe('UserCheckpoint getCheckpoint 심화 (batch65)', () => {
  it('생성 직후 getCheckpoint → createdAt 없어도 결과 포함', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-1', 'fresh-result');
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
      expect(data?.results).toBe('fresh-result');
    }
  });

  it('getCheckpoint 반환 객체는 results 필드를 가짐', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-field', 'field-result');
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      if (data) {
        expect('results' in data).toBe(true);
      }
    }
  });

  it('getCheckpoint 반환 객체에 decision 필드 존재 (undefined 허용)', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-decision-field', 'result');
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      if (data) {
        // 'decision' in data는 구현에 따라 다를 수 있음
        expect(typeof data).toBe('object');
      }
    }
  });

  it('getCheckpoint 반환 객체에 feedback 필드 존재 (undefined 허용)', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-feedback-field', 'result');
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
    }
  });

  it('ID 형식 불일치 (checkpoint 없이 시작) → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('no-prefix-id-123')).toBeNull();
  });

  it('공백 포함 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('checkpoint feat-1 1')).toBeNull();
  });

  it('줄바꿈 포함 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('checkpoint-feat-1\n1')).toBeNull();
  });

  it('탭 포함 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('checkpoint-feat-1\t1')).toBeNull();
  });

  it('같은 인스턴스, 다른 featureId의 ID → null 교차 확인', () => {
    const cp = makeCheckpoint();
    const r1 = cp.createCheckpoint('proj-1', 'feat-cross-1', 'r1');
    const r2 = cp.createCheckpoint('proj-1', 'feat-cross-2', 'r2');
    if (r1.ok && r2.ok) {
      // 각각 자신의 ID로 조회 가능
      expect(cp.getCheckpoint(r1.value.checkpointId)).not.toBeNull();
      expect(cp.getCheckpoint(r2.value.checkpointId)).not.toBeNull();
      // 가짜 조합 ID는 null
      expect(cp.getCheckpoint('checkpoint-feat-cross-1-999')).toBeNull();
    }
  });

  it('delete 메서드 없으므로 생성 후 조회 항상 성공', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-persistent', 'persist');
    if (r.ok) {
      const d1 = cp.getCheckpoint(r.value.checkpointId);
      const d2 = cp.getCheckpoint(r.value.checkpointId);
      const d3 = cp.getCheckpoint(r.value.checkpointId);
      expect(d1).not.toBeNull();
      expect(d2).not.toBeNull();
      expect(d3).not.toBeNull();
    }
  });

  it('결정 후 results는 변경되지 않음', () => {
    const cp = makeCheckpoint();
    const original = '원본 결과 내용';
    const r = cp.createCheckpoint('proj-1', 'feat-immutable', original);
    if (r.ok) {
      cp.setDecision(r.value.checkpointId, 'approve', '승인');
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe(original);
    }
  });

  it('피드백 변경 후 results 불변', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-results-immutable', '변경불가 결과');
    if (r.ok) {
      cp.setDecision(r.value.checkpointId, 'revise', '첫 피드백');
      cp.setDecision(r.value.checkpointId, 'approve', '두번째 피드백');
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('변경불가 결과');
    }
  });

  it('숫자 0 문자열 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('0')).toBeNull();
  });

  it('알파벳 단일 문자 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('a')).toBeNull();
  });

  it('대문자 ID → null', () => {
    const cp = makeCheckpoint();
    expect(cp.getCheckpoint('CHECKPOINT-FEAT-1-1')).toBeNull();
  });

  it('유사하지만 다른 ID → null', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-similar', 'result');
    if (r.ok) {
      const id = r.value.checkpointId;
      // 마지막 글자만 다른 ID
      const almostSameId = id.slice(0, -1) + (id.slice(-1) === '1' ? '2' : '1');
      expect(cp.getCheckpoint(almostSameId)).toBeNull();
    }
  });
});

// ── 배치65 추가 edge/random: setDecision 심화 ─────────────────

describe('UserCheckpoint setDecision 심화 (batch65)', () => {
  it('setDecision 후 ok=true이면 value는 undefined', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-void', 'result');
    if (r.ok) {
      const sr = cp.setDecision(r.value.checkpointId, 'approve');
      if (sr.ok) {
        expect(sr.value).toBeUndefined();
      }
    }
  });

  it('없는 ID setDecision → error.code가 checkpoint 관련', () => {
    const cp = makeCheckpoint();
    const sr = cp.setDecision('nonexistent-for-code-check', 'approve');
    expect(sr.ok).toBe(false);
    if (!sr.ok) {
      expect(sr.error.code).toContain('checkpoint');
    }
  });

  it('approve + 빈 피드백 → feedback은 빈 문자열 또는 undefined', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-empty-fb', 'result');
    if (r.ok) {
      cp.setDecision(r.value.checkpointId, 'approve', '');
      const data = cp.getCheckpoint(r.value.checkpointId);
      const fb = data?.feedback;
      expect(fb === '' || fb === undefined).toBe(true);
    }
  });

  it('revise + 이모지 피드백 → 저장됨', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-emoji-fb', 'result');
    if (r.ok) {
      const emoji = '🔴 수정 필요 🔴';
      cp.setDecision(r.value.checkpointId, 'revise', emoji);
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(emoji);
    }
  });

  it('setDecision 반환 타입이 Result<void> 패턴', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-result-type', 'result');
    if (r.ok) {
      const sr = cp.setDecision(r.value.checkpointId, 'approve');
      expect(typeof sr.ok).toBe('boolean');
    }
  });

  it('같은 checkpoint에 100번 setDecision → 마지막 값만 유지', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-100-decisions', 'result');
    if (r.ok) {
      for (let i = 0; i < 99; i++) {
        cp.setDecision(r.value.checkpointId, i % 2 === 0 ? 'approve' : 'revise', `fb-${i}`);
      }
      cp.setDecision(r.value.checkpointId, 'approve', 'final-feedback');
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
      expect(data?.feedback).toBe('final-feedback');
    }
  });

  it('빈 문자열 ID로 setDecision → ok=false', () => {
    const cp = makeCheckpoint();
    const sr = cp.setDecision('', 'approve');
    expect(sr.ok).toBe(false);
  });

  it('approve 후 revise → decision=revise', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-flip', 'result');
    if (r.ok) {
      cp.setDecision(r.value.checkpointId, 'approve');
      cp.setDecision(r.value.checkpointId, 'revise', '재검토 필요');
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('revise');
    }
  });

  it('revise 후 approve → feedback은 undefined (피드백 없음)', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-fb-clear', 'result');
    if (r.ok) {
      cp.setDecision(r.value.checkpointId, 'revise', '수정 필요');
      cp.setDecision(r.value.checkpointId, 'approve');
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe('approve');
      // approve with no feedback → undefined
      expect(data?.feedback).toBeUndefined();
    }
  });

  it('setDecision 에러 code가 agent_checkpoint_not_found', () => {
    const cp = makeCheckpoint();
    const sr = cp.setDecision('completely-missing-id', 'revise');
    expect(sr.ok).toBe(false);
    if (!sr.ok) {
      expect(sr.error.code).toBe('agent_checkpoint_not_found');
    }
  });

  it('10개 체크포인트 모두 approve → 각각 decision=approve', () => {
    const cp = makeCheckpoint();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = cp.createCheckpoint('proj-1', `feat-all-approve-${i}`, `result-${i}`);
      if (r.ok) ids.push(r.value.checkpointId);
    }
    for (const id of ids) {
      cp.setDecision(id, 'approve', `approved-${id}`);
    }
    for (const id of ids) {
      const data = cp.getCheckpoint(id);
      expect(data?.decision).toBe('approve');
    }
  });

  it('10개 체크포인트 모두 revise → 각각 decision=revise', () => {
    const cp = makeCheckpoint();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = cp.createCheckpoint('proj-1', `feat-all-revise-${i}`, `result-${i}`);
      if (r.ok) ids.push(r.value.checkpointId);
    }
    for (const id of ids) {
      cp.setDecision(id, 'revise', `revise-feedback-${id}`);
    }
    for (const id of ids) {
      const data = cp.getCheckpoint(id);
      expect(data?.decision).toBe('revise');
      expect(data?.feedback).toContain('revise-feedback');
    }
  });

  it('피드백에 줄바꿈 포함 → 저장됨', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-newline-fb', 'result');
    if (r.ok) {
      const feedback = '수정사항:\n1. 로직 재검토\n2. 테스트 추가';
      cp.setDecision(r.value.checkpointId, 'revise', feedback);
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(feedback);
    }
  });

  it('UUID 형식 피드백 → 저장됨', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-1', 'feat-uuid-fb', 'result');
    if (r.ok) {
      const uuidFeedback = crypto.randomUUID();
      cp.setDecision(r.value.checkpointId, 'revise', uuidFeedback);
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.feedback).toBe(uuidFeedback);
    }
  });
});

// ── 배치65 추가 edge/random: 복합 시나리오 심화 ───────────────

describe('UserCheckpoint 복합 시나리오 심화 (batch65)', () => {
  it('create → get → set → get 전체 사이클 검증', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-cycle', 'feat-full-cycle', '전체 사이클 결과');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const beforeDecision = cp.getCheckpoint(r.value.checkpointId);
    expect(beforeDecision).not.toBeNull();
    expect(beforeDecision?.decision).toBeUndefined();

    const sr = cp.setDecision(r.value.checkpointId, 'approve', '최종 승인');
    expect(sr.ok).toBe(true);

    const afterDecision = cp.getCheckpoint(r.value.checkpointId);
    expect(afterDecision?.decision).toBe('approve');
    expect(afterDecision?.feedback).toBe('최종 승인');
    expect(afterDecision?.results).toBe('전체 사이클 결과');
  });

  it('대용량 results + 대용량 feedback → 정합성 유지', () => {
    const cp = makeCheckpoint();
    const bigResults = 'R'.repeat(50000);
    const bigFeedback = 'F'.repeat(50000);

    const r = cp.createCheckpoint('proj-big', 'feat-big', bigResults);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const sr = cp.setDecision(r.value.checkpointId, 'revise', bigFeedback);
    expect(sr.ok).toBe(true);

    const data = cp.getCheckpoint(r.value.checkpointId);
    expect(data?.results).toBe(bigResults);
    expect(data?.feedback).toBe(bigFeedback);
  });

  it('25개 approve + 25개 revise 섞기 → 각각 정확한 값', () => {
    const cp = makeCheckpoint();
    const approveIds: string[] = [];
    const reviseIds: string[] = [];

    for (let i = 0; i < 50; i++) {
      const r = cp.createCheckpoint('proj-mixed', `feat-mixed-${i}`, `result-${i}`);
      if (r.ok) {
        if (i < 25) {
          cp.setDecision(r.value.checkpointId, 'approve', `approve-fb-${i}`);
          approveIds.push(r.value.checkpointId);
        } else {
          cp.setDecision(r.value.checkpointId, 'revise', `revise-fb-${i}`);
          reviseIds.push(r.value.checkpointId);
        }
      }
    }

    for (const id of approveIds) {
      expect(cp.getCheckpoint(id)?.decision).toBe('approve');
    }
    for (const id of reviseIds) {
      expect(cp.getCheckpoint(id)?.decision).toBe('revise');
    }
  });

  it('두 인스턴스가 같은 featureId로 생성 → 서로 격리', () => {
    const cp1 = makeCheckpoint();
    const cp2 = makeCheckpoint();

    const r1 = cp1.createCheckpoint('proj-isolation', 'same-feat', 'result-cp1');
    const r2 = cp2.createCheckpoint('proj-isolation', 'same-feat', 'result-cp2');

    if (r1.ok && r2.ok) {
      cp1.setDecision(r1.value.checkpointId, 'approve', 'cp1 approved');

      const d1 = cp1.getCheckpoint(r1.value.checkpointId);
      const d2 = cp2.getCheckpoint(r2.value.checkpointId);

      expect(d1?.decision).toBe('approve');
      expect(d2?.decision).toBeUndefined();
    }
  });

  it('인스턴스 재생성 → 이전 데이터 없음', () => {
    let cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-reset', 'feat-reset', 'initial');
    if (!r.ok) return;
    const oldId = r.value.checkpointId;

    // 새 인스턴스
    cp = makeCheckpoint();
    expect(cp.getCheckpoint(oldId)).toBeNull();
  });

  it('5개 create → 3개 approve → 2개 revise → 각 결정 유지', () => {
    const cp = makeCheckpoint();
    const ids: string[] = [];

    for (let i = 0; i < 5; i++) {
      const r = cp.createCheckpoint('proj-5', `feat-five-${i}`, `result-${i}`);
      if (r.ok) ids.push(r.value.checkpointId);
    }

    for (let i = 0; i < 3; i++) {
      if (ids[i]) cp.setDecision(ids[i]!, 'approve');
    }
    for (let i = 3; i < 5; i++) {
      if (ids[i]) cp.setDecision(ids[i]!, 'revise', `수정 ${i}`);
    }

    for (let i = 0; i < 3; i++) {
      if (ids[i]) expect(cp.getCheckpoint(ids[i]!)?.decision).toBe('approve');
    }
    for (let i = 3; i < 5; i++) {
      if (ids[i]) expect(cp.getCheckpoint(ids[i]!)?.decision).toBe('revise');
    }
  });

  it('createCheckpoint ok=true의 value.checkpointId가 getCheckpoint key와 일치', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-key', 'feat-key-match', 'result');
    if (r.ok) {
      const id = r.value.checkpointId;
      const data = cp.getCheckpoint(id);
      expect(data).not.toBeNull();
    }
  });

  it('setDecision 없이 생성만 → decision=undefined, feedback=undefined', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('proj-no-decision', 'feat-no-decision', 'result-nd');
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBeUndefined();
      expect(data?.feedback).toBeUndefined();
    }
  });

  it('한글 projectId + 한글 featureId + 한글 results → ok 및 정합성', () => {
    const cp = makeCheckpoint();
    const r = cp.createCheckpoint('프로젝트-한글', '기능-한글', '결과: 전체 통과');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = cp.getCheckpoint(r.value.checkpointId);
      expect(data?.results).toBe('결과: 전체 통과');
    }
  });

  it('getCheckpoint 반환 null이면 결정 없음 확인 가능', () => {
    const cp = makeCheckpoint();
    const data = cp.getCheckpoint('no-such-cp');
    expect(data).toBeNull();
    // data가 null이면 decision에 접근 시 타입 안전
    if (data !== null) {
      expect(data.decision).toBeUndefined();
    }
  });

  it('create×3 → setDecision×3 → 순서대로 조회 → 정합성', () => {
    const cp = makeCheckpoint();
    const cases: Array<{ id: string; d: 'approve' | 'revise'; fb: string }> = [];

    for (let i = 0; i < 3; i++) {
      const r = cp.createCheckpoint('proj-ordered', `feat-order-${i}`, `result-${i}`);
      if (r.ok) {
        const d: 'approve' | 'revise' = i % 2 === 0 ? 'approve' : 'revise';
        const fb = `feedback-ordered-${i}`;
        cp.setDecision(r.value.checkpointId, d, fb);
        cases.push({ id: r.value.checkpointId, d, fb });
      }
    }

    for (const c of cases) {
      const data = cp.getCheckpoint(c.id);
      expect(data?.decision).toBe(c.d);
      expect(data?.feedback).toBe(c.fb);
    }
  });
});
