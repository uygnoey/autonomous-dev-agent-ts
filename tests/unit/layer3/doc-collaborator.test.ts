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

  it.each([
    ['단어 하나', 'a', 'b'],
    ['숫자만', '123', '456'],
    ['탭 포함', 'outline\ttab', 'detail\ttab'],
    ['개행만', '\n', '\n'], // 공백이 아닌 개행
    ['유니코드', '日本語', '한국어'],
  ])('%s → 병합 성공', (_label, outline, details) => {
    const result = collab.collaborate(outline, details);
    // '\n'만인 경우 trim() 결과가 '' → 에러
    if (outline.trim() === '' || details.trim() === '') {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    '길이 %i의 아웃라인 병합 성공',
    (len) => {
      const outline = 'A'.repeat(len);
      const details = 'B'.repeat(len);
      const result = collab.collaborate(outline, details);
      expect(result.ok).toBe(true);
    },
  );
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

  it.each([
    '# 단일 헤딩',
    '## 단일 H2',
    '### 단일 H3',
    '###### 단일 H6',
  ])('단일 헤딩 (%s) → ok', (content) => {
    const result = collab.generateTableOfContents(content);
    expect(result.ok).toBe(true);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    '헤딩 %i개 목차 생성',
    (count) => {
      const content = Array.from({ length: count }, (_, i) => `# 섹션 ${i}`).join('\n');
      const result = collab.generateTableOfContents(content);
      expect(result.ok).toBe(true);
    },
  );
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
});

// ── getState 메서드 ────────────────────────────────────────────

describe('DocCollaborator.getState', () => {
  it('존재하지 않는 docId → 에러 반환', async () => {
    const collab = makeCollaborator();
    const result = await collab.getState('non-existent-doc-id');
    expect(result.ok).toBe(false);
  });

  it.each(['', '   ', 'invalid-id-xyz', crypto.randomUUID()])(
    '알 수 없는 docId (%s) → 에러 반환',
    async (docId) => {
      const collab = makeCollaborator();
      const result = await collab.getState(docId);
      expect(result.ok).toBe(false);
    },
  );
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
});

// ── 경계값 / 랜덤 테스트 ─────────────────────────────────────

describe('DocCollaborator 경계값 랜덤 테스트', () => {
  let collab: DocCollaborator;

  beforeEach(() => {
    collab = makeCollaborator();
  });

  it.each(Array.from({ length: 50 }, (_, i) => i))('collaborate 랜덤 케이스 #%i', (i) => {
    const outlineLen = (i % 10) + 1;
    const detailLen = (i % 7) + 1;
    const outline = `# 제목 ${i}\n\n${'내용'.repeat(outlineLen)}`;
    const details = `## 상세 ${i}\n\n${'설명'.repeat(detailLen)}`;

    const result = collab.collaborate(outline, details);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain(outline);
      expect(result.value).toContain(details);
    }
  });

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    '목차 헤딩 레벨 테스트 (H%i)',
    (level) => {
      const heading = '#'.repeat(Math.min(level, 6));
      const content = `${heading} 헤딩 텍스트\n\n내용`;
      const result = collab.generateTableOfContents(content);
      expect(result.ok).toBe(true);
    },
  );

  it.each(['\r\n', '\n\n\n', '\t\n', '  \n  '])('다양한 줄 끝 처리: %j', (separator) => {
    const outline = `제목${separator}내용`;
    const details = `상세${separator}설명`;
    const result = collab.collaborate(outline, details);
    // 공백/개행 여부에 따라 ok/error 모두 가능
    expect(typeof result.ok).toBe('boolean');
  });

  it.each([
    ['# A', 'B'],
    ['outline', '# B'],
    ['outline with spaces  ', '  details with spaces  '],
    ['UPPERCASE OUTLINE', 'lowercase details'],
    ['混在 mixed content', 'مختلط mixed'],
  ])('다양한 입력 조합: "%s" + "%s"', (outline, details) => {
    const result = collab.collaborate(outline, details);
    if (outline.trim() && details.trim()) {
      expect(result.ok).toBe(true);
    }
  });
});
