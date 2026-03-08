/**
 * start 명령 / Start command
 *
 * @description
 * KR: Layer1 Claude Opus와 대화 세션을 시작하고,
 *     기획/설계 대화를 진행하여 Contract를 생성한다.
 *     TUI ChatUi를 사용하여 Claude Code 스타일 인터페이스를 제공한다.
 * EN: Starts conversation session with Layer1 Claude Opus,
 *     conducts planning/design conversation, and generates Contract.
 *     Uses TUI ChatUi for a Claude Code-style interface.
 */

import { randomUUID } from 'node:crypto';
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
import type { ConversationMessage } from '../../layer1/types.js';
import { createChatUi } from '../tui/chat.js';
import type { ChatUi } from '../tui/chat.js';
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

/** adev 현재 버전 / Current adev version */
const ADEV_VERSION = '0.0.1';

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
  /** 기획자 / Planner */
  readonly planner: Planner;
  /** 설계자 / Designer */
  readonly designer: Designer;
  /** 스펙 빌더 / Spec builder */
  readonly specBuilder: SpecBuilder;
  /** 테스트 타입 설계자 / Test type designer */
  readonly testTypeDesigner: TestTypeDesigner;
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
 *     TUI ChatUi를 통해 Claude Code 스타일 인터페이스를 제공한다.
 * EN: Starts conversation session between user and Claude Opus,
 *     runs REPL loop for planning/design, and generates Contract.
 *     Provides Claude Code-style interface via TUI ChatUi.
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

    // 3. TUI 초기화 및 대화 루프 실행
    const chat = createChatUi({
      version: ADEV_VERSION,
      model: 'claude-opus-4-6',
      projectName: projectInfo.name,
      phase: 'DESIGN',
    });

    const conversationResult = await this.runConversationLoop(session, options, chat);
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
      const memoryDbPath = resolve(projectInfo.path, '.adev', 'data', 'memory');
      const memoryRepo = new MemoryRepository(memoryDbPath, this.logger);
      await memoryRepo.initialize();

      // 대화 관리자 + Layer1 파이프라인 컴포넌트 생성
      const conversationManager = new ConversationManager(memoryRepo, this.logger);
      const contractBuilder = new ContractBuilder(this.logger);
      const planner = new Planner(this.logger);
      const designer = new Designer(this.logger);
      const specBuilder = new SpecBuilder(this.logger);
      const testTypeDesigner = new TestTypeDesigner(this.logger);

      // 기존 대화 이력 로드
      const historyResult = await conversationManager.getHistory(projectInfo.id, 10);
      const messages = historyResult.ok ? historyResult.value : [];

      const session: Layer1SessionState = {
        projectInfo,
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

  /**
   * 대화 루프 실행 / Run conversation loop
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param options - CLI 옵션 / CLI options
   * @param chat - TUI 채팅 인터페이스 / TUI chat interface
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async runConversationLoop(
    session: Layer1SessionState,
    options: GlobalCliOptions,
    chat: ChatUi,
  ): Promise<Result<void, AdevError>> {
    try {
      // TUI 시작
      chat.start();

      // 초기 기능 설명이 있으면 자동 입력
      const initialFeature = (options as StartOptions).feature;
      if (initialFeature) {
        const responseResult = await this.processUserInput(session, initialFeature, chat);
        if (!responseResult.ok) {
          return responseResult;
        }
      }

      // REPL 루프
      while (true) {
        const event = await chat.waitForInput();

        switch (event.type) {
          case 'exit':
            chat.showExit();
            return ok(undefined);

          case 'interrupt':
            chat.showInterrupt();
            return ok(undefined);

          case 'eof':
            return ok(undefined);

          case 'help':
            chat.showHelp();
            break;

          case 'clear':
            // 대화 이력 초기화
            session.messages.length = 0;
            chat.system('대화 이력이 초기화되었습니다.');
            break;

          case 'contract': {
            chat.showContractStart();
            const contractResult = await this.generateContract(session, chat);
            if (!contractResult.ok) {
              chat.error(`Contract 생성 실패: ${contractResult.error.message}`);
              continue;
            }
            const contractPath = resolve(session.projectInfo.path, '.adev', 'contract.json');
            chat.showContractComplete(contractPath);
            return ok(undefined);
          }

          case 'message': {
            const responseResult = await this.processUserInput(session, event.text, chat);
            if (!responseResult.ok) {
              chat.error(`응답 생성 실패: ${responseResult.error.message}`);
            }
            break;
          }
        }
      }
    } catch (error: unknown) {
      return err(
        new AdevError(
          'cli_start_conversation_failed',
          `대화 루프 실패 / Conversation loop failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 사용자 입력 처리 / Process user input
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param userInput - 사용자 입력 / User input
   * @param chat - TUI 채팅 인터페이스 / TUI chat interface
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async processUserInput(
    session: Layer1SessionState,
    userInput: string,
    chat: ChatUi,
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

      // Claude API 호출 (스피너 표시)
      chat.startSpinner('생각 중...');

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
        chat.failSpinner('API 호출 실패');
        return err(
          new AdevError(
            'cli_start_api_failed',
            `Claude API 호출 실패 / Claude API call failed: ${responseResult.error.message}`,
            responseResult.error,
          ),
        );
      }

      chat.succeedSpinner();

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

      // TUI를 통해 응답 표시
      chat.showMessage({ role: 'assistant', content: assistantContent, timestamp: new Date() });

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
   * @description
   * KR: Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder 파이프라인으로 Contract를 생성한다.
   * EN: Generates Contract via Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder pipeline.
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param chat - TUI 채팅 인터페이스 / TUI chat interface
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async generateContract(
    session: Layer1SessionState,
    chat: ChatUi,
  ): Promise<Result<void, AdevError>> {
    try {
      chat.startSpinner('기획 문서 분석 중...');

      // 1. Planner: 대화에서 기획 문서 생성
      const planResult = session.planner.createPlan(session.projectInfo.id, session.messages);
      if (!planResult.ok) {
        chat.failSpinner('기획 문서 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `기획 문서 생성 실패 / Plan creation failed: ${planResult.error.message}`,
            planResult.error,
          ),
        );
      }

      // 2. Planner: 기능 추출
      const featuresResult = session.planner.extractFeatures(planResult.value);
      if (!featuresResult.ok) {
        chat.failSpinner('기능 추출 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `기능 추출 실패 / Feature extraction failed: ${featuresResult.error.message}`,
            featuresResult.error,
          ),
        );
      }

      chat.succeedSpinner('기획 문서 완성');
      chat.startSpinner('설계 문서 생성 중...');

      // 3. Designer: 설계 문서 생성
      const designResult = session.designer.createDesign(
        session.projectInfo.id,
        planResult.value,
        featuresResult.value,
      );
      if (!designResult.ok) {
        chat.failSpinner('설계 문서 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `설계 문서 생성 실패 / Design creation failed: ${designResult.error.message}`,
            designResult.error,
          ),
        );
      }

      chat.succeedSpinner('설계 문서 완성');
      chat.startSpinner('테스트 정의 생성 중...');

      // 4. TestTypeDesigner: 테스트 케이스 유형 정의서 생성
      const testDefsResult = session.testTypeDesigner.createDefinitions(featuresResult.value);
      if (!testDefsResult.ok) {
        chat.failSpinner('테스트 정의 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `테스트 정의 생성 실패 / Test definition creation failed: ${testDefsResult.error.message}`,
            testDefsResult.error,
          ),
        );
      }

      chat.succeedSpinner('테스트 정의 완성');
      chat.startSpinner('Contract 생성 중...');

      // 5. ContractBuilder: Contract 생성
      const contractResult = session.contractBuilder.buildContract(
        featuresResult.value,
        testDefsResult.value,
        designResult.value,
      );
      if (!contractResult.ok) {
        chat.failSpinner('Contract 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `Contract 생성 실패 / Contract build failed: ${contractResult.error.message}`,
            contractResult.error,
          ),
        );
      }

      chat.succeedSpinner('Contract 생성 완료');

      // 6. Contract 파일 저장
      const contractPath = resolve(session.projectInfo.path, '.adev', 'contract.json');
      const contractJson = JSON.stringify(contractResult.value, null, 2);
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
