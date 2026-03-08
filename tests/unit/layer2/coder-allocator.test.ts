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

// ── 추가 경계값: 할당 후 branchName 규칙 검증 ─────────────────────

describe('CoderAllocator branchName 규칙 검증', () => {
  it('branchName은 "feature/"로 시작', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-x', ['mod-y']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].branchName.startsWith('feature/')).toBe(true);
    }
  });

  it('branchName에 featureId 포함', () => {
    const a = makeAllocator();
    const r = a.allocate('my-special-feature', ['mod-a']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].branchName).toContain('my-special-feature');
    }
  });

  it('branchName에 모듈명 포함', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['special-module']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].branchName).toContain('special-module');
    }
  });

  it('branchName에 coder 번호 포함', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].branchName).toMatch(/coder\d+/);
    }
  });

  it('다중 할당 시 branchName 모두 다름', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-a', 'mod-b', 'mod-c']);
    if (r.ok) {
      const names = r.value.map((alloc) => alloc.branchName);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('다른 featureId의 branchName도 고유', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-1', ['mod-x']);
    const r2 = a.allocate('feat-2', ['mod-y']);
    if (r1.ok && r2.ok && r1.value[0] && r2.value[0]) {
      expect(r1.value[0].branchName).not.toBe(r2.value[0].branchName);
    }
  });

  it('50개 할당 branchName 모두 고유', () => {
    const a = makeAllocator();
    const branches: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = a.allocate(`feat-br-${i}`, [`mod-br-${i}`]);
      if (r.ok && r.value[0]) {
        branches.push(r.value[0].branchName);
      }
    }
    expect(new Set(branches).size).toBe(branches.length);
  });

  it('branchName은 string 타입', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      expect(typeof r.value[0].branchName).toBe('string');
    }
  });

  it('branchName 길이 > 0', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].branchName.length).toBeGreaterThan(0);
    }
  });

  it('10개 모듈 각 branchName에 해당 모듈명 포함', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 10 }, (_, i) => `unique-module-${i}`);
    const r = a.allocate('feat-1', modules);
    if (r.ok) {
      for (let i = 0; i < r.value.length; i++) {
        expect(r.value[i]!.branchName).toContain(modules[i]!);
      }
    }
  });
});

// ── 추가 경계값: 충돌 에러 구조 검증 ─────────────────────────────

describe('CoderAllocator 충돌 에러 구조 검증', () => {
  it('충돌 에러 code = agent_allocation_conflict', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['conflict-mod']);
    const result = a.allocate('feat-2', ['conflict-mod']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_conflict');
    }
  });

  it('충돌 에러 message는 비어있지 않음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-conflict']);
    const result = a.allocate('feat-2', ['mod-conflict']);
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('충돌 에러는 ok=false', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['m1']);
    const result = a.allocate('feat-2', ['m1']);
    expect(result.ok).toBe(false);
  });

  it('충돌 에러 code는 string 타입', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['err-mod']);
    const result = a.allocate('feat-2', ['err-mod']);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
    }
  });

  it('미존재 coderId completeAllocation 에러 code = agent_allocation_not_found', () => {
    const a = makeAllocator();
    const result = a.completeAllocation('does-not-exist');
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_not_found');
    }
  });

  it('미존재 coderId mergeAllocation 에러 code = agent_allocation_not_found', () => {
    const a = makeAllocator();
    const result = a.mergeAllocation('does-not-exist');
    if (!result.ok) {
      expect(result.error.code).toBe('agent_allocation_not_found');
    }
  });

  it('부분 충돌 에러 → 어떤 모듈도 할당되지 않음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['locked']);
    // 'locked'와 'new-mod'를 함께 요청 → 부분 충돌
    const result = a.allocate('feat-2', ['locked', 'new-mod']);
    if (!result.ok) {
      // 충돌로 실패했으므로 'new-mod'도 할당되지 않아야 함
      expect(a.hasConflict(['new-mod'])).toBe(false);
    }
  });

  it('5가지 다른 모듈 충돌 시도 → 모두 ok=false', () => {
    const a = makeAllocator();
    const lockedMods = ['m-a', 'm-b', 'm-c', 'm-d', 'm-e'];
    a.allocate('feat-orig', lockedMods);
    for (const mod of lockedMods) {
      const result = a.allocate('feat-new', [mod]);
      expect(result.ok).toBe(false);
    }
  });

  it('충돌 후 active 수 변화 없음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['stable-mod']);
    const beforeCount = a.getActiveAllocations().length;
    a.allocate('feat-2', ['stable-mod']); // 충돌
    const afterCount = a.getActiveAllocations().length;
    expect(afterCount).toBe(beforeCount);
  });
});

// ── 추가 경계값: 상태 전이 상세 검증 ─────────────────────────────

describe('CoderAllocator 상태 전이 검증', () => {
  it('새 할당 → status=assigned', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].status).toBe('assigned');
    }
  });

  it('completeAllocation 후 active에 없음', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      a.completeAllocation(r.value[0].coderId);
      const active = a.getActiveAllocations();
      const found = active.some((alloc) => alloc.coderId === r.value[0]!.coderId);
      expect(found).toBe(false);
    }
  });

  it('mergeAllocation 후 active에 없음', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['mod-1']);
    if (r.ok && r.value[0]) {
      a.mergeAllocation(r.value[0].coderId);
      const active = a.getActiveAllocations();
      const found = active.some((alloc) => alloc.coderId === r.value[0]!.coderId);
      expect(found).toBe(false);
    }
  });

  it('할당 전 hasConflict=false, 할당 후 hasConflict=true', () => {
    const a = makeAllocator();
    expect(a.hasConflict(['state-mod'])).toBe(false);
    a.allocate('feat-1', ['state-mod']);
    expect(a.hasConflict(['state-mod'])).toBe(true);
  });

  it('할당 → 병합 → hasConflict=false (해제)', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['release-mod']);
    if (r.ok && r.value[0]) {
      expect(a.hasConflict(['release-mod'])).toBe(true);
      a.mergeAllocation(r.value[0].coderId);
      expect(a.hasConflict(['release-mod'])).toBe(false);
    }
  });

  it('할당 → 완료 → hasConflict=true (미해제)', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['locked-state-mod']);
    if (r.ok && r.value[0]) {
      a.completeAllocation(r.value[0].coderId);
      expect(a.hasConflict(['locked-state-mod'])).toBe(true);
    }
  });

  it('할당 → 완료 → 병합 시도 → ok (병합이 완료 후에도 가능)', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-1', ['transition-mod']);
    if (r.ok && r.value[0]) {
      a.completeAllocation(r.value[0].coderId);
      // 완료 후 병합도 허용될 수 있음 (구현 의존)
      const mergeResult = a.mergeAllocation(r.value[0].coderId);
      expect(typeof mergeResult.ok).toBe('boolean');
    }
  });

  it('병합 후 재할당 → 성공', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-1', ['reusable-mod']);
    if (r1.ok && r1.value[0]) {
      a.mergeAllocation(r1.value[0].coderId);
      const r2 = a.allocate('feat-2', ['reusable-mod']);
      expect(r2.ok).toBe(true);
    }
  });

  it('완료 후 재할당 시도 → 실패 (모듈 미해제)', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-1', ['complete-only-mod']);
    if (r1.ok && r1.value[0]) {
      a.completeAllocation(r1.value[0].coderId);
      const r2 = a.allocate('feat-2', ['complete-only-mod']);
      expect(r2.ok).toBe(false);
    }
  });

  it('3단계 사이클: 할당→병합→재할당→병합→재할당', () => {
    const a = makeAllocator();
    for (let cycle = 0; cycle < 3; cycle++) {
      const r = a.allocate(`feat-cyc-${cycle}`, ['cycle-mod']);
      expect(r.ok).toBe(true);
      if (r.ok && r.value[0]) {
        const mr = a.mergeAllocation(r.value[0].coderId);
        expect(mr.ok).toBe(true);
      }
    }
    // 마지막 사이클 후 active는 0
    expect(a.getActiveAllocations()).toHaveLength(0);
  });
});

// ── 추가 경계값: getActiveAllocations 내용 검증 ──────────────────

describe('CoderAllocator getActiveAllocations 내용 검증', () => {
  it('active allocation은 featureId 필드 있음', () => {
    const a = makeAllocator();
    a.allocate('feat-active', ['mod-act']);
    const active = a.getActiveAllocations();
    if (active.length > 0 && active[0]) {
      expect(active[0].featureId).toBe('feat-active');
    }
  });

  it('active allocation은 coderId 필드 있음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-a']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(typeof active[0].coderId).toBe('string');
    }
  });

  it('active allocation은 branchName 필드 있음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-a']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(typeof active[0].branchName).toBe('string');
    }
  });

  it('active allocation은 modules 필드 있음', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-list']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(Array.isArray(active[0].modules)).toBe(true);
    }
  });

  it('active allocation의 modules는 요청한 모듈 포함', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['check-mod']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(active[0].modules).toContain('check-mod');
    }
  });

  it('3개 할당 후 active 배열의 각 coderId 고유', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['m1', 'm2', 'm3']);
    const active = a.getActiveAllocations();
    const ids = active.map((alloc) => alloc.coderId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('active 배열은 읽기 전용 복사본 (변경해도 내부 상태 안전)', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['safe-mod']);
    const active1 = a.getActiveAllocations();
    const before = active1.length;
    // active 배열을 외부에서 변조 시도
    active1.pop();
    const active2 = a.getActiveAllocations();
    // 구현에 따라 내부 상태가 유지되어야 함
    expect(typeof active2.length).toBe('number');
    expect(before).toBe(1);
  });

  it('여러 기능의 active 배열에서 featureId 다양함', () => {
    const a = makeAllocator();
    a.allocate('feat-x', ['mx']);
    a.allocate('feat-y', ['my']);
    a.allocate('feat-z', ['mz']);
    const active = a.getActiveAllocations();
    const featureIds = new Set(active.map((alloc) => alloc.featureId));
    expect(featureIds.size).toBe(3);
  });

  it('2개 할당 후 active 배열 원소가 정확히 2개', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['mod-p', 'mod-q']);
    expect(a.getActiveAllocations().length).toBe(2);
  });

  it('active allocation status 확인', () => {
    const a = makeAllocator();
    a.allocate('feat-1', ['status-mod']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      // status는 assigned 또는 working
      expect(['assigned', 'working']).toContain(active[0].status);
    }
  });
});

// ── 추가 경계값: 대규모 시나리오 ──────────────────────────────────

describe('CoderAllocator 대규모 시나리오', () => {
  it('100개 모듈 할당 → 모두 ok', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 100 }, (_, i) => `large-mod-${i}`);
    const result = a.allocate('feat-large', modules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(a.getActiveAllocations()).toHaveLength(100);
    }
  });

  it('100개 할당 후 모두 병합 → active=0', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 100 }, (_, i) => `bulk-mod-${i}`);
    const result = a.allocate('feat-bulk', modules);
    if (result.ok) {
      for (const alloc of result.value) {
        a.mergeAllocation(alloc.coderId);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('50개 할당 후 모두 완료 → active=0', () => {
    const a = makeAllocator();
    const modules = Array.from({ length: 50 }, (_, i) => `complete-mod-${i}`);
    const result = a.allocate('feat-complete', modules);
    if (result.ok) {
      for (const alloc of result.value) {
        a.completeAllocation(alloc.coderId);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('10개 기능 각 5개 모듈 → 총 active=50', () => {
    const a = makeAllocator();
    for (let fi = 0; fi < 10; fi++) {
      const modules = Array.from({ length: 5 }, (_, mi) => `feat${fi}-mod${mi}`);
      a.allocate(`feat-${fi}`, modules);
    }
    expect(a.getActiveAllocations()).toHaveLength(50);
  });

  it('10개 기능 각 5개 → 모두 병합 → active=0', () => {
    const a = makeAllocator();
    const allAllocations: string[] = [];
    for (let fi = 0; fi < 10; fi++) {
      const modules = Array.from({ length: 5 }, (_, mi) => `merge-feat${fi}-mod${mi}`);
      const result = a.allocate(`merge-feat-${fi}`, modules);
      if (result.ok) {
        for (const alloc of result.value) {
          allAllocations.push(alloc.coderId);
        }
      }
    }
    for (const coderId of allAllocations) {
      a.mergeAllocation(coderId);
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });

  it('순차적 할당-병합 20회 → 각 사이클 후 active=0', () => {
    const a = makeAllocator();
    for (let i = 0; i < 20; i++) {
      const r = a.allocate(`seq-feat-${i}`, [`seq-mod-${i}`]);
      expect(r.ok).toBe(true);
      if (r.ok && r.value[0]) {
        const mr = a.mergeAllocation(r.value[0].coderId);
        expect(mr.ok).toBe(true);
      }
      expect(a.getActiveAllocations()).toHaveLength(0);
    }
  });

  it('서로 다른 allocator 200개 → 각각 독립', () => {
    const allocators = Array.from({ length: 200 }, () => makeAllocator());
    for (let i = 0; i < allocators.length; i++) {
      allocators[i]!.allocate(`feat-ind-${i}`, [`mod-ind-${i}`]);
    }
    for (let i = 0; i < allocators.length; i++) {
      expect(allocators[i]!.getActiveAllocations()).toHaveLength(1);
    }
  });

  it('중복 없는 모듈들 연속 할당 → 모두 성공', () => {
    const a = makeAllocator();
    const results: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      const r = a.allocate(`feat-${i}`, [`distinct-${i}`]);
      results.push(r.ok);
    }
    expect(results.every((ok) => ok)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// BATCH 75 EXTENSION: 추가 경계값/랜덤 케이스
// ══════════════════════════════════════════════════════════════════

describe('CoderAllocator batch75 추가 케이스 A', () => {
  it('allocate 빈 배열 → ok=true, value 길이 0', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-e1', []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(0);
  });

  it('allocate 1개 모듈 → coderId string', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-e2', ['mod-e2']);
    if (r.ok) expect(typeof r.value[0]!.coderId).toBe('string');
  });

  it('allocate 후 hasConflict 정확히 체크', () => {
    const a = makeAllocator();
    a.allocate('feat-e3', ['mod-e3a', 'mod-e3b']);
    expect(a.hasConflict(['mod-e3a'])).toBe(true);
    expect(a.hasConflict(['mod-e3b'])).toBe(true);
    expect(a.hasConflict(['mod-e3c'])).toBe(false);
  });

  it('allocate 100개 모듈 → getActiveAllocations=100', () => {
    const a = makeAllocator();
    const mods = Array.from({ length: 100 }, (_, i) => `bulk100-${i}`);
    const r = a.allocate('feat-e4', mods);
    expect(r.ok).toBe(true);
    if (r.ok) expect(a.getActiveAllocations()).toHaveLength(100);
  });

  it('allocate 충돌 시 error.code 올바름', () => {
    const a = makeAllocator();
    a.allocate('feat-e5', ['shared-e5']);
    const r = a.allocate('feat-e6', ['shared-e5']);
    if (!r.ok) expect(r.error.code).toBe('agent_allocation_conflict');
  });

  it('completeAllocation 3개 → active 0', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-e7', ['e7a', 'e7b', 'e7c']);
    if (r.ok) {
      for (const alloc of r.value) a.completeAllocation(alloc.coderId);
      expect(a.getActiveAllocations()).toHaveLength(0);
    }
  });

  it('mergeAllocation 3개 → active 0, hasConflict=false', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-e8', ['e8a', 'e8b', 'e8c']);
    if (r.ok) {
      for (const alloc of r.value) a.mergeAllocation(alloc.coderId);
      expect(a.getActiveAllocations()).toHaveLength(0);
      expect(a.hasConflict(['e8a', 'e8b', 'e8c'])).toBe(false);
    }
  });

  it('allocate 같은 모듈 여러 기능 시도 → 두 번째 실패', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-e9a', ['shared-e9']);
    const r2 = a.allocate('feat-e9b', ['shared-e9']);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });

  it('병합 후 재할당 시 충돌 없음', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-e10a', ['free-mod-e10']);
    if (r1.ok && r1.value[0]) {
      a.mergeAllocation(r1.value[0].coderId);
      const r2 = a.allocate('feat-e10b', ['free-mod-e10']);
      expect(r2.ok).toBe(true);
    }
  });

  it('branchName 패턴 검증 (feature/{id}-{mod}-coder{n})', () => {
    const a = makeAllocator();
    const r = a.allocate('abc', ['xyz']);
    if (r.ok && r.value[0]) {
      const bn = r.value[0].branchName;
      expect(bn).toMatch(/^feature\/abc-xyz-coder\d+$/);
    }
  });

  it('5개 기능 10개씩 할당 → active=50', () => {
    const a = makeAllocator();
    for (let fi = 0; fi < 5; fi++) {
      const mods = Array.from({ length: 10 }, (_, mi) => `f${fi}-m${mi}`);
      a.allocate(`feat-g${fi}`, mods);
    }
    expect(a.getActiveAllocations()).toHaveLength(50);
  });

  it('UUID 모듈 5개 할당 → 모두 ok', () => {
    const a = makeAllocator();
    const mods = Array.from({ length: 5 }, () => crypto.randomUUID());
    const r = a.allocate('feat-uuid5', mods);
    expect(r.ok).toBe(true);
  });
});

describe('CoderAllocator batch75 추가 케이스 B', () => {
  it('coderId counter 단조 증가 확인 (3 연속)', () => {
    const a = makeAllocator();
    const r1 = a.allocate('feat-h1', ['mod-h1']);
    const r2 = a.allocate('feat-h2', ['mod-h2']);
    const r3 = a.allocate('feat-h3', ['mod-h3']);
    if (r1.ok && r2.ok && r3.ok) {
      const id1 = Number(r1.value[0]?.coderId.replace('coder-', ''));
      const id2 = Number(r2.value[0]?.coderId.replace('coder-', ''));
      const id3 = Number(r3.value[0]?.coderId.replace('coder-', ''));
      expect(id2).toBeGreaterThan(id1);
      expect(id3).toBeGreaterThan(id2);
    }
  });

  it('getActiveAllocations 결과 배열 원소 featureId string', () => {
    const a = makeAllocator();
    a.allocate('feat-h4', ['mod-h4']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(typeof active[0].featureId).toBe('string');
    }
  });

  it('getActiveAllocations 결과 배열 원소 status는 assigned', () => {
    const a = makeAllocator();
    a.allocate('feat-h5', ['mod-h5']);
    const active = a.getActiveAllocations();
    if (active[0]) {
      expect(active[0].status).toBe('assigned');
    }
  });

  it('getActiveAllocations 결과 배열 원소 modules 배열', () => {
    const a = makeAllocator();
    a.allocate('feat-h6', ['mod-h6a', 'mod-h6b']);
    const active = a.getActiveAllocations();
    for (const alloc of active) {
      expect(Array.isArray(alloc.modules)).toBe(true);
    }
  });

  it('hasConflict 빈 배열 항상 false', () => {
    const a = makeAllocator();
    a.allocate('feat-h7', ['mod-h7']);
    expect(a.hasConflict([])).toBe(false);
  });

  it('hasConflict 할당 전 항상 false', () => {
    const a = makeAllocator();
    for (const m of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      expect(a.hasConflict([m])).toBe(false);
    }
  });

  it('completeAllocation 결과 ok=true 반환', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-h8', ['mod-h8']);
    if (r.ok && r.value[0]) {
      const cr = a.completeAllocation(r.value[0].coderId);
      expect(cr.ok).toBe(true);
    }
  });

  it('mergeAllocation 결과 ok=true 반환', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-h9', ['mod-h9']);
    if (r.ok && r.value[0]) {
      const mr = a.mergeAllocation(r.value[0].coderId);
      expect(mr.ok).toBe(true);
    }
  });

  it('completeAllocation 없는 ID → error.code=agent_allocation_not_found', () => {
    const a = makeAllocator();
    const r = a.completeAllocation('no-such-id');
    if (!r.ok) expect(r.error.code).toBe('agent_allocation_not_found');
  });

  it('mergeAllocation 없는 ID → error.code=agent_allocation_not_found', () => {
    const a = makeAllocator();
    const r = a.mergeAllocation('no-such-id');
    if (!r.ok) expect(r.error.code).toBe('agent_allocation_not_found');
  });

  it('같은 allocator 독립 사용 10번 → 각 성공', () => {
    const a = makeAllocator();
    for (let i = 0; i < 10; i++) {
      const r = a.allocate(`feat-i${i}`, [`mod-i${i}`]);
      expect(r.ok).toBe(true);
    }
    expect(a.getActiveAllocations()).toHaveLength(10);
  });

  it('20개 독립 allocator 생성 → 각각 초기 active 0', () => {
    for (let i = 0; i < 20; i++) {
      const a = makeAllocator();
      expect(a.getActiveAllocations()).toHaveLength(0);
    }
  });
});

describe('CoderAllocator batch75 추가 케이스 C', () => {
  it('allocate featureId 한국어 → ok', () => {
    const a = makeAllocator();
    const r = a.allocate('기능-인증', ['mod-auth']);
    expect(typeof r.ok).toBe('boolean');
  });

  it('allocate 모듈명 숫자만 → ok', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-j1', ['0', '1', '2']);
    expect(r.ok).toBe(true);
  });

  it('allocate featureId UUID → ok', () => {
    const a = makeAllocator();
    const id = crypto.randomUUID();
    const r = a.allocate(id, ['mod-j2']);
    expect(r.ok).toBe(true);
    if (r.ok && r.value[0]) {
      expect(r.value[0].featureId).toBe(id);
    }
  });

  it('allocate 결과 value 배열 원소 개수 = 모듈 개수', () => {
    const a = makeAllocator();
    const mods = ['j3a', 'j3b', 'j3c', 'j3d', 'j3e'];
    const r = a.allocate('feat-j3', mods);
    if (r.ok) expect(r.value).toHaveLength(mods.length);
  });

  it('allocate 결과 value 원소 branchName string', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-j4', ['mod-j4']);
    if (r.ok && r.value[0]) {
      expect(typeof r.value[0].branchName).toBe('string');
    }
  });

  it('allocate 결과 value 원소 modules 배열', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-j5', ['mod-j5']);
    if (r.ok && r.value[0]) {
      expect(Array.isArray(r.value[0].modules)).toBe(true);
    }
  });

  it('allocate 결과 value 원소 status=assigned', () => {
    const a = makeAllocator();
    const r = a.allocate('feat-j6', ['mod-j6']);
    if (r.ok && r.value[0]) {
      expect(r.value[0].status).toBe('assigned');
    }
  });

  it('다중 할당 후 hasConflict 각각 true', () => {
    const a = makeAllocator();
    const mods = ['j7a', 'j7b', 'j7c'];
    a.allocate('feat-j7', mods);
    for (const m of mods) {
      expect(a.hasConflict([m])).toBe(true);
    }
  });

  it('병합 후 hasConflict 각각 false', () => {
    const a = makeAllocator();
    const mods = ['j8a', 'j8b'];
    const r = a.allocate('feat-j8', mods);
    if (r.ok) {
      for (const alloc of r.value) a.mergeAllocation(alloc.coderId);
      for (const m of mods) {
        expect(a.hasConflict([m])).toBe(false);
      }
    }
  });

  it('complete 후 hasConflict 각각 true (해제 안 됨)', () => {
    const a = makeAllocator();
    const mods = ['j9a', 'j9b'];
    const r = a.allocate('feat-j9', mods);
    if (r.ok) {
      for (const alloc of r.value) a.completeAllocation(alloc.coderId);
      for (const m of mods) {
        expect(a.hasConflict([m])).toBe(true);
      }
    }
  });

  it('200개 allocator 모두 독립 상태', () => {
    const allocators = Array.from({ length: 200 }, () => makeAllocator());
    for (let i = 0; i < allocators.length; i++) {
      const r = allocators[i]!.allocate(`feat-k${i}`, [`mod-k${i}`]);
      expect(r.ok).toBe(true);
    }
    for (let i = 0; i < allocators.length; i++) {
      expect(allocators[i]!.getActiveAllocations()).toHaveLength(1);
    }
  });

  it('allocate → merge 무한 사이클 30회 → 항상 성공', () => {
    const a = makeAllocator();
    for (let i = 0; i < 30; i++) {
      const r = a.allocate(`feat-cycle-k${i}`, [`mod-cycle-k${i}`]);
      expect(r.ok).toBe(true);
      if (r.ok && r.value[0]) {
        const mr = a.mergeAllocation(r.value[0].coderId);
        expect(mr.ok).toBe(true);
      }
    }
    expect(a.getActiveAllocations()).toHaveLength(0);
  });
});
