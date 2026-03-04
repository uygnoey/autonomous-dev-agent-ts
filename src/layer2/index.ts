/**
 * layer2 (2계층) public API / Layer 2 public exports
 *
 * @description
 * KR: 자율 개발 오케스트레이션 모듈의 공개 API를 re-export한다.
 * EN: Re-exports the public API of the autonomous development orchestration module.
 */

// ── 구현 클래스 / Implementation classes ────────────────────────

export { AgentGenerator } from './agent-generator.js';
export { AgentSpawner } from './agent-spawner.js';
export { BiasDetector } from './bias-detector.js';
export { CleanEnvManager } from './clean-env-manager.js';
export { CoderAllocator } from './coder-allocator.js';
export { FailureHandler } from './failure-handler.js';
export { HandoffReceiver } from './handoff-receiver.js';
export { IntegrationTester } from './integration-tester.js';
export { PhaseEngine } from './phase-engine.js';
export { ProgressTracker } from './progress-tracker.js';
export { SessionManager } from './session-manager.js';
export { StreamMonitor } from './stream-monitor.js';
export { TeamLeader } from './team-leader.js';
export { TokenMonitor } from './token-monitor.js';
export { UserCheckpoint } from './user-checkpoint.js';
export { V2SessionExecutor } from './v2-session-executor.js';
export { VerificationGate } from './verification-gate.js';

// ── 타입 / Types ────────────────────────────────────────────────

export type {
  AgentConfig,
  AgentEvent,
  AgentEventType,
  AgentExecutor,
  BiasAlert,
  BiasSeverity,
  BiasType,
  CoderAllocation,
  CoderAllocationStatus,
  FailureReport,
  FailureType,
  FeatureProgress,
  HookEvent,
  HookEventType,
  IntegrationStepResult,
  PhaseTransition,
  RecoveryAction,
  SessionFilter,
  SessionSnapshot,
  SessionState,
  VerificationPhase,
  VerificationResult,
} from './types.js';

export type { TeamLeaderDeps } from './team-leader.js';
export type { CheckpointData, UserDecision } from './user-checkpoint.js';
export type { V2SessionExecutorOptions } from './v2-session-executor.js';
