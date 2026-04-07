/**
 * OpenAI LLM Provider / OpenAI LLM 제공자 어댑터
 *
 * @description
 * KR: OpenAI Chat Completions API를 LlmProvider 인터페이스로 구현한다.
 *     Agent Teams는 지원하지 않으며, 순차 실행으로 대체한다.
 *     외부 SDK 의존 없이 fetch 기반으로 직접 호출한다.
 * EN: Implements LlmProvider interface using OpenAI Chat Completions API.
 *     Does not support Agent Teams; falls back to sequential execution.
 *     Uses fetch-based direct calls without external SDK dependency.
 */

import { AgentError } from 'core/errors.js';
import type {
  LlmCallOptions,
  LlmCapabilities,
  LlmChatResponse,
  LlmCostEstimate,
  LlmMessage,
  LlmProvider,
  LlmStreamEvent,
  LlmTokenUsage,
} from 'core/llm-provider.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';

// ── OpenAI 모델 비용 / OpenAI Model Pricing ─────────────────────

/** OpenAI 모델별 토큰 단가 (USD per 1M tokens) */
const OPENAI_PRICING: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_CONTEXT_TOKENS = 128_000;
const OPENAI_MAX_OUTPUT_TOKENS = 16_384;

// ── OpenAI Provider 옵션 / OpenAI Provider Options ──────────────

/**
 * OpenAiProvider 생성 옵션 / OpenAiProvider constructor options
 */
export interface OpenAiProviderOptions {
  /** OpenAI API 키 / OpenAI API key */
  readonly apiKey: string;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** 기본 모델 ID (선택) / Default model ID (optional) */
  readonly defaultModel?: string;
  /** API 엔드포인트 URL (선택, 커스텀 엔드포인트용) / API endpoint URL (optional) */
  readonly apiUrl?: string;
}

// ── OpenAI API 응답 타입 / OpenAI API Response Types ─────────────

/** OpenAI Chat Completion 응답 형식 */
interface OpenAiChatCompletionResponse {
  readonly id: string;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly message: {
      readonly role: string;
      readonly content: string | null;
    };
    readonly finish_reason: string | null;
  }[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

/** OpenAI Streaming Chunk 형식 */
interface OpenAiStreamChunk {
  readonly id: string;
  readonly choices: readonly {
    readonly index: number;
    readonly delta: {
      readonly role?: string;
      readonly content?: string | null;
    };
    readonly finish_reason: string | null;
  }[];
}

// ── OpenAI Provider 구현 / OpenAI Provider Implementation ────────

/**
 * OpenAI LLM 제공자 구현 / OpenAI LLM provider implementation
 *
 * @description
 * KR: OpenAI Chat Completions API를 fetch 기반으로 호출하는 LlmProvider 구현.
 *     Agent Teams 미지원 — 순차 실행으로 대체.
 * EN: LlmProvider implementation calling OpenAI Chat Completions API via fetch.
 *     No Agent Teams support — falls back to sequential execution.
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly defaultModel: string;
  private readonly apiUrl: string;

  constructor(options: OpenAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.logger = options.logger.child({ module: 'OpenAiProvider' });
    this.defaultModel = options.defaultModel ?? DEFAULT_OPENAI_MODEL;
    this.apiUrl = options.apiUrl ?? OPENAI_API_URL;
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
    this.logger.debug('OpenAI chat request', { model, messageCount: messages.length });

    const apiMessages = this.buildApiMessages(messages, options?.systemPrompt);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return err(
          new AgentError('llm_chat_failed', `OpenAI API error (${response.status}): ${errorBody}`),
        );
      }

      const data = (await response.json()) as OpenAiChatCompletionResponse;
      const choice = data.choices[0];

      if (!choice) {
        return err(new AgentError('llm_chat_failed', 'OpenAI returned no choices'));
      }

      const usage: LlmTokenUsage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      };

      return ok({
        content: choice.message.content ?? '',
        model: data.model,
        usage,
        stopReason: choice.finish_reason,
      });
    } catch (error) {
      return err(
        new AgentError(
          'llm_chat_failed',
          `OpenAI chat failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
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
    this.logger.debug('OpenAI stream request', { model, messageCount: messages.length });

    const apiMessages = this.buildApiMessages(messages, options?.systemPrompt);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: true,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        }),
      });
    } catch (error) {
      yield {
        type: 'error' as const,
        data: `OpenAI stream connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      yield {
        type: 'error' as const,
        data: `OpenAI API error (${response.status}): ${errorBody}`,
      };
      return;
    }

    if (!response.body) {
      yield { type: 'error' as const, data: 'OpenAI response body is null' };
      return;
    }

    yield* this.parseSSEStream(response.body);
  }

  /**
   * 제공자 기능 정보를 반환한다 / Returns provider capabilities
   *
   * @returns 기능 정보 객체 / Capabilities descriptor
   */
  getCapabilities(): LlmCapabilities {
    return {
      providerName: 'openai',
      defaultModel: this.defaultModel,
      supportedModels: Object.keys(OPENAI_PRICING),
      supportsStreaming: true,
      // WHY: Agent Teams는 Claude 전용 기능이므로 OpenAI에서는 미지원
      supportsAgentTeams: false,
      maxContextTokens: OPENAI_MAX_CONTEXT_TOKENS,
      maxOutputTokens: OPENAI_MAX_OUTPUT_TOKENS,
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
    // WHY: DEFAULT_OPENAI_MODEL은 OPENAI_PRICING에 반드시 존재하므로 fallback 보장
    const fallback = OPENAI_PRICING[DEFAULT_OPENAI_MODEL] ?? { input: 2.5, output: 10.0 };
    const pricing = OPENAI_PRICING[targetModel] ?? fallback;

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
   * LlmMessage 배열을 OpenAI API 메시지 형식으로 변환한다 / Convert to OpenAI API messages
   */
  private buildApiMessages(
    messages: readonly LlmMessage[],
    systemPrompt?: string,
  ): Array<{ role: string; content: string }> {
    const apiMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      apiMessages.push({ role: msg.role, content: msg.content });
    }

    return apiMessages;
  }

  /**
   * SSE 스트림을 파싱하여 LlmStreamEvent로 변환한다 / Parse SSE stream to LlmStreamEvents
   */
  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<LlmStreamEvent, void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // WHY: 마지막 줄은 불완전할 수 있으므로 버퍼에 유지
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              yield { type: 'done', data: '' };
              return;
            }
            continue;
          }

          if (!trimmed.startsWith('data: ')) continue;

          try {
            const chunk = JSON.parse(trimmed.slice(6)) as OpenAiStreamChunk;
            const choice = chunk.choices[0];
            if (!choice) continue;

            if (choice.delta.content) {
              yield { type: 'text_delta', data: choice.delta.content };
            }

            if (choice.finish_reason) {
              yield {
                type: 'done',
                data: '',
                metadata: { finishReason: choice.finish_reason },
              };
              return;
            }
          } catch {
            // WHY: 파싱 불가능한 SSE 라인은 무시 (keep-alive 등)
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
