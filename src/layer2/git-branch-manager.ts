/**
 * Git 브랜치 관리자 / Git Branch Manager
 *
 * @description
 * KR: 피처 브랜치 생성/체크아웃 및 베이스 브랜치로 병합을 담당한다.
 *     ProcessExecutor를 통해 git 명령을 실행하고 결과를 AgentEvent 스트림으로 yield한다.
 * EN: Manages feature branch creation/checkout and merging into base branch.
 *     Executes git commands via ProcessExecutor and yields results as AgentEvent stream.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import { createEvent } from 'layer2/team-leader-helpers.js';
import type { AgentEvent } from 'layer2/types.js';

// ── 타입 / Types ─────────────────────────────────────────────────

/**
 * GitBranchManager 의존성 / GitBranchManager dependencies
 *
 * @description
 * KR: 생성자 주입으로 받는 의존성 객체.
 * EN: Dependency object received via constructor injection.
 */
export interface GitBranchManagerDeps {
  readonly processExecutor: ProcessExecutor;
  readonly logger: Logger;
  /** 작업 디렉토리 / Working directory (default: process.cwd()) */
  readonly cwd?: string;
}

// ── GitBranchManager ─────────────────────────────────────────────

/**
 * Git 브랜치 관리자 / Git branch manager
 *
 * @description
 * KR: 피처 브랜치 생성/체크아웃과 병합 흐름을 AgentEvent 스트림으로 제공한다.
 *     충돌 발생 시 자동으로 merge --abort를 수행하고 충돌 파일 목록을 반환한다.
 * EN: Provides feature branch setup and merge flow as AgentEvent stream.
 *     On conflict, auto-aborts merge and returns conflicted file list.
 *
 * @example
 * const manager = new GitBranchManager({ processExecutor, logger });
 * for await (const event of manager.setupBranch('feature/my-feature')) {
 *   if (event.type === 'error') handleError(event.content);
 * }
 */
export class GitBranchManager {
  private readonly processExecutor: ProcessExecutor;
  private readonly logger: Logger;
  private readonly cwd: string;

  constructor(deps: GitBranchManagerDeps) {
    this.processExecutor = deps.processExecutor;
    this.logger = deps.logger.child({ module: 'git-branch-manager' });
    this.cwd = deps.cwd ?? process.cwd();
  }

  /**
   * 브랜치를 생성하거나 체크아웃한다 / Create or checkout a branch
   *
   * @description
   * KR: 브랜치가 없으면 생성 후 체크아웃, 이미 있으면 바로 체크아웃한다.
   *     두 번의 시도 모두 실패하면 error event를 yield한다.
   * EN: Creates and checks out new branch, or checks out existing one.
   *     Yields error event if both attempts fail.
   *
   * @param branchName - 브랜치 이름 / Branch name
   * @returns AgentEvent 스트림 / AgentEvent stream
   */
  async *setupBranch(branchName: string): AsyncIterable<AgentEvent> {
    this.logger.info('브랜치 셋업 시작', { branchName, cwd: this.cwd });

    // WHY: 먼저 새 브랜치 생성 시도. 이미 존재하면 exitCode !== 0
    const createResult = await this.git(['checkout', '-b', branchName]);

    if (createResult.ok) {
      this.logger.info('새 브랜치 생성 성공', { branchName });
      yield createEvent('message', `브랜치 생성 완료: ${branchName}`);
      return;
    }

    // WHY: 이미 존재하는 브랜치이므로 checkout 재시도
    this.logger.debug('브랜치 이미 존재 — checkout 재시도', {
      branchName,
      reason: createResult.error.message,
    });

    const checkoutResult = await this.git(['checkout', branchName]);

    if (checkoutResult.ok) {
      this.logger.info('기존 브랜치 체크아웃 성공', { branchName });
      yield createEvent('message', `브랜치 체크아웃 완료: ${branchName}`);
      return;
    }

    // WHY: 재시도도 실패 → error event yield 후 종료
    this.logger.error('브랜치 셋업 실패', {
      branchName,
      error: checkoutResult.error.message,
    });
    yield createEvent('error', `브랜치 셋업 실패: ${branchName} — ${checkoutResult.error.message}`);
  }

  /**
   * 피처 브랜치를 베이스 브랜치에 병합한다 / Merge feature branch into base branch
   *
   * @description
   * KR: 베이스 브랜치로 체크아웃 후 --no-ff 병합한다.
   *     충돌 발생 시 충돌 파일 목록을 수집하고 merge --abort를 수행한다.
   * EN: Checks out base branch then performs --no-ff merge.
   *     On conflict, collects conflicted files and runs merge --abort.
   *
   * @param branchName - 병합할 브랜치 이름 / Branch name to merge
   * @param baseBranch - 대상 베이스 브랜치 (기본: 'main') / Target base branch (default: 'main')
   * @returns AgentEvent 스트림 / AgentEvent stream
   */
  async *mergeBranch(branchName: string, baseBranch = 'main'): AsyncIterable<AgentEvent> {
    this.logger.info('브랜치 병합 시작', { branchName, baseBranch, cwd: this.cwd });

    // 1. 베이스 브랜치 체크아웃
    const checkoutResult = await this.git(['checkout', baseBranch]);
    if (!checkoutResult.ok) {
      this.logger.error('베이스 브랜치 체크아웃 실패', {
        baseBranch,
        error: checkoutResult.error.message,
      });
      yield createEvent(
        'error',
        `베이스 브랜치 체크아웃 실패: ${baseBranch} — ${checkoutResult.error.message}`,
      );
      return;
    }

    // 2. --no-ff 병합 시도
    const mergeResult = await this.git([
      'merge',
      '--no-ff',
      branchName,
      '-m',
      `merge: ${branchName}`,
    ]);

    if (mergeResult.ok) {
      this.logger.info('브랜치 병합 성공', { branchName, baseBranch });
      yield createEvent('message', `브랜치 병합 완료: ${branchName} → ${baseBranch}`);
      return;
    }

    // 3. 충돌 여부 확인 — 충돌 파일 목록 수집
    const conflictedFiles = await this.collectConflictedFiles();
    const fileList = conflictedFiles.join(', ') || '(파일 목록 없음)';

    this.logger.warn('병합 충돌 발생 — abort 수행', { branchName, conflictedFiles });

    // WHY: merge --abort로 상태 복원. 실패해도 계속 진행
    const abortResult = await this.git(['merge', '--abort']);
    if (!abortResult.ok) {
      this.logger.error('merge --abort 실패', { error: abortResult.error.message });
    }

    yield createEvent('error', `병합 충돌: ${branchName} — 충돌 파일: [${fileList}]`);
  }

  /**
   * git 명령을 실행한다 / Execute a git command
   *
   * @param args - git 인자 / git arguments
   * @returns 표준 출력 또는 에러 / stdout or error
   */
  private async git(args: readonly string[]): Promise<Result<string, AdevError>> {
    const result = await this.processExecutor.execute('git', args, { cwd: this.cwd });

    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      const detail = result.value.stderr || result.value.stdout || '알 수 없는 오류';
      return err(new AdevError('git_command_error', `git ${args[0]} 실패: ${detail.trim()}`));
    }

    return ok(result.value.stdout);
  }

  /**
   * 충돌 파일 목록을 수집한다 / Collect conflicted file paths
   *
   * @description
   * KR: `git diff --name-only --diff-filter=U`로 충돌 파일을 나열한다.
   *     실패 시 빈 배열을 반환한다.
   * EN: Lists conflicted files via `git diff --name-only --diff-filter=U`.
   *     Returns empty array on failure.
   */
  private async collectConflictedFiles(): Promise<readonly string[]> {
    const result = await this.git(['diff', '--name-only', '--diff-filter=U']);
    if (!(result.ok && result.value.trim())) {
      return [];
    }
    return result.value
      .trim()
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }
}
