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
