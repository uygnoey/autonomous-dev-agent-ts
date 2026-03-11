/**
 * SkillMerger 구현 / SkillMerger implementation
 *
 * @description
 * KR: .claude/skills 폴더에서 {name}/SKILL.md 패턴의 파일을 스캔하고
 *     여러 skill을 단일 문자열로 병합한다. Bun.Glob + Bun.file() 사용.
 * EN: Scans {name}/SKILL.md pattern files from .claude/skills directories
 *     and merges multiple skills into a single string. Uses Bun.Glob + Bun.file().
 */

import { join } from 'node:path';
import { Glob } from 'bun';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type {
  ISkillMerger,
  SkillFile,
  SkillMergeOptions,
  SkillReference,
} from 'core/skill-merger-types.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 상수 ─────────────────────────────────────────────────────

/** 기본 skill 구분자 */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

/** skill 파일 glob 패턴 */
const SKILL_GLOB_PATTERN = '*/SKILL.md';

/** references 폴더 glob 패턴 */
const REFERENCES_GLOB_PATTERN = '*.md';

// ── 헬퍼 함수 ────────────────────────────────────────────────

/**
 * 디렉토리에서 SKILL.md 파일 목록을 스캔한다 / Scan a directory for SKILL.md files
 *
 * @param dir - 스캔할 디렉토리 경로
 * @param source - 'project' | 'global'
 * @param includeReferences - references 폴더도 스캔할지 여부
 * @param logger - 로거
 * @returns SkillFile 배열. 디렉토리가 없으면 빈 배열.
 */
async function scanDir(
  dir: string,
  source: 'project' | 'global',
  includeReferences: boolean,
  logger: Logger,
): Promise<readonly SkillFile[]> {
  const results: SkillFile[] = [];
  const glob = new Glob(SKILL_GLOB_PATTERN);

  try {
    for await (const relativePath of glob.scan({ cwd: dir, onlyFiles: true })) {
      // relativePath = 'skill-name/SKILL.md' (or 'skill-name\SKILL.md' on Windows)
      // WHY: Windows에서 Glob이 백슬래시를 반환하므로 양쪽 구분자 처리
      const normalized = relativePath.replace(/\\/g, '/');
      const skillName = normalized.split('/')[0];
      if (!skillName) continue;

      const absolutePath = join(dir, relativePath);
      const file = Bun.file(absolutePath);

      const exists = await file.exists();
      if (!exists) continue;

      let content: string;
      try {
        content = await file.text();
      } catch (readError: unknown) {
        logger.warn('SKILL.md 읽기 실패 / Failed to read SKILL.md', {
          path: absolutePath,
          error: String(readError),
        });
        continue;
      }

      let references: readonly SkillReference[] | undefined;
      if (includeReferences) {
        references = await scanReferences(dir, skillName, logger);
      }

      results.push({
        name: skillName,
        content,
        path: absolutePath,
        source,
        ...(references !== undefined ? { references } : {}),
      });
    }
  } catch (scanError: unknown) {
    // WHY: 디렉토리 없음 / 접근 불가 → 에러가 아닌 빈 배열 반환
    logger.debug('skill 디렉토리 스캔 실패 / Failed to scan skill directory', {
      dir,
      error: String(scanError),
    });
  }

  return results;
}

/**
 * skill의 references 폴더를 스캔한다 / Scan references/ folder for a skill
 *
 * @param baseDir - skill 루트 디렉토리
 * @param skillName - skill 이름
 * @param logger - 로거
 * @returns SkillReference 배열
 */
async function scanReferences(
  baseDir: string,
  skillName: string,
  logger: Logger,
): Promise<readonly SkillReference[]> {
  const refsDir = join(baseDir, skillName, 'references');
  const results: SkillReference[] = [];
  const glob = new Glob(REFERENCES_GLOB_PATTERN);

  try {
    for await (const fileName of glob.scan({ cwd: refsDir, onlyFiles: true })) {
      const refPath = join(refsDir, fileName);
      const file = Bun.file(refPath);

      const exists = await file.exists();
      if (!exists) continue;

      try {
        const content = await file.text();
        // WHY: 확장자 제거하여 이름만 추출
        const name = fileName.replace(/\.md$/, '');
        results.push({ name, content });
      } catch (readError: unknown) {
        logger.warn('reference 파일 읽기 실패 / Failed to read reference file', {
          path: refPath,
          error: String(readError),
        });
      }
    }
  } catch {
    // WHY: references 폴더 없음 → 무시
  }

  return results;
}

// ── SkillMerger 구현 ─────────────────────────────────────────

/**
 * skill 파일 스캔·병합 구현체 / Implementation of ISkillMerger
 *
 * @example
 * const merger = new SkillMerger(logger);
 * const result = await merger.scan('./.claude/skills', '~/.claude/skills');
 * if (result.ok) {
 *   const merged = merger.merge(result.value, { includeReferences: true });
 * }
 */
export class SkillMerger implements ISkillMerger {
  constructor(private readonly logger: Logger) {}

  /**
   * 프로젝트/글로벌 skill 디렉토리를 스캔한다.
   * Scans project and global skill directories.
   *
   * @param projectSkillsDir - 프로젝트 skill 루트 경로
   * @param globalSkillsDir - 글로벌 skill 루트 경로
   * @returns 성공 시 SkillFile[] (project가 global 덮어씀)
   */
  async scan(
    projectSkillsDir?: string,
    globalSkillsDir?: string,
  ): Promise<Result<readonly SkillFile[]>> {
    // WHY: includeReferences는 scan 시점이 아닌 merge 옵션에서 제어하므로
    //      scan에서는 항상 references를 로드하여 캐싱
    try {
      const globalSkills = globalSkillsDir
        ? await scanDir(globalSkillsDir, 'global', true, this.logger)
        : [];

      const projectSkills = projectSkillsDir
        ? await scanDir(projectSkillsDir, 'project', true, this.logger)
        : [];

      // WHY: project가 global을 덮어씌워야 하므로 Map에서 global 먼저, project 나중에 삽입
      const skillMap = new Map<string, SkillFile>();

      for (const skill of globalSkills) {
        skillMap.set(skill.name, skill);
      }
      for (const skill of projectSkills) {
        skillMap.set(skill.name, skill);
      }

      const sorted = [...skillMap.values()].sort((a, b) => a.name.localeCompare(b.name));

      this.logger.debug('skill 스캔 완료 / Skill scan completed', {
        total: sorted.length,
        projectCount: projectSkills.length,
        globalCount: globalSkills.length,
      });

      return ok(sorted);
    } catch (error: unknown) {
      return err(new AdevError('skill_scan_failed', 'skill 디렉토리 스캔 중 오류 발생', error));
    }
  }

  /**
   * SkillFile 목록을 단일 문자열로 병합한다.
   * Merges skill files into a single string.
   *
   * @param skills - 병합할 skill 목록
   * @param options - 병합 옵션
   * @returns 성공 시 병합된 문자열
   */
  merge(skills: readonly SkillFile[], options?: SkillMergeOptions): Result<string> {
    try {
      const separator = options?.separator ?? DEFAULT_SEPARATOR;
      const includeReferences = options?.includeReferences ?? false;
      const filterNames = options?.filterNames;

      let filtered = skills;
      if (filterNames !== undefined) {
        // WHY: filterNames가 빈 배열이면 아무것도 포함하지 않음 (모두 제외)
        const nameSet = new Set(filterNames);
        filtered = skills.filter((s) => nameSet.has(s.name));
      }

      if (filtered.length === 0) {
        return ok('');
      }

      const parts: string[] = [];

      for (const skill of filtered) {
        let section = `## ${skill.name}\n${skill.content}`;

        if (includeReferences && skill.references && skill.references.length > 0) {
          const refParts = skill.references.map(
            (ref) => `### references/${ref.name}\n${ref.content}`,
          );
          section += `\n\n${refParts.join('\n\n')}`;
        }

        parts.push(section);
      }

      return ok(parts.join(separator));
    } catch (error: unknown) {
      return err(new AdevError('skill_merge_failed', 'skill 병합 중 오류 발생', error));
    }
  }
}
