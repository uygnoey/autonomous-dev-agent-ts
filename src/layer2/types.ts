/**
 * layer2 (2계층) 타입 정의 — 재내보내기 배럴 / Layer 2 type definitions — re-export barrel
 *
 * @description
 * KR: 하위 타입 모듈을 통합하여 단일 진입점을 제공한다.
 * EN: Aggregates sub-type modules to provide a single entry point.
 */

export type {
  AgentConfig,
  AgentEvent,
  AgentEventType,
  AgentExecutor,
} from 'layer2/agent-types.js';

export type {
  PhaseTransition,
  VerificationPhase,
  VerificationResult,
  FailureType,
  RecoveryAction,
  FailureReport,
  BiasType,
  BiasSeverity,
  BiasAlert,
  HookEventType,
  HookEvent,
  TestScope,
  IntegrationStepResult,
} from 'layer2/phase-types.js';

export type {
  SessionState,
  SessionSnapshot,
  FeatureProgress,
  CoderAllocationStatus,
  CoderAllocation,
  SessionFilter,
} from 'layer2/session-types.js';

export type {
  IpcEventType,
  TeamMessageEvent,
  TaskUpdateEvent,
  IpcEvent,
  IpcPollerCallback,
  IpcPollerOptions,
} from 'layer2/ipc-poller-types.js';

export type {
  PersistableSessionSnapshot,
  FlatSessionSnapshot,
} from 'layer2/session-snapshot-store-types.js';
