/**
 * 문서 통합기 / Document Integrator
 *
 * @description
 * KR: layer2의 조각 문서들을 템플릿에 따라 하나의 통합 프로젝트 문서로 병합한다.
 *     섹션 순서 정렬, 필수 섹션 검증, 버전 관리를 담당한다.
 * EN: Merges layer2 document fragments into a unified project document by template.
 *     Handles section ordering, required section validation, and versioning.
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { DocumentTemplate, IntegratedDocument } from './types.js';

/**
 * 문서 통합기 / Document Integrator
 *
 * @description
 * KR: layer2 조각 문서를 통합 문서로 병합한다.
 * EN: Merges layer2 document fragments into integrated documents.
 *
 * @example
 * const integrator = new DocIntegrator(logger);
 * const result = integrator.integrate(['frag-1', 'frag-2'], template);
 */
export class DocIntegrator {
  private docCounter = 0;
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'doc-integrator' });
  }

  /**
   * 조각 문서를 통합 문서로 병합한다 / Merges fragments into an integrated document
   *
   * @param fragments - 조각 문서 ID 목록 / Fragment ID list from layer2
   * @param template - 문서 템플릿 / Document template
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 통합 문서 / Integrated document
   */
  integrate(
    fragments: readonly string[],
    template: DocumentTemplate,
    projectId: string,
  ): Result<IntegratedDocument> {
    if (fragments.length === 0) {
      return err(new AgentError('agent_invalid_input', '조각 문서가 비어있습니다'));
    }

    if (template.sections.length === 0) {
      return err(new AgentError('agent_invalid_input', '템플릿 섹션이 비어있습니다'));
    }

    const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);
    const contentParts: string[] = [];

    for (const section of sortedSections) {
      const sectionContent = section.content.trim()
        ? section.content
        : section.required
          ? `[${section.heading}: 내용 필요 / Content required]`
          : '';

      if (sectionContent) {
        contentParts.push(`## ${section.heading}\n\n${sectionContent}`);
      }
    }

    const content = `# ${template.title}\n\n${contentParts.join('\n\n')}`;

    this.docCounter += 1;
    const doc: IntegratedDocument = {
      id: `doc-${this.docCounter}`,
      projectId,
      template,
      content,
      sourceFragments: fragments,
      generatedAt: new Date(),
      version: 1,
    };

    this.logger.info('문서 통합 완료', {
      docId: doc.id,
      projectId,
      fragmentCount: fragments.length,
      sectionCount: sortedSections.length,
    });

    return ok(doc);
  }

  /**
   * 통합 문서를 새 조각으로 업데이트한다 / Updates document with new fragments
   *
   * @param doc - 기존 통합 문서 / Existing integrated document
   * @param newFragments - 새 조각 문서 ID 목록 / New fragment IDs
   * @returns 버전 업데이트된 통합 문서 / Version-bumped integrated document
   */
  updateDocument(
    doc: IntegratedDocument,
    newFragments: readonly string[],
  ): Result<IntegratedDocument> {
    if (newFragments.length === 0) {
      return err(new AgentError('agent_invalid_input', '새 조각 문서가 비어있습니다'));
    }

    const mergedFragments = [...doc.sourceFragments, ...newFragments];

    // WHY: 기존 문서의 content에 새 조각 정보를 부록으로 추가한다
    const appendix = `\n\n---\n\n## 업데이트 부록 (v${doc.version + 1})\n\n추가된 조각: ${newFragments.join(', ')}`;

    const updated: IntegratedDocument = {
      ...doc,
      content: doc.content + appendix,
      sourceFragments: mergedFragments,
      generatedAt: new Date(),
      version: doc.version + 1,
    };

    this.logger.info('문서 업데이트 완료', {
      docId: updated.id,
      version: updated.version,
      addedFragments: newFragments.length,
    });

    return ok(updated);
  }

  /**
   * 통합 문서를 마크다운 문자열로 내보낸다 / Exports integrated document as markdown
   *
   * @param doc - 통합 문서 / Integrated document
   * @returns 마크다운 문자열 / Markdown string
   */
  exportAsMarkdown(doc: IntegratedDocument): Result<string> {
    const header = `---\ntitle: ${doc.template.title}\nversion: ${doc.version}\ngenerated: ${doc.generatedAt.toISOString()}\nlanguage: ${doc.template.language}\n---\n\n`;

    const markdown = header + doc.content;

    this.logger.debug('마크다운 내보내기 완료', {
      docId: doc.id,
      length: markdown.length,
    });

    return ok(markdown);
  }
}
