/**
 * Layer2 부트스트래퍼 / Layer2 Bootstrapper
 *
 * @description
 * KR: TeamLeader와 모든 의존성을 생성하는 팩토리.
 *     AuthProvider와 Logger만으로 TeamLeader를 생성할 수 있도록
 *     모든 Layer2 컴포넌트를 인스턴스화한다.
 * EN: Factory that creates TeamLeader and all its dependencies.
 *     Instantiates all Layer2 components from just AuthProvider and Logger.
 */

import type { AuthProvider } from 'auth/types.js';
import type { Logger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { AgentGenerator } from 'layer2/agent-generator.js';
import { AgentSpawner } from 'layer2/agent-spawner.js';
import { BiasDetector } from 'layer2/bias-detector.js';
import { CleanEnvManager } from 'layer2/clean-env-manager.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';
import { FailureHandler } from 'layer2/failure-handler.js';
import { IntegrationTester } from 'layer2/integration-tester.js';
import { PhaseEngine } from 'layer2/phase-engine.js';
import { ProgressTracker } from 'layer2/progress-tracker.js';
import { SessionManager } from 'layer2/session-manager.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TeamLeaderDeps } from 'layer2/team-leader-types.js';
import { TeamLeader } from 'layer2/team-leader.js';
import { TokenMonitor } from 'layer2/token-monitor.js';
import { V2SessionExecutor } from 'layer2/v2-session-executor.js';
import { VerificationGate } from 'layer2/verification-gate.js';

// ── Layer2BootstrapOptions ──────────────────────────────────────

/**
 * Layer2 부트스트랩 옵션 / Layer2 bootstrap options
 */
export interface Layer2BootstrapOptions {
  /** 인증 공급자 / Authentication provider */
  readonly authProvider: AuthProvider;
  /** 로거 인스턴스 / Logger instance */
  readonly logger: Logger;
  /** 프로젝트 작업 디렉토리 / Project working directory */
  readonly projectCwd: string;
}

// ── Layer2Bootstrap ─────────────────────────────────────────────

/**
 * Layer2 부트스트래퍼 / Layer2 Bootstrapper
 *
 * @description
 * KR: TeamLeader 및 모든 Layer2 컴포넌트를 생성한다.
 *     의존성 주입 패턴으로 각 컴포넌트를 연결한다.
 * EN: Creates TeamLeader and all Layer2 components.
 *     Connects each component via dependency injection pattern.
 *
 * @example
 * const bootstrap = new Layer2Bootstrap({ authProvider, logger, projectCwd });
 * const teamLeader = bootstrap.createTeamLeader();
 * for await (const event of teamLeader.executeFeature('feat-1', handoff)) {
 *   console.log(event.content);
 * }
 */
export class Layer2Bootstrap {
  private readonly authProvider: AuthProvider;
  private readonly logger: Logger;
  private readonly projectCwd: string;

  /**
   * @param options - 부트스트랩 옵션 / Bootstrap options
   */
  constructor(options: Layer2BootstrapOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger;
    this.projectCwd = options.projectCwd;
  }

  /**
   * TeamLeader를 생성한다 / Create a TeamLeader instance
   *
   * @description
   * KR: 모든 Layer2 컴포넌트를 생성하고 TeamLeader에 주입한다.
   *     각 컴포넌트는 독립적으로 생성되어 TeamLeaderDeps로 묶인다.
   * EN: Creates all Layer2 components and injects them into TeamLeader.
   *     Each component is created independently and bundled as TeamLeaderDeps.
   *
   * @returns TeamLeader 인스턴스 / TeamLeader instance
   */
  createTeamLeader(): TeamLeader {
    const logger = this.logger;

    // 1. SDK executor: Anthropic Messages API 기반 에이전트 실행기
    const executor = new V2SessionExecutor({
      authProvider: this.authProvider,
      logger,
      defaultOptions: {
        model: 'claude-opus-4-6',
        maxTurns: 50,
        temperature: 1.0,
      },
    });

    // 2. 핵심 컴포넌트 (서로 독립적)
    const phaseEngine = new PhaseEngine(logger);
    const agentSpawner = new AgentSpawner(executor, logger);
    const sessionManager = new SessionManager(logger);
    const tokenMonitor = new TokenMonitor(this.authProvider, logger);
    const progressTracker = new ProgressTracker(logger);
    const agentGenerator = new AgentGenerator(logger);
    const coderAllocator = new CoderAllocator(logger);
    const streamMonitor = new StreamMonitor(logger);
    const biasDetector = new BiasDetector(logger);
    const failureHandler = new FailureHandler(logger);
    const verificationGate = new VerificationGate(logger);

    // 3. 통합 테스터: ProcessExecutor + CleanEnvManager 필요
    const processExecutor = new ProcessExecutor(logger);
    const cleanEnvManager = new CleanEnvManager(logger);
    const integrationTester = new IntegrationTester(logger, processExecutor, cleanEnvManager);

    // 4. 의존성 묶음 구성
    const deps: TeamLeaderDeps = {
      phaseEngine,
      agentSpawner,
      sessionManager,
      tokenMonitor,
      progressTracker,
      agentGenerator,
      coderAllocator,
      streamMonitor,
      biasDetector,
      failureHandler,
      verificationGate,
      integrationTester,
      logger,
    };

    return new TeamLeader(deps);
  }
}
