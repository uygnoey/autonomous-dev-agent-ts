/**
 * 문서 통합기 / Document Integrator
 *
 * @description
 * KR: 2계층 documenter가 생성한 조각 문서들을 수집하고 템플릿에 따라 통합 프로젝트 문서로 병합한다.
 *     8개 프로젝트 문서 유형을 지원하며, 커스텀 템플릿 등록도 가능하다.
 * EN: Collects document fragments from Layer 2 documenter and merges them into integrated project documents by template.
 *     Supports 8 project document types and allows custom template registration.
 */

import * as Handlebars from 'handlebars';
import { Layer3Error } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type {
  DEFAULT_PROJECT_TEMPLATES,
  DocumentFragment,
  DocumentTemplate,
  IntegratedDocument,
  ProjectDocumentType,
} from './types.js';

/**
 * 문서 통합 옵션 / Document integration options
 */
export interface IntegrateOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 문서 유형 / Document type */
  readonly type: ProjectDocumentType;
  /** 조각 문서 경로 패턴 / Fragment document path pattern */
  readonly fragmentPattern: string;
  /** 출력 경로 / Output path */
  readonly outputPath: string;
  /** 템플릿 ID (선택) / Template ID (optional) */
  readonly templateId?: string;
}

/**
 * 문서 통합기 인터페이스 / Document integrator interface
 */
export interface IDocIntegrator {
  /**
   * 조각 문서를 수집한다 / Collect fragment documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param pattern - 파일 패턴 / File pattern
   * @returns 조각 문서 배열 / Fragment document array
   */
  collectFragments(
    projectId: string,
    pattern: string,
  ): Promise<Result<readonly DocumentFragment[], Layer3Error>>;

  /**
   * 조각 문서를 통합하여 프로젝트 문서를 생성한다 / Integrate fragments into project document
   *
   * @param options - 통합 옵션 / Integration options
   * @returns 통합 문서 / Integrated document
   */
  integrate(options: IntegrateOptions): Promise<Result<IntegratedDocument, Layer3Error>>;

  /**
   * 모든 프로젝트 문서를 생성한다 / Generate all project documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 문서 배열 / Generated document array
   */
  generateAll(
    projectId: string,
    outputDir: string,
  ): Promise<Result<readonly IntegratedDocument[], Layer3Error>>;

  /**
   * 사용 가능한 템플릿 목록을 조회한다 / List available templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  listTemplates(includeCustom?: boolean): Promise<Result<readonly DocumentTemplate[], Layer3Error>>;

  /**
   * 커스텀 템플릿을 등록한다 / Register a custom template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  registerTemplate(template: DocumentTemplate): Promise<Result<void, Layer3Error>>;
}

/**
 * DocIntegrator 구현 클래스 / DocIntegrator implementation
 */
export class DocIntegrator implements IDocIntegrator {
  private readonly logger: Logger;
  private readonly templateRegistry: Map<string, DocumentTemplate>;
  private docCounter = 0;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'doc-integrator' });
    this.templateRegistry = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * 기본 템플릿 로드 / Load default templates
   */
  private loadDefaultTemplates(): void {
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
      this.templateRegistry.set(template.id, template);
    }

    this.logger.debug('기본 템플릿 로드 완료', {
      count: this.templateRegistry.size,
    });
  }

  /**
   * 조각 문서를 수집한다 / Collect fragment documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param pattern - 파일 패턴 (예: .adev/docs/fragments/**\/*.md) / File pattern
   * @returns 조각 문서 배열 / Fragment document array
   */
  async collectFragments(
    projectId: string,
    pattern: string,
  ): Promise<Result<readonly DocumentFragment[], Layer3Error>> {
    try {
      // 입력 검증
      if (!projectId || projectId.trim() === '') {
        const error = new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음');
        this.logger.error('프로젝트 ID 검증 실패', { projectId });
        return err(error);
      }

      this.logger.debug('조각 문서 수집 시작', { projectId, pattern });

      // TODO: 실제 파일 시스템에서 Glob으로 파일 검색 및 파싱
      // 현재는 빈 배열 반환
      const fragments: DocumentFragment[] = [];

      this.logger.info('조각 문서 수집 완료', {
        projectId,
        count: fragments.length,
      });

      return ok(fragments);
    } catch (cause) {
      const error = new Layer3Error(
        'layer3_fragment_collect_failed',
        `조각 문서 수집 실패: ${pattern}`,
        cause,
      );
      this.logger.error('조각 문서 수집 실패', { projectId, pattern, error });
      return err(error);
    }
  }

  /**
   * 조각 문서를 통합하여 프로젝트 문서를 생성한다 / Integrate fragments into project document
   *
   * @param options - 통합 옵션 / Integration options
   * @returns 통합 문서 / Integrated document
   */
  async integrate(options: IntegrateOptions): Promise<Result<IntegratedDocument, Layer3Error>> {
    try {
      this.logger.debug('문서 통합 시작', { options });

      // 0. 입력 검증
      if (!options.projectId || options.projectId.trim() === '') {
        const error = new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음');
        this.logger.error('프로젝트 ID 검증 실패', { projectId: options.projectId });
        return err(error);
      }

      // 1. 조각 문서 수집
      const fragmentsResult = await this.collectFragments(
        options.projectId,
        options.fragmentPattern,
      );
      if (!fragmentsResult.ok) {
        const error = new Layer3Error('layer3_fragment_collect_failed', '조각 문서 수집 실패');
        return err(error);
      }

      const fragments = fragmentsResult.value;

      // 2. 템플릿 선택
      const templateId = options.templateId ?? `default-${options.type}`;
      const template = this.templateRegistry.get(templateId);

      if (!template) {
        const error = new Layer3Error(
          'layer3_template_not_found',
          `템플릿을 찾을 수 없음: ${templateId}`,
        );
        this.logger.error('템플릿을 찾을 수 없음', { templateId });
        return err(error);
      }

      // 3. 조각 필터링 (문서 유형에 따라)
      const filteredFragments = this.filterFragmentsByType(fragments, options.type);

      // 4. 템플릿 렌더링
      const renderResult = await this.renderTemplate(
        template,
        filteredFragments,
        options.projectId,
      );
      if (!renderResult.ok) {
        const error = new Layer3Error('layer3_template_render_failed', '템플릿 렌더링 실패');
        return err(error);
      }

      const content = renderResult.value;

      // 5. 통합 문서 생성
      this.docCounter += 1;
      const doc: IntegratedDocument = {
        id: `doc-${this.docCounter}`,
        projectId: options.projectId,
        type: options.type,
        content,
        outputPath: options.outputPath,
        fragmentIds: filteredFragments.map((f) => f.id),
        generatedAt: new Date(),
      };

      this.logger.info('문서 통합 완료', {
        docId: doc.id,
        projectId: options.projectId,
        type: options.type,
        fragmentCount: filteredFragments.length,
      });

      return ok(doc);
    } catch (cause) {
      const error = new Layer3Error(
        'layer3_document_integration_failed',
        `문서 통합 실패: ${options.type}`,
        cause,
      );
      this.logger.error('문서 통합 실패', { options, error });
      return err(error);
    }
  }

  /**
   * 모든 프로젝트 문서를 생성한다 / Generate all project documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param outputDir - 출력 디렉토리 / Output directory
   * @returns 생성된 문서 배열 / Generated document array
   */
  async generateAll(
    projectId: string,
    outputDir: string,
  ): Promise<Result<readonly IntegratedDocument[], Layer3Error>> {
    try {
      // 입력 검증
      if (!projectId || projectId.trim() === '') {
        const error = new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음');
        this.logger.error('프로젝트 ID 검증 실패', { projectId });
        return err(error);
      }

      this.logger.info('모든 프로젝트 문서 생성 시작', { projectId, outputDir });

      const documents: IntegratedDocument[] = [];
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

      const outputFileMap: Record<ProjectDocumentType, string> = {
        readme: `${outputDir}/README.md`,
        'api-reference': `${outputDir}/API.md`,
        architecture: `${outputDir}/ARCHITECTURE.md`,
        'user-manual': `${outputDir}/USER_MANUAL.md`,
        'installation-guide': `${outputDir}/INSTALL.md`,
        'test-report': `${outputDir}/TEST_REPORT.md`,
        changelog: `${outputDir}/CHANGELOG.md`,
        'contributing-guide': `${outputDir}/CONTRIBUTING.md`,
      };

      for (const type of defaultTypes) {
        const result = await this.integrate({
          projectId,
          type,
          fragmentPattern: '.adev/docs/fragments/**/*.md',
          outputPath: outputFileMap[type],
        });

        if (!result.ok) {
          this.logger.error('문서 생성 실패', { type });
          const error = new Layer3Error(
            'layer3_document_generation_failed',
            `문서 생성 실패: ${type}`,
          );
          return err(error);
        }

        documents.push(result.value);
      }

      this.logger.info('모든 프로젝트 문서 생성 완료', {
        projectId,
        count: documents.length,
      });

      return ok(documents);
    } catch (cause) {
      const error = new Layer3Error('layer3_generate_all_failed', '모든 문서 생성 실패', cause);
      this.logger.error('모든 문서 생성 실패', { projectId, error });
      return err(error);
    }
  }

  /**
   * 사용 가능한 템플릿 목록을 조회한다 / List available templates
   *
   * @param includeCustom - 커스텀 템플릿 포함 여부 / Whether to include custom templates
   * @returns 템플릿 배열 / Template array
   */
  async listTemplates(
    includeCustom = true,
  ): Promise<Result<readonly DocumentTemplate[], Layer3Error>> {
    try {
      const allTemplates = Array.from(this.templateRegistry.values());

      const filtered = includeCustom ? allTemplates : allTemplates.filter((t) => !t.custom);

      this.logger.debug('템플릿 목록 조회', {
        total: allTemplates.length,
        filtered: filtered.length,
        includeCustom,
      });

      return ok(filtered);
    } catch (cause) {
      const error = new Layer3Error('layer3_list_templates_failed', '템플릿 목록 조회 실패', cause);
      this.logger.error('템플릿 목록 조회 실패', { error });
      return err(error);
    }
  }

  /**
   * 커스텀 템플릿을 등록한다 / Register a custom template
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void, Layer3Error>> {
    try {
      if (this.templateRegistry.has(template.id)) {
        const error = new Layer3Error(
          'layer3_template_duplicate',
          `템플릿 ID가 이미 존재함: ${template.id}`,
        );
        this.logger.error('템플릿 ID 중복', { templateId: template.id });
        return err(error);
      }

      // TODO: template.templatePath 파일 존재 확인

      this.templateRegistry.set(template.id, template);

      this.logger.info('커스텀 템플릿 등록 완료', {
        templateId: template.id,
        type: template.type,
      });

      return ok(undefined);
    } catch (cause) {
      const error = new Layer3Error(
        'layer3_register_template_failed',
        `커스텀 템플릿 등록 실패: ${template.id}`,
        cause,
      );
      this.logger.error('커스텀 템플릿 등록 실패', { template, error });
      return err(error);
    }
  }

  /**
   * 문서 유형에 따라 조각을 필터링한다 / Filter fragments by document type
   *
   * @param fragments - 전체 조각 목록 / All fragments
   * @param docType - 문서 유형 / Document type
   * @returns 필터링된 조각 배열 / Filtered fragment array
   */
  private filterFragmentsByType(
    fragments: readonly DocumentFragment[],
    docType: ProjectDocumentType,
  ): readonly DocumentFragment[] {
    // WHY: 각 문서 유형에 적합한 조각만 선택
    switch (docType) {
      case 'readme':
        return fragments.filter((f) => f.type === 'feature-doc' || f.type === 'decision');
      case 'api-reference':
        return fragments.filter((f) => f.type === 'api-spec');
      case 'test-report':
        return fragments.filter((f) => f.type === 'test-result');
      case 'changelog':
        return fragments.filter((f) => f.type === 'changelog');
      case 'architecture':
        return fragments.filter((f) => f.type === 'decision' || f.type === 'review');
      case 'user-manual':
      case 'installation-guide':
      case 'contributing-guide':
        return fragments.filter((f) => f.type === 'feature-doc');
      default:
        return fragments;
    }
  }

  /**
   * Handlebars 템플릿을 렌더링한다 / Render Handlebars template
   *
   * @param template - 템플릿 정의 / Template definition
   * @param fragments - 조각 문서 배열 / Fragment document array
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 렌더링된 문서 내용 / Rendered document content
   */
  private async renderTemplate(
    template: DocumentTemplate,
    fragments: readonly DocumentFragment[],
    projectId: string,
  ): Promise<Result<string, Layer3Error>> {
    try {
      // TODO: 실제 템플릿 파일 읽기
      // 현재는 간단한 기본 템플릿 사용
      const templateSource = this.getDefaultTemplateSource(template.type);

      const compiledTemplate = Handlebars.compile(templateSource);

      const context = {
        projectId,
        projectName: projectId,
        projectDescription: `Project ${projectId}`,
        fragments,
        generatedAt: new Date().toISOString(),
        license: 'MIT',
      };

      const content = compiledTemplate(context);

      this.logger.debug('템플릿 렌더링 완료', {
        templateId: template.id,
        contentLength: content.length,
      });

      return ok(content);
    } catch (cause) {
      const error = new Layer3Error(
        'layer3_template_render_failed',
        `템플릿 렌더링 실패: ${template.id}`,
        cause,
      );
      this.logger.error('템플릿 렌더링 실패', { template, error });
      return err(error);
    }
  }

  /**
   * 기본 템플릿 소스를 반환한다 (임시) / Return default template source (temporary)
   */
  private getDefaultTemplateSource(type: ProjectDocumentType | string): string {
    // WHY: 실제 파일 시스템 읽기 전까지 간단한 기본 템플릿 사용
    return `# {{projectName}}

{{projectDescription}}

## Features

{{#each fragments}}
{{#if (eq type 'feature-doc')}}
### {{metadata.featureName}}

{{content}}

{{/if}}
{{/each}}

---

Generated by adev on {{generatedAt}}
`;
  }
}
