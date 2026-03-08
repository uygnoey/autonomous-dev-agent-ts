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
