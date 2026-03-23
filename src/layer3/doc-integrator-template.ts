/**
 * 문서 통합기 템플릿 관리 헬퍼 / Document integrator template management helpers
 *
 * @description
 * KR: DocIntegrator에서 분리된 템플릿 등록/조회/로드 로직을 제공한다.
 * EN: Provides template registration, listing, and loading logic extracted from DocIntegrator.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import { readTemplateSourceFile } from 'layer3/doc-integrator-fragment.js';
import type { IntegrateOptions } from 'layer3/doc-integrator-types.js';
import type { DocumentTemplate, IntegratedDocument, ProjectDocumentType } from 'layer3/types.js';

/** generateAll에서 유효한 프로젝트 문서 유형 / Valid project document types for generateAll */
const VALID_PROJECT_TYPES = new Set<string>([
  'readme',
  'api-reference',
  'architecture',
  'user-manual',
  'installation-guide',
  'test-report',
  'changelog',
  'contributing-guide',
]);

/**
 * 기본 템플릿을 레지스트리에 로드한다 / Load default templates into registry
 *
 * @param registry - 템플릿 레지스트리 맵 / Template registry map
 * @param logger - 로거 / Logger
 */
export function loadDefaultTemplates(
  registry: Map<string, DocumentTemplate>,
  logger: Logger,
): void {
  const defaultTypes: readonly ProjectDocumentType[] = [
    'readme',
    'api-reference',
    'architecture',
    'user-manual',
    'installation-guide',
    'test-report',
    'changelog',
    'contributing-guide',
  ];

  for (const type of defaultTypes) {
    const template: DocumentTemplate = {
      id: `default-${type}`,
      name: type,
      type,
      templatePath: `templates/project/${type}.hbs`,
      format: type === 'api-reference' ? 'html' : 'md',
      description: `Default ${type} template`,
      custom: false,
    };
    registry.set(template.id ?? `default-${type}`, template);
  }

  logger.debug('기본 템플릿 로드 완료', { count: registry.size });
}

/**
 * 사용 가능한 템플릿 목록을 조회한다 / List available templates
 *
 * @param registry - 템플릿 레지스트리 맵 / Template registry map
 * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
 * @returns 템플릿 배열 결과 / Template array result
 */
export async function listTemplates(
  registry: Map<string, DocumentTemplate>,
  includeCustom: boolean,
): Promise<Result<readonly DocumentTemplate[], Layer3Error>> {
  try {
    const allTemplates = Array.from(registry.values());
    const filtered = includeCustom ? allTemplates : allTemplates.filter((t) => !t.custom);
    return ok(filtered);
  } catch (cause) {
    const error = new Layer3Error('layer3_list_templates_failed', '템플릿 목록 조회 실패', cause);
    return err(error);
  }
}

/**
 * 커스텀 템플릿을 등록한다 / Register a custom template
 *
 * @description
 * KR: templatePath 파일 존재 여부를 Bun.file().exists()로 검증한 후 등록한다.
 * EN: Validates templatePath file existence with Bun.file().exists() before registration.
 *
 * @param registry - 템플릿 레지스트리 맵 / Template registry map
 * @param template - 템플릿 정의 / Template definition
 * @param logger - 로거 / Logger
 * @returns 등록 성공 여부 / Whether registration succeeded
 */
export async function registerTemplate(
  registry: Map<string, DocumentTemplate>,
  template: DocumentTemplate,
  logger: Logger,
): Promise<Result<void, Layer3Error>> {
  try {
    const templateId = template.id ?? `custom-${Date.now()}`;
    if (registry.has(templateId)) {
      return err(
        new Layer3Error('layer3_template_duplicate', `템플릿 ID가 이미 존재함: ${templateId}`),
      );
    }

    // WHY: 커스텀 템플릿의 파일 존재 확인 (Bun.file 사용) — 경고만 로그
    if (template.custom && template.templatePath) {
      try {
        const templateFile = Bun.file(template.templatePath);
        const exists = await templateFile.exists();
        if (!exists) {
          logger.warn('템플릿 파일이 존재하지 않음 (런타임 시 기본 템플릿 사용)', {
            templatePath: template.templatePath,
          });
        }
      } catch {
        logger.warn('템플릿 파일 존재 확인 실패', { templatePath: template.templatePath });
      }
    }

    registry.set(templateId, template);
    logger.info('커스텀 템플릿 등록 완료', { templateId, type: template.type });
    return ok(undefined);
  } catch (cause) {
    return err(
      new Layer3Error('layer3_register_template_failed', '커스텀 템플릿 등록 실패', cause),
    );
  }
}

/**
 * 모든 프로젝트 문서를 생성하는 내부 루프 / Inner loop for generating all project documents
 *
 * @description
 * KR: generateAll()의 템플릿별 통합 루프를 별도 함수로 추출하여 파일 크기를 준수한다.
 * EN: Extracted template-per-template integration loop from generateAll() to keep file size compliant.
 *
 * @param projectId - 프로젝트 ID / Project ID
 * @param outputDir - 출력 디렉토리 / Output directory
 * @param templates - 템플릿 목록 / Template list
 * @param integrate - 통합 함수 / Integrate function
 * @param logger - 로거 / Logger
 * @returns 생성된 문서 배열 / Generated document array
 */
export async function generateAllDocuments(
  projectId: string,
  outputDir: string,
  templates: readonly DocumentTemplate[],
  integrate: (options: IntegrateOptions) => Promise<Result<IntegratedDocument, Layer3Error>>,
  logger: Logger,
): Promise<readonly IntegratedDocument[]> {
  const documents: IntegratedDocument[] = [];

  for (const template of templates) {
    try {
      if (!VALID_PROJECT_TYPES.has(template.type)) {
        logger.debug('프로젝트 문서 유형이 아님 — 건너뜀', { type: template.type });
        continue;
      }

      const options: IntegrateOptions = {
        projectId,
        type: template.type as ProjectDocumentType,
        fragmentPattern: `${outputDir}/**/*.md`,
        outputPath: `${outputDir}/${template.type}.md`,
        templateId: template.id,
      };

      const result = await integrate(options);
      if (result.ok) {
        documents.push(result.value);
      } else {
        logger.warn('개별 문서 생성 실패 — 건너뜀', {
          templateType: template.type,
          templateId: template.id,
          error: result.error.message,
        });
      }
    } catch (templateError) {
      logger.warn('개별 문서 생성 중 예외 — 건너뜀', {
        templateType: template.type,
        templateId: template.id,
        error: templateError instanceof Error ? templateError.message : String(templateError),
      });
    }
  }

  return documents;
}

/**
 * 템플릿 파일에서 Handlebars 소스를 읽는다 / Read Handlebars template source from file
 *
 * @param template - 템플릿 정의 / Template definition
 * @param logger - 로거 / Logger
 * @returns 템플릿 소스 문자열 / Template source string
 */
export async function readTemplateSource(
  template: DocumentTemplate,
  logger: Logger,
): Promise<string> {
  return readTemplateSourceFile(template, logger);
}

/** 커스텀 템플릿 검색 디렉토리 / Custom template search directories */
const CUSTOM_TEMPLATE_DIRS = [
  '.adev/templates',
  join(homedir(), '.adev', 'templates'),
] as const;

/**
 * 커스텀 템플릿을 디스크에서 스캔하여 레지스트리에 로드한다 / Scan and load custom templates from disk
 *
 * @description
 * KR: `.adev/templates/` (프로젝트 로컬) + `~/.adev/templates/` (글로벌) 경로에서
 *     `.hbs` 파일을 검색하여 커스텀 템플릿으로 등록한다.
 *     프로젝트 로컬이 글로벌보다 우선순위가 높아, 동일 이름 시 덮어쓴다.
 * EN: Scans `.adev/templates/` (project local) + `~/.adev/templates/` (global) for `.hbs` files
 *     and registers them as custom templates. Project local takes priority over global.
 *
 * @param registry - 템플릿 레지스트리 맵 / Template registry map
 * @param logger - 로거 / Logger
 */
export async function loadCustomTemplates(
  registry: Map<string, DocumentTemplate>,
  logger: Logger,
): Promise<void> {
  // WHY: 글로벌 → 프로젝트 순으로 로드하여 프로젝트 템플릿이 글로벌을 덮어쓰게 함
  const dirsToScan = [CUSTOM_TEMPLATE_DIRS[1], CUSTOM_TEMPLATE_DIRS[0]];

  for (const dir of dirsToScan) {
    await scanAndRegisterTemplates(dir, registry, logger);
  }
}

/**
 * 특정 디렉토리에서 .hbs 템플릿 파일을 스캔하여 등록한다 / Scan directory for .hbs template files
 *
 * @param dir - 스캔할 디렉토리 / Directory to scan
 * @param registry - 템플릿 레지스트리 맵 / Template registry map
 * @param logger - 로거 / Logger
 */
async function scanAndRegisterTemplates(
  dir: string,
  registry: Map<string, DocumentTemplate>,
  logger: Logger,
): Promise<void> {
  try {
    const dirFile = Bun.file(join(dir, '.'));
    const dirExists = await dirFile.exists().catch(() => false);
    if (!dirExists) {
      // WHY: 디렉토리가 없으면 조용히 건너뜀 — 커스텀 템플릿은 선택적
      return;
    }

    const { Glob } = await import('bun');
    const glob = new Glob('**/*.hbs');

    for await (const filePath of glob.scan(dir)) {
      try {
        const fullPath = join(dir, filePath);
        // WHY: 파일명에서 유형을 추론 (예: readme.hbs → readme)
        const typeName = filePath.replace(/\.hbs$/, '').replace(/\//g, '-');
        const templateId = `custom-${typeName}`;
        const isProjectType = VALID_PROJECT_TYPES.has(typeName);

        const template: DocumentTemplate = {
          id: templateId,
          name: typeName,
          type: isProjectType ? (typeName as ProjectDocumentType) : 'custom',
          templatePath: fullPath,
          format: 'md',
          description: `Custom template from ${dir}`,
          custom: true,
        };

        // WHY: 동일 ID가 있으면 덮어씀 (프로젝트 > 글로벌 우선순위)
        registry.set(templateId, template);

        // WHY: 프로젝트 유형과 일치하면 기본 템플릿도 덮어씀
        if (isProjectType) {
          registry.set(`default-${typeName}`, template);
        }

        logger.debug('커스텀 템플릿 로드', { templateId, path: fullPath });
      } catch (fileError) {
        logger.warn('커스텀 템플릿 파일 처리 실패', {
          filePath,
          error: fileError instanceof Error ? fileError.message : String(fileError),
        });
      }
    }
  } catch {
    // WHY: 디렉토리 스캔 실패는 경고만 — 커스텀 템플릿은 선택적 기능
    logger.debug('커스텀 템플릿 디렉토리 스캔 생략', { dir });
  }
}
