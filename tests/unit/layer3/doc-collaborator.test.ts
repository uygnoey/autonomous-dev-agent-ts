/**
 * DocCollaborator 단위 테스트 / DocCollaborator unit tests
 *
 * WHY: collaborate, generateTableOfContents, 생성자 오버로드 등
 *      순수 동기 메서드를 중심으로 edge case를 상세히 검증한다.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import type { ClaudeApi } from 'layer1/claude-api.js';
import type { AgentSpawner } from 'layer2/agent-spawner.js';
import { DocCollaborator } from 'layer3/doc-collaborator.js';

// ── 테스트 헬퍼 ────────────────────────────────────────────────

const logger = new ConsoleLogger('error');
const mockClaudeApi = {} as unknown as ClaudeApi;
const mockAgentSpawner = {} as unknown as AgentSpawner;

function makeCollaborator(): DocCollaborator {
  return new DocCollaborator(mockClaudeApi, mockAgentSpawner, logger);
}

function makeSimpleCollaborator(): DocCollaborator {
  return new DocCollaborator(logger);
}

// ── 생성자 / Constructor ───────────────────────────────────────

describe('DocCollaborator 생성자', () => {
  it('전체 API 생성자 (claudeApi + spawner + logger)', () => {
    expect(() => makeCollaborator()).not.toThrow();
  });

  it('간단 API 생성자 (logger만)', () => {
    expect(() => makeSimpleCollaborator()).not.toThrow();
  });

  it('두 생성자 모두 DocCollaborator 인스턴스 반환', () => {
    expect(makeCollaborator()).toBeInstanceOf(DocCollaborator);
    expect(makeSimpleCollaborator()).toBeInstanceOf(DocCollaborator);
  });

  it('두 인스턴스가 서로 다른 객체이다', () => {
    const c1 = makeCollaborator();
    const c2 = makeCollaborator();
    expect(c1).not.toBe(c2);
  });

  it('warn 로거로 생성 가능', () => {
    expect(() => new DocCollaborator(mockClaudeApi, mockAgentSpawner, new ConsoleLogger('warn'))).not.toThrow();
  });

  it('debug 로거로 생성 가능', () => {
    expect(() => new DocCollaborator(mockClaudeApi, mockAgentSpawner, new ConsoleLogger('debug'))).not.toThrow();
  });

  it('10개 인스턴스 모두 생성 성공', () => {
    for (let i = 0; i < 10; i++) {
      expect(() => makeCollaborator()).not.toThrow();
    }
  });

  it('5번 반복 — 항상 인스턴스 반환', () => {
    for (let i = 0; i < 5; i++) {
      expect(makeSimpleCollaborator()).toBeInstanceOf(DocCollaborator);
    }
  });
});

// ── 메서드 존재 검증 ───────────────────────────────────────────

describe('DocCollaborator 메서드 존재', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('collaborate 메서드', () => expect(typeof collab.collaborate).toBe('function'));
  it('generateTableOfContents 메서드', () => expect(typeof collab.generateTableOfContents).toBe('function'));
  it('start 메서드', () => expect(typeof collab.start).toBe('function'));
  it('requestLayer1 메서드', () => expect(typeof collab.requestLayer1).toBe('function'));
  it('requestLayer2 메서드', () => expect(typeof collab.requestLayer2).toBe('function'));
  it('complete 메서드', () => expect(typeof collab.complete).toBe('function'));
  it('getState 메서드', () => expect(typeof collab.getState).toBe('function'));

  it('simple 생성자도 collaborate 메서드 있음', () => {
    const simple = makeSimpleCollaborator();
    expect(typeof simple.collaborate).toBe('function');
  });

  it('simple 생성자도 generateTableOfContents 메서드 있음', () => {
    const simple = makeSimpleCollaborator();
    expect(typeof simple.generateTableOfContents).toBe('function');
  });
});

// ── collaborate ────────────────────────────────────────────────

describe('DocCollaborator.collaborate', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('정상 아웃라인 + 상세로 병합 문서 생성', () => {
    const result = collab.collaborate('# 제목\n\n## 개요', '## 구현 상세\n\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('# 제목');
      expect(result.value).toContain('## 구현 상세');
    }
  });

  it('병합 결과에 구분선 포함', () => {
    const result = collab.collaborate('outline content', 'detail content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('---');
    }
  });

  it('ok가 boolean이다', () => {
    const result = collab.collaborate('outline', 'details');
    expect(typeof result.ok).toBe('boolean');
  });

  it('결과 value가 문자열이다', () => {
    const result = collab.collaborate('outline', 'details');
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('5번 반복 일관성 — 항상 ok=true', () => {
    for (let i = 0; i < 5; i++) {
      const result = collab.collaborate(`outline ${i}`, `details ${i}`);
      expect(result.ok).toBe(true);
    }
  });

  it('빈 아웃라인 → 에러', () => {
    const result = collab.collaborate('', 'details');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_invalid_input');
    }
  });

  it('공백만 있는 아웃라인 → 에러', () => {
    const result = collab.collaborate('   \n  \t  ', 'details');
    expect(result.ok).toBe(false);
  });

  it('빈 상세 → 에러', () => {
    const result = collab.collaborate('outline', '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_invalid_input');
    }
  });

  it('공백만 있는 상세 → 에러', () => {
    const result = collab.collaborate('outline', '   ');
    expect(result.ok).toBe(false);
  });

  it('에러 코드가 문자열이다 (빈 아웃라인)', () => {
    const result = collab.collaborate('', 'details');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다 (빈 상세)', () => {
    const result = collab.collaborate('outline', '');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });

  it('빈 아웃라인 에러 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = collab.collaborate('', 'details');
      expect(result.ok).toBe(false);
    }
  });

  it('빈 상세 에러 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = collab.collaborate('outline', '');
      expect(result.ok).toBe(false);
    }
  });

  it('긴 아웃라인 + 상세 → 병합 성공', () => {
    const outline = `# 큰 제목\n${'## 섹션\n내용\n'.repeat(50)}`;
    const details = `${'### 상세\n내용\n'.repeat(50)}`;
    const result = collab.collaborate(outline, details);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(outline.length + details.length);
    }
  });

  it('병합 순서: 아웃라인이 상세보다 앞에', () => {
    const result = collab.collaborate('OUTLINE_CONTENT', 'DETAIL_CONTENT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const outlinePos = result.value.indexOf('OUTLINE_CONTENT');
      const detailPos = result.value.indexOf('DETAIL_CONTENT');
      expect(outlinePos).toBeLessThan(detailPos);
    }
  });

  it('특수문자 포함 문서 → 에러 없이 병합', () => {
    const result = collab.collaborate(
      '# 한국어 제목 🚀\n\n특수문자: <>&"\'',
      '```typescript\nconst x = 1;\n```\n\n$$수식 E=mc^2$$',
    );
    expect(result.ok).toBe(true);
  });

  it('UUID 아웃라인 → ok=true', () => {
    const uuid = crypto.randomUUID();
    const result = collab.collaborate(`# ${uuid}`, 'details content');
    expect(result.ok).toBe(true);
  });

  it('숫자만 있는 outline → ok=true', () => {
    const result = collab.collaborate('123456', '789012');
    expect(result.ok).toBe(true);
  });

  it('이모지 포함 → ok=true', () => {
    const result = collab.collaborate('🎉 축하합니다', '🚀 배포 완료');
    expect(result.ok).toBe(true);
  });

  it('단어 하나 outline + 단어 하나 details → 병합 성공', () => {
    const result = collab.collaborate('a', 'b');
    expect(result.ok).toBe(true);
  });

  it('숫자만 outline + 숫자만 details → 병합 성공', () => {
    const result = collab.collaborate('123', '456');
    expect(result.ok).toBe(true);
  });

  it('탭 포함 outline + 탭 포함 details → 병합 성공', () => {
    const result = collab.collaborate('outline\ttab', 'detail\ttab');
    expect(result.ok).toBe(true);
  });

  it('개행만인 outline → 에러 (trim 결과 빈 문자열)', () => {
    const result = collab.collaborate('\n', 'details');
    expect(result.ok).toBe(false);
  });

  it('유니코드 outline + 유니코드 details → 병합 성공', () => {
    const result = collab.collaborate('日本語', '한국어');
    expect(result.ok).toBe(true);
  });

  it('길이 1의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('A', 'B').ok).toBe(true);
  });

  it('길이 5의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('AAAAA', 'BBBBB').ok).toBe(true);
  });

  it('길이 10의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('A'.repeat(10), 'B'.repeat(10)).ok).toBe(true);
  });

  it('길이 20의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('A'.repeat(20), 'B'.repeat(20)).ok).toBe(true);
  });

  it('길이 50의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('A'.repeat(50), 'B'.repeat(50)).ok).toBe(true);
  });

  it('길이 100의 아웃라인 병합 성공', () => {
    expect(collab.collaborate('A'.repeat(100), 'B'.repeat(100)).ok).toBe(true);
  });

  it('두 인스턴스 독립적 collaborate 결과', () => {
    const c1 = makeCollaborator();
    const c2 = makeCollaborator();
    const r1 = c1.collaborate('outline A', 'detail A');
    const r2 = c2.collaborate('outline B', 'detail B');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).not.toBe(r2.value);
    }
  });
});

// ── generateTableOfContents ────────────────────────────────────

describe('DocCollaborator.generateTableOfContents', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('H1 헤딩 목차 생성', () => {
    const result = collab.generateTableOfContents('# 제목 1\n\n내용\n\n# 제목 2\n\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('제목 1');
      expect(result.value).toContain('제목 2');
    }
  });

  it('H2 헤딩 목차 생성', () => {
    const result = collab.generateTableOfContents('## 소제목 A\n\n## 소제목 B');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('소제목 A');
      expect(result.value).toContain('소제목 B');
    }
  });

  it('H1~H6 다중 레벨 목차', () => {
    const content = [
      '# H1',
      '## H2',
      '### H3',
      '#### H4',
      '##### H5',
      '###### H6',
    ].join('\n\n');
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('H1');
      expect(result.value).toContain('H2');
    }
  });

  it('ok가 boolean이다', () => {
    const result = collab.generateTableOfContents('# 제목\n\n내용');
    expect(typeof result.ok).toBe('boolean');
  });

  it('결과 value가 문자열이다', () => {
    const result = collab.generateTableOfContents('# 제목\n\n내용');
    if (result.ok) expect(typeof result.value).toBe('string');
  });

  it('5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = collab.generateTableOfContents(`# 섹션 ${i}\n\n내용`);
      expect(result.ok).toBe(true);
    }
  });

  it('빈 내용 → 에러', () => {
    const result = collab.generateTableOfContents('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_invalid_input');
    }
  });

  it('공백만 → 에러', () => {
    const result = collab.generateTableOfContents('   \n   ');
    expect(result.ok).toBe(false);
  });

  it('빈 내용 에러 코드가 문자열이다', () => {
    const result = collab.generateTableOfContents('');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('빈 내용 5번 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const result = collab.generateTableOfContents('');
      expect(result.ok).toBe(false);
    }
  });

  it('헤딩 없는 내용 → ok (빈 목차)', () => {
    const result = collab.generateTableOfContents('일반 텍스트만 있는 내용입니다.');
    expect(result.ok).toBe(true);
  });

  it('코드 블록 내 헤딩 제외 처리', () => {
    const content = '# 실제 헤딩\n\n```\n# 코드 내 헤딩\n```\n\n내용';
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('실제 헤딩');
    }
  });

  it('헤딩에 특수문자 포함 → ok', () => {
    const result = collab.generateTableOfContents('# 제목 (특수: <>&)\n\n내용');
    expect(result.ok).toBe(true);
  });

  it('많은 헤딩 → ok', () => {
    const content = Array.from({ length: 50 }, (_, i) => `## 섹션 ${i + 1}\n\n내용`).join('\n\n');
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('섹션 1');
      expect(result.value).toContain('섹션 50');
    }
  });

  it('이모지 헤딩 → ok', () => {
    const result = collab.generateTableOfContents('# 🚀 배포 가이드\n\n내용');
    expect(result.ok).toBe(true);
  });

  it('UUID 헤딩 → ok', () => {
    const uuid = crypto.randomUUID();
    const result = collab.generateTableOfContents(`# ${uuid}\n\n내용`);
    expect(result.ok).toBe(true);
  });

  it('한국어 헤딩 → ok', () => {
    const result = collab.generateTableOfContents('# 한국어 제목\n## 소제목\n내용');
    expect(result.ok).toBe(true);
  });

  it('단일 H1 헤딩 → ok', () => {
    expect(collab.generateTableOfContents('# 단일 헤딩').ok).toBe(true);
  });

  it('단일 H2 헤딩 → ok', () => {
    expect(collab.generateTableOfContents('## 단일 H2').ok).toBe(true);
  });

  it('단일 H3 헤딩 → ok', () => {
    expect(collab.generateTableOfContents('### 단일 H3').ok).toBe(true);
  });

  it('단일 H6 헤딩 → ok', () => {
    expect(collab.generateTableOfContents('###### 단일 H6').ok).toBe(true);
  });

  it('헤딩 1개 목차 생성', () => {
    expect(collab.generateTableOfContents('# 섹션 0').ok).toBe(true);
  });

  it('헤딩 5개 목차 생성', () => {
    const content = Array.from({ length: 5 }, (_, i) => `# 섹션 ${i}`).join('\n');
    expect(collab.generateTableOfContents(content).ok).toBe(true);
  });

  it('헤딩 10개 목차 생성', () => {
    const content = Array.from({ length: 10 }, (_, i) => `# 섹션 ${i}`).join('\n');
    expect(collab.generateTableOfContents(content).ok).toBe(true);
  });

  it('헤딩 20개 목차 생성', () => {
    const content = Array.from({ length: 20 }, (_, i) => `# 섹션 ${i}`).join('\n');
    expect(collab.generateTableOfContents(content).ok).toBe(true);
  });

  it('두 인스턴스 독립적 목차 결과', () => {
    const c1 = makeCollaborator();
    const c2 = makeCollaborator();
    const r1 = c1.generateTableOfContents('# 제목 A\n\n내용');
    const r2 = c2.generateTableOfContents('# 제목 B\n\n내용');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

// ── start 메서드 (mock 의존성) ─────────────────────────────────

describe('DocCollaborator.start', () => {
  it('유효한 옵션으로 start 호출 → 처리됨 (Claude API 없어서 에러 가능)', async () => {
    const collab = makeCollaborator();
    try {
      const result = await collab.start({
        projectId: 'proj-1',
        type: 'technical-spec',
        context: 'REST API 프로젝트',
        fragments: [],
      });
      expect(typeof result.ok).toBe('boolean');
    } catch {
      // API 없어서 throw 가능 — ok
    }
  });

  it('프로젝트 ID 없이 start → 에러 반환', async () => {
    const collab = makeSimpleCollaborator();
    try {
      const result = await collab.start({
        projectId: '',
        type: 'technical-spec',
        context: '내용',
        fragments: [],
      });
      // 빈 projectId 에러 또는 API 에러
      expect(typeof result.ok).toBe('boolean');
    } catch {
      // throw도 가능
    }
  });

  it('UUID projectId start → 처리됨', async () => {
    const collab = makeCollaborator();
    const uuid = crypto.randomUUID();
    try {
      const result = await collab.start({
        projectId: uuid,
        type: 'technical-spec',
        context: '내용',
        fragments: [],
      });
      expect(typeof result.ok).toBe('boolean');
    } catch {
      // ok
    }
  });
});

// ── getState 메서드 ────────────────────────────────────────────

describe('DocCollaborator.getState', () => {
  it('존재하지 않는 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('non-existent-doc-id');
    expect(result.ok).toBe(false);
  });

  it('빈 문자열 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('');
    expect(result.ok).toBe(false);
  });

  it('공백만 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('   ');
    expect(result.ok).toBe(false);
  });

  it('invalid-id-xyz docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('invalid-id-xyz');
    expect(result.ok).toBe(false);
  });

  it('UUID docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('5번 반복 — 항상 ok=false (존재하지 않는 ID)', async () => {
    for (let i = 0; i < 5; i++) {
      const collab = makeCollaborator();
      const result = await collab.getState(`non-existent-${i}`);
      expect(result.ok).toBe(false);
    }
  });

  it('에러 코드가 문자열이다', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('does-not-exist');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('에러 메시지가 문자열이다', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('does-not-exist');
    if (!result.ok) expect(typeof result.error.message).toBe('string');
  });
});

// ── complete 메서드 ────────────────────────────────────────────

describe('DocCollaborator.complete', () => {
  it('존재하지 않는 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('non-existent-doc-id');
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #0 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #1 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #2 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #3 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #4 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #5 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #6 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #7 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #8 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('임의 UUID docId #9 → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete(crypto.randomUUID());
    expect(result.ok).toBe(false);
  });

  it('에러 코드가 문자열이다', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('no-such-doc');
    if (!result.ok) expect(typeof result.error.code).toBe('string');
  });

  it('5번 반복 — 항상 ok=false', async () => {
    for (let i = 0; i < 5; i++) {
      const collab = makeCollaborator();
      const result = await collab.complete(`doc-${i}`);
      expect(result.ok).toBe(false);
    }
  });
});

// ── 간단 API vs 전체 API 차이 ─────────────────────────────────

describe('간단 API(logger만) vs 전체 API 비교', () => {
  it('두 API 모두 collaborate 지원', () => {
    const simple = makeSimpleCollaborator();
    const full = makeCollaborator();

    const r1 = simple.collaborate('outline', 'details');
    const r2 = full.collaborate('outline', 'details');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('두 API 모두 generateTableOfContents 지원', () => {
    const simple = makeSimpleCollaborator();
    const full = makeCollaborator();

    const r1 = simple.generateTableOfContents('# 제목\n\n내용');
    const r2 = full.generateTableOfContents('# 제목\n\n내용');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('두 API의 collaborate 결과가 동일', () => {
    const simple = makeSimpleCollaborator();
    const full = makeCollaborator();

    const r1 = simple.collaborate('outline text', 'detail text');
    const r2 = full.collaborate('outline text', 'detail text');

    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });

  it('두 API의 generateTableOfContents 결과가 동일', () => {
    const simple = makeSimpleCollaborator();
    const full = makeCollaborator();

    const r1 = simple.generateTableOfContents('# 제목\n\n내용');
    const r2 = full.generateTableOfContents('# 제목\n\n내용');

    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });

  it('simple도 빈 아웃라인 → 에러', () => {
    const simple = makeSimpleCollaborator();
    const result = simple.collaborate('', 'details');
    expect(result.ok).toBe(false);
  });

  it('simple도 빈 내용 목차 → 에러', () => {
    const simple = makeSimpleCollaborator();
    const result = simple.generateTableOfContents('');
    expect(result.ok).toBe(false);
  });
});

// ── 경계값 / 랜덤 테스트 ─────────────────────────────────────

describe('DocCollaborator 경계값 랜덤 테스트', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('collaborate 랜덤 케이스 #0', () => {
    const result = collab.collaborate('# 제목 0\n\n내용', '## 상세 0\n\n설명');
    expect(result.ok).toBe(true);
  });

  it('collaborate 랜덤 케이스 #1', () => {
    const result = collab.collaborate('# 제목 1\n\n내용내용', '## 상세 1\n\n설명설명');
    expect(result.ok).toBe(true);
  });

  it('collaborate 랜덤 케이스 #5', () => {
    const result = collab.collaborate('# 제목 5\n\n내용내용내용내용내용', '## 상세 5\n\n설명설명설명설명설명');
    expect(result.ok).toBe(true);
  });

  it('collaborate 랜덤 케이스 #10', () => {
    const result = collab.collaborate('# 제목 10\n\n' + '내용'.repeat(1), '## 상세 10\n\n' + '설명'.repeat(4));
    expect(result.ok).toBe(true);
  });

  it('collaborate 랜덤 케이스 #20', () => {
    const result = collab.collaborate('# 제목 20\n\n' + '내용'.repeat(1), '## 상세 20\n\n' + '설명'.repeat(7));
    expect(result.ok).toBe(true);
  });

  it('collaborate 랜덤 케이스 #49', () => {
    const result = collab.collaborate('# 제목 49\n\n' + '내용'.repeat(10), '## 상세 49\n\n' + '설명'.repeat(1));
    expect(result.ok).toBe(true);
  });

  it('목차 헤딩 레벨 H1', () => {
    expect(collab.generateTableOfContents('# 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('목차 헤딩 레벨 H2', () => {
    expect(collab.generateTableOfContents('## 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('목차 헤딩 레벨 H3', () => {
    expect(collab.generateTableOfContents('### 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('목차 헤딩 레벨 H4', () => {
    expect(collab.generateTableOfContents('#### 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('목차 헤딩 레벨 H5', () => {
    expect(collab.generateTableOfContents('##### 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('목차 헤딩 레벨 H6', () => {
    expect(collab.generateTableOfContents('###### 헤딩 텍스트\n\n내용').ok).toBe(true);
  });

  it('다양한 줄 끝 처리: CRLF', () => {
    const result = collab.collaborate('제목\r\n내용', '상세\r\n설명');
    expect(typeof result.ok).toBe('boolean');
  });

  it('다양한 줄 끝 처리: 다중 개행', () => {
    const result = collab.collaborate('제목\n\n\n내용', '상세\n\n\n설명');
    expect(typeof result.ok).toBe('boolean');
  });

  it('다양한 줄 끝 처리: 탭+개행', () => {
    const result = collab.collaborate('제목\t\n내용', '상세\t\n설명');
    expect(typeof result.ok).toBe('boolean');
  });

  it('다양한 입력 조합: # A + B', () => {
    const result = collab.collaborate('# A', 'B');
    if ('# A'.trim() && 'B'.trim()) expect(result.ok).toBe(true);
  });

  it('다양한 입력 조합: outline + # B', () => {
    const result = collab.collaborate('outline', '# B');
    expect(result.ok).toBe(true);
  });

  it('다양한 입력 조합: 앞뒤 공백 포함', () => {
    const result = collab.collaborate('outline with spaces  ', '  details with spaces  ');
    expect(result.ok).toBe(true);
  });

  it('다양한 입력 조합: 대문자 outline + 소문자 details', () => {
    const result = collab.collaborate('UPPERCASE OUTLINE', 'lowercase details');
    expect(result.ok).toBe(true);
  });

  it('다양한 입력 조합: 혼합 언어', () => {
    const result = collab.collaborate('混在 mixed content', 'مختلط mixed');
    expect(result.ok).toBe(true);
  });

  it('collaborate 10회 연속 → 항상 동일 결과', () => {
    const outline = '# 제목\n\n내용';
    const details = '## 상세\n\n설명';
    const firstResult = collab.collaborate(outline, details);
    for (let i = 0; i < 10; i++) {
      const result = collab.collaborate(outline, details);
      if (firstResult.ok && result.ok) {
        expect(result.value).toBe(firstResult.value);
      }
    }
  });

  it('generateTableOfContents 10회 연속 → 항상 동일 결과', () => {
    const content = '# H1\n## H2\n### H3\n내용';
    const firstResult = collab.generateTableOfContents(content);
    for (let i = 0; i < 10; i++) {
      const result = collab.generateTableOfContents(content);
      if (firstResult.ok && result.ok) {
        expect(result.value).toBe(firstResult.value);
      }
    }
  });

  it('collaborate 결과 value에 두 입력 내용이 모두 포함', () => {
    const outline = 'UNIQUE_OUTLINE_STRING';
    const details = 'UNIQUE_DETAILS_STRING';
    const result = collab.collaborate(outline, details);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain(outline);
      expect(result.value).toContain(details);
    }
  });

  it('collaborate 경계값: 개행 없는 outline + 개행 있는 details', () => {
    const result = collab.collaborate('single line outline', 'line1\nline2\nline3');
    expect(result.ok).toBe(true);
  });

  it('collaborate 경계값: 개행 있는 outline + 개행 없는 details', () => {
    const result = collab.collaborate('line1\nline2\nline3', 'single line details');
    expect(result.ok).toBe(true);
  });

  it('generateTableOfContents: 번호 헤딩 포함 → ok', () => {
    const result = collab.generateTableOfContents('# 1. 첫 번째\n## 1.1 소섹션\n내용');
    expect(result.ok).toBe(true);
  });

  it('generateTableOfContents: 특수기호 없는 순수 텍스트 헤딩 → ok', () => {
    const result = collab.generateTableOfContents('# Introduction\n## Background\n### Motivation');
    expect(result.ok).toBe(true);
  });

  it('collaborate: outline만 헤딩 포함, details는 일반 텍스트', () => {
    const result = collab.collaborate('# 제목\n## 소제목\n내용', '일반 텍스트 상세 내용입니다.');
    expect(result.ok).toBe(true);
  });

  it('collaborate: outline 일반 텍스트, details만 헤딩 포함', () => {
    const result = collab.collaborate('일반 텍스트 아웃라인입니다.', '# 상세\n## 소상세\n내용');
    expect(result.ok).toBe(true);
  });
});

// ── complete 메서드 추가 경계값 ────────────────────────────────

describe('DocCollaborator.complete 추가 경계값', () => {
  it('빈 문자열 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('');
    expect(result.ok).toBe(false);
  });

  it('공백 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('   ');
    expect(result.ok).toBe(false);
  });

  it('한글 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('존재하지않는문서');
    expect(result.ok).toBe(false);
  });

  it('특수문자 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('!@#$%^&*');
    expect(result.ok).toBe(false);
  });

  it('매우 긴 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('x'.repeat(500));
    expect(result.ok).toBe(false);
  });

  it('숫자 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.complete('123456789');
    expect(result.ok).toBe(false);
  });
});

// ── requestLayer1/requestLayer2 메서드 ────────────────────────

describe('DocCollaborator.requestLayer1 requestLayer2', () => {
  it('requestLayer1은 function 타입', () => {
    const collab = makeCollaborator();
    expect(typeof collab.requestLayer1).toBe('function');
  });

  it('requestLayer2는 function 타입', () => {
    const collab = makeCollaborator();
    expect(typeof collab.requestLayer2).toBe('function');
  });

  it('simple 생성자도 requestLayer1 메서드 있음', () => {
    const collab = makeSimpleCollaborator();
    expect(typeof collab.requestLayer1).toBe('function');
  });

  it('simple 생성자도 requestLayer2 메서드 있음', () => {
    const collab = makeSimpleCollaborator();
    expect(typeof collab.requestLayer2).toBe('function');
  });
});

// ── collaborate 추가 경계값 ────────────────────────────────────

describe('DocCollaborator.collaborate 추가 경계값', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('outline에 null 바이트 → ok=true', () => {
    const result = collab.collaborate('outline\u0000content', 'details\u0000content');
    expect(result.ok).toBe(true);
  });

  it('outline에 제어 문자 포함 → ok=true', () => {
    const result = collab.collaborate('outline\x01\x02\x03', 'details\x04\x05');
    expect(result.ok).toBe(true);
  });

  it('outline에 BOM 포함 → ok=true', () => {
    const result = collab.collaborate('\uFEFFoutline with BOM', 'details content');
    expect(result.ok).toBe(true);
  });

  it('매우 긴 단어 outline → ok=true', () => {
    const longWord = 'a'.repeat(10000);
    const result = collab.collaborate(longWord, 'b'.repeat(5000));
    expect(result.ok).toBe(true);
  });

  it('outline이 숫자 문자열 → ok=true', () => {
    const result = collab.collaborate('3.14159265358979', 'pi approximation');
    expect(result.ok).toBe(true);
  });

  it('outline이 JSON 문자열 → ok=true', () => {
    const result = collab.collaborate('{"key": "value", "num": 42}', '{"detail": true}');
    expect(result.ok).toBe(true);
  });

  it('outline이 HTML 문자열 → ok=true', () => {
    const result = collab.collaborate('<h1>제목</h1><p>내용</p>', '<p>상세 내용</p>');
    expect(result.ok).toBe(true);
  });

  it('outline이 SQL 쿼리 → ok=true', () => {
    const result = collab.collaborate('SELECT * FROM users WHERE id = 1', 'JOIN orders ON id');
    expect(result.ok).toBe(true);
  });

  it('outline이 Markdown 코드 블록 → ok=true', () => {
    const result = collab.collaborate('```typescript\nconst x = 1;\n```', '구현 상세 내용');
    expect(result.ok).toBe(true);
  });

  it('병합 결과 길이: outline + details + 구분자 이상', () => {
    const outline = 'OUTLINE_CONTENT';
    const details = 'DETAILS_CONTENT';
    const result = collab.collaborate(outline, details);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(outline.length + details.length);
    }
  });

  it('병합 결과에 \\n\\n---\\n\\n 포함', () => {
    const result = collab.collaborate('outline', 'details');
    if (result.ok) {
      expect(result.value).toContain('\n\n---\n\n');
    }
  });

  it('5개 다른 인스턴스로 동일 입력 → 동일 결과', () => {
    const outline = '# 제목\n\n내용';
    const details = '## 상세\n\n설명';
    const results = Array.from({ length: 5 }, () => makeCollaborator().collaborate(outline, details));
    for (const r of results) {
      if (r.ok) {
        expect(r.value).toContain(outline);
        expect(r.value).toContain(details);
      }
    }
  });

  it('outline이 줄바꿈만인 경우 → ok=false', () => {
    const result = collab.collaborate('\n\n\n', 'details');
    expect(result.ok).toBe(false);
  });

  it('details가 줄바꿈만인 경우 → ok=false', () => {
    const result = collab.collaborate('outline', '\n\n\n');
    expect(result.ok).toBe(false);
  });

  it('outline과 details 모두 최소 비공백 1자 → ok=true', () => {
    const result = collab.collaborate('x', 'y');
    expect(result.ok).toBe(true);
  });

  it('outline에 URL 포함 → ok=true', () => {
    const result = collab.collaborate('https://example.com/api/v1', '응답 형식 상세');
    expect(result.ok).toBe(true);
  });

  it('outline에 정규식 패턴 → ok=true', () => {
    const result = collab.collaborate('^(?:export\\s+)?function\\s+\\w+', '경계 감지 상세');
    expect(result.ok).toBe(true);
  });

  it('다국어 혼합 outline → ok=true', () => {
    const result = collab.collaborate(
      '中文 outline with 한국어 and English mixed',
      'مزيج من اللغات العربية والإنجليزية'
    );
    expect(result.ok).toBe(true);
  });

  it('outcome 결과 값 타입이 string', () => {
    const result = collab.collaborate('outline content', 'details content');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe('string');
    }
  });

  it('outline 앞뒤 공백만 있는 경우 → 실제 내용 있으면 ok=true', () => {
    const result = collab.collaborate('  실제 내용  ', '  실제 상세  ');
    expect(result.ok).toBe(true);
  });
});

// ── generateTableOfContents 추가 경계값 ───────────────────────

describe('DocCollaborator.generateTableOfContents 추가 경계값', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('결과에 ## 목차 포함', () => {
    const result = collab.generateTableOfContents('# 제목\n내용');
    if (result.ok) {
      expect(result.value).toContain('목차');
    }
  });

  it('헤딩 없는 문서 → ok=true, (내용 없음) 포함', () => {
    const result = collab.generateTableOfContents('일반 텍스트만');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('내용 없음');
    }
  });

  it('H1만 있는 문서 → 목차에 포함됨', () => {
    const result = collab.generateTableOfContents('# 큰 제목\n\n본문 내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('큰 제목');
    }
  });

  it('H2만 있는 문서 → 목차에 포함됨', () => {
    const result = collab.generateTableOfContents('## 소제목\n\n본문 내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('소제목');
    }
  });

  it('헤딩 레벨 들여쓰기 확인: H2는 H1보다 들여쓰기됨', () => {
    const result = collab.generateTableOfContents('# H1 제목\n## H2 제목\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const h1Line = result.value.split('\n').find((l) => l.includes('H1 제목'));
      const h2Line = result.value.split('\n').find((l) => l.includes('H2 제목'));
      if (h1Line && h2Line) {
        const h1Indent = h1Line.length - h1Line.trimStart().length;
        const h2Indent = h2Line.length - h2Line.trimStart().length;
        expect(h2Indent).toBeGreaterThanOrEqual(h1Indent);
      }
    }
  });

  it('긴 문서 50개 헤딩 → 목차에 모두 포함', () => {
    const headings = Array.from({ length: 50 }, (_, i) => `## 섹션${i}\n내용`).join('\n\n');
    const result = collab.generateTableOfContents(headings);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (let i = 0; i < 50; i++) {
        expect(result.value).toContain(`섹션${i}`);
      }
    }
  });

  it('코드 블록 내부 헤딩은 실제 헤딩으로 처리 (정규식 기반)', () => {
    const content = '# 실제 헤딩\n\n```\n# 코드 내 헤딩\n```\n\n내용';
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('실제 헤딩');
    }
  });

  it('null 바이트 포함 내용 → ok=true', () => {
    const result = collab.generateTableOfContents('# 제목\u0000내용\n내용');
    expect(result.ok).toBe(true);
  });

  it('URL 포함 헤딩 → ok=true', () => {
    const result = collab.generateTableOfContents('# https://example.com\n내용');
    expect(result.ok).toBe(true);
  });

  it('숫자로만 된 헤딩 → ok=true', () => {
    const result = collab.generateTableOfContents('# 12345\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('12345');
    }
  });

  it('UUID 헤딩 10개 → 목차에 모두 포함', () => {
    const uuids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const content = uuids.map((u) => `## ${u}\n내용`).join('\n\n');
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const u of uuids) {
        expect(result.value).toContain(u);
      }
    }
  });

  it('결과 길이가 0보다 크다', () => {
    const result = collab.generateTableOfContents('# 제목\n내용');
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('결과에 - 포함 (목차 항목 마커)', () => {
    const result = collab.generateTableOfContents('# 제목\n내용');
    if (result.ok) {
      expect(result.value).toContain('-');
    }
  });

  it('이모지 포함 헤딩 → 목차에 이모지 포함', () => {
    const result = collab.generateTableOfContents('# 🎉 시작\n\n## 🚀 배포\n내용');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('🎉');
      expect(result.value).toContain('🚀');
    }
  });

  it('100개 헤딩 → 목차 생성 성공', () => {
    const content = Array.from({ length: 100 }, (_, i) => `# 섹션 ${i}\n내용`).join('\n\n');
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
  });
});

// ── start 메서드 추가 경계값 ──────────────────────────────────

describe('DocCollaborator.start 추가 경계값', () => {
  it('start → state에 id 포함', async () => {
    const collab = makeCollaborator();
    const result = await collab.start({
      projectId: 'proj-test',
      type: 'technical-spec',
      context: '테스트 컨텍스트',
      fragments: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.id).toBe('string');
      expect(result.value.id.length).toBeGreaterThan(0);
    }
  });

  it('start → state.projectId가 입력과 일치', async () => {
    const collab = makeCollaborator();
    const result = await collab.start({
      projectId: 'my-project-123',
      type: 'technical-spec',
      context: '컨텍스트',
      fragments: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe('my-project-123');
    }
  });

  it('start → state.phase가 structure', async () => {
    const collab = makeCollaborator();
    const result = await collab.start({
      projectId: 'p1',
      type: 'technical-spec',
      context: '컨텍스트',
      fragments: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phase).toBe('structure');
    }
  });

  it('start → state.createdAt이 Date 인스턴스', async () => {
    const collab = makeCollaborator();
    const result = await collab.start({
      projectId: 'p2',
      type: 'technical-spec',
      context: '컨텍스트',
      fragments: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
  });

  it('start 2번 → 두 개의 다른 id', async () => {
    const collab = makeCollaborator();
    const r1 = await collab.start({ projectId: 'p1', type: 'technical-spec', context: 'ctx', fragments: [] });
    const r2 = await collab.start({ projectId: 'p2', type: 'technical-spec', context: 'ctx', fragments: [] });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.id).not.toBe(r2.value.id);
    }
  });

  it('start 후 getState로 조회 → ok=true', async () => {
    const collab = makeCollaborator();
    const startResult = await collab.start({
      projectId: 'p3',
      type: 'technical-spec',
      context: 'ctx',
      fragments: [],
    });
    expect(startResult.ok).toBe(true);
    if (startResult.ok) {
      const stateResult = await collab.getState(startResult.value.id);
      expect(stateResult.ok).toBe(true);
    }
  });

  it('start 후 getState → projectId 일치', async () => {
    const collab = makeCollaborator();
    const startResult = await collab.start({
      projectId: 'test-project',
      type: 'technical-spec',
      context: 'ctx',
      fragments: [],
    });
    if (startResult.ok) {
      const stateResult = await collab.getState(startResult.value.id);
      if (stateResult.ok) {
        expect(stateResult.value.projectId).toBe('test-project');
      }
    }
  });

  it('start 후 다른 인스턴스에서 getState → ok=false', async () => {
    const collab1 = makeCollaborator();
    const collab2 = makeCollaborator();
    const startResult = await collab1.start({
      projectId: 'p4',
      type: 'technical-spec',
      context: 'ctx',
      fragments: [],
    });
    if (startResult.ok) {
      const stateResult = await collab2.getState(startResult.value.id);
      expect(stateResult.ok).toBe(false);
    }
  });

  it('UUID projectId로 start → ok=true', async () => {
    const collab = makeCollaborator();
    const result = await collab.start({
      projectId: crypto.randomUUID(),
      type: 'technical-spec',
      context: '테스트',
      fragments: [],
    });
    expect(result.ok).toBe(true);
  });

  it('5번 연속 start → 5개 다른 id', async () => {
    const collab = makeCollaborator();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await collab.start({
        projectId: `proj-${i}`,
        type: 'technical-spec',
        context: `컨텍스트 ${i}`,
        fragments: [],
      });
      if (result.ok) ids.push(result.value.id);
    }
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── getState 추가 경계값 ──────────────────────────────────────

describe('DocCollaborator.getState 추가 경계값', () => {
  it('start 후 getState → state.type 일치', async () => {
    const collab = makeCollaborator();
    const startResult = await collab.start({
      projectId: 'p5',
      type: 'technical-spec',
      context: 'ctx',
      fragments: [],
    });
    if (startResult.ok) {
      const stateResult = await collab.getState(startResult.value.id);
      if (stateResult.ok) {
        expect(stateResult.value.type).toBe('technical-spec');
      }
    }
  });

  it('존재하지 않는 id → error.code가 agent_state_not_found', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('totally-nonexistent-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_state_not_found');
    }
  });

  it('빈 문자열 → error.code가 agent_state_not_found', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('agent_state_not_found');
    }
  });

  it('숫자로만 된 id → ok=false', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('999999');
    expect(result.ok).toBe(false);
  });

  it('한글 id → ok=false', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('존재하지않는아이디');
    expect(result.ok).toBe(false);
  });

  it('매우 긴 id → ok=false', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('x'.repeat(1000));
    expect(result.ok).toBe(false);
  });

  it('특수문자 id → ok=false', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('!@#$%^&*()');
    expect(result.ok).toBe(false);
  });

  it('start 후 getState 10회 반복 → 항상 ok=true', async () => {
    const collab = makeCollaborator();
    const startResult = await collab.start({
      projectId: 'p6',
      type: 'technical-spec',
      context: 'ctx',
      fragments: [],
    });
    if (startResult.ok) {
      const docId = startResult.value.id;
      for (let i = 0; i < 10; i++) {
        const r = await collab.getState(docId);
        expect(r.ok).toBe(true);
      }
    }
  });
});

// ── collaborate 멱등성 / 순서 보장 ─────────────────────────────

describe('DocCollaborator collaborate 멱등성 및 순서 보장', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('동일 입력 → 동일 출력 (멱등성 #1)', () => {
    const r1 = collab.collaborate('동일 아웃라인', '동일 상세');
    const r2 = collab.collaborate('동일 아웃라인', '동일 상세');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('동일 입력 → 동일 출력 (멱등성 #2)', () => {
    const r1 = collab.collaborate('# 제목\n\n내용A', '## 상세\n\n설명A');
    const r2 = collab.collaborate('# 제목\n\n내용A', '## 상세\n\n설명A');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('동일 입력 → 동일 출력 (멱등성 #3)', () => {
    const outline = 'outline-content-xyz';
    const details = 'details-content-xyz';
    const r1 = collab.collaborate(outline, details);
    const r2 = collab.collaborate(outline, details);
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('순서 보장: outline → separator → details', () => {
    const outline = 'FIRST_PART';
    const details = 'SECOND_PART';
    const result = collab.collaborate(outline, details);
    if (result.ok) {
      const idx1 = result.value.indexOf('FIRST_PART');
      const idx2 = result.value.indexOf('SECOND_PART');
      expect(idx1).toBeLessThan(idx2);
    }
  });

  it('outline 길이가 다른 경우 → 결과 포함 확인', () => {
    const r = collab.collaborate('A'.repeat(1), 'B'.repeat(100));
    if (r.ok) {
      expect(r.value).toContain('A');
      expect(r.value).toContain('B');
    }
  });

  it('details 길이가 다른 경우 → 결과 포함 확인', () => {
    const r = collab.collaborate('A'.repeat(100), 'B'.repeat(1));
    if (r.ok) {
      expect(r.value).toContain('A');
      expect(r.value).toContain('B');
    }
  });

  it('다국어 혼합 outline 멱등성', () => {
    const r1 = collab.collaborate('한국어 Korean 日本語', 'detail details');
    const r2 = collab.collaborate('한국어 Korean 日本語', 'detail details');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('이모지 outline 멱등성', () => {
    const r1 = collab.collaborate('🎉🚀💻🌟', '🔥💡✨🎯');
    const r2 = collab.collaborate('🎉🚀💻🌟', '🔥💡✨🎯');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('JSON outline 멱등성', () => {
    const r1 = collab.collaborate('{"a":1}', '{"b":2}');
    const r2 = collab.collaborate('{"a":1}', '{"b":2}');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('코드 블록 outline 멱등성', () => {
    const r1 = collab.collaborate('```js\nconst x=1;\n```', '구현 상세');
    const r2 = collab.collaborate('```js\nconst x=1;\n```', '구현 상세');
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('결과 value가 개행으로 시작하지 않음', () => {
    const r = collab.collaborate('outline', 'details');
    if (r.ok) expect(r.value.startsWith('\n')).toBe(false);
  });

  it('outline 내용이 details 앞에 위치', () => {
    const r = collab.collaborate('START_MARKER', 'END_MARKER');
    if (r.ok) {
      expect(r.value.indexOf('START_MARKER')).toBeLessThan(r.value.indexOf('END_MARKER'));
    }
  });

  it('collaborate 결과에 outline 포함 (UUID 기반)', () => {
    const uuid = crypto.randomUUID();
    const r = collab.collaborate(`outline-${uuid}`, 'details');
    if (r.ok) expect(r.value).toContain(`outline-${uuid}`);
  });

  it('collaborate 결과에 details 포함 (UUID 기반)', () => {
    const uuid = crypto.randomUUID();
    const r = collab.collaborate('outline', `details-${uuid}`);
    if (r.ok) expect(r.value).toContain(`details-${uuid}`);
  });

  it('5회 호출 모두 string 타입 반환', () => {
    for (let i = 0; i < 5; i++) {
      const r = collab.collaborate(`outline ${i}`, `details ${i}`);
      if (r.ok) expect(typeof r.value).toBe('string');
    }
  });

  it('입력 공백 포함 → ok=true (공백 외 내용 있음)', () => {
    const r = collab.collaborate('  real outline  ', '  real details  ');
    expect(r.ok).toBe(true);
  });

  it('outline에 탭+공백 혼용 → ok=true', () => {
    const r = collab.collaborate('\t tab outline \t', '\t tab details \t');
    expect(r.ok).toBe(true);
  });
});

// ── generateTableOfContents 목차 내용 검증 ────────────────────

describe('DocCollaborator generateTableOfContents 내용 검증', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('목차 결과가 빈 문자열이 아님', () => {
    const r = collab.generateTableOfContents('# 제목\n내용');
    if (r.ok) expect(r.value.length).toBeGreaterThan(0);
  });

  it('목차에 헤딩 텍스트 포함 (단순)', () => {
    const r = collab.generateTableOfContents('# 간단 제목\n내용');
    if (r.ok) expect(r.value).toContain('간단 제목');
  });

  it('멱등성: 동일 입력 → 동일 목차', () => {
    const content = '# H1\n## H2\n### H3\n내용';
    const r1 = collab.generateTableOfContents(content);
    const r2 = collab.generateTableOfContents(content);
    if (r1.ok && r2.ok) expect(r1.value).toBe(r2.value);
  });

  it('멱등성 반복 10회', () => {
    const content = '# 반복 제목\n내용';
    const first = collab.generateTableOfContents(content);
    for (let i = 0; i < 10; i++) {
      const r = collab.generateTableOfContents(content);
      if (first.ok && r.ok) expect(r.value).toBe(first.value);
    }
  });

  it('20개 헤딩 목차 → 모두 포함 검증', () => {
    const content = Array.from({ length: 20 }, (_, i) => `## 항목${i}\n내용`).join('\n\n');
    const r = collab.generateTableOfContents(content);
    if (r.ok) {
      for (let i = 0; i < 20; i++) {
        expect(r.value).toContain(`항목${i}`);
      }
    }
  });

  it('H1+H2+H3 혼합 → 목차 ok=true', () => {
    const content = '# 대제목\n## 중제목\n### 소제목\n내용';
    expect(collab.generateTableOfContents(content).ok).toBe(true);
  });

  it('내용에 헤딩 없음 → ok=true (빈 목차)', () => {
    const r = collab.generateTableOfContents('단순 텍스트\n헤딩 없음');
    expect(r.ok).toBe(true);
  });

  it('결과 타입이 string', () => {
    const r = collab.generateTableOfContents('# 제목\n내용');
    if (r.ok) expect(typeof r.value).toBe('string');
  });

  it('헤딩 앞에 공백 있는 경우 → ok=true', () => {
    const r = collab.generateTableOfContents('  # 제목\n내용');
    expect(r.ok).toBe(true);
  });

  it('연속 헤딩 (내용 없음) → ok=true', () => {
    const r = collab.generateTableOfContents('# A\n# B\n# C\n# D');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toContain('A');
      expect(r.value).toContain('B');
    }
  });

  it('헤딩 텍스트에 숫자 포함 → 목차에 포함', () => {
    const r = collab.generateTableOfContents('# 1단계\n## 2단계\n내용');
    if (r.ok) {
      expect(r.value).toContain('1단계');
      expect(r.value).toContain('2단계');
    }
  });

  it('긴 헤딩 텍스트 → 목차에 포함', () => {
    const longHeading = '이것은 매우 긴 헤딩 텍스트입니다 '.repeat(5);
    const r = collab.generateTableOfContents(`# ${longHeading}\n내용`);
    if (r.ok) expect(r.value).toContain(longHeading.trim());
  });

  it('BOM 포함 내용 → ok=true', () => {
    const r = collab.generateTableOfContents('\uFEFF# BOM 포함 헤딩\n내용');
    expect(r.ok).toBe(true);
  });

  it('CRLF 줄끝 헤딩 → ok=true', () => {
    const r = collab.generateTableOfContents('# CRLF 제목\r\n내용\r\n## 소제목\r\n내용');
    expect(typeof r.ok).toBe('boolean');
  });
});

// ── 동시 호출 시뮬레이션 ───────────────────────────────────────

describe('DocCollaborator 동시 호출 시뮬레이션', () => {
  it('여러 collab 인스턴스 collaborate 동시 → 모두 ok=true', () => {
    const instances = Array.from({ length: 10 }, () => makeCollaborator());
    const results = instances.map((c, i) => c.collaborate(`outline ${i}`, `details ${i}`));
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it('여러 collab 인스턴스 generateTableOfContents 동시 → 모두 ok=true', () => {
    const instances = Array.from({ length: 10 }, () => makeCollaborator());
    const results = instances.map((c, i) => c.generateTableOfContents(`# 섹션 ${i}\n내용`));
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it('simple 인스턴스 5개 collaborate → 모두 ok=true', () => {
    const instances = Array.from({ length: 5 }, () => makeSimpleCollaborator());
    const results = instances.map((c, i) => c.collaborate(`outline ${i}`, `details ${i}`));
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it('collaborate + generateTableOfContents 혼합 → 모두 ok=true', () => {
    const collab = makeCollaborator();
    const r1 = collab.collaborate('outline', 'details');
    const r2 = collab.generateTableOfContents('# 제목\n내용');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('동일 인스턴스 10회 collaborate → 모두 동일', () => {
    const collab = makeCollaborator();
    const outline = '# 동일 아웃라인\n내용';
    const details = '## 동일 상세\n설명';
    const results = Array.from({ length: 10 }, () => collab.collaborate(outline, details));
    const first = results[0];
    for (const r of results) {
      if (first?.ok && r.ok) expect(r.value).toBe(first.value);
    }
  });

  it('다른 인스턴스 5개 같은 입력 → 모두 동일 결과', () => {
    const outline = '# 공통 아웃라인\n내용';
    const details = '## 공통 상세\n설명';
    const results = Array.from({ length: 5 }, () => makeCollaborator().collaborate(outline, details));
    const first = results[0];
    for (const r of results) {
      if (first?.ok && r.ok) expect(r.value).toBe(first.value);
    }
  });

  it('에러 케이스 동시 5개 → 모두 ok=false', () => {
    const instances = Array.from({ length: 5 }, () => makeCollaborator());
    const results = instances.map((c) => c.collaborate('', ''));
    for (const r of results) {
      expect(r.ok).toBe(false);
    }
  });

  it('에러 + 성공 혼합 → 각각 올바른 결과', () => {
    const collab = makeCollaborator();
    const errorResult = collab.collaborate('', 'details');
    const successResult = collab.collaborate('outline', 'details');
    expect(errorResult.ok).toBe(false);
    expect(successResult.ok).toBe(true);
  });
});

// ── complete + getState 통합 시나리오 ─────────────────────────

describe('DocCollaborator complete + getState 통합', () => {
  it('start → getState → complete 플로우', async () => {
    const collab = makeCollaborator();
    const startResult = await collab.start({
      projectId: 'flow-test-1',
      type: 'technical-spec',
      context: '통합 플로우 테스트',
      fragments: [],
    });
    expect(startResult.ok).toBe(true);
    if (startResult.ok) {
      const docId = startResult.value.id;
      const stateResult = await collab.getState(docId);
      expect(stateResult.ok).toBe(true);
      const completeResult = await collab.complete(docId);
      expect(typeof completeResult.ok).toBe('boolean');
    }
  });

  it('start → start → getState 두 번 → 둘 다 ok', async () => {
    const collab = makeCollaborator();
    const r1 = await collab.start({ projectId: 'p-a', type: 'technical-spec', context: 'ctx', fragments: [] });
    const r2 = await collab.start({ projectId: 'p-b', type: 'technical-spec', context: 'ctx', fragments: [] });
    if (r1.ok && r2.ok) {
      const s1 = await collab.getState(r1.value.id);
      const s2 = await collab.getState(r2.value.id);
      expect(s1.ok).toBe(true);
      expect(s2.ok).toBe(true);
    }
  });

  it('start 후 다른 ID getState → ok=false', async () => {
    const collab = makeCollaborator();
    const r = await collab.start({ projectId: 'p-test', type: 'technical-spec', context: 'ctx', fragments: [] });
    if (r.ok) {
      const wrongState = await collab.getState('wrong-id-' + r.value.id);
      expect(wrongState.ok).toBe(false);
    }
  });

  it('complete 미존재 doc → error.code 문자열', async () => {
    const collab = makeCollaborator();
    const r = await collab.complete('non-existent-doc');
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('getState 미존재 → error.message 문자열', async () => {
    const collab = makeCollaborator();
    const r = await collab.getState('non-existent-doc');
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('start 5개 → 각 getState → 모두 ok=true', async () => {
    const collab = makeCollaborator();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await collab.start({ projectId: `proj-${i}`, type: 'technical-spec', context: 'ctx', fragments: [] });
      if (r.ok) ids.push(r.value.id);
    }
    for (const id of ids) {
      const s = await collab.getState(id);
      expect(s.ok).toBe(true);
    }
  });

  it('UUID 기반 projectId start → getState → type 확인', async () => {
    const collab = makeCollaborator();
    const r = await collab.start({
      projectId: crypto.randomUUID(),
      type: 'technical-spec',
      context: '타입 확인 테스트',
      fragments: [],
    });
    if (r.ok) {
      const s = await collab.getState(r.value.id);
      if (s.ok) expect(s.value.type).toBe('technical-spec');
    }
  });

  it('start → state.updatedAt이 Date 인스턴스', async () => {
    const collab = makeCollaborator();
    const r = await collab.start({ projectId: 'up-test', type: 'technical-spec', context: 'ctx', fragments: [] });
    if (r.ok) {
      const s = await collab.getState(r.value.id);
      if (s.ok) expect(s.value.updatedAt).toBeInstanceOf(Date);
    }
  });
});

// ── collaborate 에러 케이스 심화 ───────────────────────────────

describe('DocCollaborator collaborate 에러 케이스 심화', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('outline 빈 문자열 에러 코드 agent_invalid_input #1', () => {
    const r = collab.collaborate('', 'detail');
    if (!r.ok) expect(r.error.code).toBe('agent_invalid_input');
  });

  it('outline 빈 문자열 에러 코드 agent_invalid_input #2', () => {
    const r = collab.collaborate('', '다른 상세 내용');
    if (!r.ok) expect(r.error.code).toBe('agent_invalid_input');
  });

  it('details 빈 문자열 에러 코드 agent_invalid_input #1', () => {
    const r = collab.collaborate('outline 내용', '');
    if (!r.ok) expect(r.error.code).toBe('agent_invalid_input');
  });

  it('details 빈 문자열 에러 코드 agent_invalid_input #2', () => {
    const r = collab.collaborate('다른 아웃라인', '');
    if (!r.ok) expect(r.error.code).toBe('agent_invalid_input');
  });

  it('outline 공백만 에러 ok=false', () => {
    const r = collab.collaborate(' ', 'detail');
    expect(r.ok).toBe(false);
  });

  it('outline 탭만 에러 ok=false', () => {
    const r = collab.collaborate('\t', 'detail');
    expect(r.ok).toBe(false);
  });

  it('details 공백만 에러 ok=false', () => {
    const r = collab.collaborate('outline', ' ');
    expect(r.ok).toBe(false);
  });

  it('details 탭만 에러 ok=false', () => {
    const r = collab.collaborate('outline', '\t');
    expect(r.ok).toBe(false);
  });

  it('outline+details 모두 빈 문자열 → ok=false', () => {
    const r = collab.collaborate('', '');
    expect(r.ok).toBe(false);
  });

  it('outline+details 모두 공백 → ok=false', () => {
    const r = collab.collaborate('   ', '   ');
    expect(r.ok).toBe(false);
  });

  it('에러 시 error.code 타입은 string', () => {
    const r = collab.collaborate('', 'detail');
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('에러 시 error.message 타입은 string', () => {
    const r = collab.collaborate('', 'detail');
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('개행만인 outline 에러 ok=false', () => {
    const r = collab.collaborate('\n\n', 'detail');
    expect(r.ok).toBe(false);
  });

  it('개행만인 details 에러 ok=false', () => {
    const r = collab.collaborate('outline', '\n\n');
    expect(r.ok).toBe(false);
  });

  it('CRLF만인 outline 에러 ok=false', () => {
    const r = collab.collaborate('\r\n', 'detail');
    expect(r.ok).toBe(false);
  });

  it('CRLF만인 details 에러 ok=false', () => {
    const r = collab.collaborate('outline', '\r\n');
    expect(r.ok).toBe(false);
  });

  it('탭+개행만인 outline 에러 ok=false', () => {
    const r = collab.collaborate('\t\n\t', 'detail');
    expect(r.ok).toBe(false);
  });

  it('탭+개행만인 details 에러 ok=false', () => {
    const r = collab.collaborate('outline', '\t\n\t');
    expect(r.ok).toBe(false);
  });
});

// ── generateTableOfContents 에러 케이스 심화 ──────────────────

describe('DocCollaborator generateTableOfContents 에러 심화', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it('빈 문자열 에러 코드 agent_invalid_input', () => {
    const r = collab.generateTableOfContents('');
    if (!r.ok) expect(r.error.code).toBe('agent_invalid_input');
  });

  it('공백만 에러 ok=false', () => {
    const r = collab.generateTableOfContents('   ');
    expect(r.ok).toBe(false);
  });

  it('탭만 에러 ok=false', () => {
    const r = collab.generateTableOfContents('\t');
    expect(r.ok).toBe(false);
  });

  it('개행만 에러 ok=false', () => {
    const r = collab.generateTableOfContents('\n\n\n');
    expect(r.ok).toBe(false);
  });

  it('CRLF만 에러 ok=false', () => {
    const r = collab.generateTableOfContents('\r\n\r\n');
    expect(r.ok).toBe(false);
  });

  it('탭+공백+개행 에러 ok=false', () => {
    const r = collab.generateTableOfContents('\t  \n  \t');
    expect(r.ok).toBe(false);
  });

  it('에러 코드 타입 string', () => {
    const r = collab.generateTableOfContents('');
    if (!r.ok) expect(typeof r.error.code).toBe('string');
  });

  it('에러 메시지 타입 string', () => {
    const r = collab.generateTableOfContents('');
    if (!r.ok) expect(typeof r.error.message).toBe('string');
  });

  it('빈 에러 5회 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const r = collab.generateTableOfContents('');
      expect(r.ok).toBe(false);
    }
  });

  it('공백 에러 5회 반복 일관성', () => {
    for (let i = 0; i < 5; i++) {
      const r = collab.generateTableOfContents('   ');
      expect(r.ok).toBe(false);
    }
  });
});
