/**
 * TemplateLoader 구현 / TemplateLoader implementation
 *
 * @description
 * KR: .claude/templates 폴더에서 *.{md,hbs,txt} 파일을 스캔하고 로드한다.
 *     파일 크기 초과 시 건너뜀. project 우선순위 (동일 이름은 project가 global 덮어씀).
 * EN: Scans and loads *.{md,hbs,txt} files from .claude/templates directories.
 *     Skips files exceeding size limit. Project takes precedence over global.
 */

import { join } from 'node:path';
import { Glob } from 'bun';
import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { ALL_TEMPLATE_FORMATS, DEFAULT_MAX_FILE_SIZE_BYTES } from 'core/template-loader-types.js';
import type {
  ITemplateLoader,
  PromptTemplate,
  TemplateFormat,
  TemplateLoadOptions,
} from 'core/template-loader-types.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';

// ── 상수 ─────────────────────────────────────────────────────

/** 템플릿 파일 glob 패턴 */
const TEMPLATE_GLOB_PATTERN = '*.{md,hbs,txt}';

// ── 헬퍼 함수 ────────────────────────────────────────────────

/**
 * 파일 확장자를 TemplateFormat으로 변환한다 / Convert file extension to TemplateFormat
 */
function toTemplateFormat(ext: string): TemplateFormat | null {
  if (ext === 'md' || ext === 'hbs' || ext === 'txt') {
    return ext;
  }
  return null;
}

/**
 * 디렉토리에서 템플릿 파일 목록을 스캔한다 / Scan a directory for template files
 *
 * @param dir - 스캔할 디렉토리 경로
 * @param source - 'project' | 'global'
 * @param allowedFormats - 허용할 포맷 목록
 * @param maxFileSizeBytes - 최대 파일 크기 (bytes)
 * @param logger - 로거
 * @returns PromptTemplate 배열. 디렉토리 없으면 빈 배열.
 */
async function scanTemplateDir(
  dir: string,
  source: 'project' | 'global',
  allowedFormats: readonly TemplateFormat[],
  maxFileSizeBytes: number,
  logger: Logger,
): Promise<readonly PromptTemplate[]> {
  const results: PromptTemplate[] = [];
  const allowedSet = new Set<string>(allowedFormats);
  const glob = new Glob(TEMPLATE_GLOB_PATTERN);

  try {
    for await (const fileName of glob.scan({ cwd: dir, onlyFiles: true })) {
      const dotIndex = fileName.lastIndexOf('.');
      if (dotIndex === -1) continue;

      const ext = fileName.slice(dotIndex + 1).toLowerCase();
      const format = toTemplateFormat(ext);
      if (!format) continue;
      if (!allowedSet.has(format)) continue;

      const absolutePath = join(dir, fileName);
      const file = Bun.file(absolutePath);

      const exists = await file.exists();
      if (!exists) continue;

      // WHY: 파일 크기 초과 시 메모리 문제 방지를 위해 건너뜀
      const size = file.size;
      if (size > maxFileSizeBytes) {
        logger.warn('템플릿 파일 크기 초과 — 건너뜀 / Template file exceeds size limit — skipped', {
          path: absolutePath,
          sizeBytes: size,
          maxFileSizeBytes,
        });
        continue;
      }

      let content: string;
      try {
        content = await file.text();
      } catch (readError: unknown) {
        logger.warn('템플릿 파일 읽기 실패 / Failed to read template file', {
          path: absolutePath,
          error: String(readError),
        });
        continue;
      }

      // WHY: 확장자 포함 이름에서 마지막 .ext 제거
      const name = fileName.slice(0, dotIndex);

      results.push({
        name,
        content,
        format,
        path: absolutePath,
        source,
      });
    }
  } catch (scanError: unknown) {
    // WHY: 디렉토리 없음 / 접근 불가 → 에러가 아닌 빈 배열 반환
    logger.debug('템플릿 디렉토리 스캔 실패 / Failed to scan template directory', {
      dir,
      error: String(scanError),
    });
  }

  return results;
}

// ── TemplateLoader 구현 ──────────────────────────────────────

/**
 * 프롬프트 템플릿 파일 로더 구현체 / Implementation of ITemplateLoader
 *
 * @example
 * const loader = new TemplateLoader(logger);
 * const result = await loader.load('./.claude/templates', '~/.claude/templates', { formats: ['md'] });
 * if (result.ok) {
 *   const tpl = loader.getByName('system-prompt', result.value);
 * }
 */
export class TemplateLoader implements ITemplateLoader {
  constructor(private readonly logger: Logger) {}

  /**
   * 프로젝트/글로벌 템플릿 디렉토리에서 템플릿을 로드한다.
   * Loads templates from project and global directories.
   *
   * @param projectTemplatesDir - 프로젝트 템플릿 루트 경로
   * @param globalTemplatesDir - 글로벌 템플릿 루트 경로
   * @param options - 로드 옵션
   * @returns 성공 시 PromptTemplate[] (project가 global 덮어씀)
   */
  async load(
    projectTemplatesDir?: string,
    globalTemplatesDir?: string,
    options?: TemplateLoadOptions,
  ): Promise<Result<readonly PromptTemplate[]>> {
    try {
      const formats = options?.formats ?? ALL_TEMPLATE_FORMATS;
      const maxFileSizeBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

      const globalTemplates = globalTemplatesDir
        ? await scanTemplateDir(
            globalTemplatesDir,
            'global',
            formats,
            maxFileSizeBytes,
            this.logger,
          )
        : [];

      const projectTemplates = projectTemplatesDir
        ? await scanTemplateDir(
            projectTemplatesDir,
            'project',
            formats,
            maxFileSizeBytes,
            this.logger,
          )
        : [];

      // WHY: project가 global을 덮어씌워야 하므로 Map에서 global 먼저, project 나중에 삽입
      const templateMap = new Map<string, PromptTemplate>();

      for (const tpl of globalTemplates) {
        templateMap.set(tpl.name, tpl);
      }
      for (const tpl of projectTemplates) {
        templateMap.set(tpl.name, tpl);
      }

      const sorted = [...templateMap.values()].sort((a, b) => a.name.localeCompare(b.name));

      this.logger.debug('템플릿 로드 완료 / Template load completed', {
        total: sorted.length,
        projectCount: projectTemplates.length,
        globalCount: globalTemplates.length,
      });

      return ok(sorted);
    } catch (error: unknown) {
      return err(new AdevError('template_load_failed', '템플릿 디렉토리 로드 중 오류 발생', error));
    }
  }

  /**
   * 이름으로 템플릿을 찾는다. 없으면 undefined.
   * Finds a template by name.
   *
   * @param name - 찾을 템플릿 이름 (확장자 제외)
   * @param templates - 검색 대상 템플릿 목록
   * @returns 찾은 PromptTemplate 또는 undefined
   */
  getByName(name: string, templates: readonly PromptTemplate[]): PromptTemplate | undefined {
    return templates.find((t) => t.name === name);
  }
}
