/**
 * Layer1 세션 초기화 / Layer1 session initialization
 *
 * @description
 * KR: Layer1 세션 상태를 초기화한다 (프로젝트 로드, 인증, API 클라이언트 생성).
 * EN: Initializes Layer1 session state (project loading, auth, API client creation).
 */

import { resolve } from 'node:path';
import { createAuthProvider } from '../../auth/index.js';
import { loadConfig } from '../../core/config.js';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { MemoryRepository } from '../../core/memory.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import { ClaudeApi } from '../../layer1/claude-api.js';
import { ContractBuilder } from '../../layer1/contract-builder.js';
import { ConversationManager } from '../../layer1/conversation.js';
import { Designer } from '../../layer1/designer.js';
import { Planner } from '../../layer1/planner.js';
import { SpecBuilder } from '../../layer1/spec-builder.js';
import { TestTypeDesigner } from '../../layer1/test-type-designer.js';
import type { GlobalCliOptions, ProjectInfo } from '../types.js';
import { loadRegistry } from './project-registry.js';
import type { Layer1SessionState, StartOptions } from './start-types.js';

/**
 * 실행할 프로젝트 경로를 우선순위에 따라 결정한다 / Resolve project path by priority
 *
 * @description
 * KR: 1순위 명시적 옵션, 2순위 cwd 일치, 3순위 글로벌 activeProject fallback
 * EN: 1st explicit option, 2nd cwd match, 3rd global activeProject fallback
 *
 * @param options - CLI 옵션 / CLI options
 * @param registryDir - 레지스트리 디렉토리 (테스트용) / Registry dir (for testing)
 */
async function resolveProjectPath(
  options: GlobalCliOptions,
  registryDir?: string,
): Promise<string> {
  // 1순위: 명시적 --project-path 옵션
  const explicitPath = (options as StartOptions).projectPath;
  if (explicitPath) return resolve(explicitPath);

  const cwd = resolve(process.cwd());

  // 레지스트리 로드 (2, 3순위 판별용)
  const registryResult = await loadRegistry(registryDir);
  if (!registryResult.ok) return cwd;

  const { projects, activeProject } = registryResult.value;

  // 2순위: cwd가 등록된 프로젝트 경로와 일치
  const cwdMatch = projects.find((p) => resolve(p.path) === cwd);
  if (cwdMatch) return cwdMatch.path;

  // 3순위: 글로벌 activeProject (다른 디렉토리에서 adev 실행 시 fallback)
  if (activeProject) {
    const activeProj = projects.find((p) => p.name === activeProject);
    if (activeProj) return activeProj.path;
  }

  // 기본값: 현재 디렉토리
  return cwd;
}

/**
 * 활성 프로젝트 로드 / Load active project
 *
 * @description
 * KR: 프로젝트 경로 우선순위: 1) --project-path 옵션, 2) cwd 일치, 3) 글로벌 active fallback
 * EN: Path resolution priority: 1) --project-path option, 2) cwd match, 3) global active fallback
 *
 * @param options - CLI 옵션 / CLI options
 * @param registryDir - 레지스트리 디렉토리 (테스트용 DI) / Registry dir (DI for testing)
 * @returns 프로젝트 정보 / Project info
 */
export async function loadActiveProject(
  options: GlobalCliOptions,
  registryDir?: string,
): Promise<Result<ProjectInfo, AdevError>> {
  const projectPath = await resolveProjectPath(options, registryDir);

  // .adev/ 디렉토리 존재 확인
  const configFile = Bun.file(resolve(projectPath, '.adev', 'config.json'));
  if (!(await configFile.exists())) {
    return err(
      new AdevError(
        'cli_start_not_initialized',
        `프로젝트가 초기화되지 않았습니다 (경로: ${projectPath}). 먼저 \`adev init\`을 실행하세요. / Project not initialized (path: ${projectPath}). Run \`adev init\` first.`,
      ),
    );
  }

  // 설정 로드
  const configResult = await loadConfig(projectPath);
  if (!configResult.ok) {
    return err(
      new AdevError(
        'cli_start_config_failed',
        `설정 로드 실패 / Config load failed: ${configResult.error.message}`,
        configResult.error,
      ),
    );
  }

  // WHY: projectId는 options에서 가져오거나 config에서 읽어야 하나,
  //      여기서는 간단히 디렉토리 이름을 사용
  const projectId = (options as StartOptions).projectId ?? 'default-project';
  const projectName = projectPath.split('/').pop() ?? 'unnamed-project';

  const projectInfo: ProjectInfo = {
    id: projectId,
    name: projectName,
    path: projectPath,
    status: 'active',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
  };

  return ok(projectInfo);
}

/**
 * Layer1 세션 초기화 / Initialize Layer1 session
 *
 * @param projectInfo - 프로젝트 정보 / Project info
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns Layer1 세션 상태 / Layer1 session state
 */
export async function initializeLayer1Session(
  projectInfo: ProjectInfo,
  logger: Logger,
): Promise<Result<Layer1SessionState, AdevError>> {
  try {
    // 인증 공급자 생성
    const authResult = createAuthProvider(logger);
    if (!authResult.ok) {
      return err(
        new AdevError(
          'cli_start_auth_failed',
          `인증 공급자 생성 실패 / Auth provider creation failed: ${authResult.error.message}`,
          authResult.error,
        ),
      );
    }

    // Claude API 클라이언트 생성
    const claudeApi = new ClaudeApi(authResult.value, logger);

    // 메모리 저장소 생성
    const memoryDbPath = resolve(projectInfo.path, '.adev', 'data', 'memory');
    const memoryRepo = new MemoryRepository(memoryDbPath, logger);
    await memoryRepo.initialize();

    // 대화 관리자 + Layer1 파이프라인 컴포넌트 생성
    const conversationManager = new ConversationManager(memoryRepo, logger);
    const contractBuilder = new ContractBuilder(logger);
    const planner = new Planner(logger);
    const designer = new Designer(logger);
    const specBuilder = new SpecBuilder(logger);
    const testTypeDesigner = new TestTypeDesigner(logger);

    // 기존 대화 이력 로드
    const historyResult = await conversationManager.getHistory(projectInfo.id, 10);
    const messages = historyResult.ok ? historyResult.value : [];

    const session: Layer1SessionState = {
      projectInfo,
      authProvider: authResult.value,
      claudeApi,
      conversationManager,
      contractBuilder,
      planner,
      designer,
      specBuilder,
      testTypeDesigner,
      messages,
    };

    return ok(session);
  } catch (error: unknown) {
    return err(
      new AdevError(
        'cli_start_session_init_failed',
        `세션 초기화 실패 / Session initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
    );
  }
}
