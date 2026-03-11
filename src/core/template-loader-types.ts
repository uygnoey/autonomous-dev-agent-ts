/**
 * TemplateLoader 타입 정의 / TemplateLoader type definitions
 *
 * @description
 * KR: 프롬프트 템플릿 파일 로드에 필요한 인터페이스와 옵션 타입을 정의한다.
 * EN: Defines interfaces and option types for loading prompt template files.
 */

import type { Result } from 'core/types.js';

// ── 데이터 타입 ──────────────────────────────────────────────

/**
 * 지원하는 템플릿 파일 확장자 / Supported template file formats
 */
export type TemplateFormat = 'md' | 'hbs' | 'txt';

/**
 * 로드된 프롬프트 템플릿 / A loaded prompt template
 *
 * @param name - 파일명 (확장자 제외)
 * @param content - 파일 전체 텍스트
 * @param format - 파일 형식 ('md' | 'hbs' | 'txt')
 * @param path - 파일 절대 경로
 * @param source - 'project' | 'global' — 로드 출처
 */
export interface PromptTemplate {
  readonly name: string;
  readonly content: string;
  readonly format: TemplateFormat;
  readonly path: string;
  readonly source: 'project' | 'global';
}

// ── 옵션 타입 ─────────────────────────────────────────────────

/**
 * load() 동작 옵션 / Options for TemplateLoader.load()
 *
 * @param formats - 로드할 파일 확장자 필터 (기본: 모두)
 * @param maxFileSizeBytes - 이 크기를 초과하는 파일은 제외 (기본: 1_048_576 = 1MB)
 */
export interface TemplateLoadOptions {
  readonly formats?: readonly TemplateFormat[];
  readonly maxFileSizeBytes?: number;
}

// ── 상수 ─────────────────────────────────────────────────────

/** 기본 최대 파일 크기: 1MB */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 1_048_576;

/** 지원하는 모든 템플릿 포맷 */
export const ALL_TEMPLATE_FORMATS: readonly TemplateFormat[] = ['md', 'hbs', 'txt'];

// ── 인터페이스 ────────────────────────────────────────────────

/**
 * TemplateLoader 인터페이스 / Interface for loading prompt templates
 *
 * @example
 * const loader: ITemplateLoader = new TemplateLoader(logger);
 * const result = await loader.load('/project/.claude/templates', '~/.claude/templates');
 * if (result.ok) {
 *   const tpl = loader.getByName('plan-prompt', result.value);
 * }
 */
export interface ITemplateLoader {
  /**
   * 프로젝트/글로벌 템플릿 디렉토리에서 템플릿 파일을 로드한다.
   * Loads template files from project and/or global template directories.
   *
   * @param projectTemplatesDir - 프로젝트 템플릿 루트 경로 (없으면 생략)
   * @param globalTemplatesDir - 글로벌 템플릿 루트 경로 (없으면 생략)
   * @param options - 로드 옵션 (포맷 필터, 파일 크기 제한)
   * @returns 성공 시 PromptTemplate[] (중복 이름은 project가 global 덮어씀)
   */
  load(
    projectTemplatesDir?: string,
    globalTemplatesDir?: string,
    options?: TemplateLoadOptions,
  ): Promise<Result<readonly PromptTemplate[]>>;

  /**
   * 이름으로 템플릿을 찾는다. 없으면 undefined.
   * Finds a template by name. Returns undefined if not found.
   *
   * @param name - 찾을 템플릿 이름 (확장자 제외)
   * @param templates - 검색 대상 템플릿 목록
   * @returns 찾은 PromptTemplate 또는 undefined
   */
  getByName(name: string, templates: readonly PromptTemplate[]): PromptTemplate | undefined;
}
