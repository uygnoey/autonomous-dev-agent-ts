/**
 * 팀 리더 타입 정의 / Team Leader type definitions
 *
 * @description
 * KR: TeamLeader 생성자 주입에 사용되는 의존성 인터페이스.
 * EN: Dependency interface for TeamLeader constructor injection.
 */

import type { Logger } from 'core/logger.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { BiasDetector } from 'layer2/bias-detector.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { FailureHandler } from 'layer2/failure-handler.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { VerificationGate } from 'layer2/verification-gate.js';

/**
 * 팀 리더 의존성 / Team Leader dependencies
 *
 * @description
 * KR: 생성자 주입을 위한 의존성 인터페이스.
 * EN: Dependency interface for constructor injection.
 */
export interface TeamLeaderDeps {
  readonly phaseEngine: PhaseEngine;
  readonly agentSpawner: AgentSpawner;
  readonly sessionManager: SessionManager;
  readonly tokenMonitor: TokenMonitor;
  readonly progressTracker: ProgressTracker;
  readonly agentGenerator: AgentGenerator;
  readonly coderAllocator: CoderAllocator;
  readonly streamMonitor: StreamMonitor;
  readonly biasDetector: BiasDetector;
  readonly failureHandler: FailureHandler;
  readonly verificationGate: VerificationGate;
  readonly integrationTester: IntegrationTester;
  readonly logger: Logger;
}
