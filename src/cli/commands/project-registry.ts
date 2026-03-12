/**
 * 프로젝트 레지스트리 I/O / Project registry I/O
 *
 * @description
 * KR: 프로젝트 레지스트리(~/.adev/projects.json) 파일 읽기/쓰기를 담당한다.
 * EN: Handles reading/writing of project registry (~/.adev/projects.json) file.
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { ProjectRegistry } from 'cli/types.js';
import { AdevError } from 'core/errors.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

/**
 * 기본 글로벌 adev 디렉토리 경로 / Default global adev directory path
 */
export function getDefaultGlobalAdevDir(): string {
  return resolve(homedir(), '.adev');
}

/**
 * 프로젝트 레지스트리를 로드한다 / Load project registry
 *
 * @param registryDir - 레지스트리 디렉토리 (기본: ~/.adev) / Registry directory (default: ~/.adev)
 * @returns ProjectRegistry 또는 에러 / ProjectRegistry or error
 */
export async function loadRegistry(
  registryDir?: string,
): Promise<Result<ProjectRegistry, AdevError>> {
  const dir = registryDir ?? getDefaultGlobalAdevDir();
  const registryPath = resolve(dir, 'projects.json');

  try {
    const file = Bun.file(registryPath);
    if (!(await file.exists())) {
      return ok({ activeProject: null, projects: [] });
    }

    const text = await file.text();
    if (text.trim() === '') {
      return ok({ activeProject: null, projects: [] });
    }

    const parsed = JSON.parse(text) as ProjectRegistry;
    return ok(parsed);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_project_registry_read_failed',
        `레지스트리 파일 읽기 실패: ${String(error)}`,
        error,
      ),
    );
  }
}

/**
 * 프로젝트 레지스트리를 저장한다 / Save project registry
 *
 * @param registry - 저장할 레지스트리 / Registry to save
 * @param registryDir - 레지스트리 디렉토리 (기본: ~/.adev) / Registry directory (default: ~/.adev)
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function saveRegistry(
  registry: ProjectRegistry,
  registryDir?: string,
): Promise<Result<void, AdevError>> {
  const dir = registryDir ?? getDefaultGlobalAdevDir();
  const registryPath = resolve(dir, 'projects.json');

  try {
    await mkdir(dir, { recursive: true });
    await Bun.write(registryPath, JSON.stringify(registry, null, 2));
    return ok(undefined);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_project_registry_write_failed',
        `레지스트리 파일 쓰기 실패: ${String(error)}`,
        error,
      ),
    );
  }
}
