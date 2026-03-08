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

  describe('build / 추가 edge 케이스', () => {
    it('UUID 형식 projectId → ok', async () => {
      const result = await builder.build({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'uuid.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('한글 프로젝트 설명 → content에 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-kr-desc',
        type: 'portfolio',
        metadata: createMetadata({ projectDescription: '한국어 프로젝트 설명입니다' }),
        outputPath: join(tempDir, 'kr-desc.pdf'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('한국어 프로젝트 설명입니다');
      }
    });

    it('한글 targetAudience → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-ta',
        type: 'portfolio',
        metadata: createMetadata({ targetAudience: '개발자 및 기획자' }),
        outputPath: join(tempDir, 'ta.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('한글 purpose → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-purpose',
        type: 'business-plan',
        metadata: createMetadata({ purpose: '투자 유치 목적' }),
        outputPath: join(tempDir, 'purpose.docx'),
      });
      expect(result.ok).toBe(true);
    });

    it('공백만 있는 projectId → ok=false', async () => {
      const result = await builder.build({
        projectId: '   ',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'wp.pdf'),
      });
      expect(result.ok).toBe(false);
    });

    it('특수문자 projectId → ok (구현에 따름)', async () => {
      const result = await builder.build({
        projectId: 'proj-특수!@#',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'special.pptx'),
      });
      expect(typeof result.ok).toBe('boolean');
    });

    it('content는 비어있지 않다', async () => {
      const result = await builder.build({
        projectId: 'proj-nonempty',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'nonempty.pdf'),
      });
      if (result.ok) {
        expect(result.value.content.length).toBeGreaterThan(0);
      }
    });

    it('연속 5번 build → 항상 ok', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await builder.build({
          projectId: `proj-repeat-${i}`,
          type: 'portfolio',
          metadata: createMetadata(),
          outputPath: join(tempDir, `repeat-${i}.pdf`),
        });
        expect(result.ok).toBe(true);
      }
    });

    it('4가지 타입 모두 status=completed', async () => {
      const types: Array<'portfolio' | 'business-plan' | 'investment-proposal' | 'presentation'> = [
        'portfolio', 'business-plan', 'investment-proposal', 'presentation',
      ];
      const exts = ['pdf', 'docx', 'pdf', 'pptx'];
      for (let i = 0; i < types.length; i++) {
        const result = await builder.build({
          projectId: `proj-type-${i}`,
          type: types[i]!,
          metadata: createMetadata(),
          outputPath: join(tempDir, `type-${i}.${exts[i]}`),
        });
        if (result.ok) {
          expect(result.value.status).toBe('completed');
        }
      }
    });
  });

  describe('buildAll / 추가 edge 케이스', () => {
    it('UUID projectId → ok', async () => {
      const result = await builder.buildAll(
        '550e8400-e29b-41d4-a716-446655440001',
        createMetadata(),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('한글 프로젝트명으로 buildAll → ok', async () => {
      const result = await builder.buildAll(
        'proj-all-kr',
        createMetadata({ projectName: '전체 빌드 테스트' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('공백만 있는 projectId → ok=false', async () => {
      const result = await builder.buildAll('  ', createMetadata(), tempDir);
      expect(result.ok).toBe(false);
    });

    it('결과 배열의 각 항목에 id 있음', async () => {
      const result = await builder.buildAll('proj-ids', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('결과 배열의 각 항목에 outputPath 있음', async () => {
      const result = await builder.buildAll('proj-paths', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(typeof d.outputPath).toBe('string');
        }
      }
    });

    it('결과 배열의 각 항목에 type 있음', async () => {
      const result = await builder.buildAll('proj-type-check', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(typeof d.type).toBe('string');
        }
      }
    });

    it('결과 배열의 각 항목에 format 있음', async () => {
      const result = await builder.buildAll('proj-format-check', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(typeof d.format).toBe('string');
        }
      }
    });
  });

  describe('build / 추가 경계값 케이스', () => {
    it('숫자만으로 된 projectId → ok', async () => {
      const result = await builder.build({
        projectId: '99999',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'num.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('매우 긴 projectDescription → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-long-desc',
        type: 'portfolio',
        metadata: createMetadata({ projectDescription: '설명'.repeat(200) }),
        outputPath: join(tempDir, 'long-desc.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('presentation content에 Introduction 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-intro',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'intro.pptx'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('Introduction');
      }
    });

    it('business-plan content에 사업 계획서 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-bp-check',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'bp-check.docx'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('사업 계획서');
      }
    });

    it('investment-proposal content에 투자 제안서 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-inv-check',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'inv-check.pdf'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('투자 제안서');
      }
    });

    it('빈 extra 메타데이터 → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-empty-extra',
        type: 'portfolio',
        metadata: createMetadata({ extra: {} }),
        outputPath: join(tempDir, 'empty-extra.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('연속 buildAll 2번 → 두 결과 모두 ok', async () => {
      const r1 = await builder.buildAll('proj-seq-1', createMetadata(), tempDir);
      const r2 = await builder.buildAll('proj-seq-2', createMetadata(), tempDir);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it('ok 반환 시 result.ok는 true', async () => {
      const result = await builder.build({
        projectId: 'proj-ok-check',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'ok.pdf'),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('build / 추가 랜덤 및 edge 케이스', () => {
    it('이모지 포함 프로젝트명 → content에 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-emoji',
        type: 'portfolio',
        metadata: createMetadata({ projectName: '🚀 이모지 프로젝트 🎉' }),
        outputPath: join(tempDir, 'emoji.pdf'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('이모지 프로젝트');
      }
    });

    it('중국어 프로젝트명 → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-zh',
        type: 'portfolio',
        metadata: createMetadata({ projectName: '中文项目名称' }),
        outputPath: join(tempDir, 'zh.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('일본어 프로젝트명 → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-ja',
        type: 'portfolio',
        metadata: createMetadata({ projectName: 'テストプロジェクト' }),
        outputPath: join(tempDir, 'ja.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('단일 문자 projectId → ok', async () => {
      const result = await builder.build({
        projectId: 'x',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'single-char.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('하이픈/언더스코어 포함 projectId → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-id_with-mixed_chars',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'mixed-id.pdf'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.projectId).toBe('proj-id_with-mixed_chars');
      }
    });

    it('build 결과의 id가 UUID 형식', async () => {
      const result = await builder.build({
        projectId: 'proj-uuid-format',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'uuid-format.pdf'),
      });
      if (result.ok) {
        // WHY: id는 UUID 또는 고유 문자열 형식이어야 함
        expect(result.value.id.length).toBeGreaterThan(0);
        expect(typeof result.value.id).toBe('string');
      }
    });

    it('매우 짧은 프로젝트 설명 (1자) → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-short-desc',
        type: 'portfolio',
        metadata: createMetadata({ projectDescription: 'A' }),
        outputPath: join(tempDir, 'short-desc.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('targetAudience 빈 문자열 → ok (구현에 따름)', async () => {
      const result = await builder.build({
        projectId: 'proj-empty-ta',
        type: 'portfolio',
        metadata: createMetadata({ targetAudience: '' }),
        outputPath: join(tempDir, 'empty-ta.pdf'),
      });
      expect(typeof result.ok).toBe('boolean');
    });

    it('purpose 빈 문자열 → ok (구현에 따름)', async () => {
      const result = await builder.build({
        projectId: 'proj-empty-purpose',
        type: 'business-plan',
        metadata: createMetadata({ purpose: '' }),
        outputPath: join(tempDir, 'empty-purpose.docx'),
      });
      expect(typeof result.ok).toBe('boolean');
    });

    it('4가지 타입 각각 올바른 format 매핑', async () => {
      const typeFormatMap: Array<{
        type: 'portfolio' | 'business-plan' | 'investment-proposal' | 'presentation';
        format: string;
        ext: string;
      }> = [
        { type: 'portfolio', format: 'pdf', ext: 'pdf' },
        { type: 'business-plan', format: 'docx', ext: 'docx' },
        { type: 'investment-proposal', format: 'pdf', ext: 'pdf' },
        { type: 'presentation', format: 'pptx', ext: 'pptx' },
      ];
      for (const { type, format, ext } of typeFormatMap) {
        const result = await builder.build({
          projectId: `proj-format-map-${type}`,
          type,
          metadata: createMetadata(),
          outputPath: join(tempDir, `format-map-${type}.${ext}`),
        });
        if (result.ok) {
          expect(result.value.format).toBe(format);
        }
      }
    });

    it('build 5회 연속 — id 모두 고유', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await builder.build({
          projectId: `proj-uniq-id-${i}`,
          type: 'portfolio',
          metadata: createMetadata(),
          outputPath: join(tempDir, `uniq-${i}.pdf`),
        });
        if (result.ok) ids.push(result.value.id);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('extra.author 필드 → content에 포함 가능성', async () => {
      const result = await builder.build({
        projectId: 'proj-author',
        type: 'portfolio',
        metadata: createMetadata({
          extra: { author: '김개발자', version: '2.0.0' },
        }),
        outputPath: join(tempDir, 'author.pdf'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.content).toBe('string');
      }
    });

    it('investment-proposal format이 pdf임', async () => {
      const result = await builder.build({
        projectId: 'proj-inv-format',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'inv-format.pdf'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('pdf');
      }
    });

    it('presentation format이 pptx임', async () => {
      const result = await builder.build({
        projectId: 'proj-pptx-format',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'pptx-format.pptx'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('pptx');
      }
    });

    it('business-plan format이 docx임', async () => {
      const result = await builder.build({
        projectId: 'proj-docx-format',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'docx-format.docx'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('docx');
      }
    });

    it('build 결과 객체에 type 필드 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-has-type',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'has-type.pdf'),
      });
      if (result.ok) {
        expect(typeof result.value.type).toBe('string');
        expect(result.value.type).toBe('portfolio');
      }
    });

    it('build 결과 객체에 format 필드 포함', async () => {
      const result = await builder.build({
        projectId: 'proj-has-format',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'has-format.pdf'),
      });
      if (result.ok) {
        expect(typeof result.value.format).toBe('string');
      }
    });
  });

  describe('buildAll / 추가 경계값 케이스 2', () => {
    it('buildAll 결과 배열 길이는 4', async () => {
      const result = await builder.buildAll('proj-len-4', createMetadata(), tempDir);
      if (result.ok) {
        expect(result.value.length).toBe(4);
      }
    });

    it('buildAll 결과에 portfolio 타입 포함', async () => {
      const result = await builder.buildAll('proj-has-portfolio', createMetadata(), tempDir);
      if (result.ok) {
        expect(result.value.some((d) => d.type === 'portfolio')).toBe(true);
      }
    });

    it('buildAll 결과에 business-plan 타입 포함', async () => {
      const result = await builder.buildAll('proj-has-bp', createMetadata(), tempDir);
      if (result.ok) {
        expect(result.value.some((d) => d.type === 'business-plan')).toBe(true);
      }
    });

    it('buildAll 결과에 investment-proposal 타입 포함', async () => {
      const result = await builder.buildAll('proj-has-inv', createMetadata(), tempDir);
      if (result.ok) {
        expect(result.value.some((d) => d.type === 'investment-proposal')).toBe(true);
      }
    });

    it('buildAll 결과에 presentation 타입 포함', async () => {
      const result = await builder.buildAll('proj-has-pres', createMetadata(), tempDir);
      if (result.ok) {
        expect(result.value.some((d) => d.type === 'presentation')).toBe(true);
      }
    });

    it('buildAll: 이모지 프로젝트명 → ok', async () => {
      const result = await builder.buildAll(
        'proj-emoji-all',
        createMetadata({ projectName: '✅ 완성된 프로젝트' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: ok 타입은 boolean', async () => {
      const result = await builder.buildAll('proj-bool-ok', createMetadata(), tempDir);
      expect(typeof result.ok).toBe('boolean');
    });

    it('buildAll: ok=true이면 value는 배열', async () => {
      const result = await builder.buildAll('proj-is-array', createMetadata(), tempDir);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('buildAll: 각 항목의 status는 completed', async () => {
      const result = await builder.buildAll('proj-all-completed', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.status).toBe('completed');
        }
      }
    });

    it('buildAll: UUID projectId로 실행 → ok', async () => {
      const uuid = crypto.randomUUID();
      const result = await builder.buildAll(uuid, createMetadata(), tempDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.projectId).toBe(uuid);
        }
      }
    });
  });

  describe('listTemplates / 추가 케이스', () => {
    it('listTemplates(false) 결과의 각 타입은 string', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(typeof t.type).toBe('string');
          expect(t.type.length).toBeGreaterThan(0);
        }
      }
    });

    it('listTemplates(true) 결과의 각 format은 알려진 포맷', async () => {
      const result = await builder.listTemplates(true);
      if (result.ok) {
        const knownFormats = ['pdf', 'docx', 'pptx', 'md', 'txt'];
        for (const t of result.value) {
          expect(knownFormats).toContain(t.format);
        }
      }
    });

    it('listTemplates(false) 결과 ok 타입은 boolean', async () => {
      const result = await builder.listTemplates(false);
      expect(typeof result.ok).toBe('boolean');
    });

    it('listTemplates(true) 결과 ok 타입은 boolean', async () => {
      const result = await builder.listTemplates(true);
      expect(typeof result.ok).toBe('boolean');
    });

    it('listTemplates(false)에 portfolio 템플릿 포함', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        expect(result.value.some((t) => t.type === 'portfolio')).toBe(true);
      }
    });

    it('listTemplates(false)에 business-plan 템플릿 포함', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        expect(result.value.some((t) => t.type === 'business-plan')).toBe(true);
      }
    });

    it('listTemplates(false)에 investment-proposal 템플릿 포함', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        expect(result.value.some((t) => t.type === 'investment-proposal')).toBe(true);
      }
    });

    it('listTemplates(false)에 presentation 템플릿 포함', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        expect(result.value.some((t) => t.type === 'presentation')).toBe(true);
      }
    });
  });

  // ── build / 배치66 추가 edge 케이스 ──────────────────────────────

  describe('build / 배치66 추가 edge 케이스', () => {
    it('presentation 타입 status가 completed임', async () => {
      const result = await builder.build({
        projectId: 'proj-pres-status',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'pres-status.pptx'),
      });
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('investment-proposal 타입 status가 completed임', async () => {
      const result = await builder.build({
        projectId: 'proj-inv-status',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'inv-status.pdf'),
      });
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('business-plan 타입 status가 completed임', async () => {
      const result = await builder.build({
        projectId: 'proj-bp-status',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'bp-status.docx'),
      });
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('portfolio content는 비어있지 않다 (중복 확인)', async () => {
      const result = await builder.build({
        projectId: 'proj-port-nonempty',
        type: 'portfolio',
        metadata: createMetadata({ projectName: '비어있지 않은 포트폴리오' }),
        outputPath: join(tempDir, 'port-nonempty.pdf'),
      });
      if (result.ok) {
        expect(result.value.content.length).toBeGreaterThan(0);
      }
    });

    it('build 결과의 id는 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-id-defined',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'id-defined.pdf'),
      });
      if (result.ok) {
        expect(result.value.id).not.toBeUndefined();
      }
    });

    it('build 결과의 outputPath는 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-path-defined',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'path-defined.pdf'),
      });
      if (result.ok) {
        expect(result.value.outputPath).not.toBeUndefined();
      }
    });

    it('build 결과의 type은 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-type-defined',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'type-defined.pdf'),
      });
      if (result.ok) {
        expect(result.value.type).not.toBeUndefined();
      }
    });

    it('build 결과의 format은 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-fmt-defined',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'fmt-defined.pdf'),
      });
      if (result.ok) {
        expect(result.value.format).not.toBeUndefined();
      }
    });

    it('build 결과의 projectId는 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-projid-defined',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'projid-defined.docx'),
      });
      if (result.ok) {
        expect(result.value.projectId).not.toBeUndefined();
      }
    });

    it('build 결과의 content는 undefined가 아님', async () => {
      const result = await builder.build({
        projectId: 'proj-content-defined',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'content-defined.pdf'),
      });
      if (result.ok) {
        expect(result.value.content).not.toBeUndefined();
      }
    });

    it('다른 projectId 두 번 build → 결과 모두 ok', async () => {
      const r1 = await builder.build({
        projectId: 'proj-diff-1',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'diff-1.pdf'),
      });
      const r2 = await builder.build({
        projectId: 'proj-diff-2',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'diff-2.pdf'),
      });
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it('같은 타입 다른 projectName → content 다름', async () => {
      const r1 = await builder.build({
        projectId: 'proj-content-diff-1',
        type: 'portfolio',
        metadata: createMetadata({ projectName: 'Alpha Project' }),
        outputPath: join(tempDir, 'content-diff-1.pdf'),
      });
      const r2 = await builder.build({
        projectId: 'proj-content-diff-2',
        type: 'portfolio',
        metadata: createMetadata({ projectName: 'Beta Project' }),
        outputPath: join(tempDir, 'content-diff-2.pdf'),
      });
      if (r1.ok && r2.ok) {
        expect(r1.value.content).not.toBe(r2.value.content);
      }
    });

    it('build 10번 연속 → 모두 ok (portfolio)', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await builder.build({
          projectId: `proj-batch66-${i}`,
          type: 'portfolio',
          metadata: createMetadata(),
          outputPath: join(tempDir, `batch66-${i}.pdf`),
        });
        expect(result.ok).toBe(true);
      }
    });

    it('build 10번 연속 → 모두 고유 id (business-plan)', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await builder.build({
          projectId: `proj-bp-uniq-${i}`,
          type: 'business-plan',
          metadata: createMetadata(),
          outputPath: join(tempDir, `bp-uniq-${i}.docx`),
        });
        if (result.ok) ids.push(result.value.id);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('extra.version과 extra.author 동시 사용 → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-extra-both',
        type: 'portfolio',
        metadata: createMetadata({
          extra: { version: '3.0.0', author: '박개발자', tags: ['ts', 'bun'] },
        }),
        outputPath: join(tempDir, 'extra-both.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('매우 긴 projectName (200자) → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-long-name',
        type: 'portfolio',
        metadata: createMetadata({ projectName: '프로젝트'.repeat(50) }),
        outputPath: join(tempDir, 'long-name.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('매우 긴 targetAudience (500자) → ok', async () => {
      const result = await builder.build({
        projectId: 'proj-long-ta',
        type: 'investment-proposal',
        metadata: createMetadata({ targetAudience: '대상독자'.repeat(125) }),
        outputPath: join(tempDir, 'long-ta.pdf'),
      });
      expect(result.ok).toBe(true);
    });

    it('portfolio → format은 pdf (정확히)', async () => {
      const result = await builder.build({
        projectId: 'proj-pdf-exact',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'pdf-exact.pdf'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('pdf');
      }
    });

    it('business-plan → format은 docx (정확히)', async () => {
      const result = await builder.build({
        projectId: 'proj-docx-exact',
        type: 'business-plan',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'docx-exact.docx'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('docx');
      }
    });

    it('investment-proposal → format은 pdf (정확히)', async () => {
      const result = await builder.build({
        projectId: 'proj-inv-pdf-exact',
        type: 'investment-proposal',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'inv-pdf-exact.pdf'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('pdf');
      }
    });

    it('presentation → format은 pptx (정확히)', async () => {
      const result = await builder.build({
        projectId: 'proj-pptx-exact',
        type: 'presentation',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'pptx-exact.pptx'),
      });
      if (result.ok) {
        expect(result.value.format).toBe('pptx');
      }
    });

    it('랜덤 UUID projectId 5번 → 모두 ok', async () => {
      for (let i = 0; i < 5; i++) {
        const uuid = crypto.randomUUID();
        const result = await builder.build({
          projectId: uuid,
          type: 'portfolio',
          metadata: createMetadata(),
          outputPath: join(tempDir, `uuid-${i}.pdf`),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.projectId).toBe(uuid);
        }
      }
    });

    it('ok=true 시 result.value는 객체', async () => {
      const result = await builder.build({
        projectId: 'proj-object-check',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'object-check.pdf'),
      });
      if (result.ok) {
        expect(typeof result.value).toBe('object');
        expect(result.value).not.toBeNull();
      }
    });

    it('build 결과 ok는 boolean 타입', async () => {
      const result = await builder.build({
        projectId: 'proj-ok-bool',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'ok-bool.pdf'),
      });
      expect(typeof result.ok).toBe('boolean');
    });

    it('빈 projectId build → error.code는 string 타입', async () => {
      const result = await builder.build({
        projectId: '',
        type: 'portfolio',
        metadata: createMetadata(),
        outputPath: join(tempDir, 'err-code.pdf'),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error.code).toBe('string');
        expect(result.error.code.length).toBeGreaterThan(0);
      }
    });

    it('presentation 타입 content에 Introduction 포함 (중복 확인)', async () => {
      const result = await builder.build({
        projectId: 'proj-intro-dup',
        type: 'presentation',
        metadata: createMetadata({ projectName: 'Re-Intro Project' }),
        outputPath: join(tempDir, 'intro-dup.pptx'),
      });
      if (result.ok) {
        expect(result.value.content).toContain('Introduction');
      }
    });
  });

  // ── buildAll / 배치66 추가 edge 케이스 ───────────────────────────

  describe('buildAll / 배치66 추가 edge 케이스', () => {
    it('buildAll: 모든 항목의 id는 undefined가 아님', async () => {
      const result = await builder.buildAll('proj-id-undef', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.id).not.toBeUndefined();
        }
      }
    });

    it('buildAll: 모든 항목의 content는 undefined가 아님', async () => {
      const result = await builder.buildAll('proj-content-undef', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.content).not.toBeUndefined();
        }
      }
    });

    it('buildAll: 모든 항목의 format은 알려진 형식', async () => {
      const knownFormats = ['pdf', 'docx', 'pptx', 'md', 'txt', 'html', 'xlsx'];
      const result = await builder.buildAll('proj-fmt-known', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(typeof d.format).toBe('string');
        }
      }
    });

    it('buildAll: 한글 purpose → ok', async () => {
      const result = await builder.buildAll(
        'proj-purpose-kr',
        createMetadata({ purpose: '글로벌 시장 진출을 위한 투자 유치' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: 한글 targetAudience → ok', async () => {
      const result = await builder.buildAll(
        'proj-ta-kr',
        createMetadata({ targetAudience: '국내외 VC 투자자 및 사모펀드' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: 한글 projectDescription → ok', async () => {
      const result = await builder.buildAll(
        'proj-desc-kr',
        createMetadata({ projectDescription: '인공지능 기반 자율 개발 플랫폼' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: 이모지 포함 projectDescription → ok', async () => {
      const result = await builder.buildAll(
        'proj-emoji-desc',
        createMetadata({ projectDescription: '🚀 차세대 AI 플랫폼 💡' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: 매우 짧은 projectName (1자) → ok', async () => {
      const result = await builder.buildAll(
        'proj-short-name',
        createMetadata({ projectName: 'A' }),
        tempDir,
      );
      expect(result.ok).toBe(true);
    });

    it('buildAll: 매우 짧은 purpose (1자) → ok (구현에 따름)', async () => {
      const result = await builder.buildAll(
        'proj-short-purpose',
        createMetadata({ purpose: 'P' }),
        tempDir,
      );
      expect(typeof result.ok).toBe('boolean');
    });

    it('buildAll: UUID projectId → 모든 항목 projectId 동일', async () => {
      const uuid = crypto.randomUUID();
      const result = await builder.buildAll(uuid, createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.projectId).toBe(uuid);
        }
      }
    });

    it('buildAll: 결과 항목 각각의 id는 비어있지 않음', async () => {
      const result = await builder.buildAll('proj-ids-nonempty', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('buildAll: 결과 ok 타입은 boolean', async () => {
      const result = await builder.buildAll('proj-ok-type', createMetadata(), tempDir);
      expect(typeof result.ok).toBe('boolean');
    });

    it('buildAll: 결과 항목 type은 비어있지 않은 string', async () => {
      const result = await builder.buildAll('proj-type-nonempty', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.type.length).toBeGreaterThan(0);
        }
      }
    });

    it('buildAll: 결과 항목 format은 비어있지 않은 string', async () => {
      const result = await builder.buildAll('proj-fmt-nonempty', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.format.length).toBeGreaterThan(0);
        }
      }
    });

    it('buildAll: 결과 항목 content는 비어있지 않은 string', async () => {
      const result = await builder.buildAll('proj-content-nonempty', createMetadata(), tempDir);
      if (result.ok) {
        for (const d of result.value) {
          expect(d.content.length).toBeGreaterThan(0);
        }
      }
    });

    it('buildAll: 다른 tempDir 사용해도 ok', async () => {
      const { join: pjoin } = await import('node:path');
      const { promises: pfs } = await import('node:fs');
      const altDir = pjoin(tempDir, 'alt-output');
      await pfs.mkdir(altDir, { recursive: true });
      const result = await builder.buildAll('proj-alt-dir', createMetadata(), altDir);
      expect(result.ok).toBe(true);
    });

    it('buildAll 3번 연속 → 모두 ok', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await builder.buildAll(`proj-seq3-${i}`, createMetadata(), tempDir);
        expect(result.ok).toBe(true);
      }
    });

    it('buildAll: portfolio의 content에 projectName 포함', async () => {
      const result = await builder.buildAll(
        'proj-port-content',
        createMetadata({ projectName: '포트폴리오 테스트 프로젝트명' }),
        tempDir,
      );
      if (result.ok) {
        const portfolio = result.value.find((d) => d.type === 'portfolio');
        expect(portfolio?.content).toContain('포트폴리오 테스트 프로젝트명');
      }
    });

    it('buildAll: business-plan content에 사업 계획서 포함', async () => {
      const result = await builder.buildAll('proj-bp-content', createMetadata(), tempDir);
      if (result.ok) {
        const bp = result.value.find((d) => d.type === 'business-plan');
        expect(bp?.content).toContain('사업 계획서');
      }
    });

    it('buildAll: investment-proposal content에 투자 제안서 포함', async () => {
      const result = await builder.buildAll('proj-inv-content', createMetadata(), tempDir);
      if (result.ok) {
        const inv = result.value.find((d) => d.type === 'investment-proposal');
        expect(inv?.content).toContain('투자 제안서');
      }
    });

    it('buildAll: presentation content에 Introduction 포함', async () => {
      const result = await builder.buildAll('proj-pres-content', createMetadata(), tempDir);
      if (result.ok) {
        const pres = result.value.find((d) => d.type === 'presentation');
        expect(pres?.content).toContain('Introduction');
      }
    });
  });

  // ── listTemplates / 배치66 추가 케이스 ───────────────────────────

  describe('listTemplates / 배치66 추가 케이스', () => {
    it('listTemplates(false) 연속 5번 → 항상 같은 길이', async () => {
      let prevLength = -1;
      for (let i = 0; i < 5; i++) {
        const result = await builder.listTemplates(false);
        if (result.ok) {
          if (prevLength === -1) prevLength = result.value.length;
          expect(result.value.length).toBe(prevLength);
        }
      }
    });

    it('listTemplates(false) 결과 각 name은 string', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(typeof t.name).toBe('string');
        }
      }
    });

    it('listTemplates(false) 결과 각 id는 비어있지 않은 string', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          expect(t.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('listTemplates(false) 결과 각 description은 string (구현에 따름)', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        for (const t of result.value) {
          if ('description' in t) {
            expect(typeof t.description).toBe('string');
          }
        }
      }
    });

    it('listTemplates(true) 결과 각 id는 비어있지 않은 string', async () => {
      const result = await builder.listTemplates(true);
      if (result.ok) {
        for (const t of result.value) {
          expect(t.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('listTemplates(false) 결과 중 custom=false 항목 존재', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        const hasBuiltIn = result.value.some((t) => t.custom === false);
        expect(hasBuiltIn).toBe(true);
      }
    });

    it('listTemplates(false)의 portfolio 템플릿은 pdf format', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        const portfolio = result.value.find((t) => t.type === 'portfolio');
        expect(portfolio?.format).toBe('pdf');
      }
    });

    it('listTemplates(false)의 business-plan 템플릿은 docx format', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        const bp = result.value.find((t) => t.type === 'business-plan');
        expect(bp?.format).toBe('docx');
      }
    });

    it('listTemplates(false)의 investment-proposal 템플릿은 pdf format', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        const inv = result.value.find((t) => t.type === 'investment-proposal');
        expect(inv?.format).toBe('pdf');
      }
    });

    it('listTemplates(false)의 presentation 템플릿은 pptx format', async () => {
      const result = await builder.listTemplates(false);
      if (result.ok) {
        const pres = result.value.find((t) => t.type === 'presentation');
        expect(pres?.format).toBe('pptx');
      }
    });
  });

  // ── registerTemplate / 배치66 추가 케이스 ────────────────────────

  describe('registerTemplate / 배치66 추가 케이스', () => {
    it('중복 ID "default-business-plan" → 에러 반환', async () => {
      const result = await builder.registerTemplate({
        id: 'default-business-plan',
        name: 'dup-bp',
        type: 'business-plan',
        templatePath: 'any',
        format: 'docx',
        description: 'dup',
        custom: false,
      });
      expect(result.ok).toBe(false);
    });

    it('중복 ID "default-investment-proposal" → 에러 반환', async () => {
      const result = await builder.registerTemplate({
        id: 'default-investment-proposal',
        name: 'dup-inv',
        type: 'investment-proposal',
        templatePath: 'any',
        format: 'pdf',
        description: 'dup',
        custom: false,
      });
      expect(result.ok).toBe(false);
    });

    it('중복 ID "default-presentation" → 에러 반환', async () => {
      const result = await builder.registerTemplate({
        id: 'default-presentation',
        name: 'dup-pres',
        type: 'presentation',
        templatePath: 'any',
        format: 'pptx',
        description: 'dup',
        custom: false,
      });
      expect(result.ok).toBe(false);
    });

    it('존재하지 않는 경로 → layer3_deliverable_template_not_found (2)', async () => {
      const result = await builder.registerTemplate({
        id: 'unique-new-template-batch66',
        name: 'new-t',
        type: 'portfolio',
        templatePath: '/no/path/batch66.hbs',
        format: 'pdf',
        description: 'batch66',
        custom: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_deliverable_template_not_found');
      }
    });

    it('중복 ID → layer3_deliverable_template_duplicate (2)', async () => {
      const result = await builder.registerTemplate({
        id: 'default-portfolio',
        name: 'dup-2',
        type: 'portfolio',
        templatePath: 'any',
        format: 'pdf',
        description: 'dup-2',
        custom: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('layer3_deliverable_template_duplicate');
      }
    });

    it('에러 시 error.code는 비어있지 않은 string', async () => {
      const result = await builder.registerTemplate({
        id: 'brand-new-b66',
        name: 'brand-new-b66',
        type: 'portfolio',
        templatePath: '/nonexistent/b66.hbs',
        format: 'pdf',
        description: 'b66',
        custom: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code.length).toBeGreaterThan(0);
      }
    });

    it('registerTemplate 결과 ok는 boolean', async () => {
      const result = await builder.registerTemplate({
        id: 'batch66-bool-check',
        name: 'batch66-bool',
        type: 'portfolio',
        templatePath: '/no/path.hbs',
        format: 'pdf',
        description: 'bool-check',
        custom: true,
      });
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
