/**
 * 산출물 마크다운 렌더러 / Deliverable Markdown Renderer
 *
 * @description
 * KR: 산출물 유형별 마크다운 콘텐츠를 생성하는 순수 함수 모음.
 *     deliverable-writer.ts에서 렌더링 책임만 분리.
 * EN: Pure functions for generating markdown content per deliverable type.
 *     Rendering responsibility extracted from deliverable-writer.ts.
 */

import type { DeliverableMetadata } from 'layer3/deliverable-types.js';
import type { BusinessDeliverableType } from 'layer3/doc-types.js';

/**
 * extra 메타데이터를 마크다운 목록으로 변환 / Convert extra metadata to markdown list
 *
 * @param extra - 추가 메타데이터 / Additional metadata
 * @param heading - 섹션 제목 / Section heading
 * @returns 마크다운 섹션 배열 / Markdown section array
 */
function renderExtraSection(
  extra: Readonly<Record<string, unknown>> | undefined,
  heading: string,
): string[] {
  if (!extra) return [];
  const lines: string[] = [heading, ''];
  for (const [key, value] of Object.entries(extra)) {
    lines.push(`- **${key}**: ${String(value)}`);
  }
  lines.push('');
  return lines;
}

/**
 * 포트폴리오 마크다운 생성 / Generate portfolio markdown
 *
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 마크다운 문자열 / Markdown string
 */
export function renderPortfolio(metadata: DeliverableMetadata): string {
  const sections: string[] = [
    `# ${metadata.projectName} Portfolio`,
    '',
    '## Project Overview',
    '',
    metadata.projectDescription,
    '',
  ];

  if (metadata.targetAudience) {
    sections.push('## Target Audience', '', metadata.targetAudience, '');
  }
  if (metadata.purpose) {
    sections.push('## Purpose', '', metadata.purpose, '');
  }
  sections.push(...renderExtraSection(metadata.extra, '## Additional Details'));
  sections.push('---', '', `> Generated at ${new Date().toISOString()}`, '');

  return sections.join('\n');
}

/**
 * 사업계획서 마크다운 생성 / Generate business plan markdown
 *
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 마크다운 문자열 / Markdown string
 */
export function renderBusinessPlan(metadata: DeliverableMetadata): string {
  const sections: string[] = [
    `# Business Plan — ${metadata.projectName}`,
    '',
    '## Executive Summary',
    '',
    metadata.projectDescription,
    '',
  ];

  if (metadata.targetAudience) {
    sections.push('## Target Market', '', metadata.targetAudience, '');
  }
  if (metadata.purpose) {
    sections.push('## Objectives', '', metadata.purpose, '');
  }
  sections.push(...renderExtraSection(metadata.extra, '## Details'));
  sections.push('---', '', `> Generated at ${new Date().toISOString()}`, '');

  return sections.join('\n');
}

/**
 * 투자제안서 마크다운 생성 / Generate investment proposal markdown
 *
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 마크다운 문자열 / Markdown string
 */
export function renderInvestmentProposal(metadata: DeliverableMetadata): string {
  const sections: string[] = [
    `# Investment Proposal — ${metadata.projectName}`,
    '',
    '## Project Overview',
    '',
    metadata.projectDescription,
    '',
  ];

  if (metadata.targetAudience) {
    sections.push('## Target Investors', '', metadata.targetAudience, '');
  }
  if (metadata.purpose) {
    sections.push('## Investment Purpose', '', metadata.purpose, '');
  }
  sections.push(...renderExtraSection(metadata.extra, '## Supporting Details'));
  sections.push('---', '', `> Generated at ${new Date().toISOString()}`, '');

  return sections.join('\n');
}

/**
 * 프레젠테이션 마크다운 생성 / Generate presentation markdown
 *
 * @param metadata - 산출물 메타데이터 / Deliverable metadata
 * @returns 마크다운 문자열 / Markdown string
 */
export function renderPresentation(metadata: DeliverableMetadata): string {
  const sections: string[] = [
    `# ${metadata.projectName}`,
    '',
    '---',
    '',
    '## Introduction',
    '',
    metadata.projectDescription,
    '',
  ];

  if (metadata.targetAudience) {
    sections.push('---', '', '## Audience', '', metadata.targetAudience, '');
  }
  if (metadata.purpose) {
    sections.push('---', '', '## Purpose', '', metadata.purpose, '');
  }
  sections.push(...renderExtraSection(metadata.extra, '## Details'));
  sections.push('---', '', `> Generated at ${new Date().toISOString()}`, '');

  return sections.join('\n');
}

/**
 * 산출물 유형별 마크다운 렌더링 / Render markdown by deliverable type
 *
 * @param type - 산출물 유형 / Deliverable type
 * @param metadata - 메타데이터 / Metadata
 * @returns 마크다운 문자열 / Markdown string
 */
export function renderDeliverableMarkdown(
  type: BusinessDeliverableType,
  metadata: DeliverableMetadata,
): string {
  switch (type) {
    case 'portfolio':
      return renderPortfolio(metadata);
    case 'business-plan':
      return renderBusinessPlan(metadata);
    case 'investment-proposal':
      return renderInvestmentProposal(metadata);
    case 'presentation':
      return renderPresentation(metadata);
  }
}
