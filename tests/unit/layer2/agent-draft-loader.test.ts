/**
 * AgentDraftLoader 단위 테스트 / AgentDraftLoader unit tests
 *
 * @description
 * KR: 파일 우선순위, 폴백, 병렬 로드, 에러 처리 등 edge case 80%+로 검증.
 * EN: Validates file priority, fallback, parallel load, and error handling with 80%+ edge cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rmdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { AGENT_NAMES, AgentDraftLoader } from 'layer2/agent-draft-loader.js';

// ── 테스트 픽스처 / Test fixtures ─────────────────────────────────

const logger = new ConsoleLogger('error');
const TMP_BASE = join(import.meta.dir, '__tmp_draft_loader__');
const PROJECT_DIR = join(TMP_BASE, 'project');
const GLOBAL_DIR = join(TMP_BASE, 'global');
const NONEXISTENT_DIR = join(TMP_BASE, 'does_not_exist_xyz_12345');

async function setupDirs(): Promise<void> {
  await mkdir(PROJECT_DIR, { recursive: true });
  await mkdir(GLOBAL_DIR, { recursive: true });
}

async function teardownDirs(): Promise<void> {
  try {
    await rmdir(TMP_BASE, { recursive: true });
  } catch {
    // 무시 — 이미 삭제된 경우
  }
}

async function writeAgentFile(dir: string, agentName: AgentName, content: string): Promise<string> {
  const filePath = join(dir, `${agentName}.md`);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

function makeLoader(): AgentDraftLoader {
  return new AgentDraftLoader(logger);
}

// ── AGENT_NAMES 상수 ────────────────────────────────────────────

describe('AGENT_NAMES 상수', () => {
  it('7개 에이전트 이름을 포함한다', () => {
    expect(AGENT_NAMES.length).toBe(7);
  });

  it('architect 포함', () => {
    expect(AGENT_NAMES).toContain('architect');
  });

  it('coder 포함', () => {
    expect(AGENT_NAMES).toContain('coder');
  });

  it('tester 포함', () => {
    expect(AGENT_NAMES).toContain('tester');
  });

  it('qc 포함', () => {
    expect(AGENT_NAMES).toContain('qc');
  });

  it('qa 포함', () => {
    expect(AGENT_NAMES).toContain('qa');
  });

  it('reviewer 포함', () => {
    expect(AGENT_NAMES).toContain('reviewer');
  });

  it('documenter 포함', () => {
    expect(AGENT_NAMES).toContain('documenter');
  });

  it('중복 없음', () => {
    const unique = new Set(AGENT_NAMES);
    expect(unique.size).toBe(AGENT_NAMES.length);
  });
});

// ── 생성자 ──────────────────────────────────────────────────────

describe('AgentDraftLoader 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeLoader()).not.toThrow();
  });

  it('AgentDraftLoader 인스턴스', () => {
    expect(makeLoader()).toBeInstanceOf(AgentDraftLoader);
  });

  it('load 메서드 존재', () => {
    expect(typeof makeLoader().load).toBe('function');
  });

  it('loadAll 메서드 존재', () => {
    expect(typeof makeLoader().loadAll).toBe('function');
  });
});

// ── load() — builtin 폴백 (edge case) ─────────────────────────

describe('AgentDraftLoader.load — builtin 폴백', () => {
  it('dir 인자 없으면 builtin 반환', async () => {
    const loader = makeLoader();
    const result = await loader.load('architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('builtin');
    }
  });

  it('존재하지 않는 projectDir → builtin 반환', async () => {
    const loader = makeLoader();
    const result = await loader.load('coder', NONEXISTENT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('builtin');
    }
  });

  it('존재하지 않는 globalDir → builtin 반환', async () => {
    const loader = makeLoader();
    const result = await loader.load('tester', undefined, NONEXISTENT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('builtin');
    }
  });

  it('둘 다 존재하지 않음 → builtin 반환', async () => {
    const loader = makeLoader();
    const result = await loader.load('qa', NONEXISTENT_DIR, NONEXISTENT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('builtin');
    }
  });

  it('builtin: content는 빈 문자열', async () => {
    const loader = makeLoader();
    const result = await loader.load('reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('');
    }
  });

  it('builtin: sourcePath는 빈 문자열', async () => {
    const loader = makeLoader();
    const result = await loader.load('documenter');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourcePath).toBe('');
    }
  });

  it('builtin: agentName 일치', async () => {
    const loader = makeLoader();
    const result = await loader.load('qc');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentName).toBe('qc');
    }
  });
});

// ── load() — 실제 파일 로드 (edge case) ──────────────────────

describe('AgentDraftLoader.load — 실제 파일', () => {
  beforeEach(setupDirs);
  afterEach(teardownDirs);

  it('projectDir에 파일 있음 → project 반환', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'architect', '# Architect\nDesign system');
    const result = await loader.load('architect', PROJECT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('project');
    }
  });

  it('project 파일 내용 정확히 읽힘', async () => {
    const loader = makeLoader();
    const content = '# Coder Agent\nWrite code only';
    await writeAgentFile(PROJECT_DIR, 'coder', content);
    const result = await loader.load('coder', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it('globalDir에 파일 있음 → global 반환', async () => {
    const loader = makeLoader();
    await writeAgentFile(GLOBAL_DIR, 'tester', '# Tester\nRun tests');
    const result = await loader.load('tester', NONEXISTENT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('global');
    }
  });

  it('global 파일 내용 정확히 읽힘', async () => {
    const loader = makeLoader();
    const content = '# QA Agent\nCheck quality';
    await writeAgentFile(GLOBAL_DIR, 'qa', content);
    const result = await loader.load('qa', NONEXISTENT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it('projectDir 우선순위 — globalDir에도 파일 있을 때 project 반환', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'reviewer', '# Project Reviewer');
    await writeAgentFile(GLOBAL_DIR, 'reviewer', '# Global Reviewer');
    const result = await loader.load('reviewer', PROJECT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('project');
      expect(result.value.content).toBe('# Project Reviewer');
    }
  });

  it('projectDir에 없고 globalDir에 있을 때 global 반환', async () => {
    const loader = makeLoader();
    await writeAgentFile(GLOBAL_DIR, 'documenter', '# Global Documenter');
    const result = await loader.load('documenter', PROJECT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('global');
    }
  });

  it('빈 .md 파일 → content 빈 문자열, source=project', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'qc', '');
    const result = await loader.load('qc', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('');
      expect(result.value.source).toBe('project');
    }
  });

  it('sourcePath에 파일 경로 포함', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'architect', '# Arch');
    const result = await loader.load('architect', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourcePath).toContain('architect.md');
    }
  });

  it('agentName 필드 일치 — project 소스', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'coder', '# Coder');
    const result = await loader.load('coder', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentName).toBe('coder');
    }
  });

  it('agentName 필드 일치 — global 소스', async () => {
    const loader = makeLoader();
    await writeAgentFile(GLOBAL_DIR, 'tester', '# Tester');
    const result = await loader.load('tester', NONEXISTENT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentName).toBe('tester');
    }
  });

  it('멀티라인 콘텐츠 정확히 읽힘', async () => {
    const loader = makeLoader();
    const content = '# Reviewer\nLine 1\nLine 2\n\nParagraph 2';
    await writeAgentFile(PROJECT_DIR, 'reviewer', content);
    const result = await loader.load('reviewer', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it('Unicode 콘텐츠 정확히 읽힘', async () => {
    const loader = makeLoader();
    const content = '# 아키텍트\n설계 전담 에이전트입니다. 코드 수정 금지.';
    await writeAgentFile(PROJECT_DIR, 'architect', content);
    const result = await loader.load('architect', PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });
});

// ── loadAll() — 병렬 로드 ──────────────────────────────────────

describe('AgentDraftLoader.loadAll — 병렬 로드', () => {
  beforeEach(setupDirs);
  afterEach(teardownDirs);

  it('dir 없으면 7개 모두 builtin으로 반환', async () => {
    const loader = makeLoader();
    const result = await loader.loadAll();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(7);
      for (const item of result.value) {
        expect(item.source).toBe('builtin');
      }
    }
  });

  it('모두 builtin일 때 content 모두 빈 문자열', async () => {
    const loader = makeLoader();
    const result = await loader.loadAll();
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const item of result.value) {
        expect(item.content).toBe('');
      }
    }
  });

  it('모든 에이전트 이름 포함됨', async () => {
    const loader = makeLoader();
    const result = await loader.loadAll();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.map((item) => item.agentName);
      for (const name of AGENT_NAMES) {
        expect(names).toContain(name);
      }
    }
  });

  it('7개 에이전트 모두 project 파일 있음 → 모두 project 반환', async () => {
    const loader = makeLoader();
    for (const name of AGENT_NAMES) {
      await writeAgentFile(PROJECT_DIR, name, `# ${name} role`);
    }
    const result = await loader.loadAll(PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(7);
      for (const item of result.value) {
        expect(item.source).toBe('project');
      }
    }
  });

  it('일부만 project 파일 있음 → 없는 것은 builtin 폴백', async () => {
    const loader = makeLoader();
    // architect, coder만 프로젝트 파일 작성
    await writeAgentFile(PROJECT_DIR, 'architect', '# Arch');
    await writeAgentFile(PROJECT_DIR, 'coder', '# Code');
    const result = await loader.loadAll(PROJECT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const byName = Object.fromEntries(result.value.map((item) => [item.agentName, item]));
      expect(byName['architect']?.source).toBe('project');
      expect(byName['coder']?.source).toBe('project');
      expect(byName['tester']?.source).toBe('builtin');
      expect(byName['qc']?.source).toBe('builtin');
      expect(byName['qa']?.source).toBe('builtin');
      expect(byName['reviewer']?.source).toBe('builtin');
      expect(byName['documenter']?.source).toBe('builtin');
    }
  });

  it('project 없고 global에 일부 파일 있음 → global 반환', async () => {
    const loader = makeLoader();
    await writeAgentFile(GLOBAL_DIR, 'tester', '# Global Tester');
    await writeAgentFile(GLOBAL_DIR, 'reviewer', '# Global Reviewer');
    const result = await loader.loadAll(NONEXISTENT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const byName = Object.fromEntries(result.value.map((item) => [item.agentName, item]));
      expect(byName['tester']?.source).toBe('global');
      expect(byName['reviewer']?.source).toBe('global');
      expect(byName['architect']?.source).toBe('builtin');
    }
  });

  it('project와 global 혼합 — project 우선순위 유지', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'architect', '# Project Arch');
    await writeAgentFile(GLOBAL_DIR, 'architect', '# Global Arch');
    await writeAgentFile(GLOBAL_DIR, 'coder', '# Global Coder');
    const result = await loader.loadAll(PROJECT_DIR, GLOBAL_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const byName = Object.fromEntries(result.value.map((item) => [item.agentName, item]));
      // architect는 project 우선
      expect(byName['architect']?.source).toBe('project');
      expect(byName['architect']?.content).toBe('# Project Arch');
      // coder는 project에 없으니 global
      expect(byName['coder']?.source).toBe('global');
    }
  });

  it('결과 배열 길이는 항상 7', async () => {
    const loader = makeLoader();
    const result = await loader.loadAll(NONEXISTENT_DIR, NONEXISTENT_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(7);
    }
  });

  it('여러 번 호출해도 동일한 결과', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'architect', '# Arch');
    const r1 = await loader.loadAll(PROJECT_DIR);
    const r2 = await loader.loadAll(PROJECT_DIR);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const names1 = r1.value.map((i) => i.agentName).sort();
      const names2 = r2.value.map((i) => i.agentName).sort();
      expect(names1).toEqual(names2);
    }
  });
});

// ── load() — 에러 처리 (edge case) ────────────────────────────

describe('AgentDraftLoader.load — 에러 처리', () => {
  it('ok 필드는 항상 boolean', async () => {
    const loader = makeLoader();
    const result = await loader.load('architect');
    expect(typeof result.ok).toBe('boolean');
  });

  it('builtin 반환시 ok=true', async () => {
    const loader = makeLoader();
    const result = await loader.load('coder', NONEXISTENT_DIR, NONEXISTENT_DIR);
    expect(result.ok).toBe(true);
  });

  it('모든 에이전트 이름에 대해 builtin 폴백 성공', async () => {
    const loader = makeLoader();
    for (const name of AGENT_NAMES) {
      const result = await loader.load(name);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentName).toBe(name);
        expect(result.value.source).toBe('builtin');
      }
    }
  });
});

// ── load() — 반복 / 병렬 안정성 ────────────────────────────────

describe('AgentDraftLoader.load — 반복 안정성', () => {
  beforeEach(setupDirs);
  afterEach(teardownDirs);

  it('동일한 파일을 10회 반복 로드 — 결과 동일', async () => {
    const loader = makeLoader();
    const content = '# Stable Agent';
    await writeAgentFile(PROJECT_DIR, 'architect', content);
    for (let i = 0; i < 10; i++) {
      const result = await loader.load('architect', PROJECT_DIR);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe(content);
      }
    }
  });

  it('동일 로더로 다른 에이전트 순차 로드 가능', async () => {
    const loader = makeLoader();
    await writeAgentFile(PROJECT_DIR, 'architect', '# Arch');
    await writeAgentFile(PROJECT_DIR, 'coder', '# Code');

    const r1 = await loader.load('architect', PROJECT_DIR);
    const r2 = await loader.load('coder', PROJECT_DIR);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.agentName).toBe('architect');
      expect(r2.value.agentName).toBe('coder');
    }
  });
});
