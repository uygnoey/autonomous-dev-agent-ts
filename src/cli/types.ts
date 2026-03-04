/**
 * CLI 타입 정의 / CLI type definitions
 *
 * @description
 * KR: adev CLI 명령어 및 옵션 타입 정의.
 * EN: Type definitions for adev CLI commands and options.
 */

// ── CLI 명령어 / CLI Commands ──────────────────────────────────

/**
 * CLI 명령어 타입 / CLI command type
 *
 * @description
 * KR: adev CLI에서 사용 가능한 명령어 타입.
 * EN: Available command types for adev CLI.
 */
export type CliCommand = 'init' | 'start' | 'config' | 'project' | 'version' | 'help';

/**
 * 프로젝트 서브 명령어 타입 / Project sub-command type
 */
export type ProjectSubCommand = 'add' | 'remove' | 'list' | 'switch' | 'update';

/**
 * 설정 서브 명령어 타입 / Config sub-command type
 */
export type ConfigSubCommand = 'get' | 'set' | 'list' | 'reset';

// ── CLI 옵션 / CLI Options ─────────────────────────────────────

/**
 * 전역 CLI 옵션 / Global CLI options
 *
 * @description
 * KR: 모든 CLI 명령어에 공통으로 사용되는 옵션.
 * EN: Options common to all CLI commands.
 */
export interface GlobalCliOptions {
  /** 상세 로그 출력 / Verbose logging */
  readonly verbose?: boolean;
  /** 도움말 표시 / Show help */
  readonly help?: boolean;
  /** 버전 표시 / Show version */
  readonly version?: boolean;
  /** 색상 비활성화 / Disable colors */
  readonly noColor?: boolean;
}

/**
 * init 명령어 옵션 / init command options
 */
export interface InitOptions extends GlobalCliOptions {
  /** 프로젝트 경로 (기본: 현재 디렉토리) / Project path (default: current directory) */
  readonly path?: string;
  /** 인증 방식 (선택 안 하면 프롬프트) / Auth method (prompt if not specified) */
  readonly auth?: 'api-key' | 'subscription';
  /** 대화형 모드 스킵 / Skip interactive mode */
  readonly yes?: boolean;
}

/**
 * start 명령어 옵션 / start command options
 */
export interface StartOptions extends GlobalCliOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId?: string;
  /** 기능 설명 / Feature description */
  readonly feature?: string;
}

/**
 * config 명령어 옵션 / config command options
 */
export interface ConfigOptions extends GlobalCliOptions {
  /** 서브 명령어 / Sub-command */
  readonly subCommand: ConfigSubCommand;
  /** 설정 키 / Config key */
  readonly key?: string;
  /** 설정 값 / Config value */
  readonly value?: string;
  /** 글로벌 설정 / Global config */
  readonly global?: boolean;
}

/**
 * project 명령어 옵션 / project command options
 */
export interface ProjectOptions extends GlobalCliOptions {
  /** 서브 명령어 / Sub-command */
  readonly subCommand: ProjectSubCommand;
  /** 프로젝트 경로 / Project path */
  readonly path?: string;
  /** 프로젝트 ID / Project ID */
  readonly id?: string;
  /** 프로젝트 이름 / Project name */
  readonly name?: string;
  /** .adev/ 디렉토리 삭제 여부 / Whether to delete .adev/ directory */
  readonly deleteData?: boolean;
}

// ── 프로젝트 관리 / Project Management ──────────────────────────

/**
 * 프로젝트 상태 / Project status
 */
export type ProjectStatus = 'active' | 'archived' | 'deleted';

/**
 * 프로젝트 정보 / Project information
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
  /** 프로젝트 절대 경로 / Project absolute path */
  readonly path: string;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
  /** 최종 접근 시각 / Last accessed at */
  readonly lastAccessedAt?: Date;
  /** 상태 / Status */
  readonly status: ProjectStatus;
}

/**
 * 프로젝트 레지스트리 / Project registry
 *
 * @description
 * KR: ~/.adev/projects.json 전체 구조.
 * EN: Full structure of ~/.adev/projects.json.
 */
export interface ProjectRegistry {
  /** 활성 프로젝트 ID / Active project ID */
  readonly activeProjectId?: string;
  /** 프로젝트 목록 / Project list */
  readonly projects: readonly ProjectInfo[];
}

// ── 설정 관리 / Configuration Management ────────────────────────

/**
 * 인증 방식 / Authentication method
 */
export type AuthMethod = 'api-key' | 'subscription';

/**
 * adev 설정 / adev configuration
 *
 * @description
 * KR: ~/.adev/config.json 또는 .adev/config.json에 저장되는 설정.
 * EN: Configuration stored in ~/.adev/config.json or .adev/config.json.
 */
export interface AdevConfig {
  /** 인증 방식 / Authentication method */
  readonly authMethod: AuthMethod;
  /** 기본 모델 (검증용, 기본: Opus 4.6) / Default model (default: Opus 4.6) */
  readonly defaultModel?: string;
  /** 4중 검증 모델 (기본: Opus, Sonnet 옵션) / 4-layer verification model */
  readonly verificationModel?: string;
  /** 임베딩 프로바이더 (기본: xenova-minilm) / Embedding provider */
  readonly embeddingProvider?: string;
  /** 로그 레벨 / Log level */
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** 추가 설정 / Additional settings */
  readonly [key: string]: unknown;
}

// ── CLI 실행 결과 / CLI Execution Result ────────────────────────

/**
 * CLI 명령어 실행 결과 / CLI command execution result
 *
 * @description
 * KR: 각 CLI 명령어가 반환하는 실행 결과.
 * EN: Execution result returned by each CLI command.
 */
export interface CliResult {
  /** 성공 여부 / Success status */
  readonly success: boolean;
  /** 메시지 / Message */
  readonly message: string;
  /** 결과 데이터 / Result data */
  readonly data?: unknown;
  /** 종료 코드 / Exit code */
  readonly exitCode: number;
}

// ── CLI 명령어 핸들러 인터페이스 / CLI Command Handler Interface ──

/**
 * CLI 명령어 핸들러 / CLI command handler
 *
 * @description
 * KR: 각 CLI 명령어가 구현해야 하는 인터페이스.
 * EN: Interface that each CLI command must implement.
 */
export interface CliCommandHandler<T extends GlobalCliOptions = GlobalCliOptions> {
  /**
   * 명령어를 실행한다 / Execute the command
   *
   * @param options - 명령어 옵션 / Command options
   * @returns 실행 결과 / Execution result
   */
  execute(options: T): Promise<CliResult>;

  /**
   * 도움말을 표시한다 / Show help
   *
   * @returns 도움말 텍스트 / Help text
   */
  help(): string;
}

// ── 상수 정의 / Constants ──────────────────────────────────────

/**
 * 기본 설정 / Default configuration
 */
export const DEFAULT_CONFIG: AdevConfig = {
  authMethod: 'api-key',
  defaultModel: 'claude-opus-4-6',
  verificationModel: 'claude-opus-4-6',
  embeddingProvider: 'xenova-minilm',
  logLevel: 'info',
} as const;

/**
 * 종료 코드 / Exit codes
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  NOT_FOUND: 3,
  PERMISSION_DENIED: 4,
  AUTH_ERROR: 5,
} as const;

/**
 * CLI 버전 / CLI version
 */
export const CLI_VERSION = '1.0.0';

/**
 * 설정 파일 경로 / Config file paths
 */
export const CONFIG_PATHS = {
  GLOBAL_CONFIG: '~/.adev/config.json',
  GLOBAL_PROJECTS: '~/.adev/projects.json',
  PROJECT_CONFIG: '.adev/config.json',
  PROJECT_DATA: '.adev/data',
  PROJECT_AGENTS: '.adev/agents',
} as const;
