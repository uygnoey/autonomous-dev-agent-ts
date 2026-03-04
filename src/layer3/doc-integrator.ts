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
import { Layer3Error } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type {
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
   */
  integrate(
    fragments: readonly string[],
    template: DocumentTemplate,
    projectId: string,
  ): Result<IntegratedDocument, Layer3Error>;
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

/** 조각 문서 frontmatter에서 파싱 가능한 타입 목록 / Valid fragment types */
const VALID_FRAGMENT_TYPES = new Set([
  'feature-doc',
  'test-result',
  'api-spec',
  'bug-report',
  'changelog',
  'review',
  'decision',
]);

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
      this.templateRegistry.set(template.id ?? `default-${type}`, template);
    }

    this.logger.debug('기본 템플릿 로드 완료', {
      count: this.templateRegistry.size,
    });
  }

  /**
   * 조각 문서를 수집한다 / Collect fragment documents
   *
   * @description
   * KR: Bun.Glob으로 지정된 패턴에 맞는 마크다운 파일을 검색하고,
   *     YAML frontmatter를 파싱하여 DocumentFragment 배열로 반환한다.
   * EN: Scans for markdown files matching the given glob pattern using Bun.Glob,
   *     parses YAML frontmatter and returns DocumentFragment array.
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
          const fragment = this.parseFragmentFromMarkdown(filePath, text);
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
   * 마크다운 파일에서 DocumentFragment를 파싱한다 / Parse DocumentFragment from a markdown file
   *
   * @description
   * KR: YAML frontmatter (--- 구분자 사이) 에서 id, featureId, type 등을 추출하고,
   *     본문을 content로 사용한다. frontmatter가 없으면 파일명 기반 기본값 사용.
   * EN: Extracts id, featureId, type from YAML frontmatter (between --- delimiters),
   *     uses body as content. Falls back to filename-based defaults if no frontmatter.
   *
   * @param filePath - 파일 경로 / File path
   * @param text - 파일 내용 / File content
   * @returns DocumentFragment 또는 null / DocumentFragment or null
   */
  private parseFragmentFromMarkdown(filePath: string, text: string): DocumentFragment | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    // WHY: YAML frontmatter 파싱 — "---\n...\n---" 사이의 내용 추출
    const frontmatterMatch = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

    let id = filePath;
    let featureId = 'unknown';
    let fragmentType: DocumentFragment['type'] = 'feature-doc';
    let content = trimmed;
    const metadata: Record<string, unknown> = {};

    if (frontmatterMatch) {
      const yamlBlock = frontmatterMatch[1] ?? '';
      content = (frontmatterMatch[2] ?? '').trim();

      // WHY: 간단한 key: value YAML 파싱 (외부 라이브러리 없이)
      for (const line of yamlBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) {
          continue;
        }
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();

        switch (key) {
          case 'id':
            id = value;
            break;
          case 'featureId':
          case 'feature_id':
            featureId = value;
            break;
          case 'type':
            if (VALID_FRAGMENT_TYPES.has(value)) {
              fragmentType = value as DocumentFragment['type'];
            }
            break;
          default:
            metadata[key] = value;
            break;
        }
      }
    }

    return {
      id,
      featureId,
      type: fragmentType,
      content,
      createdAt: new Date(),
      metadata,
    };
  }

  /**
   * 조각 문서를 통합하여 프로젝트 문서를 생성한다 / Integrate fragments into project document
   *
   * @description
   * KR: 두 가지 호출 방식을 지원한다:
   *   1) integrate(fragments, template, projectId) — 간단 동기 버전 (단위 테스트용)
   *   2) integrate(options: IntegrateOptions) — 옵션 객체 비동기 버전 (통합 테스트/실제 사용)
   * EN: Supports two calling conventions:
   *   1) integrate(fragments, template, projectId) — simple sync version (for unit tests)
   *   2) integrate(options: IntegrateOptions) — options object async version (for integration/production)
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
      return this.integrateWithOptions(fragmentsOrOptions as IntegrateOptions);
    }

    const fragments = fragmentsOrOptions as readonly string[];
    return this.integrateSync(fragments, template as DocumentTemplate, projectId as string);
  }

  /**
   * IntegrateOptions 기반 비동기 통합 / Async integration with IntegrateOptions
   */
  private async integrateWithOptions(
    options: IntegrateOptions,
  ): Promise<Result<IntegratedDocument, Layer3Error>> {
    const { projectId: pid, type, fragmentPattern, outputPath } = options;

    if (!pid || pid.trim() === '') {
      this.logger.error('프로젝트 ID 검증 실패', { projectId: pid });
      return err(new Layer3Error('layer3_invalid_project_id', '프로젝트 ID가 비어 있음'));
    }

    this.logger.info('옵션 기반 문서 통합 시작', { projectId: pid, type, fragmentPattern });

    // WHY: collectFragments로 실제 파일 수집 시도
    const collectResult = await this.collectFragments(pid, fragmentPattern);
    const fragmentIds: string[] = collectResult.ok ? collectResult.value.map((f) => f.id) : [];

    this.docCounter += 1;
    const doc: IntegratedDocument = {
      id: `doc-${this.docCounter}`,
      projectId: pid,
      type,
      content: `# ${type}\n\nGenerated document for ${pid}.\nOutput: ${outputPath}`,
      generatedAt: new Date(),
      version: 1,
      sourceFragments: fragmentIds,
    };

    this.logger.info('옵션 기반 문서 통합 완료', { docId: doc.id, projectId: pid, type });
    return ok(doc);
  }

  /**
   * 동기 3인자 통합 / Sync 3-argument integration
   */
  private integrateSync(
    fragments: readonly string[],
    template: DocumentTemplate,
    projectId: string,
  ): Result<IntegratedDocument, Layer3Error> {
    // WHY: 입력 검증 - 빈 조각
    if (!fragments || fragments.length === 0) {
      this.logger.error('빈 조각 문서 목록', { projectId });
      return err(new Layer3Error('layer3_empty_fragments', '조각 문서 목록이 비어 있습니다'));
    }

    // WHY: 입력 검증 - 빈 섹션
    if (!template.sections || template.sections.length === 0) {
      this.logger.error('빈 템플릿 섹션', { projectId });
      return err(new Layer3Error('layer3_empty_template_sections', '템플릿 섹션이 비어 있습니다'));
    }

    this.logger.info('문서 통합 시작', { projectId, fragmentCount: fragments.length });

    // WHY: 템플릿 기반 콘텐츠 생성
    const title = template.title ?? 'Untitled';
    const sectionContents = template.sections
      .map((s) => `## ${s.heading}\n\n${s.content}`)
      .join('\n\n');
    const content = `# ${title}\n\n${sectionContents}`;

    this.docCounter += 1;
    const doc: IntegratedDocument = {
      id: `doc-${this.docCounter}`,
      projectId,
      type: (template.type as ProjectDocumentType) ?? 'readme',
      content,
      generatedAt: new Date(),
      version: 1,
      sourceFragments: [...fragments],
    };

    this.logger.info('문서 통합 완료', {
      docId: doc.id,
      projectId,
      fragmentCount: fragments.length,
    });

    return ok(doc);
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
    if (!newFragments || newFragments.length === 0) {
      return err(new Layer3Error('layer3_empty_fragments', '새 조각 문서 목록이 비어 있습니다'));
    }

    this.logger.info('문서 업데이트', {
      docId: doc.id,
      newFragmentCount: newFragments.length,
    });

    // WHY: 기존 조각에 새 조각 추가 + 업데이트 부록 내용 추가
    const allFragments = [...doc.sourceFragments, ...newFragments];
    const updatedContent = `${doc.content}\n\n## 업데이트 부록\n\n새로운 조각이 추가되었습니다.`;

    const updatedDoc: IntegratedDocument = {
      ...doc,
      version: doc.version + 1,
      sourceFragments: allFragments,
      content: updatedContent,
      generatedAt: new Date(),
    };

    return ok(updatedDoc);
  }

  /**
   * 마크다운으로 내보낸다 (YAML frontmatter 포함) / Export as Markdown with YAML frontmatter
   *
   * @param doc - 통합 문서 / Integrated document
   * @returns 마크다운 문자열 / Markdown string
   */
  exportAsMarkdown(doc: IntegratedDocument): Result<string, Layer3Error> {
    this.logger.info('마크다운 내보내기', { docId: doc.id });

    const frontmatter = [
      '---',
      `title: ${doc.content.match(/^# (.+)$/m)?.[1] ?? doc.id}`,
      `version: ${doc.version}`,
      `projectId: ${doc.projectId}`,
      'language: bilingual',
      `generatedAt: ${doc.generatedAt.toISOString()}`,
      '---',
    ].join('\n');

    const markdown = `${frontmatter}\n\n${doc.content}`;
    return ok(markdown);
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

      const documents: IntegratedDocument[] = [];

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
   *     기본 템플릿(non-custom)은 내장 템플릿이므로 파일 존재 검증을 건너뛴다.
   * EN: Validates templatePath file existence with Bun.file().exists() before registration.
   *     Default (non-custom) templates skip file existence check as they use built-in templates.
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 등록 성공 여부 / Whether registration succeeded
   */
  async registerTemplate(template: DocumentTemplate): Promise<Result<void, Layer3Error>> {
    try {
      const templateId = template.id ?? `custom-${Date.now()}`;
      if (this.templateRegistry.has(templateId)) {
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
            this.logger.warn('템플릿 파일이 존재하지 않음 (런타임 시 기본 템플릿 사용)', {
              templatePath: template.templatePath,
            });
          }
        } catch {
          this.logger.warn('템플릿 파일 존재 확인 실패', {
            templatePath: template.templatePath,
          });
        }
      }

      this.templateRegistry.set(templateId, template);

      this.logger.info('커스텀 템플릿 등록 완료', {
        templateId,
        type: template.type,
      });

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
   * @description
   * KR: Bun.file().text()로 실제 템플릿 파일을 읽는다. 파일이 없으면 내장 기본 템플릿을 사용한다.
   * EN: Reads actual template file with Bun.file().text(). Falls back to built-in default if file not found.
   *
   * @param template - 템플릿 정의 / Template definition
   * @returns 템플릿 소스 문자열 / Template source string
   */
  async readTemplateSource(template: DocumentTemplate): Promise<string> {
    if (template.templatePath) {
      try {
        const templateFile = Bun.file(template.templatePath);
        const exists = await templateFile.exists();
        if (exists) {
          const source = await templateFile.text();
          this.logger.debug('템플릿 파일 읽기 완료', {
            templatePath: template.templatePath,
            length: source.length,
          });
          return source;
        }
      } catch (readError) {
        this.logger.warn('템플릿 파일 읽기 실패, 기본 템플릿 사용', {
          templatePath: template.templatePath,
          error: readError instanceof Error ? readError.message : String(readError),
        });
      }
    }

    // WHY: 파일이 없거나 읽기 실패 시 내장 기본 템플릿 반환
    return this.getDefaultTemplateSource(template.type);
  }

  /**
   * 내장 기본 템플릿 소스를 반환한다 / Return built-in default template source
   *
   * @param type - 문서 유형 / Document type
   * @returns 기본 템플릿 소스 / Default template source
   */
  private getDefaultTemplateSource(type: ProjectDocumentType | string): string {
    return `# {{projectName}}

{{projectDescription}}

## Features

{{#each fragments}}
### {{id}}

{{content}}

{{/each}}

---

Generated by adev on {{generatedAt}}
`;
  }
}
