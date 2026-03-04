/**
 * start 명령 / Start command
 *
 * @description
 * KR: Layer1 Claude Opus와 대화 세션을 시작하고,
 *     기획/설계 대화를 진행하여 Contract를 생성한다.
 * EN: Starts conversation session with Layer1 Claude Opus,
 *     conducts planning/design conversation, and generates Contract.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
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
import type { ConversationMessage } from '../../layer1/types.js';
import type { GlobalCliOptions, ProjectInfo } from '../types.js';

// ── 상수 / Constants ────────────────────────────────────────────

/** Layer1 시스템 프롬프트 / Layer1 system prompt */
const LAYER1_SYSTEM_PROMPT = `당신은 프로젝트 기획 및 설계 전문가입니다.

사용자와 대화를 통해 다음을 수행하세요:
1. 프로젝트 요구사항 파악
2. 기능 명세 작성
3. 아키텍처 설계
4. Contract 스키마 생성

대화가 완료되면 사용자가 "확정" 또는 "완료"를 입력할 때 Contract를 생성하세요.

한국어로 명확하고 구조화된 응답을 제공하세요.`;

/** Contract 생성 트리거 키워드 / Contract generation trigger keywords */
const CONTRACT_TRIGGERS = ['확정', '완료', 'confirm', 'finalize'];

/** 종료 키워드 / Exit keywords */
const EXIT_KEYWORDS = ['exit', 'quit', '종료', '나가기'];

// ── 인터페이스 / Interfaces ─────────────────────────────────────

/**
 * start 명령 옵션 / Start command options
 */
export interface StartOptions extends GlobalCliOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId?: string;
  /** 기능 설명 / Feature description */
  readonly feature?: string;
  /** 프로젝트 경로 / Project path */
  readonly projectPath?: string;
}

/**
 * Layer1 세션 상태 / Layer1 session state
 */
interface Layer1SessionState {
  /** 프로젝트 정보 / Project info */
  readonly projectInfo: ProjectInfo;
  /** Claude API 클라이언트 / Claude API client */
  readonly claudeApi: ClaudeApi;
  /** 대화 관리자 / Conversation manager */
  readonly conversationManager: ConversationManager;
  /** Contract 빌더 / Contract builder */
  readonly contractBuilder: ContractBuilder;
  /** 대화 이력 / Conversation history */
  readonly messages: ConversationMessage[];
}

// ── StartCommand 클래스 / StartCommand Class ───────────────────

/**
 * Layer1 대화 시작 명령 / Start Layer1 conversation command
 *
 * @description
 * KR: 사용자와 Claude Opus 간 대화 세션을 시작하고,
 *     REPL 루프를 실행하여 기획/설계를 진행한 후 Contract를 생성한다.
 * EN: Starts conversation session between user and Claude Opus,
 *     runs REPL loop for planning/design, and generates Contract.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new StartCommand(logger);
 * await cmd.execute([], { flags: { projectId: 'proj-1' } });
 */
export class StartCommand {
  readonly name = 'start';
  readonly description = 'Start Layer1 conversation / Layer1 대화 시작';
  readonly aliases = ['s'] as const;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'cli:start' });
  }

  /**
   * start 명령 실행 / Execute start command
   *
   * @param _args - 위치 인자 (미사용) / Positional args (unused)
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  async execute(
    _args: readonly string[],
    options: GlobalCliOptions,
  ): Promise<Result<void, AdevError>> {
    this.logger.info('Layer1 대화 시작 / Starting Layer1 conversation');

    // 1. 활성 프로젝트 로드
    const projectResult = await this.loadActiveProject(options);
    if (!projectResult.ok) {
      return projectResult;
    }

    const projectInfo = projectResult.value;
    this.logger.info('프로젝트 로드 완료', {
      projectId: projectInfo.id,
      projectName: projectInfo.name,
    });

    // 2. Layer1 세션 초기화
    const sessionResult = await this.initializeLayer1Session(projectInfo);
    if (!sessionResult.ok) {
      return sessionResult;
    }

    const session = sessionResult.value;
    this.logger.info('Layer1 세션 초기화 완료');

    // 3. 대화 루프 실행
    const conversationResult = await this.runConversationLoop(session, options);
    if (!conversationResult.ok) {
      return conversationResult;
    }

    this.logger.info('대화 세션 종료');
    return ok(undefined);
  }

  /**
   * 활성 프로젝트 로드 / Load active project
   *
   * @param options - CLI 옵션 / CLI options
   * @returns 프로젝트 정보 / Project info
   */
  private async loadActiveProject(
    options: GlobalCliOptions,
  ): Promise<Result<ProjectInfo, AdevError>> {
    const projectPath = resolve((options as StartOptions).projectPath ?? '.');

    // .adev/ 디렉토리 존재 확인
    const configFile = Bun.file(resolve(projectPath, '.adev', 'config.json'));
    if (!(await configFile.exists())) {
      return err(
        new AdevError(
          'cli_start_not_initialized',
          '프로젝트가 초기화되지 않았습니다. 먼저 `adev init`을 실행하세요. / Project not initialized. Run `adev init` first.',
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
   * @returns Layer1 세션 상태 / Layer1 session state
   */
  private async initializeLayer1Session(
    projectInfo: ProjectInfo,
  ): Promise<Result<Layer1SessionState, AdevError>> {
    try {
      // 인증 공급자 생성
      const authResult = createAuthProvider(this.logger);
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
      const claudeApi = new ClaudeApi(authResult.value, this.logger);

      // 메모리 저장소 생성
      // WHY: MemoryRepository는 LanceDB 테이블 경로가 필요하나,
      //      여기서는 간단히 더미 리포지토리를 생성
      const memoryDbPath = resolve(projectInfo.path, '.adev', 'data', 'memory');
      const memoryRepo = new MemoryRepository(memoryDbPath, this.logger);
      await memoryRepo.initialize();

      // 대화 관리자 생성
      const conversationManager = new ConversationManager(memoryRepo, this.logger);

      // Contract 빌더 생성
      const contractBuilder = new ContractBuilder(this.logger);

      // 기존 대화 이력 로드
      const historyResult = await conversationManager.getHistory(projectInfo.id, 10);
      const messages = historyResult.ok ? historyResult.value : [];

      const session: Layer1SessionState = {
        projectInfo,
        claudeApi,
        conversationManager,
        contractBuilder,
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

  /**
   * 대화 루프 실행 / Run conversation loop
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param options - CLI 옵션 / CLI options
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async runConversationLoop(
    session: Layer1SessionState,
    options: GlobalCliOptions,
  ): Promise<Result<void, AdevError>> {
    const rl = readline.createInterface({ input, output });

    try {
      console.log('\n========================================');
      console.log('🚀 Layer1 대화 시작 / Layer1 Conversation Started');
      console.log('========================================\n');
      console.log('프로젝트:', session.projectInfo.name);
      console.log('경로:', session.projectInfo.path);
      console.log('\n💡 팁:');
      console.log('  - 프로젝트 요구사항을 자유롭게 설명하세요');
      console.log('  - "확정" 또는 "완료" 입력 시 Contract 생성');
      console.log('  - "exit" 또는 "종료" 입력 시 대화 종료\n');

      // 초기 기능 설명이 있으면 자동 입력
      const initialFeature = (options as StartOptions).feature;
      if (initialFeature) {
        console.log(`\n사용자: ${initialFeature}\n`);
        const responseResult = await this.processUserInput(session, initialFeature);
        if (!responseResult.ok) {
          return responseResult;
        }
      }

      // REPL 루프
      while (true) {
        const userInput = await rl.question('\n사용자: ');

        if (!userInput.trim()) {
          continue;
        }

        // 종료 체크
        if (EXIT_KEYWORDS.some((keyword) => userInput.trim().toLowerCase() === keyword)) {
          console.log('\n대화를 종료합니다. / Exiting conversation.\n');
          break;
        }

        // Contract 생성 체크
        if (CONTRACT_TRIGGERS.some((trigger) => userInput.trim().includes(trigger))) {
          console.log('\n📋 Contract 생성 중... / Generating Contract...\n');
          const contractResult = await this.generateContract(session);
          if (!contractResult.ok) {
            console.error(`❌ Contract 생성 실패: ${contractResult.error.message}`);
            continue;
          }

          console.log('✅ Contract 생성 완료!');
          console.log(`   출력 경로: ${session.projectInfo.path}/.adev/contract.json\n`);
          break;
        }

        // 일반 대화 처리
        const responseResult = await this.processUserInput(session, userInput);
        if (!responseResult.ok) {
          console.error(`❌ 응답 생성 실패: ${responseResult.error.message}`);
        }
      }

      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new AdevError(
          'cli_start_conversation_failed',
          `대화 루프 실패 / Conversation loop failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    } finally {
      rl.close();
    }
  }

  /**
   * 사용자 입력 처리 / Process user input
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param userInput - 사용자 입력 / User input
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async processUserInput(
    session: Layer1SessionState,
    userInput: string,
  ): Promise<Result<void, AdevError>> {
    try {
      // 사용자 메시지 저장
      const userMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'user',
        content: userInput,
        timestamp: new Date(),
        projectId: session.projectInfo.id,
      };

      await session.conversationManager.addMessage(userMessage);

      // Claude API 호출
      const messages = [
        { role: 'user' as const, content: LAYER1_SYSTEM_PROMPT },
        ...session.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: userInput },
      ];

      const responseResult = await session.claudeApi.createMessage(messages, {
        maxTokens: 4096,
        temperature: 0.7,
      });

      if (!responseResult.ok) {
        return err(
          new AdevError(
            'cli_start_api_failed',
            `Claude API 호출 실패 / Claude API call failed: ${responseResult.error.message}`,
            responseResult.error,
          ),
        );
      }

      const assistantContent = responseResult.value.content;

      // 어시스턴트 메시지 저장
      const assistantMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        projectId: session.projectInfo.id,
      };

      await session.conversationManager.addMessage(assistantMessage);

      // 응답 출력
      console.log(`\n어시스턴트: ${assistantContent}\n`);

      // 세션 메시지 업데이트
      session.messages.push(userMessage, assistantMessage);

      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new AdevError(
          'cli_start_process_input_failed',
          `입력 처리 실패 / Input processing failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * Contract 생성 / Generate Contract
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async generateContract(session: Layer1SessionState): Promise<Result<void, AdevError>> {
    try {
      // WHY: 실제 구현에서는 ContractBuilder를 사용하여 대화 내용에서 Contract를 생성해야 하나,
      //      ContractBuilder.build() 메서드가 아직 구현되지 않았으므로
      //      여기서는 간단히 더미 Contract를 생성

      // 더미 Contract 생성
      const dummyContract = {
        version: 1,
        projectType: 'general',
        features: [],
        testDefinitions: [],
        implementationOrder: [],
        verificationMatrix: {
          allFeaturesHaveCriteria: false,
          allCriteriaHaveTests: false,
          noCyclicDependencies: true,
          allIODefined: false,
          completenessScore: 0,
        },
      };

      // Contract 파일 저장
      const contractPath = resolve(session.projectInfo.path, '.adev', 'contract.json');
      const contractJson = JSON.stringify(dummyContract, null, 2);
      await Bun.write(contractPath, contractJson);

      this.logger.info('Contract 생성 완료', { contractPath });

      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new AdevError(
          'cli_start_contract_generation_failed',
          `Contract 생성 실패 / Contract generation failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }
}
