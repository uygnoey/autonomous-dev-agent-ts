/**
 * 팀 리더 타입 정의 / Team Leader type definitions
 *
 * @description
 * KR: TeamLeader 생성자 주입에 사용되는 의존성 인터페이스.
 * EN: Dependency interface for TeamLeader constructor injection.
 */

import type { Logger } from 'core/logger.js';
import type { Layer1Verifier } from 'layer1/verifier.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { BiasDetector } from 'layer2/bias-detector.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { FailureHandler } from 'layer2/failure-handler.js';
import type { GitBranchManager } from 'layer2/git-branch-manager.js';
import type { IntegrationTester } from 'layer2/integration-tester.js';
import type { ModifiedFiles } from 'layer2/integration-tester-steps.js';
import type { IpcPoller } from 'layer2/ipc-poller.js';
import type { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { ProgressTracker } from 'layer2/progress-tracker.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { SessionRestoreOrchestrator } from 'layer2/session-restore-orchestrator.js';
import type { SessionSnapshotStore } from 'layer2/session-snapshot-store.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { UserCheckpoint, UserInputProvider } from 'layer2/user-checkpoint.js';
import type { VerificationGate } from 'layer2/verification-gate.js';
import type { RagSearcher } from 'rag/search.js';

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
  /** RAG 검색기 (선택) — 에이전트 컨텍스트 주입에 사용 / RAG searcher (optional) for context injection */
  readonly ragSearcher?: RagSearcher;
  /** 세션 스냅샷 저장소 (선택) — 토큰 한도 도달 시 세션 영속화 / Session snapshot store (optional) for token reset persistence */
  readonly sessionSnapshotStore?: SessionSnapshotStore;
  /** 세션 복원 오케스트레이터 (선택) — 토큰 리셋 후 세션 복원 / Session restore orchestrator (optional) for post-reset recovery */
  readonly sessionRestoreOrchestrator?: SessionRestoreOrchestrator;
  /** 디스크 IPC 폴러 (선택) — 팀 메시지/태스크 이벤트 감지 / Disk IPC poller (optional) for team message and task events */
  readonly ipcPoller?: IpcPoller;
  /** 병렬 Coder 실행기 (선택) — CODE phase에서 다수 Coder 병렬 실행 / Parallel coder runner (optional) for concurrent CODE phase execution */
  readonly parallelCoderRunner?: ParallelCoderRunner;
  /** Git 브랜치 관리자 (선택) — Coder 브랜치 생성 및 병합 / Git branch manager (optional) for branch setup and merge */
  readonly gitBranchManager?: GitBranchManager;
  /** layer1 검증기 (선택) — VERIFY Phase에서 스펙 의도 검증에 사용 / Layer1 verifier (optional) for spec intent verification in VERIFY phase */
  readonly layer1Verifier?: Layer1Verifier;
  /** 사용자 체크포인트 (선택) — PI-010 유저 확인에 사용 / User checkpoint (optional) for PI-010 user confirmation */
  readonly userCheckpoint?: UserCheckpoint;
  /** 사용자 입력 제공자 (선택) — PI-010 CLI 인터랙션에 사용 / User input provider (optional) for PI-010 CLI interaction */
  readonly userInputProvider?: UserInputProvider;
  /** 프로젝트 경로 (선택) — 통합 테스트에 사용 / Project path (optional) for integration tests */
  readonly projectPath?: string;
  /** 수정된 파일 목록 (선택) — 통합 테스트에 사용 / Modified files (optional) for integration tests */
  readonly modifiedFiles?: ModifiedFiles;
}
