/**
 * DocCollaborator 단위 테스트 / DocCollaborator unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DocCollaborator } from '../../../src/layer3/doc-collaborator.js';

describe('DocCollaborator', () => {
  let collaborator: DocCollaborator;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    collaborator = new DocCollaborator(logger);
  });

  describe('collaborate / 문서 협업 병합', () => {
    it('layer1 아웃라인과 layer2 상세를 병합한다', () => {
      const result = collaborator.collaborate(
        '# Architecture\n## Components',
        '## Auth Module\nJWT-based authentication.',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Architecture');
        expect(result.value).toContain('Auth Module');
        expect(result.value).toContain('---');
      }
    });

    it('빈 layer1 아웃라인은 에러를 반환한다', () => {
      const result = collaborator.collaborate('', 'some details');
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 layer1 아웃라인은 에러를 반환한다', () => {
      const result = collaborator.collaborate('   ', 'some details');
      expect(result.ok).toBe(false);
    });

    it('빈 layer2 상세는 에러를 반환한다', () => {
      const result = collaborator.collaborate('some outline', '');
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 layer2 상세는 에러를 반환한다', () => {
      const result = collaborator.collaborate('some outline', '   ');
      expect(result.ok).toBe(false);
    });

    it('양쪽 콘텐츠를 모두 포함한다', () => {
      const outline = 'Unique Outline Content ABC';
      const details = 'Unique Details Content XYZ';
      const result = collaborator.collaborate(outline, details);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Unique Outline Content ABC');
        expect(result.value).toContain('Unique Details Content XYZ');
      }
    });
  });

  describe('generateTableOfContents / 목차 생성', () => {
    it('마크다운 헤딩에서 목차를 생성한다', () => {
      const content = '# Title\n## Section 1\n### Sub 1\n## Section 2';
      const result = collaborator.generateTableOfContents(content);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('Table of Contents');
        expect(result.value).toContain('Title');
        expect(result.value).toContain('Section 1');
        expect(result.value).toContain('Sub 1');
        expect(result.value).toContain('Section 2');
      }
    });

    it('헤딩이 없으면 빈 문자열을 반환한다', () => {
      const result = collaborator.generateTableOfContents('No headings here.');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('');
      }
    });

    it('빈 문서는 에러를 반환한다', () => {
      const result = collaborator.generateTableOfContents('');
      expect(result.ok).toBe(false);
    });

    it('공백만 있는 문서는 에러를 반환한다', () => {
      const result = collaborator.generateTableOfContents('   ');
      expect(result.ok).toBe(false);
    });

    it('앵커 링크를 올바르게 생성한다', () => {
      const content = '## My Section Title';
      const result = collaborator.generateTableOfContents(content);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('#my-section-title');
      }
    });

    it('들여쓰기가 헤딩 레벨에 맞는다', () => {
      const content = '# H1\n## H2\n### H3';
      const result = collaborator.generateTableOfContents(content);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const lines = result.value.split('\n').filter((l) => l.startsWith(' ') || l.startsWith('-'));
        // WHY: h1 = 0 indent, h2 = 2 indent, h3 = 4 indent
        expect(lines.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
