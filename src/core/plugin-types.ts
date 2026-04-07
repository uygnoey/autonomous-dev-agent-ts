/**
 * Plugin SDK v2 타입 정의 / Plugin SDK v2 type definitions
 *
 * @description
 * KR: 서드파티 플러그인이 구현해야 하는 인터페이스와 manifest v2 스키마를 정의한다.
 *     플러그인은 lifecycle hooks를 통해 adev 파이프라인에 참여한다.
 * EN: Defines interfaces for third-party plugins and manifest v2 schema.
 *     Plugins participate in the adev pipeline via lifecycle hooks.
 */

import type { Logger } from 'core/logger.js';
import type { Phase } from 'core/types.js';

// ── Plugin Manifest v2 ─────────────────────────────────────────

/**
 * 플러그인 capability 선언 / Plugin capability declaration
 *
 * - mcp_server: MCP 서버를 제공하는 플러그인
 * - phase_hook: Phase 전환 시 훅을 실행하는 플러그인
 * - tool_provider: 커스텀 도구를 제공하는 플러그인
 * - agent_extension: 에이전트 동작을 확장하는 플러그인
 */
export type PluginCapability = 'mcp_server' | 'phase_hook' | 'tool_provider' | 'agent_extension';

/**
 * 플러그인 권한 선언 / Plugin permission declaration
 *
 * - fs_read: 파일 시스템 읽기
 * - fs_write: 파일 시스템 쓰기
 * - network: 네트워크 접근
 * - subprocess: 서브프로세스 실행
 * - rag_read: RAG 벡터 DB 읽기
 * - rag_write: RAG 벡터 DB 쓰기
 */
export type PluginPermission =
  | 'fs_read'
  | 'fs_write'
  | 'network'
  | 'subprocess'
  | 'rag_read'
  | 'rag_write';

/**
 * 플러그인 의존성 선언 / Plugin dependency declaration
 *
 * @param name - 의존하는 플러그인 이름 / Dependent plugin name
 * @param version - semver 범위 / Semver range (e.g., "^1.0.0")
 */
export interface PluginDependency {
  readonly name: string;
  readonly version: string;
}

/**
 * Plugin manifest v2 스키마 / Plugin manifest v2 schema
 *
 * @description
 * KR: v1 manifest를 확장하여 capabilities, permissions, dependencies를 추가한다.
 *     v1과 하위 호환을 유지하며, 새 필드는 모두 optional이다.
 * EN: Extends v1 manifest with capabilities, permissions, dependencies.
 *     Maintains backward compatibility with v1; all new fields are optional.
 *
 * @param name - 플러그인 고유 이름 / Unique plugin name
 * @param version - semver 버전 / Semver version
 * @param description - 설명 / Description
 * @param entryPoint - 진입점 파일 경로 / Entry point file path
 * @param capabilities - 플러그인이 제공하는 기능 / Plugin capabilities
 * @param permissions - 플러그인이 요청하는 권한 / Requested permissions
 * @param dependencies - 다른 플러그인 의존성 / Plugin dependencies
 * @param minAdevVersion - 최소 adev 버전 / Minimum adev version
 */
export interface PluginManifestV2 {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly entryPoint: string;
  readonly capabilities?: readonly PluginCapability[];
  readonly permissions?: readonly PluginPermission[];
  readonly dependencies?: readonly PluginDependency[];
  readonly minAdevVersion?: string;
}

// ── Plugin Context ──────────────────────────────────────────────

/**
 * 플러그인에 제공되는 읽기 전용 설정 / Read-only config provided to plugins
 */
export interface PluginConfigAccess {
  /** 프로젝트 루트 경로 / Project root path */
  readonly projectRoot: string;
  /** 현재 adev 버전 / Current adev version */
  readonly adevVersion: string;
  /** 플러그인 고유 설정 (manifest 외 사용자 설정) / Plugin-specific user config */
  readonly pluginConfig: Readonly<Record<string, unknown>>;
}

/**
 * 플러그인 컨텍스트 / Plugin context provided during lifecycle
 *
 * @description
 * KR: 플러그인이 adev 시스템과 안전하게 상호작용하기 위한 인터페이스.
 *     직접적인 내부 모듈 접근 대신 이 컨텍스트를 통해 제한된 기능을 노출한다.
 * EN: Interface for plugins to safely interact with the adev system.
 *     Exposes limited functionality instead of direct internal module access.
 *
 * @param logger - 플러그인 전용 로거 / Plugin-scoped logger
 * @param config - 읽기 전용 설정 접근 / Read-only config access
 * @param emitEvent - 커스텀 이벤트 발행 / Emit custom plugin events
 */
export interface PluginContext {
  readonly logger: Logger;
  readonly config: PluginConfigAccess;
  emitEvent(eventName: string, data?: Record<string, unknown>): void;
}

// ── Phase Change Info ───────────────────────────────────────────

/**
 * Phase 전환 정보 / Phase transition information
 *
 * @param from - 이전 Phase / Previous phase (null if first phase)
 * @param to - 다음 Phase / Next phase
 * @param featureId - 기능 ID / Feature identifier
 */
export interface PhaseChangeInfo {
  readonly from: Phase | null;
  readonly to: Phase;
  readonly featureId: string;
}

// ── AdevPlugin Interface ────────────────────────────────────────

/**
 * adev 플러그인 인터페이스 / adev plugin interface
 *
 * @description
 * KR: 서드파티 플러그인이 구현해야 하는 lifecycle hook 인터페이스.
 *     모든 메서드는 optional이며, 구현한 hook만 호출된다.
 * EN: Lifecycle hook interface for third-party plugins.
 *     All methods are optional; only implemented hooks are called.
 *
 * @example
 * const myPlugin: AdevPlugin = {
 *   onInit: async (ctx) => {
 *     ctx.logger.info('My plugin initialized');
 *   },
 *   onPhaseChange: async (ctx, info) => {
 *     if (info.to === 'TEST') {
 *       ctx.logger.info('Entering test phase');
 *     }
 *   },
 * };
 * export default myPlugin;
 */
export interface AdevPlugin {
  /** 플러그인 초기화 시 호출 / Called when plugin is loaded */
  onInit?(ctx: PluginContext): Promise<void>;

  /** Phase 전환 시 호출 / Called on phase transition */
  onPhaseChange?(ctx: PluginContext, info: PhaseChangeInfo): Promise<void>;

  /** 파이프라인 완료 시 호출 / Called when pipeline completes */
  onComplete?(ctx: PluginContext, result: PluginCompletionResult): Promise<void>;

  /** 플러그인 해제 시 호출 / Called when plugin is unloaded */
  onDestroy?(ctx: PluginContext): Promise<void>;
}

/**
 * 파이프라인 완료 결과 / Pipeline completion result
 *
 * @param success - 성공 여부 / Whether pipeline succeeded
 * @param featureId - 기능 ID / Feature identifier
 * @param phasesCompleted - 완료된 Phase 목록 / Completed phases
 * @param errorMessage - 실패 시 에러 메시지 / Error message on failure
 */
export interface PluginCompletionResult {
  readonly success: boolean;
  readonly featureId: string;
  readonly phasesCompleted: readonly Phase[];
  readonly errorMessage?: string;
}

// ── Loaded Plugin V2 ────────────────────────────────────────────

/**
 * 로드된 플러그인 v2 / Loaded plugin v2 with typed module
 *
 * @param manifest - v2 매니페스트 / V2 manifest
 * @param plugin - 플러그인 인스턴스 (AdevPlugin 구현) / Plugin instance
 * @param status - 현재 상태 / Current lifecycle status
 */
export interface LoadedPluginV2 {
  readonly manifest: PluginManifestV2;
  readonly plugin: AdevPlugin;
  status: PluginStatus;
}

/** 플러그인 라이프사이클 상태 / Plugin lifecycle status */
export type PluginStatus = 'loaded' | 'initialized' | 'error' | 'destroyed';
