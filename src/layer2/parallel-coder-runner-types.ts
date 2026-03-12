/**
 * 병렬 Coder 실행기 타입 / Parallel Coder Runner Types
 *
 * @description
 * KR: ParallelCoderRunner에서 사용하는 인터페이스 및 타입 정의.
 * EN: Interface and type definitions used by ParallelCoderRunner.
 */

import type { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { AgentEvent } from 'layer2/types.js';

// ── 공개 타입 / Public types ──────────────────────────────────────

/**
 * Coder 단일 실행 결과 / Single coder run result
 *
 * @description
 * KR: 한 Coder의 실행 결과. 성공/실패 여부와 수집된 이벤트를 담는다.
 * EN: Result of a single coder execution. Holds success/failure and collected events.
 */
export interface CoderRunResult {
  /** Coder ID / Coder ID */
  readonly coderId: string;
  /** Git 브랜치 이름 / Git branch name */
  readonly branchName: string;
  /** 성공 여부 / Whether succeeded */
  readonly succeeded: boolean;
  /** 수집된 이벤트 목록 / Collected events */
  readonly events: readonly AgentEvent[];
  /** 에러 (실패 시) / Error (on failure) */
  readonly error?: AgentError;
}

/**
 * ParallelCoderRunner 의존성 / ParallelCoderRunner dependencies
 */
export interface ParallelCoderRunnerDeps {
  readonly agentGenerator: AgentGenerator;
  readonly agentSpawner: AgentSpawner;
  readonly sessionManager: SessionManager;
  readonly streamMonitor: StreamMonitor;
  readonly coderAllocator: CoderAllocator;
  readonly logger: Logger;
  /**
   * 동시 실행 최대 Coder 수 (스펙 §8.4 parallel_workers) / Max concurrent coders
   *
   * @description
   * KR: 미제공 시 할당된 모든 Coder를 한 번에 병렬 실행한다.
   * EN: If omitted, all allocated coders run concurrently at once.
   */
  readonly maxWorkers?: number;
}
