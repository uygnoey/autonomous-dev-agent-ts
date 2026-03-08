/**
 * layer2 세션/기능 진행 타입 정의 / Layer 2 session and feature progress type definitions
 *
 * @description
 * KR: 세션 스냅샷, 기능 진행, Coder 할당, 세션 필터 관련 타입.
 * EN: Types for session snapshots, feature progress, coder allocation, and session filters.
 */

import type { AgentName, FeatureStatus, Phase } from 'core/types.js';
import type { VerificationResult } from 'layer2/phase-types.js';

// ── 세션 스냅샷 / Session Snapshot ──────────────────────────────

/**
 * 세션 상태 / Session state
 */
export type SessionState = 'active' | 'paused' | 'completed' | 'failed';

/**
 * 세션 스냅샷 — 영속화용 / Session snapshot for persistence
 *
 * @description
 * KR: 에이전트 세션의 현재 상태를 스냅샷으로 저장한다.
 * EN: Captures the current state of an agent session for persistence.
 */
export interface SessionSnapshot {
  /** 세션 고유 ID / Session unique ID */
  readonly sessionId: string;
  /** 에이전트 이름 / Agent name */
  readonly agentName: AgentName;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 현재 Phase / Current phase */
  readonly phase: Phase;
  /** 세션 상태 / Session state */
  readonly state: SessionState;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
  /** 최종 활동 시각 / Last activity */
  readonly lastActivity: Date;
  /** 추가 메타데이터 / Additional metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── 기능 진행 상태 / Feature Progress ────────────────────────────

/**
 * 기능별 진행 상태 추적 / Per-feature progress tracking
 *
 * @description
 * KR: 기능 하나의 진행 상태, 완료된 Phase, 검증 결과를 추적한다.
 * EN: Tracks progress, completed phases, and verification results for a single feature.
 */
export interface FeatureProgress {
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 현재 상태 / Current status */
  readonly status: FeatureStatus;
  /** 현재 Phase / Current phase */
  readonly currentPhase: Phase;
  /** 완료된 Phase 목록 / Completed phases */
  readonly completedPhases: readonly Phase[];
  /** 검증 결과 목록 / Verification results */
  readonly verificationResults: readonly VerificationResult[];
  /** 시작 시각 / Started at */
  readonly startedAt: Date;
  /** 최종 갱신 시각 / Updated at */
  readonly updatedAt: Date;
}

// ── Coder 할당 / Coder Allocation ────────────────────────────────

/**
 * Coder 할당 상태 / Coder allocation status
 */
export type CoderAllocationStatus = 'assigned' | 'working' | 'completed' | 'merged';

/**
 * Coder 할당 정보 / Coder allocation information
 *
 * @description
 * KR: 모듈별 Coder 배정 및 브랜치 정보를 담는다.
 * EN: Holds per-module coder assignment and branch information.
 */
export interface CoderAllocation {
  /** Coder ID / Coder ID */
  readonly coderId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 담당 모듈 목록 / Assigned modules */
  readonly modules: readonly string[];
  /** Git 브랜치 이름 / Git branch name */
  readonly branchName: string;
  /** 할당 상태 / Allocation status */
  readonly status: CoderAllocationStatus;
}

// ── 세션 필터 / Session Filter ───────────────────────────────────

/**
 * 세션 목록 필터 / Session list filter
 *
 * @description
 * KR: 세션 조회 시 사용하는 필터 조건.
 * EN: Filter conditions for session listing.
 */
export interface SessionFilter {
  /** 프로젝트 ID 필터 / Project ID filter */
  readonly projectId?: string;
  /** 기능 ID 필터 / Feature ID filter */
  readonly featureId?: string;
  /** Phase 필터 / Phase filter */
  readonly phase?: Phase;
  /** 상태 필터 / State filter */
  readonly state?: SessionState;
}
