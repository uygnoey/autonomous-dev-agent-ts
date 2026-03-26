/**
 * Layer2 실행 Facade / Layer2 Runner Facade
 *
 * @description
 * KR: CLI 모듈에서 Layer2 컴포넌트를 간접 호출하기 위한 Facade.
 *     cli → layer2 직접 의존성을 이 파일로 집중시켜 의존성 방향을 명확히 한다.
 * EN: Facade for CLI module to indirectly call Layer2 components.
 *     Concentrates cli → layer2 direct dependencies into this file.
 */

import type { Logger } from 'core/logger.js';
import type { VerificationConfig } from 'core/config-schema.js';
import type { AuthProvider } from 'auth/types.js';
import { CleanEnvManager } from 'layer2/clean-env-manager.js';
import { IntegrationTester } from 'layer2/integration-tester.js';
import { Layer2Bootstrap } from 'layer2/layer2-bootstrap.js';
import { UserCheckpoint } from 'layer2/user-checkpoint.js';
import type { UserInputProvider } from 'layer2/user-checkpoint.js';
import { ProcessExecutor } from 'core/process-executor.js';
import type { RagSearcher } from 'rag/search.js';

/**
 * Layer2Bootstrap 생성에 필요한 설정 / Config needed for Layer2Bootstrap creation
 */
export interface Layer2RunnerConfig {
  readonly authProvider: AuthProvider;
  readonly logger: Logger;
  readonly projectCwd: string;
  readonly userCheckpoint: UserCheckpoint;
  readonly userInputProvider: UserInputProvider;
  readonly verificationConfig?: VerificationConfig;
  /** M-A3 — RAG 검색기 (에이전트 컨텍스트 주입용) / RAG searcher for agent context injection */
  readonly ragSearcher?: RagSearcher;
}

/**
 * Layer2Bootstrap 인스턴스를 생성한다 / Creates a Layer2Bootstrap instance
 *
 * @param config - 설정 / Config
 * @returns Layer2Bootstrap 인스턴스 / Layer2Bootstrap instance
 */
export function createLayer2Bootstrap(config: Layer2RunnerConfig): Layer2Bootstrap {
  return new Layer2Bootstrap({
    authProvider: config.authProvider,
    logger: config.logger,
    projectCwd: config.projectCwd,
    userCheckpoint: config.userCheckpoint,
    userInputProvider: config.userInputProvider,
    verificationConfig: config.verificationConfig,
    // WHY: M-A3 — RAG 컨텍스트 주입 활성화 (에이전트들이 과거 이력 참조)
    ragSearcher: config.ragSearcher,
  });
}

/**
 * IntegrationTester 인스턴스를 생성한다 / Creates an IntegrationTester instance
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns IntegrationTester 인스턴스 / IntegrationTester instance
 */
export function createIntegrationTester(logger: Logger): IntegrationTester {
  const processExecutor = new ProcessExecutor(logger);
  const cleanEnvManager = new CleanEnvManager(logger);
  return new IntegrationTester(logger, processExecutor, cleanEnvManager);
}

/**
 * UserCheckpoint 인스턴스를 생성한다 / Creates a UserCheckpoint instance
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns UserCheckpoint 인스턴스 / UserCheckpoint instance
 */
export function createUserCheckpoint(logger: Logger): UserCheckpoint {
  return new UserCheckpoint(logger);
}

// WHY: CLI 모듈에서 필요한 타입만 re-export
export type { UserInputProvider } from 'layer2/user-checkpoint.js';
export type { Layer2Bootstrap } from 'layer2/layer2-bootstrap.js';
export type { IntegrationTester } from 'layer2/integration-tester.js';
export type { UserCheckpoint } from 'layer2/user-checkpoint.js';
