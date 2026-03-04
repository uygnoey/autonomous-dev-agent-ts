/**
 * 산출물 빌더 / Deliverable Builder
 *
 * @description
 * KR: 통합 문서로부터 비즈니스 산출물을 생성한다.
 *     산출물 유형별로 포맷을 결정하고 콘텐츠를 구성한다.
 *     - portfolio: 프로젝트 쇼케이스 형식
 *     - business-plan: 비즈니스 문서 구조
 *     - report: 상세 기술 리포트
 *     - presentation: 발표 자료 형식
 *     - custom: 사용자 지정 형식
 * EN: Creates business deliverables from integrated documents.
 *     Determines format and composes content per deliverable type.
 *     - portfolio: project showcase format
 *     - business-plan: structured business document
 *     - report: detailed technical report
 *     - presentation: presentation format
 *     - custom: user-defined format
 */

import { AgentError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Result } from '../core/types.js';
import { err, ok } from '../core/types.js';
import type { Deliverable, DeliverableType, IntegratedDocument } from './types.js';

/**
 * 산출물 유형별 포맷 매핑 / Format mapping per deliverable type
 */
const TYPE_FORMAT_MAP: Readonly<Record<DeliverableType, Deliverable['format']>> = {
  portfolio: 'html',
  'business-plan': 'markdown',
  presentation: 'html',
  report: 'markdown',
  custom: 'json',
};

/**
 * 산출물 유형별 제목 접두사 / Title prefix per deliverable type
 */
const TYPE_TITLE_PREFIX: Readonly<Record<DeliverableType, string>> = {
  portfolio: '[Portfolio]',
  'business-plan': '[Business Plan]',
  presentation: '[Presentation]',
  report: '[Technical Report]',
  custom: '[Custom]',
};

/**
 * 산출물 빌더 / Deliverable Builder
 *
 * @description
 * KR: 통합 문서에서 비즈니스 산출물을 생성한다.
 * EN: Creates business deliverables from integrated documents.
 *
 * @example
 * const builder = new DeliverableBuilder(logger);
 * const result = builder.build('proj-1', 'report', [doc1, doc2]);
 */
export class DeliverableBuilder {
  private deliverableCounter = 0;
  private readonly deliverables: Map<string, Deliverable> = new Map();
  private readonly logger: Logger;

  /**
   * @param logger - 로거 인스턴스 / Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'deliverable-builder' });
  }

  /**
   * 통합 문서에서 산출물을 생성한다 / Builds a deliverable from integrated documents
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @param type - 산출물 유형 / Deliverable type
   * @param documents - 통합 문서 목록 / Integrated document list
   * @returns 생성된 산출물 / Built deliverable
   */
  build(
    projectId: string,
    type: DeliverableType,
    documents: readonly IntegratedDocument[],
  ): Result<Deliverable> {
    if (!projectId.trim()) {
      return err(new AgentError('agent_invalid_input', '프로젝트 ID가 비어있습니다'));
    }

    if (documents.length === 0) {
      return err(new AgentError('agent_invalid_input', '통합 문서가 비어있습니다'));
    }

    const format = TYPE_FORMAT_MAP[type];
    const titlePrefix = TYPE_TITLE_PREFIX[type];
    const content = this.composeContent(type, documents);

    this.deliverableCounter += 1;
    const deliverable: Deliverable = {
      id: `del-${this.deliverableCounter}`,
      type,
      title: `${titlePrefix} ${projectId}`,
      content,
      format,
      createdAt: new Date(),
      projectId,
    };

    this.deliverables.set(deliverable.id, deliverable);

    this.logger.info('산출물 생성 완료', {
      deliverableId: deliverable.id,
      projectId,
      type,
      format,
      documentCount: documents.length,
    });

    return ok(deliverable);
  }

  /**
   * 프로젝트의 산출물 목록을 반환한다 / Returns deliverables for a project
   *
   * @param projectId - 프로젝트 ID / Project ID
   * @returns 산출물 목록 / Deliverable list
   */
  listDeliverables(projectId: string): Deliverable[] {
    const result: Deliverable[] = [];
    for (const deliverable of this.deliverables.values()) {
      if (deliverable.projectId === projectId) {
        result.push(deliverable);
      }
    }
    return result;
  }

  /**
   * ID로 산출물을 조회한다 / Gets a deliverable by ID
   *
   * @param deliverableId - 산출물 ID / Deliverable ID
   * @returns 산출물 또는 null / Deliverable or null
   */
  getDeliverable(deliverableId: string): Deliverable | null {
    return this.deliverables.get(deliverableId) ?? null;
  }

  /**
   * 산출물 유형에 맞게 콘텐츠를 구성한다 / Composes content according to deliverable type
   *
   * @param type - 산출물 유형 / Deliverable type
   * @param documents - 통합 문서 목록 / Integrated document list
   * @returns 구성된 콘텐츠 / Composed content
   */
  private composeContent(type: DeliverableType, documents: readonly IntegratedDocument[]): string {
    const docContents = documents.map((d) => d.content).join('\n\n---\n\n');

    switch (type) {
      case 'portfolio':
        return `<article class="portfolio">\n${docContents}\n</article>`;
      case 'business-plan':
        return `# Business Plan\n\n${docContents}`;
      case 'presentation':
        return `<div class="slides">\n${docContents}\n</div>`;
      case 'report':
        return `# Technical Report\n\n${docContents}`;
      case 'custom':
        return JSON.stringify({ type: 'custom', content: docContents }, null, 2);
    }
  }
}
