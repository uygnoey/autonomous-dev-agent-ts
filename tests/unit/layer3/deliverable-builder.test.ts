/**
 * DeliverableBuilder 단위 테스트 / DeliverableBuilder unit tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from '../../../src/core/logger.js';
import { DeliverableBuilder } from '../../../src/layer3/deliverable-builder.js';
import type {
  DeliverableBuildOptions,
  DeliverableMetadata,
  DocumentTemplate,
} from '../../../src/layer3/types.js';

describe('DeliverableBuilder', () => {
  let builder: DeliverableBuilder;
  let tempDir: string;

  // WHY: DocCollaborator 최소 모킹
  const mockCollaborator = {} as unknown as DocCollaborator;

  const createMetadata = (overrides?: Partial<DeliverableMetadata>): DeliverableMetadata => ({
    projectName: 'Test Project',
    projectDescription: 'Test project description',
    targetAudience: 'Developers',
    purpose: 'Testing',
    ...overrides,
  });

  beforeEach(async () => {
    const logger = new ConsoleLogger('error');
    builder = new DeliverableBuilder(mockCollaborator, logger);

    // WHY: 임시 디렉토리 생성
    tempDir = join(tmpdir(), `adev-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // WHY: 임시 디렉토리 정리
    if (existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('build / 산출물 생성', () => {
    it('portfolio 산출물을 생성한다 (PDF)', async () => {
      const metadata = createMetadata();
      const outputPath = join(tempDir, 'portfolio.pdf');
      const options: DeliverableBuildOptions = {
        projectId: 'proj-1',
        type: 'portfolio',
        metadata,
        outputPath,
      };

      const result = await builder.build(options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-1');
        expect(result.value.type).toBe('portfolio');
        expect(result.value.format).toBe('pdf');
        expect(result.value.status).toBe('completed');
        expect(result.value.content).toContain('Test Project');
        expect(result.value.outputPath).toContain('portfolio.pdf');
      }
    });

    it('business-plan 산출물을 생성한다 (DOCX)', async () => {
      const metadata = createMetadata();
      const outputPath = join(tempDir, 'business-plan.docx');
      const options: DeliverableBuildOptions = {
        projectId: 'proj-2',
        type: 'business-plan',
        metadata,
        outputPath,
      };

      const result = await builder.build(options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('business-plan');
        expect(result.value.format).toBe('docx');
        expect(result.value.content).toContain('사업 계획서');
      }
    });

    it('investment-proposal 산출물을 생성한다 (PDF)', async () => {
      const metadata = createMetadata();
      const outputPath = join(tempDir, 'investment-proposal.pdf');
      const options: DeliverableBuildOptions = {
        projectId: 'proj-3',
        type: 'investment-proposal',
        metadata,
        outputPath,
      };

      const result = await builder.build(options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('investment-proposal');
        expect(result.value.format).toBe('pdf');
        expect(result.value.content).toContain('투자 제안서');
      }
    });

    it('presentation 산출물을 생성한다 (PPTX)', async () => {
      const metadata = createMetadata();
      const outputPath = join(tempDir, 'presentation.pptx');
      const options: DeliverableBuildOptions = {
        projectId: 'proj-4',
        type: 'presentation',
        metadata,
        outputPath,
      };

      const result = await builder.build(options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('presentation');
        expect(result.value.format).toBe('pptx');
        expect(result.value.content).toContain('Introduction');
      }
    });

    it('빈 프로젝트 ID는 에러를 반환한다', async () => {
      const options: DeliverableBuildOptions = {
        projectId: '',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'test.pdf'),
      };

      const result = await builder.build(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('agent_invalid_input');
      }
    });

    it('공백만 있는 프로젝트 ID는 에러를 반환한다', async () => {
      const options: DeliverableBuildOptions = {
        projectId: '   ',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'test.pdf'),
      };

      const result = await builder.build(options);
      expect(result.ok).toBe(false);
    });

    it('고유한 산출물 ID를 생성한다', async () => {
      const metadata = createMetadata();
      const options1: DeliverableBuildOptions = {
        projectId: 'proj-1',
        type: 'portfolio',
        metadata,
        outputPath: join(tempDir, 'portfolio1.pdf'),
      };
      const options2: DeliverableBuildOptions = {
        projectId: 'proj-1',
        type: 'portfolio',
        metadata,
        outputPath: join(tempDir, 'portfolio2.pdf'),
      };

      const r1 = await builder.build(options1);
      const r2 = await builder.build(options2);

      if (r1.ok && r2.ok) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });

    it('extra 메타데이터를 포함한다', async () => {
      const metadata = createMetadata({
        extra: {
          version: '1.0.0',
          author: 'Test Author',
        },
      });
      const outputPath = join(tempDir, 'portfolio.pdf');
      const options: DeliverableBuildOptions = {
        projectId: 'proj-1',
        type: 'portfolio',
        metadata,
        outputPath,
      };

      const result = await builder.build(options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('version');
        expect(result.value.content).toContain('1.0.0');
      }
    });
  });

  describe('buildAll / 모든 산출물 생성', () => {
    it('4개의 기본 산출물을 모두 생성한다', async () => {
      const metadata = createMetadata();
      const result = await builder.buildAll('proj-1', metadata, tempDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(4);
        const types = result.value.map((d) => d.type);
        expect(types).toContain('portfolio');
        expect(types).toContain('business-plan');
        expect(types).toContain('investment-proposal');
        expect(types).toContain('presentation');
      }
    });

    it('각 산출물은 올바른 기본 형식을 갖는다', async () => {
      const metadata = createMetadata();
      const result = await builder.buildAll('proj-1', metadata, tempDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const portfolio = result.value.find((d) => d.type === 'portfolio');
        expect(portfolio?.format).toBe('pdf');

        const businessPlan = result.value.find((d) => d.type === 'business-plan');
        expect(businessPlan?.format).toBe('docx');

        const investmentProposal = result.value.find((d) => d.type === 'investment-proposal');
        expect(investmentProposal?.format).toBe('pdf');

        const presentation = result.value.find((d) => d.type === 'presentation');
        expect(presentation?.format).toBe('pptx');
      }
    });
  });

  describe('listTemplates / 템플릿 목록', () => {
    it('기본 템플릿 4개를 반환한다', async () => {
      const result = await builder.listTemplates(false);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(4);
        const types = result.value.map((t) => t.type);
        expect(types).toContain('portfolio');
        expect(types).toContain('business-plan');
        expect(types).toContain('investment-proposal');
        expect(types).toContain('presentation');
      }
    });

    it('커스텀 템플릿 포함 옵션이 작동한다', async () => {
      const result = await builder.listTemplates(true);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('registerTemplate / 커스텀 템플릿 등록', () => {
    it('존재하는 템플릿 파일은 등록할 수 없다 (파일 없음)', async () => {
      const customTemplate: DocumentTemplate = {
        id: 'custom-report',
        name: 'custom-report',
        type: 'portfolio',
        templatePath: '/nonexistent/path/template.hbs',
        format: 'pdf',
        description: 'Custom report template',
        custom: true,
      };

      const result = await builder.registerTemplate(customTemplate);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_deliverable_template_not_found');
      }
    });

    it('중복된 템플릿 ID는 에러를 반환한다', async () => {
      const duplicateTemplate: DocumentTemplate = {
        id: 'default-portfolio',
        name: 'portfolio',
        type: 'portfolio',
        templatePath: 'templates/business/portfolio.hbs',
        format: 'pdf',
        description: 'Duplicate portfolio template',
        custom: false,
      };

      const result = await builder.registerTemplate(duplicateTemplate);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_deliverable_template_duplicate');
      }
    });
  });
});
