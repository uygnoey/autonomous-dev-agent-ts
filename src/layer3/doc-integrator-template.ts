/**
 * 문서 통합기 템플릿 관리 헬퍼 / Document integrator template management helpers
 *
 * @description
 * KR: DocIntegrator에서 분리된 템플릿 등록/조회/로드 로직을 제공한다.
 * EN: Provides template registration, listing, and loading logic extracted from DocIntegrator.
 */

import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import { readTemplateSourceFile } from 'layer3/doc-integrator-fragment.js';
import type { DocumentTemplate, ProjectDocumentType } from 'layer3/types.js';

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
