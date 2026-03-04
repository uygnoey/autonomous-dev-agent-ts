/**
 * DeliverableBuilder 단위 테스트 / DeliverableBuilder unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DeliverableBuilder } from '../../../src/layer3/deliverable-builder.js';
import type { DocumentTemplate, IntegratedDocument } from '../../../src/layer3/types.js';

describe('DeliverableBuilder', () => {
  let builder: DeliverableBuilder;

  const createTemplate = (): DocumentTemplate => ({
    type: 'api-reference',
    title: 'Test Template',
    sections: [
      { heading: 'Section 1', content: 'Content 1', order: 1, required: true },
    ],
    language: 'bilingual',
  });

  const createDocument = (overrides?: Partial<IntegratedDocument>): IntegratedDocument => ({
    id: 'doc-1',
    projectId: 'proj-1',
    template: createTemplate(),
    content: '# Test Document\n\nThis is test content.',
    sourceFragments: ['frag-1'],
    generatedAt: new Date(),
    version: 1,
    ...overrides,
  });

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    builder = new DeliverableBuilder(logger);
  });

  describe('build / 산출물 생성', () => {
    it('report 유형 산출물을 생성한다', () => {
      const doc = createDocument();
      const result = builder.build('proj-1', 'report', [doc]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.type).toBe('report');
        expect(result.value.format).toBe('markdown');
        expect(result.value.content).toContain('Technical Report');
        expect(result.value.title).toContain('[Technical Report]');
      }
    });

    it('portfolio 유형 산출물을 생성한다', () => {
      const doc = createDocument();
      const result = builder.build('proj-1', 'portfolio', [doc]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.format).toBe('html');
        expect(result.value.content).toContain('<article');
        expect(result.value.title).toContain('[Portfolio]');
      }
    });

    it('business-plan 유형 산출물을 생성한다', () => {
      const doc = createDocument();
      const result = builder.build('proj-1', 'business-plan', [doc]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.format).toBe('markdown');
        expect(result.value.content).toContain('Business Plan');
        expect(result.value.title).toContain('[Business Plan]');
      }
    });

    it('presentation 유형 산출물을 생성한다', () => {
      const doc = createDocument();
      const result = builder.build('proj-1', 'presentation', [doc]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.format).toBe('html');
        expect(result.value.content).toContain('<div class="slides">');
      }
    });

    it('custom 유형 산출물을 생성한다', () => {
      const doc = createDocument();
      const result = builder.build('proj-1', 'custom', [doc]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.format).toBe('json');
        const parsed = JSON.parse(result.value.content);
        expect(parsed.type).toBe('custom');
      }
    });

    it('여러 문서를 하나로 결합한다', () => {
      const doc1 = createDocument({ id: 'doc-1', content: 'Content A' });
      const doc2 = createDocument({ id: 'doc-2', content: 'Content B' });

      const result = builder.build('proj-1', 'report', [doc1, doc2]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('Content A');
        expect(result.value.content).toContain('Content B');
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', () => {
      const result = builder.build('', 'report', [createDocument()]);
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 프로젝트 ID는 에러를 반환한다', () => {
      const result = builder.build('   ', 'report', [createDocument()]);
      expect(result.ok).toBe(false);
    });

    it('빈 문서 목록은 에러를 반환한다', () => {
      const result = builder.build('proj-1', 'report', []);
      expect(result.ok).toBe(false);
    });

    it('고유한 산출물 ID를 생성한다', () => {
      const doc = createDocument();
      const r1 = builder.build('proj-1', 'report', [doc]);
      const r2 = builder.build('proj-1', 'report', [doc]);
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  describe('listDeliverables / 산출물 목록', () => {
    it('프로젝트별 산출물을 반환한다', () => {
      const doc = createDocument();
      builder.build('proj-1', 'report', [doc]);
      builder.build('proj-2', 'portfolio', [doc]);
      builder.build('proj-1', 'business-plan', [doc]);

      const proj1 = builder.listDeliverables('proj-1');
      expect(proj1).toHaveLength(2);

      const proj2 = builder.listDeliverables('proj-2');
      expect(proj2).toHaveLength(1);
    });

    it('산출물이 없으면 빈 배열을 반환한다', () => {
      expect(builder.listDeliverables('proj-999')).toHaveLength(0);
    });
  });

  describe('getDeliverable / 산출물 조회', () => {
    it('ID로 산출물을 조회한다', () => {
      const doc = createDocument();
      const buildResult = builder.build('proj-1', 'report', [doc]);
      if (!buildResult.ok) return;

      const deliverable = builder.getDeliverable(buildResult.value.id);
      expect(deliverable).not.toBeNull();
      expect(deliverable?.type).toBe('report');
    });

    it('존재하지 않는 ID는 null을 반환한다', () => {
      expect(builder.getDeliverable('nonexistent-id')).toBeNull();
    });
  });
});
