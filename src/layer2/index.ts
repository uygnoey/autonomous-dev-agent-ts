/**
 * layer2 (2계층) public API / Layer 2 public exports
 *
 * @description
 * KR: 자율 개발 오케스트레이션 모듈의 공개 API를 re-export한다.
 * EN: Re-exports the public API of the autonomous development orchestration module.
 */

// ── 구현 클래스 / Implementation classes ────────────────────────

export { AgentGenerator } from 'layer2/agent-generator.js';
export { AgentSpawner } from 'layer2/agent-spawner.js';
export { BiasDetector } from 'layer2/bias-detector.js';
export { CleanEnvManager } from 'layer2/clean-env-manager.js';
export { CoderAllocator } from 'layer2/coder-allocator.js';
export { FailureHandler } from 'layer2/failure-handler.js';
export { HandoffReceiver } from 'layer2/handoff-receiver.js';
export { IntegrationTester } from 'layer2/integration-tester.js';
export { PhaseEngine } from 'layer2/phase-engine.js';
export { ProgressTracker } from 'layer2/progress-tracker.js';
export { SessionManager } from 'layer2/session-manager.js';
export { StreamMonitor } from 'layer2/stream-monitor.js';
export { TeamLeader } from 'layer2/team-leader.js';
export { TokenMonitor } from 'layer2/token-monitor.js';
export { UserCheckpoint } from 'layer2/user-checkpoint.js';
export { V2SessionExecutor } from 'layer2/v2-session-executor.js';
export { VerificationGate } from 'layer2/verification-gate.js';

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
  TestScope,
  PhaseTransition,
  RecoveryAction,
  SessionFilter,
  SessionSnapshot,
  SessionState,
  VerificationPhase,
  VerificationResult,
} from 'layer2/types.js';

export type { TeamLeaderDeps } from 'layer2/team-leader.js';
export type { CheckpointData, UserDecision } from 'layer2/user-checkpoint.js';
export type { V2SessionExecutorOptions } from 'layer2/v2-session-executor.js';
