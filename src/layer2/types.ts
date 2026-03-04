/**
 * layer2 (2계층) 타입 정의 / Layer 2 type definitions
 *
 * @description
 * KR: 자율 개발 오케스트레이션에 사용되는 타입.
 *     4-Phase FSM, 에이전트 스폰, 세션 관리, 토큰 모니터링, 검증 게이트 등.
 * EN: Types for autonomous development orchestration.
 *     4-Phase FSM, agent spawning, session management, token monitoring, verification gates.
 */

import type { AgentName, FeatureStatus, Phase } from '../core/types.js';

// ── 에이전트 설정 / Agent Configuration ─────────────────────────

/**
 * 에이전트 스폰 설정 / Agent spawn configuration
 *
 * @description
 * KR: 에이전트를 생성할 때 필요한 모든 설정을 담는다.
 * EN: Holds all configuration needed to spawn an agent.
 */
export interface AgentConfig {
  /** 에이전트 이름 / Agent name */
  readonly name: AgentName;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 현재 Phase / Current phase */
  readonly phase: Phase;
  /** 시스템 프롬프트 / System prompt */
  readonly systemPrompt: string;
  /** 실행 프롬프트 / Execution prompt */
  readonly prompt: string;
  /** 사용 가능한 도구 목록 / Available tool names */
  readonly tools: readonly string[];
  /** 최대 턴 수 (선택) / Max turns (optional) */
  readonly maxTurns?: number;
  /** 환경변수 오버라이드 (선택) / Environment variable overrides (optional) */
  readonly env?: Readonly<Record<string, string>>;
}

// ── 에이전트 이벤트 / Agent Events ──────────────────────────────

/**
 * 에이전트 이벤트 유형 / Agent event type
 *
 * @description
 * KR: 에이전트 실행 중 발생하는 이벤트의 종류.
 * EN: Types of events emitted during agent execution.
 */
export type AgentEventType = 'message' | 'tool_use' | 'tool_result' | 'error' | 'done';

/**
 * 에이전트 실행 이벤트 / Agent execution event (yielded from executor)
 *
 * @description
 * KR: 에이전트 실행기에서 yield되는 단일 이벤트.
 * EN: A single event yielded from the agent executor.
 */
export interface AgentEvent {
  /** 이벤트 유형 / Event type */
  readonly type: AgentEventType;
  /** 이벤트를 발생시킨 에이전트 / Agent that emitted this event */
  readonly agentName: AgentName;
  /** 이벤트 내용 / Event content */
  readonly content: string;
  /** 이벤트 타임스탬프 / Event timestamp */
  readonly timestamp: Date;
  /** 추가 메타데이터 (선택) / Additional metadata (optional) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Phase 전환 / Phase Transition ───────────────────────────────

/**
 * Phase 전환 기록 / Phase transition record
 *
 * @description
 * KR: 하나의 Phase 전환 이벤트를 기록한다.
 * EN: Records a single phase transition event.
 */
export interface PhaseTransition {
  /** 전환 전 Phase / Previous phase */
  readonly from: Phase;
  /** 전환 후 Phase / Next phase */
  readonly to: Phase;
  /** 전환 사유 / Transition reason */
  readonly reason: string;
  /** 전환 트리거 주체 / Triggered by */
  readonly triggeredBy: AgentName | 'adev';
  /** 전환 시각 / Transition timestamp */
  readonly timestamp: Date;
}

// ── 검증 결과 / Verification Result ──────────────────────────────

/**
 * 검증 Phase 유형 / Verification phase type
 *
 * @description
 * KR: 4중 검증의 각 단계를 나타낸다 (qa_qc → reviewer → layer1 → adev).
 * EN: Represents each stage of 4-layer verification.
 */
export type VerificationPhase = 'qa_qc' | 'reviewer' | 'layer1' | 'adev';

/**
 * 단일 검증 결과 / Single verification result
 *
 * @description
 * KR: 4중 검증의 한 단계 결과를 담는다.
 * EN: Holds the result of one verification stage.
 */
export interface VerificationResult {
  /** 대상 기능 ID / Target feature ID */
  readonly featureId: string;
  /** 검증 Phase / Verification phase */
  readonly phase: VerificationPhase;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 피드백 내용 / Feedback content */
  readonly feedback: string;
  /** 검증 시각 / Verification timestamp */
  readonly timestamp: Date;
}

// ── 에이전트 실행기 인터페이스 / Agent Executor Interface ────────

/**
 * 에이전트 실행기 추상화 / Agent executor abstraction (over Claude Agent SDK)
 *
 * @description
 * KR: Claude Agent SDK에 대한 추상화. 구현체는 SDK 설치 후 교체 가능.
 * EN: Abstraction over Claude Agent SDK. Implementations are swappable after SDK install.
 */
export interface AgentExecutor {
  /**
   * 에이전트를 실행한다 / Execute an agent
   *
   * @param config - 에이전트 설정 / Agent configuration
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  execute(config: AgentConfig): AsyncIterable<AgentEvent>;

  /**
   * 이전 세션을 재개한다 / Resume a previous session
   *
   * @param sessionId - 재개할 세션 ID / Session ID to resume
   * @returns 에이전트 이벤트 스트림 / Agent event stream
   */
  resume(sessionId: string): AsyncIterable<AgentEvent>;
}

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

// ── 실패 분류 / Failure Classification ───────────────────────────

/**
 * 실패 유형 / Failure type
 *
 * @description
 * KR: 실패의 근본 원인을 분류하는 유형.
 * EN: Classification of failure root cause.
 */
export type FailureType =
  | 'design_flaw'
  | 'implementation_bug'
  | 'test_gap'
  | 'spec_ambiguity'
  | 'infrastructure'
  | 'unknown';

/**
 * 복구 동작 / Recovery action
 */
export type RecoveryAction = 'retry' | 'rollback_phase' | 'escalate_user';

/**
 * 실패 보고서 / Failure report
 *
 * @description
 * KR: 실패 원인, 유형, 복구 방안을 포함하는 보고서.
 * EN: Report containing failure cause, type, and recovery suggestion.
 */
export interface FailureReport {
  /** 보고서 ID / Report ID */
  readonly id: string;
  /** 기능 ID / Feature ID */
  readonly featureId: string;
  /** 실패 발생 Phase / Phase where failure occurred */
  readonly phase: Phase;
  /** 실패 유형 / Failure type */
  readonly type: FailureType;
  /** 실패 설명 / Failure description */
  readonly description: string;
  /** 근본 원인 / Root cause */
  readonly rootCause: string;
  /** 권장 복구 동작 / Suggested recovery action */
  readonly suggestedAction: RecoveryAction;
  /** 복구 대상 Phase / Target phase for recovery */
  readonly targetPhase: Phase;
  /** 보고 시각 / Report timestamp */
  readonly timestamp: Date;
}

// ── 편향 감지 / Bias Detection ──────────────────────────────────

/**
 * 편향 유형 / Bias type
 *
 * @description
 * KR: 에이전트의 비정상 동작 패턴 유형.
 * EN: Types of anomalous agent behavior patterns.
 */
export type BiasType = 'confirmation_bias' | 'infinite_loop' | 'deadlock' | 'scope_creep';

/**
 * 편향 심각도 / Bias severity
 */
export type BiasSeverity = 'low' | 'medium' | 'high';

/**
 * 편향 알림 / Bias alert
 *
 * @description
 * KR: 감지된 편향/이상 동작에 대한 알림.
 * EN: Alert for detected bias or anomalous behavior.
 */
export interface BiasAlert {
  /** 편향 유형 / Bias type */
  readonly type: BiasType;
  /** 해당 에이전트 / Affected agent */
  readonly agentName: AgentName;
  /** 설명 / Description */
  readonly description: string;
  /** 증거 / Evidence */
  readonly evidence: string;
  /** 심각도 / Severity */
  readonly severity: BiasSeverity;
  /** 감지 시각 / Detection timestamp */
  readonly timestamp: Date;
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

// ── 스트림 모니터링 훅 / Stream Monitoring Hooks ─────────────────

/**
 * 훅 이벤트 유형 / Hook event type
 *
 * @description
 * KR: 에이전트 스트림 감시에서 발생하는 이벤트 유형.
 * EN: Types of events from agent stream monitoring.
 */
export type HookEventType = 'PreToolUse' | 'PostToolUse' | 'TeammateIdle';

/**
 * 훅 이벤트 / Hook event
 *
 * @description
 * KR: 에이전트 스트림에서 감지한 단일 훅 이벤트.
 * EN: A single hook event detected from an agent stream.
 */
export interface HookEvent {
  /** 이벤트 유형 / Event type */
  readonly type: HookEventType;
  /** 해당 에이전트 / Associated agent */
  readonly agentName: AgentName;
  /** 도구 이름 (선택) / Tool name (optional) */
  readonly toolName?: string;
  /** 이벤트 데이터 / Event data */
  readonly data: Readonly<Record<string, unknown>>;
  /** 이벤트 시각 / Event timestamp */
  readonly timestamp: Date;
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

// ── 통합 테스트 결과 / Integration Test Result ───────────────────

/**
 * 통합 테스트 단계별 결과 / Integration test step result
 *
 * @description
 * KR: 4단계 통합 테스트 중 한 단계의 결과.
 * EN: Result of one step in the 4-step integration test.
 */
export interface IntegrationStepResult {
  /** 단계 번호 (1~4) / Step number (1~4) */
  readonly step: number;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 실패 수 / Fail count */
  readonly failCount: number;
}
