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

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AuthProvider } from 'auth/types.js';
import type { TestingConfig } from 'core/config-schema.js';
import type { Logger } from 'core/logger.js';
import { ProcessExecutor } from 'core/process-executor.js';
import { AgentGenerator } from 'layer2/agent-generator.js';
import { AgentSpawner } from 'layer2/agent-spawner.js';
import { BiasDetector } from 'layer2/bias-detector.js';
import { CleanEnvManager } from 'layer2/clean-env-manager.js';
import { CoderAllocator } from 'layer2/coder-allocator.js';
import { FailureHandler } from 'layer2/failure-handler.js';
import { GitBranchManager } from 'layer2/git-branch-manager.js';
import { IntegrationTester } from 'layer2/integration-tester.js';
import { IpcPoller } from 'layer2/ipc-poller.js';
import { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import { PhaseEngine } from 'layer2/phase-engine.js';
import { ProgressTracker } from 'layer2/progress-tracker.js';
import { SessionManager } from 'layer2/session-manager.js';
import { SessionRestoreOrchestrator } from 'layer2/session-restore-orchestrator.js';
import { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TeamLeaderDeps } from 'layer2/team-leader-types.js';
import { TeamLeader } from 'layer2/team-leader.js';
import { TokenMonitor } from 'layer2/token-monitor.js';
import { V2SessionExecutor } from 'layer2/v2-session-executor.js';
import { VerificationGate } from 'layer2/verification-gate.js';
import { resolveParallelWorkers } from 'layer2/worker-resolver.js';

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
  /**
   * 테스트 수량 설정 (스펙 §8.4) / Testing configuration (spec §8.4)
   *
   * @description
   * KR: 미제공 시 IntegrationTester 기본값, parallelWorkers 'auto' 산출값 사용.
   * EN: If omitted, IntegrationTester defaults apply; parallelWorkers resolved as 'auto'.
   */
  readonly testing?: TestingConfig;
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
 * const teamLeader = await bootstrap.createTeamLeader();
 * for await (const event of teamLeader.executeFeature('feat-1', handoff)) {
 *   process.stdout.write(event.content + '\n');
 * }
 */
export class Layer2Bootstrap {
  private readonly authProvider: AuthProvider;
  private readonly logger: Logger;
  private readonly projectCwd: string;
  private readonly testing: TestingConfig | undefined;

  /**
   * @param options - 부트스트랩 옵션 / Bootstrap options
   */
  constructor(options: Layer2BootstrapOptions) {
    this.authProvider = options.authProvider;
    this.logger = options.logger;
    this.projectCwd = options.projectCwd;
    this.testing = options.testing;
  }

  /**
   * TeamLeader를 생성한다 / Create a TeamLeader instance
   *
   * @description
   * KR: 모든 Layer2 컴포넌트를 생성하고 TeamLeader에 주입한다.
   *     SessionSnapshotStore.initialize()가 async이므로 이 메서드도 async.
   *     초기화 실패 시 경고만 남기고 store 없이 TeamLeader를 생성한다.
   * EN: Creates all Layer2 components and injects them into TeamLeader.
   *     async because SessionSnapshotStore.initialize() is async.
   *     On init failure, warns and creates TeamLeader without the store.
   *
   * @returns TeamLeader 인스턴스 / TeamLeader instance
   */
  async createTeamLeader(): Promise<TeamLeader> {
    const logger = this.logger;

    // 1. SDK executor: Anthropic Messages API 기반 에이전트 실행기
    const executor = new V2SessionExecutor({
      authProvider: this.authProvider,
      logger,
      defaultOptions: {
        model: 'claude-opus-4-6',
        maxTurns: 50,
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
    // WHY: testing 설정 주입 — TestingConfig 기반 동적 단계 수량 적용 (스펙 §8.4)
    const integrationTester = new IntegrationTester(
      logger,
      processExecutor,
      cleanEnvManager,
      this.testing,
    );

    // 4. 세션 스냅샷 저장소 초기화 (Batch 1 신규 컴포넌트)
    // WHY: LanceDB dbPath는 ~/.adev/data/snapshots 를 사용
    const snapshotDbPath = join(homedir(), '.adev', 'data', 'snapshots');
    const sessionSnapshotStore = new SessionSnapshotStore(snapshotDbPath, logger);
    const initResult = await sessionSnapshotStore.initialize();
    if (!initResult.ok) {
      logger.warn('SessionSnapshotStore 초기화 실패 — 세션 복원 기능 비활성화', {
        error: initResult.error.message,
      });
    }

    // 5. 세션 복원 오케스트레이터 (Batch 1 신규 컴포넌트)
    const sessionRestoreOrchestrator = new SessionRestoreOrchestrator({
      sessionSnapshotStore,
      logger,
      authProvider: this.authProvider,
    });

    // 6. 디스크 IPC 폴러 (Batch 1 신규 컴포넌트)
    // WHY: 팀 메시지/태스크 이벤트를 폴링하기 위해 ~/.claude/teams, ~/.claude/tasks 감시
    const ipcPoller = new IpcPoller({
      teamsDir: join(homedir(), '.claude', 'teams'),
      tasksDir: join(homedir(), '.claude', 'tasks'),
      logger,
    });

    // 7. 병렬 Coder 실행기 (Batch 2 신규 컴포넌트)
    // WHY: CODE phase에서 다수 Coder를 병렬로 실행하여 구현 속도를 높인다
    // WHY: parallel_workers 설정 해석 — 'auto'면 CPU/메모리 기반 자동 산출 (스펙 §8.4)
    const maxWorkers = resolveParallelWorkers(this.testing?.parallelWorkers ?? 'auto', logger);
    const parallelCoderRunner = new ParallelCoderRunner({
      agentGenerator,
      agentSpawner,
      sessionManager,
      streamMonitor,
      coderAllocator,
      logger,
      maxWorkers,
    });

    // 8. Git 브랜치 관리자 (Batch 2 신규 컴포넌트)
    // WHY: Coder별 피처 브랜치를 생성하고 병렬 실행 완료 후 main에 병합한다
    const gitBranchManager = new GitBranchManager({
      processExecutor,
      logger,
      cwd: this.projectCwd,
    });

    // 9. 의존성 묶음 구성
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
      sessionSnapshotStore: initResult.ok ? sessionSnapshotStore : undefined,
      sessionRestoreOrchestrator: initResult.ok ? sessionRestoreOrchestrator : undefined,
      ipcPoller,
      parallelCoderRunner,
      gitBranchManager,
    };

    return new TeamLeader(deps);
  }
}
