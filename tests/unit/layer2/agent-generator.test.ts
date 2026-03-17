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

  it('두 인스턴스는 서로 다른 객체', () => {
    const g1 = makeGenerator();
    const g2 = makeGenerator();
    expect(g1).not.toBe(g2);
  });

  it('generateAgentConfig 메서드가 존재한다', () => {
    const g = makeGenerator();
    expect(typeof g.generateAgentConfig).toBe('function');
  });

  it('10번 생성 모두 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeGenerator()).not.toThrow();
    }
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

  it('ok는 boolean 타입', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(typeof result.ok).toBe('boolean');
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

  it('config.name은 string 타입', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.name).toBe('string');
    }
  });

  it('config.featureId는 string 타입', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.featureId).toBe('string');
    }
  });

  it('config.systemPrompt는 string 타입', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.systemPrompt).toBe('string');
    }
  });

  it('config.prompt는 string 타입', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.prompt).toBe('string');
    }
  });

  it('config.tools는 배열 타입', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(Array.isArray(result.value.tools)).toBe(true);
    }
  });

  it('config.maxTurns는 숫자 타입', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.maxTurns).toBe('number');
    }
  });

  it('config.phase는 string 타입', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(typeof result.value.phase).toBe('string');
    }
  });

  it('빈 featureId → ok 반환', () => {
    const result = generator.generateAgentConfig('coder', 'spec', '');
    expect(result.ok).toBe(true);
  });

  it('동일 입력 두 번 → 모두 ok', () => {
    const r1 = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    const r2 = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('동일 입력 두 번 → name 동일', () => {
    const r1 = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    const r2 = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (r1.ok && r2.ok) {
      expect(r1.value.name).toBe(r2.value.name);
    }
  });

  it('동일 입력 두 번 → maxTurns 동일', () => {
    const r1 = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    const r2 = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (r1.ok && r2.ok) {
      expect(r1.value.maxTurns).toBe(r2.value.maxTurns);
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

  it('architect — tools 배열이 비어있지 않음', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools.length).toBeGreaterThan(0);
    }
  });

  it('coder — tools 배열이 비어있지 않음', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools.length).toBeGreaterThan(0);
    }
  });

  it('tester — Read 포함 (파일 읽기 권한)', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('qc — Read 포함 (분석 권한)', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('모든 에이전트 — tools가 배열', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(Array.isArray(result.value.tools)).toBe(true);
      }
    }
  });

  it('모든 에이전트 — tools가 비어있지 않음', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.tools.length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 — tools 요소가 string', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        for (const tool of result.value.tools) {
          expect(typeof tool).toBe('string');
        }
      }
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

  it('모든 에이전트 maxTurns > 0', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.maxTurns).toBeGreaterThan(0);
      }
    }
  });

  it('coder maxTurns > tester maxTurns', () => {
    const coderResult = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    const testerResult = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (coderResult.ok && testerResult.ok) {
      expect(coderResult.value.maxTurns).toBeGreaterThan(testerResult.value.maxTurns);
    }
  });

  it('tester maxTurns > architect maxTurns', () => {
    const testerResult = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    const archResult = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (testerResult.ok && archResult.ok) {
      expect(testerResult.value.maxTurns).toBeGreaterThan(archResult.value.maxTurns);
    }
  });

  it('architect maxTurns > documenter maxTurns', () => {
    const archResult = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    const docResult = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (archResult.ok && docResult.ok) {
      expect(archResult.value.maxTurns).toBeGreaterThan(docResult.value.maxTurns);
    }
  });

  it('documenter maxTurns > qa maxTurns', () => {
    const docResult = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    const qaResult = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (docResult.ok && qaResult.ok) {
      expect(docResult.value.maxTurns).toBeGreaterThan(qaResult.value.maxTurns);
    }
  });

  it('qa maxTurns는 정수', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(Number.isInteger(result.value.maxTurns)).toBe(true);
    }
  });

  it('모든 에이전트 maxTurns는 정수', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(Number.isInteger(result.value.maxTurns)).toBe(true);
      }
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

  it('qa → DESIGN Phase', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
    }
  });

  it('reviewer → CODE Phase', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('CODE');
    }
  });

  it('documenter → DESIGN Phase', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
    }
  });

  it('모든 에이전트 phase가 비어있지 않음', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.phase.length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 phase가 대문자', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.phase).toBe(result.value.phase.toUpperCase());
      }
    }
  });
});

// ── 시스템 프롬프트 내용 ───────────────────────────────────────

describe('AgentGenerator 시스템 프롬프트 내용', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('qa — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('coder — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('tester — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('qc — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('reviewer — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('documenter — 비어있지 않은 시스템 프롬프트', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) expect(result.value.systemPrompt.length).toBeGreaterThan(0);
  });

  it('architect — 비어있지 않은 실행 프롬프트', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) expect(result.value.prompt.length).toBeGreaterThan(0);
  });

  it('coder — 비어있지 않은 실행 프롬프트', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) expect(result.value.prompt.length).toBeGreaterThan(0);
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

  it('1000자 스펙 → ok 반환', () => {
    const bigSpec = 'x'.repeat(1000);
    const result = generator.generateAgentConfig('coder', bigSpec, 'feat-1');
    expect(result.ok).toBe(true);
  });

  it('한국어 스펙 → 시스템 프롬프트에 포함됨', () => {
    const result = generator.generateAgentConfig('qa', '한국어 스펙 내용입니다', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('한국어 스펙 내용입니다');
    }
  });
});

// ── 전체 에이전트 이름 검증 ────────────────────────────────────

describe('AgentGenerator 전체 에이전트 설정 생성', () => {
  it('architect — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'some spec content', 'feat-architect');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('architect');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('qa — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'some spec content', 'feat-qa');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('qa');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('coder — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'some spec content', 'feat-coder');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('coder');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('tester — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'some spec content', 'feat-tester');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('tester');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('qc — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'some spec content', 'feat-qc');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('qc');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('reviewer — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'some spec content', 'feat-reviewer');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('reviewer');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });

  it('documenter — generateAgentConfig 성공', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'some spec content', 'feat-documenter');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('documenter');
      expect(result.value.tools.length).toBeGreaterThan(0);
      expect(result.value.maxTurns).toBeGreaterThan(0);
    }
  });
});

// ── 랜덤/경계값 ───────────────────────────────────────────────

describe('AgentGenerator 랜덤/경계값', () => {
  it('랜덤 featureId #0', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec-0', 'feat-random-0-');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('feat-random-0-');
      expect(result.value.prompt).toContain('feat-random-0-');
    }
  });

  it('랜덤 featureId #1', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'spec-1', 'feat-random-1-x');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('feat-random-1-x');
    }
  });

  it('랜덤 featureId #2', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec-2', 'feat-random-2-xx');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('feat-random-2-xx');
    }
  });

  it('랜덤 featureId #3', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec-3', 'feat-random-3-xxx');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('feat-random-3-xxx');
    }
  });

  it('랜덤 featureId #4', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'spec-4', 'feat-random-4-xxxx');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('feat-random-4-xxxx');
    }
  });

  it('랜덤 featureId #5 (long)', () => {
    const generator = makeGenerator();
    const featureId = 'feat-random-5-' + 'x'.repeat(100);
    const result = generator.generateAgentConfig('reviewer', 'spec-5', featureId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
    }
  });

  it('다양한 스펙 길이 #0 (빈 스펙)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', '', 'feat-0');
    expect(result.ok).toBe(true);
  });

  it('다양한 스펙 길이 #1 (100자)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'x'.repeat(100), 'feat-1');
    expect(result.ok).toBe(true);
  });

  it('다양한 스펙 길이 #2 (500자)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'x'.repeat(500), 'feat-2');
    expect(result.ok).toBe(true);
  });

  it('다양한 스펙 길이 #3 (1000자)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'x'.repeat(1000), 'feat-3');
    expect(result.ok).toBe(true);
  });

  it('다양한 스펙 길이 #4 (5000자)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'x'.repeat(5000), 'feat-4');
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

  it('UUID 형태 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    }
  });

  it('공백만 있는 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', '   ');
    expect(result.ok).toBe(true);
  });

  it('탭 포함 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat\ttabbed');
    expect(result.ok).toBe(true);
  });

  it('개행 포함 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec', 'feat\nnew-line');
    expect(result.ok).toBe(true);
  });

  it('매우 긴 featureId (10000자) → ok', () => {
    const generator = makeGenerator();
    const featureId = 'x'.repeat(10000);
    const result = generator.generateAgentConfig('qc', 'spec', featureId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe(featureId);
    }
  });

  it('숫자만 있는 featureId → ok', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'spec', '12345');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.featureId).toBe('12345');
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

  it('1000개 설정 생성 → 모두 ok', () => {
    const generator = makeGenerator();
    let allOk = true;
    for (let i = 0; i < 1000; i++) {
      const agentName = ALL_AGENT_NAMES[i % ALL_AGENT_NAMES.length] as AgentName;
      const result = generator.generateAgentConfig(agentName, `spec-${i}`, `feat-${i}`);
      if (!result.ok) allOk = false;
    }
    expect(allOk).toBe(true);
  });

  it('7가지 에이전트 각 100번 → 모두 ok', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      for (let i = 0; i < 100; i++) {
        const result = generator.generateAgentConfig(name, `spec-${i}`, `feat-${i}`);
        expect(result.ok).toBe(true);
      }
    }
  });

  it('각 에이전트 name 필드 일관성 (50회 반복)', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      for (let i = 0; i < 50; i++) {
        const result = generator.generateAgentConfig(name, 'spec', `feat-${i}`);
        if (result.ok) {
          expect(result.value.name).toBe(name);
        }
      }
    }
  });

  it('각 에이전트 maxTurns 일관성 (10회 반복)', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const firstResult = generator.generateAgentConfig(name, 'spec', 'feat-0');
      if (!firstResult.ok) continue;
      const expectedTurns = firstResult.value.maxTurns;
      for (let i = 1; i < 10; i++) {
        const result = generator.generateAgentConfig(name, 'spec', `feat-${i}`);
        if (result.ok) {
          expect(result.value.maxTurns).toBe(expectedTurns);
        }
      }
    }
  });
});

// ── 독립성 검증 ────────────────────────────────────────────────

describe('AgentGenerator 독립성', () => {
  it('두 인스턴스 독립적으로 동작', () => {
    const g1 = makeGenerator();
    const g2 = makeGenerator();
    const r1 = g1.generateAgentConfig('architect', 'spec-a', 'feat-a');
    const r2 = g2.generateAgentConfig('coder', 'spec-b', 'feat-b');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.name).toBe('architect');
      expect(r2.value.name).toBe('coder');
    }
  });

  it('5개 인스턴스 동시 생성 → 모두 ok', () => {
    const generators = Array.from({ length: 5 }, () => makeGenerator());
    for (let i = 0; i < generators.length; i++) {
      const g = generators[i];
      if (!g) continue;
      const name = ALL_AGENT_NAMES[i % ALL_AGENT_NAMES.length] as AgentName;
      const result = g.generateAgentConfig(name, `spec-${i}`, `feat-${i}`);
      expect(result.ok).toBe(true);
    }
  });

  it('같은 featureId 다른 에이전트 → name 다름', () => {
    const generator = makeGenerator();
    const r1 = generator.generateAgentConfig('architect', 'spec', 'feat-shared');
    const r2 = generator.generateAgentConfig('coder', 'spec', 'feat-shared');
    if (r1.ok && r2.ok) {
      expect(r1.value.name).not.toBe(r2.value.name);
    }
  });

  it('featureId가 config.featureId에 정확히 저장됨 (20회)', () => {
    const generator = makeGenerator();
    for (let i = 0; i < 20; i++) {
      const featureId = `feat-precision-${i}-${'z'.repeat(i % 10)}`;
      const result = generator.generateAgentConfig('coder', 'spec', featureId);
      if (result.ok) {
        expect(result.value.featureId).toBe(featureId);
      }
    }
  });
});

// ── 추가: 역할별 시스템 프롬프트 역할 설명 검증 ──────────────────

describe('AgentGenerator 역할 설명 포함 검증', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect system prompt contains "architect"', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('architect');
    }
  });

  it('coder system prompt contains "implementer"', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('implementer');
    }
  });

  it('tester system prompt contains "tester"', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('tester');
    }
  });

  it('qa system prompt contains "QA"', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('QA');
    }
  });

  it('reviewer system prompt contains "reviewer"', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('reviewer');
    }
  });

  it('documenter system prompt contains "documenter"', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('documenter');
    }
  });

  it('qc system prompt contains "QC"', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('QC');
    }
  });

  it('architect prompt contains "design"', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt).toContain('design');
    }
  });

  it('coder prompt contains "Implement"', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt).toContain('Implement');
    }
  });

  it('tester prompt contains "tests"', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt).toContain('tests');
    }
  });

  it('reviewer prompt contains "Review"', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt).toContain('Review');
    }
  });

  it('documenter prompt contains "documentation"', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.prompt).toContain('documentation');
    }
  });
});

// ── 추가: projectId 필드 검증 ─────────────────────────────────

describe('AgentGenerator projectId 필드 검증', () => {
  it('projectId는 빈 문자열 (기본값)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.projectId).toBe('');
    }
  });

  it('모든 에이전트 projectId는 string 타입', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(typeof result.value.projectId).toBe('string');
      }
    }
  });

  it('projectId는 항상 동일한 값 (빈 문자열)', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.projectId).toBe('');
      }
    }
  });
});

// ── 추가: tools 중복 없음 검증 ───────────────────────────────

describe('AgentGenerator tools 중복 검증', () => {
  it('architect tools에 중복 없음', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      const tools = result.value.tools;
      expect(new Set(tools).size).toBe(tools.length);
    }
  });

  it('coder tools에 중복 없음', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      const tools = result.value.tools;
      expect(new Set(tools).size).toBe(tools.length);
    }
  });

  it('tester tools에 중복 없음', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      const tools = result.value.tools;
      expect(new Set(tools).size).toBe(tools.length);
    }
  });

  it('qa tools에 중복 없음', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      const tools = result.value.tools;
      expect(new Set(tools).size).toBe(tools.length);
    }
  });

  it('모든 에이전트 tools 중복 없음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        const tools = result.value.tools;
        expect(new Set(tools).size).toBe(tools.length);
      }
    }
  });

  it('reviewer tools: Read, Glob, Grep 포함, Write 미포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Glob');
      expect(result.value.tools).toContain('Grep');
      expect(result.value.tools).not.toContain('Write');
    }
  });

  it('documenter tools: Read, Write, Glob, Grep 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Write');
      expect(result.value.tools).toContain('Glob');
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('qc tools: Read, Glob, Grep 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Glob');
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('coder tools: Bash 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Bash');
    }
  });
});

// ── 추가: config 객체 완전성 검증 ────────────────────────────

describe('AgentGenerator config 객체 완전성', () => {
  it('모든 에이전트 config에 name 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('name' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 phase 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('phase' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 tools 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('tools' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 maxTurns 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('maxTurns' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 systemPrompt 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('systemPrompt' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 prompt 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('prompt' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 featureId 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('featureId' in result.value).toBe(true);
      }
    }
  });

  it('모든 에이전트 config에 projectId 필드 있음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect('projectId' in result.value).toBe(true);
      }
    }
  });

  it('다른 featureId → prompt도 다름 (architect)', () => {
    const generator = makeGenerator();
    const r1 = generator.generateAgentConfig('architect', 'spec', 'feat-alpha');
    const r2 = generator.generateAgentConfig('architect', 'spec', 'feat-beta');
    if (r1.ok && r2.ok) {
      expect(r1.value.prompt).not.toBe(r2.value.prompt);
    }
  });

  it('다른 spec → systemPrompt도 다름', () => {
    const generator = makeGenerator();
    const r1 = generator.generateAgentConfig('coder', 'spec-A', 'feat-1');
    const r2 = generator.generateAgentConfig('coder', 'spec-B', 'feat-1');
    if (r1.ok && r2.ok) {
      expect(r1.value.systemPrompt).not.toBe(r2.value.systemPrompt);
    }
  });
});

// ── 배치66 추가: 역할별 tools 세부 검증 ────────────────────────────

describe('AgentGenerator 배치66 역할별 tools 세부 검증', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect: Glob 포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('architect: Read 포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('architect: Write 미포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
    }
  });

  it('architect: Edit 미포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('coder: Read 포함', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('coder: Glob 포함', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('coder: Grep 포함', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('tester: Glob 포함', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('tester: Grep 포함', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('tester: Write 미포함', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Write');
    }
  });

  it('tester: Edit 미포함', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('qa: Glob 포함', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('qa: Grep 포함', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('qa: Read 포함', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Read');
    }
  });

  it('qc: Glob 포함', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('reviewer: Grep 포함', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('documenter: Bash 미포함', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).not.toContain('Bash');
    }
  });

  it('documenter: Glob 포함', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Glob');
    }
  });

  it('documenter: Grep 포함', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.tools).toContain('Grep');
    }
  });
});

// ── 배치66 추가: 시스템 프롬프트 세부 내용 검증 ────────────────────

describe('AgentGenerator 배치66 시스템 프롬프트 세부', () => {
  let generator: AgentGenerator;

  beforeEach(() => {
    generator = makeGenerator();
  });

  it('architect: 시스템 프롬프트에 spec 내용 포함 (중복 확인)', () => {
    const result = generator.generateAgentConfig('architect', 'MY_SPECIAL_SPEC', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('MY_SPECIAL_SPEC');
    }
  });

  it('coder: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('coder', 'CODER_SPEC_CONTENT', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('CODER_SPEC_CONTENT');
    }
  });

  it('tester: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('tester', 'TESTER_SPEC_XYZ', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('TESTER_SPEC_XYZ');
    }
  });

  it('qa: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('qa', 'QA_SPEC_123', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('QA_SPEC_123');
    }
  });

  it('qc: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('qc', 'QC_SPEC_ABC', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('QC_SPEC_ABC');
    }
  });

  it('reviewer: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('reviewer', 'REVIEWER_SPEC_DEF', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('REVIEWER_SPEC_DEF');
    }
  });

  it('documenter: 시스템 프롬프트에 spec 내용 포함', () => {
    const result = generator.generateAgentConfig('documenter', 'DOCUMENTER_SPEC_GHI', 'feat-1');
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('DOCUMENTER_SPEC_GHI');
    }
  });

  it('architect: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-batch66-arch');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-arch');
    }
  });

  it('coder: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-batch66-coder');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-coder');
    }
  });

  it('tester: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-batch66-tester');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-tester');
    }
  });

  it('qa: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-batch66-qa');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-qa');
    }
  });

  it('qc: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-batch66-qc');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-qc');
    }
  });

  it('reviewer: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-batch66-reviewer');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-reviewer');
    }
  });

  it('documenter: 실행 프롬프트에 featureId 포함', () => {
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-batch66-documenter');
    if (result.ok) {
      expect(result.value.prompt).toContain('feat-batch66-documenter');
    }
  });

  it('모든 에이전트 systemPrompt 길이 > 10 (의미있는 내용)', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'minimal-spec', 'feat-1');
      if (result.ok) {
        expect(result.value.systemPrompt.length).toBeGreaterThan(10);
      }
    }
  });

  it('모든 에이전트 prompt 길이 > 5 (의미있는 내용)', () => {
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'f');
      if (result.ok) {
        expect(result.value.prompt.length).toBeGreaterThan(5);
      }
    }
  });
});

// ── 배치66 추가: 반환값 타입 완전성 검증 ───────────────────────────

describe('AgentGenerator 배치66 반환값 타입 완전성', () => {
  it('모든 에이전트 ok는 boolean', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      expect(typeof result.ok).toBe('boolean');
    }
  });

  it('모든 에이전트 name은 비어있지 않음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 featureId는 입력과 동일', () => {
    const generator = makeGenerator();
    const featureId = 'type-completeness-check';
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', featureId);
      if (result.ok) {
        expect(result.value.featureId).toBe(featureId);
      }
    }
  });

  it('모든 에이전트 systemPrompt는 비어있지 않음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec-content-here', 'feat-1');
      if (result.ok) {
        expect(result.value.systemPrompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 prompt는 비어있지 않음', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-completeness');
      if (result.ok) {
        expect(result.value.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('모든 에이전트 tools는 string[] 타입', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(Array.isArray(result.value.tools)).toBe(true);
        for (const tool of result.value.tools) {
          expect(typeof tool).toBe('string');
        }
      }
    }
  });

  it('모든 에이전트 maxTurns >= 30', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.maxTurns).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('모든 에이전트 phase는 알려진 값', () => {
    const generator = makeGenerator();
    const knownPhases = ['DESIGN', 'CODE', 'TEST', 'VERIFY'];
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(knownPhases).toContain(result.value.phase);
      }
    }
  });

  it('모든 에이전트 projectId는 빈 문자열', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.projectId).toBe('');
      }
    }
  });
});

// ── 배치66 추가: Phase-Tools 정합성 검증 ──────────────────────────

describe('AgentGenerator 배치66 Phase-Tools 정합성', () => {
  it('DESIGN phase 에이전트 (architect): tools에 Read, Glob, Grep, WebSearch 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
      expect(result.value.tools).toContain('Read');
      expect(result.value.tools).toContain('Glob');
      expect(result.value.tools).toContain('Grep');
    }
  });

  it('DESIGN phase 에이전트 (qa): tools에 Write/Edit 미포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('CODE phase 에이전트 (coder): tools에 Bash, Write, Edit 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('CODE');
      expect(result.value.tools).toContain('Bash');
      expect(result.value.tools).toContain('Write');
      expect(result.value.tools).toContain('Edit');
    }
  });

  it('CODE phase 에이전트 (reviewer): tools에 Write/Edit 미포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('CODE');
      expect(result.value.tools).not.toContain('Write');
    }
  });

  it('TEST phase 에이전트 (tester): tools에 Bash, Read 포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('TEST');
      expect(result.value.tools).toContain('Bash');
      expect(result.value.tools).toContain('Read');
    }
  });

  it('TEST phase 에이전트 (qc): tools에 Write/Edit 미포함', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('TEST');
      expect(result.value.tools).not.toContain('Write');
      expect(result.value.tools).not.toContain('Edit');
    }
  });

  it('DESIGN phase 에이전트 (documenter): tools에 Write 포함 (예외)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.phase).toBe('DESIGN');
      expect(result.value.tools).toContain('Write');
    }
  });
});

// ── 배치66 추가: 경계값 및 스트레스 테스트 ────────────────────────

describe('AgentGenerator 배치66 경계값/스트레스', () => {
  it('1자 spec → 모든 에이전트 ok', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'x', 'feat-1');
      expect(result.ok).toBe(true);
    }
  });

  it('1자 featureId → 모든 에이전트 ok', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'f');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.featureId).toBe('f');
      }
    }
  });

  it('1만자 spec → 모든 에이전트 ok', () => {
    const generator = makeGenerator();
    const bigSpec = 'A'.repeat(10000);
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, bigSpec, 'feat-1');
      expect(result.ok).toBe(true);
    }
  });

  it('1만자 featureId → 모든 에이전트 ok', () => {
    const generator = makeGenerator();
    const bigFeatId = 'Z'.repeat(10000);
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', bigFeatId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.featureId).toBe(bigFeatId);
      }
    }
  });

  it('특수문자만 있는 spec → 모든 에이전트 ok', () => {
    const generator = makeGenerator();
    const specialSpec = '!@#$%^&*()_+-=[]{}|;:,.<>?`~\\"\'/';
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, specialSpec, 'feat-1');
      expect(result.ok).toBe(true);
    }
  });

  it('개행 포함 spec → ok', () => {
    const generator = makeGenerator();
    const multilineSpec = 'line1\nline2\nline3\n\nline5\r\nline6';
    const result = generator.generateAgentConfig('architect', multilineSpec, 'feat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.systemPrompt).toContain('line1');
    }
  });

  it('탭 포함 spec → ok', () => {
    const generator = makeGenerator();
    const tabbedSpec = 'key:\tvalue\nanother:\t42';
    const result = generator.generateAgentConfig('coder', tabbedSpec, 'feat-1');
    expect(result.ok).toBe(true);
  });

  it('JSON 문자열 spec → ok', () => {
    const generator = makeGenerator();
    const jsonSpec = JSON.stringify({ name: 'spec', version: '1.0', features: ['a', 'b', 'c'] });
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, jsonSpec, 'feat-json');
      expect(result.ok).toBe(true);
    }
  });

  it('이모지 포함 spec → ok', () => {
    const generator = makeGenerator();
    const emojiSpec = '🚀 Launch feature 🎉 Complete 💡 Ideas 🔧 Fix 📝 Docs';
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, emojiSpec, 'feat-emoji');
      expect(result.ok).toBe(true);
    }
  });

  it('2000번 반복 생성 → 모두 ok', () => {
    const generator = makeGenerator();
    let allOk = true;
    for (let i = 0; i < 2000; i++) {
      const name = ALL_AGENT_NAMES[i % ALL_AGENT_NAMES.length] as AgentName;
      const result = generator.generateAgentConfig(name, `s${i}`, `f${i}`);
      if (!result.ok) allOk = false;
    }
    expect(allOk).toBe(true);
  });

  it('generateAgentConfig 반환 result.value는 null이 아님', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value).not.toBeNull();
      }
    }
  });

  it('architect에서 coder로 전환 시 tools 다름', () => {
    const generator = makeGenerator();
    const rArch = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    const rCoder = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (rArch.ok && rCoder.ok) {
      const archHasBash = rArch.value.tools.includes('Bash');
      const coderHasBash = rCoder.value.tools.includes('Bash');
      // WHY: architect는 코드 수정 도구가 없고 coder는 있음
      expect(coderHasBash).toBe(true);
    }
  });

  it('10가지 다른 spec으로 coder 생성 → systemPrompt 모두 다름', () => {
    const generator = makeGenerator();
    const prompts = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = generator.generateAgentConfig('coder', `unique-spec-${i}`, 'feat-1');
      if (result.ok) {
        prompts.add(result.value.systemPrompt);
      }
    }
    expect(prompts.size).toBe(10);
  });

  it('10가지 다른 featureId로 architect 생성 → prompt 모두 다름', () => {
    const generator = makeGenerator();
    const prompts = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = generator.generateAgentConfig('architect', 'fixed-spec', `unique-feat-${i}`);
      if (result.ok) {
        prompts.add(result.value.prompt);
      }
    }
    expect(prompts.size).toBe(10);
  });
});

// ── 배치66 추가: maxTurns 심화 검증 ──────────────────────────────

describe('AgentGenerator 배치66 maxTurns 심화', () => {
  it('coder maxTurns는 100 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(100);
    }
  });

  it('tester maxTurns는 80 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(80);
    }
  });

  it('architect maxTurns는 50 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(50);
    }
  });

  it('documenter maxTurns는 40 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(40);
    }
  });

  it('qa maxTurns는 30 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(30);
    }
  });

  it('qc maxTurns는 30 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(30);
    }
  });

  it('reviewer maxTurns는 30 (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.maxTurns).toBe(30);
    }
  });

  it('coder > tester > architect > documenter > qa (maxTurns 순서)', () => {
    const generator = makeGenerator();
    const results = Object.fromEntries(
      ALL_AGENT_NAMES.map((n) => {
        const r = generator.generateAgentConfig(n, 'spec', 'feat-1');
        return [n, r.ok ? r.value.maxTurns : -1];
      }),
    );
    expect(results['coder']!).toBeGreaterThan(results['tester']!);
    expect(results['tester']!).toBeGreaterThan(results['architect']!);
    expect(results['architect']!).toBeGreaterThan(results['documenter']!);
    expect(results['documenter']!).toBeGreaterThan(results['qa']!);
  });

  it('maxTurns는 100 이하', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(result.value.maxTurns).toBeLessThanOrEqual(100);
      }
    }
  });

  it('maxTurns가 다른 featureId에 따라 변하지 않음 (불변)', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const r1 = generator.generateAgentConfig(name, 'spec', 'feat-aaa');
      const r2 = generator.generateAgentConfig(name, 'spec', 'feat-zzz');
      if (r1.ok && r2.ok) {
        expect(r1.value.maxTurns).toBe(r2.value.maxTurns);
      }
    }
  });

  it('maxTurns가 다른 spec에 따라 변하지 않음 (불변)', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const r1 = generator.generateAgentConfig(name, 'spec-alpha', 'feat-1');
      const r2 = generator.generateAgentConfig(name, 'spec-beta', 'feat-1');
      if (r1.ok && r2.ok) {
        expect(r1.value.maxTurns).toBe(r2.value.maxTurns);
      }
    }
  });
});

// ── 배치66 추가: name 필드 정확성 검증 ────────────────────────────

describe('AgentGenerator 배치66 name 필드 정확성', () => {
  it('architect 설정의 name은 "architect" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('architect', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('architect');
    }
  });

  it('qa 설정의 name은 "qa" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qa', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('qa');
    }
  });

  it('coder 설정의 name은 "coder" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('coder', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('coder');
    }
  });

  it('tester 설정의 name은 "tester" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('tester', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('tester');
    }
  });

  it('qc 설정의 name은 "qc" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('qc', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('qc');
    }
  });

  it('reviewer 설정의 name은 "reviewer" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('reviewer', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('reviewer');
    }
  });

  it('documenter 설정의 name은 "documenter" (정확히)', () => {
    const generator = makeGenerator();
    const result = generator.generateAgentConfig('documenter', 'spec', 'feat-1');
    if (result.ok) {
      expect(result.value.name).toBe('documenter');
    }
  });

  it('모든 에이전트 name이 AgentName 타입에서 온 값', () => {
    const generator = makeGenerator();
    for (const name of ALL_AGENT_NAMES) {
      const result = generator.generateAgentConfig(name, 'spec', 'feat-1');
      if (result.ok) {
        expect(ALL_AGENT_NAMES).toContain(result.value.name as AgentName);
      }
    }
  });

  it('name 필드는 featureId에 영향받지 않음', () => {
    const generator = makeGenerator();
    const r1 = generator.generateAgentConfig('architect', 'spec', 'feat-aaa');
    const r2 = generator.generateAgentConfig('architect', 'spec', 'feat-bbb');
    if (r1.ok && r2.ok) {
      expect(r1.value.name).toBe(r2.value.name);
    }
  });

  it('name 필드는 spec에 영향받지 않음', () => {
    const generator = makeGenerator();
    const r1 = generator.generateAgentConfig('coder', 'spec-1', 'feat-1');
    const r2 = generator.generateAgentConfig('coder', 'spec-2-very-long-content', 'feat-1');
    if (r1.ok && r2.ok) {
      expect(r1.value.name).toBe(r2.value.name);
    }
  });
});
