/**
 * CODE Phase 실행 / CODE Phase Execution
 *
 * @description
 * KR: 병렬/순차 Coder 실행, Git 브랜치 병합, 충돌 해결 로직을 제공한다.
 * EN: Provides parallel/sequential coder execution, git branch merging, and conflict resolution.
 */

import type { Logger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import type { HandoffPackage } from 'layer1/types.js';
import type { AgentGenerator } from 'layer2/agent-generator.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import type { CoderAllocator } from 'layer2/coder-allocator.js';
import type { GitBranchManager } from 'layer2/git-branch-manager.js';
import type { ParallelCoderRunner } from 'layer2/parallel-coder-runner.js';
import type { PhaseEngine } from 'layer2/phase-engine.js';
import type { SessionManager } from 'layer2/session-manager.js';
import type { StreamMonitor } from 'layer2/stream-monitor.js';
import { createEvent, executePhase, spawnDocumenter } from 'layer2/team-leader-helpers.js';
import type { TokenMonitor } from 'layer2/token-monitor.js';
import type { AgentEvent } from 'layer2/types.js';
import type { RagSearcher } from 'rag/search.js';

/**
 * CODE Phase에서 갱신 가능한 수정 파일 목록 / Mutable modified files for CODE phase update
 *
 * @description
 * KR: M-A2 — CODE Phase 완료 후 git diff로 수집한 파일 목록을 갱신한다.
 *     readonly ModifiedFiles와 달리 paths를 재할당할 수 있다.
 * EN: M-A2 — Updated with file list collected via git diff after CODE phase.
 */
export interface MutableModifiedFiles {
  paths: string[];
}

/** executeCodePhase에 필요한 의존성 / Deps needed by executeCodePhase */
export interface ExecuteCodePhaseDeps {
  readonly phaseEngine: PhaseEngine;
  readonly tokenMonitor: TokenMonitor;
  readonly agentGenerator: AgentGenerator;
  readonly sessionManager: SessionManager;
  readonly agentSpawner: AgentSpawner;
  readonly streamMonitor: StreamMonitor;
  readonly logger: Logger;
  readonly ragSearcher?: RagSearcher;
  readonly coderAllocator: CoderAllocator;
  readonly parallelCoderRunner?: ParallelCoderRunner;
  readonly gitBranchManager?: GitBranchManager;
  /** M-A2 — CODE Phase 완료 후 수정 파일 목록 갱신용 / Mutable modified files for post-CODE update */
  readonly modifiedFiles?: MutableModifiedFiles;
}

/**
 * CODE Phase를 실행한다 / Executes the CODE phase
 *
 * @description
 * KR: parallelCoderRunner가 주입된 경우 병렬 Coder를 실행하고 각 브랜치를 병합한다.
 *     parallelCoderRunner가 없으면 단일 순차 실행으로 폴백한다.
 *     코딩 완료 후 architect(스펙 준수 확인)와 reviewer(코드 품질 확인) 감독 세션을 실행한다.
 * EN: Runs parallel coders when parallelCoderRunner is injected and merges each branch.
 *     Falls back to single sequential execution when parallelCoderRunner is absent.
 *     After coding, runs architect (spec compliance) and reviewer (code quality) supervision.
 *
 * @param deps - CODE Phase 의존성 / CODE phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
export async function* executeCodePhase(
  deps: ExecuteCodePhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
): AsyncIterable<AgentEvent> {
  if (!deps.parallelCoderRunner) {
    // WHY: parallelCoderRunner 미주입 시 단일 순차 실행으로 폴백
    yield* executePhase(deps, 'CODE', featureId, handoffPackage);

    // WHY: 단일 순차 실행에서도 coder 작업 완료 후 커밋이 필요하다.
    if (deps.gitBranchManager) {
      yield* deps.gitBranchManager.commitChanges(`feat(${featureId}): CODE phase 완료`);
    }

    // WHY: M-A2 — CODE Phase 완료 후 modifiedFiles 갱신하여 계단식 차등 테스트 활성화
    if (deps.gitBranchManager && deps.modifiedFiles) {
      const diffPaths = await deps.gitBranchManager.getModifiedFiles();
      if (diffPaths.ok) {
        deps.modifiedFiles.paths = diffPaths.value;
      }
    }

    // WHY: NI-007 — coder 수정 완료 시 documenter spawn (CHANGELOG 갱신)
    yield* spawnDocumenter(
      deps.agentGenerator,
      deps.agentSpawner,
      deps.logger,
      featureId,
      handoffPackage,
      { trigger: 'phase_boundary', context: { fromPhase: 'CODE', event: 'code_modified' } },
    );
    return;
  }

  // WHY: runParallel 내부에서 coder 병렬 실행 + architect/reviewer 감독 세션까지 수행
  yield* deps.parallelCoderRunner.runParallel(featureId, handoffPackage);

  // WHY: 병렬 실행 완료 후 각 coder 브랜치를 main에 병합
  if (deps.gitBranchManager) {
    const activeAllocations = deps.coderAllocator.getActiveAllocations();
    for (const allocation of activeAllocations) {
      // WHY: 병합 전 브랜치에 작업 내용을 커밋해야 merge가 가능하다
      yield* deps.gitBranchManager.commitChanges(
        `feat(${featureId}): ${allocation.coderId} CODE phase 완료`,
      );
      // WHY: PI-003 — 병합 충돌 시 충돌 해결 프롬프트를 전달하고 architect spawn으로 해결 조율
      let hasConflict = false;
      for await (const mergeEvent of deps.gitBranchManager.mergeBranch(allocation.branchName)) {
        if (mergeEvent.type === 'error' && mergeEvent.metadata?.conflictResolutionPrompt) {
          hasConflict = true;
          yield createEvent(
            'message',
            `[충돌 감지] ${allocation.coderId}: ${String(mergeEvent.metadata.conflictResolutionPrompt)}`,
          );
          // WHY: PI-003 — architect 에이전트를 spawn하여 충돌 해결 조율
          yield* spawnConflictResolver(
            deps,
            featureId,
            handoffPackage,
            String(mergeEvent.metadata.conflictResolutionPrompt),
          );
        }
        yield mergeEvent;
      }

      // WHY: M-Q2 — 충돌 해결 후 merge 재시도
      if (hasConflict) {
        for await (const retryEvent of deps.gitBranchManager.mergeBranch(allocation.branchName)) {
          if (retryEvent.type === 'error') {
            yield createEvent('error', `충돌 해결 후 merge 재시도 실패: ${retryEvent.content}`);
          }
          yield retryEvent;
        }
      }

      deps.coderAllocator.mergeAllocation(allocation.coderId);
    }

    // WHY: M-A2 — 병렬 CODE Phase 완료 후 modifiedFiles 갱신하여 계단식 차등 테스트 활성화
    if (deps.modifiedFiles) {
      const diffPaths = await deps.gitBranchManager.getModifiedFiles();
      if (diffPaths.ok) {
        deps.modifiedFiles.paths = diffPaths.value;
      }
    }
  }

  // WHY: NI-007 — 병렬 coder 수정 완료 시 documenter spawn (CHANGELOG 갱신)
  yield* spawnDocumenter(
    deps.agentGenerator,
    deps.agentSpawner,
    deps.logger,
    featureId,
    handoffPackage,
    { trigger: 'phase_boundary', context: { fromPhase: 'CODE', event: 'code_modified' } },
  );
}

/**
 * Git 충돌 시 architect 에이전트를 spawn하여 해결을 조율한다 / Spawns architect to coordinate conflict resolution
 *
 * @param deps - CODE Phase 의존성 / CODE phase dependencies
 * @param featureId - 기능 ID / Feature ID
 * @param handoffPackage - 인수 패키지 / Handoff package
 * @param conflictPrompt - 충돌 해결 프롬프트 / Conflict resolution prompt
 * @returns 에이전트 이벤트 스트림 / Agent event stream
 */
async function* spawnConflictResolver(
  deps: ExecuteCodePhaseDeps,
  featureId: string,
  handoffPackage: HandoffPackage,
  conflictPrompt: string,
): AsyncIterable<AgentEvent> {
  const specWithConflict = `${handoffPackage.specDocument}\n\n[Git 충돌 해결 요청]\n${conflictPrompt}`;

  // WHY: PI-001 — 스펙 §8.4: 충돌 시 5개 에이전트 전원 참여하여 다각적 해결
  const resolvers: AgentName[] = ['architect', 'qa', 'qc', 'reviewer', 'coder'];

  for (const agentName of resolvers) {
    const configResult = deps.agentGenerator.generateAgentConfig(
      agentName,
      specWithConflict,
      featureId,
    );

    if (!configResult.ok) {
      deps.logger.warn(`${agentName} 충돌 해결 설정 생성 실패`, {
        featureId,
        error: configResult.error.message,
      });
      continue;
    }

    const config = {
      ...configResult.value,
      projectId: handoffPackage.projectId,
      phase: 'CODE' as const,
    };

    deps.sessionManager.createSession(agentName, config.projectId, featureId, 'CODE');

    for await (const event of deps.agentSpawner.spawn(config)) {
      yield event;
    }
  }
}
