/**
 * 세션 복원 오케스트레이터 타입 / Session Restore Orchestrator Types
 *
 * @description
 * KR: SessionRestoreOrchestrator에서 사용하는 의존성 인터페이스와 상수를 정의한다.
 * EN: Defines dependency interfaces and constants used by SessionRestoreOrchestrator.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { RagSearcher } from 'rag/search.js';

// ── 기본 상수 / Default constants ────────────────────────────────

/** 세션 복원 시 사용할 기본 모델명 / Default model name for session restore */
export const DEFAULT_RESTORE_MODEL = 'claude-opus-4-6';

/** waitForReset 폴링 간격 (밀리초) / waitForReset polling interval in ms */
export const RESET_POLL_INTERVAL_MS = 5000;

// ── 의존성 인터페이스 / Dependency Interface ─────────────────────

/**
 * SessionRestoreOrchestrator 의존성 / SessionRestoreOrchestrator dependencies
 */
export interface SessionRestoreOrchestratorDeps {
  /** 세션 스냅샷 저장소 / Session snapshot store */
  readonly sessionSnapshotStore: SessionSnapshotStore;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** 인증 공급자 (선택) / Authentication provider (optional) */
  readonly authProvider?: AuthProvider;
  /** 토큰 모니터 (선택) / Token monitor (optional) */
  readonly tokenMonitor?: TokenMonitor;
  /** RAG 검색기 (선택, 세션 복원 실패 시 컨텍스트 fallback) / RAG searcher (optional, context fallback on restore failure) */
  readonly ragSearcher?: RagSearcher;
}
