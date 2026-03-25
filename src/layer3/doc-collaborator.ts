/**
 * 문서 협업기 / Document Collaborator
 *
 * @description
 * KR: 1계층(뼈대) + 2계층(상세) 협업 문서 생성.
 *     1계층 Claude Opus가 문서 구조/방향/톤 결정 → 뼈대 생성,
 *     2계층 documenter가 구현 상세 채워넣기,
 *     1계층이 최종 검토 + 다듬기를 담당한다.
 * EN: Collaborative document generation between Layer 1 (skeleton) and Layer 2 (details).
 *     Layer 1 Claude Opus creates structure/direction/tone → generates skeleton,
 *     Layer 2 documenter fills in implementation details,
 *     Layer 1 reviews and refines the final document.
 */

import { randomUUID } from 'node:crypto';
import { AgentError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { Result } from 'core/types.js';
import { err, ok } from 'core/types.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import {
  callLayer1,
  callLayer2,
  generateToc,
  runCollaborationPipeline,
} from 'layer3/doc-collaborator-bridge.js';
import type {
  CollabDocState,
  IDocCollaborator,
  Layer1Request,
  Layer1Response,
  Layer2Request,
  Layer2Response,
} from 'layer3/doc-collaborator-types.js';
import type { CollaborativeDocOptions, CollaborativeDocResult } from 'layer3/doc-types.js';

/** 반복 검토 최대 사이클 수 / Maximum revision cycle count */
const MAX_REVISION_CYCLES = 2;

/** 수정 필요 판정 키워드 / Revision needed keywords */
const REVISION_KEYWORDS = [
  'REVISION_NEEDED',
  'NEEDS_REVISION',
  'REVISE',
  '수정 필요',
  '재작성 필요',
] as const;

export type {
  CollabDocState,
  CollabPhase,
  IDocCollaborator,
  Layer1Request,
  Layer1Response,
  Layer2Request,
  Layer2Response,
} from 'layer3/doc-collaborator-types.js';

// ── 구현 클래스 ──────────────────────────────────────────────

/**
 * DocCollaborator 구현 클래스 / DocCollaborator implementation
 *
 * @description
 * KR: 1계층(Claude Opus)과 2계층(documenter) 간 문서 협업 생성 워크플로우를 조율한다.
 *     간단한 API (logger만 전달) 또는 전체 API (claudeApi + spawner + logger)를 지원한다.
 * EN: Coordinates document collaborative generation workflow between Layer 1 (Claude Opus) and Layer 2 (documenter).
 *     Supports simple API (logger only) or full API (claudeApi + spawner + logger).
 */
export class DocCollaborator implements IDocCollaborator {
  private readonly logger: Logger;
  private readonly claudeApi: ClaudeApi | null;
  private readonly documenterSpawner: AgentSpawner | null;
  private readonly stateStore: Map<string, CollabDocState>;

  /**
   * @param loggerOrClaudeApi - 로거 (간단 API) 또는 Claude API 클라이언트 / Logger (simple API) or Claude API client
   * @param documenterSpawnerOrLogger - 2계층 documenter 스포너 또는 로거 / Layer 2 documenter spawner or logger
   * @param logger - 로거 인스턴스 (전체 API) / Logger instance (full API)
   */
  constructor(
    loggerOrClaudeApi: Logger | ClaudeApi,
    documenterSpawnerOrLogger?: AgentSpawner,
    logger?: Logger,
  ) {
    // WHY: 간단한 API 지원 - logger만 전달하는 경우
    if (!(documenterSpawnerOrLogger || logger)) {
      this.logger = (loggerOrClaudeApi as Logger).child({ module: 'doc-collaborator' });
      this.claudeApi = null;
      this.documenterSpawner = null;
    } else {
      this.claudeApi = loggerOrClaudeApi as ClaudeApi;
      this.documenterSpawner = documenterSpawnerOrLogger as AgentSpawner;
      this.logger = (logger as Logger).child({ module: 'doc-collaborator' });
    }
    this.stateStore = new Map();
  }

  /**
   * layer1 + layer2 문서 병합 (간단 동기 버전) / Merge layer1 + layer2 documents (simple sync version)
   *
   * @param outline - 1계층 아웃라인 / Layer 1 outline
   * @param details - 2계층 상세 내용 / Layer 2 details
   * @returns 병합된 문서 내용 / Merged document content
   */
  collaborate(outline: string, details: string): Result<string> {
    if (!outline || outline.trim() === '') {
      return err(new AgentError('agent_invalid_input', '아웃라인이 비어 있습니다'));
    }

    if (!details || details.trim() === '') {
      return err(new AgentError('agent_invalid_input', '상세 내용이 비어 있습니다'));
    }

    this.logger.info('문서 협업 시작', {
      outlineLength: outline.length,
      detailsLength: details.length,
    });

    // WHY: 아웃라인과 상세를 구분선으로 병합
    const merged = `${outline}\n\n---\n\n${details}`;

    this.logger.info('문서 협업 완료', { mergedLength: merged.length });

    return ok(merged);
  }

  /**
   * 목차를 생성한다 / Generate table of contents
   *
   * @param content - 문서 내용 / Document content
   * @returns 목차 문자열 / Table of contents string
   */
  generateTableOfContents(content: string): Result<string> {
    const result = generateToc(content);
    if (result.ok) {
      this.logger.info('목차 생성 완료');
    }
    return result;
  }

  /**
   * 협업 문서 생성을 시작한다 / Start collaborative document generation
   */
  async start(options: CollaborativeDocOptions): Promise<Result<CollabDocState>> {
    const id = randomUUID();
    const now = new Date();

    const state: CollabDocState = {
      id,
      projectId: options.projectId,
      type: options.type,
      phase: 'structure',
      createdAt: now,
      updatedAt: now,
    };

    this.stateStore.set(id, state);

    this.logger.info('협업 문서 생성 시작', {
      id,
      projectId: options.projectId,
      type: options.type,
    });

    return ok(state);
  }

  /**
   * 1계층에 뼈대 생성 또는 최종 검토를 요청한다 / Request Layer 1 to create structure or review
   */
  async requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>> {
    if (!this.claudeApi) {
      return err(new AgentError('agent_not_configured', 'Claude API가 설정되지 않았습니다'));
    }
    return callLayer1(this.claudeApi, request);
  }

  /**
   * 2계층 documenter에 상세 작성을 요청한다 / Request Layer 2 documenter to fill in details
   */
  async requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>> {
    if (!this.documenterSpawner) {
      return err(new AgentError('agent_not_configured', 'documenter 스포너가 설정되지 않았습니다'));
    }
    return callLayer2(this.documenterSpawner, request);
  }

  /**
   * 전체 협업 워크플로우를 실행한다 / Run the full collaboration workflow
   *
   * @description
   * KR: start → requestLayer1(create-structure) → requestLayer2 → requestLayer1(review-and-refine) → complete
   *     순서대로 상태를 진행시키며 최종 문서를 반환한다.
   *     claudeApi 또는 spawner가 없으면 제공된 구조/조각으로 fallback한다.
   * EN: Advances state through the full pipeline and returns the final document.
   *     Falls back to provided structure/fragments if claudeApi or spawner is absent.
   *
   * @param options - 협업 문서 생성 옵션 / Collaborative document options
   * @returns 협업 문서 결과 / Collaborative document result
   */
  async runCollaboration(
    options: CollaborativeDocOptions,
  ): Promise<Result<CollaborativeDocResult>> {
    const startResult = await this.start(options);
    if (!startResult.ok) return err(startResult.error);
    return runCollaborationPipeline(
      options,
      this.claudeApi,
      this.documenterSpawner,
      this.stateStore,
      startResult.value.id,
      this.logger,
    );
  }

  /**
   * 협업 문서 생성을 완료한다 / Complete collaborative document generation
   */
  async complete(docId: string): Promise<Result<CollaborativeDocResult>> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError('agent_state_not_found', `협업 문서 상태를 찾을 수 없습니다: ${docId}`),
      );
    }

    if (state.phase !== 'review') {
      return err(
        new AgentError('agent_invalid_state', `문서가 review 단계가 아닙니다: ${state.phase}`),
      );
    }

    if (!state.finalContent) {
      return err(new AgentError('agent_invalid_state', '최종 내용이 없습니다'));
    }

    const result: CollaborativeDocResult = {
      id: docId,
      content: state.finalContent,
      outputPath: '',
      generatedAt: new Date(),
    };

    this.stateStore.set(docId, { ...state, phase: 'complete', updatedAt: new Date() });

    return ok(result);
  }

  /**
   * 협업 문서 상태를 조회한다 / Get collaborative document state
   */
  async getState(docId: string): Promise<Result<CollabDocState>> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError('agent_state_not_found', `협업 문서 상태를 찾을 수 없습니다: ${docId}`),
      );
    }

    return ok(state);
  }

  /**
   * 3단계 협업 문서를 생성한다 / Generate collaborative document via 3-step pipeline
   *
   * @description
   * KR: §9.2 — 명시적 3단계 협업:
   *     Step 1: Layer1(Claude Opus)에 구조/방향/톤 결정 요청 → 뼈대 생성
   *     Step 2: 결과를 documenter에게 전달하여 기술 상세 채움 (agentSpawner spawn)
   *     Step 3: 완성된 문서를 Layer1에 최종 검토 요청 → 검토 완료 문서 반환
   * EN: §9.2 — Explicit 3-step collaboration:
   *     Step 1: Request Layer1 (Claude Opus) for structure/direction/tone → generate skeleton
   *     Step 2: Pass result to documenter to fill technical details (agentSpawner spawn)
   *     Step 3: Request Layer1 for final review → return reviewed document
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param docType - 문서 유형 / Document type
   * @param context - 프로젝트 컨텍스트 / Project context
   * @param fragments - 2계층 조각 문서 / Layer 2 fragment documents
   * @param outputPath - 출력 경로 / Output path
   * @returns 완성된 협업 문서 / Completed collaborative document
   */
  async generateCollaborativeDoc(
    projectId: string,
    docType:
      | import('layer3/doc-types.js').ProjectDocumentType
      | import('layer3/doc-types.js').BusinessDeliverableType,
    context: string,
    fragments: readonly import('layer3/doc-types.js').DocumentFragment[],
    outputPath: string,
  ): Promise<Result<CollaborativeDocResult>> {
    this.logger.info('3단계 협업 문서 생성 시작', { projectId, docType });

    // WHY: claudeApi와 documenterSpawner가 모두 있어야 3단계 협업이 가능
    if (!this.claudeApi) {
      return err(
        new AgentError('agent_not_configured', '3단계 협업 문서 생성에는 Claude API가 필요합니다'),
      );
    }

    // Step 1: Layer1에 구조/방향/톤 결정 요청 / Request L1 for structure
    this.logger.info('Step 1: Layer1 구조 생성 요청', { docType });
    const structureResult = await callLayer1(this.claudeApi, {
      type: 'create-structure',
      docType,
      context,
    });
    if (!structureResult.ok) {
      return err(structureResult.error);
    }
    const structure = structureResult.value.content;
    this.logger.info('Step 1 완료: Layer1 뼈대 생성', { structureLength: structure.length });

    // Step 2: documenter에게 기술 상세 채움 요청 / Request L2 documenter to fill details
    let details: string;
    if (this.documenterSpawner) {
      this.logger.info('Step 2: Layer2 documenter 기술 상세 작성 요청', { docType });
      const detailResult = await callLayer2(this.documenterSpawner, {
        docType,
        structure,
        fragments,
      });
      if (!detailResult.ok) {
        // WHY: L2 실패 시 L1 뼈대만으로 진행
        this.logger.warn('Step 2 실패: L1 뼈대만으로 진행', {
          error: detailResult.error.message,
        });
        details = structure;
      } else {
        details = detailResult.value.content;
        this.logger.info('Step 2 완료: Layer2 상세 작성', { detailsLength: details.length });
      }
    } else {
      // WHY: spawner 없을 때 조각 직접 병합
      this.logger.info('Step 2: spawner 없음 — 조각 직접 병합');
      const fragContent = fragments.map((f) => f.content).join('\n\n');
      details = fragContent ? `${structure}\n\n---\n\n${fragContent}` : structure;
    }

    // Step 3: Layer1 최종 검토 + 수정 필요 시 반복 / L1 review + revision loop
    let finalContent = details;
    let cycleDetails = details;

    for (let cycle = 0; cycle < MAX_REVISION_CYCLES; cycle++) {
      this.logger.info(
        `Step 3 (cycle ${cycle + 1}/${MAX_REVISION_CYCLES}): Layer1 최종 검토 요청`,
        { docType },
      );

      const reviewResult = await callLayer1(this.claudeApi, {
        type: 'review-and-refine',
        docType,
        context: structure,
        layer2Details: cycleDetails,
      });

      if (!reviewResult.ok) {
        // WHY: L1 review 실패 시 현재 버전으로 fallback
        this.logger.warn(`Step 3 cycle ${cycle + 1} 실패: 현재 버전으로 fallback`, {
          error: reviewResult.error.message,
        });
        finalContent = cycleDetails;
        break;
      }

      const reviewContent = reviewResult.value.content;
      const upperContent = reviewContent.toUpperCase();
      const needsRevision = REVISION_KEYWORDS.some((kw) => upperContent.includes(kw));

      if (!needsRevision) {
        // WHY: 수정 불필요 → 최종 완료
        finalContent = reviewContent;
        this.logger.info(`Step 3 cycle ${cycle + 1} 완료: 검토 통과`, {
          finalLength: finalContent.length,
        });
        break;
      }

      // WHY: 수정 필요 판정 → 다음 사이클에서 Step2 재실행
      this.logger.info(`Step 3 cycle ${cycle + 1}: 수정 필요 판정 — Step2 재실행`, {
        cycle: cycle + 1,
      });
      finalContent = reviewContent;

      if (cycle < MAX_REVISION_CYCLES - 1 && this.documenterSpawner) {
        // WHY: 마지막 사이클이 아닌 경우에만 Step2 재실행
        const redetailResult = await callLayer2(this.documenterSpawner, {
          docType,
          structure: reviewContent, // WHY: 검토 피드백을 구조로 전달하여 개선 방향 제시
          fragments,
        });
        if (redetailResult.ok) {
          cycleDetails = redetailResult.value.content;
          this.logger.info(`Step2 재실행 완료 (cycle ${cycle + 1})`, {
            detailsLength: cycleDetails.length,
          });
        }
      }
    }

    this.logger.info('3단계 협업 문서 생성 완료', {
      projectId,
      docType,
      finalLength: finalContent.length,
    });

    return ok({
      id: randomUUID(),
      content: finalContent,
      outputPath,
      generatedAt: new Date(),
    });
  }
}
