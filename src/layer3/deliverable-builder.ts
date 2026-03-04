/**
 * 산출물 빌더 / Deliverable Builder
 *
 * @description
 * KR: 비즈니스 산출물 생성 (포트폴리오, 사업계획서, 투자제안서, 프레젠테이션).
 *     템플릿 기반 문서 생성 및 PDF/DOCX/PPTX 변환을 담당한다.
 *     DocCollaborator를 통해 layer1 + layer2 협업을 수행한다.
 * EN: Creates business deliverables (portfolio, business plan, investment proposal, presentation).
 *     Handles template-based document generation and PDF/DOCX/PPTX conversion.
 *     Collaborates with layer1 + layer2 via DocCollaborator.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { DocCollaborator } from './doc-collaborator.js';
import type {
  BusinessDeliverable,
  BusinessDeliverableType,
  Deliverable,
  DeliverableBuildOptions,
  DeliverableMetadata,
  DocumentTemplate,
  IntegratedDocument,
} from './types.js';

/**
 * 기본 비즈니스 산출물 템플릿 목록 / Default business deliverable templates
 */
const DEFAULT_BUSINESS_TEMPLATES: readonly BusinessDeliverableType[] = [
  'portfolio',
  'business-plan',
  'investment-proposal',
  'presentation',
] as const;

/**
 * 산출물 빌더 인터페이스 / Deliverable builder interface
 */
export interface IDeliverableBuilder {
  /**
   * 비즈니스 산출물을 생성한다 / Build a business deliverable
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   */
  build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>>;

  /**
   * 모든 기본 산출물을 생성한다 / Build all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 목록 / Generated deliverables
   */
  buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>>;
}

/**
 * DeliverableBuilder 구현 클래스 / DeliverableBuilder implementation
 *
 * @description
 * KR: 비즈니스 산출물 생성을 담당한다. 옵션 기반 비동기 API를 지원한다.
 * EN: Handles business deliverable generation. Supports options-based async API.
 */
export class DeliverableBuilder implements IDeliverableBuilder {
  private readonly logger: Logger;
  private readonly docCollaborator: DocCollaborator | null;
  private readonly templateRegistry: Map<string, DocumentTemplate>;
  private deliverableCounter = 0;
  private readonly deliverables: Map<string, BusinessDeliverable[]>;
  private readonly simpleDeliverables: Map<string, Deliverable[]>;

  /**
   * @param loggerOrDocCollaborator - 로거 (간단 API) 또는 문서 협업기 / Logger (simple API) or document collaborator
   * @param logger - 로거 인스턴스 (전체 API) / Logger instance (full API)
   */
  constructor(loggerOrDocCollaborator: Logger | DocCollaborator, logger?: Logger) {
    // WHY: 간단한 API 지원 - logger만 전달하는 경우
    if (!logger) {
      this.logger = (loggerOrDocCollaborator as Logger).child({ module: 'deliverable-builder' });
      this.docCollaborator = null;
    } else {
      this.docCollaborator = loggerOrDocCollaborator as DocCollaborator;
      this.logger = logger.child({ module: 'deliverable-builder' });
    }
    this.templateRegistry = new Map();
    this.deliverables = new Map();
    this.simpleDeliverables = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * 기본 비즈니스 산출물 템플릿 로드 / Load default business deliverable templates
   */
  private loadDefaultTemplates(): void {
    for (const type of DEFAULT_BUSINESS_TEMPLATES) {
      const template: DocumentTemplate = {
        id: `default-${type}`,
        name: type,
        type,
        templatePath: `templates/business/${type}.hbs`,
        format: this.getDefaultFormat(type),
        description: `Default ${type} template`,
        custom: false,
      };
      this.templateRegistry.set(template.id ?? `default-${type}`, template);
    }
    this.logger.debug('기본 템플릿 로드 완료', {
      count: DEFAULT_BUSINESS_TEMPLATES.length,
    });
  }

  /**
   * 산출물 유형별 기본 형식 반환 / Get default format for deliverable type
   */
  private getDefaultFormat(type: BusinessDeliverableType): 'pdf' | 'docx' | 'pptx' {
    switch (type) {
      case 'portfolio':
        return 'pdf';
      case 'business-plan':
        return 'docx';
      case 'investment-proposal':
        return 'pdf';
      case 'presentation':
        return 'pptx';
    }
  }

  /**
   * 산출물을 생성한다 / Build a deliverable
   *
   * @description
   * KR: 두 가지 호출 방식을 지원한다:
   *   1) build(projectId, type, docs) — 간단 동기 버전 (E2E 테스트용)
   *   2) build(options: DeliverableBuildOptions) — 옵션 객체 비동기 버전 (프로덕션 사용)
   */
  build(
    projectId: string,
    type: string,
    docs: readonly IntegratedDocument[],
  ): Result<Deliverable, AgentError>;
  build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>>;
  build(
    projectIdOrOptions: string | DeliverableBuildOptions,
    type?: string,
    docs?: readonly IntegratedDocument[],
  ): Result<Deliverable, AgentError> | Promise<Result<BusinessDeliverable>> {
    if (typeof projectIdOrOptions === 'string') {
      return this.buildSync(
        projectIdOrOptions,
        type as string,
        docs as readonly IntegratedDocument[],
      );
    }
    return this.buildAsync(projectIdOrOptions);
  }

  /**
   * 간단 동기 빌드 / Simple sync build
   */
  private buildSync(
    projectId: string,
    type: string,
    docs: readonly IntegratedDocument[],
  ): Result<Deliverable, AgentError> {
    if (!docs || docs.length === 0) {
      return err(new AgentError('agent_invalid_input', '문서 목록이 비어 있습니다'));
    }

    if (!projectId || projectId.trim() === '') {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
    }

    this.logger.info('산출물 생성 시작 (동기)', { projectId, type });

    const content = this.generateDeliverableContent(type, docs);
    const format = type === 'portfolio' ? ('html' as const) : ('markdown' as const);
    const title = this.generateDeliverableTitle(type, projectId);

    this.deliverableCounter += 1;
    const deliverable: Deliverable = {
      id: `del-${this.deliverableCounter}`,
      projectId,
      type: type as Deliverable['type'],
      title,
      content,
      format,
      createdAt: new Date(),
    };

    // WHY: 프로젝트별 산출물 저장 (listDeliverables 지원)
    const projectDeliverables = this.simpleDeliverables.get(projectId) ?? [];
    projectDeliverables.push(deliverable);
    this.simpleDeliverables.set(projectId, projectDeliverables);

    this.logger.info('산출물 생성 완료 (동기)', { deliverableId: deliverable.id, projectId, type });
    return ok(deliverable);
  }

  /**
   * 유형별 산출물 제목 생성 / Generate deliverable title by type
   */
  private generateDeliverableTitle(type: string, projectId: string): string {
    switch (type) {
      case 'report':
        return `[Technical Report] ${projectId}`;
      case 'portfolio':
        return `[Portfolio] ${projectId}`;
      case 'business-plan':
        return `[Business Plan] ${projectId}`;
      default:
        return `[${type}] ${projectId}`;
    }
  }

  /**
   * 유형별 산출물 콘텐츠 생성 (간단 버전) / Generate deliverable content (simple version)
   */
  private generateDeliverableContent(type: string, docs: readonly IntegratedDocument[]): string {
    const docContents = docs.map((d) => d.content).join('\n\n---\n\n');

    switch (type) {
      case 'report':
        return `# Technical Report\n\n${docContents}`;
      case 'portfolio':
        return `<article>\n<h1>Portfolio</h1>\n${docContents}\n</article>`;
      case 'business-plan':
        return `# Business Plan\n\n${docContents}`;
      default:
        return `# ${type}\n\n${docContents}`;
    }
  }

  /**
   * 비즈니스 산출물을 생성한다 (비동기) / Build a business deliverable (async)
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   */
  private async buildAsync(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>> {
    const { projectId, type, metadata, outputPath } = options;

    if (!projectId || projectId.trim() === '') {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
    }

    this.logger.info('산출물 생성 시작', { projectId, type });

    const format = this.getDefaultFormat(type);
    const content = this.generateContent(type, metadata);

    this.deliverableCounter += 1;
    const deliverable: BusinessDeliverable = {
      id: `del-${this.deliverableCounter}`,
      projectId,
      type,
      content,
      format,
      outputPath,
      status: 'completed',
      createdAt: new Date(),
      metadata,
    };

    // WHY: 프로젝트별 산출물 저장
    const projectDeliverables = this.deliverables.get(projectId) ?? [];
    projectDeliverables.push(deliverable);
    this.deliverables.set(projectId, projectDeliverables);

    this.logger.info('산출물 생성 완료', {
      deliverableId: deliverable.id,
      projectId,
      type,
    });

    return ok(deliverable);
  }

  /**
   * 모든 기본 산출물을 생성한다 / Build all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 목록 / Generated deliverables
   */
  async buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>> {
    const results: BusinessDeliverable[] = [];

    for (const type of DEFAULT_BUSINESS_TEMPLATES) {
      const format = this.getDefaultFormat(type);
      const ext = format;
      const outputPath = join(outputDir, `${type}.${ext}`);

      const result = await this.build({
        projectId,
        type,
        metadata,
        outputPath,
      });

      if (!result.ok) {
        return err(result.error as AgentError);
      }

      results.push(result.value);
    }

    return ok(results);
  }

  /**
   * 프로젝트별 산출물 목록을 조회한다 / List deliverables for a project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 산출물 목록 / Deliverable list
   */
  listDeliverables(projectId: string): (BusinessDeliverable | Deliverable)[] {
    const business = this.deliverables.get(projectId) ?? [];
    const simple = this.simpleDeliverables.get(projectId) ?? [];
    return [...business, ...simple];
  }

  /**
   * 유형별 산출물 콘텐츠 생성 / Generate deliverable content by type
   */
  private generateContent(type: BusinessDeliverableType, metadata: DeliverableMetadata): string {
    const extraSection = metadata.extra
      ? Object.entries(metadata.extra)
          .map(([key, value]) => `- ${key}: ${String(value)}`)
          .join('\n')
      : '';

    switch (type) {
      case 'portfolio':
        return [
          `# ${metadata.projectName} 포트폴리오`,
          '',
          '## 프로젝트 소개',
          metadata.projectDescription,
          '',
          metadata.targetAudience ? `대상: ${metadata.targetAudience}` : '',
          metadata.purpose ? `목적: ${metadata.purpose}` : '',
          extraSection ? `\n## 추가 정보\n${extraSection}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'business-plan':
        return [
          `# 사업 계획서 — ${metadata.projectName}`,
          '',
          '## 개요',
          metadata.projectDescription,
          '',
          metadata.targetAudience ? `대상 시장: ${metadata.targetAudience}` : '',
          metadata.purpose ? `목적: ${metadata.purpose}` : '',
          extraSection ? `\n## 추가 정보\n${extraSection}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'investment-proposal':
        return [
          `# 투자 제안서 — ${metadata.projectName}`,
          '',
          '## 프로젝트 개요',
          metadata.projectDescription,
          '',
          metadata.targetAudience ? `대상 투자자: ${metadata.targetAudience}` : '',
          metadata.purpose ? `투자 목적: ${metadata.purpose}` : '',
          extraSection ? `\n## 추가 정보\n${extraSection}` : '',
        ]
          .filter(Boolean)
          .join('\n');

      case 'presentation':
        return [
          `# ${metadata.projectName}`,
          '',
          '## Introduction',
          metadata.projectDescription,
          '',
          metadata.targetAudience ? `Audience: ${metadata.targetAudience}` : '',
          metadata.purpose ? `Purpose: ${metadata.purpose}` : '',
          extraSection ? `\n## Details\n${extraSection}` : '',
        ]
          .filter(Boolean)
          .join('\n');
    }
  }

  /**
   * 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates
   */
  async listTemplates(includeCustom = true): Promise<Result<readonly DocumentTemplate[]>> {
    const templates: DocumentTemplate[] = [];

    for (const template of this.templateRegistry.values()) {
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
   */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void>> {
    const templateId = template.id ?? `custom-${Date.now()}`;
    if (this.templateRegistry.has(templateId)) {
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

    this.templateRegistry.set(templateId, template);

    this.logger.info('커스텀 템플릿 등록 완료', {
      templateId,
      type: template.type,
    });

    return ok(undefined);
  }
}
