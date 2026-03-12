/**
 * 산출물 빌더 템플릿 헬퍼 / Deliverable Builder Template Helpers
 *
 * @description
 * KR: DeliverableBuilder의 템플릿 로드, 등록, 조회, 렌더링 로직을 분리.
 * EN: Template loading, registration, listing, and rendering logic
 *     extracted from DeliverableBuilder.
 */

import { existsSync } from 'node:fs';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import { getDefaultFormat } from 'layer3/deliverable-renderer.js';
import { DEFAULT_BUSINESS_TEMPLATES, type DeliverableMetadata } from 'layer3/deliverable-types.js';
import type { BusinessDeliverableType, DocumentTemplate } from 'layer3/doc-types.js';

/**
 * 기본 비즈니스 산출물 템플릿을 로드한다 / Load default business deliverable templates
 *
 * @param registry - 템플릿 레지스트리 / Template registry
 * @param logger - 로거 인스턴스 / Logger instance
 */
export function loadDefaultTemplates(
  registry: Map<string, DocumentTemplate>,
  logger: Logger,
): void {
  for (const type of DEFAULT_BUSINESS_TEMPLATES) {
    const template: DocumentTemplate = {
      id: `default-${type}`,
      name: type,
      type,
      templatePath: `templates/business/${type}.hbs`,
      format: getDefaultFormat(type),
      description: `Default ${type} template`,
      custom: false,
    };
    registry.set(template.id ?? `default-${type}`, template);
  }
  logger.debug('기본 템플릿 로드 완료', {
    count: DEFAULT_BUSINESS_TEMPLATES.length,
  });
}

/**
 * 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates
 *
 * @param registry - 템플릿 레지스트리 / Template registry
 * @param includeCustom - 커스텀 포함 여부 / Whether to include custom templates
 * @returns 템플릿 배열 / Template array
 */
export function listTemplates(
  registry: Map<string, DocumentTemplate>,
  includeCustom: boolean,
): Result<readonly DocumentTemplate[]> {
  const templates: DocumentTemplate[] = [];

  for (const template of registry.values()) {
    if (
      DEFAULT_BUSINESS_TEMPLATES.includes(template.type as BusinessDeliverableType) ||
      template.custom
    ) {
      if (!includeCustom && template.custom) {
        continue;
      }
      templates.push(template);
    }
  }

  return ok(templates);
}

/**
 * 커스텀 산출물 템플릿을 등록한다 / Register a custom deliverable template
 *
 * @param registry - 템플릿 레지스트리 / Template registry
 * @param template - 템플릿 정의 / Template definition
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 등록 성공 여부 / Whether registration succeeded
 */
export function registerTemplate(
  registry: Map<string, DocumentTemplate>,
  template: DocumentTemplate,
  logger: Logger,
): Result<void> {
  const templateId = template.id ?? `custom-${Date.now()}`;
  if (registry.has(templateId)) {
    return err(
      new AgentError(
        'layer3_deliverable_template_duplicate',
        `템플릿 ID가 이미 존재합니다: ${templateId}`,
      ),
    );
  }

  // WHY: 커스텀 템플릿의 경우 templatePath가 실제로 존재하는지 검증
  if (template.custom && template.templatePath && !existsSync(template.templatePath)) {
    return err(
      new AgentError(
        'layer3_deliverable_template_not_found',
        `템플릿 파일을 찾을 수 없습니다: ${template.templatePath}`,
      ),
    );
  }

  registry.set(templateId, template);

  logger.info('커스텀 템플릿 등록 완료', {
    templateId,
    type: template.type,
  });

  return ok(undefined);
}

/**
 * 템플릿으로 콘텐츠를 렌더링한다 / Render content using a template
 *
 * @description
 * KR: Handlebars 스타일 {{변수명}} 치환으로 템플릿을 렌더링한다.
 * EN: Renders a template with Handlebars-style {{variable}} substitution.
 *
 * @param template - 문서 템플릿 / Document template
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 렌더링된 콘텐츠 / Rendered content
 */
export function renderWithTemplate(
  template: DocumentTemplate,
  metadata: DeliverableMetadata,
): string {
  const variables: Record<string, string> = {
    projectName: metadata.projectName,
    projectDescription: metadata.projectDescription,
    targetAudience: metadata.targetAudience ?? '',
    purpose: metadata.purpose ?? '',
  };

  // WHY: extra 메타데이터도 변수로 추가
  if (metadata.extra) {
    for (const [key, value] of Object.entries(metadata.extra)) {
      variables[key] = String(value);
    }
  }

  // WHY: 템플릿에 description이 있으면 해당 내용 기반, 없으면 name 기반 기본 구조
  const templateContent = template.description ?? `# ${template.name}\n\n{{projectDescription}}`;

  return templateContent.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}
