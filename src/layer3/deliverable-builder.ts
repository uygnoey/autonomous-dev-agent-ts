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

import { promises as fs, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { DocCollaborator } from './doc-collaborator.js';
import type {
  BusinessDeliverable,
  BusinessDeliverableType,
  DeliverableBuildOptions,
  DeliverableMetadata,
  DocumentFormat,
  DocumentTemplate,
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
   * 비즈니스 산출물을 생성한다 / Generate a business deliverable
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   */
  build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>>;

  /**
   * 모든 기본 산출물을 생성한다 / Generate all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 배열 / Generated deliverable array
   */
  buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>>;

  /**
   * 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  listTemplates(includeCustom?: boolean): Promise<Result<readonly DocumentTemplate[]>>;

  /**
   * 커스텀 산출물 템플릿을 등록한다 / Register a custom deliverable template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  registerTemplate(template: DocumentTemplate): Promise<Result<void>>;

  /**
   * Markdown을 PDF로 변환한다 / Convert Markdown to PDF
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pdfPath - PDF 파일 경로 / PDF file path
   * @returns 변환 성공 여부 / Conversion success status
   */
  convertToPdf(mdPath: string, pdfPath: string): Promise<Result<void>>;

  /**
   * Markdown을 PPTX로 변환한다 / Convert Markdown to PPTX
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pptxPath - PPTX 파일 경로 / PPTX file path
   * @returns 변환 성공 여부 / Conversion success status
   */
  convertToPptx(mdPath: string, pptxPath: string): Promise<Result<void>>;
}

/**
 * DeliverableBuilder 구현 클래스 / DeliverableBuilder implementation
 *
 * @description
 * KR: 비즈니스 산출물 생성을 담당한다. 템플릿 기반 렌더링 및 형식 변환을 수행한다.
 * EN: Handles business deliverable generation. Performs template-based rendering and format conversion.
 *
 * @example
 * const builder = new DeliverableBuilder(docCollaborator, logger);
 * const result = await builder.build({
 *   projectId: 'proj-1',
 *   type: 'portfolio',
 *   metadata: { projectName: 'My Project', projectDescription: '...' },
 *   outputPath: './deliverables/portfolio.pdf',
 * });
 */
export class DeliverableBuilder implements IDeliverableBuilder {
  private readonly logger: Logger;
  private readonly docCollaborator: DocCollaborator;
  private readonly templateRegistry: Map<string, DocumentTemplate>;
  private deliverableCounter = 0;

  /**
   * @param docCollaborator - 문서 협업기 / Document collaborator
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(docCollaborator: DocCollaborator, logger: Logger) {
    this.docCollaborator = docCollaborator;
    this.logger = logger.child({ module: 'deliverable-builder' });
    this.templateRegistry = new Map();
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
      this.templateRegistry.set(template.id, template);
    }
    this.logger.debug('기본 템플릿 로드 완료', {
      count: DEFAULT_BUSINESS_TEMPLATES.length,
    });
  }

  /**
   * 산출물 유형별 기본 형식 반환 / Get default format for deliverable type
   *
   * @param type - 산출물 유형 / Deliverable type
   * @returns 기본 형식 / Default format
   */
  private getDefaultFormat(type: BusinessDeliverableType): 'pdf' | 'pptx' | 'docx' {
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
   * DocumentFormat을 변환 형식으로 변환 / Convert DocumentFormat to conversion format
   *
   * @param format - 문서 형식 / Document format
   * @returns 변환 형식 / Conversion format
   */
  private getConvertFormat(format: DocumentFormat): 'pdf' | 'pptx' | 'docx' {
    if (format === 'pdf' || format === 'pptx' || format === 'docx') {
      return format;
    }
    // WHY: md, html은 pdf로 기본 변환
    return 'pdf';
  }

  /**
   * 비즈니스 산출물을 생성한다 / Build a business deliverable
   *
   * @param options - 빌드 옵션 / Build options
   * @returns 생성된 산출물 / Generated deliverable
   *
   * @throws {AgentError} layer3_deliverable_template_not_found — 템플릿 없음
   * @throws {AgentError} layer3_deliverable_build_failed — 생성 실패
   * @throws {AgentError} layer3_deliverable_convert_failed — 변환 실패
   */
  async build(options: DeliverableBuildOptions): Promise<Result<BusinessDeliverable>> {
    const { projectId, type, templateId, metadata, outputPath } = options;

    if (!projectId.trim()) {
      return err(
        new AgentError('agent_invalid_input', '프로젝트 ID가 비어있습니다', {
          projectId,
        }),
      );
    }

    this.logger.info('산출물 생성 시작', {
      projectId,
      type,
      templateId,
      outputPath,
    });

    // 1. 템플릿 조회
    const template = this.resolveTemplate(type, templateId);
    if (!template) {
      const errorCode = 'layer3_deliverable_template_not_found' as const;
      return err(
        new AgentError(errorCode, `템플릿을 찾을 수 없습니다: ${templateId ?? type}`, {
          type,
          templateId,
        }),
      );
    }

    // 2. layer1 + layer2 협업을 통한 문서 생성
    const contentResult = await this.generateContentWithCollaboration(projectId, type, metadata);
    if (!contentResult.ok) {
      return err(contentResult.error);
    }
    const content = contentResult.value;

    // 3. 임시 Markdown 파일 생성
    const tempMdPath = `${outputPath}.tmp.md`;
    try {
      await this.ensureDirectory(dirname(outputPath));
      await fs.writeFile(tempMdPath, content, 'utf-8');
      this.logger.debug('임시 Markdown 파일 생성', { tempMdPath });
    } catch (writeError) {
      return err(
        new AgentError('layer3_deliverable_build_failed', '임시 파일 생성 실패', {
          error: String(writeError),
          tempMdPath,
        }),
      );
    }

    // 4. 형식 변환
    const outputFormat = this.getConvertFormat(template.format);
    const convertResult = await this.convertByFormat(outputFormat, tempMdPath, outputPath);
    if (!convertResult.ok) {
      // WHY: 임시 파일 정리
      await this.cleanupTempFile(tempMdPath);
      return err(convertResult.error);
    }

    // 5. 임시 파일 삭제
    await this.cleanupTempFile(tempMdPath);

    // 6. BusinessDeliverable 생성
    this.deliverableCounter += 1;
    const deliverable: BusinessDeliverable = {
      id: `bdel-${this.deliverableCounter}`,
      type,
      content,
      format: this.getConvertFormat(template.format),
      outputPath: resolve(outputPath),
      status: 'completed',
      createdAt: new Date(),
      projectId,
      metadata,
    };

    this.logger.info('산출물 생성 완료', {
      deliverableId: deliverable.id,
      projectId,
      type,
      outputPath: deliverable.outputPath,
    });

    return ok(deliverable);
  }

  /**
   * 모든 기본 산출물을 생성한다 / Build all default deliverables
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param metadata - 산출물 메타데이터 / Deliverable metadata
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 산출물 배열 / Generated deliverable array
   *
   * @throws {AgentError} layer3_deliverable_build_failed — 생성 실패
   */
  async buildAll(
    projectId: string,
    metadata: DeliverableMetadata,
    outputDir: string,
  ): Promise<Result<readonly BusinessDeliverable[]>> {
    this.logger.info('모든 산출물 생성 시작', { projectId, outputDir });

    const deliverables: BusinessDeliverable[] = [];

    for (const type of DEFAULT_BUSINESS_TEMPLATES) {
      const format = this.getDefaultFormat(type);
      const outputPath = resolve(outputDir, `${type}.${format}`);

      const buildResult = await this.build({
        projectId,
        type,
        metadata,
        outputPath,
      });

      if (!buildResult.ok) {
        return err(
          new AgentError('layer3_deliverable_build_failed', `산출물 생성 실패: ${type}`, {
            type,
            error: buildResult.error.message,
          }),
        );
      }

      deliverables.push(buildResult.value);
    }

    this.logger.info('모든 산출물 생성 완료', {
      projectId,
      count: deliverables.length,
    });

    return ok(deliverables);
  }

  /**
   * 사용 가능한 산출물 템플릿 목록을 조회한다 / List available deliverable templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  async listTemplates(includeCustom = true): Promise<Result<readonly DocumentTemplate[]>> {
    const templates: DocumentTemplate[] = [];

    for (const template of this.templateRegistry.values()) {
      // WHY: 비즈니스 산출물 템플릿만 필터링
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

    this.logger.debug('템플릿 목록 조회', {
      count: templates.length,
      includeCustom,
    });

    return ok(templates);
  }

  /**
   * 커스텀 산출물 템플릿을 등록한다 / Register a custom deliverable template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   *
   * @throws {AgentError} layer3_deliverable_template_duplicate — 템플릿 ID 중복
   * @throws {AgentError} layer3_deliverable_template_not_found — 템플릿 파일 없음
   */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void>> {
    if (this.templateRegistry.has(template.id)) {
      return err(
        new AgentError(
          'layer3_deliverable_template_duplicate',
          `템플릿 ID가 이미 존재합니다: ${template.id}`,
          {
            templateId: template.id,
          },
        ),
      );
    }

    // WHY: 템플릿 파일 존재 확인
    if (!existsSync(template.templatePath)) {
      return err(
        new AgentError(
          'layer3_deliverable_template_not_found',
          `템플릿 파일이 존재하지 않습니다: ${template.templatePath}`,
          {
            templatePath: template.templatePath,
          },
        ),
      );
    }

    this.templateRegistry.set(template.id, template);

    this.logger.info('커스텀 템플릿 등록 완료', {
      templateId: template.id,
      type: template.type,
      format: template.format,
    });

    return ok(undefined);
  }

  /**
   * Markdown을 PDF로 변환한다 / Convert Markdown to PDF
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pdfPath - PDF 파일 경로 / PDF file path
   * @returns 변환 성공 여부 / Conversion success status
   *
   * @throws {AgentError} layer3_deliverable_convert_failed — 변환 실패
   */
  async convertToPdf(mdPath: string, pdfPath: string): Promise<Result<void>> {
    this.logger.debug('Markdown → PDF 변환 시작', { mdPath, pdfPath });

    try {
      // WHY: Bun 환경에서는 Pandoc을 사용한다 (md-to-pdf는 Node.js 전용)
      // Pandoc 설치 필요: brew install pandoc
      const { ProcessExecutor } = await import('../core/process-executor.js');
      const executor = new ProcessExecutor(this.logger);

      const result = await executor.execute('pandoc', [
        mdPath,
        '-o',
        pdfPath,
        '--pdf-engine=wkhtmltopdf',
      ]);

      if (!result.ok) {
        return err(
          new AgentError('layer3_deliverable_convert_failed', 'PDF 변환 실패', {
            mdPath,
            pdfPath,
            error: result.error.message,
          }),
        );
      }

      this.logger.info('PDF 변환 완료', { pdfPath });
      return ok(undefined);
    } catch (convertError) {
      return err(
        new AgentError('layer3_deliverable_convert_failed', 'PDF 변환 실패', {
          mdPath,
          pdfPath,
          error: String(convertError),
        }),
      );
    }
  }

  /**
   * Markdown을 PPTX로 변환한다 / Convert Markdown to PPTX
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param pptxPath - PPTX 파일 경로 / PPTX file path
   * @returns 변환 성공 여부 / Conversion success status
   *
   * @throws {AgentError} layer3_deliverable_convert_failed — 변환 실패
   */
  async convertToPptx(mdPath: string, pptxPath: string): Promise<Result<void>> {
    this.logger.debug('Markdown → PPTX 변환 시작', { mdPath, pptxPath });

    try {
      // WHY: Pandoc을 사용한 PPTX 변환
      const { ProcessExecutor } = await import('../core/process-executor.js');
      const executor = new ProcessExecutor(this.logger);

      const result = await executor.execute('pandoc', [mdPath, '-o', pptxPath]);

      if (!result.ok) {
        return err(
          new AgentError('layer3_deliverable_convert_failed', 'PPTX 변환 실패', {
            mdPath,
            pptxPath,
            error: result.error.message,
          }),
        );
      }

      this.logger.info('PPTX 변환 완료', { pptxPath });
      return ok(undefined);
    } catch (convertError) {
      return err(
        new AgentError('layer3_deliverable_convert_failed', 'PPTX 변환 실패', {
          mdPath,
          pptxPath,
          error: String(convertError),
        }),
      );
    }
  }

  /**
   * 템플릿 조회 / Resolve template
   *
   * @param type - 산출물 유형 / Deliverable type
   * @param templateId - 템플릿 ID (선택) / Template ID (optional)
   * @returns 템플릿 또는 null / Template or null
   */
  private resolveTemplate(
    type: BusinessDeliverableType,
    templateId?: string,
  ): DocumentTemplate | null {
    if (templateId) {
      return this.templateRegistry.get(templateId) ?? null;
    }
    // WHY: 기본 템플릿 반환
    return this.templateRegistry.get(`default-${type}`) ?? null;
  }

  /**
   * DocCollaborator를 통한 문서 생성 / Generate content with DocCollaborator
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param type - 산출물 유형 / Deliverable type
   * @param metadata - 메타데이터 / Metadata
   * @returns 생성된 문서 내용 / Generated document content
   *
   * @throws {AgentError} layer3_deliverable_build_failed — 생성 실패
   */
  private async generateContentWithCollaboration(
    projectId: string,
    type: BusinessDeliverableType,
    metadata: DeliverableMetadata,
  ): Promise<Result<string>> {
    this.logger.debug('문서 협업 시작', { projectId, type });

    try {
      // WHY: 템플릿 기반 기본 아웃라인 생성 (layer1 역할)
      const outline = this.generateOutline(type, metadata);

      // WHY: 상세 내용 생성 (layer2 역할 - 실제로는 메타데이터 기반 콘텐츠 생성)
      const details = this.generateDetails(type, metadata);

      // WHY: DocCollaborator를 사용한 실제 협업은 향후 구현 예정
      // 현재는 단순 병합으로 처리
      const finalContent = `${outline}\n\n---\n\n${details}`;

      // WHY: 목차 생성
      const toc = this.generateTableOfContents(finalContent);
      const contentWithToc = toc ? `${toc}\n\n${finalContent}` : finalContent;

      this.logger.debug('문서 협업 완료', {
        contentLength: contentWithToc.length,
      });

      return ok(contentWithToc);
    } catch (collaborationError) {
      return err(
        new AgentError('layer3_deliverable_build_failed', '문서 협업 중 오류 발생', {
          error: String(collaborationError),
        }),
      );
    }
  }

  /**
   * 산출물 유형별 아웃라인 생성 / Generate outline per deliverable type
   *
   * @param type - 산출물 유형 / Deliverable type
   * @param metadata - 메타데이터 / Metadata
   * @returns 아웃라인 / Outline
   */
  private generateOutline(type: BusinessDeliverableType, metadata: DeliverableMetadata): string {
    switch (type) {
      case 'portfolio':
        return `# ${metadata.projectName}\n\n## Overview\n\n## Key Features\n\n## Technical Stack\n\n## Team\n\n## Contact`;
      case 'business-plan':
        return `# ${metadata.projectName} - 사업 계획서\n\n## Executive Summary\n\n## Market Analysis\n\n## Business Model\n\n## Financial Projections`;
      case 'investment-proposal':
        return `# ${metadata.projectName} - 투자 제안서\n\n## Investment Opportunity\n\n## Market Potential\n\n## Competitive Advantage\n\n## Financial Returns`;
      case 'presentation':
        return `# ${metadata.projectName}\n\n## Introduction\n\n## Problem Statement\n\n## Our Solution\n\n## Market Opportunity\n\n## Team`;
    }
  }

  /**
   * 산출물 유형별 상세 내용 생성 / Generate details per deliverable type
   *
   * @param type - 산출물 유형 / Deliverable type
   * @param metadata - 메타데이터 / Metadata
   * @returns 상세 내용 / Details
   */
  private generateDetails(type: BusinessDeliverableType, metadata: DeliverableMetadata): string {
    const { projectDescription, targetAudience, purpose, extra } = metadata;

    const baseContent = `**Description**: ${projectDescription}\n\n**Target Audience**: ${targetAudience ?? 'N/A'}\n\n**Purpose**: ${purpose ?? 'N/A'}`;

    if (extra) {
      const extraContent = Object.entries(extra)
        .map(([key, value]) => `**${key}**: ${JSON.stringify(value)}`)
        .join('\n\n');
      return `${baseContent}\n\n${extraContent}`;
    }

    return baseContent;
  }

  /**
   * 형식별 변환 / Convert by format
   *
   * @param format - 출력 형식 / Output format
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param outputPath - 출력 파일 경로 / Output file path
   * @returns 변환 결과 / Conversion result
   */
  private async convertByFormat(
    format: 'pdf' | 'pptx' | 'docx',
    mdPath: string,
    outputPath: string,
  ): Promise<Result<void>> {
    switch (format) {
      case 'pdf':
        return this.convertToPdf(mdPath, outputPath);
      case 'pptx':
        return this.convertToPptx(mdPath, outputPath);
      case 'docx':
        return this.convertToDocx(mdPath, outputPath);
    }
  }

  /**
   * Markdown을 DOCX로 변환한다 / Convert Markdown to DOCX
   *
   * @param mdPath - Markdown 파일 경로 / Markdown file path
   * @param docxPath - DOCX 파일 경로 / DOCX file path
   * @returns 변환 성공 여부 / Conversion success status
   */
  private async convertToDocx(mdPath: string, docxPath: string): Promise<Result<void>> {
    this.logger.debug('Markdown → DOCX 변환 시작', { mdPath, docxPath });

    try {
      const { ProcessExecutor } = await import('../core/process-executor.js');
      const executor = new ProcessExecutor(this.logger);

      const result = await executor.execute('pandoc', [mdPath, '-o', docxPath]);

      if (!result.ok) {
        return err(
          new AgentError('layer3_deliverable_convert_failed', 'DOCX 변환 실패', {
            mdPath,
            docxPath,
            error: result.error.message,
          }),
        );
      }

      this.logger.info('DOCX 변환 완료', { docxPath });
      return ok(undefined);
    } catch (convertError) {
      return err(
        new AgentError('layer3_deliverable_convert_failed', 'DOCX 변환 실패', {
          mdPath,
          docxPath,
          error: String(convertError),
        }),
      );
    }
  }

  /**
   * 디렉토리 생성 / Ensure directory exists
   *
   * @param dirPath - 디렉토리 경로 / Directory path
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (mkdirError) {
      this.logger.warn('디렉토리 생성 실패 (이미 존재할 수 있음)', {
        dirPath,
        error: String(mkdirError),
      });
    }
  }

  /**
   * 임시 파일 정리 / Cleanup temporary file
   *
   * @param tempPath - 임시 파일 경로 / Temporary file path
   */
  private async cleanupTempFile(tempPath: string): Promise<void> {
    try {
      if (existsSync(tempPath)) {
        await fs.unlink(tempPath);
        this.logger.debug('임시 파일 삭제', { tempPath });
      }
    } catch (unlinkError) {
      this.logger.warn('임시 파일 삭제 실패', {
        tempPath,
        error: String(unlinkError),
      });
    }
  }

  /**
   * 목차 생성 / Generate table of contents
   *
   * @param content - 문서 내용 / Document content
   * @returns 목차 문자열 / Table of contents string
   */
  private generateTableOfContents(content: string): string {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: { level: number; text: string }[] = [];

    for (
      let match = headingPattern.exec(content);
      match !== null;
      match = headingPattern.exec(content)
    ) {
      const level = match[1]?.length ?? 1;
      const text = match[2]?.trim() ?? '';
      if (text) {
        headings.push({ level, text });
      }
    }

    if (headings.length === 0) {
      return '';
    }

    const tocLines = headings.map((h) => {
      const indent = '  '.repeat(h.level - 1);
      const anchor = h.text
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-');
      return `${indent}- [${h.text}](#${anchor})`;
    });

    return `## 목차 / Table of Contents\n\n${tocLines.join('\n')}`;
  }
}
