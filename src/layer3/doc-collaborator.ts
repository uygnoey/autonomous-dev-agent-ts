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
 *
 * @description
 * KR: 협업 문서 생성 과정의 상태를 추적한다.
 * EN: Tracks the state of collaborative document generation.
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
 *
 * @description
 * KR: 1계층 Claude Opus에 문서 뼈대 생성 또는 최종 검토를 요청한다.
 * EN: Requests Layer 1 Claude Opus to create structure or review final document.
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
 *
 * @description
 * KR: 1계층이 생성한 뼈대 또는 다듬어진 최종 내용을 반환한다.
 * EN: Returns skeleton or refined final content from Layer 1.
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
 *
 * @description
 * KR: 2계층 documenter에 상세 작성을 요청한다.
 * EN: Requests Layer 2 documenter to fill in details.
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
 *
 * @description
 * KR: 2계층이 작성한 상세 내용을 반환한다.
 * EN: Returns detailed content from Layer 2.
 */
export interface Layer2Response {
  /** 상세 내용 / Detailed content */
  readonly content: string;
  /** 채워진 섹션 목록 / Filled sections */
  readonly filledSections: readonly string[];
}

/**
 * 문서 협업기 인터페이스 / Document collaborator interface
 *
 * @description
 * KR: 1계층과 2계층 간 문서 협업 생성을 조율한다.
 * EN: Coordinates document collaborative generation between Layer 1 and Layer 2.
 */
export interface IDocCollaborator {
  /**
   * 협업 문서 생성을 시작한다 / Start collaborative document generation
   *
   * @param options - 협업 문서 옵션 / Collaborative document options
   * @returns 협업 문서 상태 / Collaborative document state
   */
  start(options: CollaborativeDocOptions): Promise<Result<CollabDocState>>;

  /**
   * 1계층에 뼈대 생성을 요청한다 / Request Layer 1 to create structure
   *
   * @param request - 1계층 요청 / Layer 1 request
   * @returns 1계층 응답 / Layer 1 response
   */
  requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>>;

  /**
   * 2계층에 상세 작성을 요청한다 / Request Layer 2 to fill in details
   *
   * @param request - 2계층 요청 / Layer 2 request
   * @returns 2계층 응답 / Layer 2 response
   */
  requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>>;

  /**
   * 협업 문서 생성을 완료한다 / Complete collaborative document generation
   *
   * @param docId - 문서 ID / Document ID
   * @returns 완성된 문서 / Completed document
   */
  complete(docId: string): Promise<Result<CollaborativeDocResult>>;

  /**
   * 협업 문서 상태를 조회한다 / Get collaborative document state
   *
   * @param docId - 문서 ID / Document ID
   * @returns 협업 문서 상태 / Collaborative document state
   */
  getState(docId: string): Promise<Result<CollabDocState>>;
}

// ── 구현 클래스 ──────────────────────────────────────────────

/**
 * DocCollaborator 구현 클래스 / DocCollaborator implementation
 *
 * @description
 * KR: 1계층(Claude Opus)과 2계층(documenter) 간 문서 협업 생성 워크플로우를 조율한다.
 * EN: Coordinates document collaborative generation workflow between Layer 1 (Claude Opus) and Layer 2 (documenter).
 *
 * @example
 * const collaborator = new DocCollaborator(claudeApi, documenterSpawner, logger);
 * const state = await collaborator.start(options);
 * const layer1Res = await collaborator.requestLayer1({ type: 'create-structure', ... });
 * const layer2Res = await collaborator.requestLayer2({ structure: layer1Res.value.content, ... });
 * const refined = await collaborator.requestLayer1({ type: 'review-and-refine', layer2Details: layer2Res.value.content, ... });
 * const result = await collaborator.complete(state.value.id);
 */
export class DocCollaborator implements IDocCollaborator {
  private readonly logger: Logger;
  private readonly claudeApi: ClaudeApi;
  private readonly documenterSpawner: AgentSpawner;
  private readonly stateStore: Map<string, CollabDocState>;

  /**
   * @param claudeApi - Claude API 클라이언트 / Claude API client
   * @param documenterSpawner - 2계층 documenter 스포너 / Layer 2 documenter spawner
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(claudeApi: ClaudeApi, documenterSpawner: AgentSpawner, logger: Logger) {
    this.claudeApi = claudeApi;
    this.documenterSpawner = documenterSpawner;
    this.logger = logger.child({ module: 'doc-collaborator' });
    this.stateStore = new Map();
  }

  /**
   * 협업 문서 생성을 시작한다 / Start collaborative document generation
   *
   * @param options - 협업 문서 옵션 / Collaborative document options
   * @returns 협업 문서 상태 / Collaborative document state
   *
   * @example
   * const state = await collaborator.start({
   *   projectId: 'proj-1',
   *   type: 'readme',
   *   layer1Structure: '',
   *   layer2Fragments: [],
   *   outputPath: './README.md',
   * });
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
   *
   * @param request - 1계층 요청 / Layer 1 request
   * @returns 1계층 응답 / Layer 1 response
   *
   * @example
   * const layer1Res = await collaborator.requestLayer1({
   *   type: 'create-structure',
   *   docType: 'readme',
   *   context: '프로젝트는 TypeScript 기반 CLI 도구입니다.',
   * });
   */
  async requestLayer1(request: Layer1Request): Promise<Result<Layer1Response>> {
    try {
      let prompt: string;

      if (request.type === 'create-structure') {
        // WHY: 1계층 Claude Opus에 문서 뼈대 생성 요청
        prompt = `다음 프로젝트의 ${request.docType} 문서 뼈대를 작성해주세요.

구조, 방향, 톤을 정의하고, 각 섹션의 제목과 간단한 설명만 작성하세요.
상세한 내용은 2계층 documenter가 채워넣을 것입니다.

컨텍스트: ${request.context}

마크다운 형식으로 뼈대를 작성해주세요.`;
      } else {
        // WHY: 1계층 Claude Opus에 최종 검토 및 다듬기 요청
        if (!request.layer2Details) {
          return err(
            new AgentError(
              'agent_invalid_request',
              'review-and-refine 요청 시 layer2Details가 필요합니다 / layer2Details required for review-and-refine',
            ),
          );
        }

        prompt = `다음 문서를 최종 검토하고 다듬어주세요.

2계층 documenter가 작성한 상세 내용:

${request.layer2Details}

다음 항목을 확인하고 수정해주세요:
1. 문서 구조의 일관성
2. 용어 통일
3. 톤 앤 매너 통일
4. 가독성 개선
5. 누락된 섹션 보완

마크다운 형식으로 최종 문서를 작성해주세요.`;
      }

      this.logger.info('1계층 요청 시작', {
        type: request.type,
        docType: request.docType,
      });

      // WHY: Claude API를 통해 1계층 Claude Opus 호출
      const result = await this.claudeApi.createMessage([{ role: 'user', content: prompt }], {
        maxTokens: 8192,
        temperature: 0.7,
      });

      if (!result.ok) {
        this.logger.error('1계층 요청 실패', { error: result.error });
        return err(
          new AgentError(
            'agent_layer1_request_failed',
            `1계층 요청 실패 / Layer 1 request failed: ${result.error.message}`,
            result.error,
          ),
        );
      }

      const responseType = request.type === 'create-structure' ? 'structure' : 'refined';
      const response: Layer1Response = {
        type: responseType,
        content: result.value.content,
      };

      this.logger.info('1계층 응답 수신', {
        type: responseType,
        contentLength: response.content.length,
      });

      return ok(response);
    } catch (error: unknown) {
      this.logger.error('1계층 요청 예외', {
        error: error instanceof Error ? error.message : String(error),
      });
      return err(
        new AgentError(
          'agent_layer1_request_failed',
          `1계층 요청 중 예외 발생 / Exception during Layer 1 request: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 2계층 documenter에 상세 작성을 요청한다 / Request Layer 2 documenter to fill in details
   *
   * @param request - 2계층 요청 / Layer 2 request
   * @returns 2계층 응답 / Layer 2 response
   *
   * @example
   * const layer2Res = await collaborator.requestLayer2({
   *   docType: 'readme',
   *   structure: '# README\n\n## Installation\n\n## Usage\n\n',
   *   fragments: [],
   * });
   */
  async requestLayer2(request: Layer2Request): Promise<Result<Layer2Response>> {
    try {
      this.logger.info('2계층 documenter 스폰 시작', {
        docType: request.docType,
        structureLength: request.structure.length,
        fragmentCount: request.fragments.length,
      });

      // WHY: 조각 문서들을 컨텍스트로 구성
      const fragmentsContext = request.fragments
        .map((frag) => `[${frag.type}] ${frag.id}:\n${frag.content}`)
        .join('\n\n---\n\n');

      // WHY: 2계층 documenter 에이전트 프롬프트 생성
      const prompt = `다음 문서 뼈대에 구현 상세를 채워넣으세요.

코드 예제, API 명세, 테스트 결과 등 기술적 내용을 작성하세요.

## 뼈대:

${request.structure}

## 조각 문서:

${fragmentsContext || '(조각 문서 없음)'}

마크다운 형식으로 상세 내용을 작성해주세요.`;

      // WHY: documenter 에이전트 설정
      const agentConfig: AgentConfig = {
        name: 'documenter',
        projectId: 'collab-doc',
        featureId: `doc-${request.docType}`,
        phase: 'VERIFY',
        systemPrompt: '당신은 기술 문서 작성 전문가입니다. 명확하고 상세한 문서를 작성하세요.',
        prompt,
        tools: ['read', 'grep', 'glob'],
        maxTurns: 20,
      };

      // WHY: documenter 에이전트 실행
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
            '2계층 documenter가 빈 내용을 반환했습니다 / Layer 2 documenter returned empty content',
          ),
        );
      }

      // WHY: 채워진 섹션 목록 추출 (간단한 휴리스틱: 헤딩 수)
      const headingMatches = content.match(/^#{1,6}\s+.+$/gm) || [];
      const filledSections = headingMatches.map((h) => h.trim());

      const response: Layer2Response = {
        content,
        filledSections,
      };

      this.logger.info('2계층 documenter 완료', {
        contentLength: content.length,
        filledSectionCount: filledSections.length,
      });

      return ok(response);
    } catch (error: unknown) {
      this.logger.error('2계층 요청 예외', {
        error: error instanceof Error ? error.message : String(error),
      });
      return err(
        new AgentError(
          'agent_layer2_request_failed',
          `2계층 요청 중 예외 발생 / Exception during Layer 2 request: ${error instanceof Error ? error.message : String(error)}`,
          error,
        ),
      );
    }
  }

  /**
   * 협업 문서 생성을 완료하고 최종 문서를 저장한다 / Complete collaborative document generation and save final document
   *
   * @param docId - 문서 ID / Document ID
   * @returns 완성된 문서 / Completed document
   *
   * @example
   * const result = await collaborator.complete('doc-id-123');
   * console.log(result.value.outputPath);
   */
  async complete(docId: string): Promise<Result<CollaborativeDocResult>> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError(
          'agent_state_not_found',
          `협업 문서 상태를 찾을 수 없습니다 / Collaborative document state not found: ${docId}`,
        ),
      );
    }

    if (state.phase !== 'review') {
      return err(
        new AgentError(
          'agent_invalid_state',
          `문서가 review 단계가 아닙니다 / Document is not in review phase: ${state.phase}`,
        ),
      );
    }

    if (!state.finalContent) {
      return err(
        new AgentError('agent_invalid_state', '최종 내용이 없습니다 / Final content is missing'),
      );
    }

    // WHY: 실제 파일 저장은 호출자가 수행. 여기서는 결과 객체만 생성
    const result: CollaborativeDocResult = {
      id: docId,
      content: state.finalContent,
      outputPath: '', // WHY: outputPath는 호출자가 설정
      generatedAt: new Date(),
    };

    // WHY: 상태를 complete로 업데이트
    this.stateStore.set(docId, {
      ...state,
      phase: 'complete',
      updatedAt: new Date(),
    });

    this.logger.info('협업 문서 생성 완료', {
      id: docId,
      contentLength: state.finalContent.length,
    });

    return ok(result);
  }

  /**
   * 협업 문서 상태를 조회한다 / Get collaborative document state
   *
   * @param docId - 문서 ID / Document ID
   * @returns 협업 문서 상태 / Collaborative document state
   *
   * @example
   * const stateResult = await collaborator.getState('doc-id-123');
   * console.log(stateResult.value.phase);
   */
  async getState(docId: string): Promise<Result<CollabDocState>> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError(
          'agent_state_not_found',
          `협업 문서 상태를 찾을 수 없습니다 / Collaborative document state not found: ${docId}`,
        ),
      );
    }

    return ok(state);
  }

  /**
   * 협업 문서 상태를 업데이트한다 (내부용) / Update collaborative document state (internal)
   *
   * @param docId - 문서 ID / Document ID
   * @param updates - 업데이트할 필드 / Fields to update
   * @returns 성공 여부 / Success result
   */
  private updateState(
    docId: string,
    updates: Partial<Omit<CollabDocState, 'id' | 'projectId' | 'type' | 'createdAt'>>,
  ): Result<void> {
    const state = this.stateStore.get(docId);

    if (!state) {
      return err(
        new AgentError(
          'agent_state_not_found',
          `협업 문서 상태를 찾을 수 없습니다 / Collaborative document state not found: ${docId}`,
        ),
      );
    }

    this.stateStore.set(docId, {
      ...state,
      ...updates,
      updatedAt: new Date(),
    });

    return ok(undefined);
  }
}
