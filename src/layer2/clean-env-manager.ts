/**
 * 클린 환경 관리자 / Clean Environment Manager
 *
 * @description
 * KR: 통합 테스트를 위한 격리된 환경(임시 디렉토리)을 생성/소멸한다.
 *     테스트 환경 간 상태 오염을 방지한다.
 * EN: Creates and destroys isolated environments (temp directories)
 *     for integration testing. Prevents state contamination between tests.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';

/**
 * 클린 환경 관리자 / Clean Environment Manager
 *
 * @description
 * KR: 격리된 테스트 환경의 라이프사이클을 관리한다.
 * EN: Manages the lifecycle of isolated test environments.
 *
 * @example
 * const envManager = new CleanEnvManager(logger);
 * const result = await envManager.create('proj-1');
 * if (result.ok) {
 *   // 테스트 수행 / Run tests
 *   await envManager.destroy(result.value.envPath);
 * }
 */
export class CleanEnvManager {
  private readonly activeEnvs: Set<string> = new Set();
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'clean-env-manager' });
  }

  /**
   * 격리된 테스트 환경을 생성한다 / Creates an isolated test environment
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 생성된 환경 경로 / Created environment path
   */
  async create(projectId: string): Promise<Result<{ envPath: string }>> {
    try {
      const prefix = join(tmpdir(), `adev-${projectId}-`);
      const envPath = await mkdtemp(prefix);
      this.activeEnvs.add(envPath);

      this.logger.info('클린 환경 생성', { projectId, envPath });
      return ok({ envPath });
    } catch (error: unknown) {
      return err(
        new AgentError(
          'agent_env_create_failed',
          `클린 환경 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 테스트 환경을 소멸한다 / Destroys a test environment
   *
   * @param envPath - 소멸할 환경 경로 / Environment path to destroy
   * @returns 성공 시 ok / ok on success
   */
  async destroy(envPath: string): Promise<Result<void>> {
    if (!this.activeEnvs.has(envPath)) {
      return err(new AgentError('agent_env_not_found', `관리 중인 환경이 아닙니다: ${envPath}`));
    }

    try {
      await rm(envPath, { recursive: true, force: true });
      this.activeEnvs.delete(envPath);

      this.logger.info('클린 환경 소멸', { envPath });
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new AgentError(
          'agent_env_destroy_failed',
          `클린 환경 소멸 실패: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 환경이 클린 상태인지 확인한다 / Checks if environment is clean
   *
   * @description
   * KR: 환경 경로가 존재하고 활성 목록에 있는지 확인한다.
   * EN: Checks if environment path exists and is in the active set.
   *
   * @param envPath - 확인할 환경 경로 / Environment path to check
   * @returns 클린 여부 / Whether the environment is clean
   */
  isClean(envPath: string): boolean {
    return this.activeEnvs.has(envPath) && existsSync(envPath);
  }

  /**
   * 활성 환경 목록을 반환한다 / Returns list of active environments
   *
   * @returns 활성 환경 경로 배열 / Active environment path array
   */
  listActive(): string[] {
    return [...this.activeEnvs];
  }
}
