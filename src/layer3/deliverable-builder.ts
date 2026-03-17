/**
 * 산출물 빌더 / Deliverable Builder
 *
 * @description
 * KR: 비즈니스 산출물 생성 (포트폴리오, 사업계획서, 투자제안서, 프레젠테이션).
 *     템플릿 로직은 deliverable-builder-template.ts에 분리.
 *     파일 I/O는 deliverable-writer.ts에 분리.
 * EN: Creates business deliverables (portfolio, business plan, investment proposal, presentation).
 *     Template logic is in deliverable-builder-template.ts.
 *     File I/O is in deliverable-writer.ts.
 */

import { dirname, join } from 'node:path';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import {
  listTemplates,
  loadDefaultTemplates,
  registerTemplate,
  renderWithTemplate,
} from 'layer3/deliverable-builder-template.js';
import type { IDeliverableBuilder } from 'layer3/deliverable-builder-types.js';
import {
  generateBusinessContent,
  generateDeliverableTitle,
  generateSimpleContent,
  getDefaultFormat,
} from 'layer3/deliverable-renderer.js';
import {
  type BusinessDeliverable,
  DEFAULT_BUSINESS_TEMPLATES,
  type Deliverable,
  type DeliverableBuildOptions,
  type DeliverableMetadata,
} from 'layer3/deliverable-types.js';
import {
  renderDeliverableMarkdown,
  writeDeliverableByFormat,
  writeDeliverableToDir,
} from 'layer3/deliverable-writer.js';
import type { DocCollaborator } from 'layer3/doc-collaborator.js';
import type {
  BusinessDeliverableType,
  DocumentTemplate,
  IntegratedDocument,
} from 'layer3/doc-types.js';

export type { IDeliverableBuilder } from 'layer3/deliverable-builder-types.js';

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
    loadDefaultTemplates(this.templateRegistry, this.logger);
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

  /** 간단 동기 빌드 / Simple sync build */
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

    const content = generateSimpleContent(type, docs);
    const format = type === 'portfolio' ? ('html' as const) : ('markdown' as const);
    const title = generateDeliverableTitle(type, projectId);

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

  /** 비즈니스 산출물을 생성한다 (비동기) / Build a business deliverable (async) */
  private async buildAsync(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>> {
    const { projectId, type, metadata, outputPath, templateId } = options;

    if (!projectId || projectId.trim() === '') {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어 있습니다'));
    }

    this.logger.info('산출물 생성 시작', { projectId, type, templateId });

    const format = getDefaultFormat(type);

    // WHY: templateId가 지정된 경우 등록된 템플릿 사용, 없으면 기본 생성
    let content: string;
    if (templateId) {
      const template = this.templateRegistry.get(templateId);
      if (!template) {
        return err(
          new AgentError(
            'layer3_deliverable_template_not_found',
            `템플릿을 찾을 수 없습니다: ${templateId}`,
          ),
        );
      }
      content = renderWithTemplate(template, metadata);
    } else {
      content = generateBusinessContent(type, metadata);
    }

    // WHY: format에 따라 실제 파일을 디스크에 저장 — 분기 로직은 writeDeliverableByFormat에 위임
    const outputDir = dirname(outputPath);
    const title = `${metadata.projectName} — ${type}`;
    await writeDeliverableByFormat(format, outputDir, type, content, title, this.logger);

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
      format,
    });
    return ok(deliverable);
  }

  /** 모든 기본 산출물을 생성한다 / Build all default deliverables */
  async buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>> {
    const results: BusinessDeliverable[] = [];

    for (const type of DEFAULT_BUSINESS_TEMPLATES) {
      const outputPath = join(outputDir, `${type}.${getDefaultFormat(type)}`);

      // WHY: Markdown 파일을 outputDir에 직접 저장
      const mdContent = renderDeliverableMarkdown(type, metadata);
      const writeResult = await writeDeliverableToDir(outputDir, type, mdContent, this.logger);
      if (!writeResult.ok) {
        return err(new AgentError('agent_deliverable_write_failed', writeResult.error.message));
      }

      const result = await this.build({ projectId, type, metadata, outputPath });
      if (!result.ok) {
        return err(result.error as AgentError);
      }
      results.push(result.value);
    }

    return ok(results);
  }

  /** 프로젝트별 산출물 목록을 조회한다 / List deliverables for a project */
  listDeliverables(projectId: string): (BusinessDeliverable | Deliverable)[] {
    const business = this.deliverables.get(projectId) ?? [];
    const simple = this.simpleDeliverables.get(projectId) ?? [];
    return [...business, ...simple];
  }

  /**
   * ID로 산출물을 조회한다 / Get a deliverable by ID
   *
   * @param deliverableId - 산출물 ID / Deliverable ID
   * @returns 산출물 또는 undefined / Deliverable or undefined
   */
  getDeliverable(deliverableId: string): BusinessDeliverable | Deliverable | undefined {
    for (const deliverables of this.deliverables.values()) {
      const found = deliverables.find((d) => d.id === deliverableId);
      if (found) return found;
    }
    for (const deliverables of this.simpleDeliverables.values()) {
      const found = deliverables.find((d) => d.id === deliverableId);
      if (found) return found;
    }
    return undefined;
  }

  /** 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates */
  async listTemplates(includeCustom = true): Promise<Result<readonly DocumentTemplate[]>> {
    return listTemplates(this.templateRegistry, includeCustom);
  }

  /** 커스텀 산출물 템플릿을 등록한다 / Register a custom deliverable template */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void>> {
    return registerTemplate(this.templateRegistry, template, this.logger);
  }
}
