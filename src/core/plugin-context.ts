/**
 * Plugin Context 구현 / Plugin context implementation
 *
 * @description
 * KR: 플러그인에 제공되는 안전한 컨텍스트를 생성한다.
 *     플러그인별 로거, 설정 접근, 이벤트 발행 기능을 제공한다.
 * EN: Creates a safe context provided to plugins.
 *     Provides plugin-scoped logger, config access, and event emission.
 */

import type { Logger } from 'core/logger.js';
import type { PluginConfigAccess, PluginContext, PluginManifestV2 } from 'core/plugin-types.js';

// ── 이벤트 리스너 타입 ──────────────────────────────────────────

/** 플러그인 이벤트 리스너 / Plugin event listener */
export type PluginEventListener = (
  pluginName: string,
  eventName: string,
  data?: Record<string, unknown>,
) => void;

// ── DefaultPluginContext ────────────────────────────────────────

/**
 * 기본 PluginContext 구현 / Default PluginContext implementation
 *
 * @description
 * KR: 플러그인별 격리된 컨텍스트를 생성한다.
 *     로거는 플러그인 이름으로 child를 생성하여 로그 출처를 명확히 한다.
 * EN: Creates an isolated context per plugin.
 *     Logger is created as a child with plugin name for clear log attribution.
 *
 * @param manifest - 플러그인 매니페스트 / Plugin manifest
 * @param parentLogger - 부모 로거 / Parent logger
 * @param configAccess - 설정 접근 / Config access
 * @param eventListener - 이벤트 리스너 (선택) / Event listener (optional)
 *
 * @example
 * const ctx = new DefaultPluginContext(manifest, logger, configAccess);
 * ctx.emitEvent('my_event', { key: 'value' });
 */
export class DefaultPluginContext implements PluginContext {
  readonly logger: Logger;
  readonly config: PluginConfigAccess;
  private readonly pluginName: string;
  private readonly eventListener: PluginEventListener | undefined;

  constructor(
    manifest: PluginManifestV2,
    parentLogger: Logger,
    configAccess: PluginConfigAccess,
    eventListener?: PluginEventListener,
  ) {
    this.pluginName = manifest.name;
    this.logger = parentLogger.child({ plugin: manifest.name });
    this.config = configAccess;
    this.eventListener = eventListener;
  }

  /**
   * 커스텀 플러그인 이벤트를 발행한다 / Emit a custom plugin event
   *
   * @param eventName - 이벤트 이름 / Event name
   * @param data - 이벤트 데이터 / Event data
   */
  emitEvent(eventName: string, data?: Record<string, unknown>): void {
    this.logger.debug('플러그인 이벤트 발행', { event: eventName, data });
    if (this.eventListener) {
      this.eventListener(this.pluginName, eventName, data);
    }
  }
}
