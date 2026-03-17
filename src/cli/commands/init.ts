/**
 * Init 명령어 진입점 / Init command entry point
 *
 * @description
 * KR: 프로젝트 초기화 명령어. 위저드(init-wizard)와 스캐폴딩(init-scaffold)에 위임한다.
 * EN: Project initialization command. Delegates to wizard (init-wizard) and scaffolding (init-scaffold).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  checkAdevExists,
  createAdevDirectory,
  createConfigFiles,
  createProjectInfo,
  registerProject,
} from 'cli/commands/init-scaffold.js';
import { checkEnvVar, promptAndSaveToken, selectAuthMethod } from 'cli/commands/init-wizard.js';
import type { AuthMethod, CliOptions, ProjectInfo } from 'cli/types.js';
import { ConfigError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

/**
 * Init 명령어 핸들러 인터페이스 / Init command handler interface
 */
export interface IInitCommand {
  /**
   * init 명령어를 실행한다 / Execute init command
   *
   * @param args - 명령어 인자 / Command arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 실행 결과 / Execution result
   */
  execute(args: string[], options: CliOptions): Promise<Result<void, ConfigError>>;

  /**
   * 인증 방식을 선택한다 / Select authentication method
   *
   * @param interactive - 대화형 모드 여부 / Interactive mode
   * @returns 선택된 인증 방식 / Selected auth method
   */
  selectAuthMethod(interactive: boolean): Promise<Result<AuthMethod, ConfigError>>;

  /**
   * .adev/ 디렉토리를 생성한다 / Create .adev/ directory
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 생성 성공 여부 / Success status
   */
  createAdevDirectory(projectPath: string): Promise<Result<void, ConfigError>>;

  /**
   * 초기 설정 파일을 생성한다 / Create initial config files
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @param authMethod - 인증 방식 / Auth method
   * @returns 생성 성공 여부 / Success status
   */
  createConfigFiles(
    projectPath: string,
    authMethod: AuthMethod,
  ): Promise<Result<void, ConfigError>>;

  /**
   * 프로젝트를 레지스트리에 등록한다 / Register project to registry
   *
   * @param projectInfo - 프로젝트 정보 / Project information
   * @returns 등록 성공 여부 / Success status
   */
  registerProject(projectInfo: ProjectInfo): Promise<Result<void, ConfigError>>;

  /**
   * 환경변수를 확인한다 / Check environment variables
   *
   * @param authMethod - 인증 방식 / Auth method
   * @returns 환경변수 존재 여부 / Whether env var exists
   */
  checkEnvVar(authMethod: AuthMethod): Promise<Result<boolean, ConfigError>>;
}

/**
 * Init 명령어 구현 / Init command implementation
 */
export class InitCommand implements IInitCommand {
  readonly name = 'init';
  readonly description = 'Initialize project / 프로젝트 초기화';
  readonly aliases = ['i'] as const;
  private readonly logger: Logger;
  private readonly registryDir: string | undefined;

  constructor(logger: Logger, registryDir?: string) {
    this.logger = logger.child({ module: 'cli-init' });
    this.registryDir = registryDir;
  }

  /**
   * init 명령어를 실행한다 / Execute init command
   *
   * @param args - 명령어 인자 / Command arguments
   * @param options - CLI 옵션 / CLI options
   * @returns 실행 결과 / Execution result
   */
  async execute(args: string[], options: CliOptions): Promise<Result<void, ConfigError>> {
    try {
      this.logger.info('프로젝트 초기화 시작', { projectPath: options.projectPath });

      // 1. 프로젝트 경로 설정
      // WHY: 기본값을 process.cwd()로 설정 — adev init을 원하는 폴더에서 바로 실행 가능
      //      --project-path 옵션으로 명시적 지정도 가능 (yargs에 등록 필요)
      const projectPath = path.resolve(options.projectPath ?? process.cwd());

      // WHY: 프로젝트 경로가 존재하지 않으면 자동 생성
      try {
        await fs.mkdir(projectPath, { recursive: true });
      } catch (mkdirCause) {
        const mkdirError = new ConfigError(
          'cli_init_mkdir_failed',
          `프로젝트 디렉토리 생성 실패: ${projectPath}`,
          mkdirCause,
        );
        this.logger.error('프로젝트 디렉토리 생성 실패', { projectPath });
        return err(mkdirError);
      }

      const adevPath = path.join(projectPath, '.adev');

      // 2. 이미 초기화되어 있는지 확인
      const exists = await checkAdevExists(adevPath);
      if (exists) {
        const error = new ConfigError(
          'cli_init_already_exists',
          '이미 초기화된 프로젝트입니다. .adev/ 디렉토리가 존재합니다.',
        );
        return err(error);
      }

      // 3. 인증 방식 선택 (기본값: api-key)
      const authMethodResult = await this.selectAuthMethod(
        !((options.yes as boolean | undefined) ?? false),
      );
      if (!authMethodResult.ok) {
        return err(authMethodResult.error);
      }

      const authMethod = authMethodResult.value;

      // 4. 환경변수 확인 — 없으면 바로 입력받아 저장
      const envCheckResult = await this.checkEnvVar(authMethod);
      if (envCheckResult.ok && !envCheckResult.value) {
        const tokenResult = await promptAndSaveToken(
          authMethod,
          this.logger,
          !((options.yes as boolean | undefined) ?? false),
        );
        if (!tokenResult.ok) {
          this.logger.warn('토큰 저장 실패 — 나중에 adev auth 명령어로 설정하세요');
        }
      }

      // 5. .adev/ 디렉토리 생성
      const dirResult = await this.createAdevDirectory(projectPath);
      if (!dirResult.ok) {
        return err(dirResult.error);
      }

      // 6. 설정 파일 생성
      const configResult = await this.createConfigFiles(projectPath, authMethod);
      if (!configResult.ok) {
        return err(configResult.error);
      }

      // 7. 프로젝트 정보 생성
      const projectInfo = createProjectInfo(projectPath);

      // 8. 프로젝트 등록
      const registerResult = await this.registerProject(projectInfo);
      if (!registerResult.ok) {
        return err(registerResult.error);
      }

      this.logger.info('프로젝트 초기화 완료', {
        projectId: projectInfo.id,
        projectName: projectInfo.name,
        authMethod,
      });

      // 성공 배너 + 다음 단계 안내
      process.stdout.write('\n');
      process.stdout.write('✅ adev 프로젝트 초기화 완료!\n');
      process.stdout.write(`   경로: ${projectPath}\n\n`);
      process.stdout.write('다음 단계:\n');
      process.stdout.write('  1. 개발 시작:  adev start\n');
      process.stdout.write('  2. 프로젝트 목록:  adev project list\n');
      process.stdout.write('  3. 인증 재설정:  adev auth\n');
      process.stdout.write('\n');

      return ok(undefined);
    } catch (cause) {
      const error = new ConfigError('cli_init_failed', 'init 명령어 실행 실패', cause);
      this.logger.error('init 명령어 실행 실패', { error });
      return err(error);
    }
  }

  /**
   * 인증 방식을 선택한다 / Select authentication method
   *
   * @param interactive - 대화형 모드 여부 / Interactive mode
   * @returns 선택된 인증 방식 / Selected auth method
   */
  async selectAuthMethod(interactive: boolean): Promise<Result<AuthMethod, ConfigError>> {
    return selectAuthMethod(interactive, this.logger);
  }

  /**
   * .adev/ 디렉토리를 생성한다 / Create .adev/ directory
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 생성 성공 여부 / Success status
   */
  async createAdevDirectory(projectPath: string): Promise<Result<void, ConfigError>> {
    return createAdevDirectory(projectPath, this.logger);
  }

  /**
   * 초기 설정 파일을 생성한다 / Create initial config files
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @param authMethod - 인증 방식 / Auth method
   * @returns 생성 성공 여부 / Success status
   */
  async createConfigFiles(
    projectPath: string,
    authMethod: AuthMethod,
  ): Promise<Result<void, ConfigError>> {
    return createConfigFiles(projectPath, authMethod, this.logger);
  }

  /**
   * 프로젝트를 레지스트리에 등록한다 / Register project to registry
   *
   * @param projectInfo - 프로젝트 정보 / Project information
   * @returns 등록 성공 여부 / Success status
   */
  async registerProject(projectInfo: ProjectInfo): Promise<Result<void, ConfigError>> {
    return registerProject(projectInfo, this.logger, this.registryDir);
  }

  /**
   * 환경변수를 확인한다 / Check environment variables
   *
   * @param authMethod - 인증 방식 / Auth method
   * @returns 환경변수 존재 여부 / Whether env var exists
   */
  async checkEnvVar(authMethod: AuthMethod): Promise<Result<boolean, ConfigError>> {
    return checkEnvVar(authMethod, this.logger);
  }

  /**
   * 도움말을 표시한다 / Show help
   *
   * @returns 도움말 텍스트 / Help text
   */
  help(): string {
    return `adev init - 프로젝트 초기화

사용법:
  adev init [옵션]

옵션:
  --path <path>        프로젝트 경로 (기본: 현재 디렉토리)
  --auth <method>      인증 방식 (api-key | subscription)
  --yes                대화형 모드 스킵 (기본값 사용)
  --help               도움말 표시

예제:
  adev init
  adev init --auth api-key
  adev init --path /path/to/project
`;
  }
}
