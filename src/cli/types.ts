/**
 * CLI 모듈 타입 정의 / CLI module type definitions
 *
 * @description
 * KR: CLI 명령, 옵션, 프로젝트 정보, 초기화 옵션 인터페이스를 정의한다.
 * EN: Defines interfaces for CLI commands, options, project info, and init options.
 */

import type { AdevError } from '../core/errors.js';
import type { Result } from '../core/types.js';

// ── CLI 명령 인터페이스 / CLI Command Interface ─────────────────

/**
 * CLI 명령 인터페이스 / CLI command interface
 *
 * @description
 * KR: 모든 CLI 명령이 구현해야 하는 인터페이스.
 * EN: Interface that all CLI commands must implement.
 */
export interface CliCommand {
  /** 명령 이름 / Command name */
  readonly name: string;

  /** 명령 설명 / Command description */
  readonly description: string;

  /** 명령 별칭 / Command aliases */
  readonly aliases?: readonly string[];

  /**
   * 명령 실행 / Execute the command
   *
   * @param args - 위치 인자 / Positional arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  execute(args: readonly string[], options: CliOptions): Promise<Result<void, AdevError>>;
}

// ── CLI 옵션 / CLI Options ──────────────────────────────────────

/**
 * CLI 파싱 결과 옵션 / Parsed CLI options
 *
 * @description
 * KR: process.argv에서 파싱된 옵션을 담는 인터페이스.
 * EN: Interface holding options parsed from process.argv.
 */
export interface CliOptions {
  /** 프로젝트 경로 / Project path */
  readonly projectPath?: string;

  /** 상세 로깅 여부 / Verbose logging flag */
  readonly verbose?: boolean;

  /** 로그 레벨 / Log level */
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** 기타 플래그 / Additional flags */
  readonly flags: Readonly<Record<string, string | boolean>>;
}

// ── 프로젝트 정보 / Project Info ────────────────────────────────

/**
 * 등록된 프로젝트 정보 / Registered project information
 *
 * @description
 * KR: ~/.adev/projects.json에 저장되는 프로젝트 정보.
 * EN: Project information stored in ~/.adev/projects.json.
 */
export interface ProjectInfo {
  /** 프로젝트 고유 ID / Project unique ID */
  readonly id: string;

  /** 프로젝트 이름 / Project name */
  readonly name: string;

  /** 프로젝트 경로 / Project path */
  readonly path: string;

  /** 생성 시각 / Creation timestamp */
  readonly createdAt: Date;

  /** 마지막 접근 시각 / Last accessed timestamp */
  readonly lastAccessedAt: Date;
}

// ── 초기화 옵션 / Init Options ──────────────────────────────────

/**
 * 프로젝트 초기화 옵션 / Project initialization options
 *
 * @description
 * KR: init 명령 실행 시 필요한 옵션.
 * EN: Options required for the init command.
 */
export interface InitOptions {
  /** 프로젝트 경로 / Project path */
  readonly projectPath: string;

  /** 프로젝트 이름 / Project name */
  readonly projectName: string;

  /** 인증 방식 / Authentication mode */
  readonly authMode?: 'api-key' | 'oauth-token';
}

// ── 프로젝트 레지스트리 / Project Registry ───────────────────────

/**
 * 프로젝트 레지스트리 (projects.json 스키마) / Project registry schema
 *
 * @description
 * KR: ~/.adev/projects.json 파일의 구조.
 * EN: Schema for ~/.adev/projects.json file.
 */
export interface ProjectRegistry {
  /** 활성 프로젝트 이름 / Active project name */
  readonly activeProject: string | null;

  /** 등록된 프로젝트 목록 / Registered project list */
  readonly projects: readonly ProjectInfo[];
}
