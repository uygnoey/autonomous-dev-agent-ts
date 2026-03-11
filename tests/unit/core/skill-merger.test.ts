/**
 * SkillMerger 단위 테스트 / SkillMerger unit tests
 *
 * @description
 * KR: scan()/merge() 경계값·오류 처리 테스트. 80%+ 경계값 비율.
 * EN: Edge-case and error handling tests for scan() and merge(). 80%+ edge ratio.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import { SkillMerger } from 'core/skill-merger.js';

// ── 픽스처 헬퍼 ─────────────────────────────────────────────

let tempDir: string;
let projectSkillsDir: string;
let globalSkillsDir: string;
const logger = new ConsoleLogger('error');

beforeEach(async () => {
  tempDir = join(tmpdir(), `adev-skill-test-${crypto.randomUUID()}`);
  projectSkillsDir = join(tempDir, 'project-skills');
  globalSkillsDir = join(tempDir, 'global-skills');
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/** skill 디렉토리와 SKILL.md 파일 생성 헬퍼 */
async function createSkill(
  baseDir: string,
  name: string,
  content = `# ${name}\nSkill content for ${name}`,
): Promise<void> {
  const skillDir = join(baseDir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), content, 'utf8');
}

/** skill references 파일 생성 헬퍼 */
async function createSkillReference(
  baseDir: string,
  skillName: string,
  refName: string,
  content = `# ${refName} reference`,
): Promise<void> {
  const refDir = join(baseDir, skillName, 'references');
  await mkdir(refDir, { recursive: true });
  await writeFile(join(refDir, `${refName}.md`), content, 'utf8');
}

// ── scan() 테스트 ────────────────────────────────────────────

describe('SkillMerger.scan()', () => {
  it('인수 없이 호출하면 빈 배열을 반환한다', async () => {
    const merger = new SkillMerger(logger);
    const result = await merger.scan();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 프로젝트 디렉토리 → 빈 배열 (에러 없음)', async () => {
    const merger = new SkillMerger(logger);
    const result = await merger.scan('/non-existent-abc-xyz-123/skills');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('존재하지 않는 글로벌 디렉토리 → 빈 배열 (에러 없음)', async () => {
    const merger = new SkillMerger(logger);
    const result = await merger.scan(undefined, '/non-existent-global-xyz/skills');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('빈 프로젝트 디렉토리 → 빈 배열', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('SKILL.md 1개 스캔 성공', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'code-quality', '# Code Quality\nContent here.');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('code-quality');
    expect(result.value[0]?.content).toContain('Code Quality');
    expect(result.value[0]?.source).toBe('project');
  });

  it('여러 SKILL.md 스캔 → 이름 순 정렬', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'zeta-skill');
    await createSkill(projectSkillsDir, 'alpha-skill');
    await createSkill(projectSkillsDir, 'middle-skill');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(3);
    expect(result.value[0]?.name).toBe('alpha-skill');
    expect(result.value[1]?.name).toBe('middle-skill');
    expect(result.value[2]?.name).toBe('zeta-skill');
  });

  it('글로벌 디렉토리에서 skill 로드 — source가 global', async () => {
    await mkdir(globalSkillsDir, { recursive: true });
    await createSkill(globalSkillsDir, 'global-only-skill');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(undefined, globalSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.name).toBe('global-only-skill');
    expect(result.value[0]?.source).toBe('global');
  });

  it('동일 이름 skill — project가 global을 덮어씀', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await mkdir(globalSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'shared-skill', '# Project version');
    await createSkill(globalSkillsDir, 'shared-skill', '# Global version');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir, globalSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 중복 제거 후 1개여야 함
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.source).toBe('project');
    expect(result.value[0]?.content).toContain('Project version');
  });

  it('project + global 각자 다른 skill — 합산 반환', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await mkdir(globalSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'project-only');
    await createSkill(globalSkillsDir, 'global-only');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir, globalSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    const names = result.value.map((s) => s.name);
    expect(names).toContain('project-only');
    expect(names).toContain('global-only');
  });

  it('SKILL.md 없는 하위 폴더만 있는 경우 → 빈 배열', async () => {
    await mkdir(join(projectSkillsDir, 'some-dir'), { recursive: true });
    // SKILL.md 미생성

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(0);
  });

  it('references 폴더를 로드한다', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'my-skill');
    await createSkillReference(projectSkillsDir, 'my-skill', 'result-pattern', '# Result Pattern');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const skill = result.value[0];
    expect(skill?.references).toBeDefined();
    expect(skill?.references?.length).toBeGreaterThanOrEqual(1);
    expect(skill?.references?.[0]?.name).toBe('result-pattern');
    expect(skill?.references?.[0]?.content).toContain('Result Pattern');
  });

  it('references 폴더가 없어도 skill은 로드된다', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'no-refs-skill');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    // references가 없거나 빈 배열이어야 함
    const refs = result.value[0]?.references;
    expect(!refs || refs.length === 0).toBe(true);
  });

  it('여러 references 파일을 로드한다', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'rich-skill');
    await createSkillReference(projectSkillsDir, 'rich-skill', 'ref-a', '# Ref A');
    await createSkillReference(projectSkillsDir, 'rich-skill', 'ref-b', '# Ref B');

    const merger = new SkillMerger(logger);
    const result = await merger.scan(projectSkillsDir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const refs = result.value[0]?.references;
    expect(refs).toBeDefined();
    expect(refs?.length).toBe(2);
  });
});

// ── merge() 테스트 ───────────────────────────────────────────

describe('SkillMerger.merge()', () => {
  it('빈 배열 입력 → 빈 문자열 반환', () => {
    const merger = new SkillMerger(logger);
    const result = merger.merge([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('');
  });

  it('skill 1개 → ## name + content 형식', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'code-quality',
        content: 'Best practices here.',
        path: '/fake/path/SKILL.md',
        source: 'project' as const,
      },
    ];
    const result = merger.merge(skills);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('## code-quality');
    expect(result.value).toContain('Best practices here.');
  });

  it('여러 skill — 기본 구분자 (---) 사용', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'skill-a', content: 'Content A', path: '/a', source: 'project' as const },
      { name: 'skill-b', content: 'Content B', path: '/b', source: 'global' as const },
    ];
    const result = merger.merge(skills);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('## skill-a');
    expect(result.value).toContain('## skill-b');
    expect(result.value).toContain('---');
  });

  it('커스텀 separator 적용', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'a', content: 'A', path: '/a', source: 'project' as const },
      { name: 'b', content: 'B', path: '/b', source: 'project' as const },
    ];
    const result = merger.merge(skills, { separator: '\n===\n' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('\n===\n');
  });

  it('filterNames 적용 — 해당 이름만 포함', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'keep-this', content: 'Keep', path: '/a', source: 'project' as const },
      { name: 'ignore-this', content: 'Ignore', path: '/b', source: 'project' as const },
    ];
    const result = merger.merge(skills, { filterNames: ['keep-this'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('## keep-this');
    expect(result.value).not.toContain('ignore-this');
  });

  it('filterNames가 빈 배열이면 빈 문자열 반환', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'some-skill', content: 'Content', path: '/a', source: 'project' as const },
    ];
    const result = merger.merge(skills, { filterNames: [] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('');
  });

  it('filterNames에 없는 이름만 지정하면 빈 문자열 반환', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'existing', content: 'Content', path: '/a', source: 'project' as const },
    ];
    const result = merger.merge(skills, { filterNames: ['non-existent'] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('');
  });

  it('includeReferences=false (기본) — references 제외', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'with-refs',
        content: 'Main content',
        path: '/a',
        source: 'project' as const,
        references: [{ name: 'ref1', content: 'Reference content' }],
      },
    ];
    const result = merger.merge(skills);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('Main content');
    expect(result.value).not.toContain('Reference content');
  });

  it('includeReferences=true — references 포함', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'with-refs',
        content: 'Main content',
        path: '/a',
        source: 'project' as const,
        references: [{ name: 'result-pattern', content: '# Result Pattern docs' }],
      },
    ];
    const result = merger.merge(skills, { includeReferences: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('Main content');
    expect(result.value).toContain('### references/result-pattern');
    expect(result.value).toContain('# Result Pattern docs');
  });

  it('includeReferences=true지만 references 없으면 — 추가 섹션 없음', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'no-refs',
        content: 'Only main content',
        path: '/a',
        source: 'project' as const,
      },
    ];
    const result = merger.merge(skills, { includeReferences: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('## no-refs');
    expect(result.value).not.toContain('### references/');
  });

  it('includeReferences=true — 여러 references 순서 유지', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'multi-refs',
        content: 'Main',
        path: '/a',
        source: 'project' as const,
        references: [
          { name: 'ref-alpha', content: 'Alpha' },
          { name: 'ref-beta', content: 'Beta' },
        ],
      },
    ];
    const result = merger.merge(skills, { includeReferences: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const text = result.value;
    const alphaIdx = text.indexOf('ref-alpha');
    const betaIdx = text.indexOf('ref-beta');
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  it('filterNames + includeReferences 동시 적용', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      {
        name: 'wanted',
        content: 'Wanted content',
        path: '/a',
        source: 'project' as const,
        references: [{ name: 'wanted-ref', content: 'Wanted ref content' }],
      },
      {
        name: 'unwanted',
        content: 'Unwanted content',
        path: '/b',
        source: 'project' as const,
        references: [{ name: 'unwanted-ref', content: 'Unwanted ref content' }],
      },
    ];
    const result = merger.merge(skills, {
      filterNames: ['wanted'],
      includeReferences: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('Wanted content');
    expect(result.value).toContain('Wanted ref content');
    expect(result.value).not.toContain('Unwanted content');
    expect(result.value).not.toContain('Unwanted ref content');
  });

  it('merge 결과에 skill 이름이 ## 헤더 형식으로 포함됨', () => {
    const merger = new SkillMerger(logger);
    const skills = [
      { name: 'my-awesome-skill', content: 'Awesome!', path: '/a', source: 'project' as const },
    ];
    const result = merger.merge(skills);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.startsWith('## my-awesome-skill')).toBe(true);
  });

  it('merge 후 scan 결과와 통합 — 전체 파이프라인', async () => {
    await mkdir(projectSkillsDir, { recursive: true });
    await createSkill(projectSkillsDir, 'pipe-skill', '# Pipeline Test');
    await createSkillReference(projectSkillsDir, 'pipe-skill', 'pipe-ref', '# Pipe Reference');

    const merger = new SkillMerger(logger);
    const scanResult = await merger.scan(projectSkillsDir);
    expect(scanResult.ok).toBe(true);
    if (!scanResult.ok) return;

    const mergeResult = merger.merge(scanResult.value, { includeReferences: true });
    expect(mergeResult.ok).toBe(true);
    if (!mergeResult.ok) return;

    expect(mergeResult.value).toContain('## pipe-skill');
    expect(mergeResult.value).toContain('Pipeline Test');
    expect(mergeResult.value).toContain('### references/pipe-ref');
    expect(mergeResult.value).toContain('Pipe Reference');
  });
});
