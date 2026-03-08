/**
 * 문서 통합기 타입 정의 / Document Integrator type definitions
 *
 * @description
 * KR: DocIntegrator에서 사용하는 인터페이스와 상수를 정의한다.
 * EN: Defines interfaces and constants used by DocIntegrator.
 */

import type { Layer3Error } from 'core/errors.js';
import type { Result } from 'core/types.js';
import type {
  DocumentFragment,
  DocumentTemplate,
  IntegratedDocument,
  ProjectDocumentType,
} from 'layer3/types.js';

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
export const VALID_FRAGMENT_TYPES = new Set([
  'feature-doc',
  'test-result',
  'api-spec',
  'bug-report',
  'changelog',
  'review',
  'decision',
]);
