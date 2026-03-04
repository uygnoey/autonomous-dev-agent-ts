/**
 * DocIntegrator 단위 테스트 / DocIntegrator unit tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DocIntegrator } from '../../../src/layer3/doc-integrator.js';
import type { DocumentTemplate } from '../../../src/layer3/types.js';

describe('DocIntegrator', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    const logger = new ConsoleLogger('error');
    integrator = new DocIntegrator(logger);
  });

  describe('integrate / 문서 통합', () => {
    it('조각 문서를 통합 문서로 병합한다', () => {
      const template: DocumentTemplate = {
        id: 'test-tpl',
        type: 'api-reference',
        title: 'API Reference',
        sections: [{ heading: 'Endpoints', content: 'GET /api/v1/users' }],
      };

      const result = integrator.integrate(['frag-1', 'frag-2'], template, 'proj-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.type).toBe('api-reference');
        expect(result.value.content).toBeTruthy();
        expect(result.value.id).toBeTruthy();
      }
    });

    it('빈 조각 목록은 에러를 반환한다', () => {
      const template: DocumentTemplate = {
        type: 'readme',
        title: 'README',
        sections: [{ heading: 'Overview', content: 'Test' }],
      };

      const result = integrator.integrate([], template, 'proj-1');
      expect(result.ok).toBe(false);
    });

    it('고유한 문서 ID를 생성한다', () => {
      const template: DocumentTemplate = {
        type: 'readme',
        title: 'README',
        sections: [{ heading: 'Overview', content: 'Test' }],
      };

      const r1 = integrator.integrate(['frag-1'], template, 'proj-1');
      const r2 = integrator.integrate(['frag-2'], template, 'proj-1');
      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });

    it('섹션이 없는 템플릿은 에러를 반환한다', () => {
      const template: DocumentTemplate = {
        type: 'readme',
        title: 'README',
        sections: [],
      };

      const result = integrator.integrate(['frag-1'], template, 'proj-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('섹션이 비어');
      }
    });
  });

  describe('generateAll / 모든 프로젝트 문서 생성', () => {
    it('유효한 프로젝트 ID로 호출하면 성공한다', async () => {
      const result = await integrator.generateAll('proj-1', '.adev/docs');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // WHY: 현재 generateAll은 빈 배열 반환 (파일시스템 미연동)
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', async () => {
      const result = await integrator.generateAll('', '.adev/docs');
      expect(result.ok).toBe(false);
    });
  });

  describe('listTemplates / 템플릿 목록 조회', () => {
    it('기본 템플릿 8개를 반환한다', async () => {
      const result = await integrator.listTemplates(false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(8);
        const names = result.value.map((t) => t.name);
        expect(names).toContain('readme');
        expect(names).toContain('api-reference');
      }
    });

    it('커스텀 템플릿 포함 옵션을 지원한다', async () => {
      const result = await integrator.listTemplates(true);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(8);
      }
    });
  });

  describe('registerTemplate / 커스텀 템플릿 등록', () => {
    it('새 커스텀 템플릿을 등록한다', async () => {
      const customTemplate: DocumentTemplate = {
        id: 'custom-1',
        name: 'custom',
        type: 'readme',
        templatePath: 'templates/custom.hbs',
        format: 'md',
        description: 'Custom template',
        custom: true,
      };

      const result = await integrator.registerTemplate(customTemplate);
      expect(result.ok).toBe(true);

      // WHY: 등록 후 조회 가능 확인
      const listResult = await integrator.listTemplates(true);
      if (listResult.ok) {
        const registered = listResult.value.find((t) => t.id === 'custom-1');
        expect(registered).toBeTruthy();
      }
    });

    it('중복 템플릿 ID는 에러를 반환한다', async () => {
      const template: DocumentTemplate = {
        id: 'default-readme',
        name: 'readme',
        type: 'readme',
        templatePath: 'templates/readme.hbs',
        format: 'md',
        description: 'Duplicate',
        custom: false,
      };

      const result = await integrator.registerTemplate(template);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('이미 존재');
      }
    });
  });

  describe('collectFragments / 조각 문서 수집', () => {
    it('패턴에 맞는 조각 문서를 수집한다', async () => {
      const result = await integrator.collectFragments('proj-1', '**/*.md');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // WHY: 실제 파일이 없으므로 빈 배열 반환
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', async () => {
      const result = await integrator.collectFragments('', '**/*.md');
      expect(result.ok).toBe(false);
    });
  });
});
