/**
 * 산출물 렌더러 / Deliverable Renderer
 *
 * @description
 * KR: 산출물 유형별 제목, 형식, 콘텐츠 생성 로직을 담당한다.
 *     DeliverableBuilder에서 분리된 순수 함수 모음.
 * EN: Handles title, format, and content generation logic per deliverable type.
 *     Pure function helpers extracted from DeliverableBuilder.
 */

import type { DeliverableMetadata } from 'layer3/deliverable-types.js';
import type { BusinessDeliverableType, IntegratedDocument } from 'layer3/doc-types.js';

/**
 * 산출물 유형별 기본 출력 형식 반환 / Get default output format for a deliverable type
 *
 * @param type - 산출물 유형 / Deliverable type
 * @returns 기본 형식 (pdf | docx | pptx) / Default format
 */
export function getDefaultFormat(type: BusinessDeliverableType): 'pdf' | 'docx' | 'pptx' {
  switch (type) {
    case 'portfolio':
      return 'pdf';
    case 'business-plan':
      return 'docx';
    case 'investment-proposal':
      return 'pdf';
    case 'presentation':
      return 'pptx';
  }
}

/**
 * 간단 산출물의 제목 생성 / Generate title for a simple deliverable
 *
 * @param type - 산출물 유형 / Deliverable type
 * @param projectId - 프로젝트 ID / Project ID
 * @returns 제목 문자열 / Title string
 */
export function generateDeliverableTitle(type: string, projectId: string): string {
  switch (type) {
    case 'report':
      return `[Technical Report] ${projectId}`;
    case 'portfolio':
      return `[Portfolio] ${projectId}`;
    case 'business-plan':
      return `[Business Plan] ${projectId}`;
    default:
      return `[${type}] ${projectId}`;
  }
}

/**
 * 간단 동기 빌드 시 사용하는 콘텐츠 생성 / Generate content for simple sync build
 *
 * @param type - 산출물 유형 / Deliverable type
 * @param docs - 소스 문서 목록 / Source document list
 * @returns 렌더링된 콘텐츠 / Rendered content
 */
export function generateSimpleContent(type: string, docs: readonly IntegratedDocument[]): string {
  const docContents = docs.map((d) => d.content).join('\n\n---\n\n');

  switch (type) {
    case 'report':
      return `# Technical Report\n\n${docContents}`;
    case 'portfolio':
      return `<article>\n<h1>Portfolio</h1>\n${docContents}\n</article>`;
    case 'business-plan':
      return `# Business Plan\n\n${docContents}`;
    default:
      return `# ${type}\n\n${docContents}`;
  }
}

/**
 * 비즈니스 산출물 유형별 콘텐츠 생성 / Generate business deliverable content by type
 *
 * @param type - 산출물 유형 / Deliverable type
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 렌더링된 콘텐츠 / Rendered content
 */
export function generateBusinessContent(
  type: BusinessDeliverableType,
  metadata: DeliverableMetadata,
): string {
  const extraSection = metadata.extra
    ? Object.entries(metadata.extra)
        .map(([key, value]) => `- ${key}: ${String(value)}`)
        .join('\n')
    : '';

  switch (type) {
    case 'portfolio':
      return [
        `# ${metadata.projectName} 포트폴리오`,
        '',
        '## 프로젝트 소개',
        metadata.projectDescription,
        '',
        metadata.targetAudience ? `대상: ${metadata.targetAudience}` : '',
        metadata.purpose ? `목적: ${metadata.purpose}` : '',
        extraSection ? `\n## 추가 정보\n${extraSection}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'business-plan':
      return [
        `# 사업 계획서 — ${metadata.projectName}`,
        '',
        '## 개요',
        metadata.projectDescription,
        '',
        metadata.targetAudience ? `대상 시장: ${metadata.targetAudience}` : '',
        metadata.purpose ? `목적: ${metadata.purpose}` : '',
        extraSection ? `\n## 추가 정보\n${extraSection}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'investment-proposal':
      return [
        `# 투자 제안서 — ${metadata.projectName}`,
        '',
        '## 프로젝트 개요',
        metadata.projectDescription,
        '',
        metadata.targetAudience ? `대상 투자자: ${metadata.targetAudience}` : '',
        metadata.purpose ? `투자 목적: ${metadata.purpose}` : '',
        extraSection ? `\n## 추가 정보\n${extraSection}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'presentation':
      return [
        `# ${metadata.projectName}`,
        '',
        '## Introduction',
        metadata.projectDescription,
        '',
        metadata.targetAudience ? `Audience: ${metadata.targetAudience}` : '',
        metadata.purpose ? `Purpose: ${metadata.purpose}` : '',
        extraSection ? `\n## Details\n${extraSection}` : '',
      ]
        .filter(Boolean)
        .join('\n');
  }
}
