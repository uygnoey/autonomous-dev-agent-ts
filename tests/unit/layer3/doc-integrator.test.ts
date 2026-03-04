/**
 * DocIntegrator 단위 테스트 / DocIntegrator unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DocIntegrator } from '../../../src/layer3/doc-integrator.js';
import type { DocumentTemplate, IntegratedDocument } from '../../../src/layer3/types.js';

describe('DocIntegrator', () => {
  let integrator: DocIntegrator;

  const createTemplate = (
    overrides?: Partial<DocumentTemplate>,
  ): DocumentTemplate => ({
    type: 'api-reference',
    title: 'Test Document',
    sections: [
      { heading: 'Overview', content: 'Project overview', order: 1, required: true },
      { heading: 'Details', content: 'Project details', order: 2, required: false },
    ],
    language: 'bilingual',
    ...overrides,
  });

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    integrator = new DocIntegrator(logger);
  });

  describe('integrate / 문서 통합', () => {
    it('조각 문서를 통합 문서로 병합한다', () => {
      const template = createTemplate();
      const result = integrator.integrate(['frag-1', 'frag-2'], template, 'proj-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.sourceFragments).toEqual(['frag-1', 'frag-2']);
        expect(result.value.content).toContain('Test Document');
        expect(result.value.version).toBe(1);
      }
    });

    it('섹션을 order 기준으로 정렬한다', () => {
      const template = createTemplate({
        sections: [
          { heading: 'Second', content: 'B content', order: 2, required: false },
          { heading: 'First', content: 'A content', order: 1, required: true },
        ],
      });

      const result = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const firstIdx = result.value.content.indexOf('First');
        const secondIdx = result.value.content.indexOf('Second');
        expect(firstIdx).toBeLessThan(secondIdx);
      }
    });

    it('필수 섹션 내용이 비면 플레이스홀더를 삽입한다', () => {
      const template = createTemplate({
        sections: [
          { heading: 'Required Section', content: '', order: 1, required: true },
        ],
      });

      const result = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('내용 필요');
      }
    });

    it('선택 섹션 내용이 비면 생략한다', () => {
      const template = createTemplate({
        sections: [
          { heading: 'Optional Section', content: '', order: 1, required: false },
        ],
      });

      const result = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).not.toContain('Optional Section');
      }
    });

    it('빈 조각 목록은 에러를 반환한다', () => {
      const template = createTemplate();
      const result = integrator.integrate([], template, 'proj-1');
      expect(result.ok).toBe(false);
    });

    it('빈 섹션 템플릿은 에러를 반환한다', () => {
      const template = createTemplate({ sections: [] });
      const result = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(result.ok).toBe(false);
    });

    it('고유한 문서 ID를 생성한다', () => {
      const template = createTemplate();
      const r1 = integrator.integrate(['frag-1'], template, 'proj-1');
      const r2 = integrator.integrate(['frag-2'], template, 'proj-1');
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });
  });

  describe('updateDocument / 문서 업데이트', () => {
    it('기존 문서에 새 조각을 추가한다', () => {
      const template = createTemplate();
      const intResult = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(intResult.ok).toBe(true);
      if (!intResult.ok) return;

      const updateResult = integrator.updateDocument(intResult.value, ['frag-2', 'frag-3']);
      expect(updateResult.ok).toBe(true);
      if (updateResult.ok) {
        expect(updateResult.value.sourceFragments).toContain('frag-1');
        expect(updateResult.value.sourceFragments).toContain('frag-2');
        expect(updateResult.value.sourceFragments).toContain('frag-3');
        expect(updateResult.value.version).toBe(2);
      }
    });

    it('빈 새 조각 목록은 에러를 반환한다', () => {
      const template = createTemplate();
      const intResult = integrator.integrate(['frag-1'], template, 'proj-1');
      if (!intResult.ok) return;

      const updateResult = integrator.updateDocument(intResult.value, []);
      expect(updateResult.ok).toBe(false);
    });

    it('버전이 증가한다', () => {
      const template = createTemplate();
      const intResult = integrator.integrate(['frag-1'], template, 'proj-1');
      if (!intResult.ok) return;

      const u1 = integrator.updateDocument(intResult.value, ['frag-2']);
      if (!u1.ok) return;
      expect(u1.value.version).toBe(2);

      const u2 = integrator.updateDocument(u1.value, ['frag-3']);
      if (!u2.ok) return;
      expect(u2.value.version).toBe(3);
    });
  });

  describe('exportAsMarkdown / 마크다운 내보내기', () => {
    it('통합 문서를 마크다운으로 내보낸다', () => {
      const template = createTemplate();
      const intResult = integrator.integrate(['frag-1'], template, 'proj-1');
      if (!intResult.ok) return;

      const exportResult = integrator.exportAsMarkdown(intResult.value);
      expect(exportResult.ok).toBe(true);
      if (exportResult.ok) {
        expect(exportResult.value).toContain('title: Test Document');
        expect(exportResult.value).toContain('version: 1');
      }
    });
  });
});
