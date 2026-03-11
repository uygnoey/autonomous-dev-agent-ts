/**
 * TemplateLoader 단위 테스트 / TemplateLoader unit tests
 *
 * @description
 * KR: load()/getByName() 경계값·오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Edge-case and error handling tests for load() and getByName(). 80%+ edge ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { TemplateLoader } from 'core/template-loader.js';

// ── 픽스처 헬퍼 ─────────────────────────────────────────────

let tempDir: string;
let projectTemplatesDir: string;
let globalTemplatesDir: string;
const logger = new ConsoleLogger('error');

beforeEach(async () => {
  tempDir = join(tmpdir(), `adev-tpl-test-${crypto.randomUUID()}`);
  projectTemplatesDir = join(tempDir, 'project-templates');
  globalTemplatesDir = join(tempDir, 'global-templates');
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/** 템플릿 파일 생성 헬퍼 */
async function createTemplate(
  baseDir: string,
  fileName: string,
  content = `Template content for ${fileName}`,
): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  await writeFile(join(baseDir, fileName), content, 'utf8');
}

// ── load() 테스트 ────────────────────────────────────────────

describe('TemplateLoader.load()', () => {
  it('인수 없이 호출하면 빈 배열을 반환한다', async () => {
    const loader = new TemplateLoader(logger);
    const result = await loader.load();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 프로젝트 디렉토리 → 빈 배열 (에러 없음)', async () => {
    const loader = new TemplateLoader(logger);
    const result = await loader.load('/non-existent-tpl-xyz/templates');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 글로벌 디렉토리 → 빈 배열 (에러 없음)', async () => {
    const loader = new TemplateLoader(logger);
    const result = await loader.load(undefined, '/non-existent-global-tpl/templates');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 프로젝트 디렉토리 → 빈 배열', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('.md 파일 로드 성공', async () => {
    await createTemplate(projectTemplatesDir, 'system-prompt.md', '# System Prompt');
    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('system-prompt');
    expect(result.value[0]?.format).toBe('md');
    expect(result.value[0]?.content).toContain('System Prompt');
    expect(result.value[0]?.source).toBe('project');
  });

  it('.hbs 파일 로드 성공', async () => {
    await createTemplate(
      projectTemplatesDir,
      'plan-template.hbs',
      '{{#each tasks}}{{this}}{{/each}}',
    );
    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('plan-template');
    expect(result.value[0]?.format).toBe('hbs');
  });

  it('.txt 파일 로드 성공', async () => {
    await createTemplate(projectTemplatesDir, 'readme.txt', 'Plain text template');
    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('readme');
    expect(result.value[0]?.format).toBe('txt');
  });

  it('지원하지 않는 확장자(.json) 파일은 무시', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    await createTemplate(projectTemplatesDir, 'config.json', '{}');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('formats 필터: md만 → hbs/txt 제외', async () => {
    await createTemplate(projectTemplatesDir, 'tpl-md.md', '# Markdown');
    await createTemplate(projectTemplatesDir, 'tpl-hbs.hbs', '{{hbs}}');
    await createTemplate(projectTemplatesDir, 'tpl-txt.txt', 'Plain');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, undefined, { formats: ['md'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.format).toBe('md');
  });

  it('formats 필터: hbs + txt → md 제외', async () => {
    await createTemplate(projectTemplatesDir, 'tpl-md.md', '# Markdown');
    await createTemplate(projectTemplatesDir, 'tpl-hbs.hbs', '{{hbs}}');
    await createTemplate(projectTemplatesDir, 'tpl-txt.txt', 'Plain');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, undefined, { formats: ['hbs', 'txt'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    const formats = result.value.map((t) => t.format);
    expect(formats).toContain('hbs');
    expect(formats).toContain('txt');
    expect(formats).not.toContain('md');
  });

  it('maxFileSizeBytes 초과 파일 → 제외', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    // 5바이트 제한 — 임의의 5바이트 초과 콘텐츠
    await writeFile(join(projectTemplatesDir, 'big.md'), 'x'.repeat(100), 'utf8');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, undefined, { maxFileSizeBytes: 5 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('maxFileSizeBytes 이하 파일 → 포함', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    await writeFile(join(projectTemplatesDir, 'small.md'), 'Hi', 'utf8');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, undefined, {
      maxFileSizeBytes: 1_048_576,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('small');
  });

  it('동일 이름 — project가 global을 덮어씀', async () => {
    await createTemplate(projectTemplatesDir, 'shared.md', '# Project version');
    await createTemplate(globalTemplatesDir, 'shared.md', '# Global version');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, globalTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 중복 제거 후 1개여야 함
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.source).toBe('project');
    expect(result.value[0]?.content).toContain('Project version');
  });

  it('project + global 각자 다른 이름 — 합산 반환', async () => {
    await createTemplate(projectTemplatesDir, 'proj-tpl.md', '# Project');
    await createTemplate(globalTemplatesDir, 'global-tpl.md', '# Global');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, globalTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    const names = result.value.map((t) => t.name);
    expect(names).toContain('proj-tpl');
    expect(names).toContain('global-tpl');
  });

  it('글로벌 디렉토리에서 로드 — source가 global', async () => {
    await createTemplate(globalTemplatesDir, 'global-only.md', '# Global only');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(undefined, globalTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.source).toBe('global');
  });

  it('이름이 같고 포맷이 다른 파일 — project 우선 (덮어씀)', async () => {
    // project: name.md, global: name.hbs — 이름('name')이 같으므로 project 우선
    await createTemplate(projectTemplatesDir, 'name.md', '# MD Project');
    await createTemplate(globalTemplatesDir, 'name.hbs', '{{HBS Global}}');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir, globalTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.source).toBe('project');
    expect(result.value[0]?.format).toBe('md');
  });

  it('여러 파일 로드 — 이름 순 정렬', async () => {
    await createTemplate(projectTemplatesDir, 'zzz-last.md', 'Last');
    await createTemplate(projectTemplatesDir, 'aaa-first.md', 'First');
    await createTemplate(projectTemplatesDir, 'mmm-middle.md', 'Middle');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(3);
    expect(result.value[0]?.name).toBe('aaa-first');
    expect(result.value[1]?.name).toBe('mmm-middle');
    expect(result.value[2]?.name).toBe('zzz-last');
  });

  it('확장자 없는 파일은 무시', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    await writeFile(join(projectTemplatesDir, 'no-extension'), 'Content');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 파일도 로드된다', async () => {
    await mkdir(projectTemplatesDir, { recursive: true });
    await writeFile(join(projectTemplatesDir, 'empty.md'), '', 'utf8');

    const loader = new TemplateLoader(logger);
    const result = await loader.load(projectTemplatesDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.content).toBe('');
  });
});

// ── getByName() 테스트 ───────────────────────────────────────

describe('TemplateLoader.getByName()', () => {
  it('이름 일치 — 해당 템플릿 반환', () => {
    const loader = new TemplateLoader(logger);
    const templates = [
      {
        name: 'system-prompt',
        content: '# System',
        format: 'md' as const,
        path: '/a',
        source: 'project' as const,
      },
      {
        name: 'plan-prompt',
        content: '# Plan',
        format: 'md' as const,
        path: '/b',
        source: 'project' as const,
      },
    ];

    const found = loader.getByName('plan-prompt', templates);
    expect(found).toBeDefined();
    expect(found?.name).toBe('plan-prompt');
    expect(found?.content).toContain('Plan');
  });

  it('이름 미스 → undefined 반환', () => {
    const loader = new TemplateLoader(logger);
    const templates = [
      {
        name: 'system-prompt',
        content: '# System',
        format: 'md' as const,
        path: '/a',
        source: 'project' as const,
      },
    ];

    const found = loader.getByName('non-existent', templates);
    expect(found).toBeUndefined();
  });

  it('빈 배열 → undefined', () => {
    const loader = new TemplateLoader(logger);
    const found = loader.getByName('anything', []);
    expect(found).toBeUndefined();
  });

  it('대소문자 구분 — 정확히 일치해야 한다', () => {
    const loader = new TemplateLoader(logger);
    const templates = [
      {
        name: 'MyTemplate',
        content: '# My',
        format: 'md' as const,
        path: '/a',
        source: 'project' as const,
      },
    ];

    // 소문자로 검색하면 미스
    const notFound = loader.getByName('mytemplate', templates);
    expect(notFound).toBeUndefined();

    // 정확한 이름으로 검색하면 명중
    const found = loader.getByName('MyTemplate', templates);
    expect(found).toBeDefined();
  });

  it('첫 번째 일치 항목 반환 (배열 순서 기준)', () => {
    const loader = new TemplateLoader(logger);
    const templates = [
      {
        name: 'dup',
        content: 'First',
        format: 'md' as const,
        path: '/a',
        source: 'project' as const,
      },
      {
        name: 'dup',
        content: 'Second',
        format: 'hbs' as const,
        path: '/b',
        source: 'global' as const,
      },
    ];

    const found = loader.getByName('dup', templates);
    expect(found?.content).toBe('First');
  });

  it('확장자 포함 이름은 일치하지 않음 (이름은 확장자 제외)', () => {
    const loader = new TemplateLoader(logger);
    const templates = [
      {
        name: 'plan-prompt',
        content: '# Plan',
        format: 'md' as const,
        path: '/a',
        source: 'project' as const,
      },
    ];

    // 확장자 포함하여 검색 → 미스
    const notFound = loader.getByName('plan-prompt.md', templates);
    expect(notFound).toBeUndefined();
  });

  it('전체 파이프라인: load 후 getByName', async () => {
    await createTemplate(projectTemplatesDir, 'coder-prompt.md', '# Coder Prompt Content');

    const loader = new TemplateLoader(logger);
    const loadResult = await loader.load(projectTemplatesDir);

    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const found = loader.getByName('coder-prompt', loadResult.value);
    expect(found).toBeDefined();
    expect(found?.name).toBe('coder-prompt');
    expect(found?.content).toContain('Coder Prompt Content');
    expect(found?.format).toBe('md');
    expect(found?.source).toBe('project');
  });
});
