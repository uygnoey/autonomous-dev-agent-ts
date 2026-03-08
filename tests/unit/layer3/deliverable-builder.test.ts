/**
 * DeliverableBuilder 단위 테스트 / DeliverableBuilder unit tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { DeliverableBuilder } from 'layer3/deliverable-builder.js';
import type {
  DeliverableBuildOptions,
  DeliverableMetadata,
  DocumentTemplate,
} from 'layer3/types.js';

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

  describe('생성자', () => {
    it('인스턴스 생성됨', () => {
      expect(builder).toBeInstanceOf(DeliverableBuilder);
    });

    it('두 인스턴스는 다른 객체', () => {
      const b2 = new DeliverableBuilder(mockCollaborator, new ConsoleLogger('error'));
      expect(builder).not.toBe(b2);
    });

    it('build 메서드 존재', () => {
      expect(typeof builder.build).toBe('function');
    });

    it('buildAll 메서드 존재', () => {
      expect(typeof builder.buildAll).toBe('function');
    });

    it('listTemplates 메서드 존재', () => {
      expect(typeof builder.listTemplates).toBe('function');
    });

    it('registerTemplate 메서드 존재', () => {
      expect(typeof builder.registerTemplate).toBe('function');
    });
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

    it('build 결과에 id 필드 있음', async () => {
      const result = await builder.build({
        projectId: 'proj-1',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      if (result.ok) {
        expect(typeof result.value.id).toBe('string');
        expect(result.value.id.length).toBeGreaterThan(0);
      }
    });

    it('build 결과에 content 필드 있음', async () => {
      const result = await builder.build({
        projectId: 'proj-1',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      if (result.ok) {
        expect(typeof result.value.content).toBe('string');
      }
    });

    it('build 결과에 outputPath 필드 있음', async () => {
      const outPath = join(tempDir, 'out.pdf');
      const result = await builder.build({
        projectId: 'proj-1',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: outPath,
      });
      if (result.ok) {
        expect(typeof result.value.outputPath).toBe('string');
      }
    });

    it('projectId가 결과에 그대로 반영됨', async () => {
      const result = await builder.build({
        projectId: 'unique-proj-xyz',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      if (result.ok) {
        expect(result.value.projectId).toBe('unique-proj-xyz');
      }
    });

    it('status가 completed임', async () => {
      const result = await builder.build({
        projectId: 'proj-1',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('한국어 프로젝트명 → content에 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-kr',
        type: 'portfolio',
        metadata: createMetadata({ projectName: '한국어 프로젝트' }),
        outputPath: join(tempDir, 'out.pdf'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('한국어 프로젝트');
      }
    });

    it('긴 projectId → ok', async () => {
      const longId = 'proj-' + 'x'.repeat(100);
      const result = await builder.build({
        projectId: longId,
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe(longId);
      }
    });

    it('business-plan projectId 보존', async () => {
      const result = await builder.build({
        projectId: 'bp-proj-999',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'bp.docx'),
      });
      if (result.ok) {
        expect(result.value.projectId).toBe('bp-proj-999');
      }
    });

    it('investment-proposal 결과에 projectId 보존', async () => {
      const result = await builder.build({
        projectId: 'inv-proj-001',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'inv.pdf'),
      });
      if (result.ok) {
        expect(result.value.projectId).toBe('inv-proj-001');
      }
    });

    it('presentation 결과에 projectId 보존', async () => {
      const result = await builder.build({
        projectId: 'pres-proj-777',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'pres.pptx'),
      });
      if (result.ok) {
        expect(result.value.projectId).toBe('pres-proj-777');
      }
    });

    it('에러 반환 시 ok=false이고 error.code는 string', async () => {
      const result = await builder.build({
        projectId: '',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'out.pdf'),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
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

    it('모든 산출물 ID가 고유함', async () => {
      const result = await builder.buildAll('proj-uniq', createMetadata(), tempDir);
      if (result.ok) {
        const ids = result.value.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('모든 산출물 status가 completed', async () => {
      const result = await builder.buildAll('proj-status', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.status).toBe('completed');
        }
      }
    });

    it('모든 산출물 content는 string', async () => {
      const result = await builder.buildAll('proj-content', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(typeof d.content).toBe('string');
        }
      }
    });

    it('모든 산출물 projectId 보존', async () => {
      const result = await builder.buildAll('proj-preserved', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.projectId).toBe('proj-preserved');
        }
      }
    });

    it('빈 projectId → err', async () => {
      const result = await builder.buildAll('', createMetadata(), tempDir);
      expect(result.ok).toBe(false);
    });

    it('한국어 프로젝트명 → content에 포함됨', async () => {
      const result = await builder.buildAll(
        'proj-kr',
        createMetadata({ projectName: '한국어 테스트 프로젝트' }),
        tempDir,
      );
      if (result.ok) {
        const portfolio = result.value.find((d) => d.type === 'portfolio');
        expect(portfolio?.content).toContain('한국어 테스트 프로젝트');
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

    it('반환값은 배열', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('각 템플릿에 id 필드 있음', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(typeof t.id).toBe('string');
          expect(t.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('각 템플릿에 type 필드 있음', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(typeof t.type).toBe('string');
        }
      }
    });

    it('각 템플릿에 format 필드 있음', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(typeof t.format).toBe('string');
        }
      }
    });

    it('연속 2번 호출 → 결과 동일', async () => {
      const r1 = await builder.listTemplates(false);
      const r2 = await builder.listTemplates(false);
      if (r1.ok && r2.ok) {
        expect(r1.value.length).toBe(r2.value.length);
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

    it('에러 시 ok=false이고 error.code는 string', async () => {
      const result = await builder.registerTemplate({
        id: 'custom-report-2',
        name: 'custom-report-2',
        type: 'portfolio',
        templatePath: '/no/such/file.hbs',
        format: 'pdf',
        description: 'Test',
        custom: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
      }
    });

    it('중복 ID "default-portfolio" → 에러 반환', async () => {
      const result = await builder.registerTemplate({
        id: 'default-portfolio',
        name: 'dup',
        type: 'portfolio',
        templatePath: 'any',
        format: 'pdf',
        description: 'dup',
        custom: false,
      });
      expect(result.ok).toBe(false);
    });

    it('존재하지 않는 경로 → not_found 에러', async () => {
      const result = await builder.registerTemplate({
        id: 'brand-new-template',
        name: 'brand-new-template',
        type: 'portfolio',
        templatePath: '/absolutely/nonexistent/path.hbs',
        format: 'pdf',
        description: 'new',
        custom: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_deliverable_template_not_found');
      }
    });
  });
});
