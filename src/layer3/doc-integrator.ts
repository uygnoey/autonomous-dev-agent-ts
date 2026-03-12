/**
 * 문서 통합기 / Document Integrator
 *
 * @description
 * KR: 2계층 documenter가 생성한 조각 문서들을 수집하고 템플릿에 따라 통합 프로젝트 문서로 병합한다.
 *     8개 프로젝트 문서 유형을 지원하며, 커스텀 템플릿 등록도 가능하다.
 * EN: Collects document fragments from Layer 2 documenter and merges them into integrated project documents by template.
 *     Supports 8 project document types and allows custom template registration.
 */

import { Glob } from 'bun';
import { Layer3Error } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type {
  DocumentFragment,
  DocumentTemplate,
  IntegratedDocument,
  ProjectDocumentType,
} from 'layer3/types.js';
export type { IntegrateOptions, IDocIntegrator } from 'layer3/doc-integrator-types.js';
import {
  buildMarkdownExport,
  buildUpdatedDocument,
  integrateSync,
  integrateWithOptions,
  parseFragmentFromMarkdown,
} from 'layer3/doc-integrator-fragment.js';
import {
  listTemplates as listTemplatesHelper,
  loadDefaultTemplates,
  readTemplateSource as readTemplateSourceHelper,
  registerTemplate as registerTemplateHelper,
} from 'layer3/doc-integrator-template.js';
import type { IDocIntegrator, IntegrateOptions } from 'layer3/doc-integrator-types.js';

/**
 * DocIntegrator 구현 클래스 / DocIntegrator implementation
 */
export class DocIntegrator implements IDocIntegrator {
  private readonly logger: Logger;
  private readonly templateRegistry: Map<string, DocumentTemplate>;
  private readonly docCounterRef: { value: number } = { value: 0 };

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'doc-integrator' });
    this.templateRegistry = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * 기본 템플릿 로드 / Load default templates
   */
  private loadDefaultTemplates(): void {
    loadDefaultTemplates(this.templateRegistry, this.logger);
  }

  /**
   * 조각 문서를 수집한다 / Collect fragment documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param pattern - 파일 패턴 / File pattern
   * @returns 조각 문서 배열 / Fragment document array
   */
  async collectFragments(
    projectId: string,
    pattern: string,
  ): Promise<Result<readonly DocumentFragment[], Layer3Error>> {
    try {
      if (!projectId || projectId.trim() === '') {
        const error = new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음');
        this.logger.error('프로젝트 ID 검증 실패', { projectId });
        return err(error);
      }

      this.logger.debug('조각 문서 수집 시작', { projectId, pattern });

      const fragments: DocumentFragment[] = [];
      const glob = new Glob(pattern);

      for await (const filePath of glob.scan('.')) {
        try {
          const file = Bun.file(filePath);
          const exists = await file.exists();
          if (!exists) {
            continue;
          }

          const text = await file.text();
          const fragment = parseFragmentFromMarkdown(filePath, text);
          if (fragment) {
            fragments.push(fragment);
          }
        } catch (fileError) {
          // WHY: 개별 파일 실패는 로그만 남기고 계속 진행
          this.logger.warn('조각 문서 파일 읽기 실패', {
            filePath,
            error: fileError instanceof Error ? fileError.message : String(fileError),
          });
        }
      }

      this.logger.info('조각 문서 수집 완료', { projectId, count: fragments.length });
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
   * @description Overload 1: sync (fragments, template, projectId). Overload 2: async (IntegrateOptions).
   */
  integrate(
    fragments: readonly string[],
    template: DocumentTemplate,
    projectId: string,
  ): Result<IntegratedDocument, Layer3Error>;
  integrate(options: IntegrateOptions): Promise<Result<IntegratedDocument, Layer3Error>>;
  integrate(
    fragmentsOrOptions: readonly string[] | IntegrateOptions,
    template?: DocumentTemplate,
    projectId?: string,
  ): Result<IntegratedDocument, Layer3Error> | Promise<Result<IntegratedDocument, Layer3Error>> {
    // WHY: IntegrateOptions 오버로드 판별 — 배열이 아니면 옵션 객체
    if (!Array.isArray(fragmentsOrOptions)) {
      return integrateWithOptions(
        fragmentsOrOptions as IntegrateOptions,
        (pid, pat) => this.collectFragments(pid, pat),
        this.docCounterRef,
        this.logger,
      );
    }

    return integrateSync(
      fragmentsOrOptions as readonly string[],
      template as DocumentTemplate,
      projectId as string,
      this.docCounterRef,
      this.logger,
    );
  }

  /**
   * 문서를 업데이트한다 / Update a document with new fragments
   *
   * @param doc - 기존 통합 문서 / Existing integrated document
   * @param newFragments - 새 조각 문서 목록 / New fragment documents
   * @returns 업데이트된 통합 문서 / Updated integrated document
   */
  updateDocument(
    doc: IntegratedDocument,
    newFragments: readonly string[],
  ): Result<IntegratedDocument, Layer3Error> {
    this.logger.info('문서 업데이트', { docId: doc.id, newFragmentCount: newFragments.length });
    return buildUpdatedDocument(doc, newFragments);
  }

  /**
   * 마크다운으로 내보낸다 (YAML frontmatter 포함) / Export as Markdown with YAML frontmatter
   *
   * @param doc - 통합 문서 / Integrated document
   * @returns 마크다운 문자열 / Markdown string
   */
  exportAsMarkdown(doc: IntegratedDocument): Result<string, Layer3Error> {
    this.logger.info('마크다운 내보내기', { docId: doc.id });
    return ok(buildMarkdownExport(doc));
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
      if (!projectId || projectId.trim() === '') {
        const error = new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음');
        this.logger.error('프로젝트 ID 검증 실패', { projectId });
        return err(error);
      }

      this.logger.info('모든 프로젝트 문서 생성 시작', { projectId, outputDir });

      const templatesResult = await this.listTemplates(true);
      if (!templatesResult.ok) {
        return err(templatesResult.error);
      }

      const templates = templatesResult.value;
      const documents: IntegratedDocument[] = [];

      // WHY: IntegrateOptions.type は ProjectDocumentType のみ受け付けるため、対象外はスキップ
      const validProjectTypes = new Set<string>([
        'readme',
        'api-reference',
        'architecture',
        'user-manual',
        'installation-guide',
        'test-report',
        'changelog',
        'contributing-guide',
      ]);

      for (const template of templates) {
        try {
          if (!validProjectTypes.has(template.type)) {
            this.logger.debug('프로젝트 문서 유형이 아님 — 건너뜀', { type: template.type });
            continue;
          }

          const options: IntegrateOptions = {
            projectId,
            type: template.type as ProjectDocumentType,
            fragmentPattern: `${outputDir}/**/*.md`,
            outputPath: `${outputDir}/${template.type}.md`,
            templateId: template.id,
          };

          const result = await this.integrate(options);
          if (result.ok) {
            documents.push(result.value);
          } else {
            // WHY: 개별 템플릿 실패 시 warn 로그 후 계속 진행 (partial success)
            this.logger.warn('개별 문서 생성 실패 — 건너뜀', {
              templateType: template.type,
              templateId: template.id,
              error: result.error.message,
            });
          }
        } catch (templateError) {
          // WHY: 개별 템플릿 예외 시에도 중단하지 않고 계속 진행
          this.logger.warn('개별 문서 생성 중 예외 — 건너뜀', {
            templateType: template.type,
            templateId: template.id,
            error: templateError instanceof Error ? templateError.message : String(templateError),
          });
        }
      }

      this.logger.info('모든 프로젝트 문서 생성 완료', { projectId, count: documents.length });
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
    return listTemplatesHelper(this.templateRegistry, includeCustom);
  }

  /**
   * 커스텀 템플릿을 등록한다 / Register a custom template
   *
   * @description
   * KR: templatePath 파일 존재 여부를 Bun.file().exists()로 검증한 후 등록한다.
   * EN: Validates templatePath file existence with Bun.file().exists() before registration.
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void, Layer3Error>> {
    return registerTemplateHelper(this.templateRegistry, template, this.logger);
  }

  /**
   * 템플릿 파일에서 Handlebars 소스를 읽는다 / Read Handlebars template source from file
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 템플릿 소스 문자열 / Template source string
   */
  async readTemplateSource(template: DocumentTemplate): Promise<string> {
    return readTemplateSourceHelper(template, this.logger);
  }
}
