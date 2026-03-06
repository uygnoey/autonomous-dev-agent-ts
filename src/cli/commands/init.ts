/**
 * Init 명령어 구현 / Init command implementation
 *
 * @description
 * KR: 프로젝트 초기화 (인증 선택, .adev/ 생성, 설정 파일 생성, 프로젝트 등록)
 * EN: Project initialization (auth selection, .adev/ creation, config files, project registration)
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import inquirer from 'inquirer';
import { loadEnvironment } from '../../core/config.js';
import { ConfigError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import type { Result } from '../../core/types.js';
import { err, ok } from '../../core/types.js';
import type { AuthMethod, CliOptions, ProjectInfo, ProjectRegistry } from '../types.js';

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
      // WHY: 기본 경로를 ~/adevProjects로 설정하여 홈 디렉토리에 프로젝트를 모아 관리
      const defaultProjectPath = path.join(homedir(), 'adevProjects');
      const projectPath = path.resolve(options.projectPath ?? defaultProjectPath);

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
      const exists = await this.checkAdevExists(adevPath);
      if (exists) {
        const error = new ConfigError(
          'cli_init_already_exists',
          '이미 초기화된 프로젝트입니다. .adev/ 디렉토리가 존재합니다.',
        );
        return err(error);
      }

      // 3. 인증 방식 선택 (기본값: api-key)
      const authMethodResult = await this.selectAuthMethod(false);
      if (!authMethodResult.ok) {
        return err(authMethodResult.error);
      }

      const authMethod = authMethodResult.value;

      // 4. 환경변수 확인
      const envCheckResult = await this.checkEnvVar(authMethod);
      if (envCheckResult.ok && !envCheckResult.value) {
        const envVar = authMethod === 'api-key' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
        this.logger.warn(`환경변수 ${envVar}가 설정되지 않았습니다. 실행 전에 설정하세요.`);
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
      const projectName = path.basename(projectPath);
      const projectInfo: ProjectInfo = {
        id: randomUUID(),
        name: projectName,
        path: projectPath,
        createdAt: new Date(),
        status: 'active',
      };

      // 8. 프로젝트 등록
      const registerResult = await this.registerProject(projectInfo);
      if (!registerResult.ok) {
        return err(registerResult.error);
      }

      this.logger.info('프로젝트 초기화 완료', {
        projectId: projectInfo.id,
        projectName,
        authMethod,
      });

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
    try {
      // 대화형 모드가 아니면 기본값 'api-key' 반환
      if (!interactive) {
        return ok('api-key');
      }

      // inquirer로 대화형 프롬프트 표시
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'authMethod',
          message: '인증 방식을 선택하세요:',
          choices: [
            { name: '1. API key (ANTHROPIC_API_KEY)', value: 'api-key' },
            { name: '2. Subscription (CLAUDE_CODE_OAUTH_TOKEN)', value: 'subscription' },
          ],
          default: 'api-key',
        },
      ]);

      const authMethod = answers.authMethod as AuthMethod;
      this.logger.debug('인증 방식 선택됨', { authMethod });

      return ok(authMethod);
    } catch (cause) {
      const error = new ConfigError('cli_init_auth_select_failed', '인증 방식 선택 실패', cause);
      this.logger.error('인증 방식 선택 실패', { error });
      return err(error);
    }
  }

  /**
   * .adev/ 디렉토리를 생성한다 / Create .adev/ directory
   *
   * @param projectPath - 프로젝트 경로 / Project path
   * @returns 생성 성공 여부 / Success status
   */
  async createAdevDirectory(projectPath: string): Promise<Result<void, ConfigError>> {
    try {
      const adevPath = path.join(projectPath, '.adev');
      const claudePath = path.join(projectPath, '.claude');

      // WHY: .adev (adev 내부 데이터) + .claude (Claude Code 호환) 둘 다 생성
      const directories = [
        // .adev/ (adev specific)
        adevPath,
        path.join(adevPath, 'data'),
        path.join(adevPath, 'data', 'memory'),
        path.join(adevPath, 'data', 'code-index'),
        path.join(adevPath, 'agents'),
        path.join(adevPath, 'sessions'),
        path.join(adevPath, 'mcp'),
        path.join(adevPath, 'skills'),
        path.join(adevPath, 'templates'),
        // .claude/ (Claude Code compatibility)
        claudePath,
        path.join(claudePath, 'agents'),
        path.join(claudePath, 'skills'),
        path.join(claudePath, 'mcp'),
        path.join(claudePath, 'memory'),
      ];

      for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
        this.logger.debug('디렉토리 생성됨', { dir });
      }

      this.logger.info('.adev/ + .claude/ 디렉토리 구조 생성 완료', {
        adevPath,
        claudePath,
        dirCount: directories.length,
      });

      return ok(undefined);
    } catch (cause) {
      const error = new ConfigError('cli_init_mkdir_failed', '디렉토리 생성 실패', cause);
      this.logger.error('디렉토리 생성 실패', { error });
      return err(error);
    }
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
    try {
      const adevPath = path.join(projectPath, '.adev');

      // 1. config.json 생성
      const config = {
        log: {
          level: 'info',
        },
        embedding: {
          default: 'xenova-minilm',
        },
        testing: {
          bail: true,
        },
        verification: {
          layer1Model: 'opus',
        },
      };

      const configPath = path.join(adevPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.logger.debug('config.json 생성됨', { configPath });

      // 2. 7개 agent.md 파일 생성 (기본 템플릿)
      const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
      const agentsPath = path.join(adevPath, 'agents');

      for (const agentName of agentNames) {
        const agentFilePath = path.join(agentsPath, `${agentName}.md`);
        const agentTemplate = this.getDefaultAgentTemplate(agentName);
        await fs.writeFile(agentFilePath, agentTemplate, 'utf-8');
        this.logger.debug('agent.md 생성됨', { agentName, agentFilePath });
      }

      // 3. .gitignore에 .adev/data/ + .claude/memory/ 추가
      await this.addToGitignore(projectPath, '.adev/data/');
      await this.addToGitignore(projectPath, '.claude/memory/');

      this.logger.info('설정 파일 생성 완료', {
        configPath,
        agentCount: agentNames.length,
      });

      return ok(undefined);
    } catch (cause) {
      const error = new ConfigError('cli_init_config_create_failed', '설정 파일 생성 실패', cause);
      this.logger.error('설정 파일 생성 실패', { error });
      return err(error);
    }
  }

  /**
   * 프로젝트를 레지스트리에 등록한다 / Register project to registry
   *
   * @param projectInfo - 프로젝트 정보 / Project information
   * @returns 등록 성공 여부 / Success status
   */
  async registerProject(projectInfo: ProjectInfo): Promise<Result<void, ConfigError>> {
    try {
      const globalAdevDir = this.registryDir ?? path.join(homedir(), '.adev');
      const projectsFilePath = path.join(globalAdevDir, 'projects.json');

      // ~/.adev/ 디렉토리 생성
      await fs.mkdir(globalAdevDir, { recursive: true });

      // projects.json 읽기 (없으면 빈 레지스트리 생성)
      let registry: ProjectRegistry;
      try {
        const content = await fs.readFile(projectsFilePath, 'utf-8');
        registry = JSON.parse(content) as ProjectRegistry;
      } catch {
        registry = {
          activeProject: null,
          projects: [],
        };
      }

      // 동일 경로의 프로젝트가 이미 존재하면 에러
      const existingProject = registry.projects.find((p) => p.path === projectInfo.path);
      if (existingProject) {
        const error = new ConfigError(
          'cli_init_duplicate_project',
          `이미 등록된 프로젝트입니다: ${projectInfo.path}`,
        );
        return err(error);
      }

      // 새 프로젝트 추가
      const newRegistry: ProjectRegistry = {
        activeProject: projectInfo.name,
        projects: [...registry.projects, projectInfo],
      };

      // 파일 저장
      await fs.writeFile(projectsFilePath, JSON.stringify(newRegistry, null, 2), 'utf-8');

      this.logger.info('프로젝트 등록 완료', {
        projectId: projectInfo.id,
        projectsFilePath,
      });

      return ok(undefined);
    } catch (cause) {
      const error = new ConfigError('cli_init_register_failed', '프로젝트 등록 실패', cause);
      this.logger.error('프로젝트 등록 실패', { error });
      return err(error);
    }
  }

  /**
   * 환경변수를 확인한다 / Check environment variables
   *
   * @param authMethod - 인증 방식 / Auth method
   * @returns 환경변수 존재 여부 / Whether env var exists
   */
  async checkEnvVar(authMethod: AuthMethod): Promise<Result<boolean, ConfigError>> {
    try {
      // WHY: process.env 직접 접근 금지 → core/config.ts의 loadEnvironment() 경유
      const envResult = loadEnvironment();
      if (!envResult.ok) {
        // WHY: 환경변수가 없으면 false 반환 (에러가 아닌 체크 목적)
        this.logger.debug('환경변수 미설정', { authMethod });
        return ok(false);
      }

      const envVar = authMethod === 'api-key' ? 'ANTHROPIC_API_KEY' : 'CLAUDE_CODE_OAUTH_TOKEN';
      const exists =
        authMethod === 'api-key'
          ? envResult.value.anthropicApiKey !== undefined
          : envResult.value.claudeCodeOauthToken !== undefined;

      this.logger.debug('환경변수 확인', { envVar, exists });

      return ok(exists);
    } catch (cause) {
      const error = new ConfigError('cli_init_env_check_failed', '환경변수 확인 실패', cause);
      return err(error);
    }
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

  /**
   * .adev/ 디렉토리 존재 여부 확인 / Check if .adev/ exists
   */
  private async checkAdevExists(adevPath: string): Promise<boolean> {
    try {
      await fs.access(adevPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 기본 agent.md 템플릿 반환 / Return default agent.md template
   */
  private getDefaultAgentTemplate(agentName: string): string {
    return `# ${agentName} Agent

## 역할 / Role

${agentName} 에이전트의 역할을 정의합니다.

## 책임 / Responsibilities

- 주요 책임 1
- 주요 책임 2

## 시스템 프롬프트 / System Prompt

이 에이전트의 시스템 프롬프트를 작성합니다.

## 도구 / Tools

사용 가능한 도구 목록:
- tool1
- tool2

---

Generated by adev init
`;
  }

  /**
   * .gitignore에 항목 추가 / Add entry to .gitignore
   */
  private async addToGitignore(projectPath: string, entry: string): Promise<void> {
    try {
      const gitignorePath = path.join(projectPath, '.gitignore');

      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore 파일이 없으면 생성
      }

      // 이미 존재하면 스킵
      if (content.includes(entry)) {
        this.logger.debug('.gitignore에 이미 존재함', { entry });
        return;
      }

      // 추가
      const newContent = content ? `${content}\n${entry}\n` : `${entry}\n`;
      await fs.writeFile(gitignorePath, newContent, 'utf-8');

      this.logger.debug('.gitignore에 추가됨', { entry });
    } catch (cause) {
      // 에러 무시 (gitignore는 선택 사항)
      this.logger.warn('.gitignore 추가 실패', { entry, cause });
    }
  }
}
