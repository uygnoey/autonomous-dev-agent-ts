/**
 * Git 브랜치 유틸리티 / Git branch utilities
 *
 * @description
 * KR: GitBranchManager에서 분리된 git 명령 실행 헬퍼와 충돌 파일 수집 유틸리티.
 * EN: Git command execution helper and conflict file collection utility extracted from GitBranchManager.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * git 명령을 실행한다 / Execute a git command
 *
 * @param processExecutor - 프로세스 실행기 / Process executor
 * @param args - git 인자 / git arguments
 * @param cwd - 작업 디렉토리 / Working directory
 * @returns 표준 출력 또는 에러 / stdout or error
 */
export async function executeGit(
  processExecutor: ProcessExecutor,
  args: readonly string[],
  cwd: string,
): Promise<Result<string, AdevError>> {
  const result = await processExecutor.execute('git', args, { cwd });

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
 *
 * @param processExecutor - 프로세스 실행기 / Process executor
 * @param cwd - 작업 디렉토리 / Working directory
 * @returns 충돌 파일 경로 배열 / Conflicted file path array
 */
export async function collectConflictedFiles(
  processExecutor: ProcessExecutor,
  cwd: string,
): Promise<readonly string[]> {
  const result = await executeGit(processExecutor, ['diff', '--name-only', '--diff-filter=U'], cwd);
  if (!(result.ok && result.value.trim())) {
    return [];
  }
  return result.value
    .trim()
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}
