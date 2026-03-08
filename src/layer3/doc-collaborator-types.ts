/**
 * 문서 협업기 타입 정의 / Document collaborator type definitions
 *
 * @description
 * KR: DocCollaborator에서 사용하는 협업 단계, 상태, 요청/응답 타입.
 * EN: Types for collaboration phases, states, and request/response used by DocCollaborator.
 */

import type { Result } from 'core/types.js';
import type {
  BusinessDeliverableType,
  CollaborativeDocOptions,
  CollaborativeDocResult,
  DocumentFragment,
  ProjectDocumentType,
} from 'layer3/doc-types.js';

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

  /**
   * 전체 협업 워크플로우를 실행한다 / Run the full collaboration workflow end-to-end
   *
   * @description
   * KR: start → Layer1 구조 → Layer2 상세 → Layer1 검토 → complete 순서로 자동 진행.
   * EN: Automatically advances through start → L1 structure → L2 details → L1 review → complete.
   */
  runCollaboration(options: CollaborativeDocOptions): Promise<Result<CollaborativeDocResult>>;
}
