/**
 * SkillMerger 타입 정의 / SkillMerger type definitions
 *
 * @description
 * KR: skill 파일 스캔·병합에 필요한 인터페이스와 옵션 타입을 정의한다.
 * EN: Defines interfaces and option types for scanning and merging skill files.
 */

import type { Result } from 'core/types.js';

// ── 데이터 타입 ──────────────────────────────────────────────

/**
 * skill references 폴더 내 단일 참조 파일 / A single reference file inside skill's references/
 *
 * @param name - 파일명 (확장자 제외)
 * @param content - 파일 전체 텍스트
 */
export interface SkillReference {
  readonly name: string;
  readonly content: string;
}

/**
 * 스캔된 skill 파일 / A scanned skill file (SKILL.md)
 *
 * @param name - skill 디렉토리 이름 (= skill 이름)
 * @param content - SKILL.md 전체 텍스트
 * @param path - SKILL.md 절대 파일 경로
 * @param source - 'project' | 'global' — 로드 출처
 * @param references - references/ 폴더에서 로드된 파일들 (옵션)
 */
export interface SkillFile {
  readonly name: string;
  readonly content: string;
  readonly path: string;
  readonly source: 'project' | 'global';
  readonly references?: readonly SkillReference[];
}

// ── 옵션 타입 ─────────────────────────────────────────────────

/**
 * merge() 동작 옵션 / Options for SkillMerger.merge()
 *
 * @param includeReferences - references 파일을 병합 결과에 포함할지 여부 (기본 false)
 * @param separator - skill 간 구분자 (기본 '\n\n---\n\n')
 * @param filterNames - 이 이름 목록에 포함된 skill만 병합. 미지정 시 전부 포함.
 */
export interface SkillMergeOptions {
  readonly includeReferences?: boolean;
  readonly separator?: string;
  readonly filterNames?: readonly string[];
}

// ── 인터페이스 ────────────────────────────────────────────────

/**
 * SkillMerger 인터페이스 / Interface for scanning and merging skill files
 *
 * @example
 * const merger: ISkillMerger = new SkillMerger(logger);
 * const scanResult = await merger.scan('/project/.claude/skills', '~/.claude/skills');
 * if (scanResult.ok) {
 *   const mergeResult = merger.merge(scanResult.value, { filterNames: ['code-quality'] });
 * }
 */
export interface ISkillMerger {
  /**
   * 프로젝트/글로벌 skill 디렉토리를 스캔하여 SkillFile 목록을 반환한다.
   * Scans project and/or global skill directories and returns a list of SkillFile.
   *
   * @param projectSkillsDir - 프로젝트 skill 루트 경로 (없으면 생략)
   * @param globalSkillsDir - 글로벌 skill 루트 경로 (없으면 생략)
   * @returns 성공 시 SkillFile[] (중복 이름은 project가 global 덮어씀)
   */
  scan(projectSkillsDir?: string, globalSkillsDir?: string): Promise<Result<readonly SkillFile[]>>;

  /**
   * SkillFile 목록을 단일 문자열로 병합한다.
   * Merges a list of SkillFile into a single string.
   *
   * @param skills - 병합할 skill 목록
   * @param options - 병합 옵션
   * @returns 성공 시 병합된 문자열
   */
  merge(skills: readonly SkillFile[], options?: SkillMergeOptions): Result<string>;
}
