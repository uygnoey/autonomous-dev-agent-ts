/**
 * 프로젝트 읽기 전용 핸들러 / Project read-only handler
 *
 * @description
 * KR: 프로젝트 목록 조회 등 읽기 전용 로직을 담당한다.
 * EN: Handles read-only project operations such as listing projects.
 */

import { resolve } from 'node:path';
import { loadRegistry } from 'cli/commands/project-registry.js';
import { bold, cyan, dim, green, yellow } from 'cli/tui/ansi.js';
import { getTerminalWidth } from 'cli/tui/renderer-box.js';
import type { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 내부 유틸 / Internal utilities ────────────────────────────────

/**
 * 문자열을 maxLen 이내로 잘라 '…'을 붙인다 / Truncate string to maxLen with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

/**
 * 프로젝트 목록을 사람이 읽기 좋은 테이블로 포맷한다 / Format project list as a human-readable table
 *
 * @description
 * KR: 마커 의미: ● = 현재 디렉토리와 일치(여기 있음), ★ = 글로벌 active fallback, · = 일반
 * EN: Markers: ● = cwd match (you are here), ★ = global active fallback, · = regular
 *
 * @param cwdProjectName - cwd와 경로가 일치하는 프로젝트 이름 / Project name matching cwd
 * @param activeProject - 레지스트리 글로벌 activeProject / Registry global activeProject
 * @param projects - 프로젝트 목록 / Project list
 * @returns 포맷된 문자열 / Formatted string
 */
function formatProjectTable(
  cwdProjectName: string | null,
  activeProject: string | null,
  projects: ReadonlyArray<{ name: string; path: string; status: string }>,
): string {
  const termWidth = getTerminalWidth();
  // 레이아웃: marker(2) + name(NAME_W) + sep(2) + path(나머지)
  const NAME_W = Math.min(40, Math.floor(termWidth * 0.35));
  const PATH_W = Math.max(20, termWidth - 2 - NAME_W - 2 - 2);

  const lines: string[] = [];

  // ── 헤더 / Header ──
  lines.push('');
  lines.push(`${bold('프로젝트 목록')}  ${dim(`총 ${projects.length}개`)}`);
  if (cwdProjectName) {
    lines.push(`${dim('현재 위치:')} ${cyan(cwdProjectName)}`);
  }
  if (activeProject && activeProject !== cwdProjectName) {
    lines.push(`${dim('글로벌 활성:')} ${yellow(activeProject)}`);
  }
  lines.push('');

  // ── 범례 / Legend ──
  lines.push(
    `  ${cyan('●')} ${dim('현재 디렉토리')}  ${yellow('★')} ${dim('글로벌 활성')}  ${dim('·')} ${dim('일반')}`,
  );
  lines.push('');

  // ── 컬럼 헤더 / Column headers ──
  const nameHeader = 'NAME'.padEnd(NAME_W);
  const pathHeader = 'PATH';
  lines.push(`  ${dim(nameHeader)}  ${dim(pathHeader)}`);
  lines.push(`  ${dim('─'.repeat(NAME_W))}  ${dim('─'.repeat(Math.min(PATH_W, 50)))}`);

  // ── 행 / Rows ──
  for (const p of projects) {
    const isCwd = p.name === cwdProjectName;
    const isGlobalActive = !isCwd && p.name === activeProject;

    let marker: string;
    let nameStyled: string;
    const nameRaw = truncate(p.name, NAME_W).padEnd(NAME_W);

    if (isCwd) {
      marker = `${cyan('●')} `;
      nameStyled = bold(green(nameRaw));
    } else if (isGlobalActive) {
      marker = `${yellow('★')} `;
      nameStyled = bold(yellow(nameRaw));
    } else {
      marker = `${dim('·')} `;
      nameStyled = nameRaw;
    }

    const pathRaw = dim(truncate(p.path, PATH_W));
    lines.push(`${marker}${nameStyled}  ${pathRaw}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── 공개 함수 / Public functions ──────────────────────────────────

/**
 * 등록된 프로젝트 목록 표시 / List registered projects
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @param registryDir - 레지스트리 디렉토리 경로 / Registry directory path
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function listProjects(
  logger: Logger,
  registryDir: string,
): Promise<Result<void, AdevError>> {
  const registryResult = await loadRegistry(registryDir);
  if (!registryResult.ok) {
    return err((registryResult as Extract<typeof registryResult, { ok: false }>).error);
  }

  const registry = registryResult.value;

  // cwd와 경로가 일치하는 프로젝트를 "현재 위치"로 표시
  const cwd = resolve(process.cwd());
  const cwdProject = registry.projects.find((p) => resolve(p.path) === cwd);

  logger.debug('프로젝트 목록 조회 / Project list fetched', {
    cwd,
    cwdProject: cwdProject?.name ?? null,
    activeProject: registry.activeProject,
    count: registry.projects.length,
  });

  process.stdout.write(
    formatProjectTable(
      cwdProject?.name ?? null,
      registry.activeProject,
      registry.projects.map((p) => ({ name: p.name, path: p.path, status: p.status })),
    ),
  );

  return ok(undefined);
}
