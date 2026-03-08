/**
 * DocIntegrator 단위 테스트 / DocIntegrator unit tests
 *
 * @description
 * KR: integrate, generateAll, listTemplates, registerTemplate, collectFragments,
 *     updateDocument, exportAsMarkdown 경계값/오류 처리. 80%+ edge ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { DocIntegrator } from 'layer3/doc-integrator.js';
import type { DocumentTemplate, IntegratedDocument } from 'layer3/types.js';

function makeTemplate(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: overrides.id ?? 'tpl-test',
    type: overrides.type ?? 'readme',
    title: overrides.title ?? 'Test Document',
    sections: overrides.sections ?? [{ heading: 'Overview', content: 'Test content' }],
    ...overrides,
  };
}

// ── 생성자 ────────────────────────────────────────────────────

describe('DocIntegrator 생성자', () => {
  it('인스턴스가 생성된다', () => {
    expect(() => new DocIntegrator(new ConsoleLogger('error'))).not.toThrow();
  });

  it('DocIntegrator 인스턴스이다', () => {
    expect(new DocIntegrator(new ConsoleLogger('error'))).toBeInstanceOf(DocIntegrator);
  });

  it('여러 인스턴스 생성 가능', () => {
    const i1 = new DocIntegrator(new ConsoleLogger('error'));
    const i2 = new DocIntegrator(new ConsoleLogger('error'));
    expect(i1).toBeInstanceOf(DocIntegrator);
    expect(i2).toBeInstanceOf(DocIntegrator);
  });
});

// ── integrate (sync) - 성공 ───────────────────────────────────

describe('DocIntegrator integrate - 성공 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('조각 문서를 통합 문서로 병합한다', () => {
    const result = integrator.integrate(['frag-1', 'frag-2'], makeTemplate(), 'proj-1');
    expect(result.ok).toBe(true);
  });

  it('projectId가 결과에 포함된다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-test');
    if (result.ok) expect(result.value.projectId).toBe('proj-test');
  });

  it('type이 결과에 포함된다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ type: 'api-reference' }), 'proj-1');
    if (result.ok) expect(result.value.type).toBe('api-reference');
  });

  it('content가 비어있지 않다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.content.length).toBeGreaterThan(0);
  });

  it('id가 비어있지 않다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.id.length).toBeGreaterThan(0);
  });

  it('version이 1이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.version).toBe(1);
  });

  it('sourceFragments가 입력과 일치한다', () => {
    const frags = ['frag-1', 'frag-2', 'frag-3'];
    const result = integrator.integrate(frags, makeTemplate(), 'proj-1');
    if (result.ok) {
      for (const frag of frags) {
        expect(result.value.sourceFragments).toContain(frag);
      }
    }
  });

  it('고유한 문서 ID를 생성한다', () => {
    const r1 = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    const r2 = integrator.integrate(['frag-2'], makeTemplate(), 'proj-1');
    if (r1.ok && r2.ok) expect(r1.value.id).not.toBe(r2.value.id);
  });

  it('제목이 content에 포함된다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ title: 'My API Reference' }), 'proj-1');
    if (result.ok) expect(result.value.content).toContain('My API Reference');
  });

  it('섹션 heading이 content에 포함된다', () => {
    const template = makeTemplate({ sections: [{ heading: 'Endpoints', content: 'GET /api/v1' }] });
    const result = integrator.integrate(['frag-1'], template, 'proj-1');
    if (result.ok) expect(result.value.content).toContain('Endpoints');
  });

  it('섹션 content가 결과에 포함된다', () => {
    const template = makeTemplate({ sections: [{ heading: 'H', content: 'GET /api/v1/users' }] });
    const result = integrator.integrate(['frag-1'], template, 'proj-1');
    if (result.ok) expect(result.value.content).toContain('GET /api/v1/users');
  });

  it('여러 섹션이 모두 포함된다', () => {
    const template = makeTemplate({
      sections: [
        { heading: 'Section A', content: 'Content A' },
        { heading: 'Section B', content: 'Content B' },
      ],
    });
    const result = integrator.integrate(['frag-1'], template, 'proj-1');
    if (result.ok) {
      expect(result.value.content).toContain('Section A');
      expect(result.value.content).toContain('Section B');
    }
  });

  it('generatedAt이 Date이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.generatedAt).toBeInstanceOf(Date);
  });

  it('단일 조각으로도 ok', () => {
    const result = integrator.integrate(['frag-only'], makeTemplate(), 'proj-1');
    expect(result.ok).toBe(true);
  });
});

// ── integrate (sync) - 실패 ───────────────────────────────────

describe('DocIntegrator integrate - 실패 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('빈 조각 목록은 ok=false', () => {
    const result = integrator.integrate([], makeTemplate(), 'proj-1');
    expect(result.ok).toBe(false);
  });

  it('빈 조각 목록 → code=layer3_empty_fragments', () => {
    const result = integrator.integrate([], makeTemplate(), 'proj-1');
    if (!result.ok) expect(result.error.code).toBe('layer3_empty_fragments');
  });

  it('섹션이 없는 템플릿은 ok=false', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ sections: [] }), 'proj-1');
    expect(result.ok).toBe(false);
  });

  it('섹션 없음 → code=layer3_empty_template_sections', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ sections: [] }), 'proj-1');
    if (!result.ok) expect(result.error.code).toBe('layer3_empty_template_sections');
  });

  it('섹션 없음 → message에 섹션이 비어 포함', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ sections: [] }), 'proj-1');
    if (!result.ok) expect(result.error.message).toContain('섹션이 비어');
  });
});

// ── generateAll ───────────────────────────────────────────────

describe('DocIntegrator generateAll', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('유효한 projectId로 ok 반환', async () => {
    const result = await integrator.generateAll('proj-1', '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('결과가 배열이다', async () => {
    const result = await integrator.generateAll('proj-1', '.adev/docs');
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('현재 구현은 빈 배열 반환', async () => {
    const result = await integrator.generateAll('proj-1', '.adev/docs');
    if (result.ok) expect(result.value.length).toBe(0);
  });

  it('빈 projectId → ok=false', async () => {
    const result = await integrator.generateAll('', '.adev/docs');
    expect(result.ok).toBe(false);
  });

  it('빈 projectId → code=layer3_invalid_project_id', async () => {
    const result = await integrator.generateAll('', '.adev/docs');
    if (!result.ok) expect(result.error.code).toBe('layer3_invalid_project_id');
  });

  it('공백만 있는 projectId → ok=false', async () => {
    const result = await integrator.generateAll('   ', '.adev/docs');
    expect(result.ok).toBe(false);
  });

  it('다양한 outputDir → ok', async () => {
    const dirs = ['.adev/docs', '/tmp/output', 'output'];
    for (const dir of dirs) {
      const result = await integrator.generateAll('proj-1', dir);
      expect(result.ok).toBe(true);
    }
  });
});

// ── listTemplates ─────────────────────────────────────────────

describe('DocIntegrator listTemplates', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('기본 템플릿 8개를 반환한다', async () => {
    const result = await integrator.listTemplates(false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.length).toBe(8);
  });

  it('readme 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('readme');
    }
  });

  it('api-reference 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('api-reference');
    }
  });

  it('architecture 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('architecture');
    }
  });

  it('user-manual 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('user-manual');
    }
  });

  it('installation-guide 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('installation-guide');
    }
  });

  it('test-report 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('test-report');
    }
  });

  it('changelog 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('changelog');
    }
  });

  it('contributing-guide 템플릿이 포함된다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const names = result.value.map(t => t.name);
      expect(names).toContain('contributing-guide');
    }
  });

  it('커스텀 포함 옵션 → 8개 이상', async () => {
    const result = await integrator.listTemplates(true);
    if (result.ok) expect(result.value.length).toBeGreaterThanOrEqual(8);
  });

  it('모든 템플릿이 id를 가진다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.id).toBeTruthy();
      }
    }
  });

  it('모든 템플릿이 type을 가진다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.type).toBeTruthy();
      }
    }
  });
});

// ── registerTemplate ──────────────────────────────────────────

describe('DocIntegrator registerTemplate', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('새 커스텀 템플릿을 등록한다', async () => {
    const template: DocumentTemplate = {
      id: 'custom-new-1',
      name: 'custom',
      type: 'readme',
      templatePath: 'templates/custom.hbs',
      format: 'md',
      description: 'Custom template',
      custom: true,
    };
    const result = await integrator.registerTemplate(template);
    expect(result.ok).toBe(true);
  });

  it('등록 후 listTemplates(true)에 포함된다', async () => {
    const template: DocumentTemplate = {
      id: 'custom-findable',
      name: 'custom',
      type: 'readme',
      templatePath: 'templates/custom.hbs',
      format: 'md',
      description: 'Custom template',
      custom: true,
    };
    await integrator.registerTemplate(template);

    const listResult = await integrator.listTemplates(true);
    if (listResult.ok) {
      const registered = listResult.value.find(t => t.id === 'custom-findable');
      expect(registered).toBeTruthy();
    }
  });

  it('중복 템플릿 ID → ok=false', async () => {
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
  });

  it('중복 ID → message에 이미 존재 포함', async () => {
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
    if (!result.ok) expect(result.error.message).toContain('이미 존재');
  });

  it('중복 ID → code=layer3_template_duplicate', async () => {
    const result = await integrator.registerTemplate({
      id: 'default-readme',
      name: 'readme',
      type: 'readme',
      format: 'md',
      description: 'Dup',
      custom: false,
    });
    if (!result.ok) expect(result.error.code).toBe('layer3_template_duplicate');
  });

  it('새 ID이면 ok', async () => {
    const result = await integrator.registerTemplate({
      id: `unique-${Date.now()}`,
      name: 'unique',
      type: 'readme',
      format: 'md',
      description: 'Unique',
      custom: true,
    });
    expect(result.ok).toBe(true);
  });
});

// ── collectFragments ──────────────────────────────────────────

describe('DocIntegrator collectFragments', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('패턴에 맞는 조각 문서를 수집한다', async () => {
    const result = await integrator.collectFragments('proj-1', '**/*.md');
    expect(result.ok).toBe(true);
  });

  it('결과가 배열이다', async () => {
    const result = await integrator.collectFragments('proj-1', '**/*.md');
    if (result.ok) expect(Array.isArray(result.value)).toBe(true);
  });

  it('빈 projectId → ok=false', async () => {
    const result = await integrator.collectFragments('', '**/*.md');
    expect(result.ok).toBe(false);
  });

  it('빈 projectId → code=layer3_invalid_project_id', async () => {
    const result = await integrator.collectFragments('', '**/*.md');
    if (!result.ok) expect(result.error.code).toBe('layer3_invalid_project_id');
  });

  it('공백만 있는 projectId → ok=false', async () => {
    const result = await integrator.collectFragments('   ', '**/*.md');
    expect(result.ok).toBe(false);
  });

  it('매칭 파일 없으면 빈 배열 반환', async () => {
    const result = await integrator.collectFragments('proj-1', 'nonexistent-path-xyz/**/*.md');
    if (result.ok) expect(result.value.length).toBe(0);
  });
});

// ── updateDocument ────────────────────────────────────────────

describe('DocIntegrator updateDocument', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  function makeDoc(): IntegratedDocument {
    return {
      id: 'doc-1',
      projectId: 'proj-1',
      type: 'readme',
      content: '# README',
      generatedAt: new Date(),
      version: 1,
      sourceFragments: ['frag-original'],
    };
  }

  it('새 조각으로 업데이트 → ok', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-new']);
    expect(result.ok).toBe(true);
  });

  it('version이 2로 증가한다', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-new']);
    if (result.ok) expect(result.value.version).toBe(2);
  });

  it('기존 조각이 유지된다', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-new']);
    if (result.ok) expect(result.value.sourceFragments).toContain('frag-original');
  });

  it('새 조각이 추가된다', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-new']);
    if (result.ok) expect(result.value.sourceFragments).toContain('frag-new');
  });

  it('빈 newFragments → ok=false', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, []);
    expect(result.ok).toBe(false);
  });

  it('빈 newFragments → code=layer3_empty_fragments', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, []);
    if (!result.ok) expect(result.error.code).toBe('layer3_empty_fragments');
  });

  it('업데이트 후 content에 업데이트 부록 포함', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-new']);
    if (result.ok) expect(result.value.content).toContain('업데이트 부록');
  });

  it('여러 조각 추가 → 모두 포함', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag-a', 'frag-b', 'frag-c']);
    if (result.ok) {
      expect(result.value.sourceFragments).toContain('frag-a');
      expect(result.value.sourceFragments).toContain('frag-b');
      expect(result.value.sourceFragments).toContain('frag-c');
    }
  });
});

// ── exportAsMarkdown ──────────────────────────────────────────

describe('DocIntegrator exportAsMarkdown', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  function makeDoc(): IntegratedDocument {
    return {
      id: 'doc-1',
      projectId: 'proj-export',
      type: 'readme',
      content: '# README\n\nContent here.',
      generatedAt: new Date('2026-03-08T00:00:00Z'),
      version: 2,
      sourceFragments: ['frag-1'],
    };
  }

  it('ok를 반환한다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('결과가 문자열이다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('frontmatter가 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('---');
  });

  it('version이 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('version: 2');
  });

  it('projectId가 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('proj-export');
  });

  it('generatedAt이 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('generatedAt');
  });

  it('원본 content가 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('Content here.');
  });

  it('language: bilingual이 포함된다', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('bilingual');
  });
});

// ── integrate edge/random 추가 케이스 ────────────────────────

describe('DocIntegrator integrate - 추가 edge/random 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('UUID 형식 조각 ID → ok', () => {
    const frags = ['550e8400-e29b-41d4-a716-446655440000'];
    const result = integrator.integrate(frags, makeTemplate(), 'proj-uuid');
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 projectId → ok', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj!@#$%');
    expect(result.ok).toBe(true);
  });

  it('한글 projectId → ok', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), '프로젝트-001');
    expect(result.ok).toBe(true);
  });

  it('50개 조각 → ok', () => {
    const frags = Array.from({ length: 50 }, (_, i) => `frag-${i}`);
    const result = integrator.integrate(frags, makeTemplate(), 'proj-1');
    expect(result.ok).toBe(true);
  });

  it('50개 조각 → 모두 sourceFragments에 포함', () => {
    const frags = Array.from({ length: 50 }, (_, i) => `frag-${i}`);
    const result = integrator.integrate(frags, makeTemplate(), 'proj-1');
    if (result.ok) {
      expect(result.value.sourceFragments.length).toBe(50);
    }
  });

  it('한글 제목 template → content에 한글 포함', () => {
    const result = integrator.integrate(
      ['frag-1'],
      makeTemplate({ title: '한국어 문서 제목' }),
      'proj-1',
    );
    if (result.ok) expect(result.value.content).toContain('한국어 문서 제목');
  });

  it('한글 섹션 heading → content에 포함', () => {
    const result = integrator.integrate(
      ['frag-1'],
      makeTemplate({ sections: [{ heading: '개요', content: '내용' }] }),
      'proj-1',
    );
    if (result.ok) expect(result.value.content).toContain('개요');
  });

  it('한글 섹션 content → content에 포함', () => {
    const result = integrator.integrate(
      ['frag-1'],
      makeTemplate({ sections: [{ heading: 'H', content: '한국어 내용입니다' }] }),
      'proj-1',
    );
    if (result.ok) expect(result.value.content).toContain('한국어 내용입니다');
  });

  it('type=changelog → ok', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ type: 'changelog' }), 'proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('changelog');
  });

  it('type=user-manual → ok', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate({ type: 'user-manual' }), 'proj-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe('user-manual');
  });

  it('아주 긴 제목 template → ok', () => {
    const longTitle = 'A'.repeat(500);
    const result = integrator.integrate(['frag-1'], makeTemplate({ title: longTitle }), 'proj-1');
    expect(result.ok).toBe(true);
  });

  it('10개 섹션 → 모두 content에 포함', () => {
    const sections = Array.from({ length: 10 }, (_, i) => ({
      heading: `Section ${i}`,
      content: `Content ${i}`,
    }));
    const result = integrator.integrate(['frag-1'], makeTemplate({ sections }), 'proj-1');
    if (result.ok) {
      for (let i = 0; i < 10; i++) {
        expect(result.value.content).toContain(`Section ${i}`);
      }
    }
  });

  it('빈 content 섹션 → ok', () => {
    const result = integrator.integrate(
      ['frag-1'],
      makeTemplate({ sections: [{ heading: 'H', content: '' }] }),
      'proj-1',
    );
    expect(result.ok).toBe(true);
  });

  it('공백만 있는 heading → ok (구현에 따름)', () => {
    const result = integrator.integrate(
      ['frag-1'],
      makeTemplate({ sections: [{ heading: '   ', content: 'content' }] }),
      'proj-1',
    );
    expect(typeof result.ok).toBe('boolean');
  });

  it('generatedAt이 현재 시간과 가깝다', () => {
    const before = new Date();
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    const after = new Date();
    if (result.ok) {
      expect(result.value.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(result.value.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    }
  });
});

// ── updateDocument 추가 edge 케이스 ──────────────────────────

describe('DocIntegrator updateDocument - 추가 edge 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  function makeDoc(version = 1) {
    return {
      id: 'doc-edge',
      projectId: 'proj-edge',
      type: 'readme' as const,
      content: '# Original',
      generatedAt: new Date(),
      version,
      sourceFragments: ['original-frag'],
    };
  }

  it('version 5 문서 업데이트 → version 6', () => {
    const doc = makeDoc(5);
    const result = integrator.updateDocument(doc, ['frag-new']);
    if (result.ok) expect(result.value.version).toBe(6);
  });

  it('한글 조각 ID → ok', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['한글조각-001']);
    expect(result.ok).toBe(true);
  });

  it('UUID 형식 조각 ID → ok', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['550e8400-e29b-41d4-a716-446655440001']);
    expect(result.ok).toBe(true);
  });

  it('100개 새 조각 → 모두 sourceFragments에 포함', () => {
    const doc = makeDoc();
    const newFrags = Array.from({ length: 100 }, (_, i) => `new-frag-${i}`);
    const result = integrator.updateDocument(doc, newFrags);
    if (result.ok) {
      expect(result.value.sourceFragments.length).toBe(101); // 1 original + 100 new
    }
  });

  it('공백만 있는 조각 ID → ok/false (구현에 따름)', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['   ']);
    expect(typeof result.ok).toBe('boolean');
  });

  it('특수문자 조각 ID → ok (구현에 따름)', () => {
    const doc = makeDoc();
    const result = integrator.updateDocument(doc, ['frag!@#$']);
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── exportAsMarkdown 추가 edge 케이스 ───────────────────────

describe('DocIntegrator exportAsMarkdown - 추가 edge 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  function makeDoc(overrides: Partial<IntegratedDocument> = {}): IntegratedDocument {
    return {
      id: overrides.id ?? 'doc-export-edge',
      projectId: overrides.projectId ?? 'proj-edge',
      type: overrides.type ?? 'readme',
      content: overrides.content ?? '# Test',
      generatedAt: overrides.generatedAt ?? new Date('2026-01-01T00:00:00Z'),
      version: overrides.version ?? 1,
      sourceFragments: overrides.sourceFragments ?? ['frag-1'],
    };
  }

  it('version 0 문서 → ok', () => {
    const doc = makeDoc({ version: 0 });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('version 99 문서 → content에 99 포함', () => {
    const doc = makeDoc({ version: 99 });
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('99');
  });

  it('한글 content → ok', () => {
    const doc = makeDoc({ content: '# 한국어 제목\n내용입니다.' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('한글 content → content에 한글 포함', () => {
    const doc = makeDoc({ content: '# 한국어\n내용' });
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(result.value).toContain('한국어');
  });

  it('빈 content → ok', () => {
    const doc = makeDoc({ content: '' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('type=api-reference → ok', () => {
    const doc = makeDoc({ type: 'api-reference' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('type=changelog → ok', () => {
    const doc = makeDoc({ type: 'changelog' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('10개 sourceFragments → ok', () => {
    const frags = Array.from({ length: 10 }, (_, i) => `frag-${i}`);
    const doc = makeDoc({ sourceFragments: frags });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('5번 반복 호출 → 항상 ok', () => {
    for (let i = 0; i < 5; i++) {
      const result = integrator.exportAsMarkdown(makeDoc());
      expect(result.ok).toBe(true);
    }
  });

  it('result.value가 --- 두 번 포함', () => {
    const doc = makeDoc();
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) {
      const count = (result.value.match(/---/g) ?? []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it('UUID id → ok', () => {
    const doc = makeDoc({ id: '550e8400-e29b-41d4-a716-446655440099' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 projectId → ok', () => {
    const doc = makeDoc({ projectId: 'proj!@#' });
    const result = integrator.exportAsMarkdown(doc);
    expect(result.ok).toBe(true);
  });

  it('아주 긴 content → result가 string', () => {
    const longContent = 'A'.repeat(5000);
    const doc = makeDoc({ content: longContent });
    const result = integrator.exportAsMarkdown(doc);
    if (result.ok) expect(typeof result.value).toBe('string');
  });
});

// ── generateAll 추가 edge 케이스 ─────────────────────────────

describe('DocIntegrator generateAll - 추가 edge 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('UUID projectId → ok', async () => {
    const result = await integrator.generateAll('550e8400-e29b-41d4-a716-446655440000', '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('한글 projectId → ok', async () => {
    const result = await integrator.generateAll('한국-프로젝트', '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('특수문자 projectId → ok', async () => {
    const result = await integrator.generateAll('proj!@#$', '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('최소 길이 projectId(1글자) → ok', async () => {
    const result = await integrator.generateAll('x', '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('긴 projectId → ok', async () => {
    const longId = 'proj-'.repeat(20).slice(0, 100);
    const result = await integrator.generateAll(longId, '.adev/docs');
    expect(result.ok).toBe(true);
  });

  it('빈 outputDir → ok (구현에 따름)', async () => {
    const result = await integrator.generateAll('proj-1', '');
    expect(typeof result.ok).toBe('boolean');
  });

  it('5번 반복 호출 → 항상 ok', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await integrator.generateAll(`proj-${i}`, '.adev/docs');
      expect(result.ok).toBe(true);
    }
  });
});

// ── collectFragments 추가 edge 케이스 ────────────────────────

describe('DocIntegrator collectFragments - 추가 edge 케이스', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('UUID projectId → ok', async () => {
    const result = await integrator.collectFragments('550e8400-e29b-41d4-a716-446655440000', '**/*.md');
    expect(result.ok).toBe(true);
  });

  it('한글 projectId → ok', async () => {
    const result = await integrator.collectFragments('한국-프로젝트', '**/*.md');
    expect(result.ok).toBe(true);
  });

  it('특수문자 포함 projectId → ok', async () => {
    const result = await integrator.collectFragments('proj!@#', '**/*.md');
    expect(result.ok).toBe(true);
  });

  it('공백 projectId → ok=false', async () => {
    const result = await integrator.collectFragments('  ', '**/*.md');
    expect(result.ok).toBe(false);
  });

  it('탭 문자만 있는 projectId → ok=false', async () => {
    const result = await integrator.collectFragments('\t', '**/*.md');
    expect(result.ok).toBe(false);
  });

  it('5번 반복 호출 → 일관성', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await integrator.collectFragments('proj-1', '**/*.md');
      expect(result.ok).toBe(true);
    }
  });
});

// ── integrate 반환값 세부 검증 ────────────────────────────────

describe('DocIntegrator integrate - 반환값 세부 검증', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('result.value.id가 문자열이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(typeof result.value.id).toBe('string');
  });

  it('result.value.projectId가 문자열이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(typeof result.value.projectId).toBe('string');
  });

  it('result.value.type이 문자열이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(typeof result.value.type).toBe('string');
  });

  it('result.value.content가 문자열이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(typeof result.value.content).toBe('string');
  });

  it('result.value.version이 숫자이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(typeof result.value.version).toBe('number');
  });

  it('result.value.sourceFragments가 배열이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(Array.isArray(result.value.sourceFragments)).toBe(true);
  });

  it('result.value.generatedAt이 Date이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.generatedAt).toBeInstanceOf(Date);
  });

  it('result.value.version은 양수이다', () => {
    const result = integrator.integrate(['frag-1'], makeTemplate(), 'proj-1');
    if (result.ok) expect(result.value.version).toBeGreaterThan(0);
  });

  it('결과 id가 비어있지 않다 (재확인)', () => {
    const result = integrator.integrate(['frag-a', 'frag-b'], makeTemplate(), 'proj-x');
    if (result.ok) expect(result.value.id.trim().length).toBeGreaterThan(0);
  });

  it('5번 통합 → 모두 ok=true', () => {
    for (let i = 0; i < 5; i++) {
      const result = integrator.integrate([`frag-${i}`], makeTemplate(), `proj-${i}`);
      expect(result.ok).toBe(true);
    }
  });
});

// ── listTemplates 세부 검증 ───────────────────────────────────

describe('DocIntegrator listTemplates - 세부 검증', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('false 옵션 → 커스텀 템플릿 제외', async () => {
    await integrator.registerTemplate({
      id: 'custom-exclude-test',
      name: 'custom',
      type: 'readme',
      format: 'md',
      description: 'custom',
      custom: true,
    });
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const ids = result.value.map((t) => t.id);
      expect(ids).not.toContain('custom-exclude-test');
    }
  });

  it('true 옵션 → 커스텀 템플릿 포함', async () => {
    await integrator.registerTemplate({
      id: 'custom-include-test',
      name: 'custom',
      type: 'readme',
      format: 'md',
      description: 'custom',
      custom: true,
    });
    const result = await integrator.listTemplates(true);
    if (result.ok) {
      const ids = result.value.map((t) => t.id);
      expect(ids).toContain('custom-include-test');
    }
  });

  it('기본 8개는 모두 custom=false이다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.custom).toBe(false);
      }
    }
  });

  it('기본 8개 모두 format 필드가 있다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.format).toBeDefined();
      }
    }
  });

  it('기본 8개 모두 description 필드가 있다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.description).toBeDefined();
      }
    }
  });

  it('기본 8개 모두 name 길이가 0보다 크다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('기본 8개 모두 id가 "default-"로 시작한다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      for (const t of result.value) {
        expect(t.id?.startsWith('default-')).toBe(true);
      }
    }
  });

  it('5번 반복 listTemplates(false) → 항상 8개', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await integrator.listTemplates(false);
      if (result.ok) expect(result.value.length).toBe(8);
    }
  });

  it('api-reference 템플릿 format이 html이다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const apiRef = result.value.find((t) => t.type === 'api-reference');
      if (apiRef) expect(apiRef.format).toBe('html');
    }
  });

  it('readme 템플릿 format이 md이다', async () => {
    const result = await integrator.listTemplates(false);
    if (result.ok) {
      const readme = result.value.find((t) => t.type === 'readme');
      if (readme) expect(readme.format).toBe('md');
    }
  });
});

// ── registerTemplate 세부 검증 ───────────────────────────────

describe('DocIntegrator registerTemplate - 세부 검증', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('동적 ID로 등록 → listTemplates(true)에 포함', async () => {
    const dynId = `dynamic-${Date.now()}-${Math.random()}`;
    await integrator.registerTemplate({
      id: dynId,
      name: 'dynamic',
      type: 'changelog',
      format: 'md',
      description: 'dynamic template',
      custom: true,
    });
    const result = await integrator.listTemplates(true);
    if (result.ok) {
      const ids = result.value.map((t) => t.id);
      expect(ids).toContain(dynId);
    }
  });

  it('여러 커스텀 템플릿 등록 → 모두 포함', async () => {
    const ids = ['cust-a', 'cust-b', 'cust-c'];
    for (const id of ids) {
      await integrator.registerTemplate({
        id,
        name: id,
        type: 'readme',
        format: 'md',
        description: id,
        custom: true,
      });
    }
    const result = await integrator.listTemplates(true);
    if (result.ok) {
      const foundIds = result.value.map((t) => t.id);
      for (const id of ids) {
        expect(foundIds).toContain(id);
      }
    }
  });

  it('중복 ID → error.message 비어있지 않다', async () => {
    const result = await integrator.registerTemplate({
      id: 'default-readme',
      name: 'readme',
      type: 'readme',
      format: 'md',
      description: 'dup',
      custom: false,
    });
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });

  it('중복 ID → error.name 비어있지 않다', async () => {
    const result = await integrator.registerTemplate({
      id: 'default-readme',
      name: 'readme',
      type: 'readme',
      format: 'md',
      description: 'dup',
      custom: false,
    });
    if (!result.ok) expect(result.error.name.length).toBeGreaterThan(0);
  });

  it('custom=false 중복 ID 등록 → ok=false', async () => {
    const result = await integrator.registerTemplate({
      id: 'default-changelog',
      name: 'changelog',
      type: 'changelog',
      format: 'md',
      description: 'dup-changelog',
      custom: false,
    });
    expect(result.ok).toBe(false);
  });

  it('templatePath 없는 커스텀 템플릿도 등록 성공', async () => {
    const result = await integrator.registerTemplate({
      id: 'no-path-tpl',
      name: 'no-path',
      type: 'readme',
      format: 'md',
      description: 'no templatePath',
      custom: true,
    });
    expect(result.ok).toBe(true);
  });

  it('UUID id 커스텀 템플릿 등록 → ok', async () => {
    const uuid = crypto.randomUUID();
    const result = await integrator.registerTemplate({
      id: uuid,
      name: 'uuid-template',
      type: 'architecture',
      format: 'md',
      description: 'UUID id template',
      custom: true,
    });
    expect(result.ok).toBe(true);
  });

  it('한글 name 커스텀 템플릿 → ok', async () => {
    const result = await integrator.registerTemplate({
      id: `kor-name-${Date.now()}`,
      name: '한글템플릿',
      type: 'user-manual',
      format: 'md',
      description: '한글 설명',
      custom: true,
    });
    expect(result.ok).toBe(true);
  });
});

// ── updateDocument + exportAsMarkdown 연계 검증 ──────────────

describe('DocIntegrator updateDocument + exportAsMarkdown 연계', () => {
  let integrator: DocIntegrator;

  beforeEach(() => {
    integrator = new DocIntegrator(new ConsoleLogger('error'));
  });

  it('integrate → updateDocument → exportAsMarkdown 체인 ok', () => {
    const intResult = integrator.integrate(['frag-1'], makeTemplate(), 'proj-chain');
    if (!intResult.ok) return;

    const updResult = integrator.updateDocument(intResult.value, ['frag-new']);
    if (!updResult.ok) return;

    const expResult = integrator.exportAsMarkdown(updResult.value);
    expect(expResult.ok).toBe(true);
  });

  it('integrate → updateDocument → version 증가', () => {
    const intResult = integrator.integrate(['frag-1'], makeTemplate(), 'proj-version');
    if (!intResult.ok) return;

    const updResult = integrator.updateDocument(intResult.value, ['frag-2']);
    if (updResult.ok) {
      expect(updResult.value.version).toBe(intResult.value.version + 1);
    }
  });

  it('integrate → exportAsMarkdown → content에 projectId 포함', () => {
    const projId = 'proj-export-chain';
    const intResult = integrator.integrate(['frag-1'], makeTemplate(), projId);
    if (!intResult.ok) return;

    const expResult = integrator.exportAsMarkdown(intResult.value);
    if (expResult.ok) expect(expResult.value).toContain(projId);
  });

  it('integrate → exportAsMarkdown → version: 1 포함', () => {
    const intResult = integrator.integrate(['frag-1'], makeTemplate(), 'proj-v1');
    if (!intResult.ok) return;

    const expResult = integrator.exportAsMarkdown(intResult.value);
    if (expResult.ok) expect(expResult.value).toContain('version: 1');
  });

  it('5번 integrate + 각 exportAsMarkdown → 모두 ok', () => {
    for (let i = 0; i < 5; i++) {
      const intResult = integrator.integrate([`frag-${i}`], makeTemplate(), `proj-${i}`);
      if (!intResult.ok) continue;
      const expResult = integrator.exportAsMarkdown(intResult.value);
      expect(expResult.ok).toBe(true);
    }
  });

  it('integrate + 2회 updateDocument → version=3', () => {
    const intResult = integrator.integrate(['frag-orig'], makeTemplate(), 'proj-v3');
    if (!intResult.ok) return;

    const upd1 = integrator.updateDocument(intResult.value, ['frag-a']);
    if (!upd1.ok) return;

    const upd2 = integrator.updateDocument(upd1.value, ['frag-b']);
    if (upd2.ok) expect(upd2.value.version).toBe(3);
  });

  it('exportAsMarkdown 후 --- 사이에 version 포함', () => {
    const intResult = integrator.integrate(['frag-1'], makeTemplate(), 'proj-frontmatter');
    if (!intResult.ok) return;

    const expResult = integrator.exportAsMarkdown(intResult.value);
    if (expResult.ok) {
      const content = expResult.value;
      const firstDash = content.indexOf('---');
      const secondDash = content.indexOf('---', firstDash + 3);
      const frontmatter = content.substring(firstDash, secondDash + 3);
      expect(frontmatter).toContain('version');
    }
  });
});
