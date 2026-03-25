/**
 * layer2 Phase 전환/검증/실패/편향/훅 타입 정의 / Layer 2 phase transition, verification, failure, bias, hook type definitions
 *
 * @description
 * KR: Phase 전환, 검증 결과, 실패 분류, 편향 감지, 훅 이벤트, 통합 테스트 결과 관련 타입.
 * EN: Types for phase transitions, verification results, failure classification, bias detection, hook events, and integration test results.
 */

import type { AgentName, Phase } from 'core/types.js';

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
export type BiasType =
  | 'confirmation_bias'
  | 'infinite_loop'
  | 'deadlock'
  | 'scope_creep'
  | 'feedback_ignored';

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

// ── 통합 테스트 결과 / Integration Test Result ───────────────────

/**
 * 통합 테스트 단계별 결과 / Integration test step result
 *
 * @description
 * KR: 4단계 통합 테스트 중 한 단계의 결과.
 * EN: Result of one step in the 4-step integration test.
 */
/**
 * 테스트 범위 / Test scope
 *
 * @description
 * KR: 계단식 통합 테스트의 범위 분류.
 * EN: Scope classification for staircase integration tests.
 */
export type TestScope = 'modified' | 'related' | 'unrelated' | 'full';

export interface IntegrationStepResult {
  /** 단계 번호 (1~4) / Step number (1~4) */
  readonly step: number;
  /** 테스트 범위 / Test scope */
  readonly scope: TestScope;
  /** 목표 테스트 수 / Target test count */
  readonly targetCount: number;
  /** 실제 실행된 테스트 수 / Actual tests executed */
  readonly executedCount: number;
  /** 통과 여부 / Whether passed */
  readonly passed: boolean;
  /** 실패 수 / Fail count */
  readonly failCount: number;
}
