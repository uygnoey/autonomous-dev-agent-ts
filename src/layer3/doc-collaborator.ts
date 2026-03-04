/**
 * 문서 협업기 / Document Collaborator
 *
 * @description
 * KR: layer1(뼈대)과 layer2(상세) 문서를 협업 병합하여 일관된 최종 문서를 생성한다.
 *     용어 통일, 스타일 일관성, 목차 생성을 담당한다.
 * EN: Collaboratively merges layer1 (skeleton) and layer2 (detail) documents
 *     into a consistent final document. Handles terminology, style consistency, and TOC.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';

/**
 * 마크다운 헤딩 정규식 / Markdown heading regex
 *
 * @description
 * KR: 마크다운 헤딩(#, ##, ### 등)을 추출하기 위한 정규식.
 * EN: Regex pattern to extract markdown headings (#, ##, ###, etc.).
 */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm;

/**
 * 문서 협업기 / Document Collaborator
 *
 * @description
 * KR: layer1 아웃라인과 layer2 상세 내용을 병합한다.
 * EN: Merges layer1 outline with layer2 detailed content.
 *
 * @example
 * const collaborator = new DocCollaborator(logger);
 * const result = collaborator.collaborate(outline, details);
 */
export class DocCollaborator {
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'doc-collaborator' });
  }

  /**
   * layer1 아웃라인과 layer2 상세 내용을 병합한다 / Merges layer1 outline with layer2 details
   *
   * @param layer1Outline - layer1의 문서 뼈대 / Layer1 document skeleton
   * @param layer2Details - layer2의 상세 내용 / Layer2 detailed content
   * @returns 병합된 최종 문서 / Merged final document
   */
  collaborate(layer1Outline: string, layer2Details: string): Result<string> {
    if (!layer1Outline.trim()) {
      return err(new AgentError('agent_invalid_input', 'layer1 아웃라인이 비어있습니다'));
    }

    if (!layer2Details.trim()) {
      return err(new AgentError('agent_invalid_input', 'layer2 상세 내용이 비어있습니다'));
    }

    // WHY: outline을 기본 구조로 사용하고, details를 본문으로 채워넣는다
    const merged = `${layer1Outline.trim()}\n\n---\n\n${layer2Details.trim()}`;

    this.logger.info('문서 협업 병합 완료', {
      outlineLength: layer1Outline.length,
      detailsLength: layer2Details.length,
      mergedLength: merged.length,
    });

    return ok(merged);
  }

  /**
   * 문서 내용에서 목차를 생성한다 / Generates table of contents from document content
   *
   * @param content - 마크다운 문서 내용 / Markdown document content
   * @returns 목차 문자열 / Table of contents string
   */
  generateTableOfContents(content: string): Result<string> {
    if (!content.trim()) {
      return err(new AgentError('agent_invalid_input', '문서 내용이 비어있습니다'));
    }

    const headings: { level: number; text: string }[] = [];

    // WHY: HEADING_PATTERN은 전역 플래그를 사용하므로 매번 새 인스턴스로 실행한다
    const pattern = new RegExp(HEADING_PATTERN.source, HEADING_PATTERN.flags);
    for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
      const level = match[1]?.length ?? 1;
      const text = match[2]?.trim() ?? '';
      if (text) {
        headings.push({ level, text });
      }
    }

    if (headings.length === 0) {
      return ok('');
    }

    const tocLines = headings.map((h) => {
      const indent = '  '.repeat(h.level - 1);
      const anchor = h.text
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-');
      return `${indent}- [${h.text}](#${anchor})`;
    });

    const toc = `## 목차 / Table of Contents\n\n${tocLines.join('\n')}`;

    this.logger.debug('목차 생성 완료', { headingCount: headings.length });

    return ok(toc);
  }
}
