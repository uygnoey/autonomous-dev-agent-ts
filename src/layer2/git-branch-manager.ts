/**
 * Git 브랜치 관리자 / Git Branch Manager
 *
 * @description
 * KR: 피처 브랜치 생성/체크아웃 및 베이스 브랜치로 병합을 담당한다.
 *     ProcessExecutor를 통해 git 명령을 실행하고 결과를 AgentEvent 스트림으로 yield한다.
 * EN: Manages feature branch creation/checkout and merging into base branch.
 *     Executes git commands via ProcessExecutor and yields results as AgentEvent stream.
 */

import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import type { Result } from 'core/types.js';
import { collectConflictedFiles, executeGit } from 'layer2/git-branch-utils.js';
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
   * Git 레포지토리 여부를 확인하고 없으면 초기화한다 / Ensure git repository exists
   *
   * @description
   * KR: `.git` 디렉토리가 없으면 `git init`과 빈 초기 커밋을 생성한다.
   *     fullrun처럼 새 프로젝트 디렉토리에서 시작할 때 setupBranch 전에 호출해야 한다.
   * EN: Runs `git init` and an empty initial commit when `.git` is absent.
   *     Must be called before setupBranch when starting from a fresh project directory.
   *
   * @returns AgentEvent 스트림 / AgentEvent stream
   */
  async *ensureGitRepo(): AsyncIterable<AgentEvent> {
    // WHY: rev-parse --git-dir 은 git repo 안에서만 0을 반환 — 가장 가벼운 감지 방법
    const checkResult = await this.git(['rev-parse', '--git-dir']);
    if (checkResult.ok) {
      this.logger.debug('git repo 이미 존재 — init 생략', { cwd: this.cwd });
      return;
    }

    this.logger.info('git repo 없음 — git init 실행', { cwd: this.cwd });

    const initResult = await this.git(['init']);
    if (!initResult.ok) {
      yield createEvent('error', `git init 실패: ${initResult.error.message}`);
      return;
    }

    // WHY: git init 직후에는 HEAD가 없어 브랜치 생성이 불가능하다.
    //      빈 커밋 1개를 만들어야 main 브랜치가 확정되고 feature 브랜치 분기가 가능해진다.
    const commitResult = await this.git(['commit', '--allow-empty', '-m', 'chore: init project']);
    if (!commitResult.ok) {
      yield createEvent('error', `초기 커밋 실패: ${commitResult.error.message}`);
      return;
    }

    this.logger.info('git init + 초기 커밋 완료', { cwd: this.cwd });
    yield createEvent('message', 'git 저장소 초기화 완료');
  }

  /**
   * 브랜치를 생성하거나 체크아웃한다 / Create or checkout a branch
   *
   * @description
   * KR: 브랜치가 없으면 생성 후 체크아웃, 이미 있으면 바로 체크아웃한다.
   *     두 번의 시도 모두 실패하면 error event를 yield한다.
   *     git repo가 없는 경우를 대비해 ensureGitRepo()를 먼저 호출한다.
   * EN: Creates and checks out new branch, or checks out existing one.
   *     Yields error event if both attempts fail.
   *     Calls ensureGitRepo() first to handle fresh project directories.
   *
   * @param branchName - 브랜치 이름 / Branch name
   * @returns AgentEvent 스트림 / AgentEvent stream
   */
  async *setupBranch(branchName: string): AsyncIterable<AgentEvent> {
    this.logger.info('브랜치 셋업 시작', { branchName, cwd: this.cwd });

    // WHY: fullrun처럼 새 디렉토리에서 시작할 때 git repo가 없으면 checkout이 즉시 실패한다.
    for await (const event of this.ensureGitRepo()) {
      yield event;
      if (event.type === 'error') return;
    }

    // WHY: 먼저 새 브랜치 생성 시도. 이미 존재하면 exitCode !== 0
    const createResult = await this.git(['checkout', '-b', branchName]);

    if (createResult.ok) {
      this.logger.info('새 브랜치 생성 성공', { branchName });
      yield createEvent('message', `브랜치 생성 완료: ${branchName}`);
      return;
    }

    // WHY: M-003 — checkout 실패 메시지에서 dirty working tree 감지 시 경고 로그
    //      별도 git status 호출 없이 기존 흐름을 변경하지 않는다
    this.warnIfDirtyWorkingTree(createResult.error.message, branchName);

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

    // WHY: M-003 — 두 번째 checkout도 dirty tree일 수 있으므로 재확인
    this.warnIfDirtyWorkingTree(checkoutResult.error.message, branchName);

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
    const conflictedFiles = await collectConflictedFiles(this.processExecutor, this.cwd);
    const fileList = conflictedFiles.join(', ') || '(파일 목록 없음)';

    this.logger.warn('병합 충돌 발생 — abort 수행', { branchName, conflictedFiles });

    // WHY: MERGE_HEAD가 존재할 때만 abort 실행. 없으면 fatal 에러 발생
    const mergeHeadCheck = await this.git(['rev-parse', '--verify', 'MERGE_HEAD']);
    if (mergeHeadCheck.ok) {
      const abortResult = await this.git(['merge', '--abort']);
      if (!abortResult.ok) {
        this.logger.error('merge --abort 실패', { error: abortResult.error.message });
      }
    } else {
      this.logger.debug('MERGE_HEAD 없음 — abort 생략');
    }

    // WHY: PI-004 — 충돌 해결을 위한 팀 논의 프롬프트를 함께 반환한다.
    //      상위 계층(ParallelCoderRunner/executeCodePhase)에서 이 프롬프트를 에이전트에 전달할 수 있다.
    const conflictPrompt = this.buildConflictResolutionPrompt(branchName, conflictedFiles, '');
    yield {
      type: 'error',
      agentName: 'architect',
      content: `병합 충돌: ${branchName} — 충돌 파일: [${fileList}]`,
      timestamp: new Date(),
      metadata: {
        conflictedFiles,
        conflictResolutionPrompt: conflictPrompt,
      },
    };
  }

  /**
   * 병합 충돌 해결을 위한 팀 논의 프롬프트를 생성한다 / Builds conflict resolution prompt for team discussion
   *
   * @description
   * KR: 충돌 파일 목록과 참여 에이전트 역할을 포함한 프롬프트를 생성한다.
   *     실제 에이전트 spawn은 상위 계층(ParallelCoderRunner/executeCodePhase)에서 수행한다.
   * EN: Generates a prompt containing conflicted files and participating agent roles.
   *     Actual agent spawning is handled by the upper layer (ParallelCoderRunner/executeCodePhase).
   *
   * @param branchName - 충돌이 발생한 브랜치 이름 / Branch name with conflicts
   * @param conflictedFiles - 충돌 파일 목록 / List of conflicted files
   * @param featureId - 기능 ID / Feature ID
   * @returns 충돌 해결 프롬프트 / Conflict resolution prompt
   */
  buildConflictResolutionPrompt(
    branchName: string,
    conflictedFiles: readonly string[],
    featureId: string,
  ): string {
    return [
      `[충돌 해결 요청] featureId=${featureId}, branch=${branchName}`,
      `충돌 파일: ${conflictedFiles.join(', ')}`,
      '참여 에이전트: architect(설계 준수), coder(구현), qa(품질), qc(원인분석), reviewer(최종확인)',
      '각 충돌 파일에 대해 어느 변경사항을 채택할지 합의하여 해결 방안을 제시하라.',
    ].join('\n');
  }

  /**
   * 변경사항을 스테이징하고 커밋한다 / Stage and commit changes
   *
   * @description
   * KR: `git add -A`로 모든 변경사항을 스테이징하고 지정된 메시지로 커밋한다.
   *     CODE Phase 완료 후 coder 작업을 브랜치에 저장하기 위해 호출된다.
   * EN: Stages all changes with `git add -A` then commits with the given message.
   *     Called after CODE phase completes to persist coder's work to the branch.
   *
   * @param message - 커밋 메시지 / Commit message
   * @returns AgentEvent 스트림 / AgentEvent stream
   */
  async *commitChanges(message: string): AsyncIterable<AgentEvent> {
    this.logger.info('변경사항 커밋 시작', { message, cwd: this.cwd });

    const addResult = await this.git(['add', '-A']);
    if (!addResult.ok) {
      this.logger.error('git add 실패', { error: addResult.error.message });
      yield createEvent('error', `git add 실패: ${addResult.error.message}`);
      return;
    }

    const commitResult = await this.git(['commit', '-m', message]);
    if (!commitResult.ok) {
      // WHY: "nothing to commit" 은 에러가 아님 — 변경사항 없을 때 정상 종료
      if (
        commitResult.error.message.includes('nothing to commit') ||
        commitResult.error.message.includes('nothing added to commit')
      ) {
        this.logger.info('커밋할 변경사항 없음 — 스킵', { message });
        yield createEvent('message', '커밋할 변경사항 없음 — 스킵');
        return;
      }
      this.logger.error('git commit 실패', { error: commitResult.error.message });
      yield createEvent('error', `git commit 실패: ${commitResult.error.message}`);
      return;
    }

    this.logger.info('커밋 완료', { message });
    yield createEvent('message', `커밋 완료: ${message}`);
  }

  /**
   * checkout 실패 메시지에서 dirty working tree를 감지하여 경고 로그를 남긴다
   * Warns if checkout failure message indicates dirty working tree
   *
   * @description
   * KR: M-003 — 별도 git status 호출 없이 에러 메시지 분석으로 uncommitted changes를 감지한다.
   *     git checkout은 dirty tree일 때 "Your local changes to the following files would be overwritten"
   *     또는 "Please commit your changes or stash them" 메시지를 반환한다.
   * EN: M-003 — Detects uncommitted changes from error message without extra git status call.
   *
   * @param errorMessage - checkout 실패 에러 메시지 / Checkout failure error message
   * @param branchName - 브랜치 이름 / Branch name
   */
  private warnIfDirtyWorkingTree(errorMessage: string, branchName: string): void {
    const dirtyIndicators = [
      'local changes',
      'would be overwritten',
      'please commit your changes',
      'stash them',
      'uncommitted changes',
    ];
    const lowerMsg = errorMessage.toLowerCase();
    if (dirtyIndicators.some((indicator) => lowerMsg.includes(indicator))) {
      this.logger.warn('브랜치 전환 실패 — uncommitted changes 감지', {
        branch: branchName,
        hint: errorMessage.slice(0, 200),
      });
    }
  }

  /**
   * git 명령을 실행한다 / Execute a git command
   *
   * @param args - git 인자 / git arguments
   * @returns 표준 출력 또는 에러 / stdout or error
   */
  private async git(args: readonly string[]): Promise<Result<string, AdevError>> {
    return executeGit(this.processExecutor, args, this.cwd);
  }
}
