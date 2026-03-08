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
import type { AuthProvider } from '../../auth/types.js';
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
import type { ConversationMessage, HandoffPackage } from '../../layer1/types.js';
import { Layer2Bootstrap } from '../../layer2/layer2-bootstrap.js';
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
  /** 인증 공급자 / Auth provider */
  readonly authProvider: AuthProvider;
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

            // WHY: Contract 생성 완료 후 Layer2 자율 개발 시작 여부 유저에게 확인
            chat.system('Layer2 자율 개발을 시작하려면 "yes"를 입력하세요. (건너뛰려면 Enter)');
            const confirmEvent = await chat.waitForInput();
            if (
              confirmEvent.type === 'message' &&
              (confirmEvent.text.toLowerCase() === 'yes' ||
                confirmEvent.text.toLowerCase() === 'y' ||
                confirmEvent.text === '네' ||
                confirmEvent.text === '예')
            ) {
              const layer2Result = await this.runLayer2(session, contractResult.value, chat);
              if (!layer2Result.ok) {
                chat.error(`Layer2 실행 실패: ${layer2Result.error.message}`);
              }
            }

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

      // WHY: 스트리밍으로 토큰별 출력 — 더 빠른 UX 제공
      const messages = [
        { role: 'user' as const, content: LAYER1_SYSTEM_PROMPT },
        ...session.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: userInput },
      ];

      chat.showStreamingStart();
      let assistantContent = '';

      const streamResult = await session.claudeApi.streamMessage(
        messages,
        (event) => {
          if (event.type === 'content_delta') {
            chat.showStreamingDelta(event.text);
            assistantContent += event.text;
          }
        },
        { maxTokens: 4096, temperature: 0.7 },
      );

      chat.showStreamingEnd();

      if (!streamResult.ok) {
        return err(
          new AdevError(
            'cli_start_api_failed',
            `Claude API 호출 실패 / Claude API call failed: ${streamResult.error.message}`,
            streamResult.error,
          ),
        );
      }

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
   * KR: Planner → Designer → SpecBuilder → TestTypeDesigner → ContractBuilder 파이프라인으로
   *     Contract와 HandoffPackage를 생성한다.
   * EN: Generates Contract and HandoffPackage via the full Layer1 pipeline.
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param chat - TUI 채팅 인터페이스 / TUI chat interface
   * @returns 성공 시 ok(HandoffPackage), 실패 시 err(AdevError)
   */
  private async generateContract(
    session: Layer1SessionState,
    chat: ChatUi,
  ): Promise<Result<HandoffPackage, AdevError>> {
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
      chat.startSpinner('스펙 문서 생성 중...');

      // 5. SpecBuilder: 스펙 문서 생성
      const specResult = session.specBuilder.buildSpec(
        planResult.value,
        designResult.value,
        featuresResult.value,
      );
      if (!specResult.ok) {
        chat.failSpinner('스펙 문서 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `스펙 문서 생성 실패 / Spec build failed: ${specResult.error.message}`,
            specResult.error,
          ),
        );
      }

      chat.succeedSpinner('스펙 문서 완성');
      chat.startSpinner('Contract 생성 중...');

      // 6. ContractBuilder: ContractSchema 생성
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

      // 7. HandoffPackage 생성 (Layer2 전달용)
      const handoffResult = session.contractBuilder.buildHandoffPackage(
        session.projectInfo.id,
        contractResult.value,
        planResult.value,
        designResult.value,
        specResult.value,
      );
      if (!handoffResult.ok) {
        chat.failSpinner('HandoffPackage 생성 실패');
        return err(
          new AdevError(
            'cli_start_contract_generation_failed',
            `HandoffPackage 생성 실패 / HandoffPackage build failed: ${handoffResult.error.message}`,
            handoffResult.error,
          ),
        );
      }

      chat.succeedSpinner('Contract 생성 완료');

      // 8. Contract + HandoffPackage 파일 저장
      const contractPath = resolve(session.projectInfo.path, '.adev', 'contract.json');
      const handoffPath = resolve(session.projectInfo.path, '.adev', 'handoff.json');
      await Bun.write(contractPath, JSON.stringify(contractResult.value, null, 2));
      await Bun.write(handoffPath, JSON.stringify(handoffResult.value, null, 2));

      this.logger.info('Contract + HandoffPackage 생성 완료', { contractPath, handoffPath });

      return ok(handoffResult.value);
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

  /**
   * Layer2 자율 개발 실행 / Run Layer2 autonomous development
   *
   * @description
   * KR: Layer2Bootstrap으로 TeamLeader를 생성하고,
   *     Contract의 모든 기능을 순서대로 실행한다.
   *     에이전트 이벤트를 TUI에 실시간 출력한다.
   * EN: Creates TeamLeader via Layer2Bootstrap and executes all features
   *     from the Contract in order. Streams agent events to TUI.
   *
   * @param session - Layer1 세션 상태 / Layer1 session state
   * @param handoff - Layer1→Layer2 인수 패키지 / Handoff package
   * @param chat - TUI 채팅 인터페이스 / TUI chat interface
   * @returns 성공 시 ok(void), 실패 시 err(AdevError)
   */
  private async runLayer2(
    session: Layer1SessionState,
    handoff: HandoffPackage,
    chat: ChatUi,
  ): Promise<Result<void, AdevError>> {
    try {
      chat.system('Layer2 자율 개발 시작 중...');

      const bootstrap = new Layer2Bootstrap({
        authProvider: session.authProvider,
        logger: this.logger,
        projectCwd: session.projectInfo.path,
      });

      const teamLeader = bootstrap.createTeamLeader();
      const features = handoff.contract.implementationOrder;

      this.logger.info('Layer2 실행 시작', {
        projectId: handoff.projectId,
        featureCount: features.length,
      });

      for (const featureId of features) {
        chat.system(`기능 구현 시작: ${featureId}`);

        for await (const event of teamLeader.executeFeature(featureId, handoff)) {
          switch (event.type) {
            case 'message':
              // WHY: agent 메시지는 system 스타일로 표시 (사용자 입력 아님)
              chat.system(`[${event.agentName}] ${event.content}`);
              break;
            case 'error':
              chat.error(`[${event.agentName}] ${event.content}`);
              break;
            case 'done':
              chat.system(`기능 완료: ${featureId}`);
              break;
            default:
              // tool_use, tool_result 등은 로그만
              this.logger.debug('Layer2 이벤트', {
                type: event.type,
                agent: event.agentName,
              });
          }
        }
      }

      chat.system('Layer2 자율 개발 완료!');
      this.logger.info('Layer2 실행 완료', { featureCount: features.length });

      return ok(undefined);
    } catch (error: unknown) {
      return err(
        new AdevError(
          'cli_start_layer2_failed',
          `Layer2 실행 실패 / Layer2 execution failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }
}
