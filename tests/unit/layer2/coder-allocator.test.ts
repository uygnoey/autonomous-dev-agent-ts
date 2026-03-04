/**
 * CoderAllocator 단위 테스트 / CoderAllocator unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { CoderAllocator } from '../../../src/layer2/coder-allocator.js';

describe('CoderAllocator', () => {
  let allocator: CoderAllocator;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    allocator = new CoderAllocator(logger);
  });

  describe('allocate / 할당', () => {
    it('모듈별로 Coder를 할당한다', () => {
      const result = allocator.allocate('feat-1', ['auth', 'user']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.modules).toContain('auth');
        expect(result.value[1]?.modules).toContain('user');
      }
    });

    it('브랜치 이름이 올바른 형식이다', () => {
      const result = allocator.allocate('feat-1', ['auth']);
      if (result.ok) {
        expect(result.value[0]?.branchName).toMatch(/^feature\/feat-1-auth-coder\d+$/);
      }
    });

    it('할당 상태가 assigned이다', () => {
      const result = allocator.allocate('feat-1', ['auth']);
      if (result.ok) {
        expect(result.value[0]?.status).toBe('assigned');
      }
    });

    it('이미 할당된 모듈에 대해 충돌 에러를 반환한다', () => {
      allocator.allocate('feat-1', ['auth']);
      const result = allocator.allocate('feat-2', ['auth']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_allocation_conflict');
      }
    });

    it('고유한 coderId를 생성한다', () => {
      const result = allocator.allocate('feat-1', ['auth', 'user']);
      if (result.ok) {
        expect(result.value[0]?.coderId).not.toBe(result.value[1]?.coderId);
      }
    });
  });

  describe('getActiveAllocations / 활성 할당', () => {
    it('assigned/working 상태의 할당만 반환한다', () => {
      const result = allocator.allocate('feat-1', ['auth', 'user']);
      if (result.ok) {
        const active = allocator.getActiveAllocations();
        expect(active).toHaveLength(2);
      }
    });

    it('완료된 할당은 제외한다', () => {
      const result = allocator.allocate('feat-1', ['auth']);
      if (result.ok) {
        allocator.completeAllocation(result.value[0]!.coderId);
        const active = allocator.getActiveAllocations();
        expect(active).toHaveLength(0);
      }
    });
  });

  describe('completeAllocation / 할당 완료', () => {
    it('할당 상태를 completed로 변경한다', () => {
      const allocResult = allocator.allocate('feat-1', ['auth']);
      if (allocResult.ok) {
        const result = allocator.completeAllocation(allocResult.value[0]!.coderId);
        expect(result.ok).toBe(true);
      }
    });

    it('존재하지 않는 할당은 에러를 반환한다', () => {
      const result = allocator.completeAllocation('non-existent');
      expect(result.ok).toBe(false);
    });
  });

  describe('mergeAllocation / 할당 병합', () => {
    it('할당 상태를 merged로 변경하고 모듈을 해제한다', () => {
      const allocResult = allocator.allocate('feat-1', ['auth']);
      if (allocResult.ok) {
        allocator.mergeAllocation(allocResult.value[0]!.coderId);

        // 병합 후 같은 모듈 재할당 가능
        const result = allocator.allocate('feat-2', ['auth']);
        expect(result.ok).toBe(true);
      }
    });

    it('존재하지 않는 할당은 에러를 반환한다', () => {
      const result = allocator.mergeAllocation('non-existent');
      expect(result.ok).toBe(false);
    });
  });

  describe('hasConflict / 충돌 확인', () => {
    it('할당된 모듈과 충돌하면 true를 반환한다', () => {
      allocator.allocate('feat-1', ['auth']);
      expect(allocator.hasConflict(['auth'])).toBe(true);
    });

    it('충돌이 없으면 false를 반환한다', () => {
      allocator.allocate('feat-1', ['auth']);
      expect(allocator.hasConflict(['user'])).toBe(false);
    });

    it('빈 모듈 배열은 충돌이 없다', () => {
      allocator.allocate('feat-1', ['auth']);
      expect(allocator.hasConflict([])).toBe(false);
    });
  });
});
