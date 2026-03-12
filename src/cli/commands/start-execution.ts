/**
 * AgentMd 생성 및 Layer2 실행 / AgentMd generation and Layer2 execution
 *
 * @description
 * KR: Contract 이후 실행 단계 - 에이전트 문서 생성 및 Layer2 자율 개발 시작.
 * EN: Post-contract execution - agent doc generation and Layer2 autonomous development.
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AdevError } from '../../core/errors.js';
import type { Logger } from '../../core/logger.js';
import { err, ok } from '../../core/types.js';
import type { Result } from '../../core/types.js';
import { AgentMdGenerator } from '../../layer1/agent-md-generator.js';
import type { AgentMdGeneratorConfig } from '../../layer1/agent-md-generator.js';
import type { HandoffPackage } from '../../layer1/types.js';
import { Layer2Bootstrap } from '../../layer2/layer2-bootstrap.js';
import type { ChatUi } from '../tui/chat.js';
import type { Layer1SessionState } from './start-types.js';

/**
 * AgentMd 초안 생성 / Generate agent .md drafts
 *
 * @description
 * KR: HandoffPackage에서 projectType을 추출하고, AI로 7개 에이전트 역할 문서를 병렬 생성한다.
 *     실패 시 warn 로그만 남기고 Layer2 진행은 계속한다 (선택적 기능).
 * EN: Extracts projectType from HandoffPackage, generates 7 agent role docs in parallel.
 *     On failure, only logs a warning (optional feature).
 *
 * @param session - Layer1 세션 상태 / Layer1 session state
 * @param handoff - HandoffPackage
 * @param chat - TUI 채팅 인터페이스 / TUI chat interface
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 항상 ok(void) — 실패 시 warn 로그만 / Always ok(void) — warns on failure
 */
export async function generateAgentMds(
  session: Layer1SessionState,
  handoff: HandoffPackage,
  chat: ChatUi,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  try {
    chat.startSpinner('에이전트 문서 초안 생성 중...');

    const agentsDir = resolve(session.projectInfo.path, '.adev', 'agents');
    await mkdir(agentsDir, { recursive: true });

    const config: AgentMdGeneratorConfig = {
      projectPath: session.projectInfo.path,
      projectName: session.projectInfo.name,
      projectType: handoff.contract.projectType,
      techStack: 'TypeScript, Bun',
      conventions: 'ES Modules, strict TypeScript, Result<T,E> pattern, kebab-case files',
      language: 'Korean',
    };

    const generator = new AgentMdGenerator(session.claudeApi, logger);

    const draftsResult = await generator.generate(config);
    if (!draftsResult.ok) {
      chat.failSpinner('에이전트 문서 초안 생성 실패 (건너뜀)');
      logger.warn('에이전트 .md 초안 생성 실패, 건너뜀', { error: draftsResult.error.message });
      return ok(undefined);
    }

    const saveResult = await generator.saveDrafts(session.projectInfo.path, draftsResult.value);
    if (!saveResult.ok) {
      chat.failSpinner('에이전트 문서 저장 실패 (건너뜀)');
      logger.warn('에이전트 .md 초안 저장 실패, 건너뜀', { error: saveResult.error.message });
      return ok(undefined);
    }

    chat.succeedSpinner(`에이전트 문서 생성 완료 (${agentsDir})`);
    logger.info('에이전트 .md 초안 저장 완료', { agentsDir });

    return ok(undefined);
  } catch (error: unknown) {
    logger.warn('에이전트 .md 생성 예외 발생, 건너뜀', { error: String(error) });
    return ok(undefined);
  }
}

/**
 * Layer2 자율 개발 실행 / Run Layer2 autonomous development
 *
 * @description
 * KR: Layer2Bootstrap으로 TeamLeader를 생성하고,
 *     Contract의 모든 기능을 순서대로 실행한다.
 * EN: Creates TeamLeader via Layer2Bootstrap and executes all features from Contract.
 *
 * @param session - Layer1 세션 상태 / Layer1 session state
 * @param handoff - HandoffPackage
 * @param chat - TUI 채팅 인터페이스 / TUI chat interface
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 ok(void), 실패 시 err(AdevError)
 */
export async function runLayer2(
  session: Layer1SessionState,
  handoff: HandoffPackage,
  chat: ChatUi,
  logger: Logger,
): Promise<Result<void, AdevError>> {
  try {
    chat.system('Layer2 자율 개발 시작 중...');

    const bootstrap = new Layer2Bootstrap({
      authProvider: session.authProvider,
      logger,
      projectCwd: session.projectInfo.path,
    });

    const teamLeader = await bootstrap.createTeamLeader();
    const features = handoff.contract.implementationOrder;

    logger.info('Layer2 실행 시작', {
      projectId: handoff.projectId,
      featureCount: features.length,
    });

    for (const featureId of features) {
      chat.system(`기능 구현 시작: ${featureId}`);

      for await (const event of teamLeader.executeFeature(featureId, handoff)) {
        switch (event.type) {
          case 'message':
            chat.system(`[${event.agentName}] ${event.content}`);
            break;
          case 'error':
            chat.error(`[${event.agentName}] ${event.content}`);
            break;
          case 'done':
            chat.system(`기능 완료: ${featureId}`);
            break;
          default:
            logger.debug('Layer2 이벤트', { type: event.type, agent: event.agentName });
        }
      }
    }

    chat.system('Layer2 자율 개발 완료!');
    logger.info('Layer2 실행 완료', { featureCount: features.length });

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
