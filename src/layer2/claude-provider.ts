/**
 * Claude LLM Provider / Claude LLM 제공자 어댑터
 *
 * @description
 * KR: 기존 V2SessionExecutor의 Claude Agent SDK 연동을 LlmProvider 인터페이스로 래핑한다.
 *     chat()은 executeOneShot을 사용하고, stream()은 V2Session 기반 스트리밍을 제공한다.
 * EN: Wraps the existing V2SessionExecutor Claude Agent SDK integration as an LlmProvider.
 *     chat() uses executeOneShot, stream() provides V2Session-based streaming.
 */

import type { AuthProvider } from 'auth/types.js';
import { AgentError } from 'core/errors.js';
import type {
  LlmCallOptions,
  LlmCapabilities,
  LlmChatResponse,
  LlmCostEstimate,
  LlmMessage,
  LlmProvider,
  LlmStreamEvent,
} from 'core/llm-provider.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';
import type { V2Session, V2SessionFactory } from 'layer2/v2-session-executor-types.js';
import { executeOneShot, sdkSessionFactory } from 'layer2/v2-session-factory.js';

// ── Claude 모델 비용 / Claude Model Pricing ──────────────────────

/** Claude 모델별 토큰 단가 (USD per 1M tokens) */
const CLAUDE_PRICING: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
};

const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-6';
const CLAUDE_MAX_CONTEXT_TOKENS = 200_000;
const CLAUDE_MAX_OUTPUT_TOKENS = 32_000;

// ── Claude Provider 옵션 / Claude Provider Options ───────────────

/**
 * ClaudeProvider 생성 옵션 / ClaudeProvider constructor options
 */
export interface ClaudeProviderOptions {
  /** 인증 공급자 / Authentication provider */
  readonly authProvider: AuthProvider;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** 기본 모델 ID (선택) / Default model ID (optional) */
  readonly defaultModel?: string;
  /** 세션 팩토리 (선택, 테스트 시 주입) / Session factory (optional, for testing) */
  readonly sessionFactory?: V2SessionFactory;
}

// ── Claude Provider 구현 / Claude Provider Implementation ────────

/**
 * Claude LLM 제공자 구현 / Claude LLM provider implementation
 *
 * @description
 * KR: @anthropic-ai/claude-agent-sdk 기반 LlmProvider 구현.
 *     V2Session API를 통해 채팅 및 스트리밍을 제공한다.
 * EN: LlmProvider implementation based on @anthropic-ai/claude-agent-sdk.
 *     Provides chat and streaming via V2Session API.
 */
export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';

  private readonly authProvider: AuthProvider;
  private readonly logger: Logger;
  private readonly defaultModel: string;
  private readonly sessionFactory: V2SessionFactory;

  constructor(options: ClaudeProviderOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger.child({ module: 'ClaudeProvider' });
    this.defaultModel = options.defaultModel ?? DEFAULT_CLAUDE_MODEL;
    this.sessionFactory = options.sessionFactory ?? sdkSessionFactory;
  }

  /**
   * 동기식 채팅 요청 / Synchronous chat request
   *
   * @param messages - 대화 메시지 배열 / Array of conversation messages
   * @param options - 호출 옵션 (선택) / Call options (optional)
   * @returns 채팅 응답 Result / Chat response Result
   */
  async chat(
    messages: readonly LlmMessage[],
    options?: LlmCallOptions,
  ): Promise<Result<LlmChatResponse>> {
    const model = options?.model ?? this.defaultModel;
    this.logger.debug('Claude chat request', { model, messageCount: messages.length });

    const prompt = this.buildPromptFromMessages(messages, options?.systemPrompt);
    const env = this.buildEnv();

    const result = await executeOneShot(prompt, {
      model,
      permissionMode: 'bypassPermissions',
      env,
      allowedTools: options?.tools ? [...options.tools] : undefined,
    });

    if (!result.ok) {
      return err(
        new AgentError(
          'llm_chat_failed',
          `Claude chat failed: ${result.error.message}`,
          result.error,
        ),
      );
    }

    return ok({
      content: result.value,
      model,
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end_turn',
    });
  }

  /**
   * 스트리밍 채팅 요청 / Streaming chat request
   *
   * @param messages - 대화 메시지 배열 / Array of conversation messages
   * @param options - 호출 옵션 (선택) / Call options (optional)
   * @returns 스트림 이벤트 AsyncGenerator / Stream event AsyncGenerator
   */
  async *stream(
    messages: readonly LlmMessage[],
    options?: LlmCallOptions,
  ): AsyncGenerator<LlmStreamEvent, void> {
    const model = options?.model ?? this.defaultModel;
    this.logger.debug('Claude stream request', { model, messageCount: messages.length });

    const prompt = this.buildPromptFromMessages(messages, options?.systemPrompt);
    const env = this.buildEnv();

    let session: V2Session;
    try {
      session = this.sessionFactory({
        model,
        permissionMode: 'bypassPermissions',
        env,
        allowedTools: options?.tools ? [...options.tools] : undefined,
      });
    } catch (error) {
      yield {
        type: 'error' as const,
        data: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    try {
      await session.send(prompt);

      for await (const sdkEvent of session.stream()) {
        const mapped = this.mapSdkEventToStreamEvent(sdkEvent);
        if (mapped) {
          yield mapped;
          if (mapped.type === 'done') {
            session.close();
            return;
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error' as const,
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 제공자 기능 정보를 반환한다 / Returns provider capabilities
   *
   * @returns 기능 정보 객체 / Capabilities descriptor
   */
  getCapabilities(): LlmCapabilities {
    return {
      providerName: 'claude',
      defaultModel: this.defaultModel,
      supportedModels: Object.keys(CLAUDE_PRICING),
      supportsStreaming: true,
      supportsAgentTeams: true,
      maxContextTokens: CLAUDE_MAX_CONTEXT_TOKENS,
      maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS,
    };
  }

  /**
   * 요청 비용을 추정한다 / Estimates request cost
   *
   * @param inputTokens - 예상 입력 토큰 수 / Estimated input tokens
   * @param outputTokens - 예상 출력 토큰 수 / Estimated output tokens
   * @param model - 사용 모델 ID (선택) / Model ID (optional)
   * @returns 비용 추정 결과 / Cost estimation result
   */
  estimateCost(inputTokens: number, outputTokens: number, model?: string): LlmCostEstimate {
    const targetModel = model ?? this.defaultModel;
    // WHY: DEFAULT_CLAUDE_MODEL은 CLAUDE_PRICING에 반드시 존재하므로 fallback 보장
    const fallback = CLAUDE_PRICING[DEFAULT_CLAUDE_MODEL] ?? { input: 15.0, output: 75.0 };
    const pricing = CLAUDE_PRICING[targetModel] ?? fallback;

    const inputCostUsd = (inputTokens / 1_000_000) * pricing.input;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.output;

    return {
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: inputCostUsd + outputCostUsd,
      model: targetModel,
    };
  }

  // ── Private Helpers ───────────────────────────────────────────

  /**
   * LlmMessage 배열을 단일 프롬프트 문자열로 변환한다 / Convert messages to prompt string
   */
  private buildPromptFromMessages(messages: readonly LlmMessage[], systemPrompt?: string): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
    }

    // WHY: Claude Agent SDK의 V2 Session API는 단일 문자열 프롬프트를 받으므로
    //      메시지 배열을 하나로 합침
    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(msg.content);
      } else if (msg.role === 'user') {
        parts.push(msg.content);
      } else if (msg.role === 'assistant') {
        parts.push(`[Assistant]: ${msg.content}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * 인증 환경변수를 구성한다 / Build auth environment variables
   */
  private buildEnv(): Record<string, string> {
    const authHeader = this.authProvider.getAuthHeader();
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };

    if ('x-api-key' in authHeader) {
      env.ANTHROPIC_API_KEY = authHeader['x-api-key'] as string;
    }

    if ('authorization' in authHeader) {
      const token = (authHeader.authorization as string).replace('Bearer ', '');
      env.CLAUDE_CODE_OAUTH_TOKEN = token;
    }

    // WHY: Nested session 방지
    // biome-ignore lint/performance/noDelete: CLAUDECODE 키 자체 제거 필요
    delete env.CLAUDECODE;

    return env;
  }

  /**
   * SDKMessage를 LlmStreamEvent로 매핑한다 / Map SDKMessage to LlmStreamEvent
   */
  private mapSdkEventToStreamEvent(msg: {
    type: string;
    message?: {
      content: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
    subtype?: string;
    result?: string;
    stop_reason?: string | null;
    total_cost_usd?: number | null;
    errors?: string[];
  }): LlmStreamEvent | null {
    switch (msg.type) {
      case 'assistant': {
        const rawContent = msg.message?.content;
        // WHY: SDKMessage의 content는 string | ContentBlockParam[] 유니온
        if (!rawContent || typeof rawContent === 'string') {
          return rawContent ? { type: 'text_delta', data: rawContent } : null;
        }
        const blocks = rawContent;

        const toolBlock = blocks.find((b) => b.type === 'tool_use');
        if (toolBlock) {
          return {
            type: 'tool_use',
            data: `Tool: ${toolBlock.name}`,
            metadata: { toolName: toolBlock.name, toolInput: toolBlock.input },
          };
        }

        const textBlocks = blocks.filter((b) => b.type === 'text');
        if (textBlocks.length > 0) {
          const text = textBlocks.map((b) => b.text ?? '').join('\n');
          return { type: 'text_delta', data: text };
        }

        return null;
      }

      case 'result': {
        if (msg.subtype === 'success') {
          return {
            type: 'done',
            data: msg.result ?? '',
            metadata: { stopReason: msg.stop_reason, cost: msg.total_cost_usd },
          };
        }
        return {
          type: 'error',
          data: msg.errors?.[0] ?? 'Execution failed',
          metadata: { subtype: msg.subtype },
        };
      }

      default:
        return null;
    }
  }
}
