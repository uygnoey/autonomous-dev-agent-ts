/**
 * LLM Provider 레지스트리 / LLM Provider Registry
 *
 * @description
 * KR: LlmProvider 구현체를 등록하고 이름으로 조회하는 레지스트리.
 *     Factory 패턴으로 provider 인스턴스를 지연 생성한다.
 * EN: Registry for registering and resolving LlmProvider implementations by name.
 *     Uses factory pattern for lazy provider instantiation.
 */

import { AdevError } from 'core/errors.js';
import type { LlmProvider } from 'core/llm-provider.js';
import type { Logger } from 'core/logger.js';
import { type Result, err, ok } from 'core/types.js';

// ── Provider 팩토리 타입 / Provider Factory Type ─────────────────

/**
 * LlmProvider 팩토리 함수 타입 / LlmProvider factory function type
 *
 * @description
 * KR: 설정을 받아 LlmProvider 인스턴스를 생성하는 팩토리.
 * EN: Factory that creates an LlmProvider instance from configuration.
 */
export type LlmProviderFactory = (config: Record<string, unknown>) => LlmProvider;

// ── LLM Registry 인터페이스 / LLM Registry Interface ─────────────

/**
 * LLM Provider 레지스트리 인터페이스 / LLM Provider Registry interface
 *
 * @description
 * KR: provider 등록, 조회, 목록 조회를 추상화한다.
 * EN: Abstracts provider registration, resolution, and listing.
 */
export interface ILlmRegistry {
  /**
   * Provider 팩토리를 등록한다 / Register a provider factory
   *
   * @param name - 제공자 이름 / Provider name (e.g., 'claude', 'openai')
   * @param factory - 팩토리 함수 / Factory function
   */
  register(name: string, factory: LlmProviderFactory): void;

  /**
   * 이름으로 provider를 생성/반환한다 / Resolve a provider by name
   *
   * @param name - 제공자 이름 / Provider name
   * @param config - 설정 (선택) / Configuration (optional)
   * @returns LlmProvider Result / LlmProvider Result
   */
  resolve(name: string, config?: Record<string, unknown>): Result<LlmProvider>;

  /**
   * 등록된 provider 이름 목록을 반환한다 / Returns registered provider names
   *
   * @returns 등록된 이름 배열 / Array of registered names
   */
  listProviders(): readonly string[];

  /**
   * provider가 등록되어 있는지 확인한다 / Check if a provider is registered
   *
   * @param name - 제공자 이름 / Provider name
   * @returns 등록 여부 / Whether registered
   */
  has(name: string): boolean;
}

// ── LLM Registry 구현 / LLM Registry Implementation ─────────────

/**
 * LLM Provider 레지스트리 구현 / LLM Provider Registry implementation
 *
 * @description
 * KR: 팩토리를 Map에 저장하고, resolve 시 인스턴스를 캐싱한다.
 *     동일 이름 + 동일 설정이면 기존 인스턴스를 재사용한다.
 * EN: Stores factories in a Map and caches instances on resolve.
 *     Reuses existing instances for the same name + config combination.
 */
export class LlmRegistry implements ILlmRegistry {
  private readonly factories: Map<string, LlmProviderFactory> = new Map();
  private readonly instances: Map<string, LlmProvider> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'LlmRegistry' });
  }

  /**
   * Provider 팩토리를 등록한다 / Register a provider factory
   *
   * @param name - 제공자 이름 / Provider name
   * @param factory - 팩토리 함수 / Factory function
   */
  register(name: string, factory: LlmProviderFactory): void {
    this.logger.debug('Registering LLM provider', { name });
    this.factories.set(name, factory);
    // WHY: 팩토리가 변경되면 캐시된 인스턴스를 무효화해야 함
    this.instances.delete(name);
  }

  /**
   * 이름으로 provider를 생성/반환한다 / Resolve a provider by name
   *
   * @param name - 제공자 이름 / Provider name
   * @param config - 설정 (선택) / Configuration (optional)
   * @returns LlmProvider Result / LlmProvider Result
   */
  resolve(name: string, config?: Record<string, unknown>): Result<LlmProvider> {
    // WHY: config가 없으면 캐시된 인스턴스 반환 (동일 설정 보장)
    if (!config) {
      const cached = this.instances.get(name);
      if (cached) {
        return ok(cached);
      }
    }

    const factory = this.factories.get(name);
    if (!factory) {
      return err(
        new AdevError(
          'llm_provider_not_found',
          `LLM provider '${name}' is not registered. Available: ${[...this.factories.keys()].join(', ')}`,
        ),
      );
    }

    try {
      const provider = factory(config ?? {});
      // WHY: config 없는 기본 resolve만 캐싱 (config 있으면 매번 새로 생성)
      if (!config) {
        this.instances.set(name, provider);
      }
      this.logger.info('LLM provider resolved', { name, providerName: provider.name });
      return ok(provider);
    } catch (error) {
      return err(
        new AdevError(
          'llm_provider_creation_failed',
          `Failed to create LLM provider '${name}': ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 등록된 provider 이름 목록을 반환한다 / Returns registered provider names
   *
   * @returns 등록된 이름 배열 / Array of registered names
   */
  listProviders(): readonly string[] {
    return [...this.factories.keys()];
  }

  /**
   * provider가 등록되어 있는지 확인한다 / Check if a provider is registered
   *
   * @param name - 제공자 이름 / Provider name
   * @returns 등록 여부 / Whether registered
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }
}
