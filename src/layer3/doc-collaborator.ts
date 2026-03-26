/**
 * 문서 협업기 / Document Collaborator
 *
 * @description
 * KR: 1계층(뼈대) + 2계층(상세) 협업 문서 생성.
 * EN: Collaborative document generation between Layer 1 (skeleton) and Layer 2 (details).
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
import { generateCollaborativeDoc } from 'layer3/doc-collaborator-generator.js';
import type {
  CollabDocState,
  IDocCollaborator,
  Layer1Request,
  Layer1Response,
  Layer2Request,
  Layer2Response,
} from 'layer3/doc-collaborator-types.js';
import type { CollaborativeDocOptions, CollaborativeDocResult } from 'layer3/doc-types.js';

export type {
  CollabDocState,
  CollabPhase,
  IDocCollaborator,
  Layer1Request,
  Layer1Response,
  Layer2Request,
  Layer2Response,
} from 'layer3/doc-collaborator-types.js';

/**
 * DocCollaborator 구현 클래스 / DocCollaborator implementation
 */
export class DocCollaborator implements IDocCollaborator {
  private readonly logger: Logger;
  private readonly claudeApi: ClaudeApi | null;
  private readonly documenterSpawner: AgentSpawner | null;
  private readonly stateStore: Map<string, CollabDocState>;

  constructor(
    loggerOrClaudeApi: Logger | ClaudeApi,
    documenterSpawnerOrLogger?: AgentSpawner,
    logger?: Logger,
  ) {
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

  /** layer1 + layer2 문서 병합 (간단 동기 버전) / Merge layer1 + layer2 documents (simple sync version) */
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

    const merged = `${outline}\n\n---\n\n${details}`;

    this.logger.info('문서 협업 완료', { mergedLength: merged.length });

    return ok(merged);
  }

  /** 목차를 생성한다 / Generate table of contents */
  generateTableOfContents(content: string): Result<string> {
    const result = generateToc(content);
    if (result.ok) {
      this.logger.info('목차 생성 완료');
    }
    return result;
  }

  /** 협업 문서 생성을 시작한다 / Start collaborative document generation */
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

  /** 1계층에 뼈대 생성 또는 최종 검토를 요청한다 / Request Layer 1 to create structure or review */
  async requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>> {
    if (!this.claudeApi) {
      return err(new AgentError('agent_not_configured', 'Claude API가 설정되지 않았습니다'));
    }
    return callLayer1(this.claudeApi, request);
  }

  /** 2계층 documenter에 상세 작성을 요청한다 / Request Layer 2 documenter to fill in details */
  async requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>> {
    if (!this.documenterSpawner) {
      return err(new AgentError('agent_not_configured', 'documenter 스포너가 설정되지 않았습니다'));
    }
    return callLayer2(this.documenterSpawner, request);
  }

  /** 전체 협업 워크플로우를 실행한다 / Run the full collaboration workflow */
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

  /** 협업 문서 생성을 완료한다 / Complete collaborative document generation */
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

  /** 협업 문서 상태를 조회한다 / Get collaborative document state */
  async getState(docId: string): Promise<Result<CollabDocState>> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError('agent_state_not_found', `협업 문서 상태를 찾을 수 없습니다: ${docId}`),
      );
    }

    return ok(state);
  }

  /** 3단계 협업 문서를 생성한다 / Generate collaborative document via 3-step pipeline */
  async generateCollaborativeDoc(
    projectId: string,
    docType:
      | import('layer3/doc-types.js').ProjectDocumentType
      | import('layer3/doc-types.js').BusinessDeliverableType,
    context: string,
    fragments: readonly import('layer3/doc-types.js').DocumentFragment[],
    outputPath: string,
  ): Promise<Result<CollaborativeDocResult>> {
    return generateCollaborativeDoc(
      projectId,
      docType,
      context,
      fragments,
      outputPath,
      this.claudeApi,
      this.documenterSpawner,
      this.logger,
    );
  }
}
