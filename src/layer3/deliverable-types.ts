/**
 * layer3 비즈니스 산출물 타입 정의 / Layer 3 business deliverable type definitions
 *
 * @description
 * KR: 비즈니스 산출물 상태, 메타데이터, 빌드 옵션, 산출물 인터페이스 관련 타입.
 * EN: Types for business deliverable status, metadata, build options, and deliverable interfaces.
 */

import type { BusinessDeliverableType, ProjectDocumentType } from 'layer3/doc-types.js';

// ── 비즈니스 산출물 / Business Deliverable ───────────────────────

/**
 * 산출물 상태 / Deliverable status
 */
export type DeliverableStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * 비즈니스 산출물 메타데이터 / Business deliverable metadata
 */
export interface DeliverableMetadata {
  /** 프로젝트 이름 / Project name */
  readonly projectName: string;
  /** 프로젝트 설명 / Project description */
  readonly projectDescription: string;
  /** 대상 독자 / Target audience */
  readonly targetAudience?: string;
  /** 생성 목적 / Purpose */
  readonly purpose?: string;
  /** 추가 메타데이터 / Additional metadata */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * 비즈니스 산출물 빌드 옵션 / Business deliverable build options
 */
export interface DeliverableBuildOptions {
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 산출물 유형 / Deliverable type */
  readonly type: BusinessDeliverableType;
  /** 템플릿 ID / Template ID */
  readonly templateId?: string;
  /** 메타데이터 / Metadata */
  readonly metadata: DeliverableMetadata;
  /** 출력 경로 / Output path */
  readonly outputPath: string;
}

/**
 * 비즈니스 산출물 / Business deliverable
 */
export interface BusinessDeliverable {
  /** 산출물 ID / Deliverable ID */
  readonly id: string;
  /** 프로젝트 ID / Project ID */
  readonly projectId: string;
  /** 산출물 유형 / Deliverable type */
  readonly type: BusinessDeliverableType;
  /** 문서 내용 / Document content */
  readonly content: string;
  /** 출력 형식 / Output format */
  readonly format: 'pdf' | 'pptx' | 'docx';
  /** 출력 파일 경로 / Output file path */
  readonly outputPath: string;
  /** 산출물 상태 / Deliverable status */
  readonly status: DeliverableStatus;
  /** 생성 시각 / Generated at */
  readonly createdAt: Date;
  /** 메타데이터 / Metadata */
  readonly metadata?: DeliverableMetadata;
}

/**
 * 산출물 유형 (별칭) / Deliverable type (alias)
 *
 * @description
 * KR: 비즈니스 산출물 유형의 별칭.
 * EN: Alias for business deliverable type.
 */
export type DeliverableType = BusinessDeliverableType;

/**
 * 산출물 (간단한 표현) / Deliverable (simplified representation)
 *
 * @description
 * KR: 비즈니스 산출물의 간단한 표현.
 * EN: Simplified representation of business deliverable.
 */
export interface Deliverable {
  readonly id: string;
  readonly type: DeliverableType | 'report';
  readonly title: string;
  readonly content: string;
  readonly format: 'markdown' | 'html' | 'json';
  readonly createdAt: Date;
  readonly projectId: string;
}

// ── 상수 정의 / Constants ────────────────────────────────────────

/**
 * 기본 프로젝트 문서 템플릿 목록 / Default project document templates
 */
export const DEFAULT_PROJECT_TEMPLATES: readonly ProjectDocumentType[] = [
  'readme',
  'api-reference',
  'architecture',
  'user-manual',
  'installation-guide',
  'test-report',
  'changelog',
  'contributing-guide',
] as const;

/**
 * 기본 비즈니스 산출물 템플릿 목록 / Default business deliverable templates
 */
export const DEFAULT_BUSINESS_TEMPLATES: readonly BusinessDeliverableType[] = [
  'portfolio',
  'business-plan',
  'investment-proposal',
  'presentation',
] as const;
