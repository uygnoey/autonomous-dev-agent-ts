/**
 * AgentMdGenerator 단위 테스트 / AgentMdGenerator unit tests
 *
 * @description
 * KR: generate(), generateOne(), saveDrafts() 전체 경로 검증.
 *     edge case 80%+ 비율 준수: API 실패, 빈 응답, 특수문자 projectName,
 *     파일 저장 실패, 누락된 에이전트 초안, 빈 techStack 등.
 * EN: Full coverage of generate(), generateOne(), saveDrafts().
 *     80%+ edge cases: API failure, empty response, special-char projectName,
 *     file write failure, missing draft entries, empty techStack, etc.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AgentName } from 'core/types.js';
import { AgentMdGenerator, type AgentMdGeneratorConfig } from 'layer1/agent-md-generator.js';
import { ALL_AGENT_NAMES } from 'layer1/agent-md-generator-instructions.js';
import { AdevError } from 'core/errors.js';
import { ConsoleLogger } from 'core/logger.js';

// ── 헬퍼 / Helpers ──────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentMdGeneratorConfig> = {}): AgentMdGeneratorConfig {
  return {
    projectPath: '/tmp/test-project',
    projectName: 'my-project',
    projectType: 'cli',
    techStack: 'TypeScript, Bun',
    conventions: 'ESM only, strict TypeScript',
    language: 'Korean',
    ...overrides,
  };
}

/** 성공 응답을 반환하는 claudeApi mock 생성 */
function makeSuccessApi(content = 'generated draft content') {
  return {
    createMessage: mock(async () => ({
      ok: true as const,
      value: {
        content,
        metadata: {
          model: 'claude-opus-4',
          inputTokens: 100,
          outputTokens: 200,
          stopReason: 'end_turn',
          requestId: 'req-1',
        },
      },
    })),
  };
}

/** 실패 응답을 반환하는 claudeApi mock 생성 */
function makeFailApi(code = 'agent_api_error', message = 'API failure') {
  return {
    createMessage: mock(async () => ({
      ok: false as const,
      error: new AdevError(code, message),
    })),
  };
}

const logger = new ConsoleLogger('error');

// ── 생성자 / Constructor ────────────────────────────────────────

describe('AgentMdGenerator 생성자', () => {
  it('인스턴스 생성됨', () => {
    const api = makeSuccessApi();
    expect(() => new AgentMdGenerator(api as never, logger)).not.toThrow();
  });

  it('AgentMdGenerator 인스턴스', () => {
    const api = makeSuccessApi();
    expect(new AgentMdGenerator(api as never, logger)).toBeInstanceOf(AgentMdGenerator);
  });

  it('두 인스턴스는 다른 객체', () => {
    const api = makeSuccessApi();
    const a = new AgentMdGenerator(api as never, logger);
    const b = new AgentMdGenerator(api as never, logger);
    expect(a).not.toBe(b);
  });

  it('generate 메서드 존재', () => {
    const api = makeSuccessApi();
    const gen = new AgentMdGenerator(api as never, logger);
    expect(typeof gen.generate).toBe('function');
  });

  it('generateOne 메서드 존재', () => {
    const api = makeSuccessApi();
    const gen = new AgentMdGenerator(api as never, logger);
    expect(typeof gen.generateOne).toBe('function');
  });

  it('saveDrafts 메서드 존재', () => {
    const api = makeSuccessApi();
    const gen = new AgentMdGenerator(api as never, logger);
    expect(typeof gen.saveDrafts).toBe('function');
  });
});

// ── generateOne() 정상 경로 / generateOne() happy path ─────────

describe('AgentMdGenerator generateOne() 정상 경로', () => {
  let gen: AgentMdGenerator;

  beforeEach(() => {
    gen = new AgentMdGenerator(makeSuccessApi('architect draft') as never, logger);
  });

  it('architect → ok 반환', async () => {
    const result = await gen.generateOne('architect', makeConfig());
    expect(result.ok).toBe(true);
  });

  it('architect → 내용 포함', async () => {
    const result = await gen.generateOne('architect', makeConfig());
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toBe('architect draft');
  });

  it('coder → ok 반환', async () => {
    const api = makeSuccessApi('coder draft');
    const g = new AgentMdGenerator(api as never, logger);
    const result = await g.generateOne('coder', makeConfig());
    expect(result.ok).toBe(true);
  });

  it('documenter → ok 반환', async () => {
    const api = makeSuccessApi('documenter draft');
    const g = new AgentMdGenerator(api as never, logger);
    const result = await g.generateOne('documenter', makeConfig());
    expect(result.ok).toBe(true);
  });
});

// ── generateOne() edge cases ─────────────────────────────────────

describe('AgentMdGenerator generateOne() edge cases', () => {
  it('API 실패 → err 반환', async () => {
    const api = makeFailApi('agent_api_error', 'network error');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('architect', makeConfig());
    expect(result.ok).toBe(false);
  });

  it('API 실패 → 에러 코드에 api_error 포함', async () => {
    const api = makeFailApi('agent_api_error', 'timeout');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('tester', makeConfig());
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toContain('api_error');
  });

  it('빈 응답 → err 반환', async () => {
    const api = makeSuccessApi('   ');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('qc', makeConfig());
    expect(result.ok).toBe(false);
  });

  it('빈 응답 → empty_response 코드', async () => {
    const api = makeSuccessApi('');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('reviewer', makeConfig());
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toContain('empty_response');
  });

  it('탭/줄바꿈만 있는 응답 → empty_response', async () => {
    const api = makeSuccessApi('\t\n\r\n');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('qa', makeConfig());
    expect(result.ok).toBe(false);
  });

  it('특수문자가 포함된 projectName → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const config = makeConfig({ projectName: 'my-proj/2024 <特殊>' });
    const result = await gen.generateOne('architect', config);
    expect(result.ok).toBe(true);
  });

  it('빈 techStack → ok 반환 (프롬프트는 빈 값으로 처리)', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('coder', makeConfig({ techStack: '' }));
    expect(result.ok).toBe(true);
  });

  it('빈 conventions → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('tester', makeConfig({ conventions: '' }));
    expect(result.ok).toBe(true);
  });

  it('영문 language → ok 반환', async () => {
    const api = makeSuccessApi('english draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('reviewer', makeConfig({ language: 'English' }));
    expect(result.ok).toBe(true);
  });

  it('매우 긴 projectName → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generateOne('documenter', makeConfig({ projectName: 'a'.repeat(500) }));
    expect(result.ok).toBe(true);
  });

  it('API 호출 시 messages 배열 전달됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generateOne('architect', makeConfig());
    expect(api.createMessage).toHaveBeenCalledTimes(1);
    const [messages] = (api.createMessage.mock.calls[0] ?? []) as [
      Array<{ role: string; content: string }>,
      ...unknown[]
    ];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages?.[0]?.role).toBe('user');
  });

  it('프롬프트에 agentName 포함됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generateOne('architect', makeConfig());
    const [messages] = (api.createMessage.mock.calls[0] ?? []) as [
      Array<{ role: string; content: string }>,
      ...unknown[]
    ];
    expect(messages?.[0]?.content).toContain('architect');
  });

  it('프롬프트에 projectName 포함됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generateOne('coder', makeConfig({ projectName: 'my-awesome-app' }));
    const [messages] = (api.createMessage.mock.calls[0] ?? []) as [
      Array<{ role: string; content: string }>,
      ...unknown[]
    ];
    expect(messages?.[0]?.content).toContain('my-awesome-app');
  });

  it('프롬프트에 techStack 포함됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generateOne('qa', makeConfig({ techStack: 'Rust, Tokio' }));
    const [messages] = (api.createMessage.mock.calls[0] ?? []) as [
      Array<{ role: string; content: string }>,
      ...unknown[]
    ];
    expect(messages?.[0]?.content).toContain('Rust, Tokio');
  });

  it('프롬프트에 language 포함됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generateOne('qc', makeConfig({ language: 'Japanese' }));
    const [messages] = (api.createMessage.mock.calls[0] ?? []) as [
      Array<{ role: string; content: string }>,
      ...unknown[]
    ];
    expect(messages?.[0]?.content).toContain('Japanese');
  });

  // 모든 7개 에이전트에 대해 동일한 API mock 동작 확인
  for (const agentName of ALL_AGENT_NAMES) {
    it(`${agentName} → ok 반환`, async () => {
      const api = makeSuccessApi(`${agentName} draft content`);
      const gen = new AgentMdGenerator(api as never, logger);
      const result = await gen.generateOne(agentName, makeConfig());
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.value).toBe(`${agentName} draft content`);
    });
  }
});

// ── generate() 정상 경로 / generate() happy path ────────────────

describe('AgentMdGenerator generate() 정상 경로', () => {
  it('7개 에이전트 모두 ok', async () => {
    const api = makeSuccessApi('draft content');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    expect(result.ok).toBe(true);
  });

  it('7개 에이전트 키 모두 포함', async () => {
    const api = makeSuccessApi('draft content');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    if (!result.ok) throw new Error('expected ok');
    for (const name of ALL_AGENT_NAMES) {
      expect(result.value[name]).toBeDefined();
    }
  });

  it('createMessage가 7회 호출됨', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    await gen.generate(makeConfig());
    expect(api.createMessage).toHaveBeenCalledTimes(7);
  });

  it('각 에이전트 초안 내용이 있음 (비어있지 않음)', async () => {
    const api = makeSuccessApi('some draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    if (!result.ok) throw new Error('expected ok');
    for (const name of ALL_AGENT_NAMES) {
      expect(result.value[name].length).toBeGreaterThan(0);
    }
  });
});

// ── generate() edge cases ─────────────────────────────────────────

describe('AgentMdGenerator generate() edge cases', () => {
  it('API 실패 → err 반환', async () => {
    const api = makeFailApi('agent_api_error', 'server down');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    expect(result.ok).toBe(false);
  });

  it('API 실패 → AdevError 반환', async () => {
    const api = makeFailApi();
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    if (result.ok) throw new Error('expected err');
    expect(result.error).toBeInstanceOf(AdevError);
  });

  it('빈 응답 → err 반환', async () => {
    const api = makeSuccessApi('');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    expect(result.ok).toBe(false);
  });

  it('빈 응답 → empty_response 코드', async () => {
    const api = makeSuccessApi('   ');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig());
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toContain('empty_response');
  });

  it('특수문자 projectName → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig({ projectName: '프로젝트/A & B <테스트>' }));
    expect(result.ok).toBe(true);
  });

  it('빈 projectType → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig({ projectType: '' }));
    expect(result.ok).toBe(true);
  });

  it('English language → ok 반환', async () => {
    const api = makeSuccessApi('english draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig({ language: 'English' }));
    expect(result.ok).toBe(true);
  });

  it('빈 techStack + 빈 conventions → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig({ techStack: '', conventions: '' }));
    expect(result.ok).toBe(true);
  });

  it('매우 긴 conventions → ok 반환', async () => {
    const api = makeSuccessApi('draft');
    const gen = new AgentMdGenerator(api as never, logger);
    const result = await gen.generate(makeConfig({ conventions: 'x'.repeat(2000) }));
    expect(result.ok).toBe(true);
  });
});

// ── saveDrafts() 정상 경로 / saveDrafts() happy path ────────────

describe('AgentMdGenerator saveDrafts() 정상 경로', () => {
  function makeFullDrafts(content = 'draft'): Record<AgentName, string> {
    return Object.fromEntries(ALL_AGENT_NAMES.map((n) => [n, content])) as Record<AgentName, string>;
  }

  it('모든 초안 저장 성공 → ok(void) 반환', async () => {
    const bunWriteMock = mock(async () => new Response());
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      const result = await gen.saveDrafts('/tmp/project', makeFullDrafts());
      expect(result.ok).toBe(true);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('Bun.write가 14회 호출됨 (.adev/agents + .claude/agents)', async () => {
    const bunWriteMock = mock(async () => new Response());
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/tmp/project', makeFullDrafts());
      // WHY: 7 에이전트 × 2 경로(.adev/agents + .claude/agents) = 14회
      expect(bunWriteMock).toHaveBeenCalledTimes(14);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('저장 경로에 .adev/agents 또는 .claude/agents 포함됨', async () => {
    const writtenPaths: string[] = [];
    const bunWriteMock = mock(async (path: unknown) => {
      writtenPaths.push(path as string);
      return new Response();
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/my/project', makeFullDrafts());
      // WHY: 각 에이전트는 .adev/agents/와 .claude/agents/ 두 경로에 저장됨
      for (const p of writtenPaths) {
        const hasAdevPath = p.includes('.adev/agents');
        const hasClaudePath = p.includes('.claude/agents');
        expect(hasAdevPath || hasClaudePath).toBe(true);
      }
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('각 저장 경로가 agentName.md 파일로 끝남', async () => {
    const writtenPaths: string[] = [];
    const bunWriteMock = mock(async (path: unknown) => {
      writtenPaths.push(path as string);
      return new Response();
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/proj', makeFullDrafts());
      for (const name of ALL_AGENT_NAMES) {
        expect(writtenPaths.some((p) => p.endsWith(`${name}.md`))).toBe(true);
      }
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });
});

// ── saveDrafts() edge cases ───────────────────────────────────────

describe('AgentMdGenerator saveDrafts() edge cases', () => {
  function makeFullDrafts(content = 'draft'): Record<AgentName, string> {
    return Object.fromEntries(ALL_AGENT_NAMES.map((n) => [n, content])) as Record<AgentName, string>;
  }

  it('Bun.write 실패 → err 반환', async () => {
    const bunWriteMock = mock(async () => {
      throw new Error('disk full');
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      const result = await gen.saveDrafts('/tmp/project', makeFullDrafts());
      expect(result.ok).toBe(false);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('Bun.write 실패 → write_error 코드', async () => {
    const bunWriteMock = mock(async () => {
      throw new Error('permission denied');
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      const result = await gen.saveDrafts('/tmp/project', makeFullDrafts());
      if (result.ok) throw new Error('expected err');
      expect(result.error.code).toContain('write_error');
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('누락된 에이전트 초안 → missing_draft 에러', async () => {
    const bunWriteMock = mock(async () => new Response());
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      // architect 누락
      const partialDrafts = makeFullDrafts();
      // biome-ignore lint/performance/noDelete: test needs to remove a key
      delete (partialDrafts as Partial<Record<AgentName, string>>)['architect'];
      const result = await gen.saveDrafts('/tmp/project', partialDrafts as Record<AgentName, string>);
      expect(result.ok).toBe(false);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('누락된 에이전트 초안 → missing_draft 코드', async () => {
    const bunWriteMock = mock(async () => new Response());
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      const partialDrafts = makeFullDrafts();
      // biome-ignore lint/performance/noDelete: test needs to remove a key
      delete (partialDrafts as Partial<Record<AgentName, string>>)['coder'];
      const result = await gen.saveDrafts('/tmp/project', partialDrafts as Record<AgentName, string>);
      if (result.ok) throw new Error('expected err');
      expect(result.error.code).toContain('missing_draft');
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('projectPath에 공백 포함 → 저장 경로에 반영됨', async () => {
    const writtenPaths: string[] = [];
    const bunWriteMock = mock(async (path: unknown) => {
      writtenPaths.push(path as string);
      return new Response();
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/my project/path', makeFullDrafts());
      expect(writtenPaths[0]).toContain('/my project/path');
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('빈 draft 내용으로 저장 가능 (saveDrafts는 내용 검증 안 함)', async () => {
    const bunWriteMock = mock(async () => new Response());
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      const emptyDrafts = makeFullDrafts('');
      const result = await gen.saveDrafts('/tmp/project', emptyDrafts);
      // saveDrafts는 내용을 검증하지 않음 (generateOne이 담당)
      expect(result.ok).toBe(true);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('첫 번째 write 실패 시 나머지 write는 호출되지 않음', async () => {
    let callCount = 0;
    const bunWriteMock = mock(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first write failed');
      return new Response();
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/tmp/project', makeFullDrafts());
      // 첫 실패 후 즉시 중단되므로 1회 이상 호출되지 않아야 함
      expect(callCount).toBe(1);
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });

  it('특수문자 projectPath → Bun.write에 그대로 전달됨', async () => {
    const writtenPaths: string[] = [];
    const bunWriteMock = mock(async (path: unknown) => {
      writtenPaths.push(path as string);
      return new Response();
    });
    const originalWrite = Bun.write;
    (Bun as { write: typeof Bun.write }).write = bunWriteMock as typeof Bun.write;

    try {
      const api = makeSuccessApi();
      const gen = new AgentMdGenerator(api as never, logger);
      await gen.saveDrafts('/tmp/proj-특수/2024', makeFullDrafts());
      expect(writtenPaths[0]).toContain('/tmp/proj-특수/2024');
    } finally {
      (Bun as { write: typeof Bun.write }).write = originalWrite;
    }
  });
});

// ── AGENT_SPECIFIC_INSTRUCTIONS 상수 검증 / Constant validation ─

describe('AGENT_SPECIFIC_INSTRUCTIONS 상수 검증', () => {
  it('7개 에이전트 모두 키 존재', () => {
    const { AGENT_SPECIFIC_INSTRUCTIONS } = require('layer1/agent-md-generator-instructions.js');
    for (const name of ALL_AGENT_NAMES) {
      expect(AGENT_SPECIFIC_INSTRUCTIONS[name]).toBeDefined();
    }
  });

  it('각 지침이 빈 문자열이 아님', () => {
    const { AGENT_SPECIFIC_INSTRUCTIONS } = require('layer1/agent-md-generator-instructions.js');
    for (const name of ALL_AGENT_NAMES) {
      expect(AGENT_SPECIFIC_INSTRUCTIONS[name].length).toBeGreaterThan(0);
    }
  });

  it('ALL_AGENT_NAMES 길이가 7', () => {
    expect(ALL_AGENT_NAMES.length).toBe(7);
  });

  it('ALL_AGENT_NAMES에 architect 포함', () => {
    expect(ALL_AGENT_NAMES).toContain('architect');
  });

  it('ALL_AGENT_NAMES에 documenter 포함', () => {
    expect(ALL_AGENT_NAMES).toContain('documenter');
  });

  it('ALL_AGENT_NAMES에 중복 없음', () => {
    const unique = new Set(ALL_AGENT_NAMES);
    expect(unique.size).toBe(ALL_AGENT_NAMES.length);
  });
});
