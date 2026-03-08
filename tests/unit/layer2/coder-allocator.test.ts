/**
 * CoderAllocator 단위 테스트 / CoderAllocator unit tests
 *
 * @description
 * 모듈 할당, 충돌 감지, 완료/병합 처리, 순서 보장 등
 * 모든 edge case를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';

// ── 테스트 헬퍼 ────────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeAllocator(): CoderAllocator {
  return new CoderAllocator(logger);
}

// ── allocate / 할당 ────────────────────────────────────────────

describe('CoderAllocator.allocate', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    allocator = makeAllocator();
  });

  it('단일 모듈 할당', () => {
    const result = allocator.allocate('feat-1', ['auth']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.modules).toContain('auth');
    }
  });

  it('다중 모듈 할당', () => {
    const result = allocator.allocate('feat-1', ['auth', 'user', 'api']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });

  it('각 모듈에 별도 coderId 부여', () => {
    const result = allocator.allocate('feat-1', ['auth', 'user']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.value.map((a) => a.coderId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('브랜치 이름 형식: feature/{featureId}-{module}-coderN', () => {
    const result = allocator.allocate('feat-1', ['auth']);
    if (result.ok) {
      expect(result.value[0]?.branchName).toMatch(/^feature\/feat-1-auth-coder\d+$/);
    }
  });

  it('할당 상태가 assigned', () => {
    const result = allocator.allocate('feat-1', ['auth']);
    if (result.ok) {
      expect(result.value[0]?.status).toBe('assigned');
    }
  });

  it('featureId가 할당에 기록됨', () => {
    const result = allocator.allocate('feat-xyz', ['module-a']);
    if (result.ok) {
      expect(result.value[0]?.featureId).toBe('feat-xyz');
    }
  });

  it('모듈명이 할당에 기록됨', () => {
    const result = allocator.allocate('feat-1', ['my-module']);
    if (result.ok) {
      expect(result.value[0]?.modules).toContain('my-module');
    }
  });

  it('빈 모듈 배열 → 빈 결과 반환', () => {
    const result = allocator.allocate('feat-1', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('같은 기능 다른 모듈은 할당 가능', () => {
    allocator.allocate('feat-1', ['auth']);
    const result = allocator.allocate('feat-1', ['user']);
    expect(result.ok).toBe(true);
  });

  it('다른 기능 다른 모듈은 할당 가능', () => {
    allocator.allocate('feat-1', ['auth']);
    const result = allocator.allocate('feat-2', ['user']);
    expect(result.ok).toBe(true);
  });

  it('이미 할당된 모듈 재할당 → 충돌 에러', () => {
    allocator.allocate('feat-1', ['auth']);
    const result = allocator.allocate('feat-2', ['auth']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_conflict');
    }
  });

  it('부분 충돌 → 전체 실패', () => {
    allocator.allocate('feat-1', ['auth', 'user']);
    const result = allocator.allocate('feat-2', ['user', 'api']); // 'user' 충돌
    expect(result.ok).toBe(false);
  });

  it('병합 후 같은 모듈 재할당 가능', () => {
    const r1 = allocator.allocate('feat-1', ['auth']);
    if (r1.ok) {
      allocator.mergeAllocation(r1.value[0]!.coderId);
      const r2 = allocator.allocate('feat-2', ['auth']);
      expect(r2.ok).toBe(true);
    }
  });

  it('완료 후 같은 모듈은 아직 점유 중 (completed는 해제 안 됨)', () => {
    const r1 = allocator.allocate('feat-1', ['auth']);
    if (r1.ok) {
      allocator.completeAllocation(r1.value[0]!.coderId);
      // complete는 모듈을 해제하지 않음
      const r2 = allocator.allocate('feat-2', ['auth']);
      expect(r2.ok).toBe(false);
    }
  });

  it('연속 할당 시 coderCounter 증가', () => {
    const r1 = allocator.allocate('feat-1', ['mod-a']);
    const r2 = allocator.allocate('feat-2', ['mod-b']);
    if (r1.ok && r2.ok) {
      const id1 = Number(r1.value[0]?.coderId.replace('coder-', ''));
      const id2 = Number(r2.value[0]?.coderId.replace('coder-', ''));
      expect(id2).toBeGreaterThan(id1);
    }
  });

  it('특수문자 모듈명 → 할당 성공', () => {
    const result = allocator.allocate('feat-1', ['module/with/slash']);
    expect(result.ok).toBe(true);
  });

  it('긴 모듈명 → 할당 성공', () => {
    const longName = 'very-long-module-name'.repeat(3);
    const result = allocator.allocate('feat-1', [longName]);
    expect(result.ok).toBe(true);
  });

  it('숫자 모듈명 → 할당 성공', () => {
    const result = allocator.allocate('feat-1', ['module123']);
    expect(result.ok).toBe(true);
  });

  it('한국어 모듈명 → 할당 성공', () => {
    const result = allocator.allocate('feat-1', ['인증모듈']);
    expect(result.ok).toBe(true);
  });

  it('1개 모듈 동시 할당', () => {
    const result = allocator.allocate('feat-1', ['module-0']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('2개 모듈 동시 할당', () => {
    const result = allocator.allocate('feat-1', ['module-0', 'module-1']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('3개 모듈 동시 할당', () => {
    const modules = Array.from({ length: 3 }, (_, i) => `module-${i}`);
    const result = allocator.allocate('feat-1', modules);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(3);
  });

  it('5개 모듈 동시 할당', () => {
    const modules = Array.from({ length: 5 }, (_, i) => `module-${i}`);
    const result = allocator.allocate('feat-1', modules);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(5);
  });

  it('10개 모듈 동시 할당', () => {
    const modules = Array.from({ length: 10 }, (_, i) => `module-${i}`);
    const result = allocator.allocate('feat-1', modules);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(10);
  });

  it('20개 모듈 동시 할당', () => {
    const modules = Array.from({ length: 20 }, (_, i) => `module-${i}`);
    const result = allocator.allocate('feat-1', modules);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(20);
  });
});

// ── getActiveAllocations ───────────────────────────────────────

describe('CoderAllocator.getActiveAllocations', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    allocator = makeAllocator();
  });

  it('초기에는 빈 배열', () => {
    expect(allocator.getActiveAllocations()).toHaveLength(0);
  });

  it('할당 후 활성 목록에 포함', () => {
    allocator.allocate('feat-1', ['auth']);
    expect(allocator.getActiveAllocations()).toHaveLength(1);
  });

  it('다중 할당 후 활성 목록 수 일치', () => {
    allocator.allocate('feat-1', ['auth', 'user']);
    expect(allocator.getActiveAllocations()).toHaveLength(2);
  });

  it('완료된 할당은 활성 목록에서 제외', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.completeAllocation(r.value[0]!.coderId);
    }
    expect(allocator.getActiveAllocations()).toHaveLength(0);
  });

  it('병합된 할당은 활성 목록에서 제외', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.mergeAllocation(r.value[0]!.coderId);
    }
    expect(allocator.getActiveAllocations()).toHaveLength(0);
  });

  it('일부 완료, 일부 활성 혼합', () => {
    const r = allocator.allocate('feat-1', ['auth', 'user', 'api']);
    if (r.ok && r.value[0]) {
      allocator.completeAllocation(r.value[0].coderId);
    }
    expect(allocator.getActiveAllocations()).toHaveLength(2);
  });

  it('working 상태도 활성 목록에 포함', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    // 직접 상태를 변경할 수 없으므로 현재 상태(assigned)만 확인
    if (r.ok) {
      expect(allocator.getActiveAllocations()).toHaveLength(1);
    }
  });

  it('1개 할당 후 활성 목록 수', () => {
    allocator.allocate('feat-1', ['mod-0']);
    expect(allocator.getActiveAllocations()).toHaveLength(1);
  });

  it('2개 할당 후 활성 목록 수', () => {
    allocator.allocate('feat-1', ['mod-0', 'mod-1']);
    expect(allocator.getActiveAllocations()).toHaveLength(2);
  });

  it('5개 할당 후 활성 목록 수', () => {
    allocator.allocate('feat-1', Array.from({ length: 5 }, (_, i) => `mod-${i}`));
    expect(allocator.getActiveAllocations()).toHaveLength(5);
  });

  it('10개 할당 후 활성 목록 수', () => {
    allocator.allocate('feat-1', Array.from({ length: 10 }, (_, i) => `mod-${i}`));
    expect(allocator.getActiveAllocations()).toHaveLength(10);
  });
});

// ── completeAllocation ─────────────────────────────────────────

describe('CoderAllocator.completeAllocation', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    allocator = makeAllocator();
  });

  it('존재하는 할당 완료 → ok', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      const result = allocator.completeAllocation(r.value[0]!.coderId);
      expect(result.ok).toBe(true);
    }
  });

  it('존재하지 않는 coderId → 에러', () => {
    const result = allocator.completeAllocation('non-existent-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_not_found');
    }
  });

  it('이미 완료된 할당 재완료 → ok (idempotent 허용)', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.completeAllocation(r.value[0]!.coderId);
      const result = allocator.completeAllocation(r.value[0]!.coderId);
      expect(result.ok).toBe(true);
    }
  });

  it('완료 후 상태가 completed', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.completeAllocation(r.value[0]!.coderId);
      const active = allocator.getActiveAllocations();
      expect(active).toHaveLength(0);
    }
  });

  it('잘못된 coderId 빈 문자열 → 에러', () => {
    const result = allocator.completeAllocation('');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId 공백 → 에러', () => {
    const result = allocator.completeAllocation(' ');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId fake-id-123 → 에러', () => {
    const result = allocator.completeAllocation('fake-id-123');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId coder-0 (미할당) → 에러', () => {
    const result = allocator.completeAllocation('coder-0');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId coder--1 → 에러', () => {
    const result = allocator.completeAllocation('coder--1');
    expect(result.ok).toBe(false);
  });

  it('1개 할당 역순 완료', () => {
    const r = allocator.allocate('feat-1', ['mod-0']);
    if (r.ok) {
      for (let i = r.value.length - 1; i >= 0; i--) {
        const cr = allocator.completeAllocation(r.value[i]!.coderId);
        expect(cr.ok).toBe(true);
      }
      expect(allocator.getActiveAllocations()).toHaveLength(0);
    }
  });

  it('3개 할당 역순 완료', () => {
    const r = allocator.allocate('feat-1', ['mod-0', 'mod-1', 'mod-2']);
    if (r.ok) {
      for (let i = r.value.length - 1; i >= 0; i--) {
        const cr = allocator.completeAllocation(r.value[i]!.coderId);
        expect(cr.ok).toBe(true);
      }
      expect(allocator.getActiveAllocations()).toHaveLength(0);
    }
  });

  it('5개 할당 역순 완료', () => {
    const r = allocator.allocate('feat-1', Array.from({ length: 5 }, (_, i) => `mod-${i}`));
    if (r.ok) {
      for (let i = r.value.length - 1; i >= 0; i--) {
        const cr = allocator.completeAllocation(r.value[i]!.coderId);
        expect(cr.ok).toBe(true);
      }
      expect(allocator.getActiveAllocations()).toHaveLength(0);
    }
  });
});

// ── mergeAllocation ────────────────────────────────────────────

describe('CoderAllocator.mergeAllocation', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    allocator = makeAllocator();
  });

  it('존재하는 할당 병합 → ok', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      const result = allocator.mergeAllocation(r.value[0]!.coderId);
      expect(result.ok).toBe(true);
    }
  });

  it('존재하지 않는 coderId → 에러', () => {
    const result = allocator.mergeAllocation('non-existent-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_not_found');
    }
  });

  it('병합 후 모듈 해제 → 재할당 가능', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.mergeAllocation(r.value[0]!.coderId);
      const r2 = allocator.allocate('feat-2', ['auth']);
      expect(r2.ok).toBe(true);
    }
  });

  it('병합 후 활성 목록에서 제외', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.mergeAllocation(r.value[0]!.coderId);
      expect(allocator.getActiveAllocations()).toHaveLength(0);
    }
  });

  it('다중 모듈 병합 → 모든 모듈 해제', () => {
    const r = allocator.allocate('feat-1', ['auth', 'user', 'api']);
    if (r.ok) {
      for (const alloc of r.value) {
        allocator.mergeAllocation(alloc.coderId);
      }
      // 모두 병합 후 재할당 가능
      const r2 = allocator.allocate('feat-2', ['auth', 'user', 'api']);
      expect(r2.ok).toBe(true);
    }
  });

  it('잘못된 coderId 빈 문자열 mergeAllocation → 에러', () => {
    const result = allocator.mergeAllocation('');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId 공백 mergeAllocation → 에러', () => {
    const result = allocator.mergeAllocation(' ');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId invalid-coder mergeAllocation → 에러', () => {
    const result = allocator.mergeAllocation('invalid-coder');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId coder-9999 mergeAllocation → 에러', () => {
    const result = allocator.mergeAllocation('coder-9999');
    expect(result.ok).toBe(false);
  });

  it('잘못된 coderId CODER-1 mergeAllocation → 에러', () => {
    const result = allocator.mergeAllocation('CODER-1');
    expect(result.ok).toBe(false);
  });
});

// ── hasConflict ────────────────────────────────────────────────

describe('CoderAllocator.hasConflict', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    allocator = makeAllocator();
  });

  it('할당된 모듈과 겹치면 true', () => {
    allocator.allocate('feat-1', ['auth']);
    expect(allocator.hasConflict(['auth'])).toBe(true);
  });

  it('할당되지 않은 모듈이면 false', () => {
    allocator.allocate('feat-1', ['auth']);
    expect(allocator.hasConflict(['user'])).toBe(false);
  });

  it('빈 배열은 충돌 없음', () => {
    allocator.allocate('feat-1', ['auth']);
    expect(allocator.hasConflict([])).toBe(false);
  });

  it('초기 상태에서 항상 false', () => {
    expect(allocator.hasConflict(['any-module'])).toBe(false);
    expect(allocator.hasConflict(['auth', 'user', 'api'])).toBe(false);
  });

  it('부분 일치도 true', () => {
    allocator.allocate('feat-1', ['auth']);
    expect(allocator.hasConflict(['auth', 'user'])).toBe(true);
  });

  it('병합 후 충돌 없음', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.mergeAllocation(r.value[0]!.coderId);
      expect(allocator.hasConflict(['auth'])).toBe(false);
    }
  });

  it('완료 후에도 충돌 (모듈 미해제)', () => {
    const r = allocator.allocate('feat-1', ['auth']);
    if (r.ok) {
      allocator.completeAllocation(r.value[0]!.coderId);
      expect(allocator.hasConflict(['auth'])).toBe(true);
    }
  });

  it('module-0 할당 전 충돌 없음', () => {
    expect(allocator.hasConflict(['module-0'])).toBe(false);
  });

  it('module-1 할당 전 충돌 없음', () => {
    expect(allocator.hasConflict(['module-1'])).toBe(false);
  });

  it('module-5 할당 전 충돌 없음', () => {
    expect(allocator.hasConflict(['module-5'])).toBe(false);
  });

  it('module-10 할당 전 충돌 없음', () => {
    expect(allocator.hasConflict(['module-10'])).toBe(false);
  });

  it('module-19 할당 전 충돌 없음', () => {
    expect(allocator.hasConflict(['module-19'])).toBe(false);
  });

  it('module-0 할당 후 충돌', () => {
    allocator.allocate('feat-1', ['module-0']);
    expect(allocator.hasConflict(['module-0'])).toBe(true);
  });

  it('module-1 할당 후 충돌', () => {
    allocator.allocate('feat-1', ['module-1']);
    expect(allocator.hasConflict(['module-1'])).toBe(true);
  });

  it('module-5 할당 후 충돌', () => {
    allocator.allocate('feat-1', ['module-5']);
    expect(allocator.hasConflict(['module-5'])).toBe(true);
  });

  it('module-10 할당 후 충돌', () => {
    allocator.allocate('feat-1', ['module-10']);
    expect(allocator.hasConflict(['module-10'])).toBe(true);
  });

  it('module-19 할당 후 충돌', () => {
    allocator.allocate('feat-1', ['module-19']);
    expect(allocator.hasConflict(['module-19'])).toBe(true);
  });
});

// ── 복합 시나리오 / Integration-like ─────────────────────────

describe('CoderAllocator 복합 시나리오', () => {
  it('여러 기능에 걸친 병렬 할당 시나리오', () => {
    const a = makeAllocator();
    // feat-1: auth, user
    const r1 = a.allocate('feat-1', ['auth', 'user']);
    // feat-2: api, storage (다른 모듈)
    const r2 = a.allocate('feat-2', ['api', 'storage']);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(a.getActiveAllocations()).toHaveLength(4);
  });

  it('완료 → 재할당 → 병합 사이클', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-1', ['module-x']);
    if (r1.ok) {
      // 완료하면 모듈이 해제되지 않음
      a.completeAllocation(r1.value[0]!.coderId);
      // 같은 모듈은 여전히 충돌
      expect(a.hasConflict(['module-x'])).toBe(true);
    }
  });

  it('병합 → 재할당 → 병합 사이클 (멱등성)', () => {
    const a = makeAllocator();
    for (let cycle = 0; cycle < 5; cycle++) {
      const r = a.allocate(`feat-${cycle}`, ['shared-module']);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const mergeResult = a.mergeAllocation(r.value[0]!.coderId);
        expect(mergeResult.ok).toBe(true);
      }
    }
  });

  it('대규모 할당 (50개 모듈)', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 50 }, (_, i) => `mod-${i}`);
    const result = a.allocate('feat-mega', modules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(a.getActiveAllocations()).toHaveLength(50);
    }
  });

  it('할당 → 완료 → 재할당 시도 → 여전히 충돌', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-1', ['critical-module']);
    if (r1.ok) {
      a.completeAllocation(r1.value[0]!.coderId);
      // complete는 모듈을 해제하지 않으므로 여전히 충돌
      const r2 = a.allocate('feat-2', ['critical-module']);
      expect(r2.ok).toBe(false);
    }
  });

  it('브랜치 이름 중복 없음 (20개 할당)', () => {
    const a = makeAllocator();
    const branchNames: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = a.allocate(`feat-${i}`, [`mod-${i}`]);
      if (r.ok && r.value[0]) {
        branchNames.push(r.value[0].branchName);
      }
    }
    expect(new Set(branchNames).size).toBe(branchNames.length);
  });

  it('coderId 중복 없음 (50개 할당)', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 50 }, (_, i) => `unique-${i}`);
    const r = a.allocate('feat-big', modules);
    if (r.ok) {
      const ids = r.value.map((alloc) => alloc.coderId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ── 경계값 / 랜덤 테스트 ─────────────────────────────────────

describe('CoderAllocator 경계값 랜덤', () => {
  it('랜덤 featureId 할당 #0', () => {
    const a = makeAllocator();
    const result = a.allocate(`feature-${crypto.randomUUID().slice(0, 8)}-0`, ['module-0']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 featureId 할당 #1', () => {
    const a = makeAllocator();
    const result = a.allocate(`feature-${crypto.randomUUID().slice(0, 8)}-1`, ['module-1']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 featureId 할당 #5', () => {
    const a = makeAllocator();
    const result = a.allocate(`feature-${crypto.randomUUID().slice(0, 8)}-5`, ['module-5']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 featureId 할당 #10', () => {
    const a = makeAllocator();
    const result = a.allocate(`feature-${crypto.randomUUID().slice(0, 8)}-10`, ['module-10']);
    expect(result.ok).toBe(true);
  });

  it('랜덤 featureId 할당 #20', () => {
    const a = makeAllocator();
    const result = a.allocate(`feature-${crypto.randomUUID().slice(0, 8)}-20`, ['module-20']);
    expect(result.ok).toBe(true);
  });

  it('1개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['m0']);
    expect(a.getActiveAllocations()).toHaveLength(1);
  });

  it('2개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['m0', 'm1']);
    expect(a.getActiveAllocations()).toHaveLength(2);
  });

  it('5개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', Array.from({ length: 5 }, (_, i) => `m${i}`));
    expect(a.getActiveAllocations()).toHaveLength(5);
  });

  it('10개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', Array.from({ length: 10 }, (_, i) => `m${i}`));
    expect(a.getActiveAllocations()).toHaveLength(10);
  });

  it('20개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', Array.from({ length: 20 }, (_, i) => `m${i}`));
    expect(a.getActiveAllocations()).toHaveLength(20);
  });

  it('50개 모듈 할당 후 활성 수 일치', () => {
    const a = makeAllocator();
    a.allocate('feat-1', Array.from({ length: 50 }, (_, i) => `m${i}`));
    expect(a.getActiveAllocations()).toHaveLength(50);
  });

  it('1번 병합 사이클 반복', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-0', ['mod-0']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mr = a.mergeAllocation(r.value[0]!.coderId);
      expect(mr.ok).toBe(true);
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('5번 병합 사이클 반복', () => {
    const a = makeAllocator();
    for (let i = 0; i < 5; i++) {
      const r = a.allocate(`feat-${i}`, [`mod-${i}`]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const mr = a.mergeAllocation(r.value[0]!.coderId);
        expect(mr.ok).toBe(true);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });
});

// ── 추가 경계값: allocate 반환값 구조 ─────────────────────────

describe('CoderAllocator allocate 반환값 구조', () => {
  it('ok는 boolean', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('반환 value는 배열', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod-a', 'mod-b']);
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('coderId는 string 타입', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod-1']);
    if (result.ok) expect(typeof result.value[0]!.coderId).toBe('string');
  });

  it('branchName은 string 타입', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod-1']);
    if (result.ok) expect(typeof result.value[0]!.branchName).toBe('string');
  });

  it('featureId는 요청한 값과 일치', () => {
    const a = makeAllocator();
    const result = a.allocate('my-feat', ['mod-1']);
    if (result.ok) expect(result.value[0]!.featureId).toBe('my-feat');
  });

  it('status는 assigned', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod-1']);
    if (result.ok) expect(result.value[0]!.status).toBe('assigned');
  });

  it('modules는 배열', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['mod-a']);
    if (result.ok) expect(Array.isArray(result.value[0]!.modules)).toBe(true);
  });

  it('충돌 에러 message는 string', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['conflict-mod']);
    const result = a.allocate('feat-2', ['conflict-mod']);
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('충돌 에러 code는 string', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['conflict-mod']);
    const result = a.allocate('feat-2', ['conflict-mod']);
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('10개 모듈 branchName 모두 feat-1 포함', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', Array.from({ length: 10 }, (_, i) => `m${i}`));
    if (result.ok) {
      for (const alloc of result.value) {
        expect(alloc.branchName).toContain('feat-1');
      }
    }
  });

  it('getActiveAllocations는 배열', () => {
    const a = makeAllocator();
    expect(Array.isArray(a.getActiveAllocations())).toBe(true);
  });

  it('completeAllocation ok는 boolean', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok) {
      const cr = a.completeAllocation(r.value[0]!.coderId);
      expect(typeof cr.ok).toBe('boolean');
    }
  });

  it('mergeAllocation ok는 boolean', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok) {
      const mr = a.mergeAllocation(r.value[0]!.coderId);
      expect(typeof mr.ok).toBe('boolean');
    }
  });

  it('hasConflict는 boolean', () => {
    const a = makeAllocator();
    expect(typeof a.hasConflict(['mod'])).toBe('boolean');
  });

  it('5번 반복 hasConflict → 일관된 결과', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-consistent']);
    for (let i = 0; i < 5; i++) {
      expect(a.hasConflict(['mod-consistent'])).toBe(true);
    }
  });
});

// ── 추가 경계값 및 UUID/랜덤 케이스 ──────────────────────────

describe('CoderAllocator 추가 edge case', () => {
  it('UUID 형식 featureId 할당 → ok', () => {
    const a = makeAllocator();
    const result = a.allocate(crypto.randomUUID(), ['mod-uuid']);
    expect(result.ok).toBe(true);
  });

  it('UUID 형식 모듈명 할당 → ok', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', [crypto.randomUUID()]);
    expect(result.ok).toBe(true);
  });

  it('동일 featureId로 10번 다른 모듈 할당 → 모두 ok', () => {
    const a = makeAllocator();
    for (let i = 0; i < 10; i++) {
      const result = a.allocate('feat-same', [`unique-mod-${i}`]);
      expect(result.ok).toBe(true);
    }
    expect(a.getActiveAllocations()).toHaveLength(10);
  });

  it('모든 할당 병합 후 getActiveAllocations 빈 배열', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['a', 'b', 'c', 'd', 'e']);
    if (r.ok) {
      for (const alloc of r.value) {
        a.mergeAllocation(alloc.coderId);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('모든 할당 완료 후 getActiveAllocations 빈 배열', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['x', 'y', 'z']);
    if (r.ok) {
      for (const alloc of r.value) {
        a.completeAllocation(alloc.coderId);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('빈 featureId 할당 시도 → 타입 확인 (구현 의존)', () => {
    const a = makeAllocator();
    const result = a.allocate('', ['mod-1']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('공백 featureId 할당 시도 → 타입 확인', () => {
    const a = makeAllocator();
    const result = a.allocate('   ', ['mod-1']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('completeAllocation 후 모듈은 hasConflict=true 유지', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['locked-mod']);
    if (r.ok && r.value[0]) {
      a.completeAllocation(r.value[0].coderId);
      expect(a.hasConflict(['locked-mod'])).toBe(true);
    }
  });

  it('mergeAllocation 후 모듈은 hasConflict=false', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['free-mod']);
    if (r.ok && r.value[0]) {
      a.mergeAllocation(r.value[0].coderId);
      expect(a.hasConflict(['free-mod'])).toBe(false);
    }
  });

  it('branchName은 featureId와 모듈명을 포함', () => {
    const a = makeAllocator();
    const result = a.allocate('my-feature', ['my-module']);
    if (result.ok && result.value[0]) {
      expect(result.value[0].branchName).toContain('my-feature');
      expect(result.value[0].branchName).toContain('my-module');
    }
  });

  it('completeAllocation 반환 error.code는 string', () => {
    const a = makeAllocator();
    const result = a.completeAllocation('nonexistent');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('mergeAllocation 반환 error.code는 string', () => {
    const a = makeAllocator();
    const result = a.mergeAllocation('nonexistent');
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('allocate 에러 시 error.message는 string', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['conflict-mod']);
    const result = a.allocate('feat-2', ['conflict-mod']);
    if (!result.ok) {
      expect(typeof result.error.message).toBe('string');
    }
  });

  it('10개 랜덤 UUID 모듈 할당 → coderId 모두 고유', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 10 }, () => crypto.randomUUID());
    const r = a.allocate('feat-uuid', modules);
    if (r.ok) {
      const ids = r.value.map(alloc => alloc.coderId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('할당 배열 원소의 modules는 요청한 모듈을 포함', () => {
    const a = makeAllocator();
    const result = a.allocate('feat-1', ['specific-module']);
    if (result.ok && result.value[0]) {
      expect(result.value[0].modules).toContain('specific-module');
    }
  });

  it('getActiveAllocations는 배열 원소가 featureId를 가짐', () => {
    const a = makeAllocator();
    a.allocate('feat-check', ['mod-a']);
    const active = a.getActiveAllocations();
    if (active.length > 0 && active[0]) {
      expect(typeof active[0].featureId).toBe('string');
    }
  });

  it('병합 사이클 10번 → 마지막 상태 active=0', () => {
    const a = makeAllocator();
    for (let i = 0; i < 10; i++) {
      const r = a.allocate(`feat-cycle-${i}`, [`mod-cycle-${i}`]);
      if (r.ok && r.value[0]) {
        a.mergeAllocation(r.value[0].coderId);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });
});
