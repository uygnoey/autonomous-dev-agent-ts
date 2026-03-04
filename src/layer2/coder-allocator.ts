/**
 * Coder 할당기 / Coder Allocator
 *
 * @description
 * KR: 모듈 단위로 Coder를 배정한다.
 *     같은 파일을 2명 이상의 Coder가 수정하는 것을 방지한다.
 *     Git 브랜치 네이밍: feature/{featureId}-{module}-coderN
 * EN: Allocates coders on a per-module basis.
 *     Prevents multiple coders from editing the same file.
 *     Branch naming: feature/{featureId}-{module}-coderN
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { CoderAllocation } from './types.js';

/**
 * Coder 할당기 / Coder Allocator
 *
 * @description
 * KR: 모듈별 Coder 배정 및 충돌 방지를 관리한다.
 * EN: Manages per-module coder allocation and conflict prevention.
 *
 * @example
 * const allocator = new CoderAllocator(logger);
 * const result = allocator.allocate('feat-1', ['auth', 'user']);
 */
export class CoderAllocator {
  private readonly allocations: Map<string, CoderAllocation> = new Map();
  private readonly assignedModules: Set<string> = new Set();
  private coderCounter = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'coder-allocator' });
  }

  /**
   * 기능 모듈에 Coder를 할당한다 / Allocates coders to feature modules
   *
   * @description
   * KR: 각 모듈에 1명의 Coder를 배정한다. 충돌 시 에러를 반환한다.
   * EN: Assigns one coder per module. Returns error on conflict.
   *
   * @param featureId - 기능 ID / Feature ID
   * @param modules - 모듈 목록 / Module list
   * @returns 할당 결과 배열 / Allocation results
   */
  allocate(featureId: string, modules: string[]): Result<CoderAllocation[]> {
    if (this.hasConflict(modules)) {
      return err(
        new AgentError(
          'agent_allocation_conflict',
          '모듈 충돌: 이미 할당된 모듈이 포함되어 있습니다',
        ),
      );
    }

    const results: CoderAllocation[] = [];

    for (const mod of modules) {
      this.coderCounter += 1;
      const coderId = `coder-${this.coderCounter}`;
      const branchName = `feature/${featureId}-${mod}-coder${this.coderCounter}`;

      const allocation: CoderAllocation = {
        coderId,
        featureId,
        modules: [mod],
        branchName,
        status: 'assigned',
      };

      this.allocations.set(coderId, allocation);
      this.assignedModules.add(mod);
      results.push(allocation);
    }

    this.logger.info('Coder 할당 완료', {
      featureId,
      moduleCount: modules.length,
      coderCount: results.length,
    });

    return ok(results);
  }

  /**
   * 활성 할당 목록을 반환한다 / Returns active allocations
   *
   * @returns 완료/병합되지 않은 할당 목록 / Non-completed/merged allocations
   */
  getActiveAllocations(): CoderAllocation[] {
    return [...this.allocations.values()].filter(
      (a) => a.status === 'assigned' || a.status === 'working',
    );
  }

  /**
   * Coder 할당을 완료 처리한다 / Marks coder allocation as completed
   *
   * @param coderId - Coder ID / Coder ID
   * @returns 성공 시 ok / ok on success
   */
  completeAllocation(coderId: string): Result<void> {
    const allocation = this.allocations.get(coderId);
    if (!allocation) {
      return err(
        new AgentError('agent_allocation_not_found', `할당을 찾을 수 없습니다: ${coderId}`),
      );
    }

    const updated: CoderAllocation = { ...allocation, status: 'completed' };
    this.allocations.set(coderId, updated);

    this.logger.info('Coder 할당 완료', { coderId, featureId: allocation.featureId });
    return ok(undefined);
  }

  /**
   * Coder 할당을 병합 처리한다 / Marks coder allocation as merged
   *
   * @param coderId - Coder ID / Coder ID
   * @returns 성공 시 ok / ok on success
   */
  mergeAllocation(coderId: string): Result<void> {
    const allocation = this.allocations.get(coderId);
    if (!allocation) {
      return err(
        new AgentError('agent_allocation_not_found', `할당을 찾을 수 없습니다: ${coderId}`),
      );
    }

    const updated: CoderAllocation = { ...allocation, status: 'merged' };
    this.allocations.set(coderId, updated);

    // WHY: 병합 완료 후 모듈을 해제하여 재할당 가능하게 한다
    for (const mod of allocation.modules) {
      this.assignedModules.delete(mod);
    }

    this.logger.info('Coder 할당 병합', { coderId, featureId: allocation.featureId });
    return ok(undefined);
  }

  /**
   * 모듈 충돌 여부를 확인한다 / Checks for module conflicts
   *
   * @description
   * KR: 이미 할당된 모듈이 요청 모듈과 겹치는지 확인한다.
   * EN: Checks if any requested modules are already assigned.
   *
   * @param modules - 확인할 모듈 목록 / Modules to check
   * @returns 충돌 여부 / Whether conflicts exist
   */
  hasConflict(modules: string[]): boolean {
    return modules.some((mod) => this.assignedModules.has(mod));
  }
}
