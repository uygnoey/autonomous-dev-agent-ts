/**
 * Init 스캐폴딩 — .adev/ 디렉토리 구조 생성 / Init scaffolding — .adev/ directory structure creation
 *
 * @description
 * KR: .adev/ + .claude/ 디렉토리 생성, config.json, agent.md 파일, .gitignore 항목 추가.
 * EN: Creates .adev/ + .claude/ directories, config.json, agent.md files, .gitignore entries.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import type { AuthMethod, ProjectInfo, ProjectRegistry } from 'cli/types.js';
import { ConfigError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';

/**
 * .adev/ 디렉토리를 생성한다 / Create .adev/ directory
 *
 * @param projectPath - 프로젝트 경로 / Project path
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 생성 성공 여부 / Success status
 */
export async function createAdevDirectory(
  projectPath: string,
  logger: Logger,
): Promise<Result<void, ConfigError>> {
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
      logger.debug('디렉토리 생성됨', { dir });
    }

    logger.info('.adev/ + .claude/ 디렉토리 구조 생성 완료', {
      adevPath,
      claudePath,
      dirCount: directories.length,
    });

    return ok(undefined);
  } catch (cause) {
    const error = new ConfigError('cli_init_mkdir_failed', '디렉토리 생성 실패', cause);
    logger.error('디렉토리 생성 실패', { error });
    return err(error);
  }
}

/**
 * 초기 설정 파일을 생성한다 / Create initial config files
 *
 * @param projectPath - 프로젝트 경로 / Project path
 * @param authMethod - 인증 방식 / Auth method
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 생성 성공 여부 / Success status
 */
export async function createConfigFiles(
  projectPath: string,
  authMethod: AuthMethod,
  logger: Logger,
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
    logger.debug('config.json 생성됨', { configPath });

    // 2. 7개 agent.md 파일 생성 (기본 템플릿)
    const agentNames = ['architect', 'qa', 'coder', 'tester', 'qc', 'reviewer', 'documenter'];
    const agentsPath = path.join(adevPath, 'agents');

    for (const agentName of agentNames) {
      const agentFilePath = path.join(agentsPath, `${agentName}.md`);
      const agentTemplate = getDefaultAgentTemplate(agentName);
      await fs.writeFile(agentFilePath, agentTemplate, 'utf-8');
      logger.debug('agent.md 생성됨', { agentName, agentFilePath });
    }

    // 3. .gitignore에 .adev/data/ + .claude/memory/ 추가
    await addToGitignore(projectPath, '.adev/data/', logger);
    await addToGitignore(projectPath, '.claude/memory/', logger);

    logger.info('설정 파일 생성 완료', {
      configPath,
      agentCount: agentNames.length,
    });

    return ok(undefined);
  } catch (cause) {
    const error = new ConfigError('cli_init_config_create_failed', '설정 파일 생성 실패', cause);
    logger.error('설정 파일 생성 실패', { error });
    return err(error);
  }
}

/**
 * 프로젝트를 레지스트리에 등록한다 / Register project to registry
 *
 * @param projectInfo - 프로젝트 정보 / Project information
 * @param logger - 로거 인스턴스 / Logger instance
 * @param registryDir - 레지스트리 디렉토리 경로 (테스트용) / Registry directory path (for testing)
 * @returns 등록 성공 여부 / Success status
 */
export async function registerProject(
  projectInfo: ProjectInfo,
  logger: Logger,
  registryDir?: string,
): Promise<Result<void, ConfigError>> {
  try {
    const globalAdevDir = registryDir ?? path.join(homedir(), '.adev');
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

    // 동일 경로의 프로젝트가 이미 존재하면 activeProject만 업데이트하고 정상 종료
    // WHY: init을 두 번 실행해도 에러 없이 현재 프로젝트를 활성화 상태로 전환
    const existingProject = registry.projects.find((p) => p.path === projectInfo.path);
    if (existingProject) {
      const updatedRegistry: ProjectRegistry = {
        ...registry,
        activeProject: existingProject.name,
      };
      await fs.writeFile(projectsFilePath, JSON.stringify(updatedRegistry, null, 2), 'utf-8');
      logger.info('프로젝트 활성화', { projectId: existingProject.id, projectsFilePath });
      return ok(undefined);
    }

    // 새 프로젝트 추가
    const newRegistry: ProjectRegistry = {
      activeProject: projectInfo.name,
      projects: [...registry.projects, projectInfo],
    };

    // 파일 저장
    await fs.writeFile(projectsFilePath, JSON.stringify(newRegistry, null, 2), 'utf-8');

    logger.info('프로젝트 등록 완료', {
      projectId: projectInfo.id,
      projectsFilePath,
    });

    return ok(undefined);
  } catch (cause) {
    const error = new ConfigError('cli_init_register_failed', '프로젝트 등록 실패', cause);
    logger.error('프로젝트 등록 실패', { error });
    return err(error);
  }
}

/**
 * 프로젝트 정보를 생성한다 / Create project info
 *
 * @param projectPath - 프로젝트 경로 / Project path
 * @returns 프로젝트 정보 / Project information
 */
export function createProjectInfo(projectPath: string): ProjectInfo {
  return {
    id: randomUUID(),
    name: path.basename(projectPath),
    path: projectPath,
    createdAt: new Date(),
    status: 'active',
  };
}

/**
 * .adev/ 디렉토리 존재 여부 확인 / Check if .adev/ exists
 */
export async function checkAdevExists(adevPath: string): Promise<boolean> {
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
function getDefaultAgentTemplate(agentName: string): string {
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
async function addToGitignore(projectPath: string, entry: string, logger: Logger): Promise<void> {
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
      logger.debug('.gitignore에 이미 존재함', { entry });
      return;
    }

    // 추가
    const newContent = content ? `${content}\n${entry}\n` : `${entry}\n`;
    await fs.writeFile(gitignorePath, newContent, 'utf-8');

    logger.debug('.gitignore에 추가됨', { entry });
  } catch (cause) {
    // 에러 무시 (gitignore는 선택 사항)
    logger.warn('.gitignore 추가 실패', { entry, cause });
  }
}
