/**
 * start 명령 진입점 / Start command entry point
 *
 * @description
 * KR: Layer1 Claude Opus와 대화 세션을 시작하고,
 *     기획/설계 대화를 진행하여 Contract를 생성한다.
 * EN: Starts conversation session with Layer1 Claude Opus,
 *     conducts planning/design conversation, and generates Contract.
 */

import { randomUUID } from 'node:crypto';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import type { ConversationMessage } from '../../layer1/types.js';
import { createChatUi } from '../tui/chat.js';
import type { ChatUi } from '../tui/chat.js';
import type { GlobalCliOptions } from '../types.js';
import { generateAgentMds, runLayer2, runLayer3 } from './start-execution.js';
import { generateContract } from './start-pipeline.js';
import { initializeLayer1Session, loadActiveProject } from './start-session.js';
import { ADEV_VERSION, LAYER1_SYSTEM_PROMPT } from './start-types.js';
import type { Layer1SessionState, StartOptions } from './start-types.js';

// Re-export for external consumers
export type { StartOptions } from './start-types.js';

/**
 * Layer1 대화 시작 명령 / Start Layer1 conversation command
 *
 * @description
 * KR: REPL 루프를 실행하여 기획/설계를 진행한 후 Contract를 생성한다.
 * EN: Runs REPL loop for planning/design, and generates Contract.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 *
 * @example
 * const cmd = new StartCommand(logger);
 * await cmd.execute([], {});
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

    const projectResult = await loadActiveProject(options);
    if (!projectResult.ok) return projectResult;

    const projectInfo = projectResult.value;
    this.logger.info('프로젝트 로드 완료', {
      projectId: projectInfo.id,
      projectName: projectInfo.name,
    });

    const sessionResult = await initializeLayer1Session(projectInfo, this.logger);
    if (!sessionResult.ok) return sessionResult;

    const session = sessionResult.value;
    this.logger.info('Layer1 세션 초기화 완료');

    const chat = createChatUi({
      version: ADEV_VERSION,
      model: 'claude-opus-4-6',
      projectName: projectInfo.name,
      phase: 'DESIGN',
    });

    const conversationResult = await this.runConversationLoop(session, options, chat);
    if (!conversationResult.ok) return conversationResult;

    this.logger.info('대화 세션 종료');
    return ok(undefined);
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
      chat.start();

      const initialFeature = (options as StartOptions).feature;
      if (initialFeature) {
        const responseResult = await this.processUserInput(session, initialFeature, chat);
        if (!responseResult.ok) return responseResult;
      }

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
            session.messages.length = 0;
            chat.system('대화 이력이 초기화되었습니다.');
            break;
          case 'contract': {
            chat.showContractStart();
            const contractResult = await generateContract(session, chat, this.logger);
            if (!contractResult.ok) {
              chat.error(`Contract 생성 실패: ${contractResult.error.message}`);
              continue;
            }
            const contractPath = `${session.projectInfo.path}/.adev/contract.json`;
            chat.showContractComplete(contractPath);

            chat.system(
              'AI로 에이전트 가이드 문서(.adev/agents/*.md)를 생성하려면 "yes"를 입력하세요.',
            );
            const agentMdEvent = await chat.waitForInput();
            if (
              agentMdEvent.type === 'message' &&
              ['yes', 'y', '네', '예'].includes(agentMdEvent.text.toLowerCase())
            ) {
              await generateAgentMds(session, contractResult.value, chat, this.logger);
            }

            chat.system('Layer2 자율 개발을 시작하려면 "yes"를 입력하세요.');
            const confirmEvent = await chat.waitForInput();
            if (
              confirmEvent.type === 'message' &&
              ['yes', 'y', '네', '예'].includes(confirmEvent.text.toLowerCase())
            ) {
              const layer2Result = await runLayer2(
                session,
                contractResult.value,
                chat,
                this.logger,
              );
              if (!layer2Result.ok) {
                chat.error(`Layer2 실행 실패: ${layer2Result.error.message}`);
              } else {
                // WHY: Layer2 성공 시 Layer3 E2E 검증 자동 실행 (스펙 §계층 연동)
                await runLayer3(session, contractResult.value, chat, this.logger);
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
      const userMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'user',
        content: userInput,
        timestamp: new Date(),
        projectId: session.projectInfo.id,
      };

      await session.conversationManager.addMessage(userMessage);

      const messages = [
        { role: 'user' as const, content: LAYER1_SYSTEM_PROMPT },
        ...session.messages.map((m) => ({ role: m.role, content: m.content })),
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

      const assistantMessage: ConversationMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        projectId: session.projectInfo.id,
      };

      await session.conversationManager.addMessage(assistantMessage);
      chat.showMessage({ role: 'assistant', content: assistantContent, timestamp: new Date() });
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
}
