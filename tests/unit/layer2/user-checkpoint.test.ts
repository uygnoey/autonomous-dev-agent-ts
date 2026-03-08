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
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('UserCheckpoint 랜덤/경계값', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('랜덤 체크포인트 #%i', (i) => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint(
      `proj-${i}`,
      `feat-rand-${i}`,
      `result-${i}-${'x'.repeat(i)}`,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data).not.toBeNull();
    }
  });

  it.each(['approve', 'revise'] as const)('결정 %s → 기록됨', (decision) => {
    const checkpoint = makeCheckpoint();
    const r = checkpoint.createCheckpoint('proj-1', 'feat-1', 'result');
    if (r.ok) {
      const setResult = checkpoint.setDecision(r.value.checkpointId, decision);
      expect(setResult.ok).toBe(true);
      const data = checkpoint.getCheckpoint(r.value.checkpointId);
      expect(data?.decision).toBe(decision);
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
});
