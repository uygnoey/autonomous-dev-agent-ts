/**
 * AgentGenerator 단위 테스트 / AgentGenerator unit tests
 *
 * @description
 * 에이전트 역할별 설정 생성, 도구 목록, 시스템 프롬프트, 최대 턴 수 등
 * 모든 경로를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { AgentName } from 'core/types.js';
import { AgentGenerator } from 'layer2/agent-generator.js';

const logger = new ConsoleLogger('error');
const ALL_AGENT_NAMES: AgentName[] = [
  'architect',
  'qa',
  'coder',
  'tester',
  'qc',
  'reviewer',
  'documenter',
];

function makeGenerator(): AgentGenerator {
  return new AgentGenerator(logger);
}

// ── 생성자 ─────────────────────────────────────────────────────

describe('AgentGenerator 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makeGenerator()).not.toThrow();
  });

  it('AgentGenerator 인스턴스', () => {
    expect(makeGenerator()).toBeInstanceOf(AgentGenerator);
  });
});

// ── generateAgentConfig — 기본 동작 ──────────────────────────

describe('AgentGenerator.generateAgentConfig 기본 동작', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('항상 ok 반환', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(result.ok).toBe(true);
  });

  it('config.name 일치', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('coder');
    }
  });

  it('config.featureId 일치', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'my-feat');
    if (result.ok) {
      expect(result.value.featureId).toBe('my-feat');
    }
  });

  it('systemPrompt에 projectSpec 포함', () => {
    const result = generator.generateAgentConfig('architect', 'MY_SPEC_CONTENT', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('MY_SPEC_CONTENT');
    }
  });

  it('prompt에 featureId 포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'special-feature');
    if (result.ok) {
      expect(result.value.prompt).toContain('special-feature');
    }
  });
});

// ── 역할별 도구 목록 ───────────────────────────────────────────

describe('AgentGenerator 역할별 도구 목록', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect — Read, Glob, Grep, WebSearch 포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Glob');
      expect(result.value.tools).toContain('Grep');
      expect(result.value.tools).toContain('WebSearch');
    }
  });

  it('coder — Write, Edit, Bash 포함 (코드 수정 권한)', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Write');
      expect(result.value.tools).toContain('Edit');
      expect(result.value.tools).toContain('Bash');
    }
  });

  it('qa — Write 미포함 (코드 수정 불가)', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('reviewer — Write 미포함', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('documenter — Write 포함 (문서 작성 권한)', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Write');
    }
  });

  it('tester — Bash 포함 (테스트 실행 권한)', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Bash');
    }
  });

  it('qc — 코드 수정 도구 없음', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });
});

// ── 역할별 최대 턴 수 ──────────────────────────────────────────

describe('AgentGenerator 역할별 최대 턴 수', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('coder가 가장 많은 턴 수 (100)', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(100);
    }
  });

  it('architect — 50턴', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(50);
    }
  });

  it('tester — 80턴', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(80);
    }
  });

  it('qa, qc, reviewer — 30턴', () => {
    for (const name of ['qa', 'qc', 'reviewer'] as AgentName[]) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.maxTurns).toBe(30);
      }
    }
  });

  it('documenter — 40턴', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(40);
    }
  });
});

// ── 역할별 기본 Phase ─────────────────────────────────────────

describe('AgentGenerator 역할별 기본 Phase', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect → DESIGN Phase', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
    }
  });

  it('coder → CODE Phase', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('CODE');
    }
  });

  it('tester → TEST Phase', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('TEST');
    }
  });

  it('qc → TEST Phase', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('TEST');
    }
  });
});

// ── 시스템 프롬프트 내용 ───────────────────────────────────────

describe('AgentGenerator 시스템 프롬프트 내용', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it.each(ALL_AGENT_NAMES)('%s — 비어있지 않은 시스템 프롬프트', (name) => {
    const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  it.each(ALL_AGENT_NAMES)('%s — 실행 프롬프트 비어있지 않음', (name) => {
    const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt.length).toBeGreaterThan(0);
    }
  });

  it('긴 스펙 → 시스템 프롬프트에 포함됨', () => {
    const longSpec = 'spec-'.repeat(500);
    const result = generator.generateAgentConfig('architect', longSpec, 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain(longSpec);
    }
  });

  it('빈 스펙 → ok 반환 (오류 없음)', () => {
    const result = generator.generateAgentConfig('architect', '', 'feat-1');
    expect(result.ok).toBe(true);
  });
});

// ── 전체 에이전트 이름 검증 ────────────────────────────────────

describe('AgentGenerator 전체 에이전트 설정 생성', () => {
  it.each(ALL_AGENT_NAMES)('%s — generateAgentConfig 성공', (name) => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig(name, 'some spec content', `feat-${name}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe(name);
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('AgentGenerator 랜덤/경계값', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('랜덤 featureId #%i', (i) => {
    const generator = makeGenerator();
    const agentName = ALL_AGENT_NAMES[i % ALL_AGENT_NAMES.length] as AgentName;
    const featureId = `feat-random-${i}-${'x'.repeat(i)}`;
    const result = generator.generateAgentConfig(agentName, `spec-${i}`, featureId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
      expect(result.value.prompt).toContain(featureId);
    }
  });

  it.each(Array.from({ length: 10 }, (_, i) => i))('다양한 스펙 길이 #%i', (i) => {
    const generator = makeGenerator();
    const spec = i === 0 ? '' : 'x'.repeat(i * 100);
    const result = generator.generateAgentConfig('coder', spec, `feat-${i}`);
    expect(result.ok).toBe(true);
  });

  it('특수문자 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-특수!@#$%^&*()');
    expect(result.ok).toBe(true);
  });

  it('유니코드 스펙 → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', '한국어 스펙 내용입니다 🚀', 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('한국어 스펙 내용입니다 🚀');
    }
  });
});

// ── 대량 생성 성능 ────────────────────────────────────────────

describe('AgentGenerator 대량 생성 성능', () => {
  it('500개 설정 생성 → 성능 문제 없음', () => {
    const generator = makeGenerator();
    for (let i = 0; i < 500; i++) {
      const agentName = ALL_AGENT_NAMES[i % ALL_AGENT_NAMES.length] as AgentName;
      const result = generator.generateAgentConfig(agentName, `spec-${i}`, `feat-${i}`);
      expect(result.ok).toBe(true);
    }
  });
});
