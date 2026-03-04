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
import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { ClaudeApi } from '../layer1/claude-api.js';
import type { AgentSpawner } from '../layer2/agent-spawner.js';
import type { AgentConfig } from '../layer2/types.js';
import type {
  BusinessDeliverableType,
  CollaborativeDocOptions,
  CollaborativeDocResult,
  DocumentFragment,
  ProjectDocumentType,
} from './types.js';

// ── 타입 정의 ───────────────────────────────────────────────

/**
 * 협업 문서 생성 단계 / Collaborative document generation phase
 */
export type CollabPhase = 'structure' | 'detail' | 'review' | 'complete';

/**
 * 협업 문서 상태 / Collaborative document state
 */
export interface CollabDocState {
  /** 문서 ID / Document ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 문서 유형 / Document type */
  readonly type: ProjectDocumentType | BusinessDeliverableType;
  /** 현재 단계 / Current phase */
  readonly phase: CollabPhase;
  /** 1계층 뼈대 / Layer 1 structure */
  readonly structure?: string;
  /** 2계층 상세 / Layer 2 details */
  readonly details?: string;
  /** 최종 내용 / Final content */
  readonly finalContent?: string;
  /** 생성 시각 / Created at */
  readonly createdAt: Date;
  /** 최종 수정 시각 / Updated at */
  readonly updatedAt: Date;
}

/**
 * 1계층 요청 / Layer 1 request
 */
export interface Layer1Request {
  /** 요청 유형 / Request type */
  readonly type: 'create-structure' | 'review-and-refine';
  /** 문서 유형 / Document type */
  readonly docType: ProjectDocumentType | BusinessDeliverableType;
  /** 프로젝트 컨텍스트 / Project context */
  readonly context: string;
  /** 2계층 상세 (review 시) / Layer 2 details (for review) */
  readonly layer2Details?: string;
}

/**
 * 1계층 응답 / Layer 1 response
 */
export interface Layer1Response {
  /** 응답 유형 / Response type */
  readonly type: 'structure' | 'refined';
  /** 생성된 내용 / Generated content */
  readonly content: string;
  /** 추가 가이드 / Additional guidance */
  readonly guidance?: string;
}

/**
 * 2계층 요청 / Layer 2 request
 */
export interface Layer2Request {
  /** 문서 유형 / Document type */
  readonly docType: ProjectDocumentType | BusinessDeliverableType;
  /** 1계층 뼈대 / Layer 1 structure */
  readonly structure: string;
  /** 조각 문서 목록 / Fragment documents */
  readonly fragments: readonly DocumentFragment[];
}

/**
 * 2계층 응답 / Layer 2 response
 */
export interface Layer2Response {
  /** 상세 내용 / Detailed content */
  readonly content: string;
  /** 채워진 섹션 목록 / Filled sections */
  readonly filledSections: readonly string[];
}

/**
 * 문서 협업기 인터페이스 / Document collaborator interface
 */
export interface IDocCollaborator {
  /**
   * 협업 문서 생성을 시작한다 / Start collaborative document generation
   */
  start(options: CollaborativeDocOptions): Promise<Result<CollabDocState>>;

  /**
   * 1계층에 뼈대 생성을 요청한다 / Request Layer 1 to create structure
   */
  requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>>;

  /**
   * 2계층에 상세 작성을 요청한다 / Request Layer 2 to fill in details
   */
  requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>>;

  /**
   * 협업 문서 생성을 완료한다 / Complete collaborative document generation
   */
  complete(docId: string): Promise<Result<CollaborativeDocResult>>;

  /**
   * 협업 문서 상태를 조회한다 / Get collaborative document state
   */
  getState(docId: string): Promise<Result<CollabDocState>>;
}

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
    if (!content || content.trim() === '') {
      return err(new AgentError('agent_invalid_input', '문서 내용이 비어 있습니다'));
    }

    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: { level: number; text: string }[] = [];

    for (
      let match = headingPattern.exec(content);
      match !== null;
      match = headingPattern.exec(content)
    ) {
      const level = match[1]?.length ?? 1;
      const text = match[2]?.trim() ?? '';
      if (text) {
        headings.push({ level, text });
      }
    }

    if (headings.length === 0) {
      return ok('## 목차\n\n(내용 없음)');
    }

    const tocLines = headings.map((h) => {
      const indent = '  '.repeat(h.level - 1);
      return `${indent}- ${h.text}`;
    });

    const toc = `## 목차\n\n${tocLines.join('\n')}`;

    this.logger.info('목차 생성 완료', { headingCount: headings.length });

    return ok(toc);
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
    try {
      if (!this.claudeApi) {
        return err(new AgentError('agent_not_configured', 'Claude API가 설정되지 않았습니다'));
      }

      let prompt: string;

      if (request.type === 'create-structure') {
        prompt = `다음 프로젝트의 ${request.docType} 문서 뼈대를 작성해주세요.\n\n컨텍스트: ${request.context}`;
      } else {
        if (!request.layer2Details) {
          return err(
            new AgentError(
              'agent_invalid_request',
              'review-and-refine 요청 시 layer2Details가 필요합니다',
            ),
          );
        }
        prompt = `다음 문서를 최종 검토하고 다듬어주세요.\n\n${request.layer2Details}`;
      }

      const result = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
        maxTokens: 8192,
        temperature: 0.7,
      });

      if (!result.ok) {
        return err(
          new AgentError(
            'agent_layer1_request_failed',
            `1계층 요청 실패: ${result.error.message}`,
            result.error,
          ),
        );
      }

      const responseType = request.type === 'create-structure' ? 'structure' : 'refined';
      return ok({ type: responseType, content: result.value.content });
    } catch (error: unknown) {
      return err(
        new AgentError(
          'agent_layer1_request_failed',
          `1계층 요청 중 예외 발생: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 2계층 documenter에 상세 작성을 요청한다 / Request Layer 2 documenter to fill in details
   */
  async requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>> {
    try {
      if (!this.documenterSpawner) {
        return err(
          new AgentError('agent_not_configured', 'documenter 스포너가 설정되지 않았습니다'),
        );
      }

      const fragmentsContext = request.fragments
        .map((frag) => `[${frag.type}] ${frag.id}:\n${frag.content}`)
        .join('\n\n---\n\n');

      const prompt = `다음 문서 뼈대에 구현 상세를 채워넣으세요.\n\n## 뼈대:\n\n${request.structure}\n\n## 조각 문서:\n\n${fragmentsContext || '(조각 문서 없음)'}`;

      const agentConfig: AgentConfig = {
        name: 'documenter',
        projectId: 'collab-doc',
        featureId: `doc-${request.docType}`,
        phase: 'VERIFY',
        systemPrompt: '당신은 기술 문서 작성 전문가입니다.',
        prompt,
        tools: ['read', 'grep', 'glob'],
        maxTurns: 20,
      };

      let content = '';
      for await (const event of this.documenterSpawner.spawn(agentConfig)) {
        if (event.type === 'message') {
          content += event.content;
        }
      }

      if (!content.trim()) {
        return err(
          new AgentError(
            'agent_layer2_request_failed',
            '2계층 documenter가 빈 내용을 반환했습니다',
          ),
        );
      }

      const headingMatches = content.match(/^#{1,6}\s+.+$/gm) || [];
      const filledSections = headingMatches.map((h) => h.trim());

      return ok({ content, filledSections });
    } catch (error: unknown) {
      return err(
        new AgentError(
          'agent_layer2_request_failed',
          `2계층 요청 중 예외 발생: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
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

    this.stateStore.set(docId, {
      ...state,
      phase: 'complete',
      updatedAt: new Date(),
    });

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
}
