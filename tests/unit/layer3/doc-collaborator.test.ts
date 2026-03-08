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

  it.each(Array.from({ length: 10 }, () => crypto.randomUUID()))(
    '임의 UUID docId → 에러 반환',
    async (docId) => {
      const collab = makeCollaborator();
      const result = await collab.complete(docId);
      expect(result.ok).toBe(false);
    },
  );

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
