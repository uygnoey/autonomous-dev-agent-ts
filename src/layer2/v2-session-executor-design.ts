/**
 * V2 Session DESIGN Phase 실행기 / V2 Session DESIGN Phase executor
 *
 * @description
 * KR: DESIGN Phase 전용 실행 로직. Agent Teams 환경 활성화, 종료 조건 판별, 재토론 루프를 담당한다.
 * EN: DESIGN Phase specific execution logic. Handles Agent Teams env activation, completion criteria, re-discussion loop.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentConfig, AgentEvent } from 'layer2/types.js';
import { buildSessionEnvironment } from 'layer2/v2-session-env-builder.js';
import type { V2Session } from 'layer2/v2-session-executor-types.js';
import type { SDKSessionOptions, V2SessionFactory } from 'layer2/v2-session-executor-types.js';
import { createErrorEvent, generateSessionId, mapSdkEvent } from 'layer2/v2-session-factory.js';

/** DESIGN Phase 재토론 최대 횟수 / Max DESIGN phase re-discussion cycles */
const MAX_DESIGN_RETRIES = 2;

/** DESIGN Phase 종료 조건 키워드 / DESIGN Phase completion keywords */
const DESIGN_COMPLETE_KEYWORDS = ['합의', '동의', 'AGREED', 'APPROVED', '완료', 'LGTM'];
const DESIGN_GATE_KEYWORDS = ['qa 통과', 'qa gate', 'gate passed', '품질 통과'];

/**
 * DESIGN Phase 실행 옵션 / DESIGN Phase execution options
 */
export interface DesignPhaseOptions {
  readonly featureId: string;
  readonly handoff: HandoffPackage;
  readonly signal?: AbortSignal;
}

/**
 * DESIGN Phase 실행에 필요한 의존성 / Dependencies for DESIGN Phase execution
 */
export interface DesignPhaseDeps {
  readonly authProvider: AuthProvider;
  readonly logger: Logger;
  readonly sessionFactory: V2SessionFactory;
  readonly defaultOptions?: { model?: string };
  readonly activeSessions: Map<string, { session: V2Session; options: SDKSessionOptions }>;
  readonly hooks?: Record<string, unknown>;
  readonly createSession: (
    config: AgentConfig,
    env: Record<string, string>,
  ) => Promise<
    import('core/types.js').Result<
      { session: V2Session; options: SDKSessionOptions },
      import('core/errors.js').AgentError
    >
  >;
}

/**
 * DESIGN Phase 전용 실행 / DESIGN Phase specific execution
 *
 * @param config - 에이전트 설정 / Agent configuration
 * @param options - DESIGN Phase 옵션 / DESIGN phase options
 * @param deps - 실행 의존성 / Execution dependencies
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeDesignPhase(
  config: AgentConfig,
  options: DesignPhaseOptions,
  deps: DesignPhaseDeps,
): AsyncGenerator<AgentEvent> {
  const { logger, authProvider, activeSessions } = deps;
  logger.info('DESIGN Phase 실행 시작 (Agent Teams)', {
    agentName: config.name,
    featureId: options.featureId,
  });

  const designConfig: AgentConfig = {
    ...config,
    phase: 'DESIGN',
    env: {
      ...(config.env ?? {}),
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    },
  };

  for (let attempt = 0; attempt <= MAX_DESIGN_RETRIES; attempt++) {
    let designComplete = false;

    try {
      const sessionEnv = buildSessionEnvironment(designConfig, authProvider);
      const sessionResult = await deps.createSession(designConfig, sessionEnv);
      if (!sessionResult.ok) {
        yield createErrorEvent(config.name, sessionResult.error.message);
        return;
      }

      const { session, options: sessionOptions } = sessionResult.value;
      const sessionId = generateSessionId(
        config.projectId,
        options.featureId,
        config.name,
        'DESIGN',
      );
      activeSessions.set(sessionId, { session, options: sessionOptions });

      let sessionCleaned = false;
      try {
        const basePrompt = config.systemPrompt
          ? `${config.systemPrompt}\n\n---\n\n${config.prompt}`
          : config.prompt;
        const fullPrompt =
          attempt > 0
            ? `${basePrompt}\n\n[재토론 ${attempt}/${MAX_DESIGN_RETRIES}] 이전 DESIGN Phase에서 종료 조건(qa Gate 통과 + 전원 합의)이 충족되지 않았습니다. 반드시 qa Gate 통과 키워드와 합의 키워드를 포함하여 종료해주세요.`
            : basePrompt;

        logger.info('DESIGN Phase session send 시작', {
          agentName: config.name,
          promptLen: fullPrompt.length,
          attempt,
        });
        await session.send(fullPrompt);

        let lastContent = '';

        for await (const sdkEvent of session.stream()) {
          if (options.signal?.aborted) {
            logger.warn('DESIGN Phase 세션 abort 신호 수신 — 세션 종료', {
              agentName: config.name,
              featureId: options.featureId,
            });
            session.close();
            activeSessions.delete(sessionId);
            sessionCleaned = true;
            yield createErrorEvent(config.name, 'DESIGN Phase 세션이 이상 감지로 중단됨');
            return;
          }

          const mappedEvent = mapSdkEvent(sdkEvent, config.name, (eventType) => {
            logger.debug('Unhandled SDK event type', { eventType });
          });
          if (mappedEvent) {
            if (mappedEvent.type === 'message' || mappedEvent.type === 'done') {
              lastContent = mappedEvent.content;
            }
            yield mappedEvent;
          }

          if (mappedEvent?.type === 'done') {
            const contentLower = lastContent.toLowerCase();
            const hasConsensus = DESIGN_COMPLETE_KEYWORDS.some((kw) =>
              contentLower.includes(kw.toLowerCase()),
            );
            const hasGatePass = DESIGN_GATE_KEYWORDS.some((kw) =>
              contentLower.includes(kw.toLowerCase()),
            );

            if (hasConsensus && hasGatePass) {
              logger.info('DESIGN Phase 종료 조건 충족', {
                agentName: config.name,
                hasConsensus,
                hasGatePass,
                attempt,
              });
              designComplete = true;
            } else {
              logger.warn('DESIGN Phase 종료 조건 미충족', {
                agentName: config.name,
                featureId: options.featureId,
                hasConsensus,
                hasGatePass,
                attempt,
              });
              yield {
                type: 'message',
                agentName: config.name,
                content: `[경고] DESIGN Phase 종료 조건 미충족 — 합의: ${hasConsensus}, qa Gate: ${hasGatePass}`,
                timestamp: new Date(),
                metadata: { designCompletionCheck: { hasConsensus, hasGatePass } },
              };
            }

            session.close();
            activeSessions.delete(sessionId);
            sessionCleaned = true;
          }
        }
      } catch (streamError) {
        const errMsg =
          streamError instanceof Error
            ? `${streamError.message}\n${streamError.stack ?? ''}`
            : String(streamError);
        logger.error('DESIGN Phase stream error', {
          agentName: config.name,
          errorMsg: errMsg,
          attempt,
        });
        yield createErrorEvent(config.name, errMsg || 'Unknown DESIGN stream error');
        activeSessions.delete(sessionId);
        return;
      } finally {
        if (!sessionCleaned) {
          try {
            session.close();
          } catch {
            /* ignore close errors */
          }
          activeSessions.delete(sessionId);
        }
      }
    } catch (error) {
      logger.error('DESIGN Phase 실행 실패', { agentName: config.name, error, attempt });
      yield createErrorEvent(
        config.name,
        error instanceof Error ? error.message : 'Unknown DESIGN execution error',
      );
      return;
    }

    if (designComplete) {
      return;
    }

    if (attempt < MAX_DESIGN_RETRIES) {
      logger.info('DESIGN Phase 재토론 시작', {
        attempt: attempt + 1,
        maxRetries: MAX_DESIGN_RETRIES,
        featureId: options.featureId,
      });
      yield {
        type: 'message',
        agentName: config.name,
        content: `[재토론] DESIGN Phase 종료 조건 미충족 — 재토론 시작 (${attempt + 1}/${MAX_DESIGN_RETRIES})`,
        timestamp: new Date(),
        metadata: { designRetry: { attempt: attempt + 1, maxRetries: MAX_DESIGN_RETRIES } },
      };
    } else {
      logger.warn('DESIGN Phase 재토론 횟수 소진 — 조건 미충족 상태로 진행', {
        featureId: options.featureId,
        maxRetries: MAX_DESIGN_RETRIES,
      });
      yield {
        type: 'message',
        agentName: config.name,
        content: `[경고] DESIGN Phase ${MAX_DESIGN_RETRIES}회 재토론 후에도 종료 조건 미충족 — 진행`,
        timestamp: new Date(),
        metadata: { designRetryExhausted: true, maxRetries: MAX_DESIGN_RETRIES },
      };
    }
  }
}
